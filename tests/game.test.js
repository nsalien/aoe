// Uitvoeren met: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newTownState, advance, doBuild, doUpgrade, doTrain, doAssign, slots, popCap, capacity, rates, bLevel,
  totalVillagers, checkTrain, canPlaceAt, townScore, GameError,
} from '../public/shared/sim.js';
import { resolveBattle, computeLoot, carryCapacity, resolveScouting } from '../public/shared/battle.js';
import { generateTerrain, generateCamps, teamRegion, findSpot, isBuildable } from '../public/shared/worldgen.js';
import { levelCost, levelTime, unitTime, GATHER_RATE, MAX_TEAMS } from '../public/shared/rules.js';

const H = 3600000;

test('grondstoffen groeien met de verzamelsnelheid', () => {
  const s = newTownState(0);
  advance(s, H, 1);
  assert.equal(Math.round(s.res.food), 300 + 3 * GATHER_RATE.food);
  assert.equal(Math.round(s.res.wood), 300 + 3 * GATHER_RATE.wood);
  assert.equal(s.res.gold, 100);
});

test('opslag begrenst de grondstoffen', () => {
  const s = newTownState(0);
  advance(s, 1000 * H, 1);
  assert.equal(s.res.food, capacity(s));
});

test('gebouw wordt op tijd afgewerkt en geeft werkplekken', () => {
  const s = newTownState(0);
  const before = slots(s).food;
  doBuild(s, 'farm', 1, 1, 0, 1);
  assert.equal(s.builds.length, 1);
  const end = levelTime('farm', 1, 1);
  advance(s, end - 1, 1);
  assert.equal(s.buildings.find((b) => b.type === 'farm').level, 0);
  advance(s, end, 1);
  assert.equal(s.buildings.find((b) => b.type === 'farm').level, 1);
  assert.equal(slots(s).food, before + 4);
  assert.equal(s.builds.length, 0);
});

test('bouwen kost grondstoffen en overlappen kan niet', () => {
  const s = newTownState(0);
  doBuild(s, 'house', 0, 0, 0, 1);
  assert.equal(s.res.wood, 300 - levelCost('house', 1).wood);
  assert.equal(canPlaceAt(s, 'house', 0, 0), false);
  assert.equal(canPlaceAt(s, 'house', 5, 5), false, 'stadscentrum staat in het midden');
  assert.throws(() => doBuild(s, 'house', 0, 0, 0, 1), GameError);
});

test('maximaal twee bouwers in de eerste tijdperken', () => {
  const s = newTownState(0);
  s.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
  doBuild(s, 'house', 0, 0, 0, 1);
  doBuild(s, 'house', 1, 0, 0, 1);
  assert.throws(() => doBuild(s, 'house', 2, 0, 0, 1), /bouwers/);
});

test('training levert eenheden één voor één op', () => {
  const s = newTownState(0);
  s.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
  doBuild(s, 'barracks', 0, 0, 0, 1);
  advance(s, levelTime('barracks', 1, 1), 1);
  const t0 = s.t;
  doTrain(s, 'spear', 3, t0, 1);
  const dur = unitTime('spear', 1, 1);
  advance(s, t0 + dur * 2 + 10, 1);
  assert.equal(s.units.spear, 2);
  advance(s, t0 + dur * 3, 1);
  assert.equal(s.units.spear, 3);
  assert.equal(s.queues.barracks, undefined);
});

test('nieuwe dorpelingen gaan aan het werk', () => {
  const s = newTownState(0);
  doTrain(s, 'villager', 2, 0, 1);
  advance(s, H, 1);
  assert.equal(totalVillagers(s), 8);
  assert.equal(s.villagers.idle, 0);
});

test('bevolkingslimiet wordt afgedwongen', () => {
  const s = newTownState(0);
  s.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  assert.equal(popCap(s), 10);
  assert.match(checkTrain(s, 'villager', 5), /bevolking/);
  assert.equal(checkTrain(s, 'villager', 4), null);
  assert.match(checkTrain(s, 'villager', 2, 3), /bevolking/, 'troepen onderweg tellen mee');
});

test('verdeling van dorpelingen wordt gecontroleerd', () => {
  const s = newTownState(0);
  doAssign(s, { food: 5, wood: 1, stone: 0, gold: 0 });
  assert.equal(s.villagers.food, 5);
  assert.throws(() => doAssign(s, { food: 6, wood: 0, stone: 0, gold: 0 }), /werkplekken/);
  assert.throws(() => doAssign(s, { food: 5, wood: 5, stone: 0, gold: 0 }), /dorpelingen/);
});

test('nieuw tijdperk verhoogt productie en opslag', () => {
  const s = newTownState(0);
  s.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  const r1 = rates(s).food;
  doUpgrade(s, 1, 0, 1);
  advance(s, levelTime('tc', 2, 1), 1);
  assert.equal(bLevel(s, 'tc'), 2);
  assert.ok(rates(s).food > r1);
  assert.equal(capacity(s), 6000);
  assert.ok(townScore(s) > 22);
});

test('snelheid versnelt bouwen en verzamelen', () => {
  assert.equal(levelTime('house', 1, 10), levelTime('house', 1, 1) / 10);
  const s = newTownState(0);
  advance(s, H / 10, 10);
  assert.equal(Math.round(s.res.food), 300 + 3 * GATHER_RATE.food);
});

test('sterkere aanvaller wint en verliest minder', () => {
  const r = resolveBattle({ attUnits: { sword: 100 }, groups: [{ key: 'home', units: { spear: 20 } }], baseDef: 50 });
  assert.equal(r.attWins, true);
  assert.equal(r.groupsLeft[0].units.spear, 0);
  assert.ok(r.attLeft.sword > 80 && r.attLeft.sword < 100);
});

test('speerdragers houden ruiters tegen', () => {
  const r = resolveBattle({ attUnits: { rider: 30 }, groups: [{ key: 'home', units: { spear: 40 } }] });
  assert.equal(r.attWins, false);
  assert.equal(r.attLeft.rider, 0);
});

test('muren versterken de verdediging en rammen breken ze', () => {
  const groups = [{ key: 'home', units: { spear: 30 } }];
  const noWall = resolveBattle({ attUnits: { sword: 40 }, groups });
  const wall = resolveBattle({ attUnits: { sword: 40 }, groups, wall: 5 });
  assert.ok(wall.D > noWall.D);
  const rams = resolveBattle({ attUnits: { sword: 60, ram: 14 }, groups, wall: 3 });
  assert.equal(rams.attWins, true);
  assert.ok(rams.wallDamage >= 1);
});

test('buit wordt eerlijk verdeeld en past in de rugzak', () => {
  const loot = computeLoot({ food: 1000, wood: 50, stone: 1000, gold: 0 }, 900);
  assert.equal(loot.wood, 50);
  assert.equal(loot.gold, 0);
  assert.ok(loot.food + loot.wood + loot.stone + loot.gold <= 900);
  assert.ok(loot.food >= 420);
  assert.equal(carryCapacity({ spear: 10, rider: 2 }), 10 * 40 + 2 * 100);
});

test('verkenners: meer verkenners wint', () => {
  assert.equal(resolveScouting(10, 3).success, true);
  assert.equal(resolveScouting(3, 3).success, false);
  assert.equal(resolveScouting(5, 0).left, 5);
});

test('wereld is deterministisch en startgebieden zijn bebouwbaar', () => {
  const a = generateTerrain(1234, 56);
  const b = generateTerrain(1234, 56);
  assert.deepEqual(a.tiles, b.tiles);
  for (let slot = 0; slot < MAX_TEAMS; slot++) {
    const r = teamRegion(1234, 56, slot);
    const spot = findSpot(a, r.x, r.y, [], 4);
    assert.ok(spot && Math.hypot(spot.x - r.x, spot.y - r.y) < 3, `team ${slot} heeft een plek dichtbij`);
    assert.ok(isBuildable(a.tiles[spot.y * 56 + spot.x]));
  }
  const camps = generateCamps(1234, 56, a, 12);
  assert.ok(camps.length >= 30);
  assert.ok(camps.filter((c) => c.level === 1).length >= 12);
});

// ---------- vondsten ----------
import { ensureBonus, doHarvest, harvestTime, checkHarvest, harvesting } from '../public/shared/sim.js';
import { BONUS } from '../public/shared/rules.js';

test('vondsten verschijnen deterministisch en nooit meer dan het maximum', () => {
  const a = newTownState(1000);
  const b = newTownState(1000);
  advance(a, 1000 + 24 * H, 1);
  advance(b, 1000 + 7 * H, 1);
  advance(b, 1000 + 24 * H, 1);
  assert.deepEqual(a.nodes, b.nodes, 'zelfde vondsten, ook als je in stappen rekent');
  assert.equal(a.nodes.length, BONUS.maxNodes);
  for (const n of a.nodes) {
    assert.ok(BONUS.kinds[n.kind]);
    const outside = n.gx < 0 || n.gy < 0 || n.gx > 12 || n.gy > 12;
    assert.ok(outside, 'vondsten liggen rond de stad, niet op bouwgrond');
  }
});

test('een dorpeling oogst een vondst en gaat daarna terug aan het werk', () => {
  const s = newTownState(0);
  advance(s, 2 * H, 1);
  assert.ok(s.nodes.length > 0);
  const node = s.nodes[0];
  const before = { ...s.villagers };
  const resBefore = s.res[node.res];
  const hv = doHarvest(s, node.id, 'wood', s.t);
  assert.equal(s.villagers.wood, before.wood - 1, 'de houthakker legt zijn werk even neer');
  assert.equal(totalVillagers(s), 6, 'de dorpeling telt nog mee');
  assert.equal(harvesting(s), 1);
  assert.match(checkHarvest(s, node.id), /onderweg/);
  assert.throws(() => doAssign(s, { food: 3, wood: 3, stone: 0, gold: 0 }), /dorpelingen/, 'wie op pad is, kan je niet verdelen');
  advance(s, hv.end, 1);
  assert.equal(s.villagers.wood, before.wood, 'terug aan het werk');
  assert.ok(!s.nodes.some((n) => n.id === node.id), 'vondst is weg');
  assert.ok(s.res[node.res] >= Math.min(capacity(s), resBefore + node.amount) - 1, 'grondstoffen ontvangen');
  assert.equal(harvesting(s), 0);
});

test('oogsten duurt langer naarmate de vondst verder ligt', () => {
  const near = harvestTime({ gx: 6, gy: 13 });
  const far = harvestTime({ gx: -1.5, gy: -1.5 });
  assert.ok(far > near);
  assert.ok(near >= BONUS.gatherMs);
});

test('oude steden zonder vondsten worden netjes bijgewerkt', () => {
  const s = newTownState(0);
  delete s.nodes;
  ensureBonus(s, 1);
  assert.deepEqual(s.nodes, []);
  assert.ok(s.nextNode > s.t);
  assert.throws(() => doHarvest(s, 999, null, 0), /niet meer/);
});

// ---------- eigen gebied ----------
import {
  ensureTerritory, doFieldSend, doFieldOrder, canChop, groupPos, isBuildable as tileBuildable, depLeft, campSize, raidSize,
} from '../public/shared/sim.js';
import { territory, exHas, exDecode, T_MIN, tileIndex, TILE } from '../public/shared/territory.js';
import { WILD, FIELD } from '../public/shared/rules.js';

function terrTown(seed = 5) {
  const s = newTownState(0);
  s.res = { food: 500, wood: 500, stone: 500, gold: 500 };
  ensureTerritory(s, seed);
  advance(s, 1000, 1);
  return s;
}
const arrive = (s, g) => advance(s, g.t1 + 1, 1);
// tot het einde van de route (alle tussenstops)
const arriveAll = (s, g) => { for (let k = 0; k < 50 && g.pending; k++) advance(s, g.t1 + 1, 1); };
// alle tegels waar een groep over loopt (de hele route met tussenstops)
function routeTiles(g) {
  const pts = [{ x: g.x0, y: g.y0 }, { x: g.x1, y: g.y1 }, ...(g.via || [])];
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]; const b = pts[k]; const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05) + 1;
    for (let q = 0; q <= n; q++) out.push([Math.floor(a.x + ((b.x - a.x) * q) / n), Math.floor(a.y + ((b.y - a.y) * q) / n)]);
  }
  return out;
}
const fightOver = (s) => advance(s, s.t + 5 * 60000, 1); // gevechten duren hooguit enkele minuten

test('het bouwvierkant groeit mee met het tijdperk', () => {
  const s = terrTown();
  assert.equal(canPlaceAt(s, 'house', -1, 3), false);
  s.buildings.find((b) => b.type === 'tc').level = 2;
  assert.equal(canPlaceAt(s, 'house', -1, 3), true);
  assert.equal(canPlaceAt(s, 'house', -2, 3), false);
});

test('het gebied rond de stad is ontdekt, de wildernis nog niet', () => {
  const s = terrTown();
  const b = exDecode(s.terr.ex);
  assert.ok(exHas(b, 0, 0) && exHas(b, -4, 5));
  assert.equal(exHas(b, T_MIN + 1, T_MIN + 1), false);
});

test('een dorpeling verkent de mist en komt daarna terug aan het werk', () => {
  const s = terrTown();
  const before = s.villagers.wood;
  const g = doFieldSend(s, { villager: 'wood' }, null, { x: -14, y: 6 }, null, s.t);
  assert.equal(s.villagers.wood, before - 1);
  assert.equal(totalVillagers(s), 6, 'de verkenner telt nog mee als dorpeling');
  const terr = territory(s.terr.seed);
  assert.ok(routeTiles(g).every(([i, j]) => terr.tiles[tileIndex(i, j)] !== TILE.WATER), 'niet door het water');
  arriveAll(s, g);
  assert.ok(exHas(exDecode(s.terr.ex), -14, 6), 'het doel is ontdekt');
  assert.ok(exHas(exDecode(s.terr.ex), -10, 6), 'de weg ernaartoe ook');
  doFieldOrder(s, g.id, null, { type: 'home' }, s.t);
  arriveAll(s, g);
  assert.equal(s.field.length, 0);
  assert.equal(s.villagers.wood, before, 'terug aan het werk');
});

test('bos kappen geeft hout en nieuwe bouwgrond', () => {
  const s = terrTown();
  const terr = territory(s.terr.seed);
  const tree = terr.trees.find((t) => canChop(s, t.i, t.j));
  assert.ok(tree, 'er is een boom aan de rand');
  assert.equal(tileBuildable(s, tree.i, tree.j), false);
  const wood = s.res.wood;
  const g = doFieldSend(s, { villager: 'food' }, null, null, { type: 'tree', i: tree.i, j: tree.j }, s.t);
  arrive(s, g);
  assert.ok(g.work && g.work.type === 'chop');
  advance(s, g.work.end + 1, 1);
  assert.ok(tileBuildable(s, tree.i, tree.j), 'de tegel is nu bouwgrond');
  assert.ok(s.res.wood >= wood + FIELD.chopWood - 1);
  assert.throws(() => doFieldSend(s, { villager: 'food' }, null, null, { type: 'tree', i: T_MIN + 1, j: T_MIN + 1 }, s.t), /kappen|Kies/);
});

test('een wilde bron ontginnen nadat je ze ontdekt hebt', () => {
  const s = terrTown();
  const d = territory(s.terr.seed).deposits.find((x) => x.kind === 'gold');
  assert.throws(() => doFieldSend(s, { villager: 'wood' }, null, null, { type: 'dep', id: d.id }, s.t), /ontdekt/);
  const scout = doFieldSend(s, { villager: 'wood' }, null, { x: d.x, y: d.y }, null, s.t);
  arrive(s, scout);
  doFieldOrder(s, scout.id, null, { type: 'dep', id: d.id }, s.t);
  arrive(s, scout);
  assert.equal(scout.work.type, 'gather');
  const gold = s.res.gold;
  advance(s, s.t + 3600000, 1);
  assert.ok(s.res.gold > gold, 'goud komt binnen');
  assert.ok(depLeft(s, d) < WILD.deposits.gold.amount);
  advance(s, s.t + 200 * 3600000, 1);
  assert.equal(depLeft(s, d), 0, 'uitgeput');
  assert.ok(!s.field.some((g) => g.work), 'de dorpeling stopt');
});

test('everzwijn verslaan levert voedsel op', () => {
  const s = terrTown();
  s.units = { spear: 12 };
  const boar = territory(s.terr.seed).boars[0];
  const g = doFieldSend(s, { units: { spear: 12 } }, null, { x: boar.x, y: boar.y }, null, s.t);
  arrive(s, g);
  const food = s.res.food;
  doFieldOrder(s, g.id, null, { type: 'boar', id: boar.id }, s.t);
  arrive(s, g);
  assert.ok(s.terr.fights.length === 1 && g.fight, 'het gevecht is bezig');
  fightOver(s);
  assert.ok(!g.fight && !s.terr.fights.length, 'het gevecht is voorbij');
  assert.ok(s.res.food >= food + WILD.boar.loot.food - 1);
  assert.ok(s.terr.log.some((l) => l.kind === 'boar'));
  assert.throws(() => doFieldOrder(s, g.id, null, { type: 'boar', id: boar.id }, s.t), /niet meer/);
});

test('een klein groepje jaagt een everzwijn neer; dorpelingen jagen niet', () => {
  const s = terrTown();
  s.units = { spear: 3 };
  const boar = territory(s.terr.seed).boars[0];
  const g = doFieldSend(s, { units: { spear: 3 } }, null, { x: boar.x, y: boar.y }, null, s.t);
  arrive(s, g);
  doFieldOrder(s, g.id, null, { type: 'boar', id: boar.id }, s.t);
  arrive(s, g);
  fightOver(s);
  assert.ok(s.terr.log.some((l) => l.kind === 'boar'), 'gevangen');
  const left = s.field.find((x) => x.id === g.id) || { units: {} };
  assert.ok(left.units.spear >= 2, 'hooguit één speerdrager verloren');
  assert.ok(left.hp.spear.some((h) => h < 45), 'wie geraakt werd, heeft minder levenspunten');
  const v = doFieldSend(s, { villager: 'food' }, null, { x: boar.x, y: boar.y }, null, s.t);
  assert.throws(() => doFieldOrder(s, v.id, null, { type: 'boar', id: boar.id }, s.t), /Dorpelingen vechten niet/);
});

test('browser en server berekenen hetzelfde pad als de server het tijdstip van de klik gebruikt', () => {
  const base = terrTown();
  const at = 5000;
  // browser: meteen bij de klik
  const c = structuredClone(base);
  advance(c, at, 1);
  const gc = doFieldSend(c, { villager: 'food' }, null, { x: -6, y: 4 }, null, at);
  // server: krijgt de opdracht iets later binnen, met hetzelfde tijdstip
  const s = structuredClone(base);
  advance(s, at + 400, 1);
  const gs = doFieldSend(s, { villager: 'food' }, null, { x: -6, y: 4 }, null, at);
  assert.equal(gs.id, gc.id);
  assert.deepEqual(groupPos(gs, at + 2000), groupPos(gc, at + 2000));
  advance(c, at + 60000, 1); advance(s, at + 60000, 1);
  assert.deepEqual(s.field, c.field);
  assert.equal(s.terr.ex, c.terr.ex);
});

test('barbarenkamp verwoesten stopt de overvallen even', () => {
  const s = terrTown();
  s.units = { sword: 60 };
  const camp = territory(s.terr.seed).camp;
  const g = doFieldSend(s, { units: { sword: 60 } }, null, { x: camp.x, y: camp.y }, null, s.t);
  arrive(s, g);
  fightOver(s);
  assert.ok(s.terr.camp.down > s.t, 'kamp ligt in puin');
  assert.ok(s.terr.camp.next >= s.terr.camp.down, 'geen overval zolang het kamp plat ligt');
});

test('barbaren overvallen een onverdedigde stad (na 15 minuten waarschuwing)', () => {
  const s = terrTown();
  s.units = {};
  const at = s.terr.camp.next;
  assert.ok(at >= WILD.raid.firstHours * 3600000, 'niet in de eerste uren van een nieuwe stad (gemaakt op t = 0)');
  advance(s, at + 1, 1);
  const raid = s.terr.camp.raid;
  assert.ok(raid && raid.at === at + WILD.raid.warnMs, 'ze trekken naar je dorp');
  assert.ok(s.terr.log.some((l) => l.kind === 'raid-warn'), 'melding in je logboek');
  assert.ok(!s.terr.log.some((l) => l.kind === 'raid-lost' || l.kind === 'raid-won'), 'nog niet aangevallen');
  assert.equal(s.terr.camp.next, null, 'geen tweede overval tegelijk');
  advance(s, raid.at + 1, 1);
  const log = s.terr.log.find((l) => l.kind === 'raid-lost' || l.kind === 'raid-won');
  assert.ok(log, 'er was een overval');
  assert.equal(s.terr.camp.raids, 1);
  assert.equal(s.terr.camp.raid, null);
  assert.ok(s.terr.camp.next >= raid.at + WILD.raid.quietHours * 3600000, 'daarna even rust');
  assert.ok(raidSize(s) >= 3 && campSize(s) >= 4);
});

test('wilde dieren en barbaren kan je niet trainen', () => {
  const s = terrTown();
  assert.match(checkTrain(s, 'boar', 1), /Onbekende/);
  assert.match(checkTrain(s, 'barbarian', 1), /Onbekende/);
});

test('alles blijft gelijk tussen browser en server (stapsgewijs rekenen)', () => {
  const a = terrTown(9); const b = terrTown(9);
  for (const s of [a, b]) doFieldSend(s, { villager: 'wood' }, null, { x: 20, y: -10 }, null, s.t);
  advance(a, 80 * 3600000, 1);
  for (let t = 3600000; t <= 80 * 3600000; t += 3600000) advance(b, t, 1);
  assert.deepEqual(a.terr, b.terr);
  // grondstoffen: optellen in andere stukken geeft hooguit een afrondingsverschil in de laatste decimaal
  for (const k of Object.keys(a.res)) assert.ok(Math.abs(a.res[k] - b.res[k]) < 1e-6, `${k}: ${a.res[k]} ~ ${b.res[k]}`);
});

// ---------- volkeren ----------
import { CIVS, CIV_IDS, UNITS as U2 } from '../public/shared/rules.js';

test('elk volk heeft twee eigen eenheden die enkel in zijn kasteel getraind worden', () => {
  assert.equal(CIV_IDS.length, 5);
  for (const c of CIV_IDS) {
    assert.equal(CIVS[c].units.length, 2);
    for (const k of CIVS[c].units) { assert.equal(U2[k].civ, c); assert.equal(U2[k].queue, 'castle'); }
  }
  const s = newTownState(0, 'greek');
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  s.buildings.push({ id: 50, type: 'house', x: 1, y: 1, level: 3 }, { id: 51, type: 'house', x: 2, y: 1, level: 3 });
  assert.match(checkTrain(s, 'hoplite', 1), /kasteel/);
  s.buildings.find((b) => b.type === 'tc').level = 3;
  assert.equal(checkTrain(s, 'hoplite', 1), null);
  assert.match(checkTrain(s, 'samurai', 1), /ander volk/);
  doTrain(s, 'hoplite', 2, 0, 1);
  assert.equal(s.queues.castle[0].unit, 'hoplite');
  assert.ok(!s.queues.tc, 'dorpelingen en kasteel hebben elk hun eigen wachtrij');
});

