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

// Muren per volk en niveau: elk niveau een ander (beter) materiaal en eigen versiering, zodat een verbeterd gebouw
// niet gewoon 'groter' is. Geldt voor elke walls()-oproep zonder eigen materiaal (geen o.c, o.wall leeg of = st.wall).
// socle = [soort, kleur, deel van de hoogte] (voet), quoin = hoekstenen, pilaster = hoekpilasters met kapiteel,
// torus = ronde hoeklijst, strips = lisenen, beam = donkere balken, band/band2 = beschilderde banden onder het dak,
// tiles = geglazuurde tegelband, dado = band onderaan, dadoTiles = geglazuurde band onderaan, rosette = rozetten, gold = gouden rand.
const CIV_WALL = {
  none: [ // blokhut → vakwerk op een stenen voet → stenen benedenverdieping → steen met hoekstenen → lichte hardsteen en goud
    { wall: 'logs' },
    { wall: 'timber', socle: ['stone', '#a39b8c', 0.12] },
    { wall: 'timber', socle: ['stone', '#b9b1a1', 0.45] },
    { wall: 'stone', c: '#b9b1a1', quoin: '#dcd5c6' },
    { wall: 'stone', c: '#d3cbb8', quoin: '#f2ede2', gold: true },
  ],
  greek: [ // leem → gewit met een stenen voet → hoekpilasters → marmer met een rode fries → wit marmer, blauw en goud
    { wall: 'plaster', c: '#cdb48c' },
    { wall: 'plaster', socle: ['stone', '#cfc6b4', 0.12] },
    { wall: 'plaster', socle: ['stone', '#e4ddcd', 0.14], pilaster: '#f7f3ea' },
    { wall: 'stone', c: '#ebe5d6', socle: ['stone', '#d6cfbf', 0.1], pilaster: '#faf7f0', band: '#b0392b' },
    { wall: 'stone', c: '#f4f0e8', socle: ['stone', '#e4ddcd', 0.1], pilaster: '#fbf9f4', band: '#2e5fa8', gold: true },
  ],
  egypt: [ // leemsteen → gepleisterd op een leemvoet → zandsteen met ronde hoeklijsten → beschilderd → witte kalksteen en goud
    { wall: 'brick', c: '#9c7a50' },
    { wall: 'plaster', socle: ['brick', '#9c7a50', 0.14] },
    { wall: 'stone', c: '#d8bf8a', torus: '#c4a56e' },
    { wall: 'stone', c: '#dcc596', torus: '#2f6fb5', dado: '#b8402c' },
    { wall: 'stone', c: '#efe6cf', torus: 'gold', dado: '#2f6fb5', gold: true },
  ],
  babylon: [ // riet en leem → leemsteen → gebakken steen met lisenen → blauwe tegelband met rozetten → blauw geglazuurde voet, goud
    { wall: 'plaster', c: '#a68456' },
    { wall: 'brick', c: '#a8824f' },
    { wall: 'brick', c: '#c49a62', strips: '#b88d58' },
    { wall: 'brick', c: '#c49a62', strips: '#b88d58', tiles: '#2c5fae', rosette: '#e0b23a' },
    { wall: 'brick', c: '#caa36a', socle: ['brick', '#2f5fae', 0.4], tiles: '#2c5fae', rosette: '#f2d24a', gold: true },
  ],
  persia: [ // leemsteen → gepleisterd → steen met een tegelplint → turkooise tegelbanden → wit marmer en goud
    { wall: 'brick', c: '#a88a62' },
    { wall: 'plaster', socle: ['stone', '#c4ad86', 0.12] },
    { wall: 'stone', c: '#dccaa6', dadoTiles: '#1f9a9a' },
    { wall: 'stone', c: '#e6d8bb', dadoTiles: '#1f9a9a', tiles: '#1f9a9a' },
    { wall: 'stone', c: '#f1ece2', dadoTiles: '#2a6fb5', tiles: '#1f9a9a', gold: true },
  ],
  yamato: [ // donker hout → papieren wanden op een houten voet → witte pleister boven donker hout → stenen voet → goud
    { wall: 'wood', c: '#5a4030' },
    { wall: 'shoji', socle: ['wood', '#3a2a20', 0.14] },
    { wall: 'plaster', c: '#f3efe6', socle: ['wood', '#3a2a20', 0.42], beam: '#2e221a' },
    { wall: 'plaster', c: '#f6f3ec', socle: ['stone', '#8f8a80', 0.3], beam: '#2e221a' },
    { wall: 'plaster', c: '#f8f6f0', socle: ['stone', '#a29d93', 0.3], beam: '#2e221a', gold: true },
  ],
};
function wallMat(kind, c, st, z0, z1) {
  if (kind === 'stone') return mat.stone(c || st.stone);
  if (kind === 'brick') return mat.brick(c || st.stone);
  if (kind === 'wood') return mat.wood(c || st.wood);
  if (kind === 'logs') return mat.logs(c || '#7f5530');
  return mat.plaster(c || st.plaster, z0, z1, { timber: kind === 'timber', grid: kind === 'shoji' });
}
// muren van een blok in de stijl van het volk (en het niveau, st.L)
function walls(s, st, x0, y0, x1, y1, z0, z1, o = {}) {
  const kind = o.wall || st.wall;
  const prog = CIV_WALL[st.civ || 'none'];
  if (o.c || (o.wall && o.wall !== st.wall) || !prog || !st.L) return s.box(x0, y0, z0, x1, y1, z1, wallMat(kind, o.c, st, z0, z1));
  const p = prog[Math.min(5, st.L) - 1];
  let zb = z0;
  if (p.socle) {
    const [k, c, f] = p.socle; zb = Math.min(z1 - 0.04, z0 + Math.max(0.04, (z1 - z0) * f));
    s.box(x0 - 0.006, y0 - 0.006, z0, x1 + 0.006, y1 + 0.006, zb, wallMat(k, c, st, z0, zb));
  }
  const main = s.box(x0, y0, zb, x1, y1, z1, wallMat(p.wall, p.c, st, zb, z1));
  wallDetails(s, p, x0, y0, x1, y1, z0, z1, zb);
  return main;
}
// versiering op de zichtbare kanten (+x, +y) van een groot muurblok
function wallDetails(s, p, x0, y0, x1, y1, z0, z1, zb) {
  if (x1 - x0 < 0.16 || y1 - y0 < 0.16 || z1 - z0 < 0.2) return;
  const corners = [[x1, y1, 1, 1], [x0, y1, -1, 1], [x1, y0, 1, -1]];
  if (p.quoin) {
    const qm = mat.stone(p.quoin);
    for (const [cx, cy, sx, sy] of corners) {
      for (let z = zb + 0.015, k = 0; z + 0.05 < z1; z += 0.07, k++) {
        const a = k % 2 ? 0.035 : 0.065; const b = k % 2 ? 0.065 : 0.035;
        s.box(Math.min(cx - sx * a, cx + sx * 0.007), Math.min(cy - sy * b, cy + sy * 0.007), z, Math.max(cx - sx * a, cx + sx * 0.007), Math.max(cy - sy * b, cy + sy * 0.007), z + 0.055, qm);
      }
    }
  }
  if (p.pilaster) {
    for (const [cx, cy] of corners) {
      s.box(cx - 0.022, cy - 0.022, zb, cx + 0.022, cy + 0.022, z1 - 0.035, mat.stone(p.pilaster));
      s.box(cx - 0.032, cy - 0.032, z1 - 0.04, cx + 0.032, cy + 0.032, z1, p.gold ? mat.gold() : mat.stone(p.pilaster));
    }
  }
  if (p.torus) for (const [cx, cy] of corners) s.cyl(cx, cy, 0.017, zb, z1, p.torus === 'gold' ? mat.gold() : mat.plain(p.torus));
  if (p.strips) { // lisenen: smalle uitspringende stroken
    for (let x = x0 + 0.09; x < x1 - 0.05; x += 0.13) s.box(x - 0.017, y1, zb, x + 0.017, y1 + 0.014, z1, mat.brick(p.strips));
    for (let y = y0 + 0.09; y < y1 - 0.05; y += 0.13) s.box(x1, y - 0.017, zb, x1 + 0.014, y + 0.017, z1, mat.brick(p.strips));
  }
  if (p.beam) { // donkere balken op de voet, onder het dak en op de hoeken
    const bm = mat.wood(p.beam);
    for (const z of [zb, z1 - 0.045]) s.box(x0 - 0.01, y0 - 0.01, z, x1 + 0.01, y1 + 0.01, z + 0.03, bm);
    for (const [cx, cy] of corners) s.box(cx - 0.017, cy - 0.017, zb, cx + 0.017, cy + 0.017, z1, bm);
  }
  if (p.band) band(s, x0, y0, x1, y1, z1 - 0.08, 0.035, p.band);
  if (p.band2) band(s, x0, y0, x1, y1, z1 - 0.105, 0.018, p.band2);
  if (p.dado) band(s, x0, y0, x1, y1, zb + 0.03, 0.03, p.dado);
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
  if (p.tiles) s.box(x0 - 0.008, y0 - 0.008, z1 - 0.125, x1 + 0.008, y1 + 0.008, z1 - 0.065, mat.glaze(p.tiles, cx, cy));
  if (p.dadoTiles) s.box(x0 - 0.008, y0 - 0.008, zb + 0.015, x1 + 0.008, y1 + 0.008, zb + 0.075, mat.glaze(p.dadoTiles, cx, cy));
  if (p.rosette) {
    const rm = p.gold ? mat.gold() : mat.plain(p.rosette);
    for (let x = x0 + 0.05; x < x1 - 0.03; x += 0.08) s.ell(x, y1 + 0.01, z1 - 0.095, 0.014, 0.006, 0.014, rm);
    for (let y = y0 + 0.05; y < y1 - 0.03; y += 0.08) s.ell(x1 + 0.01, y, z1 - 0.095, 0.006, 0.014, 0.014, rm);
  }
  if (p.gold) s.box(x0 - 0.01, y0 - 0.01, z1 - 0.026, x1 + 0.01, y1 + 0.01, z1 - 0.008, mat.gold());
}

// sierband (kleur van het volk) rond de bovenrand
function band(s, x0, y0, x1, y1, z, h, c) {
  s.box(x0 - 0.006, y0 - 0.006, z, x1 + 0.006, y1 + 0.006, z + h, mat.plain(c));
}

