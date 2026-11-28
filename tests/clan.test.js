// Clans wisselen (verlaten, uitnodigen, toetreding vragen), verraad en privéberichten, via de echte routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { handle } from '../functions/lib/routes.js';
import { CLAN } from '../public/shared/rules.js';
import { pickColor, clanName, freeSlot } from '../functions/lib/clan.js';

// D1-achtige database in het geheugen (node:sqlite) met alle migraties
async function memoryD1() {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => raw.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => {
      const r = raw.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return { raw, prepare: (sql) => stmt(sql), batch: async (list) => { const out = []; for (const st of list) out.push(await st.run()); return out; } };
}

// een wereld zonder bots met spelers in clans van 2 (Anna & Bert, Cas & Dirk); de vrede is voorbij
async function world() {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  assert.equal((await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 2, seed: 11, bots: 0 })).status, 200);
  const P = {};
  for (const n of ['Anna', 'Bert', 'Cas', 'Dirk']) {
    const r = await call('POST', '/register', { name: n, password: 'geheim123', civ: 'greek' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    P[n] = r.cookie;
  }
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  const one = (q, ...v) => db.raw.prepare(q).get(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql('UPDATE players SET created_at = ?', now - 2 * 86400000);
  sql("UPDATE towns SET state = json_set(state, '$.units.spear', 20, '$.units.sword', 10)");
  const id = (n) => one('SELECT id, team_id FROM players WHERE name = ?', n);
  const town = (n) => one('SELECT t.id FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = ?', n).id;
  return { db, call, P, sql, one, id, town, now };
}

test('clans: verlaten = een eigen clan stichten; alleen kan je niet verlaten; daarna even wachten', async () => {
  const w = await world();
  const { call, P, id } = w;
  assert.equal(id('Anna').team_id, id('Bert').team_id, 'automatisch gekoppeld');
  const old = id('Anna').team_id;
  let r = await call('POST', '/clan/leave', { name: 'De Vrije Vos' }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.notEqual(id('Anna').team_id, old);
  assert.equal(r.data.team.name, 'De Vrije Vos');
  const t = await call('GET', '/team', null, P.Anna);
  assert.equal(t.data.members.length, 1);
  assert.equal(t.data.clan.alone, true);
  assert.ok(t.data.clan.switchAt > Date.now(), 'wachttijd na een wissel');
  // alleen in je clan: verlaten heeft geen zin
  r = await call('POST', '/clan/leave', {}, P.Anna);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /alleen/);
  // Bert ziet het in de clanchat; de oude clan bestaat nog (Bert zit erin)
  const chat = await call('GET', '/chat?channel=team', null, P.Bert);
  assert.match(chat.data.messages.at(-1).text, /Anna heeft de clan verlaten/);
  // Bert vertrekt ook: de lege oude clan verdwijnt
  r = await call('POST', '/clan/leave', {}, P.Bert);
  assert.equal(r.status, 400, 'Bert is nu alleen');
  // kleur en naam van een nieuwe clan zijn verschillend
  assert.equal(r.data.error.includes('alleen'), true);
  const teams = w.db.raw.prepare('SELECT name, color FROM teams').all();
  assert.equal(new Set(teams.map((x) => x.color)).size, teams.length, 'elke clan een eigen kleur');
  // de wachttijd: Anna kan niet meteen bij een andere clan vragen
  r = await call('POST', '/clan/request', { team: id('Cas').team_id }, P.Anna);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /net van clan/);
});

test('clans: uitnodigen en aanvaarden, toetreding vragen; een lege clan verdwijnt', async () => {
  const w = await world();
  const { call, P, id, sql, one } = w;
  await call('POST', '/clan/leave', {}, P.Anna);
  sql('UPDATE players SET clan_at = 0'); // wachttijd voorbij
  const annaTeam = id('Anna').team_id;
  const casTeam = id('Cas').team_id;
  // de clan van Cas heeft nog plaats (2 van hooguit 4): uitnodigen mag
  let r = await call('POST', '/clan/invite', { player: id('Anna').id }, P.Cas);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.joined, false);
  let st = await call('GET', '/state', null, P.Anna);
  assert.equal(st.data.clan.invites, 1, 'Anna ziet de uitnodiging');
  const t = await call('GET', '/team', null, P.Anna);
  assert.equal(t.data.clan.invites.length, 1);
  assert.equal(t.data.clan.invites[0].team.id, casTeam);
  // Dirk (zelfde clan als Cas) kan de uitnodiging niet voor Anna aanvaarden
  r = await call('POST', '/clan/answer', { id: t.data.clan.invites[0].id, accept: true }, P.Dirk);
  assert.equal(r.status, 400);
  r = await call('POST', '/clan/answer', { id: t.data.clan.invites[0].id, accept: true }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(id('Anna').team_id, casTeam);
  assert.equal(one('SELECT COUNT(*) AS c FROM teams WHERE id = ?', annaTeam).c, 0, 'de lege clan van Anna is weg');
  st = await call('GET', '/state', null, P.Anna);
  assert.equal(st.data.team.id, casTeam);
  assert.equal(st.data.clan.invites, 0);
  // Bert (nu alleen) vraagt om toe te treden; Dirk aanvaardt
  sql('UPDATE players SET clan_at = 0');
  r = await call('POST', '/clan/request', { team: casTeam }, P.Bert);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  st = await call('GET', '/state', null, P.Dirk);
  assert.equal(st.data.clan.requests, 1, 'de clan ziet het verzoek');
  const td = await call('GET', '/team', null, P.Dirk);
  assert.equal(td.data.clan.requests[0].player.name, 'Bert');
  r = await call('POST', '/clan/answer', { id: td.data.clan.requests[0].id, accept: true }, P.Dirk);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(id('Bert').team_id, casTeam);
  // nu 4 leden: vol
  assert.equal(one('SELECT COUNT(*) AS c FROM players WHERE team_id = ?', casTeam).c, CLAN.maxMembers);
  sql('UPDATE players SET clan_at = 0');
  await call('POST', '/clan/leave', {}, P.Anna);
  sql('UPDATE players SET clan_at = 0');
  await call('POST', '/register', { name: 'Eva', password: 'geheim123', civ: 'greek' }).then((x) => { P.Eva = x.cookie; });
  assert.equal(one("SELECT p.team_id = (SELECT team_id FROM players WHERE name = 'Anna') AS same FROM players p WHERE name = 'Eva'").same, 0,
    'een nieuwe speler komt niet automatisch in een zelf gestichte clan');
  r = await call('POST', '/clan/invite', { player: id('Anna').id }, P.Cas);
  assert.equal(r.status, 200, 'na het vertrek van Anna is er weer plaats');
  // Eva vraagt bij de clan van Cas en wordt ook uitgenodigd: wie het laatst kwam, maakt het rond
  r = await call('POST', '/clan/request', { team: casTeam }, P.Eva);
  assert.equal(r.status, 200);
  r = await call('POST', '/clan/invite', { player: id('Eva').id }, P.Cas);
  assert.equal(r.status, 200);
  assert.equal(r.data.joined, true, 'vroeg zelf al: meteen bij de clan');
  assert.equal(id('Eva').team_id, casTeam);
  // de uitnodiging voor Anna kan niet meer: de clan is weer vol
  const ta = await call('GET', '/team', null, P.Anna);
  r = await call('POST', '/clan/answer', { id: ta.data.clan.invites[0].id, accept: true }, P.Anna);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /vol/);
  // weigeren ruimt op
  r = await call('POST', '/clan/answer', { id: ta.data.clan.invites[0].id, accept: false }, P.Anna);
  assert.equal(r.status, 200);
  assert.equal(one('SELECT COUNT(*) AS c FROM clan_invites WHERE player_id = ?', id('Anna').id).c, 0);
});

