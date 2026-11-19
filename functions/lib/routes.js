import { json, readJson, int, wrapDb, GameError } from './http.js';
import {
  hashPassword, newSalt, safeEqual, createSession, sessionCookie, clearCookie, getSessionPlayer,
  destroySession, validateName, validatePassword,
} from './auth.js';
import {
  getWorld, phaseOf, worldTimes, gameTime, loadTown, mutateTown, processDue, travelMs, awayPop,
  freshCampState,
} from './game.js';
import {
  newTownState, advance, doBuild, doUpgrade, doTrain, doAssign, doTrade, bLevel, publicSummary,
  townScore, totalVillagers, unitsPop,
} from '../../public/shared/sim.js';
import { slowestSpeed, countUnits } from '../../public/shared/battle.js';
import { generateTerrain, generateCamps, teamRegion, findSpot } from '../../public/shared/worldgen.js';
import {
  RES, UNITS, ARMY_UNITS, MARKET, TEAM_NAMES, TEAM_COLORS, MAX_TEAMS, WORLD_SIZE, CAMP_EXTRA,
} from '../../public/shared/rules.js';

const routes = [];
const route = (method, path, opts, fn) => routes.push({ method, path, ...opts, fn });

export async function handle(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const now = Date.now();
  try {
    if (!env.DB) throw new GameError('Geen database gekoppeld (binding "DB" ontbreekt).', 500);
    const db = wrapDb(env.DB);
    const r = routes.find((x) => x.method === request.method && x.path === path);
    if (!r) return json({ error: 'Niet gevonden.' }, 404);
    const ctx = { request, env, db, url, now };
    if (r.admin) {
      const key = request.headers.get('x-admin-key') || '';
      if (!env.ADMIN_KEY) throw new GameError('ADMIN_KEY is niet ingesteld op de server.', 500);
      if (!safeEqual(key, env.ADMIN_KEY)) throw new GameError('Verkeerde beheerderssleutel.', 403);
      return await r.fn(ctx);
    }
    ctx.world = await getWorld(db);
    if (!ctx.world && !r.noWorld) throw new GameError('Er is nog geen wereld aangemaakt. Open /admin.html.', 503);
    if (r.auth) {
      ctx.player = await getSessionPlayer(db, request, now);
      if (!ctx.player) throw new GameError('Je bent niet aangemeld.', 401);
      if (ctx.player.last_seen < now - 60000) {
        await db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').bind(now, ctx.player.id).run();
      }
    }
    if (ctx.world && r.process !== false) await processDue(db, ctx.world, now);
    if (r.active) {
      const phase = phaseOf(ctx.world, now);
      if (phase === 'lobby') throw new GameError('Het spel is nog niet begonnen.');
      if (phase === 'ended') throw new GameError('Het seizoen is afgelopen.');
    }
    return await r.fn(ctx);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, e.status || 400);
    console.error(e && e.stack);
    return json({ error: 'Serverfout: ' + (e && e.message) }, 500);
  }
}

function worldInfo(w, now) {
  const times = worldTimes(w);
  return {
    ...times, phase: phaseOf(w, now), speed: w.speed, teamSize: w.team_size, size: w.size, seed: w.seed,
    needsCode: !!w.join_code,
  };
}

async function myTown(ctx) {
  const t = await ctx.db.prepare('SELECT id FROM towns WHERE player_id = ?').bind(ctx.player.id).first();
  if (!t) throw new GameError('Je hebt geen stad.', 404);
  return t.id;
}

// ---------- publiek ----------

route('GET', '/info', { noWorld: true, process: false }, async ({ world, now, db }) => {
  if (!world) return json({ world: null, now });
  const count = await db.prepare('SELECT COUNT(*) AS c FROM players').first();
  return json({ world: worldInfo(world, now), players: count.c, now });
});

