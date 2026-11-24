// 3D-modellen van alle gebouwen (voor render3d.js). Maten in tegels, hoogte ook in tegels (1 = 39 schermpixels).
// Het midden van de voet ligt op (0, 0); de deur zit aan de linkervoorkant (+y), de rechtervoorkant is +x.
// Elk volk heeft een eigen stijl (muren, daken, kleuren); `build()` geeft een Scene met ankerpunten
// (rook, vlag, gloed) die het spel gebruikt voor bewegende stukjes.
import { Scene, rgb } from './render3d.js';
import { rockShape } from './propmodels.js';

const mat = {
  stone: (c = '#bdb5a6') => ({ k: 'stone', c: rgb(c) }),
  brick: (c = '#c49a62') => ({ k: 'brick', c: rgb(c) }),
  plaster: (c, z0, z1, extra = {}) => ({ k: 'plaster', c: rgb(c), z0, z1, ...extra }),
  tiles: (c = '#9a4630', side = null) => ({ k: 'tiles', c: rgb(c), side }),
  thatch: (side = null) => ({ k: 'thatch', side }),
  slate: (c = '#5c6370', side = null) => ({ k: 'slate', c: rgb(c), side }),
  wood: (c = '#8a5a30') => ({ k: 'wood', c: rgb(c) }),
  logs: (c = '#7f5530') => ({ k: 'logs', c: rgb(c) }),
  plain: (c) => ({ k: 'plain', c: rgb(c) }),
  metal: (c = '#8e959f') => ({ k: 'metal', c: rgb(c) }),
  gold: () => ({ k: 'gold' }),
  cloth: (c, c2 = null, vert = false) => ({ k: 'cloth', c: rgb(c), c2: c2 ? rgb(c2) : null, vert }),
  door: (c = '#6b4224') => ({ k: 'door', c: rgb(c) }),
  rock: (c = '#8f8a80') => ({ k: 'rock', c: rgb(c) }),
  hay: () => ({ k: 'hay' }),
  glaze: (c, cx = 0, cy = 0) => ({ k: 'glaze', c: rgb(c), cx, cy }),
};

// ---------- bouwstijlen per volk ----------
const STYLES = {
  none: { base: '#a39b8c', wall: 'timber', plaster: '#e9dcbc', roof: 'gable', stone: '#b9b1a1', wood: '#7a5230' },
  egypt: { base: '#c2a26a', wall: 'plaster', plaster: '#dcc490', roof: 'flat', stone: '#d8bf8a', wood: '#9a7448', trim: '#2f6fb5', trim2: '#b8402c' },
  greek: { base: '#d6cfbf', wall: 'plaster', plaster: '#f2ede2', roof: 'greek', roofC: '#a9502f', stone: '#e4ddcd', wood: '#a88a5a', trim: '#2e5fa8' },
  yamato: { base: '#8f8a80', wall: 'shoji', plaster: '#efe9dc', roof: 'pagoda', roofC: '#41464f', stone: '#a29d93', wood: '#3a2a20', trim: '#b8322a' },
  babylon: { base: '#a8824f', wall: 'brick', plaster: '#c9a46c', roof: 'crenel', stone: '#c49a62', wood: '#8a6238', trim: '#2c5fae', trim2: '#e0b23a' },
  persia: { base: '#c4ad86', wall: 'plaster', plaster: '#ece0c6', roof: 'dome', roofC: '#2aa3a3', stone: '#dccaa6', wood: '#9a7448', trim: '#1f9a9a', trim2: '#d4a017' },
};

const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.round(a < 0 ? c * (1 + a) : c + (255 - c) * a);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
};

// muren van een blok in de stijl van het volk
function walls(s, st, x0, y0, x1, y1, z0, z1, o = {}) {
  const kind = o.wall || st.wall;
  if (kind === 'stone') return s.box(x0, y0, z0, x1, y1, z1, mat.stone(o.c || st.stone));
  if (kind === 'brick') return s.box(x0, y0, z0, x1, y1, z1, mat.brick(o.c || st.stone));
  if (kind === 'wood') return s.box(x0, y0, z0, x1, y1, z1, mat.wood(o.c || st.wood));
  if (kind === 'logs') return s.box(x0, y0, z0, x1, y1, z1, mat.logs(o.c || '#7f5530'));
  return s.box(x0, y0, z0, x1, y1, z1, mat.plaster(o.c || st.plaster, z0, z1, { timber: kind === 'timber', grid: kind === 'shoji' }));
}

// sierband (kleur van het volk) rond de bovenrand
function band(s, x0, y0, x1, y1, z, h, c) {
  s.box(x0 - 0.006, y0 - 0.006, z, x1 + 0.006, y1 + 0.006, z + h, mat.plain(c));
}

// dak in de stijl van het volk; geeft de hoogte van de top terug
function roof(s, st, x0, y0, x1, y1, z, h, along = 'x', o = {}) {
  const kind = o.roof || st.roof;
  const side = mat.plaster(st.plaster, z, z + h);
  if (kind === 'gable' || kind === 'hip') {
    const m = o.mat || (o.level <= 1 ? mat.thatch(mat.wood('#7a5a34')) : o.level === 2 ? mat.tiles(o.roofC || '#9a4630', mat.wood('#7a5a34')) : mat.slate(o.roofC || '#5c6370', side));
    if (kind === 'hip') s.hip(x0, y0, x1, y1, z, h, m, 0.06); else s.gable(x0, y0, x1, y1, z, h, along, m, 0.07);
    return z + h;
  }
  if (kind === 'greek') {
    const hh = h * 0.45;
    s.gable(x0, y0, x1, y1, z + 0.03, hh, along, mat.tiles(st.roofC, mat.plaster(st.plaster, z, z + hh)), 0.06);
    s.box(x0 - 0.02, y0 - 0.02, z, x1 + 0.02, y1 + 0.02, z + 0.035, mat.plain(st.plaster));
    band(s, x0, y0, x1, y1, z - 0.03, 0.025, st.trim);
    return z + hh;
  }
  if (kind === 'pagoda') {
    const m = mat.slate(st.roofC, mat.wood(st.wood));
    s.hip(x0, y0, x1, y1, z, h * 0.8, m, 0.14);
    s.box(x0 - 0.13, y0 - 0.13, z - 0.02, x1 + 0.13, y1 + 0.13, z + 0.005, mat.plain(tint(st.roofC, -0.3)));
    return z + h * 0.8;
  }
  // platte daken: Egypte (kroonlijst), Babylon (kantelen), Perzië (koepel)
  s.box(x0 - 0.015, y0 - 0.015, z, x1 + 0.015, y1 + 0.015, z + 0.05, mat.plain(tint(st.plaster, -0.08)));
  if (st.trim) band(s, x0, y0, x1, y1, z - 0.05, 0.03, st.trim);
  if (st.trim2) band(s, x0, y0, x1, y1, z - 0.075, 0.018, st.trim2);
  if (kind === 'flat') {
    s.box(x0 - 0.04, y0 - 0.04, z + 0.05, x1 + 0.04, y1 + 0.04, z + 0.09, mat.plain(tint(st.stone, 0.1)));
    return z + 0.09;
  }
  if (kind === 'crenel') {
    const w = 0.05; const top = z + 0.05;
    for (let x = x0; x < x1 - 0.01; x += 0.1) { s.box(x, y1 - w, top, Math.min(x1, x + w), y1, top + 0.08, mat.brick(st.stone)); s.box(x, y0, top, Math.min(x1, x + w), y0 + w, top + 0.08, mat.brick(st.stone)); }
    for (let y = y0; y < y1 - 0.01; y += 0.1) { s.box(x1 - w, y, top, x1, Math.min(y1, y + w), top + 0.08, mat.brick(st.stone)); s.box(x0, y, top, x0 + w, Math.min(y1, y + w), top + 0.08, mat.brick(st.stone)); }
    return top + 0.08;
  }
  // koepel op een trommel
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const r = Math.min(x1 - x0, y1 - y0) * (o.domeR || 0.38);
  s.cyl(cx, cy, r * 1.02, z + 0.05, z + 0.05 + r * 0.35, mat.plaster(st.plaster, z, z + 1));
  s.ell(cx, cy, z + 0.05 + r * 0.35, r, r, r * 1.15, mat.glaze(st.roofC, cx, cy), z + 0.05 + r * 0.35);
  s.cyl(cx, cy, 0.012, z + r * 1.4, z + r * 1.62, mat.gold());
  s.ell(cx, cy, z + r * 1.66, 0.022, 0.022, 0.022, mat.gold());
  return z + r * 1.7;
}

function door(s, face, c, a0, a1, z0, z1, st) {
  s.win(face, c, a0, a1, z0, z1, mat.door(st.wall === 'shoji' ? '#3a2a20' : '#6b4224'));
}
function barrel(s, x, y) {
  s.cyl(x, y, 0.045, 0, 0.13, mat.wood('#7d5128'));
  s.cyl(x, y, 0.047, 0.03, 0.045, mat.metal('#4d4f54'));
  s.cyl(x, y, 0.047, 0.095, 0.11, mat.metal('#4d4f54'));
}
function crate(s, x, y, w = 0.07, z = 0) { s.box(x - w, y - w, z, x + w, y + w, z + w * 1.6, mat.wood('#a8743f')); }
function sacks(s, x, y) { for (const [dx, dy, dz] of [[0, 0, 0], [0.07, 0.02, 0], [0.035, 0.01, 0.06]]) s.ell(x + dx, y + dy, 0.045 + dz, 0.045, 0.04, 0.05, mat.plain('#cdb88c')); }
function logPile(s, x, y, n = 3) {
  for (let k = 0; k < n; k++) s.hcyl('x', y - 0.06 + k * 0.06, 0.035, 0.032, x - 0.16, x + 0.16, mat.logs('#7a5129'));
  s.hcyl('x', y - 0.03, 0.09, 0.032, x - 0.15, x + 0.15, mat.logs('#6b4826'));
  s.hcyl('x', y + 0.03, 0.09, 0.032, x - 0.15, x + 0.15, mat.logs('#7a5129'));
}
function flagPole(s, x, y, z0, h) { s.cyl(x, y, 0.012, z0, z0 + h, mat.wood('#5a3a1e')); return [x, y, z0 + h]; }
function window2(s, face, c, a, z, w = 0.11, h = 0.15) { s.win(face, c, a, a + w, z, z + h); }

