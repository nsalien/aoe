// Het brein van een computerspeler (bot) in zijn eigen stad. Puur: werkt enkel op de stadstoestand, met
// precies dezelfde acties als een echte speler (doBuild, doUpgrade, doTrain, doAssign, ... uit sim.js), dus met
// dezelfde kosten, tijden en regels. bots.js roept dit op (ook in stappen, om gemiste tijd in te halen).
//
// Wat een bot doet, in volgorde van belang:
//   1. dorpelingen verdelen naar wat hij nodig heeft (en wat er nog in de opslag past)
//   2. naar het volgende tijdperk zodra hij genoeg dorpelingen heeft (en daarvoor sparen)
//   3. huizen, opslag en werkplekken bijbouwen
//   4. militaire gebouwen, smidse, markt, wachttorens, een muur met vier poorten, later een monument
//   5. een leger trainen dat past bij zijn grootte en moeilijkheid
// Gebouwen komen op een vast patroon: straten door het midden (naar de poorten) en ring 1 vrij voor de muur.
import {
  RES, BUILDINGS, UNITS, AGE_UP, CIVS, WALL_TILE, GATE, TOWN_GRID, MAX_AGE, TECHS, levelAge, costValue,
} from '../../public/shared/rules.js';
import {
  GameError, age, slots, popCap, capacity, homePop, totalVillagers, homeVillagers, bLevel, findType, canAfford,
  checkUpgrade, doBuild, doUpgrade, checkTrain, doTrain, doAssign, canPlaceAt, maxBuilds, doPlaceWalls,
  doPlaceGate, gateList, marketRate, doTrade, unitsPop, tooBig, townScore, checkResearch, doResearch, noblesOwned, noblesMax,
} from '../../public/shared/sim.js';
import { ringOf, ringForAge, tileIndex } from '../../public/shared/territory.js';

// moeilijkheid: army = grootte van het leger t.o.v. het aantal dorpelingen, attackHours = minstens zoveel uur
// tussen twee aanvallen, reserve = deel van het leger dat thuis blijft, edge = zoveel sterker moet hij zich voelen
// prey = zoveel speluren na een aanval van een bot laten alle bots die stad met rust (behalve een clan die samen aanvalt)
export const BOT_LEVELS = {
  1: { name: 'Makkelijk', army: 0.35, attackHours: 10, reserve: 0.5, edge: 1.5, act: 8, prey: 16, campHours: 6 },
  2: { name: 'Normaal', army: 0.6, attackHours: 6, reserve: 0.4, edge: 1.25, act: 5, prey: 9, campHours: 4 },
  3: { name: 'Sterk', army: 0.9, attackHours: 4, reserve: 0.3, edge: 1.05, act: 3, prey: 5, campHours: 3 },
};
// Sterkte van een bot t.o.v. de echte spelers. Een vaste mix (ook binnen een clan): zwakke, gemiddelde en sterke bots.
// f = doelscore als deel van de mediaan van de echte spelers (sterk: minstens zo goed als de beste speler),
// attack = wachttijd tussen aanvallen (x), edge = zoveel zekerder van de winst moet hij zijn (x)
export const BOT_TIERS = {
  zwak: { name: 'zwak', f: 0.7, attack: 1.6, edge: 1.3 },
  gemiddeld: { name: 'gemiddeld', f: 1.0, attack: 1.0, edge: 1.0 },
  sterk: { name: 'sterk', f: 1.15, attack: 0.8, edge: 0.95 },
};
export const TIER_ORDER = ['zwak', 'sterk', 'gemiddeld', 'zwak', 'gemiddeld', 'sterk'];
export const tierOf = (n) => TIER_ORDER[((n % TIER_ORDER.length) + TIER_ORDER.length) % TIER_ORDER.length];
const LEVEL_SCALE = { 1: 0.8, 2: 1, 3: 1.2 };

