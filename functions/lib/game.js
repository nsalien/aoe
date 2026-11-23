// Server-side spelmotor: laden/bewaren van steden, legers verwerken, gevechten.
import {
  advance, addResources, addUnits, bLevel, totalVillagers, protectAmount, GameError, ensureTerritory,
  towerDefense, townBaseDef, effectiveWall, newTownState,
} from '../../public/shared/sim.js';
import { tileIndex } from '../../public/shared/territory.js';
import {
  resolveBattle, resolveScouting, carryCapacity, computeLoot, countUnits, subtractUnits,
} from '../../public/shared/battle.js';
import { createBattle, stepTo, queueOrder, battleOutcome, FB } from '../../public/shared/fieldbattle.js';
import {
  RES, UNITS, CAMP, campUnits, campLoot, campBaseDef, unitValue, CIV_IDS,
} from '../../public/shared/rules.js';

export class ConflictError extends Error {}

// Het seizoen loopt van start_at tot start_at + war_ms. Vrede is er niet meer voor iedereen samen, maar per speler:
// prep_ms na zijn start (standaard 24 uur) kan niemand hem aanvallen en kan hij zelf geen spelers aanvallen.
export function worldTimes(w) {
  return { startAt: w.start_at, warEnd: w.start_at + w.war_ms, peaceMs: w.prep_ms };
}

// einde van de vrede van een speler (aangemeld vóór de start: vanaf de start van het seizoen)
export const peaceEnd = (w, playerCreatedAt) => Math.max(playerCreatedAt || 0, w.start_at) + w.prep_ms;

const fmtLeft = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} u ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
};

// Een aanval of verkenning op een speler mag pas aankomen als de vrede van beide spelers voorbij is.
// Geeft de foutmelding terug, of null als het mag.
export function peaceBlock(w, attackerCreatedAt, targetCreatedAt, now, arriveAt) {
  const mine = peaceEnd(w, attackerCreatedAt);
  const theirs = peaceEnd(w, targetCreatedAt);
  if (arriveAt >= Math.max(mine, theirs)) return null;
  if (arriveAt < mine) {
    return `Je hebt nog vrede (nog ${fmtLeft(mine - now)}): tot dan kan je geen spelers aanvallen. Rovers mag je altijd aanvallen!`;
  }
  return `Die speler is net begonnen en heeft nog vrede (nog ${fmtLeft(theirs - now)}). Je leger zou te vroeg aankomen.`;
}

export function phaseOf(w, now) {
  const { startAt, warEnd } = worldTimes(w);
  if (now < startAt) return 'lobby';
  if (now < warEnd) return 'war';
  return 'ended';
}

// het spel "bevriest" op het einde van de oorlog
export const gameTime = (w, t) => Math.min(t, worldTimes(w).warEnd);

export async function getWorld(db) {
  return db.prepare('SELECT * FROM world WHERE id = 1').first();
}

export async function loadTown(db, id) {
  const row = await db.prepare('SELECT * FROM towns WHERE id = ?').bind(id).first();
  if (!row) return null;
  row.state = JSON.parse(row.state);
  return row;
}

