// The ONLY file that talks to Alpha Vantage. Implements the same client interface as
// yahooFinance.js (fetchQuote / fetchDailyHistory) and returns the same plain objects, so
// nothing outside this file depends on Alpha Vantage's response format.
//
// Alpha Vantage only accepts the key as the `apikey` query parameter. Request URLs are
// therefore never logged or put into error messages, and API notices are mapped to fixed
// messages instead of being echoed.
import { toFiniteNumber } from '../../shared/momentum.js';
import { UpstreamError } from './coingecko.js';

const NEW_YORK = 'America/New_York';
// Name/exchange/currency (OVERVIEW) never change during a session: one lookup per symbol,
// and a failed lookup is retried at most this often so it cannot eat the request quota.
const METADATA_RETRY_MS = 6 * 60 * 60 * 1000;

function newYorkOffsetMs(utcMs) {
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: NEW_YORK, timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMs))
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(zone ?? '');
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

/** 'YYYY-MM-DD' and 'HH:MM[:SS]' New York wall-clock time -> epoch ms (DST aware), or null. */
export function newYorkTimeToMs(date, time = '00:00:00') {
  const [y, mo, d] = String(date).split('-').map(Number);
  const [h, mi, s = 0] = String(time).split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!Number.isFinite(asUtc)) return null;
  // Second pass corrects the offset when the first guess lands across a DST switch.
  return asUtc - newYorkOffsetMs(asUtc - newYorkOffsetMs(asUtc));
}

/** US regular session (09:30-16:00 New York) of a trading day, same shape as Yahoo's. */
function regularSessionOf(date) {
  const start = newYorkTimeToMs(date, '09:30');
  const end = newYorkTimeToMs(date, '16:00');
  return start !== null && end !== null ? { start, end } : null;
}

/** Alpha Vantage answers most API errors with HTTP 200 and a message field. */
function apiError(fn, body) {
  if (typeof body?.['Error Message'] === 'string') {
    return /apikey/i.test(body['Error Message'])
      ? new UpstreamError('Alpha Vantage rejected the API key', { status: 401 })
      : new UpstreamError(`Alpha Vantage ${fn} has no data for the requested symbol`, { status: 404 });
  }
  const notice = body?.Information ?? body?.Note;
  if (typeof notice !== 'string') return null;
  if (/premium/i.test(notice)) return new UpstreamError(`Alpha Vantage ${fn} requires a premium plan`, { status: 403 });
  if (/rate limit|requests per|call frequency|spreading out/i.test(notice)) {
    return new UpstreamError('Alpha Vantage rate limit reached', { status: 429 });
  }
  if (/api ?key/i.test(notice)) return new UpstreamError('Alpha Vantage rejected the API key', { status: 401 });
  return new UpstreamError(`Alpha Vantage ${fn} returned an API notice`, { status: 503 });
}

