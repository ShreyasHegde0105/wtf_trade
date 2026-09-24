import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterByType, searchAssets, selectVisibleAssets, sortAssets } from './feedView.js';

const asset = (id, name, symbol, extra = {}) => ({
  id, name, symbol, asset_type: 'crypto', price: 1, change_24h: 0, volume_24h: 0, momentum_score: 0, ...extra,
});

const feed = [
  asset('bitcoin', 'Bitcoin', 'BTC', { momentum_score: 1, change_24h: 2, volume_24h: 300 }),
  asset('ethereum', 'Ethereum', 'ETH', { momentum_score: 3, change_24h: -6, volume_24h: 100 }),
  asset('solana', 'Solana', 'SOL', { momentum_score: 2, change_24h: 9, volume_24h: 200 }),
  asset('aapl', 'Apple', 'AAPL', { asset_type: 'equity', momentum_score: 0.5 }),
];
const ids = (list) => list.map((a) => a.id);

test('filters by asset type', () => {
  assert.deepEqual(ids(filterByType(feed, 'crypto')), ['bitcoin', 'ethereum', 'solana']);
  assert.deepEqual(ids(filterByType(feed, 'equity')), ['aapl']);
  assert.equal(filterByType(feed, 'all').length, 4);
});

test('sorts by momentum, price change (gainers first) and volume', () => {
  assert.deepEqual(ids(sortAssets(feed, 'momentum')), ['ethereum', 'solana', 'bitcoin', 'aapl']);
  assert.deepEqual(ids(sortAssets(feed, 'change')), ['solana', 'bitcoin', 'aapl', 'ethereum']);
  assert.deepEqual(ids(sortAssets(feed, 'volume')).slice(0, 3), ['bitcoin', 'solana', 'ethereum']);
});

test('sorting does not mutate the input and falls back to momentum for unknown keys', () => {
  const copy = [...feed];
  sortAssets(feed, 'volume');
  assert.deepEqual(feed, copy);
  assert.deepEqual(ids(sortAssets(feed, 'bogus')), ids(sortAssets(feed, 'momentum')));
});

test('search matches name or symbol, case-insensitively', () => {
  assert.deepEqual(ids(searchAssets(feed, 'eth')), ['ethereum']);
  assert.deepEqual(ids(searchAssets(feed, 'SOL')), ['solana']);
  assert.deepEqual(ids(searchAssets(feed, 'app')), ['aapl']);
  assert.deepEqual(searchAssets(feed, 'zzz'), []);
});

test('empty or whitespace-only search returns the full feed', () => {
  assert.equal(searchAssets(feed, '').length, 4);
  assert.equal(searchAssets(feed, '   ').length, 4);
});

test('selectVisibleAssets combines filter, search and sort', () => {
  const result = selectVisibleAssets(feed, { type: 'crypto', query: 'o', sort: 'volume' });
  assert.deepEqual(ids(result), ['bitcoin', 'solana']); // "o" in Bitcoin/Solana, not Ethereum
});
