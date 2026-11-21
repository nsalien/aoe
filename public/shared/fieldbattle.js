// Veldslag op de wereldkaart die je zelf kan besturen: een slagveld met posities, beweging, doelwitten,
// muren en schietende torens. Stapt in vaste tikken van 100 ms en is volledig deterministisch, zodat de
// server (gezaghebbend) en de browser (vloeiend tussen twee peilingen) hetzelfde verloop zien.
import { UNITS, FIELD, TOWER } from './rules.js';
import { hitDamage } from './skirmish.js';

export const FB = {
  W: 24, H: 18, tick: 100, wallY: 7,
  maxMs: 4 * 60000, // na 4 minuten trekt de aanvaller zich terug
  maxPerSide: 80, // grote legers: één figuur staat dan voor meerdere soldaten
  melee: 0.8, ranged: 4.6, siegeRange: 5.2,
  aggro: 9, // zonder bevel vallen troepen vijanden binnen deze afstand aan (aanvallers rukken anders gewoon op)
  hold: 3.2, leash: 5.5, // na een verplaatsing houden ze hun plek: enkel vijanden dichtbij, niet te ver achterna
  chooseMs: 45000, // zo lang heb je om te kiezen: zelf besturen of automatisch
  staleMs: 30000, // niemand kijkt nog mee: de server rekent de rest automatisch uit
  maxTicksPerCall: 30, // hooguit 3 s slag per verzoek (CPU-limiet van de server)
};

const ORDER = ['elephant', 'knight', 'chariot', 'camel', 'rider', 'samurai', 'hoplite', 'lionguard', 'immortal', 'sword', 'spear', 'villager', 'scout', 'barbarian',
  'yabusame', 'peltast', 'archer', 'ram', 'stonethrower'];
const rank = (k) => { const i = ORDER.indexOf(k); return i < 0 ? 10 : i; };
const speedOf = (k) => FIELD.speed[k] || 1;
const isRanged = (k) => !!(UNITS[k] && UNITS[k].ranged);
const isSiege = (k) => !!(UNITS[k] && (UNITS[k].siege || k === 'ram'));

