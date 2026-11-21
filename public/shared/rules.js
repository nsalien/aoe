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
    placeable: false, desc: 'Bepaalt hoe sterk je muren zijn. Plaats ze zelf, tegel per tegel. Een volledig gesloten muur verdedigt het best.',
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
    defense: 80, desc: 'Schiet tijdens een veldslag op de dichtstbijzijnde vijand. Elk niveau geeft meer schade en levens. Aanvallers kunnen hem slopen.',
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
  villager: {
    name: 'Dorpeling', building: 'tc', bl: 1, age: 1, cost: { food: 50 }, time: 120, pop: 1,
    type: 'inf', atk: 3, def: { inf: 6, cav: 4, rng: 5 }, carry: 10,
  },
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

// wilde tegenstanders in je eigen gebied (niet trainbaar)
UNITS.boar = { name: 'Everzwijn', type: 'inf', atk: 22, def: { inf: 10, cav: 8, rng: 8 }, carry: 0, pop: 0, cost: {}, wild: true };
UNITS.barbarian = { name: 'Barbaar', type: 'inf', atk: 15, def: { inf: 9, cav: 7, rng: 7 }, carry: 25, pop: 0, cost: {}, wild: true };

// ---------- grond bijkopen en muren ----------
// Grond koop je per lot van 4 x 4 tegels, aansluitend op je bouwgrond. Elk lot wordt duurder.
export const LAND = { size: 4, max: 12, cost: { wood: 250, food: 200, gold: 40 }, growth: 0.4 };
export const landCost = (n) => {
  const o = {};
  for (const r of Object.keys(LAND.cost)) o[r] = Math.round((LAND.cost[r] * (1 + LAND.growth * n)) / 5) * 5;
  return o;
};
// Muren plaats je tegel per tegel; hun sterkte en uitzicht volgen het niveau van de stadsmuur.
export const WALL_TILE = { cost: [null, { wood: 6 }, { wood: 8 }, { stone: 6, wood: 2 }, { stone: 8, wood: 2 }, { stone: 10, wood: 2 }], maxPerOrder: 60 };
// Torens in een veldslag: levenspunten en schade per niveau
export const TOWER = { hp: [0, 220, 320, 450], dmg: [0, 9, 13, 18], range: 6, rate: 2000 };

// ---------- volkeren ----------
// Elk volk heeft een eigen bouwstijl en twee eigen eenheden. Die train je in het kasteel: het stadscentrum
// vanaf het IJzertijdperk (niveau 3). Speciale eigenschappen (zie battle.js):
//   bonus { inf|cav|rng|unique: x }  extra aanval (en wat extra verdediging) tegen dat soort vijand
//   tough x    verliest x minder manschappen     defMult x  sterker als verdediger
//   walls n    telt als n stormrammen tegen muren  fear x  verlaagt de vijandelijke verdediging
export const CASTLE_LEVEL = 3;
export const CIVS = {
  egypt: {
    name: 'Egyptenaren', short: 'Egypte', color: '#d9a441', units: ['chariot', 'camel'],
    desc: 'Zandstenen tempels met platte daken, obelisken en palmen langs de Nijl.',
  },
  greek: {
    name: 'Grieken', short: 'Griekenland', color: '#3f7fd9', units: ['hoplite', 'peltast'],
    desc: 'Witte marmeren zuilen, frontons en rode pannendaken.',
  },
  yamato: {
    name: 'Yamato', short: 'Yamato', color: '#c0392b', units: ['samurai', 'yabusame'],
    desc: 'Pagodes met gebogen daken, donker hout en rode poorten.',
  },
  babylon: {
    name: 'Babyloniërs', short: 'Babylon', color: '#2b6cb0', units: ['lionguard', 'stonethrower'],
    desc: 'Blauw geglazuurde baksteen, gouden leeuwen en een trapvormige ziggurat.',
  },
  persia: {
    name: 'Perzen', short: 'Perzië', color: '#1fa3a3', units: ['elephant', 'immortal'],
    desc: 'Paleizen met turquoise koepels en sierlijke bogen.',
  },
};
export const CIV_IDS = Object.keys(CIVS);