// dak in de stijl van het volk; geeft de hoogte van de top terug.
// Het niveau (o.level, anders dat van het gebouw: st.L) kiest materiaal en versiering: riet → pannen → leien/glazuur,
// vanaf niveau 4 nokversiering (nokkam, acroteria, dubbele dakrand, getrapte kantelen, tegelband) en op 5 goud.
function roof(s, st, x0, y0, x1, y1, z, h, along = 'x', o = {}) {
  const kind = o.roof || st.roof;
  const lv = o.level || st.L || 3;
  const big = x1 - x0 >= 0.2 && y1 - y0 >= 0.2; // versiering enkel op echte daken, niet op kleine afdakjes
  const side = mat.plaster(st.plaster, z, z + h);
  const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
  if (kind === 'gable' || kind === 'hip') {
    const m = o.mat || (lv <= 1 ? mat.thatch(mat.wood('#7a5a34')) : lv === 2 ? mat.tiles(o.roofC || '#9a4630', mat.wood('#7a5a34')) : mat.slate(o.roofC || '#5c6370', side));
    if (kind === 'hip') s.hip(x0, y0, x1, y1, z, h, m, 0.06); else s.gable(x0, y0, x1, y1, z, h, along, m, 0.07);
    if (big && lv >= 4) { // nokkam van lood, op niveau 5 met gouden knoppen
      const ends = kind === 'hip' ? [[cx, cy]] : along === 'x' ? [[x0 - 0.06, cy], [x1 + 0.06, cy]] : [[cx, y0 - 0.06], [cx, y1 + 0.06]];
      if (kind === 'gable') {
        if (along === 'x') s.box(x0 - 0.06, cy - 0.016, z + h - 0.012, x1 + 0.06, cy + 0.016, z + h + 0.022, mat.metal('#3d4148'));
        else s.box(cx - 0.016, y0 - 0.06, z + h - 0.012, cx + 0.016, y1 + 0.06, z + h + 0.022, mat.metal('#3d4148'));
      }
      for (const [ex, ey] of ends) {
        s.cyl(ex, ey, 0.008, z + h - 0.01, z + h + 0.09, mat.metal('#3a3c40'));
        s.ell(ex, ey, z + h + 0.1, 0.022, 0.022, 0.026, lv >= 5 ? mat.gold() : mat.metal('#4d4f54'));
      }
    }
    return z + h;
  }
  if (kind === 'greek') {
    const hh = h * 0.45;
    s.gable(x0, y0, x1, y1, z + 0.03, hh, along, lv <= 1 ? mat.thatch(mat.plaster(st.plaster, z, z + hh)) : mat.tiles(st.roofC, mat.plaster(st.plaster, z, z + hh)), 0.06);
    s.box(x0 - 0.02, y0 - 0.02, z, x1 + 0.02, y1 + 0.02, z + 0.035, mat.plain(lv >= 4 ? '#f8f5ee' : st.plaster));
    band(s, x0, y0, x1, y1, z - 0.03, 0.025, st.trim);
    if (big && lv >= 4) { // acroteria: palmetten op de nok en de hoeken (marmer, op 5 goud)
      const am = lv >= 5 ? mat.gold() : mat.stone('#f6f3ec'); const zr = z + 0.03 + hh;
      const ends = along === 'x' ? [[x0 - 0.04, cy], [x1 + 0.04, cy]] : [[cx, y0 - 0.04], [cx, y1 + 0.04]];
      for (const [ax, ay] of ends) s.ell(ax, ay, zr + 0.035, 0.026, 0.026, 0.05, am);
      for (const [ax, ay] of [[x0 - 0.02, y1 + 0.02], [x1 + 0.02, y1 + 0.02], [x1 + 0.02, y0 - 0.02]]) s.ell(ax, ay, z + 0.07, 0.018, 0.018, 0.032, am);
    }
    return z + 0.03 + hh;
  }
  if (kind === 'pagoda') {
    const m = lv <= 1 ? mat.thatch(mat.wood(st.wood)) : lv === 2 ? mat.slate('#5b4636', mat.wood(st.wood)) : mat.slate(st.roofC, mat.wood(st.wood));
    s.hip(x0, y0, x1, y1, z, h * 0.8, m, 0.14);
    s.box(x0 - 0.13, y0 - 0.13, z - 0.02, x1 + 0.13, y1 + 0.13, z + 0.005, mat.plain(tint(st.roofC, -0.3)));
    if (big && lv >= 4) { // tweede, lagere dakrand (mokoshi) en een nokversiering
      s.hip(x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, z - 0.2, 0.08, m, 0);
      s.box(x0 - 0.1, y0 - 0.1, z - 0.215, x1 + 0.1, y1 + 0.1, z - 0.2, mat.plain(tint(st.roofC, -0.3)));
      s.cyl(cx, cy, 0.016, z + h * 0.8 - 0.03, z + h * 0.8 + 0.08, lv >= 5 ? mat.gold() : mat.metal('#3a3c40'));
      s.ell(cx, cy, z + h * 0.8 + 0.1, 0.028, 0.028, 0.035, lv >= 5 ? mat.gold() : mat.metal('#4d4f54'));
    }
    return z + h * 0.8 + (big && lv >= 4 ? 0.13 : 0);
  }
  // platte daken: Egypte (kroonlijst), Babylon (kantelen), Perzië (koepel)
  if (lv <= 1) { // eerste tijdperk: een plat dak met een rieten mat, nog zonder sierbanden
    s.box(x0 - 0.02, y0 - 0.02, z, x1 + 0.02, y1 + 0.02, z + 0.04, mat.wood(st.wood || '#8a6238'));
    s.box(x0 - 0.005, y0 - 0.005, z + 0.04, x1 + 0.005, y1 + 0.005, z + 0.07, mat.thatch());
    return z + 0.07;
  }
  s.box(x0 - 0.015, y0 - 0.015, z, x1 + 0.015, y1 + 0.015, z + 0.05, mat.plain(tint(st.plaster, -0.08)));
  if (st.trim) band(s, x0, y0, x1, y1, z - 0.05, 0.03, st.trim);
  if (st.trim2 && lv >= 3) band(s, x0, y0, x1, y1, z - 0.075, 0.018, st.trim2);
  if (kind === 'flat') {
    s.box(x0 - 0.04, y0 - 0.04, z + 0.05, x1 + 0.04, y1 + 0.04, z + 0.09, mat.plain(tint(st.stone, 0.1)));
    if (big && lv >= 4) { // holle kroonlijst: beschilderde band, op 5 een gouden rand
      s.box(x0 - 0.055, y0 - 0.055, z + 0.07, x1 + 0.055, y1 + 0.055, z + 0.1, lv >= 5 ? mat.gold() : mat.plain(st.trim || '#2f6fb5'));
      s.box(x0 - 0.06, y0 - 0.06, z + 0.1, x1 + 0.06, y1 + 0.06, z + 0.115, mat.plain(tint(st.stone, 0.15)));
      return z + 0.115;
    }
    return z + 0.09;
  }
  if (kind === 'crenel') {
    const w = 0.05; const top = z + 0.05; const merl = [];
    for (let x = x0; x < x1 - 0.01; x += 0.1) { merl.push([x, y1 - w, Math.min(x1, x + w), y1]); merl.push([x, y0, Math.min(x1, x + w), y0 + w]); }
    for (let y = y0; y < y1 - 0.01; y += 0.1) { merl.push([x1 - w, y, x1, Math.min(y1, y + w)]); merl.push([x0, y, x0 + w, Math.min(y1, y + w)]); }
    const step = big && lv >= 4; // getrapte kantelen (zoals in Babylon), op 5 met gouden kappen
    for (const [a0, b0, a1, b1] of merl) {
      s.box(a0, b0, top, a1, b1, top + 0.08, mat.brick(st.stone));
      if (step) s.box(a0 + 0.01, b0 + 0.01, top + 0.08, a1 - 0.01, b1 - 0.01, top + 0.12, lv >= 5 ? mat.gold() : mat.brick(tint(st.stone, 0.08)));
    }
    return top + (step ? 0.12 : 0.08);
  }
  // koepel op een trommel (tweede tijdperk: gepleisterd, daarna geglazuurd, op 4 een tegelband, op 5 verguld)
  const r = Math.min(x1 - x0, y1 - y0) * (o.domeR || 0.38);
  s.cyl(cx, cy, r * 1.02, z + 0.05, z + 0.05 + r * 0.35, mat.plaster(st.plaster, z, z + 1));
  if (lv >= 4) s.cyl(cx, cy, r * 1.04, z + 0.05 + r * 0.12, z + 0.05 + r * 0.26, mat.glaze(st.trim || '#1f9a9a', cx, cy));
  s.ell(cx, cy, z + 0.05 + r * 0.35, r, r, r * 1.15, lv === 2 ? mat.plaster(tint(st.plaster, -0.04), z, z + 1) : lv >= 5 ? mat.gold() : mat.glaze(st.roofC, cx, cy), z + 0.05 + r * 0.35);
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

// ---------- hulpstukken voor de niveaus ----------
// gezaagde planken op een stapel (langs x)
function planks(s, x, y, n = 4) {
  for (let k = 0; k < n; k++) {
    const z = k * 0.025; const o = (k % 2) * 0.012;
    s.box(x - 0.13 + o, y - 0.06, z, x + 0.13 + o, y - 0.01, z + 0.022, mat.wood(k % 2 ? '#c39a64' : '#b58a55'));
    s.box(x - 0.13 - o, y + 0.01, z, x + 0.13 - o, y + 0.06, z + 0.022, mat.wood(k % 2 ? '#b58a55' : '#c39a64'));
  }
}
// gehouwen steenblokken op een stapel
function blocks(s, x, y, n, c = '#d3cbb8') {
  const P = [[0, 0, 0], [0.095, 0, 0], [0, 0.085, 0], [0.095, 0.085, 0], [0.047, 0.042, 0.075], [0.047, 0.042, 0.15]];
  for (let k = 0; k < Math.min(n, P.length); k++) { const [dx, dy, z] = P[k]; s.box(x + dx - 0.042, y + dy - 0.038, z, x + dx + 0.042, y + dy + 0.038, z + 0.072, mat.stone(k % 2 ? c : '#c9c0ab')); }
}
// hijsbalk (galg) met een touw en een last
function hoist(s, x, y, h, load = 'crate', dir = 1) {
  const e = x + dir * 0.18;
  s.box(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, h, mat.wood('#5a3a1e'));
  s.box(Math.min(x, e) - 0.02, y - 0.02, h - 0.04, Math.max(x, e) + 0.02, y + 0.02, h, mat.wood('#5a3a1e'));
  s.cap([x + dir * 0.02, y, h - 0.12], [x + dir * 0.1, y, h - 0.03], 0.008, mat.wood('#6b4523'));
  s.cap([e, y, h - 0.04], [e, y, h * 0.45], 0.004, mat.plain('#cdbb92'));
  if (load === 'crate') s.box(e - 0.04, y - 0.04, h * 0.37, e + 0.04, y + 0.04, h * 0.45, mat.wood('#a8743f'));
  else s.ell(e, y, h * 0.41, 0.04, 0.035, 0.05, mat.plain('#cdb88c'));
}
// lantaarn op een paal
function lampPost(s, x, y, h = 0.36) {
  s.cyl(x, y, 0.01, 0, h, mat.wood('#3e2a18'));
  s.box(x - 0.022, y - 0.022, h, x + 0.022, y + 0.022, h + 0.05, mat.plain('#ffd27a', true));
  s.hip(x - 0.03, y - 0.03, x + 0.03, y + 0.03, h + 0.05, 0.035, mat.metal('#3a3c40'), 0);
}
// klein gebouwtje (muren + dak in de stijl van het volk); geeft de top terug
function hut(s, st, x0, y0, x1, y1, h, level, along = 'x', wall = null) {
  s.box(x0 - 0.015, y0 - 0.015, 0, x1 + 0.015, y1 + 0.015, 0.04, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.04, h, wall ? { wall } : {});
  return roof(s, st, x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01, h, Math.min(0.26, (x1 - x0 + y1 - y0) * 0.28), along, { level });
}
// gouden windwijzer / piek
function goldVane(s, x, y, z, h = 0.14) {
  s.cyl(x, y, 0.007, z, z + h, mat.metal('#3a3c40'));
  s.box(x - 0.045, y - 0.004, z + h - 0.035, x + 0.045, y + 0.004, z + h - 0.015, mat.gold());
  s.ell(x, y, z + h + 0.01, 0.018, 0.018, 0.018, mat.gold());
}
// hekje van paaltjes met twee latten tussen twee punten (langs x of y)
function fenceLine(s, ax, ay, bx, by, h = 0.16, c = '#7a5129') {
  const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 0.12));
  for (let k = 0; k <= n; k++) { const x = ax + ((bx - ax) * k) / n; const y = ay + ((by - ay) * k) / n; s.box(x - 0.01, y - 0.01, 0, x + 0.01, y + 0.01, h, mat.wood(c)); }
  for (const z of [h * 0.45, h * 0.85]) s.box(Math.min(ax, bx) - 0.006, Math.min(ay, by) - 0.006, z, Math.max(ax, bx) + 0.006, Math.max(ay, by) + 0.006, z + 0.016, mat.wood('#8a5f33'));
}

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
    const top = roof(s, st, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h, 0.46, 'y', { level: Math.max(3, L) });
    door(s, 'y', y1, -0.07, 0.07, 0.02, 0.29, st);
    window2(s, 'y', y1 + 0.02, -0.3, 0.46, 0.12, 0.17); window2(s, 'y', y1 + 0.02, 0.17, 0.46, 0.12, 0.17);
    window2(s, 'y', y1, 0.17, 0.1, 0.12, 0.15);
    window2(s, 'x', x1 + 0.02, -0.22, 0.46, 0.12, 0.17); window2(s, 'x', x1 + 0.02, 0.07, 0.46, 0.12, 0.17);
    window2(s, 'x', x1, -0.05, 0.1, 0.12, 0.15);
    A.smoke = st.roof === 'gable' ? [-0.2, -0.16, h + 0.62] : [0, 0, top];
    if (L >= 4) { // een aanbouw met een eigen dakje aan de voorkant, bloembakken onder de ramen
      walls(s, st, 0.1, y1 + 0.02, x1, y1 + 0.13, 0.0, 0.34);
      roof(s, st, 0.08, y1, x1 + 0.02, y1 + 0.15, 0.34, 0.12, 'x', { level: Math.max(3, L) });
      window2(s, 'y', y1 + 0.13, 0.2, 0.1, 0.1, 0.14);
      for (const a of [-0.3, 0.17]) {
        s.box(a - 0.005, y1 + 0.02, 0.43, a + 0.125, y1 + 0.07, 0.46, mat.wood('#6b4523'));
        for (let k = 0; k < 4; k++) s.ell(a + 0.015 + k * 0.03, y1 + 0.045, 0.475, 0.016, 0.016, 0.016, mat.plain(['#d9483b', '#f2c94c', '#e86f9a', '#ffffff'][k]));
      }
      for (const a of [-0.22, 0.07]) {
        s.box(x1 + 0.02, a - 0.005, 0.43, x1 + 0.07, a + 0.125, 0.46, mat.wood('#6b4523'));
        for (let k = 0; k < 4; k++) s.ell(x1 + 0.045, a + 0.015 + k * 0.03, 0.475, 0.016, 0.016, 0.016, mat.plain(['#f2c94c', '#d9483b', '#ffffff', '#b48cf0'][k]));
      }
    }
    if (L >= 5) { // hoektorentje met een gouden windwijzer, lantaarns bij de deur
      s.cyl(x0, y1, 0.09, 0, h + 0.25, roundM(st, 0, h + 0.25));
      const tt = turretTop(s, st, x0, y1, 0.09, h + 0.25, 0.3);
      goldVane(s, x0, y1, tt);
      window2(s, 'y', y1 + 0.085, x0 - 0.03, h - 0.1, 0.06, 0.1);
      for (const a of [-0.13, 0.13]) lampPost(s, a, y1 + 0.1, 0.32);
    }
  }
  return A;
}

