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
import { territory, exHas, exDecode, T_MIN } from '../public/shared/territory.js';
import { WILD, FIELD } from '../public/shared/rules.js';

function terrTown(seed = 5) {
  const s = newTownState(0);
  s.res = { food: 500, wood: 500, stone: 500, gold: 500 };
  ensureTerritory(s, seed);
  advance(s, 1000, 1);
  return s;
}
const arrive = (s, g) => advance(s, g.t1 + 1, 1);

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
  arrive(s, g);
  assert.ok(exHas(exDecode(s.terr.ex), -14, 6), 'het doel is ontdekt');
  assert.ok(exHas(exDecode(s.terr.ex), -10, 6), 'de weg ernaartoe ook');
  doFieldOrder(s, g.id, null, { type: 'home' }, s.t);
  arrive(s, g);
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
  assert.ok(s.terr.log.some((l) => l.kind === 'boar'), 'gevangen');
  assert.ok((s.field.find((x) => x.id === g.id) || { units: {} }).units.spear >= 2, 'hooguit één speerdrager verloren');
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
  doFieldOrder(s, g.id, null, { type: 'camp' }, s.t);
  arrive(s, g);
  assert.ok(s.terr.camp.down > s.t, 'kamp ligt in puin');
  assert.ok(s.terr.camp.next >= s.terr.camp.down, 'geen overval zolang het kamp plat ligt');
});

test('barbaren overvallen een onverdedigde stad', () => {
  const s = terrTown();
  s.units = {};
  advance(s, s.terr.camp.next + 1, 1);
  const log = s.terr.log.find((l) => l.kind === 'raid-lost' || l.kind === 'raid-won');
  assert.ok(log, 'er was een overval');
  assert.equal(s.terr.camp.raids, 1);
  assert.ok(raidSize(s) >= 3 && campSize(s) >= 5);
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
  assert.deepEqual(a.res, b.res);
});