route('POST', '/register', { process: false }, async ({ request, db, world, now }) => {
  const body = await readJson(request);
  if (phaseOf(world, now) === 'ended') throw new GameError('Het seizoen is afgelopen.');
  if (world.join_code && !safeEqual(String(body.joinCode || '').trim(), world.join_code)) {
    throw new GameError('Verkeerde deelnamecode.');
  }
  const name = validateName(body.name);
  const pw = validatePassword(body.password);
  let townName = typeof body.townName === 'string' ? body.townName.trim().slice(0, 24) : '';
  if (townName.length < 2) townName = `Burcht van ${name}`;
  if (await db.prepare('SELECT id FROM players WHERE name = ?').bind(name).first()) throw new GameError('Die naam is al bezet.');

  // automatisch koppelen: vul eerst een team dat al spelers heeft, maak anders een nieuw team
  const teams = (await db.prepare(
    'SELECT t.id, t.slot, COUNT(p.id) AS c FROM teams t LEFT JOIN players p ON p.team_id = t.id GROUP BY t.id ORDER BY t.slot',
  ).all()).results;
  let team = null;
  const open = teams.filter((t) => t.c < world.team_size);
  if (open.length) {
    const most = Math.max(...open.map((t) => t.c));
    const cand = open.filter((t) => t.c === most);
    team = cand[Math.floor(Math.random() * cand.length)];
  } else if (teams.length < MAX_TEAMS) {
    const slot = teams.length;
    const ins = await db.prepare('INSERT INTO teams (slot, name, color) VALUES (?, ?, ?)')
      .bind(slot, TEAM_NAMES[slot], TEAM_COLORS[slot]).run();
    team = { id: ins.meta.last_row_id, slot, c: 0 };
  } else {
    const least = Math.min(...teams.map((t) => t.c));
    team = teams.find((t) => t.c === least);
  }

  // plaats de stad in het gebied van het team
  const terrain = generateTerrain(world.seed, world.size);
  const region = teamRegion(world.seed, world.size, team.slot);
  const taken = [
    ...(await db.prepare('SELECT x, y FROM towns').all()).results,
    ...(await db.prepare('SELECT x, y FROM camps').all()).results,
  ];
  const ang = (team.c / Math.max(2, world.team_size)) * Math.PI * 2 + team.slot;
  const spot = findSpot(terrain, region.x + Math.cos(ang) * 3.5, region.y + Math.sin(ang) * 3.5, taken, 4)
    || findSpot(terrain, world.size / 2, world.size / 2, taken, 3);
  if (!spot) throw new GameError('De wereld is vol.');

  const salt = newSalt();
  const hash = await hashPassword(pw, salt);
  const p = await db.prepare('INSERT INTO players (name, pass_hash, salt, team_id, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, hash, salt, team.id, now, now).run();
  const pid = p.meta.last_row_id;
  const state = newTownState(Math.max(now, world.start_at));
  await db.prepare('INSERT INTO towns (player_id, name, x, y, state) VALUES (?, ?, ?, ?, ?)')
    .bind(pid, townName, spot.x, spot.y, JSON.stringify(state)).run();
  const sess = await createSession(db, pid, now);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(sess.token, request) });
});

route('POST', '/login', { process: false }, async ({ request, db, now }) => {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const row = await db.prepare('SELECT * FROM players WHERE name = ?').bind(name).first();
  const hash = row ? await hashPassword(String(body.password || ''), row.salt) : '';
  if (!row || !safeEqual(hash, row.pass_hash)) throw new GameError('Naam of wachtwoord klopt niet.', 401);
  await db.prepare('DELETE FROM sessions WHERE player_id = ? AND expires_at < ?').bind(row.id, now).run();
  const sess = await createSession(db, row.id, now);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(sess.token, request) });
});

route('POST', '/logout', { process: false, noWorld: true }, async ({ request, db }) => {
  await destroySession(db, request);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
});

// ---------- spelstatus ----------

