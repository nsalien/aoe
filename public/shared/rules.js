// Spelregels van "Rijken van de Vallei".
// Dit bestand wordt gedeeld door de server (Pages Functions) en de browser,
// zodat beide exact dezelfde berekeningen maken. Pas hier de balans aan.

export const RES = ['food', 'wood', 'stone', 'gold'];
export const RES_NAMES = { food: 'Voedsel', wood: 'Hout', stone: 'Steen', gold: 'Goud' };

// Productie per dorpeling per uur (bij snelheid 1).
export const GATHER_RATE = { food: 16, wood: 16, stone: 11, gold: 11 };

export const START = {
  res: { food: 300, wood: 300, stone: 150, gold: 100 },
  villagers: { idle: 0, food: 3, wood: 3, stone: 0, gold: 0 },
};

export const TOWN_GRID = 12; // bouwgebied is 12 x 12 tegels
export const TC_POS = { x: 5, y: 5 }; // stadscentrum (2x2) in het midden

export const AGES = [
  null,
  { name: 'Tijdperk van de Vuursteen', short: 'Vuursteen' },
  { name: 'Tijdperk van het Brons', short: 'Brons' },
  { name: 'Tijdperk van het IJzer', short: 'IJzer' },
  { name: 'Tijdperk van de Kroon', short: 'Kroon' },
];

// Kosten en bouwtijd (seconden bij snelheid 1) om het stadscentrum naar dat tijdperk te brengen.
export const AGE_UP = {
  2: { cost: { food: 1200, wood: 1000, gold: 300 }, time: 2 * 3600 },
  3: { cost: { food: 6000, wood: 5000, stone: 2500, gold: 3000 }, time: 12 * 3600 },
  4: { cost: { food: 18000, wood: 15000, stone: 10000, gold: 12000 }, time: 36 * 3600 },
};

// Gebouwen. cost/time gelden voor niveau 1; hogere niveaus schalen met growth/timeGrowth.
export const BUILDINGS = {
  tc: {
    name: 'Stadscentrum', size: 2, max: 1, maxLevel: 4, age: 1, placeable: false,
    desc: 'Het hart van je rijk. Train dorpelingen en breng je volk naar een nieuw tijdperk.',
  },
  house: {
    name: 'Huis', size: 1, max: 14, maxLevel: 3, age: 1, cost: { wood: 50 }, time: 180,
    pop: 5, desc: '+5 bevolking per niveau.',
  },
  farm: {
    name: 'Boerderij', size: 1, max: 10, maxLevel: 3, age: 1, cost: { wood: 75 }, time: 300,
    slots: { food: 4 }, desc: 'Werk voor 4 boeren per niveau.',
  },
  lumber: {
    name: 'Houthakkerskamp', size: 1, max: 4, maxLevel: 3, age: 1, cost: { wood: 100 }, time: 300,
    slots: { wood: 5 }, desc: 'Werk voor 5 houthakkers per niveau.',
  },
  quarry: {
    name: 'Steengroeve', size: 1, max: 4, maxLevel: 3, age: 1, cost: { wood: 100, food: 50 }, time: 360,
    slots: { stone: 4 }, desc: 'Werk voor 4 steenhouwers per niveau.',
  },
  goldmine: {
    name: 'Goudmijn', size: 1, max: 4, maxLevel: 3, age: 1, cost: { wood: 100, food: 50 }, time: 360,
    slots: { gold: 4 }, desc: 'Werk voor 4 goudzoekers per niveau.',
  },
  storage: {
    name: 'Opslagplaats', size: 1, max: 2, maxLevel: 3, age: 1, cost: { wood: 150 }, time: 600,
    storage: 4000, protect: 500, desc: '+4000 opslag per niveau en verbergt 500 per niveau voor plunderaars.',
  },
  barracks: {
    name: 'Kazerne', size: 1, max: 1, maxLevel: 3, age: 1, cost: { wood: 150, stone: 50 }, time: 900,
    trains: true, desc: 'Train voetvolk. Elk niveau traint 15% sneller.',
  },
  wall: {
    name: 'Stadsmuur', size: 0, max: 1, maxLevel: 5, age: 1, cost: { wood: 120, stone: 80 }, time: 1200,
    placeable: false, desc: '+30 verdediging en +8% verdedigingsbonus per niveau. Rammen beschadigen de muur.',
  },
  range: {
    name: 'Schietbaan', size: 1, max: 1, maxLevel: 3, age: 2, cost: { wood: 200, gold: 60 }, time: 1500,
    trains: true, desc: 'Train boogschutters.',
  },
  stable: {
    name: 'Stal', size: 1, max: 1, maxLevel: 3, age: 2, cost: { wood: 200, food: 120, gold: 60 }, time: 1800,
    trains: true, desc: 'Train verkenners, ruiters en ridders.',
  },
  smithy: {
    name: 'Smidse', size: 1, max: 1, maxLevel: 5, age: 2, cost: { wood: 150, stone: 100, gold: 100 }, time: 1800,
    desc: '+5% aanval en verdediging per niveau voor al je troepen.',
  },
  market: {
    name: 'Markt', size: 1, max: 1, maxLevel: 3, age: 2, cost: { wood: 250, stone: 50 }, time: 1800,
    desc: 'Ruil grondstoffen en stuur karavanen naar bondgenoten.',
  },
  tower: {
    name: 'Wachttoren', size: 1, max: 4, maxLevel: 3, age: 2, cost: { stone: 250, wood: 80 }, time: 2400,
    defense: 80, desc: '+80 verdediging per niveau.',
  },
  workshop: {
    name: 'Belegwerkplaats', size: 1, max: 1, maxLevel: 2, age: 3, cost: { wood: 350, gold: 200, stone: 100 }, time: 3600,
    trains: true, desc: 'Bouw stormrammen om muren en monumenten te slopen.',
  },
  monument: {
    name: 'Monument', size: 2, max: 1, maxLevel: 5, age: 4, cost: { food: 6000, wood: 6000, stone: 8000, gold: 8000 },
    time: 8 * 3600, growth: 1.35, score: 1500,
    desc: 'Een wereldwonder. Elk niveau levert 1500 extra punten op. Rammen kunnen het beschadigen!',
  },
};