// Houthakkerskamp: 1 afdakje met riet; 2 grotere loods met pannen en planken wanden; 3 gesloten werkplaats op een
// stenen voet met een zaagbok; 4 hijsbalk, gezaagde planken en een kar; 5 een torentje met vaandel en gouden piek.
function lumber(s, st, L) {
  const W = '#6b4523';
  const x0 = -0.4; const y0 = -0.4; const x1 = L >= 2 ? 0.14 : 0.02; const y1 = L >= 2 ? 0.14 : 0.02;
  const h = [0, 0.32, 0.42, 0.5, 0.56, 0.6][L];
  const z0 = L >= 3 ? 0.06 : 0;
  if (L >= 3) s.box(x0 - 0.03, y0 - 0.03, 0, x1 + 0.03, y1 + 0.03, z0, mat.stone(st.base));
  const posts = [[x0, y1], [x1, y1], [x1, y0], [x0, y0]];
  if (L >= 2) posts.push([(x0 + x1) / 2, y1]);
  for (const [x, y] of posts) s.box(x - 0.024, y - 0.024, z0, x + 0.024, y + 0.024, h, mat.wood(W));
  if (L === 1) s.box(x0, y0 - 0.02, 0, x1, y0 + 0.01, h * 0.45, mat.wood('#7a5129'));
  else if (L === 2) { s.box(x0, y0 - 0.02, 0, x1, y0 + 0.01, h, mat.wood('#7a5129')); s.box(x0 - 0.02, y0, 0, x0 + 0.01, y1, h, mat.wood('#7a5129')); }
  else {
    // achteraan een gesloten werkplaats
    walls(s, st, x0, y0, x1, y0 + 0.22, z0, h, { wall: st.wall === 'timber' ? (L >= 4 ? 'stone' : 'timber') : st.wall });
    door(s, 'y', y0 + 0.22, -0.24, -0.1, z0, z0 + 0.28, st);
    window2(s, 'x', x1, -0.36, z0 + 0.16, 0.08, 0.1);
  }
  const rk = st.roof === 'gable' || st.roof === 'greek' || st.roof === 'pagoda' ? st.roof : 'flat'; // platte daken: Egypte, Babylon, Perzië
  const top = roof(s, st, x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, h, 0.2 + L * 0.03, 'x', { level: L, roof: rk });
  logPile(s, -0.17, L >= 3 ? -0.02 : -0.14, L >= 2 ? 3 : 2);
  logPile(s, 0.28, 0.0, L >= 2 ? 4 : 2);
  s.cyl(0.25, 0.32, 0.06, 0, 0.09, mat.logs('#8a6238'));
  s.box(0.245, 0.295, 0.09, 0.255, 0.305, 0.2, mat.wood(W));
  if (L >= 3) { // zaagbok met een stam en een zaag
    for (const x of [-0.3, -0.06]) for (const d of [-0.045, 0.045]) s.cap([x - 0.05, 0.3 + d, 0], [x + 0.05, 0.3 - d, 0.18], 0.01, mat.wood(W));
    s.hcyl('x', 0.3, 0.2, 0.038, -0.36, 0.02, mat.logs('#8a6238'));
    s.box(-0.19, 0.285, 0.18, -0.18, 0.315, 0.34, mat.metal('#9aa3ad'));
  }
  if (L >= 4) { // hijsbalk, planken en een kar
    planks(s, 0.3, -0.3, 5);
    hoist(s, 0.42, -0.06, 0.62, 'crate', -1);
    s.box(0.04, 0.34, 0.05, 0.2, 0.44, 0.1, mat.wood('#7a5129'));
    for (const x of [0.07, 0.17]) s.hcyl('y', x, 0.045, 0.04, 0.33, 0.45, mat.wood('#4a3220'));
  }
  let flag = null;
  if (L >= 5) { // zagerij met een torentje
    const tx = -0.3; const ty = -0.3;
    walls(s, st, tx - 0.09, ty - 0.09, tx + 0.09, ty + 0.09, h - 0.05, top + 0.22);
    window2(s, 'y', ty + 0.09, tx - 0.03, top + 0.02, 0.06, 0.1);
    const tt = turretTop(s, st, tx, ty, 0.1, top + 0.22, 0.28);
    goldVane(s, tx, ty, tt);
    bannerCloth(s, x1 + 0.06, y1 + 0.06, 0.26, 0.24, st.trim || '#7a2b2b');
    flag = flagPole(s, x1 - 0.02, y0 + 0.04, top - 0.04, 0.3);
  }
  return flag ? { flag } : {};
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

// Steengroeve: 1 rotsen met een paar blokken; 2 een plankier, kist en meer blokken; 3 een houten kraan;
// 4 een stenen werkhuisje en een kar met blokken; 5 een gebeeldhouwde zuil, vaandel en gouden piek op de kraan.
function quarry(s, st, L) {
  rocks(s, -0.12, -0.14, 0.3 + L * 0.012, 0.3 + L * 0.02, '#a29d92', 7);
  for (let k = 0; k < Math.min(3, L); k++) s.box(-0.24 + k * 0.03, 0.04 - k * 0.09, k * 0.09, 0.1 - k * 0.03, 0.18 - k * 0.09, (k + 1) * 0.09, mat.rock(k % 2 ? '#aaa496' : '#b3ada0'));
  blocks(s, 0.22, 0.2, L >= 3 ? 6 : L >= 2 ? 4 : 2);
  if (L >= 2) {
    for (const x of [-0.02, 0.18]) s.box(x - 0.012, 0.31, 0, x + 0.012, 0.33, 0.12, mat.wood('#6b4523'));
    s.box(-0.04, 0.3, 0.12, 0.2, 0.36, 0.14, mat.wood('#8a5f33'));
    crate(s, -0.2, 0.36, 0.05);
    s.cap([0.36, 0.0, 0], [0.4, 0.04, 0.2], 0.008, mat.wood('#6b4523')); // houweel tegen de rots
    s.cap([0.37, -0.02, 0.2], [0.43, 0.08, 0.19], 0.01, mat.metal('#8e959f'));
  }
  let flag = null;
  if (L >= 3) { // kraan met tredmolen
    const cx = -0.36; const cy = 0.22; const ch = 0.75 + L * 0.05;
    s.box(cx - 0.025, cy - 0.025, 0, cx + 0.025, cy + 0.025, ch, mat.wood('#5a3a1e'));
    s.cap([cx, cy, ch - 0.04], [cx + 0.34, cy - 0.06, ch + 0.08], 0.016, mat.wood('#6b4523'));
    s.cap([cx + 0.32, cy - 0.06, ch + 0.06], [cx + 0.32, cy - 0.06, 0.3], 0.004, mat.plain('#cdbb92'));
    s.box(cx + 0.27, cy - 0.11, 0.2, cx + 0.37, cy - 0.01, 0.3, mat.stone('#d3cbb8'));
    s.hcyl('y', cx + 0.06, 0.12, 0.11, cy - 0.04, cy, mat.wood('#7a5129'));
    if (L >= 5) goldVane(s, cx, cy, ch);
  }
  if (L >= 4) { // werkhuisje en een kar met blokken
    hut(s, st, 0.14, -0.44, 0.42, -0.2, 0.32, 2, 'x');
    door(s, 'y', -0.2, 0.22, 0.32, 0.04, 0.26, st);
    s.box(-0.02, 0.36, 0.06, 0.16, 0.46, 0.12, mat.wood('#7a5129'));
    for (const x of [0.01, 0.13]) s.hcyl('y', x, 0.05, 0.045, 0.35, 0.47, mat.wood('#4a3220'));
    s.box(0.03, 0.38, 0.12, 0.1, 0.44, 0.18, mat.stone('#d3cbb8'));
  }
  if (L >= 5) { // gebeeldhouwde zuil met een gouden bol en een vaandel
    s.box(0.36, 0.3, 0, 0.46, 0.4, 0.06, mat.stone('#c9c0ab'));
    s.cyl(0.41, 0.35, 0.035, 0.06, 0.5, mat.stone('#e6dfcf'));
    s.box(0.37, 0.31, 0.5, 0.45, 0.39, 0.54, mat.stone('#d3cbb8'));
    s.ell(0.41, 0.35, 0.58, 0.035, 0.035, 0.04, mat.gold());
    flag = flagPole(s, 0.28, -0.32, 0.36, 0.3);
  }
  return flag ? { flag } : {};
}

// Goudmijn: 1 ingang met stutten en een karretje; 2 een dakje boven de ingang, rails en een lantaarn; 3 een schachttoren
// met een wiel; 4 een smeltoven met schoorsteen en baren goud; 5 een schatkamertje met een gouden dak en een vaandel.
function goldmine(s, st, L) {
  rocks(s, -0.04, -0.12, 0.34 + L * 0.012, 0.36 + L * 0.025, '#8a8274', 11);
  const nug = [[-0.18, 0.12, 0.2], [0.12, 0.2, 0.18], [-0.05, -0.1, 0.36], [0.28, -0.05, 0.25], [-0.25, -0.2, 0.3], [0.05, -0.25, 0.42]];
  for (let k = 0; k < Math.min(nug.length, 2 + L); k++) { const [x, y, z] = nug[k]; s.ell(x, y, z, 0.03, 0.03, 0.03, mat.gold()); }
  // stutten van de mijningang
  const eh = L >= 2 ? 0.34 : 0.3;
  s.box(-0.14, 0.18, 0, -0.1, 0.32, eh, mat.wood('#6b4523'));
  s.box(0.06, 0.18, 0, 0.1, 0.32, eh, mat.wood('#6b4523'));
  s.box(-0.16, 0.18, eh - 0.02, 0.12, 0.32, eh + 0.03, mat.wood('#5a3a1e'));
  s.box(-0.1, 0.25, 0, 0.06, 0.31, eh - 0.03, mat.plain('#14100c'));
  if (L >= 2) {
    s.gable(-0.18, 0.16, 0.14, 0.36, eh + 0.03, 0.1, 'y', L >= 3 ? mat.slate('#5c6370') : mat.tiles('#9a4630'), 0.02);
    for (const x of [-0.06, 0.02]) s.box(x - 0.006, 0.3, 0, x + 0.006, 0.47, 0.012, mat.metal('#6e747c')); // rails
    lampPost(s, 0.15, 0.36, 0.3);
  }
  // karretje met goud
  const cy = L >= 2 ? 0.4 : 0.3; const cx = L >= 2 ? -0.02 : 0.27;
  s.box(cx - 0.08, cy - 0.06, 0.05, cx + 0.08, cy + 0.06, 0.12, mat.wood('#7a5129'));
  for (const dx of [-0.06, 0.06]) s.hcyl('y', cx + dx, 0.04, 0.035, cy - 0.07, cy + 0.07, mat.wood('#4a3220'));
  for (const [dx, dy] of [[-0.04, -0.02], [0.01, 0.02], [0.05, -0.02], [-0.02, 0.01]]) s.ell(cx + dx, cy + dy, 0.13, 0.03, 0.03, 0.025, mat.gold());
  let glow = null; let flag = null;
  if (L >= 3) { // schachttoren met een wiel
    const tx = -0.3; const ty = -0.28; const th = 0.8 + (L - 3) * 0.08;
    for (const [dx, dy] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) s.cap([tx + dx * 1.4, ty + dy * 1.4, 0.2], [tx + dx * 0.4, ty + dy * 0.4, th], 0.014, mat.wood('#5a3a1e'));
    s.box(tx - 0.06, ty - 0.06, th - 0.03, tx + 0.06, ty + 0.06, th, mat.wood('#6b4523'));
    s.hcyl('y', tx, th + 0.06, 0.07, ty - 0.012, ty + 0.012, mat.metal('#4d4f54'));
    s.cap([tx + 0.07, ty, th + 0.06], [tx + 0.07, ty, 0.3], 0.004, mat.plain('#cdbb92'));
  }
  if (L >= 4) { // smeltoven en baren goud
    s.box(0.2, 0.12, 0, 0.42, 0.3, 0.2, mat.stone('#7a7368'));
    s.cyl(0.36, 0.17, 0.045, 0.2, 0.56, mat.stone('#857f74'));
    s.box(0.22, 0.295, 0.04, 0.32, 0.305, 0.12, mat.plain('#ff8a2a', true));
    for (let k = 0; k < 3; k++) s.box(0.24 + k * 0.05, 0.36, 0, 0.28 + k * 0.05, 0.42, 0.025, mat.gold());
    s.box(0.26, 0.37, 0.025, 0.3, 0.41, 0.05, mat.gold());
    glow = [0.27, 0.31, 0.08];
  }
  if (L >= 5) { // schatkamertje met een gouden dak
    walls(s, st, 0.16, -0.44, 0.42, -0.2, 0.0, 0.34, { wall: st.wall === 'timber' ? 'stone' : st.wall });
    s.hip(0.14, -0.46, 0.44, -0.18, 0.34, 0.18, mat.gold(), 0.02);
    door(s, 'y', -0.2, 0.25, 0.33, 0.0, 0.24, st);
    flag = flagPole(s, 0.29, -0.32, 0.52, 0.3);
  }
  const A = {};
  if (glow) A.glow = glow;
  if (flag) A.flag = flag;
  return A;
}

// Opslagplaats: 1 houten schuur met riet; 2 groter, pannen en een stenen voet; 3 stenen onderbouw, leien en een
// hijsbalk; 4 een vleugel ernaast en een kar; 5 een koepeltje met een gouden windwijzer.
function storage(s, st, L) {
  const x0 = -0.38; const y0 = -0.36; const x1 = L >= 2 ? 0.28 : 0.18; const y1 = L >= 2 ? 0.24 : 0.12;
  const h = [0, 0.36, 0.46, 0.58, 0.62, 0.68][L];
  s.box(x0, y0, 0, x1, y1, L >= 2 ? 0.08 : 0.04, L >= 2 ? mat.stone(st.base) : mat.wood('#6b4523'));
  const z0 = L >= 2 ? 0.08 : 0.04;
  if (L >= 3) {
    walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, z0, 0.28, { wall: st.wall === 'timber' ? 'stone' : st.wall });
    walls(s, st, x0 + 0.015, y0 + 0.015, x1 - 0.015, y1 - 0.015, 0.28, h, { wall: st.wall === 'timber' ? 'timber' : st.wall });
  } else walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, z0, h, { wall: st.wall === 'timber' ? 'wood' : st.wall });
  const top = roof(s, st, x0, y0, x1, y1, h, 0.32 + L * 0.02, 'y', { level: L });
  door(s, 'y', y1 - 0.01, -0.14, 0.06, z0, z0 + 0.28, st);
  window2(s, 'x', x1 - 0.01, -0.14, h - 0.2, 0.1, 0.1);
  if (L >= 2) window2(s, 'y', y1 - 0.01, 0.12, h - 0.2, 0.08, 0.1);
  sacks(s, -0.25, y1 + 0.12);
  if (L < 4) { crate(s, x1 + 0.08, 0.1); if (L >= 2) crate(s, x1 + 0.1, -0.06, 0.06); } else { crate(s, 0.36, 0.36); crate(s, 0.24, 0.4, 0.05); }
  if (L >= 2) barrel(s, 0.1, y1 + 0.13);
  if (L >= 3) hoist(s, -0.02, y1 + 0.02, h + 0.12, 'sack');
  if (L >= 4) { // vleugel aan de zijkant en een kar
    walls(s, st, x1, y0 + 0.08, 0.44, y1 - 0.12, z0, h * 0.62, { wall: st.wall === 'timber' ? 'timber' : st.wall });
    roof(s, st, x1 - 0.01, y0 + 0.06, 0.46, y1 - 0.1, h * 0.62, 0.16, 'x', { level: Math.max(3, L) });
    door(s, 'x', 0.44, -0.14, -0.02, z0, z0 + 0.22, st);
    for (const [x, z] of [[-0.06, 0], [0.04, 0], [-0.01, 0.13]]) { s.cyl(x, 0.42, 0.045, z, z + 0.13, mat.wood('#7d5128')); s.cyl(x, 0.42, 0.047, z + 0.03, z + 0.045, mat.metal('#4d4f54')); }
  }
  if (L >= 5) { // koepeltje op de nok
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    walls(s, st, cx - 0.07, cy - 0.07, cx + 0.07, cy + 0.07, top - 0.12, top + 0.1);
    const tt = turretTop(s, st, cx, cy, 0.075, top + 0.1, 0.18);
    goldVane(s, cx, cy, tt);
  }
  return {};
}

// Kazerne: 1 houten hal met riet; 2 stenen hal met pannen en een tweede oefenpop; 3 leien en een omheind oefenplein;
// 4 een vleugel achteraan; 5 een hoektoren met kantelen.
function barracks(s, st, L) {
  const x0 = -0.4; const x1 = 0.3; const y0 = -0.36; const y1 = 0.16; const h = 0.42 + L * 0.06;
  s.box(x0, y0, 0, x1, y1, 0.1, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.1, h, { wall: st.wall === 'timber' ? (L >= 2 ? 'stone' : 'timber') : st.wall });
  const top = roof(s, st, x0, y0, x1, y1, h, 0.3 + L * 0.02, 'x', { level: L });
  door(s, 'y', y1 - 0.01, -0.12, 0.06, 0.1, 0.4, st);
  window2(s, 'y', y1 - 0.01, 0.14, 0.26, 0.09, 0.13); window2(s, 'y', y1 - 0.01, -0.33, 0.26, 0.09, 0.13);
  window2(s, 'x', x1 - 0.01, -0.2, 0.26, 0.09, 0.13);
  // wapenrek en strooien poppen
  for (let k = 0; k < 4; k++) s.box(0.36 + k * 0.025, 0.26, 0, 0.37 + k * 0.025, 0.27, 0.42, mat.wood('#6b4523'));
  s.box(0.35, 0.25, 0.3, 0.46, 0.28, 0.32, mat.wood('#5a3a1e'));
  const dummies = L >= 2 ? [[-0.3, 0.36], [-0.12, 0.38]] : [[-0.3, 0.36]];
  for (const [x, y] of dummies) { s.cyl(x, y, 0.012, 0, 0.36, mat.wood('#6b4523')); s.ell(x, y, 0.3, 0.05, 0.05, 0.08, mat.hay()); s.box(x - 0.08, y - 0.006, 0.3, x + 0.08, y + 0.006, 0.32, mat.wood('#6b4523')); }
  if (L >= 3) { fenceLine(s, -0.44, 0.46, 0.44, 0.46, 0.14); fenceLine(s, -0.44, 0.22, -0.44, 0.46, 0.14); }
  if (L >= 4) { // vleugel aan de rechterkant
    walls(s, st, x1 - 0.01, y0 + 0.02, 0.46, y1 - 0.18, 0.0, h * 0.72, { wall: st.wall === 'timber' ? 'stone' : st.wall });
    roof(s, st, x1 - 0.03, y0, 0.48, y1 - 0.16, h * 0.72, 0.16, 'y', { level: Math.max(3, L) });
    door(s, 'y', y1 - 0.18, 0.34, 0.42, 0.0, 0.24, st);
    window2(s, 'x', 0.46, -0.28, h * 0.4, 0.08, 0.12);
  }
  if (L >= 5) { // hoektoren met kantelen (vooraan links)
    const tx = x0 + 0.02; const ty = y1 + 0.02; const th = h + 0.45;
    s.cyl(tx, ty, 0.11, 0, th, roundM(st, 0, th));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; s.box(tx + Math.cos(a) * 0.1 - 0.02, ty + Math.sin(a) * 0.1 - 0.02, th, tx + Math.cos(a) * 0.1 + 0.02, ty + Math.sin(a) * 0.1 + 0.02, th + 0.06, towerM(st)); }
    window2(s, 'y', ty + 0.11, tx - 0.03, th - 0.2, 0.06, 0.1);
    return { flag: flagPole(s, tx, ty, th, 0.35) };
  }
  return { flag: flagPole(s, x1 - 0.06, y0 + 0.06, top - 0.1, 0.5) };
}

// Schietbaan: 1 houten hut met riet en één schijf; 2 pannen, twee schijven en een boogrek; 3 een overdekte schietstand en
// drie schijven; 4 een houten uitkijkpost; 5 een stenen toren met vaandel en een gouden schijf.
function range(s, st, L) {
  const x0 = -0.4; const x1 = L >= 2 ? 0.08 : 0.0; const y0 = -0.4; const y1 = L >= 2 ? 0.08 : 0.0; const h = 0.36 + L * 0.05;
  s.box(x0, y0, 0, x1, y1, 0.06, L >= 3 ? mat.stone(st.base) : mat.wood('#6b4523'));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.06, h, { wall: st.wall === 'timber' ? (L >= 3 ? 'timber' : 'wood') : st.wall });
  const top = roof(s, st, x0, y0, x1, y1, h, 0.28, 'y', { level: L });
  door(s, 'y', y1 - 0.01, -0.24, -0.1, 0.06, 0.32, st);
  const targets = L >= 3 ? [[0.32, -0.24], [0.36, 0.08], [0.06, 0.36]] : L >= 2 ? [[0.32, -0.2], [0.06, 0.34]] : [[0.28, -0.1]];
  targets.forEach(([x, y], k) => {
    s.box(x - 0.01, y - 0.01, 0, x + 0.01, y + 0.01, 0.2, mat.wood('#6b4523'));
    s.hcyl('x', y, 0.26, 0.09, x - 0.015, x + 0.015, L >= 5 && k === 0 ? mat.gold() : { k: 'target', cy: y, cz: 0.26, r: 0.09 });
  });
  if (L >= 2) { // boogrek
    s.box(-0.36, 0.14, 0, -0.34, 0.16, 0.3, mat.wood('#5a3a1e')); s.box(-0.16, 0.14, 0, -0.14, 0.16, 0.3, mat.wood('#5a3a1e'));
    s.box(-0.36, 0.14, 0.26, -0.14, 0.16, 0.28, mat.wood('#5a3a1e'));
    for (const x of [-0.31, -0.25, -0.19]) s.cap([x, 0.16, 0.04], [x, 0.16, 0.27], 0.006, mat.wood('#7a4a24'));
  }
  if (L >= 3) { // overdekte schietstand aan de voorkant
    for (const [x, y] of [[0.14, 0.18], [0.42, 0.18], [0.14, 0.44], [0.42, 0.44]]) s.box(x - 0.015, y - 0.015, 0, x + 0.015, y + 0.015, 0.3, mat.wood('#6b4523'));
    s.gable(0.12, 0.16, 0.44, 0.46, 0.3, 0.1, 'x', mat.tiles('#9a4630'), 0.02);
    s.box(0.14, 0.18, 0.1, 0.42, 0.2, 0.13, mat.wood('#8a5f33'));
  }
  if (L >= 4 && L < 5) { // houten uitkijkpost
    for (const [dx, dy] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) s.box(-0.3 + dx - 0.012, 0.3 + dy - 0.012, 0, -0.3 + dx + 0.012, 0.3 + dy + 0.012, 0.7, mat.wood('#5a3a1e'));
    s.box(-0.37, 0.23, 0.7, -0.23, 0.37, 0.74, mat.wood('#7a5129'));
    s.hip(-0.38, 0.22, -0.22, 0.38, 0.82, 0.1, mat.thatch(), 0.02);
    return { flag: flagPole(s, -0.3, 0.3, 0.92, 0.25) };
  }
  if (L >= 5) { // stenen toren
    const th = 1.0;
    s.cyl(-0.3, 0.3, 0.1, 0, th, roundM(st, 0, th));
    window2(s, 'y', 0.4, -0.33, th - 0.25, 0.06, 0.1);
    const tt = turretTop(s, st, -0.3, 0.3, 0.1, th, 0.3);
    return { flag: flagPole(s, -0.3, 0.3, tt, 0.25) };
  }
  return {};
}

