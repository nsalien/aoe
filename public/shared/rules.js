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
  { name: 'Tijdperk van de Gilden', short: 'Gilden' },
  { name: 'Tijdperk van de Kroon', short: 'Kroon' },
];
export const MAX_AGE = AGES.length - 1;

// Kosten en bouwtijd (seconden bij snelheid 1) om het stadscentrum naar dat tijdperk te brengen.
export const AGE_UP = {
  2: { cost: { food: 1200, wood: 1000, gold: 300 }, time: 2 * 3600 },
  3: { cost: { food: 6000, wood: 5000, stone: 2500, gold: 3000 }, time: 12 * 3600 },
  4: { cost: { food: 18000, wood: 15000, stone: 10000, gold: 12000 }, time: 36 * 3600 },
  5: { cost: { food: 40000, wood: 32000, stone: 24000, gold: 30000 }, time: 48 * 3600 },
};

// Gebouwen. cost/time gelden voor niveau 1; hogere niveaus schalen met growth/timeGrowth.
export const BUILDINGS = {
  tc: {
    name: 'Stadscentrum', size: 2, max: 1, maxLevel: 5, age: 1, placeable: false,
    desc: 'Het hart van je rijk. Train dorpelingen en breng je volk naar een nieuw tijdperk.',
  },
  house: {
    name: 'Huis', size: 1, max: 14, maxLevel: 5, age: 1, cost: { wood: 50 }, time: 180,
    pop: 5, desc: '+5 bevolking per niveau.',
  },
  farm: {
    name: 'Boerderij', size: 1, max: 10, maxLevel: 5, age: 1, cost: { wood: 75 }, time: 300,
    slots: { food: 4 }, desc: 'Werk voor 4 boeren per niveau.',
  },
  lumber: {
    name: 'Houthakkerskamp', size: 1, max: 4, maxLevel: 5, age: 1, cost: { wood: 100 }, time: 300,
    slots: { wood: 5 }, desc: 'Werk voor 5 houthakkers per niveau.',
  },
  quarry: {
    name: 'Steengroeve', size: 1, max: 4, maxLevel: 5, age: 1, cost: { wood: 100, food: 50 }, time: 360,
    slots: { stone: 4 }, desc: 'Werk voor 4 steenhouwers per niveau.',
  },
  goldmine: {
    name: 'Goudmijn', size: 1, max: 4, maxLevel: 5, age: 1, cost: { wood: 100, food: 50 }, time: 360,
    slots: { gold: 4 }, desc: 'Werk voor 4 goudzoekers per niveau.',
  },
  storage: {
    name: 'Opslagplaats', size: 1, max: 2, maxLevel: 5, age: 1, cost: { wood: 150 }, time: 600,
    storage: 4000, protect: 500, desc: '+4000 opslag per niveau en verbergt 500 per niveau voor plunderaars.',
  },
  barracks: {
    name: 'Kazerne', size: 2, max: 1, maxLevel: 5, age: 1, cost: { wood: 150, stone: 50 }, time: 900,
    trains: true, desc: 'Train voetvolk. Elk niveau traint 15% sneller.',
  },
  wall: {
    name: 'Stadsmuur', size: 0, max: 1, maxLevel: 5, age: 1, cost: { wood: 120, stone: 80 }, time: 1200,
    placeable: false, desc: 'Bepaalt hoe sterk je muren zijn. Plaats ze zelf, tegel per tegel. Een volledig gesloten muur verdedigt het best.',
  },
  range: {
    name: 'Schietbaan', size: 2, max: 1, maxLevel: 5, age: 2, cost: { wood: 200, gold: 60 }, time: 1500,
    trains: true, desc: 'Train boogschutters.',
  },
  stable: {
    name: 'Stal', size: 2, max: 1, maxLevel: 5, age: 2, cost: { wood: 200, food: 120, gold: 60 }, time: 1800,
    trains: true, desc: 'Train verkenners, ruiters en ridders.',
  },
  smithy: {
    name: 'Smidse', size: 1, max: 1, maxLevel: 5, age: 2, cost: { wood: 150, stone: 100, gold: 100 }, time: 1800,
    desc: '+5% aanval en verdediging per niveau voor al je troepen.',
  },
  market: {
    name: 'Markt', size: 2, max: 1, maxLevel: 5, age: 2, cost: { wood: 250, stone: 50 }, time: 1800,
    desc: 'Ruil grondstoffen en stuur karavanen naar bondgenoten.',
  },
  tower: {
    name: 'Wachttoren', size: 1, max: 4, maxLevel: 5, age: 2, cost: { stone: 250, wood: 80 }, time: 2400,
    defense: 80, desc: 'Schiet tijdens een veldslag op de dichtstbijzijnde vijand. Elk niveau geeft meer schade en levens. Aanvallers kunnen hem slopen.',
  },
  workshop: {
    name: 'Belegwerkplaats', size: 2, max: 1, maxLevel: 3, age: 3, cost: { wood: 350, gold: 200, stone: 100 }, time: 3600,
    trains: true, desc: 'Bouw stormrammen om muren en monumenten te slopen.',
  },
  monument: {
    name: 'Monument', size: 4, max: 1, maxLevel: 5, age: 4, cost: { food: 6000, wood: 6000, stone: 8000, gold: 8000 },
    time: 8 * 3600, growth: 1.35, score: 1500,
    desc: 'Een wereldwonder. Elk niveau levert 1500 extra punten op. Rammen kunnen het beschadigen!',
  },
  harbor: {
    name: 'Havenhuis', size: 1, max: 1, maxLevel: 5, age: 2, cost: { wood: 260, food: 100, stone: 40 }, time: 1800, shore: true,
    desc: 'Ligt aan het water. Bouw vissersbootjes en laat dorpelingen vissen: dat brengt sneller voedsel op dan de boerderij. Elk niveau: een bootje meer (hooguit 4) en sneller vissen.',
  },
  mill: {
    name: 'Molen', size: 1, max: 1, maxLevel: 5, age: 2, cost: { wood: 200, stone: 60 }, time: 1500,
    boost: { food: 0.05 }, desc: '+5% voedsel per niveau.',
  },
  academy: {
    name: 'Academie', size: 2, max: 1, maxLevel: 3, age: 3, cost: { wood: 400, stone: 200, gold: 300 }, time: 3600,
    levelAges: [3, 4, 5], research: true,
    desc: 'Onderzoek nieuwe vaardigheden voor je troepen en je stad. Elk niveau opent een nieuwe rij onderzoek.',
  },
  guild: {
    name: 'Gildehuis', size: 2, max: 1, maxLevel: 5, age: 4, cost: { wood: 2500, stone: 1500, gold: 2000 }, time: 4 * 3600,
    boost: { food: 0.03, wood: 0.03, stone: 0.03, gold: 0.03 }, desc: '+3% productie van alle grondstoffen per niveau.',
  },
  lodge: {
    name: 'Bouwloods', size: 2, max: 1, maxLevel: 3, age: 4, cost: { wood: 3000, stone: 2000, food: 1000 }, time: 3 * 3600,
    builders: 1, buildSpeed: 0.05, desc: 'Eén bouwer extra, en elk niveau bouwt 5% sneller.',
  },
  court: {
    name: 'Adelshof', size: 1, max: 1, maxLevel: 3, age: 5, cost: { food: 8000, wood: 8000, stone: 10000, gold: 12000 },
    time: 8 * 3600, growth: 1.5, trains: true,
    desc: 'Train edelmannen om andere steden te onderwerpen. Per niveau mag je één edelman hebben.',
  },
  cathedral: {
    name: 'Kathedraal', size: 1, max: 1, maxLevel: 3, age: 5, cost: { food: 4000, wood: 6000, stone: 15000, gold: 12000 },
    time: 12 * 3600, growth: 1.5, score: 600, loyalty: 1,
    desc: 'Je volk blijft je trouw: de trouw herstelt per niveau 1 per uur sneller. Elk niveau levert 600 extra punten op.',
  },
};

