// Wereldkaart als vloeiend landschap: een fijn hoogteveld (zelfde terrein als worldgen.js) met licht,
// slagschaduw van bergen, stranden, ondiep en diep water, akkers en wegen rond de steden en dichte bossen.
// Het reliëf wordt kolom per kolom getekend ('voxel space'): van voor naar achter, zodat heuvels en bergen
// echt hoog staan zonder blokjes. Alles gebeurt één keer (bij het laden van de kaart) in een afbeelding.
import { fieldAt, teamRegions, fbm, hash2, T } from '../shared/worldgen.js';
import * as NAT from './nature.js';
import * as A from './art.js';

export const WTW = 40;
export const WTH = 20;
export const TOP = 96; // ruimte bovenaan voor bergen
const BOTTOM = 40;
const SKIRT = 14; // dikte van de rand van de kaart
const SEA = 0.37;
const TILE_PX = Math.hypot(WTW / 2, WTH / 2); // lengte van een tegelzijde in pixels (voor hellingen)

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// kleuren (rgb)
const K = {
  deep: hex('#1b4f86'), mid: hex('#2a6fa8'), shallow: hex('#3f97c4'), turq: hex('#6cc3cf'),
  sand: hex('#e4cf93'), wet: hex('#bda772'),
  grassA: hex('#5e9a39'), grassB: hex('#8abb4f'), lush: hex('#4c8a30'), dry: hex('#b2b55e'),
  forest: hex('#2f5b22'), forestB: hex('#3d6b2a'),
  hill: hex('#8f9a55'), hillB: hex('#a39568'),
  rockA: hex('#91887a'), rockB: hex('#b7ad9b'), rockC: hex('#7a7064'),
  snow: hex('#f1f4f7'), snowShade: hex('#c9d4e2'),
  dirt: hex('#a58b5c'), skirt: hex('#16406b'),
};

// lichtrichting zoals in de stad: zon links op het scherm (in tegelruimte -x), schaduw valt naar rechts
const LX = -0.62; const LY = 0.06; const LZ = 0.75;
const LN = Math.hypot(LX, LY, LZ);
const L = [LX / LN, LY / LN, LZ / LN];
const SUN_TAN = L[2] / Math.hypot(L[0], L[1]);

// eenvoudige A* over de tegels, voor wegen tussen steden
function roadPath(tiles, size, a, b) {
  const cost = (t) => (t <= T.SHALLOW ? Infinity : t === T.SAND ? 1.4 : t === T.GRASS ? 1 : t === T.FOREST ? 1.9 : t === T.HILL ? 2.6 : 9);
  const n = size * size;
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = []; // [f, idx]
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1; const r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } }
    return top;
  };
  const s = a.y * size + a.x; const t = b.y * size + b.x;
  g[s] = 0; push(0, s);
  const hcost = (i) => Math.hypot((i % size) - b.x, Math.floor(i / size) - b.y);
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === t) break;
    const x = i % size; const y = (i - x) / size;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx;
        const c = cost(tiles[j]) * (dx && dy ? 1.42 : 1);
        if (c === Infinity || closed[j]) continue;
        if (dx && dy && (tiles[y * size + nx] <= T.SHALLOW || tiles[ny * size + x] <= T.SHALLOW)) continue;
        const ng = g[i] + c;
        if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + hcost(j), j); }
      }
    }
  }
  if (from[t] < 0) return null;
  const path = [];
  for (let i = t; i >= 0; i = from[i]) { path.push([(i % size) + 0.5, Math.floor(i / size) + 0.5]); if (i === s) break; }
  return path.reverse();
}