// ---------- gebouwen ----------

function house(s, st, L) {
  const A = {};
  if (L <= 1) {
    const x0 = -0.3; const x1 = 0.3; const y0 = -0.24; const y1 = 0.24; const h = 0.4;
    s.box(x0, y0, 0, x1, y1, 0.06, mat.stone(st.base));
    walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.06, h);
    const top = roof(s, st, x0, y0, x1, y1, h, 0.36, 'x', { level: 1 });
    door(s, 'y', y1 - 0.01, -0.07, 0.07, 0.06, 0.3, st);
    window2(s, 'x', x1 - 0.01, -0.09, 0.16, 0.12, 0.12);
    barrel(s, x1 + 0.08, y1 - 0.05);
    A.smoke = [0.1, -0.05, top];
  } else if (L === 2) {
    const x0 = -0.36; const x1 = 0.36; const y0 = -0.28; const y1 = 0.28; const h = 0.52;
    s.box(x0, y0, 0, x1, y1, 0.1, mat.stone(st.base));
    walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.1, h);
    if (st.roof === 'gable') s.box(0.14, -0.2, h, 0.25, -0.09, h + 0.52, mat.stone('#8f887c'));
    const top = roof(s, st, x0, y0, x1, y1, h, 0.42, 'x', { level: 2 });
    door(s, 'y', y1 - 0.01, -0.07, 0.07, 0.1, 0.37, st);
    window2(s, 'y', y1 - 0.01, 0.16, 0.24); window2(s, 'y', y1 - 0.01, -0.29, 0.24);
    window2(s, 'x', x1 - 0.01, -0.12, 0.22);
    barrel(s, x1 + 0.07, y1 - 0.02); barrel(s, x1 + 0.08, y1 - 0.13);
    A.smoke = st.roof === 'gable' ? [0.195, -0.145, h + 0.52] : [0, 0, top];
  } else {
    const x0 = -0.38; const x1 = 0.38; const y0 = -0.32; const y1 = 0.32; const h = 0.76;
    s.box(x0, y0, 0, x1, y1, 0.34, mat.stone(st.stone));
    walls(s, st, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, 0.34, h);
    if (st.roof === 'gable') s.box(-0.26, -0.22, h, -0.14, -0.1, h + 0.62, mat.stone('#8f887c'));
    const top = roof(s, st, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h, 0.46, 'y', { level: 3 });
    door(s, 'y', y1, -0.07, 0.07, 0.02, 0.29, st);
    window2(s, 'y', y1 + 0.02, -0.3, 0.46, 0.12, 0.17); window2(s, 'y', y1 + 0.02, 0.17, 0.46, 0.12, 0.17);
    window2(s, 'y', y1, 0.17, 0.1, 0.12, 0.15);
    window2(s, 'x', x1 + 0.02, -0.22, 0.46, 0.12, 0.17); window2(s, 'x', x1 + 0.02, 0.07, 0.46, 0.12, 0.17);
    window2(s, 'x', x1, -0.05, 0.1, 0.12, 0.15);
    A.smoke = st.roof === 'gable' ? [-0.2, -0.16, h + 0.62] : [0, 0, top];
    if (L >= 4) { // een aanbouw met een eigen dakje aan de voorkant
      walls(s, st, 0.1, y1 + 0.02, x1, y1 + 0.13, 0.0, 0.34);
      roof(s, st, 0.08, y1, x1 + 0.02, y1 + 0.15, 0.34, 0.12, 'x', { level: 3 });
      window2(s, 'y', y1 + 0.13, 0.2, 0.1, 0.1, 0.14);
    }
    if (L >= 5) { // hoektorentje
      s.cyl(x0, y1, 0.09, 0, h + 0.25, roundM(st, 0, h + 0.25));
      turretTop(s, st, x0, y1, 0.09, h + 0.25, 0.3);
      window2(s, 'y', y1 + 0.085, x0 - 0.03, h - 0.1, 0.06, 0.1);
    }
  }
  return A;
}

function lumber(s, st, L) {
  // open schuur op palen met een dak, ernaast stapels stammen en een hakblok
  const x0 = -0.36; const x1 = 0.1; const y0 = -0.36; const y1 = 0.12; const h = 0.42 + L * 0.03;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) s.box(x - 0.025, y - 0.025, 0, x + 0.025, y + 0.025, h, mat.wood('#6b4523'));
  s.box(x0, y0 - 0.02, 0, x1, y0 + 0.01, h * 0.7, mat.wood('#7a5129'));
  roof(s, st, x0, y0, x1, y1, h, 0.26, 'x', { level: L >= 3 ? 2 : 1, roof: st.roof === 'gable' || st.roof === 'greek' || st.roof === 'pagoda' ? st.roof : 'gable' });
  logPile(s, -0.13, -0.12, 3);
  logPile(s, 0.24, 0.0, L >= 2 ? 4 : 3);
  s.cyl(0.25, 0.3, 0.06, 0, 0.09, mat.logs('#8a6238'));
  s.box(0.24, 0.29, 0.09, 0.25, 0.3, 0.2, mat.wood('#6b4523'));
  return {};
}

// een hoop gefacetteerde rotsblokken (zoals de losse rotsen in de stad)
function rocks(s, cx, cy, R, H, c, seed) {
  let k = seed;
  const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
  rockShape(s, seed, cx, cy, R * 0.8, R * 0.7, H, mat.rock(c));
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2; const d = R * (0.35 + r() * 0.5);
    const rr = R * (0.28 + r() * 0.3);
    rockShape(s, seed * 13 + i, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, rr, rr * (0.7 + r() * 0.4), H * (0.35 + r() * 0.45), mat.rock(c));
  }
}

function quarry(s, st, L) {
  rocks(s, -0.1, -0.12, 0.36, 0.34, '#a29d92', 7);
  // uitgehakte trap in de rots
  s.box(-0.2, 0.0, 0, 0.12, 0.14, 0.12, mat.rock('#b3ada0'));
  s.box(-0.2, -0.1, 0.12, 0.08, 0.04, 0.22, mat.rock('#aaa496'));
  for (const [x, y, z] of [[0.2, 0.18, 0], [0.32, 0.12, 0], [0.26, 0.15, 0.08]]) s.box(x - 0.05, y - 0.04, z, x + 0.05, y + 0.04, z + 0.08, mat.stone('#d3cbb8'));
  if (L >= 2) { s.box(0.02, 0.24, 0, 0.32, 0.3, 0.02, mat.wood('#7a5129')); crate(s, -0.02, 0.32, 0.05); }
  if (L >= 3) { // hijsbalk
    s.box(-0.36, 0.28, 0, -0.33, 0.31, 0.7, mat.wood('#6b4523'));
    s.box(-0.36, 0.0, 0.66, -0.33, 0.31, 0.7, mat.wood('#6b4523'));
  }
  return {};
}

function goldmine(s, st, L) {
  rocks(s, -0.02, -0.1, 0.4, 0.42, '#8a8274', 11);
  for (const [x, y, z] of [[-0.18, 0.12, 0.2], [0.12, 0.2, 0.18], [-0.05, -0.1, 0.36], [0.28, -0.05, 0.25]]) s.ell(x, y, z, 0.03, 0.03, 0.03, mat.gold());
  // stutten van de mijningang aan de voorkant
  s.box(-0.14, 0.18, 0, -0.1, 0.32, 0.3, mat.wood('#6b4523'));
  s.box(0.06, 0.18, 0, 0.1, 0.32, 0.3, mat.wood('#6b4523'));
  s.box(-0.16, 0.18, 0.28, 0.12, 0.32, 0.33, mat.wood('#5a3a1e'));
  s.box(-0.1, 0.25, 0, 0.06, 0.31, 0.27, mat.plain('#14100c'));
  // karretje met goud
  s.box(0.18, 0.24, 0.05, 0.36, 0.36, 0.12, mat.wood('#7a5129'));
  for (const dx of [0.2, 0.34]) s.hcyl('y', dx, 0.04, 0.035, 0.23, 0.37, mat.wood('#4a3220'));
  for (const [x, y] of [[0.22, 0.28], [0.27, 0.32], [0.32, 0.27], [0.25, 0.3]]) s.ell(x, y, 0.13, 0.03, 0.03, 0.025, mat.gold());
  return {};
}

function storage(s, st, L) {
  const x0 = -0.36; const x1 = 0.3; const y0 = -0.32; const y1 = 0.26; const h = 0.42 + L * 0.05;
  s.box(x0, y0, 0, x1, y1, 0.06, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.06, h, { wall: st.wall === 'timber' ? 'wood' : st.wall });
  roof(s, st, x0, y0, x1, y1, h, 0.36, 'y', { level: L >= 2 ? 2 : 1 });
  door(s, 'y', y1 - 0.01, -0.12, 0.08, 0.06, 0.34, st);
  window2(s, 'x', x1 - 0.01, -0.12, 0.25, 0.1, 0.1);
  crate(s, 0.38, 0.1); crate(s, 0.4, -0.06, 0.06); crate(s, 0.38, 0.1, 0.05, 0.11);
  sacks(s, -0.25, 0.38); barrel(s, 0.12, 0.38);
  return {};
}

