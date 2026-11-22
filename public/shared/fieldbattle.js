// Belegering die je zelf bestuurt. De slag speelt zich af in de echte stad van de verdediger: zijn gebouwen,
// bos en water, zijn muren, poorten en wachttorens (of rond een roverskamp op de wereldkaart).
//   1. Opstelling: de aanvaller staat aan de kant waar hij vandaan komt, de verdediger binnen zijn stad.
//      Beide kanten zetten hun troepen waar ze willen en drukken op 'Start' (of de tijd is om).
//   2. Slag: troepen lopen rond gebouwen, door poorten (enkel de verdediger) en over de muren (schutters en
//      voetvolk van de verdediger). De aanvaller slaat een bres met rammen of zijn voetvolk. Wie het plein voor
//      het stadscentrum lang genoeg houdt, of alle verdedigers verslaat, wint.
// Wie niet zelf bestuurt, wordt door de computer geleid: de verdediger zet zijn schutters op de muur aan de kant
// van de aanval en zijn voetvolk achter de bedreigde poort; de aanvaller ramt de dichtstbijzijnde poort.
// Vaste tikken van 100 ms en volledig deterministisch (geen Math.random of Math.hypot), zodat de server
// (gezaghebbend) en de browser (vloeiend, rekent zelf verder) exact hetzelfde verloop zien.
import { UNITS, FIELD, TOWER, TC_POS } from './rules.js';
import { hitDamage } from './skirmish.js';
import { territory, tileIndex, tileOf, ringOf, ringForAge, T_MIN, T_MAX, TILE } from './territory.js';
import { occupied, isBuildable, clearedSet, insideSet, bLevel, age as townAge } from './sim.js';

export const FB = {
  tick: 100,
  chooseMs: 45000, // zo lang heb je om te kiezen: zelf besturen of automatisch
  deployMs: 75000, // opstelling: hooguit zo lang, of tot beide kanten klaar zijn
  maxMs: 10 * 60000, // na 10 minuten slag trekt de aanvaller zich terug
  staleMs: 30000, // niemand kijkt nog mee: de server rekent de rest automatisch uit
  maxTicksPerCall: 40, // hooguit 4 s slag per verzoek (CPU-limiet van de server)
  delay: 700, // de server rekent zo ver achter op de klok: bevelen komen zo op tijd aan
  lead: 2, // een bevel gaat zoveel tikken na de tik in (de tegenstander hoort het zo meestal vóór het gebeurt)
  pollMs: 600, // zo vaak vraagt de browser tijdens een slag de stand op
  maxPerSide: 64, // grote legers: één figuur staat dan voor meerdere soldaten
  squad: 8, // figuren per eenheid (kaartje onderaan)
  margin: 11, // zoveel tegels rond de stad horen bij het slagveld
  zone: 9, // hooguit zo diep is de opstelplaats van de aanvaller (en minstens 4 tegels van de stad)
  melee: 0.85, ranged: 4.4, siegeRange: 5.6, wallRange: 1.6,
  aggro: 4, leash: 6.5, // wie op zijn plek staat, valt vijanden in de buurt aan en loopt niet te ver weg
  pace: 0.35, // gevechten trager dan de ruwe schade: een slag duurt minuten, geen seconden
  capR: 2.4, capMs: 30000, // het plein: zo lang houden zonder verdedigers in de buurt = gewonnen
  forestSlow: 0.6, forestCover: 0.7, wallCover: 0.5,
  paths: 6, // hooguit zoveel routes per tik uitrekenen
  ai: 10, // de computer denkt om de zoveel tikken na
};

const SQ = (v) => v * v;
const dist = (a, b) => Math.sqrt(SQ(a.x - b.x) + SQ(a.y - b.y));
const R3 = (v) => Math.round(v * 1000) / 1000;
const K = (k) => UNITS[k] || {};
export const isRangedK = (k) => k === 'tower' || !!K(k).ranged;
const isSiege = (k) => k === 'ram' || !!K(k).siege;
const isCav = (k) => K(k).type === 'cav';
const climbs = (k) => !isCav(k) && !isSiege(k); // mag op de muur
const meleeK = (k) => !isRangedK(k) && k !== 'ram';
export const mobile = (u) => u.k !== 'tower';
const speedOf = (k) => FIELD.speed[k] || 1;
export const aliveN = (u) => Math.max(0, Math.min(u.n || 1, Math.ceil(u.hp / u.hp0 - 1e-9)));
export const wallHp = (L) => 160 + 90 * Math.max(1, L);

const ORDER = ['ram', 'elephant', 'samurai', 'hoplite', 'lionguard', 'immortal', 'sword', 'spear', 'villager', 'barbarian',
  'knight', 'chariot', 'camel', 'rider', 'scout', 'yabusame', 'peltast', 'archer', 'stonethrower'];
const rank = (k) => { const i = ORDER.indexOf(k); return i < 0 ? 10 : i; };
const role = (k) => (k === 'ram' || k === 'stonethrower' ? 'siege' : isRangedK(k) ? 'rng' : isCav(k) ? 'cav' : 'inf');

// ---------- slagveld: raster van tegels ----------
// grid: '.' vrij, 'f' bos (trager, dekking), '~' water, 'b' gebouw, 'x' tent, 'w' muur, 'g' poort
export const cellOf = (st, x, y) => {
  const i = Math.floor(x); const j = Math.floor(y); const b = st.box;
  return i < b.x0 || j < b.y0 || i >= b.x0 + b.w || j >= b.y0 + b.h ? -1 : (j - b.y0) * b.w + (i - b.x0);
};
const cellXY = (st, c) => ({ i: st.box.x0 + (c % st.box.w), j: st.box.y0 + Math.floor(c / st.box.w) });
const proj = (st, x, y) => (x - st.plaza.x) * st.dir.x + (y - st.plaza.y) * st.dir.y;

// afgeleide gegevens (niet bewaard): wie waar door kan, en welke tegels met elkaar verbonden zijn
const NAV = new WeakMap();
export function nav(st) {
  let n = NAV.get(st);
  if (n && n.nv === st.nv) return n;
  const { w, h } = st.box; const N = w * h;
  const wallAt = new Int16Array(N).fill(-1);
  st.walls.forEach((wl, k) => { if (wl.hp > 0) { const c = cellOf(st, wl.i + 0.5, wl.j + 0.5); if (c >= 0) wallAt[c] = k; } });
  // 0 geblokkeerd, 1 vrij, 2 bos, 3 op de muur (enkel verdediger), 4 poort (enkel verdediger)
  const p0 = new Uint8Array(N); const p1 = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    const ch = st.grid[c];
    if (ch === '~' || ch === 'b' || ch === 'x') continue;
    if ((ch === 'w' || ch === 'g') && wallAt[c] >= 0) { p1[c] = ch === 'g' ? 4 : st.enc ? 3 : 0; continue; }
    p0[c] = p1[c] = ch === 'f' ? 2 : 1;
  }
  n = { nv: st.nv, wallAt, p0, p1, ins: st.ins, w, h, N };
  n.lab0 = labels(st, n, 0); n.lab1 = labels(st, n, 1);
  NAV.set(st, n);
  return n;
}
const inside = (nv, c) => !!nv.ins && nv.ins.charCodeAt(c) === 49;

// mag een eenheid van kant 'side' van tegel a naar tegel b stappen?
function canStep(nv, side, k, a, b) {
  const p = side ? nv.p1 : nv.p0;
  const pb = p[b];
  if (!pb) return false;
  if (side === 1) {
    if (pb === 3 && !climbs(k)) return false;
    const pa = p[a];
    // van de muur naar buiten springen (of van buiten op de muur klimmen) kan niet
    if (pb === 3 && pa !== 3 && pa !== 4 && !inside(nv, a)) return false;
    if (pa === 3 && pb !== 3 && pb !== 4 && !inside(nv, b)) return false;
  }
  return true;
}
const standable = (nv, side, k, c) => c >= 0 && !!(side ? nv.p1 : nv.p0)[c] && (side === 0 || nv.p1[c] !== 3 || climbs(k));
const onWall = (st, nv, u) => { const c = cellOf(st, u.x, u.y); return c >= 0 && u.s === 1 && nv.p1[c] === 3; };

function labels(st, nv, side) {
  const lab = new Int16Array(nv.N).fill(-1);
  const p = side ? nv.p1 : nv.p0;
  const { w, h } = nv;
  let next = 0;
  const q = new Int32Array(nv.N);
  for (let s = 0; s < nv.N; s++) {
    if (!p[s] || lab[s] >= 0) continue;
    let qh = 0; let qt = 0;
    q[qt++] = s; lab[s] = next;
    while (qh < qt) {
      const a = q[qh++]; const x = a % w; const y = (a - x) / w;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0); const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const b = ny * w + nx;
        if (lab[b] >= 0 || !canStep(nv, side, 'spear', a, b)) continue;
        lab[b] = next; q[qt++] = b;
      }
    }
    next++;
  }
  return lab;
}

