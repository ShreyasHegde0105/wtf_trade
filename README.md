# Trading Companion App

A mobile-first, real-time dashboard that surfaces crypto assets and US equities showing unusual momentum, based on 24h price movement and trading volume.

It is a **read-only, anonymous market feed**. It is not a trading platform, wallet, or blockchain app: there are no accounts and no order execution. Market data and scoring-engine output are persisted to Supabase (optional; without it the feed runs fully in memory).

## Architecture

```
CoinGecko (free tier)
      │  /coins/markets (every ~10s)      /coins/{id}/market_chart (hourly, per coin)
      ▼
server/services/coingecko.js  ── shared rate-limit backoff gate
      │
      ├─ providers/crypto.js ── uses cache/volumeCache.js (7-day avg volume, TTL 1h)
      │
Yahoo Finance (public v8 chart API, no key)
      │  chart range=1d/15m per symbol (60s while open, 15 min while closed)
      │  chart range=1mo/1d per symbol (7-session avg volume, TTL 6h)
      ▼
server/services/yahooFinance.js ── 429 backoff gate
      ├─ providers/equities.js ── same volumeCache, ids `equity:<TICKER>`
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
- **DiscoveryRail** (`src/components/DiscoveryRail.jsx`, `src/utils/discovery.js`) displays a tab-style discovery strip with four categories: **Trending**, **Gainers**, **Volume Spikes**, and **New Listings**. Only the active category's assets are displayed as horizontally scrollable chips. Clicking a chip filters the main grid to that asset via the shared search query. Refreshes every 5 minutes independently of the main polling loop.
- **WatchlistPanel** (`src/components/WatchlistPanel.jsx`, `src/hooks/useWatchlist.js`) provides persistent asset tracking stored in browser `localStorage` under the exact key `wtf_watchlist`. Watched assets reflect live price and 24h change updates pushed via the existing SSE feed without saving stale prices to storage. Users can toggle watched status via the star button on any `AssetCard` or remove assets directly with accessible remove buttons. Shows the exact empty-state message `Add assets to track them here` when empty.
  - **Desktop (> 900px):** Collapsible sidebar panel sitting alongside the 3-column asset grid.
  - **Mobile (< 600px):** Collapsible bottom drawer that stays compact when closed and slides up when expanded, with 1-column stacked asset cards.
- **MomentumLeaderboard** (`src/components/MomentumLeaderboard.jsx`) renders a full-width leaderboard below the main grid displaying the top 10 assets ranked by momentum score from `GET /api/feed/leaderboard`. Features rank #1 with a distinctive gold accent (`#F59E0B`), symbol, score, momentum badge, and 24h change. Refreshes every 60 seconds with non-overlapping request throttling and graceful loading/error/empty states.

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
| `SUPABASE_URL` | empty | Supabase project URL, e.g. `https://<project-id>.supabase.co`. Empty = no persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Service-role / secret key. Bypasses RLS: server-only, never in the frontend or in Git |
| `WTF_WEBHOOK_SECRET` | empty | Shared secret for `POST /internal/scores` (`X-WTF-Secret`). Empty = webhook answers 503 |
| `EQUITIES_SYMBOLS` | empty | Comma-separated US tickers (e.g. `AAPL,MSFT,NVDA`). Trimmed, upper-cased, de-duplicated. Empty = crypto only |
| `EQUITIES_REFRESH_MS` | `60000` | Yahoo quote refresh while the US regular session is open |
| `EQUITIES_CLOSED_REFRESH_MS` | `900000` | Quote refresh while the market is closed (or at the next open, if sooner) |
| `EQUITIES_HISTORY_TTL_MS` | `21600000` | Freshness of the equities 7-session average volume (6h) |
| `EQUITIES_HISTORY_REQUEST_DELAY_MS` | `500` | Spacing between equity history requests |
| `YAHOO_FINANCE_BASE_URL` | `https://query1.finance.yahoo.com` | Override, e.g. for a mock |
| `VITE_API_BASE_URL` | empty | Frontend, build-time: backend origin when deployed. Empty locally |

## Where to plug in real APIs

- **Crypto market data provider: CoinGecko:** everything lives in `server/services/coingecko.js` (URLs, params, auth header). Put your key in `.env` as `COINGECKO_API_KEY`.
- **Equities (backend):** all Yahoo requests live in `server/services/yahooFinance.js`; `server/services/providers/equities.js` maps them to the provider interface. To swap data sources, replace the client and keep the candidate shape.

### Equities details

