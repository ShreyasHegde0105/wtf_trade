import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { classifyMomentum } from '../../shared/momentum.js';
import { fetchLeaderboard } from '../services/api.js';
import { formatChange, formatScore } from '../utils/format.js';

const REFRESH_INTERVAL_MS = 60_000; // 60 seconds

export function MomentumLeaderboard({ onSelectAsset }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const controllerRef = useRef(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    // Avoid starting concurrent overlapping requests
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const data = await fetchLeaderboard(controller.signal);
      if (controller.signal.aborted) return;
      setLeaderboard(Array.isArray(data) ? data.slice(0, 10) : []);
      setPhase('ready');
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      // If we don't have any data yet, show error phase; otherwise retain stale data silently
      setPhase((prev) => (prev === 'loading' ? 'error' : prev));
      setError(err.message || 'Could not load leaderboard.');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timerRef.current);
      controllerRef.current?.abort();
    };
  }, [load]);

  return (
    <section className="leaderboard" aria-label="Momentum Leaderboard">
      <div className="leaderboard__header">
        <h2 className="leaderboard__title">Momentum Leaderboard</h2>
        <span className="leaderboard__subtitle">Top 10 assets by momentum score</span>
      </div>

      {phase === 'loading' && (
        <div className="leaderboard__state leaderboard__state--loading" aria-busy="true">
          Loading leaderboard…
        </div>
      )}

      {phase === 'error' && leaderboard.length === 0 && (
        <div className="leaderboard__state leaderboard__state--error" role="alert">
          {error || 'Leaderboard temporarily unavailable'}
        </div>
      )}

      {phase === 'ready' && leaderboard.length === 0 && (
        <p className="leaderboard__empty">No leaderboard data available</p>
      )}

      {leaderboard.length > 0 && (
        <div className="leaderboard__table-container">
          <table className="leaderboard__table">
            <caption className="visually-hidden">Top 10 Momentum Ranked Assets</caption>
            <thead>
              <tr>
                <th scope="col" className="leaderboard__th leaderboard__th--rank">Rank</th>
                <th scope="col" className="leaderboard__th leaderboard__th--asset">Asset</th>
                <th scope="col" className="leaderboard__th leaderboard__th--score">Score</th>
                <th scope="col" className="leaderboard__th leaderboard__th--label">Momentum</th>
                <th scope="col" className="leaderboard__th leaderboard__th--change">24h Change</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((asset, index) => {
                const rank = typeof asset.rank === 'number' ? asset.rank : index + 1;
                const isRankOne = rank === 1;
                const status = classifyMomentum(asset.momentum_score);
                const positive = asset.change_24h >= 0;
                const arrow = asset.change_24h > 0 ? '▲' : asset.change_24h < 0 ? '▼' : '';

                return (
                  <tr
                    key={asset.id || index}
                    className={`leaderboard__row ${isRankOne ? 'leaderboard__row--first' : ''}`}
                    onClick={() => onSelectAsset?.(asset)}
                    role={onSelectAsset ? 'button' : undefined}
                    tabIndex={onSelectAsset ? 0 : undefined}
                    onKeyDown={
                      onSelectAsset
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectAsset(asset);
                            }
                          }
                        : undefined
                    }
                    aria-label={
                      onSelectAsset
                        ? `Rank ${rank}: ${asset.name} (${asset.symbol}), Score: ${formatScore(asset.momentum_score)}, Status: ${status}`
                        : undefined
                    }
                  >
                    <td className="leaderboard__td leaderboard__td--rank">
                      <span className={`leaderboard__rank-badge ${isRankOne ? 'leaderboard__rank-badge--first' : ''}`}>
                        {isRankOne ? `★ ${rank}` : rank}
                      </span>
                    </td>
                    <td className="leaderboard__td leaderboard__td--asset">
                      <div className="leaderboard__asset-info">
                        <span className="leaderboard__symbol">{asset.symbol}</span>
                        <span className="leaderboard__name">{asset.name}</span>
                      </div>
                    </td>
                    <td className="leaderboard__td leaderboard__td--score">
                      <span className="leaderboard__score">{formatScore(asset.momentum_score)}</span>
                    </td>
                    <td className="leaderboard__td leaderboard__td--label">
                      <span className={`badge badge--${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </td>
                    <td className="leaderboard__td leaderboard__td--change">
                      <span className={`leaderboard__change ${positive ? 'is-up' : 'is-down'}`}>
                        {arrow} {formatChange(asset.change_24h)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default memo(MomentumLeaderboard);