// ---------- routes ----------
// rechte lijn zonder obstakels (in stapjes van een kwart tegel, ook geen hoeken afsnijden)
function clearLine(st, nv, side, k, ax, ay, bx, by) {
  const d = Math.sqrt(SQ(bx - ax) + SQ(by - ay));
  const n = Math.ceil(d / 0.25);
  let prev = cellOf(st, ax, ay);
  if (prev < 0) return false;
  const w = st.box.w;
  for (let s = 1; s <= n; s++) {
    const c = cellOf(st, ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n);
    if (c === prev) continue;
    if (c < 0 || !canStep(nv, side, k, prev, c)) return false;
    const di = (c % w) - (prev % w); const dj = Math.floor(c / w) - Math.floor(prev / w);
    if (di !== 0 && dj !== 0 && (!canStep(nv, side, k, prev, prev + di) || !canStep(nv, side, k, prev, prev + dj * w))) return false;
    prev = c;
  }
  return true;
}

const SCR = {};
export const STATS = { paths: 0 };
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

// A*: route van u naar (gx, gy) als lijst tussenstops. Kan het doel niet bereikt worden, dan tot zo dicht mogelijk
// (blk = true). Deterministisch: bij gelijke kosten wint het kleinste tegelnummer.
function findPath(st, nv, side, k, sx, sy, gx, gy) {
  const start = cellOf(st, sx, sy); let goal = cellOf(st, gx, gy);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return { pts: [[R3(gx), R3(gy)]], blk: false };
  const { w, N } = nv; const p = side ? nv.p1 : nv.p0;
  // onbereikbaar doel (andere kant van de muur): mik op de bereikbare tegel die er het dichtst bij ligt
  const lab = side ? nv.lab1 : nv.lab0;
  let unreachable = false;
  if (lab[start] >= 0 && lab[goal] !== lab[start]) {
    unreachable = true;
    const gi0 = goal % w; const gj0 = (goal / w) | 0; const l = lab[start];
    let bd = Infinity; let bc = start;
    for (let c = 0; c < N; c++) {
      if (lab[c] !== l) continue;
      const d = SQ((c % w) - gi0) + SQ(((c / w) | 0) - gj0);
      if (d < bd) { bd = d; bc = c; }
    }
    goal = bc;
    if (goal === start) return { pts: [], blk: true };
  }
  const gi = goal % w; const gj = (goal / w) | 0;
  const hf = (c) => { const dx = Math.abs((c % w) - gi); const dy = Math.abs(((c / w) | 0) - gj); return dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx; };
  if (!SCR.g || SCR.g.length < N) {
    SCR.g = new Float64Array(N); SCR.from = new Int32Array(N); SCR.closed = new Uint8Array(N);
    SCR.hf = new Float64Array(N * 8 + 8); SCR.hc = new Int32Array(N * 8 + 8);
  }
  const g = SCR.g; const from = SCR.from; const closed = SCR.closed; const HF = SCR.hf; const HC = SCR.hc;
  g.fill(Infinity, 0, N); from.fill(-1, 0, N); closed.fill(0, 0, N);
  STATS.paths++;
  let hn = 0;
  const less = (a, b) => HF[a] < HF[b] || (HF[a] === HF[b] && HC[a] < HC[b]);
  const swap = (a, b) => { const f = HF[a]; HF[a] = HF[b]; HF[b] = f; const c = HC[a]; HC[a] = HC[b]; HC[b] = c; };
  const push = (f, c) => {
    let i = hn++; HF[i] = f; HC[i] = c;
    while (i > 0) { const pi = (i - 1) >> 1; if (!less(i, pi)) break; swap(i, pi); i = pi; }
  };
  const pop = () => {
    const c = HC[0]; hn--;
    if (hn > 0) {
      HF[0] = HF[hn]; HC[0] = HC[hn]; let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < hn && less(l, m)) m = l;
        if (r < hn && less(r, m)) m = r;
        if (m === i) break;
        swap(m, i); i = m;
      }
    }
    return c;
  };
  g[start] = 0; push(hf(start), start);
  let best = start; let bestH = hf(start);
  let found = false;
  const H = nv.h;
  while (hn > 0) {
    const a = pop();
    if (closed[a]) continue;
    closed[a] = 1;
    if (a === goal) { found = true; break; }
    const ha = hf(a);
    if (ha < bestH || (ha === bestH && g[a] < g[best])) { best = a; bestH = ha; }
    const x = a % w; const y = (a / w) | 0;
    for (let d = 0; d < 8; d++) {
      const D = DIRS[d]; const dx = D[0]; const dy = D[1];
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= H) continue;
      const b = ny * w + nx;
      if (closed[b] || !canStep(nv, side, k, a, b)) continue;
      if (dx && dy && (!canStep(nv, side, k, a, a + dx) || !canStep(nv, side, k, a, a + dy * w))) continue;
      const ng = g[a] + D[2] * (p[b] === 2 ? 1.6 : 1);
      if (ng < g[b]) { g[b] = ng; from[b] = a; push(ng + hf(b), b); }
    }
  }
  const end = found ? goal : best;
  const cells = [];
  for (let c = end; c >= 0; c = from[c]) { cells.push(c); if (c === start) break; }
  cells.reverse();
  // tussenstops uitdunnen: zo ver mogelijk in een rechte lijn
  const pts = [];
  const ctr = (c) => { const { i, j } = cellXY(st, c); return [i + 0.5, j + 0.5]; };
  let cx = sx; let cy = sy; let idx = 0;
  while (idx < cells.length - 1) {
    // zo ver mogelijk vooruit in een rechte lijn (hooguit 14 tegels, stoppen bij het eerste obstakel)
    let far = idx + 1;
    for (let t = idx + 2; t < cells.length && t <= idx + 14; t++) {
      const [tx, ty] = ctr(cells[t]);
      if (!clearLine(st, nv, side, k, cx, cy, tx, ty)) break;
      far = t;
    }
    const [tx, ty] = ctr(cells[far]);
    pts.push([tx, ty]); cx = tx; cy = ty; idx = far;
  }
  if (found && !unreachable) {
    if (pts.length) pts[pts.length - 1] = [R3(gx), R3(gy)]; else pts.push([R3(gx), R3(gy)]);
  }
  if (!pts.length) pts.push(ctr(end));
  return { pts, blk: unreachable || !found };
}

// dichtstbijzijnde tegel rond (x, y) waar deze eenheid kan staan (en die nog plaats heeft)
function nearestStand(st, nv, side, k, x, y, ok = null, maxR = 8) {
  const c0 = cellOf(st, x, y);
  const i0 = Math.floor(x); const j0 = Math.floor(y);
  let best = -1; let bd = Infinity;
  for (let r = 0; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const c = cellOf(st, i0 + di + 0.5, j0 + dj + 0.5);
        if (c < 0 || !standable(nv, side, k, c) || (ok && !ok(c))) continue;
        const d = SQ(i0 + di + 0.5 - x) + SQ(j0 + dj + 0.5 - y);
        if (d < bd || (d === bd && c < best)) { bd = d; best = c; }
      }
    }
    if (best >= 0 && r >= 1) break;
  }
  return best >= 0 ? best : c0;
}

