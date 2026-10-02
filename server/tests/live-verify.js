// Live verification script for CoinGecko & Yahoo Finance APIs.
// Carefully designed to use the minimal number of requests (1 each) to avoid rate limits.
import { createCoinGeckoClient } from '../services/coingecko.js';
import { createYahooFinanceClient } from '../services/yahooFinance.js';

async function verifyLive() {
  console.log('=== STARTING LIVE VERIFICATION ===\n');

  // 1. CoinGecko client verification
  console.log('1. Testing CoinGecko client with live public API...');
  const cgClient = createCoinGeckoClient({
    baseUrl: 'https://api.coingecko.com/api/v3',
    apiKey: '',
    timeoutMs: 10_000,
  });

  try {
    // Single market coin (perPage: 1)
    console.log('Fetching /coins/markets (perPage: 1)...');
    const markets = await cgClient.fetchMarkets({ perPage: 1 });
    const btc = markets[0];
    console.log('✔ /coins/markets succeeded:');
    console.log('  - id:', btc.id);
    console.log('  - symbol:', btc.symbol);
    console.log('  - current_price:', btc.current_price);
    console.log('  - price_change_percentage_24h:', btc.price_change_percentage_24h);
    console.log('  - total_volume:', btc.total_volume);
    console.log('  - sparkline points count:', btc.sparkline_in_7d?.price?.length);

    // Single market_chart
    console.log('\nFetching /coins/bitcoin/market_chart (7 days)...');
    const volumeHistory = await cgClient.fetchVolumeHistory('bitcoin');
    console.log('✔ /coins/{id}/market_chart succeeded:');
    console.log('  - total_volumes sample count:', volumeHistory.length);
    console.log('  - sample volume entry:', volumeHistory[0]);

    // Test new coins endpoint behavior on Free/Demo tier
    console.log('\nTesting CoinGecko /coins/list/new endpoint on Free/Demo tier...');
    try {
      await cgClient.fetchNewCoins();
      console.log('✔ /coins/list/new succeeded unexpectedly (paid plan active)');
    } catch (err) {
      console.log('✔ /coins/list/new correctly threw expected paid-plan error:');
      console.log('  - HTTP status:', err.status);
      console.log('  - Message:', err.message);
      console.log('  - Note: Pro/Analyst subscription required for this endpoint.');
    }
  } catch (err) {
    console.error('✖ CoinGecko live test encountered an error:', err.message);
  }

  // 2. Yahoo Finance client verification
  console.log('\n2. Testing Yahoo Finance client with live chart API...');
  const yClient = createYahooFinanceClient({
    baseUrl: 'https://query1.finance.yahoo.com',
    timeoutMs: 10_000,
  });

  try {
    console.log('Fetching AAPL quote (1d range, 15m interval)...');
    const quote = await yClient.fetchQuote('AAPL');
    console.log('✔ Yahoo Finance fetchQuote succeeded:');
    console.log('  - symbol:', quote.symbol);
    console.log('  - name:', quote.name);
    console.log('  - price:', quote.price);
    console.log('  - previousClose:', quote.previousClose);
    console.log('  - volume:', quote.volume);
    console.log('  - currency:', quote.currency);
    console.log('  - regularSession:', quote.regularSession);
    console.log('  - intraday closes count:', quote.intradayCloses.length);

    console.log('\nFetching AAPL daily history (1mo range, 1d interval)...');
    const history = await yClient.fetchDailyHistory('AAPL');
    console.log('✔ Yahoo Finance fetchDailyHistory succeeded:');
    console.log('  - daily bars count:', history.bars.length);
    console.log('  - sample bar:', history.bars[0]);
  } catch (err) {
    console.error('✖ Yahoo Finance live test encountered an error:', err.message);
  }

  console.log('\n=== LIVE VERIFICATION COMPLETE ===');
}

verifyLive();
