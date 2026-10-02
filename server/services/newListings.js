import { toPublicAsset } from '../utils/assets.js';

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_DISCOVERY_NEW_LISTINGS = 5;

/**
 * Manages discovery new listings using CoinGecko's official /coins/list/new endpoint.
 *
 * Requirements:
 * - CoinGecko restricts /coins/list/new to paid plans (Analyst/Lite/Pro/Enterprise).
 * - On Free / Demo plans, CoinGecko returns HTTP 401 with error_code 10005.
 * - If the configured plan does not support it or returns 401/403, we disable further calls,
 *   log a clear internal diagnostic reason, and return an empty array without fabricating data.
 * - When supported, returned coins are matched with active market candidates to normalize
 *   into the existing public asset shape (never emitting NaN, Infinity, or missing prices).
 * - Results are cached (default 15m) so incoming user requests never hammer upstream.
 */
export function createNewListingsService({ client, logger, ttlMs = DEFAULT_TTL_MS }) {
  let cached = [];
  let lastFetchedAt = 0;
  let isSupported = true;
  let unsupportedReason = null;
  let inFlight = null;

  async function fetchAndNormalize(candidates = []) {
    if (!isSupported) return [];
    if (!client || typeof client.fetchNewCoins !== 'function') {
      isSupported = false;
      unsupportedReason = 'CoinGecko client does not provide fetchNewCoins';
      logger.info('new_listings_disabled', { reason: unsupportedReason });
      return [];
    }

    try {
      const coins = await client.fetchNewCoins();
      if (!Array.isArray(coins)) {
        logger.warn('new_listings_invalid_payload', { message: 'Expected array from fetchNewCoins' });
        return cached;
      }

      // Build candidate lookups to enrich new listings with verified market pricing.
      // We never fabricate price, change, or volume.
      const candidateById = new Map();
      const candidateBySymbol = new Map();
      for (const c of candidates) {
        if (c?.id) candidateById.set(String(c.id).toLowerCase(), c);
        if (c?.symbol) candidateBySymbol.set(String(c.symbol).toUpperCase(), c);
      }

      const results = [];
      for (const coin of coins) {
        if (results.length >= MAX_DISCOVERY_NEW_LISTINGS) break;
        const match =
          candidateById.get(String(coin.id).toLowerCase()) ??
          candidateBySymbol.get(String(coin.symbol).toUpperCase());

        if (match) {
          const publicAsset = toPublicAsset(match);
          if (
            Number.isFinite(publicAsset.price) &&
            Number.isFinite(publicAsset.change_24h) &&
            Number.isFinite(publicAsset.volume_24h) &&
            Number.isFinite(publicAsset.momentum_score)
          ) {
            results.push(publicAsset);
          }
        }
      }

      cached = results;
      lastFetchedAt = Date.now();
      return cached;
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        isSupported = false;
        unsupportedReason = `CoinGecko /coins/list/new requires a paid plan (Analyst/Pro); disabled on Free/Demo tier (HTTP ${error.status})`;
        logger.info('new_listings_disabled', {
          reason: unsupportedReason,
          status: error.status,
          message: error.message,
        });
        cached = [];
        return cached;
      }

      logger.warn('new_listings_fetch_failed', { reason: error.message, status: error.status });
      return cached;
    }
  }

  return {
    isSupported: () => isSupported,
    getReason: () => unsupportedReason,

    /** Synchronously returns cached listings; triggers background refresh if stale and supported. */
    getNewListings(candidates = []) {
      const now = Date.now();
      if (isSupported && now - lastFetchedAt > ttlMs) {
        if (!inFlight) {
          inFlight = fetchAndNormalize(candidates).finally(() => {
            inFlight = null;
          });
        }
      }
      return cached.slice(0, MAX_DISCOVERY_NEW_LISTINGS);
    },

    /** Explicit refresh (useful during tests or background polling). */
    refresh(candidates = []) {
      inFlight ??= fetchAndNormalize(candidates).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