test('bestaande steden krijgen een vast volk', () => {
  const a = newTownState(0); const b = newTownState(0);
  ensureTerritory(a, 17); ensureTerritory(b, 17);
  assert.ok(CIV_IDS.includes(a.civ));
  assert.equal(a.civ, b.civ);
  const c = newTownState(0, 'persia'); ensureTerritory(c, 17);
  assert.equal(c.civ, 'persia', 'een gekozen volk blijft');
});

test('speciale eigenschappen werken in gevechten', () => {
  const vsCav = { groups: [{ key: 'own', units: { knight: 20 } }] };
  const camel = resolveBattle({ attUnits: { camel: 20 }, ...vsCav });
  const rider = resolveBattle({ attUnits: { rider: 20 }, ...vsCav });
  assert.ok(camel.A > 20 * U2.camel.atk * 1.7, 'kamelen krijgen bonus tegen ruiterij');
  assert.ok(camel.A / U2.camel.atk > rider.A / U2.rider.atk);
  // falanx: minder verliezen dan gewone speerdragers bij hetzelfde verliespercentage
  const foe = { groups: [{ key: 'own', units: { spear: 30 } }] };
  const hop = resolveBattle({ attUnits: { hoplite: 40 }, ...foe });
  assert.ok(hop.attWins);
  assert.ok(hop.attLeft.hoplite > Math.round(40 * (1 - hop.attLoss)), 'hoplieten verliezen minder');
  // stenenwerpers tellen dubbel tegen muren
  const st = resolveBattle({ attUnits: { stonethrower: 6, knight: 200 }, groups: [{ key: 'own', units: { spear: 5 } }], wall: 2 });
  const rm = resolveBattle({ attUnits: { ram: 6, knight: 200 }, groups: [{ key: 'own', units: { spear: 5 } }], wall: 2 });
  assert.ok(st.wallDamage > rm.wallDamage);
  // leeuwenwacht verdedigt sterker, olifanten verlagen de verdediging
  const att = { attUnits: { sword: 50 } };
  assert.ok(resolveBattle({ ...att, groups: [{ key: 'own', units: { lionguard: 30 } }] }).D > resolveBattle({ ...att, groups: [{ key: 'own', units: { immortal: 30 } }] }).D * 1.2);
  const def = { groups: [{ key: 'own', units: { spear: 40 } }] };
  assert.ok(resolveBattle({ attUnits: { elephant: 10 }, ...def }).D < resolveBattle({ attUnits: { knight: 10 }, ...def }).D);
});

// ---------- gevechten mannetje per mannetje ----------
import { runFight, combatants } from '../public/shared/skirmish.js';


test('elke eenheid heeft levenspunten; betere eenheden hebben er meer', () => {
  assert.ok(U2.knight.hp > U2.rider.hp && U2.rider.hp > U2.spear.hp && U2.spear.hp > U2.villager.hp);
  assert.ok(U2.elephant.hp > U2.knight.hp);
  const f = { t0: 0, a: combatants({ spear: 3 }), b: combatants({ boar: 1 }) };
  const end = runFight(f).end;
  const half = runFight(f, end / 2);
  assert.ok(half.b[0].hp < U2.boar.hp && half.b[0].hp > 0, 'het everzwijn verliest geleidelijk levens');
  assert.deepEqual(runFight(f, end / 2), half, 'zelfde verloop in browser en server');
});

test('gevechten in je gebied: wie in de minderheid is, haalt toch vijanden neer en het duurt even', () => {
  const r = runFight({ t0: 0, a: combatants({ spear: 5 }), b: combatants({ barbarian: 8 }) });
  assert.ok(r.a.every((u) => u.hp <= 0), 'de kleine groep verliest');
  assert.ok(r.b.filter((u) => u.hp <= 0).length >= 2, 'maar neemt barbaren mee');
  assert.ok(r.end > 12000, `geen flits van een paar seconden (${r.end} ms)`);
  const big = runFight({ t0: 0, a: combatants({ spear: 20, archer: 10 }), b: combatants({ barbarian: 14 }) });
  assert.ok(big.b.every((u) => u.hp <= 0) && big.a.some((u) => u.hp > 0), 'een groot leger wint');
});

test('het barbarenkamp rond je stad is vrij makkelijk te verslaan', () => {
  const s = terrTown();
  const n = campSize(s);
  assert.ok(n <= 5, `klein kamp in het eerste tijdperk (${n})`);
  // ongeveer evenveel speerdragers als barbaren winnen, met hooguit een paar verliezen
  const r = runFight({ t0: 0, a: combatants({ spear: n }), b: combatants({ barbarian: n }) });
  assert.ok(r.b.every((u) => u.hp <= 0), 'de barbaren zijn verslagen');
  assert.ok(r.a.filter((u) => u.hp > 0).length >= n - 2, 'en je verliest bijna niemand');
  s.terr.camp.raids = 30;
  assert.equal(campSize(s), n, 'overvallen alleen maken het kamp niet sterker, de tijd wel');
});

test('barbaren vallen meteen aan wie hun kamp nadert, ook een dorpeling', () => {
  const s = terrTown();
  const camp = territory(s.terr.seed).camp;
  const v = doFieldSend(s, { villager: 'food' }, null, { x: camp.x, y: camp.y }, null, s.t);
  let seen = false;
  for (let t = s.t + 200; t <= v.t1 && !seen; t += 200) {
    advance(s, t, 1);
    if (v.fight) {
      seen = true;
      const p = groupPos(v, s.t);
      assert.ok(Math.hypot(p.x - camp.x, p.y - camp.y) > FIELD.aggro - 0.2, 'aan de rand van het kamp tegengehouden');
    }
  }
  assert.ok(seen, 'onderweg aangevallen');
  fightOver(s);
  assert.ok(!s.field.includes(v), 'de dorpeling heeft het niet overleefd');
  assert.ok(s.terr.log.some((l) => l.kind === 'camp-lost'));
});

test('een groep kan zich terugtrekken uit een gevecht', () => {
  const s = terrTown();
  s.units = { spear: 4 };
  const camp = territory(s.terr.seed).camp;
  const g = doFieldSend(s, { units: { spear: 4 } }, null, { x: camp.x, y: camp.y }, null, s.t);
  advance(s, g.t1, 1);
  assert.ok(g.fight);
  advance(s, s.t + 2500, 1);
  doFieldOrder(s, g.id, { x: 6, y: 10 }, null, s.t);
  assert.ok(!g.fight && s.field.includes(g), 'de groep loopt weg');
  arrive(s, g);
  assert.ok(!g.fight, 'niet opnieuw aangevallen op de terugweg');
  assert.ok(Object.values(g.hp).flat().some((h) => h < U2.spear.hp), 'met schrammen');
});

// ---------- grond, muren en groepen ----------
import { checkBuyLot, doBuyLot, isBuildable as canBuild, doPlaceWalls, wallEnclosed, effectiveWall, canPlaceAt as canPut, doPlaceGate, doRemoveWalls, doDemolish, gateList, homeSight, exploredNow } from '../public/shared/sim.js';
import { LAND } from '../public/shared/rules.js';

test('grond bijkopen per lot van 4 x 4, aansluitend en elke keer duurder', () => {
  const s = terrTown();
  s.res = { food: 3000, wood: 3000, stone: 3000, gold: 3000 };
  assert.match(checkBuyLot(s, 1, 1), /al bouwen/, 'binnen het vierkant hoef je niets te kopen');
  assert.match(checkBuyLot(s, 5, 5), /aansluiten/);
  assert.equal(canBuild(s, 12, 0), false);
  const wood = s.res.wood;
  doBuyLot(s, 3, 0); // tegels 12..15 x 0..3
  assert.ok(canBuild(s, 12, 0) && canBuild(s, 15, 3));
  assert.ok(wood - s.res.wood >= LAND.cost.wood);
  const w2 = s.res.wood;
  doBuyLot(s, 4, 0); // sluit aan op het vorige lot
  assert.ok(w2 - s.res.wood > wood - w2, 'het tweede lot is duurder');
  assert.ok(canPut(s, 'house', 13, 1), 'je kan er bouwen');
});

test('oorlogsmist: je bouwgrond (ook loten), je muren en een rand van 3 tegels zie je altijd', () => {
  const s = terrTown();
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  const seen = (i, j) => homeSight(s)[tileIndex(i, j)] === 1;
  const known = (i, j) => exHas(exploredNow(s, s.t), i, j);
  assert.ok(seen(14, 1) && !seen(16, 1), 'zonder loten: 3 tegels rond het bouwvierkant');
  doBuyLot(s, 3, 0); doBuyLot(s, 4, 0); // tegels 12..19 x 0..3
  assert.ok(seen(19, 1), 'het verste lot ligt niet in de mist');
  assert.ok(seen(22, 1) && !seen(23, 1), 'de mist begint 3 tegels voorbij je bouwgrond');
  assert.ok(known(22, 1) && !known(23, 1), 'wat je ziet, is ook ontdekt (server en browser)');
  // een muur op het lot: de mist begint 3 tegels voorbij de muur
  s.buildings.find((b) => b.type === 'wall').level = 1;
  doPlaceWalls(s, [[19, 0], [19, 1], [19, 2], [19, 3]]);
  assert.ok(seen(22, 2) && !seen(24, 2));
});

test('muren tegel per tegel; een gesloten muur verdedigt volledig', () => {
  const s = terrTown();
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  assert.throws(() => doPlaceWalls(s, [[0, 0]]), /stadsmuur/);
  s.buildings.find((b) => b.type === 'wall').level = 2;
  const ring = [];
  for (let i = 0; i < 12; i++) { ring.push([i, 0], [i, 11]); if (i > 0 && i < 11) ring.push([0, i], [11, i]); }
  doPlaceWalls(s, ring.slice(0, 40));
  assert.equal(wallEnclosed(s), false, 'nog een gat');
  assert.ok(effectiveWall(s) < 2);
  // helemaal dicht zonder poort mag niet: eerst een poort in het laatste gat
  assert.throws(() => doPlaceWalls(s, ring.slice(40)), /poort/);
  const rest = ring.slice(40).filter(([i, j]) => !(i === 0 && j === 10));
  doPlaceWalls(s, rest);
  assert.equal(wallEnclosed(s), false, 'nog één gat');
  doPlaceGate(s, 0, 10);
  assert.deepEqual([...s.gates].sort((a, b) => a - b), [tileIndex(0, 9), tileIndex(0, 10)], 'een poort van 2 tegels (het muurstuk ernaast hoort erbij)');
  assert.equal(wallEnclosed(s), true, 'een dichte poort sluit de stad');
  assert.equal(effectiveWall(s), 2);
  assert.equal(canPut(s, 'house', 0, 0), false, 'niet bouwen op een muur');
  assert.equal(canPut(s, 'house', 0, 10), false, 'niet bouwen op een poort');
  assert.throws(() => doPlaceWalls(s, [[0, 0]]), /al een muur/);
  assert.throws(() => doPlaceGate(s, 0, 0), /recht stuk/, 'niet in een hoek');
});

test('troepen lopen rond een los stuk muur en rond water; een doel in het water = zo dicht mogelijk aan de oever', () => {
  const s = terrTown();
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  s.buildings.find((b) => b.type === 'wall').level = 1;
  doPlaceWalls(s, [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2]]); // een muur dwars door de stad, open aan de zijkanten
  s.units = { spear: 2 };
  const g = doFieldSend(s, { units: { spear: 2 } }, { x: 5.5, y: 3.5 }, { x: 5.5, y: 0.5 }, null, s.t);
  const walls = new Set(s.walls);
  assert.ok(g.via && g.via.length, 'een omweg');
  assert.ok(routeTiles(g).every(([i, j]) => !walls.has(tileIndex(i, j))), 'niet door de muur');
  arriveAll(s, g);
  assert.equal(g.x1, 5.5); assert.equal(g.y1, 0.5);
  // naar het midden van de vijver: blijft aan de oever staan
  const terr = territory(s.terr.seed);
  const p = terr.pond;
  doFieldOrder(s, g.id, { x: p.x, y: p.y }, null, s.t);
  assert.ok(routeTiles(g).every(([i, j]) => terr.tiles[tileIndex(i, j)] !== TILE.WATER), 'niet door het water');
  arriveAll(s, g);
  assert.notEqual(terr.tiles[tileIndex(Math.floor(g.x1), Math.floor(g.y1))], TILE.WATER);
  assert.ok(Math.hypot(g.x1 - p.x, g.y1 - p.y) < p.r + 1.6, `aan de oever (${g.x1}, ${g.y1})`);
});

test('in een ommuurde stad gaan troepen enkel via de poort naar buiten en binnen', () => {
  const s = terrTown();
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  s.buildings.find((b) => b.type === 'wall').level = 1;
  const ring = [];
  for (let i = 0; i < 12; i++) { ring.push([i, 0], [i, 11]); if (i > 0 && i < 11) ring.push([0, i], [11, i]); }
  doPlaceWalls(s, ring.filter(([i, j]) => !(i === 5 && j === 11)));
  doPlaceGate(s, 5, 11);
  s.units = { spear: 3 };
  const g = doFieldSend(s, { units: { spear: 3 } }, null, { x: 15.5, y: 15.5 }, null, s.t);
  // de poort is 2 tegels breed (5 en 6, onderaan): de route gaat erdoor en nooit door een muur
  assert.equal(s.gates.length, 2);
  const walls = new Set(s.walls); const gates = new Set(s.gates);
  const out = routeTiles(g).map(([i, j]) => tileIndex(i, j));
  assert.ok(out.every((k) => !walls.has(k)), 'niet door de muur');
  assert.ok(out.some((k) => gates.has(k)), 'door de poort');
  arriveAll(s, g);
  assert.equal(g.x1, 15.5); assert.equal(g.y1, 15.5);
  assert.ok(!g.pending && !g.via, 'aangekomen');
  // en terug naar huis: weer via de poort
  doFieldOrder(s, g.id, null, { type: 'home' }, s.t);
  const back = routeTiles(g).map(([i, j]) => tileIndex(i, j));
  assert.ok(back.every((k) => !walls.has(k)) && back.some((k) => gates.has(k)), 'terug via de poort');
  // binnen blijven = rechtstreeks
  s.units = { spear: 1 };
  const h = doFieldSend(s, { units: { spear: 1 } }, null, { x: 8.5, y: 8.5 }, null, s.t);
  assert.ok(!h.via && h.x1 === 8.5, 'binnen de muren: rechtstreeks');
  // een poort afbreken = een gat (van 2 tegels); dan is de stad niet meer dicht
  doRemoveWalls(s, [[5, 11]]);
  assert.equal(wallEnclosed(s), false);
  assert.equal((s.gates || []).length, 0);
});

test('gebouwen afbreken: deel van de kosten terug, dorpelingen worden vrij', () => {
  const s = terrTown();
  const farm = s.buildings.find((b) => b.type === 'farm' && b.level > 0) || (() => { const b = { id: s.nextId++, type: 'farm', x: 7, y: 7, level: 1 }; s.buildings.push(b); return b; })();
  farm.level = 2;
  s.villagers.food = slots(s).food;
  const idle = s.villagers.idle;
  const before = { ...s.res };
  const refund = doDemolish(s, farm.id);
  assert.ok(!s.buildings.includes(farm));
  assert.ok(refund.wood > 0 && s.res.wood >= before.wood, 'hout terug');
  assert.ok(s.villagers.food <= slots(s).food, 'niet meer werkers dan plaatsen');
  assert.ok(s.villagers.idle > idle, 'die werkers zijn nu vrij');
  assert.throws(() => doDemolish(s, s.buildings.find((b) => b.type === 'tc').id), /stadscentrum/);
});

test('meerdere dorpelingen tegelijk op pad sturen', () => {
  const s = terrTown();
  const before = s.villagers.food;
  const g = doFieldSend(s, { villager: 'food', n: 2 }, null, { x: 4, y: 13 }, null, s.t);
  assert.equal(g.units.villager, 2);
  assert.equal(s.villagers.food, before - 2);
});

// ---------- belegeringen die je zelf bestuurt ----------
import { createBattle, stepTo, giveOrder, queueOrder, battleOutcome, FB, nav, cellOf, FORMS, formsFor, slotOffsets, formDims, membersMap, _t as FBT } from '../public/shared/fieldbattle.js';

// een stad in het IJzertijdperk met een stenen ring, een poort per kant en twee wachttorens
function siegeTown({ walls = true } = {}) {
  const s = newTownState(0, 'greece');
  s.buildings[0].level = 3;
  s.buildings.find((b) => b.type === 'wall').level = walls ? 3 : 0;
  let id = 10;
  for (const [type, x, y, level] of [['house', 1, 1, 2], ['house', 2, 1, 2], ['barracks', 3, 8, 2], ['farm', 9, 9, 1], ['tower', 0, 10, 2], ['tower', 11, 0, 2]]) s.buildings.push({ id: id++, type, x, y, level });
  if (walls) {
    s.walls = []; s.gates = [];
    for (let i = -2; i <= 13; i++) for (const j of [-2, 13]) (i === 6 ? s.gates : s.walls).push(tileIndex(i, j));
    for (let j = -1; j <= 12; j++) for (const i of [-2, 13]) (j === 6 ? s.gates : s.walls).push(tileIndex(i, j));
  }
  return s;
}
function siege(extra = {}) {
  return createBattle({
    kind: 'town', att: { sword: 20, archer: 10, ram: 2 }, defGroups: [{ key: 'home', units: { spear: 12, archer: 8 } }],
    town: siegeTown(extra), townId: 7, dir: { x: -1, y: 0.1 }, aiAtt: true, aiDef: true, now: 1000, ...extra,
  });
}

test('belegering: deterministisch, ook in stukjes en na JSON heen en terug (zoals de server bewaart)', () => {
  const a = siege({ aiAtt: false });
  let b = siege({ aiAtt: false });
  const order = (st) => {
    if (st.n <= 30 && st.n + 12 > 30) queueOrder(st, 0, null, { ready: true }, 30);
    if (st.n <= 400 && st.n + 12 > 400) queueOrder(st, 0, st.units.filter((u) => u.s === 0).map((u) => u.id), { charge: true }, 400, 'c1');
  };
  for (let t = 1000; t < 1000 + 150000; t += 1200) {
    order(a); stepTo(a, t);
    order(b); stepTo(b, t, 40); b = JSON.parse(JSON.stringify(b));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
});

test('belegering: de slag gebeurt in de echte stad (gebouwen, muren, poorten, torens)', () => {
  const st = siege();
  const nv = nav(st);
  const at = (i, j) => st.grid[cellOf(st, i + 0.5, j + 0.5)];
  assert.equal(at(5, 5), 'b', 'het stadscentrum staat in de weg');
  assert.equal(at(-2, 3), 'w');
  assert.equal(at(6, -2), 'g');
  assert.equal(st.units.filter((u) => u.k === 'tower').length, 2);
  assert.ok(st.enc, 'de stad is helemaal ommuurd');
  // de aanvaller kan niet door de poort, de verdediger wel
  const gate = cellOf(st, 6.5, -1.5);
  assert.equal(nv.p0[gate], 0); assert.ok(nv.p1[gate] > 0);
  const outside = cellOf(st, -6.5, 5.5); const inner = cellOf(st, 6.5, 8.5);
  assert.notEqual(nv.lab0[outside], nv.lab0[inner], 'buiten en binnen zijn voor de aanvaller gescheiden');
  assert.equal(nv.lab1[outside], nv.lab1[inner], 'de verdediger gaat via de poort naar buiten');
});

test('belegering: aanvaller stelt zich op aan zijn kant, verdediger zet schutters op de muur aan die kant', () => {
  for (const dir of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }]) {
    const st = createBattle({ kind: 'town', att: { sword: 12, ram: 1 }, defGroups: [{ key: 'home', units: { spear: 6, archer: 8 } }], town: siegeTown(), townId: 7, dir, aiAtt: true, aiDef: true, now: 0 });
    const nv = nav(st);
    const proj = (u) => (u.x - st.plaza.x) * dir.x + (u.y - st.plaza.y) * dir.y;
    for (const u of st.units.filter((x) => x.s === 0)) assert.ok(proj(u) >= st.zmin - 0.5 && proj(u) > 8, 'aanvaller aan zijn eigen kant, buiten de muur');
    const archers = st.units.filter((u) => u.s === 1 && u.k === 'archer');
    for (const a of archers) assert.equal(nv.p1[cellOf(st, a.x, a.y)], 3, 'schutter op de muur');
    assert.ok(archers.every((a) => proj(a) > 4), 'op de muur aan de kant van de aanval');
    const spears = st.units.filter((u) => u.s === 1 && u.k === 'spear');
    assert.ok(spears.every((u) => proj(u) > 2), 'voetvolk achter de bedreigde poort');
  }
});

test('belegering: muren houden de aanvaller tegen tot er een bres is; daarna verovert hij de stad', () => {
  const st = createBattle({ kind: 'town', att: { sword: 30, ram: 3 }, defGroups: [{ key: 'home', units: {} }], town: siegeTown(), townId: 7, dir: { x: 0, y: 1 }, aiAtt: true, aiDef: true, now: 0 });
  const nv = nav(st);
  stepTo(st, 20000);
  // na 20 s staat er nog niemand binnen (de muur is nog heel of net gebroken)
  for (const u of st.units.filter((x) => x.s === 0 && x.hp > 0)) assert.ok(!(nv.ins && nv.ins[cellOf(st, u.x, u.y)] === '1') || st.walls.some((w) => w.hp <= 0));
  stepTo(st, FB.maxMs + 100000);
  const o = battleOutcome(st);
  assert.equal(o.attWins, true);
  assert.ok(o.wallsBroken >= 1, 'er werd een bres geslagen');
  assert.ok(st.units.some((u) => u.k === 'tower' && u.at >= 0), 'de torens schoten');
});

test('belegering: een gevecht duurt minuten, geen seconden', () => {
  const st = createBattle({ kind: 'town', att: { sword: 15, archer: 8, rider: 5 }, defGroups: [{ key: 'home', units: { spear: 12, archer: 8 } }], town: siegeTown({ walls: false }), townId: 7, dir: { x: -1, y: 0 }, aiAtt: true, aiDef: true, now: 0 });
  stepTo(st, FB.maxMs + 100000);
  assert.ok(st.over != null);
  assert.ok((st.n - st.ph1) * FB.tick > 30000, `duurde ${(st.n - st.ph1) * FB.tick} ms`);
});

