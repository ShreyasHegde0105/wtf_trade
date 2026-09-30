# Trading Companion App

A mobile-first, real-time dashboard that surfaces crypto assets (equities later) showing unusual momentum, based on 24h price movement and trading volume.

It is a **read-only, anonymous market feed**. It is not a trading platform, wallet, or blockchain app: there are no accounts, no database and no order execution.

## Architecture

```
CoinGecko (free tier)
      │  /coins/markets (every ~10s)      /coins/{id}/market_chart (hourly, per coin)
      ▼
server/services/coingecko.js  ── shared rate-limit backoff gate
      │
      ├─ providers/crypto.js ── uses cache/volumeCache.js (7-day avg volume, TTL 1h)
      ├─ providers/equities.js (placeholder, Week 3)
      ▼
server/services/feed.js  ── ONE shared polling loop, keeps last good data
      │                      scores with shared/momentum.js
      ├─► GET /api/feed/snapshot   (top 20, sorted by momentum_score)
      ├─► GET /api/feed/discovery  (trending, gainers, volume_spikes, new_listings)
      ├─► GET /api/feed/leaderboard (top 10 by momentum_score, with rank)
      └─► server/services/sseHub.js ─► GET /api/feed/stream (SSE, all clients share one poll)

React (Vite) ─ useMomentumFeed(): fetch snapshot → open EventSource → patch changed assets
              ─ useDiscovery(): fetch /api/feed/discovery every 5 min → DiscoveryRail
```

- `shared/momentum.js` holds the formula and thresholds once; the server scores with it and the UI uses it for badges.
- **FilterBar** (`src/components/FilterBar.jsx`) filters assets by momentum level (`All`, `Hot`, `Warming`, `Neutral`) using the shared momentum classifier, with sorting by Momentum, Price Change, or Volume. Active controls highlight in the brand accent (`#00E5C4`).
- **SearchBar** (`src/components/SearchBar.jsx`) provides case-insensitive search by asset name or symbol with a 300ms debounce to prevent layout thrashing on keystrokes, plus an accessible clear button when input is present.
- **AssetCard** (`src/components/AssetCard.jsx`) features:
  - 7-day hourly price sparkline rendered with Recharts (`MiniChart.jsx`, 80×40px, no axes/grid/dots/fill, `#00E5C4` for upward trend and `#FF4B4B` for downward trend).
  - Visual volume ratio progress bar displaying `volume_24h / avg_volume_7d` safely clamped (e.g. `1.8× avg`).
  - Watchlist star toggle (`★`/`☆`) with accessible labels and `aria-pressed`.
- **DiscoveryRail** (`src/components/DiscoveryRail.jsx`) displays four discovery categories (Trending, Gainers, Volume Spikes, New Listings) as compact horizontally-scrollable chip strips above the main feed. Clicking a chip filters the main grid to that asset via the shared search query. Refreshes every 5 minutes independently of the main polling loop.
- **WatchlistPanel** (`src/components/WatchlistPanel.jsx`, `src/hooks/useWatchlist.js`) provides persistent asset tracking stored in browser `localStorage` under the exact key `wtf_watchlist`. Watched assets reflect live price and 24h change updates pushed via the existing SSE feed without saving stale prices to storage. Users can toggle watched status via the star button on any `AssetCard` or remove assets directly with accessible remove buttons. Shows the exact empty-state message `Add assets to track them here` when empty.
  - **Desktop (> 900px):** Collapsible sidebar panel sitting alongside the 3-column asset grid.
  - **Mobile (< 600px):** Collapsible bottom drawer that stays compact when closed and slides up when expanded, with 1-column stacked asset cards.

## Tech stack

React 18, Vite, Recharts, Node.js (>= 22.9), Express, Server-Sent Events, CoinGecko free API. The only runtime backend dependency is `express`. Tests use Node's built-in test runner.

## Local setup

```bash
npm install
cp .env.example .env        # optional; everything has a default
```

Run the backend and the frontend in two terminals:

```bash
npm run dev:server          # http://localhost:3001
npm run dev:client          # http://localhost:5173 (proxies /api to :3001)
```

Other commands: `npm test`, `npm run build`, `npm start` (backend, production).

