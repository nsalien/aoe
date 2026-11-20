// Het eigen gebied rond een stad: bosrand, wildernis, vijver, wilde bronnen, everzwijnen en een barbarenkamp.
// Volledig bepaald door een zaadgetal (het stadsnummer), zodat server en browser exact hetzelfde zien.
// Coördinaten zijn dezelfde tegels als de stad: het basisbouwvierkant is [0, TOWN_GRID).
import { TOWN_GRID } from './rules.js';
import { hash2, fbm, mulberry32 } from './worldgen.js';

export const T_R = 17; // zoveel tegels wildernis rond het basisvierkant
export const T_MIN = -T_R;
export const T_MAX = TOWN_GRID + T_R;
export const T_W = TOWN_GRID + 2 * T_R;
export const MAX_RING = 3; // in het laatste tijdperk is het bouwvierkant 3 ringen groter
export const ringForAge = (a) => Math.max(0, Math.min(MAX_RING, a - 1));

export const TILE = { GRASS: 0, FOREST: 1, WATER: 2, SAND: 3 };

// hoeveel ringen ligt tegel (i, j) buiten het basisvierkant (0 = erin)
export function ringOf(i, j) {
  const N = TOWN_GRID;
  return Math.max(-i, i - N + 1, -j, j - N + 1, 0);
}

export const inTerr = (i, j) => i >= T_MIN && j >= T_MIN && i < T_MAX && j < T_MAX;
export const tileIndex = (i, j) => (j - T_MIN) * T_W + (i - T_MIN);
export const tileOf = (idx) => ({ i: (idx % T_W) + T_MIN, j: Math.floor(idx / T_W) + T_MIN });

const cache = new Map();