test('belegering: opstelling, bevelen op een vaste tik, terugtrekken', () => {
  const st = siege({ aiAtt: false });
  assert.equal(st.phase, 'deploy');
  const mine = st.units.filter((u) => u.s === 0 && u.k === 'sword').map((u) => u.id);
  // tijdens de opstelling enkel binnen je eigen strook
  giveOrder(st, 0, mine, { x: 6, y: 6 });
  const nv = nav(st);
  for (const id of mine) { const u = st.units.find((x) => x.id === id); assert.ok(!(nv.ins && nv.ins[cellOf(st, u.x, u.y)] === '1'), 'niet binnen de muren'); }
  queueOrder(st, 0, null, { ready: true }, 5);
  stepTo(st, 1000 + 2000);
  assert.equal(st.phase, 'battle');
  // een bevel voor een latere tik gebeurt pas dan
  const sw = st.units.find((u) => u.id === mine[0]);
  const reg = st.regs[sw.sq - 1];
  queueOrder(st, 0, [sw.id], { x: -6, y: 0 }, st.n + 10);
  stepTo(st, st.t + 500);
  assert.equal(reg.st, 'hold');
  stepTo(st, st.t + 800);
  assert.equal(reg.st, 'move', 'het hele regiment vertrekt');
  // de verdediger kan aanvallers niet besturen, ongeldige bevelen veranderen niets
  const before = JSON.stringify(st.units);
  giveOrder(st, 1, mine, { x: 3, y: 3 });
  giveOrder(st, 0, mine, { x: NaN, y: 3 });
  giveOrder(st, 0, mine, { target: 99999 });
  giveOrder(st, 1, null, { retreat: true });
  assert.equal(JSON.stringify(st.units), before);
  giveOrder(st, 0, null, { retreat: true });
  assert.equal(st.over, 1);
  assert.equal(battleOutcome(st).retreat, true);
});

test('belegering: grote legers worden samengevoegd tot hooguit maxPerSide figuren; roverskamp', () => {
  const st = createBattle({ kind: 'camp', campSeed: 50003, att: { spear: 500, archer: 300 }, defGroups: [{ key: 'camp', units: { barbarian: 120 } }], dir: { x: 1, y: 1 }, aiAtt: true, aiDef: true, now: 0 });
  assert.ok(st.units.filter((u) => u.s === 0).length <= FB.maxPerSide + 2);
  assert.ok(st.tents.length > 0);
  const o = battleOutcome(st);
  assert.equal(o.attLeft.spear, 500);
  assert.equal(o.defLeft.camp.barbarian, 120);
  stepTo(st, FB.maxMs + 100000);
  assert.equal(battleOutcome(st).attWins, true);
});

// ---------- één troep uit een groep sturen ----------
import { doFieldSplit } from '../public/shared/sim.js';

test('één soldaat uit een groep apart wegsturen; de rest loopt gewoon verder', () => {
  const s = terrTown();
  s.units = { spear: 5, archer: 2 };
  const g = doFieldSend(s, { units: { spear: 5, archer: 2 } }, null, { x: 6, y: 14 }, null, s.t);
  advance(s, s.t + 1500, 1);
  const before = groupPos(g, s.t);
  const ng = doFieldSplit(s, g.id, { spear: 1 }, { x: 10, y: 6 }, null, s.t);
  assert.notEqual(ng.id, g.id);
  assert.deepEqual(ng.units, { spear: 1 });
  assert.deepEqual(g.units, { spear: 4, archer: 2 });
  assert.equal(g.x1, 6); assert.equal(g.y1, 14);
  assert.ok(Math.hypot(ng.x0 - before.x, ng.y0 - before.y) < 1e-9, 'vertrekt waar de groep nu is');
  // alles van een soort uit een gemengde groep, en een hele groep = gewone opdracht
  const ar = doFieldSplit(s, g.id, { archer: 2 }, { x: 8, y: 8 }, null, s.t);
  assert.deepEqual(ar.units, { archer: 2 });
  assert.deepEqual(g.units, { spear: 4 });
  const same = doFieldSplit(s, g.id, { spear: 4 }, { x: 9, y: 9 }, null, s.t);
  assert.equal(same, g);
  assert.equal(s.field.length, 3);
});

test('één soldaat uit een gevecht halen: de rest vecht verder', () => {
  const s = terrTown();
  s.units = { spear: 6 };
  const camp = territory(s.terr.seed).camp;
  const g = doFieldSend(s, { units: { spear: 6 } }, null, { x: camp.x, y: camp.y }, null, s.t);
  advance(s, g.t1, 1);
  assert.ok(g.fight, 'in gevecht');
  advance(s, s.t + 3000, 1);
  const ng = doFieldSplit(s, g.id, { spear: 1 }, { x: 6, y: 10 }, null, s.t);
  assert.equal(Object.values(ng.units).reduce((a, b) => a + b, 0), 1);
  assert.ok(!ng.fight && ng.pending, 'hij loopt weg');
  assert.ok(g.fight, 'de rest vecht verder');
  const f = s.terr.fights.find((x) => x.id === g.fight);
  assert.ok(f.a.every((u) => u.g === g.id), 'enkel de achterblijvers staan nog in het gevecht');
  assert.equal(f.a.length, 5);
});

test('een leger met een gezamenlijk tempo komt samen aan', () => {
  const s = terrTown();
  s.units = { spear: 4, rider: 2 };
  const a = doFieldSend(s, { units: { spear: 4 } }, null, { x: 6, y: 12 }, null, s.t, 1.1);
  const b = doFieldSend(s, { units: { rider: 2 } }, null, { x: 6.5, y: 12 }, null, s.t, 1.1);
  const da = Math.hypot(a.x1 - a.x0, a.y1 - a.y0); const db = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  assert.ok(Math.abs((a.t1 - a.t0) / da - (b.t1 - b.t0) / db) < 2, 'ruiters lopen even snel als de speerdragers');
  // zonder tempo is de ruiter veel sneller
  s.units = { rider: 1 };
  const c = doFieldSend(s, { units: { rider: 1 } }, null, { x: 6.5, y: 12 }, null, s.t);
  assert.ok(c.t1 - c.t0 < b.t1 - b.t0);
});

test('een oude, volledig ommuurde stad zonder poort krijgt er automatisch een', () => {
  const s = terrTown();
  s.buildings.find((b) => b.type === 'wall').level = 1;
  s.walls = [];
  for (let i = 0; i < 12; i++) { s.walls.push(tileIndex(i, 0), tileIndex(i, 11)); if (i > 0 && i < 11) s.walls.push(tileIndex(0, i), tileIndex(11, i)); }
  delete s.gates;
  ensureTerritory(s, s.terr.seed);
  assert.equal((s.gates || []).length, 2, 'een poort van 2 tegels');
  assert.equal(wallEnclosed(s), true, 'en nog steeds dicht');
});

test('poorten zijn 2 tegels breed: oude poorten worden verbreed, afbreken gaat in zijn geheel, max. 4 poorten', () => {
  const s = terrTown();
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  s.buildings.find((b) => b.type === 'wall').level = 1;
  s.walls = [];
  for (let i = 0; i < 12; i++) { s.walls.push(tileIndex(i, 0), tileIndex(i, 11)); if (i > 0 && i < 11) s.walls.push(tileIndex(0, i), tileIndex(11, i)); }
  // een oude poort van 1 tegel
  s.walls = s.walls.filter((x) => x !== tileIndex(5, 0)); s.gates = [tileIndex(5, 0)];
  ensureTerritory(s, s.terr.seed);
  const g = gateList(s);
  assert.equal(g.length, 1); assert.equal(g[0].w, 2, 'verbreed tot 2 tegels'); assert.equal(g[0].ax, 'x');
  assert.equal(wallEnclosed(s), true);
  // nog drie poorten, de vijfde mag niet
  doPlaceGate(s, 0, 4); doPlaceGate(s, 11, 4); doPlaceGate(s, 5, 11);
  assert.equal(gateList(s).length, 4);
  assert.throws(() => doPlaceGate(s, 0, 8), /4 poorten/);
  // één tegel van een poort afbreken = de hele poort weg
  doRemoveWalls(s, [[0, 4]]);
  assert.equal(gateList(s).length, 3);
  assert.ok(!s.gates.includes(tileIndex(0, 4)) && !s.gates.includes(tileIndex(0, 5)) && !s.gates.includes(tileIndex(0, 3)));
});

// ---------- meldingen op je gsm (web push) ----------
import { encryptPayload, vapidHeader, validPushEndpoint, b64u, unb64u } from '../functions/lib/push.js';

test('meldingen: enkel echte meldingsdiensten, geldige VAPID-handtekening, versleutelde inhoud', async () => {
  assert.ok(validPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(validPushEndpoint('https://web.push.apple.com/QGs'));
  assert.ok(!validPushEndpoint('https://evil.example.com/fcm.googleapis.com'));
  assert.ok(!validPushEndpoint('http://fcm.googleapis.com/x'));
  const subtle = crypto.subtle;
  // VAPID: handtekening klopt met de publieke sleutel
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = { pub: b64u(await subtle.exportKey('raw', kp.publicKey)), priv: await subtle.exportKey('jwk', kp.privateKey) };
  const h = await vapidHeader(keys, 'https://fcm.googleapis.com/fcm/send/abc', 1000);
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  const [a, b, sig] = jwt.split('.');
  assert.equal(JSON.parse(new TextDecoder().decode(unb64u(b))).aud, 'https://fcm.googleapis.com');
  const pk = await subtle.importKey('raw', unb64u(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, unb64u(sig), new TextEncoder().encode(`${a}.${b}`)));
  // versleuteling (RFC 8291): het 'toestel' kan het terug ontsleutelen
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const body = await encryptPayload({ p256dh: b64u(uaPub), auth: b64u(auth) }, { title: 'Je leger komt over 2:00 aan' });
  const salt = body.slice(0, 16); const idlen = body[20]; const asPub = body.slice(21, 21 + idlen); const ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const hk = async (s, ikm, info, n) => new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const te = new TextEncoder();
  const ikm = await hk(auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...uaPub, ...asPub]), 32);
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  assert.equal(plain[plain.length - 1], 2, 'laatste blok');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.slice(0, -1))), { title: 'Je leger komt over 2:00 aan' });
});

import { notifyDue } from '../functions/lib/push.js';
import { readFileSync, readdirSync } from 'node:fs';

// D1-achtige database in het geheugen (node:sqlite) met alle migraties
async function memoryD1() {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => raw.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => {
      const r = raw.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (list) => { const out = []; for (const st of list) out.push(await st.run()); return out; },
  };
}

test('meldingen: ±2 min vooraf met geluid, ±1 min vooraf een stille bijwerking, nooit dubbel', async () => {
  const db = await memoryD1();
  const ins = (sql, ...a) => db.raw.prepare(sql).run(...a);
  ins("INSERT INTO players (id, name, pass_hash, salt, team_id, created_at) VALUES (1, 'Aan', 'x', 'x', 1, 0), (2, 'Ver', 'x', 'x', 2, 0)");
  ins("INSERT INTO towns (id, player_id, name, x, y, state) VALUES (10, 1, 'Aanstad', 0, 0, '{}'), (20, 2, 'Verstad', 5, 5, '{}')");
  ins("INSERT INTO push_subs (player_id, endpoint, p256dh, auth, created_at) VALUES (?, 'https://fcm.googleapis.com/fcm/send/a', ?, ?, 0), (?, 'https://fcm.googleapis.com/fcm/send/b', ?, ?, 0)",
    1, ...(await fakeDevice()), 2, ...(await fakeDevice()));
  const T = 1_000_000;
  ins("INSERT INTO marches (id, player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, to_x, to_y, units, depart_at, arrive_at, status) VALUES (7, 1, 1, 'attack', 10, 0, 0, 'town', 20, 5, 5, '{}', 0, ?, 'out')", T);
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, urgency: init.headers.Urgency }); return new Response(null, { status: 201 }); };
  try {
    assert.equal(await notifyDue(db, T - 200000), 0, 'te vroeg');
    assert.equal(await notifyDue(db, T - 140000), 2, 'aanvaller en verdediger');
    assert.equal(await notifyDue(db, T - 120000), 0, 'niet dubbel');
    assert.equal(await notifyDue(db, T - 70000), 2, 'bijwerking');
    assert.equal(await notifyDue(db, T - 30000), 0, 'daarna niets meer');
    assert.deepEqual(sent.map((s) => s.url.slice(-1)), ['a', 'b', 'a', 'b']);
    // komt de eerste kans pas laat (<80 s), dan meteen de laatste melding
    ins("INSERT INTO marches (id, player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, to_x, to_y, units, depart_at, arrive_at, status) VALUES (8, 1, 1, 'attack', 10, 0, 0, 'camp', 1, 2, 2, '{}', 0, ?, 'out')", T + 500000);
    assert.equal(await notifyDue(db, T + 450000), 1, 'kamp: enkel de aanvaller');
    assert.equal(db.raw.prepare('SELECT notified FROM marches WHERE id = 8').get().notified, 2);
    assert.equal(await notifyDue(db, T + 460000), 0);
  } finally { globalThis.fetch = realFetch; }
});

async function fakeDevice() {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return [b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), b64u(crypto.getRandomValues(new Uint8Array(16)))];
}

// ---------- vrede per speler ----------
import { handle } from '../functions/lib/routes.js';
import { peaceEnd, peaceBlock, phaseOf, worldTimes } from '../functions/lib/game.js';

test('vrede: 24 uur per speler vanaf zijn start, daarna kan je eender wanneer aanvallen', () => {
  const H = 3600000;
  const w = { start_at: 1000 * H, prep_ms: 24 * H, war_ms: 28 * 24 * H };
  assert.equal(worldTimes(w).warEnd, 1000 * H + 28 * 24 * H);
  assert.equal(phaseOf(w, 999 * H), 'lobby');
  assert.equal(phaseOf(w, 1000 * H), 'war', 'geen gezamenlijke vredestijd meer');
  assert.equal(phaseOf(w, 1000 * H + 28 * 24 * H), 'ended');
  // aangemeld vóór de start: vrede vanaf de start; later aangemeld: vanaf de inschrijving
  assert.equal(peaceEnd(w, 990 * H), 1024 * H);
  assert.equal(peaceEnd(w, 1100 * H), 1124 * H);
  const old = 990 * H;
  const nieuw = 1100 * H;
  assert.equal(peaceBlock(w, old, old, 1030 * H, 1031 * H), null, 'na 24 uur mag het');
  assert.match(peaceBlock(w, old, old, 1010 * H, 1011 * H), /Je hebt nog vrede/);
  assert.match(peaceBlock(w, old, nieuw, 1110 * H, 1111 * H), /net begonnen/);
  assert.equal(peaceBlock(w, old, nieuw, 1110 * H, 1124 * H), null, 'mag vertrekken als het na de vrede aankomt');
  assert.match(peaceBlock(w, nieuw, old, 1110 * H, 1123.9 * H), /Je hebt nog vrede/, 'ook wie zelf nog vrede heeft');
});

test('vrede: de migratie houdt het einde van een lopend seizoen gelijk', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort();
  const mig = files.indexOf('0004_peace_per_player.sql');
  assert.ok(mig > 0);
  for (const f of files.slice(0, mig)) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  raw.prepare('INSERT INTO world (id, seed, size, start_at, prep_ms, war_ms, created_at) VALUES (1, 1, 56, 5000, ?, ?, 0)')
    .run(21 * 86400000, 7 * 86400000);
  for (const f of files.slice(mig)) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  const w = raw.prepare('SELECT * FROM world').get();
  assert.equal(w.prep_ms, 86400000);
  assert.equal(worldTimes(w).warEnd, 5000 + 28 * 86400000);
});

test('vrede: /march weigert een aanval op of door een speler met vrede', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  assert.equal((await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 1, seed: 7 })).status, 200);
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'egypt' });
  const b = await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'egypt' });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(b.status, 200, JSON.stringify(b.data));
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql("UPDATE towns SET state = json_set(state, '$.units.spear', 20)");
  const bert = db.raw.prepare("SELECT t.id FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = 'Bert'").get().id;
  const attack = () => call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: bert, units: { spear: 5 } }, a.cookie);

  // allebei net begonnen: vrede
  let r = await attack();
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Je hebt nog vrede/);
  const st = await call('GET', '/state', null, a.cookie);
  assert.ok(st.data.me.peaceEnd > now, 'de browser kent het einde van je vrede');
  const map = await call('GET', '/map', null, a.cookie);
  assert.ok(map.data.towns.every((t) => t.peaceEnd > now));

  // Anna speelt al 2 dagen, Bert is nieuw
  sql("UPDATE players SET created_at = ? WHERE name = 'Anna'", now - 2 * 86400000);
  r = await attack();
  assert.equal(r.status, 400);
  assert.match(r.data.error, /net begonnen/);

  // allebei langer dan 24 uur bezig: aanvallen mag, eender wanneer
  sql("UPDATE players SET created_at = ? WHERE name = 'Bert'", now - 25 * 3600000);
  r = await attack();
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS c FROM marches WHERE kind = 'attack'").get().c, 1);
});

// ---------- regimenten en formaties (zoals in Rome: Total War) ----------
test('regimenten: troepen per soort in regimenten van hooguit FB.squad, gelijk verdeeld', () => {
  const st = createBattle({ kind: 'town', att: { sword: 13, archer: 5 }, defGroups: [{ key: 'home', units: { spear: 30 } }], town: siegeTown(), townId: 7, dir: { x: -1, y: 0 }, aiAtt: true, aiDef: true, now: 0 });
  const M = membersMap(st);
  const sizes = (k) => st.regs.filter((r) => r.k === k).map((r) => M.get(r.id).length).sort((a, b) => a - b);
  assert.deepEqual(sizes('sword'), [6, 7]);
  assert.deepEqual(sizes('archer'), [5]);
  assert.deepEqual(sizes('spear'), [10, 10, 10]);
  for (const u of st.units) if (u.k !== 'tower') assert.equal(st.regs[u.sq - 1].k, u.k, 'elke soldaat hoort bij een regiment van zijn soort');
});

test('formaties: vorm, plaatsen en wie welke formatie kan aannemen', () => {
  for (const f of Object.keys(FORMS)) {
    for (const m of [1, 4, 7, 12]) {
      const o = slotOffsets(f, m);
      assert.equal(o.length, m);
      assert.equal(new Set(o.map((p) => `${p.a},${p.b}`)).size, m, `${f} ${m}: elke plaats één keer`);
    }
  }
  const line = formDims('line', 12); const block = formDims('block', 12);
  assert.ok(line.w > line.d, 'een linie is breder dan diep');
  assert.ok(block.d > block.w, 'een blok is dieper dan breed');
  const wedge = slotOffsets('wedge', 10);
  assert.equal(wedge.filter((p) => p.a === Math.max(...wedge.map((q) => q.a))).length, 1, 'de wig heeft één punt vooraan');
  assert.deepEqual(formsFor('sword'), ['line', 'block', 'wedge', 'loose', 'ring']);
  assert.ok(!formsFor('archer').includes('wedge'));
  assert.ok(formsFor('knight').includes('wedge') && !formsFor('knight').includes('ring'));
  assert.deepEqual(formsFor('ram'), []);
});

test('regimenten: een bevel verplaatst het regiment als één blok, in formatie en met de juiste richting', () => {
  const st = createBattle({ kind: 'town', att: { sword: 12 }, defGroups: [{ key: 'home', units: { spear: 1 } }], town: siegeTown({ walls: false }), townId: 7, dir: { x: -1, y: 0 }, aiAtt: false, aiDef: false, now: 0 });
  queueOrder(st, 0, null, { ready: true }, 0); queueOrder(st, 1, null, { ready: true }, 0);
  stepTo(st, 300);
  const list = st.units.filter((u) => u.s === 0);
  const reg = st.regs[list[0].sq - 1];
  const c0 = { x: list.reduce((a, u) => a + u.x, 0) / 12, y: list.reduce((a, u) => a + u.y, 0) / 12 };
  // 8 tegels naar het noorden, met het front naar het oosten (zoals een getrokken lijn)
  queueOrder(st, 0, [list[0].id], { x: c0.x, y: c0.y - 8, fx: 1, fy: 0, w: 4 }, st.n);
  let maxSpread = 0;
  for (let k = 0; k < 150; k++) {
    stepTo(st, st.t + FB.tick);
    const c = { x: list.reduce((a, u) => a + u.x, 0) / 12, y: list.reduce((a, u) => a + u.y, 0) / 12 };
    if (k > 25 && reg.st === 'move') maxSpread = Math.max(maxSpread, ...list.map((u) => Math.hypot(u.x - c.x, u.y - c.y)));
  }
  assert.equal(reg.st, 'hold', 'aangekomen');
  assert.ok(maxSpread < 3.2, `onderweg blijft het een blok (verst van het midden: ${maxSpread.toFixed(2)})`);
  assert.equal(reg.fx, 1); assert.equal(reg.fy, 0);
  assert.equal(reg.wid, Math.round(4 / FORMS.line.gap) + 1, 'breedte van de getrokken lijn');
  const c = { x: list.reduce((a, u) => a + u.x, 0) / 12, y: list.reduce((a, u) => a + u.y, 0) / 12 };
  assert.ok(Math.hypot(c.x - c0.x, c.y - (c0.y - 8)) < 0.8, 'op de plek van het bevel');
  // een linie met het front naar het oosten staat noord-zuid: veel breder in y dan in x
  const spanX = Math.max(...list.map((u) => u.x)) - Math.min(...list.map((u) => u.x));
  const spanY = Math.max(...list.map((u) => u.y)) - Math.min(...list.map((u) => u.y));
  assert.ok(spanY > spanX * 1.5, `linie dwars op de richting (${spanX.toFixed(1)} x ${spanY.toFixed(1)})`);
  // formatie wisselen: een blok is dieper dan breed
  queueOrder(st, 0, [list[0].id], { form: 'block' }, st.n);
  stepTo(st, st.t + 6000);
  assert.equal(reg.f, 'block');
  const bx = Math.max(...list.map((u) => u.hx)) - Math.min(...list.map((u) => u.hx));
  const by = Math.max(...list.map((u) => u.hy)) - Math.min(...list.map((u) => u.hy));
  assert.ok(bx > by, 'blok: diep in de looprichting (oost-west), smal dwars');
});

