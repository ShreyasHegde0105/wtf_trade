import { memo, useMemo, useState } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { formatChange, formatPrice, formatScore } from '../utils/format.js';

function WatchlistItem({ id, asset, onRemove, onSelectAsset }) {
  const status = asset?.momentum_score != null ? classifyMomentum(asset.momentum_score) : null;
  const positive = asset?.change_24h != null ? asset.change_24h >= 0 : null;
  const arrow = asset?.change_24h > 0 ? '▲' : asset?.change_24h < 0 ? '▼' : '';
  const displayName = asset?.name || id;
  const displaySymbol = asset?.symbol || id.toUpperCase();

  return (
    <li className="watchlist__item">
      <button
        type="button"
        className="watchlist__item-select"
        onClick={() => asset && onSelectAsset?.(asset)}
        aria-label={`Filter by ${displayName}`}
        title={`Filter feed by ${displayName}`}
      >
        <div className="watchlist__item-id">
          <span className="watchlist__item-symbol">{displaySymbol}</span>
          <span className="watchlist__item-name">{displayName}</span>
        </div>

        <div className="watchlist__item-market">
          <span className="watchlist__item-price">
            {asset?.price != null ? formatPrice(asset.price) : '—'}
          </span>
          {asset?.change_24h != null && (
            <span className={`watchlist__item-change ${positive ? 'is-up' : 'is-down'}`}>
              {arrow} {formatChange(asset.change_24h)}
            </span>
          )}
        </div>

        {status && (
          <span
            className={`watchlist__item-dot watchlist__item-dot--${status.toLowerCase()}`}
            title={`Momentum: ${status} (${formatScore(asset.momentum_score)})`}
            aria-hidden="true"
          />
        )}
      </button>

      <button
        type="button"
        className="watchlist__remove-btn"
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
  const [isOpen, setIsOpen] = useState(true);

  // Map watchedIds to their live asset data from the feed state
  const assetMap = useMemo(() => {
    const map = new Map();
    for (const asset of assets) {
      if (asset?.id) map.set(asset.id, asset);
    }
    return map;
  }, [assets]);

  return (
    <aside
      className={`watchlist ${isOpen ? 'is-open' : 'is-collapsed'}`}
      aria-label="Watchlist"
    >
      <div className="watchlist__header">
        <div className="watchlist__header-title">
          <h2 className="watchlist__title">Watchlist</h2>
          <span
            className="watchlist__count"
            aria-label={`${watchedIds.length} assets watched`}
          >
            {watchedIds.length}
          </span>
        </div>
        <button
          type="button"
          className="watchlist__toggle-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="watchlist-content"
          aria-label={isOpen ? 'Collapse watchlist' : 'Expand watchlist'}
          title={isOpen ? 'Collapse watchlist' : 'Expand watchlist'}
        >
          <span className="watchlist__toggle-icon" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
        </button>
      </div>

      <div
        id="watchlist-content"
        className="watchlist__body"
        hidden={!isOpen}
      >
        {watchedIds.length === 0 ? (
          <p className="watchlist__empty">Add assets to track them here</p>
        ) : (
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
        )}
      </div>
    </aside>
  );
}

export default memo(WatchlistPanel);
