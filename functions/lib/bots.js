// Computerspelers (bots): gewone spelers in de database (players.bot = 1) met een eigen stad, in eigen clans
// (teams met enkel bots). Er draait geen achtergrondtaak: bij gewone verzoeken van spelers komt telkens hooguit
// één bot aan de beurt (botTick). Hij haalt gemiste tijd in (in stappen, met telkens een beslissing: botbrain.js)
// en beslist daarna over zijn leger, zoals een echte speler:
//   - clanleden versterken als die aangevallen worden (en de troepen nadien terughalen)
//   - grondstoffen sturen naar clanleden die tekortkomen (karavaan via de markt)
//   - spelers aanvallen zodra hun vrede voorbij is (enkel als hij denkt te winnen; samen met de clan)
//   - roverskampen plunderen
import { RES, UNITS, ARMY_UNITS, MARKET, CIV_IDS, TEAM_NAMES, TEAM_COLORS, MAX_TEAMS, campUnits } from '../../public/shared/rules.js';
import {
  newTownState, advance, ensureTerritory, bLevel, capacity, protectAmount, effectiveWall, towerDefense, townBaseDef, age, townScore, loyalty,
} from '../../public/shared/sim.js';
import { nobleBlock } from './vassal.js';
import { notifyAttack } from './push.js';
import { resolveBattle, slowestSpeed, countUnits } from '../../public/shared/battle.js';
import { generateTerrain, teamRegion, findSpot } from '../../public/shared/worldgen.js';
import { phaseOf, gameTime, peaceEnd, peaceBlock, loadTown, saveTown, travelMs, worldTimes, ConflictError } from './game.js';
import { botEconomy, botLevel, armyValue, botStyle, savingFor, BOT_TIERS, tierOf, botTarget } from './botbrain.js';

export const BOT_MAX = 12;
// namen van computerspelers en hun steden
const BOT_NAMES = [
  ['Graaf Boudewijn', 'Ravenstein'], ['Vrouwe Machteld', 'Lindenhof'], ['Heer Gijsbrecht', 'Amstelburcht'],
  ['Hertog Jan', 'Brabantse Wacht'], ['Ridder Walewein', 'Valkenburcht'], ['Gravin Jacoba', 'Teylingen'],
  ['Heer Floris', 'Wolfsheide'], ['Vrouwe Ada', 'Rozendaal'], ['Baron Arnoud', 'Hoornburg'], ['Heer Diederik', 'IJzerhoven'],
  ['Gravin Margareta', 'Gouden Leeuw'], ['Ridder Gawein', 'Elzenburcht'], ['Heer Willem', 'Oranjewoud'], ['Vrouwe Beatrijs', 'Maasvliet'],
];

// gemiste tijd inhalen in stappen (30 minuten; wie ver achter staat, grotere stappen: hij 'kijkt' dan minder vaak)
const stepFor = (behind) => (behind > 24 * 3600000 ? 90 : behind > 6 * 3600000 ? 60 : 30) * 60000;
const STEPS = 3; // hooguit zoveel stappen per beurt (CPU-limiet van de server)
const SLACK = 4 * 60000; // zo dicht bij 'nu' telt een bot als bijgewerkt

// ---------- bots aanmaken en opruimen ----------

