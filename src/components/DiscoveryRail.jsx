import { memo, useState } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { useDiscovery } from '../hooks/useDiscovery.js';
import { DISCOVERY_CATEGORIES } from '../utils/discovery.js';
import { formatChange, formatScore } from '../utils/format.js';

function chipValue(category, asset) {
  if (category === 'gainers') return formatChange(asset.change_24h);
  if (category === 'volume_spikes') return formatScore(asset.momentum_score);
  return formatScore(asset.momentum_score);
}

function chipSecondary(category, asset) {
  if (category === 'gainers') return null;
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

export default function DiscoveryRail({ onSelectAsset }) {
  const { data, phase, error } = useDiscovery();
  const [activeCategory, setActiveCategory] = useState('trending');

  if (phase === 'loading') {
    return (
      <aside className="discovery discovery--loading" aria-label="Discovery rail loading">
        <div className="discovery__skeleton" aria-busy="true">Loading discovery…</div>
      </aside>
    );
  }

  if (phase === 'error' && !data?.trending?.length) {
    return (
      <aside className="discovery discovery--error" aria-label="Discovery rail">
        <p className="discovery__error">Discovery unavailable</p>
      </aside>
    );
  }

  const currentCategory =
    DISCOVERY_CATEGORIES.find((cat) => cat.key === activeCategory) || DISCOVERY_CATEGORIES[0];
  const activeAssets = data?.[currentCategory.key] || [];

  return (
    <aside className="discovery" aria-label="Discovery rail">
      {/* Tab Navigation */}
      <div className="discovery__tabs" role="tablist" aria-label="Discovery categories">
        {DISCOVERY_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              id={`discovery-tab-${cat.key}`}
              aria-selected={isActive}
              aria-controls={`discovery-panel-${cat.key}`}
              className={`discovery__tab ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Active Category Content */}
      <div
        id={`discovery-panel-${currentCategory.key}`}
        role="tabpanel"
        aria-labelledby={`discovery-tab-${currentCategory.key}`}
        className="discovery__content"
      >
        {activeAssets.length === 0 ? (
          <p className="discovery__empty">{currentCategory.emptyText}</p>
        ) : (
          <div
            className="discovery__scroll"
            role="list"
            aria-label={`${currentCategory.label} assets`}
          >
            {activeAssets.map((asset) => (
              <div role="listitem" key={asset.id}>
                <MemoChip
                  asset={asset}
                  category={currentCategory.key}
                  onSelect={onSelectAsset}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
