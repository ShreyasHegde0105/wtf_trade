import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSameAsset, sanitizeAsset } from './assets.js';

const raw = { id: 'btc', symbol: 'btc', name: 'Bitcoin', price: 10, change_24h: 1, volume_24h: 5, momentum_score: 2 };

test('sanitizeAsset fills defaults and drops invalid numbers', () => {
  const asset = sanitizeAsset({ ...raw, change_24h: NaN, volume_24h: 'x', sparkline_24h: [1, NaN, 'a', 2] });
  assert.equal(asset.symbol, 'BTC');
  assert.equal(asset.change_24h, 0);
  assert.equal(asset.volume_24h, 0);
  assert.equal(asset.asset_type, 'crypto');
  assert.deepEqual(asset.sparkline_24h, [1, 2]);
});

test('sanitizeAsset rejects assets without id, name, symbol or a finite price', () => {
  assert.equal(sanitizeAsset(null), null);
  assert.equal(sanitizeAsset({ ...raw, id: undefined }), null);
  assert.equal(sanitizeAsset({ ...raw, price: Infinity }), null);
  assert.equal(sanitizeAsset({ ...raw, name: 5 }), null);
});

test('isSameAsset detects visible changes only', () => {
  const a = sanitizeAsset({ ...raw, sparkline_24h: [1, 2] });
  assert.equal(isSameAsset(a, sanitizeAsset({ ...raw, sparkline_24h: [1, 2] })), true);
  assert.equal(isSameAsset(a, sanitizeAsset({ ...raw, price: 11, sparkline_24h: [1, 2] })), false);
  assert.equal(isSameAsset(a, sanitizeAsset({ ...raw, sparkline_24h: [1, 3] })), false);
});
