import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import AppHeader from './components/AppHeader.jsx';
import DiscoveryRail from './components/DiscoveryRail.jsx';
import MarketPulse from './components/MarketPulse.jsx';
import MomentumFeed from './components/MomentumFeed.jsx';
import MomentumLeaderboard from './components/MomentumLeaderboard.jsx';
import WatchlistPanel from './components/WatchlistPanel.jsx';
import { useMomentumFeed } from './hooks/useMomentumFeed.js';
import { useWatchlist } from './hooks/useWatchlist.js';

// The large chart pulls in extra Recharts modules; load it only when an asset is opened.
const AssetDetail = lazy(() => import('./components/AssetDetail.jsx'));

export default function App() {
  const feed = useMomentumFeed();
  const { watchedIds, isWatched, removeFromWatchlist, toggleWatchlist } = useWatchlist();
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState(null);

  const handleDiscoverySelect = useCallback((asset) => {
    if (asset?.symbol) {
      setQuery(asset.symbol);
    }
  }, []);

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  // Read the open asset from the live feed so the drawer follows SSE updates.
  const detailAsset = useMemo(
    () => (detailId ? feed.assets.find((asset) => asset.id === detailId) ?? null : null),
    [detailId, feed.assets],
  );

  return (
    <>
      <AppHeader connection={feed.connection} />
      <div className="app">
        <div id="markets" className="app__anchor">
          <MarketPulse assets={feed.assets} phase={feed.phase} onOpenAsset={openDetail} />
        </div>
        <DiscoveryRail onSelectAsset={handleDiscoverySelect} />
        <div className="app__layout">
          <main className="app__main">
            <MomentumFeed
              feed={feed}
              query={query}
              onQueryChange={setQuery}
              isWatched={isWatched}
              onToggleWatchlist={toggleWatchlist}
              onOpenAsset={openDetail}
            />
          </main>
          <WatchlistPanel
            watchedIds={watchedIds}
            assets={feed.assets}
            onRemove={removeFromWatchlist}
            onSelectAsset={handleDiscoverySelect}
          />
        </div>
        <MomentumLeaderboard onSelectAsset={handleDiscoverySelect} />
      </div>

      {detailAsset && (
        <Suspense fallback={null}>
          <AssetDetail
            key={detailAsset.id}
            asset={detailAsset}
            isWatched={isWatched(detailAsset.id)}
            onToggleWatchlist={toggleWatchlist}
            onClose={closeDetail}
          />
        </Suspense>
      )}
    </>
  );
}