// doelscore van een bot: ref = { med, hi } (scores van de echte spelers), level = niveau van de wereld (1-3)
export function botTarget(tier, ref, level) {
  const T = BOT_TIERS[tier] || BOT_TIERS.gemiddeld;
  const med = Math.max(0, ref.med || 0); const hi = Math.max(med, ref.hi || 0);
  const v = (tier === 'sterk' ? Math.max(med * T.f, hi) : med * T.f) * (LEVEL_SCALE[level] || 1);
  return Math.max(30, Math.round(v));
}

// karakter van een bot (vast per stad): wat meer of minder leger, wat sneller of trager naar een nieuw tijdperk
export function botStyle(seed) {
  const h = (Math.imul(seed | 0, 2654435761) >>> 0) / 4294967296;
  const g = (Math.imul((seed | 0) + 7, 1597334677) >>> 0) / 4294967296;
  return { army: 0.8 + h * 0.4, age: Math.round(g * 6) - 3 };
}
export const botLevel = (n) => BOT_LEVELS[n] || BOT_LEVELS[2];

const VILL_GOAL = [0, 22, 45, 68, 90, 110]; // zoveel dorpelingen wil hij per tijdperk
const AGE_AT = { 1: 18, 2: 36, 3: 58, 4: 82 }; // met zoveel dorpelingen gaat hij naar het volgende tijdperk
// volgorde van onderzoek in de Academie (eerst wat zijn leger en zijn stad het meest helpt)
const TECH_ORDER = ['firearrows', 'shieldwall', 'pitch', 'horseshoes', 'yew', 'xbow', 'drill', 'lances', 'volley', 'ironbound', 'warcry', 'flank'];
const ECO = { food: 'farm', wood: 'lumber', stone: 'quarry', gold: 'goldmine' };
const C = TOWN_GRID / 2; // midden van de stad (tussen tegel 5 en 6)

// ---------- plaatsing ----------
// straten: het kruis door het stadscentrum (daar liggen ook de poorten en het plein)
const street = (i, j) => i === 5 || i === 6 || j === 5 || j === 6;
// ring 1 rond het bouwvierkant blijft vrij voor de muur
const wallRing = (i, j) => ringOf(i, j) === 1;
// torens liefst op de hoeken
const TOWER_SPOTS = [[0, 0], [11, 11], [0, 11], [11, 0], [3, 0], [8, 11]];

function spotFor(s, type) {
  const size = BUILDINGS[type].size;
  if (type === 'tower') for (const [x, y] of TOWER_SPOTS) if (canPlaceAt(s, type, x, y)) return { x, y };
  const k = ringForAge(age(s));
  let best = null; let bd = Infinity;
  for (let y = -k; y < TOWN_GRID + k; y++) {
    for (let x = -k; x < TOWN_GRID + k; x++) {
      let ok = true;
      for (let dx = 0; dx < size && ok; dx++) for (let dy = 0; dy < size && ok; dy++) if (street(x + dx, y + dy) || wallRing(x + dx, y + dy)) ok = false;
      if (!ok) continue;
      // dicht bij het centrum, zonder alles dicht te bouwen: om de zoveel tegels een steegje vrij
      const d = (x + size / 2 - C) ** 2 + (y + size / 2 - C) ** 2 + ((x + y) % 5 === 0 && size === 1 ? 6 : 0);
      if (d >= bd || !canPlaceAt(s, type, x, y)) continue;
      bd = d; best = { x, y };
    }
  }
  return best;
}

// ---------- hulpjes ----------
function attempt(out, label, fn) {
  try { fn(); out.push(label); return true; } catch (e) { if (e instanceof GameError) return false; throw e; }
}

function builders(s) { return maxBuilds(s) - s.builds.length; }
const busy = (s, id) => s.builds.some((j) => j.bid === id);