test('clans: wie vertrekt, krijgt zijn troepen terug en stuurt die van zijn oude clan naar huis', async () => {
  const w = await world();
  const { call, P, id, sql, one, town } = w;
  // Anna stuurt versterking naar Bert, Bert stuurt er een naar Anna; ze komen aan
  for (const [from, to] of [['Anna', 'Bert'], ['Bert', 'Anna']]) {
    const r = await call('POST', '/march', { kind: 'support', targetKind: 'town', targetId: town(to), units: { spear: 5 } }, P[from]);
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'support'", Date.now() - 1000);
  await call('GET', '/state', null, P.Anna);
  assert.equal(one('SELECT COUNT(*) AS c FROM support').c, 2);
  // en nog een versterking onderweg
  await call('POST', '/march', { kind: 'support', targetKind: 'town', targetId: town('Bert'), units: { sword: 3 } }, P.Anna);
  sql("UPDATE marches SET depart_at = ? WHERE kind = 'support' AND status = 'out'", Date.now() - 60000); // al een minuut onderweg
  const r = await call('POST', '/clan/leave', {}, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(one('SELECT COUNT(*) AS c FROM support').c, 0, 'geen troepen meer bij elkaar');
  const ms = w.db.raw.prepare("SELECT player_id, kind, status, team_id, target_team FROM marches ORDER BY id").all();
  assert.equal(ms.filter((m) => m.kind === 'return').length, 2, 'beide terug naar huis');
  assert.ok(ms.every((m) => m.status === 'back'), 'ook de versterking die nog onderweg was, keert om');
  const anna = id('Anna');
  for (const m of ms.filter((x) => x.player_id === anna.id)) assert.equal(m.team_id, anna.team_id, 'Anna ziet haar legers nog');
  const st = await call('GET', '/state', null, P.Anna);
  assert.equal(st.data.marches.filter((m) => m.own).length, 2);
  // Bert kreeg een rapport over zijn troepen
  const rep = await call('GET', '/reports', null, P.Bert);
  assert.ok(rep.data.reports.some((x) => x.kind === 'info'));
});

test('verraad: een clanlid aanvallen mag na bevestiging; de clan ziet een vijandig leger en kan de verrader buitenzetten', async () => {
  const w = await world();
  const { call, P, id, sql, one, town } = w;
  // Bert heeft troepen in de stad van Anna staan: die vechten niet tegen hem
  await call('POST', '/march', { kind: 'support', targetKind: 'town', targetId: town('Anna'), units: { sword: 4 } }, P.Bert);
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'support'", Date.now() - 1000);
  await call('GET', '/state', null, P.Anna);
  assert.equal(one('SELECT COUNT(*) AS c FROM support').c, 1);
  let r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: town('Anna'), units: { spear: 15, sword: 6 } }, P.Bert);
  assert.equal(r.status, 400, 'eerst bevestigen');
  assert.match(r.data.error, /verraden/);
  r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: town('Anna'), units: { spear: 15, sword: 6 }, betray: true }, P.Bert);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.betray, true);
  assert.ok(one("SELECT traitor_at FROM players WHERE name = 'Bert'").traitor_at > 0);
  // Anna ziet een vijandige aanval (zonder de troepen), Bert zijn eigen leger
  const sa = await call('GET', '/state', null, P.Anna);
  const ma = sa.data.marches.find((m) => m.kind === 'attack');
  assert.equal(ma.ally, false);
  assert.equal(ma.betray, true);
  assert.equal(ma.units, null);
  const sb = await call('GET', '/state', null, P.Bert);
  assert.equal(sb.data.marches.find((m) => m.kind === 'attack').ally, true);
  // in het Team-venster staat Bert als verrader
  const ta = await call('GET', '/team', null, P.Anna);
  assert.equal(ta.data.members.find((m) => m.player === 'Bert').traitor, true);
  // de aanval komt aan (niemand online genoeg om live te spelen): de troepen van Bert in de stad doen niet mee
  sql('UPDATE players SET last_seen = 0');
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'attack'", Date.now() - 120000);
  await call('GET', '/state', null, P.Cas);
  const rep = w.db.raw.prepare("SELECT title, data FROM reports WHERE kind IN ('attack', 'defense') ORDER BY id").all();
  assert.equal(rep.length, 2, JSON.stringify(rep));
  assert.ok(rep.every((x) => x.title.startsWith('Verraad')));
  const data = JSON.parse(rep[0].data);
  assert.equal(data.betray, true);
  assert.deepEqual(data.supporters, [], 'de troepen van de verrader vochten niet mee');
  assert.equal(one('SELECT COUNT(*) AS c FROM support').c, 1, 'en staan er nog');
  const chat = await call('GET', '/chat?channel=team', null, P.Anna);
  assert.match(chat.data.messages.at(-1).text, /Verraad! Bert/);
  // Cas (andere clan) kan Bert niet buitenzetten; Anna wel
  r = await call('POST', '/clan/kick', { player: id('Bert').id }, P.Cas);
  assert.equal(r.status, 400);
  const before = id('Bert').team_id;
  r = await call('POST', '/clan/kick', { player: id('Bert').id }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.notEqual(id('Bert').team_id, before);
  assert.equal(one('SELECT COUNT(*) AS c FROM support').c, 0, 'zijn troepen bij Anna gaan naar huis');
  // een verrader die werd buitengezet, mag meteen bij een andere clan vragen (geen wachttijd)
  r = await call('POST', '/clan/request', { team: id('Cas').team_id }, P.Bert);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Anna kan geen gewoon clanlid buitenzetten
  sql('UPDATE players SET clan_at = 0');
  await call('POST', '/clan/invite', { player: id('Bert').id }, P.Anna); // Bert vroeg het niet aan Anna's clan: gewoon een uitnodiging
  r = await call('POST', '/clan/kick', { player: id('Anna').id }, P.Anna);
  assert.equal(r.status, 400);
});

