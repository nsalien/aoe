// Natuur voor de stadsweergave: bomen in verschillende soorten en kleine bodemdetails
// (varens, struikjes, paddenstoelen, bloemen, stenen). Licht valt van linksboven.

const TAU = Math.PI * 2;

function disc(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255; const p = Math.abs(amt);
  const f = (c) => Math.round(c + (t - c) * p);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}

// ---------- bomen ----------

const LEAF = {
  oak: ['#2f5e2a', '#4a8a35', '#7fbf4f'],
  oakY: ['#3d632a', '#5e9638', '#9ccc5a'],
  oakD: ['#284f26', '#3e7a33', '#69ad4c'],
  autumn: ['#8a4a1c', '#c8742a', '#f0b04a'],
  autumnR: ['#7a2e1c', '#b8482a', '#e8844a'],
  birch: ['#4f7f2c', '#7aae42', '#b2da6e'],
  pine: ['#1f4a30', '#2e6b3e', '#4f9150'],
  spruce: ['#1b3f33', '#285e48', '#3f8063'],
};

function trunk(c, x, y, s, h, col = '#6b4423') {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x - 2.7 * s, y + 0.4 * s);
  c.quadraticCurveTo(x - 1.3 * s, y - h * 0.4 * s, x - 1.4 * s, y - h * s);
  c.lineTo(x + 1.4 * s, y - h * s);
  c.quadraticCurveTo(x + 1.3 * s, y - h * 0.4 * s, x + 2.9 * s, y + 0.4 * s);
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 0.2 * s, y - h * s, 1.4 * s, h * s);
  c.fillStyle = 'rgba(255,230,190,0.18)'; c.fillRect(x - 1.3 * s, y - h * s, 0.6 * s, h * s);
}

// loofkruin: donkere rand, drie tinten en honderden blaadjes (licht van linksboven)
function canopy(c, x, y, s, blobs, pal, seed) {
  const [dark, mid, light] = pal;
  const deep = shade(dark, -0.4);
  for (const [dx, dy, r] of blobs) disc(c, x + (dx + 0.7) * s, y + (dy + 1) * s, (r + 0.9) * s, deep);
  for (const [dx, dy, r] of blobs) disc(c, x + (dx + 1.1) * s, y + (dy + 1.5) * s, r * s, dark);
  for (const [dx, dy, r] of blobs) disc(c, x + dx * s, y + dy * s, r * s * 0.94, mid);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let area = 0;
  for (const [dx, dy, r] of blobs) { x0 = Math.min(x0, dx - r); y0 = Math.min(y0, dy - r); x1 = Math.max(x1, dx + r); y1 = Math.max(y1, dy + r); area += r * r; }
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const span = Math.max(x1 - x0, y1 - y0) / 2;
  c.save();
  c.beginPath();
  for (const [dx, dy, r] of blobs) { c.moveTo(x + (dx + r * 1.02) * s, y + dy * s); c.arc(x + dx * s, y + dy * s, r * 1.02 * s, 0, TAU); }
  c.clip();
  const g = c.createLinearGradient(x + x0 * s, y + y0 * s, x + x1 * s, y + y1 * s);
  g.addColorStop(0, 'rgba(255,255,215,0.28)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,25,0,0.38)');
  c.fillStyle = g; c.fillRect(x + (x0 - 2) * s, y + (y0 - 2) * s, (x1 - x0 + 4) * s, (y1 - y0 + 4) * s);
  const R = rnd(seed);
  const n = Math.round(area * 1.6);
  const total = blobs.reduce((t, b) => t + b[2] * b[2], 0);
  for (let k = 0; k < n; k++) {
    let pick = R() * total; let bl = blobs[0];
    for (const b of blobs) { pick -= b[2] * b[2]; if (pick <= 0) { bl = b; break; } }
    const a = R() * TAU; const d = Math.sqrt(R()) * bl[2];
    const px = bl[0] + Math.cos(a) * d; const py = bl[1] + Math.sin(a) * d;
    const lit = ((px - cx) + (py - cy)) / span;
    const v = R();
    c.fillStyle = lit < -0.35 ? (v < 0.6 ? light : mid) : lit > 0.4 ? (v < 0.65 ? dark : deep) : (v < 0.4 ? light : v < 0.8 ? mid : dark);
    c.globalAlpha = 0.75 + v * 0.25;
    c.beginPath(); c.ellipse(x + px * s, y + py * s, 1.35 * s, 0.8 * s, R() * TAU, 0, TAU); c.fill();
    if (lit < -0.2 && v > 0.85) { c.fillStyle = 'rgba(255,255,220,0.7)'; c.fillRect(x + px * s, y + py * s - 0.4 * s, 0.7 * s, 0.5 * s); }
  }
  c.globalAlpha = 1;
  c.restore();
}

