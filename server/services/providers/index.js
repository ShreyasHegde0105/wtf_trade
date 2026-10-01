import { createCryptoProvider } from './crypto.js';
import { createEquitiesProvider } from './equities.js';

export function createProviders({ config, client, volumeCache, logger }) {
  const cryptoProvider = createCryptoProvider({
    client,
    volumeCache,
    universeSize: config.feed.universeSize,
  });

  return [
    cryptoProvider,
    createEquitiesProvider({ config: config.equities, logger }),
  ].filter(Boolean);
}
