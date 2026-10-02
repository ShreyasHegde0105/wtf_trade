import { useEffect, useMemo, useReducer } from 'react';
import { fetchSnapshot, streamUrl } from '../services/api.js';
import { isSameAsset, sanitizeAsset } from '../utils/assets.js';

const FLUSH_MS = 300; // batch SSE events so a burst of updates renders once
const STREAM_RETRY_MS = 5000;
const SNAPSHOT_RETRY_BASE_MS = 2000;
const SNAPSHOT_RETRY_MAX_MS = 30_000;

const initialState = {
  assetsById: {},
  phase: 'loading', // loading | ready | error (error = no data at all yet)
  connection: 'connecting', // connecting | live | reconnecting
  lastUpdated: null,
  error: null,
};

function mergeAssets(assetsById, incoming) {
  let next = assetsById;
  for (const asset of incoming) {
    const current = next[asset.id];
    if (current && isSameAsset(current, asset)) continue; // keep identity so memoized cards skip
    if (next === assetsById) next = { ...assetsById };
    next[asset.id] = asset;
  }
  return next;
}

/** Replaces the active asset set and purges stale assets that dropped out of the universe. */
function replaceAssets(assetsById, incoming) {
  const next = {};
  for (const asset of incoming) {
    const current = assetsById[asset.id];
    next[asset.id] = current && isSameAsset(current, asset) ? current : asset;
  }
  return next;
}

function reducer(state, action) {
  switch (action.type) {
    case 'snapshot':
      return {
        ...state,
        phase: 'ready',
        error: null,
        assetsById: replaceAssets(state.assetsById, action.assets),
        lastUpdated: Date.now(),
      };
    case 'snapshotFailed':
      return state.phase === 'ready' ? state : { ...state, phase: 'error', error: action.message };
    case 'replace':
      return {
        ...state,
        assetsById: replaceAssets(state.assetsById, action.assets),
        lastUpdated: Date.now(),
      };
    case 'patch':
      return {
        ...state,
        assetsById: mergeAssets(state.assetsById, action.assets),
        lastUpdated: Date.now(),
      };
    case 'connection':
      return state.connection === action.value ? state : { ...state, connection: action.value };
    default:
      return state;
  }
}

/**
 * Loads /api/feed/snapshot first so the UI is populated immediately, then opens
 * the EventSource and applies per-asset updates. Everything is torn down on unmount.
 */
export function useMomentumFeed() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const controller = new AbortController();
    const pending = new Map();
    let cancelled = false;
    let source = null;
    let retryTimer = null;
    let flushTimer = null;
    let snapshotAttempts = 0;

    const flush = () => {
      flushTimer = null;
      if (pending.size === 0) return;
      const assets = [...pending.values()];
      pending.clear();
      dispatch({ type: 'patch', assets });
    };

    const handleMessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const list = Array.isArray(parsed)
          ? parsed
          : (Array.isArray(parsed?.assets) ? parsed.assets : null);
        if (list) {
          const assets = list.map(sanitizeAsset).filter(Boolean);
          if (assets.length > 0) {
            clearTimeout(flushTimer);
            flushTimer = null;
            pending.clear();
            dispatch({ type: 'replace', assets });
          }
          return;
        }
        const asset = sanitizeAsset(parsed);
        if (!asset) return;
        pending.set(asset.id, asset);
        flushTimer ??= setTimeout(flush, FLUSH_MS);
      } catch {
        // ignore malformed events
      }
    };

    const openStream = () => {
      if (cancelled) return;
      source = new EventSource(streamUrl());
      source.onopen = () => dispatch({ type: 'connection', value: 'live' });
      source.onmessage = handleMessage;
      source.onerror = () => {
        dispatch({ type: 'connection', value: 'reconnecting' });
        // The browser retries on its own unless it gave up (CLOSED); then we reopen manually.
        if (source.readyState === EventSource.CLOSED) {
          source.close();
          retryTimer = setTimeout(openStream, STREAM_RETRY_MS);
        }
      };
    };

    const loadSnapshot = async () => {
      try {
        const assets = await fetchSnapshot(controller.signal);
        if (cancelled) return;
        dispatch({ type: 'snapshot', assets });
        openStream();
      } catch (error) {
        if (cancelled || error.name === 'AbortError') return;
        snapshotAttempts += 1;
        dispatch({ type: 'snapshotFailed', message: 'Could not load market data.' });
        const delay = Math.min(SNAPSHOT_RETRY_BASE_MS * 2 ** (snapshotAttempts - 1), SNAPSHOT_RETRY_MAX_MS);
        retryTimer = setTimeout(loadSnapshot, delay);
      }
    };

    loadSnapshot();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      source?.close();
    };
  }, []);

  const assets = useMemo(() => Object.values(state.assetsById), [state.assetsById]);
  return { ...state, assets };
}