test('gevecht: flank en rug doen meer schade, formaties beschermen', () => {
  const st = createBattle({ kind: 'town', att: { sword: 2 }, defGroups: [{ key: 'home', units: { sword: 1 } }], town: siegeTown({ walls: false }), townId: 7, dir: { x: -1, y: 0 }, aiAtt: false, aiDef: false, now: 0 });
  const [a] = st.units.filter((u) => u.s === 0); const e = st.units.find((u) => u.s === 1);
  const re = st.regs[e.sq - 1]; const ra = st.regs[a.sq - 1];
  re.fx = 1; re.fy = 0; e.x = 0; e.y = 0; a.mv = 0;
  const at = (x, y) => { a.x = x; a.y = y; a.mv = 0; return FBT.damage(st, a, e); };
  const front = at(0.8, 0); const side = at(0, 0.8); const rear = at(-0.8, 0);
  assert.ok(side > front * 1.1 && rear > side * 1.1, `voor ${front.toFixed(2)} < zij ${side.toFixed(2)} < rug ${rear.toFixed(2)}`);
  re.f = 'ring'; assert.equal(at(-0.8, 0).toFixed(4), (front * (FORMS.ring.fx.taken || 1)).toFixed(4), 'een kring kan je niet in de rug aanvallen');
  re.f = 'block'; assert.ok(at(0.8, 0) < front, 'een blok krijgt minder schade');
  re.f = 'line'; a.x = 0.8; a.y = 0; a.mv = 2; assert.ok(FBT.damage(st, a, e) > front * 1.2, 'een stormloop doet meer schade');
  ra.f = 'wedge'; a.mv = 2; const wedge = FBT.damage(st, a, e); ra.f = 'line'; a.mv = 2;
  assert.ok(wedge > FBT.damage(st, a, e), 'een wig stormt harder');
  // los tegen pijlen
  const arch = createBattle({ kind: 'town', att: { archer: 1 }, defGroups: [{ key: 'home', units: { sword: 1 } }], town: siegeTown({ walls: false }), townId: 7, dir: { x: -1, y: 0 }, aiAtt: false, aiDef: false, now: 0 });
  const sa = arch.units.find((u) => u.s === 0); const se = arch.units.find((u) => u.s === 1);
  sa.x = 3; sa.y = 0; se.x = 0; se.y = 0;
  const hard = FBT.damage(arch, sa, se); arch.regs[se.sq - 1].f = 'loose';
  assert.ok(FBT.damage(arch, sa, se) < hard * 0.6, 'verspreid: minder last van pijlen');
});

test('belegering: verdedigers blijven met hun formatie binnen de muren', () => {
  for (const dir of [{ x: -1, y: 0.1 }, { x: 0.3, y: 1 }, { x: 1, y: -0.4 }]) {
    const st = createBattle({ kind: 'town', att: { sword: 20, ram: 2 }, defGroups: [{ key: 'home', units: { spear: 12, sword: 12, archer: 8, rider: 6 } }], town: siegeTown(), townId: 7, dir, aiAtt: true, aiDef: true, now: 0 });
    const nv = nav(st);
    const inner = (x, y) => { const c = cellOf(st, x, y); return nv.ins[c] === '1' || nv.p1[c] === 3 || nv.p1[c] === 4; };
    stepTo(st, 30000);
    for (const u of st.units.filter((x) => x.s === 1 && x.k !== 'tower' && x.hp > 0)) {
      assert.ok(inner(u.hx, u.hy), `plek van ${u.k} binnen de muren (${u.hx}, ${u.hy})`);
    }
  }
});

test('belegering: de computer tegen de computer raakt nooit vast (stad met muren, open stad, roverskamp)', () => {
  const cases = [
    createBattle({ kind: 'town', att: { sword: 12, spear: 4, archer: 8, knight: 4, ram: 2 }, defGroups: [{ key: 'home', units: { spear: 10, sword: 6, archer: 10, rider: 4 } }], town: siegeTown(), townId: 7, dir: { x: 0.8, y: 0.6 }, aiAtt: true, aiDef: true, now: 0 }),
    createBattle({ kind: 'town', att: { sword: 12, spear: 4, archer: 8, knight: 4, ram: 2 }, defGroups: [{ key: 'home', units: { spear: 10, sword: 6, archer: 10, rider: 4 } }], town: siegeTown({ walls: false }), townId: 7, dir: { x: -1, y: 0.2 }, aiAtt: true, aiDef: true, now: 0 }),
    createBattle({ kind: 'camp', campSeed: 50004, att: { sword: 10, archer: 6, spear: 6 }, defGroups: [{ key: 'camp', units: { barbarian: 20 } }], dir: { x: 1, y: 0 }, aiAtt: true, aiDef: true, now: 0 }),
  ];
  for (const st of cases) {
    stepTo(st, FB.maxMs + 200000);
    assert.ok(st.over != null);
    const t = (st.n - st.ph1) * FB.tick;
    assert.ok(t < FB.maxMs * 0.6, `beslist binnen ${Math.round(FB.maxMs * 0.6 / 1000)} s (duurde ${Math.round(t / 1000)} s)`);
  }
});

test('moed: wie zwaar verliest, slaat op de vlucht, luistert niet meer en hergroepeert na rust; een leger dat helemaal vlucht, verliest', () => {
  const st = createBattle({ kind: 'town', att: { sword: 10, spear: 10 }, defGroups: [{ key: 'home', units: { spear: 6 } }], town: siegeTown({ walls: false }), townId: 7, dir: { x: -1, y: 0 }, aiAtt: false, aiDef: false, now: 0 });
  queueOrder(st, 0, null, { ready: true }, 0); queueOrder(st, 1, null, { ready: true }, 0);
  stepTo(st, 300);
  const sw = st.regs.find((r) => r.s === 0 && r.k === 'sword');
  const mine = st.units.filter((u) => u.sq === sw.id);
  // 8 van de 10 zwaardvechters vallen
  for (const u of mine.slice(0, 8)) { u.hp = 0; u.died = 0; }
  stepTo(st, st.t + 200);
  assert.equal(sw.st, 'rout', `vlucht bij moed ${sw.mo}`);
  const ids = mine.slice(8).map((u) => u.id);
  giveOrder(st, 0, ids, { charge: true });
  assert.equal(sw.st, 'rout', 'een vluchtend regiment luistert niet');
  const sp = st.regs.find((r) => r.s === 0 && r.k === 'spear');
  assert.ok(sp.mo < 100, 'wie het ziet gebeuren, verliest wat moed');
  // de vijand is ver weg: na een tijdje rust hergroeperen ze
  stepTo(st, st.t + 20000);
  assert.notEqual(sw.st, 'rout', 'hergroepeerd');
  // nu vlucht het hele leger: de aanval is mislukt
  for (const r of st.regs.filter((x) => x.s === 0)) r.mo = 5;
  stepTo(st, st.t + 300);
  assert.equal(st.over, 1);
  assert.ok(battleOutcome(st).attLeft.spear > 0, 'wie vlucht, overleeft');
});

// ---------- computerspelers (bots) ----------
import { ensureBots, botTick } from '../functions/lib/bots.js';
import { botEconomy, wallPlan } from '../functions/lib/botbrain.js';
import { age, ensureTerritory as ensureTerr2 } from '../public/shared/sim.js';
import { getWorld } from '../functions/lib/game.js';

test('bots: het brein bouwt een stad uit (tijdperken, muur met poorten, leger) met de gewone regels', () => {
  const s = newTownState(0, 'greek'); ensureTerritory(s, 4242);
  for (let t = 1800000; t <= 3 * 86400000; t += 1800000) { advance(s, t, 1); botEconomy(s, 1, { lvl: 2, peace: t < 86400000 }); }
  assert.ok(age(s) >= 3, `tijdperk ${age(s)} na 3 dagen`);
  assert.ok(totalVillagers(s) >= 45);
  const { walls, gates } = wallPlan();
  assert.equal(gates.length, 8, '4 poorten van 2 tegels');
  assert.equal(s.walls.length, walls.length, 'de hele muurring staat');
  assert.equal(s.gates.length, 8);
  assert.ok(Object.values(s.units).reduce((a, b) => a + b, 0) >= 10, 'een leger');
  for (const r of Object.keys(s.res)) assert.ok(s.res[r] >= 0, 'nooit onder nul');
});

test('bots: eigen clans, een speler komt nooit bij de bots, ze halen gemiste tijd in en vallen pas na de vrede aan', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body) => {
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-admin-key': 'k' }, body: body && JSON.stringify(body) }), env });
    return res.json();
  };
  assert.equal((await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 2, bots: 4, botLevel: 2, seed: 99 })).ok, true);
  const sql = (q, ...v) => db.raw.prepare(q).all(...v);
  const bots = sql('SELECT p.id, p.team_id FROM players p WHERE p.bot = 1');
  assert.equal(bots.length, 4);
  assert.equal(new Set(bots.map((b) => b.team_id)).size, 2, 'twee clans van twee bots');
  await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  const anna = sql("SELECT p.id, p.team_id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Anna'")[0];
  assert.ok(!bots.some((b) => b.team_id === anna.team_id), 'Anna zit niet in een botclan');
  // het seizoen loopt al 2,5 dag; Anna speelt actief (een uitgebouwde stad, zonder leger) maar heeft nog vrede
  const now = Date.now();
  const as = newTownState(now - 2.5 * 86400000, 'greek'); ensureTerritory(as, anna.tid);
  for (let t = now - 2.5 * 86400000 + 3 * 3600000; t <= now; t += 3 * 3600000) { advance(as, t, 1); botEconomy(as, 1, { lvl: 2 }); }
  // geen leger, muur of torens: een makkelijke prooi zodra haar vrede voorbij is
  as.units = {}; as.queues = {}; as.walls = []; as.gates = []; as.builds = [];
  as.buildings = as.buildings.filter((b) => b.type !== 'tower'); as.buildings.find((b) => b.type === 'wall').level = 0;
  db.raw.prepare('UPDATE towns SET state = ? WHERE id = ?').run(JSON.stringify(as), anna.tid);
  db.raw.prepare('UPDATE world SET start_at = ?, bot_ref = NULL').run(now - 2.5 * 86400000);
  db.raw.prepare("UPDATE players SET created_at = ? WHERE bot = 1").run(now - 2.5 * 86400000);
  db.raw.prepare("UPDATE towns SET state = json_set(state, '$.t', ?) WHERE player_id IN (SELECT id FROM players WHERE bot = 1)").run(now - 2.5 * 86400000);
  db.raw.prepare("UPDATE players SET created_at = ? WHERE id = ?").run(now - 3600000, anna.id);
  let world = await getWorld(db);
  for (let k = 0; k < 160; k++) { await botTick(db, world, now + k); world = await getWorld(db); }
  // in balans met Anna: zwakke bots onder haar score, sterke bots ongeveer op haar niveau (nooit ver erboven)
  const annaScore = townScore(as);
  const ref = JSON.parse(world.bot_ref);
  assert.equal(ref.med, annaScore, 'referentie = de echte speler');
  const byTier = {};
  for (const b of sql('SELECT t.state FROM players p JOIN towns t ON t.player_id = p.id WHERE p.bot = 1')) {
    const s = JSON.parse(b.state);
    assert.ok(now - s.t < 10 * 60000, 'ingehaald');
    (byTier[s.bot.tier] = byTier[s.bot.tier] || []).push(townScore(s));
    assert.ok(townScore(s) <= annaScore * 1.45, `${s.bot.tier}: ${townScore(s)} tegen Anna ${annaScore}`);
    assert.ok(townScore(s) >= annaScore * 0.5, `${s.bot.tier}: groeit mee (${townScore(s)} tegen Anna ${annaScore})`);
  }
  assert.deepEqual(Object.keys(byTier).sort(), ['gemiddeld', 'sterk', 'zwak'], 'een mix van zwakke en sterke bots');
  assert.ok(Math.max(...byTier.zwak) < Math.min(...byTier.sterk), 'zwak is zwakker dan sterk');
  const att = () => sql("SELECT COUNT(*) AS c FROM marches m JOIN players p ON p.id = m.player_id WHERE p.bot = 1 AND m.kind = 'attack' AND m.target_kind = 'town' AND m.target_id = ?", anna.tid)[0].c;
  assert.equal(att(), 0, 'niet aanvallen tijdens de vrede');
  // de vrede van Anna is voorbij: na een tijdje komt er een aanval
  db.raw.prepare("UPDATE players SET created_at = ? WHERE id = ?").run(now - 2 * 86400000, anna.id);
  db.raw.prepare("UPDATE players SET bot_next = 0 WHERE bot = 1").run();
  let t = now;
  for (let k = 0; k < 80 && !att(); k++) { t += 6 * 60000; for (let j = 0; j < 5; j++) await botTick(db, world, t + j); }
  assert.ok(att() >= 1, 'een bot valt Anna aan na haar vrede');
  // een clanlid wordt aangevallen: de ander stuurt versterking
  const [b1, b2] = sql('SELECT p.id, p.team_id, t.id AS tid, t.x, t.y FROM players p JOIN towns t ON t.player_id = p.id WHERE p.bot = 1 ORDER BY p.id');
  db.raw.prepare(`INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y, units, depart_at, arrive_at, status)
    VALUES (?, ?, 'attack', ?, 0, 0, 'town', ?, ?, ?, ?, '{"sword":40}', ?, ?, 'out')`).run(anna.id, anna.team_id, anna.tid, b1.tid, b1.team_id, b1.x, b1.y, t, t + 6 * 3600000);
  db.raw.prepare("UPDATE towns SET state = json_set(state, '$.units', json('{\"spear\":20,\"archer\":10}')) WHERE id = (SELECT id FROM towns WHERE player_id = ?)").run(b2.id);
  for (let k = 0; k < 8; k++) { t += 60000; db.raw.prepare("UPDATE players SET bot_next = 0 WHERE id = ?").run(b2.id); await botTick(db, world, t); }
  const sup = sql("SELECT units FROM marches WHERE player_id = ? AND kind = 'support' AND target_id = ?", b2.id, b1.tid);
  assert.equal(sup.length, 1, 'versterking voor het clanlid');
  // minder bots gevraagd: de overtollige verdwijnen
  db.raw.prepare('UPDATE world SET bots = 2').run();
  await ensureBots(db, await getWorld(db), t);
  assert.equal(sql('SELECT COUNT(*) AS c FROM players WHERE bot = 1')[0].c, 2);
});

