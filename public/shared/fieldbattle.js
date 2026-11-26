// Belegering die je zelf bestuurt. De slag speelt zich af in de echte stad van de verdediger: zijn gebouwen,
// bos en water, zijn muren, poorten en wachttorens (of rond een roverskamp op de wereldkaart).
//   1. Opstelling: de aanvaller staat aan de kant waar hij vandaan komt, de verdediger binnen zijn stad.
//      Beide kanten zetten hun troepen waar ze willen en drukken op 'Start' (of de tijd is om).
//   2. Slag: troepen lopen rond gebouwen, door poorten (enkel de verdediger) en over de muren (schutters en
//      voetvolk van de verdediger). De aanvaller slaat een bres met rammen of zijn voetvolk. Wie het plein voor
//      het stadscentrum lang genoeg houdt, of alle verdedigers verslaat, wint.
// Wie niet zelf bestuurt, wordt door de computer geleid: de verdediger zet zijn schutters op de muur aan de kant
// van de aanval en zijn voetvolk achter de bedreigde poort; de aanvaller ramt de dichtstbijzijnde poort.
// Troepen vechten in regimenten (zoals in Rome: Total War): een eenheid loopt als één blok in een formatie
// (linie, blok, wig, los of kring) achter haar vaandel aan, houdt haar richting aan en vecht samen. Flanken,
// stormlopen en de formatie veranderen de schade.
// Vaste tikken van 100 ms en volledig deterministisch (geen Math.random, Math.hypot of goniometrie), zodat de
// server (gezaghebbend) en de browser (vloeiend, rekent zelf verder) exact hetzelfde verloop zien.
import { UNITS, FIELD, TOWER, TC_POS, TECH_IDS, REPLAY } from './rules.js';
import { hitDamage } from './skirmish.js';
import { territory, tileIndex, tileOf, ringOf, ringForAge, T_MIN, T_MAX, TILE } from './territory.js';
import { occupied, isBuildable, clearedSet, insideSet, bLevel, age as townAge } from './sim.js';

export const FB = {
  v: 3, // versie van de toestand (oudere slagen worden automatisch afgerond)
  tick: 100,
  chooseMs: 45000, // zo lang heb je om te kiezen: zelf besturen of automatisch
  deployMs: 75000, // opstelling: hooguit zo lang, of tot beide kanten klaar zijn
  maxMs: 10 * 60000, // na 10 minuten slag trekt de aanvaller zich terug
  staleMs: 30000, // niemand kijkt nog mee: de server rekent de rest automatisch uit
  maxTicksPerCall: 30, // hooguit 3 s slag per verzoek (CPU-limiet van de server; een gewone peiling heeft er ±6 nodig)
  delay: 700, // de server rekent zo ver achter op de klok: bevelen komen zo op tijd aan
  lead: 2, // een bevel gaat zoveel tikken na de tik in (de tegenstander hoort het zo meestal vóór het gebeurt)
  pollMs: 600, // zo vaak vraagt de browser tijdens een slag de stand op
  maxPerSide: 64, // grote legers: één figuur staat dan voor meerdere soldaten
  squad: 12, // hooguit zoveel figuren per regiment (kaartje onderaan)
  margin: 11, // zoveel tegels rond de stad horen bij het slagveld
  zone: 9, // hooguit zo diep is de opstelplaats van de aanvaller (en minstens 4 tegels van de stad)
  melee: 0.85, ranged: 4.4, siegeRange: 5.6, wallRange: 1.6,
  aggro: 4, // de computer: zo dicht bij een vijand begint hij te vechten
  hold: 1.5, leash: 2.6, // wie op zijn plek staat, slaat vijanden binnen 'hold' en loopt hooguit 'leash' van zijn plek
  contact: 1.7, // zo dicht bij het doelwit begint een regiment echt te vechten (elk zoekt dan een tegenstander)
  catchUp: 1.3, // wie achterop raakt in de formatie, loopt zoveel sneller
  rout: 30, rally: 50, rallyMs: 8000, // moed: eronder slaat een regiment op de vlucht; na 8 s rust (en genoeg moed) hergroepeert het
  pace: 0.35, // gevechten trager dan de ruwe schade: een slag duurt minuten, geen seconden
  capR: 2.4, capMs: 30000, // het plein: zo lang houden zonder verdedigers in de buurt = gewonnen
  forestSlow: 0.6, forestCover: 0.7, wallCover: 0.5,
  paths: 6, // hooguit zoveel routes per tik uitrekenen
  ai: 10, // de computer denkt om de zoveel tikken na
};

// Replay van een automatisch uitgerekende slag: de uitslag ligt al vast (resolveBattle in battle.js). Met setFate()
// speelt de computer de slag voor beide kanten na en stuurt ze bij zodat ze daar uitkomt: per soort (en groep) sneuvelen
// er hooguit zoveel als in het rapport, enkel de echte winnaar kan winnen, de winnaar vlucht nooit en de verliezer pas
// laat, en de schade wordt bijgestuurd (verliezen van de winnaar in hetzelfde tempo, de winnaar steeds sterker na 'ramp').
export const FATE = {
  ramp: 45000, rampK: 15000, maxM: 12, // na 45 s slag doet de winnaar elke 15 s één keer zijn schade extra (hooguit 12x)
  mayRout: 90000, routAll: 150000, // de verliezer mag op de vlucht slaan na 90 s (of als hij al 75% kwijt is); na 150 s vlucht alles
  end: 210000, // vangnet: dan is de slag sowieso voorbij
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
// onderzoek van de Academie: st.tk = [aanvaller, verdediger], elk { id: 1 }
const TK = (st, s, id) => !!(st.tk && st.tk[s] && st.tk[s][id]);
const pickTech = (t) => { const o = {}; for (const id of TECH_IDS) if (t && t[id]) o[id] = 1; return o; };
// moedverlies van een regiment (krijgsdrill: voetvolk verliest een kwart minder)
const moLoss = (st, r, v) => (role(r.k) === 'inf' && TK(st, r.s, 'drill') ? v * 0.75 : v);
export const aliveN = (u) => Math.max(0, Math.min(u.n || 1, Math.ceil(u.hp / u.hp0 - 1e-9)));
export const wallHp = (L) => 160 + 90 * Math.max(1, L);

const ORDER = ['ram', 'elephant', 'samurai', 'hoplite', 'lionguard', 'immortal', 'sword', 'spear', 'villager', 'barbarian',
  'knight', 'chariot', 'camel', 'rider', 'scout', 'yabusame', 'peltast', 'archer', 'stonethrower'];
const rank = (k) => { const i = ORDER.indexOf(k); return i < 0 ? 10 : i; };
export const role = (k) => (k === 'ram' || k === 'stonethrower' ? 'siege' : isRangedK(k) ? 'rng' : isCav(k) ? 'cav' : 'inf');

// ---------- formaties ----------
// gap = tussenruimte (tegels); de effecten: dealt = schade die ze doen, taken = schade die ze krijgen in een
// gevecht van man tegen man, missile = schade van pijlen, stenen en torens, cav = schade van ruiters,
// speed = looptempo, charge = extra bij een stormloop, noFlank = niet te flankeren
export const FORMS = {
  line: { name: 'Linie', gap: 0.74, desc: 'Breed en ondiep: veel soldaten tegelijk in het gevecht.', fx: {} },
  block: { name: 'Blok', gap: 0.62, desc: 'Dicht opeen: minder schade in een gevecht en moeilijk te flankeren, iets trager.', fx: { taken: 0.8, flank: 0.5, speed: 0.9 } },
  wedge: { name: 'Wig', gap: 0.72, desc: 'Puntig: harde stormloop (vooral ruiters), maar zwakker in de verdediging.', fx: { dealt: 1.15, charge: 0.6, taken: 1.15 } },
  loose: { name: 'Los', gap: 1.25, desc: 'Verspreid: veel minder last van pijlen, stenen en torens, zwakker van man tegen man.', fx: { missile: 0.5, taken: 1.2 } },
  ring: { name: 'Kring', gap: 0.7, desc: 'Naar alle kanten gericht: niet te flankeren en sterk tegen ruiters, maar traag.', fx: { flank: 0, cav: 0.6, speed: 0.6 } },
};
export const FORM_IDS = Object.keys(FORMS);
// welke formaties een soort kan aannemen (belegeringstuig heeft er geen)
export function formsFor(k) {
  const r = role(k);
  if (r === 'inf') return ['line', 'block', 'wedge', 'loose', 'ring'];
  if (r === 'rng') return ['line', 'loose', 'block'];
  if (r === 'cav') return ['line', 'wedge', 'loose'];
  return [];
}
const fxOf = (r) => (r && FORMS[r.f] ? FORMS[r.f].fx : {});

// plaatsen in een formatie voor m figuren: a = naar voren, b = naar rechts (tegels, rond het midden).
// Enkel optellen en vermenigvuldigen (geen goniometrie): overal exact dezelfde uitkomst.
const SLOTS = new Map();
export function slotOffsets(f, m, wid = null) {
  const key = `${f}|${m}|${wid || 0}`;
  let out = SLOTS.get(key);
  if (out) return out;
  out = [];
  const g = (FORMS[f] || FORMS.line).gap;
  if (f === 'wedge') {
    // rijen van 1, 2, 3, ... met de punt vooraan
    const rowsN = []; let left = m;
    for (let r = 1; left > 0; r++) { const k = Math.min(r, left); rowsN.push(k); left -= k; }
    const R = rowsN.length;
    rowsN.forEach((k, r) => { for (let j = 0; j < k; j++) out.push({ a: R3(((R - 1) / 2 - r) * g * 0.8), b: R3((j - (k - 1) / 2) * g) }); });
  } else if (f === 'ring') {
    // een holle vierkant, gelijk verdeeld over de rand
    const L = Math.max(2, Math.ceil(m / 4) + 1); const h = (L - 1) / 2; const P = 4 * (L - 1);
    const pts = [];
    for (let t = 0; t < L - 1; t++) pts.push([h, -h + t]);
    for (let t = 0; t < L - 1; t++) pts.push([h - t, h]);
    for (let t = 0; t < L - 1; t++) pts.push([-h, h - t]);
    for (let t = 0; t < L - 1; t++) pts.push([-h + t, -h]);
    for (let i = 0; i < m; i++) { const p = pts[Math.floor((i * P) / m)]; out.push({ a: R3(p[0] * g), b: R3(p[1] * g) }); }
  } else {
    let R;
    if (wid) R = Math.ceil(m / Math.max(1, Math.min(m, wid)));
    else if (f === 'block') R = Math.max(1, Math.ceil(Math.sqrt(m)));
    else if (f === 'loose') R = m <= 8 ? 1 : 2;
    else R = m <= 5 ? 1 : m <= 16 ? 2 : 3;
    const files = Math.ceil(m / R);
    for (let i = 0; i < m; i++) {
      const r = Math.floor(i / files); const inRow = Math.min(files, m - r * files);
      out.push({ a: R3(((R - 1) / 2 - r) * g), b: R3(((i % files) - (inRow - 1) / 2) * g) });
    }
  }
  SLOTS.set(key, out);
  return out;
}
// breedte en diepte van een formatie (tegels)
export function formDims(f, m, wid = null) {
  const o = slotOffsets(f, Math.max(1, m), wid); const g = (FORMS[f] || FORMS.line).gap;
  let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
  for (const p of o) { a0 = Math.min(a0, p.a); a1 = Math.max(a1, p.a); b0 = Math.min(b0, p.b); b1 = Math.max(b1, p.b); }
  return { w: b1 - b0 + g, d: a1 - a0 + g };
}
const defaultForm = () => 'line';

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

// ---------- replay: de vaste uitslag van een automatisch uitgerekende slag (zie FATE) ----------
const poolKey = (u) => `${u.s}|${u.s ? u.g : ''}|${u.k}`; // zoals battleOutcome telt

// fate: { win: 0 (aanvaller wint) | 1, left: { poolKey: overlevenden } }
export function setFate(st, fate) {
  const hp = {}; const h0 = {};
  for (const u of st.units) {
    if (u.k === 'tower') continue;
    const k = poolKey(u);
    hp[k] = R3((hp[k] || 0) + u.hp); h0[k] = u.hp0;
  }
  const floor = {};
  for (const k of Object.keys(hp)) floor[k] = R3(Math.min(hp[k], Math.max(0, Number(fate.left && fate.left[k]) || 0) * h0[k]));
  const r = {};
  for (const k of Object.keys(hp)) r[k] = 1;
  st.fate = { win: fate.win ? 1 : 0, floor, hp, hp0: { ...hp }, m: [1, 1], r };
  return st;
}

// hoeveel schade e mag krijgen zonder onder de vaste overlevenden te zakken (en het bijhouden)
function fateCap(st, e, d) {
  const f = st.fate; const k = poolKey(e);
  if (f.hp[k] == null) return d;
  const take = Math.max(0, Math.min(d, f.hp[k] - f.floor[k], e.hp));
  f.hp[k] = R3(f.hp[k] - take);
  return take;
}

// schade van kant s aan doelwit e in een replay
function fateDmg(st, s, e, d) {
  const f = st.fate;
  const win = s === f.win;
  if (e.wall) return win ? d * f.m[s] : d;
  if (e.k === 'tower') return win ? d * f.m[s] : 0; // de verliezer sloopt geen torens (die bleven echt staan)
  return fateCap(st, e, d * f.m[s] * (f.r[poolKey(e)] || 1));
}

const fateProg = (f, s, only = null) => {
  let a = 0; let b = 0;
  for (const k of only ? [only] : Object.keys(f.hp)) if (k.charCodeAt(0) === 48 + s) { a += f.hp0[k] - f.hp[k]; b += f.hp0[k] - f.floor[k]; }
  return b > 0.5 ? Math.min(1, a / b) : 1;
};

// elke tik: pools opnieuw tellen, schade bijsturen, de verliezer laten vluchten als het moet
function fateTick(st, M) {
  const f = st.fate;
  for (const k of Object.keys(f.hp)) f.hp[k] = 0;
  for (const u of st.units) if (u.hp > 0 && u.k !== 'tower') { const k = poolKey(u); if (f.hp[k] != null) f.hp[k] += u.hp; }
  for (const k of Object.keys(f.hp)) f.hp[k] = R3(f.hp[k]);
  const bt = (st.n - st.ph1) * FB.tick;
  const W = f.win; const L = 1 - W;
  // wie van de verliezer vlucht, wordt (na 2 s) achtervolgd en neergehaald, tot zijn verliezen kloppen met het rapport
  for (const u of st.units) {
    if (u.s !== L || u.hp <= 0 || !u.sq) continue;
    const r = st.regs[u.sq - 1];
    if (!r || r.st !== 'rout') continue;
    if (r.fr == null) r.fr = st.n;
    if (st.n - r.fr < 20) continue;
    const d = fateCap(st, u, u.hp0 * (u.n || 1) * (0.012 + (u.id % 5) * 0.004));
    if (d > 0) { u.hp = R3(Math.max(0, u.hp - d)); if (u.hp <= 0) u.died = st.n * FB.tick; }
  }
  if ((st.n - st.ph1) % 10 !== 0) return;
  f.m[W] = R3(Math.min(FATE.maxM, 1 + Math.max(0, bt - FATE.ramp) / FATE.rampK));
  // de winnaar verliest zijn soldaten in hetzelfde tempo als de verliezer (een beetje vroeger)
  const pl = fateProg(f, L); const pw = fateProg(f, W);
  const want = Math.min(1, pl * 1.15);
  if (pw < want - 0.06) f.m[L] = R3(Math.min(10, f.m[L] * 1.3));
  else if (pw > want + 0.06) f.m[L] = R3(Math.max(0.2, f.m[L] * 0.8));
  // en per soort: wie achterloopt op zijn verliezen, krijgt meer schade (schutters achteraan, ruiters, ...)
  for (const k of Object.keys(f.r)) {
    if (k.charCodeAt(0) !== 48 + W) continue;
    const p = fateProg(f, W, k);
    if (p < want - 0.06) f.r[k] = R3(Math.min(8, f.r[k] * 1.25));
    else if (p > want + 0.06) f.r[k] = R3(Math.max(0.25, f.r[k] * 0.8));
  }
  // de verliezer slaat op de vlucht: een soort die alles verloor wat ze mocht verliezen, of iedereen na 'routAll'
  for (const r of st.regs) {
    if (r.s !== L || r.st === 'rout' || role(r.k) === 'siege') continue;
    const list = M.get(r.id);
    if (!list || !list.length) continue;
    const k = poolKey(list[0]);
    const atFloor = f.floor[k] > 0 && f.hp[k] - f.floor[k] < 0.5;
    if (atFloor || bt >= FATE.routAll) regRout(st, r, list, M);
  }
}

// De slag van een replay opbouwen uit het recept (saveReplay in game.js, raidReplay hieronder): dezelfde stad,
// legers en richting, de computer aan beide kanten, en de vaste uitslag.
export function replayBattle(rec) {
  const v = rec.view || {};
  const camp = rec.kind === 'camp';
  const town = camp ? null : {
    buildings: (v.buildings || []).map((b) => ({ ...b })), walls: [...(v.walls || [])], gates: [...(v.gates || [])], civ: v.civ || null,
    terr: { seed: v.seed, cl: v.cl || [], lots: v.lots || [] }, tech: rec.techD || null,
  };
  const st = createBattle({
    kind: camp ? 'camp' : 'town', att: rec.att, defGroups: rec.defGroups, town, townId: v.seed, campSeed: rec.campSeed,
    dir: rec.dir, aiAtt: true, aiDef: true, now: 0, techA: rec.techA, techD: rec.techD, smithyA: rec.smithyA, smithyD: rec.smithyD,
  });
  setFate(st, rec.fate);
  st.meta = {
    replay: true, attInit: rec.att, defInit: Object.fromEntries(rec.defGroups.map((g) => [g.key, g.units])), style: rec.style || null,
    level: rec.level || 0, view: v, att: rec.side.att, def: rec.side.def,
  };
  return st;
}

const replayLook = (s) => ({
  seed: s.terr.seed, civ: s.civ || null, buildings: s.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level })),
  walls: s.walls || [], gates: s.gates || [], cl: s.terr.cl || [], lots: s.terr.lots || [],
});