function barracks(s, st, L) {
  const x0 = -0.4; const x1 = 0.34; const y0 = -0.34; const y1 = 0.24; const h = 0.5 + L * 0.06;
  s.box(x0, y0, 0, x1, y1, 0.1, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.1, h, { wall: st.wall === 'timber' ? (L >= 2 ? 'stone' : 'timber') : st.wall });
  const top = roof(s, st, x0, y0, x1, y1, h, 0.34, 'x', { level: L >= 2 ? 3 : 2 });
  door(s, 'y', y1 - 0.01, -0.12, 0.06, 0.1, 0.42, st);
  window2(s, 'y', y1 - 0.01, 0.14, 0.28, 0.09, 0.14); window2(s, 'y', y1 - 0.01, -0.33, 0.28, 0.09, 0.14);
  window2(s, 'x', x1 - 0.01, -0.2, 0.28, 0.09, 0.14);
  // wapenrek en strooien pop voor de deur
  for (let k = 0; k < 4; k++) s.box(0.36 + k * 0.025, 0.28, 0, 0.37 + k * 0.025, 0.29, 0.42, mat.wood('#6b4523'));
  s.box(0.35, 0.27, 0.3, 0.46, 0.3, 0.32, mat.wood('#5a3a1e'));
  s.cyl(-0.3, 0.38, 0.012, 0, 0.36, mat.wood('#6b4523'));
  s.ell(-0.3, 0.38, 0.3, 0.05, 0.05, 0.08, mat.hay());
  const f = flagPole(s, x1 - 0.06, y0 + 0.06, top - 0.1, 0.5);
  return { flag: f };
}

function range(s, st, L) {
  const x0 = -0.38; const x1 = 0.1; const y0 = -0.36; const y1 = 0.1; const h = 0.44 + L * 0.04;
  s.box(x0, y0, 0, x1, y1, 0.06, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.06, h, { wall: st.wall === 'timber' ? 'wood' : st.wall });
  roof(s, st, x0, y0, x1, y1, h, 0.32, 'y', { level: 2 });
  door(s, 'y', y1 - 0.01, -0.2, -0.06, 0.06, 0.34, st);
  // schietschijven op palen
  for (const [x, y] of [[0.3, -0.2], [0.34, 0.12], [0.06, 0.34]]) {
    s.box(x - 0.01, y - 0.01, 0, x + 0.01, y + 0.01, 0.2, mat.wood('#6b4523'));
    s.hcyl('x', y, 0.26, 0.09, x - 0.015, x + 0.015, { k: 'target', cy: y, cz: 0.26, r: 0.09 });
  }
  return {};
}

function stable(s, st, L) {
  const x0 = -0.38; const x1 = 0.32; const y0 = -0.34; const y1 = 0.14; const h = 0.42 + L * 0.04;
  s.box(x0, y0, 0, x1, y1, 0.05, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.05, h, { wall: st.wall === 'timber' ? 'wood' : st.wall });
  roof(s, st, x0, y0, x1, y1, h, 0.34, 'x', { level: L >= 2 ? 2 : 1 });
  for (const a of [-0.3, -0.06, 0.18]) s.win('y', y1 - 0.01, a, a + 0.14, 0.05, 0.3, mat.door('#5a3a1e'));
  // omheining en hooi
  for (let x = -0.36; x <= 0.4; x += 0.19) s.box(x - 0.012, 0.4, 0, x + 0.012, 0.42, 0.18, mat.wood('#7a5129'));
  s.box(-0.36, 0.4, 0.13, 0.4, 0.415, 0.15, mat.wood('#8a5f33')); s.box(-0.36, 0.4, 0.07, 0.4, 0.415, 0.09, mat.wood('#8a5f33'));
  s.box(0.32, 0.18, 0, 0.44, 0.3, 0.1, mat.hay()); s.box(0.34, 0.2, 0.1, 0.42, 0.28, 0.18, mat.hay());
  s.box(-0.1, 0.22, 0, 0.12, 0.28, 0.06, mat.wood('#6b4523'));
  return {};
}

function smithy(s, st, L) {
  const x0 = -0.36; const x1 = 0.3; const y0 = -0.34; const y1 = 0.22; const h = 0.5 + L * 0.02;
  s.box(x0, y0, 0, x1, y1, 0.1, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.1, h, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#9c968b' : null });
  s.box(0.06, -0.3, 0, 0.22, -0.16, h + 0.6, mat.stone('#857f74'));
  roof(s, st, x0, y0, x1, y1, h, 0.32, 'y', { level: 3 });
  door(s, 'y', y1 - 0.01, -0.2, -0.04, 0.1, 0.4, st);
  // open werkplaats met aambeeld en vuur
  s.box(0.06, 0.3, 0, 0.16, 0.36, 0.12, mat.stone('#6f6a62'));
  s.box(0.04, 0.29, 0.12, 0.18, 0.37, 0.16, mat.metal('#3a3c40'));
  s.box(-0.1, 0.34, 0, -0.02, 0.4, 0.1, mat.stone('#7a7368'));
  s.box(-0.12, 0.33, 0.1, 0.0, 0.41, 0.13, mat.plain('#d9682a'));
  barrel(s, x1 + 0.08, y1 - 0.04);
  return { smoke: [0.14, -0.23, h + 0.6], glow: [-0.06, 0.37, 0.14] };
}

function market(s, st, L) {
  // kraampjes met gestreepte luifels
  const cols = [['#c0392b', '#efe6cf'], ['#2e7d4f', '#efe6cf'], ['#2c5fae', '#efe6cf'], ['#d9a441', '#7a2b2b']];
  const stalls = L >= 2 ? [[-0.2, -0.2], [0.18, -0.18], [-0.2, 0.18], [0.2, 0.2]] : [[-0.15, -0.1], [0.18, 0.12]];
  stalls.forEach(([x, y], k) => {
    for (const [dx, dy] of [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.1], [0.13, 0.1]]) s.box(x + dx - 0.01, y + dy - 0.01, 0, x + dx + 0.01, y + dy + 0.01, 0.32, mat.wood('#6b4523'));
    s.box(x - 0.13, y - 0.1, 0.12, x + 0.13, y + 0.1, 0.15, mat.wood('#8a5f33'));
    const [c1, c2] = cols[k % cols.length];
    s.gable(x - 0.14, y - 0.11, x + 0.14, y + 0.11, 0.32, 0.08, 'x', mat.cloth(c1, c2, false), 0.03);
    for (const [dx, dy, c] of [[-0.06, 0, '#d9483b'], [0, 0.03, '#e9b93a'], [0.06, -0.02, '#6ba33a']]) s.ell(x + dx, y + dy, 0.17, 0.03, 0.03, 0.025, mat.plain(c));
  });
  crate(s, 0.36, -0.02, 0.05); barrel(s, -0.38, 0.0); sacks(s, 0.0, 0.38);
  return {};
}

function tower(s, st, L) {
  const r = 0.2 + L * 0.015; const h = 1.0 + L * 0.38;
  const stoneM = st.wall === 'brick' ? mat.brick(st.stone) : mat.stone(st.stone);
  s.box(-r - 0.03, -r - 0.03, 0, r + 0.03, r + 0.03, 0.12, mat.stone(st.base));
  s.box(-r, -r, 0.12, r, r, h, stoneM);
  s.box(-r - 0.035, -r - 0.035, h, r + 0.035, r + 0.035, h + 0.05, stoneM);
  // kantelen
  const w = 0.05;
  for (let a = -r - 0.035; a < r; a += 0.1) {
    s.box(a, r - 0.01, h + 0.05, Math.min(r + 0.035, a + w), r + 0.035, h + 0.14, stoneM);
    s.box(r - 0.01, a, h + 0.05, r + 0.035, Math.min(r + 0.035, a + w), h + 0.14, stoneM);
    s.box(a, -r - 0.035, h + 0.05, Math.min(r + 0.035, a + w), -r + 0.01, h + 0.14, stoneM);
    s.box(-r - 0.035, a, h + 0.05, -r + 0.01, Math.min(r + 0.035, a + w), h + 0.14, stoneM);
  }
  let top = h + 0.14;
  if (L >= 2) {
    if (st.roof === 'dome') { s.ell(0, 0, h + 0.05, r * 0.8, r * 0.8, r * 0.9, mat.glaze(st.roofC), h + 0.05); top = h + r; }
    else if (st.roof === 'pagoda') { s.hip(-r, -r, r, r, h + 0.14, 0.3, mat.slate(st.roofC), 0.12); top = h + 0.44; }
    else if (st.roof === 'gable') { s.cone(0, 0, r * 1.05, h + 0.05, h + 0.05 + 0.55 + L * 0.05, mat.slate('#5c6370')); top = h + 0.65 + L * 0.05; }
  }
  s.win('y', r, -0.05, 0.05, 0.12, 0.36, mat.door());
  for (const z of [0.5, 0.9, 1.3]) if (z + 0.2 < h) { s.win('y', r, -0.025, 0.025, z, z + 0.12); s.win('x', r, -0.025, 0.025, z + 0.15, z + 0.27); }
  return { flag: flagPole(s, 0, 0, top - 0.05, 0.35) };
}

