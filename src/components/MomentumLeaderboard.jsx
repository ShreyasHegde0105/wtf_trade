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
      // Let a remount (e.g. StrictMode) start a fresh request instead of waiting on the aborted one.
      inFlightRef.current = false;
    };
  }, [load]);

  const topScore = leaderboard.reduce((max, asset) => Math.max(max, asset.momentum_score || 0), 0);

  return (
    <section className="leaderboard panel" aria-labelledby="leaderboard-title">
      <div className="section-head">
        <h2 id="leaderboard-title" className="section-head__title">Momentum Leaderboard</h2>
        <span className="section-head__sub">Top 10 by momentum score · refreshes every 60s</span>
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
          <table className="lb">
            <caption className="visually-hidden">Top 10 Momentum Ranked Assets</caption>
            <thead>
              <tr>
                <th scope="col" className="lb__th lb__th--rank"><abbr title="Rank">#</abbr></th>
                <th scope="col" className="lb__th">Asset</th>
                <th scope="col" className="lb__th lb__th--score">Score</th>
                <th scope="col" className="lb__th lb__th--status">Status</th>
                <th scope="col" className="lb__th lb__th--num">24h</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((asset, index) => {
                const rank = typeof asset.rank === 'number' ? asset.rank : index + 1;
                const isRankOne = rank === 1;
                const status = asset.momentum_label || classifyMomentum(asset.momentum_score);
                const change24h = asset.price_change_24h ?? asset.change_24h;
                const positive = change24h >= 0;
                const arrow = change24h > 0 ? '▲' : change24h < 0 ? '▼' : '';
                const scorePct = topScore > 0 ? Math.max((asset.momentum_score / topScore) * 100, 0) : 0;

                return (
                  <tr
                    key={asset.id || index}
                    className={`lb__row ${isRankOne ? 'lb__row--first' : ''}`}
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
                    <td className="lb__td lb__td--rank">
                      <span className={`lb__rank ${isRankOne ? 'lb__rank--first' : ''}`}>
                        {isRankOne ? `★${rank}` : rank}
                      </span>
                    </td>
                    <td className="lb__td">
                      <span className="lb__asset">
                        <span className="lb__symbol">{asset.symbol}</span>
                        <span className="lb__name">{asset.name}</span>
                      </span>
                    </td>
                    <td className="lb__td lb__td--score">
                      <span className="lb__score num">{formatScore(asset.momentum_score)}</span>
                      <span className="lb__bar" aria-hidden="true">
                        <span className={`lb__bar-fill lb__bar-fill--${status.toLowerCase()}`} style={{ width: `${scorePct}%` }} />
                      </span>
                    </td>
                    <td className="lb__td lb__td--status">
                      <span className={`badge badge--${status.toLowerCase()}`}>{status}</span>
                    </td>
                    <td className="lb__td lb__td--num">
                      <span className={`num ${positive ? 'is-up' : 'is-down'}`}>
                        {arrow} {formatChange(change24h)}
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