test('bots: geen jacht op veel zwakkere spelers (tenzij wraak), en te sterke bots van vroeger beginnen opnieuw', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body) => (await handle({ request: new Request(`http://x/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-admin-key': 'k' }, body: body && JSON.stringify(body) }), env })).json();
  await call('POST', '/admin/reset', { peaceHours: 0, teamSize: 1, bots: 1, botLevel: 2, seed: 7 });
  await call('POST', '/register', { name: 'Bram', password: 'geheim123', civ: 'greek' });
  const sql = (q, ...v) => db.raw.prepare(q).all(...v);
  const now = Date.now();
  const bot = sql('SELECT p.id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.bot = 1')[0];
  const bram = sql("SELECT p.id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Bram'")[0];
  // een bot van vroeger, veel sterker dan de echte speler: begint opnieuw
  const big = newTownState(now - 3 * 86400000, 'persia'); ensureTerritory(big, bot.tid);
  for (let t = now - 3 * 86400000 + 1800000; t <= now; t += 1800000) { advance(big, t, 1); botEconomy(big, 1, { lvl: 3 }); }
  big.bot = { tier: 'sterk' };
  db.raw.prepare('UPDATE towns SET state = ? WHERE id = ?').run(JSON.stringify(big), bot.tid);
  db.raw.prepare('UPDATE world SET start_at = ?, bot_ref = NULL').run(now - 3 * 86400000);
  const world = await getWorld(db);
  let r = null;
  for (let k = 0; k < 4 && !(r && r.did); k++) r = await botTick(db, world, now + k); // de eerste beurt kan de periodieke controle zijn
  assert.ok(r.did.includes('opnieuw begonnen (te sterk)'), JSON.stringify(r.did.slice(0, 3)));
  assert.ok(r.score < townScore(big) / 2);
  // een sterke bot met een groot leger valt de kleine Bram niet aan...
  const st = JSON.parse(sql('SELECT state FROM towns WHERE id = ?', bot.tid)[0].state);
  Object.assign(st, { t: now, buildings: big.buildings, villagers: big.villagers, units: { sword: 40, archer: 30, knight: 10 } });
  st.bot = { tier: 'sterk', v: 2 };
  db.raw.prepare('UPDATE towns SET state = ? WHERE id = ?').run(JSON.stringify(st), bot.tid);
  const attacks = () => sql("SELECT COUNT(*) AS c FROM marches WHERE player_id = ? AND kind = 'attack' AND target_kind = 'town'", bot.id)[0].c;
  for (let k = 1; k <= 3; k++) { db.raw.prepare('UPDATE players SET bot_next = 0 WHERE id = ?').run(bot.id); await botTick(db, world, now + k * 60000); }
  assert.equal(attacks(), 0, 'geen jacht op een veel zwakkere speler');
  // ...tenzij Bram hem eerst aanviel: dan pakt hij hem terug
  db.raw.prepare(`INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y, units, depart_at, arrive_at, status)
    SELECT ?, p.team_id, 'attack', ?, 0, 0, 'town', ?, b.team_id, 0, 0, '{"spear":1}', ?, ?, 'out' FROM players p, players b WHERE p.id = ? AND b.id = ?`).run(bram.id, bram.tid, bot.tid, now, now + 3600000, bram.id, bot.id);
  db.raw.prepare('UPDATE players SET bot_next = 0 WHERE id = ?').run(bot.id); await botTick(db, world, now + 5 * 60000);
  db.raw.prepare("DELETE FROM marches WHERE player_id = ?").run(bram.id);
  for (let k = 1; k <= 12 && !attacks(); k++) { db.raw.prepare('UPDATE players SET bot_next = 0 WHERE id = ?').run(bot.id); await botTick(db, world, now + 5 * 60000 + k * 10 * 60000); }
  assert.ok(attacks() >= 1, 'wraak op wie hem aanviel');
});

// ---------- vijf tijdperken, nieuwe gebouwen, Academie ----------
import { AGES, AGE_UP, MAX_AGE, BUILDINGS as BLD, TECHS, levelAge as lvlAge, techTier, LOYALTY, VASSAL } from '../public/shared/rules.js';
import {
  rates as rateOf, maxBuilds as maxB, buildTime, checkResearch, doResearch, townScore as tScore, checkTrain as cTrain, loyalty as loyOf,
  doUpgrade as doUp,
} from '../public/shared/sim.js';
import { techMods } from '../public/shared/battle.js';

function bigTown(a = 5) {
  const s = newTownState(0, 'greek');
  s.buildings[0].level = a;
  s.res = { food: 90000, wood: 90000, stone: 90000, gold: 90000 };
  let id = 10;
  for (const [type, x, y, level] of [['storage', 1, 1, 5], ['storage', 2, 1, 5], ['house', 3, 1, 5], ['house', 4, 1, 5], ['farm', 1, 3, 2]]) s.buildings.push({ id: id++, type, x, y, level });
  s.nextId = id;
  return s;
}
const addB = (s, type, level, x, y) => { const b = { id: s.nextId++, type, x, y, level }; s.buildings.push(b); return b; };

test('tijdperken: vijf, met namen, niveau N vraagt tijdperk N', () => {
  assert.equal(MAX_AGE, 5);
  assert.deepEqual(AGES.slice(1).map((a) => a.short), ['Vuursteen', 'Brons', 'IJzer', 'Gilden', 'Kroon']);
  assert.ok(AGE_UP[5].cost.food > AGE_UP[4].cost.food);
  assert.equal(BLD.tc.maxLevel, 5);
  assert.equal(lvlAge('house', 4), 4);
  assert.equal(lvlAge('house', 5), 5);
  assert.equal(lvlAge('academy', 1), 3);
  assert.equal(lvlAge('academy', 2), 4);
  assert.equal(lvlAge('academy', 3), 5);
  assert.equal(lvlAge('court', 1), 5);
  const s = bigTown(4);
  const h = s.buildings.find((b) => b.type === 'house');
  h.level = 4;
  assert.throws(() => doUp(s, h.id, 0, 1), /Tijdperk van de Kroon/);
  s.buildings[0].level = 5;
  doUp(s, h.id, 0, 1);
  // naar de Kroon: vanuit de Gilden
  const t = bigTown(4);
  doUp(t, 1, 0, 1);
  advance(t, 60 * 3600000, 1);
  assert.equal(age(t), 5);
});

test('nieuwe gebouwen: molen en gildehuis verhogen de productie, de bouwloods geeft een bouwer extra', () => {
  const s = bigTown(5);
  s.villagers = { idle: 0, food: 10, wood: 10, stone: 0, gold: 0 };
  const base = rateOf(s, 1);
  addB(s, 'mill', 2, 6, 1);
  assert.ok(Math.abs(rateOf(s, 1).food / base.food - 1.1) < 1e-9, 'molen niveau 2: +10% voedsel');
  assert.equal(rateOf(s, 1).wood, base.wood);
  addB(s, 'guild', 1, 7, 1);
  assert.ok(Math.abs(rateOf(s, 1).wood / base.wood - 1.03) < 1e-9, 'gildehuis: +3% alles');
  const before = maxB(s);
  const lodge = addB(s, 'lodge', 2, 8, 1);
  assert.equal(maxB(s), before + 1);
  assert.equal(buildTime(s, 'house', 3, 1), Math.round(levelTime('house', 3, 1) * 0.9));
  assert.equal(buildTime(s, 'tc', 5, 1), levelTime('tc', 5, 1), 'een nieuw tijdperk gaat niet sneller');
  lodge.level = 0;
});

test('Academie: rijen per niveau, van links naar rechts, en het onderzoek is klaar na de tijd', () => {
  const s = bigTown(3);
  assert.match(checkResearch(s, 'firearrows'), /Academie/);
  const ac = addB(s, 'academy', 1, 6, 1);
  assert.equal(checkResearch(s, 'firearrows'), null);
  assert.match(checkResearch(s, 'yew'), /niveau 2/);
  doResearch(s, 'firearrows', 0, 1);
  assert.match(checkResearch(s, 'shieldwall'), /loopt al/);
  const sc = tScore(s);
  advance(s, TECHS.firearrows.time * 1000 + 1, 1);
  assert.ok(s.tech.firearrows && !s.research);
  assert.ok(tScore(s) > sc, 'onderzoek telt mee in de score');
  ac.level = 2; s.buildings[0].level = 4;
  assert.equal(checkResearch(s, 'yew'), null);
  assert.match(checkResearch(s, 'drill'), /Schildmuur/, 'eerst de vorige in dezelfde soort');
  assert.equal(techTier(s.tech, 'rng'), 1);
  assert.equal(techTier(s.tech, 'inf'), 0);
});

test('Academie: onderzoek telt in een automatische slag', () => {
  const groups = [{ key: 'home', units: { spear: 40, sword: 20 } }];
  const plain = resolveBattle({ attUnits: { archer: 60 }, groups, towerDef: 200 });
  const shield = resolveBattle({ attUnits: { archer: 60 }, groups, towerDef: 200, defTech: { shieldwall: 1 } });
  assert.ok(shield.D > plain.D * 1.15, 'schildmuur: voetvolk houdt beter stand tegen pijlen');
  const fire = resolveBattle({ attUnits: { archer: 60 }, groups, towerDef: 200, attTech: { firearrows: 1 } });
  assert.ok(fire.D < plain.D && fire.A > plain.A, 'vuurpijlen: torens minder sterk, schutters iets sterker');
  const xb = resolveBattle({ attUnits: { archer: 60 }, groups, towerDef: 200, defTech: { xbow: 1 } });
  assert.ok(xb.D > plain.D);
  assert.equal(techMods({ ironbound: 1 }).rams, 0.67);
  const walls = (t) => resolveBattle({ attUnits: { sword: 100, ram: 12 }, groups: [{ key: 'home', units: {} }], wall: 3, defTech: t });
  assert.ok(walls({ ironbound: 1, pitch: 1 }).D > walls(null).D, 'pek en ijzerbeslag: de muur houdt beter');
});

test('Academie: vuurpijlen, taxusboog, schildmuur, lansen en kokende pek in de live slag', () => {
  const mk = (techA, techD, att = { archer: 4 }, def = { sword: 4 }) => createBattle({
    kind: 'town', att, defGroups: [{ key: 'home', units: def }], town: siegeTown(), townId: 7, dir: { x: -1, y: 0 }, aiAtt: false, aiDef: false, now: 0, techA, techD,
  });
  const a = mk(null, null); const b = mk({ firearrows: 1 }, null);
  const ua = a.units.find((u) => u.s === 0); const ub = b.units.find((u) => u.s === 0);
  const wa = a.walls.find((w) => w.g); const wb = b.walls.find((w) => w.g);
  assert.ok(FBT.damage(b, ub, wb) > FBT.damage(a, ua, wb) * 1.5, 'vuurpijlen: veel meer schade aan een poort');
  // schildmuur: zwaardvechters in linie krijgen minder schade van pijlen
  const c = mk(null, { shieldwall: 1 });
  const ea = a.units.find((u) => u.s === 1 && u.k === 'sword'); const ec = c.units.find((u) => u.s === 1 && u.k === 'sword');
  a.regs[ea.sq - 1].f = 'line'; c.regs[ec.sq - 1].f = 'line';
  const uc = c.units.find((u) => u.s === 0);
  assert.ok(FBT.damage(c, uc, ec) < FBT.damage(a, ua, ea) * 0.75);
  // lansen: een sterkere stormloop
  const d = mk(null, null, { knight: 2 }); const e = mk({ lances: 1 }, null, { knight: 2 });
  const kd = d.units.find((u) => u.s === 0); const ke = e.units.find((u) => u.s === 0);
  const td = d.units.find((u) => u.s === 1); const te = e.units.find((u) => u.s === 1);
  for (const [k, t] of [[kd, td], [ke, te]]) { k.x = t.x + 0.6; k.y = t.y; k.mv = 2; }
  assert.ok(FBT.damage(e, ke, te) > FBT.damage(d, kd, td) * 1.2);
  // hoefijzers: ruiterij sneller
  assert.equal(e.regs.find((r) => r.s === 0).sp, undefined);
  assert.equal(mk({ horseshoes: 1 }, null, { knight: 2 }).regs.find((r) => r.s === 0).sp, 1.1);
  // ijzerbeslag: poorten met meer levens
  const town = siegeTown(); town.tech = { ironbound: 1 };
  const f = createBattle({ kind: 'town', att: { sword: 2 }, defGroups: [{ key: 'home', units: {} }], town, townId: 7, dir: { x: -1, y: 0 }, aiAtt: false, aiDef: false, now: 0 });
  assert.ok(Math.abs(f.walls.find((w) => w.g).hp - a.walls.find((w) => w.g).hp * 1.5) <= 1);
});

test('Academie: kokende pek raakt wie aan de poort staat, en de slag blijft deterministisch', () => {
  const run = (techD, roundTrip) => {
    let st = createBattle({ kind: 'town', att: { sword: 20, ram: 2 }, defGroups: [{ key: 'home', units: { archer: 6 } }], town: siegeTown(), townId: 7, dir: { x: -1, y: 0 }, aiAtt: true, aiDef: true, now: 0, techD, techA: { firearrows: 1, yew: 1, volley: 1, horseshoes: 1, lances: 1, flank: 1, shieldwall: 1, drill: 1, warcry: 1 } });
    for (let t = 0; t < 240000; t += 3000) { stepTo(st, t, 40); if (roundTrip) st = JSON.parse(JSON.stringify(st)); }
    return st;
  };
  const p = run({ pitch: 1 }, false);
  assert.ok(p.walls.some((w) => w.g && w.pt > 0), 'de pek werd gegoten');
  assert.deepEqual(JSON.parse(JSON.stringify(p)), run({ pitch: 1 }, true));
});

test('edelman: in het Adelshof, één tegelijk, zoveel als het niveau', () => {
  const s = bigTown(5);
  assert.match(cTrain(s, 'noble', 1), /Adelshof/);
  const c = addB(s, 'court', 1, 6, 1);
  assert.equal(cTrain(s, 'noble', 1), null);
  assert.match(cTrain(s, 'noble', 2), /één edelman/);
  s.units.noble = 1;
  assert.match(cTrain(s, 'noble', 1), /verbeter je Adelshof/);
  c.level = 2;
  assert.equal(cTrain(s, 'noble', 1), null);
  assert.match(cTrain(s, 'noble', 1, 0, 1), /verbeter je Adelshof/, 'ook wie onderweg is, telt mee');
  // trouw herstelt vanzelf, sneller met een kathedraal
  const t = bigTown(5); t.loy = 50;
  advance(t, 3600000, 1);
  assert.ok(Math.abs(loyOf(t) - (50 + LOYALTY.regen)) < 1e-6);
  addB(t, 'cathedral', 2, 7, 1);
  advance(t, 2 * 3600000, 1);
  assert.ok(Math.abs(loyOf(t) - (50 + LOYALTY.regen + LOYALTY.regen + 2)) < 1e-6);
  t.vas = { lord: 1, until: 99 * 3600000 };
  advance(t, 3 * 3600000, 1);
  assert.ok(Math.abs(loyOf(t) - (50 + LOYALTY.regen * 2 + 2)) < 1e-6, 'een vazal herstelt niet');
});

test('vazallen: edelmannen onderwerpen een stad, schatting, geen aanvallen, losgeld, bescherming en bevrijding', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const call = async (method, path, body, cookie) => {
      const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
      if (cookie) headers.cookie = cookie;
      const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
      return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
    };
    assert.equal((await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 1, bots: 0, seed: 11 })).status, 200);
    const reg = async (name) => (await call('POST', '/register', { name, password: 'geheim123', civ: 'greek' })).cookie;
    const A = await reg('Anna'); const B = await reg('Bert'); const C = await reg('Cees'); const D = await reg('Dirk');
    const sql = (q, ...v) => db.raw.prepare(q).run(...v);
    const get = (q, ...v) => db.raw.prepare(q).get(...v);
    const town = (n) => get('SELECT t.id, t.state, p.id AS pid, p.team_id FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = ?', n);
    sql('UPDATE world SET start_at = ?', clock - 5 * 86400000);
    sql('UPDATE players SET created_at = ?', clock - 4 * 86400000);
    // Anna: Kroon, Adelshof, een groot leger en edelmannen; Bert: Gilden met een monument (genoeg punten); Cees zit in Berts clan
    const put = (n, fn) => { const r = town(n); const s = JSON.parse(r.state); fn(s); sql('UPDATE towns SET state = ? WHERE id = ?', JSON.stringify(s), r.id); };
    put('Anna', (s) => { s.buildings[0].level = 5; s.buildings.push({ id: 90, type: 'court', x: 1, y: 1, level: 3 }); s.units = { knight: 400, noble: 4 }; });
    put('Bert', (s) => { s.buildings[0].level = 4; s.buildings.push({ id: 90, type: 'monument', x: 1, y: 1, level: 2 }); s.units = { spear: 5 }; s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 }; s.villagers = { idle: 0, food: 20, wood: 20, stone: 10, gold: 10 }; });
    put('Cees', (s) => { s.buildings[0].level = 5; s.units = { knight: 900 }; });
    sql('UPDATE players SET team_id = ? WHERE name = ?', town('Bert').team_id, 'Cees');
    const bert = town('Bert').id; const anna = town('Anna').id;
    // legers laten aankomen; Dirk kijkt toe (wie meevecht is niet online: dan een automatische slag)
    const land = async () => { sql("UPDATE marches SET arrive_at = ? WHERE status IN ('out', 'back')", clock - 1); sql("UPDATE players SET last_seen = 0 WHERE name != 'Dirk'"); clock += 1000; await call('GET', '/state', null, D); };
    const attack = async (units, cookie = A, target = bert) => call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: target, units }, cookie);

    // 1. één edelman: de trouw zakt van 100 naar 75
    clock += 120000; // niemand meer online: automatische slag
    assert.equal((await attack({ knight: 100, noble: 1 })).status, 200);
    await land();
    assert.equal(JSON.parse(town('Bert').state).loy, 75);
    let rep = JSON.parse(get("SELECT data FROM reports WHERE player_id = ? AND kind = 'attack' ORDER BY id DESC", town('Anna').pid).data);
    assert.equal(rep.noble.after, 75);
    await land(); // terug naar huis
    // 2. drie edelmannen: 75 - 75 = 0 → Bert is vazal van Anna
    assert.equal((await attack({ knight: 200, noble: 3 })).status, 200);
    await land();
    const v = get('SELECT * FROM vassals WHERE town_id = ?', bert);
    assert.ok(v && v.lord_player === town('Anna').pid, 'Bert is vazal van Anna');
    assert.equal(JSON.parse(town('Bert').state).vas.lord, town('Anna').pid);
    assert.match(get("SELECT title FROM reports WHERE player_id = ? ORDER BY id DESC", town('Bert').pid).title, /vazal van Anna/);
    await land();
    // 3. heer en vazal vallen elkaar niet aan
    assert.match((await attack({ knight: 10 })).data.error, /je vazal/);
    assert.match((await attack({ knight: 1 }, B, anna)).data.error, /heer niet aanvallen/);
    // 4. kaart en ranglijst
    const map = await call('GET', '/map', null, A);
    assert.equal(map.data.towns.find((t) => t.id === bert).vassal.lname, 'Anna');
    const lb = await call('GET', '/leaderboard', null, A);
    assert.ok(lb.data.players.find((p) => p.name === 'Anna').vassalPts > 0);
    assert.equal(lb.data.players.find((p) => p.name === 'Bert').lord, 'Anna');
    const st = await call('GET', '/state', null, A);
    assert.equal(st.data.vassals.length, 1);
    // 5. schatting: na 6 uur vertrekt een karavaan van Bert naar Anna
    clock += VASSAL.tributeMs + 1000;
    await call('GET', '/state', null, D);
    const tr = get("SELECT * FROM marches WHERE kind = 'tribute'");
    assert.ok(tr && tr.from_town === bert && tr.target_id === anna, 'schatting onderweg');
    assert.ok(Object.values(JSON.parse(tr.res)).reduce((a, b) => a + b, 0) > 0);
    await land();
    assert.match(get("SELECT title FROM reports WHERE player_id = ? ORDER BY id DESC", town('Anna').pid).title, /Schatting van Bert/);
    // 6. bevrijding: Cees (Berts clan) wint een aanval op Anna
    sql("UPDATE towns SET state = json_set(state, '$.units', json('{\"spear\":5}')) WHERE id = ?", anna);
    assert.equal((await attack({ knight: 600 }, C, anna)).status, 200);
    await land();
    assert.equal(get('SELECT COUNT(*) AS c FROM vassals').c, 0, 'Bert is bevrijd');
    const bs = JSON.parse(town('Bert').state);
    assert.ok(!bs.vas && bs.loyShield > clock, 'en beschermd tegen edelmannen');
    await land();
    // 7. beschermd: edelmannen doen niets
    put('Anna', (s) => { s.units = { knight: 400, noble: 4 }; });
    assert.equal((await attack({ knight: 200, noble: 4 })).status, 200);
    await land();
    rep = JSON.parse(get("SELECT data FROM reports WHERE player_id = ? AND kind = 'attack' ORDER BY id DESC", town('Anna').pid).data);
    assert.match(rep.noble.blocked, /bevrijd/);
    assert.equal(get('SELECT COUNT(*) AS c FROM vassals').c, 0);
    await land();
    // 8. na de bescherming: opnieuw vazal, en daarna vrij met losgeld
    clock += LOYALTY.shieldMs + 1000;
    assert.equal((await attack({ knight: 200, noble: 4 })).status, 200);
    await land();
    assert.equal(get('SELECT COUNT(*) AS c FROM vassals').c, 1);
    put('Bert', (s) => { s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 }; });
    const ransom = await call('POST', '/vassal/ransom', {}, B);
    assert.equal(ransom.status, 200, JSON.stringify(ransom.data));
    assert.equal(get('SELECT COUNT(*) AS c FROM vassals').c, 0);
    assert.ok(Math.abs(JSON.parse(town('Bert').state).res.food - (9000 - VASSAL.ransom * 4)) < 5, 'losgeld betaald');
    // 9. na 3 dagen is een vazal vanzelf vrij
    await land();
    clock += LOYALTY.shieldMs + 1000;
    put('Bert', (s) => { delete s.loyShield; });
    assert.equal((await attack({ knight: 200, noble: 4 })).status, 200);
    await land();
    assert.equal(get('SELECT COUNT(*) AS c FROM vassals').c, 1);
    clock += VASSAL.ms + 1000;
    await call('GET', '/state', null, D);
    assert.equal(get('SELECT COUNT(*) AS c FROM vassals').c, 0, 'na 3 dagen vrij');
  } finally {
    Date.now = realNow;
  }
});

test('verbeterpaneel toont voor elk gebouw wat het volgende niveau oplevert', async () => {
  const { gainsHtml } = await import('../public/js/ui.js');
  const { BUILDINGS } = await import('../public/shared/rules.js');
  const s = newTownState(0, 'greek');
  s.buildings.find((b) => b.type === 'tc').level = 2;
  s.villagers = { food: 9, wood: 10, stone: 2, gold: 2, idle: 3 };
  let id = 100;
  for (const t of Object.keys(BUILDINGS)) if (t !== 'tc' && t !== 'wall') s.buildings.push({ id: id++, type: t, x: 0, y: 0, level: 1 });
  s.buildings.find((b) => b.type === 'wall').level = 1;
  s.walls = [1, 2, 3];
  const app = { data: { world: { speed: 1 }, awayPop: 0 } };
  for (const b of s.buildings) {
    const h = gainsHtml(app, s, b, b.level + 1);
    assert.match(h, /Wat levert het op\?/, b.type);
    assert.match(h, /Punten/, `${b.type}: punten`);
    assert.doesNotMatch(h, /NaN|undefined/, b.type);
  }
  const lumber = s.buildings.find((b) => b.type === 'lumber');
  assert.match(gainsHtml(app, s, lumber, 2), /Werkplekken hout.*10.*15/s);
  const house = s.buildings.find((b) => b.type === 'house');
  assert.match(gainsHtml(app, s, house, 2), new RegExp(`${popCap(s)}.*${popCap(s) + 5}`, 's'));
});

test("paneel toont 'Ook op deze plek' met de gebouwen achter het gekozen gebouw", async () => {
  const { alsoHereHtml } = await import('../public/js/ui.js');
  const s = newTownState(0, 'greek');
  const tc = s.buildings.find((b) => b.type === 'tc');
  s.buildings.push({ id: 90, type: 'house', x: 1, y: 1, level: 2 }, { id: 91, type: 'smithy', x: 3, y: 1, level: 0 });
  const app = { pickStack: [tc.id, 90, 91] };
  const h = alsoHereHtml(app, s, tc);
  assert.match(h, /Ook op deze plek/);
  assert.match(h, /data-action="pickBuilding" data-id="90">Huis <small>niv\. 2<\/small>/);
  assert.match(h, /data-id="91">Smidse<\/button>/);
  assert.doesNotMatch(h, new RegExp(`data-id="${tc.id}"`), 'niet het gekozen gebouw zelf');
  assert.equal(alsoHereHtml({ pickStack: [90, 91] }, s, tc), '', 'gekozen gebouw niet op die plek');
  assert.equal(alsoHereHtml({ pickStack: [tc.id] }, s, tc), '', 'maar één gebouw');
  assert.equal(alsoHereHtml({}, s, tc), '');
});

test('gebouwen verplaatsen: enkel naar vrije bouwgrond, het stadscentrum blijft staan', async () => {
  const { doMove, checkMove } = await import('../public/shared/sim.js');
  const s = newTownState(0);
  const tc = s.buildings.find((b) => b.type === 'tc');
  s.buildings.push({ id: 90, type: 'house', x: 1, y: 1, level: 1 }, { id: 91, type: 'farm', x: 3, y: 1, level: 1 });
  assert.match(checkMove(s, tc.id, 1, 9), /stadscentrum/);
  assert.match(checkMove(s, 90, 3, 1), /niet staan/, 'bezet door de boerderij');
  assert.match(checkMove(s, 90, tc.x, tc.y), /niet staan/, 'bezet door het stadscentrum');
  assert.match(checkMove(s, 90, 1, 1), /staat daar al/);
  assert.match(checkMove(s, 90, -40, -40), /niet staan/, 'buiten de bouwgrond');
  doMove(s, 90, 2, 1); // één tegel opschuiven over zijn eigen oude plek
  const h = s.buildings.find((b) => b.id === 90);
  assert.deepEqual([h.x, h.y], [2, 1]);
  assert.throws(() => doMove(s, 90, 3, 1), GameError);
  assert.equal(h.level, 1, 'niveau blijft');
});

test('muren en poorten verplaatsen', async () => {
  const { doMoveWalls, checkMoveWalls, wallRun } = await import('../public/shared/sim.js');
  const { tileIndex } = await import('../public/shared/territory.js');
  const s = newTownState(0);
  s.buildings.find((b) => b.type === 'wall').level = 1;
  s.buildings.push({ id: 90, type: 'house', x: 2, y: 4, level: 1 });
  const T = (i, j) => tileIndex(i, j);
  s.walls = [1, 2, 3, 6, 7, 8].map((i) => T(i, 2));
  s.gates = [T(4, 2), T(5, 2)];
  // het rechte stuk door (2, 2) = de hele rij met de poort erin
  assert.equal(wallRun(s, 2, 2).length, 8);
  // één muurstuk opschuiven
  doMoveWalls(s, [[1, 2]], 0, 1);
  assert.ok(s.walls.includes(T(1, 3)) && !s.walls.includes(T(1, 2)));
  // de poort twee tegels opschuiven: de oude opening wordt muur
  doMoveWalls(s, [[4, 2], [5, 2]], 2, 0);
  assert.deepEqual([...s.gates].sort((a, b) => a - b), [T(6, 2), T(7, 2)].sort((a, b) => a - b));
  assert.ok(s.walls.includes(T(4, 2)) && s.walls.includes(T(5, 2)));
  // een halve poort, op een gebouw, op een muur, of een poort zonder muur ernaast: niet
  assert.match(checkMoveWalls(s, [[6, 2]], 0, 1), /geheel/);
  assert.match(checkMoveWalls(s, [[2, 2]], 0, 2), /gebouw/);
  assert.match(checkMoveWalls(s, [[2, 2]], 1, 0), /al een muur/);
  assert.match(checkMoveWalls(s, [[6, 2], [7, 2]], 0, 2), /recht stuk muur/);
  // de hele rechte muur (met poort) één rij lager
  const run = wallRun(s, 3, 2);
  doMoveWalls(s, run, 0, -1);
  assert.ok(s.gates.includes(T(6, 1)) && s.gates.includes(T(7, 1)));
  assert.ok(run.every(([i]) => s.walls.includes(T(i, 1)) || s.gates.includes(T(i, 1))));
});

test('3D-gebouwen: elk model (elk volk, elk niveau) bouwt zonder fouten en met geldige ankerpunten', async () => {
  const { build } = await import('../public/js/models3d.js');
  const { BUILDINGS } = await import('../public/shared/rules.js');
  for (const civ of [null, 'egypt', 'greek', 'yamato', 'babylon', 'persia']) {
    for (const t of Object.keys(BUILDINGS)) {
      if (t === 'wall') continue;
      for (let L = 1; L <= BUILDINGS[t].maxLevel; L++) {
        const sc = build(t, L, civ, 0);
        assert.ok(sc.prims.length > 0, `${civ} ${t} ${L}`);
        // de werker zet elk anker om naar schermpixels: een leeg anker liet het hele model mislukken (2D-terugval)
        for (const [k, a] of Object.entries(sc.anchors || {})) {
          assert.ok(Array.isArray(a) && a.length === 3 && a.every(Number.isFinite), `${civ} ${t} ${L}: anker ${k}`);
        }
      }
    }
  }
});

test('3D-poortgebouw: elk niveau, elke richting en elke stand van de deuren; meer onderdelen per niveau', async () => {
  const { gateScene, GATE_STATES } = await import('../public/js/models3d.js');
  const parts = [];
  for (let L = 1; L <= 5; L++) {
    for (const ax of ['x', 'y']) {
      for (let st = 0; st <= GATE_STATES; st++) {
        const sc = gateScene({ level: L, ax, st });
        assert.ok(sc.prims.length > 20, `niveau ${L} ${ax} ${st}`);
        for (const [k, a] of Object.entries(sc.anchors || {})) assert.ok(Array.isArray(a) && a.length === 3 && a.every(Number.isFinite), `anker ${k}`);
        for (const p of sc.prims) assert.ok(p.bb.every(Number.isFinite), `vorm met ongeldige maten (niveau ${L} ${ax} ${st})`);
      }
    }
    parts.push(gateScene({ level: L, ax: 'x', st: 0 }).prims.length);
  }
  // hout → met stenen voet en dakjes; steen → met borstwering en vaandels → met spitsen en goud
  assert.ok(parts[1] > parts[0] && parts[3] > parts[2] && parts[4] > parts[3], JSON.stringify(parts));
  // de deuren draaien echt open: andere vormen dan dicht
  const dicht = JSON.stringify(gateScene({ level: 3, ax: 'y', st: 0 }).prims.map((p) => p.bb));
  const open = JSON.stringify(gateScene({ level: 3, ax: 'y', st: GATE_STATES }).prims.map((p) => p.bb));
  assert.notEqual(dicht, open);
});

// Laden: index.html laadt alle scripts tegelijk (modulepreload) i.p.v. één na één via de imports.
// Komt er een module bij of valt er een weg, dan moet die lijst mee veranderen.
test('laden: index.html heeft een modulepreload voor precies alle modules van main.js', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve('public');
  const deps = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => path.resolve(path.dirname(f), m[1]));
  const need = new Set(); const q = [path.join(root, 'js/main.js')];
  while (q.length) { const f = q.shift(); if (need.has(f)) continue; need.add(f); q.push(...deps(f)); }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const have = new Set([...html.matchAll(/<link rel="modulepreload" href="\/([^"]+)">/g)].map((m) => path.join(root, m[1])));
  const missing = [...need].filter((f) => !have.has(f)).map((f) => path.relative(root, f));
  const extra = [...have].filter((f) => !need.has(f)).map((f) => path.relative(root, f));
  assert.deepEqual(missing, [], `ontbreekt in index.html: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `niet meer gebruikt: ${extra.join(', ')}`);
});

