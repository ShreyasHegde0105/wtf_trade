import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeedService } from '../services/feed.js';

const silent = { info() {}, warn() {}, error() {} };
const candidate = (id, change) => ({
  id, symbol: id.toUpperCase(), name: id, price: 1, change_24h: change, volume_24h: 0,
  asset_type: 'crypto', avg_volume_7d: null, sparkline_24h: [],
});

test('retains the last good snapshot when the provider fails, then recovers', async () => {
  let mode = 'ok';
  const provider = {
    name: 'p',
    async fetchAssets() {
      if (mode === 'fail') throw new Error('upstream down');
      return [candidate('a', 1), candidate('b', 5)];
    },
  };
  const feed = createFeedService({ providers: [provider], topN: 20, pollIntervalMs: 10, logger: silent });
  const broadcasts = [];
  feed.subscribe((assets) => broadcasts.push(assets));

  await feed.pollOnce();
  assert.deepEqual(feed.getSnapshot().assets.map((a) => a.id), ['b', 'a']);

  mode = 'fail';
  await feed.pollOnce();
  assert.equal(feed.getSnapshot().assets.length, 2);
  assert.equal(broadcasts.length, 1); // nothing broadcast for a failed poll

  mode = 'ok';
  await feed.pollOnce();
  assert.equal(broadcasts.length, 2);
});

test('polls never overlap: concurrent calls share one upstream request', async () => {
  let calls = 0;
  const provider = {
    name: 'p',
    async fetchAssets() {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [candidate('a', 1)];
    },
  };
  const feed = createFeedService({ providers: [provider], topN: 20, pollIntervalMs: 10, logger: silent });
  await Promise.all([feed.pollOnce(), feed.pollOnce(), feed.pollOnce()]);
  assert.equal(calls, 1);
});

test('one failing provider does not remove another provider\'s data', async () => {
  let equitiesFail = false;
  const crypto = { name: 'crypto', fetchAssets: async () => [candidate('btc', 2)] };
  const equities = {
    name: 'equities',
    async fetchAssets() {
      if (equitiesFail) throw new Error('down');
      return [{ ...candidate('aapl', 9), asset_type: 'equity' }];
    },
  };
  const feed = createFeedService({ providers: [crypto, equities], topN: 20, pollIntervalMs: 10, logger: silent });

  await feed.pollOnce();
  equitiesFail = true;
  await feed.pollOnce();
  assert.deepEqual(feed.getSnapshot().assets.map((a) => a.id).sort(), ['aapl', 'btc']);
});
