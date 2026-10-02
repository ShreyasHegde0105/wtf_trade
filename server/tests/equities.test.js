import assert from 'node:assert/strict';
import { test } from 'node:test';
import { averageVolume, createVolumeCache } from '../cache/volumeCache.js';
import { loadConfig, symbolList } from '../config.js';
import { createFeedService } from '../services/feed.js';
import { createEquitiesProvider, recentSessionDollarVolumes } from '../services/providers/equities.js';
import { createProviders } from '../services/providers/index.js';
import { UpstreamError } from '../services/coingecko.js';
import { createYahooFinanceClient } from '../services/yahooFinance.js';
import { buildFeedSnapshot, buildSnapshot, toPublicAsset } from '../utils/assets.js';

// US regular session on 2026-10-01: 13:30-20:00 UTC.
const SESSION = { start: Date.parse('2026-10-01T13:30:00Z'), end: Date.parse('2026-10-01T20:00:00Z') };
const DURING_SESSION = Date.parse('2026-10-01T15:00:00Z');
const AFTER_CLOSE = Date.parse('2026-10-01T21:00:00Z');
const BEFORE_OPEN = Date.parse('2026-10-01T13:20:00Z'); // 10 min before the open
const DAY = 24 * 60 * 60 * 1000;

const QUOTES = {
  AAPL: { name: 'Apple Inc.', price: 326.91, previousClose: 333.02, volume: 11_872_800, closes: [330, 329.5, null, 326.91] },
  MSFT: { name: 'Microsoft Corporation', price: 410, previousClose: 400, volume: 5_000_000, closes: [405, 410] },
  NVDA: { name: 'NVIDIA Corporation', price: 120, previousClose: 125, volume: 90_000_000, closes: [124, 120] },
};

const s = (ms) => Math.floor(ms / 1000);
const dollars = (shares, price) => Number((shares * price).toFixed(2));

function chartBody(symbol, overrides = {}) {
  const q = { ...QUOTES[symbol], ...overrides };
  return {
    chart: {
      result: [
        {
          meta: {
            currency: q.currency ?? 'USD',
            symbol,
            exchangeName: 'NMS',
            fullExchangeName: 'NasdaqGS',
            longName: q.name,
            shortName: q.name,
            regularMarketPrice: q.price,
            chartPreviousClose: q.previousClose,
            regularMarketVolume: q.volume,
            regularMarketTime: s(DURING_SESSION),
            currentTradingPeriod: { regular: { start: s(SESSION.start), end: s(SESSION.end) } },
          },
          timestamp: (q.closes ?? []).map((_, i) => s(SESSION.start) + i * 900),
          indicators: { quote: [{ close: q.closes ?? [], volume: (q.closes ?? []).map(() => 1000) }] },
        },
      ],
      error: null,
    },
  };
}