test('verraad: live belegering met verschillende kleuren; de troepen van de verrader in de stad doen niet mee', async () => {
  const w = await world();
  const { call, P, sql, one, town } = w;
  await call('POST', '/march', { kind: 'support', targetKind: 'town', targetId: town('Anna'), units: { sword: 4 } }, P.Bert);
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'support'", Date.now() - 1000);
  await call('GET', '/state', null, P.Anna);
  const sup = one('SELECT id FROM support').id;
  let r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: town('Anna'), units: { spear: 10 }, betray: true }, P.Bert);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // de aanval komt net aan terwijl beiden online zijn: kiezen
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'attack'", Date.now() - 1000);
  const st = await call('GET', '/state', null, P.Bert);
  const b = st.data.battles.find((x) => x.status === 'choose');
  assert.ok(b, JSON.stringify(st.data.battles));
  r = await call('POST', '/battle/mode', { id: b.id, mode: 'manual' }, P.Bert);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('POST', '/battle/mode', { id: b.id, mode: 'auto' }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = one('SELECT status, state FROM battles WHERE id = ?', b.id);
  assert.equal(row.status, 'live');
  const state = JSON.parse(row.state);
  assert.notEqual(state.meta.att.color, state.meta.def.color, 'verrader en verdediger hebben elk een eigen kleur');
  assert.ok(!(String(sup) in state.meta.defInit), 'de troepen van Bert in de stad van Anna vechten niet mee');
  assert.ok('home' in state.meta.defInit);
});

