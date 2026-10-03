import { UpstreamError } from '../coingecko.js';

const AVERAGE_SESSIONS = 7;
const MAX_CONCURRENCY = 3;
// A symbol whose refresh fails keeps its last good quote this long, then drops out.
const MAX_STALE_MS = 30 * 60 * 1000;

const round = (value, digits = 4) => Number(value.toFixed(digits));

/**
 * Dollar volume (shares x close) of the last 7 completed sessions, as [[ts, volume]] points
 * for the shared volume cache. Today's bar is skipped while its session is still trading,
 * because its volume is only partial. Dollar volume keeps volume_24h in USD, the same unit
 * as CoinGecko's volumes (the UI formats it as USD).
 */
export function recentSessionDollarVolumes({ bars, regularSession }, nowMs) {
  const sessionOpen = regularSession && nowMs >= regularSession.start && nowMs < regularSession.end;
  return bars
    .filter((bar) => !(sessionOpen && bar.ts >= regularSession.start))
    .filter((bar) => bar.volume !== null && bar.volume > 0)
    .slice(-AVERAGE_SESSIONS)
    .map((bar) => [bar.ts, round(bar.volume * bar.close, 2)]);
}

/** Quote -> provider candidate (same shape as the crypto provider's). Null if unusable. */
export function toEquityCandidate(quote, avgVolume7d, logger) {
  if (quote.price === null || quote.price < 0) return null;
  if (quote.currency && quote.currency !== 'USD') {
    logger.warn('equity_skipped_non_usd', { symbol: quote.symbol, currency: quote.currency });
    return null;
  }

  const missing = [];
  let change = 0;
  if (quote.previousClose !== null && quote.previousClose > 0) {
    change = round(((quote.price - quote.previousClose) / quote.previousClose) * 100);
  } else {
    missing.push('previousClose');
  }
  if (quote.volume === null) missing.push('volume');
  if (!quote.name) missing.push('name');
  if (missing.length > 0) logger.warn('equity_quote_incomplete', { symbol: quote.symbol, missing });

  return {
    id: `equity:${quote.symbol}`,
    symbol: quote.symbol,
    name: quote.name ?? quote.symbol,
    exchange: quote.exchange,
    price: quote.price,
    // Change since the previous session's close: the equities equivalent of a 24h change.
    change_24h: change,
    volume_24h: Math.max(0, round((quote.volume ?? 0) * quote.price, 2)),
    sparkline_24h: quote.intradayCloses,
    // No 7-day intraday series is fetched for equities; an empty array keeps the UI from
    // labelling the 1-day series as 7 days.
    sparkline_7d: [],
    asset_type: 'equity',
    avg_volume_7d: avgVolume7d,
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Equities provider. Implements the provider interface in ./crypto.js. `client` is the
 * market-data manager (Alpha Vantage first, Yahoo Finance as fallback); every provider
 * returns the same quote/history shape, so nothing here depends on which one answered.
 * - Symbols come from EQUITIES_SYMBOLS; an empty list disables the provider (returns null).
 * - Quotes are refreshed every refreshMs while the US regular session is open and every
 *   closedRefreshMs otherwise (or at the next session open, if sooner). Between refreshes
 *   the last quotes are served, so the feed poll never hammers the providers.
 * - One failing symbol is logged and skipped; it keeps its last good quote for up to 30 min.
 * - Throws only when no symbol has usable data, so the feed keeps its last good equities.
 */
export function createEquitiesProvider({ config, client, volumeCache, logger, now = Date.now }) {
  const symbols = config.symbols ?? [];
  if (symbols.length === 0) {
    logger.info('equities_disabled', { reason: 'EQUITIES_SYMBOLS is empty' });
    return null;
  }

  const quotes = new Map(); // symbol -> { quote, fetchedAt }
  const failureCounts = new Map();
  let nextRefreshAt = 0;
  let marketOpen = null;

  function recordSymbolFailure(symbol, error) {
    const count = (failureCounts.get(symbol) ?? 0) + 1;
    failureCounts.set(symbol, count);
    if (count === 1 || count % 30 === 0) {
      logger.warn('equity_symbol_failed', { symbol, consecutiveFailures: count, reason: error?.message, status: error?.status });
    }
  }

  function scheduleNextRefresh(sessions) {
    const t = now();
    const open = sessions.some((s) => t >= s.start && t < s.end);
    if (open !== marketOpen) {
      logger.info('equities_market_state', { marketOpen: open });
      marketOpen = open;
    }
    if (open) {
      nextRefreshAt = t + config.refreshMs;
      return;
    }
    const upcomingOpen = Math.min(...sessions.map((s) => s.start).filter((start) => start > t));
    nextRefreshAt = Math.min(t + config.closedRefreshMs, upcomingOpen);
  }

  async function refresh() {
    volumeCache.refreshStale(symbols); // background; this refresh uses whatever is cached now

    const results = await mapWithConcurrency(symbols, MAX_CONCURRENCY, (symbol) => client.fetchQuote(symbol));
    const sessions = [];
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        quotes.set(symbol, { quote: { ...result.value, symbol }, fetchedAt: now() });
        if (result.value.regularSession) sessions.push(result.value.regularSession);
        if ((failureCounts.get(symbol) ?? 0) > 0) logger.info('equity_symbol_recovered', { symbol });
        failureCounts.set(symbol, 0);
      } else {
        recordSymbolFailure(symbol, result.reason);
      }
    });

    if (sessions.length > 0) scheduleNextRefresh(sessions);
    else nextRefreshAt = now() + config.refreshMs; // nothing usable: retry at the open-market pace
  }

  function currentCandidates() {
    const cutoff = now() - MAX_STALE_MS;
    const candidates = [];
    for (const symbol of symbols) {
      const entry = quotes.get(symbol);
      if (!entry || entry.fetchedAt < cutoff) continue;
      const candidate = toEquityCandidate(entry.quote, volumeCache.get(symbol), logger);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  return {
    name: 'equities',

    async fetchAssets() {
      if (now() >= nextRefreshAt) await refresh();
      const candidates = currentCandidates();
      if (candidates.length === 0) throw new UpstreamError('Market data providers returned no usable equities');
      return candidates;
    },
  };
}
