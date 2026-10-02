import { createVolumeCache } from '../../cache/volumeCache.js';
import { createYahooFinanceClient } from '../yahooFinance.js';
import { createCryptoProvider } from './crypto.js';
import { createEquitiesProvider, recentSessionDollarVolumes } from './equities.js';

export function createProviders({ config, client, volumeCache, logger, fetchImpl }) {
  const cryptoProvider = createCryptoProvider({
    client,
    volumeCache,
    universeSize: config.feed.universeSize,
  });

  return [cryptoProvider, createEquities({ config: config.equities, logger, fetchImpl })].filter(Boolean);
}

function createEquities({ config, logger, fetchImpl }) {
  if (config.symbols.length === 0) return createEquitiesProvider({ config, logger }); // logs + null
  const yahoo = createYahooFinanceClient(config, fetchImpl);
  // Same cache as crypto's 7d average volume, fed with daily Yahoo bars (TTL: historyTtlMs).
  const equityVolumeCache = createVolumeCache({
    fetchVolumeHistory: async (symbol) => recentSessionDollarVolumes(await yahoo.fetchDailyHistory(symbol), Date.now()),
    ttlMs: config.historyTtlMs,
    requestDelayMs: config.historyRequestDelayMs,
    logger,
  });
  return createEquitiesProvider({ config, client: yahoo, volumeCache: equityVolumeCache, logger });
}
