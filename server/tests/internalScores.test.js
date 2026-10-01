import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { secretMatches } from '../routes/internalScores.js';

const SECRET = 'test-secret-0123456789abcdef';
const silent = { info() {}, warn() {}, error() {} };
const fakeFeed = { getSnapshot: () => null };
const fakeHub = { size: 0, connect() {} };

const saved = [];
let storeMode = 'ok';
const fakeStore = {
  async saveScores(items) {
    if (storeMode === 'fail') throw new Error('db down');
    saved.push(...items);
    return { accepted: items.length, rejected: [] };
  },
};

const servers = [];
async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

let base;
let unconfiguredBase;
before(async () => {
  const config = loadConfig({ WTF_WEBHOOK_SECRET: SECRET });
  base = await listen(createApp({ config, feed: fakeFeed, sseHub: fakeHub, logger: silent, scoreStore: fakeStore }));
  unconfiguredBase = await listen(createApp({ config: loadConfig({}), feed: fakeFeed, sseHub: fakeHub, logger: silent }));
});

after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
});

const post = (url, body, { secret = SECRET, contentType = 'application/json' } = {}) => {
  const headers = { 'content-type': contentType };
  if (secret !== null) headers['x-wtf-secret'] = secret;
  return fetch(`${url}/internal/scores`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
};

const valid = { symbol: 'btc', score: 1.72, signal: 'bullish', updated_at: '2026-01-15T10:15:00Z' };

test('secretMatches is constant-time safe for any length and rejects empty values', () => {
  assert.equal(secretMatches(SECRET, SECRET), true);
  assert.equal(secretMatches('short', SECRET), false);
  assert.equal(secretMatches(`${SECRET}-longer`, SECRET), false);
  assert.equal(secretMatches('', SECRET), false);
  assert.equal(secretMatches(undefined, SECRET), false);
  assert.equal(secretMatches('anything', ''), false);
});

test('answers 503 when no secret or database is configured', async () => {
  const res = await post(unconfiguredBase, valid);
  assert.equal(res.status, 503);
});

test('rejects a missing, wrong or wrong-length secret with 401', async () => {
  for (const secret of [null, 'wrong-secret-0123456789abcdef', 'x']) {
    const res = await post(base, valid, { secret });
    assert.equal(res.status, 401, `secret=${secret}`);
    assert.deepEqual(await res.json(), { error: 'unauthorized' });
  }
});

test('rejects non-JSON content types with 415 and invalid JSON with 400', async () => {
  assert.equal((await post(base, 'symbol=BTC', { contentType: 'text/plain' })).status, 415);

  const res = await post(base, '{"symbol":');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad payload');
});

test('rejects invalid fields with 400 and lists every problem', async () => {
  const res = await post(base, { symbol: '', score: 'high', signal: '', updated_at: 'yesterday' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.details.length, 4);

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  assert.equal((await post(base, { ...valid, updated_at: future })).status, 400);
  assert.equal((await post(base, [])).status, 400);
  assert.equal((await post(base, [valid, { ...valid, score: null }])).status, 400);
});

test('stores a single score, normalising symbol case and timestamp format', async () => {
  saved.length = 0;
  const res = await post(base, valid);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, accepted: 1, rejected: [] });
  assert.deepEqual(saved, [{ symbol: 'BTC', score: 1.72, signal: 'bullish', updated_at: '2026-01-15T10:15:00.000Z' }]);
});

test('stores a batch of scores in one request', async () => {
  saved.length = 0;
  const res = await post(base, [valid, { ...valid, symbol: 'ETH', score: 0.4 }]);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).accepted, 2);
  assert.deepEqual(saved.map((s) => s.symbol), ['BTC', 'ETH']);
});

test('answers 502 when storage fails so the sender retries', async () => {
  storeMode = 'fail';
  try {
    const res = await post(base, valid);
    assert.equal(res.status, 502);
  } finally {
    storeMode = 'ok';
  }
});

test('unknown /internal routes return a JSON 404', async () => {
  const res = await fetch(`${base}/internal/nope`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});