function oak(c, x, y, s, pal, seed) {
  trunk(c, x, y, s, 14);
  c.strokeStyle = '#5a391d'; c.lineWidth = 1.2 * s;
  c.beginPath(); c.moveTo(x, y - 10 * s); c.lineTo(x - 4 * s, y - 16 * s); c.moveTo(x + 0.5 * s, y - 11 * s); c.lineTo(x + 4.5 * s, y - 17 * s); c.stroke();
  canopy(c, x, y, s, [[-7.5, -19, 6.6], [7, -20, 6.6], [0, -27.5, 7.8], [-4, -14.5, 6], [5, -14, 6], [-9, -25, 5.3], [8.2, -26, 5.3], [0, -19.5, 7.4]], pal, seed);
}

function roundTree(c, x, y, s, pal, seed) {
  trunk(c, x, y, s, 11);
  canopy(c, x, y, s, [[0, -20, 9], [-5.5, -15, 6], [5.5, -15.5, 6], [-4, -24, 5.5], [4.5, -24.5, 5.5]], pal, seed);
}

function birch(c, x, y, s, pal, seed) {
  // witte stam met zwarte vlekjes
  c.fillStyle = '#ece8dc';
  c.beginPath(); c.moveTo(x - 1.5 * s, y + 0.4 * s); c.lineTo(x - 0.9 * s, y - 24 * s); c.lineTo(x + 0.9 * s, y - 24 * s); c.lineTo(x + 1.7 * s, y + 0.4 * s); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 0.2 * s, y - 24 * s, 1.2 * s, 24 * s);
  const R = rnd(seed + 7);
  c.fillStyle = '#2b2722';
  for (let k = 0; k < 7; k++) { const yy = y - (2 + R() * 20) * s; c.fillRect(x - 1.2 * s, yy, (1 + R() * 1.6) * s, 0.6 * s); }
  canopy(c, x, y, s, [[-4.5, -20, 4.6], [4, -22, 4.6], [0, -28, 5.2], [-3, -14.5, 4], [3.5, -15, 4], [0.5, -21, 4.8]], pal, seed);
}

function poplar(c, x, y, s, pal, seed) {
  trunk(c, x, y, s, 8);
  canopy(c, x, y, s, [[0, -12, 5], [0, -18, 6], [0, -25, 6], [0, -31, 5], [0, -36, 3.6], [-2.2, -21, 4.4], [2.4, -27, 4.2]], pal, seed);
}

