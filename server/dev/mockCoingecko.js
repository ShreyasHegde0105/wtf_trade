// Local development / test fixture that mimics the two CoinGecko endpoints this app uses.
// The numbers are synthetic and only exist so the app can run without network access or
// an API key. Start it with `npm run dev:mock` and set
// COINGECKO_BASE_URL=http://localhost:4010 for the backend.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COINS = [
  ['bitcoin', 'btc', 'Bitcoin', 65000, 2.1, 30e9],
  ['ethereum', 'eth', 'Ethereum', 3200, -4.8, 21e9],
  ['solana', 'sol', 'Solana', 150, 7.9, 6e9],
  ['ripple', 'xrp', 'XRP', 0.52, 0.4, 1.2e9],
  ['dogecoin', 'doge', 'Dogecoin', 0.12, -1.1, 0.9e9],
];

function marketRow([id, symbol, name, price, change, volume], tick) {
  const wobble = 1 + Math.sin(tick + price) * 0.002;
  const base = price * wobble;
  return {
    id,
    symbol,
    name,
    current_price: base,
    price_change_percentage_24h: change + Math.sin(tick) * 0.3,
    total_volume: volume * (1 + Math.cos(tick + change) * 0.05),
    sparkline_in_7d: {
      price: Array.from({ length: 168 }, (_, i) => base * (1 + Math.sin(i / 9 + price) * 0.02)),
    },
  };
}

export function createMockCoinGecko() {
  let tick = 0;
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/coins/markets') {
      tick += 1;
      const limit = Number(url.searchParams.get('per_page')) || COINS.length;
      return send(200, COINS.slice(0, limit).map((coin) => marketRow(coin, tick)));
    }

    const match = url.pathname.match(/^\/coins\/([^/]+)\/market_chart$/);
    const coin = match && COINS.find(([id]) => id === match[1]);
    if (coin) {
      const now = Date.now();
      const volume = coin[5];
      return send(200, {
        total_volumes: Array.from({ length: 168 }, (_, i) => [
          now - (167 - i) * 3_600_000,
          volume * (0.6 + 0.4 * Math.abs(Math.sin(i / 7))),
        ]),
      });
    }
    return send(404, { error: 'not found' });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MOCK_PORT) || 4010;
  createMockCoinGecko().listen(port, () => process.stdout.write(`Mock CoinGecko on :${port}\n`));
}
