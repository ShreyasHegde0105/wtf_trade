import { classifyMomentum, computeMomentumScore, toFiniteNumber } from '../../shared/momentum.js';

const SPARKLINE_POINTS = 24;

const round = (value, digits = 4) => Number(value.toFixed(digits));
const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Turns one CoinGecko /coins/markets row into an internal candidate.
 * Returns null when the row cannot be trusted (missing id/name/symbol/price).
 * Missing 24h change or volume default to 0.
 */
export function normalizeMarketCoin(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const price = toFiniteNumber(raw.current_price);
  if (!isText(raw.id) || !isText(raw.symbol) || !isText(raw.name) || price === null || price < 0) {
    return null;
  }

  const sparkline = Array.isArray(raw.sparkline_in_7d?.price)
    ? raw.sparkline_in_7d.price.map(toFiniteNumber).filter((v) => v !== null)
    : [];

  return {
    id: raw.id,
    symbol: raw.symbol.toUpperCase(),
    name: raw.name,
    price,
    change_24h: toFiniteNumber(raw.price_change_percentage_24h) ?? 0,
    volume_24h: Math.max(0, toFiniteNumber(raw.total_volume) ?? 0),
    // The 7d sparkline is hourly, so the last 24 points cover roughly one day.
    sparkline_24h: sparkline.slice(-SPARKLINE_POINTS),
    sparkline_7d: sparkline,
  };
}

/** Candidate (+ avg_volume_7d) -> the public asset shape sent to clients. */
export function toPublicAsset(candidate) {
  const momentum = computeMomentumScore({
    priceChange24h: candidate.change_24h,
    volume24h: candidate.volume_24h,
    avgVolume7d: candidate.avg_volume_7d,
  });

  const avg = toFiniteNumber(candidate.avg_volume_7d);
  const volume = toFiniteNumber(candidate.volume_24h);
  const volumeRatio = volume !== null && avg !== null && avg > 0 ? volume / avg : 0;

  return {
    id: candidate.id,
    symbol: candidate.symbol,
    name: candidate.name,
    price_usd: candidate.price,
    price_change_24h: candidate.change_24h,
    volume_24h: candidate.volume_24h,
    avg_volume_7d: avg !== null ? round(avg, 2) : 0,
    momentum_score: round(momentum),
    momentum_label: classifyMomentum(momentum),
    sparkline_7d: candidate.sparkline_7d ?? candidate.sparkline_24h ?? [],
    // Retain legacy aliases for backwards compatibility with existing UI components:
    price: candidate.price,
    change_24h: candidate.change_24h,
    volume_ratio: round(volumeRatio, 2),
    asset_type: candidate.asset_type,
    // Only providers that know the listing exchange (equities) set it; crypto omits it.
    ...(candidate.exchange ? { exchange: candidate.exchange } : {}),
    sparkline_24h: candidate.sparkline_24h ?? [],
  };
}

const hasValidNumbers = (asset) =>
  [asset.price_usd ?? asset.price, asset.price_change_24h ?? asset.change_24h, asset.volume_24h, asset.momentum_score].every(Number.isFinite);

const byMomentum = (a, b) =>
  b.momentum_score - a.momentum_score || b.volume_24h - a.volume_24h || a.id.localeCompare(b.id);

/** Scores candidates, drops invalid ones and returns the top N by momentum_score (descending). */
export function buildSnapshot(candidates, topN) {
  return candidates.map(toPublicAsset).filter(hasValidNumbers).sort(byMomentum).slice(0, topN);
}

/**
 * Like buildSnapshot, but topN applies per asset_type, so equities never crowd crypto out of
 * the feed (or the reverse). The merged list is still sorted by momentum_score. With a
 * single asset type this is identical to buildSnapshot.
 */
export function buildFeedSnapshot(candidates, topN) {
  const byType = new Map();
  for (const candidate of candidates) {
    const group = byType.get(candidate.asset_type) ?? [];
    group.push(candidate);
    byType.set(candidate.asset_type, group);
  }
  return [...byType.values()].flatMap((group) => buildSnapshot(group, topN)).sort(byMomentum);
}