// ---------- een nieuw slagveld ----------
// o: { kind: 'town'|'camp', att, defGroups: [{key, units}], town (staat van de stad), townId, campSeed, level,
//      dir: {x, y} (vanuit het doel naar waar de aanvaller vandaan komt), smithyA, smithyD, aiAtt, aiDef, now }
export function createBattle(o) {
  const st = {
    v: 2, kind: o.kind, t0: o.now, t: o.now, n: 0, phase: 'deploy', ph1: null, nv: 0,
    ma: 1 + 0.05 * (o.smithyA || 0), md: 1 + 0.05 * (o.smithyD || 0),
    units: [], walls: [], q: [], ack: [], ai: [!!o.aiAtt, !!o.aiDef], ready: [!!o.aiAtt, !!o.aiDef],
    cap: 0, over: null, retreat: false, uid: 1, aiF: -1,
  };
  if (o.kind === 'town' && o.town) townMap(st, o.town, o.townId);
  else campMap(st, o.campSeed || 1);
  let dx = Number(o.dir && o.dir.x) || 0; let dy = Number(o.dir && o.dir.y) || 0;
  const dl = Math.sqrt(dx * dx + dy * dy);
  if (dl < 1e-6) { dx = -1; dy = 0; } else { dx /= dl; dy /= dl; }
  st.dir = { x: R3(dx), y: R3(dy) };
  const nv = nav(st);
  // opstelplaats van de aanvaller: de strook aan de kant waar hij vandaan komt
  let pmax = -Infinity; let edge = -Infinity;
  for (let c = 0; c < nv.N; c++) {
    const { i, j } = cellXY(st, c);
    const pr = proj(st, i + 0.5, j + 0.5);
    const ch = st.grid[c];
    if (ch === 'w' || ch === 'g' || ch === 'b' || ch === 'x' || inside(nv, c)) edge = Math.max(edge, pr);
    if (nv.p0[c] && !inside(nv, c)) pmax = Math.max(pmax, pr);
  }
  // een brede strook aan de kant van de aanvaller, niet tegen de muur aan
  st.zmin = R3(Math.min(pmax - 3, Math.max(pmax - FB.zone, edge + 4)));
  // het leger kapte het bos tussen zijn kamp en de stad: een open veld voor de muur aan die kant
  let cut = '';
  for (let c = 0; c < nv.N; c++) {
    const ch = st.grid[c];
    if (ch === 'f') {
      const { i, j } = cellXY(st, c);
      const x = i + 0.5 - st.plaza.x; const y = j + 0.5 - st.plaza.y;
      const along = x * st.dir.x + y * st.dir.y; const lat = Math.abs(-x * st.dir.y + y * st.dir.x);
      if (along > edge - 1 && lat <= 9 + Math.max(0, along - edge) * 0.4) { cut += '.'; continue; }
    }
    cut += ch;
  }
  st.grid = cut;
  NAV.delete(st);
  // troepen: grote legers krijgen figuren die voor meerdere soldaten staan
  const total = (u) => Object.values(u || {}).reduce((a, b) => a + (b || 0), 0);
  const sA = Math.max(1, Math.ceil(total(o.att) / FB.maxPerSide));
  const sD = Math.max(1, Math.ceil(o.defGroups.reduce((a, g) => a + total(g.units), 0) / FB.maxPerSide));
  let sq = 1;
  const add = (side, units, g, scale) => {
    const kinds = Object.keys(units || {}).filter((k) => units[k] > 0 && UNITS[k]).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    for (const k of kinds) {
      let n = units[k]; let inSq = 0;
      while (n > 0) {
        const m = Math.min(scale, n); n -= m;
        const hp0 = K(k).hp || 30;
        const id = st.uid++;
        st.units.push({ id, s: side, k, g, n: m, hp: hp0 * m, hp0, x: st.plaza.x, y: st.plaza.y, cd: 400 + ((id * 137) % 700), st: 'hold', hx: 0, hy: 0, tg: null, tw: -1, at: -1, sq });
        if (++inSq >= FB.squad) { inSq = 0; sq++; }
      }
      if (inSq) sq++;
    }
  };
  add(0, o.att, 'att', sA);
  for (const grp of o.defGroups) add(1, grp.units, grp.key, sD);
  // wachttorens van de verdediger
  for (const tw of st.towerDefs || []) {
    const L = Math.max(1, Math.min(3, tw.level));
    st.units.push({ id: st.uid++, s: 1, k: 'tower', b: tw.id, L, x: tw.x, y: tw.y, hp: TOWER.hp[L], hp0: TOWER.hp[L], n: 1, cd: 600, st: 'hold', tg: null, tw: -1, at: -1 });
  }
  delete st.towerDefs;
  deployAttack(st, nav(st));
  deployDefense(st, nav(st));
  return st;
}

function townMap(st, s, seed) {
  const terr = territory(seed);
  const k = ringForAge(townAge(s));
  let i0 = -k; let j0 = -k; let i1 = 11 + k; let j1 = 11 + k;
  const grow = (i, j) => { i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j); };
  for (const idx of [...(s.walls || []), ...(s.gates || [])]) { const p = tileOf(idx); grow(p.i, p.j); }
  const M = FB.margin;
  const x0 = Math.max(T_MIN, i0 - M); const y0 = Math.max(T_MIN, j0 - M);
  const x1 = Math.min(T_MAX, i1 + 1 + M); const y1 = Math.min(T_MAX, j1 + 1 + M);
  st.box = { x0, y0, w: x1 - x0, h: y1 - y0 };
  const occ = occupied(s); const cl = clearedSet(s);
  const walls = new Set(s.walls || []); const gates = new Set(s.gates || []);
  const ins = insideSet(s);
  st.enc = !!ins;
  let grid = ''; let insS = '';
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      const idx = tileIndex(i, j);
      let ch = '.';
      if (walls.has(idx)) ch = 'w';
      else if (gates.has(idx)) ch = 'g';
      else if (occ.has(`${i},${j}`)) ch = 'b';
      else if (terr.tiles[idx] === TILE.WATER) ch = '~';
      else if (terr.tiles[idx] === TILE.FOREST && !isBuildable(s, i, j, cl)) ch = 'f';
      grid += ch;
      insS += ins && ins.has(`${i},${j}`) && ch !== 'w' && ch !== 'g' ? '1' : '0';
    }
  }
  st.grid = grid; st.ins = ins ? insS : null;
  const L = Math.max(1, bLevel(s, 'wall'));
  st.wallL = L;
  for (const idx of s.walls || []) addWall(st, idx, L, false);
  for (const idx of s.gates || []) addWall(st, idx, L, true);
  st.ring = k + 1;
  // het plein voor de deur van het stadscentrum
  const tc = s.buildings.find((b) => b.type === 'tc') || { x: TC_POS.x, y: TC_POS.y };
  st.plaza = { x: tc.x + 1, y: tc.y + 2.5 };
  st.towerDefs = s.buildings.filter((b) => b.type === 'tower' && b.level > 0 && b.x >= x0 && b.y >= y0 && b.x < x1 && b.y < y1)
    .slice(0, 6).map((b) => ({ id: b.id, level: b.level, x: b.x + 0.5, y: b.y + 0.5 }));
  st.nv = 0;
  const nv = nav(st);
  const pc = nearestStand(st, nv, 0, 'spear', st.plaza.x, st.plaza.y);
  const pp = cellXY(st, pc);
  st.plaza = { x: pp.i + 0.5, y: pp.j + 0.5 };
  NAV.delete(st);
}

function addWall(st, idx, L, gate) {
  const { i, j } = tileOf(idx);
  if (i < st.box.x0 || j < st.box.y0 || i >= st.box.x0 + st.box.w || j >= st.box.y0 + st.box.h) return;
  const hp = Math.round(wallHp(L) * (gate ? 0.75 : 1));
  st.walls.push({ i, j, g: gate ? 1 : 0, hp, hp0: hp, wall: 1 });
}

// roverskamp: een open plek in het bos met tenten rond een kampvuur
function campMap(st, seed) {
  const terr = territory(seed);
  const x0 = -5; const y0 = -5; const x1 = 17; const y1 = 17;
  st.box = { x0, y0, w: x1 - x0, h: y1 - y0 };
  st.plaza = { x: 6, y: 6 };
  const tents = [[3, 3], [8, 2], [10, 7], [7, 10], [2, 8], [4, 6]];
  st.tents = tents.map(([i, j]) => ({ i, j }));
  let grid = '';
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      const idx = tileIndex(i, j);
      let ch = '.';
      if (tents.some(([a, b]) => a === i && b === j)) ch = 'x';
      else if (terr.tiles[idx] === TILE.WATER) ch = '~';
      else if (terr.tiles[idx] === TILE.FOREST && ringOf(i, j) > 2) ch = 'f';
      grid += ch;
    }
  }
  st.grid = grid; st.ins = null; st.enc = false; st.ring = 2; st.wallL = 0;
  st.towerDefs = [];
}

// ---------- opstelling ----------
// waar mag deze kant zich opstellen?
export function inZone(st, nv, side, c) {
  if (c < 0) return false;
  const { i, j } = cellXY(st, c);
  const cx = i + 0.5; const cy = j + 0.5;
  if (side === 0) return !!nv.p0[c] && !inside(nv, c) && proj(st, cx, cy) >= st.zmin;
  if (!nv.p1[c]) return false;
  if (st.kind === 'camp') return SQ(cx - st.plaza.x) + SQ(cy - st.plaza.y) <= 36;
  if (st.enc) return inside(nv, c) || nv.p1[c] === 3 || nv.p1[c] === 4;
  return ringOf(i, j) <= st.ring && proj(st, cx, cy) < st.zmin - 2;
}

// zet een figuur op de dichtstbijzijnde vrije plek in zijn opstelzone (2 per tegel)
function placeIn(st, nv, u, x, y, used) {
  const ok = (c) => inZone(st, nv, u.s, c) && (used.get(c) || 0) < 2;
  let c = nearestStand(st, nv, u.s, u.k, x, y, ok, 10);
  if (!ok(c)) c = nearestStand(st, nv, u.s, u.k, x, y, ok, 30);
  const m = used.get(c) || 0;
  used.set(c, m + 1);
  const { i, j } = cellXY(st, c);
  const off = m ? [0.7, 0.66] : [0.32, 0.36];
  u.x = R3(i + off[0]); u.y = R3(j + off[1]);
  u.hx = u.x; u.hy = u.y; u.st = 'hold'; u.tg = null; u.tw = -1; u.path = null; u.np = 0; u.gx = null; u.gy = null;
}