route('GET', '/state', { auth: true }, async (ctx) => {
  const { db, world, player, now } = ctx;
  const townRow = await db.prepare('SELECT * FROM towns WHERE player_id = ?').bind(player.id).first();
  const state = JSON.parse(townRow.state);
  advance(state, gameTime(world, now), world.speed);
  const team = await db.prepare('SELECT * FROM teams WHERE id = ?').bind(player.team_id).first();
  const marches = (await db.prepare(
    `SELECT m.*, p.name AS player_name, ft.name AS from_name,
            CASE WHEN m.target_kind = 'town' THEN tt.name ELSE 'Roverskamp' END AS to_name
     FROM marches m JOIN players p ON p.id = m.player_id JOIN towns ft ON ft.id = m.from_town
     LEFT JOIN towns tt ON tt.id = m.target_id AND m.target_kind = 'town'
     WHERE m.team_id = ? OR m.target_team = ?`,
  ).bind(player.team_id, player.team_id).all()).results.map((m) => {
    const own = m.team_id === player.team_id;
    return {
      id: m.id, kind: m.kind, status: m.status, own: m.player_id === player.id, ally: own,
      player: m.player_name, from: { id: m.from_town, name: m.from_name, x: m.from_x, y: m.from_y },
      to: { kind: m.target_kind, id: m.target_id, name: m.to_name, x: m.to_x, y: m.to_y },
      targetTeam: m.target_team, teamId: m.team_id,
      units: own ? JSON.parse(m.units) : null, res: own ? JSON.parse(m.res) : null,
      departAt: m.depart_at, arriveAt: m.arrive_at,
    };
  });
  const supportHere = (await db.prepare(
    'SELECT s.id, s.units, p.name FROM support s JOIN players p ON p.id = s.player_id WHERE s.host_town = ?',
  ).bind(townRow.id).all()).results.map((r) => ({ id: r.id, player: r.name, units: JSON.parse(r.units) }));
  const mySupport = (await db.prepare(
    'SELECT s.id, s.units, t.name, t.x, t.y FROM support s JOIN towns t ON t.id = s.host_town WHERE s.player_id = ?',
  ).bind(player.id).all()).results.map((r) => ({ id: r.id, host: r.name, x: r.x, y: r.y, units: JSON.parse(r.units) }));
  const unseen = await db.prepare('SELECT COUNT(*) AS c FROM reports WHERE player_id = ? AND seen = 0').bind(player.id).first();
  // twee aparte MAX-query's: SQLite leest dan via de index maar één rij per kanaal
  const lastWorld = await db.prepare('SELECT MAX(id) AS last FROM messages WHERE channel = ?').bind('world').first();
  const lastTeam = await db.prepare('SELECT MAX(id) AS last FROM messages WHERE channel = ?').bind(`team:${player.team_id}`).first();
  let away = 0;
  for (const m of marches) if (m.own && m.units) away += unitsPop(m.units);
  for (const s of mySupport) away += unitsPop(s.units);
  return json({
    now, world: worldInfo(world, now),
    me: { id: player.id, name: player.name, teamId: player.team_id, killPts: player.kill_pts },
    team: team && { id: team.id, name: team.name, color: team.color },
    town: { id: townRow.id, name: townRow.name, x: townRow.x, y: townRow.y, state },
    awayPop: away, marches, supportHere, mySupport, unseenReports: unseen.c,
    chat: { world: lastWorld.last || 0, team: lastTeam.last || 0 },
  });
});

route('GET', '/map', { auth: true }, async ({ db, world, now }) => {
  const t = gameTime(world, now);
  const towns = (await db.prepare(
    'SELECT t.id, t.name, t.x, t.y, t.state, p.id AS pid, p.name AS pname, p.team_id, p.last_seen FROM towns t JOIN players p ON p.id = t.player_id',
  ).all()).results.map((r) => {
    const s = JSON.parse(r.state);
    advance(s, t, world.speed);
    return {
      id: r.id, name: r.name, x: r.x, y: r.y, playerId: r.pid, player: r.pname, teamId: r.team_id,
      online: now - r.last_seen < 5 * 60000, ...publicSummary(s),
    };
  });
  const camps = (await db.prepare('SELECT id, x, y, level, state FROM camps').all()).results.map((c) => {
    const s = JSON.parse(c.state);
    const fresh = !s.refresh_at || now >= s.refresh_at;
    return {
      id: c.id, x: c.x, y: c.y, level: c.level,
      plundered: !fresh && countUnits(s.units) === 0, refreshAt: fresh ? 0 : s.refresh_at,
    };
  });
  const teams = (await db.prepare('SELECT id, name, color, slot FROM teams').all()).results;
  return json({ now, towns, camps, teams });
});

