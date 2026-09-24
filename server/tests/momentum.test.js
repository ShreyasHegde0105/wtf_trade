import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyMomentum, computeMomentumScore } from '../../shared/momentum.js';

const score = (priceChange24h, volume24h, avgVolume7d) =>
  computeMomentumScore({ priceChange24h, volume24h, avgVolume7d });

test('applies the v1 formula: abs(change) * 0.4 + volume / avg * 0.6', () => {
  assert.ok(Math.abs(score(5, 200, 100) - 3.2) < 1e-9);
  assert.ok(Math.abs(score(-5, 200, 100) - 3.2) < 1e-9); // sign of the change is ignored
});

test('classifies with the exact thresholds', () => {
  assert.equal(classifyMomentum(1.5001), 'Hot');
  assert.equal(classifyMomentum(1.5), 'Warming');
  assert.equal(classifyMomentum(1.0), 'Warming');
  assert.equal(classifyMomentum(0.9999), 'Neutral');
  assert.equal(classifyMomentum(0), 'Neutral');
});

test('zero or missing average volume drops the volume term instead of dividing by zero', () => {
  assert.ok(Math.abs(score(2, 500, 0) - 0.8) < 1e-9);
  assert.ok(Math.abs(score(2, 500, null) - 0.8) < 1e-9);
  assert.ok(Math.abs(score(2, 500, -10) - 0.8) < 1e-9);
});

test('missing, malformed and non-finite inputs never produce NaN or Infinity', () => {
  const inputs = [undefined, null, NaN, Infinity, -Infinity, 'abc', {}, []];
  for (const a of inputs) {
    for (const b of inputs) {
      for (const c of inputs) assert.ok(Number.isFinite(score(a, b, c)));
    }
  }
  assert.equal(score(undefined, undefined, undefined), 0);
});

test('numeric strings are accepted, junk classifies as Neutral', () => {
  assert.ok(Math.abs(score('5', '200', '100') - 3.2) < 1e-9);
  assert.equal(classifyMomentum(NaN), 'Neutral');
  assert.equal(classifyMomentum(undefined), 'Neutral');
});
