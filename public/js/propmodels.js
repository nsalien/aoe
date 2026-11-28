// 3D-modellen van de spullen in en rond de stad (voor render3d.js): lantaarns, een put, struiken, bloemen, fruitbomen,
// tonnen, kisten, hooi, karren, banken, houtstapels, vogelverschrikkers, hekjes, rotsblokken, goudaders, stronken en
// bessenstruiken. Voet op (0, 0, 0); x, y in tegels, z omhoog (zie render3d.js). Zelfde maten als de getekende versies
// in towndress.js en art.js, zodat ze er naadloos in passen.
import { Scene, rgb } from './render3d.js';

const TAU = Math.PI * 2;
const plain = (c, shiny = false) => ({ k: 'plain', c: rgb(c), shiny });
const metal = (c = '#4d4f54') => ({ k: 'plain', c: rgb(c), shiny: true });
const wood = (c = '#7d5128', bw = 0.03) => ({ k: 'wood', c: rgb(c), bw });
const bark = (c = '#5c3d22') => ({ k: 'bark', c: rgb(c) });
const leaf = (c) => ({ k: 'leaf', c: rgb(c) });
const cloth = (c) => ({ k: 'cloth', c: rgb(c) });
const rockM = (c = '#8f887c') => ({ k: 'rock', c: rgb(c) });

// vaste "toevalsgetallen" per model (zelfde beeld bij elke keer renderen)
function rnd(seed) {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}

// ---------- onderdelen ----------

// ton: staande planken, een buik, twee ijzeren banden en een deksel
function barrel(s, x, y, z0, c = '#7d5128') {
  s.cyl(x, y, 0.074, z0, z0 + 0.23, wood(c, 0.022));
  s.ell(x, y, z0 + 0.115, 0.081, 0.081, 0.085, wood(c, 0.022));
  for (const z of [0.045, 0.17]) s.cyl(x, y, 0.083, z0 + z, z0 + z + 0.016, metal('#3e4046'));
  s.cyl(x, y, 0.069, z0 + 0.229, z0 + 0.234, plain('#a8743f'));
  s.cyl(x, y, 0.012, z0 + 0.233, z0 + 0.238, plain('#5a3a1e')); // stop
}

// liggende stam langs x (zaagkanten met jaarringen)
function logX(s, x0, x1, y, z, r, c) { s.hcyl('x', y, z, r, x0, x1, bark(c)); }

// rotsblok: een convex veelvlak met willekeurige vlakken, voet op de grond
export function rockShape(s, v, cx, cy, rx, ry, rz, mat) {
  const R = rnd(v * 97 + 13);
  const planes = [[0, 0, -1, 0]];
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + R() * 0.5;
    const up = 0.15 + R() * 0.75;
    const nx = Math.cos(a) * (1 - up * 0.6); const ny = Math.sin(a) * (1 - up * 0.6); const nz = up;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const ux = nx / l; const uy = ny / l; const uz = nz / l;
    // afstand tot het midden volgens de ellipsoïde, met wat variatie
    const d = Math.sqrt((ux * rx) ** 2 + (uy * ry) ** 2 + (uz * rz) ** 2) * (0.82 + R() * 0.2);
    planes.push([ux, uy, uz, ux * cx + uy * cy + d]);
  }
  planes.push([0, 0, 1, rz * 1.6]);
  s.poly(planes, [cx - rx * 1.2, cy - ry * 1.2, 0, cx + rx * 1.2, cy + ry * 1.2, rz * 1.7], mat);
}

function bushBlobs(s, col, R, scale = 1) {
  for (const [x, y, z, r] of [[-0.05, 0.06, 0.09, 0.1], [0.06, -0.05, 0.09, 0.095], [0, 0, 0.15, 0.11], [0.065, 0.055, 0.075, 0.085], [-0.045, -0.05, 0.12, 0.08]]) {
    s.ell(x * scale, y * scale, z * scale, r * scale, r * scale, r * scale * 0.92, leaf(col));
  }
}

