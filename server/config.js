const toInt = (value, fallback, min = 1) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function loadConfig(env = process.env) {
  return {
    port: toInt(env.PORT, 3001, 0),
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
      provider: env.EQUITIES_PROVIDER || '',
      apiKey: env.EQUITIES_API_KEY || '',
    },
    feed: {
      topN: 20,
      universeSize: toInt(env.UNIVERSE_SIZE, 20),
      pollIntervalMs: toInt(env.POLL_INTERVAL_MS, 10_000),
      volumeTtlMs: toInt(env.VOLUME_CACHE_TTL_MS, 60 * 60 * 1000),
      volumeRequestDelayMs: toInt(env.VOLUME_REQUEST_DELAY_MS, 2500, 0),
      heartbeatMs: 15_000,
      maxSseClients: toInt(env.MAX_SSE_CLIENTS, 200),
    },
  };
}
