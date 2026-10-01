import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssetRegistry } from '../services/assetRegistry.js';
import { createFeedService } from '../services/feed.js';
import { createSnapshotWriter, calculatePctChange, getBucketKey, BUCKET_MS } from '../services/snapshotWriter.js';
import { createSseHub } from '../services/sseHub.js';
import { createSupabaseClient } from '../services/supabase.js';

const silent = { info() {}, warn() {}, error() {} };

function createMockDb(initialData = {}) {
  const data = {
    assets: [],
    price_snapshots: [],
    momentum_scores: [],
    momentum_score_history: [],
    ...initialData,
  };
  const calls = [];

  return {
    data,
    calls,
    async select(table) {
      calls.push(['select', table]);
      return [...(data[table] || [])];
    },
    async insert(table, rows) {
      calls.push(['insert', table, rows.length]);
      data[table].push(...rows);
    },
    async upsert(table, rows, { onConflict, ignoreDuplicates = false } = {}) {
      calls.push(['upsert', table, rows.length]);
      const keys = (onConflict || 'symbol').split(',');
      for (const row of rows) {
        const index = data[table].findIndex((existing) => keys.every((k) => existing[k] === row[k]));
        if (index === -1) data[table].push(row);
        else if (!ignoreDuplicates) data[table][index] = row;
      }
    },
  };
}

const sampleAsset = (symbol, price, volume = 1000) => ({
  id: symbol.toLowerCase(),
  symbol,
  name: `${symbol} Token`,
  price,
  change_24h: 2.5,
  volume_24h: volume,
  asset_type: 'crypto',
});

test('1. A feed update causes a snapshot write when the current 15-minute bucket has not yet been persisted', async () => {
  const db = createMockDb();
  const time = Date.parse('2026-10-01T10:00:10.000Z');
  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => time,
  });

  writer.onAssets([sampleAsset('BTC', 65000, 500000)]);
  await writer.whenIdle();

  assert.equal(db.data.price_snapshots.length, 1);
  const saved = db.data.price_snapshots[0];
  assert.equal(saved.symbol, 'BTC');
  assert.equal(saved.price, 65000);
  assert.equal(saved.volume, 500000);
  assert.equal(saved.pct_change_15m, null); // no prior snapshot
  assert.equal(saved.ts, '2026-10-01T10:00:10.000Z');
});

test('2. Multiple feed updates inside the same 15-minute bucket result in only one database write', async () => {
  const db = createMockDb();
  let currentTime = Date.parse('2026-10-01T10:00:10.000Z');
  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => currentTime,
  });

  // Poll 1 at 10:00:10
  writer.onAssets([sampleAsset('BTC', 65000)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 1);

  // Poll 2 at 10:05:00 (inside same 10:00 - 10:15 bucket)
  currentTime = Date.parse('2026-10-01T10:05:00.000Z');
  writer.onAssets([sampleAsset('BTC', 65100)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 1); // no extra write

  // Poll 3 at 10:14:59 (still inside same bucket)
  currentTime = Date.parse('2026-10-01T10:14:59.000Z');
  writer.onAssets([sampleAsset('BTC', 65200)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 1); // still only 1 write
});

test('3. A new 15-minute bucket results in another write', async () => {
  const db = createMockDb();
  let currentTime = Date.parse('2026-10-01T10:00:10.000Z');
  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => currentTime,
  });

  // Bucket 1: 10:00
  writer.onAssets([sampleAsset('BTC', 65000)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 1);

  // Bucket 2: 10:15:05
  currentTime = Date.parse('2026-10-01T10:15:05.000Z');
  writer.onAssets([sampleAsset('BTC', 66000)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 2);

  // Bucket 3: 10:30:00
  currentTime = Date.parse('2026-10-01T10:30:00.000Z');
  writer.onAssets([sampleAsset('BTC', 67000)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 3);
});

test('4. pct_change_15m is calculated against the previous persisted snapshot', async () => {
  const db = createMockDb();
  let currentTime = Date.parse('2026-10-01T10:00:00.000Z');
  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => currentTime,
  });

  // First snapshot at 10:00 with price 100
  writer.onAssets([sampleAsset('BTC', 100)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots[0].pct_change_15m, null);

  // Intermediate poll at 10:05 with price 105 (ignored by persistence)
  currentTime = Date.parse('2026-10-01T10:05:00.000Z');
  writer.onAssets([sampleAsset('BTC', 105)]);
  await writer.whenIdle();

  // Second snapshot at 10:15 with price 110
  currentTime = Date.parse('2026-10-01T10:15:00.000Z');
  writer.onAssets([sampleAsset('BTC', 110)]);
  await writer.whenIdle();

  // 110 vs previous persisted 100 -> ((110 - 100) / 100) * 100 = 10%
  // Not compared against intermediate poll 105!
  assert.equal(db.data.price_snapshots[1].pct_change_15m, 10);

  // Third snapshot at 10:30 with price 99
  currentTime = Date.parse('2026-10-01T10:30:00.000Z');
  writer.onAssets([sampleAsset('BTC', 99)]);
  await writer.whenIdle();
  // 99 vs previous persisted 110 -> ((99 - 110) / 110) * 100 = -10%
  assert.equal(db.data.price_snapshots[2].pct_change_15m, -10);
});

test('5. Multiple symbols are persisted independently', async () => {
  const db = createMockDb();
  let currentTime = Date.parse('2026-10-01T10:00:00.000Z');
  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => currentTime,
  });

  // Initial poll with BTC only
  writer.onAssets([sampleAsset('BTC', 65000)]);
  await writer.whenIdle();
  assert.equal(db.data.price_snapshots.length, 1);
  assert.equal(db.data.price_snapshots[0].symbol, 'BTC');

  // Next poll at 10:05 brings ETH into the feed
  currentTime = Date.parse('2026-10-01T10:05:00.000Z');
  writer.onAssets([sampleAsset('BTC', 65100), sampleAsset('ETH', 3500)]);
  await writer.whenIdle();

  // BTC was already persisted in this bucket, but ETH is newly seen in this bucket
  assert.equal(db.data.price_snapshots.length, 2);
  assert.equal(db.data.price_snapshots[1].symbol, 'ETH');
  assert.equal(db.data.price_snapshots[1].price, 3500);
});