const perp = (d) => ({ x: -d.y, y: d.x });

// rijen dwars op de richting d rond punt (x, y): eerst rij 0 (vooraan), dan verder naar achter
function rows(list, x, y, d, perRow = 10, gap = 0.8) {
  const p = perp(d);
  return list.map((u, n) => {
    const r = Math.floor(n / perRow); const inRow = Math.min(perRow, list.length - r * perRow);
    const c = (n % perRow) - (inRow - 1) / 2;
    return { u, x: x - d.x * r * gap + p.x * c * gap, y: y - d.y * r * gap + p.y * c * gap };
  });
}

function deployAttack(st, nv) {
  const att = st.units.filter((u) => u.s === 0);
  const toward = { x: -st.dir.x, y: -st.dir.y }; // vooraan = naar de stad
  const used = new Map();
  const front = st.zmin + 0.8;
  const base = { x: st.plaza.x + st.dir.x * front, y: st.plaza.y + st.dir.y * front };
  const order = ['siege', 'inf', 'rng', 'cav'];
  const list = [...att].sort((a, b) => order.indexOf(role(a.k)) - order.indexOf(role(b.k)) || a.id - b.id);
  for (const { u, x, y } of rows(list, base.x, base.y, toward, 12, 0.85)) placeIn(st, nv, u, x, y, used);
}

// de verdediger stelt zich op naar de kant van de aanval: schutters op de muur, voetvolk achter de poort
function deployDefense(st, nv) {
  const def = st.units.filter((u) => u.s === 1 && mobile(u));
  const used = new Map();
  const P = st.plaza; const d = st.dir;
  const rng = def.filter((u) => role(u.k) === 'rng');
  const inf = def.filter((u) => role(u.k) === 'inf');
  const cav = def.filter((u) => role(u.k) === 'cav' || role(u.k) === 'siege');
  if (st.kind === 'camp') {
    rows(inf, P.x + d.x * 2.2, P.y + d.y * 2.2, d, 8).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
    rows([...rng, ...cav], P.x + d.x * 0.6, P.y + d.y * 0.6, d, 8).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
    return;
  }
  const alive = st.walls.map((w, k) => ({ w, k })).filter(({ w }) => w.hp > 0);
  const wallCells = st.enc ? alive.filter(({ w }) => !w.g).sort((a, b) => proj(st, b.w.i + 0.5, b.w.j + 0.5) - proj(st, a.w.i + 0.5, a.w.j + 0.5) || a.k - b.k) : [];
  if (wallCells.length) {
    // schutters op de muur, zo dicht mogelijk bij de aanvaller (twee per muurstuk)
    let wi = 0; const rest = [];
    for (const u of rng) {
      if (wi < wallCells.length * 2 && wi < wallCells.length * 1.2) {
        const { w } = wallCells[Math.floor(wi / 2)]; wi++;
        const c = cellOf(st, w.i + 0.5, w.j + 0.5);
        const m = used.get(c) || 0;
        if (m < 2 && climbs(u.k)) {
          used.set(c, m + 1);
          u.x = R3(w.i + (m ? 0.68 : 0.32)); u.y = R3(w.j + (m ? 0.64 : 0.36)); u.hx = u.x; u.hy = u.y;
          continue;
        }
      }
      rest.push(u);
    }
    // voetvolk achter de bedreigde poort(en), anders achter de muur aan die kant
    const gates = alive.filter(({ w }) => w.g).sort((a, b) => proj(st, b.w.i + 0.5, b.w.j + 0.5) - proj(st, a.w.i + 0.5, a.w.j + 0.5) || a.k - b.k);
    const spots = [];
    const top = proj(st, wallCells[0].w.i + 0.5, wallCells[0].w.j + 0.5);
    for (const { w } of gates) {
      if (proj(st, w.i + 0.5, w.j + 0.5) < top - 4 || spots.length >= 2) continue;
      const b = behind(st, nv, w);
      if (!spots.some((p) => SQ(p.x - b.x) + SQ(p.y - b.y) < 9)) spots.push(b);
    }
    if (!spots.length) spots.push(behind(st, nv, wallCells[0].w));
    const per = Math.ceil(inf.length / spots.length);
    spots.forEach((sp, n) => {
      const part = inf.slice(n * per, (n + 1) * per);
      rows(part, sp.x, sp.y, { x: d.x, y: d.y }, 6, 0.8).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
    });
    rows(rest, P.x + d.x * 1.5, P.y + d.y * 1.5, d, 8).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
    rows(cav, P.x - d.x * 0.6, P.y - d.y * 0.6, d, 8).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
    return;
  }
  // open stad: een linie voor het plein, schutters erachter, ruiters als reserve
  rows(inf, P.x + d.x * 3.2, P.y + d.y * 3.2, d, 10).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
  rows(rng, P.x + d.x * 1.8, P.y + d.y * 1.8, d, 10).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
  rows(cav, P.x - d.x * 0.2, P.y - d.y * 0.2, d, 8).forEach(({ u, x, y }) => placeIn(st, nv, u, x, y, used));
}

// een plek net binnen de muur achter muurstuk w (richting het plein)
function behind(st, nv, w) {
  const cx = w.i + 0.5; const cy = w.j + 0.5;
  const dx = st.plaza.x - cx; const dy = st.plaza.y - cy; const dl = Math.sqrt(dx * dx + dy * dy) || 1;
  for (const f of [1.6, 2.4, 3.2, 1.0]) {
    const x = cx + (dx / dl) * f; const y = cy + (dy / dl) * f;
    const c = cellOf(st, x, y);
    if (c >= 0 && nv.p1[c] && nv.p1[c] !== 3 && (!st.enc || inside(nv, c))) return { x, y };
  }
  return { x: st.plaza.x, y: st.plaza.y };
}

// ---------- bevelen ----------
// Een bevel wordt in de wachtrij gezet voor tik 'at' (zodat server en browser het op exact dezelfde tik uitvoeren).
export function queueOrder(st, side, ids, o, at = st.n, cid = null) {
  const n = Math.max(st.n, Math.min(st.n + 120, Math.floor(Number(at) || st.n)));
  st.q.push({ n, s: side, ids: ids ? ids.slice(0, 300) : null, o, cid });
  st.q.sort((a, b) => a.n - b.n);
  if (cid) { st.ack.push(cid); if (st.ack.length > 30) st.ack.shift(); }
  return n;
}

// meteen uitvoeren (voor tests en de wachtrij)
export function giveOrder(st, side, ids, o) {
  const nv = nav(st);
  if (o.ready) { st.ready[side] = true; return; }
  if (o.ai != null) { st.ai[side] = !!o.ai; if (st.ai[side]) st.ready[side] = true; return; }
  if (o.retreat) { if (side === 0 && st.over == null) { st.over = 1; st.retreat = true; } return; }
  const mine = st.units.filter((u) => u.s === side && u.hp > 0 && mobile(u) && (!ids || ids.includes(u.id)));
  if (!mine.length) return;
  if (st.phase === 'deploy') {
    if (!(Number.isFinite(o.x) && Number.isFinite(o.y))) return;
    const used = new Map();
    for (const u of st.units) {
      if (u.s !== side || u.hp <= 0 || !mobile(u) || mine.includes(u)) continue;
      const c = cellOf(st, u.x, u.y); used.set(c, (used.get(c) || 0) + 1);
    }
    const c0 = { x: mine.reduce((a, u) => a + u.x, 0) / mine.length, y: mine.reduce((a, u) => a + u.y, 0) / mine.length };
    const dd = side ? st.dir : { x: -st.dir.x, y: -st.dir.y };
    for (const { u, x, y } of formation(st, nv, mine, c0, o.x, o.y, dd)) placeIn(st, nv, u, x, y, used);
    return;
  }
  if (o.stop) { for (const u of mine) toHold(u); return; }
  if (o.charge) { for (const u of mine) { u.st = 'charge'; u.tg = null; u.tw = -1; u.path = null; u.np = 0; u.gx = null; } return; }
  if (o.wall != null) {
    const w = st.walls[o.wall];
    if (!w || w.hp <= 0 || side !== 0) return;
    for (const u of mine) { u.st = 'attack'; u.tw = o.wall; u.tg = null; u.path = null; u.np = 0; u.gx = null; }
    return;
  }
  if (o.target != null) {
    const e = st.units.find((x) => x.id === o.target && x.hp > 0 && x.s !== side);
    if (!e) return;
    for (const u of mine) { u.st = 'attack'; u.tg = e.id; u.tw = -1; u.path = null; u.np = 0; u.gx = null; }
    return;
  }
  if (!(Number.isFinite(o.x) && Number.isFinite(o.y))) return;
  moveGroup(st, nv, mine, Math.min(st.box.x0 + st.box.w - 0.2, Math.max(st.box.x0 + 0.2, o.x)), Math.min(st.box.y0 + st.box.h - 0.2, Math.max(st.box.y0 + 0.2, o.y)));
}