function workshop(s, st, L) {
  const x0 = -0.38; const x1 = 0.22; const y0 = -0.36; const y1 = 0.16; const h = 0.6;
  s.box(x0, y0, 0, x1, y1, 0.08, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.08, h, { wall: st.wall === 'timber' ? 'wood' : st.wall });
  roof(s, st, x0, y0, x1, y1, h, 0.38, 'y', { level: 2 });
  s.win('y', y1 - 0.01, -0.28, 0.06, 0.08, 0.5, mat.door('#5a3a1e'));
  // half afgewerkte ram en wielen
  s.box(0.2, 0.22, 0.05, 0.42, 0.36, 0.12, mat.wood('#7a5129'));
  for (const x of [0.24, 0.38]) for (const y of [0.21, 0.37]) s.hcyl('y', x, 0.05, 0.05, y - 0.01, y + 0.01, mat.wood('#5a3a1e'));
  s.hcyl('x', 0.29, 0.15, 0.035, 0.12, 0.46, mat.logs('#8a6238'));
  s.hcyl('y', -0.35, 0.08, 0.08, 0.24, 0.27, mat.wood('#6b4523'));
  logPile(s, 0.3, -0.18, 2);
  return {};
}

function monument(s, st, L) {
  const steps = 2 + Math.min(3, L);
  let z = 0;
  for (let k = 0; k < steps; k++) {
    const w = 0.9 - k * 0.14;
    s.box(-w, -w, z, w, w, z + 0.1, mat.stone(k % 2 ? '#e6dfcf' : '#d3cbb8'));
    z += 0.1;
  }
  if (st.roof === 'dome') {
    s.cyl(0, 0, 0.32, z, z + 0.4, mat.plaster(st.plaster, z, z + 0.4));
    s.ell(0, 0, z + 0.4, 0.32, 0.32, 0.4, mat.glaze(st.roofC), z + 0.4);
    return { glow: [0, 0, z + 0.85] };
  }
  const h = 1.2 + L * 0.25;
  s.box(-0.12, -0.12, z, 0.12, 0.12, z + h, mat.stone(st.roof === 'flat' ? '#e2cc96' : '#e8e2d2'));
  s.hip(-0.12, -0.12, 0.12, 0.12, z + h, 0.16, mat.gold(), 0);
  for (const [x, y] of [[-0.6, 0.6], [0.6, 0.6], [0.6, -0.6]]) { s.box(x - 0.06, y - 0.06, z - 0.1 * (steps - 1), x + 0.06, y + 0.06, z - 0.1 * (steps - 1) + 0.12, mat.stone('#a39a89')); s.ell(x, y, z - 0.1 * (steps - 1) + 0.18, 0.05, 0.05, 0.06, mat.gold()); }
  return { glow: [0, 0, z + h + 0.12] };
}

// stadscentrum (2x2): hal, later stenen burcht; de volkeren hebben vanaf het IJzertijdperk een eigen bouwwerk
function tc(s, st, L, civ) {
  const A = {};
  if (L >= 3 && civ && TC_CIV[civ]) return TC_CIV[civ](s, st, L);
  if (L <= 1) {
    s.box(-0.8, -0.7, 0, 0.8, 0.7, 0.08, mat.stone(st.base));
    walls(s, st, -0.78, -0.68, 0.78, 0.68, 0.08, 0.55, { wall: st.wall === 'timber' ? 'logs' : st.wall });
    const top = roof(s, st, -0.78, -0.68, 0.78, 0.68, 0.55, 0.62, 'x', { level: 1 });
    door(s, 'y', 0.68, -0.12, 0.12, 0.08, 0.45, st);
    window2(s, 'y', 0.68, 0.35, 0.28); window2(s, 'y', 0.68, -0.5, 0.28); window2(s, 'x', 0.78, -0.3, 0.28); window2(s, 'x', 0.78, 0.2, 0.28);
    crate(s, 0.92, 0.3); barrel(s, 0.9, -0.3); sacks(s, -0.5, 0.86);
    A.flag = flagPole(s, 0.6, -0.5, top - 0.1, 0.4); A.smoke = [-0.4, 0, top];
    return A;
  }
  if (L === 2) {
    s.box(-0.84, -0.74, 0, 0.84, 0.74, 0.2, mat.stone(st.stone));
    walls(s, st, -0.82, -0.72, 0.82, 0.72, 0.2, 0.75);
    roof(s, st, -0.84, -0.74, 0.84, 0.74, 0.75, 0.6, 'x', { level: 2 });
    // klokkentoren
    walls(s, st, -0.18, -0.18, 0.18, 0.18, 1.0, 1.5);
    const top = roof(s, st, -0.2, -0.2, 0.2, 0.2, 1.5, 0.35, 'x', { level: 2, roof: st.roof === 'gable' ? 'hip' : st.roof });
    door(s, 'y', 0.72, -0.14, 0.14, 0.2, 0.62, st);
    for (const a of [-0.6, -0.35, 0.3, 0.55]) window2(s, 'y', 0.72, a, 0.42, 0.11, 0.18);
    for (const a of [-0.5, -0.1, 0.3]) window2(s, 'x', 0.82, a, 0.42, 0.11, 0.18);
    crate(s, 0.98, 0.3); barrel(s, 0.95, -0.35); sacks(s, -0.5, 0.9);
    A.flag = flagPole(s, 0, 0, top, 0.4);
    return A;
  }
  // burcht: donjon met hoektorens
  const big = L >= 4;
  const stoneM = mat.stone(st.stone);
  const R = big ? 0.86 : 0.8;
  s.box(-R, -R, 0, R, R, 0.1, mat.stone(st.base));
  s.box(-R + 0.08, -R + 0.08, 0.1, R - 0.08, R - 0.08, big ? 1.0 : 0.85, stoneM);
  const kz = big ? 1.0 : 0.85;
  for (let a = -R + 0.08; a < R - 0.1; a += 0.12) {
    s.box(a, R - 0.12, kz, a + 0.06, R - 0.08, kz + 0.1, stoneM); s.box(R - 0.12, a, kz, R - 0.08, a + 0.06, kz + 0.1, stoneM);
  }
  // donjon
  s.box(-0.42, -0.42, kz, 0.3, 0.3, kz + (big ? 0.8 : 0.6), stoneM);
  const top = roof(s, st, -0.44, -0.44, 0.32, 0.32, kz + (big ? 0.8 : 0.6), 0.5, 'x', { level: 3, roof: 'hip', roofC: L >= 5 ? '#2f5d9e' : null });
  for (const [x, y] of [[-R + 0.12, R - 0.12], [R - 0.12, R - 0.12], [R - 0.12, -R + 0.12], [-R + 0.12, -R + 0.12]]) {
    s.cyl(x, y, 0.15, 0, kz + 0.35, stoneM);
    s.cone(x, y, 0.19, kz + 0.35, kz + 0.85, L >= 5 ? mat.slate('#2f5d9e') : mat.slate('#5c6370'));
    if (L >= 5) s.ell(x, y, kz + 0.88, 0.03, 0.03, 0.04, mat.gold());
  }
  s.win('y', R - 0.08, -0.14, 0.14, 0.1, 0.5, mat.door('#5a3a1e'));
  for (const a of [-0.5, 0.35]) window2(s, 'y', R - 0.08, a, 0.5, 0.08, 0.16);
  for (const a of [-0.4, 0.3]) window2(s, 'x', R - 0.08, a, 0.5, 0.08, 0.16);
  window2(s, 'y', 0.3, -0.2, kz + 0.25, 0.1, 0.18); window2(s, 'x', 0.3, -0.1, kz + 0.25, 0.1, 0.18);
  A.flag = flagPole(s, -0.06, -0.06, top - 0.05, 0.45);
  return A;
}

