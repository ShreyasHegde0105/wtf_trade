import { createCryptoProvider } from './crypto.js';
import { createEquitiesProvider } from './equities.js';

export function createProviders({ config, client, volumeCache, logger }) {
  return [
    createCryptoProvider({ client, volumeCache, universeSize: config.feed.universeSize }),
    createEquitiesProvider({ config: config.equities, logger }),
  ].filter(Boolean);
}
