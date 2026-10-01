// Maps a chart timeframe to the price series the backend actually provides.
// Only timeframes backed by real asset fields are enabled; the rest are listed so
// the UI can show them as unavailable. When the API gains OHLC or longer history,
// add a `select` for that timeframe here - the chart components stay unchanged.

export const TIMEFRAMES = Object.freeze([
  { key: '1d', label: '1D', description: 'Last 24 hours', select: (asset) => asset?.sparkline_24h },
  { key: '7d', label: '7D', description: 'Last 7 days', select: (asset) => asset?.sparkline_7d },
  { key: '30d', label: '30D', description: 'Last 30 days', select: null },
  { key: '3m', label: '3M', description: 'Last 3 months', select: null },
]);

export const DEFAULT_TIMEFRAME = '7d';

/** Returns the finite price points for a timeframe, or [] when none are available. */
export function getSeries(asset, timeframeKey) {
  const timeframe = TIMEFRAMES.find((tf) => tf.key === timeframeKey);
  const raw = timeframe?.select ? timeframe.select(asset) : null;
  return Array.isArray(raw) ? raw.filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
}

export function isTimeframeAvailable(asset, timeframeKey) {
  return getSeries(asset, timeframeKey).length >= 2;
}

/** High / low / first / last / change over the series. Null when there is no usable series. */
export function summarizeSeries(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const value of points) {
    if (value > high) high = value;
    if (value < low) low = value;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;
  return { high, low, first, last, changePct };
}

/** Normalises a volume ratio to a finite value >= 0 (0 means unavailable). */
export function safeVolumeRatio(ratio) {
  return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
}

/**
 * Aggregate stats over the tracked feed, derived purely from live asset data.
 * Returns counts per momentum level, advancers/decliners and summed 24h volume.
 */
export function summarizeMarket(assets, classify) {
  const summary = { total: 0, hot: 0, warming: 0, neutral: 0, advancers: 0, decliners: 0, volume: 0 };
  for (const asset of assets) {
    summary.total += 1;
    const level = classify(asset.momentum_score).toLowerCase();
    if (level in summary) summary[level] += 1;
    if (asset.change_24h > 0) summary.advancers += 1;
    else if (asset.change_24h < 0) summary.decliners += 1;
    summary.volume += Number.isFinite(asset.volume_24h) ? asset.volume_24h : 0;
  }
  return summary;
}
