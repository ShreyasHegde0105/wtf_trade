import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { loadConfig } from '../config.js';
import { createMockCoinGecko } from '../dev/mockCoingecko.js';
import { startServer } from '../index.js';
import { createAlphaVantageClient, newYorkTimeToMs } from '../services/alphaVantage.js';
import { UpstreamError } from '../services/coingecko.js';
import { createFeedService } from '../services/feed.js';
import { createMarketDataManager, resolveProviderOrder } from '../services/marketDataManager.js';
import { createEquitiesProvider, recentSessionDollarVolumes, toEquityCandidate } from '../services/providers/equities.js';
import { createEquitiesMarketData } from '../services/providers/index.js';
import { createYahooFinanceClient } from '../services/yahooFinance.js';

const FAKE_KEY = 'test-key-never-logged';
const DAY = '2026-10-01';

function createLogger() {
  const lines = [];
  const push = (level) => (msg, meta) => lines.push({ level, msg, ...meta });
  return { lines, info: push('info'), warn: push('warn'), error: push('error'), has: (msg, fields = {}) => lines.some((l) => l.msg === msg && Object.entries(fields).every(([k, v]) => l[k] === v)) };
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

// ---- Alpha Vantage fakes (real response shapes) ----
const avBodies = {
  GLOBAL_QUOTE: (symbol) => ({
    'Global Quote': {
      '01. symbol': symbol, '02. open': '330.00', '03. high': '331.00', '04. low': '325.00', '05. price': '326.9100',
      '06. volume': '11872800', '07. latest trading day': DAY, '08. previous close': '333.0200', '09. change': '-6.1100', '10. change percent': '-1.8347%',
    },
  }),
  TIME_SERIES_INTRADAY: () => ({
    'Meta Data': { '6. Time Zone': 'US/Eastern' },
    'Time Series (15min)': {
      [`${DAY} 09:45:00`]: { '4. close': '329.5000', '5. volume': '1000' },
      [`${DAY} 09:30:00`]: { '4. close': '330.0000', '5. volume': '1000' },
      [`${DAY} 10:00:00`]: { '4. close': '326.9100', '5. volume': '1000' },
      '2026-09-30 15:45:00': { '4. close': '333.0200', '5. volume': '1000' }, // previous session: excluded
    },
  }),
  TIME_SERIES_DAILY: () => ({
    'Meta Data': { '5. Time Zone': 'US/Eastern' },
    'Time Series (Daily)': Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`2026-09-${String(21 + i).padStart(2, '0')}`, { '4. close': '10.0000', '5. volume': String(100 * (i + 1)) }]),
    ),
  }),
  OVERVIEW: () => ({ Symbol: 'AAPL', Name: 'Apple Inc', Exchange: 'NASDAQ', Currency: 'USD' }),
};

function createFakeAlphaVantage({ respond } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const target = new URL(url);
    const fn = target.searchParams.get('function');
    const symbol = target.searchParams.get('symbol');
    requests.push({ fn, symbol, apikey: target.searchParams.get('apikey') });
    const custom = respond?.({ fn, symbol, init });
    if (custom) return custom;
    return json(avBodies[fn](symbol));
  };
  return { fetchImpl, requests };
}

const avClient = (fake, timeoutMs = 1000) => createAlphaVantageClient({ apiKey: FAKE_KEY, baseUrl: 'http://av.test', timeoutMs }, fake.fetchImpl);

// ---- Yahoo fake (v8 chart shape) ----
function createFakeYahoo({ failing = false } = {}) {
  let calls = 0;
  const start = Math.floor(newYorkTimeToMs(DAY, '09:30') / 1000);
  const fetchImpl = async (url) => {
    calls += 1;
    if (failing) return json({ chart: { result: null, error: { description: 'down' } } }, 503);
    const range = new URL(url).searchParams.get('range');
    const closes = range === '1mo' ? [10, 10, 10] : [300, 301];
    return json({
      chart: {
        result: [{
          meta: {
            currency: 'USD', symbol: 'AAPL', fullExchangeName: 'NasdaqGS', longName: 'Apple Inc. (Yahoo)', regularMarketPrice: 301,
            chartPreviousClose: 300, regularMarketVolume: 1000, currentTradingPeriod: { regular: { start, end: start + 23400 } },
          },
          timestamp: closes.map((_, i) => start + i * 900),
          indicators: { quote: [{ close: closes, volume: closes.map(() => 500) }] },
        }],
        error: null,
      },
    });
  };
  return { fetchImpl, calls: () => calls };
}
const yahooClient = (fake) => createYahooFinanceClient({ baseUrl: 'http://yahoo.test', timeoutMs: 1000 }, fake.fetchImpl);