/** Nine daily bars ending today; volume = 100 * (day + 1) shares at a close of 10. */
function dailyBody() {
  const bars = Array.from({ length: 9 }, (_, i) => ({ ts: SESSION.start - (8 - i) * DAY, volume: 100 * (i + 1), close: 10 }));
  return {
    chart: {
      result: [
        {
          meta: { currentTradingPeriod: { regular: { start: s(SESSION.start), end: s(SESSION.end) } } },
          timestamp: bars.map((b) => s(b.ts)),
          indicators: { quote: [{ close: bars.map((b) => b.close), volume: bars.map((b) => b.volume) }] },
        },
      ],
      error: null,
    },
  };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const notFound = (symbol) => json({ chart: { result: null, error: { code: 'Not Found', description: `No data found, symbol may be delisted: ${symbol}` } } }, 404);

/** Fake Yahoo: routes by symbol and range, counts requests, can fail chosen symbols. */
function createFakeYahoo({ failing = [], quoteOverrides = {} } = {}) {
  const requests = [];
  const fetchImpl = async (url) => {
    const target = new URL(url);
    const symbol = decodeURIComponent(target.pathname.split('/').pop());
    const range = target.searchParams.get('range');
    requests.push({ symbol, range });
    if (failing.includes(symbol) || !QUOTES[symbol]) return notFound(symbol);
    return json(range === '1mo' ? dailyBody() : chartBody(symbol, quoteOverrides[symbol]));
  };
  const quoteRequests = (symbol) => requests.filter((r) => r.range === '1d' && (!symbol || r.symbol === symbol)).length;
  return { fetchImpl, requests, quoteRequests };
}

function createLogger() {
  const warnings = [];
  return {
    warnings,
    info() {},
    warn: (msg, meta) => warnings.push({ msg, ...meta }),
    error() {},
  };
}

const stubVolumeCache = (values = {}) => ({ get: (symbol) => values[symbol] ?? null, refreshStale: () => Promise.resolve() });

function makeProvider({ symbols = ['AAPL', 'MSFT', 'NVDA'], yahoo = createFakeYahoo(), clock = { now: DURING_SESSION }, volumeCache = stubVolumeCache(), logger = createLogger() } = {}) {
  const config = { ...loadConfig({}).equities, symbols, baseUrl: 'http://yahoo.test' };
  const client = createYahooFinanceClient(config, yahoo.fetchImpl);
  const provider = createEquitiesProvider({ config, client, volumeCache, logger, now: () => clock.now });
  return { provider, yahoo, clock, logger, config };
}

test('1. a successful quote is normalised into the shared candidate shape', async () => {
  const { provider } = makeProvider({ symbols: ['AAPL'], volumeCache: stubVolumeCache({ AAPL: 15_000_000_000 }) });
  const [aapl] = await provider.fetchAssets();

  assert.deepEqual(aapl, {
    id: 'equity:AAPL',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NasdaqGS',
    price: 326.91,
    change_24h: -1.8347, // vs previous close 333.02
    volume_24h: dollars(11_872_800, 326.91), // dollar volume (cents), same unit as CoinGecko
    sparkline_24h: [330, 329.5, 326.91],
    sparkline_7d: [],
    asset_type: 'equity',
    avg_volume_7d: 15_000_000_000,
  });
});

test('2. multiple configured symbols are all returned', async () => {
  const { provider } = makeProvider();
  const assets = await provider.fetchAssets();
  assert.deepEqual(assets.map((a) => a.symbol), ['AAPL', 'MSFT', 'NVDA']);
});

test('3. every equity is typed equity with a namespaced id and its own price, volume and name', async () => {
  const { provider } = makeProvider();
  for (const asset of await provider.fetchAssets()) {
    const q = QUOTES[asset.symbol];
    assert.equal(asset.asset_type, 'equity');
    assert.equal(asset.id, `equity:${asset.symbol}`);
    assert.equal(asset.price, q.price);
    assert.equal(asset.name, q.name);
    assert.equal(asset.volume_24h, dollars(q.volume, q.price));
  }
  // Public shape: display symbol unchanged, exchange passed through for the asset registry.
  const pub = toPublicAsset((await provider.fetchAssets())[0]);
  assert.equal(pub.symbol, 'AAPL');
  assert.equal(pub.exchange, 'NasdaqGS');
});

test('4. avg_volume_7d is the mean dollar volume of the last 7 completed sessions', async () => {
  const yahoo = createFakeYahoo();
  const client = createYahooFinanceClient({ baseUrl: 'http://yahoo.test', timeoutMs: 1000 }, yahoo.fetchImpl);
  const history = await client.fetchDailyHistory('AAPL');

  // During the session today's partial bar (volume 900) is excluded: days 2..8 -> 200..800 shares x $10.
  const open = recentSessionDollarVolumes(history, DURING_SESSION);
  assert.equal(open.length, 7);
  assert.equal(averageVolume(open), 5000);

  // After the close today's bar is complete and counts: days 3..9 -> 300..900 shares x $10.
  assert.equal(averageVolume(recentSessionDollarVolumes(history, AFTER_CLOSE)), 6000);

  // Through the real (shared) volume cache, with a 6h TTL: one history request, then cached.
  const clock = { now: DURING_SESSION };
  const cache = createVolumeCache({
    fetchVolumeHistory: async (symbol) => recentSessionDollarVolumes(await client.fetchDailyHistory(symbol), clock.now),
    ttlMs: 6 * 60 * 60 * 1000,
    now: () => clock.now,
    logger: createLogger(),
  });
  const historyRequests = () => yahoo.requests.filter((r) => r.range === '1mo').length;
  const before = historyRequests();
  const { provider } = makeProvider({ symbols: ['AAPL'], yahoo, clock, volumeCache: cache });
  await provider.fetchAssets(); // starts the background history load
  await cache.refreshStale(['AAPL']);
  assert.equal((await provider.fetchAssets())[0].avg_volume_7d, 5000);

  clock.now += 2 * 60 * 1000;
  await provider.fetchAssets();
  await cache.refreshStale(['AAPL']);
  assert.equal(historyRequests() - before, 1); // cached: no second history request
});

test('5. sparkline_24h holds the intraday closes in order, without gaps', async () => {
  const { provider } = makeProvider({ symbols: ['AAPL'] });
  const [aapl] = await provider.fetchAssets();
  assert.deepEqual(aapl.sparkline_24h, [330, 329.5, 326.91]);
  assert.ok(aapl.sparkline_24h.every(Number.isFinite));
});

test('6. one failing symbol is logged and skipped; the others are still returned', async () => {
  const { provider, logger } = makeProvider({ yahoo: createFakeYahoo({ failing: ['MSFT'] }) });
  const assets = await provider.fetchAssets();
  assert.deepEqual(assets.map((a) => a.symbol), ['AAPL', 'NVDA']);
  assert.ok(logger.warnings.some((w) => w.msg === 'equity_symbol_failed' && w.symbol === 'MSFT'));
});

test('7. an empty EQUITIES_SYMBOLS disables equities without breaking crypto', () => {
  assert.deepEqual(loadConfig({ EQUITIES_SYMBOLS: '' }).equities.symbols, []);
  assert.deepEqual(loadConfig({}).equities.symbols, []);

  const config = loadConfig({ EQUITIES_SYMBOLS: ' , ' });
  assert.equal(createEquitiesProvider({ config: config.equities, logger: createLogger() }), null);
  const cryptoClient = { fetchMarkets: async () => [], fetchVolumeHistory: async () => [] };
  const providers = createProviders({ config, client: cryptoClient, volumeCache: stubVolumeCache(), logger: createLogger() });
  assert.deepEqual(providers.map((p) => p.name), ['coingecko']);
});

test('8. duplicate and messy symbols are cleaned up and fetched once each', async () => {
  assert.deepEqual(symbolList(' aapl, MSFT,AAPL ,, nvda'), ['AAPL', 'MSFT', 'NVDA']);
  const symbols = loadConfig({ EQUITIES_SYMBOLS: 'AAPL, MSFT, AAPL, NVDA' }).equities.symbols;

  const { provider, yahoo } = makeProvider({ symbols });
  const assets = await provider.fetchAssets();
  assert.equal(assets.length, 3);
  for (const symbol of ['AAPL', 'MSFT', 'NVDA']) assert.equal(yahoo.quoteRequests(symbol), 1);
});

test('9a. market closed: last quotes are served and Yahoo is polled only every closedRefreshMs', async () => {
  const clock = { now: AFTER_CLOSE };
  const { provider, yahoo, config } = makeProvider({ clock });

  const first = await provider.fetchAssets();
  assert.equal(yahoo.quoteRequests(), 3);

  clock.now += 5 * 60 * 1000; // many feed polls later, still closed
  for (let i = 0; i < 30; i += 1) assert.deepEqual(await provider.fetchAssets(), first);
  assert.equal(yahoo.quoteRequests(), 3);

  clock.now = AFTER_CLOSE + config.closedRefreshMs;
  await provider.fetchAssets();
  assert.equal(yahoo.quoteRequests(), 6);
});

test('9b. market open: quotes refresh every refreshMs, not on every 10s feed poll', async () => {
  const clock = { now: DURING_SESSION };
  const { provider, yahoo, config } = makeProvider({ clock });
  await provider.fetchAssets();
  clock.now += 10_000;
  await provider.fetchAssets();
  assert.equal(yahoo.quoteRequests(), 3);
  clock.now = DURING_SESSION + config.refreshMs;
  await provider.fetchAssets();
  assert.equal(yahoo.quoteRequests(), 6);
});

test('9c. shortly before the open, the next refresh happens at the session start, not 15 min later', async () => {
  const clock = { now: BEFORE_OPEN };
  const { provider, yahoo } = makeProvider({ clock });
  await provider.fetchAssets();
  clock.now = SESSION.start - 1;
  await provider.fetchAssets();
  assert.equal(yahoo.quoteRequests(), 3);
  clock.now = SESSION.start;
  await provider.fetchAssets();
  assert.equal(yahoo.quoteRequests(), 6);
});

test('9d. incomplete or stale quote data does not crash and is not invented', async () => {
  const yahoo = createFakeYahoo({ quoteOverrides: { AAPL: { previousClose: null, volume: null, closes: [] } } });
  const { provider, logger } = makeProvider({ symbols: ['AAPL'], yahoo });
  const [aapl] = await provider.fetchAssets();
  assert.equal(aapl.price, 326.91);
  assert.equal(aapl.change_24h, 0); // same fallback as the crypto provider
  assert.equal(aapl.volume_24h, 0);
  assert.deepEqual(aapl.sparkline_24h, []);
  assert.ok(logger.warnings.some((w) => w.msg === 'equity_quote_incomplete'));

  const noPrice = makeProvider({ symbols: ['AAPL'], yahoo: createFakeYahoo({ quoteOverrides: { AAPL: { price: null } } }) });
  await assert.rejects(() => noPrice.provider.fetchAssets(), UpstreamError);
});

test('a failed refresh keeps a symbol\'s last good quote for a while, then drops it', async () => {
  const clock = { now: DURING_SESSION };
  const failing = [];
  const yahoo = createFakeYahoo({ failing });
  const { provider, config } = makeProvider({ symbols: ['AAPL', 'MSFT'], yahoo, clock });
  await provider.fetchAssets();

  failing.push('MSFT');
  clock.now += config.refreshMs;
  assert.deepEqual((await provider.fetchAssets()).map((a) => a.symbol), ['AAPL', 'MSFT']);

  clock.now += 31 * 60 * 1000;
  assert.deepEqual((await provider.fetchAssets()).map((a) => a.symbol), ['AAPL']);
});

test('non-USD listings are skipped, and a 429 stops further Yahoo requests', async () => {
  const yahoo = createFakeYahoo({ quoteOverrides: { MSFT: { currency: 'EUR' } } });
  const { provider } = makeProvider({ symbols: ['AAPL', 'MSFT'], yahoo });
  assert.deepEqual((await provider.fetchAssets()).map((a) => a.symbol), ['AAPL']);

  let calls = 0;
  const limited = createYahooFinanceClient({ baseUrl: 'http://yahoo.test', timeoutMs: 1000 }, async () => {
    calls += 1;
    return new Response('', { status: 429, headers: { 'retry-after': '60' } });
  });
  await assert.rejects(() => limited.fetchQuote('AAPL'), (e) => e.status === 429);
  await assert.rejects(() => limited.fetchQuote('MSFT'), (e) => e.status === 429);
  assert.equal(calls, 1);
});

test('Yahoo being down never removes crypto from the feed', async () => {
  const crypto = {
    name: 'coingecko',
    fetchAssets: async () => [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 1, change_24h: 1, volume_24h: 1, asset_type: 'crypto', avg_volume_7d: null, sparkline_24h: [] }],
  };
  const { provider } = makeProvider({ yahoo: createFakeYahoo({ failing: ['AAPL', 'MSFT', 'NVDA'] }) });
  const feed = createFeedService({ providers: [crypto, provider], topN: 20, pollIntervalMs: 10, logger: createLogger() });
  await feed.pollOnce();
  assert.deepEqual(feed.getSnapshot().assets.map((a) => a.id), ['bitcoin']);
});

test('the feed keeps the top N per asset type, so equities are not crowded out by crypto', () => {
  const candidate = (id, type, change) => ({ id, symbol: id.toUpperCase(), name: id, price: 1, change_24h: change, volume_24h: 1, asset_type: type, avg_volume_7d: null, sparkline_24h: [] });
  const cryptos = Array.from({ length: 25 }, (_, i) => candidate(`c${i}`, 'crypto', 10 + i));
  const equities = [candidate('equity:aapl', 'equity', 1), candidate('equity:msft', 'equity', 20)];

  const mixed = buildFeedSnapshot([...cryptos, ...equities], 20);
  assert.equal(mixed.filter((a) => a.asset_type === 'crypto').length, 20);
  assert.equal(mixed.filter((a) => a.asset_type === 'equity').length, 2);
  const scores = mixed.map((a) => a.momentum_score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));

  // Crypto only: identical to the previous behaviour.
  assert.deepEqual(buildFeedSnapshot(cryptos, 20), buildSnapshot(cryptos, 20));
  assert.equal('exchange' in buildSnapshot(cryptos, 1)[0], false);
});