function toHold(u) { u.st = 'hold'; u.hx = u.x; u.hy = u.y; u.tg = null; u.tw = -1; u.path = null; u.np = 0; u.gx = null; u.gy = null; u.pace = null; }

// plekken in formatie rond (x, y), naar richting d; op een muurstuk: langs de muur
function formation(st, nv, list, c0, x, y, d0) {
  let dx = x - c0.x; let dy = y - c0.y; let dl = Math.sqrt(dx * dx + dy * dy);
  if (dl < 0.5) { dx = d0.x; dy = d0.y; dl = 1; }
  const d = { x: dx / dl, y: dy / dl }; const p = perp(d);
  const side = list[0].s;
  const tc = cellOf(st, x, y);
  // verdedigers op de muur: verdeel ze over de muur rond het aangeklikte stuk
  if (side === 1 && tc >= 0 && nv.p1[tc] === 3) {
    const cells = wallRun(st, nv, tc, Math.ceil(list.length / 2) + 2);
    const out = []; let n = 0;
    for (const u of [...list].sort((a, b) => a.id - b.id)) {
      if (!climbs(u.k)) { const b = behind(st, nv, { i: Math.floor(x), j: Math.floor(y) }); out.push({ u, x: b.x, y: b.y }); continue; }
      const c = cells[Math.floor(n / 2) % cells.length]; const { i, j } = cellXY(st, c);
      out.push({ u, x: i + (n % 2 ? 0.68 : 0.32), y: j + (n % 2 ? 0.64 : 0.36) }); n++;
    }
    return out;
  }
  const order = ['inf', 'cav', 'siege', 'rng'];
  const sorted = [...list].sort((a, b) => order.indexOf(role(a.k)) - order.indexOf(role(b.k))
    || ((a.x - c0.x) * p.x + (a.y - c0.y) * p.y) - ((b.x - c0.x) * p.x + (b.y - c0.y) * p.y) || a.id - b.id);
  const cols = Math.max(2, Math.ceil(Math.sqrt(sorted.length * 1.6)));
  return rows(sorted, x, y, d, cols, 0.72);
}

// aaneengesloten muurstukken rond tegel c (breedte eerst), voor schutters op de muur
function wallRun(st, nv, c, max) {
  const out = [c]; const seen = new Set([c]); const w = st.box.w;
  for (let k = 0; k < out.length && out.length < max; k++) {
    const a = out[k];
    for (const b of [a + 1, a - 1, a + w, a - w]) {
      if (b < 0 || b >= nv.N || seen.has(b) || nv.p1[b] !== 3) continue;
      if ((b === a + 1 || b === a - 1) && Math.floor(b / w) !== Math.floor(a / w)) continue;
      seen.add(b); out.push(b);
      if (out.length >= max) break;
    }
  }
  return out;
}

// een groep verplaatsen: één gezamenlijke route, elk naar zijn plek in de formatie
function moveGroup(st, nv, list, x, y) {
  const side = list[0].s;
  const c0 = { x: list.reduce((a, u) => a + u.x, 0) / list.length, y: list.reduce((a, u) => a + u.y, 0) / list.length };
  const slots = formation(st, nv, list, c0, x, y, side ? st.dir : { x: -st.dir.x, y: -st.dir.y });
  const lead = [...list].sort((a, b) => (SQ(a.x - c0.x) + SQ(a.y - c0.y)) - (SQ(b.x - c0.x) + SQ(b.y - c0.y)) || a.id - b.id)[0];
  const lp = findPath(st, nv, side, lead.k, lead.x, lead.y, x, y);
  // samen op pad: iedereen in het tempo van de traagste, zodat de formatie bij elkaar blijft
  const kinds = new Set(list.map((u) => u.k));
  const pace = kinds.size > 1 ? Math.min(...list.map((u) => speedOf(u.k))) : null;
  for (const { u, x: sx0, y: sy0 } of slots) {
    let sx = sx0; let sy = sy0;
    const sc = cellOf(st, sx, sy);
    if (!standable(nv, side, u.k, sc)) { const c = nearestStand(st, nv, side, u.k, sx, sy, null, 4); const q = cellXY(st, c); sx = q.i + 0.5; sy = q.j + 0.5; }
    u.st = 'move'; u.tg = null; u.tw = -1; u.gx = R3(sx); u.gy = R3(sy); u.stk = 0; u.blk = false; u.pace = pace;
    if (lp && lp.blk) {
      // het doel is niet bereikbaar (achter de muur): zo dicht mogelijk, daarna een bres slaan
      u.path = joinPath(st, nv, u, lp.pts); u.blk = true; u.np = u.path ? 0 : 1;
      continue;
    }
    if (clearLine(st, nv, side, u.k, u.x, u.y, sx, sy)) { u.path = [[u.gx, u.gy]]; u.np = 0; continue; }
    const jp = lp ? joinPath(st, nv, u, lp.pts.slice(0, -1)) : null;
    if (jp) { jp.push([u.gx, u.gy]); u.path = jp; u.np = 0; } else { u.path = null; u.np = 1; }
  }
}

// sluit aan op een gedeelde route: vanaf de verste tussenstop die je in een rechte lijn kan halen
function joinPath(st, nv, u, pts) {
  if (!pts.length) return [];
  for (let i = Math.min(pts.length - 1, 6); i >= 0; i--) {
    if (clearLine(st, nv, u.s, u.k, u.x, u.y, pts[i][0], pts[i][1])) return pts.slice(i).map((p) => [p[0], p[1]]);
  }
  return null;
}

// ---------- de slag zelf ----------
function reachOf(st, nv, u, e) {
  let r;
  if (u.k === 'tower') r = TOWER.range;
  else if (u.k === 'stonethrower') r = FB.siegeRange;
  else if (isRangedK(u.k)) r = FB.ranged + (onWall(st, nv, u) ? FB.wallRange : 0);
  else r = FB.melee;
  if (e && (e.k === 'tower' || e.wall)) r += 0.55; // groot doelwit
  return r;
}

function cover(st, nv, e) {
  const c = cellOf(st, e.x, e.y);
  if (c < 0) return 1;
  if (e.s === 1 && nv.p1[c] === 3) return FB.wallCover;
  return nv.p0[c] === 2 ? FB.forestCover : 1;
}

function counter(ka, kb) {
  const a = UNITS[ka]; const b = UNITS[kb];
  if (!a || !b || !a.def || b.type !== 'cav' || a.type === 'cav') return 1;
  return 1 + Math.max(0, (a.def.cav || 0) - 25) / 10;
}

function damage(st, nv, u, e) {
  const mult = u.s ? st.md : st.ma;
  const n = aliveN(u);
  if (e.wall) {
    const base = K(u.k).dmg || 2;
    const f = u.k === 'ram' ? 8 : u.k === 'stonethrower' ? 1.6 : isRangedK(u.k) ? 0.08 : 0.3;
    return base * f * n * mult;
  }
  if (u.k === 'tower') {
    const def = K(e.k).def ? K(e.k).def.rng : 10;
    return TOWER.dmg[u.L] * (FIELD.armorK / (FIELD.armorK + def)) * cover(st, nv, e);
  }
  if (e.k === 'tower') return (K(u.k).dmg || 2) * n * mult * (isSiege(u.k) ? 6 : isRangedK(u.k) ? 0.15 : 0.5);
  let d = hitDamage(u.k, e.k, mult) * counter(u.k, e.k) * n * FB.pace;
  if (isRangedK(u.k)) d *= cover(st, nv, e) * (onWall(st, nv, u) ? 1.15 : 1);
  return d;
}

// kan u vijand e aanvallen (melee: niet op de muur en bereikbaar; schutters: altijd)
function canHit(st, nv, u, e, uc) {
  if (e.hp <= 0 || e.s === u.s) return false;
  if (u.k === 'ram') return e.k === 'tower';
  if (u.k === 'tower') return mobile(e);
  if (isRangedK(u.k)) return true;
  // schutters op de muur: enkel bereikbaar voor wie al binnen is (via de trap)
  if (e.k !== 'tower' && onWall(st, nv, e) && !onWall(st, nv, u) && !(u.s === 0 && uc >= 0 && inside(nv, uc))) return false;
  const lab = u.s ? nv.lab1 : nv.lab0;
  const l = uc >= 0 ? lab[uc] : -1;
  if (l < 0) return false;
  const ec = cellOf(st, e.x, e.y);
  if (ec < 0) return false;
  if (lab[ec] === l) return true;
  // naast een poort, toren of muur: bereikbaar als een buurtegel bij jouw gebied hoort
  const w = st.box.w;
  for (const b of [ec + 1, ec - 1, ec + w, ec - w, ec + w + 1, ec + w - 1, ec - w + 1, ec - w - 1]) if (b >= 0 && b < nv.N && lab[b] === l) return true;
  return false;
}