test('6. Asset registration happens for newly discovered symbols', async () => {
  const db = createMockDb();
  const assetRegistry = createAssetRegistry({ db, logger: silent });
  const time = Date.parse('2026-10-01T10:00:00.000Z');
  const writer = createSnapshotWriter({
    db,
    assetRegistry,
    logger: silent,
    now: () => time,
  });

  const btc = sampleAsset('BTC', 65000);
  assetRegistry.onAssets([btc]);
  writer.onAssets([btc]);
  await writer.whenIdle();

  // Verify asset was registered in assets table
  assert.equal(db.data.assets.length, 1);
  assert.equal(db.data.assets[0].symbol, 'BTC');
  assert.equal(db.data.assets[0].type, 'crypto');

  // And snapshot was recorded
  assert.equal(db.data.price_snapshots.length, 1);
  assert.equal(db.data.price_snapshots[0].symbol, 'BTC');
});

test('7. Duplicate asset registration is safe', async () => {
  const db = createMockDb();
  const assetRegistry = createAssetRegistry({ db, logger: silent });
  const writer = createSnapshotWriter({
    db,
    assetRegistry,
    logger: silent,
    now: () => Date.parse('2026-10-01T10:00:00.000Z'),
  });

  const btc = sampleAsset('BTC', 65000);
  assetRegistry.onAssets([btc]);
  writer.onAssets([btc]);
  await writer.whenIdle();

  const assetUpsertCalls = db.calls.filter(([op, table]) => op === 'upsert' && table === 'assets').length;
  assert.equal(assetUpsertCalls, 1);

  // Subsequent feed cycle with identical symbol
  assetRegistry.onAssets([btc]);
  writer.onAssets([btc]);
  await writer.whenIdle();

  // No additional upsert on assets table
  const assetUpsertCallsAfter = db.calls.filter(([op, table]) => op === 'upsert' && table === 'assets').length;
  assert.equal(assetUpsertCallsAfter, 1);
  assert.equal(db.data.assets.length, 1);
});

test('8. Supabase failure does not crash the feed', async () => {
  const db = {
    async select() {
      throw new Error('Supabase network timeout');
    },
    async insert() {
      throw new Error('Supabase 500 Internal Error');
    },
    async upsert() {
      throw new Error('Supabase 500 Internal Error');
    },
  };

  let loggedError = null;
  const testLogger = {
    info() {},
    warn(event, details) {
      loggedError = { event, details };
    },
    error() {},
  };

  const writer = createSnapshotWriter({
    db,
    logger: testLogger,
    now: () => Date.parse('2026-10-01T10:00:00.000Z'),
  });

  const provider = {
    name: 'test-crypto',
    async fetchAssets() {
      return [{
        id: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 65000,
        change_24h: 2.1,
        volume_24h: 1000000,
      }];
    },
  };

  const feed = createFeedService({
    providers: [provider],
    topN: 10,
    pollIntervalMs: 60000,
    logger: silent,
  });

  feed.subscribe(writer.onAssets);

  // Run a poll while database is failing
  await feed.pollOnce();
  await writer.whenIdle();

  // Feed successfully processed data and holds snapshot in memory
  const snapshot = feed.getSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.assets[0].symbol, 'BTC');
  assert.equal(snapshot.assets[0].price, 65000);

  // Database failure was logged gracefully without crashing
  assert.ok(loggedError);
  assert.equal(loggedError.event, 'snapshot_writer_failed');
});

