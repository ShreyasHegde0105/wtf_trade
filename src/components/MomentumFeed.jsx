import { useMemo, useState } from 'react';
import { selectVisibleAssets } from '../utils/feedView.js';
import AssetCard from './AssetCard.jsx';
import FilterBar from './FilterBar.jsx';
import SearchBar from './SearchBar.jsx';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' });

function FeedMeta({ connection, lastUpdated, count, total }) {
  return (
    <p className="feed__meta">
      <span className="num">{count}</span>
      <span>/ {total} assets</span>
      {lastUpdated && (
        <span className={`feed__updated ${connection === 'live' ? '' : 'is-stale'}`}>
          Updated <span className="num">{timeFormat.format(lastUpdated)}</span>
        </span>
      )}
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
  onOpenAsset,
}) {
  const {
    assets = [],
    phase = 'loading',
    connection = 'connecting',
    lastUpdated = null,
    error = null,
  } = feed || {};

  const [momentum, setMomentum] = useState('all');
  const [sort, setSort] = useState('momentum');

  const visible = useMemo(
    () => selectVisibleAssets(assets, { momentum, query, sort }),
    [assets, momentum, query, sort],
  );

  return (
    <section className="feed panel" aria-labelledby="feed-title">
      <div className="section-head">
        <h2 id="feed-title" className="section-head__title">Momentum Terminal</h2>
        <FeedMeta connection={connection} lastUpdated={lastUpdated} count={visible.length} total={assets.length} />
      </div>
      <div className="feed__toolbar">
        <SearchBar value={query} onChange={onQueryChange} />
        <FilterBar
          momentum={momentum}
          onMomentumChange={setMomentum}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

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
          No assets match your filter or search. Clear the search or change the filter.
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
              onOpen={onOpenAsset}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