function manager({ sources, logger = createLogger(), clock = { now: 0 }, failureThreshold = 3 }) {
  return createMarketDataManager({ sources, methods: ['fetchQuote', 'fetchDailyHistory'], logger, cooldownMs: 60_000, failureThreshold, now: () => clock.now });
}

/** Mock provider: counts calls, succeeds with a tagged value or throws the given error. */
function mockSource(name, error) {
  const source = {
    name,
    calls: 0,
    client: {
      fetchQuote: async (symbol) => {
        source.calls += 1;
        if (error) throw error;
        return { symbol, from: name };
      },
    },
  };
  return source;
}

// ---- A. Alpha Vantage success ----
test('A. Alpha Vantage succeeds: its data is returned and Yahoo is never called', async () => {
  const av = createFakeAlphaVantage();
  const yahoo = createFakeYahoo();
  const logger = createLogger();
  const md = manager({ sources: [{ name: 'alpha_vantage', client: avClient(av) }, { name: 'yahoo_finance', client: yahooClient(yahoo) }], logger });

  const quote = await md.fetchQuote('AAPL');
  assert.equal(quote.price, 326.91);
  assert.equal(quote.name, 'Apple Inc');
  assert.equal(yahoo.calls(), 0);
  assert.ok(logger.has('market_provider_selected', { provider: 'alpha_vantage' }));
  assert.ok(logger.has('market_provider_success', { provider: 'alpha_vantage' }));
});

// ---- B. Alpha Vantage 429 ----
test('B. Alpha Vantage HTTP 429 falls back to Yahoo and puts Alpha Vantage into cooldown', async () => {
  const av = createFakeAlphaVantage({ respond: () => json({}, 429) });
  const yahoo = createFakeYahoo();
  const logger = createLogger();
  const clock = { now: 0 };
  const md = manager({ sources: [{ name: 'alpha_vantage', client: avClient(av) }, { name: 'yahoo_finance', client: yahooClient(yahoo) }], logger, clock });

  const quote = await md.fetchQuote('AAPL');
  assert.equal(quote.name, 'Apple Inc. (Yahoo)');
  assert.ok(logger.has('market_provider_failed', { provider: 'alpha_vantage', status: 429 }));
  assert.ok(logger.has('market_provider_fallback', { from: 'alpha_vantage', to: 'yahoo_finance' }));
  assert.ok(logger.has('market_provider_success', { provider: 'yahoo_finance' }));
  assert.ok(logger.has('market_provider_cooldown', { provider: 'alpha_vantage' }));

  // During the cooldown Alpha Vantage is not hammered.
  const avCalls = av.requests.length;
  await md.fetchQuote('AAPL');
  assert.equal(av.requests.length, avCalls);
  assert.deepEqual(md.availableProviders('fetchQuote'), ['yahoo_finance']);

  // After the cooldown it is tried first again, and recovers.
  clock.now += 60_000;
  assert.deepEqual(md.availableProviders('fetchQuote'), ['alpha_vantage', 'yahoo_finance']);
});

