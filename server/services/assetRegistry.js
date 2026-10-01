/**
 * Keeps the `assets` table in step with the symbols the live feed tracks. momentum_scores
 * and price_snapshots reference assets(symbol), so a symbol must be registered here before
 * scores or snapshots for it can be stored. Each symbol is written once per process; a
 * failed write is retried on the next feed broadcast.
 */
export function createAssetRegistry({ db, logger }) {
  const registered = new Set();
  let pending = null;
  let failures = 0;

  async function register(assets) {
    const rows = new Map();
    for (const asset of assets) {
      if (registered.has(asset.symbol) || rows.has(asset.symbol)) continue;
      const type = asset.asset_type === 'equity' ? 'equity' : 'crypto';
      rows.set(asset.symbol, {
        symbol: asset.symbol,
        name: asset.name,
        type,
        // Crypto prices are CoinGecko aggregates, not one exchange; equities providers set their own.
        exchange: asset.exchange ?? (type === 'crypto' ? 'coingecko' : null),
      });
    }
    if (rows.size === 0) return;

    try {
      await db.upsert('assets', [...rows.values()], { onConflict: 'symbol' });
      for (const symbol of rows.keys()) registered.add(symbol);
      if (failures > 0) logger.info('asset_registry_recovered', { afterFailures: failures });
      failures = 0;
      logger.info('assets_registered', { count: rows.size });
    } catch (error) {
      failures += 1;
      if (failures === 1 || failures % 30 === 0) {
        logger.warn('asset_registry_failed', { consecutiveFailures: failures, reason: error.message });
      }
    }
  }

  return {
    /** Feed listener. Fire-and-forget, one write at a time; a skipped batch is caught next poll. */
    onAssets(assets) {
      if (pending) return;
      pending = register(assets).finally(() => {
        pending = null;
      });
    },

    whenIdle: () => pending ?? Promise.resolve(),
  };
}