// naaldboom uit getande lagen, licht links en donker rechts
function conifer(c, x, y, s, pal, tiers, width, height) {
  const [dark, mid, light] = pal;
  trunk(c, x, y, s, 6, '#5a3a1e');
  const step = height / tiers;
  for (let i = 0; i < tiers; i++) {
    const w = width * (1 - i / (tiers + 0.6)) * s;
    const yb = y - (5 + i * step) * s; const yt = yb - step * 1.6 * s;
    const tier = () => {
      c.beginPath();
      c.moveTo(x - w, yb);
      const teeth = 4;
      for (let k = 1; k <= teeth; k++) { const fx = x - w + (w * k) / teeth; c.lineTo(fx - (w / teeth) * 0.5, yb - 1.2 * s); c.lineTo(fx, yb + (k % 2 ? 0.8 : 0) * s); }
      for (let k = 1; k <= teeth; k++) { const fx = x + (w * k) / teeth; c.lineTo(fx - (w / teeth) * 0.5, yb - 1.2 * s); c.lineTo(fx, yb + (k % 2 ? 0.8 : 0) * s); }
      c.lineTo(x, yt);
      c.closePath();
    };
    tier(); c.fillStyle = dark; c.save(); c.translate(0.8 * s, 1.2 * s); c.fill(); c.restore();
    tier(); c.fillStyle = mid; c.fill();
    c.save(); tier(); c.clip();
    c.fillStyle = light; c.globalAlpha = 0.55;
    c.beginPath(); c.moveTo(x - w, yb); c.lineTo(x, yt); c.lineTo(x - w * 0.15, yb); c.closePath(); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,20,10,0.25)'; c.fillRect(x + w * 0.25, yt, w, yb - yt + 2 * s);
    // naalden
    const R = rnd(i * 97 + Math.round(w * 13));
    c.lineWidth = 0.55 * s;
    for (let k = 0; k < 46; k++) {
      const u = R() * 2 - 1; const vv = R();
      const px = x + u * w * (1 - vv * 0.85); const py = yb - vv * (yb - yt) * 0.95;
      c.strokeStyle = u < -0.15 ? (R() < 0.6 ? light : mid) : (R() < 0.6 ? dark : shade(dark, -0.35));
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + (u < 0 ? -1.4 : 1.4) * s, py + 1.3 * s); c.stroke();
    }
    c.restore();
  }
}

// alle boomsoorten: [teken, sprite-breedte, sprite-hoogte]
const KINDS = [
  (c, x, y, k) => oak(c, x, y, 1.05, LEAF.oak, k),
  (c, x, y, k) => oak(c, x, y, 1.15, LEAF.oakY, k),
  (c, x, y, k) => oak(c, x, y, 0.95, LEAF.oakD, k),
  (c, x, y, k) => oak(c, x, y, 1.1, LEAF.autumn, k),
  (c, x, y, k) => roundTree(c, x, y, 1.05, LEAF.oakY, k),
  (c, x, y, k) => roundTree(c, x, y, 1.0, LEAF.autumnR, k),
  (c, x, y, k) => birch(c, x, y, 1.05, LEAF.birch, k),
  (c, x, y, k) => poplar(c, x, y, 1.0, LEAF.oak, k),
  (c, x, y) => conifer(c, x, y, 1.0, LEAF.pine, 4, 13.5, 30),
  (c, x, y) => conifer(c, x, y, 1.1, LEAF.pine, 4, 12.5, 33),
  (c, x, y) => conifer(c, x, y, 1.0, LEAF.spruce, 5, 10.5, 37),
  (c, x, y) => conifer(c, x, y, 0.95, LEAF.pine, 3, 14, 24),
];
// groepjes (achteraan kleinere bomen) voor dichte bossen
const CLUMPS = [
  (c, x, y, k) => { oak(c, x - 12, y - 7, 0.8, LEAF.oakD, k + 1); oak(c, x + 11, y - 9, 0.75, LEAF.oak, k + 2); oak(c, x, y, 1.05, LEAF.oak, k); },
  (c, x, y) => { conifer(c, x - 11, y - 6, 0.85, LEAF.pine, 4, 12, 30); conifer(c, x + 10, y - 9, 0.8, LEAF.spruce, 5, 10, 36); conifer(c, x, y, 1.05, LEAF.pine, 4, 13, 31); },
  (c, x, y, k) => { conifer(c, x - 11, y - 8, 0.85, LEAF.spruce, 5, 10, 36); roundTree(c, x + 11, y - 6, 0.8, LEAF.oakY, k + 3); oak(c, x, y, 1.0, LEAF.oakY, k); },
  (c, x, y, k) => { birch(c, x - 10, y - 7, 0.85, LEAF.birch, k + 4); oak(c, x + 10, y - 8, 0.8, LEAF.oakD, k + 5); roundTree(c, x, y, 1.0, LEAF.oak, k); },
];
const ALL = [...KINDS.map((f) => [f, false]), ...CLUMPS.map((f) => [f, true])];
export const TREE_COUNT = ALL.length;
export const CONIFERS = [8, 9, 10, 11];
export const LEAFY = [0, 1, 2, 4, 6, 7, 0, 1, 2, 7];
export const AUTUMN = [3, 5];
export const CLUMP = { leafy: [12, 15], conifer: [13], mixed: [14] };