async function createBot(db, world, now) {
  const teams = (await db.prepare(
    'SELECT t.id, t.slot, COUNT(p.id) AS c, COALESCE(SUM(p.bot), 0) AS b FROM teams t LEFT JOIN players p ON p.team_id = t.id GROUP BY t.id ORDER BY t.slot',
  ).all()).results;
  const size = Math.max(1, world.team_size || 2);
  // een clan met enkel bots en nog plaats, anders een lege of een nieuwe clan
  let team = teams.find((t) => t.c > 0 && t.b === t.c && t.c < size) || teams.find((t) => t.c === 0);
  if (!team) {
    if (teams.length >= MAX_TEAMS) return null;
    const slot = teams.length;
    const ins = await db.prepare('INSERT INTO teams (slot, name, color) VALUES (?, ?, ?)').bind(slot, TEAM_NAMES[slot], TEAM_COLORS[slot]).run();
    team = { id: ins.meta.last_row_id, slot, c: 0 };
  }
  const taken = new Set((await db.prepare('SELECT name FROM players').all()).results.map((r) => r.name.toLowerCase()));
  let pick = BOT_NAMES.find(([n]) => !taken.has(n.toLowerCase()));
  for (let k = 2; !pick; k++) if (!taken.has(`heer ${k}`)) pick = [`Heer ${k}`, `Burcht ${k}`];
  // de stad in het gebied van de clan
  const terrain = generateTerrain(world.seed, world.size);
  const region = teamRegion(world.seed, world.size, team.slot);
  const used = [...(await db.prepare('SELECT x, y FROM towns').all()).results, ...(await db.prepare('SELECT x, y FROM camps').all()).results];
  const ang = (team.c / Math.max(2, size)) * Math.PI * 2 + team.slot;
  const spot = findSpot(terrain, region.x + Math.cos(ang) * 3.5, region.y + Math.sin(ang) * 3.5, used, 4)
    || findSpot(terrain, world.size / 2, world.size / 2, used, 3);
  if (!spot) return null;
  // een bot begint bij de start van het seizoen en haalt de gemiste tijd zelf in
  const civ = CIV_IDS[Math.floor(Math.random() * CIV_IDS.length)];
  const state = newTownState(world.start_at, civ);
  const n = (await db.prepare('SELECT COUNT(*) AS c FROM players WHERE bot = 1').first()).c;
  state.bot = { tier: tierOf(n), v: 2 };
  const p = await db.prepare('INSERT INTO players (name, pass_hash, salt, team_id, created_at, last_seen, bot, bot_next) VALUES (?, ?, ?, ?, ?, 0, 1, ?)')
    .bind(pick[0], '-', '-', team.id, world.start_at, now).run();
  await db.prepare('INSERT INTO towns (player_id, name, x, y, state) VALUES (?, ?, ?, ?, ?)')
    .bind(p.meta.last_row_id, pick[1], spot.x, spot.y, JSON.stringify(state)).run();
  return p.meta.last_row_id;
}

async function removeBots(db, n) {
  const rows = (await db.prepare('SELECT p.id, t.id AS tid FROM players p LEFT JOIN towns t ON t.player_id = p.id WHERE p.bot = 1 ORDER BY p.id DESC LIMIT ?').bind(n).all()).results;
  for (const r of rows) {
    await db.batch([
      db.prepare('DELETE FROM marches WHERE player_id = ?').bind(r.id),
      db.prepare('DELETE FROM support WHERE player_id = ? OR host_town = ?').bind(r.id, r.tid ?? -1),
      db.prepare('DELETE FROM reports WHERE player_id = ?').bind(r.id),
      db.prepare('DELETE FROM towns WHERE player_id = ?').bind(r.id),
      db.prepare('DELETE FROM players WHERE id = ?').bind(r.id),
    ]);
  }
}

// Referentie voor de balans: scores van de echte spelers die de laatste 3 dagen speelden (anders alle spelers;
// zonder spelers een groeicurve). med = mediaan, hi = de beste.
export async function humanRef(db, world, now) {
  const rows = (await db.prepare('SELECT t.state, p.last_seen FROM towns t JOIN players p ON p.id = t.player_id WHERE p.bot = 0').all()).results;
  const days = Math.max(0, ((now - world.start_at) / 86400000) * (world.speed || 1));
  let list = rows.filter((r) => now - r.last_seen < 3 * 86400000);
  if (!list.length) list = rows;
  const sc = list.map((r) => townScore(JSON.parse(r.state))).sort((a, b) => a - b);
  if (!sc.length) { const c = Math.round(30 + 45 * days); return { med: c, hi: c, n: 0, at: now }; }
  const m = sc.length >> 1;
  const med = sc.length % 2 ? sc[m] : (sc[m - 1] + sc[m]) / 2;
  return { med: Math.round(med), hi: sc[sc.length - 1], n: sc.length, at: now };
}

