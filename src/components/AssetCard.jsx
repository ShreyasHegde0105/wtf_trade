import { memo } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { safeVolumeRatio } from '../utils/chartSeries.js';
import { formatChange, formatPrice, formatScore, formatVolume } from '../utils/format.js';
import MiniChart from './MiniChart.jsx';

// 2.5x the 7-day average volume fills the bar completely.
const VOLUME_BAR_MAX = 2.5;

function AssetCard({ asset, isWatched = false, onToggleWatchlist, onAddToWatchlist, onOpen }) {
  const status = asset.momentum_label || classifyMomentum(asset.momentum_score);
  const level = status.toLowerCase();
  const price = asset.price_usd ?? asset.price;
  const change24h = asset.price_change_24h ?? asset.change_24h;
  const positive = change24h >= 0;
  const arrow = change24h > 0 ? '▲' : change24h < 0 ? '▼' : '';

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

  const avgVol = asset.avg_volume_7d ?? 0;
  const computedRatio = avgVol > 0 && asset.volume_24h ? asset.volume_24h / avgVol : 0;
  const ratio = safeVolumeRatio(asset.volume_ratio ?? computedRatio);
  // Clamp bar width to a safe 0-100% range
  const clampedPercent = Math.min(Math.max((ratio / VOLUME_BAR_MAX) * 100, 0), 100);

  return (
    <li className={`card card--${level}`}>
      {onOpen && (
        <button
          type="button"
          className="card__open"
          onClick={() => onOpen(asset.id)}
          aria-label={`Open ${asset.name} (${asset.symbol}) chart and details`}
        />
      )}

      <div className="card__head">
        <div className="card__id">
          <span className="card__symbol">{asset.symbol}</span>
          <h2 className="card__name">{asset.name}</h2>
        </div>
        <div className="card__head-actions">
          <button
            type="button"
            className={`star-btn ${isWatched ? 'is-watched' : ''}`}
            onClick={handleToggle}
            aria-label={isWatched ? `Remove ${asset.name} from watchlist` : `Add ${asset.name} to watchlist`}
            aria-pressed={isWatched}
            title={isWatched ? `Remove ${asset.name} from watchlist` : `Add ${asset.name} to watchlist`}
          >
            <span aria-hidden="true">{isWatched ? '★' : '☆'}</span>
          </button>
          <span className={`badge badge--${level}`}>{status}</span>
        </div>
      </div>

      <div className="card__price-row">
        <div className="card__quote">
          <span className="card__price num">{formatPrice(price)}</span>
          <span className={`card__change num ${positive ? 'is-up' : 'is-down'}`}>
            {arrow} {formatChange(change24h)}
            <span className="card__change-period">24h</span>
            <span className="visually-hidden"> in 24 hours</span>
          </span>
        </div>
        <MiniChart data={sparklineData} trend={positive ? 'up' : 'down'} />
      </div>

      <dl className="card__metrics">
        <div className="card__metric">
          <dt>Momentum</dt>
          <dd className={`num card__score card__score--${level}`}>{formatScore(asset.momentum_score)}</dd>
        </div>
        <div className="card__metric">
          <dt>Volume</dt>
          <dd className="num">{ratio > 0 ? `${ratio.toFixed(1)}× avg` : '—'}</dd>
        </div>
        <div className="card__metric">
          <dt>Vol 24h</dt>
          <dd className="num">{formatVolume(asset.volume_24h)}</dd>
        </div>
      </dl>

      <div
        className="vol-meter"
        role="progressbar"
        aria-label={`Volume ratio: ${ratio > 0 ? `${ratio.toFixed(1)}x average` : 'unavailable'}`}
        aria-valuenow={ratio}
        aria-valuemin="0"
        aria-valuemax={VOLUME_BAR_MAX}
      >
        <div className="vol-meter__fill" style={{ width: `${clampedPercent}%` }} />
        <span className="vol-meter__tick" style={{ left: `${(1 / VOLUME_BAR_MAX) * 100}%` }} aria-hidden="true" />
      </div>
    </li>
  );
}

export default memo(AssetCard);
