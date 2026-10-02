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

test('sends x-cg-pro-api-key header when configured with Pro API base URL', async () => {
  let seen;
  const client = createCoinGeckoClient(
    { baseUrl: 'https://pro-api.coingecko.com/api/v3', apiKey: 'pro-secret-key', timeoutMs: 1000 },
    async (url, init) => {
      seen = init.headers;
      return json([]);
    },
  );
  await client.fetchMarkets({ perPage: 1 });
  assert.equal(seen['x-cg-pro-api-key'], 'pro-secret-key');
  assert.equal('x-cg-demo-api-key' in seen, false);
});

test('fetchNewCoins returns new coin listing array on successful response', async () => {
  const mockNew = [
    { id: 'new-coin-1', symbol: 'nc1', name: 'New Coin 1', activated_at: 1778737128 },
    { id: 'new-coin-2', symbol: 'nc2', name: 'New Coin 2', activated_at: 1778730000 },
  ];
  const client = createCoinGeckoClient(config, async () => json(mockNew));
  const result = await client.fetchNewCoins();
  assert.deepEqual(result, mockNew);
});

test('fetchNewCoins rejects when response is not an array', async () => {
  const client = createCoinGeckoClient(config, async () => json({ error: 'not a list' }));
  await assert.rejects(() => client.fetchNewCoins(), (e) => e instanceof UpstreamError);
});

test('fetchNewCoins maps HTTP 401 / 403 paid plan restriction to UpstreamError with status', async () => {
  const client = createCoinGeckoClient(config, async () =>
    new Response(
      JSON.stringify({ status: { error_code: 10005, error_message: 'This request is limited to PRO API subscribers.' } }),
      { status: 401 },
    ),
  );
  await assert.rejects(() => client.fetchNewCoins(), (e) => e.status === 401 && e instanceof UpstreamError);
});

