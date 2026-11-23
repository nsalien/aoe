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
import { territory, exHas, exDecode, T_MIN, tileIndex } from '../public/shared/territory.js';
import { WILD, FIELD } from '../public/shared/rules.js';

function terrTown(seed = 5) {
  const s = newTownState(0);
  s.res = { food: 500, wood: 500, stone: 500, gold: 500 };
  ensureTerritory(s, seed);
  advance(s, 1000, 1);
  return s;
}
const arrive = (s, g) => advance(s, g.t1 + 1, 1);
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

test('barbaren overvallen een onverdedigde stad', () => {
  const s = terrTown();
  s.units = {};
  advance(s, s.terr.camp.next + 1, 1);
  const log = s.terr.log.find((l) => l.kind === 'raid-lost' || l.kind === 'raid-won');
  assert.ok(log, 'er was een overval');
  assert.equal(s.terr.camp.raids, 1);
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
  assert.deepEqual(a.res, b.res);
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
  assert.ok(campSize(s) <= n + 3, 'overvallen maken het kamp maar een beetje sterker');
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
import { checkBuyLot, doBuyLot, isBuildable as canBuild, doPlaceWalls, wallEnclosed, effectiveWall, canPlaceAt as canPut, doPlaceGate, doRemoveWalls, doDemolish, gateList } from '../public/shared/sim.js';
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
  // de poort is 2 tegels breed (5 en 6): eerst naar de binnenkant van de poort, daarna erdoor (door het midden) en verder
  assert.equal(s.gates.length, 2);
  assert.ok(Math.abs(g.x1 - 6) < 1e-9 && Math.abs(g.y1 - 10.6) < 1e-9, `naar de poort (${g.x1}, ${g.y1})`);
  arrive(s, g);
  assert.ok(Math.abs(g.x1 - 6) < 1e-9 && Math.abs(g.y1 - 12.4) < 1e-9, 'door de poort');
  arrive(s, g);
  assert.equal(g.x1, 15.5); assert.equal(g.y1, 15.5);
  arrive(s, g);
  assert.ok(!g.pending && !g.via, 'aangekomen');
  // en terug naar huis: weer via de poort
  doFieldOrder(s, g.id, null, { type: 'home' }, s.t);
  assert.ok(Math.abs(g.x1 - 6) < 1e-9 && Math.abs(g.y1 - 12.4) < 1e-9, 'eerst naar de buitenkant van de poort');
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
