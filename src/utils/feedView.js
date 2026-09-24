// Pure, client-side filtering / searching / sorting of the live feed.

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

export function selectVisibleAssets(assets, { type, query, sort }) {
  return sortAssets(searchAssets(filterByType(assets, type), query), sort);
}
