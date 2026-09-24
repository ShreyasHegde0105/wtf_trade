// The ONLY file that talks to CoinGecko. To change endpoints, auth or base URL, edit here.
// Free-tier friendly: one shared backoff gate is honoured by every request.

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const INITIAL_BACKOFF_MS = 30 * 1000;

export class UpstreamError extends Error {
  constructor(message, { status, retryAfterMs, cause } = {}) {
    super(message, { cause });
    this.name = 'UpstreamError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfter(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function createCoinGeckoClient({ baseUrl, apiKey, timeoutMs }, fetchImpl = fetch) {
  let blockedUntil = 0;
  let backoffMs = 0;

  async function request(path, params) {
    const remaining = blockedUntil - Date.now();
    if (remaining > 0) {
      throw new UpstreamError('CoinGecko backoff active after rate limit', {
        status: 429,
        retryAfterMs: remaining,
      });
    }

    const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    // Demo (free) keys use x-cg-demo-api-key. Pro keys need a different header and base URL.
    const headers = { accept: 'application/json' };
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

    let response;
    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError';
      throw new UpstreamError(timedOut ? 'CoinGecko request timed out' : 'CoinGecko network error', {
        cause,
      });
    }

    if (response.status === 429) {
      backoffMs = Math.min(backoffMs ? backoffMs * 2 : INITIAL_BACKOFF_MS, MAX_BACKOFF_MS);
      const wait = Math.max(parseRetryAfter(response.headers.get('retry-after')) ?? 0, backoffMs);
      blockedUntil = Date.now() + wait;
      throw new UpstreamError('CoinGecko rate limit reached', { status: 429, retryAfterMs: wait });
    }
    if (!response.ok) {
      throw new UpstreamError(`CoinGecko responded with HTTP ${response.status}`, {
        status: response.status,
      });
    }

    backoffMs = 0;
    try {
      return await response.json();
    } catch (cause) {
      throw new UpstreamError('CoinGecko returned invalid JSON', { cause });
    }
  }

  return {
    /** Top coins by market cap, with 7d hourly sparkline. One request covers the whole universe. */
    async fetchMarkets({ perPage }) {
      const data = await request('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: perPage,
        page: 1,
        sparkline: true,
        price_change_percentage: '24h',
      });
      if (!Array.isArray(data)) throw new UpstreamError('CoinGecko markets response was not a list');
      return data;
    },

    /** Returns [[timestamp, volume], ...] covering the last 7 days for one coin. */
    async fetchVolumeHistory(id) {
      const data = await request(`/coins/${encodeURIComponent(id)}/market_chart`, {
        vs_currency: 'usd',
        days: 7,
      });
      if (!Array.isArray(data?.total_volumes)) {
        throw new UpstreamError('CoinGecko market_chart response had no total_volumes');
      }
      return data.total_volumes;
    },
  };
}