// één boom als sprite in twee resoluties (scherp dichtbij, licht veraf)
export function treeSprite(kind) {
  const [draw, big] = ALL[kind];
  const W = big ? 100 : 64; const H = big ? 98 : 84; const ax = W / 2; const ay = big ? 90 : 78;
  const make = (k) => {
    const cv = document.createElement('canvas');
    cv.width = W * k; cv.height = H * k;
    const c = cv.getContext('2d');
    c.scale(k, k);
    draw(c, ax, ay, 9000 + kind * 31);
    return cv;
  };
  return { cv: make(2), small: make(1), w: W, h: H, ax, ay };
}

// ---------- bodemdetails (getekend in de grondlaag) ----------

export function fern(c, x, y, s, col = '#3f7a2c') {
  c.strokeStyle = col; c.lineWidth = 0.9 * s; c.lineCap = 'round';
  for (const a of [-2.6, -2.1, -1.57, -1.05, -0.55]) {
    const ex = x + Math.cos(a) * 6 * s; const ey = y + Math.sin(a) * 3.6 * s;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * 3 * s, y + Math.sin(a) * 3.4 * s - 1 * s, ex, ey); c.stroke();
  }
  c.strokeStyle = 'rgba(160,210,110,0.5)'; c.lineWidth = 0.5 * s;
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 1 * s, y - 3 * s, x - 2.2 * s, y - 3.6 * s); c.stroke();
}

export function shrub(c, x, y, s, light = '#7fb84a', dark = '#3f7a2c') {
  c.fillStyle = 'rgba(20,40,10,0.25)'; c.beginPath(); c.ellipse(x + 1.5 * s, y + 0.5 * s, 5.5 * s, 2 * s, 0, 0, TAU); c.fill();
  for (const [dx, dy, r] of [[-2.6, -2, 3], [2.6, -2.2, 3], [0, -4, 3.3]]) disc(c, x + dx * s + 0.6 * s, y + dy * s + 0.8 * s, r * s, dark);
  for (const [dx, dy, r] of [[-2.6, -2, 2.7], [2.6, -2.2, 2.7], [0, -4, 3]]) disc(c, x + dx * s, y + dy * s, r * s, light);
  disc(c, x - 1 * s, y - 5 * s, 1.4 * s, 'rgba(255,255,220,0.25)');
}

export function mushroom(c, x, y, s) {
  c.fillStyle = '#efe6d2'; c.fillRect(x - 0.5 * s, y - 2.2 * s, 1 * s, 2.2 * s);
  c.fillStyle = '#c8392b'; c.beginPath(); c.ellipse(x, y - 2.3 * s, 1.9 * s, 1.2 * s, 0, Math.PI, 0); c.fill();
  disc(c, x - 0.6 * s, y - 2.9 * s, 0.32 * s, '#fff'); disc(c, x + 0.7 * s, y - 2.6 * s, 0.28 * s, '#fff');
}

export function pebble(c, x, y, s, col = '#9c978b') {
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + 0.6 * s, y + 0.4 * s, 2.4 * s, 1.1 * s, 0, 0, TAU); c.fill();
  c.fillStyle = col; c.beginPath(); c.ellipse(x, y - 0.4 * s, 2.2 * s, 1.3 * s, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(x - 0.6 * s, y - 0.9 * s, 1 * s, 0.5 * s, 0, 0, TAU); c.fill();
}

