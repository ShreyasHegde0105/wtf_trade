// The ONLY file that talks to Yahoo Finance. Uses the public v8 chart endpoint (no key, no
// cookie/crumb; the v7 quote endpoint needs one and answers 401). Returns plain objects so
// nothing outside this file depends on Yahoo's response format.
import { toFiniteNumber } from '../../shared/momentum.js';
import { UpstreamError } from './coingecko.js';

const DEFAULT_BACKOFF_MS = 5 * 60 * 1000;
// Yahoo rejects requests without a browser-like User-Agent.
const USER_AGENT = 'Mozilla/5.0 (compatible; wtf-trading-companion/1.0)';

const toMs = (seconds) => {
  const n = toFiniteNumber(seconds);
  return n === null ? null : n * 1000;
};

function parsePeriod(period) {
  const start = toMs(period?.start);
  const end = toMs(period?.end);
  return start !== null && end !== null ? { start, end } : null;
}

/** [{ ts, close, volume }] from a chart result; rows without a finite close are dropped. */
function parseBars(result) {
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const volumes = Array.isArray(quote.volume) ? quote.volume : [];
  return timestamps
    .map((ts, i) => ({ ts: toMs(ts), close: toFiniteNumber(closes[i]), volume: toFiniteNumber(volumes[i]) }))
    .filter((bar) => bar.ts !== null && bar.close !== null);
}

export function createYahooFinanceClient({ baseUrl, timeoutMs }, fetchImpl = fetch) {
  let blockedUntil = 0;

  async function fetchChart(symbol, params) {
    const remaining = blockedUntil - Date.now();
    if (remaining > 0) {
      throw new UpstreamError('Yahoo Finance backoff active after rate limit', { status: 429, retryAfterMs: remaining });
    }

    const url = new URL(`${baseUrl.replace(/\/$/, '')}/v8/finance/chart/${encodeURIComponent(symbol)}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError';
      throw new UpstreamError(timedOut ? 'Yahoo Finance request timed out' : 'Yahoo Finance network error', { cause });
    }

    if (response.status === 429) {
      const retryAfter = toFiniteNumber(response.headers.get('retry-after'));
      const wait = retryAfter !== null ? retryAfter * 1000 : DEFAULT_BACKOFF_MS;
      blockedUntil = Date.now() + wait;
      throw new UpstreamError('Yahoo Finance rate limit reached', { status: 429, retryAfterMs: wait });
    }

    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new UpstreamError(`Yahoo Finance returned invalid JSON (HTTP ${response.status})`, { status: response.status, cause });
    }
    const result = body?.chart?.result?.[0];
    if (!response.ok || !result) {
      const reason = body?.chart?.error?.description ?? `HTTP ${response.status}`;
      throw new UpstreamError(`Yahoo Finance chart for ${symbol} failed: ${reason}`, { status: response.status });
    }
    return result;
  }

  return {
    /** Latest quote plus today's (or the most recent session's) 15-minute closes. */
    async fetchQuote(symbol) {
      const result = await fetchChart(symbol, { range: '1d', interval: '15m' });
      const meta = result.meta ?? {};
      return {
        symbol: typeof meta.symbol === 'string' ? meta.symbol : symbol,
        name: meta.longName || meta.shortName || null,
        exchange: meta.fullExchangeName || meta.exchangeName || null,
        currency: meta.currency ?? null,
        price: toFiniteNumber(meta.regularMarketPrice),
        previousClose: toFiniteNumber(meta.chartPreviousClose ?? meta.previousClose),
        volume: toFiniteNumber(meta.regularMarketVolume),
        marketTime: toMs(meta.regularMarketTime),
        regularSession: parsePeriod(meta.currentTradingPeriod?.regular),
        intradayCloses: parseBars(result).map((bar) => bar.close),
      };
    },

    /** About one month of daily bars, for the 7-session average volume. */
    async fetchDailyHistory(symbol) {
      const result = await fetchChart(symbol, { range: '1mo', interval: '1d' });
      return {
        bars: parseBars(result),
        regularSession: parsePeriod(result.meta?.currentTradingPeriod?.regular),
      };
    },
  };
}
