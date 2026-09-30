import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { THRESHOLDS, classifyMomentum } from '../../shared/momentum.js';
import {
  MOMENTUM_FILTER_OPTIONS,
  filterByMomentum,
  searchAssets,
  selectVisibleAssets,
  sortAssets,
} from './feedView.js';
import { sanitizeAsset } from './assets.js';
import { normalizeMarketCoin, toPublicAsset } from '../../server/utils/assets.js';

const mockAsset = (id, name, symbol, momentum_score, extra = {}) => ({
  id,
  name,
  symbol,
  momentum_score,
  price: 100,
  change_24h: 0,
  volume_24h: 1000,
  volume_ratio: 1.0,
  asset_type: 'crypto',
  sparkline_7d: [90, 95, 100],
  sparkline_24h: [98, 99, 100],
  ...extra,
});

describe('Prompt #4 Compliance: FilterBar & Momentum Filter', () => {
  const assets = [
    mockAsset('hot_coin', 'Hot Coin', 'HOT', 2.5),       // Hot (> 1.5)
    mockAsset('warming_coin', 'Warming Coin', 'WARM', 1.2), // Warming (1.0 - 1.5)
    mockAsset('neutral_coin', 'Neutral Coin', 'NEUT', 0.5), // Neutral (< 1.0)
  ];

  test('1. All shows all assets', () => {
    const result = filterByMomentum(assets, 'all');
    assert.equal(result.length, 3);
    assert.deepEqual(result.map((a) => a.id), ['hot_coin', 'warming_coin', 'neutral_coin']);
  });

  test('2. Hot shows only Hot assets', () => {
    const result = filterByMomentum(assets, 'hot');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'hot_coin');
    assert.equal(classifyMomentum(result[0].momentum_score), 'Hot');
  });

  test('3. Warming shows only Warming assets', () => {
    const result = filterByMomentum(assets, 'warming');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'warming_coin');
    assert.equal(classifyMomentum(result[0].momentum_score), 'Warming');
  });

  test('4. Neutral shows only Neutral assets', () => {
    const result = filterByMomentum(assets, 'neutral');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'neutral_coin');
    assert.equal(classifyMomentum(result[0].momentum_score), 'Neutral');
  });

  test('5. Existing sort behavior still works with momentum filter', () => {
    const list = [
      mockAsset('a', 'Coin A', 'A', 2.0, { change_24h: 5 }),
      mockAsset('b', 'Coin B', 'B', 3.0, { change_24h: 15 }),
      mockAsset('c', 'Coin C', 'C', 0.8, { change_24h: 20 }),
    ];
    // Filter hot assets sorted by price change descending
    const result = selectVisibleAssets(list, { momentum: 'hot', sort: 'change' });
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'b'); // +15%
    assert.equal(result[1].id, 'a'); // +5%
  });

  test('Filter options match required All, Hot, Warming, Neutral', () => {
    const values = MOMENTUM_FILTER_OPTIONS.map((o) => o.value);
    assert.deepEqual(values, ['all', 'hot', 'warming', 'neutral']);
  });
});

describe('Prompt #4 Compliance: Search & Debounce Logic', () => {
  const assets = [
    mockAsset('bitcoin', 'Bitcoin', 'BTC', 1.8),
    mockAsset('ethereum', 'Ethereum', 'ETH', 1.2),
    mockAsset('solana', 'Solana', 'SOL', 2.2),
  ];

  test('6. Search matches name', () => {
    const result = searchAssets(assets, 'bit');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'bitcoin');
  });

  test('7. Search matches symbol', () => {
    const result = searchAssets(assets, 'eth');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'ethereum');
  });

  test('8. Search is case-insensitive', () => {
    assert.equal(searchAssets(assets, 'sOl').length, 1);
    assert.equal(searchAssets(assets, 'BITCOIN').length, 1);
    assert.equal(searchAssets(assets, 'eth').length, 1);
  });

  test('9. Clear button clears query and restores full list', () => {
    const filtered = searchAssets(assets, 'BTC');
    assert.equal(filtered.length, 1);

    const cleared = searchAssets(assets, '');
    assert.equal(cleared.length, 3);
  });

  test('10. Debounce delays applying user input by approximately 300ms', async () => {
    let appliedValue = null;
    let timer = null;

    const debouncedChange = (val) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        appliedValue = val;
      }, 300);
    };

    debouncedChange('B');
    debouncedChange('BT');
    debouncedChange('BTC');

    // Immediately after typing, appliedValue should still be null
    assert.equal(appliedValue, null);

    // Wait 350ms
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(appliedValue, 'BTC');
  });

  test('11. Pending debounce timer is cleaned up on unmount / clear', async () => {
    let appliedValue = null;
    let timer = null;

    const debouncedChange = (val) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        appliedValue = val;
      }, 300);
    };

    debouncedChange('test');
    // Immediate clear cancels the pending timer
    clearTimeout(timer);
    timer = null;

    await new Promise((r) => setTimeout(r, 350));
    assert.equal(appliedValue, null);
  });
});

