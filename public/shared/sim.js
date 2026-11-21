// Simulatie van één stad. Pure functies op een "state"-object (JSON), gedeeld
// tussen server en browser. De server bewaart de state; de browser gebruikt
// dezelfde code om grondstoffen en timers vloeiend te laten doortellen.
import {
  RES, BUILDINGS, UNITS, START, TOWN_GRID, TC_POS, GATHER_RATE, TC_SLOTS, TC_POP_PER_AGE,
  TC_STORAGE_PER_AGE, BASE_PROTECT, AGE_UP, MARKET, BONUS, FIELD, WILD, COMBAT, ARMY_UNITS, CIVS, CIV_IDS, CASTLE_LEVEL, AGES,
  LAND, landCost, WALL_TILE,
  levelCost, levelTime, levelAge, unitTime, costValue, unitValue,
} from './rules.js';
import {
  territory, ringOf, ringForAge, tileIndex, inTerr, T_MIN, T_MAX, TILE, exDecode, exEncode, revealCircle, revealSegment,
} from './territory.js';
import { resolveBattle, computeLoot, carryCapacity } from './battle.js';
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
export const totalVillagers = (s) => RES.reduce((a, r) => a + s.villagers[r], s.villagers.idle) + harvesting(s) + fieldVillagers(s);
// dorpelingen die nu thuis zijn en verdeeld kunnen worden
export const homeVillagers = (s) => totalVillagers(s) - harvesting(s) - fieldVillagers(s);