route('GET', '/team', { auth: true }, async ({ db, world, player, now }) => {
  const t = gameTime(world, now);
  const rows = (await db.prepare(
    'SELECT t.id, t.name, t.x, t.y, t.state, p.id AS pid, p.name AS pname, p.last_seen, p.kill_pts FROM towns t JOIN players p ON p.id = t.player_id WHERE p.team_id = ?',
  ).bind(player.team_id).all()).results;
  const members = rows.map((r) => {
    const s = JSON.parse(r.state);
    advance(s, t, world.speed);
    const res = {};
    for (const k of RES) res[k] = Math.floor(s.res[k]);
    return {
      townId: r.id, town: r.name, x: r.x, y: r.y, playerId: r.pid, player: r.pname, me: r.pid === player.id,
      lastSeen: r.last_seen, killPts: r.kill_pts, res, units: s.units, villagers: totalVillagers(s),
      ...publicSummary(s),
    };
  });
  return json({ members });
});

route('GET', '/leaderboard', { auth: true }, async ({ db, world, now }) => {
  const t = gameTime(world, now);
  const rows = (await db.prepare(
    'SELECT t.state, t.name AS town, p.name, p.team_id, p.kill_pts FROM towns t JOIN players p ON p.id = t.player_id',
  ).all()).results;
  const teams = (await db.prepare('SELECT id, name, color FROM teams').all()).results;
  const players = rows.map((r) => {
    const s = JSON.parse(r.state);
    advance(s, t, world.speed);
    const build = townScore(s);
    return { name: r.name, town: r.town, teamId: r.team_id, build, kills: r.kill_pts, score: build + r.kill_pts };
  }).sort((a, b) => b.score - a.score);
  const teamScores = teams.map((tm) => ({
    ...tm,
    score: players.filter((p) => p.teamId === tm.id).reduce((a, p) => a + p.score, 0),
    members: players.filter((p) => p.teamId === tm.id).map((p) => p.name),
  })).sort((a, b) => b.score - a.score);
  return json({ players, teams: teamScores, phase: phaseOf(world, now) });
});

// ---------- acties in de eigen stad ----------

async function townAction(ctx, fn) {
  const id = await myTown(ctx);
  const { town } = await mutateTown(ctx.db, ctx.world, id, ctx.now, fn);
  return json({ ok: true, state: town.state });
}

route('POST', '/build', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doBuild(s, String(body.type), int(body.x, -1), int(body.y, -1), ctx.now, ctx.world.speed));
});

route('POST', '/upgrade', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doUpgrade(s, int(body.id), ctx.now, ctx.world.speed));
});

route('POST', '/train', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const away = await awayPop(ctx.db, ctx.player.id);
  return townAction(ctx, (s) => doTrain(s, String(body.unit), int(body.count), ctx.now, ctx.world.speed, away));
});

route('POST', '/villagers', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const alloc = {};
  for (const r of RES) alloc[r] = int(body[r], -1);
  return townAction(ctx, (s) => doAssign(s, alloc, body.rally));
});

route('POST', '/trade', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doTrade(s, String(body.give), String(body.get), int(body.amount)));
});

// ---------- legers ----------