// ---------- bomen (zelfde soorten en kleuren als de getekende in nature.js) ----------
const LEAF = {
  oak: ['#2f5e2a', '#4a8a35', '#7fbf4f'], oakY: ['#3d632a', '#5e9638', '#9ccc5a'], oakD: ['#284f26', '#3e7a33', '#69ad4c'],
  autumn: ['#8a4a1c', '#c8742a', '#f0b04a'], autumnR: ['#7a2e1c', '#b8482a', '#e8844a'], birch: ['#4f7f2c', '#7aae42', '#b2da6e'],
  pine: ['#1f4a30', '#2e6b3e', '#4f9150'], spruce: ['#1b3f33', '#285e48', '#3f8063'],
};
// kruin uit veel kleine bladtrossen rond een donkere kern (geen gladde bol)
function crown(s, x, y, z, rx, rz, pal, seed, n = 30) {
  const R = rnd(seed);
  s.ell(x, y, z, rx * 0.8, rx * 0.8, rz * 0.8, leaf(pal[0]));
  for (let k = 0; k < n; k++) {
    const a = R() * TAU; const up = R() * 1.9 - 0.75;
    const c = Math.cos(Math.atan(up)); const sn = Math.sin(Math.atan(up));
    const d = 0.7 + R() * 0.26;
    const px = x + Math.cos(a) * c * rx * d; const py = y + Math.sin(a) * c * rx * d; const pz = z + sn * rz * d;
    const r = rx * (0.2 + R() * 0.13);
    // bovenaan en naar de zon lichter, onderaan donkerder
    const lit = sn * 0.6 + (Math.cos(a) * -0.3 + Math.sin(a) * 0.1) + (R() - 0.5) * 0.8;
    s.ell(px, py, pz, r, r, r * 0.85, leaf(lit > 0.35 ? pal[2] : lit > -0.35 ? pal[1] : pal[0]));
  }
}
function trunk3(s, x, y, h, r, c = '#6b4423') {
  s.cap([x, y, 0], [x + 0.004, y, h], r, bark(c));
  s.cap([x, y, 0.012], [x + r * 1.6, y + r * 0.6, 0], r * 0.55, bark(c)); // wortelvoet
  s.cap([x, y, 0.012], [x - r * 0.8, y - r * 1.5, 0], r * 0.5, bark(c));
}
function oak3(s, x, y, k, pal, seed) {
  trunk3(s, x, y, 0.32 * k, 0.033 * k);
  s.cap([x, y, 0.2 * k], [x - 0.1 * k, y + 0.05 * k, 0.36 * k], 0.016 * k, bark('#5a391d'));
  s.cap([x, y, 0.22 * k], [x + 0.1 * k, y - 0.06 * k, 0.38 * k], 0.016 * k, bark('#5a391d'));
  crown(s, x, y, 0.53 * k, 0.23 * k, 0.25 * k, pal, seed, 34);
}
function round3(s, x, y, k, pal, seed) {
  trunk3(s, x, y, 0.26 * k, 0.03 * k);
  crown(s, x, y, 0.45 * k, 0.21 * k, 0.22 * k, pal, seed, 28);
}
function birch3(s, x, y, k, pal, seed) {
  s.cap([x, y, 0], [x + 0.004, y, 0.62 * k], 0.022 * k, bark('#ece8dc'));
  const R = rnd(seed + 7);
  for (let i = 0; i < 6; i++) { const z = (0.05 + R() * 0.5) * k; const a = R() * TAU * 0.5 - 0.6; s.ell(x + Math.cos(a) * 0.02 * k, y + Math.sin(a) * 0.02 * k, z, 0.008 * k, 0.008 * k, 0.005 * k, plain('#2b2722')); }
  crown(s, x, y, 0.5 * k, 0.15 * k, 0.24 * k, pal, seed, 24);
}
function poplar3(s, x, y, k, pal, seed) {
  trunk3(s, x, y, 0.2 * k, 0.026 * k);
  crown(s, x, y, 0.56 * k, 0.12 * k, 0.38 * k, pal, seed, 26);
}
function conifer3(s, x, y, k, pal, tiers, width, height) {
  s.cap([x, y, 0], [x, y, 0.2 * k], 0.024 * k, bark('#5a3a1e'));
  const H = height / 39.19; const Wd = width / 45;
  const step = H / tiers;
  for (let i = 0; i < tiers; i++) {
    const w = Wd * (1 - i / (tiers + 0.6)) * k;
    const z0 = (0.13 + i * step) * k; const z1 = z0 + step * 1.75 * k;
    s.cone(x, y, w, z0, z1, leaf(i % 2 ? pal[1] : pal[0]));
    // takken die uitsteken: kleine kegels rond de rand van elke laag
    for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU + i * 0.5; s.cone(x + Math.cos(a) * w * 0.72, y + Math.sin(a) * w * 0.72, w * 0.32, z0 - 0.01 * k, z0 + step * 0.55 * k, leaf(q % 2 ? pal[2] : pal[1])); }
  }
}
const TREES = [
  (s) => oak3(s, 0, 0, 1.05, LEAF.oak, 1), (s) => oak3(s, 0, 0, 1.15, LEAF.oakY, 2), (s) => oak3(s, 0, 0, 0.95, LEAF.oakD, 3), (s) => oak3(s, 0, 0, 1.1, LEAF.autumn, 4),
  (s) => round3(s, 0, 0, 1.05, LEAF.oakY, 5), (s) => round3(s, 0, 0, 1.0, LEAF.autumnR, 6), (s) => birch3(s, 0, 0, 1.05, LEAF.birch, 7), (s) => poplar3(s, 0, 0, 1.0, LEAF.oak, 8),
  (s) => conifer3(s, 0, 0, 1.0, LEAF.pine, 4, 13.5, 30), (s) => conifer3(s, 0, 0, 1.1, LEAF.pine, 4, 12.5, 33), (s) => conifer3(s, 0, 0, 1.0, LEAF.spruce, 5, 10.5, 37), (s) => conifer3(s, 0, 0, 0.95, LEAF.pine, 3, 14, 24),
  // groepjes voor dichte bossen (achteraan kleinere bomen); posities in tegels zoals de getekende (12 px opzij, 7 px hoger)
  (s) => { oak3(s, -0.41, -0.03, 0.8, LEAF.oakD, 11); oak3(s, -0.11, -0.45, 0.75, LEAF.oak, 12); oak3(s, 0, 0, 1.05, LEAF.oak, 13); },
  (s) => { conifer3(s, -0.36, -0.02, 0.85, LEAF.pine, 4, 12, 30); conifer3(s, -0.13, -0.44, 0.8, LEAF.spruce, 5, 10, 36); conifer3(s, 0, 0, 1.05, LEAF.pine, 4, 13, 31); },
  (s) => { conifer3(s, -0.42, -0.08, 0.85, LEAF.spruce, 5, 10, 36); round3(s, -0.02, -0.36, 0.8, LEAF.oakY, 14); oak3(s, 0, 0, 1.0, LEAF.oakY, 15); },
  (s) => { birch3(s, -0.38, -0.06, 0.85, LEAF.birch, 16); oak3(s, -0.09, -0.41, 0.8, LEAF.oakD, 17); round3(s, 0, 0, 1.0, LEAF.oak, 18); },
];