async function saveTown(db, town) {
  const r = await db.prepare('UPDATE towns SET state = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(town.state), town.id, town.version).run();
  if (!r.meta.changes) throw new ConflictError();
  town.version++;
}

// Laad een stad, breng ze naar tijdstip t, pas fn toe en bewaar (met optimistische vergrendeling).
// fn mag enkel de state aanpassen; andere databasewijzigingen gebeuren pas na het bewaren.
export async function mutateTown(db, world, id, t, fn) {
  for (let i = 0; i < 4; i++) {
    const town = await loadTown(db, id);
    if (!town) throw new GameError('Stad niet gevonden.', 404);
    ensureTerritory(town.state, town.id);
    advance(town.state, gameTime(world, t), world.speed);
    const result = await fn(town.state, town);
    try {
      await saveTown(db, town);
      return { town, result };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new GameError('Het is druk, probeer opnieuw.', 409);
}

export async function addReport(db, playerId, t, kind, title, data) {
  const r = await db.prepare('INSERT INTO reports (player_id, created_at, kind, title, data) VALUES (?, ?, ?, ?, ?)')
    .bind(playerId, t, kind, title, JSON.stringify(data)).run();
  // af en toe oude rapporten opruimen om de database klein te houden
  if (r.meta.last_row_id % 25 === 0) {
    await db.prepare('DELETE FROM reports WHERE player_id = ? AND created_at < ?').bind(playerId, t - 14 * 86400000).run();
  }
}

async function addKillPts(db, playerId, value) {
  const pts = Math.round(value);
  if (pts > 0) await db.prepare('UPDATE players SET kill_pts = kill_pts + ? WHERE id = ?').bind(pts, playerId).run();
}

export function travelMs(world, from, to, speed) {
  const dist = Math.hypot(from.x - to.x, from.y - to.y);
  return Math.max(10000, Math.round((dist / speed) * 3600000 / world.speed));
}

function floorRes(res) {
  const o = {};
  for (const r of RES) o[r] = Math.floor(res[r] || 0);
  return o;
}

function damageBuilding(s, type, levels) {
  if (!levels) return 0;
  const b = s.buildings.find((x) => x.type === type);
  if (!b || b.level <= 0) return 0;
  const n = Math.min(levels, b.level);
  b.level -= n;
  const job = s.builds.find((j) => j.bid === b.id);
  if (job) job.to = b.level + 1;
  return n;
}

// ---------- legers verwerken ----------

export async function processDue(db, world, now, budget = 30) {
  let processed = 0;
  await processBattles(db, world, now);
  for (let loop = 0; loop < 10; loop++) {
    if (db.ctx.count > budget) break;
    const due = await db.prepare(
      `SELECT * FROM marches WHERE status IN ('out','back','battle') AND arrive_at <= ? AND lock_until < ?
       ORDER BY arrive_at LIMIT 4`,
    ).bind(now, now).all();
    if (!due.results.length) break;
    for (const m of due.results) {
      if (db.ctx.count > budget) break;
      const lock = await db.prepare('UPDATE marches SET lock_until = ? WHERE id = ? AND lock_until < ?')
        .bind(now + 30000, m.id, now).run();
      if (!lock.meta.changes) continue;
      m.units = JSON.parse(m.units);
      m.res = JSON.parse(m.res);
      try {
        await resolveMarch(db, world, m, now);
        processed++;
      } catch (e) {
        console.error('march', m.id, e && e.stack);
      }
    }
  }
  return processed;
}

async function deleteMarch(db, id) {
  await db.prepare('DELETE FROM marches WHERE id = ?').bind(id).run();
}

async function sendBack(db, m, units, res, t) {
  if (countUnits(units) <= 0) {
    await deleteMarch(db, m.id);
    return;
  }
  const dur = m.arrive_at - m.depart_at;
  await db.prepare(
    `UPDATE marches SET status = 'back', units = ?, res = ?, depart_at = ?, arrive_at = ?, lock_until = 0 WHERE id = ?`,
  ).bind(JSON.stringify(units), JSON.stringify(res), t, t + dur, m.id).run();
}

async function resolveMarch(db, world, m, now = m.arrive_at) {
  const t = m.arrive_at;
  // aanval en iemand is online: eerst kiezen tussen zelf besturen of automatisch
  if (m.status === 'out' && m.kind === 'attack' && await maybeOfferBattle(db, world, m, now)) return;
  // vangnet: een slag die nooit afgerond werd, wordt alsnog automatisch uitgerekend
  if (m.status === 'battle') {
    await db.prepare("UPDATE battles SET status = 'done', version = version + 1, updated_at = ? WHERE march_id = ? AND status != 'done'").bind(now, m.id).run();
    m.status = 'out';
  }
  if (m.status === 'back') {
    const home = await db.prepare('SELECT id FROM towns WHERE id = ?').bind(m.from_town).first();
    if (home) {
      await mutateTown(db, world, m.from_town, t, (s) => {
        addUnits(s, m.units);
        addResources(s, m.res);
      });
    }
    await deleteMarch(db, m.id);
    return;
  }
  if (m.kind === 'support') return arriveSupport(db, m);
  if (m.kind === 'trade') return arriveTrade(db, world, m, t);
  if (m.target_kind === 'camp') {
    if (m.kind === 'scout') return scoutCamp(db, world, m, t);
    return attackCamp(db, world, m, t);
  }
  if (m.kind === 'scout') return scoutTown(db, world, m, t);
  return attackTown(db, world, m, t);
}

async function arriveSupport(db, m) {
  const host = await db.prepare('SELECT id, name FROM towns WHERE id = ?').bind(m.target_id).first();
  if (!host) {
    await sendBack(db, m, m.units, {}, m.arrive_at);
    return;
  }
  const ex = await db.prepare('SELECT * FROM support WHERE player_id = ? AND host_town = ?').bind(m.player_id, m.target_id).first();
  if (ex) {
    const u = JSON.parse(ex.units);
    for (const k of Object.keys(m.units)) u[k] = (u[k] || 0) + m.units[k];
    await db.prepare('UPDATE support SET units = ? WHERE id = ?').bind(JSON.stringify(u), ex.id).run();
  } else {
    await db.prepare('INSERT INTO support (player_id, from_town, host_town, units) VALUES (?, ?, ?, ?)')
      .bind(m.player_id, m.from_town, m.target_id, JSON.stringify(m.units)).run();
  }
  await deleteMarch(db, m.id);
  const hostOwner = await db.prepare('SELECT player_id FROM towns WHERE id = ?').bind(m.target_id).first();
  const sender = await db.prepare('SELECT name FROM players WHERE id = ?').bind(m.player_id).first();
  if (hostOwner && hostOwner.player_id !== m.player_id) {
    await addReport(db, hostOwner.player_id, m.arrive_at, 'support', `Versterking van ${sender ? sender.name : '?'} aangekomen`, {
      type: 'support', from: sender ? sender.name : '?', units: m.units,
    });
  }
}

async function arriveTrade(db, world, m, t) {
  const target = await db.prepare('SELECT id, player_id, name FROM towns WHERE id = ?').bind(m.target_id).first();
  if (target) {
    await mutateTown(db, world, m.target_id, t, (s) => addResources(s, m.res));
    const sender = await db.prepare('SELECT name FROM players WHERE id = ?').bind(m.player_id).first();
    await addReport(db, target.player_id, t, 'trade', `Karavaan van ${sender ? sender.name : '?'} aangekomen`, {
      type: 'trade', from: sender ? sender.name : '?', res: m.res,
    });
  }
  await deleteMarch(db, m.id);
}

async function participants(db, m) {
  const attacker = await db.prepare(
    'SELECT p.id, p.name, t.name AS town, t.state FROM players p JOIN towns t ON t.id = ? WHERE p.id = ?',
  ).bind(m.from_town, m.player_id).first();
  const smithy = attacker ? bLevel(JSON.parse(attacker.state), 'smithy') : 0;
  return { attacker, smithy };
}

async function attackTown(db, world, m, t, override = null) {
  const { attacker, smithy } = await participants(db, m);
  const def = await db.prepare(
    'SELECT t.id, t.name, t.player_id, p.name AS pname FROM towns t JOIN players p ON p.id = t.player_id WHERE t.id = ?',
  ).bind(m.target_id).first();
  if (!def) { await sendBack(db, m, m.units, {}, t); return; }
  const supRows = (await db.prepare(
    'SELECT s.*, p.name AS pname FROM support s JOIN players p ON p.id = s.player_id WHERE s.host_town = ?',
  ).bind(m.target_id).all()).results;
  for (const r of supRows) r.unitsObj = JSON.parse(r.units);

  const { result: out } = await mutateTown(db, world, m.target_id, t, (s) => {
    const groups = [{ key: 'home', units: { ...s.units } }, ...supRows.map((r) => ({ key: r.id, units: r.unitsObj }))];
    const b = override ? override.build(groups, s, smithy) : resolveBattle({
      attUnits: m.units, attSmithy: smithy, groups, defSmithy: bLevel(s, 'smithy'),
      wall: effectiveWall(s), towerDef: towerDefense(s), baseDef: townBaseDef(s),
    });
    // torens die in de veldslag sneuvelden, verliezen een niveau (of vallen helemaal om)
    for (const id of (override && override.towersLost) || []) {
      const tw = s.buildings.find((x) => x.id === id);
      if (!tw) continue;
      tw.level -= 1;
      if (tw.level <= 0) { s.buildings = s.buildings.filter((x) => x !== tw); s.builds = s.builds.filter((j) => j.bid !== id); }
    }
    s.units = b.groupsLeft[0].units;
    for (const k of Object.keys(s.units)) if (!s.units[k]) delete s.units[k];
    let loot = { food: 0, wood: 0, stone: 0, gold: 0 };
    let wallDamage = 0;
    let monumentDamage = 0;
    if (b.attWins) {
      const prot = protectAmount(s);
      const avail = {};
      for (const r of RES) avail[r] = Math.max(0, s.res[r] - prot);
      loot = computeLoot(avail, carryCapacity(b.attLeft));
      for (const r of RES) s.res[r] -= loot[r];
      wallDamage = damageBuilding(s, 'wall', b.wallDamage);
      monumentDamage = damageBuilding(s, 'monument', b.monumentDamage);
    }
    return { b, loot, wallDamage, monumentDamage, groups };
  });

  const { b, loot, wallDamage, monumentDamage, groups } = out;
  // ondersteunende troepen bijwerken
  for (let i = 1; i < groups.length; i++) {
    const left = b.groupsLeft[i].units;
    if (countUnits(left) <= 0) await db.prepare('DELETE FROM support WHERE id = ?').bind(groups[i].key).run();
    else await db.prepare('UPDATE support SET units = ? WHERE id = ?').bind(JSON.stringify(left), groups[i].key).run();
  }
  await sendBack(db, m, b.attLeft, loot, t);

  // punten: waarde van gesneuvelde vijanden / 50
  const defLostValue = b.groupsLost.reduce((a, g) => a + unitValue(g.units), 0);
  await addKillPts(db, m.player_id, defLostValue / 50);
  const attLostValue = unitValue(b.attLost);
  const groupValues = groups.map((g) => unitValue(g.units));
  const totalGroupValue = groupValues.reduce((a, v) => a + v, 0);
  const defOwners = [def.player_id, ...supRows.map((r) => r.player_id)];
  if (totalGroupValue > 0) {
    for (let i = 0; i < groups.length; i++) await addKillPts(db, defOwners[i], (attLostValue / 50) * (groupValues[i] / totalGroupValue));
  } else {
    await addKillPts(db, def.player_id, attLostValue / 50);
  }

  const defUnits = {};
  const defLost = {};
  for (let i = 0; i < groups.length; i++) {
    for (const k of Object.keys(groups[i].units)) defUnits[k] = (defUnits[k] || 0) + groups[i].units[k];
    for (const k of Object.keys(b.groupsLost[i].units)) defLost[k] = (defLost[k] || 0) + b.groupsLost[i].units[k];
  }
  const data = {
    type: 'battle', attWins: b.attWins, A: b.A, D: b.D,
    attacker: { name: attacker ? attacker.name : '?', town: attacker ? attacker.town : '?' },
    defender: { name: def.pname, town: def.name },
    attUnits: m.units, attLost: b.attLost, defUnits, defLost, loot, wallDamage, monumentDamage,
    supporters: supRows.map((r) => r.pname),
  };
  data.live = !!(override && override.live);
  await addReport(db, m.player_id, t, 'attack',
    b.attWins ? `Overwinning bij ${def.name}` : `Nederlaag bij ${def.name}`, data);
  await addReport(db, def.player_id, t, 'defense',
    b.attWins ? `${data.attacker.name} heeft ${def.name} geplunderd` : `${def.name} hield stand tegen ${data.attacker.name}`, data);
  const notified = new Set([def.player_id, m.player_id]);
  for (const r of supRows) {
    if (notified.has(r.player_id)) continue;
    notified.add(r.player_id);
    await addReport(db, r.player_id, t, 'defense', `Je troepen vochten mee in ${def.name}`, data);
  }
  return { attWins: b.attWins, attLeft: b.attLeft, attLost: b.attLost, defLost, loot };
}

function freshCamp(level) {
  return { units: campUnits(level), res: campLoot(level), refresh_at: 0 };
}

async function loadCamp(db, id, t) {
  const c = await db.prepare('SELECT * FROM camps WHERE id = ?').bind(id).first();
  if (!c) return null;
  c.state = JSON.parse(c.state);
  if (c.state.refresh_at && t >= c.state.refresh_at) c.state = freshCamp(c.level);
  return c;
}

async function attackCamp(db, world, m, t, override = null) {
  const { attacker, smithy } = await participants(db, m);
  for (let i = 0; i < 4; i++) {
    const c = await loadCamp(db, m.target_id, t);
    if (!c) { await sendBack(db, m, m.units, {}, t); return; }
    const groups = [{ key: 'camp', units: { ...c.state.units } }];
    const b = override ? override.build(groups, null, smithy, campBaseDef(c.level)) : resolveBattle({ attUnits: m.units, attSmithy: smithy, groups, baseDef: campBaseDef(c.level) });
    let loot = { food: 0, wood: 0, stone: 0, gold: 0 };
    c.state.units = b.groupsLeft[0].units;
    if (b.attWins) {
      loot = computeLoot(c.state.res, carryCapacity(b.attLeft));
      for (const r of RES) c.state.res[r] -= loot[r];
    }
    if (!c.state.refresh_at) c.state.refresh_at = t + Math.round(CAMP.respawnHours * 3600000 / world.speed);
    const r = await db.prepare('UPDATE camps SET state = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(JSON.stringify(c.state), c.id, c.version).run();
    if (!r.meta.changes) continue;
    await sendBack(db, m, b.attLeft, loot, t);
    await addKillPts(db, m.player_id, unitValue(b.groupsLost[0].units) / 100);
    const name = `Roverskamp (niveau ${c.level})`;
    await addReport(db, m.player_id, t, 'attack', b.attWins ? `${name} verslagen` : `Nederlaag bij ${name}`, {
      type: 'battle', camp: true, attWins: b.attWins, A: b.A, D: b.D,
      attacker: { name: attacker ? attacker.name : '?', town: attacker ? attacker.town : '?' },
      defender: { name: 'Rovers', town: name },
      attUnits: m.units, attLost: b.attLost, defUnits: groups[0].units, defLost: b.groupsLost[0].units, loot,
      wallDamage: 0, monumentDamage: 0, supporters: [], live: !!(override && override.live),
    });
    return { attWins: b.attWins, attLeft: b.attLeft, attLost: b.attLost, defLost: b.groupsLost[0].units, loot };
  }
  return null;
}

async function scoutCamp(db, world, m, t) {
  const c = await loadCamp(db, m.target_id, t);
  if (!c) { await sendBack(db, m, m.units, {}, t); return; }
  const r = resolveScouting(m.units.scout || 0, c.state.units.scout || 0);
  const name = `Roverskamp (niveau ${c.level})`;
  await sendBack(db, m, { scout: r.left }, {}, t);
  await addReport(db, m.player_id, t, 'scout', r.success ? `Verkenning van ${name}` : `Verkenners gevangen bij ${name}`, {
    type: 'scout', success: r.success, target: name, sent: m.units.scout || 0, left: r.left,
    units: r.success ? c.state.units : null, res: r.success ? floorRes(c.state.res) : null,
  });
}

async function scoutTown(db, world, m, t) {
  const def = await loadTown(db, m.target_id);
  if (!def) { await sendBack(db, m, m.units, {}, t); return; }
  ensureTerritory(def.state, def.id);
  advance(def.state, gameTime(world, t), world.speed);
  const s = def.state;
  const supRows = (await db.prepare('SELECT units FROM support WHERE host_town = ?').bind(m.target_id).all()).results;
  const support = {};
  for (const row of supRows) {
    const u = JSON.parse(row.units);
    for (const k of Object.keys(u)) support[k] = (support[k] || 0) + u[k];
  }
  const defScouts = (s.units.scout || 0) + (support.scout || 0);
  const r = resolveScouting(m.units.scout || 0, defScouts);
  await sendBack(db, m, { scout: r.left }, {}, t);
  const attacker = await db.prepare('SELECT name FROM players WHERE id = ?').bind(m.player_id).first();
  const levels = {};
  for (const b of s.buildings) if (b.level > 0) levels[b.type] = Math.max(levels[b.type] || 0, b.level);
  await addReport(db, m.player_id, t, 'scout', r.success ? `Verkenning van ${def.name}` : `Verkenners gevangen bij ${def.name}`, {
    type: 'scout', success: r.success, target: def.name, sent: m.units.scout || 0, left: r.left,
    units: r.success ? s.units : null, support: r.success ? support : null,
    res: r.success ? floorRes(s.res) : null, levels: r.success ? levels : null,
    villagers: r.success ? totalVillagers(s) : null, protect: r.success ? protectAmount(s) : null,
  });
  if (defScouts > 0) {
    await addReport(db, def.player_id, t, 'scout',
      r.success ? `Vijandelijke verkenners bespioneerden ${def.name}` : `Je verkenners vingen spionnen van ${attacker ? attacker.name : '?'}`, {
        type: 'scouted', success: r.success, attacker: attacker ? attacker.name : '?', sent: m.units.scout || 0,
      });
  }
}

// ---------- hulpfuncties voor handlers ----------

export async function awayPop(db, playerId) {
  let p = 0;
  const ms = (await db.prepare(`SELECT units FROM marches WHERE player_id = ?`).bind(playerId).all()).results;
  const ss = (await db.prepare(`SELECT units FROM support WHERE player_id = ?`).bind(playerId).all()).results;
  for (const row of [...ms, ...ss]) {
    const u = JSON.parse(row.units);
    for (const k of Object.keys(u)) if (UNITS[k]) p += UNITS[k].pop * (u[k] || 0);
  }
  return p;
}

export function freshCampState(level) {
  return freshCamp(level);
}


// ---------- veldslagen die je zelf kan besturen ----------

const ONLINE_MS = 90000;
const isOnline = (row, now) => !!row && row.last_seen > now - ONLINE_MS;

// Aanval komt aan: als de aanvaller of verdediger online is, krijgen ze even de keuze.
async function maybeOfferBattle(db, world, m, now) {
  const att = await db.prepare('SELECT last_seen FROM players WHERE id = ?').bind(m.player_id).first();
  let defPlayer = null; let defOn = false; let title = 'Roverskamp';
  if (m.target_kind === 'town') {
    const d = await db.prepare('SELECT t.name, p.id, p.last_seen FROM towns t JOIN players p ON p.id = t.player_id WHERE t.id = ?').bind(m.target_id).first();
    if (!d) return false;
    defPlayer = d.id; defOn = isOnline(d, now); title = d.name;
  } else {
    const c = await db.prepare('SELECT level FROM camps WHERE id = ?').bind(m.target_id).first();
    title = `Roverskamp (niveau ${c ? c.level : '?'})`;
  }
  const attOn = isOnline(att, now);
  if (!attOn && !defOn) return false;
  if (now - m.arrive_at > ONLINE_MS) return false; // al lang aangekomen: gewoon automatisch
  // vooraf gekozen (tijdens de aftelling): automatisch en de verdediger is er niet → meteen uitrekenen
  const pref = attOn && (m.pref_mode === 'manual' || m.pref_mode === 'auto') ? m.pref_mode : null;
  if (pref === 'auto' && !defOn) return false;
  const ins = await db.prepare(
    `INSERT INTO battles (march_id, att_player, def_player, target_kind, target_id, title, status, choose_until, att_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'choose', ?, ?, ?, ?)`,
  ).bind(m.id, m.player_id, defPlayer, m.target_kind, m.target_id, title, now + FB.chooseMs, pref, now, now).run();
  // het leger wacht op het slagveld; lukt het afronden nooit, dan neemt processDue het later over
  await db.prepare("UPDATE marches SET status = 'battle', lock_until = ? WHERE id = ?")
    .bind(now + FB.chooseMs + FB.deployMs + FB.maxMs + 600000, m.id).run();
  // al gekozen voor zelf besturen en niemand anders hoeft te kiezen: de slag begint meteen
  if (pref === 'manual' && !defOn) {
    const b = await loadBattle(db, ins.meta.last_row_id);
    if (b) await startBattle(db, world, b, now);
  }
  return true;
}

// het leger dat op dit slagveld vecht (enkel zolang het daar nog staat)
async function loadMarch(db, id) {
  const m = await db.prepare("SELECT * FROM marches WHERE id = ? AND status = 'battle'").bind(id).first();
  if (!m) return null;
  m.units = JSON.parse(m.units); m.res = JSON.parse(m.res);
  return m;
}

export async function loadBattle(db, id) {
  const b = await db.prepare('SELECT * FROM battles WHERE id = ?').bind(id).first();
  if (!b) return null;
  b.state = b.state ? JSON.parse(b.state) : null;
  b.result = b.result ? JSON.parse(b.result) : null;
  return b;
}

async function saveBattle(db, b, now) {
  const r = await db.prepare(
    'UPDATE battles SET status = ?, att_mode = ?, def_mode = ?, state = ?, result = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
  ).bind(b.status, b.att_mode, b.def_mode, b.state ? JSON.stringify(b.state) : null, b.result ? JSON.stringify(b.result) : null, now, b.id, b.version).run();
  if (!r.meta.changes) throw new GameError('Het slagveld veranderde net, probeer opnieuw.', 409);
  b.version++;
}

// keuzes, verlopen keuzetijd, verlaten slagvelden en opruimen
async function processBattles(db, world, now) {
  const due = (await db.prepare(
    `SELECT id FROM battles WHERE (status = 'choose' AND choose_until <= ?) OR (status = 'live' AND updated_at < ?) OR (status = 'done' AND updated_at < ?) LIMIT 3`,
  ).bind(now, now - FB.staleMs, now - 15 * 60000).all()).results;
  for (const { id } of due) {
    if (db.ctx.count > 20) break;
    const b = await loadBattle(db, id);
    if (!b) continue;
    try {
      if (b.status === 'done') await db.prepare('DELETE FROM battles WHERE id = ?').bind(id).run();
      else if (b.status === 'choose') await startBattle(db, world, b, now);
      else await finishBattle(db, world, b, now, true);
    } catch (e) { console.error('battle', id, e && e.stack); }
  }
}

// keuzetijd voorbij of iedereen koos: live slagveld of meteen automatisch
async function startBattle(db, world, b, now) {
  if (b.att_mode !== 'manual' && b.def_mode !== 'manual') return autoBattle(db, world, b, now);
  const m = await loadMarch(db, b.march_id);
  if (!m) { await db.prepare('DELETE FROM battles WHERE id = ?').bind(b.id).run(); return; }
  const att = await db.prepare('SELECT t.state FROM towns t WHERE t.id = ?').bind(m.from_town).first();
  const smithyA = att ? bLevel(JSON.parse(att.state), 'smithy') : 0;
  let setup;
  if (b.target_kind === 'town') {
    const town = await loadTown(db, b.target_id);
    if (!town) return autoBattle(db, world, b, now);
    ensureTerritory(town.state, town.id);
    advance(town.state, gameTime(world, now), world.speed);
    const s = town.state;
    const sup = (await db.prepare('SELECT id, units FROM support WHERE host_town = ?').bind(b.target_id).all()).results;
    const defGroups = [{ key: 'home', units: { ...s.units } }, ...sup.map((r) => ({ key: r.id, units: JSON.parse(r.units) }))];
    setup = {
      kind: 'town', att: m.units, defGroups, smithyA, smithyD: bLevel(s, 'smithy'), town: s, townId: town.id,
      style: { civ: s.civ, age: bLevel(s, 'tc') },
      // de stad zoals ze getekend wordt (enkel wat de browser nodig heeft)
      view: {
        seed: town.id, civ: s.civ || null,
        buildings: s.buildings.map((x) => ({ id: x.id, type: x.type, x: x.x, y: x.y, level: x.level })),
        walls: s.walls || [], gates: s.gates || [], cl: (s.terr && s.terr.cl) || [], lots: (s.terr && s.terr.lots) || [],
      },
    };
  } else {
    const c = await loadCamp(db, b.target_id, now);
    if (!c) return autoBattle(db, world, b, now);
    setup = { kind: 'camp', att: m.units, defGroups: [{ key: 'camp', units: { ...c.state.units } }], smithyA, level: c.level, campSeed: 50000 + c.id, view: { seed: 50000 + c.id, camp: true } };
  }
  // de aanvaller komt uit de richting van zijn eigen stad
  const dir = { x: (m.from_x ?? m.to_x) - m.to_x, y: (m.from_y ?? m.to_y) - m.to_y };
  const state = createBattle({ ...setup, dir, aiAtt: b.att_mode !== 'manual', aiDef: b.def_mode !== 'manual', now });
  // namen en kleuren voor het slagveld in de browser
  const side = (pid) => (pid ? db.prepare('SELECT p.name, tm.color FROM players p LEFT JOIN teams tm ON tm.id = p.team_id WHERE p.id = ?').bind(pid).first() : null);
  const pa = await side(b.att_player); const pd = await side(b.def_player);
  state.meta = {
    attInit: m.units, defInit: Object.fromEntries(setup.defGroups.map((g) => [g.key, g.units])), style: setup.style || null, level: setup.level || 0, view: setup.view,
    att: { name: pa ? pa.name : '?', color: (pa && pa.color) || '#2e6fb5' },
    def: { name: pd ? pd.name : 'Rovers', color: pd ? pd.color || '#c0392b' : '#7a1b12' },
  };
  b.status = 'live';
  b.state = state;
  await saveBattle(db, b, now);
}

// ---------- oefenslag: meteen een slag van 30 tegen 30 tegen de computer, zonder gevolgen ----------
export const PRACTICE = {
  att: { sword: 12, spear: 4, archer: 8, knight: 4, ram: 2 },
  def: { spear: 10, sword: 6, archer: 10, rider: 4 },
};

// een ommuurd oefendorp (stenen muur, vier poorten, twee wachttorens)
function practiceTown(now, civ) {
  const s = newTownState(now, civ);
  s.buildings[0].level = 3;
  s.buildings.find((x) => x.type === 'wall').level = 3;
  let id = 10;
  for (const [type, x, y, level] of [['house', 1, 2, 2], ['house', 2, 2, 2], ['house', 9, 2, 2], ['barracks', 2, 8, 2], ['range', 9, 8, 1],
    ['farm', 8, 10, 1], ['farm', 9, 10, 1], ['market', 3, 4, 1], ['tower', 0, 0, 2], ['tower', 11, 11, 2], ['smithy', 8, 4, 1]]) s.buildings.push({ id: id++, type, x, y, level });
  s.walls = []; s.gates = [];
  const gate = (i, j) => ((i === 5 || i === 6) && (j === -1 || j === 12)) || ((j === 5 || j === 6) && (i === -1 || i === 12)); // poorten van 2 tegels
  for (let i = -1; i <= 12; i++) for (const j of [-1, 12]) (gate(i, j) ? s.gates : s.walls).push(tileIndex(i, j));
  for (let j = 0; j <= 11; j++) for (const i of [-1, 12]) (gate(i, j) ? s.gates : s.walls).push(tileIndex(i, j));
  return s;
}

export async function startPractice(db, world, player, role, now) {
  if (role !== 'att' && role !== 'def') throw new GameError('Kies aanvallen of verdedigen.');
  const busy = await db.prepare("SELECT id FROM battles WHERE (att_player = ? OR def_player = ?) AND status != 'done' LIMIT 1").bind(player.id, player.id).first();
  if (busy) throw new GameError('Je zit al in een slag. Rond die eerst af.');
  const me = await db.prepare('SELECT t.id, t.name, tm.color FROM towns t JOIN players p ON p.id = t.player_id LEFT JOIN teams tm ON tm.id = p.team_id WHERE t.player_id = ?').bind(player.id).first();
  if (!me) throw new GameError('Je hebt nog geen stad.');
  const myColor = me.color || '#2e6fb5';
  // vanuit een (vaste maar telkens andere) richting
  const ang = ((now / 1000) % 360) * (Math.PI / 180);
  const dir = { x: Math.round(Math.cos(ang) * 1000) / 1000, y: Math.round(Math.sin(ang) * 1000) / 1000 };
  let town; let seed; let title;
  if (role === 'att') {
    const civ = CIV_IDS[(player.id + Math.floor(now / 60000)) % CIV_IDS.length];
    town = practiceTown(now, civ); seed = 70000 + player.id; title = 'Oefendorp';
  } else {
    const t = await loadTown(db, me.id);
    ensureTerritory(t.state, t.id);
    advance(t.state, gameTime(world, now), world.speed);
    town = t.state; seed = t.id; title = `${me.name} (oefenslag)`;
  }
  const state = createBattle({
    kind: 'town', att: PRACTICE.att, defGroups: [{ key: 'home', units: { ...PRACTICE.def } }], town, townId: seed, dir,
    aiAtt: role !== 'att', aiDef: role !== 'def', now,
  });
  // de computer krijgt een kleur die duidelijk verschilt van de jouwe
  const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const v = m ? parseInt(m[1], 16) : 0; return [v >> 16, (v >> 8) & 255, v & 255]; };
  const me3 = rgb(myColor);
  const foeColor = ['#2e6fb5', '#c0392b', '#d4a017', '#7d3c98', '#1e8449'].map((c) => ({ c, d: rgb(c).reduce((a, v, i) => a + (v - me3[i]) ** 2, 0) })).sort((a, b) => b.d - a.d)[0].c;
  const foe = { name: 'Computer', color: foeColor }; const mine = { name: player.name, color: myColor };
  state.meta = {
    practice: true, attInit: PRACTICE.att, defInit: { home: PRACTICE.def }, style: { civ: town.civ, age: bLevel(town, 'tc') }, level: 0,
    view: {
      seed, civ: town.civ || null,
      buildings: town.buildings.map((x) => ({ id: x.id, type: x.type, x: x.x, y: x.y, level: x.level })),
      walls: town.walls || [], gates: town.gates || [], cl: (town.terr && town.terr.cl) || [], lots: (town.terr && town.terr.lots) || [],
    },
    att: role === 'att' ? mine : foe, def: role === 'def' ? mine : foe,
  };
  const ins = await db.prepare(
    `INSERT INTO battles (march_id, att_player, def_player, target_kind, target_id, title, status, choose_until, att_mode, def_mode, state, created_at, updated_at)
     VALUES (0, ?, ?, 'practice', 0, ?, 'live', ?, ?, ?, ?, ?, ?)`,
  ).bind(role === 'att' ? player.id : 0, role === 'def' ? player.id : null, title, now, role === 'att' ? 'manual' : 'auto', role === 'def' ? 'manual' : 'auto',
    JSON.stringify(state), now, now).run();
  const b = await loadBattle(db, ins.meta.last_row_id);
  return publicBattle(b, role);
}

// eerst de slag 'claimen' (met versiecontrole), zodat ze nooit twee keer uitgerekend wordt
async function claimBattle(db, b, now) {
  b.status = 'done';
  b.result = { pending: true };
  await saveBattle(db, b, now);
}

async function autoBattle(db, world, b, now) {
  await claimBattle(db, b, now);
  const m = await loadMarch(db, b.march_id);
  let r = null;
  if (m) r = b.target_kind === 'town' ? await attackTown(db, world, m, now) : await attackCamp(db, world, m, now);
  b.status = 'done';
  b.result = { auto: true, attWins: !!(r && r.attWins), attLost: r ? r.attLost : {}, defLost: r ? r.defLost : {}, loot: r ? r.loot : {} };
  b.state = null;
  await saveBattle(db, b, now);
}

// uitslag van het slagveld omzetten naar de vorm van resolveBattle (voor de bestaande verwerking)
function fieldResult(o, meta, groups, finish) {
  const attLeft = o.attLeft;
  const groupsLeft = groups.map((g) => {
    const init = meta.defInit[g.key];
    if (!init) return { key: g.key, units: { ...g.units } }; // kwam pas na de slag aan
    const left = {};
    const survived = o.defLeft[g.key] || {};
    for (const k of Object.keys(g.units)) {
      // overlevenden van de slag + wat er intussen bij kwam
      left[k] = Math.max(0, Math.min(g.units[k], (survived[k] || 0) + Math.max(0, g.units[k] - (init[k] || 0))));
    }
    return { key: g.key, units: left };
  });
  let r = { attWins: o.attWins, attLeft, groupsLeft };
  if (finish) r = finish(r);
  return {
    attWins: r.attWins, A: 0, D: 0, attLeft: r.attLeft, attLost: subtractUnits(meta.attInit, r.attLeft),
    groupsLeft: r.groupsLeft, groupsLost: groups.map((g, i) => ({ key: g.key, units: subtractUnits(g.units, r.groupsLeft[i].units) })),
    wallDamage: o.attWins && o.wallsBroken >= 3 ? 1 : 0, monumentDamage: 0,
  };
}

async function finishBattle(db, world, b, now, abandoned = false) {
  const state = b.state;
  await claimBattle(db, b, now);
  if (b.target_kind === 'practice') {
    // oefenslag: enkel de uitslag tonen, niets verandert in het spel
    const o = battleOutcome(state);
    const defInit = {}; const defLeft = {};
    for (const g of Object.values(state.meta.defInit || {})) for (const [k, n] of Object.entries(g)) defInit[k] = (defInit[k] || 0) + n;
    for (const g of Object.values(o.defLeft)) for (const [k, n] of Object.entries(g)) defLeft[k] = (defLeft[k] || 0) + n;
    b.status = 'done';
    b.result = { practice: true, auto: abandoned, attWins: o.attWins, attLost: subtractUnits(state.meta.attInit, o.attLeft), defLost: subtractUnits(defInit, defLeft), loot: {}, retreat: o.retreat };
    b.state = state;
    await saveBattle(db, b, now);
    return;
  }
  const m = await loadMarch(db, b.march_id);
  const o = battleOutcome(state);
  let r = null;
  if (m) {
    m.units = state.meta.attInit;
    // verlaten slagveld: de rest van de slag wordt automatisch uitgerekend
    const finish = abandoned && state.over == null ? (part) => {
      const rr = resolveBattle({ attUnits: part.attLeft, groups: part.groupsLeft.map((g) => ({ key: g.key, units: g.units })) });
      return { attWins: rr.attWins, attLeft: rr.attLeft, groupsLeft: rr.groupsLeft };
    } : null;
    const override = { live: true, towersLost: o.towersLost, build: (groups) => fieldResult(o, state.meta, groups, finish) };
    r = b.target_kind === 'town' ? await attackTown(db, world, m, now, override) : await attackCamp(db, world, m, now, override);
  }
  b.status = 'done';
  b.result = { auto: abandoned, attWins: !!(r && r.attWins), attLost: r ? r.attLost : {}, defLost: r ? r.defLost : {}, loot: r ? r.loot : {}, retreat: o.retreat };
  await saveBattle(db, b, now);
}

// slag bijwerken tot nu (in stukjes om de server niet te overbelasten)
async function tickBattle(db, world, b, now) {
  if (b.status === 'choose' && now >= b.choose_until) { await startBattle(db, world, b, now); return; }
  if (b.status !== 'live') return;
  // slag van een oudere versie: automatisch afronden
  if (!b.state || b.state.v !== 2) { await finishBattle(db, world, b, now, true); return; }
  // de server rekent iets achter op de klok, zodat bevelen van beide spelers op tijd binnen zijn
  stepTo(b.state, now - FB.delay, FB.maxTicksPerCall);
  if (b.state.over != null) await finishBattle(db, world, b, now);
  else await saveBattle(db, b, now);
}

function battleRole(b, playerId) {
  if (b.att_player === playerId) return 'att';
  if (b.def_player === playerId) return 'def';
  return null;
}

export async function battleView(db, world, id, playerId, now) {
  const b = await loadBattle(db, id);
  if (!b) throw new GameError('Deze veldslag bestaat niet (meer).', 404);
  const role = battleRole(b, playerId);
  if (!role) throw new GameError('Dit is niet jouw veldslag.', 403);
  try {
    await tickBattle(db, world, b, now);
  } catch (e) {
    // iemand anders bewaarde net (de tegenstander peilde of gaf een bevel): toon gewoon de nieuwste stand
    if (e.status !== 409) throw e;
    const fresh = await loadBattle(db, id);
    if (fresh) return publicBattle(fresh, role);
  }
  return publicBattle(b, role);
}

// een wijziging aan de slag opnieuw proberen als iemand anders net bewaarde
async function retry(fn) {
  for (let k = 0; ; k++) {
    try { return await fn(); } catch (e) { if (e.status !== 409 || k >= 3) throw e; }
  }
}

export function publicBattle(b, role) {
  return {
    id: b.id, title: b.title, status: b.status, role, kind: b.target_kind, chooseUntil: b.choose_until,
    attMode: b.att_mode, defMode: b.def_mode, state: b.state, result: b.result,
  };
}

export async function setBattleMode(db, world, id, playerId, mode, now) {
  return retry(() => setBattleModeOnce(db, world, id, playerId, mode, now));
}

async function setBattleModeOnce(db, world, id, playerId, mode, now) {
  const b = await loadBattle(db, id);
  if (!b) throw new GameError('Deze veldslag bestaat niet (meer).', 404);
  const role = battleRole(b, playerId);
  if (!role) throw new GameError('Dit is niet jouw veldslag.', 403);
  if (mode !== 'manual' && mode !== 'auto') throw new GameError('Kies zelf of automatisch.');
  if (b.status === 'done') return publicBattle(b, role);
  if (role === 'att') b.att_mode = mode; else b.def_mode = mode;
  // tijdens de slag: de computer neemt het over (of geeft het bevel terug)
  if (b.status === 'live' && b.state && b.state.v === 2) {
    stepTo(b.state, now - FB.delay, FB.maxTicksPerCall);
    queueOrder(b.state, role === 'att' ? 0 : 1, null, { ai: mode === 'auto' });
  }
  if (b.status === 'choose') {
    // wie niet (meer) online is, laat de slag automatisch verlopen
    const decided = async (pid, mode) => {
      if (!pid || mode) return true;
      return !isOnline(await db.prepare('SELECT last_seen FROM players WHERE id = ?').bind(pid).first(), now);
    };
    if (await decided(b.att_player, b.att_mode) && await decided(b.def_player, b.def_mode)) { await startBattle(db, world, b, now); return publicBattle(b, role); }
  }
  await saveBattle(db, b, now);
  return publicBattle(b, role);
}

export async function battleOrder(db, world, id, playerId, body, now) {
  return retry(() => battleOrderOnce(db, world, id, playerId, body, now));
}

async function battleOrderOnce(db, world, id, playerId, body, now) {
  const b = await loadBattle(db, id);
  if (!b) throw new GameError('Deze veldslag bestaat niet (meer).', 404);
  const role = battleRole(b, playerId);
  if (!role) throw new GameError('Dit is niet jouw veldslag.', 403);
  if (b.status !== 'live') return publicBattle(b, role);
  if ((role === 'att' ? b.att_mode : b.def_mode) !== 'manual') throw new GameError('Je laat deze slag automatisch verlopen.');
  if (!b.state || b.state.v !== 2) return publicBattle(b, role);
  stepTo(b.state, now - FB.delay, FB.maxTicksPerCall);
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 300).map(Number).filter(Number.isFinite) : null;
  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const o = {};
  if (body.ready) o.ready = true;
  else if (body.retreat) { if (role !== 'att') throw new GameError('Enkel de aanvaller kan zich terugtrekken.'); o.retreat = true; }
  else if (body.charge) o.charge = true;
  else if (body.stop) o.stop = true;
  else if (num(body.target) != null) o.target = num(body.target);
  else if (num(body.wall) != null) o.wall = num(body.wall);
  else if (num(body.x) != null && num(body.y) != null) { o.x = num(body.x); o.y = num(body.y); }
  else throw new GameError('Ongeldig bevel.');
  const cid = typeof body.cid === 'string' ? body.cid.slice(0, 24) : null;
  // uitvoeren op de tik waarop de speler tikte (de server loopt iets achter, dus dat is meestal nog niet voorbij)
  queueOrder(b.state, role === 'att' ? 0 : 1, ids, o, num(body.at) ?? b.state.n, cid);
  if (b.state.over != null) await finishBattle(db, world, b, now);
  else await saveBattle(db, b, now);
  return publicBattle(b, role);
}

export async function myBattles(db, playerId, now) {
  const rows = (await db.prepare(
    `SELECT b.id, b.title, b.status, b.choose_until, b.att_player, b.def_player, b.att_mode, b.def_mode, b.result, b.target_kind, p.name AS att_name
     FROM battles b LEFT JOIN players p ON p.id = b.att_player
     WHERE (b.att_player = ? OR b.def_player = ?) AND (b.status != 'done' OR b.updated_at > ?)`,
  ).bind(playerId, playerId, now - 120000).all()).results;
  return rows.map((b) => ({
    id: b.id, title: b.title, status: b.status, chooseUntil: b.choose_until, kind: b.target_kind,
    role: b.att_player === playerId ? 'att' : 'def', attMode: b.att_mode, defMode: b.def_mode, attName: b.att_name,
    result: b.status === 'done' && b.result ? JSON.parse(b.result) : null,
  }));
}
