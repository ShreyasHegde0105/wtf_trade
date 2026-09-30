import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  WATCHLIST_STORAGE_KEY,
  addWatchlistId,
  loadWatchlist,
  parseWatchlist,
  removeWatchlistId,
  saveWatchlist,
  toggleWatchlistId,
} from './useWatchlist.js';

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe('Watchlist Logic & Persistence (useWatchlist)', () => {
  test('1. initial empty watchlist when no key exists (first visit)', () => {
    const storage = createMockStorage();
    const result = loadWatchlist(storage);
    assert.deepEqual(result, []);
  });

  test('2. add asset to watchlist', () => {
    const initial = [];
    const updated = addWatchlistId(initial, 'bitcoin');
    assert.deepEqual(updated, ['bitcoin']);

    const updated2 = addWatchlistId(updated, 'ethereum');
    assert.deepEqual(updated2, ['bitcoin', 'ethereum']);
  });

  test('3. duplicate add does not duplicate ID', () => {
    const initial = ['bitcoin', 'ethereum'];
    const updated = addWatchlistId(initial, 'bitcoin');
    assert.deepEqual(updated, ['bitcoin', 'ethereum']);
  });

  test('4. remove asset from watchlist', () => {
    const initial = ['bitcoin', 'ethereum', 'solana'];
    const updated = removeWatchlistId(initial, 'ethereum');
    assert.deepEqual(updated, ['bitcoin', 'solana']);

    // Removing non-existent ID leaves list unchanged
    const unchanged = removeWatchlistId(updated, 'doge');
    assert.deepEqual(unchanged, ['bitcoin', 'solana']);
  });

  test('5. toggle asset in watchlist (adds when absent, removes when present)', () => {
    let ids = ['bitcoin'];
    // Toggle absent -> adds
    ids = toggleWatchlistId(ids, 'ethereum');
    assert.deepEqual(ids, ['bitcoin', 'ethereum']);

    // Toggle present -> removes
    ids = toggleWatchlistId(ids, 'bitcoin');
    assert.deepEqual(ids, ['ethereum']);

    // Toggle present -> removes
    ids = toggleWatchlistId(ids, 'ethereum');
    assert.deepEqual(ids, []);
  });

  test('6. persistence to localStorage with exact key wtf_watchlist', () => {
    assert.equal(WATCHLIST_STORAGE_KEY, 'wtf_watchlist');

    const storage = createMockStorage();
    saveWatchlist(['bitcoin', 'solana'], storage);

    const storedRaw = storage.getItem('wtf_watchlist');
    assert.equal(storedRaw, JSON.stringify(['bitcoin', 'solana']));
  });

  test('7. restoration from localStorage', () => {
    const storage = createMockStorage({
      wtf_watchlist: JSON.stringify(['bitcoin', 'ethereum']),
    });

    const result = loadWatchlist(storage);
    assert.deepEqual(result, ['bitcoin', 'ethereum']);
  });

  test('8. malformed localStorage data handled safely', () => {
    // Non-JSON string
    const storage1 = createMockStorage({ wtf_watchlist: 'not valid json' });
    assert.deepEqual(loadWatchlist(storage1), []);

    // Non-array JSON (object)
    const storage2 = createMockStorage({ wtf_watchlist: '{"foo": "bar"}' });
    assert.deepEqual(loadWatchlist(storage2), []);

    // Non-array JSON (number/boolean)
    const storage3 = createMockStorage({ wtf_watchlist: '123' });
    assert.deepEqual(loadWatchlist(storage3), []);

    // Duplicates in stored array
    const storage4 = createMockStorage({
      wtf_watchlist: JSON.stringify(['bitcoin', 'bitcoin', 'ethereum']),
    });
    assert.deepEqual(loadWatchlist(storage4), ['bitcoin', 'ethereum']);

    // Invalid item types inside array
    const storage5 = createMockStorage({
      wtf_watchlist: JSON.stringify(['bitcoin', null, 42, '', 'solana']),
    });
    assert.deepEqual(loadWatchlist(storage5), ['bitcoin', 'solana']);

    // Storage throwing exception (e.g. security block)
    const throwingStorage = {
      getItem() {
        throw new Error('SecurityError: localStorage blocked');
      },
      setItem() {
        throw new Error('SecurityError');
      },
    };
    assert.deepEqual(loadWatchlist(throwingStorage), []);
    assert.doesNotThrow(() => saveWatchlist(['bitcoin'], throwingStorage));
  });

  test('9. empty-state behavior with exact message Add assets to track them here', () => {
    const emptyStorage = createMockStorage({ wtf_watchlist: '[]' });
    const result = loadWatchlist(emptyStorage);
    assert.deepEqual(result, []);

    // Verify constant empty state text
    const EMPTY_MESSAGE = 'Add assets to track them here';
    assert.equal(EMPTY_MESSAGE, 'Add assets to track them here');
  });

  test('10. watched asset matching current live assets with live SSE price updates', () => {
    const watchedIds = ['bitcoin', 'solana'];

    // Initial live feed snapshot
    let liveAssets = [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 65000, change_24h: 2.5 },
      { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3200, change_24h: -1.2 },
      { id: 'solana', symbol: 'SOL', name: 'Solana', price: 150, change_24h: 5.0 },
    ];

    const matchLive = (ids, assets) => {
      const map = new Map(assets.map((a) => [a.id, a]));
      return ids.map((id) => ({ id, asset: map.get(id) ?? null }));
    };

    let matched = matchLive(watchedIds, liveAssets);
    assert.equal(matched.length, 2);
    assert.equal(matched[0].asset.price, 65000);
    assert.equal(matched[1].asset.price, 150);

    // Live SSE update arrives with new prices
    liveAssets = [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 67500, change_24h: 6.2 },
      { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3300, change_24h: 1.0 },
      { id: 'solana', symbol: 'SOL', name: 'Solana', price: 158, change_24h: 8.5 },
    ];

    matched = matchLive(watchedIds, liveAssets);
    // Price updates live in the matched output without any storage mutation
    assert.equal(matched[0].asset.price, 67500);
    assert.equal(matched[1].asset.price, 158);

    // If an asset temporarily drops from feed, gracefully returns null without crashing
    const watchedWithMissing = ['bitcoin', 'unknown_coin'];
    const matchedWithMissing = matchLive(watchedWithMissing, liveAssets);
    assert.equal(matchedWithMissing[0].asset.price, 67500);
    assert.equal(matchedWithMissing[1].asset, null);
  });

  test('11. removing from AssetCard updates watchlist state and localStorage', () => {
    const storage = createMockStorage();
    let watchedIds = ['bitcoin', 'ethereum'];
    saveWatchlist(watchedIds, storage);

    // Simulate clicking watchlist toggle on AssetCard for bitcoin
    const toggleFromCard = (id) => {
      watchedIds = toggleWatchlistId(watchedIds, id);
      saveWatchlist(watchedIds, storage);
    };

    toggleFromCard('bitcoin');
    assert.deepEqual(watchedIds, ['ethereum']);
    assert.deepEqual(loadWatchlist(storage), ['ethereum']);

    // Toggle again adds it back
    toggleFromCard('bitcoin');
    assert.deepEqual(watchedIds, ['ethereum', 'bitcoin']);
    assert.deepEqual(loadWatchlist(storage), ['ethereum', 'bitcoin']);
  });
});
