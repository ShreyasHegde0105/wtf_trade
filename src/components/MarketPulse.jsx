import { memo, useMemo } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { summarizeMarket } from '../utils/chartSeries.js';
import { sortAssets } from '../utils/feedView.js';
import { formatChange, formatPrice, formatVolume } from '../utils/format.js';
import MiniChart from './MiniChart.jsx';

const TICKER_COUNT = 8;

function PulseTicker({ asset, onOpen }) {
  const level = classifyMomentum(asset.momentum_score).toLowerCase();
  const positive = asset.change_24h >= 0;
  const spark = asset.sparkline_24h?.length > 1 ? asset.sparkline_24h : asset.sparkline_7d;
  return (
    <li>
      <button
        type="button"
        className="ticker"
        onClick={() => onOpen(asset.id)}
        aria-label={`${asset.name} ${formatPrice(asset.price)}, ${formatChange(asset.change_24h)} in 24 hours. Open details`}
      >
        <span className="ticker__top">
          <span className={`dot dot--${level}`} aria-hidden="true" />
          <span className="ticker__symbol">{asset.symbol}</span>
          <span className={`ticker__change num ${positive ? 'is-up' : 'is-down'}`}>{formatChange(asset.change_24h)}</span>
        </span>
        <span className="ticker__bottom">
          <span className="ticker__price num">{formatPrice(asset.price)}</span>
          <MiniChart data={spark} trend={positive ? 'up' : 'down'} width={48} height={20} strokeWidth={1.5} />
        </span>
      </button>
    </li>
  );
}

/**
 * Compact market context strip derived entirely from the live feed: breadth and
 * momentum distribution across tracked assets, plus the strongest movers.
 */
function MarketPulse({ assets = [], phase, onOpenAsset }) {
  const summary = useMemo(() => summarizeMarket(assets, classifyMomentum), [assets]);
  const movers = useMemo(() => sortAssets(assets, 'momentum').slice(0, TICKER_COUNT), [assets]);

  const breadth = summary.advancers + summary.decliners;
  const advPct = breadth > 0 ? (summary.advancers / breadth) * 100 : 0;

  return (
    <section className="pulse" aria-labelledby="pulse-title">
      <div className="section-head">
        <h2 id="pulse-title" className="section-head__title">Market Pulse</h2>
        <span className="section-head__sub">Moving now · by momentum</span>
      </div>

      <div className="pulse__body">
        <dl className="pulse__stats">
          <div className="stat">
            <dt>Tracked</dt>
            <dd className="num">{phase === 'ready' ? summary.total : '—'}</dd>
          </div>
          <div className="stat">
            <dt>Hot</dt>
            <dd className="num stat--hot">{phase === 'ready' ? summary.hot : '—'}</dd>
          </div>
          <div className="stat">
            <dt>Warming</dt>
            <dd className="num stat--warming">{phase === 'ready' ? summary.warming : '—'}</dd>
          </div>
          <div className="stat stat--wide">
            <dt>Breadth 24h</dt>
            <dd>
              {phase === 'ready' && breadth > 0 ? (
                <>
                  <span className="num">
                    <span className="is-up">{summary.advancers}▲</span>{' '}
                    <span className="is-down">{summary.decliners}▼</span>
                  </span>
                  <span
                    className="breadth"
                    role="img"
                    aria-label={`${summary.advancers} advancing, ${summary.decliners} declining`}
                  >
                    <span className="breadth__up" style={{ width: `${advPct}%` }} />
                  </span>
                </>
              ) : (
                <span className="num">—</span>
              )}
            </dd>
          </div>
          <div className="stat">
            <dt>Vol 24h (tracked)</dt>
            <dd className="num">{phase === 'ready' ? formatVolume(summary.volume) : '—'}</dd>
          </div>
        </dl>

        {movers.length > 0 ? (
          <ul className="pulse__tickers" aria-label="Top momentum movers">
            {movers.map((asset) => (
              <PulseTicker key={asset.id} asset={asset} onOpen={onOpenAsset} />
            ))}
          </ul>
        ) : (
          <div className="pulse__tickers pulse__tickers--loading" aria-busy={phase === 'loading'}>
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="ticker ticker--skeleton" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(MarketPulse);
