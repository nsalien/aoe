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
import { checkBuyLot, doBuyLot, isBuildable as canBuild, doPlaceWalls, wallEnclosed, effectiveWall, canPlaceAt as canPut } from '../public/shared/sim.js';
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
  doPlaceWalls(s, ring.slice(40));
  assert.equal(wallEnclosed(s), true);
  assert.equal(effectiveWall(s), 2);
  assert.equal(canPut(s, 'house', 0, 0), false, 'niet bouwen op een muur');
  assert.throws(() => doPlaceWalls(s, [[0, 0]]), /al een muur/);
});

test('meerdere dorpelingen tegelijk op pad sturen', () => {
  const s = terrTown();
  const before = s.villagers.food;
  const g = doFieldSend(s, { villager: 'food', n: 2 }, null, { x: 4, y: 13 }, null, s.t);
  assert.equal(g.units.villager, 2);
  assert.equal(s.villagers.food, before - 2);
});

// ---------- veldslagen die je zelf bestuurt ----------
import { createBattle, stepTo, giveOrder, battleOutcome, FB } from '../public/shared/fieldbattle.js';

function battleSetup(extra = {}) {
  return createBattle({
    kind: 'town', att: { sword: 20, archer: 10, ram: 2 }, defGroups: [{ key: 'home', units: { spear: 12, archer: 8 } }],
    towers: [{ id: 7, level: 2 }], wall: 3, enclosed: false, now: 1000, ...extra,
  });
}

test('veldslag: deterministisch, ook in kleine stukjes', () => {
  const a = battleSetup(); const b = battleSetup();
  stepTo(a, 1000 + FB.maxMs + 1000);
  for (let t = 1000; b.over == null && t < 1000 + FB.maxMs + 2000; t += 700) stepTo(JSON.parse(JSON.stringify(b)) && b, t, 40);
  stepTo(b, 1000 + FB.maxMs + 1000);
  assert.equal(a.over, b.over);
  assert.deepEqual(battleOutcome(a), battleOutcome(b));
});

test('veldslag: JSON heen en terug verandert het verloop niet (server bewaart tussendoor)', () => {
  const a = battleSetup();
  let b = battleSetup();
  for (let t = 1000; t < 1000 + 60000; t += 1200) { stepTo(a, t); stepTo(b, t, 40); b = JSON.parse(JSON.stringify(b)); }
  assert.deepEqual(JSON.parse(JSON.stringify(a)).units, b.units);
});

test('veldslag: torens schieten en kunnen sneuvelen, muren houden aanvallers tegen', () => {
  const st = createBattle({ kind: 'town', att: { sword: 30, ram: 3 }, defGroups: [{ key: 'home', units: {} }], towers: [{ id: 9, level: 1 }], wall: 1, enclosed: true, now: 0 });
  const tower = st.units.find((u) => u.k === 'tower');
  stepTo(st, FB.maxMs + 1000);
  const o = battleOutcome(st);
  assert.ok(tower.at >= 0, 'de toren heeft geschoten');
  assert.equal(o.attWins, true);
  assert.deepEqual(o.towersLost, [9]);
  assert.ok(o.wallsBroken >= 1, 'de muur werd doorbroken');
  assert.ok(st.units.some((u) => u.s === 0 && u.hp < u.hp0 * u.n), 'aanvallers liepen schade op');
});

test('veldslag: bevelen en terugtrekken', () => {
  const st = battleSetup();
  const mine = st.units.filter((u) => u.s === 0 && u.k === 'sword').map((u) => u.id);
  giveOrder(st, 0, mine, { x: 3, y: 14 });
  stepTo(st, 1000 + 20000);
  const sw = st.units.filter((u) => mine.includes(u.id));
  assert.ok(sw.every((u) => Math.hypot(u.x - 3, u.y - 14) < 3), 'de zwaardvechters liepen naar links en bleven daar');
  const enemy = st.units.find((u) => u.s === 1 && u.k === 'archer');
  giveOrder(st, 0, mine, { target: enemy.id });
  assert.ok(sw.every((u) => u.tg === enemy.id && u.forced));
  // de verdediger kan aanvallers niet besturen
  giveOrder(st, 1, mine, { x: 20, y: 2 });
  assert.ok(sw.every((u) => u.mx == null));
  // ongeldige bevelen veranderen niets
  const before = JSON.stringify(st.units);
  giveOrder(st, 0, mine, { x: NaN, y: 3 });
  giveOrder(st, 0, mine, { target: 99999 });
  assert.equal(JSON.stringify(st.units), before);
  giveOrder(st, 0, null, { retreat: true });
  assert.equal(st.over, 1);
  assert.equal(battleOutcome(st).retreat, true);
});

test('veldslag: grote legers worden samengevoegd tot hooguit maxPerSide figuren', () => {
  const st = createBattle({ kind: 'camp', att: { spear: 500, archer: 300 }, defGroups: [{ key: 'camp', units: { barbarian: 120 } }], now: 0 });
  assert.ok(st.units.filter((u) => u.s === 0).length <= FB.maxPerSide + 2);
  const o = battleOutcome(st);
  assert.equal(o.attLeft.spear, 500);
  assert.equal(o.defLeft.camp.barbarian, 120);
});
