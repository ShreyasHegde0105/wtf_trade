export const BUCKET_MS = 15 * 60 * 1000; // 15-minute bucket

export const getBucketKey = (timestampMs) => Math.floor(timestampMs / BUCKET_MS) * BUCKET_MS;

const round = (value, digits = 4) => Number(value.toFixed(digits));

export function calculatePctChange(currentPrice, previousPrice) {
  if (previousPrice == null || !Number.isFinite(previousPrice) || previousPrice <= 0) {
    return null;
  }
  if (currentPrice == null || !Number.isFinite(currentPrice)) {
    return null;
  }
  const pct = ((currentPrice - previousPrice) / previousPrice) * 100;
  return Number.isFinite(pct) ? round(pct, 4) : null;
}

/**
 * Persists market-data snapshots to Supabase every 15 minutes.
 * Subscribes to the live feed and writes at most once per symbol per 15-minute bucket.
 * Calculates pct_change_15m against the previous persisted snapshot price.
 * Best-effort: database errors are logged and never crash or block the feed.
 */
export function createSnapshotWriter({
  db,
  assetRegistry = null,
  logger,
  now = () => Date.now(),
}) {
  const lastPersistedBucket = new Map(); // symbol -> bucketKey (number)
  const lastPersistedPrice = new Map(); // symbol -> price (number)
  let pending = null;
  let failures = 0;
  let seedPromise = null;

  if (db && typeof db.select === 'function') {
    seedPromise = (async () => {
      try {
        const rows = await db.select('price_snapshots', {
          columns: 'symbol,price,ts',
          filters: { order: 'ts.desc', limit: '100' },
        });
        if (Array.isArray(rows)) {
          const newestPerSymbol = new Map();
          for (const row of rows) {
            if (!row || !row.symbol || !row.ts) continue;
            const tsMs = Date.parse(row.ts);
            if (!Number.isFinite(tsMs)) continue;
            const current = newestPerSymbol.get(row.symbol);
            if (!current || tsMs > current.tsMs) {
              newestPerSymbol.set(row.symbol, { price: Number(row.price), tsMs });
            }
          }
          for (const [symbol, { price, tsMs }] of newestPerSymbol.entries()) {
            if (Number.isFinite(price)) {
              lastPersistedPrice.set(symbol, price);
            }
            lastPersistedBucket.set(symbol, getBucketKey(tsMs));
          }
          logger?.info?.('snapshot_writer_seeded', { symbols: lastPersistedPrice.size });
        }
      } catch (error) {
        logger?.warn?.('snapshot_writer_seed_failed', { reason: error.message });
      }
    })();
  }

  async function persist(assets) {
    if (!db || !Array.isArray(assets) || assets.length === 0) return;

    if (seedPromise) {
      await seedPromise;
      seedPromise = null;
    }

    const currentTime = typeof now === 'function' ? now() : Date.now();
    const currentTimeMs =
      currentTime instanceof Date
        ? currentTime.getTime()
        : typeof currentTime === 'number'
          ? currentTime
          : Date.parse(currentTime);

    const currentBucket = getBucketKey(currentTimeMs);

    const dueAssets = assets.filter((asset) => {
      if (!asset || typeof asset.symbol !== 'string') return false;
      const lastBucket = lastPersistedBucket.get(asset.symbol);
      return lastBucket !== currentBucket;
    });

    if (dueAssets.length === 0) return;

    if (assetRegistry?.whenIdle) {
      try {
        await assetRegistry.whenIdle();
      } catch {
        // Asset registry failures are handled by assetRegistry; continue safely
      }
    }

    const timestampIso = new Date(currentTimeMs).toISOString();
    const rows = dueAssets.map((asset) => {
      const prevPrice = lastPersistedPrice.get(asset.symbol);
      const pctChange = calculatePctChange(asset.price, prevPrice);
      return {
        symbol: asset.symbol,
        price: asset.price,
        volume: asset.volume_24h ?? asset.volume ?? 0,
        pct_change_15m: pctChange,
        ts: timestampIso,
      };
    });

    try {
      if (typeof db.insert === 'function') {
        await db.insert('price_snapshots', rows);
      } else if (typeof db.upsert === 'function') {
        await db.upsert('price_snapshots', rows, { onConflict: 'symbol,ts' });
      }

      for (const row of rows) {
        lastPersistedBucket.set(row.symbol, currentBucket);
        lastPersistedPrice.set(row.symbol, row.price);
      }

      if (failures > 0) logger?.info?.('snapshot_writer_recovered', { afterFailures: failures });
      failures = 0;
      logger?.info?.('snapshots_persisted', { count: rows.length, bucket: currentBucket });
    } catch (error) {
      failures += 1;
      if (failures === 1 || failures % 30 === 0) {
        logger?.warn?.('snapshot_writer_failed', { consecutiveFailures: failures, reason: error.message });
      }
    }
  }

  return {
    onAssets(assets) {
      if (pending) return;
      pending = persist(assets).finally(() => {
        pending = null;
      });
    },

    whenIdle: () => pending ?? Promise.resolve(),

    // Internal getters for testing
    _getLastPersistedPrice: (symbol) => lastPersistedPrice.get(symbol),
    _getLastPersistedBucket: (symbol) => lastPersistedBucket.get(symbol),
  };
}