export function log(c, x, y, s) {
  c.fillStyle = 'rgba(20,30,10,0.25)'; c.beginPath(); c.ellipse(x + 1, y + 1, 8 * s, 2 * s, 0.25, 0, TAU); c.fill();
  c.save(); c.translate(x, y); c.rotate(0.25);
  c.fillStyle = '#6b4826'; c.fillRect(-7 * s, -2.4 * s, 14 * s, 2.6 * s);
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(-7 * s, -0.7 * s, 14 * s, 0.9 * s);
  c.fillStyle = '#3f7a2c'; c.fillRect(-3 * s, -2.8 * s, 3.5 * s, 0.9 * s);
  c.fillStyle = '#d6b27a'; c.beginPath(); c.ellipse(7 * s, -1.1 * s, 0.9 * s, 1.35 * s, 0, 0, TAU); c.fill();
  c.restore();
}

export function tuft(c, x, y, s, col, tip) {
  c.strokeStyle = col; c.lineWidth = 0.85 * s;
  c.beginPath();
  c.moveTo(x - 2 * s, y); c.quadraticCurveTo(x - 2.6 * s, y - 2.4 * s, x - 3.4 * s, y - 4 * s);
  c.moveTo(x - 0.6 * s, y); c.quadraticCurveTo(x - 0.8 * s, y - 3 * s, x - 0.5 * s, y - 5.4 * s);
  c.moveTo(x + 0.8 * s, y); c.quadraticCurveTo(x + 1.2 * s, y - 2.6 * s, x + 2.2 * s, y - 4.6 * s);
  c.moveTo(x + 2 * s, y); c.quadraticCurveTo(x + 2.8 * s, y - 1.6 * s, x + 3.8 * s, y - 2.8 * s);
  c.stroke();
  if (tip) { c.strokeStyle = tip; c.lineWidth = 0.6 * s; c.beginPath(); c.moveTo(x - 0.7 * s, y - 3.2 * s); c.lineTo(x - 0.5 * s, y - 5.4 * s); c.stroke(); }
}

export function flower(c, x, y, col) {
  c.strokeStyle = 'rgba(60,110,30,0.8)'; c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 2.4); c.stroke();
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; disc(c, x + Math.cos(a) * 0.9, y - 2.6 + Math.sin(a) * 0.55, 0.65, col); }
  disc(c, x, y - 2.6, 0.45, '#f6d046');
}

export function reed(c, x, y, s) {
  c.strokeStyle = '#4f7d2c'; c.lineWidth = 0.9 * s;
  c.beginPath();
  c.moveTo(x, y); c.lineTo(x - 1.2 * s, y - 9 * s);
  c.moveTo(x + 1.4 * s, y); c.lineTo(x + 2.2 * s, y - 7 * s);
  c.moveTo(x - 0.8 * s, y); c.lineTo(x - 3.4 * s, y - 6 * s);
  c.stroke();
  c.fillStyle = '#6b4523'; c.fillRect(x - 1.9 * s, y - 12 * s, 1.5 * s, 4 * s);
}

export function lily(c, x, y, s, bloom) {
  c.fillStyle = '#4f8f3a'; c.beginPath(); c.ellipse(x, y, 2.8 * s, 1.4 * s, 0, 0.35, TAU - 0.15); c.lineTo(x, y); c.fill();
  if (bloom) { disc(c, x + 0.4 * s, y - 0.6 * s, 0.9 * s, '#f5c6d6'); disc(c, x + 0.4 * s, y - 0.7 * s, 0.4 * s, '#f6d046'); }
}

// ---------- naadloze bodemtexturen (per pixel, één keer bij het opstarten) ----------