function pickEnemy(st, nv, u, alive, maxD, from = u) {
  const uc = cellOf(st, u.x, u.y);
  // voetvolk van de verdediger dat binnen de muren op zijn plek staat, gaat niet naar buiten (enkel op bevel of bij een bres)
  const stayIn = u.s === 1 && u.st === 'hold' && st.enc && meleeK(u.k) && uc >= 0 && (inside(nv, uc) || nv.p1[uc] === 4);
  let best = null; let bd = Infinity;
  for (const e of alive) {
    if (e.s === u.s || e.hp <= 0) continue;
    if (stayIn) { const ec = cellOf(st, e.x, e.y); if (ec < 0 || !inside(nv, ec)) continue; }
    const d = Math.sqrt(SQ(e.x - from.x) + SQ(e.y - from.y));
    if (d > maxD) continue;
    const score = d + (e.k === 'tower' ? 2.5 : 0);
    if (score >= bd) continue;
    if (!canHit(st, nv, u, e, uc)) continue;
    bd = score; best = e;
  }
  return best;
}

// muur waar de aanvaller het best een bres slaat (bereikbaar vanaf zijn kant; rammen kiezen liefst een poort)
function breachWall(st, nv, u, toward) {
  const uc = cellOf(st, u.x, u.y);
  const l = uc >= 0 ? nv.lab0[uc] : -1;
  if (l < 0) return -1;
  const w = st.box.w;
  let best = -1; let bd = Infinity;
  st.walls.forEach((wl, k) => {
    if (wl.hp <= 0) return;
    const c = cellOf(st, wl.i + 0.5, wl.j + 0.5);
    if (![c + 1, c - 1, c + w, c - w].some((b) => b >= 0 && b < nv.N && nv.lab0[b] === l)) return;
    const d = Math.sqrt(SQ(wl.i + 0.5 - u.x) + SQ(wl.j + 0.5 - u.y)) + 0.5 * Math.sqrt(SQ(wl.i + 0.5 - toward.x) + SQ(wl.j + 0.5 - toward.y))
      - (wl.g && isSiege(u.k) ? 4 : 0) - (wl.hp < wl.hp0 ? 1.5 : 0);
    if (d < bd) { bd = d; best = k; }
  });
  return best;
}

// één stap lopen naar (tx, ty); glijdt langs obstakels. true = aangekomen
function walk(st, nv, u, tx, ty, stop) {
  const dx = tx - u.x; const dy = ty - u.y; const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= stop) return true;
  const c = cellOf(st, u.x, u.y);
  const p = u.s ? nv.p1 : nv.p0;
  const sp = (u.pace && u.st === 'move' ? Math.min(u.pace, speedOf(u.k)) : speedOf(u.k)) * (FB.tick / 1000) * (c >= 0 && p[c] === 2 ? FB.forestSlow : 1);
  const s = Math.min(d, sp);
  const nx = u.x + (dx / d) * s; const ny = u.y + (dy / d) * s;
  if (tryMove(st, nv, u, nx, ny) || tryMove(st, nv, u, nx, u.y) || tryMove(st, nv, u, u.x, ny)) return d - s <= stop;
  return false;
}

function tryMove(st, nv, u, nx, ny) {
  const a = cellOf(st, u.x, u.y); const b = cellOf(st, nx, ny);
  if (b < 0) return false;
  if (a !== b) {
    if (a < 0 || !canStep(nv, u.s, u.k, a, b)) return false;
    const w = st.box.w; const di = (b % w) - (a % w); const dj = Math.floor(b / w) - Math.floor(a / w);
    if (di && dj && (!canStep(nv, u.s, u.k, a, a + di) || !canStep(nv, u.s, u.k, a, a + dj * w))) return false;
  }
  u.x = R3(nx); u.y = R3(ny);
  return true;
}

// route volgen; true = aangekomen op het einde
function follow(st, nv, u) {
  if (!u.path || !u.path.length) return !u.np;
  const [wx, wy] = u.path[0];
  const last = u.path.length === 1;
  const bx = u.x; const by = u.y;
  if (walk(st, nv, u, wx, wy, last ? 0.08 : 0.3)) { u.path.shift(); u.stk = 0; return !u.path.length; }
  if (Math.abs(u.x - bx) + Math.abs(u.y - by) < 0.02) {
    u.stk = (u.stk || 0) + 1;
    if (u.stk === 12) { u.np = 1; u.pgx = u.path[u.path.length - 1][0]; u.pgy = u.path[u.path.length - 1][1]; }
    if (u.stk > 40) { u.path = null; return true; } // vastgelopen: hier blijven
  } else u.stk = 0;
  return false;
}

// naar een doel toe lopen tot op afstand 'stop' (rechtdoor als het kan, anders met een route)
// geeft 'blocked' terug als het doel onbereikbaar blijkt
function approach(st, nv, u, x, y, stop) {
  const d = Math.sqrt(SQ(x - u.x) + SQ(y - u.y));
  if (d <= stop) return 'there';
  const f = Math.max(0, (d - stop * 0.9) / d);
  const ax = u.x + (x - u.x) * f; const ay = u.y + (y - u.y) * f;
  if (clearLine(st, nv, u.s, u.k, u.x, u.y, ax, ay)) { u.path = null; walk(st, nv, u, ax, ay, 0.05); return 'walk'; }
  const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
  if (!u.np && (!end || SQ(end[0] - ax) + SQ(end[1] - ay) > 2.2) && (u.pt == null || st.n - u.pt > 8)) {
    u.np = 1; u.pgx = R3(ax); u.pgy = R3(ay); u.path = null;
  }
  if (u.path && u.path.length) { follow(st, nv, u); return 'walk'; }
  if (!u.np && u.blk && u.pt != null && st.n - u.pt <= 8) return 'blocked';
  return 'wait';
}

function hit(st, nv, u, e, bt) {
  const dmg = damage(st, nv, u, e);
  e.hp = R3(Math.max(0, e.hp - dmg));
  u.cd = u.k === 'tower' ? TOWER.rate : K(u.k).rate || 1500;
  u.at = bt; u.ax = R3(e.wall ? e.i + 0.5 : e.x); u.ay = R3(e.wall ? e.j + 0.5 : e.y);
  if (e.wall) { if (e.hp <= 0) breakWall(st, e, bt); return; }
  if (e.hp <= 0) { e.died = bt; return; }
  // wie geraakt wordt en op zijn plek staat, slaat terug
  if (mobile(e) && e.st === 'hold' && e.tg == null && meleeK(e.k) && meleeK(u.k)) e.tg = u.id;
}

function breakWall(st, w, bt) {
  w.hp = 0; w.died = bt;
  // een poort valt in zijn geheel (2 tegels breed)
  if (w.g) for (const o of st.walls) if (o.g && o.hp > 0 && Math.abs(o.i - w.i) + Math.abs(o.j - w.j) === 1) { o.hp = 0; o.died = bt; }
  st.nv++;
  const nv = nav(st);
  void nv;
  for (const u of st.units) {
    if (u.hp <= 0 || !mobile(u)) continue;
    // wie op dit muurstuk stond, valt naar beneden
    if (u.s === 1 && Math.floor(u.x) === w.i && Math.floor(u.y) === w.j) { u.hp = R3(u.hp * 0.7); u.st = 'hold'; u.hx = u.x; u.hy = u.y; }
    if (u.blk && u.gx != null) { u.st = 'move'; u.np = 1; u.pgx = u.gx; u.pgy = u.gy; u.tw = -1; u.blk = false; }
  }
}

