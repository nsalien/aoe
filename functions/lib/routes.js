import { json, readJson, int, wrapDb, GameError } from './http.js';
import { vapidKeys, validPushEndpoint, notifyAll, notifyAttack, notifyPlayer } from './push.js';
import { botTick, ensureBots, BOT_MAX } from './bots.js';
import { relocateTeam } from './relocate.js';
import { relation, payRansom, vassalShare } from './vassal.js';
import {
  hashPassword, newSalt, safeEqual, createSession, sessionCookie, clearCookie, getSessionPlayer,
  destroySession, validateName, validatePassword,
} from './auth.js';
import {
  getWorld, phaseOf, worldTimes, peaceEnd, peaceBlock, gameTime, loadTown, mutateTown, processDue, travelMs, awayPop, awayInfo,
  battleView, setBattleMode, battleOrder, myBattles, startPractice,
  freshCampState,
} from './game.js';
import {
  newTownState, advance, doBuild, doUpgrade, doTrain, doAssign, doTrade, doHarvest, bLevel, publicSummary, doResearch,
  townScore, totalVillagers, unitsPop, ensureTerritory, doFieldSend, doFieldOrder, doFieldSplit,
  doBuyLot, doPlaceWalls, doRemoveWalls, doPlaceGate, doDemolish, doMove, doMoveWalls,
} from '../../public/shared/sim.js';
import { slowestSpeed, countUnits } from '../../public/shared/battle.js';
import { generateTerrain, generateCamps, teamRegion, findSpot } from '../../public/shared/worldgen.js';
import {
  RES, UNITS, ARMY_UNITS, MARKET, CIVS, CIV_IDS, TEAM_NAMES, TEAM_COLORS, MAX_TEAMS, WORLD_SIZE, CAMP_EXTRA,
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
    // later(p): werk na het antwoord (meldingen e.d.), met een eigen database-teller
    const later = (fn) => { const p = fn(wrapDb(env.DB)).catch((e) => console.error('later', e && e.message)); if (context.waitUntil) context.waitUntil(p); return p; };
    const ctx = { request, env, db, url, now, later };
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
    if (ctx.world && r.process !== false) {
      await processDue(db, ctx.world, now);
      // meldingen 'leger komt bijna aan' en 'bouwer vrij' (de cron-worker doet dit elke minuut; dit is een vangnet)
      if (context.waitUntil) context.waitUntil(notifyAll(wrapDb(env.DB), now, 2).catch((e) => console.error('notify', e && e.message)));
    }
    if (r.active) {
      const phase = phaseOf(ctx.world, now);
      if (phase === 'lobby') throw new GameError('Het spel is nog niet begonnen.');
      if (phase === 'ended') throw new GameError('Het seizoen is afgelopen.');
    }
    const res = await r.fn(ctx);
    // computerspelers: bij gewone verzoeken komt telkens één bot aan de beurt (na het antwoord, binnen de query-limiet)
    if (ctx.world && r.process !== false && db.ctx.count <= 18) {
      const bt = botTick(db, ctx.world, now).catch((e) => console.error('bot', e && e.stack));
      if (context.waitUntil) context.waitUntil(bt); else await bt;
    }
    return res;
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
  const all = (await db.prepare(
    'SELECT t.id, t.slot, COUNT(p.id) AS c, COALESCE(SUM(p.bot), 0) AS b FROM teams t LEFT JOIN players p ON p.team_id = t.id GROUP BY t.id ORDER BY t.slot',
  ).all()).results;
  // clans van computerspelers zijn enkel voor bots
  const teams = all.filter((t) => !t.b);
  let team = null;
  const open = teams.filter((t) => t.c < world.team_size);
  if (open.length) {
    const most = Math.max(...open.map((t) => t.c));
    const cand = open.filter((t) => t.c === most);
    team = cand[Math.floor(Math.random() * cand.length)];
  } else if (all.length < MAX_TEAMS) {
    const slot = all.length;
    const ins = await db.prepare('INSERT INTO teams (slot, name, color) VALUES (?, ?, ?)')
      .bind(slot, TEAM_NAMES[slot], TEAM_COLORS[slot]).run();
    team = { id: ins.meta.last_row_id, slot, c: 0 };
  } else {
    if (!teams.length) throw new GameError('De wereld is vol.');
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
  // het gekozen volk (of een willekeurig als er niets gekozen is)
  const civ = CIVS[body.civ] ? body.civ : CIV_IDS[Math.floor(Math.random() * CIV_IDS.length)];
  const state = newTownState(Math.max(now, world.start_at), civ);
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
  ensureTerritory(state, townRow.id);
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
    // versterking, karavanen en schatting naar ons (bv. van een vazal uit een andere clan) zijn vriendelijk
    const friendly = own || (['support', 'trade', 'tribute'].includes(m.kind) && m.target_team === player.team_id);
    return {
      id: m.id, kind: m.kind, status: m.status, own: m.player_id === player.id, ally: friendly,
      player: m.player_name, from: { id: m.from_town, name: m.from_name, x: m.from_x, y: m.from_y },
      to: { kind: m.target_kind, id: m.target_id, name: m.to_name, x: m.to_x, y: m.to_y },
      targetTeam: m.target_team, teamId: m.team_id,
      units: friendly ? JSON.parse(m.units) : null, res: friendly ? JSON.parse(m.res) : null,
      departAt: m.depart_at, arriveAt: m.arrive_at, pref: m.player_id === player.id ? m.pref_mode || null : null,
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
  const battles = await myBattles(db, player.id, now);
  const vassals = (await db.prepare(
    'SELECT v.town_id, v.until, v.next_tribute, t.name, t.x, t.y, p.name AS pname FROM vassals v JOIN towns t ON t.id = v.town_id JOIN players p ON p.id = v.player_id WHERE v.lord_player = ?',
  ).bind(player.id).all()).results.map((r) => ({ townId: r.town_id, town: r.name, player: r.pname, x: r.x, y: r.y, until: r.until, nextTribute: r.next_tribute }));
  let away = 0;
  for (const m of marches) if (m.own && m.units) away += unitsPop(m.units);
  for (const s of mySupport) away += unitsPop(s.units);
  return json({
    now, world: worldInfo(world, now),
    me: { id: player.id, name: player.name, teamId: player.team_id, killPts: player.kill_pts, peaceEnd: peaceEnd(world, player.created_at) },
    team: team && { id: team.id, name: team.name, color: team.color },
    town: { id: townRow.id, name: townRow.name, x: townRow.x, y: townRow.y, state },
    awayPop: away, marches, supportHere, mySupport, unseenReports: unseen.c, battles, vassals,
    chat: { world: lastWorld.last || 0, team: lastTeam.last || 0 },
  });
});

route('GET', '/map', { auth: true }, async ({ db, world, now }) => {
  const t = gameTime(world, now);
  const towns = (await db.prepare(
    'SELECT t.id, t.name, t.x, t.y, t.state, p.id AS pid, p.name AS pname, p.team_id, p.last_seen, p.created_at, p.bot FROM towns t JOIN players p ON p.id = t.player_id',
  ).all()).results.map((r) => {
    const s = JSON.parse(r.state);
    ensureTerritory(s, r.id);
    advance(s, t, world.speed);
    return {
      id: r.id, name: r.name, x: r.x, y: r.y, playerId: r.pid, player: r.pname, teamId: r.team_id, civ: s.civ,
      online: !r.bot && now - r.last_seen < 5 * 60000, bot: !!r.bot, botTier: r.bot && s.bot ? s.bot.tier || null : null,
      peaceEnd: peaceEnd(world, r.created_at), ...publicSummary(s),
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
    ensureTerritory(s, r.id);
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
    'SELECT t.id, t.state, t.name AS town, p.id AS pid, p.name, p.team_id, p.kill_pts, p.bot FROM towns t JOIN players p ON p.id = t.player_id',
  ).all()).results;
  const teams = (await db.prepare('SELECT id, name, color FROM teams').all()).results;
  const vrows = (await db.prepare('SELECT player_id, lord_player FROM vassals').all()).results;
  const players = rows.map((r) => {
    const s = JSON.parse(r.state);
    ensureTerritory(s, r.id);
    advance(s, t, world.speed);
    const build = townScore(s);
    return { id: r.pid, name: r.name, town: r.town, teamId: r.team_id, build, kills: r.kill_pts, score: build + r.kill_pts, bot: !!r.bot, botTier: r.bot && s.bot ? s.bot.tier || null : null };
  });
  // heren krijgen een deel van de punten van hun vazallen
  const byId = new Map(players.map((p) => [p.id, p]));
  const share = vassalShare(vrows, (id) => (byId.get(id) ? byId.get(id).build : 0));
  for (const p of players) {
    p.vassalPts = share[p.id] || 0; p.score += p.vassalPts;
    p.vassals = vrows.filter((v) => v.lord_player === p.id).length;
    const lord = vrows.find((v) => v.player_id === p.id);
    p.lord = lord && byId.get(lord.lord_player) ? byId.get(lord.lord_player).name : null;
  }
  players.sort((a, b) => b.score - a.score);
  for (const p of players) delete p.id;
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

// gebouw verplaatsen (gratis, naar vrije bouwgrond)
route('POST', '/move', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doMove(s, int(body.id), int(body.x, -9999), int(body.y, -9999)));
});

// muurstukken of een poort verplaatsen (gratis)
route('POST', '/walls/move', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const tiles = Array.isArray(body.tiles) ? body.tiles.slice(0, 200).map((t) => (Array.isArray(t) ? [int(t[0], -9999), int(t[1], -9999)] : [-9999, -9999])) : [];
  return townAction(ctx, (s) => doMoveWalls(s, tiles, int(body.dx, 0), int(body.dy, 0)));
});

// gebouw afbreken (een deel van de kosten komt terug)
route('POST', '/demolish', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doDemolish(s, int(body.id)));
});