export const BUILD_ORDER = ['house', 'farm', 'lumber', 'quarry', 'goldmine', 'storage', 'barracks', 'range',
  'stable', 'smithy', 'market', 'tower', 'mill', 'harbor', 'workshop', 'academy', 'guild', 'lodge', 'monument', 'court', 'cathedral'];

export const TC_SLOTS = { food: 5, wood: 5, stone: 2, gold: 2, fish: 0 };
// Taken van dorpelingen: de vier grondstoffen en vissen (levert voedsel op, enkel met een havenhuis en bootjes)
export const JOBS = ['food', 'wood', 'stone', 'gold', 'fish'];
// Vissen vanuit het havenhuis. Per bootje 'crew' vissers; elke visser vangt 'rate' voedsel per uur (de boerderij: 16),
// +levelBonus per niveau van het havenhuis boven 1 (en zoals alles +10% per tijdperk). Hooguit boats[niveau] bootjes.
// Een bootje kost boatCost en is na boatTime seconden klaar (spelsnelheid 1). Het havenhuis staat op een vrije tegel naast
// water, tot reach ringen voorbij je bouwgrond (de vijver ligt net buiten het dorp).
// sight = zoveel tegels rond het havenhuis (een vierkant) is er nooit mist
export const FISH = { rate: 24, crew: 2, levelBonus: 0.08, boats: [0, 1, 2, 3, 4, 4], boatCost: { wood: 120, food: 40 }, boatTime: 900, reach: 4, sight: 3 };
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
  noble: {
    name: 'Edelman', type: 'cav', building: 'court', bl: 1, age: 5, cost: { food: 5000, wood: 4000, stone: 3000, gold: 7000 },
    time: 4 * 3600, atk: 8, def: { inf: 20, cav: 20, rng: 20 }, speed: 6, carry: 0, pop: 5, noble: true,
    desc: 'Overleeft hij een gewonnen aanval, dan daalt de trouw van die stad met 25. Bij 0 wordt de stad je vazal.',
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
// Poort: in een recht stuk muur. Is je stad helemaal dicht, dan gaan je troepen enkel via een poort binnen en buiten.
export const GATE = { cost: { wood: 80, stone: 40 }, max: 4 };
// Afbreken: dit deel van wat het gebouw kostte, krijg je terug (een lopende bouw krijg je voor de helft terug)
// Groottes van gebouwen veranderden (nov. 2026: kazerne, schietbaan, stal, markt, belegwerkplaats, academie, gildehuis en
// bouwloods 2x2, monument 4x4). SIZE_V = versie van de groottes; GREW = wat toen groter werd. Een oude stad met zo'n gebouw dat
// op zijn plek niet meer past, moet het opnieuw plaatsen (gratis, zie growBuildings in sim.js).
export const SIZE_V = 2;
export const GREW = new Set(['barracks', 'range', 'stable', 'market', 'workshop', 'academy', 'guild', 'lodge', 'monument']);
export const DEMOLISH = { built: 0.25, job: 0.5 };
// Troepen en dorpelingen ontslaan (thuis): hun plaats in de bevolking komt vrij en je krijgt een deel van hun kosten terug.
// Van de dorpelingen hou je er minstens minVillagers over (in totaal, ook wie in je gebied rondloopt), anders loopt je stad vast.
export const DISMISS = { refund: 0.25, minVillagers: 5 };
// Torens in een veldslag: levenspunten en schade per niveau
export const TOWER = { hp: [0, 220, 320, 450, 600, 780], dmg: [0, 9, 13, 18, 23, 29], range: 6, rate: 2000 };

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
  elephant: [250, 18, 2000], immortal: [70, 8, 1500], noble: [110, 4, 1800],
  boar: [75, 7, 1400], barbarian: [32, 5, 1500],
};
for (const [k, [hp, dmg, rate, ranged]] of Object.entries(HP)) Object.assign(UNITS[k], { hp, dmg, rate, ranged: !!ranged });