// eigen bouwwerken per volk voor het stadscentrum (IJzer- en Kroontijdperk)
const TC_CIV = {
  egypt(s, st, L) { // tempel met pylonen en obelisken
    const z = 0.1; const h = L >= 4 ? 0.95 : 0.8;
    s.box(-0.9, -0.9, 0, 0.9, 0.9, z, mat.stone('#c8ad78'));
    s.box(-0.6, -0.75, z, 0.55, 0.45, z + h * 0.7, mat.stone(st.stone));
    roof(s, st, -0.6, -0.75, 0.55, 0.45, z + h * 0.7, 0.2, 'x', { roof: 'flat' });
    // pylonen: schuine torens aan beide kanten van de poort (aan de voorkant)
    for (const x0 of [-0.62, 0.12]) {
      const x1 = x0 + 0.48;
      s.poly([[-1, 0.12, 0, -x0], [1, 0.12, 0, x1 + 0.06], [0, -1, 0, -0.45], [0, 1, 0.12, 0.7 + 0.08], [0, 0, -1, -z], [0, 0, 1, z + h]], [x0, 0.45, z, x1 + 0.06, 0.78, z + h], mat.stone('#dcc49a'));
      band(s, x0 + 0.02, 0.45, x1, 0.72, z + h - 0.06, 0.04, st.trim);
    }
    s.win('y', 0.72, -0.12, 0.12, z, z + 0.5, mat.door('#5a3a1e'));
    for (const x of [-0.82, 0.82]) { s.box(x - 0.05, 0.75, z, x + 0.05, 0.85, z + 0.06, mat.stone('#bca06a')); s.box(x - 0.035, 0.765, z + 0.06, x + 0.035, 0.835, z + 1.0, mat.stone('#e2cc96')); s.hip(x - 0.035, 0.765, x + 0.035, 0.835, z + 1.0, 0.1, mat.gold(), 0); }
    if (L >= 5) { // Kroon: gouden randen, twee obelisken achteraan en een gouden piramidion op het dak
      for (const x0 of [-0.62, 0.12]) band(s, x0 + 0.02, 0.45, x0 + 0.48, 0.72, z + h - 0.02, 0.03, '#e0b23a');
      for (const [x, y] of [[-0.82, -0.82], [0.82, -0.82]]) { s.box(x - 0.04, y - 0.04, z, x + 0.04, y + 0.04, z + 1.25, mat.stone('#e2cc96')); s.hip(x - 0.04, y - 0.04, x + 0.04, y + 0.04, z + 1.25, 0.12, mat.gold(), 0); }
      s.hip(-0.3, -0.45, 0.25, 0.1, z + h * 0.7 + 0.2, 0.35, mat.gold(), 0);
    }
    return { flag: flagPole(s, -0.1, -0.2, z + h * 0.7 + (L >= 5 ? 0.55 : 0.1), 0.6) };
  },
  greek(s, st, L) { // tempel met zuilen rondom
    const z = 0.14; const W = 0.78; const D = 0.62; const ch = L >= 4 ? 0.8 : 0.68;
    for (let k = 0; k < 3; k++) s.box(-W - 0.12 + k * 0.04, -D - 0.12 + k * 0.04, k * z / 3, W + 0.12 - k * 0.04, D + 0.12 - k * 0.04, (k + 1) * z / 3, mat.stone('#e6dfcf'));
    s.box(-W + 0.16, -D + 0.16, z, W - 0.16, D - 0.16, z + ch, mat.plaster('#efe7d6', z, z + ch));
    for (let x = -W; x <= W + 0.001; x += (2 * W) / 6) for (const y of [-D, D]) s.cyl(x, y, 0.05, z, z + ch, mat.plaster('#f4efe4', z, z + ch));
    for (let y = -D + (2 * D) / 4; y < D - 0.01; y += (2 * D) / 4) for (const x of [-W, W]) s.cyl(x, y, 0.05, z, z + ch, mat.plaster('#f4efe4', z, z + ch));
    s.box(-W - 0.07, -D - 0.07, z + ch, W + 0.07, D + 0.07, z + ch + 0.1, mat.plaster('#efe7d6', z, z + 1));
    band(s, -W - 0.07, -D - 0.07, W + 0.07, D + 0.07, z + ch + 0.04, 0.03, st.trim);
    s.gable(-W - 0.07, -D - 0.07, W + 0.07, D + 0.07, z + ch + 0.1, 0.32, 'y', mat.tiles(st.roofC, mat.plaster('#efe7d6', z, z + 2)), 0.05);
    s.win('y', D - 0.16, -0.12, 0.12, z, z + 0.48, mat.door('#6b4224'));
    if (L >= 5) { // Kroon: gouden beelden op de nok en voor de trap
      for (const x of [-W, W]) s.ell(x, 0, z + ch + 0.46, 0.05, 0.05, 0.08, mat.gold());
      for (const x of [-0.45, 0.45]) { s.box(x - 0.07, D + 0.16, 0, x + 0.07, D + 0.3, 0.22, mat.stone('#e6dfcf')); s.ell(x, D + 0.23, 0.3, 0.05, 0.05, 0.09, mat.gold()); s.ell(x, D + 0.23, 0.41, 0.03, 0.03, 0.03, mat.gold()); }
    }
    return { flag: flagPole(s, 0, -D + 0.1, z + ch + 0.35, 0.35) };
  },
  yamato(s, st, L) { // kasteel op een schuine stenen voet met lagen pagodedaken
    const base = 0.32;
    s.poly([[-1, 0, 0.35, 0.86], [1, 0, 0.35, 0.86], [0, -1, 0.35, 0.86], [0, 1, 0.35, 0.86], [0, 0, -1, 0], [0, 0, 1, base]], [-0.86, -0.86, 0, 0.86, 0.86, base], mat.stone('#9a958b'));
    let z = base; let w = 0.62;
    const tiers = L >= 5 ? 4 : L >= 4 ? 3 : 2;
    let top = z;
    for (let k = 0; k < tiers; k++) {
      const hh = 0.36 - k * 0.04;
      walls(s, st, -w, -w, w, w, z, z + hh, { wall: 'shoji' });
      top = roof(s, st, -w, -w, w, w, z + hh, 0.34, 'x', { roof: 'pagoda' });
      z = z + hh + 0.16; w *= 0.72;
    }
    s.win('y', 0.62, -0.1, 0.1, base, base + 0.26, mat.door('#3a2a20'));
    s.box(-0.04, 0.86, 0, 0.04, 0.9, 0.5, mat.plain('#b8322a'));
    if (L >= 5) for (const x of [-0.3, 0.3]) s.ell(x, 0, top - 0.05, 0.035, 0.03, 0.05, mat.gold()); // gouden vissen op de nok
    return { flag: flagPole(s, 0, 0, top, 0.3) };
  },
  babylon(s, st, L) { // ziggoerat: trappen van leemsteen met een heiligdom bovenaan
    const tiers = L >= 5 ? 5 : L >= 4 ? 4 : 3; let z = 0; let w = 0.9;
    for (let k = 0; k < tiers; k++) {
      const hh = 0.26;
      s.box(-w, -w, z, w, w, z + hh, mat.brick(k % 2 ? '#c49a62' : '#b88d58'));
      band(s, -w, -w, w, w, z + hh - 0.06, 0.04, k % 2 ? st.trim2 : st.trim);
      z += hh; w -= 0.17;
    }
    s.box(-w * 0.8, -w * 0.8, z, w * 0.8, w * 0.8, z + 0.3, mat.plain(st.trim));
    roof(s, st, -w * 0.8, -w * 0.8, w * 0.8, w * 0.8, z + 0.3, 0.1, 'x', { roof: 'crenel' });
    if (L >= 5) s.hip(-w * 0.5, -w * 0.5, w * 0.5, w * 0.5, z + 0.43, 0.2, mat.gold(), 0); // gouden heiligdom
    // trap aan de voorkant
    for (let k = 0; k < tiers * 3; k++) s.box(-0.12, 0.9 - k * 0.055, 0, 0.12, 0.95 - k * 0.055, (k + 1) * (0.26 / 3), mat.brick('#d0a870'));
    return { flag: flagPole(s, 0, 0, z + 0.4, 0.35) };
  },
  persia(s, st, L) { // paleis met poortboog (iwan), koepel en twee slanke torens
    const z = 0.1;
    s.box(-0.88, -0.88, 0, 0.88, 0.88, z, mat.stone(st.base));
    walls(s, st, -0.7, -0.7, 0.7, 0.55, z, z + 0.6);
    const top = roof(s, st, -0.7, -0.7, 0.7, 0.55, z + 0.6, 0.4, 'x', { roof: 'dome', domeR: 0.36 });
    // iwan: hoge poort aan de voorkant
    s.box(-0.32, 0.55, z, 0.32, 0.72, z + 0.82, mat.plaster(st.plaster, z, z + 0.82));
    band(s, -0.32, 0.55, 0.32, 0.72, z + 0.74, 0.05, st.trim);
    s.win('y', 0.72, -0.17, 0.17, z, z + 0.6, mat.plain('#1d2a38'));
    for (const x of [-0.8, 0.8]) { s.cyl(x, 0.75, 0.07, z, z + (L >= 4 ? 1.5 : 1.2), mat.plaster('#efe4cc', z, z + 2)); s.ell(x, 0.75, z + (L >= 4 ? 1.5 : 1.2), 0.08, 0.08, 0.1, L >= 5 ? mat.gold() : mat.glaze(st.roofC, x, 0.75)); }
    if (L >= 5) { // Kroon: twee minaretten achteraan en een gouden top op de koepel
      for (const x of [-0.8, 0.8]) { s.cyl(x, -0.78, 0.06, z, z + 1.35, mat.plaster('#efe4cc', z, z + 2)); s.ell(x, -0.78, z + 1.35, 0.07, 0.07, 0.09, mat.glaze(st.roofC, x, -0.78)); }
      s.ell(0, -0.08, top - 0.02, 0.05, 0.05, 0.07, mat.gold());
    }
    return { flag: flagPole(s, 0, -0.08, top + (L >= 5 ? 0.05 : 0), 0.3) };
  },
};


// ---------- nieuwe gebouwen (Brons tot Kroon) ----------

const towerM = (st) => (st.wall === 'brick' ? mat.brick(st.stone) : mat.stone(st.stone));
// muurmateriaal voor ronde vormen (cilinders): steen, leemsteen of pleister
const roundM = (st, z0, z1) => (st.wall === 'brick' ? mat.brick(st.stone) : st.wall === 'plaster' || st.wall === 'shoji' ? mat.plaster(st.plaster, z0, z1) : mat.stone(st.stone));
// spits dak op een ronde toren in de stijl van het volk; geeft de top terug
function turretTop(s, st, x, y, r, z, h) {
  if (st.roof === 'dome') { s.ell(x, y, z, r * 1.05, r * 1.05, r * 1.25, mat.glaze(st.roofC, x, y), z); s.ell(x, y, z + r * 1.3, 0.018, 0.018, 0.022, mat.gold()); return z + r * 1.32; }
  if (st.roof === 'pagoda') { s.hip(x - r * 1.2, y - r * 1.2, x + r * 1.2, y + r * 1.2, z, h * 0.6, mat.slate(st.roofC), 0.08); return z + h * 0.6; }
  if (st.roof === 'flat' || st.roof === 'crenel') { s.cyl(x, y, r * 1.08, z, z + 0.05, towerM(st)); s.hip(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, z + 0.05, h * 0.45, mat.gold(), 0); return z + 0.05 + h * 0.45; }
  s.cone(x, y, r * 1.15, z, z + h, st.roof === 'greek' ? mat.tiles(st.roofC) : mat.slate('#4f5866'));
  return z + h;
}
function bannerCloth(s, x, y, z, h, c, face = 'y') {
  s.cyl(x, y, 0.01, 0, z + h + 0.04, mat.wood('#4a3220'));
  if (face === 'y') s.box(x + 0.01, y - 0.004, z, x + 0.11, y + 0.004, z + h, mat.cloth(c));
  else s.box(x - 0.004, y + 0.01, z, x + 0.004, y + 0.11, z + h, mat.cloth(c));
  s.ell(x, y, z + h + 0.05, 0.016, 0.016, 0.016, mat.gold());
}

