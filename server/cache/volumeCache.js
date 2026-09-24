import { toFiniteNumber } from '../../shared/momentum.js';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mean of the rolling 24h volume samples over the window. Each sample is already a
 * 24h figure, so the mean is directly comparable with volume_24h.
 */
export function averageVolume(points) {
  if (!Array.isArray(points)) return null;
  const volumes = points
    .map((point) => (Array.isArray(point) ? toFiniteNumber(point[1]) : null))
    .filter((v) => v !== null && v >= 0);
  if (volumes.length === 0) return null;
  return volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
}

/**
 * In-memory 7-day average volume cache.
 * - Entries are fresh for ttlMs; refreshStale() reloads only expired/missing ids.
 * - A stale value keeps being served until a refresh succeeds.
 * - Concurrent loads for one id share a single upstream request; only one batch runs at a time.
 * - Requests inside a batch are spaced out to stay inside the free-tier rate limit.
 */
export function createVolumeCache({
  fetchVolumeHistory,
  ttlMs,
  requestDelayMs = 0,
  failureCooldownMs = 60_000,
  now = Date.now,
  sleep = defaultSleep,
  logger,
}) {
  const entries = new Map();
  const inFlight = new Map();
  const retryAt = new Map();
  let activeBatch = null;

  const isFresh = (id) => (entries.get(id)?.expiresAt ?? 0) > now();

  function load(id) {
    if (inFlight.has(id)) return inFlight.get(id);
    const promise = fetchVolumeHistory(id)
      .then((points) => {
        const average = averageVolume(points);
        if (average === null) throw new Error('No usable volume samples');
        entries.set(id, { value: average, expiresAt: now() + ttlMs });
        retryAt.delete(id);
        return average;
      })
      .finally(() => inFlight.delete(id));
    inFlight.set(id, promise);
    return promise;
  }

  async function runBatch(ids) {
    const due = ids.filter((id) => !isFresh(id) && now() >= (retryAt.get(id) ?? 0));
    let refreshed = 0;
    let failed = 0;
    let firstError = null;

    for (const [index, id] of due.entries()) {
      try {
        await load(id);
        refreshed += 1;
      } catch (error) {
        failed += 1;
        firstError ??= error;
        retryAt.set(id, now() + (error.retryAfterMs ?? failureCooldownMs));
        if (error.status === 429) break; // rate limited: stop hammering, retry next cycle
      }
      if (requestDelayMs > 0 && index < due.length - 1) await sleep(requestDelayMs);
    }

    if (failed > 0) {
      logger.warn('volume_cache_refresh_failed', { failed, refreshed, reason: firstError.message });
    } else if (refreshed > 0) {
      logger.info('volume_cache_refreshed', { refreshed });
    }
  }

  return {
    /** Cached 7d average volume for an id, or null when never loaded. May be stale. */
    get: (id) => entries.get(id)?.value ?? null,

    /** Refreshes expired entries in the background. Never rejects; joins a batch already running. */
    refreshStale(ids) {
      activeBatch ??= runBatch(ids).finally(() => {
        activeBatch = null;
      });
      return activeBatch;
    },
  };
}