/** Time-series object -> [[dateKey, row]] in ascending time order. */
const sortedEntries = (series) => Object.entries(series).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export function createAlphaVantageClient({ apiKey, baseUrl, timeoutMs }, fetchImpl = fetch) {
  const metadata = new Map(); // symbol -> { value, retryAt }

  async function request(fn, params) {
    const url = new URL(`${baseUrl.replace(/\/$/, '')}/query`);
    url.searchParams.set('function', fn);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    url.searchParams.set('apikey', apiKey);

    let response;
    try {
      response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError';
      throw new UpstreamError(timedOut ? `Alpha Vantage ${fn} request timed out` : `Alpha Vantage ${fn} network error`, { cause });
    }

    if (response.status === 429) {
      const retryAfter = toFiniteNumber(response.headers.get('retry-after'));
      throw new UpstreamError('Alpha Vantage rate limit reached', {
        status: 429,
        retryAfterMs: retryAfter !== null ? retryAfter * 1000 : undefined,
      });
    }
    if (!response.ok) {
      throw new UpstreamError(`Alpha Vantage ${fn} responded with HTTP ${response.status}`, { status: response.status });
    }

    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new UpstreamError(`Alpha Vantage ${fn} returned invalid JSON`, { cause });
    }
    if (!body || typeof body !== 'object') throw new UpstreamError(`Alpha Vantage ${fn} returned an unusable response`);
    const error = apiError(fn, body);
    if (error) throw error;
    return body;
  }

  /** Best effort: a missing name falls back to the symbol, exactly as with Yahoo. */
  async function fetchMetadata(symbol) {
    const cached = metadata.get(symbol);
    if (cached && (cached.value || Date.now() < cached.retryAt)) return cached.value;
    let value = null;
    try {
      const body = await request('OVERVIEW', { symbol });
      if (typeof body.Name === 'string' && body.Name) {
        value = { name: body.Name, exchange: body.Exchange || null, currency: body.Currency || null };
      }
    } catch {
      // Ignored: the quote itself is still usable without a display name.
    }
    metadata.set(symbol, { value, retryAt: Date.now() + METADATA_RETRY_MS });
    return value;
  }

  return {
    /**
     * Latest quote (GLOBAL_QUOTE) plus the latest session's 15-minute closes
     * (TIME_SERIES_INTRADAY). Both are required; otherwise this throws and the caller falls
     * back to the next provider, so a quote is never served without its sparkline.
     */
    async fetchQuote(symbol) {
      const quote = (await request('GLOBAL_QUOTE', { symbol }))['Global Quote'];
      const price = toFiniteNumber(quote?.['05. price']);
      if (!quote || typeof quote !== 'object' || price === null) {
        throw new UpstreamError(`Alpha Vantage has no quote for ${symbol}`, { status: 404 });
      }

      const intraday = await request('TIME_SERIES_INTRADAY', {
        symbol,
        interval: '15min',
        extended_hours: 'false',
        outputsize: 'compact',
      });
      const series = intraday['Time Series (15min)'];
      if (!series || typeof series !== 'object') {
        throw new UpstreamError(`Alpha Vantage has no intraday series for ${symbol}`, { status: 404 });
      }
      const rows = sortedEntries(series);
      const latestDay = rows.at(-1)?.[0].slice(0, 10);
      const intradayCloses = rows
        .filter(([ts]) => ts.startsWith(latestDay))
        .map(([, row]) => toFiniteNumber(row?.['4. close']))
        .filter((close) => close !== null);

      const day = typeof quote['07. latest trading day'] === 'string' ? quote['07. latest trading day'] : null;
      const meta = await fetchMetadata(symbol);
      return {
        symbol: typeof quote['01. symbol'] === 'string' ? quote['01. symbol'] : symbol,
        name: meta?.name ?? null,
        exchange: meta?.exchange ?? null,
        currency: meta?.currency ?? null,
        price,
        previousClose: toFiniteNumber(quote['08. previous close']),
        volume: toFiniteNumber(quote['06. volume']),
        marketTime: null, // GLOBAL_QUOTE carries the trading day only, not a timestamp
        regularSession: day ? regularSessionOf(day) : null,
        intradayCloses,
      };
    },

    /** Recent daily bars (TIME_SERIES_DAILY, compact) for the 7-session average volume. */
    async fetchDailyHistory(symbol) {
      const body = await request('TIME_SERIES_DAILY', { symbol, outputsize: 'compact' });
      const series = body['Time Series (Daily)'];
      if (!series || typeof series !== 'object') {
        throw new UpstreamError(`Alpha Vantage has no daily series for ${symbol}`, { status: 404 });
      }
      const rows = sortedEntries(series).slice(-30);
      const bars = rows
        .map(([date, row]) => ({
          // Session open, matching Yahoo's daily bar timestamps.
          ts: newYorkTimeToMs(date, '09:30'),
          close: toFiniteNumber(row?.['4. close']),
          volume: toFiniteNumber(row?.['5. volume']),
        }))
        .filter((bar) => bar.ts !== null && bar.close !== null);
      if (bars.length === 0) throw new UpstreamError(`Alpha Vantage daily series for ${symbol} was empty`, { status: 404 });
      return { bars, regularSession: regularSessionOf(rows.at(-1)[0]) };
    },
  };
}