// Stal: 1 kleine houten stal met riet; 2 groter met pannen en drie deuren; 3 een hooizolder met hijsbalk en een
// drinkbak; 4 een tweede vleugel; 5 een koepeltje met een gouden windwijzer.
function stable(s, st, L) {
  const x0 = -0.4; const x1 = L >= 2 ? 0.32 : 0.12; const y0 = -0.36; const y1 = 0.12; const h = 0.36 + L * 0.06;
  s.box(x0, y0, 0, x1, y1, 0.05, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.05, h, { wall: st.wall === 'timber' ? (L >= 3 ? 'timber' : 'wood') : st.wall });
  const top = roof(s, st, x0, y0, x1, y1, h, 0.3 + L * 0.02, 'x', { level: L });
  const doors = L >= 2 ? [-0.32, -0.08, 0.16] : [-0.3, -0.08];
  for (const a of doors) s.win('y', y1 - 0.01, a, a + 0.14, 0.05, 0.3, mat.door('#5a3a1e'));
  // omheining en hooi
  const fx1 = L >= 2 ? 0.44 : 0.3;
  fenceLine(s, -0.42, 0.42, fx1, 0.42, 0.18);
  s.box(0.3, 0.18, 0, 0.42, 0.3, 0.1, mat.hay()); s.box(0.32, 0.2, 0.1, 0.4, 0.28, 0.18, mat.hay());
  if (L >= 3) { // hooizolder met een luik en een hijsbalk, drinkbak
    s.win('y', y1 - 0.01, -0.06, 0.06, h - 0.2, h - 0.04, mat.door('#6b4224'));
    s.box(-0.02, y1 - 0.01, h + 0.02, 0.02, y1 + 0.12, h + 0.06, mat.wood('#5a3a1e'));
    s.box(-0.14, 0.22, 0, 0.06, 0.3, 0.08, mat.wood('#7a5129'));
    s.box(-0.13, 0.23, 0.06, 0.05, 0.29, 0.075, mat.plain('#4f86b8', true));
  }
  if (L >= 4) { // tweede vleugel rechts, met een eigen staldeur
    walls(s, st, x1 - 0.01, y0 + 0.02, 0.46, y1 - 0.02, 0.0, h * 0.75, { wall: st.wall === 'timber' ? 'timber' : st.wall });
    roof(s, st, x1 - 0.03, y0, 0.48, y1, h * 0.75, 0.16, 'y', { level: Math.max(3, L) });
    s.win('x', 0.46, -0.2, -0.04, 0.0, 0.26, mat.door('#5a3a1e'));
  }
  if (L >= 5) { // koepeltje
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    walls(s, st, cx - 0.07, cy - 0.07, cx + 0.07, cy + 0.07, top - 0.12, top + 0.08);
    const tt = turretTop(s, st, cx, cy, 0.075, top + 0.08, 0.18);
    goldVane(s, cx, cy, tt);
  }
  return {};
}

// Smidse: 1 open smidse onder een afdak; 2 een stenen werkplaats met pannen; 3 groter met leien, een hogere schoorsteen,
// een bluskuip en een wapenrek; 4 een aanbouw met een tweede schoorsteen; 5 kantelen, een gouden uithangbord en een harnas.
function smithy(s, st, L) {
  const x0 = -0.38; const y0 = -0.36;
  if (L === 1) {
    // open smidse: afdak op palen, achterwand, stenen schouw
    const x1 = 0.12; const y1 = 0.1; const h = 0.42;
    for (const [x, y] of [[x0, y1], [x1, y1], [x1, y0], [x0, y0]]) s.box(x - 0.022, y - 0.022, 0, x + 0.022, y + 0.022, h, mat.wood('#6b4523'));
    s.box(x0, y0 - 0.02, 0, x1, y0 + 0.01, h, mat.wood('#7a5129'));
    roof(s, st, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h, 0.22, 'y', { level: 1, roof: st.roof === 'pagoda' ? 'pagoda' : 'gable' });
    s.box(-0.3, -0.34, 0, -0.12, -0.2, 0.2, mat.stone('#7a7368'));
    s.box(-0.26, -0.32, 0.2, -0.16, -0.22, h + 0.3, mat.stone('#857f74'));
    s.box(-0.28, -0.205, 0.06, -0.14, -0.195, 0.16, mat.plain('#ff8a2a', true));
    s.box(0.18, 0.26, 0, 0.28, 0.32, 0.12, mat.stone('#6f6a62')); s.box(0.16, 0.25, 0.12, 0.3, 0.33, 0.16, mat.metal('#3a3c40'));
    return { smoke: [-0.21, -0.27, h + 0.3], glow: [-0.21, -0.2, 0.12] };
  }
  const x1 = L >= 3 ? 0.3 : 0.2; const y1 = L >= 3 ? 0.22 : 0.14; const h = 0.42 + L * 0.05;
  s.box(x0, y0, 0, x1, y1, 0.1, mat.stone(st.base));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.1, h, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#9c968b' : null });
  const ch = h + 0.3 + L * 0.08;
  s.box(0.0, -0.3, 0, 0.16, -0.16, ch, mat.stone('#857f74'));
  if (L >= 3) s.box(-0.01, -0.31, ch - 0.06, 0.17, -0.15, ch, mat.stone('#6f6a62'));
  const top = roof(s, st, x0, y0, x1, y1, h, 0.3, 'y', { level: L });
  door(s, 'y', y1 - 0.01, -0.22, -0.06, 0.1, 0.4, st);
  window2(s, 'x', x1 - 0.01, -0.2, 0.26, 0.09, 0.12);
  // aambeeld en vuur voor de deur
  s.box(0.06, y1 + 0.08, 0, 0.16, y1 + 0.14, 0.12, mat.stone('#6f6a62'));
  s.box(0.04, y1 + 0.07, 0.12, 0.18, y1 + 0.15, 0.16, mat.metal('#3a3c40'));
  s.box(-0.12, y1 + 0.12, 0, -0.02, y1 + 0.18, 0.1, mat.stone('#7a7368'));
  s.box(-0.14, y1 + 0.11, 0.1, 0.0, y1 + 0.19, 0.13, mat.plain('#d9682a'));
  const A = { smoke: [0.08, -0.23, ch], glow: [-0.07, y1 + 0.15, 0.14] };
  if (L >= 3) { // bluskuip en wapenrek
    s.cyl(x1 + 0.08, y1 - 0.04, 0.06, 0, 0.12, mat.wood('#7d5128')); s.cyl(x1 + 0.08, y1 - 0.04, 0.05, 0.11, 0.115, mat.plain('#4f86b8', true));
    s.box(x1 + 0.04, -0.3, 0, x1 + 0.06, -0.28, 0.34, mat.wood('#5a3a1e')); s.box(x1 + 0.04, -0.06, 0, x1 + 0.06, -0.04, 0.34, mat.wood('#5a3a1e'));
    s.box(x1 + 0.04, -0.3, 0.3, x1 + 0.06, -0.04, 0.32, mat.wood('#5a3a1e'));
    for (const y of [-0.24, -0.17, -0.1]) s.cap([x1 + 0.06, y, 0.05], [x1 + 0.06, y, 0.32], 0.006, mat.metal('#c3c9d0'));
  }
  if (L >= 4) { // overdekte werkplaats voor de deur en een tweede schoorsteen
    for (const x of [-0.2, 0.28]) s.box(x - 0.016, y1 + 0.22, 0, x + 0.016, y1 + 0.252, 0.34, mat.wood('#5a3a1e'));
    s.box(-0.22, y1 + 0.215, 0.32, 0.3, y1 + 0.255, 0.35, mat.wood('#5a3a1e'));
    s.hip(-0.24, y1 - 0.02, 0.32, y1 + 0.27, 0.35, 0.09, mat.tiles('#9a4630'), 0.01);
    s.box(-0.36, -0.42, 0, -0.26, -0.32, h + 0.5, mat.stone('#857f74'));
  }
  if (L >= 5) { // kantelen op de schoorsteen, gouden uithangbord en een harnas op een paal
    for (const [dx, dy] of [[0, 0], [0.12, 0], [0, 0.12], [0.12, 0.12]]) s.box(-0.01 + dx, -0.31 + dy, ch, 0.05 + dx, -0.25 + dy, ch + 0.06, mat.stone('#6f6a62'));
    s.box(x1, y1 - 0.08, 0.5, x1 + 0.12, y1 - 0.07, 0.52, mat.metal('#3a3c40'));
    s.hcyl('x', y1 - 0.075, 0.43, 0.06, x1 + 0.08, x1 + 0.095, mat.gold());
    s.cyl(-0.32, y1 + 0.18, 0.01, 0, 0.32, mat.wood('#5a3a1e'));
    s.ell(-0.32, y1 + 0.18, 0.26, 0.05, 0.06, 0.07, mat.metal('#dfe4ea'));
    s.ell(-0.32, y1 + 0.18, 0.35, 0.03, 0.03, 0.035, mat.metal('#eef2f6'));
  }
  void top;
  return A;
}

// Markt: 1 twee kraampjes; 2 vier kraampjes; 3 een put met een dakje in het midden; 4 een overdekte markthal achteraan;
// 5 een stenen hal met een klokkentorentje, een gouden windwijzer en vaandels.
function market(s, st, L) {
  const cols = [['#c0392b', '#efe6cf'], ['#2e7d4f', '#efe6cf'], ['#2c5fae', '#efe6cf'], ['#d9a441', '#7a2b2b']];
  const stall = (x, y, k, sc = 1) => {
    for (const [dx, dy] of [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.1], [0.13, 0.1]]) s.box(x + dx * sc - 0.01, y + dy * sc - 0.01, 0, x + dx * sc + 0.01, y + dy * sc + 0.01, 0.32, mat.wood('#6b4523'));
    s.box(x - 0.13 * sc, y - 0.1 * sc, 0.12, x + 0.13 * sc, y + 0.1 * sc, 0.15, mat.wood('#8a5f33'));
    const [c1, c2] = cols[k % cols.length];
    s.gable(x - 0.14 * sc, y - 0.11 * sc, x + 0.14 * sc, y + 0.11 * sc, 0.32, 0.08, 'x', mat.cloth(c1, c2, false), 0.03);
    for (const [dx, dy, c] of [[-0.06, 0, '#d9483b'], [0, 0.03, '#e9b93a'], [0.06, -0.02, '#6ba33a']]) s.ell(x + dx * sc, y + dy * sc, 0.17, 0.03, 0.03, 0.025, mat.plain(c));
  };
  if (L >= 4) {
    // markthal achteraan (zuilen + groot dak; op niveau 5 van steen met een klokkentorentje)
    const hx0 = -0.44; const hx1 = 0.44; const hy0 = -0.44; const hy1 = -0.06; const hh = L >= 5 ? 0.46 : 0.4;
    s.box(hx0, hy0, 0, hx1, hy1, 0.05, mat.stone(st.base));
    if (L >= 5) walls(s, st, hx0 + 0.02, hy0 + 0.02, hx1 - 0.02, hy0 + 0.12, 0.05, hh, { wall: st.wall === 'timber' ? 'stone' : st.wall });
    for (let k = 0; k < 5; k++) { const x = hx0 + 0.04 + k * ((hx1 - hx0 - 0.08) / 4); s.cyl(x, hy1 - 0.03, 0.025, 0.05, hh, L >= 5 ? mat.plaster('#f1ebde', 0.05, hh) : mat.wood('#6b4523')); }
    const top = roof(s, st, hx0 - 0.02, hy0 - 0.02, hx1 + 0.02, hy1 + 0.02, hh, 0.22, 'x', { level: Math.max(3, L) });
    for (const x of [-0.25, 0.0, 0.25]) { crate(s, x, -0.24, 0.05); sacks(s, x + 0.08, -0.2); }
    if (L >= 5) {
      walls(s, st, -0.08, -0.33, 0.08, -0.17, top - 0.12, top + 0.16);
      s.hcyl('y', 0, top + 0.05, 0.045, -0.172, -0.165, mat.plain('#f4efe0'));
      s.cap([0, -0.16, top + 0.05], [0, -0.16, top + 0.08], 0.004, mat.plain('#2a1d12'));
      const tt = turretTop(s, st, 0, -0.25, 0.085, top + 0.16, 0.2);
      goldVane(s, 0, -0.25, tt);
      bannerCloth(s, -0.44, 0.0, 0.24, 0.24, st.trim || '#7a2b2b');
      bannerCloth(s, 0.44, -0.44, 0.24, 0.24, st.trim2 || st.trim || '#2c5fae', 'x');
    }
    stall(-0.22, 0.2, 0, 0.9); stall(0.2, 0.22, 1, 0.9);
  } else {
    const stalls = L >= 3 ? [[-0.22, -0.2], [0.2, -0.18], [-0.22, 0.2]] : L >= 2 ? [[-0.22, -0.2], [0.2, -0.18], [-0.22, 0.2], [0.22, 0.22]] : [[-0.15, -0.1], [0.18, 0.12]];
    stalls.forEach(([x, y], k) => stall(x, y, k, L >= 3 ? 0.9 : 1));
  }
  if (L === 3) { // stenen put met een pannendak vooraan rechts
    const wx = 0.24; const wy = 0.24;
    s.cyl(wx, wy, 0.11, 0, 0.14, mat.stone('#a39b8c')); s.cyl(wx, wy, 0.09, 0.12, 0.14, mat.plain('#3d6f9a', true));
    for (const x of [wx - 0.09, wx + 0.09]) s.box(x - 0.012, wy - 0.012, 0.14, x + 0.012, wy + 0.012, 0.42, mat.wood('#5a3a1e'));
    s.hcyl('x', wy, 0.34, 0.015, wx - 0.09, wx + 0.09, mat.wood('#4a3220'));
    s.cap([wx, wy, 0.34], [wx, wy, 0.22], 0.003, mat.plain('#cdbb92')); s.cyl(wx, wy, 0.025, 0.18, 0.22, mat.wood('#7d5128'));
    s.gable(wx - 0.14, wy - 0.12, wx + 0.14, wy + 0.12, 0.42, 0.1, 'x', mat.tiles('#9a4630'), 0.01);
  }
  crate(s, 0.4, -0.02, 0.05); barrel(s, -0.4, 0.02); sacks(s, L === 3 ? -0.04 : 0.0, 0.4);
  if (L >= 2 && L !== 3) barrel(s, 0.4, 0.4);
  if (L >= 2) crate(s, -0.38, 0.4, 0.05);
  return {};
}

