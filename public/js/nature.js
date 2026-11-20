// Natuur voor de stadsweergave: bomen in verschillende soorten en kleine bodemdetails
// (varens, struikjes, paddenstoelen, bloemen, stenen). Licht valt van linksboven.

const TAU = Math.PI * 2;

function disc(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
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

// loofkruin uit overlappende bollen: donker onder, licht boven, wat bladstructuur
function canopy(c, x, y, s, blobs, pal, seed) {
  const [dark, mid, light] = pal;
  for (const [dx, dy, r] of blobs) disc(c, x + (dx + 1.2) * s, y + (dy + 1.6) * s, r * s, dark);
  for (const [dx, dy, r] of blobs) disc(c, x + dx * s, y + dy * s, r * s * 0.94, mid);
  c.globalAlpha = 0.85;
  for (const [dx, dy, r] of blobs) disc(c, x + (dx - r * 0.28) * s, y + (dy - r * 0.32) * s, r * s * 0.5, light);
  c.globalAlpha = 1;
  const R = rnd(seed);
  for (const [dx, dy, r] of blobs) {
    for (let k = 0; k < 5; k++) {
      const a = R() * TAU; const d = R() * r * 0.8;
      const px = x + (dx + Math.cos(a) * d) * s; const py = y + (dy + Math.sin(a) * d) * s;
      const top = Math.sin(a) < -0.2 && Math.cos(a) < 0.3;
      c.fillStyle = top ? 'rgba(255,255,210,0.28)' : 'rgba(10,35,10,0.22)';
      c.beginPath(); c.ellipse(px, py, 1.3 * s, 0.8 * s, a, 0, TAU); c.fill();
    }
  }
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
export const TREE_COUNT = KINDS.length;
export const CONIFERS = [8, 9, 10, 11];
export const LEAFY = [0, 1, 2, 4, 6, 7, 0, 1, 2, 7];
export const AUTUMN = [3, 5];

// één boom als sprite in twee resoluties (scherp dichtbij, licht veraf)
export function treeSprite(kind) {
  const W = 64; const H = 84; const ax = 32; const ay = 78;
  const make = (k) => {
    const cv = document.createElement('canvas');
    cv.width = W * k; cv.height = H * k;
    const c = cv.getContext('2d');
    c.scale(k, k);
    KINDS[kind](c, ax, ay, 9000 + kind * 31);
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