// een nieuw gebouw neerzetten, of het laagste bestaande verbeteren (tot maxLevel)
function grow(s, t, speed, out, type, maxLevel = 3, preferNew = false) {
  if (builders(s) <= 0) return false;
  const def = BUILDINGS[type];
  const list = findType(s, type).filter((b) => !busy(s, b.id));
  const lim = Math.min(def.maxLevel, maxLevel);
  const up = list.filter((b) => b.level < lim && age(s) >= levelAge(type, b.level + 1)).sort((a, b) => a.level - b.level || a.id - b.id)[0];
  const canNew = findType(s, type).length < def.max && age(s) >= def.age;
  const tryNew = () => { const p = spotFor(s, type); return p && attempt(out, `bouw ${type}`, () => doBuild(s, type, p.x, p.y, s.t, speed)); };
  const tryUp = () => up && attempt(out, `verbeter ${type} → ${up.level + 1}`, () => doUpgrade(s, up.id, s.t, speed));
  return preferNew || !up ? (canNew && tryNew()) || tryUp() : tryUp() || (canNew && tryNew());
}

// ---------- dorpelingen verdelen ----------
function weights(s, goal) {
  const a = age(s);
  const w = a === 1 ? { food: 4, wood: 4, stone: 0.7, gold: 1 } : a === 2 ? { food: 3.5, wood: 3, stone: 1.6, gold: 2 } : { food: 3, wood: 2.4, stone: 2, gold: 2.6 };
  // wat voor het volgende doel ontbreekt, telt zwaar mee
  if (goal) for (const r of RES) w[r] += Math.max(0, (goal[r] || 0) - s.res[r]) / 450;
  // niets verzamelen wat toch niet meer in de opslag past
  const cap = capacity(s);
  for (const r of RES) if (s.res[r] > cap * 0.94) w[r] *= 0.12;
  return w;
}

function assign(s, goal) {
  const sl = slots(s); const n = homeVillagers(s);
  const w = weights(s, goal);
  const alloc = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (let k = 0; k < n; k++) {
    let best = null; let bv = -1;
    for (const r of RES) { if (alloc[r] >= sl[r]) continue; const v = w[r] / (alloc[r] + 1); if (v > bv) { bv = v; best = r; } }
    if (!best) break;
    alloc[best]++;
  }
  if (RES.some((r) => alloc[r] !== s.villagers[r])) doAssign(s, alloc, 'auto');
  return w;
}

// ---------- leger ----------
export function armyPlan(s) {
  const a = age(s);
  if (a === 1) return { spear: 1 };
  if (a === 2) return { spear: 0.25, sword: 0.3, archer: 0.3, rider: 0.15 };
  const p = { spear: 0.12, sword: 0.16, archer: 0.2, knight: 0.16, ram: a >= 4 ? 0.1 : 0.08 };
  for (const k of (CIVS[s.civ] || { units: [] }).units) p[k] = 0.14;
  return p;
}

// troepen (thuis + onderweg + in opleiding) per soort, in bevolking
function armyPop(s, away) {
  const out = {};
  const add = (k, n) => { if (k !== 'villager' && k !== 'noble' && UNITS[k]) out[k] = (out[k] || 0) + n * UNITS[k].pop; };
  for (const [k, n] of Object.entries(s.units || {})) add(k, n);
  for (const [k, n] of Object.entries(away || {})) add(k, n);
  for (const q of Object.values(s.queues)) for (const it of q) add(it.unit, it.n - it.done);
  return out;
}

function trainArmy(s, t, speed, out, target, opt) {
  const plan = armyPlan(s);
  const have = armyPop(s, opt.away);
  let total = Object.values(have).reduce((a, b) => a + b, 0);
  for (let k = 0; k < 4 && total < target; k++) {
    let best = null; let bd = -Infinity;
    for (const [u, f] of Object.entries(plan)) {
      const d = f * target - (have[u] || 0);
      if (d > bd && !checkTrain(s, u, 1, opt.awayPop || 0)) { bd = d; best = u; }
    }
    if (!best) break;
    const pop = UNITS[best].pop;
    let n = Math.max(1, Math.min(5, Math.ceil(Math.max(bd, pop) / pop)));
    while (n > 1 && checkTrain(s, best, n, opt.awayPop || 0)) n--;
    if (!attempt(out, `train ${n} ${best}`, () => doTrain(s, best, n, s.t, speed, opt.awayPop || 0))) break;
    have[best] = (have[best] || 0) + n * pop; total += n * pop;
  }
}

