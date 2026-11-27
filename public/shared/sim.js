// Simulatie van één stad. Pure functies op een "state"-object (JSON), gedeeld
// tussen server en browser. De server bewaart de state; de browser gebruikt
// dezelfde code om grondstoffen en timers vloeiend te laten doortellen.
import {
  RES, BUILDINGS, UNITS, START, TOWN_GRID, TC_POS, GATHER_RATE, TC_SLOTS, TC_POP_PER_AGE,
  TC_STORAGE_PER_AGE, BASE_PROTECT, AGE_UP, MARKET, BONUS, FIELD, WILD, COMBAT, ARMY_UNITS, CIVS, CIV_IDS, CASTLE_LEVEL, AGES,
  LAND, landCost, WALL_TILE, GATE, DEMOLISH, DISMISS, TECHS, TECH_IDS, LOYALTY,
  levelCost, levelTime, levelAge, unitTime, costValue, unitValue, JOBS, FISH,
} from './rules.js';
import {
  territory, ringOf, ringForAge, tileIndex, tileOf, inTerr, T_MIN, T_MAX, T_W, TILE, exDecode, exEncode, revealCircle, revealSegment,
} from './territory.js';
import { resolveBattle, computeLoot, carryCapacity, fateOf } from './battle.js';
import { combatants, runFight, fightEnd, survivorsByGroup } from './skirmish.js';

export class GameError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export function newTownState(t, civ = null) {
  return {
    t,
    civ: CIVS[civ] ? civ : null,
    res: { ...START.res },
    villagers: { ...START.villagers },
    rally: 'auto',
    buildings: [
      { id: 1, type: 'tc', x: TC_POS.x, y: TC_POS.y, level: 1 },
      { id: 2, type: 'wall', x: -1, y: -1, level: 0 },
    ],
    builds: [],
    queues: {},
    units: {},
    nextId: 3,
  };
}

export const age = (s) => s.buildings.find((b) => b.type === 'tc').level;
// de muur heeft geen plaats op de kaart; alle andere gebouwen wel (ook op negatieve coördinaten)
export const isPlaced = (b) => b.type !== 'wall';
export const findType = (s, type) => s.buildings.filter((b) => b.type === type);
export const bLevel = (s, type) => findType(s, type).reduce((m, b) => Math.max(m, b.level), 0);
// dorpelingen die even een vondst gaan oogsten, tellen nog altijd mee
export const harvesting = (s) => (s.harvests ? s.harvests.length : 0);
// dorpelingen die in je gebied rondlopen (verkennen, kappen, verzamelen)
export const fieldVillagers = (s) => (s.field || []).reduce((a, g) => a + (g.units.villager || 0), 0);
export const fieldSoldierPop = (s) => (s.field || []).reduce((a, g) => {
  let p = 0;
  for (const k of Object.keys(g.units)) if (k !== 'villager' && UNITS[k]) p += UNITS[k].pop * g.units[k];
  return a + p;
}, 0);
export const totalVillagers = (s) => JOBS.reduce((a, r) => a + (s.villagers[r] || 0), s.villagers.idle) + harvesting(s) + fieldVillagers(s);
// dorpelingen die nu thuis zijn en verdeeld kunnen worden
export const homeVillagers = (s) => totalVillagers(s) - harvesting(s) - fieldVillagers(s);

export function slots(s) {
  const out = { ...TC_SLOTS };
  for (const b of s.buildings) {
    const sl = BUILDINGS[b.type].slots;
    if (sl && b.level > 0) for (const r of Object.keys(sl)) out[r] += sl[r] * b.level;
  }
  out.fish = boatsReady(s) * FISH.crew; // vissers: zoveel per bootje
  return out;
}

// ---------- havenhuis en vissersbootjes ----------
export const maxBoats = (s) => FISH.boats[Math.min(FISH.boats.length - 1, bLevel(s, 'harbor'))] || 0;
// bootjes die kunnen uitvaren (een kleiner havenhuis na afbreken heeft minder plaats)
export const boatsReady = (s) => Math.min(s.boats || 0, maxBoats(s));
export const fishMult = (s) => 1 + FISH.levelBonus * Math.max(0, bLevel(s, 'harbor') - 1);
export function boatTime(s, speed = 1) {
  return Math.max(5000, Math.round((FISH.boatTime * 1000) / speed));
}
export function checkBoat(s) {
  if (!bLevel(s, 'harbor')) return 'Bouw eerst een havenhuis.';
  if (s.boatJob) return 'Er wordt al een bootje gebouwd.';
  if ((s.boats || 0) >= maxBoats(s)) return maxBoats(s) >= FISH.boats[FISH.boats.length - 1] ? `Je hebt het maximum van ${maxBoats(s)} bootjes.` : 'Verbeter je havenhuis voor een bootje meer.';
  if (!canAfford(s.res, FISH.boatCost)) return 'Niet genoeg grondstoffen.';
  return null;
}
export function doBoat(s, now, speed = 1) {
  const err = checkBoat(s);
  if (err) throw new GameError(err);
  pay(s.res, FISH.boatCost);
  s.boatJob = { start: now, end: now + boatTime(s, speed) };
  return s.boatJob;
}
// een bootje is klaar: vrije dorpelingen gaan meteen aan boord
function finishBoat(s) {
  s.boats = (s.boats || 0) + 1;
  s.boatJob = null;
  const free = slots(s).fish - (s.villagers.fish || 0);
  const n = Math.max(0, Math.min(free, s.villagers.idle));
  s.villagers.fish = (s.villagers.fish || 0) + n; s.villagers.idle -= n;
}
// mag het havenhuis op tegel (i, j)? Vrij land (geen bos, geen water) naast water, niet te ver van je bouwgrond.
export function shoreTile(s, i, j, cl = null) {
  if (!s.terr || !inTerr(i, j)) return false;
  const terr = territory(s.terr.seed);
  const T = terr.tiles[tileIndex(i, j)];
  if (T === TILE.WATER) return false;
  const set = cl || clearedSet(s);
  if (T === TILE.FOREST && !set.has(tileIndex(i, j)) && !isBuildable(s, i, j, set)) return false;
  if (ringOf(i, j) > ringForAge(age(s)) + FISH.reach) return false;
  if (reservedTile(terr, i, j)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inTerr(i + dx, j + dy) && terr.tiles[tileIndex(i + dx, j + dy)] === TILE.WATER);
}
// alle tegels waar het havenhuis kan staan (om ze te tonen bij het plaatsen)
export function shoreSpots(s, ignoreId = null) {
  if (!s.terr) return [];
  const R = ringForAge(age(s)) + FISH.reach;
  const cl = clearedSet(s);
  const out = [];
  for (let j = -R; j < TOWN_GRID + R; j++) for (let i = -R; i < TOWN_GRID + R; i++) if (shoreTile(s, i, j, cl) && canPlaceAt(s, 'harbor', i, j, ignoreId)) out.push([i, j]);
  return out;
}
// aan welke kant ligt het water? 0 = +x, 1 = +y, 2 = -x, 3 = -y (voor de steiger van het model)
export function shoreSide(s, i, j) {
  if (!s.terr) return 0;
  const tiles = territory(s.terr.seed).tiles;
  const w = (a, b) => inTerr(a, b) && tiles[tileIndex(a, b)] === TILE.WATER;
  if (w(i + 1, j)) return 0; if (w(i, j + 1)) return 1; if (w(i - 1, j)) return 2; if (w(i, j - 1)) return 3;
  return 0;
}

export function popCap(s) {
  let p = TC_POP_PER_AGE * age(s);
  for (const b of s.buildings) if (b.type === 'house') p += BUILDINGS.house.pop * b.level;
  return p;
}

export function capacity(s) {
  let c = TC_STORAGE_PER_AGE * age(s);
  for (const b of s.buildings) if (b.type === 'storage') c += BUILDINGS.storage.storage * b.level;
  return c;
}

export function protectAmount(s) {
  let p = BASE_PROTECT;
  for (const b of s.buildings) if (b.type === 'storage') p += BUILDINGS.storage.protect * b.level;
  return p;
}

// extra productie van de molen en het gildehuis (per niveau)
export function boost(s) {
  const out = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (const b of s.buildings) {
    const bo = BUILDINGS[b.type].boost;
    if (bo && b.level > 0) for (const r of Object.keys(bo)) out[r] += bo[r] * b.level;
  }
  return out;
}

export function rates(s, speed = 1) {
  const mult = (1 + 0.1 * (age(s) - 1)) * speed;
  const bo = boost(s);
  const out = {};
  for (const r of RES) out[r] = s.villagers[r] * GATHER_RATE[r] * mult * (1 + bo[r]);
  // vissers (havenhuis): sneller voedsel dan de boerderij
  if (s.villagers.fish) out.food += s.villagers.fish * FISH.rate * mult * (1 + bo.food) * fishMult(s);
  return out;
}

export function queuedPop(s) {
  let p = 0;
  for (const q of Object.values(s.queues)) for (const it of q) p += (it.n - it.done) * UNITS[it.unit].pop;
  return p;
}

export function unitsPop(units) {
  let p = 0;
  for (const k of Object.keys(units || {})) if (UNITS[k]) p += (units[k] || 0) * UNITS[k].pop;
  return p;
}

// bevolking die in de stad zelf zit (zonder troepen die onderweg of elders gestationeerd zijn)
export const homePop = (s) => totalVillagers(s) + unitsPop(s.units) + queuedPop(s) + fieldSoldierPop(s);

export function maxBuilds(s) {
  return (age(s) >= 3 ? 3 : 2) + (bLevel(s, 'lodge') > 0 ? BUILDINGS.lodge.builders : 0);
}

// bouwduur in ms voor deze stad (de bouwloods bouwt sneller)
export function buildTime(s, type, level, speed = 1) {
  const f = type === 'tc' || type === 'lodge' ? 1 : 1 - BUILDINGS.lodge.buildSpeed * bLevel(s, 'lodge');
  return Math.max(5000, Math.round(levelTime(type, level, speed) * f));
}

// ---------- trouw ----------
export const isVassal = (s, t = s.t) => !!(s.vas && s.vas.until > t);
export const loyalty = (s) => (s.loy == null ? LOYALTY.max : s.loy);
export const loyaltyRegen = (s) => LOYALTY.regen + BUILDINGS.cathedral.loyalty * bLevel(s, 'cathedral');

function accrue(s, t, speed) {
  const dt = (t - s.t) / 3600000;
  if (dt <= 0) return;
  // de trouw herstelt vanzelf (niet zolang je vazal bent)
  if (s.loy != null && s.loy < LOYALTY.max && !isVassal(s)) {
    s.loy = Math.min(LOYALTY.max, s.loy + loyaltyRegen(s) * dt * speed);
    if (s.loy >= LOYALTY.max) delete s.loy;
  }
  const r = rates(s, speed);
  const extra = gatherAccrue(s, dt, speed);
  const cap = capacity(s);
  for (const k of RES) {
    const v = s.res[k];
    if (v < cap) s.res[k] = Math.min(cap, v + r[k] * dt + (extra[k] || 0));
  }
  s.t = t;
}

function placeVillager(s) {
  const sl = slots(s);
  const order = s.rally && s.rally !== 'auto' ? [s.rally] : ['fish', 'food', 'wood', 'gold', 'stone'];
  for (const r of order) {
    if ((s.villagers[r] || 0) < (sl[r] || 0)) { s.villagers[r] = (s.villagers[r] || 0) + 1; return; }
  }
  s.villagers.idle++;
}

function finishBuild(s, job) {
  const b = s.buildings.find((x) => x.id === job.bid);
  if (b) b.level = job.to;
  s.builds = s.builds.filter((x) => x !== job);
}

function finishUnit(s, key) {
  const q = s.queues[key];
  const head = q[0];
  const when = head.start + (head.done + 1) * head.dur;
  head.done++;
  if (head.unit === 'villager') placeVillager(s);
  else s.units[head.unit] = (s.units[head.unit] || 0) + 1;
  if (head.done >= head.n) {
    q.shift();
    if (q[0]) q[0].start = when;
  }
  if (!q.length) delete s.queues[key];
}

// ---------- vondsten (bonusgrondstoffen rond de stad) ----------