export function slots(s) {
  const out = { ...TC_SLOTS };
  for (const b of s.buildings) {
    const sl = BUILDINGS[b.type].slots;
    if (sl && b.level > 0) for (const r of Object.keys(sl)) out[r] += sl[r] * b.level;
  }
  return out;
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

export function rates(s, speed = 1) {
  const mult = (1 + 0.1 * (age(s) - 1)) * speed;
  const out = {};
  for (const r of RES) out[r] = s.villagers[r] * GATHER_RATE[r] * mult;
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
  return age(s) >= 3 ? 3 : 2;
}

function accrue(s, t, speed) {
  const dt = (t - s.t) / 3600000;
  if (dt <= 0) return;
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
  const order = s.rally && s.rally !== 'auto' ? [s.rally] : ['food', 'wood', 'gold', 'stone'];
  for (const r of order) {
    if (s.villagers[r] < sl[r]) { s.villagers[r]++; return; }
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
  if (hv.job !== 'idle' && s.villagers[hv.job] < slots(s)[hv.job]) s.villagers[hv.job]++;
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
  else if (RES.includes(job) && s.villagers[job] > 0) from = job;
  else if (s.villagers.idle > 0) from = 'idle';
  else {
    from = RES.reduce((best, r) => (s.villagers[r] > (best ? s.villagers[best] : 0) ? r : best), null);
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
    if (s.terr.camp.next == null) s.terr.camp.next = s.t + Math.round((WILD.raid.firstHours * 3600000) / speed);
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
    if (next > t) break;
    accrue(s, next, speed);
    if (wild) applyWildEvent(s, wild, speed);
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
  // steden van voor de volkeren krijgen een willekeurig (maar vast) volk
  if (!CIVS[s.civ]) s.civ = CIV_IDS[(Math.imul(seed | 0, 2654435761) >>> 0) % CIV_IDS.length];
  if (!s.field) s.field = [];
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

// ---------- muren, tegel per tegel ----------
export const wallSet = (s) => new Set(s.walls || []);

// tegels die door het stadscentrum tot aan de rand van de bouwgrond+marge lopen zonder muur: is je stad dicht?
export function wallEnclosed(s) {
  const walls = wallSet(s);
  if (!walls.size) return false;
  const k = ringForAge(age(s));
  const lim = k + 6;
  const start = [TC_POS.x, TC_POS.y];
  const seen = new Set([start.join(',')]);
  const q = [start];
  while (q.length) {
    const [i, j] = q.pop();
    if (ringOf(i, j) >= lim) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx; const nj = j + dy; const key = `${ni},${nj}`;
      if (seen.has(key) || (inTerr(ni, nj) && walls.has(tileIndex(ni, nj)))) continue;
      seen.add(key); q.push([ni, nj]);
    }
  }
  return true;
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
  return null;
}

export function doPlaceWalls(s, tiles) {
  const err = checkPlaceWalls(s, tiles);
  if (err) throw new GameError(err);
  pay(s.res, WALL_TILE.cost[bLevel(s, 'wall')], tiles.length);
  if (!s.walls) s.walls = [];
  for (const [i, j] of tiles) s.walls.push(tileIndex(i, j));
}

export function doRemoveWalls(s, tiles) {
  const rm = new Set((tiles || []).filter((t) => Array.isArray(t) && inTerr(t[0], t[1])).map(([i, j]) => tileIndex(i, j)));
  if (!rm.size) throw new GameError('Kies welke muur weg moet.');
  s.walls = (s.walls || []).filter((x) => !rm.has(x));
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

// wat is er nu ontdekt (inclusief wat lopende eenheden onderweg al zagen)
export function exploredNow(s, now) {
  const b = exDecode(s.terr ? s.terr.ex : '');
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
export const campSize = (s) => 2 + 2 * age(s) + Math.min(3, Math.floor(s.terr.camp.raids / 3)) - (s.terr.camp.loss || 0);
export const raidSize = (s) => Math.min(40, Math.round(3 + age(s) * 2.5 + s.terr.camp.raids * 1.2));
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
  if (s.terr.camp.next != null) take(s.terr.camp.next, { kind: 'raid' });
  return ev;
}

function applyWildEvent(s, ev, speed) {
  if (ev.kind === 'arrive') fieldArrive(s, ev.g, ev.t, speed);
  else if (ev.kind === 'ambush') ambush(s, ev.g, ev.t);
  else if (ev.kind === 'fight') finishFight(s, ev.f, ev.t, speed);
  else if (ev.kind === 'chopped') chopDone(s, ev.g, ev.t);
  else if (ev.kind === 'depleted') depleted(s, ev.id, ev.t);
  else if (ev.kind === 'raid') barbarianRaid(s, ev.t, speed);
}

function setPath(g, from, to, t) {
  const sp = groupSpeed(g);
  g.x0 = from.x; g.y0 = from.y; g.x1 = to.x; g.y1 = to.y;
  g.t0 = t;
  g.t1 = t + Math.max(300, Math.round((Math.hypot(to.x - from.x, to.y - from.y) / sp) * 1000));
  g.pending = true;
}

function goHome(s, g, t) {
  const d = tcDoor();
  g.order = { type: 'home' };
  g.work = null;
  setPath(g, { x: g.x1, y: g.y1 }, { x: d.gx, y: d.gy }, t);
}

function disband(s, g) {
  for (const k of Object.keys(g.units)) {
    const n = g.units[k];
    if (!n) continue;
    if (k === 'villager') {
      for (let i = 0; i < n; i++) {
        if (g.job && g.job !== 'idle' && s.villagers[g.job] < slots(s)[g.job]) s.villagers[g.job]++;
        else s.villagers.idle++;
      }
    } else s.units[k] = (s.units[k] || 0) + n;
  }
  s.field = s.field.filter((x) => x !== g);
}

function fieldArrive(s, g, t, speed) {
  withEx(s, (b) => revealSegment(b, g.x0, g.y0, g.x1, g.y1, groupVision(g)));
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
  g.pending = false; g.order = null; g.work = null;
  engage(s, g, { type: 'camp', id: 0 }, t);
}

const foeSide = (s, foe) => (foe.type === 'boar' ? combatants({ boar: 1 }) : combatants({ barbarian: Math.max(1, campSize(s)) }));

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
    f = { id: terr.fid, foe, t0: t, a: mine, b: foeSide(s, foe), ma: 1 + COMBAT.smithyBonus * bLevel(s, 'smithy') };
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
    c.down = t + Math.round((WILD.camp.respawnHours * 3600000) / speed);
    c.loss = 0;
    if (c.next < c.down) c.next = c.down + Math.round(((WILD.raid.minHours * 3600000) / speed) / 2);
    const loot = scaleRes(WILD.camp.loot, ageMult(s));
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

function barbarianRaid(s, t, speed) {
  const c = s.terr.camp;
  const iv = Math.round(((WILD.raid.minHours + (WILD.raid.maxHours - WILD.raid.minHours) * wildRand(s, 100 + c.raids)) * 3600000) / speed);
  if (!campAlive(s, t)) { c.next = c.down + iv; return; }
  const n = raidSize(s);
  c.raids++;
  c.next = t + iv;
  const r = resolveBattle({
    attUnits: { barbarian: n }, groups: [{ key: 'home', units: { ...s.units } }], defSmithy: bLevel(s, 'smithy'),
    wall: effectiveWall(s), towerDef: towerDefense(s), baseDef: townBaseDef(s),
  });
  s.units = {};
  for (const [k, v] of Object.entries(r.groupsLeft[0].units)) if (v > 0) s.units[k] = v;
  if (r.attWins) {
    const prot = protectAmount(s);
    const avail = {};
    for (const k of RES) avail[k] = Math.max(0, s.res[k] - prot);
    const loot = computeLoot(avail, (r.attLeft.barbarian || 0) * WILD.raid.carry);
    for (const k of RES) s.res[k] -= loot[k];
    pushLog(s, t, 'raid-lost', `${n} barbaren overvielen je stad en stalen ${resText(loot) || 'niets'}. Verwoest hun kamp of bouw je verdediging uit!`);
  } else {
    pushLog(s, t, 'raid-won', `Je stad sloeg een overval van ${n} barbaren af!`);
  }
}

// ---------- acties in het veld ----------

function clampToTerr(x, y) {
  return { x: Math.min(T_MAX - 0.6, Math.max(T_MIN + 0.6, x)), y: Math.min(T_MAX - 0.6, Math.max(T_MIN + 0.6, y)) };
}

// Stuur een eenheid (of groep) vanuit de stad het veld in.
// spec = { villager: 'wood' } (een dorpeling van die taak) of { units: { spear: 3 } }
export function doFieldSend(s, spec, from, to, target, now) {
  if (!s.terr) throw new GameError('Je gebied is nog niet klaar.');
  if (s.field.length >= FIELD.maxGroups) throw new GameError(`Je hebt al ${FIELD.maxGroups} groepen op pad.`);
  const units = {};
  let job = null;
  if (spec && spec.villager !== undefined) {
    job = spec.villager;
    if (job === 'idle' ? s.villagers.idle < 1 : !(RES.includes(job) && s.villagers[job] > 0)) {
      job = s.villagers.idle > 0 ? 'idle' : RES.reduce((b, r) => (s.villagers[r] > (b ? s.villagers[b] : 0) ? r : b), null);
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
  doFieldOrder(s, g.id, to, target, now);
  return g;
}

// Een deel van een groep apart een opdracht geven (bv. 1 soldaat aanklikken in een groep van 8).
// units = { soort: aantal } die meegaan; is dat de hele groep, dan krijgt gewoon de hele groep de opdracht.
export function doFieldSplit(s, id, units, to, target, now) {
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
  if (all) return doFieldOrder(s, id, to, target, now);
  if (s.field.length >= FIELD.maxGroups) throw new GameError(`Je hebt al ${FIELD.maxGroups} groepen op pad.`);
  let part;
  if (g.fight) {
    part = splitFromFight(s, g, take, now);
    if (!part) return doFieldSplit(s, id, units, to, target, now);
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
  doFieldOrder(s, ng.id, to, target, now);
  return ng;
}

// Geef een groep in het veld een nieuwe opdracht: lopen, aanvallen, verzamelen, kappen of naar huis.
export function doFieldOrder(s, id, to, target, now) {
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
  setPath(g, pos, dest, now);
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

export function canPlaceAt(s, type, x, y) {
  const size = BUILDINGS[type].size;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const cl = clearedSet(s);
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (!isBuildable(s, x + dx, y + dy, cl)) return false;
  const grid = occupied(s);
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (grid.has(`${x + dx},${y + dy}`)) return false;
  if ((s.walls || []).length) {
    const walls = wallSet(s);
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (walls.has(tileIndex(x + dx, y + dy))) return false;
  }
  return true;
}

// ---------- acties (geven een foutmelding terug of null) ----------

export function checkBuild(s, type) {
  const def = BUILDINGS[type];
  if (!def || def.placeable === false) return 'Onbekend gebouw.';
  if (age(s) < def.age) return `Vereist het ${['', 'eerste', 'tweede', 'derde', 'vierde'][def.age]} tijdperk.`;
  if (findType(s, type).length >= def.max) return `Je hebt al het maximum (${def.max}) van dit gebouw.`;
  if (s.builds.length >= maxBuilds(s)) return 'Al je bouwers zijn bezig.';
  if (tooBig(s, levelCost(type, 1))) return 'Je opslag is te klein hiervoor: bouw of verbeter een opslagplaats.';
  if (!canAfford(s.res, levelCost(type, 1))) return 'Niet genoeg grondstoffen.';
  return null;
}

export function doBuild(s, type, x, y, now, speed) {
  const err = checkBuild(s, type);
  if (err) throw new GameError(err);
  if (!canPlaceAt(s, type, x, y)) throw new GameError('Daar kan je niet bouwen.');
  pay(s.res, levelCost(type, 1));
  const b = { id: s.nextId++, type, x, y, level: 0 };
  s.buildings.push(b);
  s.builds.push({ bid: b.id, to: 1, start: now, end: now + levelTime(type, 1, speed) });
  return b;
}

export function checkUpgrade(s, bid) {
  const b = s.buildings.find((x) => x.id === bid);
  if (!b) return 'Gebouw niet gevonden.';
  const def = BUILDINGS[b.type];
  if (s.builds.some((j) => j.bid === bid)) return 'Er wordt al aan gewerkt.';
  if (b.level >= def.maxLevel) return 'Maximaal niveau bereikt.';
  const to = b.level + 1;
  if (age(s) < levelAge(b.type, to)) return `Vereist het ${['', 'eerste', 'tweede', 'derde', 'vierde'][levelAge(b.type, to)]} tijdperk.`;
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
  s.builds.push({ bid, to, start: now, end: now + levelTime(b.type, to, speed) });
}

export function checkTrain(s, unit, n, awayPop = 0) {
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
  if (homePop(s) + awayPop + n * u.pop > popCap(s)) return 'Niet genoeg bevolkingsruimte. Bouw huizen!';
  if (!canAfford(s.res, u.cost, n)) return 'Niet genoeg grondstoffen.';
  return null;
}

export function doTrain(s, unit, n, now, speed, awayPop = 0) {
  const err = checkTrain(s, unit, n, awayPop);
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
  for (const r of RES) {
    const v = alloc[r];
    if (!Number.isInteger(v) || v < 0) throw new GameError('Ongeldige verdeling.');
    if (v > sl[r]) throw new GameError(`Te weinig werkplekken voor ${r}.`);
    next[r] = v;
    sum += v;
  }
  if (sum > total) throw new GameError('Zoveel dorpelingen heb je niet.');
  for (const r of RES) s.villagers[r] = next[r];
  s.villagers.idle = total - sum;
  if (rally && (rally === 'auto' || RES.includes(rally))) s.rally = rally;
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

export function townScore(s) {
  let pts = 10;
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

export function publicSummary(s) {
  return {
    age: age(s),
    buildings: s.buildings.filter((b) => b.level > 0 && isPlaced(b)).length,
    wall: bLevel(s, 'wall'),
    monument: bLevel(s, 'monument'),
    score: townScore(s),
  };
}
