import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSnapshot, normalizeMarketCoin } from '../utils/assets.js';

const row = (overrides = {}) => ({
  id: 'bitcoin',
  symbol: 'btc',
  name: 'Bitcoin',
  current_price: 100,
  price_change_percentage_24h: 2,
  total_volume: 500,
  sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => i) },
  ...overrides,
});

test('normalizes a CoinGecko row and keeps the last 24 sparkline points', () => {
  const coin = normalizeMarketCoin(row());
  assert.equal(coin.symbol, 'BTC');
  assert.equal(coin.sparkline_24h.length, 24);
  assert.equal(coin.sparkline_24h.at(-1), 167);
});

test('defaults missing change/volume/sparkline to safe values', () => {
  const coin = normalizeMarketCoin(
    row({ price_change_percentage_24h: null, total_volume: undefined, sparkline_in_7d: null }),
  );
  assert.equal(coin.change_24h, 0);
  assert.equal(coin.volume_24h, 0);
  assert.deepEqual(coin.sparkline_24h, []);
});

test('rejects malformed rows', () => {
  assert.equal(normalizeMarketCoin(null), null);
  assert.equal(normalizeMarketCoin('nope'), null);
  assert.equal(normalizeMarketCoin(row({ id: '' })), null);
  assert.equal(normalizeMarketCoin(row({ current_price: NaN })), null);
  assert.equal(normalizeMarketCoin(row({ current_price: -1 })), null);
  assert.equal(normalizeMarketCoin(row({ name: 42 })), null);
});

test('buildSnapshot scores, sorts by momentum descending, limits to topN and hides internals', () => {
  const candidate = (id, change, volume, avg) => ({
    ...normalizeMarketCoin(row({ id, price_change_percentage_24h: change, total_volume: volume })),
    asset_type: 'crypto',
    avg_volume_7d: avg,
  });
  const assets = buildSnapshot(
    [candidate('a', 1, 100, 100), candidate('b', 10, 300, 100), candidate('c', 5, 100, 100)],
    2,
  );

  assert.deepEqual(assets.map((a) => a.id), ['b', 'c']);
  assert.equal(assets[0].momentum_score, 5.8); // 10 * 0.4 + 3 * 0.6
  assert.equal('avg_volume_7d' in assets[0], true);
  for (const key of ['id', 'symbol', 'name', 'price_usd', 'price_change_24h', 'volume_24h', 'avg_volume_7d', 'momentum_score', 'momentum_label', 'sparkline_7d']) {
    assert.ok(key in assets[0], `missing ${key}`);
  }
});

test('buildSnapshot never emits non-finite numbers', () => {
  const bad = { id: 'x', symbol: 'X', name: 'X', price: Infinity, change_24h: 0, volume_24h: 0 };
  assert.deepEqual(buildSnapshot([bad], 20), []);
});
