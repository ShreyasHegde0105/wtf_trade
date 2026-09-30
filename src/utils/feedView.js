import { classifyMomentum } from '../../shared/momentum.js';

// Pure, client-side filtering / searching / sorting of the live feed.

export const MOMENTUM_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'hot', label: 'Hot' },
  { value: 'warming', label: 'Warming' },
  { value: 'neutral', label: 'Neutral' },
];

export const TYPE_OPTIONS = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'equity', label: 'Equities' },
  { value: 'all', label: 'All' },
];

export const SORT_OPTIONS = [
  { value: 'momentum', label: 'Momentum' },
  { value: 'change', label: 'Price Change' },
  { value: 'volume', label: 'Volume' },
];

// "Price Change" puts the biggest 24h gainers first.
const COMPARATORS = {
  momentum: (a, b) => b.momentum_score - a.momentum_score,
  change: (a, b) => b.change_24h - a.change_24h,
  volume: (a, b) => b.volume_24h - a.volume_24h,
};

export function filterByMomentum(assets, level) {
  if (!level || level.toLowerCase() === 'all') return assets;
  const target = level.toLowerCase();
  return assets.filter((asset) => {
    const assetLevel = classifyMomentum(asset.momentum_score);
    return assetLevel.toLowerCase() === target;
  });
}

export function filterByType(assets, type) {
  return type === 'all' ? assets : assets.filter((asset) => asset.asset_type === type);
}

/** Case-insensitive match on name or symbol. An empty/blank query returns everything. */
export function searchAssets(assets, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return assets;
  return assets.filter(
    (asset) => asset.name.toLowerCase().includes(needle) || asset.symbol.toLowerCase().includes(needle),
  );
}

export function sortAssets(assets, sortKey) {
  const primary = COMPARATORS[sortKey] ?? COMPARATORS.momentum;
  return [...assets].sort(
    (a, b) => primary(a, b) || COMPARATORS.momentum(a, b) || a.id.localeCompare(b.id),
  );
}

export function selectVisibleAssets(assets, { momentum = 'all', type = 'all', query = '', sort = 'momentum' }) {
  let list = assets;
  if (type && type !== 'all') {
    list = filterByType(list, type);
  }
  if (momentum && momentum !== 'all') {
    list = filterByMomentum(list, momentum);
  }
  return sortAssets(searchAssets(list, query), sort);
}