export function territory(seed) {
  let t = cache.get(seed);
  if (t) return t;
  const N = TOWN_GRID;
  const mid = N / 2;
  const tiles = new Uint8Array(T_W * T_W);
  const rnd = mulberry32(seed * 7919 + 13);

  // vaste plekjes net buiten het grootste bouwvierkant: vijver, grondstofplekken en weide
  const spots = [[-6.6, 3.4], [3.4, -6.6], [N + 6.6, 3.4], [3.4, N + 6.6]];
  const pondSpot = spots[Math.floor(hash2(1, 2, seed) * spots.length)];
  const pond = { x: pondSpot[0], y: pondSpot[1], r: 2.4 };
  const rest = spots.filter((s) => s !== pondSpot);
  const near = {
    stone: { x: rest[0][0], y: rest[0][1] },
    gold: { x: rest[1][0], y: rest[1][1] },
    food: { x: rest[2][0], y: rest[2][1] },
  };
  const pasture = { x: N + 5.8, y: N - 2.4 };

  // wilde dingen in de wildernis
  const taken = [{ x: pond.x, y: pond.y, r: 4 }, { x: pasture.x, y: pasture.y, r: 3.5 },
    ...Object.values(near).map((p) => ({ x: p.x, y: p.y, r: 3 }))];
  const road = (x, y) => Math.abs(x - mid) < 1.2 || Math.abs(y - mid) < 1.2;
  // ruis één keer per tegel berekenen (zuinig met rekentijd op de server)
  const lakeArr = new Uint8Array(T_W * T_W);
  const forestN = new Float32Array(T_W * T_W);
  for (let j = T_MIN; j < T_MAX; j++) {
    for (let i = T_MIN; i < T_MAX; i++) {
      const idx = tileIndex(i, j);
      forestN[idx] = fbm(i / 6 + 30, j / 6 + 30, seed + 5, 2);
      if (ringOf(i, j) > 9 && fbm(i / 6 + 80, j / 6 + 80, seed + 9, 2) > 0.71) lakeArr[idx] = 1;
    }
  }
  const lake = (i, j) => inTerr(i, j) && lakeArr[tileIndex(i, j)] === 1;
  function place(rMin, rMax, space) {
    for (let k = 0; k < 400; k++) {
      const x = T_MIN + 2 + rnd() * (T_W - 4);
      const y = T_MIN + 2 + rnd() * (T_W - 4);
      const r = ringOf(Math.floor(x), Math.floor(y));
      if (r < rMin || r > rMax || road(x, y) || lake(Math.floor(x), Math.floor(y))) continue;
      if (taken.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(p.r, space))) continue;
      const pos = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      taken.push({ ...pos, r: space });
      return pos;
    }
    return null;
  }
  const camp = place(11, 15, 5);
  const deposits = [];
  for (const kind of ['gold', 'stone', 'wood', 'food', 'gold', 'stone', 'wood', 'food', 'food']) {
    const p = place(7, 16, 3.5);
    if (p) deposits.push({ id: deposits.length + 1, kind, ...p });
  }
  const boars = [];
  for (let k = 0; k < 6; k++) {
    const p = place(8, 16, 3);
    if (p) boars.push({ id: k + 1, ...p });
  }

  // tegels: water, zand, bos, gras
  const clearOf = [...deposits.map((d) => ({ x: d.x, y: d.y, r: d.kind === 'wood' ? 1.6 : 1.5 })),
    ...boars.map((b) => ({ x: b.x, y: b.y, r: 1.2 })), ...(camp ? [{ x: camp.x, y: camp.y, r: 2.8 }] : [])];
  const trees = [];
  for (let j = T_MIN; j < T_MAX; j++) {
    for (let i = T_MIN; i < T_MAX; i++) {
      const idx = tileIndex(i, j);
      const cx = i + 0.5; const cy = j + 0.5;
      const ring = ringOf(i, j);
      if (Math.hypot(cx - pond.x, (cy - pond.y) / 0.8) < pond.r) { tiles[idx] = TILE.WATER; continue; }
      if (lake(i, j)) { tiles[idx] = TILE.WATER; continue; }
      if (lake(i + 1, j) || lake(i - 1, j) || lake(i, j + 1) || lake(i, j - 1)) { tiles[idx] = TILE.SAND; continue; }
      if (ring === 0 || road(cx, cy)) continue;
      if (Math.hypot(cx - pond.x, (cy - pond.y) / 0.8) < pond.r + 0.9) continue;
      if (Math.hypot(cx - pasture.x, cy - pasture.y) < 2.6) continue;
      if (Object.values(near).some((p) => Math.hypot(cx - p.x, cy - p.y) < 2)) continue;
      if (clearOf.some((p) => Math.hypot(cx - p.x, cy - p.y) < p.r)) continue;
      const n = forestN[idx];
      let p;
      if (ring <= 8) p = Math.min(0.9, 0.2 + ring * 0.12) * (0.55 + 0.45 * n * 1.4);
      else p = n > 0.56 ? 0.88 : n > 0.47 ? 0.3 : 0.05;
      if (hash2(i, j, seed + 77) < p) {
        tiles[idx] = TILE.FOREST;
        const ox = (hash2(i, j, seed + 5) - 0.5) * 0.5; const oy = (hash2(i, j, seed + 6) - 0.5) * 0.5;
        const conif = hash2(Math.floor(i / 4), Math.floor(j / 4), seed + 8) < 0.45;
        trees.push({ idx, i, j, gx: cx + ox, gy: cy + oy, v: (conif ? 0 : 4) + Math.floor(hash2(i, j, seed + 9) * 4) });
      }
    }
  }
  t = { seed, tiles, trees, pond, near, pasture, camp, deposits, boars };
  cache.set(seed, t);
  return t;
}

// ---------- ontdekte tegels (oorlogsmist) als compacte bitset ----------

const BYTES = Math.ceil((T_W * T_W) / 8);

export function exDecode(str) {
  const b = new Uint8Array(BYTES);
  if (str) {
    const bin = atob(str);
    for (let i = 0; i < Math.min(BYTES, bin.length); i++) b[i] = bin.charCodeAt(i);
  }
  return b;
}

export function exEncode(b) {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function exHas(b, i, j) {
  if (!inTerr(i, j)) return false;
  const k = tileIndex(i, j);
  return ((b[k >> 3] >> (k & 7)) & 1) === 1;
}

export function revealCircle(b, x, y, r) {
  for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) {
    for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (!inTerr(i, j) || Math.hypot(i + 0.5 - x, j + 0.5 - y) > r) continue;
      const k = tileIndex(i, j);
      b[k >> 3] |= 1 << (k & 7);
    }
  }
}

export function revealSegment(b, x0, y0, x1, y1, r) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
  for (let k = 0; k <= n; k++) revealCircle(b, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r);
}