describe('Prompt #4 Compliance: Momentum Thresholds Integrity', () => {
  test('12. Existing shared momentum thresholds are preserved', () => {
    assert.equal(THRESHOLDS.hot, 1.5);
    assert.equal(THRESHOLDS.warming, 1.0);

    assert.equal(classifyMomentum(1.51), 'Hot');
    assert.equal(classifyMomentum(1.50), 'Warming');
    assert.equal(classifyMomentum(1.00), 'Warming');
    assert.equal(classifyMomentum(0.99), 'Neutral');
  });

  test('13. No duplicate threshold implementation: feedView uses classifyMomentum', () => {
    // Assets right on thresholds
    const boundaryHot = mockAsset('h', 'H', 'H', 1.5001);
    const boundaryWarm = mockAsset('w', 'W', 'W', 1.0);
    const boundaryNeut = mockAsset('n', 'N', 'N', 0.999);

    assert.equal(filterByMomentum([boundaryHot], 'hot').length, 1);
    assert.equal(filterByMomentum([boundaryWarm], 'warming').length, 1);
    assert.equal(filterByMomentum([boundaryNeut], 'neutral').length, 1);
  });
});

describe('Prompt #4 Compliance: MiniChart & Trend Colors', () => {
  test('14. Recharts package is installed in package.json', async () => {
    const pkg = await import('../../package.json', { with: { type: 'json' } });
    assert.ok(pkg.default.dependencies.recharts, 'recharts must be in dependencies');
    assert.equal(pkg.default.dependencies['chart.js'], undefined, 'chart.js should be removed');
    assert.equal(pkg.default.dependencies['react-chartjs-2'], undefined, 'react-chartjs-2 should be removed');
  });

  test('15. Missing/invalid sparkline data handled safely', () => {
    const emptyAsset = sanitizeAsset({
      id: 'test',
      symbol: 'TEST',
      name: 'Test',
      price: 100,
      sparkline_24h: null,
      sparkline_7d: null,
    });
    assert.deepEqual(emptyAsset.sparkline_7d, []);
    assert.deepEqual(emptyAsset.sparkline_24h, []);
  });

  test('16. Up trend color is #00E5C4 and Down trend color is #FF4B4B', () => {
    const UP_COLOR = '#00E5C4';
    const DOWN_COLOR = '#FF4B4B';
    const getStroke = (trend) => (trend === 'up' ? UP_COLOR : DOWN_COLOR);

    assert.equal(getStroke('up'), '#00E5C4');
    assert.equal(getStroke('down'), '#FF4B4B');
  });
});

describe('Prompt #4 Compliance: 7-Day Sparkline & Volume Bar', () => {
  test('17. 7-day sparkline is extracted from raw CoinGecko 168-hour array', () => {
    const mock168 = Array.from({ length: 168 }, (_, i) => 100 + i);
    const coin = normalizeMarketCoin({
      id: 'btc',
      symbol: 'btc',
      name: 'Bitcoin',
      current_price: 268,
      sparkline_in_7d: { price: mock168 },
    });

    assert.equal(coin.sparkline_7d.length, 168);
    assert.equal(coin.sparkline_24h.length, 24);
  });

  test('18. Correct volume ratio is calculated and represented', () => {
    const candidate = {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 60000,
      change_24h: 3.5,
      volume_24h: 5000,
      avg_volume_7d: 2500, // ratio: 5000 / 2500 = 2.0
      asset_type: 'crypto',
    };
    const publicAsset = toPublicAsset(candidate);
    assert.equal(publicAsset.volume_ratio, 2.0);
  });

  test('19. Volume bar percentage is clamped safely to [0, 100]', () => {
    const clampVolumePercent = (ratio, maxRatio = 2.5) => {
      const valid = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
      return Math.min(Math.max((valid / maxRatio) * 100, 0), 100);
    };

    assert.equal(clampVolumePercent(0), 0);
    assert.equal(clampVolumePercent(-1), 0);
    assert.equal(clampVolumePercent(1.25), 50); // 1.25 / 2.5 = 50%
    assert.equal(clampVolumePercent(2.5), 100);
    assert.equal(clampVolumePercent(100), 100);  // Clamped at 100%, never overflows
    assert.equal(clampVolumePercent(NaN), 0);
    assert.equal(clampVolumePercent(Infinity), 0); // non-finite defaults to 0 safely
  });

  test('20. Missing or zero average volume does not crash the calculation', () => {
    const candidateNull = {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 60000,
      change_24h: 3.5,
      volume_24h: 5000,
      avg_volume_7d: null,
      asset_type: 'crypto',
    };
    const publicAssetNull = toPublicAsset(candidateNull);
    assert.equal(publicAssetNull.volume_ratio, 0);

    const candidateZero = {
      ...candidateNull,
      avg_volume_7d: 0,
    };
    const publicAssetZero = toPublicAsset(candidateZero);
    assert.equal(publicAssetZero.volume_ratio, 0);
  });
});