const castle = (civ, o) => ({ building: 'tc', queue: 'castle', bl: CASTLE_LEVEL, age: CASTLE_LEVEL, civ, unique: true, ...o });
Object.assign(UNITS, {
  chariot: castle('egypt', {
    name: 'Strijdwagen', type: 'cav', cost: { wood: 90, gold: 75 }, time: 360, pop: 2,
    atk: 60, def: { inf: 32, cav: 30, rng: 40 }, speed: 18, carry: 90, bonus: { rng: 0.6 },
    desc: 'Razendsnel. Rijdt boogschutters omver: +60% aanval tegen schutters.',
  }),
  camel: castle('egypt', {
    name: 'Kamelenruiter', type: 'cav', cost: { food: 80, gold: 60 }, time: 300, pop: 2,
    atk: 42, def: { inf: 22, cav: 52, rng: 24 }, speed: 15, carry: 70, bonus: { cav: 0.8 },
    desc: 'Paarden schrikken van kamelen: +80% aanval tegen ruiterij.',
  }),
  hoplite: castle('greek', {
    name: 'Hopliet', type: 'inf', cost: { food: 70, gold: 45 }, time: 260, pop: 1,
    atk: 30, def: { inf: 48, cav: 58, rng: 30 }, speed: 8, carry: 40, tough: 0.4,
    desc: 'Falanx: schild aan schild, verliest 40% minder manschappen.',
  }),
  peltast: castle('greek', {
    name: 'Peltast', type: 'rng', cost: { food: 40, wood: 45 }, time: 200, pop: 1,
    atk: 30, def: { inf: 24, cav: 20, rng: 34 }, speed: 11, carry: 30, bonus: { inf: 0.5 },
    desc: 'Lichte speerwerper: +50% aanval tegen voetvolk.',
  }),
  samurai: castle('yamato', {
    name: 'Samoerai', type: 'inf', cost: { food: 80, gold: 60 }, time: 280, pop: 1,
    atk: 50, def: { inf: 34, cav: 26, rng: 26 }, speed: 9, carry: 50, bonus: { unique: 1.0 },
    desc: 'Meester van het zwaard: dubbele aanval tegen de elite van andere volkeren.',
  }),
  yabusame: castle('yamato', {
    name: 'Yabusame', type: 'rng', cost: { wood: 60, gold: 70 }, time: 300, pop: 2,
    atk: 36, def: { inf: 22, cav: 22, rng: 30 }, speed: 17, carry: 140,
    desc: 'Boogschutter te paard en snelle plunderaar: draagt bijzonder veel buit.',
  }),
  lionguard: castle('babylon', {
    name: 'Leeuwenwacht', type: 'inf', cost: { food: 75, gold: 55 }, time: 280, pop: 1,
    atk: 40, def: { inf: 42, cav: 42, rng: 42 }, speed: 8, carry: 45, defMult: 1.5,
    desc: 'Paleiswacht van Babylon: 50% sterker wanneer ze je stad verdedigen.',
  }),
  stonethrower: castle('babylon', {
    name: 'Stenenwerper', type: 'rng', cost: { wood: 200, gold: 120 }, time: 600, pop: 3, siege: true,
    atk: 55, def: { inf: 12, cav: 8, rng: 40 }, speed: 5, carry: 0, walls: 2,
    desc: 'Slingert keien over de muur: telt als twee stormrammen tegen muren.',
  }),
  elephant: castle('persia', {
    name: 'Oorlogsolifant', type: 'cav', cost: { food: 200, gold: 120 }, time: 600, pop: 3,
    atk: 95, def: { inf: 60, cav: 58, rng: 40 }, speed: 7, carry: 120, fear: 0.3,
    desc: 'Een reus die angst zaait: verlaagt de vijandelijke verdediging (tot -30%).',
  }),
  immortal: castle('persia', {
    name: 'Onsterfelijke', type: 'inf', cost: { food: 70, gold: 60 }, time: 280, pop: 1,
    atk: 38, def: { inf: 36, cav: 34, rng: 44 }, speed: 9, carry: 45, tough: 0.3,
    desc: 'Elitegarde die nooit lijkt te slinken: verliest 30% minder manschappen.',
  }),
});
UNITS.ram.walls = 1;