route('POST', '/march', { auth: true, active: true }, async (ctx) => {
  const { db, world, player, now } = ctx;
  const body = await readJson(ctx.request);
  const kind = String(body.kind);
  if (!['attack', 'scout', 'support', 'trade'].includes(kind)) throw new GameError('Ongeldige opdracht.');
  const phase = phaseOf(world, now);
  const { warEnd } = worldTimes(world);
  const home = await db.prepare('SELECT id, x, y FROM towns WHERE player_id = ?').bind(player.id).first();

  let target;
  let targetTeam = 0;
  const tkind = body.targetKind === 'camp' ? 'camp' : 'town';
  if (tkind === 'camp') {
    if (kind !== 'attack' && kind !== 'scout') throw new GameError('Rovers kan je enkel aanvallen of verkennen.');
    target = await db.prepare('SELECT id, x, y FROM camps WHERE id = ?').bind(int(body.targetId)).first();
  } else {
    target = await db.prepare('SELECT t.id, t.x, t.y, p.team_id FROM towns t JOIN players p ON p.id = t.player_id WHERE t.id = ?')
      .bind(int(body.targetId)).first();
    if (target) targetTeam = target.team_id;
  }
  if (!target) throw new GameError('Doelwit niet gevonden.');
  if (tkind === 'town' && target.id === home.id) throw new GameError('Dat is je eigen stad.');
  const ally = tkind === 'town' && targetTeam === player.team_id;
  if ((kind === 'attack' || kind === 'scout') && ally) throw new GameError('Je kan geen bondgenoten aanvallen.');
  if ((kind === 'support' || kind === 'trade') && !ally) throw new GameError('Dat kan enkel bij bondgenoten.');
  if ((kind === 'attack' || kind === 'scout') && tkind === 'town' && phase !== 'war') {
    throw new GameError('Spelers aanvallen kan pas tijdens de oorlogsweek. Rovers mag je altijd aanvallen!');
  }

  const units = {};
  const res = {};
  if (kind === 'trade') {
    for (const r of RES) { const v = int(body.res && body.res[r]); if (v > 0) res[r] = v; }
    if (!Object.keys(res).length) throw new GameError('Kies grondstoffen om te sturen.');
  } else {
    for (const k of ARMY_UNITS) { const v = int(body.units && body.units[k]); if (v > 0) units[k] = v; }
    if (!countUnits(units)) throw new GameError('Kies troepen.');
    if (kind === 'scout' && Object.keys(units).some((k) => k !== 'scout')) throw new GameError('Op verkenning stuur je enkel verkenners.');
  }
  const speed = kind === 'trade' ? MARKET.merchantSpeed : slowestSpeed(units);
  const dur = travelMs(world, home, target, speed);
  if ((kind === 'attack' || kind === 'scout') && now + dur > warEnd) throw new GameError('Je leger zou pas na het einde van het seizoen aankomen.');

  await mutateTown(db, world, home.id, now, (s) => {
    if (kind === 'trade') {
      const L = bLevel(s, 'market');
      if (!L) throw new GameError('Je hebt een markt nodig om karavanen te sturen.');
      const total = Object.values(res).reduce((a, b) => a + b, 0);
      if (total > MARKET.shipPerLevel * L) throw new GameError(`Je markt kan maximaal ${MARKET.shipPerLevel * L} per karavaan sturen.`);
      for (const r of Object.keys(res)) if (s.res[r] < res[r]) throw new GameError('Niet genoeg grondstoffen.');
      for (const r of Object.keys(res)) s.res[r] -= res[r];
    } else {
      for (const k of Object.keys(units)) if ((s.units[k] || 0) < units[k]) throw new GameError(`Niet genoeg ${UNITS[k].name.toLowerCase()}s thuis.`);
      for (const k of Object.keys(units)) {
        s.units[k] -= units[k];
        if (!s.units[k]) delete s.units[k];
      }
    }
  });
  await db.prepare(
    `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
       units, res, depart_at, arrive_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'out')`,
  ).bind(player.id, player.team_id, kind, home.id, home.x, home.y, tkind, target.id, targetTeam, target.x, target.y,
    JSON.stringify(units), JSON.stringify(res), now, now + dur).run();
  return json({ ok: true, arriveAt: now + dur });
});