// deterministisch "toeval": server en browser berekenen exact dezelfde vondsten
function bonusRand(s, k) {
  let h = (s.nodeSeed * 374761393 + s.nodeSeq * 668265263 + k * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function bonusInterval(s, speed, k) {
  const min = BONUS.minMinutes + (BONUS.maxMinutes - BONUS.minMinutes) * bonusRand(s, k);
  return Math.round((min * 60000) / speed);
}

export function ensureBonus(s, speed = 1) {
  if (s.nodes) return;
  s.nodes = [];
  s.harvests = [];
  s.nodeSeq = 0;
  s.nodeSeed = Math.abs(Math.floor(s.t)) % 1000003;
  s.nextNode = s.t + Math.round((BONUS.firstMinutes * 60000) / speed);
}

// de deur van het stadscentrum (vertrek- en aankomstpunt van dorpelingen)
export const tcDoor = () => ({ gx: TC_POS.x + 1, gy: TC_POS.y + 2.35 });

function bonusSpot(s) {
  const k = ringForAge(age(s));
  const lo = -k; const hi = TOWN_GRID + k; const mid = TOWN_GRID / 2;
  for (let tr = 0; tr < 30; tr++) {
    const side = Math.floor(bonusRand(s, 10 + tr * 3) * 4);
    const along = lo - 1.2 + bonusRand(s, 11 + tr * 3) * (hi - lo + 2.4);
    const off = 0.7 + bonusRand(s, 12 + tr * 3) * 1.1;
    if (Math.abs(along - mid) < 1.3) continue; // niet op de wegen
    let gx; let gy;
    if (side === 0) { gx = along; gy = lo - off; } else if (side === 1) { gx = hi + off; gy = along; } else if (side === 2) { gx = along; gy = hi + off; } else { gx = lo - off; gy = along; }
    if (s.nodes.some((n) => Math.hypot(n.gx - gx, n.gy - gy) < 1.4)) continue;
    return { gx: Math.round(gx * 100) / 100, gy: Math.round(gy * 100) / 100 };
  }
  return null;
}

function spawnBonus(s, t, speed) {
  if (s.nodes.length < BONUS.maxNodes) {
    const spot = bonusSpot(s);
    if (spot) {
      let r = bonusRand(s, 1);
      let kind = BONUS.order[BONUS.order.length - 1];
      for (let i = 0; i < BONUS.order.length; i++) { if (r < BONUS.weights[i]) { kind = BONUS.order[i]; break; } r -= BONUS.weights[i]; }
      const def = BONUS.kinds[kind];
      const amount = Math.round(def.amount * (1 + BONUS.ageBonus * (age(s) - 1)) * (0.85 + bonusRand(s, 2) * 0.3));
      s.nodes.push({ id: s.nextId++, kind, res: def.res, amount, gx: spot.gx, gy: spot.gy, at: t, claimed: false });
    }
  }
  s.nodeSeq++;
  s.nextNode = t + bonusInterval(s, speed, 3);
}

function finishHarvest(s, hv) {
  const node = s.nodes.find((n) => n.id === hv.node);
  if (node) {
    const cap = capacity(s);
    const r = node.res;
    s.res[r] = Math.max(s.res[r], Math.min(cap, s.res[r] + node.amount));
    s.nodes = s.nodes.filter((n) => n !== node);
  }
  s.harvests = s.harvests.filter((x) => x !== hv);
  // de dorpeling gaat terug naar zijn vorige taak
  if (hv.job !== 'idle' && (s.villagers[hv.job] || 0) < (slots(s)[hv.job] || 0)) s.villagers[hv.job] = (s.villagers[hv.job] || 0) + 1;
  else s.villagers.idle++;
}

export function harvestTime(node) {
  const d = tcDoor();
  const walk = (Math.hypot(node.gx - d.gx, node.gy - d.gy) / BONUS.walkTilesPerSec) * 1000;
  return Math.round(2 * walk + BONUS.gatherMs);
}

export function checkHarvest(s, nodeId) {
  const node = (s.nodes || []).find((n) => n.id === nodeId);
  if (!node) return 'Die vondst is er niet meer.';
  if (node.claimed) return 'Er is al een dorpeling onderweg.';
  if (harvesting(s) >= BONUS.maxHarvesters) return `Er zijn al ${BONUS.maxHarvesters} dorpelingen op pad.`;
  if (totalVillagers(s) - harvesting(s) < 1) return 'Je hebt geen dorpeling vrij.';
  return null;
}

// Stuur een dorpeling naar een vondst. job = de taak van de aangeklikte dorpeling (of leeg: zelf kiezen).
export function doHarvest(s, nodeId, job, now) {
  const err = checkHarvest(s, nodeId);
  if (err) throw new GameError(err);
  const node = s.nodes.find((n) => n.id === nodeId);
  let from = null;
  if (job === 'idle' && s.villagers.idle > 0) from = 'idle';
  else if (JOBS.includes(job) && s.villagers[job] > 0) from = job;
  else if (s.villagers.idle > 0) from = 'idle';
  else {
    from = JOBS.reduce((best, r) => ((s.villagers[r] || 0) > (best ? s.villagers[best] : 0) ? r : best), null);
  }
  if (!from) throw new GameError('Je hebt geen dorpeling vrij.');
  s.villagers[from]--;
  node.claimed = true;
  const hv = { id: s.nextId++, node: node.id, job: from, start: now, end: now + harvestTime(node) };
  s.harvests.push(hv);
  return hv;
}

// Breng de stad naar tijdstip t (ms). Verwerkt voltooide opdrachten, vondsten en oogsten in volgorde.
export function advance(s, t, speed = 1) {
  if (t <= s.t) return s;
  ensureBonus(s, speed);
  if (s.terr) {
    if (!s.field) s.field = [];
    const c = s.terr.camp;
    c.day = Math.round(86400000 / speed); // één speldag in ms (het kamp groeit per speldag)
    if (c.since == null) {
      // nieuwe stad: de eerste overval pas na firstHours; een oudere stad (van voor het groeiende kamp): het groeit vanaf nu
      const fresh = c.next == null && !c.raids;
      c.since = Math.max(s.t, c.down || 0);
      if (!c.raid) scheduleRaid(s, fresh ? s.t + Math.round((c.day * (WILD.raid.firstHours - WILD.raid.quietHours)) / 24) : s.t);
    }
    autoReveal(s);
  }
  for (let guard = 0; guard < 20000; guard++) {
    let next = Infinity;
    let job = null;
    let qkey = null;
    let hv = null;
    let spawn = false;
    let wild = null;
    if (s.terr) {
      wild = nextWildEvent(s, speed);
      if (wild) next = wild.t;
    }
    for (const b of s.builds) if (b.end < next) { next = b.end; job = b; wild = null; }
    for (const key of Object.keys(s.queues)) {
      const head = s.queues[key][0];
      if (!head) continue;
      const tt = head.start + (head.done + 1) * head.dur;
      if (tt < next) { next = tt; job = null; qkey = key; wild = null; }
    }
    for (const h of s.harvests) if (h.end < next) { next = h.end; job = null; qkey = null; hv = h; wild = null; }
    if (s.nextNode < next) { next = s.nextNode; job = null; qkey = null; hv = null; spawn = true; wild = null; }
    let rs = false;
    if (s.research && s.research.end < next) { next = s.research.end; job = null; qkey = null; hv = null; spawn = false; wild = null; rs = true; }
    let bj = false;
    if (s.boatJob && s.boatJob.end < next) { next = s.boatJob.end; job = null; qkey = null; hv = null; spawn = false; wild = null; rs = false; bj = true; }
    if (next > t) break;
    accrue(s, next, speed);
    if (bj) finishBoat(s);
    else if (rs) finishResearch(s);
    else if (wild) applyWildEvent(s, wild, speed);
    else if (spawn) spawnBonus(s, next, speed);
    else if (hv) finishHarvest(s, hv);
    else if (job) finishBuild(s, job);
    else finishUnit(s, qkey);
    if (s.terr) autoReveal(s);
  }
  accrue(s, t, speed);
  return s;
}

// ---------- eigen gebied: verkennen, bos kappen, wilde bronnen, everzwijnen en barbaren ----------

// De server roept dit op met het stadsnummer als zaad (de browser krijgt de state al zo).
export function ensureTerritory(s, seed) {
  if (!s.walls) {
    s.walls = [];
    const L = s.buildings.find((b) => b.type === 'wall');
    if (L && L.level > 0) {
      const k = ringForAge(age(s));
      const occ = occupied(s);
      for (let j = -k; j < TOWN_GRID + k; j++) {
        for (let i = -k; i < TOWN_GRID + k; i++) {
          if (ringOf(i, j) !== k || occ.has(`${i},${j}`)) continue;
          s.walls.push(tileIndex(i, j));
        }
      }
    }
  }
  // een volledig ommuurde stad zonder poort (van voor de poorten) krijgt er een, zodat je troepen er nog door kunnen
  if (s.walls.length && !(s.gates || []).length && wallEnclosed(s)) {
    const d = tcDoor();
    let best = null;
    for (const idx of s.walls) {
      const { i, j } = tileOf(idx);
      const span = gateSpan(s, i, j);
      if (!span || span.score < 2) continue;
      const dist = Math.hypot(i + 0.5 - d.gx, j + 0.5 - d.gy);
      if (!best || dist < best.dist) best = { span, dist };
    }
    if (best) {
      const idxs = best.span.tiles.map(([a, b]) => tileIndex(a, b));
      s.walls = s.walls.filter((x) => !idxs.includes(x)); s.gates = idxs;
    }
  }
  // poorten van vroeger (1 tegel breed) worden gratis 2 tegels breed als het naastliggende muurstuk dat toelaat
  for (const g of gateList(s)) {
    if (g.w !== 1) continue;
    const [i, j] = g.tiles[0];
    const dx = g.ax === 'x' ? 1 : 0; const dy = 1 - dx;
    const walls = new Set(s.walls);
    const isW = (a, b) => inTerr(a, b) && walls.has(tileIndex(a, b));
    for (const sgn of [1, -1]) {
      const p = [i + sgn * dx, j + sgn * dy]; const anchor = [i + 2 * sgn * dx, j + 2 * sgn * dy];
      if (!isW(p[0], p[1]) || !isW(anchor[0], anchor[1])) continue;
      const idx = tileIndex(p[0], p[1]);
      s.walls = s.walls.filter((x) => x !== idx); s.gates.push(idx);
      break;
    }
  }
  // steden van voor de volkeren krijgen een willekeurig (maar vast) volk
  if (!CIVS[s.civ]) s.civ = CIV_IDS[(Math.imul(seed | 0, 2654435761) >>> 0) % CIV_IDS.length];
  if (!s.field) s.field = [];
  if (s.villagers && s.villagers.fish == null) s.villagers.fish = 0; // vissers (havenhuis) bestonden vroeger niet
  // ontdekkingen in de wildernis (25/11 kort online, op vraag van de gebruiker weer weggehaald): restjes opruimen.
  // Wat al gevonden werd, blijft; relikwieën leveren niets meer op.
  if (s.relics !== undefined) delete s.relics;
  if (s.terr) {
    if (s.terr.sites) delete s.terr.sites;
    const den = (s.terr.fights || []).filter((f) => f.foe && f.foe.type === 'den').map((f) => f.id);
    if (den.length) {
      s.terr.fights = s.terr.fights.filter((f) => !den.includes(f.id));
      for (const g of s.field) if (den.includes(g.fight)) g.fight = null;
    }
    for (const g of s.field) if (g.order && g.order.type === 'site') g.order = { type: 'move' };
  }
  if (s.terr) return;
  s.terr = { seed, ex: '', rv: -1, cl: [], dep: {}, boar: {}, camp: { down: 0, raids: 0, loss: 0, next: null }, log: [], lid: 0 };
}

// tegels die bouwgrond werden: gekapt bos en gekochte loten (zonder water en de buurt van het barbarendorp)
export function clearedSet(s) {
  const set = new Set(s.terr ? s.terr.cl : []);
  if (s.terr && s.terr.lots && s.terr.lots.length) {
    const terr = territory(s.terr.seed);
    for (const [li, lj] of s.terr.lots) {
      for (let j = lj * LAND.size; j < (lj + 1) * LAND.size; j++) {
        for (let i = li * LAND.size; i < (li + 1) * LAND.size; i++) {
          if (!inTerr(i, j) || terr.tiles[tileIndex(i, j)] === TILE.WATER || reservedTile(terr, i, j)) continue;
          set.add(tileIndex(i, j));
        }
      }
    }
  }
  return set;
}

// grond die je niet kan kopen: rond het barbarendorp en op wilde bronnen
function reservedTile(terr, i, j) {
  if (terr.camp && Math.hypot(i + 0.5 - terr.camp.x, j + 0.5 - terr.camp.y) < FIELD.aggro + 0.6) return true;
  return terr.deposits.some((d) => Math.floor(d.x) === i && Math.floor(d.y) === j);
}

// ---------- grond bijkopen ----------
export function checkBuyLot(s, li, lj) {
  if (!s.terr) return 'Je gebied is nog niet klaar.';
  if (!Number.isInteger(li) || !Number.isInteger(lj)) return 'Ongeldig stuk grond.';
  const lots = s.terr.lots || [];
  if (lots.length >= LAND.max) return `Je kan maximaal ${LAND.max} stukken grond bijkopen.`;
  if (lots.some(([a, b]) => a === li && b === lj)) return 'Dit stuk grond is al van jou.';
  const z = LAND.size;
  const x0 = li * z; const y0 = lj * z;
  if (!inTerr(x0, y0) || !inTerr(x0 + z - 1, y0 + z - 1)) return 'Dit ligt buiten je gebied.';
  const terr = territory(s.terr.seed);
  const cl = clearedSet(s);
  let fresh = 0; let touches = false; let blocked = 0;
  for (let j = y0; j < y0 + z; j++) {
    for (let i = x0; i < x0 + z; i++) {
      if (reservedTile(terr, i, j)) blocked++;
      if (!isBuildable(s, i, j, cl)) fresh++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isBuildable(s, i + dx, j + dy, cl)) touches = true;
    }
  }
  if (blocked > z) return 'Te dicht bij het barbarendorp of een wilde bron.';
  if (!fresh) return 'Hier mag je al bouwen.';
  if (!touches) return 'Een lot moet aansluiten op je bouwgrond.';
  if (!canAfford(s.res, landCost(lots.length))) return 'Niet genoeg grondstoffen.';
  return null;
}

export function doBuyLot(s, li, lj) {
  const err = checkBuyLot(s, li, lj);
  if (err) throw new GameError(err);
  const lots = s.terr.lots || (s.terr.lots = []);
  pay(s.res, landCost(lots.length));
  lots.push([li, lj]);
}

// ---------- muren, tegel per tegel (en poorten) ----------
// muur én poorten samen: een dichte poort houdt de stad even goed dicht als een muur
export const wallSet = (s) => new Set([...(s.walls || []), ...(s.gates || [])]);
export const gateSet = (s) => new Set(s.gates || []);

// Binnenkant van de stad: alle tegels die je vanaf het stadscentrum bereikt zonder door een muur of poort te gaan.
// Komt die vulling tot buiten de bouwgrond (+ marge), dan is de stad niet dicht (null).
export function insideSet(s, walls = wallSet(s)) {
  if (!walls.size) return null;
  const k = ringForAge(age(s));
  const lim = k + 6;
  const start = [TC_POS.x, TC_POS.y];
  const seen = new Set([start.join(',')]);
  const q = [start];
  while (q.length) {
    const [i, j] = q.pop();
    if (ringOf(i, j) >= lim) return null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx; const nj = j + dy; const key = `${ni},${nj}`;
      if (seen.has(key) || (inTerr(ni, nj) && walls.has(tileIndex(ni, nj)))) continue;
      seen.add(key); q.push([ni, nj]);
    }
  }
  return seen;
}