- **Ids vs symbols:** feed ids are namespaced (`equity:AAPL`) so they never collide with CoinGecko ids; `symbol` stays `AAPL`, and Supabase `assets.symbol` / `price_snapshots.symbol` use the display symbol, the same as crypto. Avoid configuring a ticker that is also a tracked crypto symbol: both would map to one `assets` row, and this is not detected automatically.
- **Fields:** `price` = regular-market price; `change_24h` = % change since the previous session's close; `volume_24h` = today's **dollar** volume (shares x price), so it is in USD like CoinGecko's; `avg_volume_7d` = mean dollar volume of the last 7 completed sessions (today's bar is skipped while the session is open); `sparkline_24h` = the most recent session's 15-minute closes; `sparkline_7d` = `[]` (not fetched for equities); `exchange` = Yahoo's exchange name (e.g. `NasdaqGS`), stored in `assets.exchange`.
- **Market hours:** outside the regular session the last real quote is served unchanged and Yahoo is polled only every 15 minutes. Missing values are never invented: a missing previous close gives `change_24h: 0` (the crypto fallback) and a log line; a missing price drops the symbol. Non-USD listings are skipped.
- **Failures:** each symbol is isolated. A failing symbol is logged (`equity_symbol_failed`) and keeps its last good quote for up to 30 minutes. If every symbol fails, the feed keeps its last good equities and crypto is unaffected. `topN` (20) applies per asset type, so equities never crowd crypto out of the feed or the snapshot writer.
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
      "volume_ratio": 1.25,
      "momentum_score": 3.261,
      "asset_type": "crypto",
      "sparkline_24h": [151.7, 151.2, "...24 prices"],
      "sparkline_7d": [145.2, "...168 prices"]
    }
  ]
}
```

The public contract deliberately uses `price` and `change_24h` rather than `price_usd` and `price_change_24h` to maintain strict contract compatibility with the frontend UI (`src/utils/assets.js`). Internal fields (`_candidates`, `avg_volume_7d`) are never exposed publicly; instead, `volume_ratio` (`volume_24h / avg_volume_7d`) is exposed safely. Equities also include an optional `exchange` string.

### `GET /api/feed/discovery`

Curated discovery categories derived from the current snapshot and official CoinGecko endpoints. No per-user upstream calls are made. `503` until the first successful poll.

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
| `new_listings` | Official CoinGecko `/coins/list/new` endpoint (max 5) when supported, or `[]` on Free/Demo plans | 5 |

**`new_listings` behavior:**
- CoinGecko's official `/coins/list/new` endpoint requires a paid plan (Analyst/Lite/Pro/Enterprise) and responds with HTTP 401 on Free/Demo tiers.
- When running on a paid plan with Pro credentials, `server/services/newListings.js` matches newly listed coins with verified market candidates and normalizes them into the public asset shape (max 5).
- On the Free/Demo plan or when unsupported, the service logs `new_listings_disabled` once internally, safely returns `[]`, and does not manufacture fake listing dates, fake prices, or hammer the API.

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

## Scoring-engine webhook

### `POST /internal/scores`

The scoring engine (separate service) pushes momentum scores here each scoring cycle. Server-to-server only; not proxied to or called by the frontend.

- **Auth:** header `X-WTF-Secret: <WTF_WEBHOOK_SECRET>`, compared in constant time before the body is read.
- **Body:** `Content-Type: application/json`, one score object or an array of up to 500:

```json
{ "symbol": "BTC", "score": 1.72, "signal": "bullish", "updated_at": "2026-10-01T10:15:00Z" }
```

| Field | Rule |
| --- | --- |
| `symbol` | Ticker, case-insensitive (stored upper-case). Must exist in the `assets` table |
| `score` | Finite number |
| `signal` | Non-empty string, max 32 chars |
| `updated_at` | ISO 8601 timestamp, not more than 5 minutes in the future |

| Status | Meaning |
| --- | --- |
| `200 { "ok": true, "accepted": n, "rejected": [{ "symbol", "reason" }] }` | Stored. `rejected` lists symbols not in `assets` (retrying will not help) |
| `400 { "error": "bad payload", "details": [...] }` | Invalid JSON or fields; nothing stored |
| `401 { "error": "unauthorized" }` | Missing or wrong secret |
| `415` / `413` | Not JSON / body over 256 KB |
| `502` | Database unavailable: **retry later** |
| `503` | Webhook not configured on this server |

Each score is appended to `momentum_score_history`; a retried delivery (same `symbol` + `updated_at`) is ignored. `momentum_scores` keeps the newest score per symbol and is never overwritten by an older one. Every request is logged (`scores_received` / `scores_rejected` / `scores_auth_failed`); the secret never is.

```bash
curl -X POST http://localhost:3001/internal/scores   -H "Content-Type: application/json" -H "X-WTF-Secret: $WTF_WEBHOOK_SECRET"   -d '[{"symbol":"BTC","score":1.72,"signal":"bullish","updated_at":"2026-10-01T10:15:00Z"}]'
```

### Database

Tables live in the Supabase project `WTF-Trading-App`: `assets`, `price_snapshots`, `momentum_scores`, `momentum_score_history` (RLS enabled; the backend uses the service-role key). The backend registers every symbol the live feed tracks into `assets`, so scores for those symbols are accepted. Run `server/db/migrations/001_momentum_score_history_unique.sql` once in the Supabase SQL editor; the webhook's retry de-duplication needs it.

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

## Verification Status

| Category | Component / Feature | Status | Notes |
| --- | --- | --- | --- |
| **Crypto Data** | CoinGecko `/coins/markets` (USD, price, 24h change, volume, sparkline) | **VERIFIED LIVE** | Tested with live public API; returns 200 with 168-point 7d hourly sparkline |
| **Crypto History** | CoinGecko `/coins/{id}/market_chart` (7d hourly volume history) | **VERIFIED LIVE** | Tested with live Bitcoin market chart; returns 169 volume sample points |
| **Equities Data** | Yahoo Finance quote (`/v8/finance/chart/{symbol}?range=1d&interval=15m`) | **VERIFIED LIVE** | Tested live with AAPL; returns regularMarketPrice, previousClose, volume, intraday closes |
| **Equities History** | Yahoo Finance history (`range=1mo&interval=1d` for 7 completed sessions) | **VERIFIED LIVE** | Tested live with AAPL; returns 21 daily bars with close and volume for USD dollar-volume calculation |
| **Equities Isolation** | Fallback to last-good quote, individual symbol failures, market session cadence | **VERIFIED WITH MOCK** | 14 automated unit and integration tests in `server/tests/equities.test.js` |
| **New Listings** | CoinGecko `/coins/list/new` endpoint verification | **VERIFIED LIVE** | Tested live on public/free plan: returns HTTP 401 (`error_code: 10005`, "This request is limited to PRO API subscribers") |
| **New Listings Service** | Normalization, candidate matching, 401 handling, debug logging, caching | **VERIFIED WITH MOCK** | 5 automated tests in `server/tests/newListings.test.js`; disabled on free tier without fake data |
| **API Contract** | Field presence, numeric finiteness, hidden internals (`_candidates`), SSE headers | **VERIFIED WITH MOCK** | 9 comprehensive contract tests locking exact schema in `server/tests/api-contract.test.js` |
| **Rate Limit / 429** | Exponential backoff, `Retry-After` header parsing, fast failure without hitting network | **VERIFIED WITH MOCK** | Tested with mock backoff gate in `coingecko.test.js` and `equities.test.js` |
| **New Listings (Real)** | Populated `new_listings` category with real newly listed coins | **NOT AVAILABLE WITHOUT PAID API** | Requires CoinGecko Analyst/Pro tier ($29+/mo) with `https://pro-api.coingecko.com/api/v3` and `x-cg-pro-api-key` |

## Known limitations

- **CoinGecko New Listings Paid Tier:** `/coins/list/new` requires a CoinGecko Pro/Analyst subscription. On Free and Demo plans, the endpoint answers HTTP 401 and `new_listings` safely remains `[]`.
- **Cold start:** until a coin's 7-day average has loaded (about 50s for 20 coins with the default delay), its volume term is 0, so scores are lower than they will be.
- The formula uses the percentage change directly, so the price term dominates the volume term; that is the Brief v2 formula and was not altered.
- CoinGecko free tier limits are strict and its data updates every 1-5 minutes, so many 10s polls return unchanged numbers; a Demo API key helps with limits.
- If `UNIVERSE_SIZE` is raised above 20, assets that drop out of the top 20 stay on screen until reload (the client merges updates and does not prune).
- Yahoo Finance's chart API is public but unofficial: no SLA, and it may change or rate-limit without notice.
- Outside market hours the snapshot writer still stores the (unchanged) last equity price every 15 minutes, with `pct_change_15m` = 0.
- "Price Change" sorts by signed 24h change, biggest gainers first.
- Fonts load from Google Fonts; without network the system fallbacks are used.

