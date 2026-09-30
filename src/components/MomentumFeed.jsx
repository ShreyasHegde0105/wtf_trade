import { useMemo, useState } from 'react';
import { selectVisibleAssets } from '../utils/feedView.js';
import AssetCard from './AssetCard.jsx';
import FilterBar from './FilterBar.jsx';
import SearchBar from './SearchBar.jsx';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' });

function ConnectionStatus({ connection, lastUpdated }) {
  const label =
    connection === 'live' ? 'Live' : connection === 'reconnecting' ? 'Reconnecting' : 'Connecting';
  return (
    <p className="status" role="status">
      <span className={`status__dot status__dot--${connection}`} aria-hidden="true" />
      {label}
      {lastUpdated && <span className="status__time">Updated {timeFormat.format(lastUpdated)}</span>}
    </p>
  );
}

function SkeletonGrid() {
  return (
    <ul className="grid" aria-busy="true" aria-label="Loading assets">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="card card--skeleton" />
      ))}
    </ul>
  );
}

export default function MomentumFeed({
  feed,
  query = '',
  onQueryChange,
  isWatched,
  onToggleWatchlist,
}) {
  const {
    assets = [],
    phase = 'loading',
    connection = 'connecting',
    lastUpdated = null,
    error = null,
  } = feed || {};

  const [type, setType] = useState('all');
  const [sort, setSort] = useState('momentum');

  const visible = useMemo(
    () => selectVisibleAssets(assets, { type, query, sort }),
    [assets, type, query, sort],
  );

  const noEquities = type === 'equity' && !assets.some((asset) => asset.asset_type === 'equity');

  return (
    <section className="feed" aria-label="Momentum feed">
      <SearchBar value={query} onChange={onQueryChange} />
      <FilterBar type={type} onTypeChange={setType} sort={sort} onSortChange={setSort} />
      <ConnectionStatus connection={connection} lastUpdated={lastUpdated} />

      {phase === 'ready' && connection === 'reconnecting' && (
        <p className="notice" role="alert">
          Live connection lost. Showing the last known prices while we reconnect.
        </p>
      )}

      {phase === 'loading' && <SkeletonGrid />}

      {phase === 'error' && (
        <p className="notice notice--error" role="alert">
          {error} The server may be down or the data provider unavailable. Retrying automatically.
        </p>
      )}

      {phase === 'ready' && visible.length === 0 && (
        <p className="notice">
          {noEquities
            ? 'Equities are not connected yet.'
            : 'No assets match your search. Clear the search or change the filter.'}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="grid">
          {visible.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isWatched={isWatched ? isWatched(asset.id) : false}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