function actUnit(st, nv, u, alive, byId, bt) {
  if (u.cd > 0) u.cd -= FB.tick;
  const uc = cellOf(st, u.x, u.y);
  if (u.k === 'tower') {
    let e = u.tg != null ? byId.get(u.tg) : null;
    if (!e || e.hp <= 0 || dist(u, e) > TOWER.range) e = pickEnemy(st, nv, u, alive, TOWER.range);
    u.tg = e ? e.id : null;
    if (e && u.cd <= 0) hit(st, nv, u, e, bt);
    return;
  }
  const ranged = isRangedK(u.k);
  if (u.st === 'move') {
    if (follow(st, nv, u)) {
      if (u.blk && u.s === 0 && st.walls.some((w) => w.hp > 0)) {
        const k = breachWall(st, nv, u, { x: u.gx ?? st.plaza.x, y: u.gy ?? st.plaza.y });
        if (k >= 0) { u.st = 'breach'; u.tw = k; u.path = null; return; }
      }
      const gx = u.gx; const gy = u.gy; const blk = u.blk;
      toHold(u);
      if (blk) { u.gx = gx; u.gy = gy; u.blk = true; }
    }
    return;
  }
  if (u.st === 'attack' || u.st === 'breach') {
    const w = u.tw >= 0 ? st.walls[u.tw] : null;
    if (w && w.hp > 0) { fightWall(st, nv, u, w, bt); return; }
    if (u.tw >= 0) {
      // de muur ligt plat: verder naar het doel (of de stad in)
      u.tw = -1;
      if (u.gx != null) { u.st = 'move'; u.np = 1; u.pgx = u.gx; u.pgy = u.gy; u.blk = false; } else if (u.st === 'breach') u.st = 'charge'; else toHold(u);
      return;
    }
    const e = u.tg != null ? byId.get(u.tg) : null;
    if (e && e.hp > 0) {
      const r = fightUnit(st, nv, u, e, Infinity, bt);
      if (r === 'blocked') {
        if (u.s === 0 && !ranged) { const k = breachWall(st, nv, u, e); if (k >= 0) { u.tw = k; u.st = 'breach'; u.gx = null; return; } }
        toHold(u);
      }
      return;
    }
    toHold(u);
    return;
  }
  if (u.st === 'charge') {
    let e = u.tg != null ? byId.get(u.tg) : null;
    if (!e || e.hp <= 0 || (st.n + u.id) % 8 === 0) {
      // niet voortdurend van doelwit wisselen: enkel als er een duidelijk dichtere vijand is
      const ne = pickEnemy(st, nv, u, alive, Infinity);
      if (!e || e.hp <= 0) e = ne;
      else if (ne && ne !== e && dist(u, ne) < dist(u, e) - 1.5) e = ne;
      else if (!canHit(st, nv, u, e, uc)) e = ne;
    }
    if (e && e.hp > 0) {
      u.tg = e.id;
      const r = fightUnit(st, nv, u, e, Infinity, bt);
      if (r === 'blocked') u.tg = null;
      return;
    }
    u.tg = null;
    if (u.s === 0) {
      // geen vijand binnen bereik: naar het plein, en als dat achter de muur ligt eerst een bres slaan
      const pc = cellOf(st, st.plaza.x, st.plaza.y);
      const l = uc >= 0 ? nv.lab0[uc] : -1;
      if (l >= 0 && nv.lab0[pc] === l) { if (u.k !== 'ram') approach(st, nv, u, st.plaza.x + ((u.id % 5) - 2) * 0.4, st.plaza.y + ((u.id % 3) - 1) * 0.4, 0.3); return; }
      if (u.k === 'ram' || !ranged) { const k = breachWall(st, nv, u, st.plaza); if (k >= 0) { u.tw = k; u.st = 'breach'; } }
    }
    return;
  }
  // op je plek: vijanden in de buurt aanvallen, niet te ver achterna
  const home = { x: u.hx, y: u.hy };
  let e = u.tg != null ? byId.get(u.tg) : null;
  if (e && (e.hp <= 0 || (!ranged && dist(home, e) > FB.leash) || (ranged && dist(u, e) > reachOf(st, nv, u, e) + 0.2))) e = null;
  if (!e && (st.n + u.id) % 4 === 0) e = ranged ? pickEnemy(st, nv, u, alive, reachOf(st, nv, u, null) + 0.2) : pickEnemy(st, nv, u, alive, FB.aggro, home);
  u.tg = e ? e.id : null;
  if (e) {
    if (ranged) { if (dist(u, e) <= reachOf(st, nv, u, e) && u.cd <= 0) hit(st, nv, u, e, bt); return; }
    const r = fightUnit(st, nv, u, e, FB.leash, bt);
    if (r === 'blocked') u.tg = null;
    return;
  }
  if (u.back || SQ(u.x - home.x) + SQ(u.y - home.y) > 0.36) { u.back = approach(st, nv, u, home.x, home.y, 0.12) !== 'there'; }
}

function fightUnit(st, nv, u, e, leash, bt) {
  const up = u.s === 0 && meleeK(u.k) && e.k !== 'tower' && onWall(st, nv, e); // de trap op, naar de schutters op de muur
  const r = reachOf(st, nv, u, e) + (up ? 0.65 : 0);
  if (dist(u, e) <= r) { u.path = null; if (u.cd <= 0) hit(st, nv, u, e, bt); return 'hit'; }
  if (leash !== Infinity && SQ(e.x - u.hx) + SQ(e.y - u.hy) > leash * leash) return 'blocked';
  if (up) {
    const f = wallFoot(st, nv, u, e);
    if (!f) return 'blocked';
    return approach(st, nv, u, f.x, f.y, 0.05) === 'blocked' ? 'blocked' : 'walk';
  }
  return approach(st, nv, u, e.x, e.y, r * 0.92);
}

