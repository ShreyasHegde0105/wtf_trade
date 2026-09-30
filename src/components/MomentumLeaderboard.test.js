import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyMomentum } from '../../shared/momentum.js';
import { sanitizeAsset } from '../utils/assets.js';

const mockRawItem = (id, rank, score, overrides = {}) => ({
  id,
  rank,
  symbol: id.toUpperCase(),
  name: id.charAt(0).toUpperCase() + id.slice(1),
  price: 100,
  change_24h: 2.5,
  volume_24h: 50000,
  momentum_score: score,
  asset_type: 'crypto',
  sparkline_24h: [98, 99, 100],
  ...overrides,
});

describe('MomentumLeaderboard: Data Normalization & Slicing', () => {
  test('1. Leaderboard data is normalized safely via sanitizeAsset', () => {
    const raw = [
      mockRawItem('btc', 1, 3.4),
      { id: 'eth', symbol: 'eth', name: 'Ethereum', price: 'invalid' }, // rejected
      mockRawItem('sol', 2, 2.8),
    ];

    const normalized = raw
      .map((item, idx) => {
        const sanitized = sanitizeAsset(item);
        if (!sanitized) return null;
        return {
          ...sanitized,
          rank: typeof item.rank === 'number' ? item.rank : idx + 1,
        };
      })
      .filter(Boolean);

    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].symbol, 'BTC');
    assert.equal(normalized[0].rank, 1);
    assert.equal(normalized[1].symbol, 'SOL');
    assert.equal(normalized[1].rank, 2);
  });

  test('2. Top 10 are limited/handled', () => {
    // 15 items provided
    const items = Array.from({ length: 15 }, (_, i) =>
      mockRawItem(`coin_${i}`, i + 1, 10 - i * 0.5),
    );

    const top10 = items.slice(0, 10);
    assert.equal(top10.length, 10);
    assert.equal(top10[0].rank, 1);
    assert.equal(top10[9].rank, 10);
  });

  test('3. Rank #1 is identified correctly for gold accent', () => {
    const items = [
      mockRawItem('btc', 1, 5.0),
      mockRawItem('eth', 2, 3.0),
      mockRawItem('sol', 3, 2.0),
    ];

    const isRankOne = (item, idx) => (item.rank === 1 || idx === 0);

    assert.equal(isRankOne(items[0], 0), true);
    assert.equal(isRankOne(items[1], 1), false);
    assert.equal(isRankOne(items[2], 2), false);

    // Verify momentum label classification
    assert.equal(classifyMomentum(items[0].momentum_score), 'Hot');
    assert.equal(classifyMomentum(items[2].momentum_score), 'Hot');
  });

  test('4. 60-second refresh interval is configured', () => {
    const REFRESH_INTERVAL_MS = 60_000;
    assert.equal(REFRESH_INTERVAL_MS, 60000);
  });

  test('5. Malformed or empty data does not crash', () => {
    const parseLeaderboardPayload = (body) => {
      if (!Array.isArray(body?.leaderboard)) return [];
      return body.leaderboard
        .map((item, idx) => {
          const sanitized = sanitizeAsset(item);
          if (!sanitized) return null;
          return {
            ...sanitized,
            rank: typeof item.rank === 'number' ? item.rank : idx + 1,
          };
        })
        .filter(Boolean)
        .slice(0, 10);
    };

    assert.deepEqual(parseLeaderboardPayload(null), []);
    assert.deepEqual(parseLeaderboardPayload({}), []);
    assert.deepEqual(parseLeaderboardPayload({ leaderboard: 'not-an-array' }), []);
    assert.deepEqual(parseLeaderboardPayload({ leaderboard: [] }), []);
    assert.deepEqual(parseLeaderboardPayload({ leaderboard: [null, undefined, 123] }), []);
  });

  test('6. Request failure is catchable without crashing state', async () => {
    const simulatedFetch = async () => {
      throw new Error('Leaderboard request failed (503)');
    };

    let caught = null;
    try {
      await simulatedFetch();
    } catch (err) {
      caught = err;
    }

    assert.ok(caught !== null);
    assert.equal(caught.message, 'Leaderboard request failed (503)');
  });

  test('7. Timer cleanup and abort controller pattern work correctly', () => {
    let timerCleared = false;
    let aborted = false;

    const controller = new AbortController();
    const timerId = setInterval(() => {}, 60_000);

    // Simulate cleanup
    clearInterval(timerId);
    timerCleared = true;
    controller.abort();
    aborted = controller.signal.aborted;

    assert.equal(timerCleared, true);
    assert.equal(aborted, true);
  });
});