test('9. Supabase failure does not stop SSE', async () => {
  const db = {
    async select() {
      throw new Error('Connection refused');
    },
    async insert() {
      throw new Error('Connection refused');
    },
  };

  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => Date.parse('2026-10-01T10:00:00.000Z'),
  });

  const sseHub = createSseHub({ heartbeatMs: 60000, maxClients: 10, logger: silent });
  const receivedSseEvents = [];

  // Mock SSE request and response objects
  const mockReq = {};
  const mockRes = {
    writeHead() {},
    write(chunk) {
      receivedSseEvents.push(chunk);
    },
    on() {},
    end() {},
  };
  sseHub.connect(mockReq, mockRes);

  const provider = {
    name: 'test-crypto',
    async fetchAssets() {
      return [{
        id: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        price: 3500,
        change_24h: 3.5,
        volume_24h: 800000,
      }];
    },
  };

  const feed = createFeedService({
    providers: [provider],
    topN: 10,
    pollIntervalMs: 60000,
    logger: silent,
  });

  // Subscribe both SSE hub and failing snapshotWriter to feed
  feed.subscribe(sseHub.broadcast);
  feed.subscribe(writer.onAssets);

  await feed.pollOnce();
  await writer.whenIdle();

  // SSE client received the broadcast event despite the database failure
  assert.ok(receivedSseEvents.length > 0);
  const payload = receivedSseEvents.find((evt) => evt.includes('ETH'));
  assert.ok(payload, 'SSE client received asset event with ETH');
});

test('10. Startup seeding loads only the latest snapshot per symbol and initializes prior price', async () => {
  const db = createMockDb({
    price_snapshots: [
      // Older snapshot
      { symbol: 'BTC', price: 62000, ts: '2026-10-01T09:45:00.000Z' },
      // Latest snapshot
      { symbol: 'BTC', price: 64000, ts: '2026-10-01T10:00:00.000Z' },
    ],
  });

  let currentTime = Date.parse('2026-10-01T10:05:00.000Z'); // Inside the 10:00 bucket
  const writer = createSnapshotWriter({
    db,
    logger: silent,
    now: () => currentTime,
  });

  // At 10:05, writer should see that 10:00 bucket is already recorded for BTC
  writer.onAssets([sampleAsset('BTC', 64500)]);
  await writer.whenIdle();

  // No new write happened for 10:00 bucket
  assert.equal(db.data.price_snapshots.length, 2);

  // In next bucket (10:15), new write happens with pct_change calculated against seeded 64000
  currentTime = Date.parse('2026-10-01T10:15:00.000Z');
  writer.onAssets([sampleAsset('BTC', 67200)]);
  await writer.whenIdle();

  assert.equal(db.data.price_snapshots.length, 3);
  const newest = db.data.price_snapshots[2];
  assert.equal(newest.price, 67200);
  // (67200 - 64000) / 64000 * 100 = 5%
  assert.equal(newest.pct_change_15m, 5);
});

test('11. Deterministic 15m bucket calculation and percentage change utility', () => {
  assert.equal(BUCKET_MS, 900000);
  const t1 = Date.parse('2026-10-01T10:00:00.000Z');
  const t2 = Date.parse('2026-10-01T10:14:59.999Z');
  const t3 = Date.parse('2026-10-01T10:15:00.000Z');

  assert.equal(getBucketKey(t1), getBucketKey(t2));
  assert.notEqual(getBucketKey(t1), getBucketKey(t3));

  assert.equal(calculatePctChange(110, 100), 10);
  assert.equal(calculatePctChange(95, 100), -5);
  assert.equal(calculatePctChange(100, null), null);
  assert.equal(calculatePctChange(100, 0), null);
  assert.equal(calculatePctChange(100, -10), null);
});

test('12. Supabase client insert sends POST with return=minimal and no on_conflict', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: new URL(url), init });
    return new Response(null, { status: 201 });
  };

  const client = createSupabaseClient({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_test', timeoutMs: 1000 }, fetchImpl);
  await client.insert('price_snapshots', [{ symbol: 'BTC', price: 65000 }]);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].url.pathname, '/rest/v1/price_snapshots');
  assert.equal(seen[0].url.searchParams.get('on_conflict'), null);
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers.prefer, 'return=minimal');
  assert.equal(seen[0].init.headers['content-type'], 'application/json');
});
