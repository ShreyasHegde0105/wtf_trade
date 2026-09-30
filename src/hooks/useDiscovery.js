import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiscovery } from '../services/api.js';

const REFRESH_MS = 300_000; // 5 minutes

const EMPTY = Object.freeze({
  trending: [],
  gainers: [],
  volume_spikes: [],
  new_listings: [],
});

/**
 * Fetches /api/feed/discovery on mount and every 5 minutes.
 * Returns { data, phase, error, refresh }.
 *   phase: 'loading' | 'ready' | 'error'
 * The timer is cleaned up on unmount. State updates after unmount are prevented.
 */
export function useDiscovery() {
  const [data, setData] = useState(EMPTY);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    // Abort any previous in-flight request
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const result = await fetchDiscovery(controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
      setPhase('ready');
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Keep existing data if we had some; only show error phase on first load
      setPhase((prev) => (prev === 'loading' ? 'error' : prev));
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);

    return () => {
      clearInterval(timerRef.current);
      controllerRef.current?.abort();
    };
  }, [load]);

  return { data, phase, error, refresh: load };
}
