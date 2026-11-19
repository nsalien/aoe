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
