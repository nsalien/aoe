// Aankleding van de stad. Twee delen:
//  1. een afbeelding op de grond (één keer gemaakt, opnieuw als er iets gebouwd wordt of de zon draait):
//     geplaveide straten, paadjes van elke deur naar de straat, erven, moestuintjes, zachte schaduwen onder
//     en naast de gebouwen;
//  2. losse spullen die tussen de gebouwen staan (lantaarns, een put, fruitbomen, struiken, bloemen, tonnen,
//     kisten, hooi, karren, banken, hekjes). Die worden met de rest mee gesorteerd en als afbeelding getekend.
// Alles hangt enkel af van de stad zelf (deterministisch), niets wordt opgeslagen.
import * as A from './art.js';
import { isoFns, hashInt } from './iso.js';
import { BUILDINGS, TOWN_GRID } from '../shared/rules.js';
import { ringOf, ringForAge } from '../shared/territory.js';
import * as S3 from './sprite3d.js';

const { toWorld } = isoFns(A.TW, A.TH);
const N = TOWN_GRID;
const MID = N / 2;
const PLAZA = 3.3;
const ISO = [A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0];

const onRoad = (gx, gy) => Math.abs(gx - MID) < 0.62 || Math.abs(gy - MID) < 0.62;
const inPlaza = (gx, gy) => Math.hypot(gx - MID, gy - MID) < PLAZA + 0.2;

// ---------- spullen als kleine afbeeldingen ----------
// per soort een krappe omkadering (wereldpixels rond de voet) en een resolutie die past bij de zoom
const BOXES = {
  lamp: [-6, -36, 13, 5], well: [-16, -36, 17, 7], bush: [-12, -15, 13, 5], flowers: [-11, -10, 11, 6],
  fruit: [-15, -34, 17, 6], barrels: [-9, -19, 11, 5], crates: [-12, -24, 14, 6], hay: [-12, -26, 17, 6],
  cart: [-22, -18, 16, 7], bench: [-10, -15, 11, 5], logs: [-17, -14, 13, 8], scare: [-8, -25, 8, 4],
  fencex: [-24, -20, 26, 10], fencey: [-26, -20, 24, 10],
};
const BOX = [-26, -58, 26, 10];
const propCache = new Map();
const resFor = (sc) => (sc <= 1.1 ? 1 : sc <= 1.7 ? 1.6 : sc <= 2.6 ? 2.4 : 3.2);

function propSprite(kind, v, PS) {
  const key = `${kind}|${v}|${PS}`;
  let cv = propCache.get(key);
  if (cv) return cv;
  const [x0, y0, x1, y1] = BOXES[kind] || BOX;
  cv = document.createElement('canvas');
  cv.width = Math.ceil((x1 - x0) * PS); cv.height = Math.ceil((y1 - y0) * PS);
  const c = cv.getContext('2d');
  c.scale(PS, PS); c.translate(-x0, -y0);
  c.lineCap = 'round'; c.lineJoin = 'round';
  (PROPS[kind] || PROPS.bush)(c, v);
  // donkere omlijning, zoals bij gebouwen en figuren
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height;
  const o = out.getContext('2d');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) o.drawImage(cv, dx * PS * 0.45, dy * PS * 0.45);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = 'rgba(34,22,12,0.55)'; o.fillRect(0, 0, out.width, out.height);
  o.globalCompositeOperation = 'source-over';
  o.drawImage(cv, 0, 0);
  propCache.set(key, out);
  return out;
}

export function drawProp(ctx, p) {
  const m = ctx.getTransform();
  const s = p.s || 1;
  // 3D-model (zelfde stijl als de gebouwen), anders de getekende versie
  const w0 = toWorld(p.gx, p.gy);
  if (A.prop3d(ctx, p.kind, p.v || 0, w0.x, w0.y, s)) return;
  const cv = propSprite(p.kind, p.v || 0, resFor(Math.hypot(m.a, m.b) * s));
  const [x0, y0, x1, y1] = BOXES[p.kind] || BOX;
  const w = toWorld(p.gx, p.gy);
  ctx.drawImage(cv, w.x + x0 * s, w.y + y0 * s, (x1 - x0) * s, (y1 - y0) * s);
}

