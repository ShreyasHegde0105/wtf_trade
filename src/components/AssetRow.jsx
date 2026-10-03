import { memo } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { safeVolumeRatio } from '../utils/chartSeries.js';
import { formatChange, formatPrice, formatScore, formatVolume } from '../utils/format.js';
import MiniChart from './MiniChart.jsx';

function AssetRow({ asset, isWatched = false, onToggleWatchlist, onOpen }) {
  const status = asset.momentum_label || classifyMomentum(asset.momentum_score);
  const level = status.toLowerCase();
  const price = asset.price_usd ?? asset.price;
  const change24h = asset.price_change_24h ?? asset.change_24h;
  const positive = change24h >= 0;

  const sparklineData =
    asset.sparkline_7d && asset.sparkline_7d.length > 0
      ? asset.sparkline_7d
      : asset.sparkline_24h || [];

  const avgVol = asset.avg_volume_7d ?? 0;
  const computedRatio = avgVol > 0 && asset.volume_24h ? asset.volume_24h / avgVol : 0;
  const ratio = safeVolumeRatio(asset.volume_ratio ?? computedRatio);

  return (
    <tr
      className={`mkt-row mkt-row--${level}`}
      onClick={() => onOpen?.(asset.id)}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(asset.id);
              }
            }
          : undefined
      }
      aria-label={`${asset.name} (${asset.symbol}), ${formatPrice(price)}, ${formatChange(change24h)} 24h. Click to open details.`}
    >
      {/* Asset: dot + symbol + name */}
      <td className="mkt-td mkt-td--asset">
        <div className="mkt-asset">
          <span className={`dot dot--${level}`} aria-hidden="true" />
          <div className="mkt-asset__id">
            <span className="mkt-asset__symbol">{asset.symbol}</span>
            <span className="mkt-asset__name">{asset.name}</span>
          </div>
        </div>
      </td>

      {/* Price */}
      <td className="mkt-td mkt-td--num">
        <span className="num">{formatPrice(price)}</span>
      </td>

      {/* 24h change */}
      <td className={`mkt-td mkt-td--num ${positive ? 'is-up' : 'is-down'}`}>
        <span className="num">{formatChange(change24h)}</span>
      </td>

      {/* 24h Volume – hidden on small screens */}
      <td className="mkt-td mkt-td--num mkt-td--hide-sm">
        <span className="num">{formatVolume(asset.volume_24h)}</span>
      </td>

      {/* Momentum score + volume ratio – hidden on small screens */}
      <td className="mkt-td mkt-td--num mkt-td--hide-sm">
        <div className="mkt-score">
          <span className={`num mkt-score__val mkt-score--${level}`}>
            {formatScore(asset.momentum_score)}
          </span>
          {ratio > 0 && (
            <span className="mkt-score__vol num">{ratio.toFixed(1)}&times;</span>
          )}
        </div>
      </td>

      {/* 7D sparkline – hidden on extra-small screens */}
      <td className="mkt-td mkt-td--spark mkt-td--hide-xs" aria-hidden="true">
        <MiniChart
          data={sparklineData}
          trend={positive ? 'up' : 'down'}
          width={64}
          height={26}
          strokeWidth={1.5}
        />
      </td>

      {/* Watchlist star – stop propagation so row click doesn't fire */}
      <td
        className="mkt-td mkt-td--action"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`star-btn ${isWatched ? 'is-watched' : ''}`}
          onClick={() => onToggleWatchlist?.(asset.id)}
          aria-label={
            isWatched
              ? `Remove ${asset.name} from watchlist`
              : `Add ${asset.name} to watchlist`
          }
          aria-pressed={isWatched}
          title={
            isWatched
              ? `Remove ${asset.name} from watchlist`
              : `Add ${asset.name} to watchlist`
          }
        >
          <span aria-hidden="true">{isWatched ? '★' : '☆'}</span>
        </button>
      </td>
    </tr>
  );
}

export default memo(AssetRow);