No network or hitting rate limits? `npm run dev:mock` starts a **synthetic** CoinGecko stand-in on port 4010 (`server/dev/mockCoingecko.js`). Run the backend with `COINGECKO_BASE_URL=http://localhost:4010` to use it. Its numbers are made up and only exist for development and tests.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Backend port |
| `NODE_ENV` | `development` | Environment name (logged only) |
| `COINGECKO_API_KEY` | empty | Optional free Demo key, sent as `x-cg-demo-api-key`. Never logged or returned to clients |
| `CORS_ORIGIN` | empty | Comma-separated allowed browser origins (`*` allowed). Empty = same-origin only |
| `COINGECKO_BASE_URL` | public CoinGecko v3 | Override, e.g. to use the mock |
| `POLL_INTERVAL_MS` | `10000` | Delay between upstream polls |
| `UNIVERSE_SIZE` | `20` | Number of top-market-cap coins scored. Keep it at 20 (see limitations) |
| `MAX_SSE_CLIENTS` | `200` | Max concurrent SSE connections |
| `VOLUME_CACHE_TTL_MS` | `3600000` | Freshness of the 7-day average volume |
| `VOLUME_REQUEST_DELAY_MS` | `2500` | Spacing between historical-volume requests |
| `EQUITIES_PROVIDER`, `EQUITIES_API_KEY` | empty | Reserved for the Week 3 equities provider |
| `VITE_API_BASE_URL` | empty | Frontend, build-time: backend origin when deployed. Empty locally |

## Where to plug in real APIs

- **CoinGecko (backend):** everything lives in `server/services/coingecko.js` (URLs, params, auth header). Put your key in `.env` as `COINGECKO_API_KEY`. Pro keys use a different header and base URL: change them in that file.
- **Equities (backend):** implement `createEquitiesProvider` in `server/services/providers/equities.js`. The file documents the exact interface. Nothing else needs to change.
- **Frontend:** all network calls are in `src/services/api.js`.

## API

### `GET /api/feed/snapshot`

Top 20 assets sorted by `momentum_score` descending. `503` with `{ "error": "..." }` and `Retry-After` until the first successful poll.

```json
{
  "assets": [
    {
      "id": "solana",
      "symbol": "SOL",
      "name": "Solana",
      "price": 150.06,
      "change_24h": 8.15,
      "volume_24h": 5740369437.2,
      "momentum_score": 3.261,
      "asset_type": "crypto",
      "sparkline_24h": [151.7, 151.2, "...24 prices"]
    }
  ]
}
```

The first seven fields are the brief's contract. **Two additive fields** were added so the UI can work without extra requests: `asset_type` (`"crypto"` | `"equity"`, drives the filter) and `sparkline_24h` (last 24 hourly prices for the mini chart; may be empty). `change_24h` is a percentage (`8.15` = +8.15%). `momentum_score` is rounded to 4 decimals.

### `GET /api/feed/discovery`

Curated discovery categories derived from the current snapshot. No additional CoinGecko requests are made. `503` until the first successful poll.

```json
{
  "trending": [{ "id": "solana", "...same asset shape..." }],
  "gainers": [{ "id": "bitcoin", "...same asset shape..." }],
  "volume_spikes": [{ "id": "ethereum", "...same asset shape..." }],
  "new_listings": []
}
```

| Category | Logic | Max |
| --- | --- | --- |
| `trending` | Top assets by `momentum_score` descending | 5 |
| `gainers` | Top assets with positive `change_24h`, sorted descending | 5 |
| `volume_spikes` | Top assets by `volume_24h / avg_volume_7d` descending | 5 |
| `new_listings` | Empty until a listing-date source is available (see note below) | 5 |

**`new_listings` note:** The existing architecture polls CoinGecko `/coins/markets` sorted by market cap, which does not provide listing dates. Rather than fabricating data, this category returns an empty array. It will be populated when a listing-date source (e.g. CoinGecko Pro `/coins/new`) is integrated.

### `GET /api/feed/leaderboard`

Top 10 assets by `momentum_score` with sequential rank numbers. `503` until the first successful poll.

```json
{
  "leaderboard": [
    {
      "rank": 1,
      "id": "solana",
      "symbol": "SOL",
      "name": "Solana",
      "price": 150.06,
      "change_24h": 8.15,
      "volume_24h": 5740369437.2,
      "momentum_score": 3.261,
      "asset_type": "crypto",
      "sparkline_24h": [151.7, 151.2, "...24 prices"]
    }
  ]
}
```

### `GET /api/feed/stream` (SSE)

`Content-Type: text/event-stream`. Every event is a default `message` event whose `data` is **one asset** (same shape as above):

```
data: {"id":"solana","symbol":"SOL","name":"Solana","price":150.06,...}
```

