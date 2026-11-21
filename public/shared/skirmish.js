// Gevechten in je eigen gebied, mannetje per mannetje: elke eenheid heeft levenspunten (hp), slaat om de
// zoveel tijd (rate) een vijand en richt schade aan (dmg), verminderd door de verdediging van het doelwit.
// Volledig deterministisch: server en browser rekenen exact hetzelfde verloop uit, ook halverwege.
import { UNITS, FIELD } from './rules.js';

// Eén kant van een gevecht: [{ k: soort, hp, g?: groep }]. Missende hp = volle levenspunten.
export function combatants(units, hp = null, group = null) {
  const out = [];
  for (const k of Object.keys(units || {})) {
    const n = units[k] || 0;
    const list = (hp && hp[k]) || [];
    for (let i = 0; i < n; i++) out.push({ k, hp: list[i] != null ? list[i] : maxHp(k), ...(group != null ? { g: group } : {}) });
  }
  return out;
}

export const maxHp = (k) => (UNITS[k] && UNITS[k].hp) || 30;

// schade van één slag van a op b
export function hitDamage(ka, kb, mult = 1) {
  const a = UNITS[ka]; const b = UNITS[kb];
  if (!a || !b) return 1;
  let bonus = 0;
  if (a.bonus) for (const t of Object.keys(a.bonus)) if (t === b.type || (t === 'unique' && b.unique)) bonus += a.bonus[t];
  const armor = b.def ? b.def[a.type] || 0 : 0;
  return Math.max(0.5, (a.dmg || 1) * (1 + bonus) * mult * (FIELD.armorK / (FIELD.armorK + armor)));
}

// tijdstip van de eerste slag van eenheid i (iedereen stormt eerst op elkaar af; schutters schieten al eerder)
const firstHit = (t0, k, i) => t0 + FIELD.engageMs + ((i * 211) % 700) + (UNITS[k] && UNITS[k].ranged ? -900 : 0);
const rateOf = (k) => Math.round(((UNITS[k] && UNITS[k].rate) || 1500) * (FIELD.fightPace || 1));

// Speel een gevecht af tot 'until' (of tot één kant uitgeschakeld is).
// fight = { t0, a: [...], b: [...], ma?: schademultiplier kant a, mb?: idem kant b }
// Geeft { a, b, end (tijd waarop het voorbij is, of null), events? } terug; a/b = kopieën met hp.
export function runFight(fight, until = Infinity, withEvents = false) {
  const A = fight.a.map((u) => ({ ...u })); const B = fight.b.map((u) => ({ ...u }));
  const all = [...A.map((u, i) => ({ u, side: 0, i })), ...B.map((u, i) => ({ u, side: 1, i }))];
  for (const c of all) c.next = firstHit(fight.t0, c.u.k, c.side * 17 + c.i);
  const events = withEvents ? [] : null;
  const alive = (L) => L.filter((u) => u.hp > 0);
  let end = null;
  for (let guard = 0; guard < 100000; guard++) {
    let best = null;
    for (const c of all) if (c.u.hp > 0 && (!best || c.next < best.next || (c.next === best.next && c.side < best.side))) best = c;
    if (!best || best.next > until) break;
    const foes = alive(best.side ? A : B);
    if (!foes.length) { end = best.next; break; }
    // doelwit: telkens met minstens twee op dezelfde vijand (zoals echte soldaten die samen iemand aanpakken),
    // zodat ook de kleinste kant tegenstanders neerhaalt in plaats van iedereen een schrammetje te geven
    const own = alive(best.side ? B : A).length;
    const m = Math.max(1, Math.min(foes.length, Math.ceil(own / 2)));
    const target = foes[best.i % m];
    const dmg = hitDamage(best.u.k, target.k, best.side ? fight.mb || 1 : fight.ma || 1);
    target.hp = Math.max(0, target.hp - dmg);
    if (events) events.push({ t: best.next, side: best.side, i: best.i, target: (best.side ? A : B).indexOf(target), dmg, kill: target.hp <= 0 });
    if (target.hp <= 0) target.died = best.next;
    best.next += rateOf(best.u.k);
    if (!alive(A).length || !alive(B).length) { end = best.next - rateOf(best.u.k); break; }
  }
  return { a: A, b: B, end, events };
}

// eindtijd van een gevecht (voor de planning van gebeurtenissen in advance())
export function fightEnd(fight) {
  const r = runFight(fight);
  return r.end == null ? fight.t0 + 3600000 : r.end;
}

// Overlevenden per groep: { groupId: { units: {k: n}, hp: {k: [..]} } }
export function survivorsByGroup(side) {
  const out = {};
  for (const u of side) {
    if (u.hp <= 0) continue;
    const g = out[u.g] || (out[u.g] = { units: {}, hp: {} });
    g.units[u.k] = (g.units[u.k] || 0) + 1;
    (g.hp[u.k] || (g.hp[u.k] = [])).push(Math.round(u.hp * 10) / 10);
  }
  return out;
}

// laatste slag van eenheid i op tijdstip t (voor de animatie in de browser)
export function lastSwing(fight, side, i, k, t) {
  const first = firstHit(fight.t0, k, side * 17 + i);
  if (t < first) return null;
  const r = rateOf(k);
  return first + Math.floor((t - first) / r) * r;
}
