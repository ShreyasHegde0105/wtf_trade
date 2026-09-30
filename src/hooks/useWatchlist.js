import { useCallback, useEffect, useState } from 'react';

export const WATCHLIST_STORAGE_KEY = 'wtf_watchlist';

/**
 * Safely parses raw localStorage data into a clean, deduplicated array of string IDs.
 * Returns [] for missing, malformed, non-array, or invalid JSON.
 */
export function parseWatchlist(raw) {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    const result = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        const id = item.trim();
        if (id && !seen.has(id)) {
          seen.add(id);
          result.push(id);
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Reads the watchlist array from the given storage provider.
 * Catches any exceptions (e.g. SecurityError in private browsing or disabled storage).
 */
export function loadWatchlist(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(WATCHLIST_STORAGE_KEY);
    return parseWatchlist(raw);
  } catch {
    return [];
  }
}

/**
 * Persists the watchlist array to the storage provider.
 * Catches any exceptions without crashing.
 */
export function saveWatchlist(ids, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage) return;
  try {
    storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Graceful fallback if storage quota exceeded or storage disabled
  }
}

/**
 * Pure helper to add an ID without duplicates.
 */
export function addWatchlistId(ids, id) {
  if (!id || typeof id !== 'string') return ids;
  const cleanId = id.trim();
  if (!cleanId || ids.includes(cleanId)) return ids;
  return [...ids, cleanId];
}

/**
 * Pure helper to remove an ID.
 */
export function removeWatchlistId(ids, id) {
  if (!id) return ids;
  return ids.filter((item) => item !== id);
}

/**
 * Pure helper to toggle an ID.
 */
export function toggleWatchlistId(ids, id) {
  if (!id || typeof id !== 'string') return ids;
  const cleanId = id.trim();
  return ids.includes(cleanId)
    ? removeWatchlistId(ids, cleanId)
    : addWatchlistId(ids, cleanId);
}

/**
 * Custom hook to manage watched asset IDs with localStorage persistence.
 *
 * Exposes:
 * - watchedIds: string[]
 * - isWatched(assetId): boolean
 * - addToWatchlist(assetId): void
 * - removeFromWatchlist(assetId): void
 * - toggleWatchlist(assetId): void
 */
export function useWatchlist(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  const [watchedIds, setWatchedIds] = useState(() => loadWatchlist(storage));

  useEffect(() => {
    saveWatchlist(watchedIds, storage);
  }, [watchedIds, storage]);

  const isWatched = useCallback(
    (id) => (Boolean(id) && watchedIds.includes(id)),
    [watchedIds],
  );

  const addToWatchlist = useCallback((id) => {
    setWatchedIds((prev) => addWatchlistId(prev, id));
  }, []);

  const removeFromWatchlist = useCallback((id) => {
    setWatchedIds((prev) => removeWatchlistId(prev, id));
  }, []);

  const toggleWatchlist = useCallback((id) => {
    setWatchedIds((prev) => toggleWatchlistId(prev, id));
  }, []);

  return {
    watchedIds,
    isWatched,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
  };
}