// zoveel bots als de wereld vraagt (hooguit 'max' nieuwe per keer)
export async function ensureBots(db, world, now, max = 2) {
  if (!world) return 0;
  const want = Math.max(0, Math.min(BOT_MAX, world.bots ?? 0));
  const have = (await db.prepare('SELECT COUNT(*) AS c FROM players WHERE bot = 1').first()).c;
  let made = 0;
  if (have < want) for (let k = 0; k < Math.min(max, want - have); k++) { if (!await createBot(db, world, now)) break; made++; }
  if (have > want) await removeBots(db, have - want);
  return made;
}

// ---------- een beurt van één bot ----------

const unitsOf = (rows) => {
  const away = {}; let pop = 0;
  for (const r of rows) {
    const u = typeof r.units === 'string' ? JSON.parse(r.units) : r.units;
    for (const [k, n] of Object.entries(u || {})) if (UNITS[k]) { away[k] = (away[k] || 0) + n; pop += UNITS[k].pop * n; }
  }
  return { away, pop };
};

// Eén bot laten handelen (als er een aan de beurt is). Geeft terug wat hij deed (voor tests), of null.
export async function botTick(db, world, now) {
  if (!world || phaseOf(world, now) !== 'war') return null;
  // af en toe nakijken of er (nog) zoveel bots zijn als gevraagd
  if (now - (world.bot_check || 0) > 10 * 60000) {
    const u = await db.prepare('UPDATE world SET bot_check = ? WHERE id = 1 AND bot_check = ?').bind(now, world.bot_check || 0).run();
    world.bot_check = now;
    if (u.meta.changes) {
      const ref = await humanRef(db, world, now);
      world.bot_ref = JSON.stringify(ref);
      await db.prepare('UPDATE world SET bot_ref = ? WHERE id = 1').bind(world.bot_ref).run();
      const made = await ensureBots(db, world, now);
      // nog bots te maken: binnen de minuut opnieuw kijken
      if (made) await db.prepare('UPDATE world SET bot_check = ? WHERE id = 1').bind(now - 9 * 60000).run();
      return { checked: true, made };
    }
  }
  const row = await db.prepare(
    'SELECT p.id, p.name, p.team_id, p.created_at, p.bot_next, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.bot = 1 AND p.bot_next <= ? ORDER BY p.bot_next LIMIT 1',
  ).bind(now).first();
  if (!row) return null;
  const lock = await db.prepare('UPDATE players SET bot_next = ? WHERE id = ? AND bot_next = ?').bind(now + 45000, row.id, row.bot_next).run();
  if (!lock.meta.changes) return null;
  const town = await loadTown(db, row.tid);
  if (!town) return null;
  ensureTerritory(town.state, town.id);
  let s = town.state;
  let mem = s.bot || (s.bot = {});
  const speed = world.speed || 1;
  const L = botLevel(world.bot_level);
  const T = gameTime(world, now);
  const pe = peaceEnd(world, row.created_at);
  const did = [];
  // sterkte (zwak, gemiddeld of sterk) en doelscore t.o.v. de echte spelers
  if (!BOT_TIERS[mem.tier]) mem.tier = tierOf((await db.prepare('SELECT COUNT(*) AS c FROM players WHERE bot = 1 AND id < ?').bind(row.id).first()).c);
  let ref = world.bot_ref ? JSON.parse(world.bot_ref) : null;
  if (!ref) { ref = await humanRef(db, world, now); world.bot_ref = JSON.stringify(ref); await db.prepare('UPDATE world SET bot_ref = ? WHERE id = 1').bind(world.bot_ref).run(); }
  const target = botTarget(mem.tier, ref, world.bot_level);
  // bots van voor de balans die veel te sterk werden: opnieuw beginnen (ze groeien dan tot hun doel)
  if (mem.v !== 2) {
    if (townScore(s) > target * 1.5) {
      const keep = { tier: mem.tier, v: 2 };
      town.state = newTownState(world.start_at, s.civ);
      ensureTerritory(town.state, town.id);
      s = town.state; mem = s.bot = keep;
      did.push('opnieuw begonnen (te sterk)');
    } else mem.v = 2;
  }
  // gemiste tijd inhalen: in stappen, met telkens een beslissing (zoals een speler die af en toe kijkt). Ligt hij boven
  // zijn doelscore, dan rust hij (bouwt niet verder) tot de echte spelers bijbenen.
  const style = botStyle(town.id);
  const nobles = mem.tier === 'sterk' && (world.bot_level || 2) >= 2;
  const grow = () => townScore(s) < target;
  for (let k = 0; k < STEPS && s.t < T - SLACK; k++) {
    advance(s, Math.min(T, s.t + stepFor(T - s.t)), speed);
    did.push(...botEconomy(s, speed, { lvl: world.bot_level, peace: s.t < pe, awayPop: mem.awayPop || 0, away: mem.away, style, cap: target, nobles, rest: !grow() }));
  }
  const caught = s.t >= T - SLACK;
  let plan = null;
  if (caught) {
    advance(s, T, speed);
    // wie komt eraan (aanvallen op de clan) en welke troepen zijn er niet
    const incoming = (await db.prepare(
      "SELECT id, from_town, target_id, target_team, to_x, to_y, arrive_at FROM marches WHERE target_team = ? AND kind = 'attack' AND target_kind = 'town' AND status = 'out' AND arrive_at > ?",
    ).bind(row.team_id, now).all()).results;
    // een vazal helpt ook zijn heer
    if (s.vas && s.vas.until > now) {
      incoming.push(...(await db.prepare(
        "SELECT id, from_town, target_id, target_team, to_x, to_y, arrive_at FROM marches WHERE target_id = ? AND kind = 'attack' AND target_kind = 'town' AND status = 'out' AND arrive_at > ?",
      ).bind(s.vas.ltown, now).all()).results);
    }
    const marchRows = (await db.prepare('SELECT units FROM marches WHERE player_id = ?').bind(row.id).all()).results;
    const support = (await db.prepare('SELECT id, host_town, units FROM support WHERE player_id = ?').bind(row.id).all()).results;
    const { away, pop } = unitsOf([...marchRows, ...support]);
    mem.away = away; mem.awayPop = pop;
    const threat = incoming.some((m) => m.target_id === town.id);
    // wie hem aanvalt, mag hij een dag lang terugpakken (ook als die veel zwakker is)
    mem.foe = mem.foe || {};
    for (const m of incoming) if (m.target_id === town.id) mem.foe[m.from_town] = now + 24 * 3600000;
    for (const id of Object.keys(mem.foe)) if (now > mem.foe[id]) delete mem.foe[id];
    did.push(...botEconomy(s, speed, { lvl: world.bot_level, peace: now < pe, threat, away, awayPop: pop, style, cap: target, nobles, rest: !grow() && !threat }));
    plan = await military(db, world, row, town, now, { incoming, support, L, pe, speed, tier: BOT_TIERS[mem.tier] });
    did.push(...plan.log);
  }
  try {
    await saveTown(db, town);
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
    // de stad veranderde intussen (bv. een aanval kwam aan): straks opnieuw
    await db.prepare('UPDATE players SET bot_next = ? WHERE id = ?').bind(now + 5000, row.id).run();
    return { bot: row.name, conflict: true };
  }
  if (plan) {
    for (const m of plan.marches) await insertMarch(db, row, town, m, now);
    for (const sp of plan.recalls) await recall(db, world, row, sp, now);
    const put = (k, v) => db.prepare('INSERT INTO config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
    if (plan.clan) await put(`clan:${row.team_id}`, JSON.stringify(plan.clan));
    if (plan.prey) await put(`prey:${plan.prey.id}`, String(plan.prey.until));
  }
  // bijgewerkt: over een paar minuten weer; nog achter: meteen opnieuw aan de beurt
  const next = caught ? now + L.act * 60000 + ((row.id * 7919) % 60000) : now;
  await db.prepare('UPDATE players SET bot_next = ? WHERE id = ?').bind(next, row.id).run();
  return { bot: row.name, caught, did, marches: plan ? plan.marches.length : 0, tier: mem.tier, target, score: townScore(s) };
}

async function insertMarch(db, bot, town, m, now) {
  const ins = await db.prepare(
    `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
       units, res, depart_at, arrive_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'out')`,
  ).bind(bot.id, bot.team_id, m.kind, town.id, town.x, town.y, m.tkind, m.target.id, m.target.team ?? 0, m.target.x, m.target.y,
    JSON.stringify(m.units || {}), JSON.stringify(m.res || {}), now, now + m.dur).run();
  // aanval op een speler: die krijgt meteen een melding (botTick draait al op de achtergrond)
  if (m.kind === 'attack' && m.tkind === 'town' && ins.meta && ins.meta.last_row_id) {
    try { await notifyAttack(db, ins.meta.last_row_id, now); } catch (e) { console.error('notify', e && e.message); }
  }
}

// troepen bij een clanlid terughalen (zoals de knop 'terugroepen')
async function recall(db, world, bot, sp, now) {
  const host = await db.prepare('SELECT x, y FROM towns WHERE id = ?').bind(sp.host_town).first();
  const home = await db.prepare('SELECT id, x, y FROM towns WHERE player_id = ?').bind(bot.id).first();
  if (!host || !home) return;
  const units = JSON.parse(sp.units);
  const del = await db.prepare('DELETE FROM support WHERE id = ?').bind(sp.id).run();
  if (!del.meta.changes) return;
  const dur = travelMs(world, host, home, slowestSpeed(units));
  await db.prepare(
    `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
       units, res, depart_at, arrive_at, status) VALUES (?, ?, 'return', ?, ?, ?, 'town', ?, ?, ?, ?, ?, '{}', ?, ?, 'back')`,
  ).bind(bot.id, bot.team_id, home.id, home.x, home.y, sp.host_town, bot.team_id, host.x, host.y, sp.units, now, now + dur).run();
}

// ---------- leger en clan ----------

function armyHome(s, withSiege = true) {
  const u = {};
  for (const k of ARMY_UNITS) if ((s.units[k] || 0) > 0 && k !== 'scout' && (withSiege || !UNITS[k].siege)) u[k] = s.units[k];
  return u;
}
const part = (units, f) => { const o = {}; for (const [k, n] of Object.entries(units)) { const m = Math.floor(n * f); if (m > 0) o[k] = m; } return o; };
const scale = (units, f) => { const o = {}; for (const [k, n] of Object.entries(units || {})) o[k] = n * f; return o; };
function take(s, units) { for (const [k, n] of Object.entries(units)) { s.units[k] -= n; if (s.units[k] <= 0) delete s.units[k]; } }

async function military(db, world, bot, town, now, ctx) {
  const s = town.state; const mem = s.bot;
  const { L, speed } = ctx;
  const tier = ctx.tier || BOT_TIERS.gemiddeld;
  const H = 3600000 / speed; // één speluur in echte tijd
  const myScore = townScore(s);
  const out = { marches: [], recalls: [], clan: null, log: [] };
  const home = { x: town.x, y: town.y };
  const onMe = ctx.incoming.filter((m) => m.target_id === town.id);
  mem.sup = mem.sup || {}; mem.hold = mem.hold || {}; mem.hit = mem.hit || {};

  // 1. een clanlid wordt aangevallen: de helft van het leger (zonder belegeringstuig) als versterking
  if (!onMe.length) {
    for (const m of ctx.incoming) {
      if (m.target_id === town.id || mem.sup[m.id]) continue;
      const send = part(armyHome(s, false), 0.5);
      if (armyValue(send) < 60) break;
      const dur = travelMs(world, home, { x: m.to_x, y: m.to_y }, slowestSpeed(send, s.tech));
      if (now + dur > m.arrive_at - 10000) continue; // zou te laat komen
      take(s, send);
      out.marches.push({ kind: 'support', tkind: 'town', target: { id: m.target_id, x: m.to_x, y: m.to_y, team: m.target_team ?? bot.team_id }, units: send, dur });
      mem.sup[m.id] = now;
      mem.hold[m.target_id] = Math.max(mem.hold[m.target_id] || 0, m.arrive_at + H);
      out.log.push(`versterking naar stad ${m.target_id}`);
    }
  }
  for (const id of Object.keys(mem.sup)) if (now - mem.sup[id] > 48 * H) delete mem.sup[id];
  for (const id of Object.keys(mem.hit)) if (now > mem.hit[id] + 24 * H) delete mem.hit[id];
  // 2. de dreiging is voorbij: versterking terughalen
  for (const sp of ctx.support) {
    if (ctx.incoming.some((m) => m.target_id === sp.host_town) || now < (mem.hold[sp.host_town] || 0)) continue;
    out.recalls.push(sp); delete mem.hold[sp.host_town];
    out.log.push(`versterking terug uit stad ${sp.host_town}`);
  }

  // 3. een clanlid spaart voor zijn volgende tijdperk: stuur wat hij mist en jij zelf niet nodig hebt (om de 2 speluren)
  const market = bLevel(s, 'market');
  if (market && now >= (mem.nextTrade || 0)) {
    mem.nextTrade = now + 0.5 * H;
    const allies = (await db.prepare('SELECT t.id, t.x, t.y, t.state FROM towns t JOIN players p ON p.id = t.player_id WHERE p.team_id = ? AND t.id != ?')
      .bind(bot.team_id, town.id).all()).results;
    const mine = savingFor(s) || {};
    outer: for (const a of allies) {
      const as = JSON.parse(a.state);
      const need = savingFor(as);
      if (!need) continue;
      for (const r of RES) {
        const short = (need[r] || 0) - as.res[r];
        const spare = s.res[r] - Math.max(mine[r] || 0, 800);
        const amount = Math.floor(Math.min(short, spare, MARKET.shipPerLevel * market, capacity(as) - as.res[r]) / 10) * 10;
        if (amount < 300) continue;
        s.res[r] -= amount;
        out.marches.push({ kind: 'trade', tkind: 'town', target: { id: a.id, x: a.x, y: a.y, team: bot.team_id }, res: { [r]: amount }, dur: travelMs(world, home, a, MARKET.merchantSpeed) });
        out.log.push(`karavaan ${amount} ${r} naar stad ${a.id}`);
        mem.nextTrade = now + 2 * H;
        break outer;
      }
    }
  }

  // 4. aanvallen: enkel na de eigen vrede, als hij zelf niet aangevallen wordt en het tijd is
  if (now < ctx.pe || onMe.length) return out;
  const army = armyHome(s);
  delete army.noble;
  const send = part(army, 1 - L.reserve);
  for (const k of Object.keys(army)) if (UNITS[k].siege) send[k] = army[k]; // belegeringstuig gaat altijd mee
  const value = armyValue(send);
  if (value < 60 + 60 * age(s)) return out;
  const { warEnd } = worldTimes(world);
  const smithy = bLevel(s, 'smithy');
  const sim = (ts) => resolveBattle({
    attUnits: send, attSmithy: smithy, groups: [{ key: 'home', units: scale(ts.units, L.edge * tier.edge) }], defSmithy: bLevel(ts, 'smithy'),
    wall: effectiveWall(ts), towerDef: towerDefense(ts), baseDef: townBaseDef(ts), attTech: s.tech || null, defTech: ts.tech || null,
  });
  if (now >= (mem.nextAtt || 0)) {
    // samen met de clan: liefst hetzelfde doelwit als een clanlid net koos
    const cr = await db.prepare('SELECT v FROM config WHERE k = ?').bind(`clan:${bot.team_id}`).first();
    const clan = cr ? JSON.parse(cr.v) : null;
    // steden die net door een bot aangevallen werden, laten alle bots even met rust (behalve de clan die samen aanvalt)
    const prey = new Map((await db.prepare("SELECT k, v FROM config WHERE k LIKE 'prey:%'").all()).results.map((r) => [Number(r.k.slice(5)), Number(r.v)]));
    const rows = (await db.prepare(
      'SELECT t.id, t.x, t.y, t.state, p.created_at, p.team_id, p.bot FROM towns t JOIN players p ON p.id = t.player_id WHERE p.team_id != ?',
    ).bind(bot.team_id).all()).results;
    // heren van clanleden: een gewonnen aanval bevrijdt die clanleden
    const lords = new Set((await db.prepare('SELECT v.lord_town FROM vassals v JOIN players p ON p.id = v.player_id WHERE p.team_id = ?')
      .bind(bot.team_id).all()).results.map((r) => r.lord_town));
    const myLord = s.vas && s.vas.until > now ? s.vas.ltown : 0;
    const nob = s.units.noble || 0;
    const vassalCount = nob ? (await db.prepare('SELECT COUNT(*) AS c FROM vassals WHERE lord_player = ?').bind(bot.id).first()).c : 0;
    let best = null;
    for (const t of rows) {
      if (t.id === myLord) continue; // zijn eigen heer valt een vazal niet aan
      if (now < (mem.hit[t.id] || 0)) continue;
      const together = clan && clan.t === t.id && now < clan.until;
      if (!together && now < (prey.get(t.id) || 0)) continue;
      const dur = travelMs(world, home, t, slowestSpeed(send, s.tech));
      if (now + dur > warEnd || peaceBlock(world, bot.created_at, t.created_at, now, now + dur)) continue;
      const ts = JSON.parse(t.state);
      ensureTerritory(ts, t.id);
      if (ts.vas && ts.vas.until > now && ts.vas.lord === bot.id) continue; // zijn eigen vazal
      // geen jacht op veel zwakkere steden (minder dan 45% van zijn eigen score), tenzij die hem eerst aanviel
      if (townScore(ts) < myScore * 0.45 && !((mem.foe || {})[t.id] > now)) continue;
      const r = sim(ts);
      if (!r.attWins) continue;
      let loot = 0; const prot = protectAmount(ts);
      for (const k of RES) loot += Math.max(0, (ts.res[k] || 0) - prot);
      // met edelmannen: liefst een stad waar ze iets kunnen doen (en waarvan de trouw al laag staat)
      const conquer = nob > 0 && r.attLoss < 0.35 && !nobleBlock(ts, now, myScore, vassalCount);
      const score = ((Math.min(loot, 6000) + 400) / (1 + dur / H)) * (t.bot ? 0.35 : 1) * (together ? 3 : 1)
        * (lords.has(t.id) ? 3 : 1) * (conquer ? 2 + (100 - loyalty(ts)) / 25 : 1);
      if (!best || score > best.score) best = { t, dur, score, conquer };
    }
    if (best) {
      if (best.conquer) send.noble = nob;
      take(s, send);
      out.marches.push({ kind: 'attack', tkind: 'town', target: { id: best.t.id, x: best.t.x, y: best.t.y, team: best.t.team_id }, units: send, dur: best.dur });
      mem.hit[best.t.id] = now + (best.conquer ? 2 : 10) * H; // niet steeds dezelfde stad (behalve om ze te onderwerpen)
      mem.nextAtt = now + L.attackHours * tier.attack * H * (0.75 + ((now / 1000) % 50) / 100);
      out.clan = { t: best.t.id, until: now + H };
      out.prey = { id: best.t.id, until: now + L.prey * H };
      out.log.push(`aanval op stad ${best.t.id}${best.conquer ? ' met edelman' : ''}`);
      return out;
    }
    mem.nextAtt = now + 0.75 * H; // niemand te verslaan: straks opnieuw kijken
  }
  // 5. geen stad aangevallen: een roverskamp plunderen (om de paar uur)
  if (now >= (mem.nextCamp || 0)) {
    mem.nextCamp = now + L.campHours * tier.attack * H;
    const camps = (await db.prepare('SELECT id, x, y, level, state FROM camps').all()).results;
    let best = null;
    for (const c of camps) {
      const cs = JSON.parse(c.state);
      const units = cs.refresh_at && now >= cs.refresh_at ? campUnits(c.level) : cs.units;
      if (!countUnits(units)) continue;
      const r = resolveBattle({ attUnits: send, attSmithy: smithy, groups: [{ key: 'camp', units: scale(units, L.edge * tier.edge) }], baseDef: 20 * c.level });
      if (!r.attWins) continue;
      const dur = travelMs(world, home, c, slowestSpeed(send, s.tech));
      const score = c.level / (1 + dur / H);
      if (!best || score > best.score) best = { c, dur, score };
    }
    if (best) {
      take(s, send);
      out.marches.push({ kind: 'attack', tkind: 'camp', target: { id: best.c.id, x: best.c.x, y: best.c.y, team: 0 }, units: send, dur: best.dur });
      out.log.push(`roverskamp ${best.c.id}`);
    }
  }
  return out;
}
