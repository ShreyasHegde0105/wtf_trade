import { UpstreamError } from './coingecko.js';

/** Default priority. MARKET_DATA_PROVIDER moves one of them to the front; the rest keep this order. */
export const MARKET_PROVIDER_ORDER = ['alpha_vantage', 'yahoo_finance', 'coingecko'];

/** MARKET_DATA_PROVIDER value -> full provider order, primary first. Unknown values fall back to the default. */
export function resolveProviderOrder(primary, logger) {
  const wanted = String(primary ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!wanted) return [...MARKET_PROVIDER_ORDER];
  if (!MARKET_PROVIDER_ORDER.includes(wanted)) {
    logger.warn('market_provider_invalid', { value: wanted, using: MARKET_PROVIDER_ORDER[0] });
    return [...MARKET_PROVIDER_ORDER];
  }
  return [wanted, ...MARKET_PROVIDER_ORDER.filter((name) => name !== wanted)];
}

// Statuses that say "stop calling this provider for a while" on the first occurrence:
// rate limit, rejected key, endpoint not in the plan.
const IMMEDIATE_COOLDOWN = new Set([401, 403, 429]);
// The provider is up but lacks this one asset: fall back for this call, no cooldown.
const ASSET_LEVEL = new Set([404]);

/**
 * Ordered fallback over market-data clients that share a method interface (e.g.
 * fetchQuote / fetchDailyHistory). Returns an object with those methods, so it drops in
 * wherever a single client was used.
 *
 * - Providers are tried strictly in the given order; a provider that does not implement a
 *   method is skipped for it (CoinGecko has no equity endpoints).
 * - Any error moves on to the next provider. Rate limits / auth / plan errors put the
 *   provider into cooldown at once; timeouts, network, 5xx and malformed responses after
 *   failureThreshold consecutive failures. Missing data for one asset (404) never does.
 * - When every provider fails (or is cooling down) it throws an UpstreamError, and the
 *   callers' existing last-good-data handling takes over.
 */
export function createMarketDataManager({ sources, methods, logger, cooldownMs, failureThreshold = 3, now = Date.now }) {
  const state = new Map(sources.map(({ name }) => [name, { failures: 0, cooldownUntil: 0 }]));
  const lastSelected = new Map(); // method -> first provider in line
  const lastServed = new Map(); // method -> provider that answered last

  const chains = new Map(
    methods.map((method) => [method, sources.filter(({ client }) => typeof client?.[method] === 'function')]),
  );
  for (const method of methods) {
    logger.info('market_provider_chain', {
      method,
      providers: chains.get(method).map(({ name }) => name),
      unsupported: sources.filter((source) => !chains.get(method).includes(source)).map(({ name }) => name),
    });
  }

  function onSuccess(name, method, fellBack) {
    const entry = state.get(name);
    entry.failures = 0;
    if (entry.cooldownUntil > 0) {
      entry.cooldownUntil = 0;
      logger.info('market_provider_recovered', { provider: name });
    }
    if (fellBack || lastServed.get(method) !== name) logger.info('market_provider_success', { provider: name, method });
    lastServed.set(method, name);
  }

  function onFailure(name, method, symbol, error) {
    const status = error?.status;
    logger.warn('market_provider_failed', { provider: name, method, symbol, status, reason: error?.message });
    if (ASSET_LEVEL.has(status)) return;

    const entry = state.get(name);
    if (entry.cooldownUntil > now()) return; // a concurrent call already started the cooldown
    entry.failures += 1;
    if (!IMMEDIATE_COOLDOWN.has(status) && entry.failures < failureThreshold) return;

    const wait = Math.max(error?.retryAfterMs ?? 0, cooldownMs);
    entry.cooldownUntil = now() + wait;
    entry.failures = 0;
    logger.warn('market_provider_cooldown', { provider: name, cooldownMs: wait, status, reason: error?.message });
  }

  async function call(method, args) {
    const chain = chains.get(method);
    const available = chain.filter(({ name }) => state.get(name).cooldownUntil <= now());
    const symbol = typeof args[0] === 'string' ? args[0] : undefined;

    if (available.length === 0) {
      const waits = chain.map(({ name }) => state.get(name).cooldownUntil - now());
      throw new UpstreamError(`No market data provider available for ${method}`, {
        status: chain.length > 0 ? 429 : undefined,
        retryAfterMs: waits.length > 0 ? Math.max(0, Math.min(...waits)) : undefined,
      });
    }

    if (lastSelected.get(method) !== available[0].name) {
      logger.info('market_provider_selected', { provider: available[0].name, method });
      lastSelected.set(method, available[0].name);
    }

    let lastError;
    for (const [index, { name, client }] of available.entries()) {
      if (index > 0) logger.warn('market_provider_fallback', { from: available[index - 1].name, to: name, method, symbol });
      try {
        const value = await client[method](...args);
        onSuccess(name, method, index > 0);
        return value;
      } catch (error) {
        lastError = error;
        onFailure(name, method, symbol, error);
      }
    }
    throw new UpstreamError(`All market data providers failed for ${method}`, {
      status: lastError?.status,
      retryAfterMs: lastError?.retryAfterMs,
      cause: lastError,
    });
  }

  const client = Object.fromEntries(methods.map((method) => [method, (...args) => call(method, args)]));
  return {
    ...client,
    /** Providers that can currently be tried for a method, in order (for logs and tests). */
    availableProviders: (method) => (chains.get(method) ?? []).filter(({ name }) => state.get(name).cooldownUntil <= now()).map(({ name }) => name),
  };
}
