import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNewListingsService } from '../services/newListings.js';
import { UpstreamError } from '../services/coingecko.js';

function createLogger() {
  const logs = [];
  return {
    logs,
    info: (msg, meta) => logs.push({ level: 'info', msg, ...meta }),
    warn: (msg, meta) => logs.push({ level: 'warn', msg, ...meta }),
    error: (msg, meta) => logs.push({ level: 'error', msg, ...meta }),
  };
}

const mockCandidate = (id, overrides = {}) => ({
  id,
  symbol: id.toUpperCase(),
  name: id.charAt(0).toUpperCase() + id.slice(1),
  price: 100,
  change_24h: 5,
  volume_24h: 10_000,
  asset_type: 'crypto',
  avg_volume_7d: 5_000,
  sparkline_24h: [95, 100],
  sparkline_7d: [90, 95, 100],
  ...overrides,
});

test('createNewListingsService: normalizes new coins that match market candidates', async () => {
  const rawCoins = [
    { id: 'coin-a', symbol: 'ca', name: 'Coin A', activated_at: 1700000000 },
    { id: 'coin-b', symbol: 'cb', name: 'Coin B', activated_at: 1700000100 },
    { id: 'coin-c', symbol: 'cc', name: 'Coin C', activated_at: 1700000200 },
  ];

  const client = {
    fetchNewCoins: async () => rawCoins,
  };

  const candidates = [
    mockCandidate('coin-a', { price: 50, change_24h: 10 }),
    mockCandidate('coin-b', { price: 200, change_24h: -2 }),
  ];

  const logger = createLogger();
  const service = createNewListingsService({ client, logger, ttlMs: 60_000 });

  await service.refresh(candidates);
  const listings = service.getNewListings(candidates);

  assert.equal(listings.length, 2);
  assert.equal(listings[0].id, 'coin-a');
  assert.equal(listings[0].price, 50);
  assert.equal(listings[0].change_24h, 10);
  assert.equal(listings[1].id, 'coin-b');

  // Verify exact public shape & internals are hidden
  for (const asset of listings) {
    assert.equal('avg_volume_7d' in asset, false);
    assert.equal('_candidates' in asset, false);
    assert.ok(Number.isFinite(asset.price));
    assert.ok(Number.isFinite(asset.change_24h));
    assert.ok(Number.isFinite(asset.volume_24h));
    assert.ok(Number.isFinite(asset.momentum_score));
  }
});

test('createNewListingsService: limits to maximum 5 new listings', async () => {
  const rawCoins = Array.from({ length: 10 }, (_, i) => ({
    id: `coin-${i}`,
    symbol: `c${i}`,
    name: `Coin ${i}`,
    activated_at: 1700000000 + i,
  }));

  const candidates = Array.from({ length: 10 }, (_, i) => mockCandidate(`coin-${i}`));
  const client = { fetchNewCoins: async () => rawCoins };
  const service = createNewListingsService({ client, logger: createLogger() });

  await service.refresh(candidates);
  const listings = service.getNewListings(candidates);
  assert.equal(listings.length, 5);
});

test('createNewListingsService: does not fabricate data when coins have no market match', async () => {
  const rawCoins = [{ id: 'unknown-token', symbol: 'unk', name: 'Unknown', activated_at: 1700000000 }];
  const candidates = [mockCandidate('bitcoin')]; // no match

  const client = { fetchNewCoins: async () => rawCoins };
  const service = createNewListingsService({ client, logger: createLogger() });

  await service.refresh(candidates);
  const listings = service.getNewListings(candidates);
  assert.deepEqual(listings, []);
});

test('createNewListingsService: gracefully disables on HTTP 401/403 free-tier error', async () => {
  let callCount = 0;
  const client = {
    fetchNewCoins: async () => {
      callCount += 1;
      throw new UpstreamError('CoinGecko PRO subscription required', { status: 401 });
    },
  };

  const logger = createLogger();
  const service = createNewListingsService({ client, logger });

  await service.refresh([mockCandidate('bitcoin')]);
  const listings = service.getNewListings([mockCandidate('bitcoin')]);

  assert.deepEqual(listings, []);
  assert.equal(service.isSupported(), false);
  assert.ok(service.getReason().includes('paid plan'));
  assert.ok(logger.logs.some((l) => l.msg === 'new_listings_disabled' && l.status === 401));

  // Subsequent call does not hit client again
  await service.refresh([mockCandidate('bitcoin')]);
  assert.equal(callCount, 1);
});

test('createNewListingsService: caches within TTL', async () => {
  let calls = 0;
  const client = {
    fetchNewCoins: async () => {
      calls += 1;
      return [{ id: 'coin-a', symbol: 'ca', name: 'Coin A', activated_at: 1700000000 }];
    },
  };

  const candidates = [mockCandidate('coin-a')];
  const service = createNewListingsService({ client, logger: createLogger(), ttlMs: 10_000 });

  await service.refresh(candidates);
  assert.equal(calls, 1);

  service.getNewListings(candidates);
  service.getNewListings(candidates);
  assert.equal(calls, 1); // cached, no extra calls
});
