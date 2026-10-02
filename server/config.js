const toInt = (value, fallback, min = 1) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

/** Comma-separated tickers: trimmed, upper-cased, empty entries and duplicates removed. */
export const symbolList = (value) => [...new Set(list(value).map((symbol) => symbol.toUpperCase()))];

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function loadConfig(env = process.env) {
  return {
    port: toInt(env.PORT, 4000, 0),
    nodeEnv: env.NODE_ENV || 'development',
    corsOrigins: list(env.CORS_ORIGIN),
    coingecko: {
      baseUrl: env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
      apiKey: env.COINGECKO_API_KEY || '',
      timeoutMs: 8000,
    },
    supabase: {
      url: env.SUPABASE_URL || '',
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
      timeoutMs: 8000,
    },
    webhook: {
      secret: env.WTF_WEBHOOK_SECRET || '',
    },
    equities: {
      symbols: symbolList(env.EQUITIES_SYMBOLS),
      baseUrl: env.YAHOO_FINANCE_BASE_URL || 'https://query1.finance.yahoo.com',
      timeoutMs: 8000,
      refreshMs: toInt(env.EQUITIES_REFRESH_MS, 60_000),
      closedRefreshMs: toInt(env.EQUITIES_CLOSED_REFRESH_MS, 15 * 60 * 1000),
      historyTtlMs: toInt(env.EQUITIES_HISTORY_TTL_MS, 6 * 60 * 60 * 1000),
      historyRequestDelayMs: toInt(env.EQUITIES_HISTORY_REQUEST_DELAY_MS, 500, 0),
    },
    feed: {
      topN: 20,
      universeSize: toInt(env.UNIVERSE_SIZE, 20),
      pollIntervalMs: toInt(env.POLL_INTERVAL_MS, 60_000),
      volumeTtlMs: toInt(env.VOLUME_CACHE_TTL_MS, 21_600_000),
      volumeRequestDelayMs: toInt(env.VOLUME_REQUEST_DELAY_MS, 2500, 0),
      heartbeatMs: toInt(env.HEARTBEAT_MS, 30_000),
      maxSseClients: toInt(env.MAX_SSE_CLIENTS, 200),
    },
  };
}
