// Server-side spelmotor: laden/bewaren van steden, legers verwerken, gevechten.
import {
  advance, addResources, addUnits, bLevel, findType, totalVillagers, protectAmount, age, GameError,
} from '../../public/shared/sim.js';
import {
  resolveBattle, resolveScouting, carryCapacity, computeLoot, countUnits,
} from '../../public/shared/battle.js';
import {
  RES, BUILDINGS, UNITS, COMBAT, CAMP, campUnits, campLoot, campBaseDef, unitValue,
} from '../../public/shared/rules.js';

export class ConflictError extends Error {}

export function worldTimes(w) {
  const prepEnd = w.start_at + w.prep_ms;
  const warEnd = prepEnd + w.war_ms;
  return { startAt: w.start_at, prepEnd, warEnd };
}

export function phaseOf(w, now) {
  const { startAt, prepEnd, warEnd } = worldTimes(w);
  if (now < startAt) return 'lobby';
  if (now < prepEnd) return 'prep';
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

function towerDefense(s) {
  let d = 0;
  for (const b of findType(s, 'tower')) d += BUILDINGS.tower.defense * b.level;
  return d;
}

function townBaseDef(s) {
  return COMBAT.ageDef * age(s) + COMBAT.villagerDef * totalVillagers(s);
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
  for (let loop = 0; loop < 10; loop++) {
    if (db.ctx.count > budget) break;
    const due = await db.prepare(
      `SELECT * FROM marches WHERE status IN ('out','back') AND arrive_at <= ? AND lock_until < ?
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
        await resolveMarch(db, world, m);
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

async function resolveMarch(db, world, m) {
  const t = m.arrive_at;
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

async function attackTown(db, world, m, t) {
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
    const b = resolveBattle({
      attUnits: m.units, attSmithy: smithy, groups, defSmithy: bLevel(s, 'smithy'),
      wall: bLevel(s, 'wall'), towerDef: towerDefense(s), baseDef: townBaseDef(s),
    });
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

async function attackCamp(db, world, m, t) {
  const { attacker, smithy } = await participants(db, m);
  for (let i = 0; i < 4; i++) {
    const c = await loadCamp(db, m.target_id, t);
    if (!c) { await sendBack(db, m, m.units, {}, t); return; }
    const groups = [{ key: 'camp', units: { ...c.state.units } }];
    const b = resolveBattle({ attUnits: m.units, attSmithy: smithy, groups, baseDef: campBaseDef(c.level) });
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
      wallDamage: 0, monumentDamage: 0, supporters: [],
    });
    return;
  }
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
