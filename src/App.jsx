import { useState } from 'react';
import DiscoveryRail from './components/DiscoveryRail.jsx';
import MomentumFeed from './components/MomentumFeed.jsx';
import WatchlistPanel from './components/WatchlistPanel.jsx';
import { useMomentumFeed } from './hooks/useMomentumFeed.js';
import { useWatchlist } from './hooks/useWatchlist.js';

export default function App() {
  const feed = useMomentumFeed();
  const { watchedIds, isWatched, removeFromWatchlist, toggleWatchlist } = useWatchlist();
  const [query, setQuery] = useState('');

  const handleDiscoverySelect = (asset) => {
    if (asset?.symbol) {
      setQuery(asset.symbol);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Momentum</h1>
        <p className="app__subtitle">Assets moving unusually fast on price and volume</p>
      </header>
      <DiscoveryRail onSelectAsset={handleDiscoverySelect} />
      <div className="app__layout">
        <main className="app__main">
          <MomentumFeed
            feed={feed}
            query={query}
            onQueryChange={setQuery}
            isWatched={isWatched}
            onToggleWatchlist={toggleWatchlist}
          />
        </main>
        <WatchlistPanel
          watchedIds={watchedIds}
          assets={feed.assets}
          onRemove={removeFromWatchlist}
          onSelectAsset={handleDiscoverySelect}
        />
      </div>
    </div>
  );
}
