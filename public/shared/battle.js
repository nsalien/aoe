// Gevechtsberekening (gedeeld zodat de browser een simulator kan tonen).
import { UNITS, COMBAT, RES, TECHS } from './rules.js';

const TYPES = ['inf', 'cav', 'rng'];

// samenstelling van een leger: aandeel voetvolk, ruiterij, schutters en eenheden van een volk
export function composition(units) {
  const c = { inf: 0, cav: 0, rng: 0, unique: 0 };
  let n = 0;
  for (const k of Object.keys(units || {})) {
    const u = UNITS[k]; const v = units[k] || 0;
    if (!u || v <= 0) continue;
    c[u.type] += v; if (u.unique) c.unique += v; n += v;
  }
  if (n) for (const t of Object.keys(c)) c[t] /= n;
  return c;
}

// bonus van een eenheid tegen een tegenstander met deze samenstelling (0 = geen)
const bonusVs = (u, comp) => (u.bonus && comp ? Object.keys(u.bonus).reduce((a, t) => a + u.bonus[t] * (comp[t] || 0), 0) : 0);

// wat het onderzoek van de Academie betekent in een automatisch uitgerekende slag
export function techMods(tech) {
  const m = { atk: { inf: 0, cav: 0, rng: 0 }, def: { inf: {}, cav: {}, rng: {} }, towers: 0, wall: 0, rams: 1 };
  for (const id of Object.keys(tech || {})) {
    const a = TECHS[id] && TECHS[id].auto;
    if (!a) continue;
    for (const t of Object.keys(a.atk || {})) m.atk[t] += a.atk[t];
    for (const t of Object.keys(a.def || {})) for (const v of Object.keys(a.def[t])) m.def[t][v] = (m.def[t][v] || 0) + a.def[t][v];
    if (a.towers) m.towers += a.towers;
    if (a.wall) m.wall += a.wall;
    if (a.rams) m.rams *= a.rams;
  }
  return m;
}

export function attackPower(units, smithy = 0, foe = null, tech = null) {
  const byType = { inf: 0, cav: 0, rng: 0 };
  const tm = tech ? techMods(tech) : null;
  let fear = 0;
  for (const k of Object.keys(units || {})) {
    const u = UNITS[k];
    if (!u || !u.atk) continue;
    const a = u.atk * (units[k] || 0) * (1 + bonusVs(u, foe)) * (tm ? 1 + tm.atk[u.type] : 1);
    byType[u.type] += a;
    if (u.fear) fear += u.fear * a;
  }
  const raw = byType.inf + byType.cav + byType.rng;
  const mult = 1 + COMBAT.smithyBonus * smithy;
  const total = raw * mult;
  return { total, byType, fear: raw ? fear / raw : 0 };
}

// verdediging; foe = samenstelling van de aanvaller (voor bonussen tegen dat soort vijand)
export function unitDefense(units, shares, foe = null, tm = null) {
  let d = 0;
  for (const k of Object.keys(units || {})) {
    const u = UNITS[k];
    if (!u || !u.def) continue;
    let per = 0;
    const tb = tm ? tm.def[u.type] || {} : {};
    for (const t of TYPES) per += shares[t] * u.def[t] * (1 + (tb[t] || 0));
    per *= (u.defMult || 1) * (1 + bonusVs(u, foe) * 0.5);
    d += per * (units[k] || 0);
  }
  return d;
}

function survivors(units, loss) {
  const out = {};
  for (const k of Object.keys(units || {})) {
    const n = units[k] || 0;
    const tough = (UNITS[k] && UNITS[k].tough) || 0;
    if (n > 0) out[k] = Math.max(0, Math.round(n * (1 - loss * (1 - tough))));
  }
  return out;
}

// hoeveel 'stormrammen' een leger telt tegen muren
const wallBreakers = (units) => Object.keys(units || {}).reduce((a, k) => a + ((UNITS[k] && UNITS[k].walls) || 0) * (units[k] || 0), 0);

export function subtractUnits(a, b) {
  const out = {};
  for (const k of Object.keys(a || {})) out[k] = Math.max(0, (a[k] || 0) - ((b && b[k]) || 0));
  return out;
}

export const countUnits = (u) => Object.values(u || {}).reduce((a, b) => a + (b || 0), 0);

// groups: [{ key, units }] - de eigen troepen van de verdediger en eventuele ondersteuning
// attTech / defTech: het onderzoek van aanvaller en verdediger (Academie)
export function resolveBattle({ attUnits, attSmithy = 0, groups, defSmithy = 0, wall = 0, towerDef = 0, baseDef = 0, attTech = null, defTech = null }) {
  const defAll = {};
  for (const g of groups) for (const k of Object.keys(g.units || {})) defAll[k] = (defAll[k] || 0) + (g.units[k] || 0);
  const ta = techMods(attTech); const td = techMods(defTech);
  const att = attackPower(attUnits, attSmithy, composition(defAll), attTech);
  const A = att.total;
  const shares = { inf: 1, cav: 0, rng: 0 };
  if (A > 0) for (const t of TYPES) shares[t] = att.byType[t] / (att.byType.inf + att.byType.cav + att.byType.rng);
  const rams = wallBreakers(attUnits) * td.rams;
  if (wall > 0 && td.wall) wall += td.wall; // kokende pek
  const tDef = towerDef * Math.max(0, 1 + td.towers + Math.min(0, ta.towers)); // torenkruisbogen / vuurpijlen
  const wallEff = Math.max(0, wall - rams / COMBAT.ramsPerWallLevel);
  const attComp = composition(attUnits);
  let du = 0;
  for (const g of groups) du += unitDefense(g.units, shares, attComp, td);
  const D = (du * (1 + COMBAT.smithyBonus * defSmithy) + baseDef + tDef + COMBAT.wallFlat * wallEff)
    * (1 + COMBAT.wallBonus * wallEff) * (1 - Math.min(0.3, att.fear));

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
    const pts = Math.floor((wallBreakers(attLeft) * td.rams) / COMBAT.ramsPerWallLevel);
    wallDamage = Math.min(pts, COMBAT.maxWallDamage, Math.floor(wall));
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

// tech: onderzoek van de eigenaar (hoefijzers maken ruiterij 10% sneller)
export function slowestSpeed(units, tech = null) {
  let s = Infinity;
  const hs = !!(tech && tech.horseshoes);
  for (const k of Object.keys(units || {})) {
    if ((units[k] || 0) <= 0 || !UNITS[k]) continue;
    s = Math.min(s, UNITS[k].speed * (hs && UNITS[k].type === 'cav' && !UNITS[k].noble ? 1.1 : 1));
  }
  return s === Infinity ? 0 : s;
}