- On connect the current snapshot is sent immediately (one event per asset), then all assets again after every successful upstream poll (about every 10s, measured from the end of the previous poll, so slightly more than 10s).
- If a poll fails, nothing is sent and the last good data is kept.
- `: ping` comment lines are sent every 15s while clients are connected, and `retry: 5000` is sent on connect.

### `GET /api/health`

`{ "status": "ok", "hasSnapshot": true, "updatedAt": "...", "sseClients": 1 }`, for uptime checks.

## Momentum score

```
momentum_score = abs(price_change_24h) * 0.4 + (volume_24h / avg_volume_7d) * 0.6
```

`price_change_24h` is the 24h change in percent. Classification (`shared/momentum.js`):

| Score | Label |
| --- | --- |
| `> 1.5` | Hot |
| `1.0` to `1.5` | Warming |
| `< 1.0` | Neutral |

Missing, non-numeric or non-finite inputs count as 0. If `avg_volume_7d` is missing or 0, the volume term is 0 (never a division by zero). The UI always shows the label as text next to the colour.

## Caching

- The 7-day average volume comes from `/coins/{id}/market_chart?days=7` (mean of the hourly rolling-24h volume samples) and is cached **in memory for 1 hour** per coin.
- Only expired coins are refreshed, one at a time, spaced by `VOLUME_REQUEST_DELAY_MS`, in a single background batch. Concurrent triggers join the running batch.
- A stale value keeps being used until a refresh succeeds. A failed coin is retried after a cooldown (60s, or the rate-limit wait).
- The cache is lost on restart, so the first ~minute after boot has no averages yet (see limitations).

## Error handling

- **Rate limits (429):** honours `Retry-After`, then exponential backoff (30s doubling to 5 min) shared by every CoinGecko call, so no retry storms.
- **Malformed rows / bad numbers:** rows without id, name, symbol or a valid price are dropped; NaN/Infinity never reach clients.
- **Upstream down or timeout (8s):** the last good snapshot is kept and served; the failure is logged (first occurrence, then every 30th, plus a recovery message).
- **SSE:** clients are removed on disconnect, slow clients are dropped, connections are capped, one shared poll serves everyone.
- **Frontend:** skeleton while loading, retry with backoff if the snapshot fails, "reconnecting" notice while keeping last known prices, empty-search and no-equities messages, and a placeholder if chart data is missing.
- Errors returned to clients are generic JSON; stack traces and keys are never exposed or logged.

## Testing

```bash
npm test
```

Covers the momentum formula and thresholds, zero/missing/malformed data, the snapshot transformation and sorting, the volume cache (TTL, single flight, stale-on-failure, rate limit), the CoinGecko client (429 backoff, malformed payloads), the feed service (last-good retention, no overlapping polls), an integration test of both endpoints against the mock (including SSE cleanup), and the client-side filter / sort / search / sanitising helpers. Component rendering was checked manually in a headless browser at 375px, 768px and 1280px widths but is not covered by automated tests.

### Try the SSE endpoint with curl

```bash
curl -N http://localhost:3001/api/feed/stream
```

You should see a burst of `data:` lines right away and another burst roughly every 10s while CoinGecko keeps responding. Use your `PORT` if you changed it.

## Deployment

- **Frontend → Vercel.** Import the repo, framework "Vite" (build `npm run build`, output `dist`). Set `VITE_API_BASE_URL` to the backend URL.
- **Backend → Railway** (or any long-running Node host). Start command `npm start`, set `CORS_ORIGIN` to the Vercel URL, optionally `COINGECKO_API_KEY`.
- The backend is deliberately **not** deployed as a Vercel serverless function: SSE needs long-lived connections and a single shared poller, which serverless functions do not provide. Keep frontend and backend separate.

## Known limitations

- **Verified against a mock, not live CoinGecko.** Live behaviour (real rate limits, response quirks) still needs a run on a machine with internet access.
- **Cold start:** until a coin's 7-day average has loaded (about 50s for 20 coins with the default delay), its volume term is 0, so scores are lower than they will be.
- The formula uses the percentage change directly, so the price term dominates the volume term; that is the v1 brief formula and was not altered.
- CoinGecko free tier limits are strict and its data updates every 1-5 minutes, so many 10s polls return unchanged numbers; a Demo API key helps with limits.
- If `UNIVERSE_SIZE` is raised above 20, assets that drop out of the top 20 stay on screen until reload (the client merges updates and does not prune).
- Equities are not implemented (no provider configured); the Equities filter shows an explanatory message.
- "Price Change" sorts by signed 24h change, biggest gainers first.
- Fonts load from Google Fonts; without network the system fallbacks are used.