export const BUILD_ORDER = ['house', 'farm', 'lumber', 'quarry', 'goldmine', 'storage', 'barracks', 'range',
  'stable', 'smithy', 'market', 'tower', 'workshop', 'monument'];

export const TC_SLOTS = { food: 5, wood: 5, stone: 2, gold: 2 };
export const TC_POP_PER_AGE = 10;
export const TC_STORAGE_PER_AGE = 3000;
export const BASE_PROTECT = 300;

// Eenheden. def = verdediging tegen voetvolk (inf), ruiterij (cav) en schutters (rng).
export const UNITS = {
  villager: { name: 'Dorpeling', building: 'tc', bl: 1, age: 1, cost: { food: 50 }, time: 120, pop: 1 },
  spear: {
    name: 'Speerdrager', type: 'inf', building: 'barracks', bl: 1, age: 1, cost: { food: 40, wood: 25 }, time: 150,
    atk: 12, def: { inf: 20, cav: 45, rng: 18 }, speed: 9, carry: 40, pop: 1,
    desc: 'Goedkoop en sterk in de verdediging tegen ruiters.',
  },
  sword: {
    name: 'Zwaardvechter', type: 'inf', building: 'barracks', bl: 2, age: 2, cost: { food: 60, gold: 30 }, time: 220,
    atk: 32, def: { inf: 28, cav: 18, rng: 22 }, speed: 8, carry: 50, pop: 1,
    desc: 'Stevige aanvaller te voet.',
  },
  archer: {
    name: 'Boogschutter', type: 'rng', building: 'range', bl: 1, age: 2, cost: { wood: 50, gold: 35 }, time: 240,
    atk: 26, def: { inf: 32, cav: 12, rng: 40 }, speed: 9, carry: 30, pop: 1,
    desc: 'Verdedigt goed tegen voetvolk en schutters.',
  },
  scout: {
    name: 'Verkenner', type: 'cav', building: 'stable', bl: 1, age: 2, cost: { food: 70 }, time: 180,
    atk: 0, def: { inf: 4, cav: 4, rng: 4 }, speed: 24, carry: 0, pop: 1, scout: true,
    desc: 'Bespioneert vijanden. Verkenners van de verdediger vangen de jouwe.',
  },
  rider: {
    name: 'Ruiter', type: 'cav', building: 'stable', bl: 1, age: 2, cost: { food: 90, gold: 50 }, time: 300,
    atk: 45, def: { inf: 18, cav: 28, rng: 22 }, speed: 16, carry: 100, pop: 2,
    desc: 'Snel, draagt veel buit.',
  },
  knight: {
    name: 'Ridder', type: 'cav', building: 'stable', bl: 2, age: 3, cost: { food: 140, gold: 110 }, time: 480,
    atk: 70, def: { inf: 50, cav: 45, rng: 35 }, speed: 13, carry: 80, pop: 2,
    desc: 'Zwaar gepantserde elite.',
  },
  ram: {
    name: 'Stormram', type: 'inf', building: 'workshop', bl: 1, age: 3, cost: { wood: 220, gold: 100 }, time: 720,
    atk: 35, def: { inf: 20, cav: 10, rng: 60 }, speed: 5, carry: 0, pop: 3, siege: true,
    desc: 'Traag, maar beschadigt muren en monumenten na een gewonnen gevecht.',
  },
};

