import { useEffect, useMemo, useState } from 'react';
import { selectVisibleAssets } from '../utils/feedView.js';
import AssetRow from './AssetRow.jsx';
import FilterBar from './FilterBar.jsx';
import SearchBar from './SearchBar.jsx';

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' });
const PAGE_SIZE = 10;

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

function SkeletonRows() {
  return (
    <tbody aria-busy="true" aria-label="Loading assets">
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="mkt-row mkt-row--skeleton">
          <td className="mkt-td mkt-td--asset">
            <div className="mkt-asset">
              <div className="skel skel--dot" />
              <div className="mkt-asset__id">
                <div className="skel skel--sym" />
                <div className="skel skel--name-sm" />
              </div>
            </div>
          </td>
          <td className="mkt-td mkt-td--num"><div className="skel skel--num" /></td>
          <td className="mkt-td mkt-td--num"><div className="skel skel--num skel--short" /></td>
          <td className="mkt-td mkt-td--num mkt-td--hide-sm"><div className="skel skel--num" /></td>
          <td className="mkt-td mkt-td--num mkt-td--hide-sm"><div className="skel skel--num skel--short" /></td>
          <td className="mkt-td mkt-td--spark mkt-td--hide-xs" />
          <td className="mkt-td mkt-td--action" />
        </tr>
      ))}
    </tbody>
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Full search & filter across the entire dataset FIRST
  const visible = useMemo(
    () => selectVisibleAssets(assets, { momentum, query, sort }),
    [assets, momentum, query, sort],
  );

  // Reset pagination whenever search query, filter, or sort changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, momentum, sort]);

  // Paginated assets for display (initial 10, then +10 on Load More)
  const displayedAssets = useMemo(
    () => visible.slice(0, visibleCount),
    [visible, visibleCount],
  );

  const hasMore = visible.length > visibleCount;
  const remainingCount = Math.max(0, visible.length - visibleCount);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  };

  return (
    <section className="feed" aria-labelledby="feed-title">
      <div className="feed__header">
        <div className="section-head">
          <h2 id="feed-title" className="section-head__title">Markets</h2>
          <FeedMeta
            connection={connection}
            lastUpdated={lastUpdated}
            count={displayedAssets.length}
            total={visible.length}
          />
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
      </div>

      {phase === 'ready' && connection === 'reconnecting' && (
        <p className="notice" role="alert">
          Live connection lost. Showing the last known prices while we reconnect.
        </p>
      )}

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

      <div className="mkt-table-wrap">
        <table className="mkt-table" aria-label="Asset market data">
          <thead>
            <tr className="mkt-thead">
              <th className="mkt-th mkt-th--asset" scope="col">Asset</th>
              <th className="mkt-th mkt-th--num" scope="col">Price</th>
              <th className="mkt-th mkt-th--num" scope="col">24h</th>
              <th className="mkt-th mkt-th--num mkt-td--hide-sm" scope="col">Volume</th>
              <th className="mkt-th mkt-th--num mkt-td--hide-sm" scope="col">Score</th>
              <th className="mkt-th mkt-td--hide-xs" scope="col">
                <span className="visually-hidden">7D Chart</span>
              </th>
              <th className="mkt-th" scope="col">
                <span className="visually-hidden">Watch</span>
              </th>
            </tr>
          </thead>
          {phase === 'loading' ? (
            <SkeletonRows />
          ) : (
            <tbody>
              {displayedAssets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  isWatched={isWatched ? isWatched(asset.id) : false}
                  onToggleWatchlist={onToggleWatchlist}
                  onOpen={onOpenAsset}
                />
              ))}
            </tbody>
          )}
        </table>
      </div>

      {/* Load More pagination control */}
      {phase === 'ready' && visible.length > 0 && (
        <div className="mkt-pagination">
          {hasMore ? (
            <div className="mkt-load-more">
              <button
                type="button"
                className="btn-load-more"
                onClick={handleLoadMore}
                aria-label={`Load 10 more assets (${remainingCount} remaining)`}
              >
                <span className="btn-load-more__line" aria-hidden="true" />
                <span className="btn-load-more__text">
                  Load More <span className="btn-load-more__tag num">+10</span>
                  <span className="btn-load-more__sub num">({remainingCount} remaining)</span>
                </span>
                <span className="btn-load-more__line" aria-hidden="true" />
              </button>
            </div>
          ) : (
            visible.length > PAGE_SIZE && (
              <div className="mkt-load-more mkt-load-more--done" aria-live="polite">
                <span className="btn-load-more__line" aria-hidden="true" />
                <span className="mkt-load-more__status">All {visible.length} assets loaded</span>
                <span className="btn-load-more__line" aria-hidden="true" />
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