function mill(s, st, L) {
  const cy = -0.06; const r = 0.19 + L * 0.012; const h = 0.72 + L * 0.08;
  s.cyl(0, cy, r + 0.05, 0, 0.08, mat.stone(st.base));
  s.cyl(0, cy, r, 0.08, h, roundM(st, 0.08, h));
  const top = st.roof === 'gable' || st.roof === 'greek' ? (s.cone(0, cy, r + 0.06, h, h + 0.34, L >= 3 ? mat.slate('#5c6370') : mat.thatch()), h + 0.34) : turretTop(s, st, 0, cy, r + 0.02, h, 0.34);
  door(s, 'y', cy + r, -0.06, 0.06, 0.08, 0.3, st);
  window2(s, 'y', cy + r, -0.04, h - 0.3, 0.08, 0.12);
  // wieken op de voorkant (rechts), een kruis met zeildoek
  const hz = h - 0.04; const hx = r + 0.05; const len = 0.4 + L * 0.025;
  s.hcyl('x', cy, hz, 0.028, hx - 0.06, hx + 0.03, mat.wood('#5a3a1e'));
  const bar = mat.wood('#6b4523'); const sail = mat.cloth(L >= 3 ? '#f2ead6' : '#e4d6b4');
  s.box(hx + 0.02, cy - 0.016, hz - len, hx + 0.036, cy + 0.016, hz + len, bar);
  s.box(hx + 0.02, cy - len, hz - 0.016, hx + 0.036, cy + len, hz + 0.016, bar);
  s.box(hx + 0.024, cy + 0.016, hz + 0.08, hx + 0.03, cy + 0.11, hz + len - 0.02, sail);
  s.box(hx + 0.024, cy - 0.11, hz - len + 0.02, hx + 0.03, cy - 0.016, hz - 0.08, sail);
  s.box(hx + 0.024, cy + 0.08, hz - 0.11, hx + 0.03, cy + len - 0.02, hz - 0.016, sail);
  s.box(hx + 0.024, cy - len + 0.02, hz + 0.016, hx + 0.03, cy - 0.08, hz + 0.11, sail);
  s.ell(hx + 0.04, cy, hz, 0.03, 0.03, 0.03, mat.metal('#4d4f54'));
  sacks(s, -0.3, 0.3); if (L >= 2) sacks(s, 0.3, 0.32);
  if (L >= 3) { s.box(-0.42, -0.42, 0, -0.18, -0.3, 0.16, mat.hay()); }
  if (L >= 4) { s.box(-0.4, 0.15, 0, -0.22, 0.4, 0.22, mat.wood('#8a5f33')); s.gable(-0.42, 0.13, -0.2, 0.42, 0.22, 0.12, 'y', mat.tiles('#9a4630'), 0.02); }
  if (L >= 5) { s.cyl(0, cy, 0.008, top, top + 0.16, mat.metal('#3a3c40')); s.box(-0.05, cy - 0.004, top + 0.12, 0.05, cy + 0.004, top + 0.15, mat.gold()); }
  return {};
}

// Academie: zaal met zuilengang; niveau 2 een toren, niveau 3 een sterrenwacht. v = afgewerkte soorten onderzoek
// (bit 1 voetvolk: schildenrek, 2 schutters: schietschijf met vuurpijl, 4 ruiterij: harnas op een paal, 8 stad: pekketel)
function academy(s, st, L, civ, v = 0) {
  const x0 = -0.4; const x1 = 0.22; const y0 = -0.38; const y1 = 0.1; const h = 0.6 + L * 0.06;
  s.box(x0 - 0.02, y0 - 0.02, 0, x1 + 0.02, y1 + 0.22, 0.1, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.1, h);
  const top = roof(s, st, x0, y0, x1, y1, h, 0.32, 'x', { level: 3 });
  // zuilengang aan de voorkant
  const ph = h * 0.82;
  for (let k = 0; k < 4; k++) { const x = x0 + 0.06 + k * ((x1 - x0 - 0.12) / 3); s.cyl(x, y1 + 0.16, 0.03, 0.1, ph, mat.plaster('#f1ebde', 0.1, ph)); }
  s.box(x0, y1, ph, x1, y1 + 0.2, ph + 0.06, mat.plaster(st.plaster, ph, ph + 0.06));
  if (st.trim) band(s, x0, y1, x1, y1 + 0.2, ph + 0.01, 0.025, st.trim);
  door(s, 'y', y1, -0.14, 0.0, 0.1, 0.4, st);
  for (const a of [-0.34, 0.08]) window2(s, 'y', y1, a, 0.3, 0.09, 0.16);
  window2(s, 'x', x1, -0.3, h - 0.26, 0.1, 0.15); window2(s, 'x', x1, -0.1, h - 0.26, 0.1, 0.15);
  let peak = top;
  if (L >= 2) { // toren achteraan
    const tx = -0.28; const ty = -0.26; const tz = h + 0.45;
    walls(s, st, tx - 0.11, ty - 0.11, tx + 0.11, ty + 0.11, h - 0.05, tz);
    window2(s, 'x', tx + 0.11, -0.05 + ty, tz - 0.2, 0.08, 0.12);
    if (L >= 3) { // sterrenwacht: koepel met een gouden ring en een kijkspleet
      s.cyl(tx, ty, 0.13, tz, tz + 0.05, mat.stone(st.stone));
      s.ell(tx, ty, tz + 0.05, 0.12, 0.12, 0.12, mat.metal('#5f7f9e'), tz + 0.05);
      s.cyl(tx, ty, 0.125, tz + 0.05, tz + 0.07, mat.gold());
      s.box(tx + 0.02, ty - 0.02, tz + 0.08, tx + 0.13, ty + 0.02, tz + 0.15, mat.plain('#1d1a16'));
      s.cap([tx + 0.06, ty, tz + 0.12], [tx + 0.2, ty, tz + 0.22], 0.012, mat.metal('#b08a3a'));
      peak = tz + 0.18;
    } else peak = turretTop(s, st, tx, ty, 0.1, tz, 0.3);
  }
  // wat er al onderzocht is, staat buiten
  if (v & 1) for (let k = 0; k < 3; k++) { const y = -0.3 + k * 0.1; s.box(0.33, y - 0.005, 0, 0.345, y + 0.005, 0.2, mat.wood('#5a3a1e')); s.ell(0.36, y, 0.17, 0.008, 0.045, 0.06, mat.plain(k === 1 ? '#c0392b' : '#8a6238')); s.ell(0.37, y, 0.17, 0.006, 0.012, 0.012, mat.metal('#c9a23a')); }
  if (v & 2) { s.box(0.33, 0.33, 0, 0.35, 0.35, 0.22, mat.wood('#6b4523')); s.hcyl('x', 0.34, 0.27, 0.085, 0.325, 0.355, { k: 'target', cy: 0.34, cz: 0.27, r: 0.085 }); s.cap([0.37, 0.33, 0.29], [0.44, 0.36, 0.31], 0.004, mat.wood('#d9c9a0')); s.ell(0.36, 0.33, 0.285, 0.018, 0.018, 0.026, mat.plain('#ff8a1e', true)); }
  if (v & 4) { s.cyl(-0.3, 0.38, 0.012, 0, 0.32, mat.wood('#5a3a1e')); s.ell(-0.3, 0.38, 0.26, 0.05, 0.06, 0.07, mat.metal('#aab1bb')); s.ell(-0.3, 0.38, 0.35, 0.03, 0.03, 0.035, mat.metal('#c9ced6')); s.box(-0.36, 0.32, 0.04, -0.24, 0.44, 0.08, mat.cloth('#7a2b2b')); }
  if (v & 8) { s.cyl(0.0, 0.2, 0.05, ph + 0.06, ph + 0.13, mat.metal('#3a3c40')); s.cyl(0.0, 0.2, 0.042, ph + 0.12, ph + 0.135, mat.plain('#2a1d12')); }
  const A = { flag: flagPole(s, x1 - 0.05, y0 + 0.05, top - 0.05, 0.35) };
  if (v & 8) A.smoke = [0.0, 0.2, ph + 0.14];
  if (peak > top + 0.2) A.flag = flagPole(s, -0.28, -0.26, peak, 0.25);
  return A;
}

