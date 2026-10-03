import { memo, useMemo, useState } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { formatChange, formatPrice, formatScore } from '../utils/format.js';
import MiniChart from './MiniChart.jsx';

const MOBILE_QUERY = '(max-width: 599px)';

// On phones the panel is a bottom drawer, so it starts collapsed to keep the feed visible.
function initiallyOpen() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia(MOBILE_QUERY).matches;
}

function WatchlistItem({ id, asset, onRemove, onSelectAsset }) {
  const status = asset?.momentum_label || (asset?.momentum_score != null ? classifyMomentum(asset.momentum_score) : null);
  const price = asset ? (asset.price_usd ?? asset.price) : null;
  const change24h = asset ? (asset.price_change_24h ?? asset.change_24h) : null;
  const positive = change24h != null ? change24h >= 0 : null;
  const arrow = change24h != null && change24h > 0 ? '▲' : change24h != null && change24h < 0 ? '▼' : '';
  const displayName = asset?.name || id;
  const displaySymbol = asset?.symbol || id.toUpperCase();
  const spark = asset?.sparkline_7d?.length > 1 ? asset.sparkline_7d : asset?.sparkline_24h;

  return (
    <li className="wl-row">
      <button
        type="button"
        className="wl-row__select"
        onClick={() => asset && onSelectAsset?.(asset)}
        aria-label={`Filter by ${displayName}`}
        title={`Filter feed by ${displayName}`}
      >
        <span className="wl-row__id">
          <span className="wl-row__symbol">
            {status && (
              <span
                className={`dot dot--${status.toLowerCase()}`}
                title={`Momentum: ${status} (${formatScore(asset.momentum_score)})`}
                aria-hidden="true"
              />
            )}
            {displaySymbol}
          </span>
          <span className="wl-row__name">{displayName}</span>
        </span>

        <span className="wl-row__spark" aria-hidden="true">
          {spark?.length > 1 && (
            <MiniChart data={spark} trend={positive ? 'up' : 'down'} width={44} height={18} strokeWidth={1.5} />
          )}
        </span>

        <span className="wl-row__market">
          <span className="wl-row__price num">{price != null ? formatPrice(price) : '—'}</span>
          {change24h != null ? (
            <span className={`wl-row__change num ${positive ? 'is-up' : 'is-down'}`}>
              {arrow} {formatChange(change24h)}
            </span>
          ) : (
            <span className="wl-row__change">No live data</span>
          )}
        </span>
      </button>

      <button
        type="button"
        className="wl-row__remove"
        onClick={() => onRemove(id)}
        aria-label={`Remove ${displayName} from watchlist`}
        title={`Remove ${displayName} from watchlist`}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </li>
  );
}

const MemoWatchlistItem = memo(WatchlistItem);

function WatchlistPanel({ watchedIds = [], assets = [], onRemove, onSelectAsset }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  // Map watchedIds to their live asset data from the feed state
  const assetMap = useMemo(() => {
    const map = new Map();
    for (const asset of assets) {
      if (asset?.id) map.set(asset.id, asset);
    }
    return map;
  }, [assets]);

  return (
    <div className={`watchlist ${isOpen ? 'is-open' : 'is-collapsed'}`} aria-labelledby="watchlist-title">
      <div className="watchlist__header">
        <button
          type="button"
          className="watchlist__toggle"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="watchlist-content"
          title={isOpen ? 'Collapse watchlist' : 'Expand watchlist'}
        >
          <span className="watchlist__grip" aria-hidden="true" />
          <span id="watchlist-title" className="section-head__title">Watchlist</span>
          <span className="watchlist__count num" aria-label={`${watchedIds.length} assets watched`}>
            {watchedIds.length}
          </span>
          <span className="watchlist__toggle-icon" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          <span className="visually-hidden">{isOpen ? 'Collapse watchlist' : 'Expand watchlist'}</span>
        </button>
      </div>

      <div id="watchlist-content" className="watchlist__body" hidden={!isOpen}>
        {watchedIds.length === 0 ? (
          <p className="watchlist__empty">
            Add assets to track them here
            <span className="watchlist__empty-hint">Tap ☆ on any asset card</span>
          </p>
        ) : (
          <>
            <div className="wl-cols" aria-hidden="true">
              <span>Asset</span>
              <span>7D</span>
              <span>Last / 24h</span>
            </div>
            <ul className="watchlist__list" role="list">
              {watchedIds.map((id) => (
                <MemoWatchlistItem
                  key={id}
                  id={id}
                  asset={assetMap.get(id)}
                  onRemove={onRemove}
                  onSelectAsset={onSelectAsset}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(WatchlistPanel);