// Nieuw slagveld. att: { soort: aantal }; defGroups: [{ key, units }]; towers: [{ id, level }]
export function createBattle({ kind = 'town', att, defGroups, towers = [], wall = 0, enclosed = false, smithyA = 0, smithyD = 0, now }) {
  const units = [];
  let id = 1;
  const total = (o) => Object.values(o || {}).reduce((a, b) => a + (b || 0), 0);
  const place = (side, list, scale, rowsFrom, dir) => {
    // zwaar voetvolk en ruiters vooraan, schutters en belegering achteraan
    list.sort((a, b) => rank(a.k) - rank(b.k));
    const perRow = 12;
    list.forEach((it, i) => {
      const row = Math.floor(i / perRow); const col = i % perRow;
      const inRow = Math.min(perRow, list.length - row * perRow);
      const x = FB.W / 2 + (col - (inRow - 1) / 2) * 0.9 + (row % 2) * 0.3;
      const y = Math.max(0.6, rowsFrom + dir * row * 0.85);
      const hp0 = (UNITS[it.k] && UNITS[it.k].hp) || 30;
      units.push({ id: id++, s: side, k: it.k, g: it.g, x, y, hp: hp0 * it.n, hp0, n: it.n, cd: 300 + ((id * 137) % 500), tg: null, mx: null, my: null, f: 0, at: -1 });
    });
  };
  const expand = (units0, g, scale) => {
    const out = [];
    for (const k of Object.keys(units0 || {})) {
      let n = units0[k] || 0;
      while (n > 0) { const m = Math.min(scale, n); out.push({ k, n: m, g }); n -= m; }
    }
    return out;
  };
  const sA = Math.max(1, Math.ceil(total(att) / FB.maxPerSide));
  const sD = Math.max(1, Math.ceil(defGroups.reduce((a, g) => a + total(g.units), 0) / FB.maxPerSide));
  place(0, expand(att, 'att', sA), sA, FB.H - 1.6, -1);
  const defList = defGroups.flatMap((g) => expand(g.units, g.key, sD));
  place(1, defList, sD, kind === 'town' && wall > 0 ? FB.wallY - 2.2 : 5.5, -1);
  // verdedigers wachten op hun plek (achter de muur) tot de vijand dichtbij komt
  for (const u of units) if (u.s === 1) { u.hx = u.x; u.hy = u.y; u.gd = true; }
  // torens net achter de muur
  towers.forEach((tw, i) => {
    const x = (FB.W / (towers.length + 1)) * (i + 1);
    const L = Math.max(1, Math.min(3, tw.level));
    units.push({ id: id++, s: 1, k: 'tower', b: tw.id, L, x, y: FB.wallY - 1.1, hp: TOWER.hp[L], hp0: TOWER.hp[L], n: 1, cd: 500 + i * 300, tg: null, at: -1 });
  });
  // muur: één blok per tegel; een open muur heeft een gat in het midden
  if (kind === 'town' && wall > 0) {
    for (let x = 0; x < FB.W; x++) {
      if (!enclosed && Math.abs(x + 0.5 - FB.W / 2) < 2) continue;
      units.push({ id: id++, s: 1, k: 'wall', x: x + 0.5, y: FB.wallY, hp: 260 * wall, hp0: 260 * wall, n: 1, L: wall });
    }
  }
  return { v: 1, kind, t0: now, t: now, n: 0, W: FB.W, H: FB.H, wallY: FB.wallY, ma: 1 + 0.05 * smithyA, md: 1 + 0.05 * smithyD, units, over: null, retreat: false };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mobile = (u) => u.k !== 'tower' && u.k !== 'wall';

function reach(u, tg) {
  if (u.k === 'tower') return TOWER.range;
  if (u.k === 'stonethrower') return FB.siegeRange;
  if (isRanged(u.k)) return FB.ranged;
  return FB.melee + (tg.k === 'tower' ? 0.35 : tg.k === 'wall' ? 0.2 : 0);
}

function damage(state, u, tg) {
  const mult = u.s ? state.md : state.ma;
  if (u.k === 'tower') {
    const def = UNITS[tg.k] && UNITS[tg.k].def ? UNITS[tg.k].def.rng : 10;
    return TOWER.dmg[u.L] * (FIELD.armorK / (FIELD.armorK + def));
  }
  const base = (UNITS[u.k] && UNITS[u.k].dmg) || 2;
  if (tg.k === 'tower' || tg.k === 'wall') return base * u.n * mult * (isSiege(u.k) ? 5 : tg.k === 'wall' ? 0.4 : 0.6);
  return hitDamage(u.k, tg.k, mult) * counter(u.k, tg.k) * u.n;
}

// tegenwicht: voetvolk dat goed weerstaat tegen ruiters (speerdragers, hoplieten) slaat ook hard op ruiters
function counter(ka, kb) {
  const a = UNITS[ka]; const b = UNITS[kb];
  if (!a || !b || !a.def || b.type !== 'cav' || a.type === 'cav') return 1;
  return 1 + Math.max(0, (a.def.cav || 0) - 25) / 10;
}

// muurblok dat iemand tegenhoudt op weg naar (x, y): aanvallers van buiten, verdedigers van binnen
// (verdedigers en aanvallers kunnen elkaar net over de muur heen raken)
const WALL_GAP = 0.38;
function blockingWall(state, u, nx, ny, walls) {
  if (!walls.length) return null;
  const wy = state.wallY;
  if (u.s === 0 ? !(u.y > wy + 0.3 && ny <= wy + 0.45) : !(u.y < wy - 0.3 && ny >= wy - 0.45)) return null;
  const bx = Math.floor(nx);
  return walls.find((w) => w.hp > 0 && Math.floor(w.x) === bx) || null;
}

// aanvallers zoeken een gat in de muur (open poort of bres) in plaats van ertegen te lopen
function viaGap(state, u, x, y, walls) {
  const wy = state.wallY;
  if (!walls.length) return null;
  const out = u.s === 0; // aanvaller staat buiten de muur
  if (out ? !(u.y > wy + 0.3 && y < wy) : !(u.y < wy - 0.3 && y > wy)) return null;
  const f = (u.y - wy) / (u.y - y);
  const cx = u.x + (x - u.x) * f;
  const blocked = new Set(walls.map((w) => Math.floor(w.x)));
  if (!blocked.has(Math.floor(cx))) return null;
  let best = null;
  for (let c = 0; c < state.W; c++) {
    if (blocked.has(c)) continue;
    const d = Math.abs(c + 0.5 - cx);
    if (d <= 7 && (!best || d < best.d)) best = { d, c };
  }
  if (!best) return null;
  const gx = best.c + 0.5;
  const sgn = out ? 1 : -1;
  return Math.abs(u.x - gx) < 0.35 ? { x: gx, y: wy - sgn * 0.6 } : { x: gx, y: wy + sgn * 0.55 };
}

function moveTo(state, u, x, y, stop, walls) {
  const gap = viaGap(state, u, x, y, walls);
  if (gap) { x = gap.x; y = gap.y; stop = 0.05; }
  const d = Math.hypot(x - u.x, y - u.y);
  if (d <= stop) return !gap;
  const step = Math.min(d - stop * 0.5, speedOf(u.k) * (FB.tick / 1000));
  const nx = u.x + ((x - u.x) / d) * step; let ny = u.y + ((y - u.y) / d) * step;
  const wall = blockingWall(state, u, nx, ny, walls);
  if (wall) {
    ny = state.wallY + (u.s ? -WALL_GAP : WALL_GAP);
    if (!u.s && !u.forced) u.tg = wall.id; // aanvallers beuken op de muur
  }
  u.x = Math.min(state.W - 0.3, Math.max(0.3, nx)); u.y = Math.min(state.H - 0.3, Math.max(0.3, ny));
  return false;
}

// dichtstbijzijnde vijand binnen maxD (muren nooit vanzelf, torens pas na de soldaten)
function pickTarget(state, u, alive, maxD = Infinity) {
  let best = null; let bd = Infinity;
  const towerOnly = u.k === 'tower';
  for (const e of alive) {
    if (e.s === u.s || e.k === 'wall') continue;
    if (towerOnly && !mobile(e)) continue;
    const real = dist(u, e);
    if (real > maxD) continue;
    const d = real + (e.k === 'tower' ? 2.5 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// hoe ver kijkt een eenheid uit naar vijanden?
function lookout(u) {
  if (u.k === 'tower') return TOWER.range;
  if (u.ch) return Infinity; // stormloop
  if (u.hx != null && !u.gd) return Math.max(FB.hold, reach(u, u) + 0.5);
  return FB.aggro;
}

function step(state) {
  const all = state.units;
  const alive = all.filter((u) => u.hp > 0);
  const byId = new Map(alive.map((u) => [u.id, u]));
  const walls = alive.filter((u) => u.k === 'wall');
  const now = state.n * FB.tick;
  for (const u of alive) {
    if (u.hp <= 0 || u.k === 'wall') continue;
    u.cd -= FB.tick;
    if (u.mx != null) {
      // aangekomen: hier blijven staan en enkel vijanden in de buurt aanvallen
      if (moveTo(state, u, u.mx, u.my, 0.08, walls)) { u.hx = u.mx; u.hy = u.my; u.mx = null; u.my = null; }
      continue;
    }
    let tg = u.tg != null ? byId.get(u.tg) : null;
    if (tg && tg.hp <= 0) { tg = null; u.forced = false; }
    const home = u.hx != null ? { x: u.hx, y: u.hy } : null;
    if (tg && home && !u.forced && tg.k !== 'wall' && dist(home, tg) > (u.gd ? FB.aggro + 1 : FB.leash)) tg = null; // niet te ver achterna
    if (!tg || (!u.forced && (state.n + u.id) % 10 === 0 && tg.k !== 'wall')) {
      let nt = pickTarget(state, u, alive, lookout(u));
      // aanvallers zonder bevel rukken op naar de dichtstbijzijnde vijand
      if (!nt && !home && u.s === 0 && mobile(u)) nt = pickTarget(state, u, alive);
      tg = nt || tg;
    }
    if (!tg) {
      u.tg = null;
      if (home && mobile(u) && Math.hypot(u.x - home.x, u.y - home.y) > 0.25) moveTo(state, u, home.x, home.y, 0.08, walls);
      continue;
    }
    u.tg = tg.id;
    if (dist(u, tg) <= reach(u, tg)) {
      if (u.cd <= 0) {
        tg.hp = Math.max(0, tg.hp - damage(state, u, tg));
        // wie geraakt wordt en niets beters te doen heeft (of op een muur beukt), slaat terug
        if (!tg.forced && tg.mx == null && mobile(tg) && mobile(u) && (tg.tg == null || (byId.get(tg.tg) || {}).k === 'wall')) tg.tg = u.id;
        u.cd = u.k === 'tower' ? TOWER.rate : (UNITS[u.k] && UNITS[u.k].rate) || 1500;
        u.at = now; u.ax = tg.x; u.ay = tg.y;
        if (tg.hp <= 0) tg.died = now;
      }
    } else if (u.k !== 'tower') {
      moveTo(state, u, tg.x, tg.y, reach(u, tg) * 0.9, walls);
    }
  }
  // een beetje uit elkaar gaan zodat ze niet op één hoop staan
  const mob = alive.filter((u) => u.hp > 0 && mobile(u));
  for (let i = 0; i < mob.length; i++) {
    for (let j = i + 1; j < mob.length; j++) {
      const a = mob[i]; const b = mob[j];
      const dx = b.x - a.x; const dy = b.y - a.y; const d2 = dx * dx + dy * dy;
      if (d2 > 0.16 || d2 === 0) continue;
      const d = Math.sqrt(d2); const push = (0.4 - d) * 0.25;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push;
    }
  }
  state.n++;
  state.t = state.t0 + state.n * FB.tick;
  const attLeft = all.some((u) => u.s === 0 && u.hp > 0);
  const defLeft = all.some((u) => u.s === 1 && u.hp > 0 && u.k !== 'wall');
  if (!attLeft) state.over = 1;
  else if (!defLeft) state.over = 0;
  else if (state.n * FB.tick >= FB.maxMs) state.over = 1;
}

// speel de slag af tot tijdstip t (hooguit maxTicks tikken); geeft het aantal gespeelde tikken terug
export function stepTo(state, t, maxTicks = Infinity) {
  let k = 0;
  while (state.over == null && state.t + FB.tick <= t && k < maxTicks) { step(state); k++; }
  return k;
}

// opdracht van een speler aan zijn eigen eenheden
export function giveOrder(state, side, ids, o) {
  const mine = state.units.filter((u) => u.s === side && u.hp > 0 && mobile(u) && (!ids || ids.includes(u.id)));
  if (o.retreat) { if (side === 0) { state.over = 1; state.retreat = true; } return; }
  if (o.charge) { for (const u of mine) { u.mx = null; u.my = null; u.forced = false; u.tg = null; u.hx = null; u.hy = null; u.gd = false; u.ch = true; } return; }
  const target = o.target != null ? state.units.find((u) => u.id === o.target && u.hp > 0 && u.s !== side) : null;
  if (!target && !(Number.isFinite(o.x) && Number.isFinite(o.y))) return; // ongeldig bevel
  // in een brede formatie rond het doel (snelle ruiters vooraan, schutters achteraan blijft zo bewaard)
  const cols = Math.ceil(Math.sqrt(mine.length * 1.8));
  const rows = Math.ceil(mine.length / cols);
  mine.forEach((u, i) => {
    if (target) { u.tg = target.id; u.forced = true; u.mx = null; u.my = null; u.hx = null; u.hy = null; u.gd = false; return; }
    const ox = ((i % cols) - (cols - 1) / 2) * 0.72; const oy = (Math.floor(i / cols) - (rows - 1) / 2) * 0.62;
    u.mx = Math.min(state.W - 0.4, Math.max(0.4, Number(o.x) + ox));
    u.my = Math.min(state.H - 0.4, Math.max(0.4, Number(o.y) + oy));
    u.tg = null; u.forced = false; u.ch = false; u.gd = false;
  });
}

// Overlevenden per kant (en per groep bij de verdediger). Gewonden tellen naar hun levens mee: wie op een
// tiende van zijn levens staat, haalt het niet (zoals bij een automatisch gevecht kost schade troepen).
export function battleOutcome(state) {
  const attLeft = {}; const defLeft = {};
  const towersLost = []; let wallsBroken = 0;
  const pools = new Map();
  for (const u of state.units) {
    if (u.k === 'tower') { if (u.hp <= 0) towersLost.push(u.b); continue; }
    if (u.k === 'wall') { if (u.hp <= 0) wallsBroken++; continue; }
    const key = `${u.s}|${u.s ? u.g : ''}|${u.k}`;
    const p = pools.get(key) || { s: u.s, g: u.g, k: u.k, hp: 0, hp0: u.hp0, up: 0 };
    p.hp += Math.max(0, u.hp);
    p.up += Math.max(0, Math.min(u.n || 1, Math.ceil(u.hp / u.hp0 - 1e-6)));
    pools.set(key, p);
  }
  for (const p of pools.values()) {
    const n = p.up ? Math.min(p.up, Math.max(1, Math.round(p.hp / p.hp0))) : 0;
    if (p.s === 0) attLeft[p.k] = (attLeft[p.k] || 0) + n;
    else { const g = defLeft[p.g] || (defLeft[p.g] = {}); g[p.k] = (g[p.k] || 0) + n; }
  }
  return { attWins: state.over === 0, attLeft, defLeft, towersLost, wallsBroken, retreat: !!state.retreat };
}

export const battleTime = (state) => state.n * FB.tick;