// de plek binnen de muur, aan de voet van het muurstuk waar vijand e staat (dichtst bij u)
function wallFoot(st, nv, u, e) {
  const ec = cellOf(st, e.x, e.y); const w = st.box.w;
  const ei = Math.floor(e.x) + 0.5; const ej = Math.floor(e.y) + 0.5;
  let best = null; let bd = Infinity;
  for (const b of [ec + 1, ec - 1, ec + w, ec - w, ec + w + 1, ec + w - 1, ec - w + 1, ec - w - 1]) {
    if (b < 0 || b >= nv.N || !nv.p0[b] || !inside(nv, b)) continue;
    const { i, j } = cellXY(st, b);
    const x = i + 0.5 + (ei - i - 0.5) * 0.35; const y = j + 0.5 + (ej - j - 0.5) * 0.35;
    const d = SQ(x - u.x) + SQ(y - u.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

function fightWall(st, nv, u, w, bt) {
  const wx = w.i + 0.5; const wy = w.j + 0.5;
  const r = reachOf(st, nv, u, { wall: true });
  if (SQ(u.x - wx) + SQ(u.y - wy) <= r * r) { u.path = null; if (u.cd <= 0) hit(st, nv, u, w, bt); return; }
  approach(st, nv, u, wx, wy, r * 0.9);
}

// routes uitrekenen voor wie erop wacht (een paar per tik, om de beurt)
function planPaths(st, nv) {
  const need = st.units.filter((u) => u.np && u.hp > 0);
  if (!need.length) return;
  const start = st.n % need.length;
  for (let k = 0; k < Math.min(FB.paths, need.length); k++) {
    const u = need[(start + k) % need.length];
    u.np = 0; u.pt = st.n;
    const gx = u.pgx ?? u.gx; const gy = u.pgy ?? u.gy;
    if (gx == null) continue;
    const r = findPath(st, nv, u.s, u.k, u.x, u.y, gx, gy);
    u.path = r ? r.pts : null; u.blk = !!(r && r.blk);
    u.pgx = null; u.pgy = null;
  }
}

// ---------- de computer als bevelhebber ----------
function aiDefend(st, nv, alive) {
  const att = alive.filter((u) => u.s === 0);
  if (!att.length) return;
  const defs = alive.filter((u) => u.s === 1 && mobile(u));
  const pc = cellOf(st, st.plaza.x, st.plaza.y);
  // de vijand kan tot op het plein (open stad of bres) en komt dichtbij: iedereen in de aanval
  const P = st.plaza; const R = st.kind === 'camp' ? 7 : 8;
  const breach = att.some((a) => { const c = cellOf(st, a.x, a.y); return c >= 0 && nv.lab0[c] >= 0 && nv.lab0[c] === nv.lab0[pc]; })
    && att.some((a) => SQ(a.x - P.x) + SQ(a.y - P.y) <= R * R || (st.enc && inside(nv, cellOf(st, a.x, a.y))));
  const cx = att.reduce((a, u) => a + u.x, 0) / att.length; const cy = att.reduce((a, u) => a + u.y, 0) / att.length;
  // welk muurstuk wordt het hardst aangevallen?
  const hits = new Map();
  for (const a of att) if (a.tw >= 0 && st.walls[a.tw] && st.walls[a.tw].hp > 0) hits.set(a.tw, (hits.get(a.tw) || 0) + (a.k === 'ram' ? 3 : 1));
  let focus = -1; let fv = 0;
  for (const [k, v] of hits) if (v > fv || (v === fv && k < focus)) { fv = v; focus = k; }
  const near = (u, r) => att.some((a) => SQ(a.x - u.x) + SQ(a.y - u.y) <= r * r);
  const moveSet = [];
  for (const u of defs) {
    if (u.st === 'move' || onWall(st, nv, u)) continue;
    const ranged = isRangedK(u.k);
    if (breach && !ranged) { if (u.st !== 'charge') { u.st = 'charge'; u.tg = null; } continue; }
    if (breach && ranged && u.st === 'hold' && !near(u, reachOf(st, nv, u, null))) { u.st = 'charge'; u.tg = null; continue; }
    if (!breach && !ranged && focus >= 0 && focus !== st.aiF) moveSet.push(u);
  }
  if (moveSet.length && focus >= 0) {
    const b = behind(st, nv, st.walls[focus]);
    moveGroup(st, nv, moveSet, b.x, b.y);
  }
  if (focus >= 0) st.aiF = focus;
  // schutters zonder doelwit gaan naar de muur waar de vijand is
  if (st.enc && (st.n / FB.ai) % 3 === 0) {
    const idle = defs.filter((u) => isRangedK(u.k) && climbs(u.k) && u.st === 'hold' && !near(u, reachOf(st, nv, u, null) + 0.5)).slice(0, 4);
    if (idle.length) {
      const free = st.walls.filter((w) => w.hp > 0 && !w.g)
        .map((w) => ({ w, d: SQ(w.i + 0.5 - cx) + SQ(w.j + 0.5 - cy) }))
        .filter(({ w }) => !defs.some((u) => Math.floor(u.x) === w.i && Math.floor(u.y) === w.j))
        .sort((a, b) => a.d - b.d);
      if (free.length && free[0].d < SQ(FB.ranged + FB.wallRange + 2)) moveGroup(st, nv, idle, free[0].w.i + 0.5, free[0].w.j + 0.5);
    }
  }
}

function aiAttack(st, nv, alive) {
  const att = alive.filter((u) => u.s === 0);
  if (!att.length) return;
  const pc = cellOf(st, st.plaza.x, st.plaza.y);
  const open = !st.walls.some((w) => w.hp > 0) || att.some((a) => { const c = cellOf(st, a.x, a.y); return c >= 0 && nv.lab0[c] >= 0 && nv.lab0[c] === nv.lab0[pc]; });
  if (open) {
    for (const u of att) if (u.st !== 'charge' && u.st !== 'move') { u.st = 'charge'; u.tg = null; u.tw = -1; }
    return;
  }
  // muren dicht: rammen op de poort, voetvolk erachter (of zelf op de muur beuken), schutters schieten
  const rams = att.filter((u) => isSiege(u.k));
  for (const u of att) {
    if (u.st === 'move' || u.st === 'breach' || (u.st === 'attack' && u.tw >= 0)) continue;
    const r = role(u.k);
    if (r === 'siege') { const k = breachWall(st, nv, u, st.plaza); if (k >= 0) { u.st = 'breach'; u.tw = k; u.tg = null; } continue; }
    if (r === 'rng') { if (u.st !== 'charge') { u.st = 'charge'; u.tg = null; } continue; }
    if (r === 'cav' && rams.length) continue; // ruiters wachten op een bres
    if (rams.length) {
      const ram = rams[0];
      if (ram.tw >= 0 && u.st === 'hold' && !u.esc) {
        const w = st.walls[ram.tw];
        const tx = w.i + 0.5 + st.dir.x * 2.4; const ty = w.j + 0.5 + st.dir.y * 2.4;
        u.esc = 1; moveGroup(st, nv, [u], tx + ((u.id % 5) - 2) * 0.5 * -st.dir.y, ty + ((u.id % 5) - 2) * 0.5 * st.dir.x);
      }
      continue;
    }
    const k = breachWall(st, nv, u, st.plaza);
    if (k >= 0) { u.st = 'breach'; u.tw = k; u.tg = null; }
  }
}

// ---------- een tik ----------
function step(st) {
  const bt = st.n * FB.tick;
  // bevelen die voor deze tik klaarstaan
  while (st.q.length && st.q[0].n <= st.n) {
    const q = st.q.shift();
    giveOrder(st, q.s, q.ids, q.o);
  }
  if (st.over != null) return;
  if (st.phase === 'deploy') {
    st.n++; st.t = st.t0 + st.n * FB.tick;
    if ((st.ready[0] && st.ready[1]) || st.n * FB.tick >= FB.deployMs) { st.phase = 'battle'; st.ph1 = st.n; for (const u of st.units) if (mobile(u)) { u.hx = u.x; u.hy = u.y; } }
    return;
  }
  let nv = nav(st);
  const alive = st.units.filter((u) => u.hp > 0);
  const byId = new Map(alive.map((u) => [u.id, u]));
  if (st.ai[1] && (st.n - st.ph1) % FB.ai === 0) aiDefend(st, nv, alive);
  if (st.ai[0] && (st.n - st.ph1) % FB.ai === 5) aiAttack(st, nv, alive);
  planPaths(st, nv);
  for (const u of alive) {
    if (u.hp <= 0) continue;
    actUnit(st, nv, u, alive, byId, bt);
    if (st.nv !== nv.nv) nv = nav(st);
  }
  separate(st, nv, alive);
  st.n++;
  st.t = st.t0 + st.n * FB.tick;
  judge(st, nv);
}

// een beetje uit elkaar gaan zodat ze niet op één hoop staan
function separate(st, nv, alive) {
  const mob = alive.filter((u) => u.hp > 0 && mobile(u)).sort((a, b) => a.x - b.x || a.id - b.id);
  for (let i = 0; i < mob.length; i++) {
    const a = mob[i];
    for (let j = i + 1; j < mob.length; j++) {
      const b = mob[j];
      const dx = b.x - a.x;
      if (dx > 0.42) break;
      const dy = b.y - a.y; const d2 = dx * dx + dy * dy;
      if (d2 > 0.1764 || d2 === 0) continue;
      const d = Math.sqrt(d2); const push = (0.42 - d) * 0.16;
      const ox = (dx / d) * push; const oy = (dy / d) * push;
      // wie aan het vechten is, laat zich nauwelijks wegduwen (rustiger linies)
      const fa = a.at >= 0 && st.n * FB.tick - a.at < 1600 ? 0.3 : 1; const fb = b.at >= 0 && st.n * FB.tick - b.at < 1600 ? 0.3 : 1;
      shove(st, nv, a, -ox * fa, -oy * fa); shove(st, nv, b, ox * fb, oy * fb);
    }
  }
}

function shove(st, nv, u, ox, oy) {
  const a = cellOf(st, u.x, u.y); const b = cellOf(st, u.x + ox, u.y + oy);
  if (b < 0) return;
  if (a !== b) {
    if (a < 0 || !canStep(nv, u.s, u.k, a, b)) return;
    if (u.s === 1 && nv.p1[a] === 3 && nv.p1[b] !== 3) return; // niet van de muur duwen
  }
  u.x = R3(u.x + ox); u.y = R3(u.y + oy);
}

// wie wint? plein veroverd, alle verdedigers weg, of de aanvaller is verslagen / de tijd is om
function judge(st, nv) {
  let att = 0; let def = 0; let towers = 0; let attNear = 0; let defNear = 0;
  const P = st.plaza;
  for (const u of st.units) {
    if (u.hp <= 0) continue;
    if (u.s === 0) { att++; if (SQ(u.x - P.x) + SQ(u.y - P.y) <= SQ(FB.capR)) attNear++; }
    else if (mobile(u)) { def++; if (SQ(u.x - P.x) + SQ(u.y - P.y) <= SQ(FB.capR + 1.5)) defNear++; } else towers++;
  }
  void nv;
  if (attNear && !defNear) st.cap += FB.tick; else st.cap = Math.max(0, st.cap - FB.tick);
  if (!att) st.over = 1;
  else if (!def && (!towers || attNear)) st.over = 0;
  else if (st.cap >= FB.capMs) st.over = 0;
  else if ((st.n - st.ph1) * FB.tick >= FB.maxMs) st.over = 1;
}

// speel de slag af tot tijdstip t (hooguit maxTicks tikken); geeft het aantal gespeelde tikken terug
export function stepTo(st, t, maxTicks = Infinity) {
  let k = 0;
  while (st.over == null && st.t + FB.tick <= t && k < maxTicks) { step(st); k++; }
  return k;
}

// Overlevenden per kant (en per groep bij de verdediger). Gewonden tellen naar hun levens mee.
export function battleOutcome(st) {
  const attLeft = {}; const defLeft = {};
  const towersLost = []; let wallsBroken = 0;
  const pools = new Map();
  for (const w of st.walls || []) if (w.hp <= 0) wallsBroken++;
  for (const u of st.units) {
    if (u.k === 'tower') { if (u.hp <= 0) towersLost.push(u.b); continue; }
    const key = `${u.s}|${u.s ? u.g : ''}|${u.k}`;
    const p = pools.get(key) || { s: u.s, g: u.g, k: u.k, hp: 0, hp0: u.hp0, up: 0 };
    p.hp += Math.max(0, u.hp);
    p.up += aliveN(u);
    pools.set(key, p);
  }
  for (const p of pools.values()) {
    const n = p.up ? Math.min(p.up, Math.max(1, Math.round(p.hp / p.hp0))) : 0;
    if (p.s === 0) attLeft[p.k] = (attLeft[p.k] || 0) + n;
    else { const g = defLeft[p.g] || (defLeft[p.g] = {}); g[p.k] = (g[p.k] || 0) + n; }
  }
  return { attWins: st.over === 0, attLeft, defLeft, towersLost, wallsBroken, retreat: !!st.retreat };
}

export const battleTime = (st) => (st.ph1 == null ? 0 : (st.n - st.ph1) * FB.tick);
export const deployLeft = (st) => Math.max(0, FB.deployMs - st.n * FB.tick);
export { inside as cellInside, standable, onWall };