test('clans: wie bij een clan komt, roept zijn aanvallen op die clan terug (en zij die op hem)', async () => {
  const w = await world();
  const { call, P, id, sql, town } = w;
  let r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: town('Cas'), units: { spear: 5 } }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: town('Anna'), units: { spear: 5 } }, P.Dirk);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await call('POST', '/clan/invite', { player: id('Anna').id }, P.Cas);
  const t = await call('GET', '/team', null, P.Anna);
  r = await call('POST', '/clan/answer', { id: t.data.clan.invites[0].id, accept: true }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ms = w.db.raw.prepare("SELECT status FROM marches WHERE kind = 'attack'").all();
  assert.deepEqual(ms.map((m) => m.status), ['back', 'back']);
  const rep = await call('GET', '/reports', null, P.Dirk);
  assert.ok(rep.data.reports.some((x) => x.kind === 'info'), 'Dirk weet waarom zijn leger omkeert');
  sql('UPDATE players SET clan_at = 0');
});

test('clans: computerclans nemen geen spelers op en bots wisselen niet', async () => {
  const w = await world();
  const { call, P, sql, one } = w;
  sql("INSERT INTO teams (slot, name, color) VALUES (7, 'Botclan', '#123456')");
  const bt = one("SELECT id FROM teams WHERE name = 'Botclan'").id;
  sql("INSERT INTO players (name, pass_hash, salt, team_id, created_at, bot) VALUES ('Robot', '-', '-', ?, 0, 1)", bt);
  const bot = one("SELECT id FROM players WHERE name = 'Robot'").id;
  let r = await call('POST', '/clan/request', { team: bt }, P.Anna);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Computerclans/);
  r = await call('POST', '/clan/invite', { player: bot }, P.Anna);
  assert.equal(r.status, 400);
  r = await call('POST', '/dm', { to: bot, text: 'hallo' }, P.Anna);
  assert.equal(r.status, 400);
});