function hashP(x, y, p, seed) {
  x = ((x % p) + p) % p; y = ((y % p) + p) % p;
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, p, seed) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const fx = x - xi; const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const a = hashP(xi, yi, p, seed); const b = hashP(xi + 1, yi, p, seed);
  const c = hashP(xi, yi + 1, p, seed); const d = hashP(xi + 1, yi + 1, p, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
// periodieke ruis: naadloos herhaalbaar over 'size' pixels
function tnoise(x, y, size, seed, oct, cells = 4) {
  let v = 0; let amp = 0.5; let norm = 0; let p = cells;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise((x / size) * p, (y / size) * p, p, seed + i * 31);
    norm += amp; amp *= 0.5; p *= 2;
  }
  return v / norm;
}

// grijswaardentextuur (128 = neutraal) om met 'overlay' over de bodemkleur te leggen
export function groundTexture(kind, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c = cv.getContext('2d');
  const img = c.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const fine = hashP(x, y, size, 7) - 0.5;
      let v;
      if (kind === 'grass') {
        const n = tnoise(x, y, size, 11, 5, 4);
        const m = tnoise(x, y, size, 21, 3, 16);
        v = 128 + (n - 0.5) * 70 + (m - 0.5) * 46 + fine * 34;
      } else if (kind === 'forest') {
        const n = tnoise(x, y, size, 41, 5, 6);
        v = 124 + (n - 0.5) * 80 + fine * 40;
      } else if (kind === 'dirt') {
        const n = tnoise(x, y, size, 51, 5, 8);
        const m = tnoise(x, y, size, 61, 2, 32);
        v = 128 + (n - 0.5) * 60 + (m > 0.68 ? 26 : m < 0.3 ? -22 : 0) + fine * 30;
      } else if (kind === 'grain') { // fijne materiaalkorrel voor gebouwen
        const n = tnoise(x, y, size, 81, 3, 24);
        v = 128 + (n - 0.5) * 60 + fine * 46;
      } else { // water: zachte golfjes
        const n = tnoise(x, y * 2.5, size, 71, 3, 6);
        const w = Math.sin((y / size) * Math.PI * 2 * 14 + n * 9);
        v = 128 + w * 16 + (n - 0.5) * 30;
      }
      v = Math.max(0, Math.min(255, v));
      d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // kleine details die naadloos doorlopen over de randen
  const R = rnd(kind.length * 977 + size);
  const wrap = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { c.save(); c.translate(ox, oy); fn(); c.restore(); } };
  if (kind === 'grass') {
    const n = (size * size) / 26;
    const blades = [];
    for (let k = 0; k < n; k++) blades.push([R() * size, R() * size, R(), R()]);
    wrap(() => {
      for (const [x, y, a, b] of blades) {
        c.strokeStyle = a < 0.55 ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.28)';
        c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (b - 0.5) * 2.4, y - 2.5 - a * 2.5); c.stroke();
      }
    });
  } else if (kind === 'forest') {
    const leaves = [];
    for (let k = 0; k < (size * size) / 30; k++) leaves.push([R() * size, R() * size, R() * TAU, R()]);
    wrap(() => {
      for (const [x, y, a, b] of leaves) {
        c.fillStyle = b < 0.4 ? 'rgba(0,0,0,0.35)' : b < 0.8 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.4)';
        c.beginPath(); c.ellipse(x, y, 1.9, 0.9, a, 0, TAU); c.fill();
      }
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6;
      for (let k = 0; k < 40; k++) { const [x, y, a] = leaves[k]; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 3); c.stroke(); }
    });
  } else if (kind === 'dirt') {
    const stones = [];
    for (let k = 0; k < (size * size) / 90; k++) stones.push([R() * size, R() * size, 0.6 + R() * 1.4]);
    wrap(() => {
      for (const [x, y, r] of stones) {
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + 0.4, y + 0.5, r, r * 0.6, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x, y, r * 0.85, r * 0.5, 0, 0, TAU); c.fill();
      }
    });
  }
  return cv;
}