export const UNIQUE_UNITS = CIV_IDS.flatMap((c) => CIVS[c].units);
export const ARMY_UNITS = ['spear', 'sword', 'archer', 'scout', 'rider', 'knight', 'ram', ...UNIQUE_UNITS, 'noble'];

// Eenheden die je zelf door je gebied stuurt (echte tijd: dit is je eigen terrein, er zijn geen andere spelers).
export const FIELD = {
  speed: {
    villager: 1.1, spear: 1.1, sword: 1.0, archer: 1.1, scout: 2.4, rider: 2.0, knight: 1.6, ram: 0.6,
    chariot: 2.2, camel: 1.8, hoplite: 1.0, peltast: 1.3, samurai: 1.1, yabusame: 2.1, lionguard: 1.0, stonethrower: 0.6, elephant: 0.9, immortal: 1.1,
    noble: 0.8,
  }, // tegels per seconde
  vision: { villager: 2.6, scout: 5, rider: 3.6, knight: 3.4, chariot: 3.6, camel: 3.6, yabusame: 4, elephant: 3.8 }, // tegels; anders 3
  maxGroups: 8,
  chopMs: 12000, // bos kappen duurt 12 echte seconden per boom
  chopWood: 25,
  clearReach: 3, // tot zoveel ringen voorbij het bouwvierkant kan je bos kappen
  homeSight: 3.2, // zo ver (tegels) rond je bouwgrond en je muren zie je altijd; daarbuiten begint de oorlogsmist
  gatherEff: 0.8, // wilde bronnen: 80% van een gewone werkplek (de weg is langer)
  aggro: 3.4, // wie zo dicht bij het barbarenkamp komt, wordt meteen aangevallen (tegels)
  armorK: 40, // schade x armorK / (armorK + verdediging)
  engageMs: 1500, // eerst op elkaar af stormen, dan pas de eerste slag
  fightPace: 1.5, // gevechten in je gebied iets trager dan de ruwe aanvalssnelheid: beter te volgen
};

