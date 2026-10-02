import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createSseHub } from '../services/sseHub.js';
import { classifyMomentum, computeMomentumScore } from '../../shared/momentum.js';

const silent = { info() {}, warn() {}, error() {} };
const config = { corsOrigins: [] };

function mockCandidate(id, {
  symbol = id.toUpperCase(),
  name = id.charAt(0).toUpperCase() + id.slice(1),
  price = 100,
  change_24h = 2.5,
  volume_24h = 50_000,
  avg_volume_7d = 25_000,
  asset_type = 'crypto',
  exchange = null,
} = {}) {
  return {
    id,
    symbol,
    name,
    price,
    change_24h,
    volume_24h,
    avg_volume_7d,
    asset_type,
    ...(exchange ? { exchange } : {}),
    sparkline_24h: [98, 99, 100],
    sparkline_7d: [95, 96, 97, 98, 99, 100],
  };
}

function mockPublicAsset(id, {
  symbol = id.toUpperCase(),
  name = id.charAt(0).toUpperCase() + id.slice(1),
  price = 100,
  change_24h = 2.5,
  volume_24h = 50_000,
  avg_volume_7d = 25_000,
  volume_ratio = 2.0,
  momentum_score = 2.2,
  momentum_label = 'Hot',
  asset_type = 'crypto',
  exchange = null,
} = {}) {
  return {
    id,
    symbol,
    name,
    price_usd: price,
    price_change_24h: change_24h,
    volume_24h,
    avg_volume_7d,
    momentum_score,
    momentum_label,
    sparkline_7d: [95, 96, 97, 98, 99, 100],
    // Legacy aliases
    price,
    change_24h,
    volume_ratio,
    asset_type,
    ...(exchange ? { exchange } : {}),
    sparkline_24h: [98, 99, 100],
  };
}

function buildTestSnapshot() {
  const assets = [
    mockPublicAsset('crypto:btc', { symbol: 'BTC', name: 'Bitcoin', price: 90000, change_24h: 3.5, volume_24h: 30e9, avg_volume_7d: 20e9, volume_ratio: 1.5, momentum_score: 2.3, momentum_label: 'Hot', asset_type: 'crypto' }),
    mockPublicAsset('crypto:eth', { symbol: 'ETH', name: 'Ethereum', price: 3000, change_24h: -1.2, volume_24h: 15e9, avg_volume_7d: 13.6e9, volume_ratio: 1.1, momentum_score: 1.14, momentum_label: 'Warming', asset_type: 'crypto' }),
    mockPublicAsset('equity:aapl', { symbol: 'AAPL', name: 'Apple Inc.', price: 230, change_24h: 1.8, volume_24h: 5e9, avg_volume_7d: 3.8e9, volume_ratio: 1.3, momentum_score: 1.5, momentum_label: 'Warming', asset_type: 'equity', exchange: 'NasdaqGS' }),
    mockPublicAsset('equity:nvda', { symbol: 'NVDA', name: 'NVIDIA Corp', price: 120, change_24h: 6.2, volume_24h: 10e9, avg_volume_7d: 4.76e9, volume_ratio: 2.1, momentum_score: 3.74, momentum_label: 'Hot', asset_type: 'equity', exchange: 'NasdaqGS' }),
  ].sort((a, b) => b.momentum_score - a.momentum_score);

  const candidates = [
    mockCandidate('crypto:btc', { volume_24h: 30e9, avg_volume_7d: 20e9 }),
    mockCandidate('crypto:eth', { volume_24h: 15e9, avg_volume_7d: 13.6e9 }),
    mockCandidate('equity:aapl', { volume_24h: 5e9, avg_volume_7d: 3.8e9, asset_type: 'equity', exchange: 'NasdaqGS' }),
    mockCandidate('equity:nvda', { volume_24h: 10e9, avg_volume_7d: 4.76e9, asset_type: 'equity', exchange: 'NasdaqGS' }),
  ];

  return { assets, updatedAt: 1727800000000, _candidates: candidates };
}