// ---------- muur ----------
// de muurring (ring 1) met in het midden van elke zijde een poort van 2 tegels
export function wallPlan() {
  const walls = []; const gates = [];
  const N = TOWN_GRID;
  const gate = (i, j) => ((i === 5 || i === 6) && (j === -1 || j === N)) || ((j === 5 || j === 6) && (i === -1 || i === N));
  for (let j = -1; j <= N; j++) {
    for (let i = -1; i <= N; i++) {
      if (ringOf(i, j) !== 1) continue;
      (gate(i, j) ? gates : walls).push([i, j]);
    }
  }
  return { walls, gates };
}

function buildWall(s, out) {
  const L = bLevel(s, 'wall');
  if (!L) return;
  const plan = wallPlan();
  const have = new Set([...(s.walls || []), ...(s.gates || [])]);
  const missing = plan.walls.filter(([i, j]) => !have.has(tileIndex(i, j)) && canPlaceAt(s, 'house', i, j));
  if (missing.length && canAfford(s.res, WALL_TILE.cost[L], missing.length)) attempt(out, `muur ${missing.length}`, () => doPlaceWalls(s, missing.slice(0, WALL_TILE.maxPerOrder)));
  if (gateList(s).length >= GATE.max) return;
  for (const [i, j] of plan.gates) {
    if (have.has(tileIndex(i, j)) || (s.gates || []).includes(tileIndex(i, j))) continue;
    if (!canAfford(s.res, GATE.cost)) return;
    attempt(out, 'poort', () => doPlaceGate(s, i, j));
  }
}

// ---------- ruilen op de markt: overschot naar wat je mist voor je doel ----------
function rebalance(s, goal, out) {
  if (!goal || !marketRate(s)) return;
  const short = RES.filter((r) => (goal[r] || 0) > s.res[r]).sort((a, b) => ((goal[b] || 0) - s.res[b]) - ((goal[a] || 0) - s.res[a]))[0];
  if (!short) return;
  const rich = RES.filter((r) => r !== short && s.res[r] - (goal[r] || 0) > 400).sort((a, b) => (s.res[b] - (goal[b] || 0)) - (s.res[a] - (goal[a] || 0)))[0];
  if (!rich) return;
  const need = (goal[short] - s.res[short]) / marketRate(s);
  const amount = Math.floor(Math.min(need, s.res[rich] - (goal[rich] || 0) - 200, 1500) / 10) * 10;
  if (amount >= 50) attempt(out, `ruil ${amount} ${rich} → ${short}`, () => doTrade(s, rich, short, amount));
}