test('tabblad Mijn leger: soldaten per soort, thuis, in het veld, onderweg, elders en in opleiding (geen dorpelingen)', async () => {
  const { armySummary, armyBarHtml } = await import('../public/js/ui.js');
  const s = newTownState(0, 'greek');
  s.units = { spear: 5, archer: 2 };
  s.field = [{ id: 1, units: { spear: 3 } }, { id: 2, units: { villager: 4 } }];
  s.queues = { barracks: [{ unit: 'spear', n: 4, done: 1 }], tc: [{ unit: 'villager', n: 2, done: 0 }] };
  const data = {
    team: { color: '#c0392b' },
    marches: [{ own: true, units: { archer: 6 } }, { own: false, units: { spear: 50 } }, { own: true, units: null }],
    mySupport: [{ units: { knight: 2 } }],
  };
  const rows = armySummary(s, data);
  assert.deepEqual(rows.map((r) => r.k), ['spear', 'archer', 'knight'], 'volgorde van ARMY_UNITS, geen dorpelingen');
  const spear = rows.find((r) => r.k === 'spear');
  assert.deepEqual([spear.home, spear.field, spear.away, spear.train, spear.total], [5, 3, 0, 3, 8], 'opleiding telt niet mee in het totaal');
  const archer = rows.find((r) => r.k === 'archer');
  assert.deepEqual([archer.home, archer.away, archer.total], [2, 6, 8], 'enkel eigen marsen');
  assert.equal(rows.find((r) => r.k === 'knight').away, 2, 'gestationeerd bij een bondgenoot');
  const h = armyBarHtml({ data }, s);
  assert.match(h, />18</, 'totaal 8 + 8 + 2');
  assert.doesNotMatch(h, /NaN|undefined/);
  assert.match(armyBarHtml({ data: { team: {}, marches: [] } }, newTownState(0, 'greek')), /nog geen soldaten/);
});

test('tabblad Bouwadvies: wat nog verbeterd kan worden, gebundeld per soort en niveau, wat nu kan eerst', async () => {
  const { upgradeAdvice, adviceReady, adviceBarHtml } = await import('../public/js/ui.js');
  const { BUILDINGS, levelCost } = await import('../public/shared/rules.js');
  const s = newTownState(0, 'greek');
  s.buildings.find((b) => b.type === 'tc').level = 2;
  s.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
  let id = 100;
  const add = (type, level) => { const b = { id: id++, type, x: 0, y: 0, level }; s.buildings.push(b); return b; };
  const h1 = add('house', 1); add('house', 1);
  add('house', 2); // niveau 2 -> 3 vraagt tijdperk 3 (de stad zit in tijdperk 2): niet in de lijst
  const farm = add('farm', 1);
  add('market', BUILDINGS.market.maxLevel); // al op het hoogste niveau
  s.builds = [{ bid: farm.id, to: 2, start: 0, end: 1000 }]; // wordt al verbeterd
  let list = upgradeAdvice(s);
  const key = (g) => `${g.type}${g.level}`;
  assert.ok(list.some((g) => key(g) === 'house1' && g.ids.length === 2), 'twee huizen niveau 1 samen');
  assert.ok(!list.some((g) => key(g) === 'house2'), 'vraagt een later tijdperk');
  assert.ok(list.some((g) => g.type === 'tc'), 'naar het volgende tijdperk');
  assert.ok(!list.some((g) => g.type === 'farm' || g.type === 'market'), 'in aanbouw of al maximaal');
  assert.ok(list.some((g) => g.type === 'wall' && g.level === 0), 'de stadsmuur bouwen (niveau 0 -> 1) hoort erbij');
  assert.deepEqual(list.find((g) => key(g) === 'house1').cost, levelCost('house', 2));
  assert.ok(list.every((g, i) => i === 0 || !!list[i - 1].err <= !!g.err), 'wat nu kan eerst');
  const ready = adviceReady(s);
  assert.ok(ready >= 3, `${ready} gebouwen kunnen nu`);
  // alle bouwers bezig: niets kan nu, met de reden
  s.builds.push({ bid: h1.id, to: 2, start: 0, end: 2000 }); // nu 2 van de 2 bouwers bezig
  list = upgradeAdvice(s);
  assert.ok(list.every((g) => g.err === 'Al je bouwers zijn bezig.'));
  assert.equal(adviceReady(s), 0);
  assert.equal(list.find((g) => key(g) === 'house1').ids.length, 1, 'het huis in aanbouw valt weg');
  const h = adviceBarHtml({ data: { team: { color: '#c0392b' } }, now: () => 0 }, s);
  assert.match(h, /Bouwers/); assert.match(h, /2\/2/);
  assert.match(h, /data-action="adviceGo" data-id="\d+"/, 'lopende bouw: tik = naar het gebouw');
  assert.match(h, /data-action="adviceGo" data-type="house" data-level="1"/);
  assert.doesNotMatch(h, /NaN|undefined/);
});

test('tabblad Bouwadvies: gebouwen die je nog niet hebt (bv. het havenhuis in tijdperk 2) staan er ook in', async () => {
  const { newBuildAdvice, adviceReady, adviceBarHtml } = await import('../public/js/ui.js');
  const s = newTownState(0, 'greek');
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  assert.ok(!newBuildAdvice(s).some((g) => g.type === 'harbor'), 'tijdperk 1: nog geen havenhuis');
  s.buildings.find((b) => b.type === 'tc').level = 2;
  const fresh = newBuildAdvice(s);
  const harbor = fresh.find((g) => g.type === 'harbor');
  assert.ok(harbor && !harbor.err, 'tijdperk 2: havenhuis kan nu');
  const have = new Set(s.buildings.map((b) => b.type));
  assert.ok(!fresh.some((g) => have.has(g.type) || g.type === 'wall'), 'enkel wat je nog helemaal niet hebt');
  assert.ok(adviceReady(s) >= fresh.filter((g) => !g.err).length);
  const h = adviceBarHtml({ data: { team: { color: '#c0392b' } }, now: () => 0 }, s);
  assert.match(h, /data-action="place" data-type="harbor"/, 'tik = meteen plaatsen');
  assert.doesNotMatch(h, /NaN|undefined/);
  s.buildings.push({ id: 900, type: 'harbor', x: 0, y: 0, level: 1 });
  assert.ok(!newBuildAdvice(s).some((g) => g.type === 'harbor'), 'gebouwd: niet meer bij de nieuwe');
});

// ---------- meldingen per soort: aanval op je stad, bouwer vrij, je leger komt aan ----------
import { notifyBuilds } from '../functions/lib/push.js';
import { saveTown, loadTown, nextBuildAt } from '../functions/lib/game.js';

test('meldingen: elke soort apart aan/uit per toestel; aanval op je stad (en op een clanlid) meteen bij vertrek', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const later = [];
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env, waitUntil: (p) => later.push(p) });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  const settle = async () => { while (later.length) await later.shift(); };
  await call('POST', '/admin/reset', { teamSize: 1, seed: 7, bots: 0 });
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'egypt' });
  const b = await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'greek' });
  const c = await call('POST', '/register', { name: 'Cees', password: 'geheim123', civ: 'persia' });
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql('UPDATE players SET created_at = ?', now - 2 * 86400000);
  sql("UPDATE towns SET state = json_set(state, '$.units.spear', 20)");
  // Cees zit in de clan van Bert
  sql("UPDATE players SET team_id = (SELECT team_id FROM players WHERE name = 'Bert') WHERE name = 'Cees'");
  await settle();
  // Bert heeft twee toestellen: op het tweede zet hij 'aanval op je stad' (meteen) uit
  const [p1, k1] = await fakeDevice(); const [p2, k2] = await fakeDevice();
  const ep1 = 'https://fcm.googleapis.com/fcm/send/bert-gsm'; const ep2 = 'https://fcm.googleapis.com/fcm/send/bert-pc';
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { sent.push(String(url)); return new Response(null, { status: 201 }); };
  try {
    let r = await call('POST', '/push/subscribe', { endpoint: ep1, keys: { p256dh: p1, auth: k1 } }, b.cookie);
    assert.deepEqual(r.data.prefs, { now: true, ally: true, attack: true, build: true, march: true }, 'standaard alles aan');
    await call('POST', '/push/subscribe', { endpoint: ep2, keys: { p256dh: p2, auth: k2 } }, b.cookie);
    r = await call('POST', '/push/prefs', { endpoint: ep2, now: false }, b.cookie);
    assert.deepEqual(r.data.prefs, { now: false, ally: true, attack: true, build: true, march: true });
    assert.equal((await call('POST', '/push/prefs', { endpoint: ep2, now: true }, a.cookie)).status, 400, 'niet van een ander');
    // Cees (clanlid) heeft ook twee toestellen: op het tweede staat 'aanval op een clanlid' uit
    const [p3, k3] = await fakeDevice(); const [p4, k4] = await fakeDevice();
    const ep3 = 'https://fcm.googleapis.com/fcm/send/cees-gsm'; const ep4 = 'https://fcm.googleapis.com/fcm/send/cees-pc';
    await call('POST', '/push/subscribe', { endpoint: ep3, keys: { p256dh: p3, auth: k3 } }, c.cookie);
    await call('POST', '/push/subscribe', { endpoint: ep4, keys: { p256dh: p4, auth: k4 } }, c.cookie);
    r = await call('POST', '/push/prefs', { endpoint: ep4, ally: false }, c.cookie);
    assert.equal(r.data.prefs.ally, false);
    // Anna heeft ook een toestel: zij hoort niet bij de clan van Bert
    const [p5, k5] = await fakeDevice();
    await call('POST', '/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/anna', keys: { p256dh: p5, auth: k5 } }, a.cookie);
    await settle(); sent.length = 0;
    // Anna valt Bert aan: Bert en zijn clanlid krijgen meteen een melding, enkel op de toestellen waar het aan staat
    const bert = db.raw.prepare("SELECT t.id FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = 'Bert'").get().id;
    r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: bert, units: { spear: 5 } }, a.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    await settle();
    assert.deepEqual(sent.sort(), [ep1, ep3].sort());
    // Cees kan zijn clanlid niet aanvallen (dus ook geen melding naar zichzelf)
    sent.length = 0;
    r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: bert, units: { spear: 5 } }, c.cookie);
    assert.equal(r.status, 400);
    await settle();
    assert.deepEqual(sent, []);
    // een karavaan of versterking geeft geen aanvalsmelding (hier: een kamp aanvallen)
    sent.length = 0;
    const camp = db.raw.prepare('SELECT id FROM camps LIMIT 1').get().id;
    r = await call('POST', '/march', { kind: 'attack', targetKind: 'camp', targetId: camp, units: { spear: 5 } }, a.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    await settle();
    assert.deepEqual(sent, []);
  } finally { globalThis.fetch = realFetch; }
});

test('meldingen: de migratie zet de nieuwe soorten aan, behalve meteen-bij-vertrek voor wie aanvallen uitzette', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort();
  const mig = files.indexOf('0012_notify_now_ally.sql');
  assert.ok(mig > 0);
  for (const f of files.slice(0, mig)) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  raw.exec("INSERT INTO push_subs (player_id, endpoint, p256dh, auth, created_at, n_attack) VALUES (1, 'https://x/a', 'p', 'a', 0, 1), (2, 'https://x/b', 'p', 'a', 0, 0)");
  for (const f of files.slice(mig)) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  const rows = raw.prepare('SELECT player_id, n_now, n_ally FROM push_subs ORDER BY player_id').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ player_id: 1, n_now: 1, n_ally: 1 }, { player_id: 2, n_now: 0, n_ally: 1 }]);
});

test('meldingen: bouwer vrij als een bouwwerk klaar is (saveTown houdt het tijdstip bij), nooit dubbel', async () => {
  const db = await memoryD1();
  const ins = (q, ...a) => db.raw.prepare(q).run(...a);
  ins("INSERT INTO players (id, name, pass_hash, salt, team_id, created_at) VALUES (1, 'Bert', 'x', 'x', 1, 0), (2, 'Robot', 'x', 'x', 2, 0)");
  const s = newTownState(0, 'greek');
  const house = { id: 50, type: 'house', x: 0, y: 0, level: 2 };
  const farm = { id: 51, type: 'farm', x: 3, y: 0, level: 0 };
  s.buildings.push(house, farm);
  const T = 5_000_000;
  s.builds = [{ bid: 50, to: 3, start: 0, end: T }, { bid: 51, to: 1, start: 0, end: T + 600000 }];
  const bot = newTownState(0, 'egypt'); bot.bot = { tier: 'sterk' }; bot.builds = [{ bid: 1, to: 2, start: 0, end: T }];
  ins("INSERT INTO towns (id, player_id, name, x, y, state) VALUES (10, 1, 'Duivenhemel', 0, 0, '{}'), (20, 2, 'Botstad', 5, 5, '{}')");
  for (const [id, st] of [[10, s], [20, bot]]) { const t = await loadTown(db, id); t.state = st; await saveTown(db, t); }
  const at = (id) => db.raw.prepare('SELECT build_at FROM towns WHERE id = ?').get(id).build_at;
  assert.equal(at(10), T, 'het eerstvolgende einde');
  assert.equal(at(20), null, 'niet voor computerspelers');
  assert.equal(nextBuildAt({ builds: [] }), null);
  ins("INSERT INTO push_subs (player_id, endpoint, p256dh, auth, created_at, n_build) VALUES (1, 'https://fcm.googleapis.com/fcm/send/aan', ?, ?, 0, 1), (1, 'https://fcm.googleapis.com/fcm/send/uit', ?, ?, 0, 0)",
    ...(await fakeDevice()), ...(await fakeDevice()));
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { sent.push(String(url).split('/').pop()); return new Response(null, { status: 201 }); };
  try {
    assert.equal(await notifyBuilds(db, T - 1000), 0, 'nog niet klaar');
    assert.equal(await notifyBuilds(db, T + 30000), 1, 'het huis is klaar');
    assert.deepEqual(sent, ['aan'], 'enkel waar bouwer vrij aan staat');
    assert.equal(at(10), T + 600000, 'nu wachten op de boerderij');
    assert.equal(await notifyBuilds(db, T + 60000), 0, 'niet dubbel');
    assert.equal(await notifyBuilds(db, T + 700000), 1, 'de boerderij');
    assert.equal(at(10), null, 'niets meer in aanbouw');
    // een afgebroken bouw (niet meer in de stad) geeft geen melding, maar build_at schuift wel op
    const t = await loadTown(db, 10);
    t.state.builds = [{ bid: 999, to: 2, start: 0, end: T + 800000 }];
    await saveTown(db, t);
    sent.length = 0;
    assert.equal(await notifyBuilds(db, T + 900000), 0);
    assert.equal(at(10), null);
  } finally { globalThis.fetch = realFetch; }
  // de migratie vult build_at in voor steden die al iets bouwen (geen computerspelers)
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort();
  const i8 = files.findIndex((f) => f.startsWith('0008'));
  for (const f of files.slice(0, i8)) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  raw.prepare("INSERT INTO towns (id, player_id, name, x, y, state) VALUES (1, 1, 'a', 0, 0, ?), (2, 2, 'b', 1, 1, ?), (3, 3, 'c', 2, 2, '{}')")
    .run(JSON.stringify({ builds: [{ end: 7 }, { end: 3 }] }), JSON.stringify({ bot: {}, builds: [{ end: 3 }] }));
  for (const f of files.slice(i8)) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  assert.deepEqual(raw.prepare('SELECT build_at FROM towns ORDER BY id').all().map((r) => r.build_at), [3, null, null]);
});

// ---------- oorlog moet lonen ----------
import { WAR, carryMult, bountyOf, unitValue as uValue, RES } from '../public/shared/rules.js';
import { subtractUnits } from '../public/shared/battle.js';

test('oorlog loont: buit groeit met je tijdperk, krijgsbuit voor wie de slag wint (ook de verdediger), punten voor buit', async () => {
  assert.equal(carryCapacity({ sword: 10 }), 500, 'zonder tijdperk het ruwe draagvermogen');
  assert.equal(carryCapacity({ sword: 10 }, 1), 500 * WAR.carry[1]);
  assert.equal(carryCapacity({ sword: 10 }, 5), 500 * WAR.carry[5]);
  for (let a = 2; a <= MAX_AGE; a++) assert.ok(carryMult(a) > carryMult(a - 1), 'elk tijdperk meer');
  assert.deepEqual(bountyOf({ spear: 10 }), { food: 120, wood: 75, stone: 0, gold: 0 }, '30% van 10 x (40 voedsel + 25 hout)');
  assert.deepEqual(bountyOf({ barbarian: 5 }), { food: 0, wood: 0, stone: 0, gold: 0 }, 'wilde dieren hebben geen uitrusting');
  // een soldaat die plundert, brengt per plaats in je bevolking minstens zoveel op als een dorpeling (aanval van 4 uur heen en terug)
  for (let a = 1; a <= MAX_AGE; a++) {
    const vill = GATHER_RATE.food * (1 + 0.1 * (a - 1));
    const unit = a >= 3 ? 'knight' : a >= 2 ? 'sword' : 'spear';
    const perPop = carryCapacity({ [unit]: 1 }, a) / 4 / U2[unit].pop;
    assert.ok(perPop >= vill, `tijdperk ${a}: ${unit} ${perPop.toFixed(1)}/u tegen dorpeling ${vill.toFixed(1)}/u`);
  }

  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 1, seed: 7 });
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'egypt' });
  await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'greek' });
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  const one = (q, ...v) => db.raw.prepare(q).get(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql('UPDATE players SET created_at = ?', now - 2 * 86400000);
  const anna = one("SELECT p.id, p.team_id, t.id AS tid, t.x, t.y FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Anna'");
  const bert = one("SELECT p.id, p.team_id, t.id AS tid, t.x, t.y FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Bert'");
  // Anna en Bert in het IJzertijdperk; Bert heeft een volle opslag en een handvol speerdragers
  sql("UPDATE towns SET state = json_set(state, '$.buildings[0].level', 3)");
  sql(`UPDATE towns SET state = json_set(state, '$.res', json('{"food":8000,"wood":8000,"stone":8000,"gold":8000}'), '$.units', json('{"spear":10}')) WHERE id = ?`, bert.tid);
  const march = (units, id) => sql(`INSERT INTO marches (id, player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y, units, depart_at, arrive_at, status)
    VALUES (?, ?, ?, 'attack', ?, ?, ?, 'town', ?, ?, ?, ?, ?, ?, ?, 'out')`, id, anna.id, anna.team_id, anna.tid, anna.x, anna.y, bert.tid, bert.team_id, bert.x, bert.y, JSON.stringify(units), now - 3600000, now - 600000);

  // 1) Anna wint: buit x3 (IJzer) + krijgsbuit van de gesneuvelde verdedigers, punten voor doden en buit
  march({ sword: 100 }, 1);
  await call('GET', '/state', null, a.cookie);
  const m = one('SELECT * FROM marches WHERE id = 1');
  assert.equal(m.status, 'back');
  const rep = JSON.parse(one("SELECT data FROM reports WHERE player_id = ? AND kind = 'attack' ORDER BY id DESC", anna.id).data);
  assert.equal(rep.attWins, true);
  const left = subtractUnits({ sword: 100 }, rep.attLost);
  const lootSum = RES.reduce((s, r) => s + rep.loot[r], 0);
  assert.ok(Math.abs(lootSum - carryCapacity(left, 3)) <= 4, `buit ${lootSum} = 3 x draagvermogen ${carryCapacity(left)}`);
  assert.deepEqual(rep.bounty, bountyOf(rep.defLost));
  assert.ok(rep.bounty.food > 0);
  const back = JSON.parse(m.res);
  for (const r of RES) assert.equal(back[r], rep.loot[r] + rep.bounty[r], 'krijgsbuit gaat mee naar huis');
  const pts = one('SELECT kill_pts FROM players WHERE id = ?', anna.id).kill_pts;
  assert.equal(pts, Math.round(uValue(rep.defLost) / WAR.killPts + lootSum / WAR.lootPts));

  // 2) Bert houdt stand: hij krijgt de krijgsbuit van de gesneuvelde aanvallers meteen in zijn opslag
  sql(`UPDATE towns SET state = json_set(state, '$.units', json('{"spear":80}'), '$.res', json('{"food":500,"wood":500,"stone":500,"gold":500}')) WHERE id = ?`, bert.tid);
  march({ spear: 10 }, 2);
  await call('GET', '/state', null, a.cookie);
  const rep2 = JSON.parse(one("SELECT data FROM reports WHERE player_id = ? AND kind = 'defense' ORDER BY id DESC", bert.id).data);
  assert.equal(rep2.attWins, false);
  assert.deepEqual(rep2.bounty, bountyOf(rep2.attLost));
  assert.ok(rep2.bounty.food >= 100);
  const bs = JSON.parse(one('SELECT state FROM towns WHERE id = ?', bert.tid).state);
  assert.ok(bs.res.food >= 500 + rep2.bounty.food && bs.res.wood >= 500 + rep2.bounty.wood, JSON.stringify(bs.res));
});

// ---------- bots: aanvallen in golven, enkel tegen wie ongeveer even sterk is ----------
import { BOT_WAR } from '../functions/lib/bots.js';
import { cronTick } from '../functions/lib/crontick.js';

