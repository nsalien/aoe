// Troepen en dorpelingen ontslaan: plaats in de bevolking vrijmaken (bv. voor een ram), een deel van de kosten terug.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newTownState, doDismiss, checkDismiss, dismissRefund, checkTrain, homePop, popCap, totalVillagers, rates } from '../public/shared/sim.js';
import { UNITS, DISMISS } from '../public/shared/rules.js';
import { handle } from '../functions/lib/routes.js';

test('ontslaan: bevolking komt vrij, een kwart van de kosten terug, enkel troepen die thuis zijn', () => {
  const s = newTownState(0, 'greek');
  s.buildings.find((b) => b.type === 'tc').level = 3;
  s.buildings.push({ id: 90, type: 'workshop', x: 2, y: 2, level: 1 });
  s.res = { food: 0, wood: 1000, stone: 0, gold: 1000 };
  // bevolking vol met speerdragers
  s.units = { spear: popCap(s) - homePop(s), sword: 0 };
  delete s.units.sword;
  assert.match(checkTrain(s, 'ram', 1), /bevolkingsruimte/, 'geen plaats voor een ram');
  const before = { ...s.res };
  const refund = doDismiss(s, { spear: UNITS.ram.pop });
  assert.equal(checkTrain(s, 'ram', 1), null, 'nu wel');
  for (const r of Object.keys(UNITS.spear.cost)) {
    assert.equal(refund[r], Math.floor(UNITS.spear.cost[r] * UNITS.ram.pop * DISMISS.refund));
    assert.equal(s.res[r], before[r] + refund[r], 'terug in de voorraad');
  }
  // alles ontslaan: de soort verdwijnt uit de stad
  doDismiss(s, { spear: s.units.spear });
  assert.equal(s.units.spear, undefined);
  // fouten
  assert.match(checkDismiss(s, {}), /Kies/);
  assert.match(checkDismiss(s, {}, {}), /Kies/);
  assert.match(checkDismiss(s, { spear: 1 }), /niet thuis/);
  assert.match(checkDismiss(s, { villager: 1 }), /Onbekende/);
  assert.match(checkDismiss(s, { boar: 1 }), /Onbekende/);
  s.units = { archer: 3 };
  assert.match(checkDismiss(s, { archer: 1.5 }), /Ongeldig/);
  assert.deepEqual(dismissRefund({ archer: 0 }), {});
});

test('dorpelingen ontslaan: plaats voor soldaten, per taak, minstens een paar dorpelingen over', () => {
  const s = newTownState(0, 'greek');
  s.res = { food: 1000, wood: 1000, stone: 0, gold: 0 };
  s.buildings.push({ id: 90, type: 'barracks', x: 2, y: 2, level: 1 }, { id: 91, type: 'house', x: 5, y: 5, level: 3 });
  s.villagers = { idle: 2, food: 5, wood: 5, stone: 0, gold: 0, fish: 0 };
  s.units = { spear: popCap(s) - homePop(s) };
  assert.ok(s.units.spear > 1);
  assert.match(checkTrain(s, 'spear', 1), /bevolkingsruimte/, 'bevolking vol');
  const r0 = rates(s);
  const food0 = s.res.food;
  const refund = doDismiss(s, {}, { idle: 2, food: 3 });
  assert.deepEqual(s.villagers, { idle: 0, food: 2, wood: 5, stone: 0, gold: 0, fish: 0 });
  assert.equal(totalVillagers(s), 7);
  assert.equal(refund.food, Math.floor(UNITS.villager.cost.food * 5 * DISMISS.refund), 'een kwart van 5 x 50 voedsel');
  assert.equal(s.res.food, food0 + refund.food);
  assert.equal(checkTrain(s, 'spear', 5), null, '5 plaatsen vrij');
  assert.ok(rates(s).food < r0.food, 'minder boeren = minder voedsel');
  // soldaten en dorpelingen samen
  doDismiss(s, { spear: 1 }, { wood: 1 });
  assert.equal(s.villagers.wood, 4);
  // fouten
  assert.match(checkDismiss(s, {}, { food: 3 }), /werken daar niet/);
  assert.match(checkDismiss(s, {}, { idle: 1 }), /zonder werk/);
  assert.match(checkDismiss(s, {}, { food: 1.5 }), /Ongeldig/);
  assert.match(checkDismiss(s, {}, { boar: 1 }), /Onbekende/);
  assert.match(checkDismiss(s, {}, { wood: 2 }), new RegExp(`minstens ${DISMISS.minVillagers}`), '6 - 2 < 5');
  assert.equal(checkDismiss(s, {}, { wood: 1 }), null, '6 - 1 = 5 mag nog');
  // wie in het veld rondloopt, telt mee voor het minimum (maar kan je niet ontslaan)
  s.field = [{ id: 1, units: { villager: 3 } }];
  assert.equal(checkDismiss(s, {}, { wood: 4 }), null, '9 - 4 = 5');
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

test('ontslaan via de server: werkt thuis, niet tijdens een aanval op je stad', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 2, seed: 3, bots: 0 });
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  db.raw.prepare("UPDATE towns SET state = json_set(state, '$.units.spear', 12, '$.units.archer', 4)").run();
  let r = await call('POST', '/dismiss', { units: { spear: 5, archer: 4 } }, a.cookie);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.units.spear, 7);
  assert.equal(r.data.state.units.archer, undefined);
  r = await call('POST', '/dismiss', { units: { spear: 50 } }, a.cookie);
  assert.equal(r.status, 400);
  // dorpelingen (start: 3 voedsel, 3 hout)
  r = await call('POST', '/dismiss', { villagers: { wood: 1 }, units: { spear: 1 } }, a.cookie);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.villagers.wood, 2);
  assert.equal(r.data.state.units.spear, 6);
  r = await call('POST', '/dismiss', { villagers: { food: 1 } }, a.cookie);
  assert.equal(r.status, 400, 'nog maar 5 dorpelingen');
  assert.match(r.data.error, /minstens/);
  r = await call('POST', '/dismiss', { villagers: { food: 'x', bogus: 3 } }, a.cookie);
  assert.equal(r.status, 400);
  // een slag in je stad (keuze of live): eerst die afwerken
  const pid = db.raw.prepare("SELECT id FROM players WHERE name = 'Anna'").get().id;
  db.raw.prepare("INSERT INTO battles (march_id, att_player, def_player, target_kind, target_id, title, status, choose_until, created_at, updated_at) VALUES (1, 99, ?, 'town', 1, 'x', 'choose', ?, 0, ?)").run(pid, Date.now() + 60000, Date.now());
  r = await call('POST', '/dismiss', { units: { spear: 1 } }, a.cookie);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /na de slag/);
});