export const wallEnclosed = (s) => !!insideSet(s);

// Ligt tegel (i, j) in een recht stuk muur? 'x' = de muur loopt langs x (je gaat er langs y door), 'y' = omgekeerd.
export function gateAxis(set, i, j) {
  const has = (a, b) => inTerr(a, b) && set.has(tileIndex(a, b));
  const x = has(i - 1, j) && has(i + 1, j);
  const y = has(i, j - 1) && has(i, j + 1);
  return x && !y ? 'x' : y && !x ? 'y' : null;
}

// Een poort is 2 tegels breed. gateList(s): elke poort als groep aangrenzende poorttegels (oude poorten: 1 tegel),
// met de as van de muur ('x' = de muur loopt langs x, je gaat er langs y door) en het midden (cx, cy).
export function gateList(s) {
  const gates = s.gates || [];
  if (!gates.length) return [];
  const set = new Set(gates); const seen = new Set(); const walls = wallSet(s); const out = [];
  for (const idx of [...gates].sort((a, b) => a - b)) {
    if (seen.has(idx)) continue;
    const { i, j } = tileOf(idx);
    const tiles = [[i, j]]; seen.add(idx);
    const ex = inTerr(i + 1, j) ? tileIndex(i + 1, j) : -1; const so = inTerr(i, j + 1) ? tileIndex(i, j + 1) : -1;
    if (ex >= 0 && set.has(ex) && !seen.has(ex)) { tiles.push([i + 1, j]); seen.add(ex); }
    else if (so >= 0 && set.has(so) && !seen.has(so)) { tiles.push([i, j + 1]); seen.add(so); }
    const last = tiles[tiles.length - 1];
    const ax = tiles.length === 2 ? (last[0] !== i ? 'x' : 'y') : gateAxis(walls, i, j) || 'x';
    out.push({ idx, tiles, ax, w: tiles.length, cx: (i + last[0]) / 2 + 0.5, cy: (j + last[1]) / 2 + 0.5 });
  }
  return out;
}

// Welke 2 tegels worden de poort als je op (i, j) tikt? Ze liggen in een recht stuk muur, met aan beide kanten
// een muurstuk; elk van de twee is een muurstuk of nog vrije bouwgrond (een gat in de muur). null = kan niet.
export function gateSpan(s, i, j) {
  const walls = new Set(s.walls || []); const gates = new Set(s.gates || []);
  const isW = (a, b) => inTerr(a, b) && walls.has(tileIndex(a, b));
  const any = (a, b) => inTerr(a, b) && (walls.has(tileIndex(a, b)) || gates.has(tileIndex(a, b)));
  const occ = occupied(s); const cl = clearedSet(s);
  const ok = (a, b) => inTerr(a, b) && !gates.has(tileIndex(a, b)) && (walls.has(tileIndex(a, b)) || (!occ.has(`${a},${b}`) && isBuildable(s, a, b, cl)));
  let best = null;
  for (const ax of ['x', 'y']) {
    const dx = ax === 'x' ? 1 : 0; const dy = 1 - dx;
    for (const off of [0, -1]) {
      const a = [i + off * dx, j + off * dy]; const b = [a[0] + dx, a[1] + dy];
      if (!isW(a[0] - dx, a[1] - dy) || !isW(b[0] + dx, b[1] + dy)) continue; // muur voor en na de poort
      if (!ok(a[0], a[1]) || !ok(b[0], b[1])) continue;
      if ([a, b].some(([u, v]) => any(u + dy, v + dx) || any(u - dy, v - dx))) continue; // geen hoek of kruising
      const score = (isW(a[0], a[1]) ? 1 : 0) + (isW(b[0], b[1]) ? 1 : 0) + (off === 0 ? 0.1 : 0);
      if (!best || score > best.score) best = { ax, tiles: [a, b], score };
    }
  }
  return best;
}

export function checkPlaceGate(s, i, j) {
  if (!bLevel(s, 'wall')) return 'Bouw eerst de stadsmuur.';
  if (!Number.isInteger(i) || !Number.isInteger(j) || !inTerr(i, j)) return 'Ongeldige plaats.';
  if (!isBuildable(s, i, j)) return 'Een poort kan enkel op je eigen bouwgrond.';
  const idx = tileIndex(i, j);
  if ((s.gates || []).includes(idx)) return 'Hier staat al een poort.';
  if (gateList(s).length >= GATE.max) return `Je hebt al ${GATE.max} poorten.`;
  if (!(s.walls || []).includes(idx) && occupied(s).has(`${i},${j}`)) return 'Daar staat een gebouw.';
  if (!gateSpan(s, i, j)) return 'Een poort is 2 tegels breed en moet in een recht stuk muur staan, met aan beide kanten een muurstuk.';
  if (!canAfford(s.res, GATE.cost)) return 'Niet genoeg grondstoffen.';
  return null;
}

// van twee muurstukken (of een gat van twee tegels tussen twee muurstukken) een poort maken
export function doPlaceGate(s, i, j) {
  const err = checkPlaceGate(s, i, j);
  if (err) throw new GameError(err);
  const span = gateSpan(s, i, j);
  pay(s.res, GATE.cost);
  const idxs = span.tiles.map(([a, b]) => tileIndex(a, b));
  s.walls = (s.walls || []).filter((x) => !idxs.includes(x));
  if (!s.gates) s.gates = [];
  s.gates.push(...idxs);
}

// muurwaarde in gevechten: volledig als de stad dicht is, anders maar een stukje
export function effectiveWall(s) {
  const L = bLevel(s, 'wall');
  if (!L || !(s.walls || []).length) return 0;
  return wallEnclosed(s) ? L : Math.round(L * 0.3 * 10) / 10;
}

export function checkPlaceWalls(s, tiles) {
  const L = bLevel(s, 'wall');
  if (!L) return 'Bouw eerst de stadsmuur (niveau 1) via het muurpaneel.';
  if (!Array.isArray(tiles) || !tiles.length) return 'Kies waar de muur moet komen.';
  if (tiles.length > WALL_TILE.maxPerOrder) return `Maximaal ${WALL_TILE.maxPerOrder} muurstukken tegelijk.`;
  const cl = clearedSet(s); const occ = occupied(s); const walls = wallSet(s);
  const seen = new Set();
  for (const t of tiles) {
    const [i, j] = t;
    if (!Number.isInteger(i) || !Number.isInteger(j)) return 'Ongeldige plaats.';
    if (!isBuildable(s, i, j, cl)) return 'Muren kan je enkel op je eigen bouwgrond zetten.';
    if (occ.has(`${i},${j}`)) return 'Daar staat al een gebouw.';
    if (walls.has(tileIndex(i, j)) || seen.has(`${i},${j}`)) return 'Daar staat al een muur.';
    seen.add(`${i},${j}`);
  }
  if (!canAfford(s.res, WALL_TILE.cost[L], tiles.length)) return 'Niet genoeg grondstoffen voor zoveel muur.';
  if (!(s.gates || []).length) {
    const after = wallSet(s);
    for (const [i, j] of tiles) after.add(tileIndex(i, j));
    if (insideSet(s, after)) return 'Zo is je stad helemaal dicht zonder poort. Maak eerst een poort (2 tegels breed) in een recht stuk muur.';
  }
  return null;
}

export function doPlaceWalls(s, tiles) {
  const err = checkPlaceWalls(s, tiles);
  if (err) throw new GameError(err);
  pay(s.res, WALL_TILE.cost[bLevel(s, 'wall')], tiles.length);
  if (!s.walls) s.walls = [];
  for (const [i, j] of tiles) s.walls.push(tileIndex(i, j));
}

// muurstukken (en poorten) afbreken
export function doRemoveWalls(s, tiles) {
  const rm = new Set((tiles || []).filter((t) => Array.isArray(t) && inTerr(t[0], t[1])).map(([i, j]) => tileIndex(i, j)));
  if (!rm.size) throw new GameError('Kies welke muur weg moet.');
  // een poort gaat altijd in zijn geheel weg
  for (const g of gateList(s)) if (g.tiles.some(([a, b]) => rm.has(tileIndex(a, b)))) for (const [a, b] of g.tiles) rm.add(tileIndex(a, b));
  s.walls = (s.walls || []).filter((x) => !rm.has(x));
  if (s.gates) s.gates = s.gates.filter((x) => !rm.has(x));
}

// ---------- muren verplaatsen (gratis) ----------
// Het rechte stuk muur (met de poorten erin) door tegel (i, j): langs x of langs y, het langste dat geen poort doorsnijdt.
export function wallRun(s, i, j) {
  const set = wallSet(s);
  const has = (a, b) => inTerr(a, b) && set.has(tileIndex(a, b));
  if (!has(i, j)) return [];
  const run = (dx, dy) => {
    const out = [[i, j]];
    for (let k = 1; has(i + dx * k, j + dy * k); k++) out.push([i + dx * k, j + dy * k]);
    for (let k = 1; has(i - dx * k, j - dy * k); k++) out.unshift([i - dx * k, j - dy * k]);
    return out;
  };
  const gl = gateList(s);
  const whole = (r) => { const k = new Set(r.map(([a, b]) => tileIndex(a, b))); return gl.every((g) => { const n = g.tiles.filter(([a, b]) => k.has(tileIndex(a, b))).length; return !n || n === g.tiles.length; }); };
  const cands = [run(1, 0), run(0, 1)].filter(whole).sort((a, b) => b.length - a.length);
  return cands[0] || [[i, j]];
}

// staat een (verplaatste) poort in een recht stuk muur, met aan beide kanten een muurstuk en geen hoek ernaast?
function gateFits(walls, gates, tl) {
  const any = (a, b) => inTerr(a, b) && (walls.has(tileIndex(a, b)) || gates.has(tileIndex(a, b)));
  const isW = (a, b) => inTerr(a, b) && walls.has(tileIndex(a, b));
  if (tl.length === 1) { const all = new Set([...walls, ...gates]); return !!gateAxis(all, tl[0][0], tl[0][1]); }
  const [a, b] = tl; const dx = b[0] - a[0]; const dy = b[1] - a[1];
  if (!isW(a[0] - dx, a[1] - dy) || !isW(b[0] + dx, b[1] + dy)) return false;
  return !tl.some(([u, v]) => any(u + dy, v + dx) || any(u - dy, v - dx));
}

