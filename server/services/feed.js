import { buildFeedSnapshot } from '../utils/assets.js';

/**
 * Shared polling loop: one poll at a time for the whole process, regardless of how many
 * SSE clients are connected. Keeps the last good data per provider so a failing provider
 * never blanks the snapshot.
 */
export function createFeedService({ providers, topN, pollIntervalMs, logger }) {
  const lastGood = new Map();
  const failureCounts = new Map();
  const listeners = new Set();
  let snapshot = null;
  let activePoll = null;
  let timer = null;
  let running = false;

  function recordFailure(name, error) {
    const count = (failureCounts.get(name) ?? 0) + 1;
    failureCounts.set(name, count);
    // Log the first failure and then only every 30th, to avoid a log line every 10s.
    if (count === 1 || count % 30 === 0) {
      logger.warn('provider_fetch_failed', {
        provider: name,
        consecutiveFailures: count,
        reason: error?.message,
        status: error?.status,
        retryAfterMs: error?.retryAfterMs,
      });
    }
  }

  function recordSuccess(name) {
    const previous = failureCounts.get(name) ?? 0;
    if (previous > 0) logger.info('provider_recovered', { provider: name, afterFailures: previous });
    failureCounts.set(name, 0);
  }

  async function runPoll() {
    const results = await Promise.allSettled(providers.map((provider) => provider.fetchAssets()));

    let gotFreshData = false;
    results.forEach((result, index) => {
      const { name } = providers[index];
      if (result.status === 'fulfilled') {
        lastGood.set(name, result.value);
        recordSuccess(name);
        gotFreshData = true;
      } else {
        recordFailure(name, result.reason);
      }
    });
    if (!gotFreshData) return; // keep the previous snapshot, nothing new to broadcast

    const allCandidates = [...lastGood.values()].flat();
    const assets = buildFeedSnapshot(allCandidates, topN);
    if (assets.length === 0) return;

    snapshot = { assets, updatedAt: Date.now(), _candidates: allCandidates };
    for (const listener of listeners) {
      try {
        listener(assets);
      } catch (error) {
        logger.error('feed_listener_failed', { reason: error.message });
      }
    }
  }

  /** Runs one poll, or joins the one already running. Never rejects. */
  function pollOnce() {
    activePoll ??= runPoll()
      .catch((error) => logger.error('feed_poll_crashed', { reason: error.message }))
      .finally(() => {
        activePoll = null;
      });
    return activePoll;
  }

  return {
    pollOnce,
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // setTimeout chain (not setInterval): the next poll is scheduled only after the
    // previous one finished, so polls can never overlap.
    start() {
      if (running) return;
      running = true;
      const loop = async () => {
        await pollOnce();
        if (running) timer = setTimeout(loop, pollIntervalMs);
      };
      loop();
    },

    stop() {
      running = false;
      clearTimeout(timer);
    },
  };
}
