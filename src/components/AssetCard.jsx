import { memo } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { formatChange, formatPrice, formatScore, formatVolume } from '../utils/format.js';
import MiniChart from './MiniChart.jsx';

function AssetCard({ asset }) {
  const status = classifyMomentum(asset.momentum_score);
  const positive = asset.change_24h >= 0;
  const arrow = asset.change_24h > 0 ? '▲' : asset.change_24h < 0 ? '▼' : '';

  return (
    <li className="card">
      <div className="card__head">
        <div className="card__id">
          <h2 className="card__name">{asset.name}</h2>
          <span className="card__symbol">{asset.symbol}</span>
        </div>
        <span className={`badge badge--${status.toLowerCase()}`}>{status}</span>
      </div>

      <div className="card__price-row">
        <span className="card__price">{formatPrice(asset.price)}</span>
        <span className={`card__change ${positive ? 'is-up' : 'is-down'}`}>
          {arrow} {formatChange(asset.change_24h)}
          <span className="visually-hidden"> in 24 hours</span>
        </span>
      </div>

      <MiniChart prices={asset.sparkline_24h} positive={positive} />

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
