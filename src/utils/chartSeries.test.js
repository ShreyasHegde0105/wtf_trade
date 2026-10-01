import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyMomentum } from '../../shared/momentum.js';
import {
  TIMEFRAMES,
  getSeries,
  isTimeframeAvailable,
  safeVolumeRatio,
  summarizeMarket,
  summarizeSeries,
} from './chartSeries.js';

const asset = {
  sparkline_24h: [10, 11, 12],
  sparkline_7d: [8, 9, NaN, 10, 11, 12],
};

test('only timeframes backed by real asset fields are selectable', () => {
  assert.deepEqual(TIMEFRAMES.map((tf) => tf.key), ['1d', '7d', '30d', '3m']);
  assert.equal(isTimeframeAvailable(asset, '1d'), true);
  assert.equal(isTimeframeAvailable(asset, '7d'), true);
  assert.equal(isTimeframeAvailable(asset, '30d'), false);
  assert.equal(isTimeframeAvailable(asset, '3m'), false);
  assert.equal(isTimeframeAvailable({ sparkline_7d: [1] }, '7d'), false);
});

test('getSeries drops non-finite points and never fabricates data', () => {
  assert.deepEqual(getSeries(asset, '7d'), [8, 9, 10, 11, 12]);
  assert.deepEqual(getSeries(asset, '3m'), []);
  assert.deepEqual(getSeries(null, '7d'), []);
});

test('summarizeSeries reports high, low and period change', () => {
  assert.deepEqual(summarizeSeries([100, 120, 90, 110]), {
    high: 120, low: 90, first: 100, last: 110, changePct: 10,
  });
  assert.equal(summarizeSeries([1]), null);
});

test('safeVolumeRatio treats invalid ratios as unavailable', () => {
  assert.equal(safeVolumeRatio(2.4), 2.4);
  assert.equal(safeVolumeRatio(-1), 0);
  assert.equal(safeVolumeRatio(NaN), 0);
  assert.equal(safeVolumeRatio(Infinity), 0);
});

test('summarizeMarket derives counts from live assets only', () => {
  const result = summarizeMarket(
    [
      { momentum_score: 2, change_24h: 5, volume_24h: 100 },
      { momentum_score: 1.2, change_24h: -1, volume_24h: 50 },
      { momentum_score: 0.3, change_24h: 0, volume_24h: NaN },
    ],
    classifyMomentum,
  );
  assert.deepEqual(result, {
    total: 3, hot: 1, warming: 1, neutral: 1, advancers: 1, decliners: 1, volume: 150,
  });
});
