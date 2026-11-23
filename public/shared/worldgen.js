// Procedurele wereldkaart. Volledig bepaald door de "seed", zodat de server
// niets van het terrein hoeft op te slaan: de browser genereert dezelfde kaart.
import { MAX_TEAMS } from './rules.js';

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6 };
export const T_NAMES = ['Diepe zee', 'Ondiep water', 'Strand', 'Grasland', 'Bos', 'Heuvels', 'Bergen'];

export function mulberry32(a) {
  return function rnd() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = smooth(x - xi); const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed); const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed); const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm(x, y, seed, oct) {
  let v = 0; let amp = 0.5; let f = 1; let norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * valueNoise(x * f, y * f, seed + i * 101);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return v / norm;
}

// hoogte (e) en vochtigheid (m) op een willekeurig punt; (x, y) = midden van tegel (x, y).
// generateTerrain gebruikt precies dezelfde berekening, de kaart tekent er een vloeiend landschap mee.
export function fieldAt(seed, size, regions, x, y) {
  const dx = (x / (size - 1) - 0.5) * 2;
  const dy = (y / (size - 1) - 0.5) * 2;
  const d = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2; // 0 midden .. 1 hoek
  const edge = Math.max(Math.abs(dx), Math.abs(dy));
  let e = 0.58 + (fbm(x / 8, y / 8, seed, 4) - 0.5) * 1.1;
  e -= Math.pow(Math.max(0, edge - 0.68) / 0.32, 2) * 0.45;
  // een kronkelende bergrug geeft het midden van de kaart karakter
  const ridge = 1 - Math.abs(fbm(x / 9 + 50, y / 9 + 50, seed + 3, 3) - 0.5) * 2;
  e += Math.max(0, ridge - 0.76) * 1.7 * (1 - d * 0.6);
  let m = fbm(x / 6 + 200, y / 6 + 200, seed + 17, 3);
  // startgebieden van teams zijn altijd vruchtbaar en vlak
  let near = Infinity;
  for (const r of regions) near = Math.min(near, Math.hypot(r.x - x, r.y - y));
  if (near < 7) {
    const k = 1 - near / 7;
    e = e + (0.56 - e) * Math.min(1, k * 1.6);
    m -= k * 0.25;
  }
  return [e, m];
}

export function terrainType(e, m) {
  if (e < 0.3) return T.DEEP;
  if (e < 0.37) return T.SHALLOW;
  if (e < 0.41) return T.SAND;
  if (e > 0.82) return T.MOUNTAIN;
  if (e > 0.73) return T.HILL;
  if (m > 0.55) return T.FOREST;
  return T.GRASS;
}

export function teamRegions(seed, size) {
  const regions = [];
  for (let i = 0; i < MAX_TEAMS; i++) regions.push(teamRegion(seed, size, i));
  return regions;
}

export function generateTerrain(seed, size) {
  const tiles = new Uint8Array(size * size);
  const elev = new Float32Array(size * size);
  const regions = teamRegions(seed, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [e, m] = fieldAt(seed, size, regions, x, y);
      tiles[y * size + x] = terrainType(e, m);
      elev[y * size + x] = e;
    }
  }
  return { size, tiles, elev };
}

export const isLand = (t) => t >= T.SAND && t <= T.HILL;
export const isBuildable = (t) => t === T.GRASS || t === T.FOREST || t === T.SAND || t === T.HILL;

// Volgorde waarin teamgebieden worden uitgedeeld, zodat teams ver uit elkaar starten.
const SLOT_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];

export function teamRegion(seed, size, slot) {
  const rot = hash2(7, 7, seed) * Math.PI * 2;
  const a = rot + (SLOT_ORDER[slot % MAX_TEAMS] / MAX_TEAMS) * Math.PI * 2;
  const R = size * 0.31;
  return { x: size / 2 + Math.cos(a) * R, y: size / 2 + Math.sin(a) * R };
}

// zoek in een spiraal de dichtstbijzijnde geldige plek
export function findSpot(terrain, cx, cy, taken, minDist) {
  const { size, tiles } = terrain;
  for (let r = 0; r < size; r++) {
    let best = null;
    let bestD = Infinity;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r || d < r - 1.5) continue;
        if (!isBuildable(tiles[y * size + x])) continue;
        if (taken.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
}

export function generateCamps(seed, size, terrain, extra) {
  const rnd = mulberry32(seed ^ 0x5eed);
  const regions = [];
  for (let s = 0; s < MAX_TEAMS; s++) regions.push(teamRegion(seed, size, s));
  const camps = [];
  const ok = (x, y) => x >= 2 && y >= 2 && x < size - 2 && y < size - 2
    && isBuildable(terrain.tiles[y * size + x])
    && !regions.some((p) => Math.hypot(p.x - x, p.y - y) < 6)
    && !camps.some((p) => Math.hypot(p.x - x, p.y - y) < 4);
  const place = (cx, cy, rMin, rMax, level) => {
    for (let i = 0; i < 300; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rMin + rnd() * (rMax - rMin);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (ok(x, y)) { camps.push({ x, y, level }); return true; }
    }
    return false;
  };
  // rond elk startgebied: twee zwakke kampen en één iets sterker kamp
  for (const r of regions) {
    place(r.x, r.y, 6.5, 9, 1);
    place(r.x, r.y, 6.5, 9.5, 1);
    place(r.x, r.y, 9, 12, 2);
  }
  // de rest: hoe dichter bij het midden, hoe gevaarlijker
  let tries = 0;
  let added = 0;
  while (added < extra && tries < 4000) {
    tries++;
    const x = 2 + Math.floor(rnd() * (size - 4));
    const y = 2 + Math.floor(rnd() * (size - 4));
    if (!ok(x, y)) continue;
    const near = Math.min(...regions.map((p) => Math.hypot(p.x - x, p.y - y)));
    if (near < 10) continue;
    const r = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
    const level = r < 0.2 ? 5 : r < 0.36 ? 4 : 3;
    camps.push({ x, y, level });
    added++;
  }
  return camps;
}