// replay van een overval van de barbaren die automatisch verliep (het recept e.rp staat in het logboek van je stad,
// raidAuto in sim.js); de stad zoals ze nu is. me = { town, name, color }
export function raidReplay(s, e, me) {
  const rp = e.rp;
  const camp = territory(s.terr.seed).camp;
  const left = rp.fate.left || {};
  const defLost = {};
  for (const [k, n] of Object.entries(rp.home || {})) if (n > 0) defLost[k] = Math.max(0, n - (left[`1|home|${k}`] || 0));
  const tc = s.buildings.find((b) => b.type === 'tc');
  return {
    kind: 'raid', title: me.town, role: 'def', at: e.t, until: e.t + REPLAY.ms,
    att: { barbarian: rp.n }, defGroups: [{ key: 'home', units: rp.home || {} }], smithyD: rp.smithy || 0, techD: s.tech || null,
    dir: camp ? { x: camp.x - (TC_POS.x + 1), y: camp.y - (TC_POS.y + 1) } : { x: -1, y: 0 },
    view: replayLook(s), style: { civ: s.civ, age: tc ? tc.level : 1 },
    side: { att: { name: 'Barbaren', color: '#6b4a2b' }, def: { name: me.name, color: me.color || '#2e6fb5' } },
    fate: rp.fate, res: { attWins: rp.fate.win === 0, attLost: { barbarian: Math.max(0, rp.n - (left['0||barbarian'] || 0)) }, defLost, loot: rp.loot || {} },
  };
}

const fateMayRout = (st, r) => r.s !== st.fate.win && ((st.n - st.ph1) * FB.tick >= FATE.mayRout || fateProg(st.fate, r.s) >= 0.75);

