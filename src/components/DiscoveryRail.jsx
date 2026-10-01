import { memo, useRef, useState } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { useDiscovery } from '../hooks/useDiscovery.js';
import { DEFAULT_DISCOVERY_CATEGORY, DISCOVERY_CATEGORIES } from '../utils/discovery.js';
import { formatChange, formatScore } from '../utils/format.js';

function chipValue(category, asset) {
  if (category === 'gainers') return formatChange(asset.change_24h);
  if (category === 'volume_spikes' && asset.volume_ratio > 0) return `${asset.volume_ratio.toFixed(1)}×`;
  return formatScore(asset.momentum_score);
}

function chipMetricLabel(category, asset) {
  if (category === 'gainers') return '24h';
  if (category === 'volume_spikes' && asset.volume_ratio > 0) return 'vol';
  return 'mom';
}

function chipSecondary(category, asset) {
  if (category === 'gainers') return null;
  return formatChange(asset.change_24h);
}

function DiscoveryChip({ asset, category, onSelect }) {
  const positive = asset.change_24h >= 0;
  const status = classifyMomentum(asset.momentum_score);
  const level = status.toLowerCase();
  const secondary = chipSecondary(category, asset);

  return (
    <button
      type="button"
      className={`scan-chip scan-chip--${level}`}
      onClick={() => onSelect(asset)}
      aria-label={`${asset.name} (${asset.symbol}): ${formatChange(asset.change_24h)}, ${status}`}
    >
      <span className="scan-chip__row">
        <span className="scan-chip__symbol">{asset.symbol}</span>
        <span className={`scan-chip__status scan-chip__status--${level}`}>{status}</span>
      </span>
      <span className="scan-chip__row">
        <span className={`scan-chip__value num ${category === 'gainers' ? (positive ? 'is-up' : 'is-down') : ''}`}>
          {chipValue(category, asset)}
          <span className="scan-chip__unit">{chipMetricLabel(category, asset)}</span>
        </span>
        {secondary && (
          <span className={`scan-chip__sub num ${positive ? 'is-up' : 'is-down'}`}>{secondary}</span>
        )}
      </span>
    </button>
  );
}

const MemoChip = memo(DiscoveryChip);

function RailFrame({ children, count }) {
  return (
    <section id="discover" className="discovery panel" aria-label="Discovery rail">
      <div className="section-head">
        <h2 className="section-head__title">Discover</h2>
        <span className="section-head__sub">Market scanner{count != null ? ` · ${count} signals` : ''}</span>
      </div>
      {children}
    </section>
  );
}

export default function DiscoveryRail({ onSelectAsset }) {
  const { data, phase } = useDiscovery();
  const [activeCategory, setActiveCategory] = useState(DEFAULT_DISCOVERY_CATEGORY);
  const tabRefs = useRef({});

  if (phase === 'loading') {
    return (
      <RailFrame>
        <div className="discovery__skeleton" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="scan-chip scan-chip--skeleton" />)}
          <span className="visually-hidden">Loading discovery…</span>
        </div>
      </RailFrame>
    );
  }

  if (phase === 'error' && !data?.trending?.length) {
    return (
      <RailFrame>
        <p className="discovery__error">Discovery unavailable</p>
      </RailFrame>
    );
  }

  const currentCategory =
    DISCOVERY_CATEGORIES.find((cat) => cat.key === activeCategory) || DISCOVERY_CATEGORIES[0];
  const activeAssets = data?.[currentCategory.key] || [];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const handleTabKeyDown = (event) => {
    const index = DISCOVERY_CATEGORIES.findIndex((cat) => cat.key === currentCategory.key);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = DISCOVERY_CATEGORIES[(index + step + DISCOVERY_CATEGORIES.length) % DISCOVERY_CATEGORIES.length];
    setActiveCategory(next.key);
    tabRefs.current[next.key]?.focus();
  };

  return (
    <RailFrame count={activeAssets.length}>
      <div className="discovery__tabs" role="tablist" aria-label="Discovery categories">
        {DISCOVERY_CATEGORIES.map((cat) => {
          const isActive = currentCategory.key === cat.key;
          const count = data?.[cat.key]?.length ?? 0;
          return (
            <button
              key={cat.key}
              ref={(el) => { tabRefs.current[cat.key] = el; }}
              type="button"
              role="tab"
              id={`discovery-tab-${cat.key}`}
              aria-selected={isActive}
              aria-controls={`discovery-panel-${cat.key}`}
              tabIndex={isActive ? 0 : -1}
              className={`discovery__tab ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveCategory(cat.key)}
              onKeyDown={handleTabKeyDown}
            >
              {cat.label}
              <span className="discovery__tab-count num">{count}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`discovery-panel-${currentCategory.key}`}
        role="tabpanel"
        aria-labelledby={`discovery-tab-${currentCategory.key}`}
        className="discovery__content"
      >
        {activeAssets.length === 0 ? (
          <p className="discovery__empty">{currentCategory.emptyText}</p>
        ) : (
          <div className="discovery__scroll" role="list" aria-label={`${currentCategory.label} assets`}>
            {activeAssets.map((asset) => (
              <div role="listitem" key={asset.id}>
                <MemoChip asset={asset} category={currentCategory.key} onSelect={onSelectAsset} />
              </div>
            ))}
          </div>
        )}
      </div>
    </RailFrame>
  );
}