function chaikin(pts, it) {
  for (let k = 0; k < it; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// bomen van de stadsweergave, klein op de kaart
let treeSprites = null;
const trees = () => (treeSprites ||= Array.from({ length: NAT.TREE_COUNT }, (_, k) => NAT.treeSprite(k)));

export function bakeWorld({ seed, size, tiles, towns, camps, scale, R }) {
  const t0 = performance.now();
  const N = size * R;
  const regions = teamRegions(seed, size);
  const E = new Float32Array(N * N);
  const M = new Float32Array(N * N);
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      const gx = (u + 0.5) / R; const gy = (v + 0.5) / R;
      const [e, m] = fieldAt(seed, size, regions, gx - 0.5, gy - 0.5);
      E[v * N + u] = e; M[v * N + u] = m;
    }
  }
  const places = [
    ...towns.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5, r0: 1.05, r1: 2.0, town: true, id: t.id })),
    ...camps.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5, r0: 0.55, r1: 1.2, town: false, id: c.id })),
  ];
  // steden en kampen staan altijd op droog land
  for (const p of places) {
    const r = p.r1 * R;
    for (let v = Math.max(0, Math.floor(p.y * R - r)); v < Math.min(N, Math.ceil(p.y * R + r)); v++) {
      for (let u = Math.max(0, Math.floor(p.x * R - r)); u < Math.min(N, Math.ceil(p.x * R + r)); u++) {
        const d = Math.hypot((u + 0.5) / R - p.x, (v + 0.5) / R - p.y);
        const w = 1 - sstep(p.r0 * 0.7, p.r1, d);
        const i = v * N + u;
        if (E[i] < 0.45) E[i] += (0.45 - E[i]) * w;
        if (p.town && E[i] > 0.7) E[i] += (0.7 - E[i]) * w;
      }
    }
  }

  // open plekken rond steden en kampen (geen bos, geen bomen)
  const CLR = new Float32Array(N * N).fill(1);
  for (const p of places) {
    const r1 = p.town ? 2.9 : 1.4; const r0 = p.town ? 1.9 : 0.8;
    for (let v = Math.max(0, Math.floor((p.y - r1) * R)); v < Math.min(N, Math.ceil((p.y + r1) * R)); v++) {
      for (let u = Math.max(0, Math.floor((p.x - r1) * R)); u < Math.min(N, Math.ceil((p.x + r1) * R)); u++) {
        const d = Math.hypot((u + 0.5) / R - p.x, (v + 0.5) / R - p.y);
        if (d < r1) CLR[v * N + u] *= sstep(r0, r1, d);
      }
    }
  }

  // hoogteveld (pixels)
  const H = new Float32Array(N * N);
  let maxH = 0;
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      const i = v * N + u; const e = E[i];
      if (e <= SEA) continue;
      const gx = (u + 0.5) / R; const gy = (v + 0.5) / R;
      let h = (e - SEA) * 22;
      const k = e - 0.7; if (k > 0) h += k * k * 260;
      const mw = sstep(0.74, 0.95, e);
      if (mw > 0) { const rn = 1 - Math.abs(fbm(gx * 0.85, gy * 0.85, seed + 77, 3) * 2 - 1); h += mw * rn * rn * 20; }
      h += (fbm(gx * 1.7, gy * 1.7, seed + 78, 2) - 0.5) * 2.4 * sstep(SEA, 0.46, e);
      H[i] = Math.max(0, h);
      if (H[i] > maxH) maxH = H[i];
    }
  }
  // vlakke plek onder steden en kampen
  for (const p of places) {
    const r = p.r1 * R;
    const cu = Math.min(N - 1, Math.floor(p.x * R)); const cv = Math.min(N - 1, Math.floor(p.y * R));
    const hc = Math.max(1.5, H[cv * N + cu]);
    p.h = hc;
    for (let v = Math.max(0, Math.floor(p.y * R - r)); v < Math.min(N, Math.ceil(p.y * R + r)); v++) {
      for (let u = Math.max(0, Math.floor(p.x * R - r)); u < Math.min(N, Math.ceil(p.x * R + r)); u++) {
        const d = Math.hypot((u + 0.5) / R - p.x, (v + 0.5) / R - p.y);
        const w = 1 - sstep(p.r0, p.r1, d);
        const i = v * N + u;
        if (w > 0) H[i] = H[i] * (1 - w) + hc * w;
      }
    }
  }

  // akkers, wegen en aangestampte aarde: in tegelruimte op een hulpcanvas
  const ov = document.createElement('canvas');
  ov.width = N; ov.height = N;
  const oc = ov.getContext('2d');
  oc.scale(R, R);
  // akkers: een lappendeken van percelen rond elke stad
  const CROPS = ['#d9b64a', '#cfa83c', '#e2c766', '#97ba4c', '#80aa3f', '#a7804b', '#8f6c40', '#b9c56a', '#c9b45a'];
  const fields = [];
  for (const p of places) {
    if (!p.town) continue;
    const cell = 0.5;
    for (let j = -6; j < 6; j++) {
      for (let i = -6; i < 6; i++) {
        const cx = p.x + (i + 0.5) * cell; const cy = p.y + (j + 0.5) * cell;
        const d = Math.hypot(cx - p.x, cy - p.y);
        if (d < 1.15 || d > 2.95) continue;
        const r = hash2(p.id * 31 + i, j, seed + 4);
        if (r > 0.25 + (2.95 - d) * 0.4) continue;
        const iu = Math.floor(cx * R); const iv = Math.floor(cy * R);
        if (iu < 0 || iv < 0 || iu >= N || iv >= N) continue;
        const e = E[iv * N + iu];
        if (e < 0.425 || e > 0.7) continue;
        if (places.some((q) => !q.town && Math.hypot(q.x - cx, q.y - cy) < 1.3)) continue;
        const w = cell * (0.84 + hash2(i, j, seed + p.id) * 0.14); const h = cell * (0.84 + hash2(j, i, seed + p.id) * 0.14);
        const col = CROPS[Math.floor(hash2(p.id + i * 3, j * 5, seed + 9) * CROPS.length)];
        const f = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, col, along: hash2(i, j, seed + 7 + p.id) < 0.5 };
        fields.push(f);
        oc.fillStyle = col; oc.globalAlpha = 0.75;
        oc.fillRect(f.x0, f.y0, w, h);
        oc.globalAlpha = 1;
      }
    }
  }
  // wegen tussen steden (elk naar de twee dichtstbijzijnde)
  const pairs = new Set();
  const roads = [];
  for (const a of towns) {
    const near = towns.filter((b) => b !== a).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 2);
    for (const b of near) {
      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const path = roadPath(tiles, size, a, b);
      if (path && path.length > 2) roads.push(chaikin(path, 3));
    }
  }
  oc.lineCap = 'round'; oc.lineJoin = 'round';
  for (const [w, col] of [[0.2, 'rgba(120,96,58,0.85)'], [0.13, 'rgba(176,146,96,0.95)'], [0.04, 'rgba(206,182,132,0.6)']]) {
    oc.strokeStyle = col; oc.lineWidth = w;
    for (const r of roads) { oc.beginPath(); oc.moveTo(r[0][0], r[0][1]); for (const q of r.slice(1)) oc.lineTo(q[0], q[1]); oc.stroke(); }
  }
  for (const p of places) {
    const rr = p.town ? 1.0 : 0.62;
    const gr = oc.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
    const c = p.town ? '165,139,92' : '128,104,70';
    gr.addColorStop(0, `rgba(${c},0.92)`); gr.addColorStop(0.65, `rgba(${c},0.7)`); gr.addColorStop(1, `rgba(${c},0)`);
    oc.fillStyle = gr; oc.beginPath(); oc.arc(p.x, p.y, rr, 0, Math.PI * 2); oc.fill();
  }
  const ovd = oc.getImageData(0, 0, N, N).data;

  // kleuren en licht per texel
  const CR = new Float32Array(N * N); const CG = new Float32Array(N * N); const CB = new Float32Array(N * N);
  const FW = new Float32Array(N * N); // hoeveel bos
  const c = [0, 0, 0];
  const set = (k) => { c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; };
  const mixc = (k, t) => { if (t <= 0) return; if (t > 1) t = 1; c[0] += (k[0] - c[0]) * t; c[1] += (k[1] - c[1]) * t; c[2] += (k[2] - c[2]) * t; };
  const hstep = TILE_PX / R; // afstand tussen texels in pixels
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      const i = v * N + u; const e = E[i]; const h = H[i];
      const gx = (u + 0.5) / R; const gy = (v + 0.5) / R;
      const fine = hash2(u, v, seed + 99) - 0.5;
      // helling
      const hl = H[v * N + Math.max(0, u - 1)]; const hr = H[v * N + Math.min(N - 1, u + 1)];
      const hu = H[Math.max(0, v - 1) * N + u]; const hd = H[Math.min(N - 1, v + 1) * N + u];
      const sx = (hr - hl) / (2 * hstep); const sy = (hd - hu) / (2 * hstep);
      const slope = Math.hypot(sx, sy);
      let shadeF = 1;
      if (e < SEA) {
        const d = SEA - e;
        if (d < 0.03) { set(K.turq); mixc(K.shallow, d / 0.03); } else { set(K.shallow); mixc(K.mid, sstep(0.03, 0.11, d)); mixc(K.deep, sstep(0.1, 0.3, d)); }
        const rip = fbm(gx * 2.2 + gy * 0.6, gy * 3.4, seed + 31, 2) - 0.5;
        const k2 = 1 + rip * 0.1 + fine * 0.015;
        c[0] *= k2; c[1] *= k2; c[2] *= k2;
        if (d < 0.007) mixc([250, 252, 245], 0.6 * (1 - d / 0.007)); // schuim
        FW[i] = 0;
      } else {
        const n1 = fbm(gx / 3.2, gy / 3.2, seed + 90, 3); const n2 = fbm(gx * 1.1, gy * 1.1, seed + 91, 2);
        set(K.grassA); mixc(K.grassB, (n1 - 0.32) * 2.1);
        mixc(K.dry, sstep(0.6, 0.74, n2) * 0.55);
        mixc(K.lush, sstep(0.55, 0.7, 1 - n1) * 0.5);
        // bos
        const m = M[i];
        let fw = sstep(0.535, 0.575, m + (n2 - 0.5) * 0.04) * (1 - sstep(0.69, 0.74, e)) * sstep(0.41, 0.44, e);
        fw *= CLR[i];
        FW[i] = fw;
        mixc(K.forest, fw * 0.9); mixc(K.forestB, fw * n2 * 0.4);
        // heuvels en bergen
        mixc(K.hill, sstep(0.7, 0.76, e) * 0.85);
        mixc(K.hillB, sstep(0.74, 0.8, e) * n2 * 0.6);
        const rockT = Math.max(sstep(0.79, 0.85, e), sstep(0.55, 1.0, slope) * sstep(0.7, 0.78, e));
        if (rockT > 0) {
          const strata = 0.5 + 0.5 * Math.sin(h * 0.55 + fbm(gx * 0.9, gy * 0.9, seed + 92, 2) * 9);
          const rc = [K.rockA[0] + (K.rockB[0] - K.rockA[0]) * strata, K.rockA[1] + (K.rockB[1] - K.rockA[1]) * strata, K.rockA[2] + (K.rockB[2] - K.rockA[2]) * strata];
          mixc(rc, rockT);
          mixc(K.rockC, rockT * sstep(0.9, 1.6, slope) * 0.6);
        }
        const snow = sstep(34, 42, h + (n2 - 0.5) * 14) * (1 - sstep(1.1, 1.7, slope));
        mixc(K.snow, snow);
        // strand
        const beach = 1 - sstep(0.4, 0.425, e + (n2 - 0.5) * 0.012);
        mixc(K.sand, beach);
        mixc(K.wet, (1 - sstep(SEA, SEA + 0.008, e)) * 0.7);
        // akkers, wegen, aarde
        const oa = ovd[i * 4 + 3] / 255;
        if (oa > 0) mixc([ovd[i * 4], ovd[i * 4 + 1], ovd[i * 4 + 2]], oa * (1 - beach * 0.6));
        // fijne korrel
        const k2 = 1 + fine * 0.05 + (n2 - 0.5) * 0.06;
        c[0] *= k2; c[1] *= k2; c[2] *= k2;
        // licht: normaal uit de helling
        const nx = -sx * 1.25; const ny = -sy * 1.25; const nl = Math.hypot(nx, ny, 1);
        const dif = (nx * L[0] + ny * L[1] + L[2]) / nl;
        shadeF = Math.min(1.3, Math.max(0.55, 1 + (dif - L[2]) * 1.5));
        if (snow > 0.5) shadeF = 1 + (shadeF - 1) * 0.8;
      }
      // slagschaduw van heuvels en bergen
      if (maxH > h + 2) {
        const dx = -L[0] / Math.hypot(L[0], L[1]); const dy = -L[1] / Math.hypot(L[0], L[1]);
        let occ = 0;
        const steps = Math.ceil((maxH - h) / (SUN_TAN * hstep)) + 1;
        for (let s = 1; s <= steps; s++) {
          const uu = Math.round(u - dx * s * 1); const vv = Math.round(v - dy * s * 1);
          if (uu < 0 || vv < 0 || uu >= N || vv >= N) break;
          const over = H[vv * N + uu] - (h + s * hstep * SUN_TAN);
          if (over > occ) occ = over;
        }
        if (occ > 0) shadeF *= 1 - 0.3 * sstep(0, 4, occ);
      }
      CR[i] = c[0] * shadeF; CG[i] = c[1] * shadeF; CB[i] = c[2] * shadeF;
    }
  }
  const t1 = performance.now();

  // ---- weergave: kolom per kolom, van voor naar achter ----
  const W = size * WTW; const HH = size * WTH + TOP + BOTTOM;
  const ow = Math.round(W * scale); const oh = Math.round(HH * scale);
  const cv = document.createElement('canvas');
  cv.width = ow; cv.height = oh;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(ow, oh);
  const buf = new Uint32Array(img.data.buffer);
  const landImg = ctx.createImageData(ow, oh); // masker: waar land te zien is (voor de korrel)
  const land = new Uint32Array(landImg.data.buffer);
  const NT = new Float32Array(64 * 64);
  for (let k = 0; k < NT.length; k++) NT[k] = (hash2(k & 63, k >> 6, seed + 5) - 0.5) * 0.06;
  const halfW = WTW / 2; const halfH = WTH / 2;
  const ds = 0.9 / (halfH * scale);
  const lim = N - 1.0001;
  let sr = 0; let sg = 0; let sb = 0; let sh = 0;
  const sample = (gx, gy) => {
    let fu = gx * R - 0.5; let fv = gy * R - 0.5;
    fu = fu < 0 ? 0 : fu > lim ? lim : fu; fv = fv < 0 ? 0 : fv > lim ? lim : fv;
    const iu = fu | 0; const iv = fv | 0; const ax = fu - iu; const ay = fv - iv;
    const i00 = iv * N + iu; const i10 = i00 + 1; const i01 = i00 + N; const i11 = i01 + 1;
    const w00 = (1 - ax) * (1 - ay); const w10 = ax * (1 - ay); const w01 = (1 - ax) * ay; const w11 = ax * ay;
    sh = H[i00] * w00 + H[i10] * w10 + H[i01] * w01 + H[i11] * w11;
    sr = CR[i00] * w00 + CR[i10] * w10 + CR[i01] * w01 + CR[i11] * w11;
    sg = CG[i00] * w00 + CG[i10] * w10 + CG[i01] * w01 + CG[i11] * w11;
    sb = CB[i00] * w00 + CB[i10] * w10 + CB[i01] * w01 + CB[i11] * w11;
  };
  const pack = (r, g, b, n) => {
    r *= 1 + n; g *= 1 + n; b *= 1 + n;
    return (255 << 24) | ((b > 255 ? 255 : b < 0 ? 0 : b) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g) << 8) | (r > 255 ? 255 : r < 0 ? 0 : r);
  };
  for (let px = 0; px < ow; px++) {
    const wx = (px + 0.5) / scale - W / 2;
    const cc = wx / halfW; // gx - gy
    const ac = Math.abs(cc);
    if (ac >= size) continue;
    const smin = ac; const smax = 2 * size - ac;
    // rand van de kaart (dwarsdoorsnede)
    sample((smax + cc) / 2, (smax - cc) / 2);
    const yTop = Math.floor((smax * halfH - sh + TOP) * scale);
    const yBot = Math.min(oh, Math.floor((smax * halfH + SKIRT + TOP) * scale));
    for (let y = Math.max(0, yTop); y < yBot; y++) {
      const t = (y - yTop) / Math.max(1, yBot - yTop);
      const k = sh > 0.5 ? 0.62 - t * 0.25 : 0.85 - t * 0.35;
      const base = sh > 0.5 ? [110, 84, 52] : K.skirt;
      buf[y * ow + px] = pack(base[0] * k, base[1] * k, base[2] * k, 0);
    }
    let ybuf = Math.max(0, yTop);
    let pr = sr; let pg = sg; let pb = sb;
    for (let s = smax; s >= smin; s -= ds) {
      const gx = (s + cc) * 0.5; const gy = (s - cc) * 0.5;
      sample(gx, gy);
      const y = Math.floor((s * halfH - sh + TOP) * scale);
      if (y < ybuf) {
        const y0 = y < 0 ? 0 : y;
        const span = ybuf - y0;
        for (let yy = y0; yy < ybuf; yy++) {
          const n = NT[((yy & 63) << 6) | (px & 63)];
          if (span > 2) {
            const t = (yy - y0) / span; // 0 boven, 1 onder
            buf[yy * ow + px] = pack(sr + (pr - sr) * t, sg + (pg - sg) * t, sb + (pb - sb) * t, n - t * 0.05);
          } else buf[yy * ow + px] = pack(sr, sg, sb, n);
          if (sh > 0.05) land[yy * ow + px] = 0xffffffff;
        }
        ybuf = y0;
        if (ybuf <= 0) break;
      }
      pr = sr; pg = sg; pb = sb;
    }
  }
  ctx.putImageData(img, 0, 0);
  const landCv = document.createElement('canvas');
  landCv.width = ow; landCv.height = oh;
  landCv.getContext('2d').putImageData(landImg, 0, 0);
  const t2 = performance.now();

  // hoogte op een punt (pixels), voor steden, legers en bomen
  const hAt = (gx, gy) => {
    let fu = gx * R - 0.5; let fv = gy * R - 0.5;
    fu = fu < 0 ? 0 : fu > lim ? lim : fu; fv = fv < 0 ? 0 : fv > lim ? lim : fv;
    const iu = fu | 0; const iv = fv | 0; const ax = fu - iu; const ay = fv - iv;
    const i00 = iv * N + iu;
    return (H[i00] * (1 - ax) + H[i00 + 1] * ax) * (1 - ay) + (H[i00 + N] * (1 - ax) + H[i00 + N + 1] * ax) * ay;
  };
  const fwAt = (gx, gy) => {
    const u = Math.min(N - 1, Math.max(0, Math.floor(gx * R))); const v = Math.min(N - 1, Math.floor(gy * R));
    return FW[Math.max(0, v) * N + u];
  };
  const eAt = (gx, gy) => {
    const u = Math.min(N - 1, Math.max(0, Math.floor(gx * R))); const v = Math.min(N - 1, Math.max(0, Math.floor(gy * R)));
    return E[v * N + u];
  };
  const ovA = (gx, gy) => {
    const u = Math.min(N - 1, Math.max(0, Math.floor(gx * R))); const v = Math.min(N - 1, Math.max(0, Math.floor(gy * R)));
    return ovd[(v * N + u) * 4 + 3] / 255;
  };
  // staat het punt achter een heuvel (vanuit de kijker)?
  const hidden = (gx, gy, h0) => {
    const s0 = gx + gy; const c0 = gx - gy;
    for (let s = s0 + 0.15; s < s0 + 2 * (maxH + 4) / WTH; s += 0.12) {
      const x = (s + c0) / 2; const y = (s - c0) / 2;
      if (x >= size || y >= size) break;
      if (hAt(x, y) - (s - s0) * halfH > h0 + 1.5) return true;
    }
    return false;
  };

  // ---- versiering: akkers, wegen, bossen, losse bomen, rotsen ----
  ctx.setTransform(scale, 0, 0, scale, (W / 2) * scale, TOP * scale);
  // fijne korrel op de hele kaart (scherper bij inzoomen)
  {
    const tex = NAT.groundTexture('grass', 128);
    const tmp = document.createElement('canvas');
    tmp.width = ow; tmp.height = oh;
    const t2 = tmp.getContext('2d');
    t2.fillStyle = t2.createPattern(tex, 'repeat');
    t2.fillRect(0, 0, ow, oh);
    t2.globalCompositeOperation = 'destination-in';
    t2.drawImage(landCv, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.34;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }
  const tg = performance.now();
  const proj = (gx, gy) => { const h = hAt(gx, gy); return [(gx - gy) * halfW, (gx + gy) * halfH - h]; };
  for (const f of fields) {
    if (hidden((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, hAt((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2))) continue;
    const c00 = proj(f.x0, f.y0); const c10 = proj(f.x1, f.y0); const c11 = proj(f.x1, f.y1); const c01 = proj(f.x0, f.y1);
    ctx.beginPath(); ctx.moveTo(...c00); ctx.lineTo(...c10); ctx.lineTo(...c11); ctx.lineTo(...c01); ctx.closePath();
    const g = ctx.createLinearGradient(c00[0], c00[1], c11[0], c11[1]);
    g.addColorStop(0, A.shade(f.col, 0.08)); g.addColorStop(1, A.shade(f.col, -0.08));
    ctx.fillStyle = g; ctx.fill();
    // voren
    ctx.save(); ctx.clip();
    ctx.strokeStyle = A.shade(f.col, -0.18); ctx.lineWidth = 0.5;
    ctx.beginPath();
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let t = 0.08; t < 1; t += 0.11) {
      const a1 = f.along ? lerp(c00, c01, t) : lerp(c00, c10, t);
      const b1 = f.along ? lerp(c10, c11, t) : lerp(c01, c11, t);
      ctx.moveTo(...a1); ctx.lineTo(...b1);
    }
    ctx.stroke();
    ctx.restore();
    // haag
    ctx.strokeStyle = 'rgba(60,92,34,0.55)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(...c00); ctx.lineTo(...c10); ctx.lineTo(...c11); ctx.lineTo(...c01); ctx.closePath(); ctx.stroke();
  }
  // wegen: scherp getekend op het reliëf, niet achter heuvels
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of roads) {
    const runs = [];
    let cur = null;
    for (const [gx, gy] of r) {
      const h = hAt(gx, gy);
      if (h > 3 && hidden(gx, gy, h)) { cur = null; continue; }
      if (!cur) { cur = []; runs.push(cur); }
      cur.push(proj(gx, gy));
    }
    for (const [w, col] of [[3.6, 'rgba(96,74,44,0.55)'], [2.5, '#b89a66'], [0.8, 'rgba(226,206,160,0.55)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      for (const run of runs) {
        if (run.length < 2) continue;
        ctx.beginPath(); ctx.moveTo(...run[0]); for (const q of run.slice(1)) ctx.lineTo(...q); ctx.stroke();
      }
    }
  }
  ctx.lineCap = 'butt';
  const tf = performance.now();
  const deco = [];
  const sp = 0.3;
  for (let gy = sp / 2; gy < size; gy += sp) {
    for (let gx = sp / 2; gx < size; gx += sp) {
      const k1 = Math.floor(gx / sp); const k2 = Math.floor(gy / sp);
      const jx = gx + (hash2(k1, k2, seed + 61) - 0.5) * sp * 0.9;
      const jy = gy + (hash2(k1, k2, seed + 62) - 0.5) * sp * 0.9;
      const e = eAt(jx, jy);
      if (e < SEA + 0.02) continue;
      const iu = Math.min(N - 1, Math.max(0, Math.floor(jx * R))); const iv = Math.min(N - 1, Math.max(0, Math.floor(jy * R)));
      if (CLR[iv * N + iu] < 0.02) continue;
      if (ovA(jx, jy) > 0.25) continue;
      const r = hash2(k1, k2, seed + 63);
      const fw = fwAt(jx, jy);
      const h = hAt(jx, jy);
      if (r < fw * 0.92) {
        const conif = hash2(k1, k2, seed + 64) < 0.3 + (e - 0.5) * 2;
        const list = conif ? NAT.CONIFERS : hash2(k1, k2, seed + 66) < 0.06 ? NAT.AUTUMN : NAT.LEAFY;
        deco.push({ gx: jx, gy: jy, h, kind: 'tree', spr: list[Math.floor(hash2(k1, k2, seed + 65) * list.length)], s: 0.36 + hash2(k2, k1, seed + 67) * 0.14 });
      } else if (e > 0.43 && e < 0.7 && r < 0.012) {
        deco.push({ gx: jx, gy: jy, h, kind: 'tree', spr: NAT.LEAFY[Math.floor(hash2(k1, k2, seed + 65) * NAT.LEAFY.length)], s: 0.4 + hash2(k2, k1, seed + 67) * 0.12 });
      } else if (e > 0.43 && e < 0.7 && r < 0.03) {
        deco.push({ gx: jx, gy: jy, h, kind: 'bush', s: 0.45 + r * 10 });
      } else if (e >= 0.72 && e < 0.86 && r < 0.09 && h < 34) {
        deco.push({ gx: jx, gy: jy, h, kind: 'tree', spr: NAT.CONIFERS[Math.floor(hash2(k1, k2, seed + 65) * NAT.CONIFERS.length)], s: 0.3 + hash2(k2, k1, seed + 67) * 0.12 });
      } else if (e >= 0.72 && r < 0.13) {
        deco.push({ gx: jx, gy: jy, h, kind: 'rock', s: 0.35 + hash2(k2, k1, seed + 68) * 0.4 });
      } else if (e < 0.415 && r < 0.03) {
        deco.push({ gx: jx, gy: jy, h, kind: 'rock', s: 0.3 + r * 6 });
      }
    }
  }
  deco.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
  const TS = trees();
  window.__treeCount = deco.length;
  const vis = deco.filter((d) => !(d.h > 3 && hidden(d.gx, d.gy, d.h)));
  // eerst alle schaduwen van de bomen in één keer, dan de bomen van achter naar voor
  ctx.fillStyle = 'rgba(12,28,8,0.26)';
  ctx.beginPath();
  for (const d of vis) {
    if (d.kind !== 'tree') continue;
    const x = (d.gx - d.gy) * halfW + 5 * d.s; const y = (d.gx + d.gy) * halfH - d.h + 1;
    ctx.moveTo(x + 13 * d.s, y); ctx.ellipse(x, y, 13 * d.s, 4.5 * d.s, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  for (const d of vis) {
    const x = (d.gx - d.gy) * halfW; const y = (d.gx + d.gy) * halfH - d.h;
    if (d.kind === 'tree') {
      const spr = TS[d.spr];
      ctx.drawImage(spr.small, x - spr.ax * d.s, y - spr.ay * d.s, spr.w * d.s, spr.h * d.s);
    } else if (d.kind === 'bush') A.bush(ctx, x, y, d.s);
    else A.rock(ctx, x, y, d.s);
  }
  const tt = performance.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // ---- voor de animatie: kustschuim en golfjes ----
  const shore = [];
  const water = [];
  for (let v = 1; v < N - 1; v++) {
    for (let u = 1; u < N - 1; u++) {
      const i = v * N + u;
      if (E[i] >= SEA) continue;
      const nearLand = E[i + 1] >= SEA || E[i - 1] >= SEA || E[i + N] >= SEA || E[i - N] >= SEA;
      const gx = (u + 0.5) / R; const gy = (v + 0.5) / R;
      if (nearLand) {
        if (hash2(u, v, seed + 71) > 0.28) continue;
        const ex = E[i + 1] - E[i - 1]; const ey = E[i + N] - E[i - N];
        // richting naar zee (tegen de helling in) en de kustlijn, in schermruimte
        let nx = (-ex + ey) * halfW; let ny = (-ex - ey) * halfH;
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const x = (gx - gy) * halfW; const y = (gx + gy) * halfH;
        shore.push({ x, y, nx, ny, ph: hash2(u, v, seed + 72) });
      } else if (E[i] < 0.34 && hash2(u, v, seed + 73) < 0.03) {
        water.push({ x: gx, y: gy, p: hash2(u, v, seed + 74) * 6.28 });
      }
    }
  }
  const t3 = performance.now();
  return { cv, W, H: HH, ox: -W / 2, oy: -TOP, hAt, shore, water, ms: [t1 - t0, t2 - t1, tg - t2, tf - tg, tt - tf, t3 - tt].map(Math.round) };
}
