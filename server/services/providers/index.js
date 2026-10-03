import { createVolumeCache } from '../../cache/volumeCache.js';
import { createAlphaVantageClient } from '../alphaVantage.js';
import { createMarketDataManager, resolveProviderOrder } from '../marketDataManager.js';
import { createYahooFinanceClient } from '../yahooFinance.js';
import { createCryptoProvider } from './crypto.js';
import { createEquitiesProvider, recentSessionDollarVolumes } from './equities.js';

export function createProviders({ config, client, volumeCache, logger, fetchImpl }) {
  // Crypto stays on CoinGecko: Alpha Vantage and Yahoo have no equivalent of /coins/markets
  // (a market-cap ranked universe with USD 24h volume and a 7d hourly sparkline).
  logger.info('market_provider_chain', { method: 'fetchMarkets', providers: ['coingecko'], unsupported: ['alpha_vantage', 'yahoo_finance'] });
  const cryptoProvider = createCryptoProvider({
    client,
    volumeCache,
    universeSize: config.feed.universeSize,
  });

  return [cryptoProvider, createEquities({ config, coingecko: client, logger, fetchImpl })].filter(Boolean);
}

/** Equity data client: Alpha Vantage -> Yahoo Finance -> CoinGecko (by MARKET_DATA_PROVIDER order). */
export function createEquitiesMarketData({ config, coingecko, logger, fetchImpl }) {
  const marketData = config.marketData ?? {};
  const clients = {
    alpha_vantage: config.alphaVantage?.apiKey ? createAlphaVantageClient(config.alphaVantage, fetchImpl) : null,
    yahoo_finance: createYahooFinanceClient(config.equities, fetchImpl),
    // No equity endpoints: listed so the order is explicit; the manager skips it for equities.
    coingecko,
  };
  if (!clients.alpha_vantage) {
    logger.warn('market_provider_unavailable', { provider: 'alpha_vantage', reason: 'ALPHA_VANTAGE_API_KEY not set' });
  }

  const sources = resolveProviderOrder(marketData.provider, logger)
    .filter((name) => clients[name])
    .map((name) => ({ name, client: clients[name] }));
  return createMarketDataManager({
    sources,
    methods: ['fetchQuote', 'fetchDailyHistory'],
    logger,
    cooldownMs: marketData.cooldownMs ?? 5 * 60 * 1000,
    failureThreshold: marketData.failureThreshold ?? 3,
  });
}

function createEquities({ config, coingecko, logger, fetchImpl }) {
  const equities = config.equities;
  if (equities.symbols.length === 0) return createEquitiesProvider({ config: equities, logger }); // logs + null
  const marketData = createEquitiesMarketData({ config, coingecko, logger, fetchImpl });
  // Same cache as crypto's 7d average volume, fed with daily bars (TTL: historyTtlMs).
  const equityVolumeCache = createVolumeCache({
    fetchVolumeHistory: async (symbol) => recentSessionDollarVolumes(await marketData.fetchDailyHistory(symbol), Date.now()),
    ttlMs: equities.historyTtlMs,
    requestDelayMs: equities.historyRequestDelayMs,
    logger,
  });
  return createEquitiesProvider({ config: equities, client: marketData, volumeCache: equityVolumeCache, logger });
}