// Verplaats muurstukken (en poorten in hun geheel) over (dx, dy). Een poort alleen verplaatsen: de oude opening wordt muur.
// Geeft de nieuwe { walls, gates } terug, of een foutmelding.
export function planWallMove(s, tiles, dx, dy) {
  if (!bLevel(s, 'wall')) return 'Bouw eerst de stadsmuur.';
  if (!Array.isArray(tiles) || !tiles.length) return 'Kies welke muur je wil verplaatsen.';
  if (tiles.length > WALL_TILE.maxPerOrder) return `Maximaal ${WALL_TILE.maxPerOrder} muurstukken tegelijk.`;
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || (!dx && !dy) || Math.abs(dx) > T_W || Math.abs(dy) > T_W) return 'Kies een nieuwe plek voor de muur.';
  const walls = new Set(s.walls || []); const gates = new Set(s.gates || []);
  const src = new Set();
  for (const t of tiles) {
    if (!Array.isArray(t) || !Number.isInteger(t[0]) || !Number.isInteger(t[1]) || !inTerr(t[0], t[1])) return 'Ongeldige plaats.';
    const idx = tileIndex(t[0], t[1]);
    if (!walls.has(idx) && !gates.has(idx)) return 'Daar staat geen muur.';
    if (src.has(idx)) return 'Ongeldige plaats.';
    src.add(idx);
  }
  const moved = [];
  for (const g of gateList(s)) {
    const n = g.tiles.filter(([a, b]) => src.has(tileIndex(a, b))).length;
    if (n && n < g.tiles.length) return 'Een poort verplaats je in zijn geheel.';
    if (n) moved.push(g);
  }
  const gateOnly = moved.length > 0 && [...src].every((x) => gates.has(x));
  const nw = new Set(walls); const ng = new Set(gates);
  for (const x of src) { nw.delete(x); ng.delete(x); }
  if (gateOnly) for (const x of src) nw.add(x); // de oude opening wordt muur
  const cl = clearedSet(s); const occ = occupied(s);
  for (const x of src) {
    const { i, j } = tileOf(x); const a = i + dx; const b = j + dy;
    if (!inTerr(a, b) || !isBuildable(s, a, b, cl)) return 'Muren kan je enkel op je eigen bouwgrond zetten.';
    if (occ.has(`${a},${b}`)) return 'Daar staat een gebouw.';
    const t = tileIndex(a, b);
    if (ng.has(t)) return 'Daar staat al een poort.';
    if (nw.has(t) && !gateOnly) return 'Daar staat al een muur.';
    if (gates.has(x)) { nw.delete(t); ng.add(t); } else nw.add(t);
  }
  for (const g of moved) {
    if (!gateFits(nw, ng, g.tiles.map(([i, j]) => [i + dx, j + dy]))) return 'Een poort moet in een recht stuk muur staan, met aan beide kanten een muurstuk.';
  }
  if (!ng.size && insideSet(s, nw)) return 'Zo is je stad helemaal dicht zonder poort. Maak eerst een poort (2 tegels breed) in een recht stuk muur.';
  return { walls: [...nw], gates: [...ng] };
}

export function checkMoveWalls(s, tiles, dx, dy) {
  const p = planWallMove(s, tiles, dx, dy);
  return typeof p === 'string' ? p : null;
}

export function doMoveWalls(s, tiles, dx, dy) {
  const p = planWallMove(s, tiles, dx, dy);
  if (typeof p === 'string') throw new GameError(p);
  s.walls = p.walls;
  s.gates = p.gates;
}

export function buildRing(s) {
  return ringForAge(age(s));
}

// mag je op tegel (i, j) bouwen? (binnen het bouwvierkant van je tijdperk, of op gekapt bos)
export function isBuildable(s, i, j, cl = null) {
  if (ringOf(i, j) <= ringForAge(age(s))) return true;
  if (!s.terr || !inTerr(i, j)) return false;
  return (cl || clearedSet(s)).has(tileIndex(i, j));
}

// staat er (nog) een boom op tegel (i, j)?
export function hasTree(s, i, j, cl = null) {
  if (!s.terr || !inTerr(i, j)) return false;
  const terr = territory(s.terr.seed);
  if (terr.tiles[tileIndex(i, j)] !== TILE.FOREST) return false;
  return !isBuildable(s, i, j, cl);
}

// kan je deze boom omhakken om bouwgrond te winnen? (grenst aan bouwgrond, niet te ver)
export function canChop(s, i, j) {
  const cl = clearedSet(s);
  if (!hasTree(s, i, j, cl)) return false;
  if (ringOf(i, j) > ringForAge(age(s)) + FIELD.clearReach) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isBuildable(s, i + dx, j + dy, cl));
}

export function groupPos(g, t) {
  if (!g.pending || t >= g.t1) return { x: g.x1, y: g.y1 };
  if (t <= g.t0) return { x: g.x0, y: g.y0 };
  const f = (t - g.t0) / (g.t1 - g.t0);
  return { x: g.x0 + (g.x1 - g.x0) * f, y: g.y0 + (g.y1 - g.y0) * f };
}
export const groupSpeed = (g) => Math.min(...Object.keys(g.units).map((k) => FIELD.speed[k] || 1));
export const groupVision = (g) => Math.max(...Object.keys(g.units).map((k) => FIELD.vision[k] || 3));
export const isVillagerGroup = (g) => Object.keys(g.units).every((k) => k === 'villager');

function withEx(s, fn) {
  const b = exDecode(s.terr.ex);
  fn(b);
  s.terr.ex = exEncode(b);
}

// Wat je rond je eigen stad altijd ziet: je bouwgrond (vierkant van je tijdperk, gekochte loten, gekapt bos), je muren
// en poorten en alles erbinnen, met een rand van FIELD.homeSight tegels. Daarbuiten begint de oorlogsmist, dus nooit
// binnen je eigen muren. Geeft een Uint8Array per tegel (1 = zichtbaar); gedeeld en gecachet: niet aanpassen.
const SIGHT_OFF = (() => {
  const r = FIELD.homeSight; const R = Math.ceil(r); const out = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r) out.push([dx, dy]);
  return out;
})();
let sightCache = null;
export function homeSight(s) {
  const k = ringForAge(age(s));
  const tr = s.terr;
  const harbors = findType(s, 'harbor');
  const key = tr ? `${k}|${tr.seed}|${tr.cl.join()}|${JSON.stringify(tr.lots || [])}|${(s.walls || []).join()}|${(s.gates || []).join()}|${harbors.map((h) => `${h.x},${h.y}`).join()}` : `${k}`;
  if (sightCache && sightCache.key === key) return sightCache.vis;
  const src = new Uint8Array(T_W * T_W);
  for (let j = T_MIN; j < T_MAX; j++) for (let i = T_MIN; i < T_MAX; i++) if (ringOf(i, j) <= k) src[tileIndex(i, j)] = 1;
  if (tr) {
    for (const idx of clearedSet(s)) src[idx] = 1;
    const walls = wallSet(s);
    for (const idx of walls) if (idx >= 0 && idx < src.length) src[idx] = 1;
    const inside = insideSet(s, walls);
    if (inside) {
      for (const p of inside) {
        const [i, j] = p.split(',').map(Number);
        if (inTerr(i, j)) src[tileIndex(i, j)] = 1;
      }
    }
  }
  const vis = new Uint8Array(T_W * T_W);
  for (let idx = 0; idx < src.length; idx++) {
    if (!src[idx]) continue;
    const i = (idx % T_W) + T_MIN; const j = Math.floor(idx / T_W) + T_MIN;
    for (const [dx, dy] of SIGHT_OFF) if (inTerr(i + dx, j + dy)) vis[tileIndex(i + dx, j + dy)] = 1;
  }
  // rond het havenhuis (dat aan de rand van je gebied kan liggen) is er ook nooit mist: een vierkant van FISH.sight tegels
  if (tr) {
    const r = FISH.sight;
    for (const h of harbors) {
      for (let j = h.y - r; j <= h.y + r; j++) for (let i = h.x - r; i <= h.x + r; i++) if (inTerr(i, j)) vis[tileIndex(i, j)] = 1;
    }
  }
  sightCache = { key, vis };
  return vis;
}

// wat is er nu ontdekt (je eigen stad en de rand errond, plus wat lopende eenheden onderweg al zagen)
export function exploredNow(s, now) {
  const b = exDecode(s.terr ? s.terr.ex : '');
  if (s.terr) {
    const hs = homeSight(s);
    for (let k = 0; k < hs.length; k++) if (hs[k]) b[k >> 3] |= 1 << (k & 7);
  }
  for (const g of s.field || []) {
    const p = groupPos(g, now);
    if (g.pending) revealSegment(b, g.x0, g.y0, p.x, p.y, groupVision(g));
    else revealCircle(b, p.x, p.y, groupVision(g));
  }
  return b;
}

// het bouwvierkant en de bosrand errond zijn altijd zichtbaar
function autoReveal(s) {
  const want = ringForAge(age(s)) + 4;
  if (s.terr.rv >= want) return;
  withEx(s, (b) => {
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        if (ringOf(i, j) > want) continue;
        const k = tileIndex(i, j);
        b[k >> 3] |= 1 << (k & 7);
      }
    }
  });
  s.terr.rv = want;
}