// Wachttoren: 1 houten uitkijkpost op palen met schoren, een ladder en een rieten dakje; 2 stenen voet met een houten
// wachtkamer die uitsteekt op schoren en een pannendak; 3 helemaal steen met kantelen, een traptorentje rechts en een
// wachthuisje bovenop (dak van het volk); 4 hoger, mezekouwen (uitkragende rand), hoektorentjes en vaandels;
// 5 een tweede, smallere verdieping met een rijk dak en gouden windwijzer, vuurschalen en lantaarns aan de voet.
function tower(s, st, L) {
  const stoneM = towerM(st);
  const br = mat.wood('#6b4523');
  const capRoof = (x0, y0, x1, y1, z, h, lv) => roof(s, st, x0, y0, x1, y1, z, h, 'x', { level: lv, roof: st.roof === 'gable' ? 'hip' : st.roof, domeR: 0.46 });
  if (L <= 1) {
    const H = 1.0; const p = 0.16; const logM = mat.logs('#7f5530');
    for (const x of [-p, p]) for (const y of [-p, p]) s.cyl(x, y, 0.028, 0, H + 0.34, logM);
    for (const [z0, z1] of [[0.06, 0.52], [0.52, H - 0.02]]) { // kruisschoren op de voor- en rechterkant
      s.cap([-p, p, z0], [p, p, z1], 0.012, br); s.cap([p, p, z0], [-p, p, z1], 0.012, br);
      s.cap([p, -p, z0], [p, p, z1], 0.012, br); s.cap([p, p, z0], [p, -p, z1], 0.012, br);
    }
    s.box(-0.24, -0.24, H, 0.24, 0.24, H + 0.05, mat.wood('#8a5f33'));
    const pl = mat.wood('#a8743f');
    s.box(-0.24, 0.215, H + 0.05, 0.24, 0.24, H + 0.17, pl); s.box(0.215, -0.24, H + 0.05, 0.24, 0.24, H + 0.17, pl);
    s.box(-0.24, -0.24, H + 0.05, 0.24, -0.215, H + 0.17, pl); s.box(-0.24, -0.24, H + 0.05, -0.215, 0.24, H + 0.17, pl);
    // ladder vooraan
    for (const x of [-0.07, 0.03]) s.cap([x, 0.3, 0], [x, 0.235, H + 0.05], 0.01, br);
    for (let z = 0.12; z < H; z += 0.13) s.hcyl('x', 0.3 - (0.065 * z) / H, z, 0.007, -0.07, 0.03, mat.wood('#8a5f33'));
    s.ell(0, 0, H + 0.24, 0.035, 0.035, 0.045, mat.metal('#a8843a')); // alarmklok
    s.hip(-0.28, -0.28, 0.28, 0.28, H + 0.34, 0.24, mat.thatch(mat.wood('#7a5a34')), 0.03);
    barrel(s, 0.33, -0.12);
    return { flag: flagPole(s, 0, 0, H + 0.5, 0.3) };
  }
  if (L === 2) {
    const r = 0.18; const H = 0.85; const ow = 0.235; const H2 = H + 0.5;
    s.box(-r - 0.04, -r - 0.04, 0, r + 0.04, r + 0.04, 0.1, mat.stone(st.base));
    s.box(-r, -r, 0.1, r, r, H, stoneM);
    for (const a of [-0.12, 0.12]) { s.cap([a, r, H - 0.2], [a, ow - 0.01, H], 0.014, br); s.cap([r, a, H - 0.2], [ow - 0.01, a, H], 0.014, br); }
    s.box(-ow, -ow, H, ow, ow, H + 0.04, br);
    s.box(-ow + 0.01, -ow + 0.01, H + 0.04, ow - 0.01, ow - 0.01, H2, mat.wood(st.wood));
    const bat = mat.wood(tint(st.wood, -0.25));
    for (const a of [-0.2, -0.1, 0.1, 0.2]) { s.box(a - 0.008, ow - 0.012, H + 0.04, a + 0.008, ow, H2, bat); s.box(ow - 0.012, a - 0.008, H + 0.04, ow, a + 0.008, H2, bat); }
    s.win('y', ow - 0.01, -0.07, 0.07, H + 0.17, H + 0.33); s.win('x', ow - 0.01, -0.07, 0.07, H + 0.17, H + 0.33);
    s.box(-0.09, ow - 0.01, H + 0.33, 0.09, ow + 0.03, H + 0.35, br); s.box(ow - 0.01, -0.09, H + 0.33, ow + 0.03, 0.09, H + 0.35, br);
    const top = capRoof(-ow - 0.02, -ow - 0.02, ow + 0.02, ow + 0.02, H2, 0.34, 2);
    door(s, 'y', r, -0.05, 0.05, 0.1, 0.34, st);
    s.win('x', r, -0.02, 0.02, 0.45, 0.6, mat.plain('#1d1a16'));
    barrel(s, 0.33, -0.1); crate(s, -0.33, 0.3, 0.05);
    return { flag: flagPole(s, 0, 0, top - 0.04, 0.3) };
  }
  // vanaf niveau 3 helemaal van steen
  const r = 0.2; const h = L === 3 ? 1.7 : 2.0;
  s.box(-r - 0.04, -r - 0.04, 0, r + 0.04, r + 0.04, 0.12, mat.stone(st.base));
  s.box(-r, -r, 0.12, r, r, h, stoneM);
  for (const z of [0.6, 1.2]) s.box(-r - 0.012, -r - 0.012, z, r + 0.012, r + 0.012, z + 0.03, mat.stone(st.base));
  const pr = L >= 4 ? r + 0.06 : r + 0.035;
  if (L >= 4) { // mezekouwen: de rand rust op uitkragende steunstenen
    for (let a = -r + 0.02; a < r; a += 0.075) {
      s.box(a - 0.016, r, h - 0.13, a + 0.016, pr, h, stoneM); s.box(r, a - 0.016, h - 0.13, pr, a + 0.016, h, stoneM);
      s.box(a - 0.016, -pr, h - 0.13, a + 0.016, -r, h, stoneM); s.box(-pr, a - 0.016, h - 0.13, -r, a + 0.016, h, stoneM);
    }
  }
  s.box(-pr, -pr, h, pr, pr, h + 0.05, stoneM);
  const w = 0.05;
  for (let a = -pr; a < pr - 0.01; a += 0.1) {
    const b = Math.min(pr, a + w);
    s.box(a, pr - 0.045, h + 0.05, b, pr, h + 0.14, stoneM); s.box(pr - 0.045, a, h + 0.05, pr, b, h + 0.14, stoneM);
    s.box(a, -pr, h + 0.05, b, -pr + 0.045, h + 0.14, stoneM); s.box(-pr, a, h + 0.05, -pr + 0.045, b, h + 0.14, stoneM);
  }
  // traptorentje op de rechterkant
  const tx = r + 0.045; const ty = -0.08; const th = h * 0.78; const tr = 0.075;
  s.cyl(tx, ty, tr, 0, th, roundM(st, 0, th));
  turretTop(s, st, tx, ty, tr, th, 0.22);
  for (let z = 0.3; z < th - 0.15; z += 0.32) s.win('x', tx + tr - 0.004, ty - 0.012, ty + 0.012, z, z + 0.09, mat.plain('#1d1a16'));
  door(s, 'y', r, -0.06, 0.06, 0.12, 0.38, st);
  for (const z of [0.75, 1.35]) if (z + 0.2 < h) { s.win('y', r, -0.018, 0.018, z, z + 0.14, mat.plain('#1d1a16')); s.win('x', r, 0.06, 0.09, z, z + 0.14, mat.plain('#1d1a16')); }
  let top; let flag; let glow;
  if (L >= 5) { // geplaveide voorplaats en gouden banden
    s.box(-0.44, -0.44, 0, 0.44, 0.44, 0.025, mat.stone(tint(st.base, 0.12)));
    for (const z of [0.6, 1.2]) s.box(-r - 0.016, -r - 0.016, z + 0.005, r + 0.016, r + 0.016, z + 0.025, mat.gold());
  }
  if (L >= 4) { // hoektorentjes op uitkragende voeten
    const ct = h + 0.2;
    for (const [x, y] of [[pr - 0.01, pr - 0.01], [-pr + 0.01, pr - 0.01], [pr - 0.01, -pr + 0.01], [-pr + 0.01, -pr + 0.01]]) {
      s.ell(x, y, h - 0.16, 0.06, 0.06, 0.11, stoneM);
      s.cyl(x, y, 0.06, h - 0.16, ct, roundM(st, h - 0.16, ct));
      const tt = turretTop(s, st, x, y, 0.06, ct, 0.18);
      if (x < 0 && y < 0) flag = flagPole(s, x, y, tt - 0.02, 0.24);
      s.win('y', y + 0.058, x - 0.01, x + 0.01, h + 0.02, h + 0.1, mat.plain('#1d1a16'));
    }
    const c = st.trim || '#7a2b2b'; const c2 = st.trim2 || '#d4a017';
    s.box(-0.07, pr + 0.002, h - 0.62, 0.07, pr + 0.01, h - 0.14, mat.cloth(c));
    s.box(-0.07, pr + 0.006, h - 0.4, 0.07, pr + 0.014, h - 0.36, mat.plain(c2));
    s.box(pr + 0.002, -0.07, h - 0.62, pr + 0.01, 0.07, h - 0.14, mat.cloth(c));
    s.box(pr + 0.006, -0.07, h - 0.4, pr + 0.014, 0.07, h - 0.36, mat.plain(c2));
  }
  if (L <= 4) { // wachthuisje op het platform
    const q = 0.11;
    walls(s, st, -q, -q, q, q, h + 0.05, h + 0.32, { wall: st.wall === 'timber' ? 'timber' : st.wall });
    s.win('y', q, -0.04, 0.04, h + 0.12, h + 0.25); s.win('x', q, -0.04, 0.04, h + 0.12, h + 0.25);
    top = capRoof(-q - 0.035, -q - 0.035, q + 0.035, q + 0.035, h + 0.32, 0.3, L);
  } else { // open bovenverdieping op pilaren met een vuurbaken, een rijk dak en een gouden windwijzer
    const q = 0.16; const h2 = h + 0.6; const pw = 0.045;
    for (const [x, y] of [[-q, -q], [q - pw, -q], [-q, q - pw], [q - pw, q - pw]]) s.box(x, y, h + 0.05, x + pw, y + pw, h2 - 0.08, stoneM);
    s.box(-q, q - 0.03, h + 0.05, q, q, h + 0.13, stoneM); s.box(q - 0.03, -q, h + 0.05, q, q, h + 0.13, stoneM);
    s.box(-q - 0.005, q - 0.035, h + 0.13, q + 0.005, q + 0.005, h + 0.145, mat.gold()); s.box(q - 0.035, -q - 0.005, h + 0.13, q + 0.005, q + 0.005, h + 0.145, mat.gold());
    s.box(-q - 0.01, -q - 0.01, h2 - 0.08, q + 0.01, q + 0.01, h2, stoneM);
    s.box(-q - 0.016, -q - 0.016, h2 - 0.05, q + 0.016, q + 0.016, h2 - 0.025, mat.gold());
    s.cyl(0, 0, 0.07, h + 0.05, h + 0.16, mat.metal('#3a3c40'));
    s.ell(0, 0, h + 0.22, 0.06, 0.06, 0.12, mat.plain('#ffb347', true));
    s.ell(0, 0, h + 0.27, 0.03, 0.03, 0.08, mat.plain('#fff0b0', true));
    glow = [0, 0, h + 0.24];
    top = capRoof(-q - 0.05, -q - 0.05, q + 0.05, q + 0.05, h2, 0.42, 5);
    goldVane(s, 0, 0, top - 0.03, 0.18);
    for (const [x, y] of [[pr - 0.06, 0.0], [0.0, pr - 0.06]]) { // vuurschalen op de kantelen
      s.cyl(x, y, 0.03, h + 0.14, h + 0.17, mat.metal('#3a3c40'));
      s.ell(x, y, h + 0.19, 0.022, 0.022, 0.04, mat.plain('#ffb347', true));
    }
    lampPost(s, 0.36, 0.3, 0.34); lampPost(s, -0.3, 0.36, 0.34);
  }
  if (L === 3) crate(s, -0.33, 0.3, 0.05);
  if (L <= 4) barrel(s, 0.36, 0.33);
  return { flag: flag || flagPole(s, 0, 0, top - 0.04, 0.3), glow };
}

// Belegwerkplaats: 1 houten loods met een half afgewerkte ram; 2 stenen voet, pannen en een afgewerkte, overdekte ram;
// 3 leien, een kraan en een blijde (werpmachine) buiten.
function workshop(s, st, L) {
  const x0 = -0.4; const x1 = L >= 2 ? 0.22 : 0.1; const y0 = -0.4; const y1 = L >= 2 ? 0.14 : 0.04; const h = 0.46 + L * 0.08;
  s.box(x0, y0, 0, x1, y1, 0.08, L >= 2 ? mat.stone(st.base) : mat.wood('#6b4523'));
  walls(s, st, x0 + 0.01, y0 + 0.01, x1 - 0.01, y1 - 0.01, 0.08, h, { wall: st.wall === 'timber' ? (L >= 2 ? 'timber' : 'wood') : st.wall });
  roof(s, st, x0, y0, x1, y1, h, 0.32 + L * 0.03, 'y', { level: L });
  s.win('y', y1 - 0.01, -0.3, 0.02, 0.08, 0.08 + h * 0.75, mat.door('#5a3a1e'));
  if (L === 1) { // half afgewerkte ram en wielen
    s.box(0.2, 0.22, 0.05, 0.42, 0.36, 0.12, mat.wood('#7a5129'));
    for (const x of [0.24, 0.38]) for (const y of [0.21, 0.37]) s.hcyl('y', x, 0.05, 0.05, y - 0.01, y + 0.01, mat.wood('#5a3a1e'));
    s.hcyl('x', 0.29, 0.15, 0.035, 0.12, 0.46, mat.logs('#8a6238'));
    logPile(s, 0.3, -0.18, 2);
  } else { // afgewerkte ram onder een dakje
    const rx = 0.3; const ry = 0.3;
    s.box(rx - 0.14, ry - 0.08, 0.05, rx + 0.14, ry + 0.08, 0.1, mat.wood('#7a5129'));
    for (const x of [rx - 0.1, rx + 0.1]) for (const y of [ry - 0.09, ry + 0.09]) s.hcyl('y', x, 0.05, 0.05, y - 0.01, y + 0.01, mat.wood('#5a3a1e'));
    for (const [x, y] of [[rx - 0.12, ry - 0.07], [rx + 0.12, ry - 0.07], [rx - 0.12, ry + 0.07], [rx + 0.12, ry + 0.07]]) s.box(x - 0.01, y - 0.01, 0.1, x + 0.01, y + 0.01, 0.26, mat.wood('#6b4523'));
    s.gable(rx - 0.15, ry - 0.1, rx + 0.15, ry + 0.1, 0.26, 0.1, 'x', mat.hay(), 0.02);
    s.hcyl('x', ry, 0.17, 0.035, rx - 0.2, rx + 0.18, mat.logs('#8a6238'));
    s.ell(rx + 0.19, ry, 0.17, 0.03, 0.04, 0.04, mat.metal('#6e747c'));
    logPile(s, 0.3, -0.2, 3);
  }
  if (L >= 3) { // blijde: een werparm op een driehoekig gestel
    const bx = -0.28; const by = 0.3;
    for (const d of [-0.06, 0.06]) { s.cap([bx - 0.12, by + d, 0], [bx, by + d, 0.4], 0.014, mat.wood('#5a3a1e')); s.cap([bx + 0.12, by + d, 0], [bx, by + d, 0.4], 0.014, mat.wood('#5a3a1e')); }
    s.hcyl('y', bx, 0.4, 0.02, by - 0.08, by + 0.08, mat.wood('#4a3220'));
    s.cap([bx - 0.2, by, 0.6], [bx + 0.1, by, 0.3], 0.012, mat.wood('#6b4523'));
    s.box(bx + 0.06, by - 0.05, 0.18, bx + 0.16, by + 0.05, 0.3, mat.stone('#8f887c'));
    hoist(s, x1 + 0.04, -0.3, h + 0.2);
    return { flag: flagPole(s, x0 + 0.06, y0 + 0.06, h + 0.3, 0.3) };
  }
  return {};
}