// ---------- één beslissing van de bot (op het huidige tijdstip van s) ----------
// opt: { lvl (1-3), peace (eigen vrede nog niet voorbij), threat (er komt een aanval), away (troepen elders), awayPop,
//        style, cap (doelscore), rest (boven het doel: enkel leger), nobles (edelmannen trainen) }
// Geeft de lijst met wat hij deed terug.
export function botEconomy(s, speed = 1, opt = {}) {
  const out = [];
  const L = botLevel(opt.lvl);
  const a = age(s);
  const vill = totalVillagers(s);
  const tc = s.buildings.find((b) => b.type === 'tc');
  const ageing = busy(s, tc.id);
  const style = opt.style || { army: 1, age: 0 };
  // cap = doelscore (balans met de echte spelers): niet naar een nieuw tijdperk als hij daarmee ver boven zijn doel komt
  const ageOk = a < MAX_AGE && (!opt.cap || townScore(s) + costValue(AGE_UP[a + 1].cost) / 50 <= opt.cap * 1.2);
  const goal = !ageing && ageOk && vill >= AGE_AT[a] + style.age ? AGE_UP[a + 1].cost : null;
  const goalOk = goal && canAfford(s.res, goal);
  const saving = goal && !goalOk && !opt.threat;

  // 1. dorpelingen verdelen
  const w = assign(s, goal);
  // boven zijn doelscore rust hij: niet verder bouwen, enkel zijn leger op peil houden
  if (opt.rest) {
    trainArmy(s, s.t, speed, out, Math.round(vill * L.army * style.army * (opt.peace ? 0.4 : 1) * (opt.threat ? 1.3 : 1)), opt);
    return out;
  }

  // 2. naar het volgende tijdperk
  if (goal && goalOk && !checkUpgrade(s, tc.id)) attempt(out, `tijdperk ${a + 1}`, () => doUpgrade(s, tc.id, s.t, speed));
  if (goal && !goalOk) rebalance(s, goal, out);

  // 3. dorpelingen trainen
  const free = popCap(s) - homePop(s) - (opt.awayPop || 0);
  if (vill < VILL_GOAL[a] && !busy(s, tc.id) && (s.queues.tc || []).length < 2 && free > 0) {
    const n = Math.min(4, free, VILL_GOAL[a] - vill, Math.floor(s.res.food / 50));
    if (n > 0) attempt(out, `train ${n} villager`, () => doTrain(s, 'villager', n, s.t, speed, opt.awayPop || 0));
  }

  // 4. huizen (genoeg bevolkingsruimte voor dorpelingen en leger)
  if (popCap(s) - homePop(s) - (opt.awayPop || 0) < 5 + a * 2 && popCap(s) < 330) grow(s, s.t, speed, out, 'house', 5, a === 1);

  // 5. opslag: bijna vol, of het volgende tijdperk past er niet in
  const cap = capacity(s);
  const next = a < MAX_AGE ? AGE_UP[a + 1].cost : null;
  if ((next && tooBig(s, next)) || RES.some((r) => s.res[r] > cap * 0.85)) grow(s, s.t, speed, out, 'storage', 5);

  // 6. werkplekken waar dorpelingen te weinig plaats hebben
  const sl = slots(s); const sumW = RES.reduce((x, r) => x + w[r], 0);
  const want = Math.max(vill, Math.min(VILL_GOAL[a], vill + 6));
  for (const r of RES) if ((want * w[r]) / sumW > sl[r] - 1) grow(s, s.t, speed, out, ECO[r], a);

  // 7. militaire gebouwen, smidse, markt, muur en de eerste torens (ook tijdens het sparen: een stad zonder
  // verdediging is een makkelijke prooi)
  if (vill >= 12) grow(s, s.t, speed, out, 'barracks', saving ? 1 : a);
  if (a >= 2) {
    for (const ty of ['range', 'stable', 'smithy', 'market']) if (!findType(s, ty).length) grow(s, s.t, speed, out, ty, 1);
    if (!bLevel(s, 'wall') && !busy(s, 2)) attempt(out, 'stadsmuur', () => doUpgrade(s, 2, s.t, speed));
    buildWall(s, out);
    if (findType(s, 'tower').length < (a >= 3 && !saving ? 4 : 2)) grow(s, s.t, speed, out, 'tower', 1, true);
  }
  if (a >= 3 && !findType(s, 'workshop').length) grow(s, s.t, speed, out, 'workshop', 1);
  // de nieuwe gebouwen van elk tijdperk
  if (a >= 2 && !saving && !findType(s, 'mill').length) grow(s, s.t, speed, out, 'mill', 1);
  if (a >= 3 && !findType(s, 'academy').length) grow(s, s.t, speed, out, 'academy', 1);
  if (a >= 4 && !saving) for (const ty of ['lodge', 'guild']) if (!findType(s, ty).length) grow(s, s.t, speed, out, ty, 1);
  if (a >= 5 && !saving) {
    if (!findType(s, 'cathedral').length) grow(s, s.t, speed, out, 'cathedral', 1);
    if (opt.nobles && !findType(s, 'court').length) grow(s, s.t, speed, out, 'court', 1);
  }
  // edelmannen (enkel sterke bots): zoveel als zijn Adelshof toelaat
  if (opt.nobles && noblesMax(s) && noblesOwned(s, (opt.away || {}).noble || 0) < noblesMax(s) && !(s.queues.court || []).length) {
    const reserve = AGE_UP[MAX_AGE].cost;
    const c = UNITS.noble.cost;
    if (RES.every((r) => s.res[r] - (c[r] || 0) >= (reserve[r] || 0) * 0.15)) attempt(out, 'train 1 noble', () => doTrain(s, 'noble', 1, s.t, speed, opt.awayPop || 0, (opt.away || {}).noble || 0));
  }
  // onderzoek in de Academie
  if (bLevel(s, 'academy') && !s.research && !saving) {
    for (const id of TECH_ORDER) {
      if (checkResearch(s, id)) continue;
      // niet zijn hele voorraad: er moet genoeg overblijven
      if (RES.every((r) => s.res[r] - (TECHS[id].cost[r] || 0) >= 300)) attempt(out, `onderzoek ${id}`, () => doResearch(s, id, s.t, speed));
      break;
    }
  }

  // 8. leger (tijdens het sparen een kleiner leger)
  const target = Math.round(vill * L.army * style.army * (opt.peace ? 0.4 : 1) * (opt.threat ? 1.3 : saving && a < 3 ? 0.6 : 1));
  trainArmy(s, s.t, speed, out, target, opt);

  // sparen voor het volgende tijdperk: geen verbeteringen of monument
  if (saving) return out;

  // 9. verbeteren wat er al staat
  if (builders(s) > 0) {
    for (const ty of ['barracks', 'range', 'stable', 'smithy', 'tower', 'farm', 'lumber', 'goldmine', 'quarry', 'house', 'market', 'workshop',
      'mill', 'academy', 'guild', 'lodge', 'cathedral', 'court']) {
      if (builders(s) <= 0) break;
      const lim = Math.min(BUILDINGS[ty].maxLevel, ty === 'smithy' ? a + 1 : a);
      if (findType(s, ty).some((b) => b.level < lim && age(s) >= levelAge(ty, b.level + 1))) grow(s, s.t, speed, out, ty, lim);
    }
    const wl = bLevel(s, 'wall');
    if (wl && wl < Math.min(5, a + 1) && !busy(s, 2) && builders(s) > 0) attempt(out, `stadsmuur → ${wl + 1}`, () => doUpgrade(s, 2, s.t, speed));
  }
  // 10. een monument als alles af is
  if (a >= 4 && vill >= 70) grow(s, s.t, speed, out, 'monument', 5);
  return out;
}

// waarvoor spaart deze stad? (de kosten van het volgende tijdperk, als ze er klaar voor is) — ook voor clanleden
export function savingFor(s) {
  const a = age(s);
  const tc = s.buildings.find((b) => b.type === 'tc');
  if (a >= MAX_AGE || busy(s, tc.id) || totalVillagers(s) < AGE_AT[a] - 3) return null;
  return AGE_UP[a + 1].cost;
}

// sterkte van een leger (voor beslissingen): som van aanval en verdediging
export function armyValue(units) {
  let v = 0;
  for (const [k, n] of Object.entries(units || {})) if (UNITS[k] && k !== 'villager' && k !== 'scout' && k !== 'noble') v += (UNITS[k].atk || 0) * n;
  return v;
}

export { unitsPop };
