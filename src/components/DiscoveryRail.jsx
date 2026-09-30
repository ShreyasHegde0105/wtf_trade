import { memo } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { useDiscovery } from '../hooks/useDiscovery.js';
import { formatChange, formatScore } from '../utils/format.js';

const CATEGORIES = [
  { key: 'trending', label: 'Trending', emptyText: 'No trending assets' },
  { key: 'gainers', label: 'Gainers', emptyText: 'No gainers' },
  { key: 'volume_spikes', label: 'Volume Spikes', emptyText: 'No volume spikes' },
  { key: 'new_listings', label: 'New Listings', emptyText: 'No new listings' },
];

function chipValue(category, asset) {
  if (category === 'gainers') return formatChange(asset.change_24h);
  if (category === 'volume_spikes') return formatScore(asset.momentum_score);
  return formatScore(asset.momentum_score);
}

function chipSecondary(category, asset) {
  if (category === 'gainers') return null; // change is the primary value
  return formatChange(asset.change_24h);
}

function DiscoveryChip({ asset, category, onSelect }) {
  const positive = asset.change_24h >= 0;
  const status = classifyMomentum(asset.momentum_score);

  return (
    <button
      type="button"
      className="discovery__chip"
      onClick={() => onSelect(asset)}
      aria-label={`${asset.name} (${asset.symbol}): ${formatChange(asset.change_24h)}`}
    >
      <span className="discovery__chip-name">{asset.symbol}</span>
      <span className={`discovery__chip-value ${positive ? 'is-up' : 'is-down'}`}>
        {chipValue(category, asset)}
      </span>
      {chipSecondary(category, asset) && (
        <span className={`discovery__chip-sub ${positive ? 'is-up' : 'is-down'}`}>
          {chipSecondary(category, asset)}
        </span>
      )}
      <span
        className={`discovery__chip-dot discovery__chip-dot--${status.toLowerCase()}`}
        aria-hidden="true"
      />
    </button>
  );
}

const MemoChip = memo(DiscoveryChip);

function CategoryStrip({ category, assets, emptyText, onSelect }) {
  return (
    <div className="discovery__category">
      <h3 className="discovery__heading">{category.label}</h3>
      {assets.length === 0 ? (
        <p className="discovery__empty">{emptyText}</p>
      ) : (
        <div className="discovery__scroll" role="list" aria-label={`${category.label} assets`}>
          {assets.map((asset) => (
            <div role="listitem" key={asset.id}>
              <MemoChip asset={asset} category={category.key} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DiscoveryRail({ onSelectAsset }) {
  const { data, phase, error } = useDiscovery();

  if (phase === 'loading') {
    return (
      <aside className="discovery discovery--loading" aria-label="Discovery rail loading">
        <div className="discovery__skeleton" aria-busy="true">Loading discovery…</div>
      </aside>
    );
  }

  if (phase === 'error' && !data.trending.length) {
    return (
      <aside className="discovery discovery--error" aria-label="Discovery rail">
        <p className="discovery__error">Discovery unavailable</p>
      </aside>
    );
  }

  return (
    <aside className="discovery" aria-label="Discovery rail">
      {CATEGORIES.map((cat) => (
        <CategoryStrip
          key={cat.key}
          category={cat}
          assets={data[cat.key]}
          emptyText={cat.emptyText}
          onSelect={onSelectAsset}
        />
      ))}
    </aside>
  );
}
