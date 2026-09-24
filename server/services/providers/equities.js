/**
 * Equities data provider (Week 3): NOT implemented yet, on purpose.
 *
 * No free equities API is configured in this repo, so nothing is hard-coded and no data
 * is faked. To add one:
 *   1. Pick a free-tier provider and set EQUITIES_PROVIDER / EQUITIES_API_KEY in .env
 *      (both are read in server/config.js).
 *   2. Return an object here that follows the provider interface in ./crypto.js:
 *        { name: 'my-provider', async fetchAssets() { ...call the API here... } }
 *      Each candidate needs asset_type: 'equity', plus price, change_24h (percent),
 *      volume_24h, avg_volume_7d (or null) and sparkline_24h (array of prices).
 *   3. Nothing else changes: providers/index.js already merges it into the feed, and the
 *      Equities filter in the UI starts working.
 */
export function createEquitiesProvider({ config, logger }) {
  if (config.provider) {
    logger.warn('equities_provider_not_implemented', { provider: config.provider });
  }
  return null;
}