// Monument: elk niveau een trede en een hogere naald; 2 beelden op de hoeken; 3 een zuilengang voor de trap;
// 4 twee obelisken ernaast en gouden randen; 5 vuurschalen en een grote gouden top.
function monument(s, st, L) {
  const steps = 2 + L;
  let z = 0;
  for (let k = 0; k < steps; k++) {
    const w = 0.92 - k * 0.11;
    s.box(-w, -w, z, w, w, z + 0.08, mat.stone(k % 2 ? '#e6dfcf' : '#d3cbb8'));
    if (L >= 4 && k === steps - 1) band(s, -w, -w, w, w, z + 0.06, 0.02, '#d4a017');
    z += 0.08;
  }
  const A = {};
  if (st.roof === 'dome') {
    const dr = 0.22 + L * 0.03;
    s.cyl(0, 0, dr, z, z + 0.3 + L * 0.04, mat.plaster(st.plaster, z, z + 0.6));
    const dz = z + 0.3 + L * 0.04;
    s.ell(0, 0, dz, dr, dr, dr * 1.2, mat.glaze(st.roofC), dz);
    if (L >= 3) s.ell(0, 0, dz + dr * 1.22, 0.04, 0.04, 0.05, mat.gold());
    A.glow = [0, 0, dz + dr * 1.3];
  } else {
    const h = 0.9 + L * 0.3;
    const nw = 0.1 + L * 0.008;
    s.box(-nw, -nw, z, nw, nw, z + h, mat.stone(st.roof === 'flat' ? '#e2cc96' : '#e8e2d2'));
    s.hip(-nw, -nw, nw, nw, z + h, 0.14 + L * 0.02, mat.gold(), 0);
    A.glow = [0, 0, z + h + 0.12];
  }
  const base = 0.08; // beelden op de onderste trede
  if (L >= 2) for (const [x, y] of [[-0.86, 0.86], [0.86, 0.86], [0.86, -0.86], [-0.86, -0.86]].slice(0, L >= 3 ? 4 : 3)) {
    s.box(x - 0.055, y - 0.055, base, x + 0.055, y + 0.055, base + 0.14, mat.stone('#a39a89'));
    s.ell(x, y, base + 0.24, 0.05, 0.05, 0.09, L >= 4 ? mat.gold() : mat.stone('#d8d0bf'));
    s.ell(x, y, base + 0.35, 0.03, 0.03, 0.035, L >= 4 ? mat.gold() : mat.stone('#d8d0bf'));
  }
  if (L >= 3) for (let k = 0; k < 4; k++) { const x = -0.42 + k * 0.28; s.cyl(x, 0.86, 0.035, base, base + 0.5, mat.plaster('#f4efe4', base, base + 0.5)); }
  if (L >= 3) s.box(-0.47, 0.82, base + 0.5, 0.47, 0.9, base + 0.56, mat.plaster('#efe7d6', base, base + 1));
  if (L >= 4) for (const x of [-0.86, 0.86]) {
    s.box(x - 0.05, -0.05, base, x + 0.05, 0.05, base + 0.9, mat.stone('#e2cc96'));
    s.hip(x - 0.05, -0.05, x + 0.05, 0.05, base + 0.9, 0.12, mat.gold(), 0);
  }
  if (L >= 5) for (const [x, y] of [[-0.62, 0.88], [0.62, 0.88]]) {
    s.cyl(x, y, 0.03, base, base + 0.3, mat.metal('#3a3c40'));
    s.cyl(x, y, 0.07, base + 0.3, base + 0.36, mat.gold());
    s.ell(x, y, base + 0.42, 0.05, 0.05, 0.08, mat.plain('#ff9d2e', true));
  }
  return A;
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
  const top = roof(s, st, -0.44, -0.44, 0.32, 0.32, kz + (big ? 0.8 : 0.6), 0.5, 'x', { level: Math.max(3, L), roof: 'hip', roofC: L >= 5 ? '#2f5d9e' : null });
  for (const [x, y] of [[-R + 0.12, R - 0.12], [R - 0.12, R - 0.12], [R - 0.12, -R + 0.12], [-R + 0.12, -R + 0.12]]) {
    s.cyl(x, y, 0.15, 0, kz + 0.35, stoneM);
    s.cone(x, y, 0.19, kz + 0.35, kz + 0.85, L >= 5 ? mat.slate('#2f5d9e') : mat.slate('#5c6370'));
    if (L >= 5) s.ell(x, y, kz + 0.88, 0.03, 0.03, 0.04, mat.gold());
  }
  s.win('y', R - 0.08, -0.14, 0.14, 0.1, 0.5, mat.door('#5a3a1e'));
  for (const a of [-0.5, 0.35]) window2(s, 'y', R - 0.08, a, 0.5, 0.08, 0.16);
  for (const a of [-0.4, 0.3]) window2(s, 'x', R - 0.08, a, 0.5, 0.08, 0.16);
  window2(s, 'y', 0.3, -0.2, kz + 0.25, 0.1, 0.18); window2(s, 'x', 0.3, -0.1, kz + 0.25, 0.1, 0.18);
  if (L >= 5) {
    band(s, -R + 0.08, -R + 0.08, R - 0.08, R - 0.08, kz - 0.06, 0.04, '#d4a017');
    for (const a of [-0.45, 0.32]) bannerCloth(s, a, R - 0.02, 0.35, 0.34, st.trim || '#7a2b2b');
    goldVane(s, -0.06, -0.06, top);
  }
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
    s.gable(-W - 0.07, -D - 0.07, W + 0.07, D + 0.07, z + ch + 0.1, 0.32, 'y', mat.tiles(L >= 5 ? '#c99a3a' : st.roofC, mat.plaster('#efe7d6', z, z + 2)), 0.05);
    s.win('y', D - 0.16, -0.12, 0.12, z, z + 0.48, mat.door('#6b4224'));
    if (L >= 5) { // Kroon: verguld dak, gouden kapitelen en een gouden beeldengroep op de nok
      for (let x = -W; x <= W + 0.001; x += (2 * W) / 6) for (const y of [-D, D]) s.box(x - 0.065, y - 0.065, z + ch - 0.05, x + 0.065, y + 0.065, z + ch, mat.gold());
      for (let y = -D + (2 * D) / 4; y < D - 0.01; y += (2 * D) / 4) for (const x of [-W, W]) s.box(x - 0.065, y - 0.065, z + ch - 0.05, x + 0.065, y + 0.065, z + ch, mat.gold());
      const rz = z + ch + 0.42;
      s.box(-0.1, -0.06, rz - 0.06, 0.1, 0.06, rz + 0.04, mat.stone('#e6dfcf'));
      s.cap([0, 0, rz + 0.04], [0, 0, rz + 0.24], 0.04, mat.gold()); s.ell(0, 0, rz + 0.28, 0.035, 0.035, 0.04, mat.gold());
      s.cap([0.05, 0.02, rz + 0.18], [0.06, 0.03, rz + 0.42], 0.008, mat.gold());
      s.ell(-0.05, 0.03, rz + 0.12, 0.012, 0.05, 0.06, mat.gold());
      for (const y of [-D - 0.07, D + 0.07]) for (const x of [-W - 0.04, W + 0.04]) s.ell(x, y, z + ch + 0.16, 0.035, 0.035, 0.06, mat.gold());
    }
    if (L >= 4) { // Gilden: een gekleurde fries onder de kroonlijst en beelden op de nok
      band(s, -W - 0.07, -D - 0.07, W + 0.07, D + 0.07, z + ch + 0.005, 0.035, L >= 5 ? '#d4a017' : '#b0392b');
      for (const x of [-W, W]) { s.ell(x, 0, z + ch + 0.46, 0.05, 0.05, 0.08, L >= 5 ? mat.gold() : mat.stone('#efe7d6')); s.ell(x, 0, z + ch + 0.57, 0.03, 0.03, 0.035, L >= 5 ? mat.gold() : mat.stone('#efe7d6')); }
    }
    if (L >= 5) { // Kroon: gouden beelden en vuurschalen voor de trap, een gouden rand op het fronton
      for (const x of [-0.45, 0.45]) { s.box(x - 0.07, D + 0.16, 0, x + 0.07, D + 0.3, 0.22, mat.stone('#e6dfcf')); s.ell(x, D + 0.23, 0.3, 0.05, 0.05, 0.09, mat.gold()); s.ell(x, D + 0.23, 0.41, 0.03, 0.03, 0.03, mat.gold()); }
      for (const x of [-0.82, 0.82]) { s.cyl(x, D + 0.22, 0.03, 0, 0.36, mat.metal('#3a3c40')); s.cyl(x, D + 0.22, 0.08, 0.36, 0.42, mat.gold()); s.ell(x, D + 0.22, 0.48, 0.06, 0.06, 0.09, mat.plain('#ff9d2e', true)); }
      band(s, -W - 0.07, -D - 0.07, W + 0.07, D + 0.07, z + ch + 0.08, 0.025, '#d4a017');
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
    if (L >= 5) { // Kroon: gouden vissen op de nok, een rode torii-poort en stenen lantaarns vooraan
      for (const x of [-0.3, 0.3]) s.ell(x, 0, top - 0.05, 0.035, 0.03, 0.05, mat.gold());
      for (const x of [-0.3, 0.3]) s.cyl(x, 0.95, 0.03, 0, 0.55, mat.plain('#b8322a'));
      s.box(-0.42, 0.92, 0.5, 0.42, 0.98, 0.56, mat.plain('#b8322a'));
      s.box(-0.36, 0.93, 0.42, 0.36, 0.97, 0.46, mat.plain('#8a2620'));
      for (const x of [-0.62, 0.62]) { s.box(x - 0.04, 0.9, 0, x + 0.04, 0.98, 0.2, mat.stone('#9a958b')); s.box(x - 0.06, 0.88, 0.2, x + 0.06, 1.0, 0.27, mat.stone('#a29d93')); s.hip(x - 0.07, 0.87, x + 0.07, 1.01, 0.27, 0.06, mat.stone('#8f8a80'), 0); }
    }
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
    if (L >= 4) for (const x of [-0.3, 0.3]) { // leeuwen naast de trap (Kroon: van goud), vaandels op de hoeken
      s.box(x - 0.08, 0.84, 0, x + 0.08, 0.98, 0.1, mat.brick('#b88d58'));
      const lm = L >= 5 ? mat.gold() : mat.stone('#d8c08a');
      s.ell(x, 0.91, 0.17, 0.07, 0.05, 0.06, lm); s.ell(x, 0.95, 0.24, 0.04, 0.04, 0.045, lm);
    }
    if (L >= 5) for (const [x, y] of [[-0.9, 0.9], [0.9, 0.9], [0.9, -0.9]]) bannerCloth(s, x, y, 0.4, 0.34, st.trim || '#2c5fae');
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
    if (L >= 4) { // Gilden: twee koepels vooraan op het dak en een band van gekleurde tegels rond het paleis
      for (const x of [-0.5, 0.5]) {
        s.cyl(x, 0.28, 0.19, z + 0.6, z + 0.72, mat.plaster(st.plaster, z, z + 2));
        s.ell(x, 0.28, z + 0.72, 0.19, 0.19, 0.22, mat.glaze(st.roofC, x, 0.28), z + 0.72);
        s.ell(x, 0.28, z + 0.95, 0.025, 0.025, 0.03, L >= 5 ? mat.gold() : mat.glaze(st.roofC, x, 0.28));
      }
      band(s, -0.7, -0.7, 0.7, 0.55, z + 0.3, 0.05, st.trim2 || '#d4a017');
    }
    if (L >= 5) { // Kroon: een lange vijver in de tuin voor de iwan, gouden banden en vaandels
      s.box(-0.14, 0.76, 0.0, 0.14, 0.98, 0.03, mat.stone('#c4ad86'));
      s.box(-0.11, 0.78, 0.02, 0.11, 0.96, 0.035, mat.plain('#3d7fae', true));
      band(s, -0.7, -0.7, 0.7, 0.55, z + 0.5, 0.035, '#d4a017');
      for (const x of [-0.45, 0.45]) bannerCloth(s, x, 0.74, 0.4, 0.36, st.trim || '#1f9a9a');
    }
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

// Molen: 1 houten standerdmolen (een houten kast op een bok met schoren en een trapje); 2 ronde romp op een stenen voet
// met een pannenkap; 3 hoger, met een houten stelling (omloop) rondom en een leien kap; 4 een maalderij-aanbouw vooraan
// links, een kar met zakken en volle zeilen; 5 gestreepte zeilen, gouden kapband en windwijzer, lantaarns en een vaandel.
function mill(s, st, L) {
  const br = mat.wood('#6b4523');
  const sails = (hx, cy, hz, len, sw, sail) => {
    s.hcyl('x', cy, hz, 0.028, hx - 0.06, hx + 0.03, mat.wood('#5a3a1e'));
    s.box(hx + 0.02, cy - 0.016, hz - len, hx + 0.036, cy + 0.016, hz + len, br);
    s.box(hx + 0.02, cy - len, hz - 0.016, hx + 0.036, cy + len, hz + 0.016, br);
    s.box(hx + 0.024, cy + 0.016, hz + 0.08, hx + 0.03, cy + 0.016 + sw, hz + len - 0.02, sail);
    s.box(hx + 0.024, cy - 0.016 - sw, hz - len + 0.02, hx + 0.03, cy - 0.016, hz - 0.08, sail);
    s.box(hx + 0.024, cy + 0.08, hz - 0.016 - sw, hx + 0.03, cy + len - 0.02, hz - 0.016, sail);
    s.box(hx + 0.024, cy - len + 0.02, hz + 0.016, hx + 0.03, cy - 0.08, hz + 0.016 + sw, sail);
    s.ell(hx + 0.04, cy, hz, 0.03, 0.03, 0.03, mat.metal('#4d4f54'));
  };
  if (L <= 1) { // standerdmolen
    const cy = -0.04; const z0 = 0.36; const z1 = 0.8;
    s.box(-0.3, cy - 0.025, 0, 0.3, cy + 0.025, 0.05, mat.wood('#5a3a1e'));
    s.box(-0.025, cy - 0.3, 0, 0.025, cy + 0.3, 0.05, mat.wood('#5a3a1e'));
    s.cyl(0, cy, 0.04, 0, z0, mat.logs('#7f5530'));
    for (const [dx, dy] of [[0.27, 0], [-0.27, 0], [0, 0.27], [0, -0.27]]) s.cap([dx, cy + dy, 0.05], [dx * 0.12, cy + dy * 0.12, z0 - 0.08], 0.015, br);
    s.box(-0.16, cy - 0.14, z0, 0.16, cy + 0.14, z1, mat.wood('#9a6a3a'));
    const bat = mat.wood('#6b4523');
    for (const a of [-0.1, 0, 0.1]) { s.box(a - 0.007, cy + 0.138, z0, a + 0.007, cy + 0.146, z1, bat); s.box(0.158, cy + a - 0.007, z0, 0.166, cy + a + 0.007, z1, bat); }
    s.gable(-0.18, cy - 0.16, 0.18, cy + 0.16, z1, 0.17, 'x', mat.thatch(mat.wood('#7a5a34')), 0.03);
    s.win('y', cy + 0.14, -0.13, -0.04, z0 + 0.02, z0 + 0.24, mat.door('#5a3a1e'));
    for (const x of [-0.13, -0.04]) s.cap([x, cy + 0.42, 0], [x, cy + 0.15, z0], 0.01, br); // trapje naar de deur
    for (let k = 1; k < 5; k++) { const f = k / 5; s.hcyl('x', cy + 0.42 - 0.27 * f, z0 * f, 0.008, -0.13, -0.04, mat.wood('#8a5f33')); }
    sails(0.17, cy, z1 - 0.07, 0.36, 0.08, mat.cloth('#e4d6b4'));
    sacks(s, 0.28, 0.3);
    return {};
  }
  const cy = -0.06; const r = 0.19 + L * 0.012; const h = 0.72 + L * 0.1; const sb = 0.36;
  s.cyl(0, cy, r + 0.05, 0, 0.08, mat.stone(st.base));
  s.cyl(0, cy, r + 0.014, 0.08, sb, towerM(st));
  s.cyl(0, cy, r, sb, h, L === 2 && st.wall === 'timber' ? mat.plaster(st.plaster, sb, h) : roundM(st, sb, h));
  let top;
  if (st.roof === 'gable' || st.roof === 'greek') {
    s.cone(0, cy, r + 0.06, h, h + 0.34, st.roof === 'greek' || L === 2 ? mat.tiles(st.roofC || '#9a4630') : mat.slate('#5c6370'));
    top = h + 0.34;
  } else top = turretTop(s, st, 0, cy, r + 0.02, h, 0.34);
  door(s, 'y', cy + r + 0.01, -0.06, 0.06, 0.08, 0.3, st);
  window2(s, 'y', cy + r, -0.04, h - 0.3, 0.08, 0.12);
  if (L >= 3) { // houten stelling rondom met schoren en een leuning
    const R = r + 0.11;
    s.cyl(0, cy, R, sb, sb + 0.03, mat.wood('#7a5129'));
    s.cyl(0, cy, R, sb + 0.13, sb + 0.15, mat.wood('#8a5f33'));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; s.box(Math.cos(a) * (R - 0.01) - 0.008, cy + Math.sin(a) * (R - 0.01) - 0.008, sb + 0.03, Math.cos(a) * (R - 0.01) + 0.008, cy + Math.sin(a) * (R - 0.01) + 0.008, sb + 0.13, br); }
    for (const a of [0.3, 1.25]) s.cap([Math.cos(a) * r, cy + Math.sin(a) * r, sb - 0.2], [Math.cos(a) * (R - 0.02), cy + Math.sin(a) * (R - 0.02), sb], 0.012, br);
    window2(s, 'y', cy + r, 0.02, sb + 0.04, 0.07, 0.11);
  }
  const hz = h - 0.04; const len = 0.4 + L * 0.025;
  const sail = L >= 5 ? mat.cloth('#f2ead6', '#a8322a') : mat.cloth(L >= 3 ? '#f2ead6' : '#e4d6b4');
  sails(r + 0.05, cy, hz, len, L >= 4 ? 0.14 : 0.11, sail);
  sacks(s, -0.3, 0.3);
  if (L >= 4) { // maalderij en een kar met zakken
    s.box(-0.42, 0.14, 0, -0.2, 0.42, 0.04, mat.stone(st.base));
    walls(s, st, -0.41, 0.15, -0.21, 0.41, 0.04, 0.24);
    roof(s, st, -0.43, 0.13, -0.19, 0.43, 0.24, 0.13, 'y', { level: L });
    s.win('x', -0.21, 0.22, 0.32, 0.04, 0.2, mat.door('#5a3a1e'));
    s.box(0.18, 0.26, 0.07, 0.42, 0.4, 0.12, mat.wood('#8a5f33'));
    for (const y of [0.25, 0.41]) s.hcyl('y', 0.3, 0.07, 0.065, y - 0.008, y + 0.008, mat.wood('#5a3a1e'));
    s.cap([0.18, 0.33, 0.1], [0.06, 0.33, 0.06], 0.01, br);
    for (const [dx, dz] of [[0.23, 0], [0.31, 0], [0.37, 0], [0.27, 0.06], [0.34, 0.06]]) s.ell(dx, 0.33, 0.165 + dz, 0.04, 0.05, 0.045, mat.plain('#cdb88c'));
  }
  if (L >= 5) {
    s.cyl(0, cy, r + 0.012, h - 0.075, h - 0.045, mat.gold());
    goldVane(s, 0, cy, top - 0.03, 0.18);
    s.box(-0.065, cy + r + 0.11, sb - 0.26, 0.065, cy + r + 0.118, sb + 0.13, mat.cloth(st.trim || '#7a2b2b'));
    lampPost(s, 0.08, 0.4, 0.32); lampPost(s, 0.42, -0.36, 0.32);
  }
  return {};
}

// Boerderij: omgeploegde akker met ruggen, jonge plantjes (niveau 1) of rijp graan, een hek rondom,
// een vogelverschrikker (niveau 1), hooibalen (vanaf 2) en een molentje met draaiende wieken (vanaf 3, wieken apart getekend).
function farm(s, st, L) {
  const soil = { k: 'dirt', c: rgb('#6a4a2c') }; const ridge = { k: 'dirt', c: rgb('#84603c') };
  s.box(-0.47, -0.47, 0, 0.47, 0.47, 0.012, soil);
  const rows = 6;
  const free = (i, k) => (L >= 3 && i <= 1 && k === 0) || (L >= 2 && i >= 4 && k === 0) || (L >= 4 && i <= 1 && k === 1);
  for (let i = 0; i < rows; i++) {
    const y = -0.4 + (i + 0.5) * (0.8 / rows);
    s.box(-0.43, y - 0.038, 0.012, 0.43, y + 0.038, 0.032, ridge);
    if (L === 1) {
      for (let k = 0; k < 9; k++) {
        const x = -0.38 + k * 0.095 + ((i * 3 + k) % 3) * 0.006;
        if (Math.abs(x - 0.05) < 0.05 && Math.abs(y - 0.05) < 0.07) continue; // plaats voor de vogelverschrikker
        s.ell(x, y, 0.05, 0.032, 0.03, 0.028, { k: 'leaf', c: rgb((i + k) % 2 ? '#6fad40' : '#5a9634') });
      }
    } else {
      // rijp graan: doorlopende ruggen met een bolle top (in twee stukken, iets verschillend van hoogte)
      const wheat = { k: 'hay', c: rgb(L >= 4 ? '#e2bb4c' : '#d8b252') };
      const xa = free(i, 0) ? -0.2 : -0.42;
      for (const [a, b, k] of [[xa, 0.0, 0], [0.0, 0.42, 1]]) {
        const hh = 0.05 + ((i * 7 + k * 3) % 4) * 0.008;
        s.box(a + 0.004, y - 0.03, 0.03, b - 0.004, y + 0.03, 0.03 + hh, wheat);
        s.gable(a + 0.004, y - 0.033, b - 0.004, y + 0.033, 0.03 + hh, 0.035, 'x', wheat, 0);
      }
    }
  }
  // hek rondom: paaltjes en twee latten
  const post = mat.wood('#6b4a2a'); const rail = mat.wood('#80592f');
  for (let i = 0; i <= 6; i++) {
    const t = -0.47 + (i / 6) * 0.94;
    for (const [x, y] of [[t, 0.47], [0.47, t], [t, -0.47], [-0.47, t]]) s.box(x - 0.011, y - 0.011, 0, x + 0.011, y + 0.011, 0.12, post);
  }
  for (const z of [0.045, 0.095]) {
    s.box(-0.47, 0.464, z, 0.47, 0.476, z + 0.013, rail); s.box(0.464, -0.47, z, 0.476, 0.47, z + 0.013, rail);
    s.box(-0.47, -0.476, z, 0.47, -0.464, z + 0.013, rail); s.box(-0.476, -0.47, z, -0.464, 0.47, z + 0.013, rail);
  }
  const anchors = {};
  if (L === 1) {
    // vogelverschrikker
    const x = 0.05; const y = 0.05;
    s.box(x - 0.01, y - 0.01, 0, x + 0.01, y + 0.01, 0.4, mat.wood('#5a3a1e'));
    s.box(x - 0.008, y - 0.13, 0.29, x + 0.008, y + 0.13, 0.305, mat.wood('#5a3a1e'));
    s.box(x - 0.035, y - 0.06, 0.2, x + 0.035, y + 0.06, 0.31, mat.cloth('#b0392b', '#8a2a20'));
    s.ell(x, y, 0.35, 0.04, 0.04, 0.045, mat.hay());
    s.cone(x, y, 0.07, 0.38, 0.45, mat.thatch());
  }
  if (L >= 2) {
    // ronde hooibalen
    s.hcyl('x', 0.3, 0.06, 0.06, -0.42, -0.3, mat.hay());
    s.hcyl('x', 0.38, 0.06, 0.06, -0.4, -0.28, mat.hay());
    if (L >= 4) s.hcyl('x', 0.34, 0.17, 0.06, -0.41, -0.29, mat.hay());
  }
  if (L >= 3) {
    // molentje in de hoek; de wieken tekent het spel (ze draaien)
    s.box(-0.44, -0.44, 0, -0.2, -0.2, 0.05, mat.stone('#a39b8c'));
    s.box(-0.42, -0.42, 0.05, -0.22, -0.22, 0.36, mat.plaster(st.plaster || '#e9dcbc', 0.05, 0.36, { timber: true }));
    s.hip(-0.45, -0.45, -0.19, -0.19, 0.36, 0.2, mat.thatch(mat.wood('#7a5a34')), 0.03);
    s.win('y', -0.22, -0.35, -0.29, 0.05, 0.2, mat.door('#6b4224'));
    s.hcyl('x', -0.32, 0.3, 0.018, -0.23, -0.19, mat.wood('#5a3a1e'));
    anchors.blades = [-0.19, -0.32, 0.3];
    if (L >= 5) { s.cyl(-0.32, -0.32, 0.006, 0.56, 0.68, mat.metal('#3a3c40')); s.box(-0.36, -0.324, 0.65, -0.28, -0.316, 0.67, mat.gold()); }
  }
  if (L >= 4) { // schuur (4) of stenen graanschuur met leien en een windwijzer (5)
    const bx0 = 0.04; const bx1 = 0.43; const by0 = -0.43; const by1 = -0.16; const bh = L >= 5 ? 0.4 : 0.32;
    if (L >= 5) walls(s, st, bx0, by0, bx1, by1, 0.012, bh, { wall: st.wall === 'timber' ? 'stone' : st.wall });
    else s.box(bx0, by0, 0.012, bx1, by1, bh, mat.wood('#8a5a30'));
    const rt = roof(s, st, bx0 - 0.02, by0 - 0.02, bx1 + 0.02, by1 + 0.02, bh, 0.2, 'x', { level: L >= 5 ? 3 : 2 });
    s.win('y', by1, 0.16, 0.3, 0.012, 0.26, mat.door('#5a3a1e'));
    if (L >= 5) { goldVane(s, 0.235, -0.295, rt); for (const [x, y] of [[0.47, 0.47], [-0.47, 0.47]]) lampPost(s, x, y, 0.3); }
  }
  return anchors;
}

// Academie: zaal met zuilengang; niveau 2 een toren, niveau 3 een sterrenwacht. v = afgewerkte soorten onderzoek
// (bit 1 voetvolk: schildenrek, 2 schutters: schietschijf met vuurpijl, 4 ruiterij: harnas op een paal, 8 stad: pekketel)
function academy(s, st, L, civ, v = 0) {
  const x0 = -0.4; const x1 = 0.22; const y0 = -0.38; const y1 = 0.1; const h = 0.6 + L * 0.06;
  s.box(x0 - 0.02, y0 - 0.02, 0, x1 + 0.02, y1 + 0.22, 0.1, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.1, h);
  const top = roof(s, st, x0, y0, x1, y1, h, 0.32, 'x', { level: Math.max(3, L) });
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

// Gildehuis: hoog koopmanshuis met een trapgevel; 2 een pakhuisje ernaast; 3 een erker met een eigen dakje;
// 4 een klokkentorentje; 5 gouden sierstukken op de gevel en vaandels.
function guild(s, st, L) {
  const x0 = -0.32; const x1 = 0.3; const y0 = -0.36; const y1 = 0.2; const h = 0.82 + L * 0.08;
  s.box(x0 - 0.03, y0 - 0.03, 0, x1 + 0.03, y1 + 0.03, 0.1, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.1, h, st.wall === 'timber' ? (L <= 1 ? { wall: 'timber' } : { wall: 'stone', c: '#b9a07a' }) : { wall: st.wall });
  let top = h + 0.42;
  if (st.roof === 'gable' || st.roof === 'greek' || st.roof === 'flat' || st.roof === 'crenel') {
    s.gable(x0, y0, x1, y1, h, 0.42, 'y', L <= 1 ? mat.thatch(mat.wood('#7a5a34')) : mat.tiles(st.roofC || '#9a4630'), 0.03);
    const m = st.wall === 'brick' ? mat.brick(st.stone) : mat.stone(st.roof === 'flat' ? '#d8bf8a' : '#c9b48e');
    for (let k = 0; k < (L >= 2 ? 4 : 0); k++) { // trapgevel vanaf niveau 2
      const w = (x1 - x0) / 2 - k * 0.075;
      s.box(-0.01 - w, y1 - 0.02, h + k * 0.1, -0.01 + w, y1 + 0.03, h + (k + 1) * 0.1, m);
      if (L >= 5) for (const sx of [-1, 1]) s.ell(-0.01 + sx * w, y1 + 0.005, h + (k + 1) * 0.1 + 0.02, 0.018, 0.018, 0.022, mat.gold());
    }
  } else top = roof(s, st, x0, y0, x1, y1, h, 0.42, 'y', { level: L });
  for (const a of [-0.26, -0.06, 0.14]) s.win('y', y1, a, a + 0.12, 0.1, 0.34, mat.plain('#2a2018'));
  for (let z = 0.45; z + 0.18 < h; z += 0.24) for (const a of [-0.24, -0.02, 0.18]) window2(s, 'y', y1, a, z, 0.08, 0.15);
  for (let z = 0.45; z + 0.18 < h; z += 0.24) window2(s, 'x', x1, -0.12, z, 0.1, 0.15);
  if (st.trim) band(s, x0, y0, x1, y1, h - 0.06, 0.03, st.trim);
  s.box(-0.04, y1, h + 0.12, 0.02, y1 + 0.14, h + 0.16, mat.wood('#5a3a1e'));
  s.cap([-0.01, y1 + 0.13, h + 0.12], [-0.01, y1 + 0.13, 0.36], 0.004, mat.plain('#cdbb92'));
  s.box(-0.05, y1 + 0.1, 0.28, 0.03, y1 + 0.18, 0.36, mat.cloth('#b0854a'));
  s.box(x1, y1 - 0.06, 0.62, x1 + 0.1, y1 - 0.05, 0.64, mat.metal('#3a3c40'));
  s.hcyl('x', y1 - 0.055, 0.56, 0.05, x1 + 0.07, x1 + 0.08, mat.gold());
  barrel(s, -0.4, 0.3);
  if (L >= 2) { // pakhuisje aan de zijkant met balen
    walls(s, st, x1 + 0.02, y0 + 0.04, 0.46, y0 + 0.3, 0.0, 0.36, { wall: st.wall === 'timber' ? 'timber' : st.wall });
    roof(s, st, x1, y0 + 0.02, 0.48, y0 + 0.32, 0.36, 0.14, 'x', { level: 2 });
    for (const [x, y] of [[0.38, 0.0], [0.4, 0.12]]) s.box(x - 0.05, y - 0.04, 0, x + 0.05, y + 0.04, 0.09, mat.cloth('#a8743f'));
    crate(s, 0.3, 0.36, 0.05);
  }
  if (L >= 3) { // erker op de verdieping en een overdekte galerij voor de deur
    s.box(-0.12, y1, 0.5, 0.1, y1 + 0.09, 0.72, mat.wood('#6b4523'));
    window2(s, 'y', y1 + 0.09, -0.08, 0.54, 0.14, 0.14);
    s.hip(-0.14, y1 - 0.01, 0.12, y1 + 0.11, 0.72, 0.08, mat.slate('#5c6370'), 0.01);
    for (const x of [x0 + 0.02, -0.14, 0.08, x1 - 0.02]) s.cyl(x, y1 + 0.16, 0.022, 0.1, 0.38, mat.plaster('#f1ebde', 0.1, 0.38));
    s.box(x0, y1 + 0.13, 0.36, x1, y1 + 0.19, 0.39, mat.wood('#5a3a1e'));
    s.hip(x0 - 0.02, y1 - 0.02, x1 + 0.02, y1 + 0.21, 0.39, 0.07, mat.tiles(st.roofC || '#9a4630'), 0.01);
  }
  let flag = flagPole(s, x0 + 0.05, y0 + 0.05, h + 0.3, 0.3);
  if (L >= 4) { // klokkentorentje achteraan
    const tx = x0 + 0.1; const ty = y0 + 0.1;
    walls(s, st, tx - 0.08, ty - 0.08, tx + 0.08, ty + 0.08, h - 0.1, top + 0.15, { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#b9a07a' : null });
    s.hcyl('y', tx, top + 0.02, 0.045, ty + 0.078, ty + 0.085, mat.plain('#f4efe0'));
    const tt = turretTop(s, st, tx, ty, 0.09, top + 0.15, 0.24);
    if (L >= 5) goldVane(s, tx, ty, tt); else flag = flagPole(s, tx, ty, tt, 0.22);
  }
  if (L >= 5) { bannerCloth(s, x0 - 0.06, y1 + 0.1, 0.3, 0.28, st.trim || '#7a2b2b'); bannerCloth(s, x1 + 0.1, y1 + 0.12, 0.3, 0.28, st.trim2 || st.trim || '#2c5fae'); }
  return { flag };
}

// Bouwloods: 1 open loods met een kraan; 2 een opslag van steenblokken en een tweede, kleinere kraan; 3 een gesloten
// werkplaats met pannen, een vaandel en een gouden piek op de kraan.
function lodge(s, st, L) {
  const x0 = -0.42; const x1 = 0.06; const y0 = -0.42; const y1 = 0.02; const h = 0.42 + L * 0.06;
  if (L >= 3) {
    walls(s, st, x0, y0, x1, y1, 0.04, h, { wall: st.wall === 'timber' ? 'timber' : st.wall });
    s.box(x0 - 0.02, y0 - 0.02, 0, x1 + 0.02, y1 + 0.02, 0.04, mat.stone(st.base));
    door(s, 'y', y1, -0.3, -0.12, 0.04, 0.32, st);
    window2(s, 'x', x1, -0.3, 0.2, 0.1, 0.12);
  } else {
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) s.box(x - 0.022, y - 0.022, 0, x + 0.022, y + 0.022, h, mat.wood('#6b4523'));
    s.box(x0, y0 - 0.02, 0, x1, y0 + 0.01, h * 0.75, mat.wood('#7a5129'));
    logPile(s, -0.18, -0.18, 3);
  }
  roof(s, st, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, h, 0.24, 'x', { level: L + 1, roof: st.roof === 'pagoda' ? 'pagoda' : st.roof === 'gable' || st.roof === 'greek' ? st.roof : 'flat' });
  // kraan
  const cx = 0.26; const cy = -0.2; const ch = 0.9 + L * 0.14;
  s.box(cx - 0.03, cy - 0.03, 0, cx + 0.03, cy + 0.03, ch, mat.wood('#5a3a1e'));
  for (const [dx, dy] of [[-0.12, 0], [0.12, 0], [0, -0.12], [0, 0.12]]) s.cap([cx + dx, cy + dy, 0], [cx, cy, 0.32], 0.012, mat.wood('#6b4523'));
  s.cap([cx, cy, ch - 0.04], [cx - 0.04, cy + 0.52, ch + 0.14], 0.018, mat.wood('#6b4523'));
  s.cap([cx, cy, ch + 0.02], [cx - 0.04, cy + 0.52, ch + 0.14], 0.004, mat.plain('#cdbb92'));
  s.cap([cx - 0.04, cy + 0.5, ch + 0.12], [cx - 0.04, cy + 0.5, 0.42], 0.004, mat.plain('#cdbb92'));
  s.box(cx - 0.1, cy + 0.42, 0.3, cx + 0.02, cy + 0.56, 0.42, mat.stone('#d3cbb8'));
  s.hcyl('y', cx - 0.08, 0.14, 0.12, cy - 0.06, cy - 0.02, mat.wood('#7a5129'));
  blocks(s, 0.3, 0.26, L >= 2 ? 6 : 3);
  if (L >= 2) { // steenblokken en een kleine kraan
    blocks(s, -0.3, 0.3, 6, '#cfc6b2'); blocks(s, -0.08, 0.36, 4);
    hoist(s, -0.44, 0.1, 0.6);
    planks(s, -0.2, 0.18, 3);
  }
  if (L >= 3) {
    goldVane(s, cx, cy, ch + 0.02);
    bannerCloth(s, x1 + 0.08, y1 + 0.08, 0.24, 0.24, st.trim || '#7a2b2b');
    return { flag: flagPole(s, x0 + 0.06, y0 + 0.06, h + 0.25, 0.3) };
  }
  return {};
}

// Adelshof: 1 herenhuis met een pannendak, één hoektoren en een wapenschild; 2 leien dak, een tweede hoektoren,
// gouden kroonlijst en een ommuurd, geplaveid voorplein met een hek; 3 een poortgebouw met wapen boven het hek,
// hogere torens met gouden windwijzers, lantaarns op het plein en gouden bollen op het dak.
function court(s, st, L) {
  const x0 = -0.36; const x1 = 0.28; const y0 = -0.34; const y1 = 0.2; const h = 0.78 + L * 0.08;
  const wo = st.wall === 'timber' ? (L >= 2 ? { wall: 'stone', c: '#c9c0ac' } : { wall: 'timber' }) : { wall: st.wall };
  s.box(x0 - 0.04, y0 - 0.04, 0, x1 + 0.04, y1 + 0.04, 0.12, mat.stone(st.stone));
  walls(s, st, x0, y0, x1, y1, 0.12, h, wo);
  const top = roof(s, st, x0, y0, x1, y1, h, 0.46, 'x', { level: L + 1, roof: st.roof === 'gable' ? 'hip' : st.roof, roofC: L >= 2 ? '#3f4a5c' : undefined });
  if (st.trim) band(s, x0, y0, x1, y1, h - 0.07, 0.035, st.trim);
  if (L >= 2) band(s, x0, y0, x1, y1, h - 0.025, 0.018, '#d4a017');
  // hoektorens vooraan (één op niveau 1)
  const tr = 0.09 + L * 0.01; const th = h + 0.22 + L * 0.06;
  for (const [x, y] of L >= 2 ? [[x1, y1], [x0 + 0.02, y1]] : [[x1, y1]]) {
    s.cyl(x, y, tr, 0, th, roundM(st, 0, th));
    const tt = turretTop(s, st, x, y, tr, th, 0.36);
    window2(s, 'y', y + tr - 0.01, x - 0.03, th - 0.24, 0.06, 0.1);
    if (L >= 3) goldVane(s, x, y, tt - 0.02, 0.14);
  }
  // deur met wapenschild
  s.win('y', y1, -0.12, 0.06, 0.12, 0.44, mat.door('#4a2e18'));
  s.ell(-0.03, y1 + 0.01, 0.56, 0.06, 0.012, 0.07, mat.plain(st.trim || '#2c5fae'));
  s.ell(-0.03, y1 + 0.016, 0.56, 0.03, 0.01, 0.035, mat.gold());
  for (const a of [-0.3, 0.12]) { window2(s, 'y', y1, a, 0.3, 0.08, 0.15); window2(s, 'y', y1, a, 0.56, 0.08, 0.15); }
  window2(s, 'x', x1, -0.22, 0.5, 0.09, 0.15); window2(s, 'x', x1, -0.02, 0.5, 0.09, 0.15);
  bannerCloth(s, x1 + 0.12, y1 + 0.1, 0.3, 0.28, st.trim || '#7a2b2b');
  if (L >= 2) { // ommuurd voorplein met een hek recht voor de deur
    const wy = 0.43; const wh = 0.17; const wm = st.wall === 'brick' ? mat.brick(st.stone) : mat.stone(st.wall === 'timber' ? '#bdb5a3' : st.stone);
    const cp = mat.stone(st.base);
    s.box(x0, y1 + 0.04, 0, 0.42, wy - 0.03, 0.012, mat.stone(tint(st.base, 0.12)));
    for (const [a0, a1] of [[x0 - 0.05, -0.15], [0.09, 0.46]]) { s.box(a0, wy - 0.03, 0, a1, wy + 0.03, wh, wm); s.box(a0 - 0.008, wy - 0.038, wh, a1 + 0.008, wy + 0.038, wh + 0.025, cp); }
    s.box(0.4, -0.02, 0, 0.46, wy, wh, wm); s.box(0.392, -0.028, wh, 0.468, wy, wh + 0.025, cp);
    s.box(x0 - 0.05, y1 + 0.06, 0, x0 + 0.01, wy, wh, wm); s.box(x0 - 0.058, y1 + 0.06, wh, x0 + 0.018, wy, wh + 0.025, cp);
    for (const x of [-0.175, 0.065]) { s.box(x, wy - 0.045, 0, x + 0.05, wy + 0.045, wh + 0.1, wm); s.ell(x + 0.025, wy, wh + 0.13, 0.028, 0.028, 0.028, L >= 3 ? mat.gold() : cp); }
    bannerCloth(s, x0 + 0.06, y1 + 0.12, 0.3, 0.28, st.trim2 || st.trim || '#7a2b2b');
  }
  if (L >= 3) { // poortgebouw met wapen boven het hek, lantaarns op het plein
    const wy = 0.43; const wm = st.wall === 'brick' ? mat.brick(st.stone) : mat.stone(st.wall === 'timber' ? '#bdb5a3' : st.stone);
    s.box(-0.2, wy - 0.06, 0.27, 0.14, wy + 0.06, 0.42, wm);
    s.box(-0.215, wy - 0.07, 0.4, 0.155, wy + 0.07, 0.43, mat.gold());
    roof(s, st, -0.22, wy - 0.08, 0.16, wy + 0.08, 0.43, 0.14, 'x', { level: Math.max(3, L), roof: st.roof === 'gable' ? 'gable' : st.roof, roofC: '#3f4a5c' });
    s.ell(-0.03, wy + 0.065, 0.345, 0.04, 0.01, 0.05, mat.plain(st.trim || '#2c5fae'));
    s.ell(-0.03, wy + 0.072, 0.345, 0.02, 0.008, 0.025, mat.gold());
    lampPost(s, -0.22, 0.34, 0.3); lampPost(s, 0.17, 0.34, 0.3);
    for (const x of [x0 + 0.1, x1 - 0.1]) s.ell(x, -0.07, top - 0.02, 0.025, 0.025, 0.03, mat.gold());
  }
  return { flag: flagPole(s, -0.04, -0.07, top - 0.04, 0.42) };
}

// Kathedraal: 1 stenen kerk met een pannendak, een gedrongen toren en een roosvenster; 2 zijbeuk met steunberen, leien,
// een hogere toren met spits en een traptorentje vooraan links; 3 pinakels op de steunberen, een vieringstorentje op het
// dak, een gouden band, beelden naast de poort en een gouden kruis.
function cathedral(s, st, L) {
  const x0 = -0.42; const x1 = 0.14; const y0 = -0.24; const y1 = 0.18; const h = 0.78 + L * 0.06;
  const wo = { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#d3cbb8' : null };
  const wo2 = { wall: st.wall === 'timber' ? 'stone' : st.wall, c: st.wall === 'timber' ? '#c9c0ac' : null };
  s.box(x0 - 0.05, y0 - 0.12, 0, x1 + 0.3, y1 + 0.12, 0.08, mat.stone(st.base));
  walls(s, st, x0, y0, x1, y1, 0.08, h, wo);
  if (L >= 2) { // zijbeuk met steunberen
    walls(s, st, x0 + 0.04, y1, x1 - 0.04, y1 + 0.1, 0.08, h * 0.55, wo2);
    for (let k = 0; k < 4; k++) {
      const x = x0 + 0.08 + k * 0.13;
      s.box(x - 0.02, y1 + 0.1, 0.08, x + 0.02, y1 + 0.15, h * 0.5, mat.stone('#b9b1a1'));
      if (L >= 3) { s.box(x - 0.024, y1 + 0.098, h * 0.5, x + 0.024, y1 + 0.152, h * 0.5 + 0.04, mat.stone('#a39a89')); s.cone(x, y1 + 0.125, 0.022, h * 0.5 + 0.04, h * 0.5 + 0.2, mat.stone('#a39a89')); }
      window2(s, 'y', y1 + 0.1, x + 0.03, 0.22, 0.05, 0.16); window2(s, 'y', y1, x + 0.03, h * 0.6, 0.05, 0.14);
    }
  } else for (let k = 0; k < 4; k++) window2(s, 'y', y1, x0 + 0.11 + k * 0.13, 0.3, 0.05, 0.2);
  const top = roof(s, st, x0, y0, x1, y1, h, 0.4, 'x', { level: L + 1, roofC: L >= 2 ? '#4f5866' : undefined });
  if (L >= 3) { // vieringstorentje op de nok en een gouden band
    const fx = -0.16;
    s.box(fx - 0.05, -0.08, top - 0.12, fx + 0.05, 0.02, top + 0.12, mat.stone('#d3cbb8'));
    window2(s, 'y', 0.02, fx - 0.015, top - 0.02, 0.03, 0.1);
    s.hip(fx - 0.06, -0.09, fx + 0.06, 0.03, top + 0.12, 0.34, mat.slate('#4f5866'), 0.01);
    s.cyl(fx, -0.03, 0.006, top + 0.44, top + 0.56, mat.gold());
    s.box(x0 - 0.02, y0 - 0.02, h - 0.03, x1 + 0.02, y1 + 0.02, h - 0.01, mat.gold());
  }
  // toren aan de voorkant (rechts, +x) met roosvenster en poort
  const tx0 = x1; const tx1 = x1 + 0.26; const ty0 = -0.13; const ty1 = 0.13; const th = h + 0.35 + L * 0.2;
  walls(s, st, tx0, ty0, tx1, ty1, 0.08, th, wo);
  s.win('x', tx1, -0.06, 0.06, 0.08, 0.38, mat.door('#4a2e18'));
  s.hcyl('x', 0, 0.58, 0.075, tx1 - 0.005, tx1 + 0.012, mat.glaze('#3d6fb5', tx1, 0));
  s.hcyl('x', 0, 0.58, 0.025, tx1 + 0.01, tx1 + 0.016, mat.gold());
  for (let z = 0.8; z + 0.2 < th; z += 0.32) { window2(s, 'x', tx1, -0.025, z, 0.05, 0.16); window2(s, 'y', ty1, tx0 + 0.1, z, 0.05, 0.16); }
  let peak;
  if (st.roof === 'gable' || st.roof === 'greek') {
    s.box(tx0 - 0.015, ty0 - 0.015, th, tx1 + 0.015, ty1 + 0.015, th + 0.04, mat.stone('#a39a89'));
    const sh = L <= 1 ? 0.3 : 0.55 + L * 0.14; // spits: een steile piramide (eerst een laag pannendakje)
    s.hip(tx0 + 0.01, ty0 + 0.01, tx1 - 0.01, ty1 - 0.01, th + 0.04, sh, L <= 1 ? mat.tiles(st.roofC || '#9a4630') : mat.slate('#4f5866'), 0.01);
    if (L >= 2) for (const [x, y] of [[tx0, ty0], [tx1, ty0], [tx0, ty1], [tx1, ty1]]) s.cone(x, y, 0.03, th + 0.04, th + 0.2, mat.stone('#a39a89'));
    peak = th + 0.04 + sh;
  } else peak = turretTop(s, st, (tx0 + tx1) / 2, 0, 0.14, th, 0.5 + L * 0.1);
  // kruis of piek (goud vanaf niveau 2)
  const cm = L >= 2 ? mat.gold() : mat.metal('#4d4f54');
  s.cyl((tx0 + tx1) / 2, 0, 0.008, peak - 0.02, peak + 0.14, cm);
  s.box((tx0 + tx1) / 2 - 0.04, -0.006, peak + 0.07, (tx0 + tx1) / 2 + 0.04, 0.006, peak + 0.09, cm);
  if (L >= 2) { // traptorentje vooraan links
    const m = roundM(st, 0, h + 0.2); const x = x0 + 0.0; const y = y1 + 0.11;
    s.cyl(x, y, 0.065, 0, h + 0.2, m); turretTop(s, st, x, y, 0.065, h + 0.2, 0.28);
    for (let z = 0.25; z < h; z += 0.3) s.win('y', y + 0.064, x - 0.01, x + 0.01, z, z + 0.08, mat.plain('#1d1a16'));
  }
  if (L >= 3) for (const y of [-0.1, 0.1]) { // beelden naast de poort
    s.box(tx1, y - 0.03, 0.08, tx1 + 0.05, y + 0.03, 0.14, mat.stone('#a39a89'));
    s.cap([tx1 + 0.025, y, 0.14], [tx1 + 0.025, y, 0.3], 0.02, mat.stone('#e8e2d2'));
    s.ell(tx1 + 0.025, y, 0.33, 0.02, 0.02, 0.024, mat.stone('#e8e2d2'));
    s.ell(tx1 + 0.025, y, 0.36, 0.022, 0.022, 0.006, mat.gold());
  }
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

const BUILD = { house, farm, lumber, quarry, goldmine, storage, barracks, range, stable, smithy, market, tower, workshop, monument, tc, mill, academy, guild, lodge, court, cathedral };
export const HAS_3D = new Set(Object.keys(BUILD));
const SIZE = { tc: 2, monument: 2 };

// stijl + kleine variatie per huis (muur- en dakkleur), zodat een straat niet eentonig is
export function build(type, level, civ = null, variant = 0) {
  const base = STYLES[civ] || STYLES.none;
  const L0 = Math.max(1, level);
  const st = { ...base, civ: STYLES[civ] ? civ : 'none', L: L0 }; // L: muren en daken kiezen er materiaal en versiering mee
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
