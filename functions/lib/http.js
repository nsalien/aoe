import { GameError } from '../../public/shared/sim.js';

export { GameError };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 20000) throw new GameError('Verzoek te groot.', 413);
  try {
    return await request.json();
  } catch {
    throw new GameError('Ongeldige JSON.');
  }
}

export const int = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : def;
};

// Telt D1-query's: het gratis plan staat maximaal 50 query's per verzoek toe.
export function wrapDb(raw) {
  const ctx = { count: 0 };
  const wrapStmt = (st) => ({
    _st: st,
    bind: (...a) => wrapStmt(st.bind(...a)),
    first: (c) => { ctx.count++; return st.first(c); },
    all: () => { ctx.count++; return st.all(); },
    run: () => { ctx.count++; return st.run(); },
  });
  return {
    ctx,
    prepare: (sql) => wrapStmt(raw.prepare(sql)),
    batch: (list) => { ctx.count += 1; return raw.batch(list.map((s) => s._st)); },
  };
}