function wildRand(s, k) {
  let h = (s.terr.seed * 374761393 + k * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pushLog(s, t, kind, text) {
  s.terr.lid++;
  s.terr.log.push({ id: s.terr.lid, t, kind, text });
  if (s.terr.log.length > 12) s.terr.log.shift();
}

function addRes(s, res) {
  const cap = capacity(s);
  for (const r of RES) {
    const a = res[r] || 0;
    if (a > 0) s.res[r] = Math.max(s.res[r], Math.min(cap, s.res[r] + a));
  }
}

const ageMult = (s) => 1 + 0.5 * (age(s) - 1);
const scaleRes = (res, m) => Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Math.round(v * m)]));
const resText = (res) => Object.entries(res).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${({ food: 'voedsel', wood: 'hout', stone: 'steen', gold: 'goud' })[k]}`).join(', ');

export function depositById(s, id) {
  return territory(s.terr.seed).deposits.find((d) => d.id === id) || null;
}
export function depLeft(s, d) {
  const v = s.terr.dep[d.id];
  return v === undefined ? WILD.deposits[d.kind].amount : v;
}
function gatherPerHour(s, speed) {
  return (r) => GATHER_RATE[r] * (1 + 0.1 * (age(s) - 1)) * speed * FIELD.gatherEff;
}
function gatherers(s) {
  const out = new Map();
  for (const g of s.field || []) {
    if (!g.work || g.work.type !== 'gather') continue;
    out.set(g.work.id, (out.get(g.work.id) || 0) + (g.units.villager || 0));
  }
  return out;
}
function gatherAccrue(s, dt, speed) {
  const extra = {};
  if (!s.terr || !s.field || !s.field.length) return extra;
  const per = gatherPerHour(s, speed);
  for (const [id, n] of gatherers(s)) {
    const d = depositById(s, id);
    if (!d) continue;
    const res = WILD.deposits[d.kind].res;
    const amt = Math.min(depLeft(s, d), per(res) * n * dt);
    s.terr.dep[d.id] = depLeft(s, d) - amt;
    extra[res] = (extra[res] || 0) + amt;
  }
  return extra;
}

// Het barbarenkamp rond je stad is bedoeld als vrij makkelijke buit: ongeveer evenveel soldaten als barbaren volstaat.
// Maar het groeit elke dag dat je het met rust laat (x1 bij het (her)opbouwen, tot WILD.camp.growMax), en dan worden ook
// de overvallen op je dorp groter en vaker.
const campDays = (s, t) => {
  const c = s.terr.camp;
  return c.since == null ? 0 : Math.max(0, t - c.since) / (c.day || 86400000);
};
export function campGrowth(s, t = s.t) {
  return Math.round((1 + Math.min(WILD.camp.growMax - 1, WILD.camp.growPerDay * campDays(s, t))) * 100) / 100;
}
// kans op een overval bij elke controle (om de WILD.raid.checkHours)
export function raidChance(s, t = s.t) {
  const R = WILD.raid;
  return Math.min(R.maxChance, R.chance + R.chancePerDay * campDays(s, t));
}
export const campSize = (s, t = s.t) => Math.round((2 + 2 * age(s)) * campGrowth(s, t)) - (s.terr.camp.loss || 0);
export const raidSize = (s, t = s.t) => Math.min(WILD.raid.max, Math.round((3 + age(s) * 2.5) * campGrowth(s, t)));
// de overval die nu naar je dorp trekt (of die je zelf aan het uitvechten bent)
export const raidNow = (s) => (s && s.terr && s.terr.camp.raid) || null;
export const boarAlive = (s, id, t) => (s.terr.boar[id] || 0) <= t;
export const campAlive = (s, t) => s.terr.camp.down <= t;

function nextWildEvent(s, speed) {
  let ev = null;
  const take = (t, e) => { if (!ev || t < ev.t) ev = { t, ...e }; };
  for (const g of s.field) {
    if (g.pending) {
      take(g.t1, { kind: 'arrive', g });
      const ta = aggroTime(s, g);
      if (ta != null) take(ta, { kind: 'ambush', g });
    }
    if (g.work && g.work.type === 'chop') take(g.work.end, { kind: 'chopped', g });
  }
  for (const f of s.terr.fights || []) take(f.end, { kind: 'fight', f });
  const gs = gatherers(s);
  if (gs.size) {
    const per = gatherPerHour(s, speed);
    for (const [id, n] of gs) {
      const d = depositById(s, id);
      if (!d || !n) continue;
      const rate = per(WILD.deposits[d.kind].res) * n;
      take(s.t + Math.ceil((depLeft(s, d) / rate) * 3600000), { kind: 'depleted', id });
    }
  }
  const c = s.terr.camp;
  if (c.raid) take(c.raid.battle ? c.raid.bt + WILD.raid.liveMs : c.raid.at, { kind: 'raidHit' });
  else if (c.next != null) take(c.next, { kind: 'raid' });
  return ev;
}

function applyWildEvent(s, ev, speed) {
  if (ev.kind === 'arrive') fieldArrive(s, ev.g, ev.t, speed);
  else if (ev.kind === 'ambush') ambush(s, ev.g, ev.t);
  else if (ev.kind === 'fight') finishFight(s, ev.f, ev.t, speed);
  else if (ev.kind === 'chopped') chopDone(s, ev.g, ev.t);
  else if (ev.kind === 'depleted') depleted(s, ev.id, ev.t);
  else if (ev.kind === 'raid') raidStart(s, ev.t);
  else if (ev.kind === 'raidHit') raidAuto(s, ev.t);
}

// pace = optioneel trager tempo (tegels/s), zodat een heel leger samen aankomt
function setPath(g, from, to, t, pace = null) {
  const sp = pace ? Math.min(groupSpeed(g), Math.max(0.3, pace)) : groupSpeed(g);
  g.x0 = from.x; g.y0 = from.y; g.x1 = to.x; g.y1 = to.y;
  g.t0 = t;
  g.t1 = t + Math.max(300, Math.round((Math.hypot(to.x - from.x, to.y - from.y) / sp) * 1000));
  g.pending = true;
}

// ---------- routes in je gebied ----------
// Niemand loopt over water of door een muur; een poort is een doorgang (de deuren gaan open). Een route = A* over de
// tegels (8 richtingen, geen hoeken afsnijden langs een hindernis), daarna zo weinig mogelijk tussenstops waar je
// rechtdoor kan. Puur en deterministisch (zelfde uitkomst in browser en server); geen Math.hypot.
let blockCache = null;
function blockGrid(s) {
  const key = `${s.terr.seed}|${(s.walls || []).join()}|${(s.gates || []).join()}`;
  if (blockCache && blockCache.key === key) return blockCache.b;
  const tiles = territory(s.terr.seed).tiles;
  const b = new Uint8Array(T_W * T_W);
  for (let k = 0; k < b.length; k++) if (tiles[k] === TILE.WATER) b[k] = 1;
  for (const w of s.walls || []) if (w >= 0 && w < b.length) b[w] = 1;
  for (const w of s.gates || []) if (w >= 0 && w < b.length) b[w] = 0;
  blockCache = { key, b };
  return b;
}
const blockedAt = (b, i, j) => !inTerr(i, j) || b[tileIndex(i, j)] === 1;

// raakt het lijnstuk een geblokkeerde tegel? (elke tegel waar het door gaat; precies door een hoek = beide buren)
// skip = tegel die mag (waar de groep nu staat, ook als daar intussen een muur kwam)
function segFree(b, x0, y0, x1, y1, skip = -1) {
  let i = Math.floor(x0); let j = Math.floor(y0);
  const ie = Math.floor(x1); const je = Math.floor(y1);
  const dx = x1 - x0; const dy = y1 - y0;
  const si = dx > 0 ? 1 : dx < 0 ? -1 : 0; const sj = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tdx = si ? si / dx : Infinity; const tdy = sj ? sj / dy : Infinity;
  let tx = si ? ((si > 0 ? i + 1 : i) - x0) / dx : Infinity;
  let ty = sj ? ((sj > 0 ? j + 1 : j) - y0) / dy : Infinity;
  const bad = (a, c) => blockedAt(b, a, c) && !(inTerr(a, c) && tileIndex(a, c) === skip);
  for (let n = 0; n < 4 * T_W; n++) {
    if (bad(i, j)) return false;
    if (i === ie && j === je) return true;
    if (tx < ty - 1e-9) { i += si; tx += tdx; } else if (ty < tx - 1e-9) { j += sj; ty += tdy; } else {
      if (bad(i + si, j) || bad(i, j + sj)) return false;
      i += si; j += sj; tx += tdx; ty += tdy;
    }
  }
  return true;
}

// rechtdoor van a naar c, met wat ruimte opzij (niet rakelings langs een muur of de oever)
function clearLine(b, a, c, skip) {
  if (!segFree(b, a.x, a.y, c.x, c.y, skip)) return false;
  const dx = c.x - a.x; const dy = c.y - a.y; const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.7) return true;
  const ux = dx / len; const uy = dy / len; const px = -uy * 0.22; const py = ux * 0.22;
  const ax = a.x + ux * 0.35; const ay = a.y + uy * 0.35; const cx = c.x - ux * 0.35; const cy = c.y - uy * 0.35;
  return segFree(b, ax + px, ay + py, cx + px, cy + py, skip) && segFree(b, ax - px, ay - py, cx - px, cy - py, skip);
}

const SQ2 = 1.4142135623730951;
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
function octile(i, j, gi, gj) { const a = Math.abs(i - gi); const c = Math.abs(j - gj); return Math.max(a, c) + (SQ2 - 1) * Math.min(a, c); }

// A* van tegel (si, sj) naar (gi, gj); lukt dat niet (ingesloten), dan naar de bereikbare tegel die er het dichtst bij ligt.
// Vaste werkgeheugens (typed arrays) en een eigen hoop: snel genoeg voor een heel leger in één verzoek op de server.
const AN = T_W * T_W;
const A_G = new Float64Array(AN); const A_CAME = new Int32Array(AN); const A_DONE = new Uint8Array(AN);
const H_F = new Float64Array(AN * 8); const H_H = new Float64Array(AN * 8); const H_K = new Int32Array(AN * 8);
let hn = 0;
function hLess(a, c) { return H_F[a] < H_F[c] || (H_F[a] === H_F[c] && (H_H[a] < H_H[c] || (H_H[a] === H_H[c] && H_K[a] < H_K[c]))); }
function hSwap(a, c) {
  let x = H_F[a]; H_F[a] = H_F[c]; H_F[c] = x;
  x = H_H[a]; H_H[a] = H_H[c]; H_H[c] = x;
  const y = H_K[a]; H_K[a] = H_K[c]; H_K[c] = y;
}
function hPush(f, h, k) {
  let c = hn++; H_F[c] = f; H_H[c] = h; H_K[c] = k;
  while (c > 0) { const p = (c - 1) >> 1; if (!hLess(c, p)) break; hSwap(c, p); c = p; }
}
function hPop() {
  const k = H_K[0]; hn--;
  if (hn > 0) {
    H_F[0] = H_F[hn]; H_H[0] = H_H[hn]; H_K[0] = H_K[hn];
    let c = 0;
    for (;;) { const l = 2 * c + 1; const r = l + 1; let m = c; if (l < hn && hLess(l, m)) m = l; if (r < hn && hLess(r, m)) m = r; if (m === c) break; hSwap(c, m); c = m; }
  }
  return k;
}
// ligt het doel op water of een muur: de dichtstbijzijnde vrije tegel (ringen eromheen, vaste volgorde)
function freeNear(b, gi, gj) {
  if (!blockedAt(b, gi, gj)) return [gi, gj];
  for (let r = 1; r < T_W; r++) {
    let best = null; let bd = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || blockedAt(b, gi + di, gj + dj)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = [gi + di, gj + dj]; }
      }
    }
    if (best) return best;
  }
  return [gi, gj];
}
function aStar(b, si, sj, gi0, gj0) {
  const [gi, gj] = freeNear(b, Math.max(T_MIN, Math.min(T_MAX - 1, gi0)), Math.max(T_MIN, Math.min(T_MAX - 1, gj0)));
  A_G.fill(Infinity); A_CAME.fill(-1); A_DONE.fill(0); hn = 0;
  const start = tileIndex(si, sj); const goal = tileIndex(gi, gj);
  A_G[start] = 0;
  const h0 = octile(si, sj, gi, gj);
  hPush(h0, h0, start);
  let best = start; let bestH = h0;
  while (hn > 0) {
    const k = hPop();
    if (A_DONE[k]) continue;
    A_DONE[k] = 1;
    const i = (k % T_W) + T_MIN; const j = ((k - (k % T_W)) / T_W) + T_MIN;
    const h = octile(i, j, gi, gj);
    if (h < bestH || (h === bestH && A_G[k] < A_G[best])) { best = k; bestH = h; }
    if (k === goal) break;
    for (let d = 0; d < 8; d++) {
      const D = DIRS8[d]; const di = D[0]; const dj = D[1];
      const ni = i + di; const nj = j + dj;
      if (blockedAt(b, ni, nj)) continue;
      if (di && dj && (blockedAt(b, i + di, j) || blockedAt(b, i, j + dj))) continue;
      const nk = tileIndex(ni, nj);
      const ng = A_G[k] + D[2];
      if (A_DONE[nk] || ng >= A_G[nk]) continue;
      if (hn >= H_K.length) continue; // kan niet: elke tegel komt hooguit 8 keer in de hoop
      A_G[nk] = ng; A_CAME[nk] = k;
      const nh = octile(ni, nj, gi, gj);
      hPush(ng + nh, nh, nk);
    }
  }
  const path = [];
  for (let k = best; k !== -1; k = A_CAME[k]) path.push(k);
  path.reverse();
  return { path, reached: best === tileIndex(Math.max(T_MIN, Math.min(T_MAX - 1, gi0)), Math.max(T_MIN, Math.min(T_MAX - 1, gj0))) };
}

// De route van 'from' naar 'to': een lijst tussenstops (zonder 'from'), de laatste is het eindpunt. Ligt 'to' in het water
// of is het niet te bereiken, dan eindigt de route zo dicht mogelijk erbij.
export function routeTo(s, from, to) {
  if (!s.terr) return [{ x: to.x, y: to.y }];
  const b = blockGrid(s);
  const si = Math.floor(from.x); const sj = Math.floor(from.y);
  const skip = inTerr(si, sj) ? tileIndex(si, sj) : -1;
  if (clearLine(b, from, to, skip)) return [{ x: to.x, y: to.y }];
  const { path, reached } = aStar(b, si, sj, Math.floor(to.x), Math.floor(to.y));
  let end = { x: to.x, y: to.y };
  if (!reached) {
    const t = tileOf(path[path.length - 1]);
    end = { x: Math.min(t.i + 0.8, Math.max(t.i + 0.2, to.x)), y: Math.min(t.j + 0.8, Math.max(t.j + 0.2, to.y)) };
  }
  // tegelmiddens van de route (zonder de begintegel), het eindpunt in plaats van het laatste midden
  const pts = path.slice(1).map((k) => { const t = tileOf(k); return { x: t.i + 0.5, y: t.j + 0.5 }; });
  if (pts.length) pts[pts.length - 1] = end; else pts.push(end);
  // zo ver mogelijk rechtdoor: enkel de bochten blijven over
  const out = [];
  let a = from; let i = 0;
  while (i < pts.length) {
    let k = i;
    for (let m = pts.length - 1; m > i; m--) if (clearLine(b, a, pts[m], a === from ? skip : -1)) { k = m; break; }
    out.push(pts[k]); a = pts[k]; i = k + 1;
  }
  return out.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
}

// lopen van 'from' naar 'dest' langs een route rond water en muren (door een poort naar buiten of binnen)
function travel(s, g, from, dest, t, pace = null) {
  if (pace) g.pace = pace; else delete g.pace;
  const pts = routeTo(s, from, dest);
  const first = pts.shift();
  if (pts.length) g.via = pts; else delete g.via;
  setPath(g, from, first, t, pace);
}

function goHome(s, g, t) {
  const d = tcDoor();
  g.order = { type: 'home' };
  g.work = null;
  travel(s, g, { x: g.x1, y: g.y1 }, { x: d.gx, y: d.gy }, t);
}

function disband(s, g) {
  for (const k of Object.keys(g.units)) {
    const n = g.units[k];
    if (!n) continue;
    if (k === 'villager') {
      for (let i = 0; i < n; i++) {
        if (g.job && g.job !== 'idle' && (s.villagers[g.job] || 0) < (slots(s)[g.job] || 0)) s.villagers[g.job] = (s.villagers[g.job] || 0) + 1;
        else s.villagers.idle++;
      }
    } else s.units[k] = (s.units[k] || 0) + n;
  }
  s.field = s.field.filter((x) => x !== g);
}

function fieldArrive(s, g, t, speed) {
  withEx(s, (b) => revealSegment(b, g.x0, g.y0, g.x1, g.y1, groupVision(g)));
  // tussenstop (een poort): gewoon verder naar het volgende punt, met dezelfde opdracht
  if (g.via && g.via.length) {
    const next = g.via.shift();
    if (!g.via.length) delete g.via;
    setPath(g, { x: g.x1, y: g.y1 }, next, t, g.pace || null);
    return;
  }
  g.pending = false;
  g.x0 = g.x1; g.y0 = g.y1; g.t0 = g.t1;
  const o = g.order || {};
  g.order = null;
  if (o.type === 'home') { disband(s, g); return; }
  if (o.type === 'gather') {
    const d = depositById(s, o.id);
    if (d && depLeft(s, d) > 0) g.work = { type: 'gather', id: d.id };
    else goHome(s, g, t);
    return;
  }
  if (o.type === 'chop') {
    if (canChop(s, o.i, o.j)) g.work = { type: 'chop', i: o.i, j: o.j, end: t + FIELD.chopMs };
    else goHome(s, g, t);
    return;
  }
  if (o.type === 'boar' && boarAlive(s, o.id, t)) { engage(s, g, { type: 'boar', id: o.id }, t); return; }
  if (o.type === 'camp' && campAlive(s, t)) engage(s, g, { type: 'camp', id: 0 }, t);
}

function chopDone(s, g, t) {
  const w = g.work;
  g.work = null;
  if (canChop(s, w.i, w.j)) {
    s.terr.cl.push(tileIndex(w.i, w.j));
    addRes(s, { wood: FIELD.chopWood });
  }
  goHome(s, g, t);
}

function depleted(s, id, t) {
  const d = depositById(s, id);
  s.terr.dep[id] = 0;
  for (const g of [...s.field]) if (g.work && g.work.type === 'gather' && g.work.id === id) goHome(s, g, t);
  if (d) pushLog(s, t, 'dep', `${WILD.deposits[d.kind].name} is helemaal ontgonnen.`);
}

// ---------- gevechten in je gebied (mannetje per mannetje, zie skirmish.js) ----------

// wanneer komt een lopende groep binnen het bereik van het barbarenkamp? (null = niet)
function aggroTime(s, g) {
  if (g.fight || !s.terr) return null;
  const c = territory(s.terr.seed).camp;
  if (!c) return null;
  const R = FIELD.aggro;
  const dx = g.x1 - g.x0; const dy = g.y1 - g.y0;
  const fx = g.x0 - c.x; const fy = g.y0 - c.y;
  const c0 = fx * fx + fy * fy - R * R;
  if (c0 <= 0) return null; // vertrekt binnen het bereik: die mag weg (terugtrekken)
  const A = dx * dx + dy * dy;
  if (A === 0) return null;
  const B = 2 * (fx * dx + fy * dy);
  const disc = B * B - 4 * A * c0;
  if (disc < 0) return null;
  const u = (-B - Math.sqrt(disc)) / (2 * A);
  if (u < 0 || u > 1) return null;
  const t = g.t0 + (g.t1 - g.t0) * u;
  return campAlive(s, t) ? Math.round(t) : null;
}

// de barbaren stormen hun kamp uit en vallen aan
function ambush(s, g, t) {
  const p = groupPos(g, t);
  withEx(s, (b) => revealSegment(b, g.x0, g.y0, p.x, p.y, groupVision(g)));
  g.x0 = p.x; g.y0 = p.y; g.x1 = p.x; g.y1 = p.y; g.t0 = t; g.t1 = t;
  g.pending = false; g.order = null; g.work = null; delete g.via;
  engage(s, g, { type: 'camp', id: 0 }, t);
}

const foeSide = (s, foe, t) => (foe.type === 'boar' ? combatants({ boar: 1 }) : combatants({ barbarian: Math.max(1, campSize(s, t)) }));

// gevecht beginnen, of aansluiten bij een lopend gevecht tegen dezelfde vijand
function engage(s, g, foe, t) {
  const terr = s.terr;
  if (!terr.fights) terr.fights = [];
  const mine = combatants(g.units, g.hp, g.id);
  let f = terr.fights.find((x) => x.foe.type === foe.type && x.foe.id === foe.id);
  if (f) {
    const now = runFight(f, t);
    f.killed = (f.killed || 0) + now.b.filter((u) => u.hp <= 0).length;
    f.t0 = t;
    f.a = [...now.a.filter((u) => u.hp > 0).map(({ died, ...u }) => u), ...mine];
    f.b = now.b.filter((u) => u.hp > 0).map(({ died, ...u }) => u);
  } else {
    terr.fid = (terr.fid || 0) + 1;
    f = { id: terr.fid, foe, t0: t, a: mine, b: foeSide(s, foe, t), ma: 1 + COMBAT.smithyBonus * bLevel(s, 'smithy') };
    terr.fights.push(f);
  }
  f.end = fightEnd(f);
  g.fight = f.id; g.work = null; g.order = null; g.pending = false;
}

// een groep trekt zich terug uit een gevecht (met wat er nog van over is)
function leaveFight(s, g, t) {
  const f = (s.terr.fights || []).find((x) => x.id === g.fight);
  g.fight = null;
  if (!f) return true;
  const r = runFight(f, t);
  const sv = survivorsByGroup(r.a.filter((u) => u.g === g.id))[g.id];
  const rest = r.a.filter((u) => u.g !== g.id && u.hp > 0).map(({ died, ...u }) => u);
  f.killed = (f.killed || 0) + r.b.filter((u) => u.hp <= 0).length;
  if (!rest.length) {
    s.terr.fights = s.terr.fights.filter((x) => x !== f);
    if (f.foe.type === 'camp') s.terr.camp.loss = (s.terr.camp.loss || 0) + f.killed;
  } else {
    f.t0 = t; f.a = rest; f.b = r.b.filter((u) => u.hp > 0).map(({ died, ...u }) => u); f.end = fightEnd(f);
  }
  if (!sv) { s.field = s.field.filter((x) => x !== g); return false; }
  g.units = sv.units; g.hp = sv.hp;
  return true;
}

// enkele soldaten uit een lopend gevecht halen (de rest van de groep vecht verder)
function splitFromFight(s, g, take, t) {
  const f = (s.terr.fights || []).find((x) => x.id === g.fight);
  if (!f) { g.fight = null; return null; }
  const r = runFight(f, t);
  const need = { ...take };
  const leaving = [];
  for (const u of r.a) if (u.g === g.id && u.hp > 0 && (need[u.k] || 0) > 0) { leaving.push(u); need[u.k]--; }
  if (!leaving.length) throw new GameError('Die soldaten zijn al gesneuveld.');
  const strip = ({ died, ...u }) => u;
  f.killed = (f.killed || 0) + r.b.filter((u) => u.hp <= 0).length;
  f.t0 = t;
  f.a = r.a.filter((u) => u.hp > 0 && !leaving.includes(u)).map(strip);
  f.b = r.b.filter((u) => u.hp > 0).map(strip);
  f.end = fightEnd(f);
  const stay = survivorsByGroup(f.a.filter((u) => u.g === g.id))[g.id];
  if (stay) { g.units = stay.units; g.hp = stay.hp; } else s.field = s.field.filter((x) => x !== g);
  if (!f.a.length) {
    s.terr.fights = s.terr.fights.filter((x) => x !== f);
    if (f.foe.type === 'camp') s.terr.camp.loss = (s.terr.camp.loss || 0) + f.killed;
  }
  return survivorsByGroup(leaving.map((u) => ({ ...u, g: 0 })))[0];
}

function finishFight(s, f, t, speed) {
  const r = runFight(f, t);
  s.terr.fights = s.terr.fights.filter((x) => x !== f);
  const surv = survivorsByGroup(r.a);
  let survivors = 0;
  for (const g of s.field.filter((x) => x.fight === f.id)) {
    g.fight = null;
    const sv = surv[g.id];
    if (!sv) { s.field = s.field.filter((x) => x !== g); continue; }
    g.units = sv.units; g.hp = sv.hp;
    survivors += Object.values(sv.units).reduce((a, b) => a + b, 0);
  }
  const won = r.b.every((u) => u.hp <= 0);
  const killed = (f.killed || 0) + r.b.filter((u) => u.hp <= 0).length;
  if (f.foe.type === 'boar') {
    if (won) {
      s.terr.boar[f.foe.id] = t + Math.round((WILD.boar.respawnHours * 3600000) / speed);
      addRes(s, WILD.boar.loot);
      pushLog(s, t, 'boar', `Everzwijn gevangen: +${resText(WILD.boar.loot)}.`);
    } else {
      pushLog(s, t, 'boar-lost', 'Een everzwijn heeft je groep verslagen. Stuur een sterkere groep!');
    }
    return;
  }
  const c = s.terr.camp;
  if (won) {
    // een kamp dat lang kon groeien, geeft ook meer buit
    const grow = campGrowth(s, t);
    const loot = scaleRes(WILD.camp.loot, ageMult(s) * grow);
    c.down = t + Math.round((WILD.camp.respawnHours * 3600000) / speed);
    c.loss = 0;
    c.since = c.down; // het nieuwe kamp begint weer klein
    if (!c.raid) scheduleRaid(s, c.down);
    addRes(s, loot);
    pushLog(s, t, 'camp', `Barbarenkamp verwoest! Buit: ${resText(loot)}. De overvallen stoppen voorlopig.`);
  } else {
    c.loss = (c.loss || 0) + killed;
    pushLog(s, t, 'camp-lost', survivors ? `Je groep moest wijken voor de barbaren (${killed} barbaren gesneuveld).`
      : `De barbaren hebben je groep verslagen${killed ? ` (${killed} barbaren gesneuveld)` : ''}.`);
  }
}

export function towerDefense(s) {
  let d = 0;
  for (const b of findType(s, 'tower')) d += BUILDINGS.tower.defense * b.level;
  return d;
}

export function townBaseDef(s) {
  return COMBAT.ageDef * age(s) + COMBAT.villagerDef * totalVillagers(s);
}

// Wanneer komt de volgende overval? Om de checkHours een kans die groeit met het kamp (raidChance), vast uit het zaad van
// je gebied (browser en server zien hetzelfde), nooit binnen quietHours na 'from'.
function scheduleRaid(s, from) {
  const c = s.terr.camp; const R = WILD.raid; const day = c.day || 86400000;
  const step = Math.round((day * R.checkHours) / 24);
  let t = Math.max(from, c.down || 0) + Math.round((day * R.quietHours) / 24);
  c.sch = (c.sch || 0) + 1;
  for (let k = 0; k < 300; k++, t += step) if (wildRand(s, 7000 + c.sch * 300 + k) < raidChance(s, t)) break;
  c.next = t;
}

// De barbaren trekken naar je dorp. Ze komen pas na WILD.raid.warnMs (echte tijd) aan: tot dan kan je kiezen om de slag
// zelf te spelen (de server zet dan c.raid.battle), anders vallen ze automatisch aan (raidAuto).
function raidStart(s, t) {
  const c = s.terr.camp;
  c.next = null;
  if (!campAlive(s, t)) { scheduleRaid(s, t); return; }
  const n = raidSize(s, t);
  c.raid = { start: t, at: t + WILD.raid.warnMs, n };
  pushLog(s, t, 'raid-warn', `${n} barbaren trekken naar je dorp! Verdedig het zelf of laat de slag automatisch verlopen.`);
}

function raidAuto(s, t) {
  const n = s.terr.camp.raid.n;
  const groups = [{ key: 'home', units: { ...s.units } }];
  const smithy = bLevel(s, 'smithy');
  const r = resolveBattle({
    attUnits: { barbarian: n }, groups, defSmithy: smithy,
    wall: effectiveWall(s), towerDef: towerDefense(s), baseDef: townBaseDef(s),
  });
  const loot = applyRaid(s, t, r.attWins, r.attLeft, r.groupsLeft[0].units);
  // recept voor de replay (24 uur achteraf te bekijken in de browser, met de stad zoals ze dan is)
  const e = s.terr.log[s.terr.log.length - 1];
  if (e && e.t === t && /^raid-/.test(e.kind)) e.rp = { n, home: groups[0].units, smithy, fate: fateOf(r, groups), loot };
}

// Uitslag van een overval verwerken (automatisch, of na de slag die je zelf speelde: de server roept dit dan op).
// home = de soldaten die thuis overblijven. Geeft de buit van de barbaren terug.
export function applyRaid(s, t, attWins, attLeft, home) {
  const c = s.terr.camp;
  const n = c.raid ? c.raid.n : 0;
  s.units = {};
  for (const [k, v] of Object.entries(home || {})) if (v > 0) s.units[k] = v;
  let loot = {};
  if (attWins) {
    const prot = protectAmount(s);
    const avail = {};
    for (const k of RES) avail[k] = Math.max(0, s.res[k] - prot);
    loot = computeLoot(avail, ((attLeft && attLeft.barbarian) || 0) * WILD.raid.carry);
    for (const k of RES) s.res[k] -= loot[k];
    pushLog(s, t, 'raid-lost', `${n} barbaren overvielen je stad en stalen ${resText(loot) || 'niets'}. Verwoest hun kamp of bouw je verdediging uit!`);
  } else {
    pushLog(s, t, 'raid-won', `Je stad sloeg een overval van ${n} barbaren af!`);
  }
  c.raids++;
  c.raid = null;
  scheduleRaid(s, t);
  return loot;
}

// ---------- acties in het veld ----------

function clampToTerr(x, y) {
  return { x: Math.min(T_MAX - 0.6, Math.max(T_MIN + 0.6, x)), y: Math.min(T_MAX - 0.6, Math.max(T_MIN + 0.6, y)) };
}

// Stuur een eenheid (of groep) vanuit de stad het veld in.
// spec = { villager: 'wood' } (een dorpeling van die taak) of { units: { spear: 3 } }
export function doFieldSend(s, spec, from, to, target, now, pace = null) {
  if (!s.terr) throw new GameError('Je gebied is nog niet klaar.');
  if (s.field.length >= FIELD.maxGroups) throw new GameError(`Je hebt al ${FIELD.maxGroups} groepen op pad.`);
  const units = {};
  let job = null;
  if (spec && spec.villager !== undefined) {
    job = spec.villager;
    if (job === 'idle' ? s.villagers.idle < 1 : !(JOBS.includes(job) && s.villagers[job] > 0)) {
      job = s.villagers.idle > 0 ? 'idle' : JOBS.reduce((b, r) => ((s.villagers[r] || 0) > (b ? s.villagers[b] : 0) ? r : b), null);
    }
    if (!job) throw new GameError('Je hebt geen dorpeling vrij.');
    const n = Math.max(1, Math.min(s.villagers[job], 40, Math.floor(Number(spec.n) || 1)));
    s.villagers[job] -= n;
    units.villager = n;
  } else {
    for (const k of ARMY_UNITS) {
      const n = Math.floor(Number(spec && spec.units && spec.units[k]) || 0);
      if (n <= 0) continue;
      if ((s.units[k] || 0) < n) throw new GameError(`Je hebt niet genoeg ${UNITS[k].name.toLowerCase()}s thuis.`);
      units[k] = n;
    }
    if (!Object.keys(units).length) throw new GameError('Kies wie er op pad gaat.');
    for (const k of Object.keys(units)) { s.units[k] -= units[k]; if (!s.units[k]) delete s.units[k]; }
  }
  // vertrekken vanuit de stad (een plek binnen de bebouwde kom, anders aan het stadscentrum)
  const k = ringForAge(age(s));
  const door = tcDoor();
  let start = { x: door.gx, y: door.gy };
  if (from && Number.isFinite(from.x) && Number.isFinite(from.y) && ringOf(Math.floor(from.x), Math.floor(from.y)) <= k + 1) start = { x: from.x, y: from.y };
  const g = { id: s.nextId++, units, job, x0: start.x, y0: start.y, x1: start.x, y1: start.y, t0: now, t1: now, pending: false, order: null, work: null };
  s.field.push(g);
  doFieldOrder(s, g.id, to, target, now, pace);
  return g;
}

// Een deel van een groep apart een opdracht geven (bv. 1 soldaat aanklikken in een groep van 8).
// units = { soort: aantal } die meegaan; is dat de hele groep, dan krijgt gewoon de hele groep de opdracht.
export function doFieldSplit(s, id, units, to, target, now, pace = null) {
  const g = (s.field || []).find((x) => x.id === id);
  if (!g) throw new GameError('Die groep bestaat niet meer.');
  const take = {};
  let all = true;
  for (const k of Object.keys(g.units)) {
    const n = Math.min(g.units[k], Math.max(0, Math.floor(Number(units && units[k]) || 0)));
    if (n > 0) take[k] = n;
    if (n < g.units[k]) all = false;
  }
  if (!Object.keys(take).length) throw new GameError('Kies wie er op pad gaat.');
  if (all) return doFieldOrder(s, id, to, target, now, pace);
  if (s.field.length >= FIELD.maxGroups) throw new GameError(`Je hebt al ${FIELD.maxGroups} groepen op pad.`);
  let part;
  if (g.fight) {
    part = splitFromFight(s, g, take, now);
    if (!part) return doFieldSplit(s, id, units, to, target, now, pace);
  } else {
    part = { units: take, hp: {} };
    for (const k of Object.keys(take)) {
      const list = (g.hp && g.hp[k]) || [];
      if (list.length) { part.hp[k] = list.slice(0, take[k]); g.hp[k] = list.slice(take[k]); }
      g.units[k] -= take[k];
      if (!g.units[k]) { delete g.units[k]; if (g.hp) delete g.hp[k]; }
    }
  }
  const pos = groupPos(g, now);
  const ng = { id: s.nextId++, units: part.units, job: g.job, x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y, t0: now, t1: now, pending: false, order: null, work: null };
  if (Object.keys(part.hp || {}).length) ng.hp = part.hp;
  s.field.push(ng);
  doFieldOrder(s, ng.id, to, target, now, pace);
  return ng;
}

// Geef een groep in het veld een nieuwe opdracht: lopen, aanvallen, verzamelen, kappen of naar huis.
export function doFieldOrder(s, id, to, target, now, pace = null) {
  const g = (s.field || []).find((x) => x.id === id);
  if (!g) throw new GameError('Die groep bestaat niet meer.');
  if (g.fight && !leaveFight(s, g, now)) throw new GameError('Die groep is gesneuveld.');
  const pos = groupPos(g, now);
  // wat de groep onderweg al zag, blijft ontdekt
  if (g.pending) withEx(s, (b) => revealSegment(b, g.x0, g.y0, pos.x, pos.y, groupVision(g)));
  g.work = null;
  g.order = null;
  g.x1 = pos.x; g.y1 = pos.y; g.pending = false;
  const terr = territory(s.terr.seed);
  const seen = exploredNow(s, now);
  const known = (x, y) => {
    const i = Math.floor(x); const j = Math.floor(y);
    if (!inTerr(i, j)) return false;
    const k = tileIndex(i, j);
    return ((seen[k >> 3] >> (k & 7)) & 1) === 1;
  };
  const tt = target && target.type;
  let dest;
  if (tt === 'home') {
    const d = tcDoor();
    dest = { x: d.gx, y: d.gy };
    g.order = { type: 'home' };
  } else if (tt === 'boar') {
    const boar = terr.boars.find((b) => b.id === Number(target.id));
    if (!boar || !known(boar.x, boar.y)) throw new GameError('Dat everzwijn heb je nog niet ontdekt.');
    checkCanFight(g);
    if (!boarAlive(s, boar.id, now)) throw new GameError('Dat everzwijn is er niet meer.');
    dest = { x: boar.x - 0.4, y: boar.y + 0.4 };
    g.order = { type: 'boar', id: boar.id };
  } else if (tt === 'camp') {
    if (!terr.camp || !known(terr.camp.x, terr.camp.y)) throw new GameError('Dat kamp heb je nog niet ontdekt.');
    checkCanFight(g);
    if (!campAlive(s, now)) throw new GameError('Het kamp ligt in puin.');
    dest = { x: terr.camp.x - 0.8, y: terr.camp.y + 0.8 };
    g.order = { type: 'camp' };
  } else if (tt === 'dep') {
    const d = terr.deposits.find((x) => x.id === Number(target.id));
    if (!d || !known(d.x, d.y)) throw new GameError('Die bron heb je nog niet ontdekt.');
    if (!isVillagerGroup(g)) throw new GameError('Enkel dorpelingen kunnen verzamelen.');
    if (depLeft(s, d) <= 0) throw new GameError('Die bron is uitgeput.');
    dest = { x: d.x + 0.5, y: d.y + 0.5 };
    g.order = { type: 'gather', id: d.id };
  } else if (tt === 'tree') {
    const i = Math.floor(Number(target.i)); const j = Math.floor(Number(target.j));
    if (!isVillagerGroup(g)) throw new GameError('Enkel dorpelingen kunnen bomen kappen.');
    if (!canChop(s, i, j)) throw new GameError('Die boom kan je (nog) niet kappen: kap het bos vanaf de rand van je stad.');
    dest = { x: i + 0.85, y: j + 0.85 };
    g.order = { type: 'chop', i, j };
  } else {
    if (!to || !Number.isFinite(Number(to.x)) || !Number.isFinite(Number(to.y))) throw new GameError('Kies een plek.');
    dest = clampToTerr(Number(to.x), Number(to.y));
    g.order = { type: 'move' };
  }
  travel(s, g, pos, dest, now, Number(pace) > 0 ? Number(pace) : null);
  return g;
}

function checkCanFight(g) {
  if (isVillagerGroup(g)) throw new GameError('Dorpelingen vechten niet. Stuur soldaten.');
  if (attackPowerOf(g.units) <= 0) throw new GameError('Deze groep kan niet vechten (verkenners vechten niet).');
}

function attackPowerOf(units) {
  let a = 0;
  for (const k of Object.keys(units)) a += (UNITS[k] && UNITS[k].atk ? UNITS[k].atk : 0) * units[k];
  return a;
}

export function canAfford(res, cost, mult = 1) {
  for (const r of RES) if ((cost[r] || 0) * mult > (res[r] || 0) + 1e-6) return false;
  return true;
}

export function pay(res, cost, mult = 1) {
  for (const r of RES) res[r] = (res[r] || 0) - (cost[r] || 0) * mult;
}

export function scaleCost(cost, n) {
  const o = {};
  for (const r of RES) if (cost[r]) o[r] = cost[r] * n;
  return o;
}

// ---------- plaatsing ----------

export function occupied(s, ignoreId = null) {
  const grid = new Map();
  for (const b of s.buildings) {
    if (!isPlaced(b) || b.id === ignoreId) continue;
    const size = BUILDINGS[b.type].size;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) grid.set(`${b.x + dx},${b.y + dy}`, b);
  }
  return grid;
}

// ignoreId: dit gebouw telt niet mee (bij verplaatsen mag het over zijn eigen oude plek schuiven)
export function canPlaceAt(s, type, x, y, ignoreId = null) {
  const size = BUILDINGS[type].size;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const cl = clearedSet(s);
  // het havenhuis: naast water (mag net buiten je bouwgrond, zie shoreTile); de rest op je bouwgrond
  if (BUILDINGS[type].shore) { if (!shoreTile(s, x, y, cl)) return false; } else {
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (!isBuildable(s, x + dx, y + dy, cl)) return false;
  }
  const grid = occupied(s, ignoreId);
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (grid.has(`${x + dx},${y + dy}`)) return false;
  if ((s.walls || []).length) {
    const walls = wallSet(s);
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (walls.has(tileIndex(x + dx, y + dy))) return false;
  }
  return true;
}

// ---------- acties (geven een foutmelding terug of null) ----------

export const needAge = (a) => `Vereist het ${AGES[a].name}.`;

export function checkBuild(s, type) {
  const def = BUILDINGS[type];
  if (!def || def.placeable === false) return 'Onbekend gebouw.';
  if (age(s) < def.age) return needAge(def.age);
  if (findType(s, type).length >= def.max) return `Je hebt al het maximum (${def.max}) van dit gebouw.`;
  if (s.builds.length >= maxBuilds(s)) return 'Al je bouwers zijn bezig.';
  if (tooBig(s, levelCost(type, 1))) return 'Je opslag is te klein hiervoor: bouw of verbeter een opslagplaats.';
  if (!canAfford(s.res, levelCost(type, 1))) return 'Niet genoeg grondstoffen.';
  return null;
}

export function doBuild(s, type, x, y, now, speed) {
  const err = checkBuild(s, type);
  if (err) throw new GameError(err);
  if (!canPlaceAt(s, type, x, y)) throw new GameError(BUILDINGS[type].shore ? 'Het havenhuis moet op vrij land naast het water staan (de vijver bij je dorp).' : 'Daar kan je niet bouwen.');
  pay(s.res, levelCost(type, 1));
  const b = { id: s.nextId++, type, x, y, level: 0 };
  s.buildings.push(b);
  s.builds.push({ bid: b.id, to: 1, start: now, end: now + buildTime(s, type, 1, speed) });
  return b;
}

// Gebouw verplaatsen (gratis): enkel naar vrije bouwgrond. Het stadscentrum staat vast in het midden (plein en straten).
export function checkMove(s, bid, x, y) {
  const b = s.buildings.find((q) => q.id === bid);
  if (!b) return 'Gebouw niet gevonden.';
  if (b.type === 'tc') return 'Je stadscentrum blijft in het midden van je stad.';
  if (!isPlaced(b)) return 'Muren verplaats je niet: breek ze af en zet ze opnieuw.';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Ongeldige plaats.';
  if (b.x === x && b.y === y) return 'Het gebouw staat daar al.';
  if (!canPlaceAt(s, b.type, x, y, b.id)) return 'Daar kan het gebouw niet staan.';
  return null;
}

export function doMove(s, bid, x, y) {
  const err = checkMove(s, bid, x, y);
  if (err) throw new GameError(err);
  const b = s.buildings.find((q) => q.id === bid);
  b.x = x; b.y = y;
  return b;
}

export function checkUpgrade(s, bid) {
  const b = s.buildings.find((x) => x.id === bid);
  if (!b) return 'Gebouw niet gevonden.';
  const def = BUILDINGS[b.type];
  if (s.builds.some((j) => j.bid === bid)) return 'Er wordt al aan gewerkt.';
  if (b.level >= def.maxLevel) return 'Maximaal niveau bereikt.';
  const to = b.level + 1;
  if (age(s) < levelAge(b.type, to)) return needAge(levelAge(b.type, to));
  if (b.type === 'tc' && Object.keys(s.queues).includes('tc')) return 'Wacht tot de training in het stadscentrum klaar is.';
  if (s.builds.length >= maxBuilds(s)) return 'Al je bouwers zijn bezig.';
  const cost = levelCost(b.type, to);
  if (tooBig(s, cost)) return 'Je opslag is te klein hiervoor: bouw of verbeter een opslagplaats.';
  if (!canAfford(s.res, cost)) return 'Niet genoeg grondstoffen.';
  return null;
}

export function tooBig(s, cost) {
  const cap = capacity(s);
  return RES.some((r) => (cost[r] || 0) > cap);
}

export function doUpgrade(s, bid, now, speed) {
  const err = checkUpgrade(s, bid);
  if (err) throw new GameError(err);
  const b = s.buildings.find((x) => x.id === bid);
  const to = b.level + 1;
  pay(s.res, levelCost(b.type, to));
  s.builds.push({ bid, to, start: now, end: now + buildTime(s, b.type, to, speed) });
}

// ---------- afbreken ----------

export function checkDemolish(s, bid) {
  const b = s.buildings.find((x) => x.id === bid);
  if (!b) return 'Gebouw niet gevonden.';
  if (b.type === 'tc') return 'Je stadscentrum kan je niet afbreken.';
  if (b.type === 'wall') return 'Muren breek je stuk per stuk af: tik op een muurstuk.';
  if ((s.queues[b.type] || []).length) return 'Er wordt nog getraind in dit gebouw. Wacht tot dat klaar is.';
  if (b.type === 'academy' && s.research) return 'Er loopt nog een onderzoek. Wacht tot dat klaar is.';
  return null;
}

// wat je terugkrijgt: een deel van wat het gebouw kostte (een lopende bouw voor de helft)
export function demolishRefund(s, b) {
  const out = {};
  const add = (cost, f) => { for (const r of RES) if (cost[r]) out[r] = (out[r] || 0) + cost[r] * f; };
  for (let L = 1; L <= b.level; L++) add(levelCost(b.type, L), DEMOLISH.built);
  const job = s.builds.find((j) => j.bid === b.id);
  if (job) add(levelCost(b.type, job.to), DEMOLISH.job);
  for (const r of Object.keys(out)) out[r] = Math.floor(out[r]);
  return out;
}

export function doDemolish(s, bid) {
  const err = checkDemolish(s, bid);
  if (err) throw new GameError(err);
  const b = s.buildings.find((x) => x.id === bid);
  const refund = demolishRefund(s, b);
  s.buildings = s.buildings.filter((x) => x !== b);
  s.builds = s.builds.filter((j) => j.bid !== bid);
  addRes(s, refund);
  // het havenhuis weg: de bootjes ook (een lopende bouw van een bootje valt weg)
  if (b.type === 'harbor') { s.boats = 0; s.boatJob = null; }
  // werkplekken die wegvallen: die dorpelingen worden vrij
  const sl = slots(s);
  for (const r of JOBS) {
    if ((s.villagers[r] || 0) > sl[r]) { s.villagers.idle += s.villagers[r] - sl[r]; s.villagers[r] = sl[r]; }
  }
  return refund;
}

// Troepen ontslaan: enkel soldaten die thuis zijn (niet in je gebied, onderweg of elders). units = { soort: aantal }.
// Hun plaats in de bevolking komt vrij en je krijgt DISMISS.refund van hun kosten terug (zoals bij afbreken).
export function checkDismiss(s, units) {
  const keys = Object.keys(units || {}).filter((k) => units[k]);
  if (!keys.length) return 'Kies welke troepen je wil ontslaan.';
  for (const k of keys) {
    const n = units[k];
    const u = UNITS[k];
    if (!u || u.wild || k === 'villager' || !ARMY_UNITS.includes(k)) return 'Onbekende eenheid.';
    if (!Number.isInteger(n) || n < 0) return 'Ongeldig aantal.';
    if (n > (s.units[k] || 0)) return `Zoveel ${u.name.toLowerCase()}s heb je niet thuis.`;
  }
  return null;
}

export function dismissRefund(units) {
  const out = {};
  for (const k of Object.keys(units || {})) {
    const u = UNITS[k];
    if (!u || !units[k]) continue;
    for (const r of RES) if (u.cost[r]) out[r] = (out[r] || 0) + u.cost[r] * units[k] * DISMISS.refund;
  }
  for (const r of Object.keys(out)) out[r] = Math.floor(out[r]);
  return out;
}

export function doDismiss(s, units) {
  const err = checkDismiss(s, units);
  if (err) throw new GameError(err);
  const refund = dismissRefund(units);
  for (const k of Object.keys(units)) {
    s.units[k] = (s.units[k] || 0) - units[k];
    if (s.units[k] <= 0) delete s.units[k];
  }
  addRes(s, refund);
  return refund;
}

// edelmannen die je hebt: thuis, in opleiding, in je gebied en (via awayNobles) onderweg of elders
export function noblesOwned(s, awayNobles = 0) {
  let n = (s.units.noble || 0) + awayNobles;
  for (const it of s.queues.court || []) n += it.n - it.done;
  for (const g of s.field || []) n += g.units.noble || 0;
  return n;
}
export const noblesMax = (s) => bLevel(s, 'court');

export function checkTrain(s, unit, n, awayPop = 0, awayNobles = 0) {
  const u = UNITS[unit];
  if (!u || u.wild || !u.building) return 'Onbekende eenheid.';
  if (u.civ && u.civ !== s.civ) return 'Dit is een eenheid van een ander volk.';
  if (!Number.isInteger(n) || n < 1 || n > 500) return 'Ongeldig aantal.';
  if (u.queue === 'castle' && bLevel(s, 'tc') < u.bl) return `Vereist een kasteel: breng je stadscentrum naar het ${AGES[CASTLE_LEVEL].name}.`;
  if (age(s) < u.age) return 'Vereist een later tijdperk.';
  const lvl = bLevel(s, u.building);
  if (lvl < u.bl) return `Vereist ${BUILDINGS[u.building].name} niveau ${u.bl}.`;
  if (unit === 'villager' && s.builds.some((j) => j.bid === 1)) return 'Het stadscentrum wordt verbeterd.';
  if ((s.queues[u.queue || u.building] || []).length >= 8) return 'De wachtrij is vol.';
  if (u.noble) {
    if ((s.queues.court || []).length) return 'Er wordt al een edelman opgeleid.';
    if (n > 1) return 'Je leidt één edelman tegelijk op.';
    if (noblesOwned(s, awayNobles) + n > noblesMax(s)) return `Je mag ${noblesMax(s)} edelman${noblesMax(s) > 1 ? 'nen' : ''} hebben: verbeter je Adelshof.`;
  }
  if (homePop(s) + awayPop + n * u.pop > popCap(s)) return 'Niet genoeg bevolkingsruimte. Bouw huizen!';
  if (!canAfford(s.res, u.cost, n)) return 'Niet genoeg grondstoffen.';
  return null;
}

export function doTrain(s, unit, n, now, speed, awayPop = 0, awayNobles = 0) {
  const err = checkTrain(s, unit, n, awayPop, awayNobles);
  if (err) throw new GameError(err);
  const u = UNITS[unit];
  pay(s.res, u.cost, n);
  const key = u.queue || u.building; // eenheden van je volk hebben een eigen wachtrij in het kasteel
  if (!s.queues[key]) s.queues[key] = [];
  const q = s.queues[key];
  const lvl = u.queue === 'castle' ? bLevel(s, 'tc') - CASTLE_LEVEL + 1 : bLevel(s, u.building);
  const dur = unitTime(unit, lvl, speed);
  q.push({ unit, n, done: 0, dur, start: q.length ? null : now });
}

export function doAssign(s, alloc, rally) {
  const sl = slots(s);
  const total = homeVillagers(s);
  let sum = 0;
  const next = {};
  for (const r of JOBS) {
    // vissers: wie ze niet meegeeft (oudere browser, bots), houdt ze zoals ze waren
    const v = alloc[r] === undefined && r === 'fish' ? Math.min(s.villagers.fish || 0, sl.fish) : alloc[r];
    if (!Number.isInteger(v) || v < 0) throw new GameError('Ongeldige verdeling.');
    if (v > sl[r]) throw new GameError(r === 'fish' ? 'Te weinig plaats op je bootjes.' : `Te weinig werkplekken voor ${r}.`);
    next[r] = v;
    sum += v;
  }
  if (sum > total) throw new GameError('Zoveel dorpelingen heb je niet.');
  for (const r of JOBS) s.villagers[r] = next[r];
  s.villagers.idle = total - sum;
  if (rally && (rally === 'auto' || JOBS.includes(rally))) s.rally = rally;
}

export function marketRate(s) {
  const L = bLevel(s, 'market');
  return L ? MARKET.rate + MARKET.ratePerLevel * (L - 1) : 0;
}

export function doTrade(s, give, get, amount) {
  if (!RES.includes(give) || !RES.includes(get) || give === get) throw new GameError('Ongeldige ruil.');
  const rate = marketRate(s);
  if (!rate) throw new GameError('Je hebt een markt nodig.');
  if (!Number.isInteger(amount) || amount < 10) throw new GameError('Ruil minstens 10.');
  if (s.res[give] < amount) throw new GameError('Niet genoeg grondstoffen.');
  s.res[give] -= amount;
  s.res[get] = Math.min(Math.max(capacity(s), s.res[get]), s.res[get] + Math.floor(amount * rate));
}

export function addResources(s, res) {
  // binnenkomende grondstoffen mogen de opslag niet overschrijden (wat te veel is, gaat verloren)
  const cap = capacity(s);
  for (const r of RES) {
    const add = res[r] || 0;
    if (add > 0) s.res[r] = Math.max(s.res[r], Math.min(cap, s.res[r] + add));
  }
}

export function addUnits(s, units) {
  for (const k of Object.keys(units || {})) if (units[k] > 0) s.units[k] = (s.units[k] || 0) + units[k];
}

// ---------- Academie: onderzoek ----------

export const techDone = (s, id) => !!(s.tech && s.tech[id]);

export function checkResearch(s, id) {
  const T = TECHS[id];
  if (!T) return 'Onbekend onderzoek.';
  if (techDone(s, id)) return 'Dit heb je al onderzocht.';
  const L = bLevel(s, 'academy');
  if (!L) return 'Bouw eerst een Academie.';
  if (s.research) return 'Er loopt al een onderzoek.';
  if (s.builds.some((j) => s.buildings.find((b) => b.id === j.bid && b.type === 'academy'))) return 'De Academie wordt verbouwd.';
  if (L < T.row) return `Vereist Academie niveau ${T.row} (${AGES[levelAge('academy', T.row)].name}).`;
  if (T.row > 1) {
    const prev = TECH_IDS.find((k) => TECHS[k].line === T.line && TECHS[k].row === T.row - 1);
    if (!techDone(s, prev)) return `Onderzoek eerst ${TECHS[prev].name}.`;
  }
  if (tooBig(s, T.cost)) return 'Je opslag is te klein hiervoor: bouw of verbeter een opslagplaats.';
  if (!canAfford(s.res, T.cost)) return 'Niet genoeg grondstoffen.';
  return null;
}

export const researchTime = (id, speed = 1) => Math.max(5000, Math.round((TECHS[id].time * 1000) / speed));

export function doResearch(s, id, now, speed) {
  const err = checkResearch(s, id);
  if (err) throw new GameError(err);
  pay(s.res, TECHS[id].cost);
  s.research = { id, start: now, end: now + researchTime(id, speed) };
}

function finishResearch(s) {
  if (!s.tech) s.tech = {};
  s.tech[s.research.id] = 1;
  s.research = null;
}

export function townScore(s) {
  let pts = 10;
  for (const id of Object.keys(s.tech || {})) if (TECHS[id]) pts += costValue(TECHS[id].cost) / 50;
  for (const b of s.buildings) {
    for (let L = 1; L <= b.level; L++) {
      if (b.type === 'tc') { if (L >= 2) pts += costValue(AGE_UP[L].cost) / 50; }
      else pts += costValue(levelCost(b.type, L)) / 50;
      if (BUILDINGS[b.type].score) pts += BUILDINGS[b.type].score;
    }
  }
  pts += totalVillagers(s) * 2;
  pts += unitValue(s.units) / 100;
  return Math.round(pts);
}

// Lichte versie van advance() voor overzichten van veel steden (wereldkaart, ranglijst): enkel de bouwwerken die al klaar
// zijn, toepassen. Geen productie, training of gebeurtenissen in het gebied (dat kost veel rekentijd per stad).
export function settleBuilds(s, t) {
  const done = (s.builds || []).filter((j) => j.end <= t).sort((a, b) => a.end - b.end);
  for (const j of done) finishBuild(s, j);
  return s;
}

export function publicSummary(s) {
  return {
    age: age(s),
    buildings: s.buildings.filter((b) => b.level > 0 && isPlaced(b)).length,
    wall: bLevel(s, 'wall'),
    monument: bLevel(s, 'monument'),
    score: townScore(s),
    loyalty: Math.floor(loyalty(s)),
    shield: s.loyShield && s.loyShield > s.t ? s.loyShield : 0,
    vassal: isVassal(s) ? { lord: s.vas.lord, lname: s.vas.lname, ltown: s.vas.ltown, until: s.vas.until } : null,
  };
}