test('B2. Alpha Vantage rate-limit notice (HTTP 200 "Information") is treated as a 429', async () => {
  const notice = { Information: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' };
  const av = createFakeAlphaVantage({ respond: () => json(notice) });
  await assert.rejects(() => avClient(av).fetchQuote('AAPL'), (e) => e instanceof UpstreamError && e.status === 429);

  const premium = createFakeAlphaVantage({ respond: () => json({ Information: 'This is a premium endpoint.' }) });
  await assert.rejects(() => avClient(premium).fetchQuote('AAPL'), (e) => e.status === 403);

  const badKey = createFakeAlphaVantage({ respond: () => json({ 'Error Message': 'the parameter apikey is invalid or missing.' }) });
  await assert.rejects(() => avClient(badKey).fetchQuote('AAPL'), (e) => e.status === 401);

  const unknown = createFakeAlphaVantage({ respond: ({ fn }) => (fn === 'GLOBAL_QUOTE' ? json({ 'Global Quote': {} }) : null) });
  await assert.rejects(() => avClient(unknown).fetchQuote('NOPE'), (e) => e.status === 404);

  const server = createFakeAlphaVantage({ respond: () => json({}, 503) });
  await assert.rejects(() => avClient(server).fetchQuote('AAPL'), (e) => e.status === 503);

  const malformed = createFakeAlphaVantage({ respond: () => new Response('<html>', { status: 200 }) });
  await assert.rejects(() => avClient(malformed).fetchQuote('AAPL'), /invalid JSON/);
});

// ---- C. Alpha Vantage timeout ----
test('C. Alpha Vantage timeout falls back to Yahoo', async () => {
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const av = createAlphaVantageClient({ apiKey: FAKE_KEY, baseUrl: 'http://av.test', timeoutMs: 20 }, hang);
  const yahoo = createFakeYahoo();
  const logger = createLogger();
  const md = manager({ sources: [{ name: 'alpha_vantage', client: av }, { name: 'yahoo_finance', client: yahooClient(yahoo) }], logger });

  const quote = await md.fetchQuote('AAPL');
  assert.equal(quote.price, 301);
  assert.equal(yahoo.calls(), 1);
  assert.ok(logger.lines.some((l) => l.msg === 'market_provider_failed' && /timed out/.test(l.reason)));
});

test('C2. repeated timeouts / 5xx put a provider into cooldown after the threshold; 404s never do', async () => {
  const clock = { now: 0 };
  const flaky = mockSource('alpha_vantage', new UpstreamError('Alpha Vantage GLOBAL_QUOTE responded with HTTP 502', { status: 502 }));
  const yahoo = mockSource('yahoo_finance');
  const md = manager({ sources: [flaky, yahoo], clock, failureThreshold: 3 });
  for (let i = 0; i < 3; i += 1) await md.fetchQuote('AAPL');
  assert.equal(flaky.calls, 3);
  await md.fetchQuote('AAPL');
  assert.equal(flaky.calls, 3); // cooling down

  const missing = mockSource('alpha_vantage', new UpstreamError('no quote', { status: 404 }));
  const md2 = manager({ sources: [missing, mockSource('yahoo_finance')], failureThreshold: 1 });
  for (let i = 0; i < 5; i += 1) assert.equal((await md2.fetchQuote('ODD')).from, 'yahoo_finance');
  assert.equal(missing.calls, 5); // asset-level miss: provider stays available
});

// ---- D. Alpha + Yahoo failure -> CoinGecko ----
test('D. Alpha Vantage and Yahoo both fail: CoinGecko is attempted next', async () => {
  const logger = createLogger();
  const av = mockSource('alpha_vantage', new UpstreamError('rate limited', { status: 429 }));
  const yahoo = mockSource('yahoo_finance', new UpstreamError('down', { status: 503 }));
  const coingecko = mockSource('coingecko');
  const md = manager({ sources: [av, yahoo, coingecko], logger });

  assert.deepEqual(await md.fetchQuote('BTC'), { symbol: 'BTC', from: 'coingecko' });
  assert.deepEqual([av.calls, yahoo.calls, coingecko.calls], [1, 1, 1]);
  assert.ok(logger.has('market_provider_fallback', { from: 'alpha_vantage', to: 'yahoo_finance' }));
  assert.ok(logger.has('market_provider_fallback', { from: 'yahoo_finance', to: 'coingecko' }));
  assert.ok(logger.has('market_provider_success', { provider: 'coingecko' }));
});

test('D2. real wiring: order is alpha_vantage, yahoo_finance, coingecko; CoinGecko is skipped for equities (no equity endpoints)', () => {
  assert.deepEqual(resolveProviderOrder('alpha_vantage', createLogger()), ['alpha_vantage', 'yahoo_finance', 'coingecko']);
  assert.deepEqual(resolveProviderOrder('yahoo_finance', createLogger()), ['yahoo_finance', 'alpha_vantage', 'coingecko']);
  const invalid = createLogger();
  assert.deepEqual(resolveProviderOrder('random', invalid), ['alpha_vantage', 'yahoo_finance', 'coingecko']);
  assert.ok(invalid.has('market_provider_invalid'));

  const coingecko = { fetchMarkets: async () => [], fetchVolumeHistory: async () => [] };
  const logger = createLogger();
  const config = loadConfig({ ALPHA_VANTAGE_API_KEY: FAKE_KEY, EQUITIES_SYMBOLS: 'AAPL' });
  const md = createEquitiesMarketData({ config, coingecko, logger, fetchImpl: async () => json({}) });
  assert.deepEqual(md.availableProviders('fetchQuote'), ['alpha_vantage', 'yahoo_finance']);
  const chain = logger.lines.find((l) => l.msg === 'market_provider_chain' && l.method === 'fetchQuote');
  assert.deepEqual(chain.unsupported, ['coingecko']);

  // Without a key Alpha Vantage is left out, so the current Yahoo behaviour is unchanged.
  const noKey = createLogger();
  const yahooOnly = createEquitiesMarketData({ config: loadConfig({ EQUITIES_SYMBOLS: 'AAPL' }), coingecko, logger: noKey, fetchImpl: async () => json({}) });
  assert.deepEqual(yahooOnly.availableProviders('fetchQuote'), ['yahoo_finance']);
  assert.ok(noKey.has('market_provider_unavailable', { provider: 'alpha_vantage' }));
});

// ---- E. All providers fail ----
test('E. all providers fail: UpstreamError is thrown and the existing last-good data is preserved', async () => {
  const fail = { value: false };
  const flaky = (name) => ({
    name,
    client: {
      fetchQuote: async (symbol) => {
        if (fail.value) throw new UpstreamError(`${name} down`, { status: 503 });
        return { symbol, name: 'Apple Inc', price: 100, previousClose: 99, volume: 10, currency: 'USD', regularSession: null, intradayCloses: [99, 100] };
      },
    },
  });
  const md = manager({ sources: [flaky('alpha_vantage'), flaky('yahoo_finance'), flaky('coingecko')], failureThreshold: 100 });
  const clock = { now: 0 };
  const config = { symbols: ['AAPL'], refreshMs: 1000, closedRefreshMs: 1000 };
  const volumeCache = { get: () => null, refreshStale: () => Promise.resolve() };
  const equities = createEquitiesProvider({ config, client: md, volumeCache, logger: createLogger(), now: () => clock.now });
  const crypto = { name: 'coingecko', fetchAssets: async () => { if (fail.value) throw new UpstreamError('cg down'); return [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 1, change_24h: 1, volume_24h: 1, asset_type: 'crypto', avg_volume_7d: null, sparkline_24h: [] }]; } };
  const feed = createFeedService({ providers: [crypto, equities], topN: 20, pollIntervalMs: 10, logger: createLogger() });

  await feed.pollOnce();
  const before = feed.getSnapshot();
  assert.deepEqual(before.assets.map((a) => a.id).sort(), ['bitcoin', 'equity:AAPL']);

  fail.value = true;
  await assert.rejects(() => md.fetchQuote('AAPL'), (e) => e instanceof UpstreamError && /All market data providers failed/.test(e.message));
  clock.now += 1000;
  // Equities keep their last good quote (30 min) and the feed keeps its snapshot.
  assert.deepEqual((await equities.fetchAssets()).map((a) => a.symbol), ['AAPL']);
  await feed.pollOnce();
  assert.deepEqual(feed.getSnapshot().assets.map((a) => a.id).sort(), ['bitcoin', 'equity:AAPL']);
});