// Levenspunten (hp), schade per slag (dmg) en tijd tussen twee slagen (rate, ms) voor gevechten in je eigen gebied.
// Hoe beter de eenheid, hoe meer levenspunten. ranged = schiet van op afstand.
const HP = {
  villager: [25, 3, 1500], spear: [45, 5, 1500], sword: [60, 8, 1500], archer: [35, 6, 1800, true], scout: [45, 2, 1500],
  rider: [75, 9, 1600], knight: [120, 13, 1600], ram: [150, 2, 2500],
  chariot: [90, 11, 1600], camel: [80, 8, 1500], hoplite: [80, 7, 1500], peltast: [40, 7, 1700, true],
  samurai: [75, 11, 1400], yabusame: [70, 8, 1700, true], lionguard: [85, 8, 1500], stonethrower: [100, 14, 3000, true],
  elephant: [250, 18, 2000], immortal: [70, 8, 1500],
  boar: [75, 7, 1400], barbarian: [40, 5, 1500],
};
for (const [k, [hp, dmg, rate, ranged]] of Object.entries(HP)) Object.assign(UNITS[k], { hp, dmg, rate, ranged: !!ranged });

export const UNIQUE_UNITS = CIV_IDS.flatMap((c) => CIVS[c].units);
export const ARMY_UNITS = ['spear', 'sword', 'archer', 'scout', 'rider', 'knight', 'ram', ...UNIQUE_UNITS];

// Eenheden die je zelf door je gebied stuurt (echte tijd: dit is je eigen terrein, er zijn geen andere spelers).
export const FIELD = {
  speed: {
    villager: 1.1, spear: 1.1, sword: 1.0, archer: 1.1, scout: 2.4, rider: 2.0, knight: 1.6, ram: 0.6,
    chariot: 2.2, camel: 1.8, hoplite: 1.0, peltast: 1.3, samurai: 1.1, yabusame: 2.1, lionguard: 1.0, stonethrower: 0.6, elephant: 0.9, immortal: 1.1,
  }, // tegels per seconde
  vision: { villager: 2.6, scout: 5, rider: 3.6, knight: 3.4, chariot: 3.6, camel: 3.6, yabusame: 4, elephant: 3.8 }, // tegels; anders 3
  maxGroups: 8,
  chopMs: 12000, // bos kappen duurt 12 echte seconden per boom
  chopWood: 25,
  clearReach: 3, // tot zoveel ringen voorbij het bouwvierkant kan je bos kappen
  gatherEff: 0.8, // wilde bronnen: 80% van een gewone werkplek (de weg is langer)
  aggro: 3.4, // wie zo dicht bij het barbarenkamp komt, wordt meteen aangevallen (tegels)
  armorK: 40, // schade x armorK / (armorK + verdediging)
  engageMs: 1500, // eerst op elkaar af stormen, dan pas de eerste slag
  fightPace: 1.5, // gevechten in je gebied iets trager dan de ruwe aanvalssnelheid: beter te volgen
};

// De wildernis: everzwijnen, een barbarenkamp en wilde bronnen.
export const WILD = {
  boar: { name: 'Everzwijn', loot: { food: 200 }, respawnHours: 10 },
  camp: { name: 'Barbarenkamp', respawnHours: 36, loot: { food: 160, wood: 160, stone: 90, gold: 90 } },
  raid: { firstHours: 30, minHours: 20, maxHours: 40, warnMs: 90000, carry: 25 },
  deposits: {
    gold: { name: 'Goudader', res: 'gold', amount: 500 },
    stone: { name: 'Rotswand', res: 'stone', amount: 600 },
    wood: { name: 'Oud eikenbos', res: 'wood', amount: 800 },
    food: { name: 'Bessenstruiken', res: 'food', amount: 600 },
  },
};

// Vondsten: kleine extraatjes die af en toe rond je stad opduiken en die een dorpeling kan oogsten.
export const BONUS = {
  kinds: {
    sheep: { name: 'Verdwaald schaap', res: 'food', amount: 90 },
    tree: { name: 'Eik vol brandhout', res: 'wood', amount: 90 },
    stone: { name: 'Losse rotsblokken', res: 'stone', amount: 70 },
    gold: { name: 'Glinsterende goudader', res: 'gold', amount: 55 },
  },
  order: ['sheep', 'tree', 'stone', 'gold'],
  weights: [0.3, 0.3, 0.22, 0.18],
  ageBonus: 0.6, // +60% per tijdperk boven het eerste
  maxNodes: 4, // nooit meer dan zoveel tegelijk
  maxHarvesters: 3, // zoveel dorpelingen mogen tegelijk op pad
  firstMinutes: 10, // eerste vondst (spelsnelheid 1)
  minMinutes: 35, // tijd tussen twee vondsten (spelsnelheid 1)
  maxMinutes: 100,
  gatherMs: 6000, // echte seconden: oogsten blijft een snel klikmomentje, ook bij lage spelsnelheid
  walkTilesPerSec: 0.9,
};

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