// ---------- barbarenkamp (twee lagen: achteraan en de palissade vooraan; de barbaren staan ertussen) ----------
// Zelfde plaats en maat als de getekende versie in town.js (campSprites): een palissade van ±1,33 tegels straal,
// een poort vooraan (richting de kijker), drie hutten, een totem, een droogrek en wat beenderen.
const CAMP_R = 1.33;
function campStakes(s, front) {
  for (let i = 0; i < 34; i++) {
    const th = (i / 34) * TAU;
    const dg = Math.abs(((th - Math.PI / 4 + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (dg < 0.26) continue; // poort vooraan
    const x = Math.cos(th) * CAMP_R; const y = Math.sin(th) * CAMP_R;
    if ((x + y >= 0) !== front) continue;
    const h = (15 + ((i * 7) % 5)) / 39.19;
    const lx = Math.cos(th) * 0.04; const ly = Math.sin(th) * 0.04;
    s.cap([x, y, 0], [x + lx, y + ly, h], 0.034, bark('#5e4027'));
    s.cone(x + lx, y + ly, 0.03, h, h + 0.1, plain('#8a6a44'));
    s.cyl(x + lx * 0.5, y + ly * 0.5, 0.038, h * 0.5, h * 0.5 + 0.025, leather('#b89a6a')); // touw
  }
}
function hut(s, x, y, r, roof) {
  const wh = r * 0.85 * (45 / 39.19);
  s.cyl(x, y, r, 0, wh, wood('#7a5a36', 0.03));
  const d = r * 0.98;
  s.box(x + d * 0.62 - 0.03, y + d * 0.62 - 0.03, 0, x + d * 0.72 + 0.03, y + d * 0.72 + 0.03, wh * 0.7, plain('#1e140c')); // deuropening
  s.cone(x, y, r * 1.2, wh - 0.02, wh + r * 1.45 * (45 / 39.19), { k: 'thatch', c: rgb(roof) });
  s.cyl(x, y, 0.03, wh + r * 1.3, wh + r * 1.45 * (45 / 39.19) + 0.03, plain('#3a2a18'));
}
const leather = (c) => ({ k: 'leather', c: rgb(c) });
function campBack(s) {
  s.ell(0, 0, 0, CAMP_R - 0.08, CAMP_R - 0.08, 0.012, { k: 'dirt', c: [0.45, 0.36, 0.24] }, 0);
  campStakes(s, false);
  hut(s, -0.72, 0.22, 0.24, '#c9a24a');
  hut(s, 0.03, -0.78, 0.29, '#b8913e');
  hut(s, -0.62, -0.5, 0.2, '#d0ab55');
  // totem met een schedel en hoorns
  const tx = 0.56; const ty = -0.81;
  ['#7a4a26', '#a8432f', '#2a2018', '#c49a3a', '#7a4a26'].forEach((c, i) => s.box(tx - 0.045, ty - 0.045, i * 0.15, tx + 0.045, ty + 0.045, (i + 1) * 0.15, plain(c)));
  s.ell(tx, ty, 0.8, 0.05, 0.05, 0.055, plain('#efe6d2'));
  for (const sd of [1, -1]) { s.ell(tx + 0.04, ty + sd * 0.018, 0.81, 0.008, 0.008, 0.009, plain('#2a1a10')); s.cap([tx, ty + sd * 0.045, 0.81], [tx - 0.02, ty + sd * 0.11, 0.9], 0.009, plain('#efe6d2')); }
  // droogrek met een huid
  const rx = -0.53; const ry = 0.9;
  s.cap([rx, ry - 0.2, 0], [rx, ry - 0.2, 0.38], 0.016, bark('#5e4027'));
  s.cap([rx, ry + 0.2, 0], [rx, ry + 0.2, 0.42], 0.016, bark('#5e4027'));
  s.cap([rx, ry - 0.22, 0.35], [rx, ry + 0.22, 0.39], 0.012, bark('#5e4027'));
  s.box(rx - 0.006, ry - 0.15, 0.1, rx + 0.006, ry + 0.15, 0.35, leather('#c9a77a'));
  // houtstapel bij het vuur en wat beenderen
  for (const [y, z] of [[0.13, 0.025], [0.2, 0.025], [0.165, 0.07]]) logX(s, 0.45, 0.72, y, z, 0.026, '#6b4826');
  for (const [x, y] of [[-0.25, 0.6], [0.45, 0.55], [-0.9, 0.4], [0.95, -0.2]]) { s.cap([x - 0.05, y, 0.01], [x + 0.04, y - 0.02, 0.01], 0.008, plain('#efe6d2')); s.ell(x + 0.05, y - 0.02, 0.012, 0.012, 0.012, 0.01, plain('#efe6d2')); }
}

// ---------- de spullen ----------
const MODELS = {
  // straatlantaarn: stenen voet, paal (hout, later ijzer), arm en een brandende lantaarn
  lamp(s, v) {
    const iron = v >= 1;
    s.box(-0.05, -0.05, 0, 0.05, 0.05, 0.075, { k: 'stone', c: rgb('#a7a090'), row: 0.035, bw: 0.05 });
    s.box(-0.056, -0.056, 0, 0.056, 0.056, 0.02, plain('#8f887c'));
    s.cyl(0, 0, 0.021, 0.075, 0.79, iron ? metal('#34302c') : bark('#5c3d22'));
    if (iron) for (const z of [0.3, 0.55]) s.cyl(0, 0, 0.028, z, z + 0.025, metal('#4a4540'));
    const L = [0.117, -0.117];
    s.cap([0, 0, 0.775], [0.06, -0.06, 0.805], 0.009, iron ? metal('#34302c') : plain('#5c3d22'));
    s.cap([0.06, -0.06, 0.805], [L[0], L[1], 0.775], 0.009, iron ? metal('#34302c') : plain('#5c3d22'));
    s.cap([0, 0, 0.69], [0.05, -0.05, 0.775], 0.006, iron ? metal('#34302c') : plain('#5c3d22')); // schoor
    s.cap([L[0], L[1], 0.775], [L[0], L[1], 0.72], 0.003, metal('#2e2926'));
    s.cone(L[0], L[1], 0.055, 0.66, 0.725, metal('#2e2926'));
    s.box(L[0] - 0.035, L[1] - 0.035, 0.5, L[0] + 0.035, L[1] + 0.035, 0.66, plain('#ffd477', true));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.cap([L[0] + dx * 0.036, L[1] + dy * 0.036, 0.5], [L[0] + dx * 0.036, L[1] + dy * 0.036, 0.66], 0.005, metal('#2e2926'));
    s.box(L[0] - 0.042, L[1] - 0.042, 0.485, L[0] + 0.042, L[1] + 0.042, 0.5, metal('#2e2926'));
  },
  // waterput: stenen rand, water, houten palen met een as, touw en emmer, pannendakje
  well(s) {
    s.cyl(0, 0, 0.2, 0, 0.2, { k: 'stone', c: rgb('#8f887c'), row: 0.05, bw: 0.08 });
    s.cyl(0, 0, 0.212, 0.19, 0.214, { k: 'stone', c: rgb('#b9b1a1'), row: 0.03, bw: 0.06 });
    s.cyl(0, 0, 0.158, 0.2, 0.2155, { k: 'water' });
    for (const y of [-0.18, 0.18]) s.cap([0, y, 0.2], [0, y, 0.72], 0.02, bark('#6b4523'));
    s.cap([0, -0.2, 0.53], [0, 0.2, 0.53], 0.013, plain('#4a3220'));
    s.cap([0, -0.2, 0.53], [0.05, -0.21, 0.5], 0.006, plain('#3a2414')); // zwengel
    s.cap([0, 0.03, 0.53], [0, 0.03, 0.37], 0.0035, plain('#c9b48a'));
    s.cyl(0, 0.03, 0.032, 0.3, 0.37, wood('#7a5129', 0.015));
    s.cyl(0, 0.03, 0.034, 0.355, 0.362, metal('#5a5f66'));
    s.gable(-0.13, -0.25, 0.13, 0.25, 0.7, 0.17, 'y', { k: 'tiles', c: rgb('#9c4a2c') }, 0.035);
  },
  // struik (v: kleur; 1 = met witte bloesem)
  bush(s, v) {
    const col = ['#4f8a34', '#5b9a3a', '#41783a'][v % 3];
    bushBlobs(s, col);
    if (v % 3 === 1) { const R = rnd(v + 3); for (let k = 0; k < 8; k++) { const a = R() * TAU; s.ell(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.12 + R() * 0.1, 0.012, 0.012, 0.01, plain('#f2f0e6')); } }
  },
  // bloembed: aarde, een rand van steentjes en bloemen op stengels
  flowers(s, v) {
    s.ell(0, 0, 0, 0.2, 0.19, 0.03, { k: 'dirt', c: [0.36, 0.25, 0.16] }, 0);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; s.ell(Math.cos(a) * 0.195, Math.sin(a) * 0.185, 0.012, 0.028, 0.028, 0.02, rockM(k % 2 ? '#a39a89' : '#c4bcab')); }
    const cols = [['#e8536b', '#f4d35e'], ['#b48cf0', '#ffffff'], ['#ff9f43', '#f4e04d'], ['#e86f9a', '#7fb0f0']][v % 4];
    const R = rnd(v * 13 + 7);
    for (let k = 0; k < 14; k++) {
      const a = R() * TAU; const r = Math.sqrt(R()) * 0.15;
      const x = Math.cos(a) * r; const y = Math.sin(a) * r; const h = 0.06 + R() * 0.04;
      s.cap([x, y, 0.02], [x + 0.005, y, h], 0.004, plain('#3f7a2c'));
      s.ell(x - 0.012, y, 0.045, 0.014, 0.006, 0.006, leaf('#4f8a34'));
      s.ell(x + 0.005, y, h + 0.006, 0.016, 0.016, 0.011, plain(cols[k % 2]));
    }
  },
  // fruitboom: stam met takken, kruin en vruchten
  fruit(s, v) {
    s.cap([0, 0, 0], [0.01, 0, 0.37], 0.03, bark('#6b4523'));
    s.cap([0.005, 0, 0.27], [-0.09, 0.05, 0.42], 0.014, bark('#6b4523'));
    s.cap([0.005, 0, 0.29], [0.09, -0.05, 0.44], 0.014, bark('#6b4523'));
    const col = ['#5a9a3a', '#4f8f33', '#68a442'][v % 3];
    for (const [x, y, z, r] of [[-0.11, 0.08, 0.47, 0.13], [0.1, -0.09, 0.49, 0.13], [0, 0, 0.6, 0.15], [-0.05, -0.07, 0.43, 0.12], [0.07, 0.07, 0.42, 0.11], [0.02, 0.02, 0.5, 0.14]]) s.ell(x, y, z, r, r, r * 0.9, leaf(col));
    const fr = ['#d9412f', '#f29b2a', '#e8c43a'][v % 3];
    const R = rnd(v * 31 + 5);
    for (let k = 0; k < 9; k++) { const a = R() * TAU * 0.6 - 0.6; const z = 0.38 + R() * 0.26; s.ell(Math.cos(a) * 0.17, Math.sin(a) * 0.17, z, 0.022, 0.022, 0.022, plain(fr, true)); }
  },
  // tonnen (v = 1: een derde ton erbovenop)
  barrels(s, v) {
    barrel(s, -0.065, 0.07, 0);
    barrel(s, 0.08, -0.05, 0, '#6e4724');
    if (v % 2) barrel(s, 0.005, 0.01, 0.235, '#86582c');
  },
  // kisten met planken en hoeklatten
  crates(s, v) {
    const crate = (x0, y0, z0, x1, y1, z1, c) => {
      s.box(x0, y0, z0, x1, y1, z1, wood(c, 0.035));
      const d = '#5a3a1e'; const e = 0.012;
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) s.box(x - e, y - e, z0, x + e, y + e, z1, plain(d));
      for (const z of [z0, z1 - e * 1.6]) { s.box(x0 - e, y0 - e, z, x1 + e, y0 + e, z + e * 1.6, plain(d)); s.box(x0 - e, y1 - e, z, x1 + e, y1 + e, z + e * 1.6, plain(d)); s.box(x0 - e, y0, z, x0 + e, y1, z + e * 1.6, plain(d)); s.box(x1 - e, y0, z, x1 + e, y1, z + e * 1.6, plain(d)); }
    };
    crate(-0.11, -0.08, 0, 0.05, 0.08, 0.16, '#a8743f');
    crate(0.07, -0.02, 0, 0.19, 0.1, 0.12, '#9c6b3c');
    if (v % 2) crate(-0.08, -0.06, 0.16, 0.03, 0.05, 0.27, '#b8874c');
  },
  // hooiberg (v = 1: met een hooivork)
  hay(s, v) {
    s.ell(0, 0, 0, 0.23, 0.21, 0.36, { k: 'hay' }, 0);
    s.ell(0.02, 0.01, 0.28, 0.12, 0.11, 0.14, { k: 'hay', c: [0.92, 0.78, 0.4] });
    s.cap([-0.16, 0.1, 0.03], [0.16, -0.1, 0.03], 0.012, { k: 'hay', c: [0.75, 0.58, 0.28] }); // losse sprieten onderaan
    if (v % 2) {
      s.cap([0.2, -0.05, 0], [0.31, -0.13, 0.52], 0.008, bark('#7a5129'));
      for (const d of [-0.018, 0, 0.018]) s.cap([0.31 + d * 0.5, -0.13 + d, 0.52], [0.33 + d * 0.5, -0.14 + d, 0.6], 0.004, metal('#8e959f'));
    }
  },
  // kar met een lading (v: 0 hooi, 1 stammen, 2 stenen)
  cart(s, v) {
    s.box(-0.21, -0.1, 0.1, 0.17, 0.1, 0.13, wood('#7a5129', 0.03));
    for (const y of [-0.105, 0.095]) s.box(-0.21, y, 0.13, 0.17, y + 0.01, 0.2, wood('#6b4523', 0.04));
    for (const x of [-0.215, 0.165]) s.box(x, -0.105, 0.13, x + 0.01, 0.105, 0.19, wood('#6b4523', 0.04));
    for (const y of [-0.125, 0.105]) {
      s.hcyl('y', -0.02, 0.09, 0.09, y, y + 0.02, plain('#4a3220'));
      s.hcyl('y', -0.02, 0.09, 0.075, y - 0.002, y + 0.022, plain('#6b4523'));
      s.hcyl('y', -0.02, 0.09, 0.016, y - 0.008, y + 0.028, metal('#8a7a5a'));
      const yf = y > 0 ? y + 0.022 : y - 0.002;
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; s.cap([-0.02 + Math.cos(a) * 0.07, yf, 0.09 + Math.sin(a) * 0.07], [-0.02 - Math.cos(a) * 0.07, yf, 0.09 - Math.sin(a) * 0.07], 0.006, plain('#8a6238')); }
    }
    s.cap([0.17, -0.06, 0.12], [0.42, -0.07, 0.06], 0.012, bark('#6b4523'));
    s.cap([0.17, 0.06, 0.12], [0.42, 0.05, 0.06], 0.012, bark('#6b4523'));
    if (v % 3 === 0) s.ell(-0.02, 0, 0.2, 0.18, 0.1, 0.09, { k: 'hay' });
    else if (v % 3 === 1) for (const [y, z] of [[-0.05, 0.17], [0.05, 0.17], [0, 0.24]]) logX(s, -0.22, 0.2, y, z, 0.042, '#5c3d22');
    else for (const [x, y, k] of [[-0.12, -0.04, 1], [-0.02, 0.04, 2], [0.08, -0.03, 3], [0.03, 0.0, 4]]) rockShape(s, k, x, y, 0.06, 0.055, 0.07, rockM('#a7a297'));
  },
  // bank met rugleuning
  bench(s) {
    s.box(-0.15, -0.045, 0.11, 0.15, 0.045, 0.135, wood('#9c6b3c', 0.05));
    for (const x of [-0.12, 0.12]) for (const y of [-0.035, 0.035]) s.box(x - 0.012, y - 0.012, 0, x + 0.012, y + 0.012, 0.11, plain('#6b4523'));
    s.box(-0.15, -0.055, 0.135, 0.15, -0.04, 0.27, wood('#8a5f33', 0.04));
    for (const x of [-0.12, 0.12]) s.box(x - 0.01, -0.058, 0.11, x + 0.01, -0.038, 0.28, plain('#6b4523'));
  },
  // houtstapel: gezaagde stammen met jaarringen
  logs(s) {
    for (const [y, z, r, x0, x1] of [[-0.09, 0.045, 0.045, -0.2, 0.17], [0, 0.045, 0.047, -0.17, 0.2], [0.095, 0.045, 0.044, -0.19, 0.18],
      [-0.045, 0.125, 0.043, -0.18, 0.16], [0.05, 0.125, 0.044, -0.16, 0.19], [0.0, 0.2, 0.04, -0.15, 0.15]]) logX(s, x0, x1, y, z, r, '#5c3d22');
    s.cap([0.2, 0.15, 0.0], [0.24, 0.05, 0.0], 0.008, plain('#c9a46a')); // spaanders
    s.ell(0.23, -0.12, 0.004, 0.02, 0.012, 0.006, plain('#d6b27a'));
  },
  // vogelverschrikker
  scare(s) {
    s.cap([0, 0, 0], [0, 0, 0.55], 0.012, bark('#6b4523'));
    s.cap([0, -0.15, 0.38], [0, 0.15, 0.38], 0.01, bark('#6b4523'));
    s.ell(0, 0, 0.3, 0.05, 0.07, 0.11, cloth('#9a5a3a'));
    for (const y of [-1, 1]) { s.cap([0, y * 0.05, 0.38], [0, y * 0.14, 0.37], 0.022, cloth('#8a4a2a')); s.ell(0, y * 0.16, 0.365, 0.02, 0.02, 0.025, { k: 'hay' }); }
    s.ell(0, 0, 0.18, 0.035, 0.05, 0.03, { k: 'hay' }); // stro onder de jas
    s.ell(0.005, 0, 0.47, 0.045, 0.045, 0.05, cloth('#e8d3a0'));
    for (const y of [-0.015, 0.015]) s.ell(0.045, y, 0.48, 0.006, 0.006, 0.006, plain('#2a1d12'));
    s.cyl(0, 0, 0.11, 0.505, 0.515, { k: 'hay', c: [0.79, 0.63, 0.23] });
    s.cyl(0, 0, 0.05, 0.51, 0.58, { k: 'hay', c: [0.79, 0.63, 0.23] });
  },
  // hekje langs een tegelrand (v: 0 = langs x, 1 = langs y)
  fence(s, v) {
    const along = v === 1 ? 'y' : 'x'; const len = 0.7; const n = 5;
    const pt = (t) => (along === 'x' ? [-len / 2 + t * len, 0] : [0, -len / 2 + t * len]);
    for (const z of [0.08, 0.17]) { const a = pt(0); const b = pt(1); s.cap([a[0], a[1], z], [b[0], b[1], z], 0.009, wood('#8a6238', 0.05)); }
    for (let k = 0; k <= n; k++) {
      const [x, y] = pt(k / n);
      s.box(x - 0.014, y - 0.014, 0, x + 0.014, y + 0.014, 0.21, wood('#6b4523', 0.05));
      s.cone(x, y, 0.02, 0.21, 0.24, plain('#9c6b3c'));
    }
  },
  // rotsblok (v: vorm 0..7)
  rock(s, v) {
    const cols = ['#8f887c', '#9c968a', '#857f74', '#a39d90'];
    rockShape(s, v, 0, 0, 0.17, 0.15, 0.2, rockM(cols[v % 4]));
    if (v % 3 === 0) rockShape(s, v + 11, 0.13, 0.1, 0.06, 0.06, 0.06, rockM('#9c968a'));
  },
  // goudader: rots met glanzende klompjes goud
  gold(s, v) {
    rockShape(s, v, 0, 0, 0.17, 0.15, 0.2, rockM('#8a8378'));
    rockShape(s, v + 5, 0.14, 0.11, 0.07, 0.065, 0.08, rockM('#7d776d'));
    const R = rnd(v * 7 + 2);
    for (let k = 0; k < 7; k++) {
      const a = (R() * 0.9 - 0.2) * Math.PI; const z = 0.06 + R() * 0.2;
      const rr = 0.14 * Math.sqrt(Math.max(0.15, 1 - (z / 0.25) ** 2));
      s.ell(Math.cos(a) * rr, Math.sin(a) * rr, z, 0.02 + R() * 0.012, 0.02 + R() * 0.012, 0.016, { k: 'gold' });
    }
  },
  // boomstronk met wortels en een paar spaanders
  stump(s, v) {
    s.cyl(0, 0, 0.065, 0, 0.075 + (v % 3) * 0.012, bark('#5c3d22'));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + v * 0.7; s.cap([Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.03], [Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.0], 0.018, bark('#4f3420')); }
    s.ell(0.12, 0.03, 0.004, 0.018, 0.01, 0.005, plain('#d6b27a'));
    s.ell(0.08, -0.1, 0.004, 0.014, 0.009, 0.005, plain('#c9a46a'));
  },
  // stapeltje brandhout (bij een gevallen boom of een bosbron)
  woodpile(s) {
    for (const [y, z] of [[-0.035, 0.026], [0.035, 0.026], [0, 0.072]]) logX(s, -0.11, 0.11, y, z, 0.026, '#6b4523');
  },
  campback(s) { campBack(s); },
  campfront(s) { campStakes(s, true); },
  // boom (v = soort 0..15, zelfde nummers als nature.js); zonder slagschaduw, die zit al in de grondlaag
  tree(s, v) { (TREES[v] || TREES[0])(s); },
  // bessenstruik
  berry(s, v) {
    bushBlobs(s, ['#4a8030', '#548c36', '#3f7530'][v % 3]);
    const R = rnd(v * 5 + 9);
    for (let k = 0; k < 12; k++) { const a = R() * TAU * 0.55 - 0.5; const z = 0.06 + R() * 0.14; const r = 0.1 - Math.abs(z - 0.12) * 0.3; s.ell(Math.cos(a) * r, Math.sin(a) * r, z, 0.014, 0.014, 0.014, plain('#d6324a', true)); }
  },
};
// vissersbootje (havenhuis): v = soort * 2 + bemand. Soort 0 roeiboot, 1 met mast en zeil, 2 groter met kajuit en lantaarn.
// Langs x (de boeg naar +x); het spel spiegelt het beeld voor de andere richting.
MODELS.boat = (s, v) => {
  const kind = Math.min(2, Math.floor(v / 2)); const crew = v % 2 === 1;
  const len = kind === 2 ? 0.34 : 0.27; const w = kind === 2 ? 0.11 : 0.09;
  const hull = wood(kind === 0 ? '#7a4a24' : kind === 1 ? '#6b4224' : '#5e3a1e');
  s.ell(0, 0, 0.06, len, w, 0.07, hull, 0); // romp
  s.ell(0, 0, 0.1, len * 0.86, w * 0.78, 0.012, plain('#3a2614')); // binnenkant
  s.ell(len * 0.62, 0, 0.1, len * 0.42, w * 0.5, 0.03, hull, 0.08); // boeg iets hoger
  s.box(-len * 0.75, -w * 0.9, 0.1, len * 0.75, -w * 0.82, 0.118, wood('#c9a26a')); // dolboord
  s.box(-len * 0.75, w * 0.82, 0.1, len * 0.75, w * 0.9, 0.118, wood('#c9a26a'));
  // net in de boeg
  s.ell(len * 0.45, 0, 0.12, 0.06, 0.05, 0.025, { k: 'cloth', c: [0.42, 0.4, 0.32] });
  if (kind === 0) { // riemen
    for (const sg of [-1, 1]) s.cap([-0.02, sg * w * 0.7, 0.12], [0.06, sg * (w + 0.14), 0.02], 0.007, wood('#a8743f'));
  } else {
    const mh = kind === 2 ? 0.52 : 0.42;
    s.cap([0.04, 0, 0.1], [0.04, 0, mh], 0.008, wood('#5a3a1e'));
    s.cap([0.04, 0, mh - 0.3], [-0.16, 0, mh - 0.3], 0.006, wood('#5a3a1e')); // giek
    s.box(-0.15, -0.004, mh - 0.29, 0.03, 0.004, mh - 0.03, cloth(kind === 2 ? '#e8dcc0' : '#d9c9a3'));
    s.box(0.045, -0.003, mh - 0.06, 0.12, 0.003, mh - 0.02, cloth('#b8322a')); // wimpel
  }
  if (kind === 2) { // kajuit achteraan met een lantaarn
    s.box(-len * 0.72, -w * 0.6, 0.1, -len * 0.3, w * 0.6, 0.2, wood('#8a5f33'));
    s.box(-len * 0.76, -w * 0.68, 0.2, -len * 0.26, w * 0.68, 0.215, wood('#5a3a1e'));
    s.cap([-len * 0.5, w * 0.6, 0.2], [-len * 0.5, w * 0.6, 0.3], 0.004, metal('#2e2926'));
    s.box(-len * 0.5 - 0.016, w * 0.6 - 0.016, 0.28, -len * 0.5 + 0.016, w * 0.6 + 0.016, 0.32, plain('#ffd477', true));
  }
  if (crew) { // twee vissers: een met een hengel, een die het net binnenhaalt
    const man = (x, y, c, hat) => {
      s.cap([x, y, 0.11], [x, y, 0.2], 0.026, cloth(c));
      s.ell(x, y, 0.235, 0.022, 0.022, 0.025, plain('#e0b48a'));
      s.cone(x, y, 0.04, 0.25, 0.29, hat ? { k: 'hay' } : cloth('#5a4a3a'));
    };
    man(-0.08, 0.02, '#4f6a7a', true);
    s.cap([-0.06, 0.03, 0.18], [0.1, w + 0.18, 0.38], 0.004, wood('#8a6038')); // hengel
    man(0.08, -0.02, '#8a3a3a', false);
  }
};

MODELS.fencex = (s) => MODELS.fence(s, 0);
MODELS.fencey = (s) => MODELS.fence(s, 1);

export const HAS_PROP = new Set(Object.keys(MODELS));

export function propScene(kind, v = 0) {
  const s = new Scene();
  (MODELS[kind] || MODELS.bush)(s, v);
  return s;
}