// ---- F. Normalization ----
test('F. Alpha Vantage responses are normalised into the existing quote/candidate format', async () => {
  const av = createFakeAlphaVantage();
  const client = avClient(av);
  const quote = await client.fetchQuote('AAPL');

  const yahooQuote = await yahooClient(createFakeYahoo()).fetchQuote('AAPL');
  assert.deepEqual(Object.keys(quote).sort(), Object.keys(yahooQuote).sort());
  assert.deepEqual(quote.intradayCloses, [330, 329.5, 326.91]); // latest session only, in time order
  assert.deepEqual(quote.regularSession, { start: Date.parse('2026-10-01T13:30:00Z'), end: Date.parse('2026-10-01T20:00:00Z') });

  const candidate = toEquityCandidate(quote, 5000, createLogger());
  assert.deepEqual(candidate, {
    id: 'equity:AAPL',
    symbol: 'AAPL',
    name: 'Apple Inc',
    exchange: 'NASDAQ',
    price: 326.91,
    change_24h: -1.8347,
    volume_24h: Number((11_872_800 * 326.91).toFixed(2)),
    sparkline_24h: [330, 329.5, 326.91],
    sparkline_7d: [],
    asset_type: 'equity',
    avg_volume_7d: 5000,
  });

  // Daily bars -> the same 7-session dollar volume series the Yahoo path produces.
  const history = await client.fetchDailyHistory('AAPL');
  assert.equal(history.bars.length, 9);
  assert.equal(history.bars[0].ts, Date.parse('2026-09-21T13:30:00Z'));
  const points = recentSessionDollarVolumes(history, Date.parse('2026-10-02T12:00:00Z'));
  assert.deepEqual(points.map(([, v]) => v), [3000, 4000, 5000, 6000, 7000, 8000, 9000]);

  // Name lookup (OVERVIEW) happens once per symbol, not on every quote.
  await client.fetchQuote('AAPL');
  assert.equal(av.requests.filter((r) => r.fn === 'OVERVIEW').length, 1);
});

