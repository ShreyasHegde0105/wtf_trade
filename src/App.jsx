import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import AIChatButton from './components/AIChatButton.jsx';
import AIChatPanel from './components/AIChatPanel.jsx';
import AppHeader from './components/AppHeader.jsx';
import DiscoveryRail from './components/DiscoveryRail.jsx';
import MarketPulse from './components/MarketPulse.jsx';
import MomentumFeed from './components/MomentumFeed.jsx';
import MomentumLeaderboard from './components/MomentumLeaderboard.jsx';
import NewsSection from './components/NewsSection.jsx';
import TopMovers from './components/TopMovers.jsx';
import WatchlistPanel from './components/WatchlistPanel.jsx';
import { useMomentumFeed } from './hooks/useMomentumFeed.js';
import { useWatchlist } from './hooks/useWatchlist.js';

// The large chart pulls in extra Recharts modules; load it only when an asset is opened.
const AssetDetail = lazy(() => import('./components/AssetDetail.jsx'));

const DEFAULT_SIDEBAR_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_STORAGE_KEY = 'wtf_watchlist_width';

function loadInitialSidebarWidth() {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_SIDEBAR_WIDTH;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH) {
      return parsed;
    }
  } catch {
    // localStorage may be restricted in some sandboxes
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

export default function App() {
  const feed = useMomentumFeed();
  const { watchedIds, isWatched, removeFromWatchlist, toggleWatchlist } = useWatchlist();
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Watchlist sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(loadInitialSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e) => {
    if (e.button !== 0) return; // Left mouse button only
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e) => {
      const clamped = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      setSidebarWidth(clamped);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
      } catch {
        // ignore
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, sidebarWidth]);

  const handleResizerKeyDown = useCallback((e) => {
    let delta = 0;
    if (e.key === 'ArrowLeft') delta = -10;
    else if (e.key === 'ArrowRight') delta = 10;
    else if (e.key === 'Home') delta = MIN_SIDEBAR_WIDTH - sidebarWidth;
    else if (e.key === 'End') delta = MAX_SIDEBAR_WIDTH - sidebarWidth;
    else return;

    e.preventDefault();
    setSidebarWidth((prev) => {
      const next = Math.min(Math.max(prev + delta, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [sidebarWidth]);

  const handleDiscoverySelect = useCallback((asset) => {
    if (asset?.symbol) {
      setQuery(asset.symbol);
    }
  }, []);

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => !prev);
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  // Read the open asset from the live feed so the drawer follows SSE updates.
  const detailAsset = useMemo(
    () => (detailId ? feed.assets.find((asset) => asset.id === detailId) ?? null : null),
    [detailId, feed.assets],
  );

  return (
    <>
      <AppHeader connection={feed.connection} />
      <div className="app">
        <div className="app__terminal">
          {/* Left sidebar: Watchlist */}
          <aside
            className="app__sidebar"
            id="watchlist"
            style={{ width: `${sidebarWidth}px`, flexBasis: `${sidebarWidth}px` }}
          >
            <WatchlistPanel
              watchedIds={watchedIds}
              assets={feed.assets}
              onRemove={removeFromWatchlist}
              onSelectAsset={handleDiscoverySelect}
            />
          </aside>

          {/* Desktop horizontal resize handle */}
          <div
            className={`app__resizer ${isResizing ? 'is-resizing' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-label="Resize watchlist sidebar"
            tabIndex={0}
            onMouseDown={startResizing}
            onKeyDown={handleResizerKeyDown}
            title="Drag or use arrow keys to resize watchlist"
          >
            <div className="app__resizer-handle" aria-hidden="true">
              <span className="app__resizer-bar" />
              <span className="app__resizer-grip">⋮</span>
              <span className="app__resizer-bar" />
            </div>
          </div>

          {/* Main content area */}
          <div className="app__content">
            <div id="markets" className="app__anchor">
              <MarketPulse assets={feed.assets} phase={feed.phase} onOpenAsset={openDetail} />
            </div>
            <div id="discover">
              <DiscoveryRail onSelectAsset={handleDiscoverySelect} />
            </div>
            <MomentumFeed
              feed={feed}
              query={query}
              onQueryChange={setQuery}
              isWatched={isWatched}
              onToggleWatchlist={toggleWatchlist}
              onOpenAsset={openDetail}
            />

            {/* Top Gainers & Top Losers */}
            <TopMovers assets={feed.assets} onOpenAsset={openDetail} />

            <MomentumLeaderboard onSelectAsset={handleDiscoverySelect} />

            {/* News Section at the LAST major section */}
            <NewsSection />
          </div>
        </div>
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

      {/* Floating AI Entry Point & Chat Panel */}
      <AIChatButton isOpen={isChatOpen} onClick={toggleChat} />
      <AIChatPanel isOpen={isChatOpen} onClose={closeChat} />
    </>
  );
}
