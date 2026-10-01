import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssetRegistry } from '../services/assetRegistry.js';
import { createScoreStore } from '../services/scoreStore.js';
import { createSupabaseClient, DatabaseError, inList } from '../services/supabase.js';

const silent = { info() {}, warn() {}, error() {} };

/** In-memory stand-in for the Supabase client: tables keyed by their conflict columns. */
function createFakeDb(tables = {}) {
  const data = { assets: [], momentum_scores: [], momentum_score_history: [], ...tables };
  const calls = [];
  return {
    data,
    calls,
    async select(table, { filters }) {
      calls.push(['select', table]);
      const wanted = filters.symbol.slice('in.('.length, -1).split(',').map((s) => JSON.parse(s));
      return data[table].filter((row) => wanted.includes(row.symbol));
    },
    async upsert(table, rows, { onConflict, ignoreDuplicates }) {
      calls.push(['upsert', table, rows.length]);
      const keys = onConflict.split(',');
      for (const row of rows) {
        const index = data[table].findIndex((existing) => keys.every((k) => existing[k] === row[k]));
        if (index === -1) data[table].push(row);
        else if (!ignoreDuplicates) data[table][index] = row;
      }
    },
  };
}

const score = (symbol, updatedAt, value = 1) => ({ symbol, score: value, signal: 'bullish', updated_at: updatedAt });

test('scoreStore rejects unknown symbols and writes history plus the latest score', async () => {
  const db = createFakeDb({ assets: [{ symbol: 'BTC' }, { symbol: 'ETH' }] });
  const store = createScoreStore({ db, now: () => new Date('2026-10-01T10:16:00Z') });

  const result = await store.saveScores([
    score('BTC', '2026-10-01T10:00:00.000Z', 1),
    score('BTC', '2026-10-01T10:15:00.000Z', 2),
    score('ETH', '2026-10-01T10:15:00.000Z', 3),
    score('NOPE', '2026-10-01T10:15:00.000Z', 4),
  ]);

  assert.deepEqual(result, { accepted: 3, rejected: [{ symbol: 'NOPE', reason: 'unknown symbol' }] });
  assert.equal(db.data.momentum_score_history.length, 3);
  assert.equal(db.data.momentum_score_history[0].received_at, '2026-10-01T10:16:00.000Z');
  assert.deepEqual(
    db.data.momentum_scores.map((row) => [row.symbol, row.score]),
    [['BTC', 2], ['ETH', 3]],
  );
});

test('scoreStore ignores retried deliveries and never moves the latest score backwards', async () => {
  const db = createFakeDb({
    assets: [{ symbol: 'BTC' }],
    momentum_scores: [score('BTC', '2026-10-01T10:15:00.000Z', 5)],
  });
  const store = createScoreStore({ db });

  await store.saveScores([score('BTC', '2026-10-01T10:00:00.000Z', 1)]); // late, older delivery
  await store.saveScores([score('BTC', '2026-10-01T10:00:00.000Z', 1)]); // retry of the same one

  assert.equal(db.data.momentum_score_history.length, 1);
  assert.equal(db.data.momentum_scores[0].score, 5);
});

test('scoreStore writes nothing when every symbol is unknown', async () => {
  const db = createFakeDb();
  const result = await createScoreStore({ db }).saveScores([score('NOPE', '2026-10-01T10:00:00.000Z')]);
  assert.equal(result.accepted, 0);
  assert.equal(db.calls.filter(([op]) => op === 'upsert').length, 0);
});

test('assetRegistry registers each feed symbol once and retries after a failure', async () => {
  const db = createFakeDb();
  let fail = true;
  const realUpsert = db.upsert;
  db.upsert = async (...args) => {
    if (fail) throw new Error('db down');
    return realUpsert(...args);
  };
  const registry = createAssetRegistry({ db, logger: silent });
  const feedAssets = [
    { symbol: 'BTC', name: 'Bitcoin', asset_type: 'crypto' },
    { symbol: 'AAPL', name: 'Apple', asset_type: 'equity', exchange: 'NASDAQ' },
  ];

  registry.onAssets(feedAssets);
  await registry.whenIdle();
  assert.equal(db.data.assets.length, 0);

  fail = false;
  registry.onAssets(feedAssets);
  await registry.whenIdle();
  assert.deepEqual(db.data.assets, [
    { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', exchange: 'coingecko' },
    { symbol: 'AAPL', name: 'Apple', type: 'equity', exchange: 'NASDAQ' },
  ]);

  const before = db.calls.length;
  registry.onAssets(feedAssets);
  await registry.whenIdle();
  assert.equal(db.calls.length, before); // already registered: no write
});

test('supabase client is disabled without configuration', () => {
  assert.equal(createSupabaseClient({ url: '', serviceKey: '', timeoutMs: 1000 }), null);
  assert.equal(createSupabaseClient({ url: 'https://x.supabase.co', serviceKey: '', timeoutMs: 1000 }), null);
});

test('supabase client sends PostgREST upserts with the right headers', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: new URL(url), init });
    return new Response(null, { status: 201 });
  };

  const legacy = createSupabaseClient({ url: 'https://x.supabase.co/', serviceKey: 'eyJlegacy', timeoutMs: 1000 }, fetchImpl);
  await legacy.upsert('momentum_scores', [{ symbol: 'BTC' }], { onConflict: 'symbol' });
  const [first] = seen;
  assert.equal(first.url.pathname, '/rest/v1/momentum_scores');
  assert.equal(first.url.searchParams.get('on_conflict'), 'symbol');
  assert.equal(first.init.method, 'POST');
  assert.equal(first.init.headers.apikey, 'eyJlegacy');
  assert.equal(first.init.headers.authorization, 'Bearer eyJlegacy');
  assert.equal(first.init.headers.prefer, 'resolution=merge-duplicates,return=minimal');

  const modern = createSupabaseClient({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', timeoutMs: 1000 }, fetchImpl);
  await modern.upsert('momentum_score_history', [{ symbol: 'BTC' }], { onConflict: 'symbol,updated_at', ignoreDuplicates: true });
  assert.equal(seen[1].init.headers.authorization, undefined);
  assert.equal(seen[1].init.headers.prefer, 'resolution=ignore-duplicates,return=minimal');
});

test('supabase client builds select filters and maps errors without leaking the key', async () => {
  let seenUrl;
  const ok = createSupabaseClient({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', timeoutMs: 1000 }, async (url) => {
    seenUrl = new URL(url);
    return new Response(JSON.stringify([{ symbol: 'BTC' }]), { status: 200 });
  });
  assert.deepEqual(await ok.select('assets', { columns: 'symbol', filters: { symbol: inList(['BTC', 'ETH']) } }), [{ symbol: 'BTC' }]);
  assert.equal(seenUrl.searchParams.get('select'), 'symbol');
  assert.equal(seenUrl.searchParams.get('symbol'), 'in.("BTC","ETH")');

  const failing = createSupabaseClient({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', timeoutMs: 1000 }, async () =>
    new Response(JSON.stringify({ code: '23503', message: 'violates foreign key constraint' }), { status: 409 }));
  await assert.rejects(
    () => failing.upsert('momentum_scores', [{ symbol: 'X' }], { onConflict: 'symbol' }),
    (error) => error instanceof DatabaseError && error.status === 409 && error.code === '23503' && !error.message.includes('sb_secret'),
  );

  const down = createSupabaseClient({ url: 'https://x.supabase.co', serviceKey: 'k', timeoutMs: 1000 }, async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(() => down.select('assets'), DatabaseError);
});