// poort in de stadsmuur (op een muurstuk of in een gat van één tegel)
route('POST', '/gate', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doPlaceGate(s, int(body.i, -9999), int(body.j, -9999)));
});

route('POST', '/upgrade', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doUpgrade(s, int(body.id), ctx.now, ctx.world.speed));
});

route('POST', '/train', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const away = await awayInfo(ctx.db, ctx.player.id);
  return townAction(ctx, (s) => doTrain(s, String(body.unit), int(body.count), ctx.now, ctx.world.speed, away.pop, away.nobles));
});

route('POST', '/research', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doResearch(s, String(body.id), ctx.now, ctx.world.speed));
});

// vazal: losgeld betalen en meteen vrij zijn
route('POST', '/vassal/ransom', { auth: true, active: true }, async (ctx) => {
  const cost = await payRansom(ctx.db, ctx.world, ctx.player, ctx.now);
  return json({ ok: true, cost });
});

route('POST', '/villagers', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const alloc = {};
  for (const r of RES) alloc[r] = int(body[r], -1);
  return townAction(ctx, (s) => doAssign(s, alloc, body.rally));
});

// een dorpeling een vondst (schaap, boom, rotsen, goud) laten oogsten
route('POST', '/harvest', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const job = typeof body.job === 'string' ? body.job : null;
  return townAction(ctx, (s) => doHarvest(s, int(body.nodeId), job, ctx.now));
});