async function request(app, path) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}${path}`);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const body = isJson ? await res.json() : await res.text();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Exact API Contract Verification', () => {
  const snapshot = buildTestSnapshot();
  const feed = { getSnapshot: () => snapshot };
  const sseHub = createSseHub({ heartbeatMs: 30_000, maxClients: 10, logger: silent });
  const app = createApp({ config, feed, sseHub, logger: silent });

  describe('Configuration Defaults Compliance (Phase 1.1 & 1.5)', () => {
    test('verifies PORT=4000, POLL_INTERVAL_MS=60000, HEARTBEAT_MS=30000, VOLUME_CACHE_TTL_MS=21600000', () => {
      const cfg = loadConfig({});
      assert.equal(cfg.port, 4000, 'PORT must default to 4000');
      assert.equal(cfg.feed.pollIntervalMs, 60_000, 'POLL_INTERVAL_MS must default to 60000');
      assert.equal(cfg.feed.heartbeatMs, 30_000, 'HEARTBEAT_MS must default to 30000');
      assert.equal(cfg.feed.volumeTtlMs, 21_600_000, 'VOLUME_CACHE_TTL_MS must default to 21600000 (6 hours)');
    });
  });

  describe('Momentum Classification (Phase 1.3)', () => {
    test('verifies score > 1.5 Hot, 1.0 <= score <= 1.5 Warming, score < 1.0 Neutral', () => {
      assert.equal(classifyMomentum(1.51), 'Hot');
      assert.equal(classifyMomentum(1.5), 'Warming');
      assert.equal(classifyMomentum(1.0), 'Warming');
      assert.equal(classifyMomentum(0.99), 'Neutral');
      assert.equal(classifyMomentum(0), 'Neutral');
    });

    test('verifies momentum formula: abs(change)*0.4 + (vol/avg)*0.6', () => {
      const score = computeMomentumScore({ priceChange24h: 5.0, volume24h: 200, avgVolume7d: 100 });
      // 5 * 0.4 + (200 / 100) * 0.6 = 2.0 + 1.2 = 3.2
      assert.equal(Math.round(score * 100) / 100, 3.2);
    });
  });

  describe('GET /api/feed/snapshot (Phase 1.2)', () => {
    test('verifies exact fields, types, and headers per Brief #1 contract', async () => {
      const res = await request(app, '/api/feed/snapshot');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.ok(Array.isArray(res.body.assets));
      assert.equal(res.body.assets.length, 4);

      const requiredFields = [
        'id',
        'symbol',
        'name',
        'price_usd',
        'price_change_24h',
        'volume_24h',
        'avg_volume_7d',
        'momentum_score',
        'momentum_label',
        'sparkline_7d',
      ];

      for (const asset of res.body.assets) {
        // All 10 required fields from Brief #1 must be present
        for (const reqField of requiredFields) {
          assert.ok(reqField in asset, `Asset ${asset.id} missing required field: ${reqField}`);
        }

        // String fields
        assert.equal(typeof asset.id, 'string');
        assert.equal(typeof asset.symbol, 'string');
        assert.equal(typeof asset.name, 'string');
        assert.ok(['Hot', 'Warming', 'Neutral'].includes(asset.momentum_label));

        // Numeric finite fields
        for (const numKey of ['price_usd', 'price_change_24h', 'volume_24h', 'avg_volume_7d', 'momentum_score']) {
          assert.equal(typeof asset[numKey], 'number', `${asset.id}.${numKey} is not number`);
          assert.ok(Number.isFinite(asset[numKey]), `${asset.id}.${numKey} is not finite`);
        }

        // Array fields
        assert.ok(Array.isArray(asset.sparkline_7d));
        assert.ok(asset.sparkline_7d.every(Number.isFinite));

        // Must NOT leak internal fields
        assert.equal('_candidates' in asset, false, 'Leaked _candidates');
      }

      // Ordering: strictly descending by momentum_score
      const scores = res.body.assets.map((a) => a.momentum_score);
      for (let i = 1; i < scores.length; i++) {
        assert.ok(scores[i - 1] >= scores[i], 'Snapshot assets are not sorted by momentum_score descending');
      }
    });

    test('returns 503 before initial snapshot with Retry-After', async () => {
      const unreadyApp = createApp({ config, feed: { getSnapshot: () => null }, sseHub, logger: silent });
      const res = await request(unreadyApp, '/api/feed/snapshot');
      assert.equal(res.status, 503);
      assert.equal(res.headers['retry-after'], '5');
      assert.ok(res.body.error);
    });
  });

  describe('GET /api/feed/discovery', () => {
    test('verifies exact category keys and maximum 5 assets per category', async () => {
      const res = await request(app, '/api/feed/discovery');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');

      const expectedCategories = ['trending', 'gainers', 'volume_spikes', 'new_listings'];
      assert.deepEqual(Object.keys(res.body).sort(), expectedCategories.sort());

      for (const cat of expectedCategories) {
        assert.ok(Array.isArray(res.body[cat]), `Category ${cat} is not array`);
        assert.ok(res.body[cat].length <= 5, `Category ${cat} exceeded 5 assets`);

        for (const asset of res.body[cat]) {
          assert.ok(Number.isFinite(asset.price_usd ?? asset.price));
          assert.ok(Number.isFinite(asset.price_change_24h ?? asset.change_24h));
          assert.equal('_candidates' in asset, false);
        }
      }

      // trending sorted by momentum_score descending
      const trendingScores = res.body.trending.map((a) => a.momentum_score);
      for (let i = 1; i < trendingScores.length; i++) {
        assert.ok(trendingScores[i - 1] >= trendingScores[i]);
      }

      // gainers contains only positive change_24h sorted descending
      for (const g of res.body.gainers) {
        const ch = g.price_change_24h ?? g.change_24h;
        assert.ok(ch > 0);
      }
    });
  });

  describe('GET /api/feed/leaderboard', () => {
    test('verifies top 10 limit, sequential ranks starting at 1, and descending sort', async () => {
      const res = await request(app, '/api/feed/leaderboard');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.ok(Array.isArray(res.body.leaderboard));
      assert.ok(res.body.leaderboard.length <= 10);

      res.body.leaderboard.forEach((item, index) => {
        assert.equal(item.rank, index + 1, `Rank should be sequential starting at 1`);
        assert.equal(typeof item.id, 'string');
        assert.ok(Number.isFinite(item.momentum_score));
      });

      const scores = res.body.leaderboard.map((item) => item.momentum_score);
      for (let i = 1; i < scores.length; i++) {
        assert.ok(scores[i - 1] >= scores[i]);
      }
    });
  });

  describe('GET /api/health', () => {
    test('verifies health shape and snapshot status', async () => {
      const res = await request(app, '/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.hasSnapshot, true);
      assert.equal(typeof res.body.updatedAt, 'string');
      assert.equal(typeof res.body.sseClients, 'number');
    });
  });

  describe('404 for unknown routes', () => {
    test('returns 404 for unmatched /api path', async () => {
      const res = await request(app, '/api/unmatched');
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Not found');
    });
  });

  describe('GET /api/feed/stream SSE headers and payload (Phase 1.4)', () => {
    test('verifies text/event-stream headers, retry handshake, and complete data payload', async () => {
      const server = app.listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;

      const controller = new AbortController();
      try {
        const res = await fetch(`${base}/api/feed/stream`, { signal: controller.signal });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'text/event-stream');
        assert.equal(res.headers.get('cache-control'), 'no-cache, no-transform');
        assert.equal(res.headers.get('connection'), 'keep-alive');
        assert.equal(res.headers.get('x-accel-buffering'), 'no');

        // Read initial chunk
        const reader = res.body.getReader();
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);

        assert.ok(text.includes('retry: 5000\n\n'));
        assert.ok(text.includes('data: {"assets":['));

        // Verify JSON payload inside data:
        const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
        assert.ok(dataLine, 'Missing data: line');
        const parsed = JSON.parse(dataLine.replace('data: ', ''));
        assert.ok(Array.isArray(parsed.assets));
        assert.equal(parsed.assets.length, 4);

        reader.cancel();
      } finally {
        controller.abort();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
