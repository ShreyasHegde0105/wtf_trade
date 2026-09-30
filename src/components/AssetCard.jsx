import { memo } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { formatChange, formatPrice, formatScore, formatVolume } from '../utils/format.js';
import MiniChart from './MiniChart.jsx';

function AssetCard({ asset, isWatched = false, onToggleWatchlist, onAddToWatchlist }) {
  const status = classifyMomentum(asset.momentum_score);
  const positive = asset.change_24h >= 0;
  const arrow = asset.change_24h > 0 ? '▲' : asset.change_24h < 0 ? '▼' : '';

  const handleToggle = () => {
    if (onToggleWatchlist) {
      onToggleWatchlist(asset.id);
    } else if (onAddToWatchlist) {
      onAddToWatchlist(asset.id);
    }
  };

  const sparklineData = (asset.sparkline_7d && asset.sparkline_7d.length > 0)
    ? asset.sparkline_7d
    : (asset.sparkline_24h || []);

  const ratio = typeof asset.volume_ratio === 'number' && Number.isFinite(asset.volume_ratio) && asset.volume_ratio > 0
    ? asset.volume_ratio
    : 0;

  // Clamp bar width to a safe 0-100% range where 2.5x avg is 100% full
  const clampedPercent = Math.min(Math.max((ratio / 2.5) * 100, 0), 100);

  return (
    <li className="card">
      <div className="card__head">
        <div className="card__id">
          <h2 className="card__name">{asset.name}</h2>
          <span className="card__symbol">{asset.symbol}</span>
        </div>
        <div className="card__head-actions">
          <button
            type="button"
            className={`card__watchlist-toggle ${isWatched ? 'is-watched' : ''}`}
            onClick={handleToggle}
            aria-label={isWatched ? `Remove ${asset.name} from watchlist` : `Add ${asset.name} to watchlist`}
            aria-pressed={isWatched}
            title={isWatched ? `Remove ${asset.name} from watchlist` : `Add ${asset.name} to watchlist`}
          >
            <span aria-hidden="true">{isWatched ? '★' : '☆'}</span>
          </button>
          <span className={`badge badge--${status.toLowerCase()}`}>{status}</span>
        </div>
      </div>

      <div className="card__price-row">
        <div>
          <span className="card__price">{formatPrice(asset.price)}</span>
          <span className={`card__change ${positive ? 'is-up' : 'is-down'}`}>
            {arrow} {formatChange(asset.change_24h)}
            <span className="visually-hidden"> in 24 hours</span>
          </span>
        </div>
        <MiniChart
          data={sparklineData}
          trend={positive ? 'up' : 'down'}
        />
      </div>

      <div className="card__volume-bar-section" aria-label={`Volume ratio: ${ratio > 0 ? `${ratio.toFixed(1)}x avg` : 'unavailable'}`}>
        <div className="card__volume-bar-header">
          <span className="card__volume-label">Volume</span>
          <span className="card__volume-ratio-text">
            {ratio > 0 ? `${ratio.toFixed(1)}× avg` : '—'}
          </span>
        </div>
        <div className="card__volume-track" role="progressbar" aria-valuenow={ratio} aria-valuemin="0" aria-valuemax="2.5">
          <div
            className="card__volume-fill"
            style={{ width: `${clampedPercent}%` }}
          />
        </div>
      </div>

      <dl className="card__stats">
        <div>
          <dt>Momentum</dt>
          <dd>{formatScore(asset.momentum_score)}</dd>
        </div>
        <div>
          <dt>Volume 24h</dt>
          <dd>{formatVolume(asset.volume_24h)}</dd>
        </div>
      </dl>
    </li>
  );
}

export default memo(AssetCard);
