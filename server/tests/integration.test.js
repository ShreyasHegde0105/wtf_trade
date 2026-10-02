import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { loadConfig } from '../config.js';
import { createMockCoinGecko } from '../dev/mockCoingecko.js';
import { startServer } from '../index.js';

let mock;
let runtime;
let base;

const waitFor = async (check, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for condition');
};

before(async () => {
  mock = createMockCoinGecko();
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const config = loadConfig({
    PORT: '0',
    COINGECKO_BASE_URL: `http://127.0.0.1:${mock.address().port}`,
    POLL_INTERVAL_MS: '150',
    VOLUME_REQUEST_DELAY_MS: '0',
  });
  runtime = startServer(config);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  base = `http://127.0.0.1:${runtime.server.address().port}`;
});

after(async () => {
  await runtime.stop();
  mock.closeAllConnections();
  await new Promise((resolve) => mock.close(resolve));
});

test('GET /api/feed/snapshot returns the documented shape sorted by momentum', async () => {
  const body = await waitFor(async () => {
    const res = await fetch(`${base}/api/feed/snapshot`);
    return res.status === 200 ? res.json() : null;
  });

  assert.ok(body.assets.length > 0 && body.assets.length <= 20);
  for (const asset of body.assets) {
    for (const key of ['id', 'symbol', 'name', 'price', 'change_24h', 'volume_24h', 'momentum_score']) {
      assert.ok(key in asset, `missing ${key}`);
    }
    assert.ok(Number.isFinite(asset.momentum_score));
  }
  const scores = body.assets.map((a) => a.momentum_score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test('GET /api/feed/stream is text/event-stream, emits asset events and cleans up on disconnect', async () => {
  await waitFor(async () => (await fetch(`${base}/api/feed/snapshot`)).status === 200);

  const { res, req } = await new Promise((resolve, reject) => {
    const request = http.get(`${base}/api/feed/stream`, (response) => resolve({ res: response, req: request }));
    request.on('error', reject);
  });
  assert.equal(res.headers['content-type'], 'text/event-stream');
  assert.equal(res.headers['x-accel-buffering'], 'no');
  assert.equal(runtime.sseHub.size, 1);

  let text = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (text += chunk));
  await waitFor(() => text.includes('data: {"assets":'));

  const parsed = JSON.parse(text.match(/^data: (.*)$/m)[1]);
  assert.ok(Array.isArray(parsed.assets));
  assert.ok(parsed.assets.length > 0);
  const firstEvent = parsed.assets[0];
  assert.ok(firstEvent.id && Number.isFinite(firstEvent.momentum_score));

  req.destroy();
  await waitFor(() => runtime.sseHub.size === 0);
});

test('unknown API routes return a JSON 404 without internals', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});