// ---------- een nieuw slagveld ----------
// o: { kind: 'town'|'camp', att, defGroups: [{key, units}], town (staat van de stad), townId, campSeed, level,
//      dir: {x, y} (vanuit het doel naar waar de aanvaller vandaan komt), smithyA, smithyD, aiAtt, aiDef, now }
export function createBattle(o) {
  const st = {
    v: FB.v, kind: o.kind, t0: o.now, t: o.now, n: 0, phase: 'deploy', ph1: null, nv: 0,
    ma: 1 + 0.05 * (o.smithyA || 0), md: 1 + 0.05 * (o.smithyD || 0),
    units: [], regs: [], walls: [], q: [], ack: [], ai: [!!o.aiAtt, !!o.aiDef], ready: [!!o.aiAtt, !!o.aiDef],
    cap: 0, over: null, retreat: false, uid: 1, aiF: -1, tk: [pickTech(o.techA), pickTech(o.techD)],
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
  // troepen: grote legers krijgen figuren die voor meerdere soldaten staan; per soort regimenten van hooguit
  // FB.squad figuren, zo gelijk mogelijk verdeeld (13 figuren = 7 + 6)
  const total = (u) => Object.values(u || {}).reduce((a, b) => a + (b || 0), 0);
  const sA = Math.max(1, Math.ceil(total(o.att) / FB.maxPerSide));
  const sD = Math.max(1, Math.ceil(o.defGroups.reduce((a, g) => a + total(g.units), 0) / FB.maxPerSide));
  const face0 = (side) => (side ? { x: st.dir.x, y: st.dir.y } : { x: -st.dir.x, y: -st.dir.y });
  const add = (side, units, g, scale) => {
    const kinds = Object.keys(units || {}).filter((k) => units[k] > 0 && UNITS[k]).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    for (const k of kinds) {
      const figs = []; let n = units[k];
      while (n > 0) { const m = Math.min(scale, n); n -= m; figs.push(m); }
      const nr = Math.ceil(figs.length / FB.squad);
      for (let r = 0; r < nr; r++) {
        const lo = Math.floor((r * figs.length) / nr); const hi = Math.floor(((r + 1) * figs.length) / nr);
        const f0 = face0(side);
        const reg = { id: st.regs.length + 1, s: side, k, g, f: defaultForm(k), wid: null, fx: R3(f0.x), fy: R3(f0.y), x: st.plaza.x, y: st.plaza.y, st: 'hold', m: hi - lo, m0: hi - lo, ml: hi - lo, mo: 100, eng: 0, tr: 0, tu: 0, tw: -1, path: null, spread: 0 };
        if (isCav(k) && k !== 'noble' && TK(st, side, 'horseshoes')) reg.sp = 1.1; // hoefijzers
        st.regs.push(reg);
        for (let i = lo; i < hi; i++) {
          const hp0 = K(k).hp || 30;
          const id = st.uid++;
          st.units.push({ id, s: side, k, g, n: figs[i], hp: hp0 * figs[i], hp0, x: st.plaza.x, y: st.plaza.y, cd: 400 + ((id * 137) % 700), hx: st.plaza.x, hy: st.plaza.y, oa: 0, ob: 0, tg: null, tw: -1, at: -1, sq: reg.id, mv: 0 });
        }
      }
    }
  };
  add(0, o.att, 'att', sA);
  for (const grp of o.defGroups) add(1, grp.units, grp.key, sD);
  // wachttorens van de verdediger
  for (const tw of st.towerDefs || []) {
    const L = Math.max(1, Math.min(TOWER.hp.length - 1, tw.level));
    st.units.push({ id: st.uid++, s: 1, k: 'tower', b: tw.id, L, x: tw.x, y: tw.y, hp: TOWER.hp[L], hp0: TOWER.hp[L], n: 1, cd: 600, tg: null, tw: -1, at: -1 });
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
  const ib = !!(s.tech && s.tech.ironbound); // ijzerbeslag: poorten houden langer stand
  for (const idx of s.walls || []) addWall(st, idx, L, false);
  for (const idx of s.gates || []) addWall(st, idx, L, true, ib);
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

function addWall(st, idx, L, gate, iron = false) {
  const { i, j } = tileOf(idx);
  if (i < st.box.x0 || j < st.box.y0 || i >= st.box.x0 + st.box.w || j >= st.box.y0 + st.box.h) return;
  const hp = Math.round(wallHp(L) * (gate ? 0.75 : 1) * (gate && iron ? 1.5 : 1));
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

const clampX = (st, x) => Math.min(st.box.x0 + st.box.w - 0.2, Math.max(st.box.x0 + 0.2, x));
const clampY = (st, y) => Math.min(st.box.y0 + st.box.h - 0.2, Math.max(st.box.y0 + 0.2, y));
const unitVec = (x, y, fb) => { const d = Math.sqrt(x * x + y * y); return d < 1e-6 ? fb : { x: R3(x / d), y: R3(y / d) }; };
const centroid = (list) => { let x = 0; let y = 0; for (const u of list) { x += u.x; y += u.y; } return { x: x / list.length, y: y / list.length }; };
const nearestTo = (list, p) => { let b = list[0]; let bd = Infinity; for (const u of list) { const d = SQ(u.x - p.x) + SQ(u.y - p.y); if (d < bd) { bd = d; b = u; } } return b; };
// recent nog geslagen (of geschoten)
const fought = (st, u, ms = 1600) => u.at >= 0 && st.n * FB.tick - u.at < ms;

// het regiment van een soldaat, en de levende soldaten per regiment (op volgorde van id)
export const regOf = (st, u) => (u && u.sq ? st.regs[u.sq - 1] || null : null);
export function membersMap(st) {
  const M = new Map();
  for (const u of st.units) {
    if (u.hp <= 0 || !u.sq) continue;
    let l = M.get(u.sq);
    if (!l) { l = []; M.set(u.sq, l); }
    l.push(u);
  }
  return M;
}
const regSpeed = (r) => speedOf(r.k) * (fxOf(r).speed || 1) * (r.sp || 1);
// waar een soldaat in de formatie hoort, rond het vaandel van zijn regiment
export const slotPos = (r, u) => ({ x: r.x + r.fx * u.oa - r.fy * u.ob, y: r.y + r.fy * u.oa + r.fx * u.ob });

// soldaten aan plaatsen in de formatie koppelen: de huidige vorm (t.o.v. het midden) zo goed mogelijk behouden,
// zodat ze elkaar niet kruisen. Vooraan eerst.
function assignSlots(r, list, fx, fy) {
  const offs = slotOffsets(r.f, list.length, r.wid);
  const px = -fy; const py = fx;
  const c = centroid(list);
  const free = list.map((u) => ({ u, a: (u.x - c.x) * fx + (u.y - c.y) * fy, b: (u.x - c.x) * px + (u.y - c.y) * py }));
  const out = [];
  for (const o of offs) {
    let bi = 0; let bd = Infinity;
    for (let i = 0; i < free.length; i++) { const d = SQ(free[i].a - o.a) + SQ(free[i].b - o.b); if (d < bd - 1e-9) { bd = d; bi = i; } }
    out.push({ u: free[bi].u, o });
    free.splice(bi, 1);
  }
  return out;
}

// bezette plekken van de andere regimenten van deze kant (tegel → aantal)
function usedHomes(st, side, skip) {
  const used = new Map();
  for (const u of st.units) {
    if (u.s !== side || u.hp <= 0 || !u.sq || skip.has(u.sq)) continue;
    const c = cellOf(st, u.hx, u.hy); used.set(c, (used.get(c) || 0) + 1);
  }
  return used;
}

// thuisplek van een soldaat: precies zijn plaats in de formatie als hij daar kan staan, anders de dichtstbijzijnde
// vrije tegel (in de opstelling: binnen het eigen gebied)
// binnen of buiten de muren? (muur- en poorttegels tellen als binnen)
const inner = (nv, c) => inside(nv, c) || nv.p1[c] === 3 || nv.p1[c] === 4;

function setHome(st, nv, u, x, y, used, zone, side = null) {
  x = clampX(st, x); y = clampY(st, y);
  let c = cellOf(st, x, y);
  // side: true = de formatie hoort binnen de muren, false = erbuiten (nooit langs de verkeerde kant van de muur)
  const sideOk = (cc) => side == null || !nv.ins || inner(nv, cc) === side;
  if (!standable(nv, u.s, u.k, c) || (zone && !inZone(st, nv, u.s, c)) || !sideOk(c)) {
    const ok = (cc) => standable(nv, u.s, u.k, cc) && (!zone || inZone(st, nv, u.s, cc)) && sideOk(cc) && (used.get(cc) || 0) < 2;
    c = nearestStand(st, nv, u.s, u.k, x, y, ok, 10);
    if (!ok(c)) c = nearestStand(st, nv, u.s, u.k, x, y, ok, 40);
    if (!ok(c)) c = nearestStand(st, nv, u.s, u.k, x, y, (cc) => standable(nv, u.s, u.k, cc) && (!zone || inZone(st, nv, u.s, cc)), 40);
    const m = used.get(c) || 0; const { i, j } = cellXY(st, c);
    const off = m % 2 ? [0.7, 0.66] : [0.32, 0.36];
    x = i + off[0]; y = j + off[1];
  }
  used.set(c, (used.get(c) || 0) + 1);
  u.hx = R3(x); u.hy = R3(y);
}

function resetReg(r) {
  r.eng = 0; r.tr = 0; r.tu = 0; r.tw = -1; r.path = null; r.res = 0; r.chg = 0; r.rgx = null; r.rgy = null; r.spread = 0; r.pace = 0;
}

// een regiment meteen op zijn plaats zetten (opstelling): vaandel op (x, y), kijkend naar (fx, fy)
function placeReg(st, nv, r, list, x, y, fx, fy, used, zone) {
  resetReg(r);
  r.fx = R3(fx); r.fy = R3(fy); r.x = R3(x); r.y = R3(y); r.st = 'hold'; r.gx = null; r.gy = null; r.m = list.length;
  const side = zone ? null : sideAt(st, nv, r.x, r.y);
  for (const { u, o } of assignSlots(r, list, r.fx, r.fy)) {
    u.oa = o.a; u.ob = o.b;
    setHome(st, nv, u, r.x + r.fx * o.a - r.fy * o.b, r.y + r.fy * o.a + r.fx * o.b, used, zone, side);
    u.x = u.hx; u.y = u.hy; u.tg = null; u.tw = -1; u.path = null; u.np = 0; u.mv = 0;
  }
}

// waar elk regiment van een groep komt, zoals een slagorde: voetvolk vooraan, schutters erachter,
// belegeringstuig achteraan en ruiters op de flanken. Regimenten blijven links of rechts zoals ze nu staan.
function groupPlan(regs, M, cx, cy, fx, fy) {
  if (regs.length === 1) return [{ r: regs[0], x: cx, y: cy }];
  const px = -fy; const py = fx;
  const info = regs.map((r) => {
    const list = M.get(r.id) || [];
    const c = list.length ? centroid(list) : { x: r.x, y: r.y };
    const d = formDims(r.f, list.length, r.wid);
    return { r, w: d.w, d: d.d, lat: (c.x - cx) * px + (c.y - cy) * py, ro: role(r.k) };
  }).sort((a, b) => a.lat - b.lat || a.r.id - b.r.id);
  let lines = [info.filter((i) => i.ro === 'inf'), info.filter((i) => i.ro === 'rng'), info.filter((i) => i.ro === 'siege')].filter((l) => l.length);
  let cav = info.filter((i) => i.ro === 'cav');
  if (!lines.length) { lines = [cav]; cav = []; }
  const GAP = 0.9; const out = [];
  let a = 0; let prevD = 0;
  const put = (i, b, aa) => out.push({ r: i.r, x: cx + fx * aa + px * b, y: cy + fy * aa + py * b });
  lines.forEach((line, li) => {
    const depth = Math.max(...line.map((i) => i.d));
    if (li > 0) a -= prevD / 2 + 1.1 + depth / 2;
    const total = line.reduce((s, i) => s + i.w, 0) + GAP * (line.length - 1);
    let b = -total / 2;
    for (const i of line) { put(i, b + i.w / 2, a); b += i.w + GAP; }
    if (li === 0 && cav.length) {
      const nl = Math.ceil(cav.length / 2);
      let bl = -total / 2 - GAP;
      for (let k = nl - 1; k >= 0; k--) { put(cav[k], bl - cav[k].w / 2, a); bl -= cav[k].w + GAP; }
      let br = total / 2 + GAP;
      for (let k = nl; k < cav.length; k++) { put(cav[k], br + cav[k].w / 2, a); br += cav[k].w + GAP; }
    }
    prevD = depth;
  });
  return out;
}

function deployAttack(st, nv) {
  const M = membersMap(st);
  const regs = st.regs.filter((r) => r.s === 0 && M.has(r.id));
  if (!regs.length) return;
  const f = { x: -st.dir.x, y: -st.dir.y }; // vooraan = naar de stad
  const plan = groupPlan(regs, M, 0, 0, f.x, f.y);
  // de voorste rij net achter de rand van de opstelplaats
  let lead = -Infinity;
  for (const p of plan) lead = Math.max(lead, p.x * f.x + p.y * f.y + formDims(p.r.f, M.get(p.r.id).length, p.r.wid).d / 2);
  const front = st.zmin + 0.6 + lead;
  const base = { x: st.plaza.x + st.dir.x * front, y: st.plaza.y + st.dir.y * front };
  const used = new Map();
  for (const p of plan) placeReg(st, nv, p.r, M.get(p.r.id), base.x + p.x, base.y + p.y, f.x, f.y, used, true);
}

// de verdediger stelt zich op naar de kant van de aanval: schutters op de muur, voetvolk achter de poort
function deployDefense(st, nv) {
  const M = membersMap(st);
  const regs = st.regs.filter((r) => r.s === 1 && M.has(r.id));
  if (!regs.length) return;
  const used = new Map();
  const P = st.plaza; const d = st.dir;
  const place = (list, x, y, fx = d.x, fy = d.y) => {
    for (const p of groupPlan(list, M, x, y, fx, fy)) placeReg(st, nv, p.r, M.get(p.r.id), p.x, p.y, fx, fy, used, true);
  };
  const by = (ro) => regs.filter((r) => role(r.k) === ro);
  const inf = by('inf'); const rng = by('rng'); const cav = [...by('cav'), ...by('siege')];
  if (st.kind === 'camp') { place([...inf, ...rng, ...cav], P.x + d.x * 1.8, P.y + d.y * 1.8); return; }
  const alive = st.walls.map((w, k) => ({ w, k })).filter(({ w }) => w.hp > 0);
  const wallCells = st.enc ? alive.filter(({ w }) => !w.g).sort((a, b) => proj(st, b.w.i + 0.5, b.w.j + 0.5) - proj(st, a.w.i + 0.5, a.w.j + 0.5) || a.k - b.k) : [];
  if (wallCells.length) {
    // schutters op de muur, zo dicht mogelijk bij de aanvaller (twee per muurstuk)
    let wi = 0; const rest = [];
    const cap = Math.floor(wallCells.length * 1.2);
    for (const r of rng) {
      const list = M.get(r.id);
      if (!climbs(r.k) || wi + list.length > cap) { rest.push(r); continue; }
      resetReg(r);
      for (const u of list) {
        const { w } = wallCells[Math.floor(wi / 2)];
        const m = wi % 2; wi++;
        u.x = u.hx = R3(w.i + (m ? 0.68 : 0.32)); u.y = u.hy = R3(w.j + (m ? 0.64 : 0.36)); u.oa = 0; u.ob = 0;
        const c = cellOf(st, u.hx, u.hy); used.set(c, (used.get(c) || 0) + 1);
      }
      const c = centroid(list);
      r.st = 'hold'; r.spread = 1; r.x = R3(c.x); r.y = R3(c.y); r.fx = d.x; r.fy = d.y; r.m = list.length;
    }
    // voetvolk achter de bedreigde poort(en), anders achter de muur aan die kant
    const gates = alive.filter(({ w }) => w.g).sort((a, b) => proj(st, b.w.i + 0.5, b.w.j + 0.5) - proj(st, a.w.i + 0.5, a.w.j + 0.5) || a.k - b.k);
    const spots = [];
    const top = proj(st, wallCells[0].w.i + 0.5, wallCells[0].w.j + 0.5);
    for (const { w } of gates) {
      if (proj(st, w.i + 0.5, w.j + 0.5) < top - 4 || spots.length >= 2) continue;
      const b = behind(st, nv, w);
      if (!spots.some((p) => SQ(p.x - b.x) + SQ(p.y - b.y) < 9)) spots.push({ ...b, w });
    }
    if (!spots.length) spots.push({ ...behind(st, nv, wallCells[0].w), w: wallCells[0].w });
    spots.forEach((sp, n) => {
      const part = inf.filter((_, i) => i % spots.length === n);
      if (!part.length) return;
      // naar de poort gekeerd
      const f = unitVec(sp.w.i + 0.5 - sp.x, sp.w.j + 0.5 - sp.y, d);
      // een stap verder van de poort, zodat het blok er volledig achter staat
      const dd = formDims(part[0].f, M.get(part[0].id).length, part[0].wid).d / 2;
      place(part, sp.x - f.x * dd, sp.y - f.y * dd, f.x, f.y);
    });
    if (rest.length) place(rest, P.x + d.x * 1.5, P.y + d.y * 1.5);
    if (cav.length) place(cav, P.x - d.x * 0.6, P.y - d.y * 0.6);
    return;
  }
  // open stad: een slagorde voor het plein
  place([...inf, ...rng, ...cav], P.x + d.x * 3, P.y + d.y * 3);
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

// verdedigers op de muur: verspreid over de muur rond het aangeklikte stuk (wie niet op de muur kan, gaat erachter)
function spreadOnWall(st, nv, regs, M, tc, x, y, tele) {
  const climbers = regs.filter((r) => climbs(r.k)); const others = regs.filter((r) => !climbs(r.k));
  const n = climbers.reduce((a, r) => a + M.get(r.id).length, 0);
  const cells = wallRun(st, nv, tc, Math.ceil(n / 2) + 2);
  let k = 0;
  for (const r of climbers) {
    const list = M.get(r.id);
    resetReg(r);
    for (const u of list) {
      const c = cells[Math.floor(k / 2) % cells.length]; const { i, j } = cellXY(st, c);
      u.hx = R3(i + (k % 2 ? 0.68 : 0.32)); u.hy = R3(j + (k % 2 ? 0.64 : 0.36)); k++;
      u.tg = null; u.path = null; u.np = 0;
      if (tele) { u.x = u.hx; u.y = u.hy; }
    }
    const c = centroid(list.map((u) => ({ x: u.hx, y: u.hy })));
    r.st = 'hold'; r.spread = 1; r.x = R3(c.x); r.y = R3(c.y); r.gx = null; r.gy = null; r.m = list.length;
  }
  if (others.length) {
    const b = behind(st, nv, { i: Math.floor(x), j: Math.floor(y) });
    const f = unitVec(x - b.x, y - b.y, { x: st.dir.x, y: st.dir.y });
    const used = usedHomes(st, regs[0].s, new Set(others.map((r) => r.id)));
    for (const p of groupPlan(others, M, b.x, b.y, f.x, f.y)) {
      if (tele) placeReg(st, nv, p.r, M.get(p.r.id), p.x, p.y, f.x, f.y, used, true);
      else regMove(st, nv, p.r, M.get(p.r.id), p.x, p.y, f.x, f.y, regSpeed(p.r), sideAt(st, nv, b.x, b.y));
    }
  }
}

// ---------- regimenten bevelen ----------
// verplaatsen in formatie: het vaandel volgt één route, de soldaten houden hun plaats rond het vaandel
// side: aan welke kant van de muur het regiment moet uitkomen (true = binnen); standaard die van het doel
function regMove(st, nv, r, list, gx, gy, fx, fy, pace, side) {
  gx = clampX(st, gx); gy = clampY(st, gy);
  let gc = cellOf(st, gx, gy);
  if (side === undefined) side = sideAt(st, nv, gx, gy);
  const okG = (c) => standable(nv, r.s, r.k, c) && (side == null || inner(nv, c) === side);
  if (!okG(gc)) { const c = nearestStand(st, nv, r.s, r.k, gx, gy, okG, 12); if (okG(c)) gc = c; else gc = nearestStand(st, nv, r.s, r.k, gx, gy, null, 6); const q = cellXY(st, gc); gx = q.i + 0.5; gy = q.j + 0.5; }
  const c = centroid(list);
  // vertrek bij de soldaat die het dichtst bij het midden staat (het midden zelf kan in een gebouw liggen)
  const lead = nearestTo(list, c);
  const lp = findPath(st, nv, r.s, r.k, lead.x, lead.y, gx, gy);
  const keep = { rgx: null, rgy: null, res: 0 };
  if (lp && lp.blk) {
    // onbereikbaar (achter de muur): zo dicht mogelijk, daarna een bres slaan en verder
    const e = lp.pts.length ? lp.pts[lp.pts.length - 1] : [lead.x, lead.y];
    if (r.s === 0 && st.walls.some((w) => w.hp > 0)) { keep.res = 1; keep.rgx = R3(gx); keep.rgy = R3(gy); }
    gx = e[0]; gy = e[1];
  }
  resetReg(r);
  Object.assign(r, keep);
  r.gx = R3(gx); r.gy = R3(gy); r.fx = R3(fx); r.fy = R3(fy);
  r.x = R3(lead.x); r.y = R3(lead.y);
  r.path = lp && lp.pts.length ? lp.pts.map((p) => [p[0], p[1]]) : [];
  const last = r.path[r.path.length - 1];
  if (!last || last[0] !== r.gx || last[1] !== r.gy) r.path.push([r.gx, r.gy]);
  r.st = 'move'; r.pace = R3(Math.min(pace || regSpeed(r), regSpeed(r)));
  const used = usedHomes(st, r.s, new Set([r.id]));
  side = sideAt(st, nv, r.gx, r.gy);
  for (const { u, o } of assignSlots(r, list, r.fx, r.fy)) {
    u.oa = o.a; u.ob = o.b;
    setHome(st, nv, u, r.gx + r.fx * o.a - r.fy * o.b, r.gy + r.fy * o.a + r.fx * o.b, used, false, side);
    u.tg = null; u.tw = -1; u.path = null; u.np = 0;
  }
}

// ligt dit punt binnen de muren (true), erbuiten (false), of is er geen ommuurde stad (null)?
function sideAt(st, nv, x, y) {
  if (!nv.ins) return null;
  const c = cellOf(st, x, y);
  return c >= 0 ? inner(nv, c) : false;
}

// opnieuw in formatie gaan waar het regiment nu staat (na een gevecht, bij 'Halt' of als er soldaten vielen)
function reform(st, nv, r, list, at = null) {
  const c = at || centroid(list);
  const spread = r.spread;
  resetReg(r);
  r.x = R3(c.x); r.y = R3(c.y); r.st = 'hold'; r.gx = null; r.gy = null; r.m = list.length;
  if (spread && list.every((u) => SQ(u.x - u.hx) + SQ(u.y - u.hy) < 2.5)) { r.spread = 1; return; } // op de muur: blijven staan
  const used = usedHomes(st, r.s, new Set([r.id]));
  const side = sideAt(st, nv, r.x, r.y);
  for (const { u, o } of assignSlots(r, list, r.fx, r.fy)) {
    u.oa = o.a; u.ob = o.b;
    setHome(st, nv, u, r.x + r.fx * o.a - r.fy * o.b, r.y + r.fy * o.a + r.fx * o.b, used, false, side);
  }
}

function regCharge(r) { resetReg(r); r.st = 'charge'; }
function regAttack(r, e) { resetReg(r); r.st = 'attack'; if (e.k === 'tower') r.tu = e.id; else r.tr = e.sq; }
// chg: 0 = na de bres verder naar het oude doel, 1 = daarna stormlopen, 2 = bevel van de speler (daarna halt)
function regWall(r, k, chg) { const keep = { res: r.res, rgx: r.rgx, rgy: r.rgy }; resetReg(r); r.st = 'wall'; r.tw = k; r.chg = chg === 1 ? 1 : 0; if (chg !== 2) Object.assign(r, keep); }

// Een bevel wordt in de wachtrij gezet voor tik 'at' (zodat server en browser het op exact dezelfde tik uitvoeren).
export function queueOrder(st, side, ids, o, at = st.n, cid = null) {
  const n = Math.max(st.n, Math.min(st.n + 120, Math.floor(Number(at) || st.n)));
  st.q.push({ n, s: side, ids: ids ? ids.slice(0, 300) : null, o, cid });
  st.q.sort((a, b) => a.n - b.n);
  if (cid) { st.ack.push(cid); if (st.ack.length > 30) st.ack.shift(); }
  return n;
}

// meteen uitvoeren (voor tests en de wachtrij). ids = soldaten; het bevel geldt voor hun hele regiment.
export function giveOrder(st, side, ids, o) {
  const nv = nav(st);
  if (o.ready) { st.ready[side] = true; return; }
  if (o.ai != null) { st.ai[side] = !!o.ai; if (st.ai[side]) st.ready[side] = true; return; }
  if (o.retreat) { if (side === 0 && st.over == null) { st.over = 1; st.retreat = true; } return; }
  const M = membersMap(st);
  const pick = new Set();
  for (const u of st.units) if (u.s === side && u.hp > 0 && u.sq && (!ids || ids.includes(u.id))) pick.add(u.sq);
  const regs = [...pick].sort((a, b) => a - b).map((id) => st.regs[id - 1]).filter((r) => r && r.s === side && M.has(r.id) && r.st !== 'rout');
  if (!regs.length) return;
  const deploy = st.phase === 'deploy';
  // formatie kiezen
  if (o.form != null) {
    if (!FORMS[o.form]) return;
    for (const r of regs) {
      if (!formsFor(r.k).includes(o.form) || r.spread) continue; // op de muur staan ze verspreid
      r.f = o.form; r.wid = null;
      const list = M.get(r.id);
      if (deploy) placeReg(st, nv, r, list, r.x, r.y, r.fx, r.fy, usedHomes(st, side, new Set([r.id])), true);
      else if (r.st === 'move') regMove(st, nv, r, list, r.gx, r.gy, r.fx, r.fy, r.pace);
      else if (r.st === 'hold') reform(st, nv, r, list, { x: r.x, y: r.y });
      // in een gevecht: de nieuwe formatie geldt zodra ze weer in formatie staan
    }
    return;
  }
  const all = regs.flatMap((r) => M.get(r.id));
  if (deploy) {
    if (!(Number.isFinite(o.x) && Number.isFinite(o.y))) return;
    const x = clampX(st, o.x); const y = clampY(st, o.y);
    const tc = cellOf(st, x, y);
    if (side === 1 && tc >= 0 && nv.p1[tc] === 3) { spreadOnWall(st, nv, regs, M, tc, x, y, true); return; }
    const f = Number.isFinite(o.fx) && Number.isFinite(o.fy) ? unitVec(o.fx, o.fy, null) : null;
    const face = f || (side ? { x: st.dir.x, y: st.dir.y } : { x: -st.dir.x, y: -st.dir.y });
    if (Number.isFinite(o.w) && o.w > 0) fitWidth(regs, M, o.w);
    const used = usedHomes(st, side, new Set(regs.map((r) => r.id)));
    for (const p of groupPlan(regs, M, x, y, face.x, face.y)) placeReg(st, nv, p.r, M.get(p.r.id), p.x, p.y, face.x, face.y, used, true);
    return;
  }
  if (o.stop) { for (const r of regs) reform(st, nv, r, M.get(r.id)); return; }
  if (o.charge) { for (const r of regs) regCharge(r); return; }
  if (o.wall != null) {
    const w = st.walls[o.wall];
    if (!w || w.hp <= 0 || side !== 0) return;
    for (const r of regs) regWall(r, o.wall, 2);
    return;
  }
  if (o.target != null) {
    const e = st.units.find((x) => x.id === o.target && x.hp > 0 && x.s !== side);
    if (!e) return;
    for (const r of regs) regAttack(r, e);
    return;
  }
  if (!(Number.isFinite(o.x) && Number.isFinite(o.y))) return;
  const x = clampX(st, o.x); const y = clampY(st, o.y);
  const tc = cellOf(st, x, y);
  if (side === 1 && tc >= 0 && nv.p1[tc] === 3) { spreadOnWall(st, nv, regs, M, tc, x, y, false); return; }
  const c0 = centroid(all);
  let face = Number.isFinite(o.fx) && Number.isFinite(o.fy) ? unitVec(o.fx, o.fy, null) : null;
  if (!face) face = SQ(x - c0.x) + SQ(y - c0.y) < 1 ? { x: regs[0].fx, y: regs[0].fy } : unitVec(x - c0.x, y - c0.y, { x: regs[0].fx, y: regs[0].fy });
  if (Number.isFinite(o.w) && o.w > 0) fitWidth(regs, M, o.w);
  // samen op pad: in het tempo van de traagste (belegeringstuig volgt op zijn eigen tempo)
  const mob = regs.filter((r) => role(r.k) !== 'siege');
  const pace = mob.length ? Math.min(...mob.map(regSpeed)) : null;
  const wside = sideAt(st, nv, x, y);
  for (const p of groupPlan(regs, M, x, y, face.x, face.y)) {
    regMove(st, nv, p.r, M.get(p.r.id), p.x, p.y, face.x, face.y, role(p.r.k) === 'siege' ? regSpeed(p.r) : pace, wside);
  }
}

// een getrokken lijn: de voorste linie (zoals groupPlan ze opstelt) wordt zo breed als de lijn
function fitWidth(regs, M, w) {
  const lines = ['inf', 'rng', 'siege', 'cav'].map((ro) => regs.filter((r) => role(r.k) === ro && (r.f === 'line' || r.f === 'block' || r.f === 'loose')));
  const front = lines.find((l) => l.length);
  if (!front) return;
  if (regs.length === 1) { const r = regs[0]; r.wid = Math.max(1, Math.min(30, Math.round(w / FORMS[r.f].gap) + 1)); return; }
  const dims = front.map((r) => formDims(r.f, M.get(r.id).length, r.wid).w);
  const sum = dims.reduce((a, b) => a + b, 0);
  const avail = Math.max(front.length, w - 0.9 * (front.length - 1));
  front.forEach((r, i) => { r.wid = Math.max(1, Math.min(30, Math.round(((dims[i] / sum) * avail) / FORMS[r.f].gap))); });
}

// ---------- de slag zelf ----------
function reachOf(st, nv, u, e) {
  let r;
  if (u.k === 'tower') r = TOWER.range + (TK(st, u.s, 'xbow') ? 1 : 0);
  else if (u.k === 'stonethrower') r = FB.siegeRange;
  else if (isRangedK(u.k)) r = FB.ranged + (onWall(st, nv, u) ? FB.wallRange : 0) + (TK(st, u.s, 'yew') ? 1 : 0);
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
  // vuurpijlen: schutters doen veel meer schade aan muren, poorten, torens en rammen
  const fire = isRangedK(u.k) && !isSiege(u.k) && u.k !== 'tower' && TK(st, u.s, 'firearrows') ? 1.6 : 1;
  if (e.wall) {
    const base = K(u.k).dmg || 2;
    const f = u.k === 'ram' ? 8 : u.k === 'stonethrower' ? 1.6 : isRangedK(u.k) ? 0.08 * fire : 0.3;
    return base * f * n * mult;
  }
  const re = regOf(st, e); const fe = fxOf(re);
  // schildmuur: voetvolk in linie of blok krijgt minder schade van pijlen en torens
  const shield = re && role(e.k) === 'inf' && (re.f === 'line' || re.f === 'block') && TK(st, e.s, 'shieldwall') ? 0.7 : 1;
  if (u.k === 'tower') {
    const def = K(e.k).def ? K(e.k).def.rng : 10;
    return TOWER.dmg[u.L] * (TK(st, u.s, 'xbow') ? 1.2 : 1) * (FIELD.armorK / (FIELD.armorK + def)) * cover(st, nv, e) * (fe.missile || 1) * shield;
  }
  if (e.k === 'tower') return (K(u.k).dmg || 2) * n * mult * (isSiege(u.k) ? 6 : isRangedK(u.k) ? 0.15 * fire : 0.5);
  let d = hitDamage(u.k, e.k, mult) * counter(u.k, e.k) * n * FB.pace;
  if (isRangedK(u.k)) return d * cover(st, nv, e) * (onWall(st, nv, u) ? 1.15 : 1) * (fe.missile || 1) * shield * (e.k === 'ram' ? fire : 1);
  const ru = regOf(st, u); const fu = fxOf(ru);
  d *= (fu.dealt || 1) * (fe.taken || 1);
  if (isCav(u.k) && fe.cav) d *= fe.cav;
  // flank en rug: wie van opzij of van achter komt, doet meer schade
  if (re && !re.spread) {
    const vx = u.x - e.x; const vy = u.y - e.y; const vl = Math.sqrt(vx * vx + vy * vy) || 1;
    const dot = (vx * re.fx + vy * re.fy) / vl;
    const fl = (fe.flank ?? 1) * (isCav(u.k) && TK(st, u.s, 'flank') ? 1.5 : 1); // flankrit
    if (dot < -0.45) d *= 1 + 0.5 * fl; else if (dot < 0.3) d *= 1 + 0.2 * fl;
  }
  // stormloop: de eerste klap na een aanloop (lansen: sterker; strijdkreet: kost de vijand moed)
  if (u.mv >= 0.8) {
    d *= ((isCav(u.k) ? 1.8 : 1.3) + (fu.charge || 0)) * (isCav(u.k) && TK(st, u.s, 'lances') ? 1.25 : 1);
    if (!isCav(u.k) && re && re.st !== 'rout' && TK(st, u.s, 'warcry')) re.mo = R3(Math.max(0, (re.mo ?? 100) - 3));
    u.mv = 0;
  }
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

// dichtstbijzijnde vijand binnen maxD van 'from'. stayIn: verdedigers binnen de muren gaan niet naar buiten.
function pickEnemy(st, nv, u, alive, maxD, from = u, stayIn = false) {
  const uc = cellOf(st, u.x, u.y);
  const stay = stayIn && uc >= 0 && (inside(nv, uc) || nv.p1[uc] === 4);
  let best = null; let bd = Infinity;
  for (const e of alive) {
    if (e.s === u.s || e.hp <= 0) continue;
    if (stay) { const ec = cellOf(st, e.x, e.y); if (ec < 0 || !inside(nv, ec)) continue; }
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

// één stap lopen naar (tx, ty) met snelheid spd (tegels per seconde); glijdt langs obstakels. true = aangekomen
function walk(st, nv, u, tx, ty, stop, spd) {
  const dx = tx - u.x; const dy = ty - u.y; const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= stop) return true;
  const c = cellOf(st, u.x, u.y);
  const p = u.s ? nv.p1 : nv.p0;
  const sp = spd * (FB.tick / 1000) * (c >= 0 && p[c] === 2 ? FB.forestSlow : 1);
  const s = Math.min(d, sp);
  const nx = u.x + (dx / d) * s; const ny = u.y + (dy / d) * s;
  if (tryMove(st, nv, u, nx, ny) || tryMove(st, nv, u, nx, u.y) || tryMove(st, nv, u, u.x, ny)) {
    u.mv = R3(Math.min(4, (u.mv || 0) + s));
    return d - s <= stop;
  }
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
function follow(st, nv, u, spd) {
  if (!u.path || !u.path.length) return !u.np;
  const [wx, wy] = u.path[0];
  const last = u.path.length === 1;
  const bx = u.x; const by = u.y;
  if (walk(st, nv, u, wx, wy, last ? 0.08 : 0.3, spd)) { u.path.shift(); u.stk = 0; return !u.path.length; }
  if (Math.abs(u.x - bx) + Math.abs(u.y - by) < 0.02) {
    u.stk = (u.stk || 0) + 1;
    if (u.stk === 12) { u.np = 1; u.pgx = u.path[u.path.length - 1][0]; u.pgy = u.path[u.path.length - 1][1]; }
    if (u.stk > 40) { u.path = null; return true; } // vastgelopen: hier blijven
  } else u.stk = 0;
  return false;
}

// naar een doel toe lopen tot op afstand 'stop' (rechtdoor als het kan, anders met een route)
// geeft 'blocked' terug als het doel onbereikbaar blijkt
function approach(st, nv, u, x, y, stop, spd) {
  const d = Math.sqrt(SQ(x - u.x) + SQ(y - u.y));
  if (d <= stop) return 'there';
  const f = Math.max(0, (d - stop * 0.9) / d);
  const ax = u.x + (x - u.x) * f; const ay = u.y + (y - u.y) * f;
  if (clearLine(st, nv, u.s, u.k, u.x, u.y, ax, ay)) { u.path = null; walk(st, nv, u, ax, ay, 0.05, spd); return 'walk'; }
  const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
  if (!u.np && (!end || SQ(end[0] - ax) + SQ(end[1] - ay) > 2.2) && (u.pt == null || st.n - u.pt > 8)) {
    u.np = 1; u.pgx = R3(ax); u.pgy = R3(ay); u.path = null;
  }
  if (u.path && u.path.length) { follow(st, nv, u, spd); return 'walk'; }
  if (!u.np && u.blk && u.pt != null && st.n - u.pt <= 8) return 'blocked';
  return 'wait';
}

function hit(st, nv, u, e, bt) {
  let dmg = damage(st, nv, u, e);
  if (st.fate) dmg = fateDmg(st, u.s, e, dmg);
  e.hp = R3(Math.max(0, e.hp - dmg));
  u.cd = u.k === 'tower' ? TOWER.rate : K(u.k).rate || 1500;
  if (isRangedK(u.k) && u.k !== 'tower' && !isSiege(u.k) && TK(st, u.s, 'volley')) u.cd = Math.round(u.cd * 0.85); // pijlenregen
  u.at = bt; u.ax = R3(e.wall ? e.i + 0.5 : e.x); u.ay = R3(e.wall ? e.j + 0.5 : e.y);
  if (e.wall) { if (e.hp <= 0) breakWall(st, e, bt); return; }
  if (e.hp <= 0) { e.died = bt; return; }
  // wie geraakt wordt terwijl hij op zijn plek staat, slaat terug
  const re = regOf(st, e);
  if (mobile(e) && re && re.st === 'hold' && e.tg == null && meleeK(e.k) && meleeK(u.k)) e.tg = u.id;
  // in de flank of de rug aangevallen worden kost moed
  if (re && !re.spread && re.st !== 'rout' && meleeK(u.k) && FORMS[re.f] && (FORMS[re.f].fx.flank ?? 1) > 0) {
    const vx = u.x - e.x; const vy = u.y - e.y; const vl = Math.sqrt(vx * vx + vy * vy) || 1;
    const dot = (vx * re.fx + vy * re.fy) / vl;
    if (dot < 0.3) re.mo = R3(Math.max(0, (re.mo ?? 100) - moLoss(st, re, dot < -0.45 ? 1.2 : 0.5)));
  }
}

function breakWall(st, w, bt) {
  w.hp = 0; w.died = bt;
  // een poort valt in zijn geheel (2 tegels breed)
  if (w.g) for (const o of st.walls) if (o.g && o.hp > 0 && Math.abs(o.i - w.i) + Math.abs(o.j - w.j) === 1) { o.hp = 0; o.died = bt; }
  st.nv++;
  for (const u of st.units) {
    if (u.hp <= 0 || !mobile(u)) continue;
    // wie op dit muurstuk stond, valt naar beneden
    if (u.s === 1 && Math.floor(u.x) === w.i && Math.floor(u.y) === w.j) { u.hp = R3(u.hp - (st.fate ? fateCap(st, u, u.hp * 0.3) : u.hp * 0.3)); u.hx = u.x; u.hy = u.y; }
    u.path = null; u.np = 0; // de weg is veranderd
  }
  for (const r of st.regs) if (r.st === 'move' && r.gx != null) r.rp = 1; // route van het vaandel opnieuw zoeken
}

function fightUnit(st, nv, u, e, leash, bt, spd) {
  const up = u.s === 0 && meleeK(u.k) && e.k !== 'tower' && onWall(st, nv, e); // de trap op, naar de schutters op de muur
  const r = reachOf(st, nv, u, e) + (up ? 0.65 : 0);
  if (dist(u, e) <= r) { u.path = null; if (u.cd <= 0) hit(st, nv, u, e, bt); return 'hit'; }
  if (leash !== Infinity && SQ(e.x - u.hx) + SQ(e.y - u.hy) > leash * leash) return 'blocked';
  if (up) {
    const f = wallFoot(st, nv, u, e);
    if (!f) return 'blocked';
    return approach(st, nv, u, f.x, f.y, 0.05, spd) === 'blocked' ? 'blocked' : 'walk';
  }
  return approach(st, nv, u, e.x, e.y, r * 0.92, spd);
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

function fightWall(st, nv, u, w, bt, spd) {
  const wx = w.i + 0.5; const wy = w.j + 0.5;
  const r = reachOf(st, nv, u, { wall: true });
  if (SQ(u.x - wx) + SQ(u.y - wy) <= r * r) { u.path = null; if (u.cd <= 0) hit(st, nv, u, w, bt); return; }
  approach(st, nv, u, wx, wy, r * 0.9, spd);
}

// schieten: liefst op het doelwit van het regiment, anders op de dichtstbijzijnde vijand binnen bereik
function shoot(st, nv, u, alive, byId, bt, r, M) {
  let e = u.tg != null ? byId.get(u.tg) : null;
  if (e && (e.hp <= 0 || dist(u, e) > reachOf(st, nv, u, e) + 0.1)) e = null;
  if (!e && (st.n + u.id) % 3 === 0) {
    const reach = reachOf(st, nv, u, null);
    const tl = r.tr ? M.get(r.tr) : null;
    if (tl) { let bd = SQ(reach); for (const x of tl) { const d = SQ(x.x - u.x) + SQ(x.y - u.y); if (x.hp > 0 && d <= bd) { bd = d; e = x; } } }
    if (!e) e = pickEnemy(st, nv, u, alive, reach + 0.2);
  }
  u.tg = e ? e.id : null;
  if (!e) return false;
  if (dist(u, e) <= reachOf(st, nv, u, e) && u.cd <= 0) hit(st, nv, u, e, bt);
  return true;
}

// tegenstander in een gevecht van man tegen man: liefst iemand van het regiment dat je aanvalt,
// maar wie vlak naast je staat, krijgt eerst een klap
function pickFoe(st, nv, u, alive, r, M, uc) {
  const tl = r.tr ? M.get(r.tr) : null;
  let best = null; let bd = Infinity;
  if (tl) for (const e of tl) { if (e.hp <= 0) continue; const d = SQ(e.x - u.x) + SQ(e.y - u.y); if (d < bd && canHit(st, nv, u, e, uc)) { bd = d; best = e; } }
  const other = pickEnemy(st, nv, u, alive, 1.2);
  if (other && (!best || SQ(other.x - u.x) + SQ(other.y - u.y) < bd - 0.5)) best = other;
  return best || pickEnemy(st, nv, u, alive, 6);
}

// naar je plaats in de formatie (onderweg rond het vaandel, op je plek: je thuisplek)
function goSlot(st, nv, u, r, spd) {
  let tx; let ty;
  if (r.st === 'hold' || r.spread || r.st === 'wall') { tx = u.hx; ty = u.hy; } else {
    tx = r.x + r.fx * u.oa - r.fy * u.ob; ty = r.y + r.fy * u.oa + r.fx * u.ob;
    const tc = cellOf(st, tx, ty);
    // plaats in een gebouw of aan de andere kant van de muur: het vaandel volgen
    if (!standable(nv, u.s, u.k, tc) || (nv.ins && inner(nv, tc) !== sideAt(st, nv, r.x, r.y))) { tx = r.x; ty = r.y; }
  }
  const d2 = SQ(tx - u.x) + SQ(ty - u.y);
  if (d2 < 0.0036) { u.path = null; return; }
  const cu = FB.catchUp * (role(r.k) === 'inf' && TK(st, r.s, 'drill') ? 1.2 : 1);
  approach(st, nv, u, tx, ty, 0.05, spd * (r.st !== 'hold' && d2 > 0.25 ? cu : 1));
}

function actUnit(st, nv, u, alive, byId, bt, r, M) {
  if (u.cd > 0) u.cd -= FB.tick;
  if (u.mv) u.mv = u.mv > 0.02 ? R3(u.mv * 0.9) : 0;
  if (u.k === 'tower') {
    let e = u.tg != null ? byId.get(u.tg) : null;
    if (!e || e.hp <= 0 || dist(u, e) > TOWER.range) e = pickEnemy(st, nv, u, alive, TOWER.range);
    u.tg = e ? e.id : null;
    if (e && u.cd <= 0) hit(st, nv, u, e, bt);
    return;
  }
  if (!r) return;
  if (r.st === 'rout') { u.tg = null; approach(st, nv, u, r.x + ((u.id % 5) - 2) * 0.5, r.y + ((u.id % 3) - 1) * 0.5, 0.3, speedOf(u.k) * 1.15 * (r.sp || 1)); return; }
  const uc = cellOf(st, u.x, u.y);
  const ranged = isRangedK(u.k);
  const spd = speedOf(u.k) * (fxOf(r).speed || 1) * (r.sp || 1);
  let e = u.tg != null ? byId.get(u.tg) : null;
  if (e && e.hp <= 0) e = null;
  // A. op een muur of poort beuken (wie aangevallen wordt, verweert zich)
  if (r.st === 'wall') {
    const w = st.walls[r.tw];
    if (w && w.hp > 0) {
      if (!ranged && u.k !== 'ram') {
        if (e && dist(u, e) > FB.melee + 0.4) e = null;
        if (!e && (st.n + u.id) % 3 === 0) e = pickEnemy(st, nv, u, alive, FB.melee + 0.25);
        if (e) { u.tg = e.id; fightUnit(st, nv, u, e, Infinity, bt, spd); return; }
      }
      u.tg = null;
      fightWall(st, nv, u, w, bt, spd);
      return;
    }
  }
  // B. in het gevecht: elk zoekt een tegenstander (schutters schieten)
  if ((r.st === 'attack' || r.st === 'charge') && (r.eng || r.tu)) {
    if (r.tu) {
      const t = byId.get(r.tu);
      if (t && t.hp > 0 && canHit(st, nv, u, t, uc)) { u.tg = t.id; if (fightUnit(st, nv, u, t, Infinity, bt, spd) !== 'blocked') return; }
    } else if (ranged) {
      if (shoot(st, nv, u, alive, byId, bt, r, M)) return;
    } else {
      if (!e || (st.n + u.id) % 6 === 0) e = pickFoe(st, nv, u, alive, r, M, uc) || e;
      if (e) { u.tg = e.id; if (fightUnit(st, nv, u, e, Infinity, bt, spd) !== 'blocked') return; }
      u.tg = null;
    }
  } else if (!ranged && u.k !== 'ram') {
    // C. op je plek of onderweg: wie te dichtbij komt, krijgt klappen
    const holding = r.st === 'hold';
    const from = holding ? { x: u.hx, y: u.hy } : u;
    const R = holding ? FB.hold : FB.melee + 0.25;
    if (e && SQ(e.x - from.x) + SQ(e.y - from.y) > SQ(holding ? FB.leash : R + 0.5)) e = null;
    if (!e && (st.n + u.id) % 3 === 0) e = pickEnemy(st, nv, u, alive, R, from, holding && st.enc && u.s === 1);
    u.tg = e ? e.id : null;
    if (e && fightUnit(st, nv, u, e, holding ? FB.leash : Infinity, bt, spd) !== 'blocked') return;
    u.tg = null;
  } else if (r.st === 'hold' && ranged) {
    // schutters op hun plek schieten op wie binnen bereik komt
    if ((r.spread || SQ(u.x - u.hx) + SQ(u.y - u.hy) < 0.5) && shoot(st, nv, u, alive, byId, bt, r, M)) return;
  }
  // D. naar je plaats in de formatie
  goSlot(st, nv, u, r, spd);
}

// het vaandel een stap verder langs zijn route (wacht op wie achterop raakt). true = aangekomen
function advanceAnchor(st, r, list) {
  if (!r.path || !r.path.length) { r.path = null; return true; }
  let lag = 0;
  for (const u of list) { const p = slotPos(r, u); lag += Math.sqrt(SQ(u.x - p.x) + SQ(u.y - p.y)); }
  lag /= list.length;
  let sp = (r.pace || regSpeed(r)) * (FB.tick / 1000) * (lag > 2.4 ? 0.1 : lag > 1.2 ? 0.55 : 1);
  let x = r.x; let y = r.y;
  while (sp > 1e-9 && r.path.length) {
    const [px, py] = r.path[0]; const dx = px - x; const dy = py - y; const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= sp) { x = px; y = py; r.path.shift(); sp -= d; } else { x += (dx / d) * sp; y += (dy / d) * sp; sp = 0; }
  }
  r.x = R3(x); r.y = R3(y);
  if (!r.path.length) { r.path = null; return true; }
  return false;
}

// het dichtstbijzijnde vijandelijke regiment dat dit regiment kan bereiken
function nearestFoeReg(st, nv, r, list, M, c) {
  const lead = nearestTo(list, c); const lc = cellOf(st, lead.x, lead.y);
  const ranged = isRangedK(r.k);
  let best = null; let bd = Infinity;
  for (const o of st.regs) {
    if (o.s === r.s) continue;
    const ol = M.get(o.id);
    if (!ol || !ol.length) continue;
    const oc = centroid(ol); const d = Math.sqrt(SQ(oc.x - c.x) + SQ(oc.y - c.y)) + (o.st === 'rout' ? 6 : 0);
    if (d >= bd) continue;
    if (!ranged && !ol.some((e) => e.hp > 0 && canHit(st, nv, lead, e, lc))) continue;
    bd = d; best = { id: o.id, d };
  }
  return best;
}

// het vaandel achter het doelwit aan (route om de 10 tikken opnieuw)
function chase(st, nv, r, list, tc) {
  if (!r.path || r.rt == null || st.n - r.rt >= 10) {
    const a = cellOf(st, r.x, r.y);
    const from = standable(nv, r.s, r.k, a) ? { x: r.x, y: r.y } : nearestTo(list, { x: r.x, y: r.y });
    const lp = findPath(st, nv, r.s, r.k, from.x, from.y, tc.x, tc.y);
    r.rt = st.n;
    if (lp && lp.blk && !isRangedK(r.k) && r.s === 0 && st.walls.some((w) => w.hp > 0)) {
      // achter de muur: eerst een bres slaan
      const k = breachWall(st, nv, nearestTo(list, tc), tc);
      if (k >= 0) { regWall(r, k, 1); return; }
    }
    r.path = lp && lp.pts.length ? lp.pts.map((p) => [p[0], p[1]]) : [[R3(tc.x), R3(tc.y)]];
    if (from !== null && (from.x !== r.x || from.y !== r.y)) { r.x = R3(from.x); r.y = R3(from.y); }
  }
  advanceAnchor(st, r, list);
}

function regFight(st, nv, r, list, M, alive, byId) {
  const c = centroid(list);
  const ranged = isRangedK(r.k);
  if (r.tu) { const t = byId.get(r.tu); if (!t || t.hp <= 0) r.tu = 0; }
  if (r.tr && !(M.get(r.tr) || []).some((e) => e.hp > 0)) { r.tr = 0; r.eng = 0; }
  if (r.st === 'charge' && !r.tu && (!r.tr || (st.n + r.id) % 10 === 0)) {
    const nt = nearestFoeReg(st, nv, r, list, M, c);
    if (nt && nt.id !== r.tr) {
      const cur = r.tr ? centroid(M.get(r.tr)) : null;
      if (!cur || nt.d < Math.sqrt(SQ(cur.x - c.x) + SQ(cur.y - c.y)) - 2) { r.tr = nt.id; r.eng = 0; r.path = null; }
    }
  }
  if (!r.tr && !r.tu) {
    if (r.st === 'charge' && r.s === 0) {
      // stormloop zonder bereikbare vijand: naar het plein, en als dat achter de muur ligt eerst een bres slaan
      const lead = nearestTo(list, c); const lc = cellOf(st, lead.x, lead.y); const pc = cellOf(st, st.plaza.x, st.plaza.y);
      if (lc >= 0 && nv.lab0[lc] >= 0 && nv.lab0[lc] === nv.lab0[pc]) {
        if (role(r.k) !== 'siege') { const f = unitVec(st.plaza.x - c.x, st.plaza.y - c.y, { x: r.fx, y: r.fy }); regMove(st, nv, r, list, st.plaza.x, st.plaza.y, f.x, f.y, regSpeed(r)); }
        else reform(st, nv, r, list);
        return;
      }
      if (!ranged && st.walls.some((w) => w.hp > 0)) { const k = breachWall(st, nv, lead, st.plaza); if (k >= 0) { regWall(r, k, 1); return; } }
    }
    reform(st, nv, r, list);
    return;
  }
  const tgt = r.tu ? [byId.get(r.tu)] : M.get(r.tr).filter((e) => e.hp > 0);
  const tc = centroid(tgt);
  let near = Infinity;
  for (const u of list) for (const e of tgt) { const d = SQ(u.x - e.x) + SQ(u.y - e.y); if (d < near) near = d; }
  near = Math.sqrt(near);
  const f = unitVec(tc.x - c.x, tc.y - c.y, null);
  if (f && !r.eng) { r.fx = f.x; r.fy = f.y; }
  if (ranged) {
    // dichterbij tot de meeste schutters binnen bereik staan (niet enkel de voorste)
    let ok = 0;
    for (const u of list) {
      const rr = SQ(reachOf(st, nv, u, null) - 0.3);
      for (const e of tgt) if (SQ(u.x - e.x) + SQ(u.y - e.y) <= rr) { ok++; break; }
    }
    if (ok * 10 >= list.length * 7 || (r.eng && ok * 10 >= list.length * 3)) {
      if (!r.eng) { r.eng = 1; r.path = null; r.x = R3(c.x); r.y = R3(c.y); }
      return;
    }
    r.eng = 0;
    chase(st, nv, r, list, tc);
    return;
  }
  if (!r.eng && near <= FB.contact + (r.tu ? 0.6 : 0)) { r.eng = 1; r.path = null; }
  if (r.eng) { r.x = R3(c.x); r.y = R3(c.y); if (f) { r.fx = f.x; r.fy = f.y; } return; }
  chase(st, nv, r, list, tc);
}

// verzamelpunt voor wie vlucht: de aanvaller achter zijn opstelplaats, de verdediger aan de andere kant van de stad
// (binnen de muren als die er zijn)
function rallyPoint(st, r) {
  const f = r.s === 0 ? st.zmin + 7 : st.enc ? -3.5 : -8;
  const x = clampX(st, st.plaza.x + st.dir.x * f); const y = clampY(st, st.plaza.y + st.dir.y * f);
  if (r.s === 0 || !st.enc) return { x, y };
  const nv = nav(st);
  const c = nearestStand(st, nv, 1, r.k, x, y, (cc) => inside(nv, cc), 8);
  const q = cellXY(st, c);
  return { x: q.i + 0.5, y: q.j + 0.5 };
}

function regRout(st, r, list, M) {
  const c = centroid(list);
  resetReg(r);
  r.st = 'rout'; r.rq = 0;
  const p = rallyPoint(st, r);
  r.x = R3(p.x); r.y = R3(p.y);
  const f = unitVec(p.x - c.x, p.y - c.y, { x: -r.fx, y: -r.fy }); r.fx = f.x; r.fy = f.y;
  for (const u of list) { u.tg = null; u.path = null; u.np = 0; }
  // wie het ziet gebeuren, verliest ook wat moed
  for (const o of st.regs) {
    if (o === r || o.s !== r.s || o.st === 'rout') continue;
    const ol = M.get(o.id);
    if (!ol || !ol.length) continue;
    const oc = centroid(ol);
    if (SQ(oc.x - c.x) + SQ(oc.y - c.y) < 36) o.mo = R3(Math.max(0, (o.mo ?? 100) - moLoss(st, o, 8)));
  }
}

function regTick(st, nv, r, list, M, alive, byId) {
  const m = list.length;
  // moed: gesneuvelden kosten moed, rust geeft het langzaam terug
  if (r.mo == null) { r.mo = 100; r.m0 = m; r.ml = m; }
  if (m < r.ml) { r.mo = R3(Math.max(0, r.mo - moLoss(st, r, ((r.ml - m) * 100) / Math.max(1, r.m0)))); r.ml = m; }
  if (r.st === 'rout') {
    if ((st.n + r.id) % 5 === 0) {
      const near = list.some((u) => alive.some((e) => e.s !== r.s && e.hp > 0 && mobile(e) && SQ(e.x - u.x) + SQ(e.y - u.y) < 16));
      r.rq = near ? 0 : (r.rq || 0) + 5;
    }
    if (r.rq > 0) r.mo = R3(Math.min(100, r.mo + 0.25));
    // in een replay komt wie vlucht niet meer terug (de uitslag ligt vast)
    if (r.rq * FB.tick >= FB.rallyMs && r.mo >= FB.rally && !st.fate) { r.rq = 0; reform(st, nv, r, list); }
    r.m = m;
    return;
  }
  if (role(r.k) !== 'siege' && r.mo < FB.rout && (!st.fate || fateMayRout(st, r))) { regRout(st, r, list, M); r.m = m; return; }
  if (r.mo < 100 && !list.some((u) => fought(st, u, 3000))) r.mo = R3(Math.min(100, r.mo + 0.15));
  if (r.st === 'move') {
    if (r.rp) { r.rp = 0; regMove(st, nv, r, list, r.res ? r.rgx : r.gx, r.res ? r.rgy : r.gy, r.fx, r.fy, r.pace); return; }
    // vastgepind: veel soldaten in een gevecht van man tegen man → het regiment blijft staan en vecht
    if (role(r.k) !== 'siege') {
      let pinned = 0;
      for (const u of list) if (u.tg != null && fought(st, u, 1200)) pinned++;
      if (pinned * 5 >= m * 2) { reform(st, nv, r, list); return; }
    }
    if (advanceAnchor(st, r, list)) {
      r.st = 'hold';
      if (r.res && r.s === 0 && st.walls.some((w) => w.hp > 0)) {
        const k = breachWall(st, nv, nearestTo(list, { x: r.x, y: r.y }), { x: r.rgx, y: r.rgy });
        if (k >= 0) regWall(r, k, 0); else r.res = 0;
      }
    }
  } else if (r.st === 'wall') {
    const w = st.walls[r.tw];
    if (!w || w.hp <= 0) {
      if (r.res && r.rgx != null) regMove(st, nv, r, list, r.rgx, r.rgy, r.fx, r.fy, r.pace || regSpeed(r));
      else if (r.chg) regCharge(r);
      else reform(st, nv, r, list);
      return;
    }
    const c = centroid(list); r.x = R3(c.x); r.y = R3(c.y);
  } else if (r.st === 'attack' || r.st === 'charge') {
    regFight(st, nv, r, list, M, alive, byId);
  } else if (r.st === 'hold' && r.m !== m && !r.spread) {
    // gesneuvelden: de rijen sluiten (niet midden in een gevecht)
    if (!list.some((u) => fought(st, u))) reform(st, nv, r, list, { x: r.x, y: r.y });
    else return;
  }
  r.m = m;
}

// routes uitrekenen voor wie erop wacht (een paar per tik, om de beurt)
function planPaths(st, nv) {
  const need = st.units.filter((u) => u.np && u.hp > 0);
  if (!need.length) return;
  const start = st.n % need.length;
  for (let k = 0; k < Math.min(FB.paths, need.length); k++) {
    const u = need[(start + k) % need.length];
    u.np = 0; u.pt = st.n;
    const gx = u.pgx; const gy = u.pgy;
    if (gx == null) continue;
    const r = findPath(st, nv, u.s, u.k, u.x, u.y, gx, gy);
    u.path = r ? r.pts : null; u.blk = !!(r && r.blk);
    u.pgx = null; u.pgy = null;
  }
}

// ---------- de computer als bevelhebber ----------
function aiDefend(st, nv, alive, M) {
  const att = alive.filter((u) => u.s === 0);
  if (!att.length) return;
  const regs = st.regs.filter((r) => r.s === 1 && M.has(r.id) && r.st !== 'rout');
  const pc = cellOf(st, st.plaza.x, st.plaza.y);
  // de vijand kan tot op het plein (open stad of bres) en komt dichtbij: iedereen in de aanval
  const P = st.plaza; const R = st.kind === 'camp' ? 7 : 8;
  const breach = att.some((a) => { const c = cellOf(st, a.x, a.y); return c >= 0 && nv.lab0[c] >= 0 && nv.lab0[c] === nv.lab0[pc]; })
    && att.some((a) => SQ(a.x - P.x) + SQ(a.y - P.y) <= R * R || (st.enc && inside(nv, cellOf(st, a.x, a.y))));
  const cx = att.reduce((a, u) => a + u.x, 0) / att.length; const cy = att.reduce((a, u) => a + u.y, 0) / att.length;
  // welk muurstuk wordt het hardst aangevallen?
  const hits = new Map();
  for (const a of st.regs) if (a.s === 0 && a.st === 'wall' && st.walls[a.tw] && st.walls[a.tw].hp > 0 && M.has(a.id)) hits.set(a.tw, (hits.get(a.tw) || 0) + M.get(a.id).length * (role(a.k) === 'siege' ? 3 : 1));
  let focus = -1; let fv = 0;
  for (const [k, v] of hits) if (v > fv || (v === fv && k < focus)) { fv = v; focus = k; }
  const inRange = (list) => list.some((u) => att.some((a) => SQ(a.x - u.x) + SQ(a.y - u.y) <= SQ(reachOf(st, nv, u, null) + 0.5)));
  const toMove = [];
  for (const r of regs) {
    const list = M.get(r.id);
    if (r.spread) continue; // schutters op de muur blijven staan
    const ranged = isRangedK(r.k);
    if (breach) {
      if (!ranged && r.st !== 'charge' && r.st !== 'attack') regCharge(r);
      else if (ranged && r.st === 'hold' && !inRange(list)) regCharge(r);
      continue;
    }
    if (!ranged && focus >= 0 && r.af !== focus && r.st !== 'move') toMove.push(r);
  }
  if (toMove.length) {
    const w = st.walls[focus]; const b = behind(st, nv, w);
    const f = unitVec(w.i + 0.5 - b.x, w.j + 0.5 - b.y, st.dir);
    const dd = formDims(toMove[0].f, M.get(toMove[0].id).length, toMove[0].wid).d / 2;
    const side = sideAt(st, nv, b.x, b.y);
    for (const p of groupPlan(toMove, M, b.x - f.x * dd, b.y - f.y * dd, f.x, f.y)) { regMove(st, nv, p.r, M.get(p.r.id), p.x, p.y, f.x, f.y, regSpeed(p.r), side); p.r.af = focus; }
  }
  if (focus >= 0) st.aiF = focus;
  // schutters op de muur zonder doelwit verhuizen naar de muur waar de vijand is
  if (st.enc && (st.n / FB.ai) % 3 === 0) {
    const idle = regs.filter((r) => r.spread && isRangedK(r.k) && climbs(r.k) && r.st === 'hold' && !inRange(M.get(r.id)));
    for (const r of idle.slice(0, 1)) {
      const list = M.get(r.id);
      const free = st.walls.filter((w) => w.hp > 0 && !w.g)
        .map((w) => ({ w, d: SQ(w.i + 0.5 - cx) + SQ(w.j + 0.5 - cy) }))
        .filter(({ w }) => !alive.some((u) => u.s === 1 && Math.floor(u.hx) === w.i && Math.floor(u.hy) === w.j))
        .sort((a, b) => a.d - b.d || a.w.i - b.w.i || a.w.j - b.w.j);
      if (free.length && free[0].d < SQ(FB.ranged + FB.wallRange + 2)) {
        const w = free[0].w;
        spreadOnWall(st, nv, [r], M, cellOf(st, w.i + 0.5, w.j + 0.5), w.i + 0.5, w.j + 0.5, false);
        void list;
      }
    }
  }
}

function aiAttack(st, nv, alive, M) {
  const regs = st.regs.filter((r) => r.s === 0 && M.has(r.id) && r.st !== 'rout');
  if (!regs.length) return;
  const pc = cellOf(st, st.plaza.x, st.plaza.y);
  const open = !st.walls.some((w) => w.hp > 0) || alive.some((a) => { if (a.s !== 0) return false; const c = cellOf(st, a.x, a.y); return c >= 0 && nv.lab0[c] >= 0 && nv.lab0[c] === nv.lab0[pc]; });
  if (open) {
    for (const r of regs) {
      if (role(r.k) !== 'siege') { if (r.st === 'hold' || r.st === 'wall') regCharge(r); continue; }
      // belegeringstuig zonder muren: de torens slopen, anders naar het plein
      if (r.st !== 'hold' && !(r.st === 'wall' && st.walls[r.tw] && st.walls[r.tw].hp > 0)) continue;
      const list = M.get(r.id); const c = centroid(list);
      let tw = null; let td = Infinity;
      for (const u of alive) if (u.k === 'tower' && u.hp > 0) { const d = SQ(u.x - c.x) + SQ(u.y - c.y); if (d < td) { td = d; tw = u; } }
      if (tw) regAttack(r, tw);
      else if (SQ(c.x - st.plaza.x) + SQ(c.y - st.plaza.y) > 4) { const f = unitVec(st.plaza.x - c.x, st.plaza.y - c.y, { x: r.fx, y: r.fy }); regMove(st, nv, r, list, st.plaza.x, st.plaza.y, f.x, f.y, regSpeed(r)); }
    }
    return;
  }
  // muren dicht: rammen op de poort, voetvolk ervoor in slagorde (of zelf op de muur beuken), schutters schieten
  const siege = regs.filter((r) => role(r.k) === 'siege');
  let focus = -1;
  for (const r of siege) {
    if (r.st === 'wall' && st.walls[r.tw] && st.walls[r.tw].hp > 0) { if (focus < 0) focus = r.tw; continue; }
    const k = breachWall(st, nv, M.get(r.id)[0], st.plaza);
    if (k >= 0) { regWall(r, k, 1); if (focus < 0) focus = k; }
  }
  const escort = [];
  for (const r of regs) {
    const ro = role(r.k);
    if (ro === 'siege' || r.st === 'move' || r.st === 'attack' || (r.st === 'wall' && st.walls[r.tw] && st.walls[r.tw].hp > 0)) continue;
    if (ro === 'rng') { if (r.st !== 'charge') regCharge(r); continue; }
    if (r.st === 'charge') continue;
    if (ro === 'cav' && siege.length) continue; // ruiters wachten op een bres
    if (focus >= 0) { if (r.esc !== focus) escort.push(r); continue; }
    const k = breachWall(st, nv, M.get(r.id)[0], st.plaza);
    if (k >= 0) regWall(r, k, 1);
  }
  if (escort.length) {
    const w = st.walls[focus];
    const x = w.i + 0.5 + st.dir.x * 3; const y = w.j + 0.5 + st.dir.y * 3;
    const f = { x: -st.dir.x, y: -st.dir.y };
    for (const p of groupPlan(escort, M, x, y, f.x, f.y)) { regMove(st, nv, p.r, M.get(p.r.id), p.x, p.y, f.x, f.y, regSpeed(p.r), nv.ins ? false : null); p.r.esc = focus; }
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
    if ((st.ready[0] && st.ready[1]) || st.n * FB.tick >= FB.deployMs) { st.phase = 'battle'; st.ph1 = st.n; }
    return;
  }
  let nv = nav(st);
  const alive = st.units.filter((u) => u.hp > 0);
  const byId = new Map(alive.map((u) => [u.id, u]));
  const M = membersMap(st);
  if (st.fate) fateTick(st, M);
  if (st.ai[1] && (st.n - st.ph1) % FB.ai === 0) aiDefend(st, nv, alive, M);
  if (st.ai[0] && (st.n - st.ph1) % FB.ai === 5) aiAttack(st, nv, alive, M);
  for (const r of st.regs) {
    const list = M.get(r.id);
    if (!list) continue;
    regTick(st, nv, r, list, M, alive, byId);
    if (st.nv !== nv.nv) nv = nav(st);
  }
  planPaths(st, nv);
  if (TK(st, 1, 'pitch') && (st.n - st.ph1) % 20 === 10) pourPitch(st, alive, bt);
  for (const u of alive) {
    if (u.hp <= 0) continue;
    actUnit(st, nv, u, alive, byId, bt, regOf(st, u), M);
    if (st.nv !== nv.nv) nv = nav(st);
  }
  separate(st, nv, alive);
  st.n++;
  st.t = st.t0 + st.n * FB.tick;
  judge(st, nv);
}

// kokende pek: om de 2 s krijgt wie (van de aanvaller) tegen een poort staat, schade. g.pt = tijdstip (voor de browser)
function pourPitch(st, alive, bt) {
  for (const g of st.walls) {
    if (!g.g || g.hp <= 0) continue;
    const gx = g.i + 0.5; const gy = g.j + 0.5;
    let any = false;
    for (const u of alive) {
      if (u.s !== 0 || u.hp <= 0 || !mobile(u) || SQ(u.x - gx) + SQ(u.y - gy) > 2.89) continue;
      u.hp = R3(Math.max(0, u.hp - (st.fate ? fateDmg(st, 1, u, 4 * aliveN(u)) : 4 * aliveN(u))));
      if (u.hp <= 0) u.died = bt;
      any = true;
    }
    if (any) g.pt = bt;
  }
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
      const fa = fought(st, a) ? 0.3 : 1; const fb = fought(st, b) ? 0.3 : 1;
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
  let attFled = 0; let defFled = 0;
  for (const u of st.units) {
    if (u.hp <= 0) continue;
    const fled = u.sq && st.regs[u.sq - 1] && st.regs[u.sq - 1].st === 'rout';
    if (u.s === 0) { att++; if (fled) attFled++; else if (SQ(u.x - P.x) + SQ(u.y - P.y) <= SQ(FB.capR)) attNear++; }
    else if (mobile(u)) { def++; if (fled) defFled++; else if (SQ(u.x - P.x) + SQ(u.y - P.y) <= SQ(FB.capR + 1.5)) defNear++; } else towers++;
  }
  void nv;
  if (st.fate) { judgeFate(st, att, attFled, attNear, def, defFled, towers); return; }
  if (attNear && !defNear) st.cap += FB.tick; else st.cap = Math.max(0, st.cap - FB.tick);
  // een leger dat helemaal op de vlucht slaat, heeft verloren (zoals in Rome: Total War)
  if (!att || attFled === att) st.over = 1;
  else if ((!def || defFled === def) && (!towers || attNear || def)) st.over = 0;
  else if (st.cap >= FB.capMs) st.over = 0;
  else if ((st.n - st.ph1) * FB.tick >= FB.maxMs) st.over = 1;
}

// replay: enkel de echte winnaar kan winnen, en pas als de verliezer zoveel verloor als in het rapport
// (wie vlucht, wordt eerst nog neergehaald: zie fateTick)
function judgeFate(st, att, attFled, attNear, def, defFled, towers) {
  const f = st.fate; const W = f.win;
  const done = Object.keys(f.hp).every((k) => k.charCodeAt(0) !== 49 - W || f.hp[k] <= f.floor[k] + 0.01);
  if (W === 0) {
    if (!att || ((!def || (defFled === def && done)) && (!towers || attNear || def))) st.over = 0;
  } else if (!att || (attFled === att && done) || (!def && !towers)) st.over = 1;
  if (st.over == null && (st.n - st.ph1) * FB.tick >= FATE.end) st.over = W;
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

// enkel voor de tests
export const _t = { damage: (st, u, e) => damage(st, nav(st), u, e) };
