// Momentum v1, shared by the server (scoring) and the client (badges) so the
// weights and thresholds live in exactly one place.

export const WEIGHTS = Object.freeze({ price: 0.4, volume: 0.6 });
export const THRESHOLDS = Object.freeze({ hot: 1.5, warming: 1.0 });

export const MOMENTUM_LEVELS = Object.freeze({
  HOT: 'Hot',
  WARMING: 'Warming',
  NEUTRAL: 'Neutral',
});

/** Returns a finite number, or null for anything else (NaN, Infinity, '', objects...). */
export function toFiniteNumber(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * momentum_score = abs(price_change_24h) * 0.4 + (volume_24h / avg_volume_7d) * 0.6
 *
 * price_change_24h is a percentage (3.2 means +3.2%). Missing or invalid inputs
 * contribute 0, so the result is always a finite number.
 */
export function computeMomentumScore({ priceChange24h, volume24h, avgVolume7d }) {
  const change = toFiniteNumber(priceChange24h) ?? 0;
  const volume = toFiniteNumber(volume24h);
  const average = toFiniteNumber(avgVolume7d);
  const volumeRatio = volume !== null && average !== null && average > 0 ? volume / average : 0;

  const score = Math.abs(change) * WEIGHTS.price + volumeRatio * WEIGHTS.volume;
  return Number.isFinite(score) ? score : 0;
}

/** > 1.5 Hot, 1.0 to 1.5 Warming, < 1.0 Neutral. */
export function classifyMomentum(score) {
  const value = toFiniteNumber(score);
  if (value === null) return MOMENTUM_LEVELS.NEUTRAL;
  if (value > THRESHOLDS.hot) return MOMENTUM_LEVELS.HOT;
  if (value >= THRESHOLDS.warming) return MOMENTUM_LEVELS.WARMING;
  return MOMENTUM_LEVELS.NEUTRAL;
}
