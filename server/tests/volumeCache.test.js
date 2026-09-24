import assert from 'node:assert/strict';
import { test } from 'node:test';
import { averageVolume, createVolumeCache } from '../cache/volumeCache.js';

const silent = { info() {}, warn() {}, error() {} };
const points = (values) => values.map((v, i) => [i, v]);

function setup(fetchImpl, options = {}) {
  let clock = 0;
  const calls = [];
  const cache = createVolumeCache({
    fetchVolumeHistory: async (id) => {
      calls.push(id);
      return fetchImpl(id);
    },
    ttlMs: 1000,
    logger: silent,
    now: () => clock,
    sleep: async () => {},
    ...options,
  });
  return { cache, calls, advance: (ms) => (clock += ms) };
}

test('averageVolume ignores malformed samples and returns null when nothing is usable', () => {
  assert.equal(averageVolume(points([10, 20, 30])), 20);
  assert.equal(averageVolume([[0, 10], [1, 'x'], null, [2, NaN], [3, 30]]), 20);
  assert.equal(averageVolume([]), null);
  assert.equal(averageVolume(undefined), null);
});

test('caches within the TTL and refetches once it expires', async () => {
  const { cache, calls, advance } = setup(() => points([100, 200]));

  await cache.refreshStale(['btc']);
  await cache.refreshStale(['btc']);
  assert.equal(calls.length, 1);
  assert.equal(cache.get('btc'), 150);

  advance(1001);
  await cache.refreshStale(['btc']);
  assert.equal(calls.length, 2);
});

test('concurrent refreshes do not duplicate upstream requests', async () => {
  const { cache, calls } = setup(() => points([100]));
  await Promise.all([cache.refreshStale(['btc', 'eth']), cache.refreshStale(['btc', 'eth'])]);
  assert.deepEqual(calls, ['btc', 'eth']);
});

test('keeps serving the stale value when a refresh fails, and cools down before retrying', async () => {
  let fail = false;
  const { cache, calls, advance } = setup(() => {
    if (fail) throw new Error('boom');
    return points([100]);
  });

  await cache.refreshStale(['btc']);
  advance(1001);
  fail = true;
  await cache.refreshStale(['btc']);
  assert.equal(cache.get('btc'), 100);

  await cache.refreshStale(['btc']); // inside the failure cooldown: no new request
  assert.equal(calls.length, 2);
});

test('stops the batch on a rate limit', async () => {
  const { cache, calls } = setup(() => {
    throw Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 5000 });
  });
  await cache.refreshStale(['a', 'b', 'c']);
  assert.deepEqual(calls, ['a']);
});

test('unknown ids return null instead of throwing', () => {
  assert.equal(setup(() => points([1])).cache.get('nope'), null);
});