// Gildehuis: hoog koopmanshuis met een trapgevel, een hijsbalk en een gouden uithangbord
function guild(s, st, L) {
  const x0 = -0.32; const x1 = 0.3; const y0 = -0.36; const y1 = 0.2; const h = 0.86 + L * 0.07;
  s.box(x0 - 0.03, y0 - 0.03, 0, x1 + 0.03, y1 + 0.03, 0.1, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.1, h, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#b9a07a' : null });
  // trapgevel aan de voorkant (+y), anders het dak van het volk
  if (st.roof === 'gable' || st.roof === 'greek' || st.roof === 'flat' || st.roof === 'crenel') {
    s.gable(x0, y0, x1, y1, h, 0.42, 'y', mat.tiles(st.roofC || '#9a4630'), 0.03);
    const m = st.wall === 'brick' ? mat.brick(st.stone) : mat.stone(st.roof === 'flat' ? '#d8bf8a' : '#c9b48e');
    for (let k = 0; k < 4; k++) { const w = (x1 - x0) / 2 - k * 0.075; s.box(-0.01 - w, y1 - 0.02, h + k * 0.1, -0.01 + w, y1 + 0.03, h + (k + 1) * 0.1, m); }
  } else roof(s, st, x0, y0, x1, y1, h, 0.42, 'y', { level: 3 });
  // arcade beneden, grote ramen boven
  for (const a of [-0.26, -0.06, 0.14]) s.win('y', y1, a, a + 0.12, 0.1, 0.34, mat.plain('#2a2018'));
  for (let z = 0.45; z + 0.18 < h; z += 0.24) for (const a of [-0.24, -0.02, 0.18]) window2(s, 'y', y1, a, z, 0.08, 0.15);
  for (let z = 0.45; z + 0.18 < h; z += 0.24) window2(s, 'x', x1, -0.12, z, 0.1, 0.15);
  if (st.trim) band(s, x0, y0, x1, y1, h - 0.06, 0.03, st.trim);
  // hijsbalk en balen
  s.box(-0.04, y1, h + 0.12, 0.02, y1 + 0.14, h + 0.16, mat.wood('#5a3a1e'));
  s.cap([-0.01, y1 + 0.13, h + 0.12], [-0.01, y1 + 0.13, 0.36], 0.004, mat.plain('#cdbb92'));
  s.box(-0.05, y1 + 0.1, 0.28, 0.03, y1 + 0.18, 0.36, mat.cloth('#b0854a'));
  // uithangbord met een gouden munt
  s.box(x1, y1 - 0.06, 0.62, x1 + 0.1, y1 - 0.05, 0.64, mat.metal('#3a3c40'));
  s.hcyl('x', y1 - 0.055, 0.56, 0.05, x1 + 0.07, x1 + 0.08, mat.gold());
  for (const [x, y] of [[0.38, -0.1], [0.4, 0.06], [0.39, -0.02]]) s.box(x - 0.05, y - 0.04, 0, x + 0.05, y + 0.04, 0.09, mat.cloth(['#8a5f33', '#a8743f', '#7a4a2a'][Math.round(x * 100) % 3]));
  barrel(s, -0.4, 0.3); if (L >= 2) crate(s, 0.3, 0.36, 0.05);
  return { flag: flagPole(s, x0 + 0.05, y0 + 0.05, h + 0.3, 0.3) };
}

// Bouwloods: open loods, een houten kraan met een steenblok en stapels balken en blokken
function lodge(s, st, L) {
  const x0 = -0.4; const x1 = 0.06; const y0 = -0.4; const y1 = 0.02; const h = 0.42 + L * 0.04;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) s.box(x - 0.022, y - 0.022, 0, x + 0.022, y + 0.022, h, mat.wood('#6b4523'));
  s.box(x0, y0 - 0.02, 0, x1, y0 + 0.01, h * 0.75, mat.wood('#7a5129'));
  roof(s, st, x0, y0, x1, y1, h, 0.24, 'x', { level: 2, roof: st.roof === 'pagoda' ? 'pagoda' : 'gable' });
  logPile(s, -0.17, -0.18, 3);
  // kraan
  const cx = 0.26; const cy = -0.2; const ch = 0.95 + L * 0.12;
  s.box(cx - 0.03, cy - 0.03, 0, cx + 0.03, cy + 0.03, ch, mat.wood('#5a3a1e'));
  for (const [dx, dy] of [[-0.12, 0], [0.12, 0], [0, -0.12], [0, 0.12]]) s.cap([cx + dx, cy + dy, 0], [cx, cy, 0.32], 0.012, mat.wood('#6b4523'));
  s.cap([cx, cy, ch - 0.04], [cx - 0.04, cy + 0.52, ch + 0.14], 0.018, mat.wood('#6b4523'));
  s.cap([cx, cy, ch + 0.02], [cx - 0.04, cy + 0.52, ch + 0.14], 0.004, mat.plain('#cdbb92'));
  s.cap([cx - 0.04, cy + 0.5, ch + 0.12], [cx - 0.04, cy + 0.5, 0.42], 0.004, mat.plain('#cdbb92'));
  s.box(cx - 0.1, cy + 0.42, 0.3, cx + 0.02, cy + 0.56, 0.42, mat.stone('#d3cbb8'));
  s.hcyl('y', cx - 0.08, 0.14, 0.12, cy - 0.06, cy - 0.02, mat.wood('#7a5129')); // tredmolen
  for (const [x, y, z] of [[0.3, 0.3, 0], [0.4, 0.22, 0], [0.34, 0.26, 0.08], [-0.3, 0.32, 0]]) s.box(x - 0.05, y - 0.04, z, x + 0.05, y + 0.04, z + 0.08, mat.stone('#cfc6b2'));
  if (L >= 2) { s.box(-0.42, 0.14, 0, -0.1, 0.24, 0.06, mat.wood('#9c6b3c')); s.box(-0.4, 0.15, 0.06, -0.12, 0.23, 0.1, mat.wood('#8a5f33')); }
  if (L >= 3) for (const x of [-0.1, 0.0]) s.box(x - 0.012, 0.3, 0, x + 0.012, 0.32, 0.55, mat.wood('#7a5129'));
  return {};
}

