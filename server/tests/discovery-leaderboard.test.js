import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { createApp } from '../app.js';
import { toFiniteNumber } from '../../shared/momentum.js';

// Minimal stubs that satisfy createApp's dependency injection.
const silent = { info() {}, warn() {}, error() {} };
const noopSseHub = { size: 0, connect() {}, broadcast() {}, closeAll() {} };
const config = { corsOrigins: [] };

/**
 * Builds a mock public asset (the shape produced by buildSnapshot / toPublicAsset).
 * All numbers are intentionally varied so tests can verify sort order.
 */
function mockAsset(id, {
  symbol = id.toUpperCase(),
  name = id.charAt(0).toUpperCase() + id.slice(1),
  price = 100,
  change_24h = 0,
  volume_24h = 1000,
  momentum_score = 1,
  asset_type = 'crypto',
  sparkline_24h = [],
} = {}) {
  return { id, symbol, name, price, change_24h, volume_24h, momentum_score, asset_type, sparkline_24h };
}

/**
 * Builds a mock candidate (internal shape with avg_volume_7d, used by the crypto provider).
 */
function mockCandidate(id, { volume_24h = 1000, avg_volume_7d = null } = {}) {
  return { id, volume_24h, avg_volume_7d };
}

function makeApp(snapshot) {
  const feed = { getSnapshot: () => snapshot };
  return createApp({ config, feed, sseHub: noopSseHub, logger: silent });
}