async function botWorld() {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body) => (await handle({ request: new Request(`http://x/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-admin-key': 'k' }, body: body && JSON.stringify(body) }), env })).json();
  await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 2, bots: 2, botLevel: 2, seed: 11 });
  await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  const sql = (q, ...v) => db.raw.prepare(q).all(...v);
  const now = Date.now();
  db.raw.prepare('UPDATE world SET start_at = ?, bot_check = ?').run(now - 4 * 86400000, now);
  db.raw.prepare('UPDATE players SET created_at = ?').run(now - 3 * 86400000);
  const bots = sql('SELECT p.id, p.team_id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.bot = 1 ORDER BY p.id');
  const anna = sql("SELECT p.id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Anna'")[0];
  // een stad in het IJzertijdperk (zelfde opbouw voor iedereen)
  const base = (units) => {
    const s = newTownState(now, 'greek');
    s.buildings[0].level = 3;
    let id = 10;
    for (const [type, x, y, level] of [['house', 3, 3, 3], ['house', 4, 3, 3], ['farm', 3, 8, 3], ['lumber', 8, 3, 3], ['barracks', 8, 8, 3], ['storage', 3, 4, 2]]) s.buildings.push({ id: id++, type, x, y, level });
    s.nextId = id; s.units = units; s.villagers = { idle: 0, food: 12, wood: 12, stone: 4, gold: 4 };
    s.res = { food: 6000, wood: 6000, stone: 3000, gold: 3000 };
    return s;
  };
  const put = (tid, s) => { ensureTerritory(s, tid); db.raw.prepare('UPDATE towns SET state = ? WHERE id = ?').run(JSON.stringify(s), tid); };
  return { db, sql, now, bots, anna, base, put, world: async () => getWorld(db) };
}

test('bots: een clan valt samen aan in golven, telkens ±10 minuten na elkaar', async () => {
  const { db, sql, now, bots, anna, base, put, world } = await botWorld();
  for (const b of bots) { const s = base({ sword: 45, archer: 20 }); s.bot = { tier: 'gemiddeld', v: 2 }; put(b.tid, s); }
  const as = base({ spear: 25, archer: 10 });
  put(anna.tid, as);
  const ratio = townScore(as) / townScore(JSON.parse(sql('SELECT state FROM towns WHERE id = ?', bots[0].tid)[0].state));
  assert.ok(ratio >= BOT_WAR.waveFrom && ratio <= BOT_WAR.soloMax, `ongeveer even sterk (${ratio.toFixed(2)})`);
  const w = await world();
  const attacks = () => sql("SELECT player_id, depart_at, arrive_at FROM marches WHERE kind = 'attack' AND target_kind = 'town' AND target_id = ? ORDER BY arrive_at", anna.tid);
  // de cron-worker laat elke minuut een bot aan de beurt (ook als niemand online is)
  let t = now;
  db.raw.prepare('UPDATE players SET bot_next = 0 WHERE bot = 1').run();
  for (let k = 0; k < 40 && attacks().length < 2; k++) { t += 60000; await cronTick(db, t); }
  const list = attacks();
  assert.equal(list.length, 2, 'beide bots van de clan vallen aan');
  assert.notEqual(list[0].player_id, list[1].player_id);
  const gap = list[1].arrive_at - list[0].arrive_at;
  const step = BOT_WAR.step * 3600000 / (w.speed || 1);
  assert.ok(gap >= step - 1000 && gap <= step + 5 * 60000, `${Math.round(gap / 60000)} min tussen de golven`);
  const clan = JSON.parse(sql('SELECT v FROM config WHERE k = ?', `clan:${bots[0].team_id}`)[0].v);
  assert.equal(clan.wave, true);
  assert.equal(clan.waves.length, 2);
  // daarna valt niemand nog eens aan: elke bot één golf
  for (let k = 0; k < 15; k++) { t += 60000; await cronTick(db, t); }
  assert.equal(attacks().length, 2);
});

test('bots: geen aanval op een speler die meer dan dubbel zo sterk is, ook al zouden ze winnen', async () => {
  const { db, sql, now, bots, anna, base, put } = await botWorld();
  for (const b of bots) { const s = base({ sword: 45, archer: 20 }); s.bot = { tier: 'gemiddeld', v: 2 }; put(b.tid, s); }
  // veel punten (monument, kathedraal), maar geen leger
  const as = base({});
  as.buildings[0].level = 5;
  as.buildings.push({ id: 90, type: 'monument', x: 1, y: 8, level: 2 });
  put(anna.tid, as);
  const ratio = townScore(as) / townScore(JSON.parse(sql('SELECT state FROM towns WHERE id = ?', bots[0].tid)[0].state));
  assert.ok(ratio > BOT_WAR.waveMax, `veel sterker (${ratio.toFixed(2)})`);
  let t = now;
  db.raw.prepare('UPDATE players SET bot_next = 0 WHERE bot = 1').run();
  for (let k = 0; k < 20; k++) { t += 60000; await cronTick(db, t); }
  assert.equal(sql("SELECT COUNT(*) AS c FROM marches WHERE kind = 'attack' AND target_kind = 'town' AND target_id = ?", anna.tid)[0].c, 0);
});

test('beeldsnelheid: hooguit ±60 beelden per seconde, ook op een gsm-scherm van 90/120/144 Hz', async () => {
  const FX = await import('../public/js/fx.js');
  for (const [hz, want] of [[60, 60], [90, 45], [120, 60], [144, 48]]) {
    const p = new FX.Pacer(); let drawn = 0; let t = 0;
    for (let i = 0; i < hz * 3; i++) { t += 1000 / hz; if (p.ok(t) && i >= hz) drawn++; }
    assert.ok(Math.abs(drawn / 2 - want) <= 1, `${hz} Hz: ${drawn / 2} beelden/s`);
    assert.ok(Math.abs(FX.frameMs - 1000 / want) < 0.5);
  }
});

test('oude ontdekkingen (weer weggehaald) worden opgeruimd: geen relikwie-goud, geen gevecht of tocht meer naar een plek', () => {
  const s = terrTown(5);
  s.relics = 2; s.terr.sites = { 1: 1 };
  s.terr.fights = [{ id: 7, foe: { type: 'den', id: 6 }, t0: s.t, a: [], b: [], end: s.t + 60000 }];
  s.field = [{ id: 50, units: { sword: 3 }, x0: 1, y0: 1, x1: 1, y1: 1, t0: s.t, t1: s.t, pending: false, order: null, work: null, fight: 7 },
    { id: 51, units: { villager: 1 }, job: 'food', x0: 1, y0: 1, x1: 9, y1: 9, t0: s.t, t1: s.t + 60000, pending: true, order: { type: 'site', id: 2 }, work: null }];
  ensureTerritory(s, 5);
  assert.equal(s.relics, undefined);
  assert.equal(s.terr.sites, undefined);
  assert.deepEqual(s.terr.fights, []);
  assert.equal(s.field[0].fight, null);
  assert.equal(s.field[1].order.type, 'move');
  advance(s, s.t + 3600000, 1); // loopt gewoon verder zonder fouten
  assert.equal(territory(5).sites, undefined, 'geen ontdekkingen meer in het gebied');
});

// ---------- een clan verplaatsen (beheer en eenmalige opdracht) ----------
import { relocateTeam, runOneOff, ONE_OFF } from '../functions/lib/relocate.js';
import { generateTerrain as genTerrain, isBuildable as buildableTile } from '../public/shared/worldgen.js';

test('clan verplaatsen: willekeurige plek op land, ver van de andere steden, clanleden naast elkaar, legers volgen, één keer', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body) => (await handle({ request: new Request(`http://x/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-admin-key': 'k' }, body: body && JSON.stringify(body) }), env })).json();
  await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 2, seed: 4242 });
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  const all = (q, ...v) => db.raw.prepare(q).all(...v);
  // 5 spelers dicht bij elkaar, waarvan 2 van de Rozenwacht
  sql('DELETE FROM teams'); sql('DELETE FROM towns'); sql('DELETE FROM players'); sql('DELETE FROM marches');
  sql("INSERT INTO teams (id, slot, name, color) VALUES (1, 0, 'Huis van de Eik', '#d64545'), (2, 1, 'Wolvenclan', '#3f7fd9'), (6, 5, 'Rozenwacht', '#e07a2a')");
  const pos = [[1, 20, 20], [1, 23, 21], [2, 21, 24], [6, 25, 23], [6, 22, 27]];
  pos.forEach(([team, x, y], i) => {
    sql("INSERT INTO players (id, name, pass_hash, salt, team_id, created_at) VALUES (?, ?, 'x', 'x', ?, 0)", i + 1, `Speler ${i + 1}`, team);
    sql('INSERT INTO towns (id, player_id, name, x, y, state) VALUES (?, ?, ?, ?, ?, ?)', i + 1, i + 1, `Stad ${i + 1}`, x, y, '{}');
  });
  // een aanval op de Rozenwacht en een leger van de Rozenwacht onderweg
  sql("INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, to_x, to_y, units, depart_at, arrive_at, status) VALUES (1, 1, 'attack', 1, 20, 20, 'town', 4, 25, 23, '{}', 0, 9e12, 'out')");
  sql("INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, to_x, to_y, units, depart_at, arrive_at, status) VALUES (5, 6, 'attack', 5, 22, 27, 'camp', 1, 30, 30, '{}', 0, 9e12, 'out')");
  const world = await getWorld(db);
  const now = Date.now();
  const jobs = [{ key: 'test-rozenwacht', team: 'Rozenwacht' }];
  const done = await runOneOff(db, world, now, jobs);
  assert.equal(done.length, 1);
  const r = done[0].r;
  assert.equal(r.team, 'Rozenwacht');
  assert.equal(r.moved.length, 2);
  const terrain = genTerrain(world.seed, world.size);
  const towns = all('SELECT id, x, y FROM towns ORDER BY id');
  const [a, b] = [towns[3], towns[4]];
  for (const t of [a, b]) assert.ok(buildableTile(terrain.tiles[t.y * world.size + t.x]), 'op bebouwbaar land');
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(d >= 4 && d <= 8, `clanleden naast elkaar (${d.toFixed(1)} tegels)`);
  for (const o of towns.slice(0, 3)) for (const t of [a, b]) assert.ok(Math.hypot(o.x - t.x, o.y - t.y) >= 12, 'ver van de andere steden');
  assert.deepEqual(towns.slice(0, 3).map((t) => [t.x, t.y]), [[20, 20], [23, 21], [21, 24]], 'de anderen blijven staan');
  const m = all('SELECT from_x, from_y, to_x, to_y FROM marches ORDER BY id');
  assert.deepEqual([m[0].to_x, m[0].to_y], [a.x, a.y], 'een aanval op de Rozenwacht gaat naar de nieuwe plek');
  assert.deepEqual([m[1].from_x, m[1].from_y], [b.x, b.y], 'een leger van de Rozenwacht vertrekt van de nieuwe plek');
  assert.equal(all("SELECT COUNT(*) AS c FROM reports WHERE kind = 'info' AND player_id IN (4, 5)")[0].c, 2, 'de spelers krijgen een bericht');
  // nooit twee keer
  assert.equal((await runOneOff(db, world, now + 60000, jobs)).length, 0);
  assert.deepEqual(all('SELECT x, y FROM towns WHERE id = 4').map((t) => [t.x, t.y])[0], [a.x, a.y]);
  // de echte opdracht stopt na zijn datum; ook via beheer kan het
  assert.equal(ONE_OFF[0].team, 'Rozenwacht');
  assert.equal((await runOneOff(db, world, ONE_OFF[0].until + 1)).length, 0);
  const res = await call('POST', '/admin/relocate', { team: 'Wolvenclan' });
  assert.equal(res.ok, true);
  assert.equal(res.moved.length, 1);
});

// ---------- snelheid op de server (gratis plan: ±10 ms CPU, 50 D1-vragen per verzoek) ----------
import { settleBuilds } from '../public/shared/sim.js';
import { CRON_STALE } from '../functions/lib/routes.js';

test('het gebied rond een stad blijft exact hetzelfde (bomen, water, bronnen), ook na het sneller maken', () => {
  const sig = (seed) => { const t = territory(seed); let h = 0; for (const v of t.tiles) h = (Math.imul(h, 31) + v) | 0; for (const tr of t.trees) h = (Math.imul(h, 31) + tr.idx * 7 + tr.v) | 0; return h + ':' + t.trees.length + ':' + t.deposits.map((d) => d.x + ',' + d.y).join(';'); };
  assert.deepEqual([1, 5, 17, 1234].map(sig), GOLDEN_TERR);
});

test('wereldkaart en ranglijst: afgewerkte bouwwerken tellen mee zonder de hele stad bij te rekenen', () => {
  const s = newTownState(0, 'greek');
  s.buildings.push({ id: 9, type: 'house', x: 1, y: 1, level: 1 });
  s.builds = [{ bid: 9, to: 2, start: 0, end: 1000 }, { bid: 1, to: 2, start: 0, end: 5000 }];
  settleBuilds(s, 2000);
  assert.equal(s.buildings.find((b) => b.id === 9).level, 2);
  assert.equal(s.buildings[0].level, 1, 'het tijdperk is nog niet klaar');
  assert.equal(s.builds.length, 1);
  settleBuilds(s, 6000);
  assert.equal(s.buildings[0].level, 2);
});

test('zolang de cron-worker draait, verwerkt een gewoon verzoek enkel de eigen legers; de cron-worker de rest', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  await call('POST', '/admin/reset', { peaceHours: 0, seasonDays: 28, teamSize: 1, seed: 3 });
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'greek' });
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  const one = (q, ...v) => db.raw.prepare(q).get(...v);
  sql('UPDATE world SET start_at = ?', now - 86400000);
  const anna = one("SELECT p.id, p.team_id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Anna'");
  const bert = one("SELECT p.id, p.team_id, t.id AS tid FROM players p JOIN towns t ON t.player_id = p.id WHERE p.name = 'Bert'");
  const camp = one('SELECT id, x, y FROM camps LIMIT 1');
  for (const j of ONE_OFF) sql('INSERT OR REPLACE INTO config (k, v) VALUES (?, ?)', `once:${j.key}`, 'al gedaan'); // eenmalige opdrachten niet hier
  const back = (p, n) => { for (let k = 0; k < n; k++) sql(`INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, to_x, to_y, units, res, depart_at, arrive_at, status)
    VALUES (?, ?, 'attack', ?, 0, 0, 'camp', ?, ?, ?, '{"spear":3}', '{"food":10}', ?, ?, 'back')`, p.id, p.team_id, p.tid, camp.id, camp.x, camp.y, now - 7200000, now - 600000 - k); };
  back(anna, 3); back(bert, 5);
  const left = (p) => one("SELECT COUNT(*) AS c FROM marches WHERE player_id = ? AND status = 'back'", p.id).c;
  // de cron-worker draait: Anna's verzoek verwerkt hooguit 2 van haar eigen legers, niets van Bert
  sql('UPDATE world SET cron_at = ?', now - 30000);
  await call('GET', '/state', null, a.cookie);
  assert.equal(left(anna), 1);
  assert.equal(left(bert), 5);
  // de cron-worker zelf: hooguit 3 legers per minuut, ook die van wie niet online is
  const ct = await cronTick(db, Date.now());
  assert.equal(left(anna) + left(bert), 3, JSON.stringify(ct));
  assert.ok(one('SELECT cron_at FROM world').cron_at >= now, 'de cron-worker meldt dat hij draait');
  // draait de cron-worker niet meer, dan verwerkt een gewoon verzoek alles zoals vroeger
  sql('UPDATE world SET cron_at = ?', now - CRON_STALE - 60000);
  await call('GET', '/state', null, a.cookie);
  assert.equal(left(anna) + left(bert), 0);
});

// vingerafdruk van het gebied rond enkele steden, berekend met de code van vóór de versnelling (25/11)
const GOLDEN_TERR = ["460196450:676:22,-7.4;-3.9,-12.8;7.4,-9.2;26.2,-1.1;-12.6,12.8;-11.9,-4.2;26.7,13.2;18.8,-12.8;8.7,25.3","153139303:565:21.9,-4.3;13.4,20.1;22.5,21.3;-8.6,11.9;-5,22.2;8.8,19.9;-9.3,17.5;-9,-12.1;-11.4,-7.6","-1797553060:701:-5.7,20.1;13.7,22.7;-9.5,-8.4;0.6,22;25.7,10.3;-3.1,-14.9;-7.8,12.3;-2.7,-7.9;18.6,-14.2","-1563183414:642:-12.7,16.6;10.3,24.6;-2.8,-10.6;-8.2,26.7;15.4,-11.1;9.7,-6.2;-8.8,-6;-12.5,-1.1;-10.4,21.1"];

test('chat: /state telt ongelezen berichten van anderen per kanaal (max. 9) en geeft het laatste bericht mee', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 2, seed: 5 });
  db.raw.prepare('UPDATE world SET start_at = ?').run(Date.now() - 3600000);
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  const b = await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'greek' });
  for (let k = 0; k < 3; k++) await call('POST', '/chat', { channel: 'world', text: `hallo ${k}` }, b.cookie);
  for (let k = 0; k < 2; k++) await call('POST', '/chat', { channel: 'team', text: `team ${k}` }, b.cookie);
  await call('POST', '/chat', { channel: 'world', text: 'van mij' }, a.cookie);
  let st = (await call('GET', '/state?cw=0&ct=0', null, a.cookie)).data.chat;
  assert.equal(st.newWorld, 3, 'eigen berichten tellen niet');
  assert.equal(st.newTeam, 2, 'Anna en Bert zitten samen in een clan');
  assert.equal(st.lastWorld.name, 'Anna');
  assert.equal(st.lastWorld.me, 1);
  assert.equal(st.lastTeam.name, 'Bert');
  assert.equal(st.lastTeam.text, 'team 1');
  st = (await call('GET', `/state?cw=${st.world}&ct=${st.team}`, null, a.cookie)).data.chat;
  assert.equal(st.newWorld + st.newTeam, 0, 'alles gezien');
  for (let k = 0; k < 14; k++) await call('POST', '/chat', { channel: 'world', text: `veel ${k}` }, b.cookie);
  st = (await call('GET', '/state?cw=0&ct=0', null, a.cookie)).data.chat;
  assert.equal(st.newWorld, 9, 'hooguit 9 geteld (9+)');
});

// ---------- havenhuis: vissen ----------
import { FISH, JOBS, BUILDINGS as BLD2, levelCost as lvlCost } from '../public/shared/rules.js';
import {
  shoreSpots, shoreTile, checkBoat, doBoat, maxBoats, boatsReady, doAssign as assign, rates as rateNow, slots as slotsOf,
  doBuild as build1, doUpgrade as upgrade1, doDemolish as demolish1, canPlaceAt as placeOk, checkBuild as cBuild,
} from '../public/shared/sim.js';

function harborTown(age = 2) {
  const s = newTownState(0, 'greek');
  ensureTerritory(s, 5);
  s.buildings[0].level = age;
  s.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
  s.buildings.push({ id: 50, type: 'storage', x: 1, y: 1, level: 3 });
  return s;
}

test('havenhuis: vanaf het Bronstijdperk, enkel op vrij land naast het water', () => {
  const s1 = harborTown(1);
  assert.match(cBuild(s1, 'harbor'), /Brons/);
  const s = harborTown(2);
  assert.equal(cBuild(s, 'harbor'), null);
  const spots = shoreSpots(s);
  assert.ok(spots.length >= 2, `plekken aan de vijver: ${spots.length}`);
  for (const [i, j] of spots) assert.ok(shoreTile(s, i, j));
  assert.ok(!placeOk(s, 'harbor', 5, 5), 'niet midden in het dorp');
  assert.ok(!placeOk(s, 'harbor', 2, 2), 'niet op gewone bouwgrond zonder water');
  assert.throws(() => build1(s, 'harbor', 2, 2, 0, 1), /naast het water/);
  const [i, j] = spots[0];
  assert.ok(!placeOk(s, 'farm', i, j) || ringOf(i, j) <= 1, 'een gewoon gebouw mag daar niet (buiten je bouwgrond)');
  const b = build1(s, 'harbor', i, j, 0, 1);
  advance(s, 3 * 3600000, 1);
  assert.equal(b.level, 1);
});

test('havenhuis: bootjes bouwen (een per niveau, hooguit 4), 2 vissers per bootje, sneller voedsel dan de boerderij', () => {
  const s = harborTown(2);
  const [i, j] = shoreSpots(s)[0];
  const b = build1(s, 'harbor', i, j, 0, 1);
  assert.match(checkBoat(s), /havenhuis/);
  advance(s, 3600000, 1);
  assert.equal(maxBoats(s), 1);
  assert.equal(slotsOf(s).fish, 0, 'nog geen bootje: geen vissers');
  // vrije dorpelingen gaan meteen aan boord als het bootje klaar is
  s.villagers.food -= 2; s.villagers.idle += 2;
  const wood = s.res.wood;
  doBoat(s, s.t, 1);
  assert.equal(s.res.wood, wood - FISH.boatCost.wood);
  assert.match(checkBoat(s), /al een bootje/);
  advance(s, s.t + FISH.boatTime * 1000 + 1, 1);
  assert.equal(s.boats, 1);
  assert.equal(s.villagers.fish, FISH.crew);
  assert.match(checkBoat(s), /Verbeter/, 'niveau 1: één bootje');
  // een visser brengt meer op dan een boer
  const farmer = rateNow({ ...s, villagers: { ...s.villagers, fish: 0, food: 1, wood: 0, stone: 0, gold: 0 } }, 1).food;
  const fisher = rateNow({ ...s, villagers: { ...s.villagers, fish: 1, food: 0, wood: 0, stone: 0, gold: 0 } }, 1).food;
  assert.ok(fisher >= farmer * 1.4, `visser ${fisher.toFixed(1)}/u tegen boer ${farmer.toFixed(1)}/u`);
  // hogere niveaus: meer bootjes en sneller vissen, nooit meer dan 4
  for (let L = 2; L <= 5; L++) { s.buildings[0].level = Math.max(2, L); b.level = L; }
  assert.equal(maxBoats(s), 4);
  const fisher5 = rateNow({ ...s, villagers: { ...s.villagers, fish: 1, food: 0, wood: 0, stone: 0, gold: 0 } }, 1).food;
  assert.ok(fisher5 > fisher * 1.3, 'niveau 5 vist sneller (en het latere tijdperk telt mee)');
  // verdelen: vissers kunnen niet meer zijn dan de plaatsen op de bootjes
  const tot = s.villagers.food + s.villagers.wood + s.villagers.stone + s.villagers.gold + s.villagers.fish + s.villagers.idle;
  assert.throws(() => assign(s, { food: 0, wood: 0, stone: 0, gold: 0, fish: 3 }, 'auto'), /bootjes/);
  assign(s, { food: 0, wood: 0, stone: 0, gold: 0, fish: 2 }, 'fish');
  assert.equal(s.villagers.fish, 2);
  assert.equal(s.rally, 'fish');
  assign(s, { food: 1, wood: 0, stone: 0, gold: 0 }, 'auto'); // zonder 'fish' (oude browser, bots): vissers blijven
  assert.equal(s.villagers.fish, 2);
  assert.equal(s.villagers.food + s.villagers.wood + s.villagers.stone + s.villagers.gold + s.villagers.fish + s.villagers.idle, tot);
  // afbreken: bootjes weg, vissers vrij
  demolish1(s, b.id);
  assert.equal(boatsReady(s), 0);
  assert.equal(s.villagers.fish, 0);
  // deterministisch na JSON heen en terug
  const c = JSON.parse(JSON.stringify(s)); advance(c, s.t + 7200000, 1); advance(s, s.t + 7200000, 1);
  assert.deepEqual(c, s);
});

test('havenhuis: via de server (bouwen aan het water, bootje, vissers verdelen)', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 1, seed: 9 });
  db.raw.prepare('UPDATE world SET start_at = ?').run(Date.now() - 3600000);
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  const town = db.raw.prepare("SELECT t.id, t.state FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = 'Anna'").get();
  const st = JSON.parse(town.state); ensureTerritory(st, town.id);
  st.buildings[0].level = 2; st.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
  db.raw.prepare('UPDATE towns SET state = ? WHERE id = ?').run(JSON.stringify(st), town.id);
  assert.equal((await call('POST', '/build', { type: 'harbor', x: 2, y: 2 }, a.cookie)).status, 400, 'niet zonder water');
  const [i, j] = shoreSpots(st)[0];
  const r = await call('POST', '/build', { type: 'harbor', x: i, y: j }, a.cookie);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  db.raw.prepare("UPDATE towns SET state = json_set(state, '$.builds', json('[]'), '$.buildings[#]', json(?)) WHERE id = ?").run('{}', town.id);
  // bouw meteen klaar laten zijn
  const s2 = JSON.parse(db.raw.prepare('SELECT state FROM towns WHERE id = ?').get(town.id).state);
  s2.buildings = s2.buildings.filter((x) => x.type);
  s2.buildings.find((x) => x.type === 'harbor').level = 1;
  db.raw.prepare('UPDATE towns SET state = ? WHERE id = ?').run(JSON.stringify(s2), town.id);
  const bt = await call('POST', '/boat', {}, a.cookie);
  assert.equal(bt.status, 200, JSON.stringify(bt.data));
  assert.ok(bt.data.state.boatJob);
  assert.equal((await call('POST', '/boat', {}, a.cookie)).status, 400, 'één tegelijk');
});