// grond bijkopen (lot van 4 x 4 tegels)
route('POST', '/land', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  return townAction(ctx, (s) => doBuyLot(s, int(body.li, NaN), int(body.lj, NaN)));
});

// muren plaatsen of afbreken, tegel per tegel
route('POST', '/walls', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const tiles = Array.isArray(body.tiles) ? body.tiles.slice(0, 80).map((t) => (Array.isArray(t) ? [int(t[0], NaN), int(t[1], NaN)] : null)).filter(Boolean) : [];
  return townAction(ctx, (s) => (body.remove ? doRemoveWalls(s, tiles) : doPlaceWalls(s, tiles)));
});

// eenheden in je eigen gebied besturen (verkennen, aanvallen, verzamelen, bos kappen, naar huis)
const FIELD_AT_WINDOW = 10000;
const FIELD_MAX_OPS = 16;

function fieldOp(s, op, at) {
  const to = op.to && { x: Number(op.to.x), y: Number(op.to.y) };
  const target = op.target && typeof op.target === 'object' ? op.target : null;
  const pace = Number(op.pace) > 0 ? Number(op.pace) : null;
  if (op.action === 'send') {
    const from = op.from && { x: Number(op.from.x), y: Number(op.from.y) };
    return doFieldSend(s, op.spec || {}, from, to, target, at, pace);
  }
  if (op.action === 'split') return doFieldSplit(s, int(op.id), op.units && typeof op.units === 'object' ? op.units : {}, to, target, at, pace);
  return doFieldOrder(s, int(op.id), to, target, at, pace);
}

