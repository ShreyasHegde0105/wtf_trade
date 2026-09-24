import { UpstreamError } from '../coingecko.js';
import { normalizeMarketCoin } from '../../utils/assets.js';

/**
 * Provider interface (also implemented by equities):
 *   { name: string, fetchAssets(): Promise<Candidate[]> }
 * A candidate is { id, symbol, name, price, change_24h, volume_24h, sparkline_24h,
 * asset_type: 'crypto' | 'equity', avg_volume_7d: number | null }.
 * Providers throw on failure; the feed keeps that provider's last good data.
 */
export function createCryptoProvider({ client, volumeCache, universeSize }) {
  return {
    name: 'coingecko',

    async fetchAssets() {
      const rows = await client.fetchMarkets({ perPage: universeSize });
      const coins = rows.map(normalizeMarketCoin).filter(Boolean);
      if (coins.length === 0) throw new UpstreamError('CoinGecko returned no usable assets');

      // Background refresh of expired 7d averages; this poll uses whatever is cached now.
      volumeCache.refreshStale(coins.map((coin) => coin.id));

      return coins.map((coin) => ({
        ...coin,
        asset_type: 'crypto',
        avg_volume_7d: volumeCache.get(coin.id),
      }));
    },
  };
}