test('havenhuis: geen oorlogsmist in een vierkant van FISH.sight tegels rond het havenhuis', () => {
  const s = harborTown(2);
  const before = homeSight(s);
  // de verste plek aan het water (daar was er nog mist rond)
  const far = shoreSpots(s).map(([i, j]) => ({ i, j, dark: [[3, 3], [-3, 3], [3, -3], [-3, -3], [3, 0], [-3, 0], [0, 3], [0, -3]].filter(([dx, dy]) => before[tileIndex(i + dx, j + dy)] !== 1).length }))
    .sort((a, b) => b.dark - a.dark)[0];
  assert.ok(far.dark > 0, 'er is een plek aan het water met mist in de buurt');
  build1(s, 'harbor', far.i, far.j, 0, 1);
  const vis = homeSight(s);
  const r = FISH.sight;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) assert.equal(vis[tileIndex(far.i + dx, far.j + dy)], 1, `tegel ${dx},${dy} rond het havenhuis`);
  // ook wat de server als ontdekt telt
  const ex = exploredNow(s, s.t);
  const k = tileIndex(far.i + r, far.j + r);
  assert.ok(ex[k >> 3] & (1 << (k & 7)), 'ontdekt');
});

// ---------- barbaren: het kamp groeit, overvallen worden groter en vaker, 15 minuten om zelf te verdedigen ----------
import { campGrowth, raidChance, applyRaid, raidNow } from '../public/shared/sim.js';

test('barbarenkamp groeit elke dag dat je het met rust laat (tot 3x), overvallen worden groter en vaker', () => {
  const s = terrTown();
  const D = 86400000;
  const c = s.terr.camp;
  assert.equal(campGrowth(s, c.since), 1);
  assert.ok(campGrowth(s, c.since + 2 * D) > 1.6 && campGrowth(s, c.since + 2 * D) < 1.8);
  assert.equal(campGrowth(s, c.since + 30 * D), WILD.camp.growMax, 'niet eindeloos');
  assert.ok(campSize(s, c.since + 4 * D) > campSize(s, c.since) * 2, 'het kamp zelf');
  assert.ok(raidSize(s, c.since + 4 * D) > raidSize(s, c.since) * 2, 'en de overvallen');
  assert.ok(raidChance(s, c.since + 4 * D) > raidChance(s, c.since + D) * 2, 'meer kans op een overval');
  assert.equal(raidChance(s, c.since + 30 * D), WILD.raid.maxChance);
  // lang laten begaan: de overvallen komen steeds sneller na elkaar (tijd tussen twee overvallen, gemiddeld over steden)
  const gaps = { early: [], late: [] };
  for (let seed = 1; seed <= 12; seed++) {
    const t = terrTown(seed);
    t.units = { sword: 500 }; // ze winnen altijd: het kamp blijft staan
    let prev = null;
    for (let k = 0; k < 12; k++) {
      const at = t.terr.camp.next;
      advance(t, at + WILD.raid.warnMs + 1, 1);
      t.units = { sword: 500 };
      if (prev != null) (at - t.terr.camp.since < 3 * D ? gaps.early : gaps.late).push(at - prev);
      prev = at;
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(gaps.early.length && gaps.late.length);
  assert.ok(avg(gaps.late) < avg(gaps.early), `later vaker: ${(avg(gaps.early) / 3600000).toFixed(1)} u → ${(avg(gaps.late) / 3600000).toFixed(1)} u`);
  assert.ok(Math.min(...gaps.early, ...gaps.late) >= WILD.raid.quietHours * 3600000, 'nooit vlak na elkaar');
});

test('barbarenkamp verwoesten: opnieuw klein, meer buit als het lang kon groeien', () => {
  const s = terrTown();
  s.units = { sword: 200 };
  advance(s, s.t + 4 * 86400000, 1); // vier dagen groeien (overvallen worden afgeslagen)
  s.units = { sword: 200 };
  const grown = campGrowth(s);
  assert.ok(grown > 2);
  const food = s.res.food;
  s.res.food = 0;
  const camp = territory(s.terr.seed).camp;
  const g = doFieldSend(s, { units: { sword: 200 } }, null, { x: camp.x, y: camp.y }, null, s.t);
  arrive(s, g);
  fightOver(s);
  const c = s.terr.camp;
  assert.ok(c.down > s.t, 'verwoest');
  assert.ok(s.res.food >= Math.round(WILD.camp.loot.food * grown) - 1, `buit x${grown}: ${s.res.food} (was ${food})`);
  assert.equal(c.since, c.down, 'het nieuwe kamp begint weer klein');
  assert.equal(campGrowth(s, c.down), 1);
  assert.ok(c.next >= c.down + WILD.raid.quietHours * 3600000, 'geen overval zolang het kamp plat ligt');
});

test('overval: zelf verdedigen (de server zet c.raid.battle) houdt het automatische gevecht tegen; uitslag via applyRaid', () => {
  const s = terrTown();
  s.units = { spear: 5 };
  advance(s, s.terr.camp.next + 1, 1);
  const raid = raidNow(s);
  assert.ok(raid);
  raid.battle = 77; raid.bt = s.t; raid.init = { spear: 5 };
  advance(s, raid.at + 60000, 1);
  assert.ok(raidNow(s), 'de slag loopt nog: niets automatisch');
  assert.deepEqual(s.units, { spear: 5 });
  const res = { ...s.res };
  const loot = applyRaid(s, s.t, true, { barbarian: 4 }, { spear: 1 });
  assert.deepEqual(s.units, { spear: 1 });
  assert.ok(Object.values(loot).some((v) => v > 0), 'geplunderd');
  for (const k of Object.keys(loot)) assert.equal(s.res[k], res[k] - loot[k]);
  assert.equal(raidNow(s), null);
  assert.equal(s.terr.camp.raids, 1);
  assert.ok(s.terr.log.some((l) => l.kind === 'raid-lost'));
  // vangnet: een slag die nooit afgerond werd, gaat na liveMs automatisch
  const t = terrTown();
  advance(t, t.terr.camp.next + 1, 1);
  Object.assign(raidNow(t), { battle: 5, bt: t.t, init: {} });
  advance(t, t.t + WILD.raid.liveMs + 1000, 1);
  assert.equal(raidNow(t), null);
  assert.ok(t.terr.log.some((l) => l.kind === 'raid-lost' || l.kind === 'raid-won'));
});

test('oude steden (van voor het groeiende kamp) krijgen een nieuw schema en starten klein', () => {
  const s = terrTown();
  const c = s.terr.camp;
  delete c.since; delete c.sch; delete c.day;
  c.next = s.t + 3600000; c.raids = 4;
  advance(s, s.t + 1000, 1);
  assert.equal(c.since, s.t - 1000);
  assert.ok(c.next >= s.t + WILD.raid.quietHours * 3600000 - 1000, 'eerst rust');
  assert.equal(campGrowth(s), 1);
});

import { notifyRaids } from '../functions/lib/push.js';
import { processDue as processDue2, raidNotice } from '../functions/lib/game.js';
import { wrapDb as wrapDb2 } from '../functions/lib/http.js';

test('overval van de barbaren: melding vooraf, 15 minuten om zelf te verdedigen, uitslag in je stad', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const later = [];
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env, waitUntil: (p) => later.push(p) });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  const settle = async () => { while (later.length) await later.shift(); };
  await call('POST', '/admin/reset', { teamSize: 1, seed: 7, bots: 0 });
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'greek' });
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql('UPDATE players SET created_at = ?, last_seen = ?', now - 2 * 86400000, now - 600000);
  sql('UPDATE world SET cron_at = ?', now); // de cron-worker draait (die stuurt de meldingen, niet het verzoek zelf)
  await settle();
  const world = await getWorld(db);
  const tid = db.raw.prepare('SELECT id FROM towns').get().id;
  // de volgende overval begint zo meteen; Anna heeft 12 speerdragers thuis
  const town = await loadTown(db, tid);
  ensureTerritory(town.state, tid);
  advance(town.state, now, world.speed);
  assert.ok(town.state.terr.camp.since != null, 'het kamp groeit');
  const T0 = now + 500;
  town.state.terr.camp.next = T0;
  town.state.units = { spear: 12 };
  await saveTown(db, town);
  assert.equal(db.raw.prepare('SELECT raid_at FROM towns WHERE id = ?').get(tid).raid_at, T0, 'saveTown onthoudt de volgende overval');
  assert.equal(await notifyRaids(db, world, now), 0, 'nog niet');
  const [p1, k1] = await fakeDevice();
  const ep = 'https://fcm.googleapis.com/fcm/send/anna-gsm';
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { sent.push(String(url)); return new Response(null, { status: 201 }); };
  try {
    await call('POST', '/push/subscribe', { endpoint: ep, keys: { p256dh: p1, auth: k1 } }, a.cookie);
    await settle(); sent.length = 0;
    assert.equal(await notifyRaids(db, world, now + 1000), 1, 'melding: de barbaren komen');
    assert.deepEqual(sent, [ep]);
    assert.equal(await notifyRaids(db, world, now + 2000), 0, 'nooit dubbel');
    const st = (await loadTown(db, tid)).state;
    const raid = st.terr.camp.raid;
    assert.ok(raid && raid.told && raid.at === T0 + WILD.raid.warnMs);
    assert.equal(db.raw.prepare('SELECT raid_at FROM towns WHERE id = ?').get(tid).raid_at, raid.at, 'daarna: bij het einde van de overval');
  } finally { globalThis.fetch = realFetch; }
  // zelf verdedigen: een live slag in je eigen stad tegen de barbaren
  let r = await call('POST', '/raid/defend', {}, a.cookie);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const b = r.data.battle;
  assert.equal(b.kind, 'raid'); assert.equal(b.role, 'def'); assert.equal(b.status, 'live');
  let st = (await loadTown(db, tid)).state;
  assert.equal(st.terr.camp.raid.battle, b.id);
  r = await call('POST', '/raid/defend', {}, a.cookie);
  assert.equal(r.data.battle.id, b.id, 'nog eens tikken: dezelfde slag');
  // de 15 minuten zijn om, maar de slag loopt: geen automatisch gevecht
  advance(st, now + WILD.raid.warnMs + 1000, world.speed);
  assert.ok(st.terr.camp.raid, 'wacht op de slag');
  // niemand kijkt nog: de server rondt de slag af en verwerkt de uitslag in de stad
  sql('UPDATE battles SET updated_at = 0 WHERE id = ?', b.id);
  await processDue2(wrapDb2(db), world, now + 5000);
  const done = db.raw.prepare('SELECT status, result FROM battles WHERE id = ?').get(b.id);
  assert.equal(done.status, 'done');
  const res = JSON.parse(done.result);
  assert.ok(res.raid && !res.late);
  st = (await loadTown(db, tid)).state;
  assert.equal(st.terr.camp.raid, null);
  assert.equal(st.terr.camp.raids, 1);
  assert.ok(st.terr.log.some((l) => l.kind === (res.attWins ? 'raid-lost' : 'raid-won')));
  assert.ok((st.units.spear || 0) <= 12);
  assert.equal(raidNotice(st), st.terr.camp.next, 'de volgende overval');
  // geen soldaten thuis: zelf verdedigen kan niet
  const t2 = await loadTown(db, tid);
  Object.assign(t2.state.terr.camp, { next: null, raid: { start: t2.state.t, at: Date.now() + 600000, n: 5 } });
  t2.state.units = {};
  await saveTown(db, t2);
  r = await call('POST', '/raid/defend', {}, a.cookie);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /geen soldaten/);
  // computerspelers: geen meldingen
  assert.equal(raidNotice({ bot: {}, terr: { camp: { next: 5 } } }), null);
});

test('dorpelingen verdelen: de browser rekent met dezelfde plaatsen als de server (ook vissers)', async () => {
  const s = harborTown(2);
  const sl = slotsOf(s);
  for (const j of JOBS) assert.ok(Number.isFinite(sl[j]), `plaatsen voor ${j}`);
  // main.js mag geen eigen kopie van de plaatsen hebben (die kende de vissers niet: de knop + deed dan niets)
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /function slotsOf/);
  assert.match(src, /slots as townSlots/);
});

// ---------- replay van een automatisch verlopen slag ----------
import { setFate, replayBattle, raidReplay, FATE } from '../public/shared/fieldbattle.js';
import { fateOf } from '../public/shared/battle.js';

// het stadsbeeld zoals de server het in het recept zet
const viewOf = (s, seed) => ({
  seed, civ: s.civ, buildings: s.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level })),
  walls: s.walls || [], gates: s.gates || [], cl: [], lots: [],
});

test('replay: de nagespeelde slag eindigt zoals de automatische (winnaar, nooit meer verliezen), deterministisch', () => {
  const cases = [
    [{ sword: 20, archer: 10, ram: 2 }, { spear: 12, archer: 8 }, true],
    [{ sword: 40, archer: 20, ram: 3 }, { spear: 12, archer: 8 }, true],
    [{ sword: 15, archer: 8, rider: 5 }, { spear: 12, archer: 8 }, false],
    [{ spear: 30, sword: 10 }, {}, true],
    [{ knight: 20 }, { archer: 30 }, false],
    [{ elephant: 6, immortal: 10 }, { spear: 30, archer: 20 }, true],
  ];
  for (const [att, def, walls] of cases) {
    const town = siegeTown({ walls });
    const groups = [{ key: 'home', units: def }];
    const rb = resolveBattle({ attUnits: att, groups, wall: effectiveWall(town), towerDef: 30, baseDef: 20 });
    const rec = {
      kind: 'town', att, defGroups: groups, view: viewOf(town, 7), dir: { x: -1, y: 0.2 },
      side: { att: { name: 'A', color: '#2e6fb5' }, def: { name: 'V', color: '#c0392b' } }, fate: fateOf(rb, groups),
    };
    const st = replayBattle(rec);
    let s2 = JSON.parse(JSON.stringify(replayBattle(rec)));
    stepTo(st, FATE.end + 60000);
    while (s2.over == null) { stepTo(s2, s2.t + 23 * FB.tick, 23); s2 = JSON.parse(JSON.stringify(s2)); }
    const o = battleOutcome(st);
    const tag = JSON.stringify({ att, def });
    assert.equal(o.attWins, rb.attWins, `winnaar ${tag}`);
    assert.deepEqual(battleOutcome(s2), o, `deterministisch ${tag}`);
    assert.ok((st.n - st.ph1) * FB.tick <= FATE.end, `duurt niet te lang ${tag}`);
    // de winnaar verliest nooit meer dan in het rapport, de verliezer precies zoveel (wie vlucht, wordt nog neergehaald)
    const dl = (k) => (o.defLeft.home || {})[k] || 0;
    if (rb.attWins) {
      for (const k of Object.keys(att)) assert.ok((o.attLeft[k] || 0) >= (rb.attLeft[k] || 0), `${k} ${tag}`);
      for (const k of Object.keys(def)) assert.equal(dl(k), rb.groupsLeft[0].units[k] || 0, `${k} ${tag}`);
    } else {
      for (const k of Object.keys(def)) assert.ok(dl(k) >= (rb.groupsLeft[0].units[k] || 0), `${k} ${tag}`);
      for (const k of Object.keys(att)) assert.equal(o.attLeft[k] || 0, rb.attLeft[k] || 0, `${k} ${tag}`);
    }
  }
  // zonder fate verandert er niets aan een gewone slag
  const a = siege(); const b = siege();
  setFate(b, { win: 0, left: {} }); delete b.fate;
  stepTo(a, 30000); stepTo(b, 30000);
  assert.deepEqual(battleOutcome(a), battleOutcome(b));
});

test('replay: een automatische aanval bewaart een recept, 24 uur te bekijken door aanvaller en verdediger', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  assert.equal((await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 1, seed: 7, bots: 0 })).status, 200);
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'egypt' });
  const b = await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'greece' });
  const c = await call('POST', '/register', { name: 'Cees', password: 'geheim123', civ: 'persia' });
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql('UPDATE players SET created_at = ?', now - 2 * 86400000);
  sql("UPDATE towns SET state = json_set(state, '$.units.spear', 20, '$.units.archer', 6)");
  const bert = db.raw.prepare("SELECT t.id FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = 'Bert'").get().id;
  let r = await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: bert, units: { spear: 15, archer: 6 } }, a.cookie);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // al lang aangekomen: geen keuze meer, meteen automatisch
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'attack'", now - 120000);
  await call('GET', '/state', null, c.cookie);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM marches WHERE kind = 'attack' AND status = 'out'").get().n, 0, 'verwerkt');
  const reports = (await call('GET', '/reports', null, a.cookie)).data.reports;
  const rep = (await call('GET', `/report?id=${reports.find((x) => x.kind === 'attack').id}`, null, a.cookie)).data.report;
  const id = rep.data.replay;
  assert.ok(id, 'het rapport verwijst naar de replay');
  const ra = await call('GET', `/replay?id=${id}`, null, a.cookie);
  assert.equal(ra.status, 200, JSON.stringify(ra.data));
  const rec = ra.data.replay;
  assert.equal(rec.role, 'att');
  assert.equal(rec.kind, 'town');
  assert.deepEqual(rec.att, { spear: 15, archer: 6 });
  assert.equal(rec.fate.win, rep.data.attWins ? 0 : 1);
  assert.ok(rec.view.buildings.length && rec.until - rec.at === 24 * 3600000);
  assert.ok(JSON.stringify(rec).length < 20000, 'klein recept');
  assert.equal((await call('GET', `/replay?id=${id}`, null, b.cookie)).data.replay.role, 'def', 'de verdediger ziet ze ook');
  assert.equal((await call('GET', `/replay?id=${id}`, null, c.cookie)).status, 404, 'een ander niet');
  // de browser speelt ze na en komt uit bij dezelfde winnaar
  const st = replayBattle(rec);
  stepTo(st, FATE.end + 60000);
  assert.equal(battleOutcome(st).attWins, rep.data.attWins);
  // na 24 uur niet meer
  sql('UPDATE replays SET created_at = ?', now - 25 * 3600000);
  const old = await call('GET', `/replay?id=${id}`, null, a.cookie);
  assert.equal(old.status, 410);
  assert.match(old.data.error, /24 uur/);
});

test('replay: een overval die automatisch verliep, kan je naspelen vanuit het logboek', () => {
  const s = newTownState(0, 'greece');
  ensureTerritory(s, 7);
  advance(s, 0, 1);
  s.units = { spear: 6, archer: 4 };
  const c = s.terr.camp;
  c.next = null;
  c.raid = { start: 1000, at: 2000, n: 9 };
  advance(s, 3000, 1);
  const e = s.terr.log.find((l) => /^raid-(won|lost)$/.test(l.kind));
  assert.ok(e && e.rp, 'recept in het logboek');
  assert.equal(e.rp.n, 9);
  assert.deepEqual(e.rp.home, { spear: 6, archer: 4 });
  const rec = raidReplay(s, e, { town: 'Teststad', name: 'Anna', color: '#2e6fb5' });
  assert.equal(rec.role, 'def');
  const st = replayBattle(rec);
  stepTo(st, FATE.end + 60000);
  assert.equal(battleOutcome(st).attWins, e.kind === 'raid-lost');
});

test('replay: ook als je zelf "Automatisch" kiest (uitslagkaartje) en bij een roverskamp', async () => {
  const db = await memoryD1();
  const env = { DB: db, ADMIN_KEY: 'k' };
  const call = async (method, path, body, cookie) => {
    const headers = { 'content-type': 'application/json', 'x-admin-key': 'k' };
    if (cookie) headers.cookie = cookie;
    const res = await handle({ request: new Request(`http://x/api${path}`, { method, headers, body: body && JSON.stringify(body) }), env });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  assert.equal((await call('POST', '/admin/reset', { peaceHours: 24, seasonDays: 28, teamSize: 1, seed: 9, bots: 0 })).status, 200);
  const a = await call('POST', '/register', { name: 'Anna', password: 'geheim123', civ: 'egypt' });
  const b = await call('POST', '/register', { name: 'Bert', password: 'geheim123', civ: 'greece' });
  const now = Date.now();
  const sql = (q, ...v) => db.raw.prepare(q).run(...v);
  sql('UPDATE world SET start_at = ?', now - 3 * 86400000);
  sql('UPDATE players SET created_at = ?', now - 2 * 86400000);
  sql("UPDATE towns SET state = json_set(state, '$.units.spear', 30, '$.units.archer', 6)");
  const bert = db.raw.prepare("SELECT t.id FROM towns t JOIN players p ON p.id = t.player_id WHERE p.name = 'Bert'").get().id;
  assert.equal((await call('POST', '/march', { kind: 'attack', targetKind: 'town', targetId: bert, units: { spear: 12 } }, a.cookie)).status, 200);
  // Anna is online als haar leger aankomt: ze kiest 'Automatisch', Bert is er niet
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'attack'", now - 5000);
  sql("UPDATE players SET last_seen = 0 WHERE name = 'Bert'");
  const st = await call('GET', '/state', null, a.cookie);
  const bt = st.data.battles.find((x) => x.status === 'choose');
  assert.ok(bt, 'keuze: zelf of automatisch');
  const r = await call('POST', '/battle/mode', { id: bt.id, mode: 'auto' }, a.cookie);
  assert.equal(r.data.battle.status, 'done');
  assert.ok(r.data.battle.result.replay, 'het uitslagkaartje kent de replay');
  assert.equal((await call('GET', `/replay?id=${r.data.battle.result.replay}`, null, b.cookie)).data.replay.role, 'def');
  // roverskamp
  const camp = db.raw.prepare('SELECT id FROM camps ORDER BY level LIMIT 1').get().id;
  assert.equal((await call('POST', '/march', { kind: 'attack', targetKind: 'camp', targetId: camp, units: { spear: 15, archer: 6 } }, a.cookie)).status, 200);
  sql("UPDATE marches SET arrive_at = ? WHERE kind = 'attack' AND target_kind = 'camp'", now - 120000);
  await call('GET', '/state', null, b.cookie);
  const reports = (await call('GET', '/reports', null, a.cookie)).data.reports;
  const rep = (await call('GET', `/report?id=${reports.find((x) => /Roverskamp/.test(x.title)).id}`, null, a.cookie)).data.report;
  const rec = (await call('GET', `/replay?id=${rep.data.replay}`, null, a.cookie)).data.replay;
  assert.equal(rec.kind, 'camp');
  assert.equal((await call('GET', `/replay?id=${rep.data.replay}`, null, b.cookie)).status, 404, 'Bert was er niet bij');
  const s2 = replayBattle(rec);
  stepTo(s2, FATE.end + 60000);
  assert.equal(battleOutcome(s2).attWins, rep.data.attWins);
});