// Eén of meer bevelen (een heel leger = één verzoek). De browser voert ze meteen zelf uit en geeft het tijdstip
// mee; de server rekent de stad tot exact dat tijdstip verder en voert ze daar uit, zodat beide hetzelfde pad
// berekenen en niets verspringt. Enkel een tijdstip van de laatste seconden telt, en nooit vóór de laatst bewaarde stand.
route('POST', '/field', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const ops = (Array.isArray(body.ops) ? body.ops : [body]).filter((o) => o && typeof o === 'object').slice(0, FIELD_MAX_OPS);
  if (!ops.length) throw new GameError('Geen opdracht.');
  const clampAt = (v) => Math.min(ctx.now, Math.max(ctx.now - FIELD_AT_WINDOW, Math.floor(Number(v)) || ctx.now));
  const id = await myTown(ctx);
  const { town, result } = await mutateTown(ctx.db, ctx.world, id, clampAt(ops[0].at), (s) => {
    const errors = [];
    for (const op of ops) {
      const at = Math.max(clampAt(op.at), s.t);
      advance(s, gameTime(ctx.world, at), ctx.world.speed);
      try { fieldOp(s, op, at); } catch (e) {
        if (!(e instanceof GameError)) throw e;
        errors.push(e.message);
      }
    }
    if (errors.length === ops.length) throw new GameError(errors[0]);
    return errors;
  });
  return json({ ok: true, state: town.state, errors: result });
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
  const { warEnd } = worldTimes(world);
  const home = await db.prepare('SELECT id, x, y, state FROM towns WHERE player_id = ?').bind(player.id).first();
  const homeTech = JSON.parse(home.state).tech || null;

  let target;
  let targetTeam = 0;
  const tkind = body.targetKind === 'camp' ? 'camp' : 'town';
  if (tkind === 'camp') {
    if (kind !== 'attack' && kind !== 'scout') throw new GameError('Rovers kan je enkel aanvallen of verkennen.');
    target = await db.prepare('SELECT id, x, y FROM camps WHERE id = ?').bind(int(body.targetId)).first();
  } else {
    target = await db.prepare('SELECT t.id, t.x, t.y, t.player_id, p.team_id, p.created_at FROM towns t JOIN players p ON p.id = t.player_id WHERE t.id = ?')
      .bind(int(body.targetId)).first();
    if (target) targetTeam = target.team_id;
  }
  if (!target) throw new GameError('Doelwit niet gevonden.');
  if (tkind === 'town' && target.id === home.id) throw new GameError('Dat is je eigen stad.');
  // heer en vazal vallen elkaar niet aan, maar mogen elkaar wel helpen
  const rel = tkind === 'town' ? await relation(db, player.id, target.player_id) : null;
  const ally = tkind === 'town' && (targetTeam === player.team_id || !!rel);
  if ((kind === 'attack' || kind === 'scout') && rel) throw new GameError(rel === 'lord' ? 'Dit is je vazal: die val je niet aan.' : 'Je kan je heer niet aanvallen. Koop je vrij of laat een clanlid je bevrijden.');
  if ((kind === 'attack' || kind === 'scout') && ally) throw new GameError('Je kan geen bondgenoten aanvallen.');
  if ((kind === 'support' || kind === 'trade') && !ally) throw new GameError('Dat kan enkel bij bondgenoten.');

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
  if (units.noble && kind !== 'attack' && kind !== 'support') throw new GameError('Een edelman gaat enkel mee met een aanval of als versterking.');
  const speed = kind === 'trade' ? MARKET.merchantSpeed : slowestSpeed(units, homeTech);
  const dur = travelMs(world, home, target, speed);
  if ((kind === 'attack' || kind === 'scout') && now + dur > warEnd) throw new GameError('Je leger zou pas na het einde van het seizoen aankomen.');
  if ((kind === 'attack' || kind === 'scout') && tkind === 'town') {
    const why = peaceBlock(world, player.created_at, target.created_at, now, now + dur);
    if (why) throw new GameError(why);
  }

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
  const ins = await db.prepare(
    `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
       units, res, depart_at, arrive_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'out')`,
  ).bind(player.id, player.team_id, kind, home.id, home.x, home.y, tkind, target.id, targetTeam, target.x, target.y,
    JSON.stringify(units), JSON.stringify(res), now, now + dur).run();
  // de verdediger krijgt meteen een melding op zijn gsm (als hij die aan heeft)
  if (kind === 'attack' && tkind === 'town' && ins.meta && ins.meta.last_row_id) ctx.later((d) => notifyAttack(d, ins.meta.last_row_id, now));
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

// ---------- meldingen op je gsm ----------

route('GET', '/push/key', { auth: true, process: false }, async ({ db }) => json({ key: (await vapidKeys(db)).pub }));

route('POST', '/push/subscribe', { auth: true, process: false }, async (ctx) => {
  const { db, player, now } = ctx;
  const body = await readJson(ctx.request);
  const ep = String(body.endpoint || '');
  const keys = body.keys || {};
  const ok = (v, a, b) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && v.length >= a && v.length <= b;
  if (!validPushEndpoint(ep) || ep.length > 900 || !ok(keys.p256dh, 80, 100) || !ok(keys.auth, 16, 30)) throw new GameError('Ongeldige inschrijving voor meldingen.');
  await db.prepare(
    `INSERT INTO push_subs (player_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET player_id = excluded.player_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).bind(player.id, ep, keys.p256dh, keys.auth, now).run();
  // hooguit 4 toestellen per speler
  await db.prepare('DELETE FROM push_subs WHERE player_id = ? AND id NOT IN (SELECT id FROM push_subs WHERE player_id = ? ORDER BY id DESC LIMIT 4)')
    .bind(player.id, player.id).run();
  return json({ ok: true, prefs: await pushPrefs(db, player.id, ep) });
});

// welke meldingen staan aan op dit toestel (per inschrijving)
async function pushPrefs(db, playerId, endpoint) {
  const r = await db.prepare('SELECT n_attack, n_build, n_march FROM push_subs WHERE endpoint = ? AND player_id = ?').bind(endpoint, playerId).first();
  return r ? { attack: !!r.n_attack, build: !!r.n_build, march: !!r.n_march } : null;
}

// meldingen apart aan/uit zetten op dit toestel
route('POST', '/push/prefs', { auth: true, process: false }, async (ctx) => {
  const { db, player } = ctx;
  const body = await readJson(ctx.request);
  const ep = String(body.endpoint || '');
  const cur = await pushPrefs(db, player.id, ep);
  if (!cur) throw new GameError('Meldingen staan niet aan op dit toestel.');
  const v = (k) => (typeof body[k] === 'boolean' ? body[k] : cur[k]) ? 1 : 0;
  await db.prepare('UPDATE push_subs SET n_attack = ?, n_build = ?, n_march = ? WHERE endpoint = ? AND player_id = ?')
    .bind(v('attack'), v('build'), v('march'), ep, player.id).run();
  return json({ ok: true, prefs: await pushPrefs(db, player.id, ep) });
});

route('POST', '/push/unsubscribe', { auth: true, process: false }, async (ctx) => {
  const body = await readJson(ctx.request);
  await ctx.db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND player_id = ?').bind(String(body.endpoint || ''), ctx.player.id).run();
  return json({ ok: true });
});

// proefmelding naar je eigen toestellen
route('POST', '/push/test', { auth: true, process: false }, async ({ db, player }) => {
  const sent = await notifyPlayer(db, await vapidKeys(db), player.id, {
    title: 'Meldingen staan aan', body: 'Je krijgt een melding bij een aanval op je stad, als een bouwer vrij is en als je leger bijna aankomt. Kies in het spel welke.', tag: 'test', url: '/',
  }, 300);
  return json({ ok: true, sent });
});

// vooraf kiezen voor een aanval die nog onderweg is: zelf besturen of automatisch
route('POST', '/march/mode', { auth: true, active: true }, async (ctx) => {
  const body = await readJson(ctx.request);
  const mode = body.mode === 'manual' || body.mode === 'auto' ? body.mode : null;
  const r = await ctx.db.prepare("UPDATE marches SET pref_mode = ? WHERE id = ? AND player_id = ? AND status = 'out' AND kind = 'attack'")
    .bind(mode, int(body.id), ctx.player.id).run();
  if (!r.meta.changes) throw new GameError('Dit leger is al aangekomen.');
  return json({ ok: true, mode });
});

// ---------- veldslagen (zelf besturen of automatisch) ----------

route('GET', '/battle', { auth: true, process: false }, async ({ db, world, player, now, url }) => {
  const have = url.searchParams.get('have');
  return json({ now, battle: await battleView(db, world, int(url.searchParams.get('id')), player.id, now, have ? Number(have) : null) });
});

route('POST', '/battle/mode', { auth: true, process: false }, async (ctx) => {
  const { db, world, player, now } = ctx;
  const body = await readJson(ctx.request);
  return json({ now, battle: await setBattleMode(db, world, int(body.id), player.id, String(body.mode || ''), now, body.have != null ? Number(body.have) : null) });
});

// oefenslag: meteen een slag van 30 tegen 30 tegen de computer (zonder gevolgen)
route('POST', '/battle/practice', { auth: true, process: false }, async (ctx) => {
  const { db, world, player, now } = ctx;
  const body = await readJson(ctx.request);
  return json({ now, battle: await startPractice(db, world, player, String(body.role || ''), now) });
});

route('POST', '/battle/order', { auth: true, process: false }, async (ctx) => {
  const { db, world, player, now } = ctx;
  const body = await readJson(ctx.request);
  return json({ now, battle: await battleOrder(db, world, int(body.id), player.id, body, now) });
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
  // prep_ms = vrede per speler vanaf zijn start, war_ms = lengte van het hele seizoen
  if (body.peaceHours !== undefined && body.peaceHours !== '') out.prep_ms = Math.round(Number(body.peaceHours) * 3600000);
  if (body.seasonDays !== undefined && body.seasonDays !== '') out.war_ms = Math.round(Number(body.seasonDays) * 86400000);
  if (body.speed !== undefined && body.speed !== '') out.speed = Math.min(1000, Math.max(0.1, Number(body.speed)));
  if (body.teamSize !== undefined && body.teamSize !== '') out.team_size = Math.min(8, Math.max(1, int(body.teamSize)));
  if (body.joinCode !== undefined) out.join_code = String(body.joinCode).trim() || null;
  // computerspelers: aantal en niveau (1 makkelijk, 2 normaal, 3 sterk)
  if (body.bots !== undefined && body.bots !== '') out.bots = Math.max(0, Math.min(BOT_MAX, int(body.bots)));
  if (body.botLevel !== undefined && body.botLevel !== '') out.bot_level = Math.max(1, Math.min(3, int(body.botLevel)));
  if ('prep_ms' in out && !(out.prep_ms >= 0)) throw new GameError('Ongeldige waarde voor de vrede.');
  for (const k of ['war_ms', 'speed']) if (k in out && !(out[k] > 0)) throw new GameError(`Ongeldige waarde voor ${k}.`);
  return { ...w, ...out };
}

route('POST', '/admin/reset', { admin: true }, async ({ db, request, now }) => {
  const body = await readJson(request);
  const w = readTimes(body, {
    start_at: now, prep_ms: 24 * 3600000, war_ms: 28 * 86400000, speed: 1, team_size: 2, join_code: null, bots: 4, bot_level: 2,
  });
  const seed = int(body.seed) || Math.floor(Math.random() * 1e9);
  const size = WORLD_SIZE;
  const terrain = generateTerrain(seed, size);
  const camps = generateCamps(seed, size, terrain, CAMP_EXTRA);
  const stmts = ['world', 'teams', 'players', 'sessions', 'towns', 'camps', 'marches', 'support', 'reports', 'messages', 'battles', 'push_subs', 'vassals']
    .map((tb) => db.prepare(`DELETE FROM ${tb}`));
  stmts.push(db.prepare("DELETE FROM config WHERE k LIKE 'clan:%' OR k LIKE 'prey:%'")); // notities van de bots
  stmts.push(db.prepare('INSERT INTO world (id, seed, size, start_at, prep_ms, war_ms, speed, team_size, join_code, created_at, bots, bot_level) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(seed, size, w.start_at, w.prep_ms, w.war_ms, w.speed, w.team_size, w.join_code, now, w.bots, w.bot_level));
  for (const c of camps) {
    stmts.push(db.prepare('INSERT INTO camps (x, y, level, state) VALUES (?, ?, ?, ?)')
      .bind(c.x, c.y, c.level, JSON.stringify(freshCampState(c.level))));
  }
  await db.batch(stmts);
  // de computerspelers meteen aanmaken (ze halen de tijd sinds de start zelf in)
  await ensureBots(db, await getWorld(db), now, 5);
  return json({ ok: true, seed, camps: camps.length });
});

route('POST', '/admin/update', { admin: true }, async ({ db, request, now }) => {
  const body = await readJson(request);
  const cur = await getWorld(db);
  if (!cur) throw new GameError('Er is nog geen wereld.');
  const w = readTimes(body, cur);
  await db.prepare('UPDATE world SET start_at = ?, prep_ms = ?, war_ms = ?, speed = ?, team_size = ?, join_code = ?, bots = ?, bot_level = ? WHERE id = 1')
    .bind(w.start_at, w.prep_ms, w.war_ms, w.speed, w.team_size, w.join_code, w.bots ?? 0, w.bot_level ?? 2).run();
  await ensureBots(db, await getWorld(db), now, 5);
  return json({ ok: true, world: worldInfo(w, now) });
});

route('GET', '/admin/status', { admin: true }, async ({ db, now }) => {
  const w = await getWorld(db);
  const players = (await db.prepare(
    'SELECT p.id, p.name, p.team_id, p.last_seen, p.kill_pts, p.bot, t.name AS team FROM players p LEFT JOIN teams t ON t.id = p.team_id ORDER BY p.team_id',
  ).all()).results;
  const marches = await db.prepare('SELECT COUNT(*) AS c FROM marches').first();
  return json({ world: w && { ...w, ...worldInfo(w, now), join_code: w.join_code }, players, marches: marches.c, now });
});

// een clan naar een andere (willekeurige, verre) plek op de wereldkaart verplaatsen
route('POST', '/admin/relocate', { admin: true }, async ({ db, request, now }) => {
  const body = await readJson(request);
  const name = String(body.team || '').trim();
  if (!name) throw new GameError('Geef de naam van de clan.');
  const r = await relocateTeam(db, await getWorld(db), /^\d+$/.test(name) ? Number(name) : name, now);
  if (!r) throw new GameError('Die clan (of een plek ervoor) werd niet gevonden.');
  return json({ ok: true, ...r });
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
