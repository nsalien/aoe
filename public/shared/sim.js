// Simulatie van één stad. Pure functies op een "state"-object (JSON), gedeeld
// tussen server en browser. De server bewaart de state; de browser gebruikt
// dezelfde code om grondstoffen en timers vloeiend te laten doortellen.
import {
  RES, BUILDINGS, UNITS, START, TOWN_GRID, TC_POS, GATHER_RATE, TC_SLOTS, TC_POP_PER_AGE,
  TC_STORAGE_PER_AGE, BASE_PROTECT, AGE_UP, MARKET, BONUS, levelCost, levelTime, levelAge, unitTime, costValue, unitValue,
} from './rules.js';

export class GameError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export function newTownState(t) {
  return {
    t,
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
export const findType = (s, type) => s.buildings.filter((b) => b.type === type);
export const bLevel = (s, type) => findType(s, type).reduce((m, b) => Math.max(m, b.level), 0);
// dorpelingen die even een vondst gaan oogsten, tellen nog altijd mee
export const harvesting = (s) => (s.harvests ? s.harvests.length : 0);
export const totalVillagers = (s) => RES.reduce((a, r) => a + s.villagers[r], s.villagers.idle) + harvesting(s);

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
export const homePop = (s) => totalVillagers(s) + unitsPop(s.units) + queuedPop(s);

export function maxBuilds(s) {
  return age(s) >= 3 ? 3 : 2;
}

function accrue(s, t, speed) {
  const dt = (t - s.t) / 3600000;
  if (dt <= 0) return;
  const r = rates(s, speed);
  const cap = capacity(s);
  for (const k of RES) {
    const v = s.res[k];
    if (v < cap) s.res[k] = Math.min(cap, v + r[k] * dt);
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
  const N = TOWN_GRID; const mid = N / 2;
  for (let tr = 0; tr < 30; tr++) {
    const side = Math.floor(bonusRand(s, 10 + tr * 3) * 4);
    const along = -1.2 + bonusRand(s, 11 + tr * 3) * (N + 2.4);
    const off = 0.7 + bonusRand(s, 12 + tr * 3) * 1.1;
    if (Math.abs(along - mid) < 1.3) continue; // niet op de wegen
    let gx; let gy;
    if (side === 0) { gx = along; gy = -off; } else if (side === 1) { gx = N + off; gy = along; } else if (side === 2) { gx = along; gy = N + off; } else { gx = -off; gy = along; }
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
  for (let guard = 0; guard < 20000; guard++) {
    let next = Infinity;
    let job = null;
    let qkey = null;
    let hv = null;
    let spawn = false;
    for (const b of s.builds) if (b.end < next) { next = b.end; job = b; }
    for (const key of Object.keys(s.queues)) {
      const head = s.queues[key][0];
      if (!head) continue;
      const tt = head.start + (head.done + 1) * head.dur;
      if (tt < next) { next = tt; job = null; qkey = key; }
    }
    for (const h of s.harvests) if (h.end < next) { next = h.end; job = null; qkey = null; hv = h; }
    if (s.nextNode < next) { next = s.nextNode; job = null; qkey = null; hv = null; spawn = true; }
    if (next > t) break;
    accrue(s, next, speed);
    if (spawn) spawnBonus(s, next, speed);
    else if (hv) finishHarvest(s, hv);
    else if (job) finishBuild(s, job);
    else finishUnit(s, qkey);
  }
  accrue(s, t, speed);
  return s;
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
    if (b.x < 0 || b.id === ignoreId) continue;
    const size = BUILDINGS[b.type].size;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) grid.set(`${b.x + dx},${b.y + dy}`, b);
  }
  return grid;
}

export function canPlaceAt(s, type, x, y) {
  const size = BUILDINGS[type].size;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x + size > TOWN_GRID || y + size > TOWN_GRID) return false;
  const grid = occupied(s);
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (grid.has(`${x + dx},${y + dy}`)) return false;
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
  if (!u) return 'Onbekende eenheid.';
  if (!Number.isInteger(n) || n < 1 || n > 500) return 'Ongeldig aantal.';
  if (age(s) < u.age) return 'Vereist een later tijdperk.';
  const lvl = bLevel(s, u.building);
  if (lvl < u.bl) return `Vereist ${BUILDINGS[u.building].name} niveau ${u.bl}.`;
  if (unit === 'villager' && s.builds.some((j) => j.bid === 1)) return 'Het stadscentrum wordt verbeterd.';
  if ((s.queues[u.building] || []).length >= 8) return 'De wachtrij is vol.';
  if (homePop(s) + awayPop + n * u.pop > popCap(s)) return 'Niet genoeg bevolkingsruimte. Bouw huizen!';
  if (!canAfford(s.res, u.cost, n)) return 'Niet genoeg grondstoffen.';
  return null;
}

export function doTrain(s, unit, n, now, speed, awayPop = 0) {
  const err = checkTrain(s, unit, n, awayPop);
  if (err) throw new GameError(err);
  const u = UNITS[unit];
  pay(s.res, u.cost, n);
  const key = u.building;
  if (!s.queues[key]) s.queues[key] = [];
  const q = s.queues[key];
  const dur = unitTime(unit, bLevel(s, key), speed);
  q.push({ unit, n, done: 0, dur, start: q.length ? null : now });
}

export function doAssign(s, alloc, rally) {
  const sl = slots(s);
  const total = totalVillagers(s) - harvesting(s);
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
    buildings: s.buildings.filter((b) => b.level > 0 && b.x >= 0).length,
    wall: bLevel(s, 'wall'),
    monument: bLevel(s, 'monument'),
    score: townScore(s),
  };
}
