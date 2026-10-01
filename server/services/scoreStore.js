import { inList } from './supabase.js';

const newerThan = (a, b) => Date.parse(a.updated_at) > Date.parse(b.updated_at);

/**
 * Persists scoring-engine output. Every received score is appended to momentum_score_history
 * (deduplicated on symbol + updated_at, so retried deliveries are harmless). momentum_scores
 * keeps one row per symbol and never moves backwards in time, even if deliveries arrive out
 * of order. Symbols missing from `assets` are rejected (foreign key), not stored.
 */
export function createScoreStore({ db, now = () => new Date() }) {
  return {
    /** items: validated [{ symbol, score, signal, updated_at (ISO) }] */
    async saveScores(items) {
      const symbols = [...new Set(items.map((item) => item.symbol))];
      const filters = { symbol: inList(symbols) };
      const [known, stored] = await Promise.all([
        db.select('assets', { columns: 'symbol', filters }),
        db.select('momentum_scores', { columns: 'symbol,updated_at', filters }),
      ]);

      const knownSymbols = new Set(known.map((row) => row.symbol));
      const accepted = items.filter((item) => knownSymbols.has(item.symbol));
      const rejected = symbols
        .filter((symbol) => !knownSymbols.has(symbol))
        .map((symbol) => ({ symbol, reason: 'unknown symbol' }));
      if (accepted.length === 0) return { accepted: 0, rejected };

      const receivedAt = now().toISOString();
      await db.upsert(
        'momentum_score_history',
        accepted.map((item) => ({ ...item, received_at: receivedAt })),
        { onConflict: 'symbol,updated_at', ignoreDuplicates: true },
      );

      const newestPerSymbol = new Map();
      for (const item of accepted) {
        const best = newestPerSymbol.get(item.symbol);
        if (!best || newerThan(item, best)) newestPerSymbol.set(item.symbol, item);
      }
      const storedBySymbol = new Map(stored.map((row) => [row.symbol, row]));
      const latest = [...newestPerSymbol.values()].filter((item) => {
        const current = storedBySymbol.get(item.symbol);
        return !current || newerThan(item, current);
      });
      await db.upsert('momentum_scores', latest, { onConflict: 'symbol' });

      return { accepted: accepted.length, rejected };
    },
  };
}