// De wildernis: everzwijnen, een barbarenkamp en wilde bronnen.
export const WILD = {
  boar: { name: 'Everzwijn', loot: { food: 200 }, respawnHours: 10 },
  // het kamp groeit elke dag dat je het met rust laat (growPerDay, tot growMax keer zo sterk); verwoesten = opnieuw klein
  // (en een groter kamp geeft ook meer buit)
  camp: { name: 'Barbarenkamp', respawnHours: 36, loot: { food: 320, wood: 320, stone: 180, gold: 180 }, growPerDay: 0.35, growMax: 3 },
  // Overvallen op je dorp: om de checkHours een kans (chance + chancePerDay per dag dat het kamp groeit, hooguit maxChance),
  // nooit binnen quietHours na de vorige overval of het heropbouwen van het kamp; in een nieuwe stad pas na firstHours.
  // warnMs = zo lang (echte tijd) trekken de barbaren naar je dorp: zolang kan je kiezen om de slag zelf te spelen,
  // daarna gaat ze automatisch. liveMs = vangnet: een zelf gespeelde slag die nooit afgerond werd, gaat daarna automatisch.
  raid: { firstHours: 30, quietHours: 10, checkHours: 2, chance: 0.02, chancePerDay: 0.06, maxChance: 0.4, warnMs: 15 * 60000, liveMs: 30 * 60000, carry: 25, max: 60 },
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
// kleuren voor clans die spelers zelf stichten (bij het verlaten van een clan): de meest verschillende vrije kleur
export const CLAN_COLORS = [...TEAM_COLORS, '#8d5a2b', '#5c6bc0', '#7cb342', '#b0306a', '#00897b', '#f06292', '#6d4c41', '#546e7a', '#b8860b', '#5e2a84', '#1b5e20', '#9e9d24'];

// Clans wisselen, verraad en privéberichten (functions/lib/clan.js)
export const CLAN = {
  maxMembers: 4, // zoveel leden mag een clan hebben (of de teamgrootte van de wereld als die groter is)
  switchMs: 6 * 3600000, // na een wissel van clan (verlaten of toetreden) zo lang wachten voor de volgende (echte tijd)
  inviteMs: 3 * 24 * 3600000, // uitnodigingen en verzoeken vervallen na zoveel tijd
  traitorMs: 3 * 24 * 3600000, // zo lang na een aanval op een clanlid kan de clan de verrader buitenzetten
  nameMin: 3,
  nameMax: 24,
};

export const WORLD_SIZE = 56;
export const CAMP_EXTRA = 12; // naast de 3 kampen rond elk startgebied

// tradeGapMs: naar eenzelfde speler hooguit één karavaan per zoveel tijd (echte tijd, ook voor bots)
export const MARKET = { rate: 0.6, ratePerLevel: 0.07, shipPerLevel: 1000, merchantSpeed: 12, tradeGapMs: 8 * 3600000 };

// ---------- Academie: onderzoek ----------
// Een raster van 4 soorten x 3 rijen. Rij r vraagt Academie niveau r (= tijdperk r + 2) en het onderzoek ervoor
// in dezelfde soort. Geen ruwe kracht (dat doet de smidse): elk onderzoek verandert hoe je troepen vechten.
// auto = wat het betekent in een automatisch uitgerekende slag (battle.js).
export const TECH_LINES = {
  inf: { name: 'Voetvolk' }, rng: { name: 'Schutters' }, cav: { name: 'Ruiterij' }, town: { name: 'Stad' },
};
export const TECH_LINE_IDS = ['inf', 'rng', 'cav', 'town'];
const T1 = { food: 800, wood: 600, gold: 900 };
const T2 = { food: 2400, wood: 2000, gold: 3200 };
const T3 = { food: 6000, wood: 5000, stone: 2000, gold: 8000 };
export const TECHS = {
  shieldwall: { line: 'inf', row: 1, name: 'Schildmuur', cost: T1, time: 2 * 3600, auto: { def: { inf: { rng: 0.3 } } },
    desc: 'Voetvolk in blok of linie sluit de schilden: 30% minder schade van pijlen en torens.' },
  drill: { line: 'inf', row: 2, name: 'Krijgsdrill', cost: T2, time: 5 * 3600, auto: { def: { inf: { inf: 0.08, cav: 0.08 } } },
    desc: 'Voetvolk staat sneller in formatie en verliest een kwart minder moed.' },
  warcry: { line: 'inf', row: 3, name: 'Strijdkreet', cost: T3, time: 10 * 3600, auto: { atk: { inf: 0.1 } },
    desc: 'Een stormloop van je voetvolk kost de vijand moed.' },
  firearrows: { line: 'rng', row: 1, name: 'Vuurpijlen', cost: { wood: 900, food: 600, gold: 800 }, time: 2 * 3600, auto: { atk: { rng: 0.05 }, towers: -0.25 },
    desc: 'Brandende pijlen: 60% meer schade tegen rammen, torens, muren en poorten.' },
  yew: { line: 'rng', row: 2, name: 'Taxusboog', cost: T2, time: 5 * 3600, auto: { atk: { rng: 0.1 } },
    desc: 'Schutters schieten een tegel verder.' },
  volley: { line: 'rng', row: 3, name: 'Pijlenregen', cost: T3, time: 10 * 3600, auto: { atk: { rng: 0.15 } },
    desc: 'Schutters schieten 15% sneller.' },
  horseshoes: { line: 'cav', row: 1, name: 'Hoefijzers', cost: { food: 1000, wood: 300, gold: 900 }, time: 2 * 3600, auto: {},
    desc: 'Ruiterij is 10% sneller: op de wereldkaart en in de slag.' },
  lances: { line: 'cav', row: 2, name: 'Lansen', cost: T2, time: 5 * 3600, auto: { atk: { cav: 0.1 } },
    desc: 'De stormloop van je ruiterij is 25% sterker.' },
  flank: { line: 'cav', row: 3, name: 'Flankrit', cost: T3, time: 10 * 3600, auto: { atk: { cav: 0.1 } },
    desc: 'Ruiterij die in de flank of de rug aanvalt, doet 50% meer extra schade.' },
  pitch: { line: 'town', row: 1, name: 'Kokende pek', cost: { food: 500, wood: 900, stone: 800, gold: 500 }, time: 2 * 3600, auto: { wall: 0.5 },
    desc: 'Wie aan je poort staat, krijgt kokende pek over zich heen.' },
  xbow: { line: 'town', row: 2, name: 'Torenkruisbogen', cost: { food: 1500, wood: 2500, stone: 3000, gold: 2500 }, time: 5 * 3600, auto: { towers: 0.2 },
    desc: 'Wachttorens schieten een tegel verder en 20% harder.' },
  ironbound: { line: 'town', row: 3, name: 'IJzerbeslag', cost: { food: 3000, wood: 5000, stone: 8000, gold: 6000 }, time: 10 * 3600, auto: { rams: 0.67 },
    desc: 'Poorten houden 50% langer stand tegen rammen en soldaten.' },
};
export const TECH_IDS = Object.keys(TECHS);
export const techAt = (line, row) => TECH_IDS.find((id) => TECHS[id].line === line && TECHS[id].row === row);
// hoeveel onderzoeken van een soort klaar zijn (0-3): bepaalt ook hoe de troepen eruitzien
export const techTier = (tech, line) => { let n = 0; for (let r = 1; r <= 3; r++) if (tech && tech[techAt(line, r)]) n = r; else break; return n; };
export const hasTech = (tech, id) => !!(tech && tech[id]);

// uitzicht van de uitrusting volgens de smidse: 0 = leer en brons, 1 = ijzer en maliën, 2 = plaatharnas
export const gearOf = (smithy) => (smithy >= 5 ? 2 : smithy >= 3 ? 1 : 0);

// ---------- edelmannen, trouw en vazallen ----------
export const LOYALTY = {
  max: 100, hit: 25, regen: 2, // trouw per uur (bij snelheid 1)
  shieldMs: 24 * 3600000, // na een bevrijding: zo lang geen edelmannen tegen die stad
  minScore: 0.45, // niet tegen steden met minder dan 45% van je punten
};
export const VASSAL = {
  ms: 3 * 24 * 3600000, // zo lang blijft een stad vazal (echte tijd)
  maxPerLord: 2,
  tribute: 0.2, // deel van de productie
  tributeMs: 6 * 3600000, // om de zoveel tijd vertrekt een karavaan met schatting
  scoreShare: 0.2, // zoveel van de punten van je vazal tellen mee voor jou
  ransom: 1000, // losgeld per grondstof, maal het tijdperk van de vazal
};
export const ransomCost = (a) => ({ food: VASSAL.ransom * a, wood: VASSAL.ransom * a, stone: VASSAL.ransom * a, gold: VASSAL.ransom * a });

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
  if (b.levelAges) return b.levelAges[Math.min(b.levelAges.length, level) - 1];
  return Math.max(b.age, Math.min(MAX_AGE, level));
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

// ---------- oorlog moet lonen ----------
// Een dorpeling brengt ±16-30 per uur op. Een soldaat die plundert, moet per plaats in je bevolking minstens even veel
// opleveren, anders loont aanvallen niet. Daarom:
//   carry   troepen dragen meer naarmate je tijdperk stijgt (karren en lastdieren): draagvermogen x dit, per tijdperk
//           van de aanvaller (1 = Vuursteen ... 5 = Kroon)
//   bounty  krijgsbuit: wie de slag wint, raapt wapens en uitrusting op = dit deel van wat de gesneuvelde vijanden kostten
//           (aanvaller: gaat mee naar huis, bovenop wat hij draagt; verdediger: meteen in zijn opslag)
//   killPts gevechtspunten: 1 punt per zoveel (kostprijs) gedode vijanden; campKillPts idem bij roverskampen
//   lootPts 1 punt per zoveel grondstoffen die je bij een speler buitmaakt
export const WAR = { carry: [1, 2, 2.5, 3, 3.5, 4], bounty: 0.3, killPts: 25, campKillPts: 50, lootPts: 250 };
// Replay van een automatisch uitgerekende slag (achteraf bekijken, zonder zelf te besturen): zo lang na de slag te zien
export const REPLAY = { ms: 24 * 3600000 };
export const carryMult = (age) => WAR.carry[Math.max(1, Math.min(WAR.carry.length - 1, Math.floor(age) || 1))];

// krijgsbuit: frac van de kosten van deze (gesneuvelde) troepen, per grondstof
export function bountyOf(units, frac = WAR.bounty) {
  const out = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (const k of Object.keys(units || {})) {
    const c = UNITS[k] && UNITS[k].cost;
    if (!c || !(units[k] > 0)) continue;
    for (const r of RES) if (c[r]) out[r] += c[r] * units[k] * frac;
  }
  for (const r of RES) out[r] = Math.floor(out[r]);
  return out;
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
  const v = Math.round(500 * Math.pow(level, 1.6));
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
