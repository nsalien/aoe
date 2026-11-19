// Gevechtsberekening (gedeeld zodat de browser een simulator kan tonen).
import { UNITS, COMBAT, RES } from './rules.js';

const TYPES = ['inf', 'cav', 'rng'];

export function attackPower(units, smithy = 0) {
  const byType = { inf: 0, cav: 0, rng: 0 };
  for (const k of Object.keys(units || {})) {
    const u = UNITS[k];
    if (!u || !u.atk) continue;
    byType[u.type] += u.atk * (units[k] || 0);
  }
  const mult = 1 + COMBAT.smithyBonus * smithy;
  const total = (byType.inf + byType.cav + byType.rng) * mult;
  return { total, byType };
}

export function unitDefense(units, shares) {
  let d = 0;
  for (const k of Object.keys(units || {})) {
    const u = UNITS[k];
    if (!u || !u.def) continue;
    let per = 0;
    for (const t of TYPES) per += shares[t] * u.def[t];
    d += per * (units[k] || 0);
  }
  return d;
}

function survivors(units, loss) {
  const out = {};
  for (const k of Object.keys(units || {})) {
    const n = units[k] || 0;
    if (n > 0) out[k] = Math.max(0, Math.round(n * (1 - loss)));
  }
  return out;
}

export function subtractUnits(a, b) {
  const out = {};
  for (const k of Object.keys(a || {})) out[k] = Math.max(0, (a[k] || 0) - ((b && b[k]) || 0));
  return out;
}

export const countUnits = (u) => Object.values(u || {}).reduce((a, b) => a + (b || 0), 0);

// groups: [{ key, units }] - de eigen troepen van de verdediger en eventuele ondersteuning
export function resolveBattle({ attUnits, attSmithy = 0, groups, defSmithy = 0, wall = 0, towerDef = 0, baseDef = 0 }) {
  const att = attackPower(attUnits, attSmithy);
  const A = att.total;
  const shares = { inf: 1, cav: 0, rng: 0 };
  if (A > 0) for (const t of TYPES) shares[t] = att.byType[t] / (att.byType.inf + att.byType.cav + att.byType.rng);
  const rams = attUnits.ram || 0;
  const wallEff = Math.max(0, wall - rams / COMBAT.ramsPerWallLevel);
  let du = 0;
  for (const g of groups) du += unitDefense(g.units, shares);
  const D = (du * (1 + COMBAT.smithyBonus * defSmithy) + baseDef + towerDef + COMBAT.wallFlat * wallEff)
    * (1 + COMBAT.wallBonus * wallEff);

  const attWins = A > D;
  let attLoss;
  let defLoss;
  if (attWins) {
    attLoss = D > 0 ? Math.pow(D / A, COMBAT.lossExponent) : 0;
    defLoss = 1;
  } else {
    attLoss = 1;
    defLoss = D > 0 && A > 0 ? Math.pow(A / D, COMBAT.lossExponent) : 0;
  }
  const attLeft = survivors(attUnits, attLoss);
  const groupsLeft = groups.map((g) => ({ key: g.key, units: survivors(g.units, defLoss) }));

  let wallDamage = 0;
  let monumentDamage = 0;
  if (attWins) {
    const pts = Math.floor((attLeft.ram || 0) / COMBAT.ramsPerWallLevel);
    wallDamage = Math.min(pts, COMBAT.maxWallDamage, wall);
    if (pts - wallDamage >= 1 && wall - wallDamage <= 0) monumentDamage = 1;
  }
  return {
    attWins, A: Math.round(A), D: Math.round(D), attLoss, defLoss, attLeft, groupsLeft,
    attLost: subtractUnits(attUnits, attLeft),
    groupsLost: groups.map((g, i) => ({ key: g.key, units: subtractUnits(g.units, groupsLeft[i].units) })),
    wallDamage, monumentDamage,
  };
}

export function resolveScouting(attScouts, defScouts) {
  if (attScouts > defScouts) {
    const loss = defScouts > 0 ? Math.pow(defScouts / attScouts, COMBAT.lossExponent) : 0;
    return { success: true, left: Math.max(0, Math.round(attScouts * (1 - loss))) };
  }
  return { success: false, left: 0 };
}

export function carryCapacity(units) {
  let c = 0;
  for (const k of Object.keys(units || {})) if (UNITS[k]) c += (UNITS[k].carry || 0) * (units[k] || 0);
  return c;
}

// Verdeel de draagcapaciteit zo eerlijk mogelijk over de beschikbare grondstoffen.
export function computeLoot(available, capacity) {
  const take = { food: 0, wood: 0, stone: 0, gold: 0 };
  let left = capacity;
  let keys = RES.filter((r) => available[r] >= 1);
  while (left >= 1 && keys.length) {
    const share = left / keys.length;
    const next = [];
    for (const k of keys) {
      const can = available[k] - take[k];
      const t = Math.min(can, share);
      take[k] += t;
      left -= t;
      if (available[k] - take[k] >= 1) next.push(k);
    }
    keys = next;
  }
  for (const r of RES) take[r] = Math.floor(take[r]);
  return take;
}

export function slowestSpeed(units) {
  let s = Infinity;
  for (const k of Object.keys(units || {})) if ((units[k] || 0) > 0 && UNITS[k]) s = Math.min(s, UNITS[k].speed);
  return s === Infinity ? 0 : s;
}