// Adelshof: herenhuis met een hoog dak, twee hoektorens en een poortje met een wapenschild
function court(s, st, L) {
  const x0 = -0.36; const x1 = 0.28; const y0 = -0.34; const y1 = 0.2; const h = 0.78 + L * 0.08;
  s.box(x0 - 0.04, y0 - 0.04, 0, x1 + 0.04, y1 + 0.04, 0.12, mat.stone(st.stone));
  walls(s, st, x0, y0, x1, y1, 0.12, h, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#c9c0ac' : null });
  const top = roof(s, st, x0, y0, x1, y1, h, 0.46, 'x', { level: 3, roof: st.roof === 'gable' ? 'hip' : st.roof, roofC: '#3f4a5c' });
  if (st.trim) band(s, x0, y0, x1, y1, h - 0.07, 0.035, st.trim);
  band(s, x0, y0, x1, y1, h - 0.025, 0.018, '#d4a017');
  // hoektorens vooraan
  const tr = 0.09 + L * 0.01; const th = h + 0.22 + L * 0.06;
  for (const [x, y] of [[x1, y1], [x0 + 0.02, y1]]) { s.cyl(x, y, tr, 0, th, roundM(st, 0, th)); turretTop(s, st, x, y, tr, th, 0.36); window2(s, 'y', y + tr - 0.01, x - 0.03, th - 0.24, 0.06, 0.1); }
  // poort met wapenschild
  s.win('y', y1, -0.12, 0.06, 0.12, 0.44, mat.door('#4a2e18'));
  s.ell(-0.03, y1 + 0.01, 0.56, 0.06, 0.012, 0.07, mat.plain(st.trim || '#2c5fae'));
  s.ell(-0.03, y1 + 0.016, 0.56, 0.03, 0.01, 0.035, mat.gold());
  for (const a of [-0.3, 0.12]) { window2(s, 'y', y1, a, 0.3, 0.08, 0.15); window2(s, 'y', y1, a, 0.56, 0.08, 0.15); }
  window2(s, 'x', x1, -0.22, 0.5, 0.09, 0.15); window2(s, 'x', x1, -0.02, 0.5, 0.09, 0.15);
  bannerCloth(s, x1 + 0.12, y1 + 0.12, 0.3, 0.28, st.trim || '#7a2b2b');
  if (L >= 2) bannerCloth(s, x0 - 0.02, y1 + 0.14, 0.3, 0.28, st.trim2 || st.trim || '#7a2b2b');
  if (L >= 3) for (const x of [x0 + 0.1, x1 - 0.1]) s.ell(x, -0.07, top - 0.02, 0.025, 0.025, 0.03, mat.gold());
  return { flag: flagPole(s, -0.04, -0.07, top - 0.04, 0.42) };
}

// Kathedraal: lang schip, een hoge toren met spits (of de koepel of pagode van het volk) en een roosvenster
function cathedral(s, st, L) {
  const x0 = -0.42; const x1 = 0.14; const y0 = -0.24; const y1 = 0.18; const h = 0.78 + L * 0.06;
  s.box(x0 - 0.03, y0 - 0.12, 0, x1 + 0.3, y1 + 0.12, 0.08, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.08, h, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#d3cbb8' : null });
  // zijbeuken met steunberen
  walls(s, st, x0 + 0.04, y1, x1 - 0.04, y1 + 0.1, 0.08, h * 0.55, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#c9c0ac' : null });
  for (let k = 0; k < 4; k++) { const x = x0 + 0.08 + k * 0.13; s.box(x - 0.02, y1 + 0.1, 0.08, x + 0.02, y1 + 0.15, h * 0.5, mat.stone('#b9b1a1')); window2(s, 'y', y1 + 0.1, x + 0.03, 0.22, 0.05, 0.16); window2(s, 'y', y1, x + 0.03, h * 0.6, 0.05, 0.14); }
  const top = roof(s, st, x0, y0, x1, y1, h, 0.4, 'x', { level: 3, roofC: '#4f5866' });
  // toren aan de voorkant (rechts, +x) met roosvenster en poort
  const tx0 = x1; const tx1 = x1 + 0.26; const ty0 = -0.13; const ty1 = 0.13; const th = h + 0.55 + L * 0.2;
  walls(s, st, tx0, ty0, tx1, ty1, 0.08, th, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#d3cbb8' : null });
  s.win('x', tx1, -0.06, 0.06, 0.08, 0.38, mat.door('#4a2e18'));
  s.hcyl('x', 0, 0.58, 0.075, tx1 - 0.005, tx1 + 0.012, mat.glaze('#3d6fb5', tx1, 0));
  s.hcyl('x', 0, 0.58, 0.025, tx1 + 0.01, tx1 + 0.016, mat.gold());
  for (let z = 0.8; z + 0.2 < th; z += 0.32) { window2(s, 'x', tx1, -0.025, z, 0.05, 0.16); window2(s, 'y', ty1, tx0 + 0.1, z, 0.05, 0.16); }
  let peak;
  if (st.roof === 'gable' || st.roof === 'greek') {
    s.box(tx0 - 0.015, ty0 - 0.015, th, tx1 + 0.015, ty1 + 0.015, th + 0.04, mat.stone('#a39a89'));
    const sh = 0.55 + L * 0.14; // spits: een steile piramide
    s.hip(tx0 + 0.01, ty0 + 0.01, tx1 - 0.01, ty1 - 0.01, th + 0.04, sh, mat.slate('#4f5866'), 0.01);
    for (const [x, y] of [[tx0, ty0], [tx1, ty0], [tx0, ty1], [tx1, ty1]]) s.cone(x, y, 0.03, th + 0.04, th + 0.2, mat.stone('#a39a89'));
    peak = th + 0.04 + sh;
  } else peak = turretTop(s, st, (tx0 + tx1) / 2, 0, 0.14, th, 0.5 + L * 0.1);
  // gouden kruis of piek
  s.cyl((tx0 + tx1) / 2, 0, 0.008, peak - 0.02, peak + 0.14, mat.gold());
  s.box((tx0 + tx1) / 2 - 0.04, -0.006, peak + 0.07, (tx0 + tx1) / 2 + 0.04, 0.006, peak + 0.09, mat.gold());
  if (L >= 2) { const m = roundM(st, 0, h + 0.2); for (const y of [y0 - 0.06]) { s.cyl(x0 + 0.08, y, 0.07, 0, h + 0.2, m); turretTop(s, st, x0 + 0.08, y, 0.07, h + 0.2, 0.28); } }
  if (L >= 3) s.box(x0 - 0.02, y0 - 0.02, h - 0.03, x1 + 0.02, y1 + 0.02, h - 0.01, mat.gold());
  return { glow: [tx1 + 0.02, 0, 0.58] };
}

// versiering voor niveau 4 en 5: vaandels voor de deur, op niveau 5 ook een gouden piek op het dak
function dressHigh(s, st, L, type) {
  if (L < 4 || ['farm', 'quarry', 'goldmine', 'market', 'tower', 'monument', 'tc', 'mill', 'lodge'].includes(type)) return;
  let bx = -1e9; let by = -1e9; let bz = 0; let cx = 0; let cy = 0; let n = 0;
  for (const p of s.prims) { const b = p.bb; if (!b) continue; bx = Math.max(bx, b[3]); by = Math.max(by, b[4]); bz = Math.max(bz, b[5]); cx += (b[0] + b[3]) / 2; cy += (b[1] + b[4]) / 2; n++; }
  bx = Math.min(0.44, bx + 0.04); by = Math.min(0.44, by + 0.04);
  const c = st.trim || '#7a2b2b';
  bannerCloth(s, bx, by - 0.2, 0.24, 0.24, c, 'x');
  bannerCloth(s, bx - 0.2, by, 0.24, 0.24, c, 'y');
  if (L >= 5 && n) {
    cx /= n; cy /= n;
    s.cyl(cx, cy, 0.01, bz - 0.04, bz + 0.12, mat.gold());
    s.ell(cx, cy, bz + 0.14, 0.03, 0.03, 0.035, mat.gold());
    // gouden band rond de voet
    s.box(-0.47, -0.47, 0, 0.47, -0.455, 0.02, mat.gold()); s.box(-0.47, 0.455, 0, 0.47, 0.47, 0.02, mat.gold());
  }
}

// stuk stadsmuur (midden op 0,0): houten palissade (niveau 1-2) of stenen muur met kantelen; torens apart
export function wallScene(p) {
  const s = new Scene();
  const hx = p.dx / 2; const hy = p.dy / 2; const h = p.h;
  const along = p.dx >= p.dy ? 'x' : 'y';
  const len = along === 'x' ? p.dx : p.dy;
  if (p.level < 3) {
    if (p.tower) {
      s.box(-hx, -hy, 0, hx, hy, h, mat.logs('#7a5230'));
      s.box(-hx - 0.04, -hy - 0.04, h, hx + 0.04, hy + 0.04, h + 0.05, mat.wood('#6b4523'));
      s.hip(-hx - 0.04, -hy - 0.04, hx + 0.04, hy + 0.04, h + 0.05, 0.18, mat.thatch(), 0.02);
    } else {
      const n = Math.max(2, Math.round(len / 0.085));
      for (let k = 0; k < n; k++) {
        const a = -len / 2 + ((k + 0.5) / n) * len;
        const r = 0.04 + ((k * 7) % 3) * 0.004; const hh = h * (0.92 + ((k * 5) % 4) * 0.03);
        const [x, y] = along === 'x' ? [a, 0] : [0, a];
        s.cyl(x, y, r, 0, hh, mat.logs('#7f5530'));
        s.cone(x, y, r, hh, hh + 0.08, mat.wood('#9c7444'));
      }
      if (along === 'x') s.box(-len / 2, 0.03, h * 0.62, len / 2, 0.06, h * 0.7, mat.wood('#5a3a1e'));
      else s.box(0.03, -len / 2, h * 0.62, 0.06, len / 2, h * 0.7, mat.wood('#5a3a1e'));
    }
    return s;
  }
  const stoneM = mat.stone(p.level >= 5 ? '#d3cbb8' : '#b9b1a1');
  const capM = mat.stone(p.level >= 5 ? '#c4bba6' : '#a39a89');
  s.box(-hx, -hy, 0, hx, hy, h, stoneM);
  s.box(-hx - 0.012, -hy - 0.012, h - 0.04, hx + 0.012, hy + 0.012, h, capM);
  // kantelen langs beide randen
  const w = 0.06; const mh = 0.1;
  const L2 = (along === 'x' ? hx : hy) + (p.tower ? 0.012 : 0);
  for (let a = -L2; a < L2 - 0.02; a += 0.12) {
    const b = Math.min(L2, a + w);
    if (along === 'x' || p.tower) { s.box(a, hy - 0.035, h, b, hy + 0.012, h + mh, capM); s.box(a, -hy - 0.012, h, b, -hy + 0.035, h + mh, capM); }
    if (along === 'y' || p.tower) { s.box(hx - 0.035, a, h, hx + 0.012, b, h + mh, capM); s.box(-hx - 0.012, a, h, -hx + 0.035, b, h + mh, capM); }
  }
  if (p.tower) {
    s.win('y', hy, -0.02, 0.02, h * 0.5, h * 0.5 + 0.12, mat.plain('#1d1a16'));
    s.win('x', hx, -0.02, 0.02, h * 0.5, h * 0.5 + 0.12, mat.plain('#1d1a16'));
  }
  return s;
}

const BUILD = { house, lumber, quarry, goldmine, storage, barracks, range, stable, smithy, market, tower, workshop, monument, tc, mill, academy, guild, lodge, court, cathedral };
export const HAS_3D = new Set(Object.keys(BUILD));
const SIZE = { tc: 2, monument: 2 };

// stijl + kleine variatie per huis (muur- en dakkleur), zodat een straat niet eentonig is
export function build(type, level, civ = null, variant = 0) {
  const base = STYLES[civ] || STYLES.none;
  const st = { ...base };
  if (variant && type === 'house') { st.plaster = tint(st.plaster, variant === 1 ? -0.06 : 0.04); if (st.roofC) st.roofC = tint(st.roofC, variant === 1 ? 0.12 : -0.12); }
  const s = new Scene();
  const L = Math.max(1, level);
  const anchors = (BUILD[type] || house)(s, st, L, civ, variant) || {};
  dressHigh(s, st, L, type);
  s.anchors = anchors;
  s.apron = (SIZE[type] || 1) === 2 ? 1.05 : type === 'quarry' || type === 'goldmine' ? 0.55 : 0.52;
  return s;
}

export const GALLERY = [
  ['huis 1', () => build('house', 1), { apron: 0.5 }],
  ['huis 2', () => build('house', 2, null, 1), { apron: 0.5 }],
  ['huis 3', () => build('house', 3), { apron: 0.52 }],
  ['kazerne', () => build('barracks', 3), { apron: 0.52 }],
  ['toren', () => build('tower', 3), { apron: 0.4 }],
  ['smidse', () => build('smithy', 3), { apron: 0.52 }],
  ['markt', () => build('market', 3), { apron: 0.52 }],
  ['stal', () => build('stable', 3), { apron: 0.52 }],
  ['goudmijn', () => build('goldmine', 3), { apron: 0.55 }],
  ['steengroeve', () => build('quarry', 3), { apron: 0.55 }],
  ['houthakker', () => build('lumber', 3), { apron: 0.52 }],
  ['opslag', () => build('storage', 3), { apron: 0.52 }],
  ['werkplaats', () => build('workshop', 2), { apron: 0.52 }],
  ['schietbaan', () => build('range', 3), { apron: 0.52 }],
  ['stadscentrum', () => build('tc', 4), { apron: 1.05, show: 1.1 }],
  ['molen', () => build('mill', 3), { apron: 0.52 }],
  ['academie', () => build('academy', 3, null, 15), { apron: 0.52 }],
  ['gildehuis', () => build('guild', 3), { apron: 0.52 }],
  ['bouwloods', () => build('lodge', 3), { apron: 0.52 }],
  ['adelshof', () => build('court', 3), { apron: 0.52 }],
  ['kathedraal', () => build('cathedral', 3), { apron: 0.52 }],
];