export const ARMY_UNITS = ['spear', 'sword', 'archer', 'scout', 'rider', 'knight', 'ram'];

export const COMBAT = {
  smithyBonus: 0.05,
  wallFlat: 30,
  wallBonus: 0.08,
  villagerDef: 3,
  ageDef: 50,
  lossExponent: 1.5,
  ramsPerWallLevel: 6, // overlevende rammen per niveau schade
  maxWallDamage: 2,
};

export const CAMP = {
  respawnHours: 8,
  levels: [1, 2, 3, 4, 5],
};

export const TEAM_NAMES = ['Huis van de Eik', 'Wolvenclan', 'Orde van de Valk', 'Bergkoningen',
  'Hertenbond', 'Rozenwacht', 'IJzeren Beer', 'Zonen van de Zee'];
export const TEAM_COLORS = ['#d64545', '#3f7fd9', '#3fae5a', '#e0b020', '#9455d1', '#e07a2a', '#2cb5b0', '#d6589a'];
export const MAX_TEAMS = 8;

export const WORLD_SIZE = 56;
export const CAMP_EXTRA = 12; // naast de 3 kampen rond elk startgebied

export const MARKET = { rate: 0.6, ratePerLevel: 0.07, shipPerLevel: 1000, merchantSpeed: 12 };

// ---------- hulpfuncties ----------

const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

export function levelCost(type, level) {
  if (type === 'tc') return AGE_UP[level] ? { ...AGE_UP[level].cost } : null;
  const b = BUILDINGS[type];
  const g = b.growth || 1.7;
  const out = {};
  for (const r of RES) if (b.cost[r]) out[r] = round5(b.cost[r] * Math.pow(g, level - 1));
  return out;
}

// bouwduur in ms
export function levelTime(type, level, speed = 1) {
  const base = type === 'tc' ? AGE_UP[level].time : BUILDINGS[type].time * Math.pow(1.6, level - 1);
  return Math.max(5000, Math.round((base * 1000) / speed));
}

// welk tijdperk is nodig om een gebouw naar dit niveau te brengen
export function levelAge(type, level) {
  const b = BUILDINGS[type];
  if (type === 'tc') return level - 1;
  return Math.max(b.age, Math.min(4, level));
}

export function unitTime(unit, buildingLevel, speed = 1) {
  const u = UNITS[unit];
  const f = Math.pow(0.85, Math.max(0, buildingLevel - 1));
  return Math.max(1000, Math.round((u.time * f * 1000) / speed));
}

export function costValue(cost) {
  let v = 0;
  for (const r of RES) v += cost[r] || 0;
  return v;
}

export function unitValue(units) {
  let v = 0;
  for (const k of Object.keys(units || {})) if (UNITS[k]) v += costValue(UNITS[k].cost) * (units[k] || 0);
  return v;
}

export function campUnits(level) {
  const L = level;
  const u = { spear: Math.round(4 * Math.pow(L, 1.7)) };
  if (L >= 2) u.archer = Math.round(3 * Math.pow(L, 1.7));
  if (L >= 3) u.sword = Math.round(3 * Math.pow(L, 1.6));
  if (L >= 4) u.knight = Math.round(2 * Math.pow(L, 1.5));
  if (L >= 2) u.scout = 2 * L;
  return u;
}

export function campLoot(level) {
  const v = Math.round(350 * Math.pow(level, 1.6));
  return { food: v, wood: v, stone: v, gold: v };
}

export function campBaseDef(level) {
  return 20 * level;
}

export function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${p2(h)}u`;
  if (h > 0) return `${h}u ${p2(m)}m`;
  return `${m}:${p2(sec)}`;
}