test('privéberichten: sturen, ongelezen tellen, lezen, gesprekken', async () => {
  const w = await world();
  const { call, P, id } = w;
  let r = await call('POST', '/dm', { to: id('Cas').id, text: 'Zullen we samen de Wolvenclan aanvallen?' }, P.Anna);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await call('POST', '/dm', { to: id('Cas').id, text: 'Ik geef je 500 goud.' }, P.Anna);
  let st = await call('GET', '/state', null, P.Cas);
  assert.equal(st.data.chat.newDm, 2);
  assert.equal(st.data.chat.lastDm.name, 'Anna');
  assert.match(st.data.chat.lastDm.text, /500 goud/);
  const list = await call('GET', '/dm/list', null, P.Cas);
  assert.equal(list.data.convs.length, 1);
  assert.equal(list.data.convs[0].name, 'Anna');
  assert.equal(list.data.convs[0].unread, 2);
  assert.ok(list.data.players.every((p) => p.name !== 'Cas'), 'jezelf staat niet in de lijst');
  const conv = await call('GET', `/dm?with=${id('Anna').id}`, null, P.Cas);
  assert.equal(conv.data.messages.length, 2);
  assert.equal(conv.data.unreadLeft, 0);
  st = await call('GET', '/state', null, P.Cas);
  assert.equal(st.data.chat.newDm, 0, 'gelezen');
  // antwoorden; Bert kan het gesprek niet lezen
  await call('POST', '/dm', { to: id('Anna').id, text: 'Afgesproken.' }, P.Cas);
  const bert = await call('GET', `/dm?with=${id('Anna').id}`, null, P.Bert);
  assert.equal(bert.data.messages.length, 0);
  const anna = await call('GET', `/dm?with=${id('Cas').id}`, null, P.Anna);
  assert.deepEqual(anna.data.messages.map((m) => m.me), [true, true, false]);
  r = await call('POST', '/dm', { to: id('Anna').id, text: '   ' }, P.Cas);
  assert.equal(r.status, 400);
});

test('clans: kleuren, namen en vrije plaatsen voor teams', () => {
  const c = pickColor(['#d64545', '#3f7fd9']);
  assert.ok(!['#d64545', '#3f7fd9'].includes(c));
  assert.equal(clanName('', [{ name: 'Clan van Anna' }], 'Anna'), 'Clan van Anna 2');
  assert.throws(() => clanName('Wolvenclan', [], 'Anna'), /in gebruik/);
  assert.throws(() => clanName('ab', [], 'Anna'), /tekens/);
  assert.equal(clanName('  De   Vos ', [], 'Anna'), 'De Vos');
  assert.equal(freeSlot([{ slot: 0 }, { slot: 1 }, { slot: 8, founder: 3 }]), 2);
  assert.equal(freeSlot([{ slot: 0 }, { slot: 2 }]), 1, 'een gat na een verdwenen team');
});