const shadowBlob = (c, rx, ry, a = 0.28, dx = 2) => { c.fillStyle = `rgba(20,25,8,${a})`; c.beginPath(); c.ellipse(dx, 0.5, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
const ball = (c, x, y, r, col, hi = 0.35) => {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, A.shade(col, hi)); g.addColorStop(0.7, col); g.addColorStop(1, A.shade(col, -0.3));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
};

const PROPS = {
  // straatlantaarn: houten paal met een lantaarn (later ijzer)
  lamp(c, v) {
    shadowBlob(c, 4.5, 1.8);
    const iron = v >= 1;
    const post = iron ? '#34302c' : '#5c3d22';
    // stenen voet
    c.fillStyle = '#8f887c'; c.beginPath(); c.ellipse(0, -0.8, 3.2, 1.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a7a090'; c.fillRect(-2.4, -3.6, 4.8, 2.8);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0.6, -3.6, 1.8, 2.8);
    // paal met licht en schaduw
    c.fillStyle = post; c.fillRect(-1.1, -31, 2.2, 28);
    c.fillStyle = 'rgba(255,235,200,0.22)'; c.fillRect(-1.1, -31, 0.7, 28);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0.5, -31, 0.6, 28);
    if (iron) { c.fillStyle = '#4a4540'; for (const y of [-12, -24]) c.fillRect(-1.6, y, 3.2, 1.2); }
    // arm
    c.strokeStyle = post; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(4, -33, 7.5, -30.5); c.stroke();
    c.lineWidth = 0.7; c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(3, -26.5, 5, -29.5); c.stroke();
    // lantaarn
    const lx = 7.5;
    c.strokeStyle = '#2e2926'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(lx, -30.5); c.lineTo(lx, -28.5); c.stroke();
    c.fillStyle = '#2e2926'; c.beginPath(); c.moveTo(lx - 3, -26.5); c.lineTo(lx, -29); c.lineTo(lx + 3, -26.5); c.closePath(); c.fill();
    const g = c.createLinearGradient(lx - 2.4, -26, lx + 2.4, -19);
    g.addColorStop(0, '#fff8d6'); g.addColorStop(0.6, '#ffd477'); g.addColorStop(1, '#e89a3a');
    c.fillStyle = g; c.beginPath(); c.moveTo(lx - 2.4, -26.5); c.lineTo(lx + 2.4, -26.5); c.lineTo(lx + 1.9, -19.5); c.lineTo(lx - 1.9, -19.5); c.closePath(); c.fill();
    c.strokeStyle = '#2e2926'; c.lineWidth = 0.55; c.stroke();
    c.beginPath(); c.moveTo(lx, -26.5); c.lineTo(lx, -19.5); c.stroke();
    c.fillStyle = '#2e2926'; c.fillRect(lx - 2.2, -19.8, 4.4, 1);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(lx - 1.7, -25.6, 0.6, 4);
  },
  // waterput: stenen rand, houten dakje, emmer aan een touw
  well(c) {
    shadowBlob(c, 13, 5, 0.3, 3);
    const rx = 9; const ry = 4.6;
    // buitenkant van de ring
    c.fillStyle = '#8f887c'; c.beginPath(); c.ellipse(0, -1, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, -8); c.ellipse(0, -8, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,30,20,0.45)'; c.lineWidth = 0.5;
    for (let r = 0; r < 3; r++) {
      const y = -1 - r * 2.4;
      c.beginPath(); c.ellipse(0, y, rx, ry, 0, 0.1, Math.PI - 0.1); c.stroke();
      for (let k = 0; k < 6; k++) { const a = 0.25 + ((k + (r % 2) * 0.5) / 6) * (Math.PI - 0.5); const x = Math.cos(a) * rx; const yy = y + Math.sin(a) * ry; c.beginPath(); c.moveTo(x, yy); c.lineTo(x, yy - 2.4); c.stroke(); }
    }
    const lg = c.createLinearGradient(-rx, 0, rx, 0); lg.addColorStop(0, 'rgba(255,250,235,0.25)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = lg; c.beginPath(); c.ellipse(0, -1, rx, ry, 0, 0, Math.PI); c.lineTo(-rx, -8); c.ellipse(0, -8, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
    // bovenrand en water
    c.fillStyle = '#b9b1a1'; c.beginPath(); c.ellipse(0, -8, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b4a5e'; c.beginPath(); c.ellipse(0, -8, rx - 2, ry - 1.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(160,210,235,0.5)'; c.beginPath(); c.ellipse(-1.5, -8.6, 3, 1, 0, 0, Math.PI * 2); c.fill();
    // palen, as en dakje
    for (const x of [-7.5, 7.5]) { c.fillStyle = '#6b4523'; c.fillRect(x - 0.9, -27, 1.8, 20); c.fillStyle = 'rgba(255,230,190,0.2)'; c.fillRect(x - 0.9, -27, 0.6, 20); }
    c.strokeStyle = '#4a3220'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-7.5, -20); c.lineTo(7.5, -20); c.stroke();
    c.strokeStyle = '#c9b48a'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(1, -20); c.lineTo(1, -13); c.stroke();
    c.fillStyle = '#7a5129'; c.fillRect(-0.6, -13.5, 3.2, 3); c.fillStyle = '#5a5f66'; c.fillRect(-0.6, -12.6, 3.2, 0.5);
    c.fillStyle = '#9c4a2c'; c.beginPath(); c.moveTo(-11, -25); c.lineTo(0, -33); c.lineTo(11, -25); c.lineTo(9.5, -23.5); c.lineTo(0, -30.6); c.lineTo(-9.5, -23.5); c.closePath(); c.fill();
    c.fillStyle = '#b85c3a'; c.beginPath(); c.moveTo(-11, -25); c.lineTo(0, -33); c.lineTo(0, -30.6); c.lineTo(-9.5, -23.5); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,15,5,0.4)'; c.lineWidth = 0.4;
    for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(-11 + k * 2.2, -25 - k * 1.6 + 0.2); c.lineTo(-9.5 + k * 1.9, -23.5 - k * 1.42 + 0.2); c.stroke(); }
  },
  // struik
  bush(c, v) {
    shadowBlob(c, 9, 3.2);
    const col = ['#4f8a34', '#5b9a3a', '#41783a'][v % 3];
    for (const [x, y, r] of [[-4.5, -4, 4.2], [4.2, -3.8, 4], [0, -7, 5], [-1.5, -3, 4.2], [2.5, -6.5, 3.4]]) ball(c, x, y, r, col, 0.28);
    if (v % 3 === 1) for (const [x, y] of [[-3, -8], [2, -10], [4, -5], [-5, -5]]) { c.fillStyle = '#f2f0e6'; c.beginPath(); c.arc(x, y, 0.8, 0, Math.PI * 2); c.fill(); }
  },
  // bloembed met een randje van stenen
  flowers(c, v) {
    shadowBlob(c, 9, 3, 0.18);
    c.fillStyle = '#7a5a3a'; c.beginPath(); c.ellipse(0, -1, 9, 4.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5c4029'; c.beginPath(); c.ellipse(0, -1.5, 8, 3.6, 0, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; c.fillStyle = k % 2 ? '#a39a89' : '#c4bcab'; c.beginPath(); c.ellipse(Math.cos(a) * 8.6, -1 + Math.sin(a) * 4, 1.4, 0.9, 0, 0, Math.PI * 2); c.fill(); }
    const cols = [['#e8536b', '#f4d35e'], ['#b48cf0', '#ffffff'], ['#ff9f43', '#f4e04d'], ['#e86f9a', '#7fb0f0']][v % 4];
    let s = 7 + v * 13;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let k = 0; k < 16; k++) {
      const x = (r() - 0.5) * 13; const y = -1.6 + (r() - 0.5) * 5.2;
      c.strokeStyle = '#3f7a2c'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.3, y - 3); c.stroke();
      c.fillStyle = '#4f8a34'; c.beginPath(); c.ellipse(x - 0.8, y - 1.4, 1, 0.5, -0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = cols[k % 2]; c.beginPath(); c.arc(x + 0.3, y - 3.4, 1.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,240,150,0.9)'; c.beginPath(); c.arc(x + 0.3, y - 3.4, 0.35, 0, Math.PI * 2); c.fill();
    }
  },
  // fruitboom
  fruit(c, v) {
    shadowBlob(c, 12, 4.2, 0.3, 4);
    c.fillStyle = '#6b4523'; c.beginPath(); c.moveTo(-1.6, 0); c.lineTo(-1, -14); c.lineTo(1, -14); c.lineTo(1.8, 0); c.closePath(); c.fill();
    c.strokeStyle = '#6b4523'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -11); c.lineTo(-4, -16); c.moveTo(0, -12); c.lineTo(4, -17); c.stroke();
    const leaf = ['#5a9a3a', '#4f8f33', '#68a442'][v % 3];
    for (const [x, y, r] of [[-6, -18, 6], [6, -19, 6], [0, -24, 7], [-2, -16, 5.5], [3, -15, 5]]) ball(c, x, y, r, leaf, 0.3);
    const fr = ['#d9412f', '#f29b2a', '#e8c43a'][v % 3];
    for (const [x, y] of [[-6, -15], [-2, -21], [4, -18], [7, -14], [1, -27], [-8, -20], [3, -12]]) { ball(c, x, y, 1.2, fr, 0.5); }
  },
  // tonnen
  barrels(c, v) {
    shadowBlob(c, 9, 3);
    const barrel = (x, y) => {
      c.fillStyle = '#7d5128'; c.beginPath(); c.moveTo(x - 3.4, y); c.quadraticCurveTo(x - 4.2, y - 4.5, x - 3.4, y - 9); c.lineTo(x + 3.4, y - 9); c.quadraticCurveTo(x + 4.2, y - 4.5, x + 3.4, y); c.closePath(); c.fill();
      const g = c.createLinearGradient(x - 4, 0, x + 4, 0); g.addColorStop(0, 'rgba(255,230,190,0.25)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = g; c.fill();
      c.fillStyle = '#4d4f54'; c.fillRect(x - 3.9, y - 7.6, 7.8, 0.9); c.fillRect(x - 3.9, y - 2.2, 7.8, 0.9);
      c.fillStyle = '#a8743f'; c.beginPath(); c.ellipse(x, y - 9, 3.4, 1.4, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(60,35,15,0.6)'; c.lineWidth = 0.4; c.stroke();
    };
    barrel(-3.5, -1); barrel(3.5, 0.5); if (v % 2) barrel(0, -7.5);
  },
  // kisten
  crates(c, v) {
    shadowBlob(c, 10, 3.2);
    A.box(c, -0.11, -0.08, 0.05, 0.08, 0, 9, '#a8743f');
    A.box(c, 0.06, -0.02, 0.18, 0.1, 0, 7, '#9c6b3c');
    if (v % 2) A.box(c, -0.08, -0.06, 0.03, 0.05, 9, 16, '#b8874c');
    const [sx, sy] = A.P(-0.03, 0.08, 4.5); c.strokeStyle = 'rgba(60,35,15,0.55)'; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(sx - 4, sy - 3); c.lineTo(sx + 4, sy + 2); c.stroke();
  },
  // hooiberg
  hay(c, v) {
    shadowBlob(c, 11, 3.6, 0.3, 3);
    const path = () => { c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(-11, -9, -3, -15); c.quadraticCurveTo(0, -17, 3, -15); c.quadraticCurveTo(11, -9, 10, 0); c.quadraticCurveTo(0, 3, -10, 0); c.closePath(); };
    path(); const g = c.createLinearGradient(-10, -14, 10, 0); g.addColorStop(0, '#f2d27a'); g.addColorStop(0.5, '#d9b04f'); g.addColorStop(1, '#a8823a'); c.fillStyle = g; c.fill();
    c.save(); path(); c.clip();
    let s = 11 + v;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let k = 0; k < 70; k++) { const x = (r() - 0.5) * 20; const y = -r() * 15; c.strokeStyle = r() < 0.5 ? 'rgba(120,85,20,0.45)' : 'rgba(255,245,190,0.5)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y + 2.5); c.stroke(); }
    c.restore();
    if (v % 2) { c.strokeStyle = '#7a5129'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(6, 1); c.lineTo(14, -19); c.stroke(); c.strokeStyle = '#8e959f'; c.lineWidth = 0.6; for (const d of [-1.2, 0, 1.2]) { c.beginPath(); c.moveTo(14 + d, -19); c.lineTo(15.5 + d, -23); c.stroke(); } }
  },
  // kar met een lading
  cart(c, v) {
    shadowBlob(c, 13, 3.6, 0.28, 2);
    A.box(c, -0.16, -0.07, 0.14, 0.07, 4, 9, '#7a5129');
    const load = ['#d9b04f', '#8b5a2b', '#a7a297'][v % 3];
    for (let k = 0; k < 6; k++) { const [x, y] = A.P(-0.12 + (k % 3) * 0.1, -0.03 + Math.floor(k / 3) * 0.06, 10); ball(c, x, y, 2.6, load, 0.3); }
    for (const dx of [-0.09, 0.09]) {
      const [x, y] = A.P(dx, 0.08, 3);
      c.fillStyle = '#4a3220'; c.beginPath(); c.ellipse(x, y, 3, 3.4, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#8a6238'; c.lineWidth = 0.6; for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; c.beginPath(); c.moveTo(x - Math.cos(a) * 2.6, y - Math.sin(a) * 3); c.lineTo(x + Math.cos(a) * 2.6, y + Math.sin(a) * 3); c.stroke(); }
      c.fillStyle = '#b08850'; c.beginPath(); c.arc(x, y, 0.8, 0, Math.PI * 2); c.fill();
    }
    const [hx, hy] = A.P(-0.17, 0, 6); c.strokeStyle = '#6b4523'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - 10, hy + 3); c.stroke();
  },
  // bank
  bench(c) {
    shadowBlob(c, 9, 2.4, 0.22);
    A.box(c, -0.13, -0.03, 0.13, 0.03, 5, 6.5, '#9c6b3c');
    for (const dx of [-0.11, 0.11]) A.box(c, dx - 0.012, -0.02, dx + 0.012, 0.02, 0, 5, '#6b4523');
    A.box(c, -0.13, -0.04, 0.13, -0.025, 6.5, 11, '#8a5f33');
  },
  // houtstapel
  logs(c) {
    shadowBlob(c, 11, 3.2);
    for (const [dz, dx] of [[0, -0.06], [0, 0.06], [3.4, 0], [0, 0.18]]) {
      const [x, y] = A.P(dx, 0, dz + 1.8);
      c.fillStyle = '#7a5129'; c.beginPath(); c.ellipse(x - 4.4, y + 2.2, 5.6, 1.8, 0.46, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d6b27a'; c.beginPath(); c.ellipse(x, y + 4.2, 1.6, 1.8, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#9c7444'; c.lineWidth = 0.35; c.beginPath(); c.arc(x, y + 4.2, 0.8, 0, Math.PI * 2); c.stroke();
    }
  },
  // vogelverschrikker in de moestuin
  scare(c) {
    shadowBlob(c, 5, 1.6, 0.2);
    c.strokeStyle = '#6b4523'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -20); c.moveTo(-6, -14); c.lineTo(6, -14); c.stroke();
    c.fillStyle = '#9a5a3a'; c.beginPath(); c.moveTo(-3.5, -15); c.lineTo(3.5, -15); c.lineTo(4, -7); c.lineTo(-4, -7); c.closePath(); c.fill();
    c.fillStyle = '#e8d3a0'; c.beginPath(); c.arc(0, -18, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c9a03a'; c.beginPath(); c.ellipse(0, -20, 4.4, 1.2, 0, 0, Math.PI * 2); c.fill(); c.fillRect(-2, -23, 4, 3);
  },
};

// hekje langs een tegelrand (in tegelruimte getekend op de grondafbeelding is te plat; daarom als spullen)
function fenceSprite(c, along, len) {
  // palen en twee latten; along = 'x' of 'y'; lengte in tegels
  const n = Math.max(2, Math.round(len / 0.16));
  const pt = (t, z) => (along === 'x' ? A.P(-len / 2 + t * len, 0, z) : A.P(0, -len / 2 + t * len, z));
  c.strokeStyle = '#8a6238'; c.lineWidth = 1;
  for (const z of [3, 6.5]) { const a = pt(0, z); const b = pt(1, z); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); }
  for (let k = 0; k <= n; k++) {
    const [x, y] = pt(k / n, 0);
    c.fillStyle = '#6b4523'; c.fillRect(x - 0.6, y - 8.5, 1.2, 8.5);
    c.fillStyle = '#9c6b3c'; c.beginPath(); c.moveTo(x - 0.6, y - 8.5); c.lineTo(x, y - 9.6); c.lineTo(x + 0.6, y - 8.5); c.fill();
  }
}
PROPS.fencex = (c) => fenceSprite(c, 'x', 0.7);
PROPS.fencey = (c) => fenceSprite(c, 'y', 0.7);

// ---------- de grondafbeelding en de lijst met spullen ----------

const DS = 1.25; // resolutie van de grondafbeelding

export function dressKey(s, extra) {
  const parts = [];
  for (const b of s.buildings) if (b.type !== 'wall') parts.push(`${b.type}${b.x},${b.y},${b.level}`);
  return `${parts.join('|')}#${(s.walls || []).length}:${(s.walls || []).reduce((a, w) => (a * 31 + w) | 0, 7)}#${(s.gates || []).join(',')}#${extra}`;
}

// o: { state, seed, shadows(ctx) }
export function buildDress(o) {
  const s = o.state;
  const seed = o.seed || 1;
  const tc = s.buildings.find((b) => b.type === 'tc');
  const age = tc ? tc.level : 1;
  const ring = ringForAge(age);
  const placed = s.buildings.filter((b) => b.type !== 'wall');
  const occ = new Map(); // tegel -> gebouw
  for (const b of placed) {
    const size = BUILDINGS[b.type].size || 1;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) occ.set(`${b.x + dx},${b.y + dy}`, b);
  }
  const wallTiles = new Set();
  for (const t of o.wallTiles || []) wallTiles.add(`${t[0]},${t[1]}`);
  const free = (i, j) => !occ.has(`${i},${j}`) && !wallTiles.has(`${i},${j}`);

  // gebied van de afbeelding: het bouwvierkant + alle gebouwen + marge
  let L = -ring - 4; let R = N + ring + 4;
  for (const b of placed) { L = Math.min(L, b.x - 3); R = Math.max(R, b.x + 5); L = Math.min(L, b.y - 3); R = Math.max(R, b.y + 5); }
  const xa = toWorld(L, R).x - 20; const xb = toWorld(R, L).x + 140;
  const ya = toWorld(L, L).y - 30; const yb = toWorld(R, R).y + 30;
  const W = xb - xa; const H = yb - ya;
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * DS); cv.height = Math.round(H * DS);
  const g = cv.getContext('2d');
  g.scale(DS, DS); g.translate(-xa, -ya);
  const WM = g.getTransform();
  const grid = () => { g.setTransform(WM); g.transform(...ISO); };
  const world = () => g.setTransform(WM);
  let rs = (seed * 7919) % 2147483647 || 1;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const inTown = (gx, gy) => ringOf(Math.floor(gx), Math.floor(gy)) <= ring;

  // 1. bewoonde grond: wat droger, plekjes aangestampte aarde
  grid();
  for (let k = 0; k < 140; k++) {
    const gx = -ring + rnd() * (N + 2 * ring); const gy = -ring + rnd() * (N + 2 * ring);
    const r = 0.4 + rnd() * 1.2;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r);
    const dry = rnd() < 0.6;
    gr.addColorStop(0, dry ? 'rgba(186,170,96,0.16)' : 'rgba(70,95,35,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, r, 0, Math.PI * 2); g.fill();
  }

  // 2. erven voor de deur en zachte donkere voet (ambient occlusion) onder elk gebouw
  for (const b of placed) {
    const size = BUILDINGS[b.type].size || 1;
    const cx = b.x + size / 2; const cy = b.y + size / 2;
    if (b.type !== 'farm') {
      const yard = ['barracks', 'range', 'stable'].includes(b.type) ? 0.75 : b.type === 'tc' || b.type === 'monument' ? 0 : 0.5;
      if (yard) {
        const yx = cx; const yy = b.y + size + 0.15;
        const gr = g.createRadialGradient(yx, yy, 0, yx, yy, yard);
        gr.addColorStop(0, 'rgba(160,128,84,0.6)'); gr.addColorStop(0.7, 'rgba(160,128,84,0.35)'); gr.addColorStop(1, 'rgba(160,128,84,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(yx, yy, yard, yard * 0.75, 0, 0, Math.PI * 2); g.fill();
      }
    }
    if (S3.has(b.type)) continue; // 3D-gebouwen hebben hun eigen schaduw en voet
    const ao = size * 0.78;
    const gr = g.createRadialGradient(cx, cy, size * 0.25, cx, cy, ao);
    gr.addColorStop(0, 'rgba(25,20,8,0.42)'); gr.addColorStop(0.6, 'rgba(25,20,8,0.22)'); gr.addColorStop(1, 'rgba(25,20,8,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, ao, 0, Math.PI * 2); g.fill();
  }

  // 3. moestuintjes naast huizen (rijen groenten), hooiveldjes bij boerderijen
  const gardens = [];
  for (const b of placed) {
    if (b.type !== 'house') continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) {
      const i = b.x + dx; const j = b.y + dy;
      if (!free(i, j) || onRoad(i + 0.5, j + 0.5) || inPlaza(i + 0.5, j + 0.5) || !inTown(i + 0.5, j + 0.5)) continue;
      if (hashInt(i, j, seed + 5) > 0.42 || gardens.some((q) => q.i === i && q.j === j)) continue;
      gardens.push({ i, j, b });
      break;
    }
  }
  for (const q of gardens) {
    const { i, j } = q;
    const x0 = i + 0.14; const y0 = j + 0.14; const w = 0.72; const h = 0.72;
    g.fillStyle = 'rgba(105,74,44,0.9)'; g.fillRect(x0, y0, w, h);
    const along = hashInt(i, j, seed + 6) < 0.5;
    const crop = ['#5f9a3a', '#7fae46', '#3f7a2c', '#9a8a3a'][Math.floor(hashInt(j, i, seed + 7) * 4)];
    for (let r = 0; r < 5; r++) {
      const t = 0.08 + r * 0.14;
      g.fillStyle = 'rgba(70,48,28,0.6)';
      if (along) g.fillRect(x0, y0 + t - 0.02, w, 0.04); else g.fillRect(x0 + t - 0.02, y0, 0.04, h);
      for (let k = 0; k < 6; k++) {
        const u = 0.08 + k * 0.12;
        const px = along ? x0 + u : x0 + t + 0.06; const py = along ? y0 + t + 0.06 : y0 + u;
        g.fillStyle = crop; g.beginPath(); g.arc(px, py, 0.045, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(200,240,140,0.5)'; g.beginPath(); g.arc(px - 0.012, py - 0.012, 0.018, 0, Math.PI * 2); g.fill();
      }
    }
    g.strokeStyle = 'rgba(70,50,30,0.6)'; g.lineWidth = 0.03; g.strokeRect(x0, y0, w, h);
  }

  // 4. paadjes van de deur (voorkant, +y) naar de dichtstbijzijnde straat of het plein
  const goal = (i, j) => onRoad(i + 0.5, j + 0.5) || inPlaza(i + 0.5, j + 0.5);
  const paths = [];
  for (const b of placed) {
    if (['tc', 'farm', 'monument', 'tower'].includes(b.type)) continue;
    const size = BUILDINGS[b.type].size || 1;
    const start = [b.x + Math.floor(size / 2), b.y + size];
    if (!free(...start) && !goal(...start)) continue;
    const prev = new Map(); const q = [start]; prev.set(start.join(','), null);
    let end = null;
    while (q.length && !end) {
      const [i, j] = q.shift();
      if (goal(i, j)) { end = [i, j]; break; }
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const ni = i + dx; const nj = j + dy; const k = `${ni},${nj}`;
        if (prev.has(k) || Math.abs(ni - MID) > ring + 8 || Math.abs(nj - MID) > ring + 8) continue;
        if (!free(ni, nj) && !goal(ni, nj)) continue;
        prev.set(k, [i, j]); q.push([ni, nj]);
      }
      if (prev.size > 400) break;
    }
    if (!end) continue;
    const pts = [];
    for (let c = end; c; c = prev.get(c.join(','))) pts.push([c[0] + 0.5, c[1] + 0.5]);
    pts.reverse();
    pts.unshift([b.x + size / 2, b.y + size - 0.02]);
    // laatste punt op de straat zelf
    const [ex, ey] = pts[pts.length - 1];
    if (Math.abs(ex - MID) < 0.62) pts[pts.length - 1] = [MID, ey]; else if (Math.abs(ey - MID) < 0.62) pts[pts.length - 1] = [ex, MID];
    let sm = pts;
    for (let it = 0; it < 2; it++) {
      const out = [sm[0]];
      for (let k = 0; k < sm.length - 1; k++) { const [ax, ay] = sm[k]; const [bx, by] = sm[k + 1]; out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
      out.push(sm[sm.length - 1]); sm = out;
    }
    paths.push(sm);
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [w, col] of [[0.42, 'rgba(110,88,52,0.3)'], [0.3, 'rgba(162,132,88,0.8)'], [0.12, 'rgba(204,180,132,0.45)']]) {
    g.strokeStyle = col; g.lineWidth = w;
    for (const p of paths) { g.beginPath(); g.moveTo(...p[0]); for (const q of p.slice(1)) g.lineTo(...q); g.stroke(); }
  }
  for (const p of paths) {
    for (let k = 1; k < p.length; k++) {
      if (rnd() < 0.5) continue;
      const [x, y] = p[k]; const side = rnd() < 0.5 ? -1 : 1;
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,112,98,0.7)' : 'rgba(196,186,164,0.7)';
      g.beginPath(); g.arc(x + side * (0.12 + rnd() * 0.06), y + (rnd() - 0.5) * 0.2, 0.025 + rnd() * 0.02, 0, Math.PI * 2); g.fill();
    }
  }

  // 5. geplaveide straten vanaf het Bronstijdperk, met stoeprand
  if (age >= 2) {
    const pave = (horiz) => {
      for (let t = -ring; t < N + ring; t += 0.16) {
        const along = t + 0.08;
        for (let u = -0.42; u < 0.44; u += 0.17) {
          const off = (Math.round(t / 0.16) % 2) * 0.085;
          const gx = horiz ? along : MID + u + off - 0.04; const gy = horiz ? MID + u + off - 0.04 : along;
          if (!horiz && Math.abs(gx - MID) > 0.44) continue;
          if (horiz && Math.abs(gy - MID) > 0.44) continue;
          if (!inTown(gx, gy)) continue;
          const v = rnd();
          g.fillStyle = `rgb(${150 + v * 50},${140 + v * 46},${118 + v * 40})`;
          g.beginPath(); g.ellipse(gx, gy, 0.075, 0.065, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,240,0.22)'; g.beginPath(); g.ellipse(gx - 0.015, gy - 0.02, 0.04, 0.03, 0, 0, Math.PI * 2); g.fill();
        }
      }
    };
    g.save();
    g.beginPath(); g.rect(-ring, -ring, N + 2 * ring, N + 2 * ring); g.arc(MID, MID, PLAZA - 0.12, 0, Math.PI * 2); g.clip('evenodd');
    g.fillStyle = 'rgba(96,86,70,0.55)';
    g.fillRect(-ring, MID - 0.5, N + 2 * ring, 1); g.fillRect(MID - 0.5, -ring, 1, N + 2 * ring);
    pave(true); pave(false);
    g.strokeStyle = 'rgba(120,112,100,0.95)'; g.lineWidth = 0.06;
    for (const side of [-0.5, 0.5]) {
      g.beginPath(); g.moveTo(-ring, MID + side); g.lineTo(N + ring, MID + side); g.moveTo(MID + side, -ring); g.lineTo(MID + side, N + ring); g.stroke();
    }
    g.restore();
    // plein: een rand van grotere stenen
    g.strokeStyle = 'rgba(110,100,86,0.9)'; g.lineWidth = 0.08;
    g.beginPath(); g.arc(MID, MID, PLAZA - 0.15, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(220,210,186,0.6)'; g.lineWidth = 0.03;
    g.beginPath(); g.arc(MID, MID, PLAZA - 0.22, 0, Math.PI * 2); g.stroke();
  }

  // 6. zachte slagschaduwen van gebouwen en muren
  world();
  g.save();
  if ('filter' in g) g.filter = 'blur(2.5px)';
  o.shadows(g);
  g.restore();

  // ---------- losse spullen ----------
  const props = [];
  const lamps = [];
  const take = new Set();
  const add = (kind, gx, gy, v = 0, s = 1) => {
    const k = `${Math.floor(gx)},${Math.floor(gy)}`;
    if (!free(Math.floor(gx), Math.floor(gy))) return false;
    props.push({ kind, gx, gy, v, s, depth: gx + gy });
    take.add(k);
    return true;
  };
  // lantaarns langs de straten
  if (age >= 2) {
    for (let t = -ring; t < N + ring; t += 2) {
      for (const side of [-0.6, 0.6]) {
        for (const horiz of [true, false]) {
          const a = t + 0.5 + (side > 0 ? 1 : 0);
          const gx = horiz ? a : MID + side; const gy = horiz ? MID + side : a;
          if (inPlaza(gx, gy) || !inTown(gx, gy)) continue;
          if (hashInt(Math.round(gx * 3), Math.round(gy * 3), seed + 21) < 0.35) continue;
          if (add('lamp', gx, gy, age >= 3 ? 1 : 0, 0.95)) lamps.push({ gx, gy });
        }
      }
    }
  }
  // een put aan de rand van het plein, banken eromheen
  for (const [gx, gy] of [[MID - 2.4, MID + 2.4], [MID + 2.4, MID - 2.4], [MID + 2.5, MID + 2.1], [MID - 2.5, MID - 2.1]]) {
    if (add('well', gx, gy, 0, 1)) break;
  }
  if (age >= 2) for (const [gx, gy] of [[MID - 3.05, MID + 1.2], [MID + 1.2, MID - 3.05]]) add('bench', gx, gy);
  // tussen de gebouwen
  const NEAR = { house: 'house', farm: 'farm', storage: 'store', market: 'store', smithy: 'store', lumber: 'wood', barracks: 'army', range: 'army', stable: 'stable', workshop: 'wood', quarry: 'store', goldmine: 'store' };
  for (let j = -ring - 1; j < N + ring + 1; j++) {
    for (let i = -ring - 1; i < N + ring + 1; i++) {
      if (!free(i, j) || onRoad(i + 0.5, j + 0.5) || inPlaza(i + 0.5, j + 0.5)) continue;
      if (gardens.some((q) => q.i === i && q.j === j)) {
        if (hashInt(i, j, seed + 30) < 0.5) add(hashInt(i, j, seed + 31) < 0.5 ? 'fencex' : 'fencey', i + 0.5, j + (hashInt(i, j, seed + 31) < 0.5 ? 0.97 : 0.5), 0, 1);
        if (hashInt(i, j, seed + 32) < 0.25) add('scare', i + 0.5, j + 0.5);
        continue;
      }
      const near = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const b = occ.get(`${i + dx},${j + dy}`);
        if (b && NEAR[b.type]) near.push([NEAR[b.type], dx, dy]);
      }
      const h = hashInt(i, j, seed + 40); const h2 = hashInt(j, i, seed + 41);
      const town = inTown(i + 0.5, j + 0.5);
      // spullen staan aan de kant van het gebouw ernaast, zodat het midden van de tegel open blijft
      const at = (dx, dy) => [i + 0.5 + dx * 0.3 + (h2 - 0.5) * 0.2, j + 0.5 + dy * 0.3 + (h - 0.5) * 0.2];
      if (near.length) {
        const [type, dx, dy] = near[Math.floor(h2 * near.length)];
        const [gx, gy] = at(dx, dy);
        if (type === 'house') {
          if (h < 0.22) add('fruit', gx, gy, Math.floor(h2 * 3), 0.9);
          else if (h < 0.42) add('flowers', gx, gy, Math.floor(h2 * 4));
          else if (h < 0.55) add('bush', gx, gy, Math.floor(h2 * 3));
          else if (h < 0.62) add('barrels', gx, gy, 0);
        } else if (type === 'farm') { if (h < 0.45) add('hay', gx, gy, Math.floor(h2 * 2)); }
        else if (type === 'store') { if (h < 0.3) add('crates', gx, gy, Math.floor(h2 * 2)); else if (h < 0.5) add('barrels', gx, gy, 1); else if (h < 0.62) add('cart', gx, gy, Math.floor(h2 * 3)); }
        else if (type === 'wood') { if (h < 0.5) add('logs', gx, gy); }
        else if (type === 'stable') { if (h < 0.5) add('hay', gx, gy, 1); }
        else if (type === 'army') { if (h < 0.35) add('barrels', gx, gy, 0); else if (h < 0.5) add('crates', gx, gy, 0); }
      } else if (town) {
        if (h < 0.08) add('fruit', i + 0.3 + h2 * 0.4, j + 0.3 + h * 2, Math.floor(h2 * 3), 0.85);
        else if (h < 0.16) add('bush', i + 0.3 + h2 * 0.4, j + 0.5, Math.floor(h2 * 3));
        else if (h < 0.22) add('flowers', i + 0.5, j + 0.3 + h2 * 0.4, Math.floor(h2 * 4));
      }
    }
  }
  return { cv, x: xa, y: ya, W, H, scale: DS, props, lamps };
}
