// The ONLY file that talks to Supabase (its PostgREST API over HTTPS). Uses the service-role
// key, which bypasses Row Level Security: it must stay server-side and is never logged.

export class DatabaseError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message, { cause });
    this.name = 'DatabaseError';
    this.status = status;
    this.code = code;
  }
}

const quote = (value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** PostgREST `in` filter value, e.g. inList(['BTC', 'ETH']) -> in.("BTC","ETH"). */
export const inList = (values) => `in.(${values.map(quote).join(',')})`;

/** Returns null when Supabase is not configured, so callers can run without a database. */
export function createSupabaseClient({ url, serviceKey, timeoutMs }, fetchImpl = fetch) {
  if (!url || !serviceKey) return null;

  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  // New-style keys (sb_secret_...) are not JWTs and only go in `apikey`. Legacy service_role
  // JWT keys are also sent as a bearer token.
  const authHeaders = { apikey: serviceKey };
  if (!serviceKey.startsWith('sb_')) authHeaders.authorization = `Bearer ${serviceKey}`;

  async function request(method, table, { params = {}, body, prefer } = {}) {
    const target = new URL(`${base}/${encodeURIComponent(table)}`);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);

    const headers = { ...authHeaders, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;

    let response;
    try {
      response = await fetchImpl(target, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError';
      throw new DatabaseError(timedOut ? 'Supabase request timed out' : 'Supabase network error', { cause });
    }

    if (!response.ok) {
      let detail = {};
      try {
        detail = await response.json();
      } catch {
        // non-JSON error body; the status code is enough
      }
      const suffix = typeof detail?.message === 'string' ? `: ${detail.message}` : '';
      throw new DatabaseError(`Supabase ${method} ${table} failed with HTTP ${response.status}${suffix}`, {
        status: response.status,
        code: detail?.code,
      });
    }

    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new DatabaseError('Supabase returned invalid JSON', { cause });
    }
  }

  return {
    /** filters are PostgREST query params, e.g. { symbol: inList(['BTC']) }. */
    async select(table, { columns = '*', filters = {} } = {}) {
      const rows = await request('GET', table, { params: { select: columns, ...filters } });
      if (!Array.isArray(rows)) throw new DatabaseError(`Supabase select on ${table} did not return a list`);
      return rows;
    },

    /** Inserts rows; on a conflict on `onConflict` columns, updates the row (or skips it with ignoreDuplicates). */
    async upsert(table, rows, { onConflict, ignoreDuplicates = false }) {
      if (rows.length === 0) return;
      await request('POST', table, {
        params: { on_conflict: onConflict },
        body: rows,
        prefer: `resolution=${ignoreDuplicates ? 'ignore' : 'merge'}-duplicates,return=minimal`,
      });
    },

    /** Appends rows without conflict resolution. */
    async insert(table, rows) {
      if (rows.length === 0) return;
      await request('POST', table, {
        body: rows,
        prefer: 'return=minimal',
      });
    },
  };
}
