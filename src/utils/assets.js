import { toFiniteNumber } from '../../shared/momentum.js';

/** Validates one asset coming from the API/SSE. Returns null when it is unusable. */
export function sanitizeAsset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, symbol, name } = raw;
  const price = toFiniteNumber(raw.price);
  if (![id, symbol, name].every((v) => typeof v === 'string' && v !== '') || price === null) {
    return null;
  }

  return {
    id,
    symbol: symbol.toUpperCase(),
    name,
    asset_type: raw.asset_type === 'equity' ? 'equity' : 'crypto',
    price,
    change_24h: toFiniteNumber(raw.change_24h) ?? 0,
    volume_24h: toFiniteNumber(raw.volume_24h) ?? 0,
    momentum_score: toFiniteNumber(raw.momentum_score) ?? 0,
    sparkline_24h: Array.isArray(raw.sparkline_24h)
      ? raw.sparkline_24h.map(toFiniteNumber).filter((v) => v !== null)
      : [],
  };
}

const SCALAR_KEYS = ['id', 'symbol', 'name', 'asset_type', 'price', 'change_24h', 'volume_24h', 'momentum_score'];

/** True when nothing visible changed, so the previous object (and its React memo) can be kept. */
export function isSameAsset(a, b) {
  return (
    SCALAR_KEYS.every((key) => a[key] === b[key]) &&
    a.sparkline_24h.length === b.sparkline_24h.length &&
    a.sparkline_24h.every((value, i) => value === b.sparkline_24h[i])
  );
}