// Lightweight supertest-free helper: Node's built-in fetch against a one-shot server.
async function request(app, path) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}${path}`);
    const body = await res.json();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

// ─── DISCOVERY ─────────────────────────────────────────────────

describe('GET /api/feed/discovery', () => {
  const assets = [
    mockAsset('a', { momentum_score: 10, change_24h: 20, volume_24h: 5000 }),
    mockAsset('b', { momentum_score: 8,  change_24h: 15, volume_24h: 3000 }),
    mockAsset('c', { momentum_score: 6,  change_24h: -3, volume_24h: 8000 }),
    mockAsset('d', { momentum_score: 4,  change_24h: 7,  volume_24h: 2000 }),
    mockAsset('e', { momentum_score: 3,  change_24h: 1,  volume_24h: 1000 }),
    mockAsset('f', { momentum_score: 2,  change_24h: 0.5, volume_24h: 500 }),
    mockAsset('g', { momentum_score: 1,  change_24h: -10, volume_24h: 200 }),
  ];

  const candidates = [
    mockCandidate('a', { volume_24h: 5000, avg_volume_7d: 1000 }), // ratio 5
    mockCandidate('b', { volume_24h: 3000, avg_volume_7d: 1000 }), // ratio 3
    mockCandidate('c', { volume_24h: 8000, avg_volume_7d: 1000 }), // ratio 8
    mockCandidate('d', { volume_24h: 2000, avg_volume_7d: 4000 }), // ratio 0.5
    mockCandidate('e', { volume_24h: 1000, avg_volume_7d: null }),  // no avg → excluded
    mockCandidate('f', { volume_24h: 500,  avg_volume_7d: 100 }),  // ratio 5
    mockCandidate('g', { volume_24h: 200,  avg_volume_7d: 50 }),   // ratio 4
  ];

  const snapshot = { assets, updatedAt: Date.now(), _candidates: candidates };

  test('returns 200 when a snapshot exists', async () => {
    const { status, body } = await request(makeApp(snapshot), '/api/feed/discovery');
    assert.equal(status, 200);
    assert.ok(body);
  });

  test('response contains trending, gainers, volume_spikes, new_listings', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    assert.ok(Array.isArray(body.trending), 'missing trending');
    assert.ok(Array.isArray(body.gainers), 'missing gainers');
    assert.ok(Array.isArray(body.volume_spikes), 'missing volume_spikes');
    assert.ok(Array.isArray(body.new_listings), 'missing new_listings');
  });

  test('trending contains at most 5 assets sorted by momentum_score descending', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    assert.ok(body.trending.length <= 5);
    assert.ok(body.trending.length > 0);
    const scores = body.trending.map((a) => a.momentum_score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    // Verify the top-5 are exactly the first 5 from the momentum-sorted assets
    assert.deepEqual(
      body.trending.map((a) => a.id),
      ['a', 'b', 'c', 'd', 'e'],
    );
  });

  test('gainers contains only positive price-change assets', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    for (const asset of body.gainers) {
      assert.ok(asset.change_24h > 0, `${asset.id} has non-positive change_24h: ${asset.change_24h}`);
    }
  });

  test('gainers is sorted by change_24h descending', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    const changes = body.gainers.map((a) => a.change_24h);
    assert.deepEqual(changes, [...changes].sort((a, b) => b - a));
    // Should be: a(20), b(15), d(7), e(1), f(0.5) — the 5 positive ones
    assert.deepEqual(
      body.gainers.map((a) => a.id),
      ['a', 'b', 'd', 'e', 'f'],
    );
  });

  test('volume_spikes contains at most 5 assets sorted by volume_24h/avg_volume_7d descending', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    assert.ok(body.volume_spikes.length <= 5);
    assert.ok(body.volume_spikes.length > 0);
    // Expected order by ratio: c(8), a(5), f(5), g(4), b(3)
    // a and f tie at ratio 5; the sort is stable and a comes first in the assets array
    assert.deepEqual(
      body.volume_spikes.map((a) => a.id),
      ['c', 'a', 'f', 'g', 'b'],
    );
  });

  test('missing/invalid average volume does not cause NaN or Infinity', async () => {
    const edgeCandidates = [
      mockCandidate('a', { volume_24h: 5000, avg_volume_7d: 0 }),
      mockCandidate('b', { volume_24h: 3000, avg_volume_7d: NaN }),
      mockCandidate('c', { volume_24h: 8000, avg_volume_7d: Infinity }),
      mockCandidate('d', { volume_24h: 2000, avg_volume_7d: -100 }),
      mockCandidate('e', { volume_24h: 1000, avg_volume_7d: undefined }),
      mockCandidate('f', { volume_24h: 500,  avg_volume_7d: 100 }),
      mockCandidate('g', { volume_24h: 200,  avg_volume_7d: null }),
    ];
    const snap = { assets, updatedAt: Date.now(), _candidates: edgeCandidates };
    const { body } = await request(makeApp(snap), '/api/feed/discovery');

    for (const asset of body.volume_spikes) {
      // The returned asset itself should have all finite numbers
      for (const key of ['price', 'change_24h', 'volume_24h', 'momentum_score']) {
        assert.ok(
          Number.isFinite(asset[key]),
          `${asset.id}.${key} is not finite: ${asset[key]}`,
        );
      }
    }
    // Only f should have a valid ratio (100 > 0 and finite)
    assert.deepEqual(body.volume_spikes.map((a) => a.id), ['f']);
  });

  test('no fake market data is introduced (new_listings is empty or from real source)', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    // new_listings should be an array (empty is acceptable since the architecture
    // does not have a listing-date source)
    assert.ok(Array.isArray(body.new_listings));
    // If any entries exist, they must have an id (no fabricated data)
    for (const entry of body.new_listings) {
      assert.ok(entry.id, 'new_listing entry missing id');
    }
  });

  test('does not expose internal fields like avg_volume_7d', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/discovery');
    for (const category of [body.trending, body.gainers, body.volume_spikes, body.new_listings]) {
      for (const asset of category) {
        assert.equal('avg_volume_7d' in asset, false, `${asset.id} leaks avg_volume_7d`);
        assert.equal('_candidates' in asset, false, `${asset.id} leaks _candidates`);
      }
    }
  });

  test('returns 503 when snapshot is unavailable', async () => {
    const { status, body } = await request(makeApp(null), '/api/feed/discovery');
    assert.equal(status, 503);
    assert.ok(body.error);
  });

  test('returns fewer than 5 when not enough valid assets exist', async () => {
    const tinySnapshot = {
      assets: [mockAsset('x', { momentum_score: 5, change_24h: 2, volume_24h: 100 })],
      updatedAt: Date.now(),
      _candidates: [mockCandidate('x', { volume_24h: 100, avg_volume_7d: 50 })],
    };
    const { body } = await request(makeApp(tinySnapshot), '/api/feed/discovery');
    assert.equal(body.trending.length, 1);
    assert.equal(body.gainers.length, 1);
    assert.equal(body.volume_spikes.length, 1);
  });
});

// ─── LEADERBOARD ───────────────────────────────────────────────

describe('GET /api/feed/leaderboard', () => {
  // 12 assets to test the "at most 10" limit
  const assets = Array.from({ length: 12 }, (_, i) =>
    mockAsset(`coin${i}`, { momentum_score: 100 - i * 5 }),
  );
  const snapshot = { assets, updatedAt: Date.now(), _candidates: [] };

  test('returns 200 when a snapshot exists', async () => {
    const { status, body } = await request(makeApp(snapshot), '/api/feed/leaderboard');
    assert.equal(status, 200);
    assert.ok(body.leaderboard);
  });

  test('leaderboard contains at most 10 assets', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/leaderboard');
    assert.ok(body.leaderboard.length <= 10);
    assert.equal(body.leaderboard.length, 10);
  });

  test('leaderboard is sorted by momentum_score descending', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/leaderboard');
    const scores = body.leaderboard.map((a) => a.momentum_score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  });

  test('ranks are sequential starting at 1', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/leaderboard');
    const ranks = body.leaderboard.map((a) => a.rank);
    assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('leaderboard entries contain all expected public fields', async () => {
    const { body } = await request(makeApp(snapshot), '/api/feed/leaderboard');
    const required = ['rank', 'id', 'symbol', 'name', 'price', 'change_24h', 'volume_24h', 'momentum_score', 'asset_type', 'sparkline_24h'];
    for (const entry of body.leaderboard) {
      for (const key of required) {
        assert.ok(key in entry, `missing ${key} in leaderboard entry ${entry.id}`);
      }
    }
  });

  test('returns 503 when snapshot is unavailable', async () => {
    const { status, body } = await request(makeApp(null), '/api/feed/leaderboard');
    assert.equal(status, 503);
    assert.ok(body.error);
  });

  test('returns fewer than 10 when fewer valid assets exist', async () => {
    const tiny = {
      assets: [mockAsset('x', { momentum_score: 5 })],
      updatedAt: Date.now(),
      _candidates: [],
    };
    const { body } = await request(makeApp(tiny), '/api/feed/leaderboard');
    assert.equal(body.leaderboard.length, 1);
    assert.equal(body.leaderboard[0].rank, 1);
  });
});

// ─── REGRESSION: existing endpoints still work ─────────────────

describe('Existing endpoints remain functional', () => {
  const snapshot = {
    assets: [mockAsset('bitcoin', { momentum_score: 5, change_24h: 2 })],
    updatedAt: Date.now(),
    _candidates: [],
  };

  test('GET /api/feed/snapshot still returns 200 with assets', async () => {
    const { status, body } = await request(makeApp(snapshot), '/api/feed/snapshot');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.assets));
    assert.equal(body.assets[0].id, 'bitcoin');
  });

  test('GET /api/feed/snapshot still returns 503 when no snapshot', async () => {
    const { status } = await request(makeApp(null), '/api/feed/snapshot');
    assert.equal(status, 503);
  });

  test('GET /api/health still returns ok', async () => {
    const { status, body } = await request(makeApp(snapshot), '/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });

  test('unknown API routes still return 404', async () => {
    const { status, body } = await request(makeApp(snapshot), '/api/nope');
    assert.equal(status, 404);
    assert.deepEqual(body, { error: 'Not found' });
  });
});