test('F2. the API key is sent only as the apikey parameter and never appears in errors or logs', async () => {
  const av = createFakeAlphaVantage({ respond: () => json({}, 500) });
  const logger = createLogger();
  const md = manager({ sources: [{ name: 'alpha_vantage', client: avClient(av) }, mockSource('yahoo_finance')], logger });
  await md.fetchQuote('AAPL');
  assert.equal(av.requests[0].apikey, FAKE_KEY);
  assert.ok(!JSON.stringify(logger.lines).includes(FAKE_KEY));
  await assert.rejects(() => avClient(av).fetchQuote('AAPL'), (e) => !e.message.includes(FAKE_KEY));
  assert.equal(newYorkTimeToMs('2026-01-15', '09:30'), Date.parse('2026-01-15T14:30:00Z')); // EST
});

// ---- G + H. API contract and SSE through the real server ----
test('G/H. with Alpha Vantage rate limited, all endpoints keep their contract and SSE streams equities from the fallback', async () => {
  const mock = createMockCoinGecko();
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const av = createFakeAlphaVantage({ respond: () => json({}, 429) });
  const yahoo = createFakeYahoo();
  const fetchImpl = (url, init) => {
    const host = new URL(url).hostname;
    if (host === 'av.test') return av.fetchImpl(url, init);
    if (host === 'yahoo.test') return yahoo.fetchImpl(url, init);
    return fetch(url, init);
  };
  const config = loadConfig({
    PORT: '0',
    COINGECKO_BASE_URL: `http://127.0.0.1:${mock.address().port}`,
    POLL_INTERVAL_MS: '150',
    VOLUME_REQUEST_DELAY_MS: '0',
    EQUITIES_SYMBOLS: 'AAPL',
    EQUITIES_HISTORY_REQUEST_DELAY_MS: '0',
    ALPHA_VANTAGE_API_KEY: FAKE_KEY,
    ALPHA_VANTAGE_BASE_URL: 'http://av.test',
    YAHOO_FINANCE_BASE_URL: 'http://yahoo.test',
    MARKET_DATA_PROVIDER: 'alpha_vantage',
  });
  const runtime = startServer(config, { fetchImpl });
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  const base = `http://127.0.0.1:${runtime.server.address().port}`;

  try {
    const waitFor = async (check) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = await check();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('timed out');
    };

    const snapshot = await waitFor(async () => {
      const res = await fetch(`${base}/api/feed/snapshot`);
      if (res.status !== 200) return null;
      const body = await res.json();
      return body.assets.some((a) => a.id === 'equity:AAPL') ? body : null;
    });
    assert.ok(av.requests.length > 0, 'Alpha Vantage was tried first');
    const aapl = snapshot.assets.find((a) => a.id === 'equity:AAPL');
    assert.equal(aapl.name, 'Apple Inc. (Yahoo)'); // served by the fallback
    for (const key of ['id', 'symbol', 'name', 'price_usd', 'price_change_24h', 'volume_24h', 'avg_volume_7d', 'momentum_score', 'momentum_label', 'sparkline_7d', 'price', 'change_24h', 'volume_ratio', 'asset_type', 'sparkline_24h']) {
      assert.ok(key in aapl, `missing ${key}`);
    }
    assert.ok(snapshot.assets.some((a) => a.asset_type === 'crypto'), 'crypto still served by CoinGecko');

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.hasSnapshot, true);

    const discovery = await (await fetch(`${base}/api/feed/discovery`)).json();
    assert.deepEqual(Object.keys(discovery).sort(), ['gainers', 'new_listings', 'trending', 'volume_spikes']);

    const { leaderboard } = await (await fetch(`${base}/api/feed/leaderboard`)).json();
    assert.ok(leaderboard.length > 0 && leaderboard.length <= 10);
    assert.deepEqual(leaderboard.map((r) => r.rank), leaderboard.map((_, i) => i + 1));

    // SSE after fallback.
    const { res, req } = await new Promise((resolve, reject) => {
      const request = http.get(`${base}/api/feed/stream`, (response) => resolve({ res: response, req: request }));
      request.on('error', reject);
    });
    assert.equal(res.headers['content-type'], 'text/event-stream');
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => (text += chunk));
    await waitFor(() => text.includes('equity:AAPL'));
    const event = JSON.parse(text.match(/^data: (.*)$/m)[1]);
    assert.ok(event.assets.some((a) => a.id === 'equity:AAPL'));
    req.destroy();
    await waitFor(() => runtime.sseHub.size === 0);
  } finally {
    await runtime.stop();
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
  }
});
