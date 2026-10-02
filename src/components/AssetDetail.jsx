import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import {
  DEFAULT_TIMEFRAME,
  TIMEFRAMES,
  getSeries,
  isTimeframeAvailable,
  safeVolumeRatio,
  summarizeSeries,
} from '../utils/chartSeries.js';
import { formatChange, formatPrice, formatScore, formatVolume } from '../utils/format.js';
import PriceChart from './PriceChart.jsx';

/**
 * Asset detail drawer. `asset` is the live feed object, so prices keep updating
 * from the shared SSE stream while the drawer is open.
 */
export default function AssetDetail({ asset, isWatched, onToggleWatchlist, onClose }) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const [timeframe, setTimeframe] = useState(() =>
    isTimeframeAvailable(asset, DEFAULT_TIMEFRAME) ? DEFAULT_TIMEFRAME : '1d',
  );

  // Focus the dialog on open, restore focus on close, close on Escape, lock page scroll.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll('button:not([disabled])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const points = useMemo(() => getSeries(asset, timeframe), [asset, timeframe]);
  const range = useMemo(() => summarizeSeries(points), [points]);

  const status = asset.momentum_label || classifyMomentum(asset.momentum_score);
  const level = status.toLowerCase();
  const price = asset.price_usd ?? asset.price;
  const change24h = asset.price_change_24h ?? asset.change_24h;
  const positive = change24h >= 0;
  const arrow = change24h > 0 ? '▲' : change24h < 0 ? '▼' : '';
  const avgVol = asset.avg_volume_7d ?? 0;
  const ratio = safeVolumeRatio(asset.volume_ratio ?? (avgVol > 0 && asset.volume_24h ? asset.volume_24h / avgVol : 0));
  const activeTf = TIMEFRAMES.find((tf) => tf.key === timeframe);

  return (
    <div className="detail" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={panelRef} className="detail__panel" role="dialog" aria-modal="true" aria-labelledby="asset-detail-title">
        <header className="detail__head">
          <div className="detail__id">
            <h2 id="asset-detail-title" className="detail__title">
              <span className="detail__symbol">{asset.symbol}</span>
              <span className="detail__name">{asset.name}</span>
            </h2>
            <span className="detail__type">{asset.asset_type === 'equity' ? 'Equity' : 'Crypto'} · USD</span>
          </div>
          <div className="detail__actions">
            <button
              type="button"
              className={`star-btn star-btn--labelled ${isWatched ? 'is-watched' : ''}`}
              onClick={() => onToggleWatchlist(asset.id)}
              aria-pressed={isWatched}
            >
              <span aria-hidden="true">{isWatched ? '★' : '☆'}</span>
              {isWatched ? 'Watching' : 'Watch'}
            </button>
            <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </header>

        <div className="detail__quote">
          <span className="detail__price num">{formatPrice(price)}</span>
          <span className={`detail__change num ${positive ? 'is-up' : 'is-down'}`}>
            {arrow} {formatChange(change24h)}
            <span className="card__change-period">24h</span>
          </span>
          <span className={`badge badge--${level}`}>{status}</span>
        </div>

        <div className="detail__chart-bar">
          <div className="tf" role="group" aria-label="Chart timeframe">
            {TIMEFRAMES.map((tf) => {
              const available = isTimeframeAvailable(asset, tf.key);
              return (
                <button
                  key={tf.key}
                  type="button"
                  className="tf__btn"
                  aria-pressed={tf.key === timeframe}
                  disabled={!available}
                  title={available ? tf.description : `${tf.description}: not provided by the data feed yet`}
                  onClick={() => setTimeframe(tf.key)}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
          <span className="detail__chart-kind">Line · hourly</span>
        </div>

        <PriceChart points={points} label={`${asset.symbol} ${activeTf?.description ?? ''} price`} />

        <div className="detail__axis-labels" aria-hidden="true">
          <span>{timeframe === '1d' ? '24h ago' : '7d ago'}</span>
          <span>Now</span>
        </div>

        <dl className="detail__stats">
          <div>
            <dt>Momentum</dt>
            <dd className={`num card__score card__score--${level}`}>{formatScore(asset.momentum_score)}</dd>
          </div>
          <div>
            <dt>Volume vs avg</dt>
            <dd className="num">{ratio > 0 ? `${ratio.toFixed(2)}×` : '—'}</dd>
          </div>
          <div>
            <dt>24h change</dt>
            <dd className={`num ${positive ? 'is-up' : 'is-down'}`}>{formatChange(change24h)}</dd>
          </div>
          <div>
            <dt>24h volume</dt>
            <dd className="num">{formatVolume(asset.volume_24h)}</dd>
          </div>
          <div>
            <dt>{activeTf?.label} open</dt>
            <dd className="num">{range ? formatPrice(range.first) : '—'}</dd>
          </div>
          <div>
            <dt>{activeTf?.label} high</dt>
            <dd className="num">{range ? formatPrice(range.high) : '—'}</dd>
          </div>
          <div>
            <dt>{activeTf?.label} low</dt>
            <dd className="num">{range ? formatPrice(range.low) : '—'}</dd>
          </div>
          <div>
            <dt>{activeTf?.label} change</dt>
            <dd className={`num ${range && range.changePct < 0 ? 'is-down' : 'is-up'}`}>
              {range ? formatChange(range.changePct) : '—'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
