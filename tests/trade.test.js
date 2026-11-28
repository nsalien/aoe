// Karavanen: naar eenzelfde speler hooguit één per 8 uur (MARKET.tradeGapMs), ook voor bots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newTownState, tradeWait, noteTrade } from '../public/shared/sim.js';
import { MARKET } from '../public/shared/rules.js';
import { handle } from '../functions/lib/routes.js';

const H = 3600000;

test('karavanen: tradeWait en noteTrade (per speler, oude tijdstippen verdwijnen)', () => {
  assert.equal(MARKET.tradeGapMs, 8 * H);
  const s = newTownState(0, 'greek');
  const t0 = 1_000_000_000;
  assert.equal(tradeWait(s, 7, t0), 0, 'nog nooit iets gestuurd');
  noteTrade(s, 7, t0);
  assert.equal(tradeWait(s, 7, t0), 8 * H);
  assert.equal(tradeWait(s, 7, t0 + 3 * H), 5 * H);
  assert.equal(tradeWait(s, 8, t0 + 3 * H), 0, 'naar een andere speler mag wel');
  noteTrade(s, 8, t0 + 3 * H);
  assert.equal(tradeWait(s, 7, t0 + 8 * H), 0, 'na 8 uur weer');
  // een nieuwe karavaan ruimt wat voorbij is op: de stad blijft klein
  noteTrade(s, 9, t0 + 9 * H);
  assert.deepEqual(Object.keys(s.tradeAt).sort(), ['8', '9']);
  // JSON heen en terug (zoals in de database): sleutels worden tekst, werkt nog altijd
  const s2 = JSON.parse(JSON.stringify(s));
  assert.equal(tradeWait(s2, 9, t0 + 10 * H), 7 * H);
});

async function memoryD1() {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => raw.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => { const r = raw.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { raw, prepare: (sql) => stmt(sql), batch: async (list) => { const out = []; for (const st of list) out.push(await st.run()); return out; } };
}

test('karavanen via de server: één per 8 uur naar dezelfde speler, andere bondgenoten mogen wel', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    const call = async (method, path, body, cookie) => {
      const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
      if (cookie) headers.cookie = cookie;
      const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
      return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
    };
    await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 3, seed: 5, bots: 0 });
    const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
    await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'persian' });
    await call('POST', '/register', { name: 'Cas', password: 'geheim123', civ: 'yamato' });
    const p = Object.fromEntries(db.raw.prepare('SELECT p.id, p.name, p.team_id, t.id AS town FROM players p JOIN towns t ON t.player_id = p.id').all().map((r) => [r.name, r]));
    assert.equal(p.Anna.team_id, p.Bert.team_id, 'Anna en Bert in dezelfde clan');
    assert.equal(p.Anna.team_id, p.Cas.team_id, 'Cas ook');
    db.raw.prepare(`UPDATE towns SET state = json_set(state, '$.buildings[#]', json('{"id":90,"type":"market","x":2,"y":2,"level":1}'),
      '$.res', json('{"food":2000,"wood":2000,"stone":2000,"gold":2000}')) WHERE id = ?`).run(p.Anna.town);
    const send = (town) => call('POST', '/march', { kind: 'trade', targetKind: 'town', targetId: town, res: { wood: 100 } }, a.cookie);

    let r = await send(p.Bert.town);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    r = await send(p.Bert.town);
    assert.equal(r.status, 400, 'tweede karavaan naar Bert');
    assert.match(r.data.error, /Bert/);
    assert.match(r.data.error, /8 uur/);
    const wood = JSON.parse(db.raw.prepare('SELECT state FROM towns WHERE id = ?').get(p.Anna.town).state).res.wood;
    r = await send(p.Cas.town);
    assert.equal(r.status, 200, 'naar Cas mag wel');
    const after = JSON.parse(db.raw.prepare('SELECT state FROM towns WHERE id = ?').get(p.Anna.town).state);
    assert.ok(after.res.wood < wood, 'grondstoffen vertrokken');
    assert.ok(after.tradeAt[p.Bert.id] && after.tradeAt[p.Cas.id], 'tijdstip per ontvanger bewaard in de stad');

    // 7 uur later: nog altijd niet; na 8 uur wel
    offset = 7 * H;
    r = await send(p.Bert.town);
    assert.equal(r.status, 400);
    offset = 8 * H + 60000;
    r = await send(p.Bert.town);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    // een geweigerde karavaan kost niets
    const before = JSON.parse(db.raw.prepare('SELECT state FROM towns WHERE id = ?').get(p.Anna.town).state).res.wood;
    r = await send(p.Bert.town);
    assert.equal(r.status, 400);
    const now2 = JSON.parse(db.raw.prepare('SELECT state FROM towns WHERE id = ?').get(p.Anna.town).state).res.wood;
    assert.ok(now2 >= before, 'niets afgetrokken');
  } finally {
    Date.now = realNow;
  }
});
