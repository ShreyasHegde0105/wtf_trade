import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoinGeckoClient, UpstreamError } from '../services/coingecko.js';

const config = { baseUrl: 'http://cg.test/api', apiKey: '', timeoutMs: 1000 };
const json = (body, init) => new Response(JSON.stringify(body), init);

test('a 429 opens a shared backoff gate and later calls fail fast without hitting the network', async () => {
  let calls = 0;
  const client = createCoinGeckoClient(config, async () => {
    calls += 1;
    return new Response('', { status: 429, headers: { 'retry-after': '90' } });
  });

  await assert.rejects(() => client.fetchMarkets({ perPage: 5 }), (e) => e.status === 429 && e.retryAfterMs >= 90_000);
  await assert.rejects(() => client.fetchVolumeHistory('bitcoin'), (e) => e.status === 429);
  assert.equal(calls, 1);
});

test('rejects malformed payloads with UpstreamError', async () => {
  const bad = createCoinGeckoClient(config, async () => json({ nope: true }));
  await assert.rejects(() => bad.fetchMarkets({ perPage: 5 }), UpstreamError);
  await assert.rejects(() => bad.fetchVolumeHistory('bitcoin'), UpstreamError);

  const notJson = createCoinGeckoClient(config, async () => new Response('<html>', { status: 200 }));
  await assert.rejects(() => notJson.fetchMarkets({ perPage: 5 }), UpstreamError);
});

test('maps network failures and HTTP errors to UpstreamError', async () => {
  const down = createCoinGeckoClient(config, async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(() => down.fetchMarkets({ perPage: 5 }), UpstreamError);

  const serverError = createCoinGeckoClient(config, async () => new Response('', { status: 503 }));
  await assert.rejects(() => serverError.fetchMarkets({ perPage: 5 }), (e) => e.status === 503);
});

test('sends the API key header only when configured and never in error messages', async () => {
  let seen;
  const client = createCoinGeckoClient({ ...config, apiKey: 'secret-key' }, async (url, init) => {
    seen = init.headers;
    return new Response('', { status: 500 });
  });
  await assert.rejects(() => client.fetchMarkets({ perPage: 5 }), (e) => !e.message.includes('secret-key'));
  assert.equal(seen['x-cg-demo-api-key'], 'secret-key');
});