// troepen bij een bondgenoot terugroepen (door de eigenaar) of terugsturen (door de gastheer)
route('POST', '/recall', { auth: true, active: true }, async (ctx) => {
  const { db, world, player, now } = ctx;
  const body = await readJson(ctx.request);
  const sp = await db.prepare(
    'SELECT s.*, h.x AS hx, h.y AS hy, h.player_id AS host_owner, f.x AS fx, f.y AS fy, p.team_id FROM support s JOIN towns h ON h.id = s.host_town JOIN towns f ON f.id = s.from_town JOIN players p ON p.id = s.player_id WHERE s.id = ?',
  ).bind(int(body.id)).first();
  if (!sp || (sp.player_id !== player.id && sp.host_owner !== player.id)) throw new GameError('Niet gevonden.');
  const units = JSON.parse(sp.units);
  const dur = travelMs(world, { x: sp.hx, y: sp.hy }, { x: sp.fx, y: sp.fy }, slowestSpeed(units));
  const del = await db.prepare('DELETE FROM support WHERE id = ?').bind(sp.id).run();
  if (!del.meta.changes) throw new GameError('Niet gevonden.');
  await db.prepare(
    `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
       units, res, depart_at, arrive_at, status) VALUES (?, ?, 'return', ?, ?, ?, 'town', ?, ?, ?, ?, ?, '{}', ?, ?, 'back')`,
  ).bind(sp.player_id, sp.team_id, sp.from_town, sp.fx, sp.fy, sp.host_town, sp.team_id, sp.hx, sp.hy,
    sp.units, now, now + dur).run();
  return json({ ok: true });
});

// ---------- rapporten en chat ----------

route('GET', '/reports', { auth: true, process: false }, async ({ db, player }) => {
  const rows = (await db.prepare(
    'SELECT id, created_at, kind, title, seen FROM reports WHERE player_id = ? ORDER BY id DESC LIMIT 60',
  ).bind(player.id).all()).results;
  return json({ reports: rows });
});

route('GET', '/report', { auth: true, process: false }, async ({ db, player, url }) => {
  const id = int(url.searchParams.get('id'));
  const row = await db.prepare('SELECT * FROM reports WHERE id = ? AND player_id = ?').bind(id, player.id).first();
  if (!row) throw new GameError('Rapport niet gevonden.', 404);
  if (!row.seen) await db.prepare('UPDATE reports SET seen = 1 WHERE id = ?').bind(id).run();
  return json({ report: { ...row, data: JSON.parse(row.data) } });
});

route('POST', '/reports/read-all', { auth: true, process: false }, async ({ db, player }) => {
  await db.prepare('UPDATE reports SET seen = 1 WHERE player_id = ? AND seen = 0').bind(player.id).run();
  return json({ ok: true });
});

function channelFor(player, ch) {
  return ch === 'team' ? `team:${player.team_id}` : 'world';
}

route('GET', '/chat', { auth: true, process: false }, async ({ db, player, url }) => {
  const ch = channelFor(player, url.searchParams.get('channel'));
  const after = int(url.searchParams.get('after'));
  const rows = (await db.prepare(
    'SELECT id, player_id, name, text, created_at FROM messages WHERE channel = ? AND id > ? ORDER BY id DESC LIMIT 60',
  ).bind(ch, after).all()).results.reverse();
  return json({ messages: rows });
});

