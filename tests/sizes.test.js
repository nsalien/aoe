// Grotere gebouwen (2x2 en een monument van 4x4): bestaande steden herplaatsen wat niet meer past, gratis.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newTownState, ensureTerritory, canPlaceAt, occupied, doMove, checkMove, checkUpgrade, toPlace, isPlaced, placeNear, publicSummary, doBuild,
} from '../public/shared/sim.js';
import { BUILDINGS, SIZE_V, GREW } from '../public/shared/rules.js';

// een stad van voor de nieuwe groottes (alles 1x1, dicht op elkaar)
function oldTown(bot = false) {
  const s = newTownState(0, 'greek');
  delete s.szv;
  s.buildings.find((b) => b.type === 'tc').level = 4;
  s.buildings.push(
    { id: 10, type: 'barracks', x: 1, y: 1, level: 3 }, { id: 11, type: 'house', x: 2, y: 1, level: 1 }, // past niet meer
    { id: 12, type: 'market', x: 9, y: 9, level: 2 }, // genoeg plaats rond: blijft staan
    { id: 13, type: 'stable', x: 7, y: 1, level: 1 }, // botst met de smidse
    { id: 14, type: 'monument', x: 2, y: 7, level: 1 }, { id: 15, type: 'house', x: 4, y: 9, level: 1 },
    { id: 16, type: 'smithy', x: 8, y: 1, level: 1 },
  );
  s.nextId = 20;
  s.res = { food: 50000, wood: 50000, stone: 50000, gold: 50000 };
  if (bot) s.bot = { tier: 'gemiddeld', v: 2 };
  return s;
}

test('groottes: 2x2 voor acht gebouwen, het monument 4x4', () => {
  for (const t of ['barracks', 'range', 'stable', 'market', 'workshop', 'academy', 'guild', 'lodge']) assert.equal(BUILDINGS[t].size, 2, t);
  assert.equal(BUILDINGS.monument.size, 4);
  assert.equal(BUILDINGS.house.size, 1);
  assert.equal(BUILDINGS.smithy.size, 1);
  for (const t of GREW) assert.ok(BUILDINGS[t].size > 1);
  const s = newTownState(0, 'greek');
  assert.equal(s.szv, SIZE_V, 'een nieuwe stad heeft meteen de nieuwe groottes');
  ensureTerritory(s, 3);
  s.buildings.find((b) => b.type === 'tc').level = 4;
  s.res = { food: 50000, wood: 50000, stone: 50000, gold: 50000 };
  const m = doBuild(s, 'monument', 0, 0, 0, 1);
  const occ = occupied(s);
  assert.equal([...occ.values()].filter((b) => b === m).length, 16, 'het monument neemt 16 tegels');
  assert.equal(canPlaceAt(s, 'barracks', 3, 3), false, 'overlapt het monument');
  assert.equal(canPlaceAt(s, 'barracks', 0, 8), true);
});

test('groottes: een oude stad herplaatst wat niet meer past; het blijft werken; plaatsen is gratis', () => {
  const s = oldTown();
  ensureTerritory(s, 7);
  assert.equal(s.szv, SIZE_V);
  assert.ok(s.szm, 'de stad weet dat er iets veranderde (melding)');
  const rp = toPlace(s).map((b) => b.type).sort();
  assert.deepEqual(rp, ['barracks', 'monument', 'stable'], JSON.stringify(rp));
  assert.ok(isPlaced(s.buildings.find((b) => b.id === 12)), 'de markt past nog en blijft staan');
  // niet op de kaart, wel nog geteld
  const occ = occupied(s);
  assert.ok(![...occ.values()].some((b) => b.rp));
  assert.equal(publicSummary(s).buildings, s.buildings.filter((b) => b.type !== 'wall').length);
  // verbeteren pas na het herplaatsen
  assert.match(checkUpgrade(s, 10), /plaats het eerst opnieuw/);
  // herplaatsen: gratis en meteen
  const res = { ...s.res };
  const spot = placeNear(s, 'barracks', 1, 1, 10);
  assert.ok(spot);
  assert.equal(checkMove(s, 10, spot.x, spot.y), null);
  doMove(s, 10, spot.x, spot.y);
  assert.equal(s.buildings.find((b) => b.id === 10).rp, undefined);
  assert.deepEqual(s.res, res, 'kost niets');
  assert.equal(s.builds.length, 0, 'geen bouwtijd');
  assert.equal(checkUpgrade(s, 10), null);
  // niet op een plek waar het niet past
  const mon = s.buildings.find((b) => b.id === 14);
  assert.ok(checkMove(s, 14, 9, 9), 'daar staat de markt');
  // een gebouw dat herplaatst moet worden mag terug op zijn eigen plek als die intussen vrij is
  s.buildings = s.buildings.filter((b) => b.id !== 15);
  const ok = canPlaceAt(s, 'monument', mon.x, mon.y, mon.id);
  if (ok) assert.equal(checkMove(s, 14, mon.x, mon.y), null);
  // tweede keer: niets meer te doen
  const before = JSON.stringify(s);
  ensureTerritory(s, 7);
  assert.equal(JSON.stringify(s), before);
});

test('groottes: een bot plaatst zijn vergrote gebouwen zelf', () => {
  const s = oldTown(true);
  ensureTerritory(s, 9);
  assert.equal(toPlace(s).length, 0);
  const seen = new Set();
  for (const b of s.buildings) {
    if (!isPlaced(b)) continue;
    const z = BUILDINGS[b.type].size;
    for (let dx = 0; dx < z; dx++) for (let dy = 0; dy < z; dy++) {
      const k = `${b.x + dx},${b.y + dy}`;
      assert.ok(!seen.has(k), `overlap op ${k}`);
      seen.add(k);
    }
  }
});