route('POST', '/chat', { auth: true, process: false }, async ({ db, player, request, now }) => {
  const body = await readJson(request);
  const text = String(body.text || '').trim().slice(0, 300);
  if (!text) throw new GameError('Leeg bericht.');
  const ch = channelFor(player, body.channel);
  const ins = await db.prepare('INSERT INTO messages (channel, player_id, name, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(ch, player.id, player.name, text, now).run();
  if (ins.meta.last_row_id % 25 === 0) {
    await db.prepare('DELETE FROM messages WHERE channel = ? AND id < ?').bind(ch, ins.meta.last_row_id - 300).run();
  }
  return json({ ok: true });
});

// ---------- beheer ----------

function readTimes(body, w) {
  const out = {};
  if (body.startAt !== undefined && body.startAt !== '') {
    const t = typeof body.startAt === 'number' ? body.startAt : Date.parse(body.startAt);
    if (!Number.isFinite(t)) throw new GameError('Ongeldige startdatum.');
    out.start_at = t;
  }
  if (body.prepDays !== undefined && body.prepDays !== '') out.prep_ms = Math.round(Number(body.prepDays) * 86400000);
  if (body.warDays !== undefined && body.warDays !== '') out.war_ms = Math.round(Number(body.warDays) * 86400000);
  if (body.speed !== undefined && body.speed !== '') out.speed = Math.min(1000, Math.max(0.1, Number(body.speed)));
  if (body.teamSize !== undefined && body.teamSize !== '') out.team_size = Math.min(8, Math.max(1, int(body.teamSize)));
  if (body.joinCode !== undefined) out.join_code = String(body.joinCode).trim() || null;
  for (const k of ['prep_ms', 'war_ms', 'speed']) if (k in out && !(out[k] > 0)) throw new GameError(`Ongeldige waarde voor ${k}.`);
  return { ...w, ...out };
}

route('POST', '/admin/reset', { admin: true }, async ({ db, request, now }) => {
  const body = await readJson(request);
  const w = readTimes(body, {
    start_at: now, prep_ms: 21 * 86400000, war_ms: 7 * 86400000, speed: 1, team_size: 2, join_code: null,
  });
  const seed = int(body.seed) || Math.floor(Math.random() * 1e9);
  const size = WORLD_SIZE;
  const terrain = generateTerrain(seed, size);
  const camps = generateCamps(seed, size, terrain, CAMP_EXTRA);
  const stmts = ['world', 'teams', 'players', 'sessions', 'towns', 'camps', 'marches', 'support', 'reports', 'messages']
    .map((tb) => db.prepare(`DELETE FROM ${tb}`));
  stmts.push(db.prepare('INSERT INTO world (id, seed, size, start_at, prep_ms, war_ms, speed, team_size, join_code, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(seed, size, w.start_at, w.prep_ms, w.war_ms, w.speed, w.team_size, w.join_code, now));
  for (const c of camps) {
    stmts.push(db.prepare('INSERT INTO camps (x, y, level, state) VALUES (?, ?, ?, ?)')
      .bind(c.x, c.y, c.level, JSON.stringify(freshCampState(c.level))));
  }
  await db.batch(stmts);
  return json({ ok: true, seed, camps: camps.length });
});

route('POST', '/admin/update', { admin: true }, async ({ db, request, now }) => {
  const body = await readJson(request);
  const cur = await getWorld(db);
  if (!cur) throw new GameError('Er is nog geen wereld.');
  const w = readTimes(body, cur);
  await db.prepare('UPDATE world SET start_at = ?, prep_ms = ?, war_ms = ?, speed = ?, team_size = ?, join_code = ? WHERE id = 1')
    .bind(w.start_at, w.prep_ms, w.war_ms, w.speed, w.team_size, w.join_code).run();
  return json({ ok: true, world: worldInfo(w, now) });
});

route('GET', '/admin/status', { admin: true }, async ({ db, now }) => {
  const w = await getWorld(db);
  const players = (await db.prepare(
    'SELECT p.id, p.name, p.team_id, p.last_seen, p.kill_pts, t.name AS team FROM players p LEFT JOIN teams t ON t.id = p.team_id ORDER BY p.team_id',
  ).all()).results;
  const marches = await db.prepare('SELECT COUNT(*) AS c FROM marches').first();
  return json({ world: w && { ...w, ...worldInfo(w, now), join_code: w.join_code }, players, marches: marches.c, now });
});

route('POST', '/admin/message', { admin: true }, async ({ db, request, now }) => {
  const body = await readJson(request);
  const text = String(body.text || '').trim().slice(0, 300);
  if (!text) throw new GameError('Leeg bericht.');
  await db.prepare("INSERT INTO messages (channel, player_id, name, text, created_at) VALUES ('world', 0, 'Spelleider', ?, ?)")
    .bind(text, now).run();
  const players = (await db.prepare('SELECT id FROM players').all()).results;
  if (players.length) {
    await db.batch(players.map((p) => db.prepare('INSERT INTO reports (player_id, created_at, kind, title, data) VALUES (?, ?, ?, ?, ?)')
      .bind(p.id, now, 'info', 'Bericht van de spelleider', JSON.stringify({ type: 'info', text }))));
  }
  return json({ ok: true });
});

export const _test = { routes };
