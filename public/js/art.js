// Procedurele isometrische tekeningen: gebouwen, bomen, mensen, tenten...
// Alles wordt met Canvas 2D getekend, zonder externe afbeeldingen.
// Coördinaten: (x, y) in tegels t.o.v. het midden van het grondvlak, z in pixels omhoog.

export const TW = 64;
export const TH = 32;
const SCALE = 2; // sprites worden op dubbele resolutie gecachet voor scherpte bij inzoomen

export const P = (x, y, z = 0) => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];

// ---------- kleuren ----------
function hexToRgb(h) {
  if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const f = (c) => Math.round(c + (t - c) * p);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function mix(a, b, t) {
  const A = hexToRgb(a); const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
const mat = (c) => ({ top: shade(c, 0.12), left: shade(c, -0.06), right: shade(c, -0.24) });

const C = {
  plaster: '#efe2c0', timber: '#6b4527', stone: '#bdb5a6', stoneDark: '#8f887c', wood: '#a8743f',
  woodDark: '#7a5129', thatch: '#d8ae52', roof: '#c25a3c', roofDark: '#86402c', slate: '#5f6b7d',
  dirt: '#a98a55', soil: '#7d5b34', wheat: '#e6c45a', leaf: '#5f9e3e', gold: '#f2c230', iron: '#7c8692',
  window: '#3b3226', glass: '#f6d77a',
};

// ---------- basisvormen ----------
export function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke(); }
}

const EDGE = 'rgba(40,25,10,0.35)';

export function box(ctx, x0, y0, x1, y1, z0, z1, color, edge = EDGE) {
  const c = typeof color === 'string' ? mat(color) : color;
  poly(ctx, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c.left, edge);
  poly(ctx, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c.right, edge);
  poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], c.top, edge);
}

// vlak op de linkervoorkant (y = vast) of rechtervoorkant (x = vast)
function quadL(ctx, y, xa, xb, za, zb, fill, stroke) {
  poly(ctx, [P(xa, y, za), P(xb, y, za), P(xb, y, zb), P(xa, y, zb)], fill, stroke);
}
function quadR(ctx, x, ya, yb, za, zb, fill, stroke) {
  poly(ctx, [P(x, ya, za), P(x, yb, za), P(x, yb, zb), P(x, ya, zb)], fill, stroke);
}
function ground(ctx, x0, y0, x1, y1, fill, stroke) {
  poly(ctx, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], fill, stroke);
}

function gableX(ctx, x0, y0, x1, y1, z, h, color, wall, oh = 0.06) {
  const ym = (y0 + y1) / 2;
  const a = x0 - oh; const b = x1 + oh; const c0 = y0 - oh; const c1 = y1 + oh;
  poly(ctx, [P(a, c0, z), P(b, c0, z), P(b, ym, z + h), P(a, ym, z + h)], shade(color, -0.15), EDGE);
  poly(ctx, [P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + h)], shade(wall || color, -0.24), EDGE);
  poly(ctx, [P(a, c1, z), P(b, c1, z), P(b, ym, z + h), P(a, ym, z + h)], shade(color, 0), EDGE);
  // nok
  ctx.strokeStyle = shade(color, -0.35); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(...P(a, ym, z + h)); ctx.lineTo(...P(b, ym, z + h)); ctx.stroke();
}

function gableY(ctx, x0, y0, x1, y1, z, h, color, wall, oh = 0.06) {
  const xm = (x0 + x1) / 2;
  const a = y0 - oh; const b = y1 + oh; const c0 = x0 - oh; const c1 = x1 + oh;
  poly(ctx, [P(c0, a, z), P(c0, b, z), P(xm, b, z + h), P(xm, a, z + h)], shade(color, -0.1), EDGE);
  poly(ctx, [P(x0, y1, z), P(x1, y1, z), P(xm, y1, z + h)], shade(wall || color, -0.06), EDGE);
  poly(ctx, [P(c1, a, z), P(c1, b, z), P(xm, b, z + h), P(xm, a, z + h)], shade(color, -0.22), EDGE);
  ctx.strokeStyle = shade(color, -0.4); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(...P(xm, a, z + h)); ctx.lineTo(...P(xm, b, z + h)); ctx.stroke();
}

function hipRoof(ctx, x0, y0, x1, y1, z, h, color, oh = 0.06) {
  const xm = (x0 + x1) / 2; const ym = (y0 + y1) / 2;
  const a = x0 - oh; const b = x1 + oh; const c = y0 - oh; const d = y1 + oh;
  const apex = P(xm, ym, z + h);
  poly(ctx, [P(a, c, z), P(b, c, z), apex], shade(color, -0.12), EDGE);
  poly(ctx, [P(a, c, z), P(a, d, z), apex], shade(color, 0.05), EDGE);
  poly(ctx, [P(a, d, z), P(b, d, z), apex], shade(color, -0.02), EDGE);
  poly(ctx, [P(b, c, z), P(b, d, z), apex], shade(color, -0.22), EDGE);
}

function crenels(ctx, x0, y0, x1, y1, z, color, n = 4, hgt = 4) {
  const w = (x1 - x0) / (n * 2 - 1);
  const d = (y1 - y0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) box(ctx, x0 + i * 2 * w, y0, x0 + i * 2 * w + w, y0 + 0.06, z, z + hgt, color);
  for (let i = 0; i < n; i++) box(ctx, x0, y0 + i * 2 * d, x0 + 0.06, y0 + i * 2 * d + d, z, z + hgt, color);
  for (let i = 0; i < n; i++) box(ctx, x1 - 0.06, y0 + i * 2 * d, x1, y0 + i * 2 * d + d, z, z + hgt, color);
  for (let i = 0; i < n; i++) box(ctx, x0 + i * 2 * w, y1 - 0.06, x0 + i * 2 * w + w, y1, z, z + hgt, color);
}

function shadow(ctx, s = 0.5) {
  ctx.fillStyle = 'rgba(30,40,10,0.22)';
  poly(ctx, [P(-s + 0.05, -s + 0.12), P(s + 0.18, -s + 0.12), P(s + 0.18, s + 0.12), P(-s + 0.05, s + 0.12)], 'rgba(30,40,10,0.2)');
}

function windowL(ctx, y, x, z, w = 0.08, h = 6) { quadL(ctx, y + 0.001, x, x + w, z, z + h, C.window); quadL(ctx, y + 0.002, x + 0.01, x + w - 0.01, z + 1, z + h - 1, 'rgba(246,215,122,0.55)'); }
function windowR(ctx, x, y, z, w = 0.08, h = 6) { quadR(ctx, x + 0.001, y, y + w, z, z + h, C.window); quadR(ctx, x + 0.002, y + 0.01, y + w - 0.01, z + 1, z + h - 1, 'rgba(246,215,122,0.4)'); }
function doorL(ctx, y, x, w = 0.1, h = 10, col = C.woodDark) { quadL(ctx, y + 0.001, x, x + w, 0, h, col, EDGE); }

function cyl(ctx, cx, cy, r, len, color) {
  // liggende boomstam langs de x-as (in schermruimte schuin)
  const [ax, ay] = P(cx - len / 2, cy, r);
  const [bx, by] = P(cx + len / 2, cy, r);
  ctx.strokeStyle = shade(color, -0.1); ctx.lineWidth = r * 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#d9b27a';
  ctx.beginPath(); ctx.ellipse(bx, by, r * 0.75, r, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a5d32'; ctx.lineWidth = 0.6; ctx.stroke();
}

function barrel(ctx, x, y, s = 1) {
  const [sx, sy] = P(x, y);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(sx - 3 * s, sy - 8 * s, 6 * s, 8 * s);
  ctx.fillStyle = '#a8743f';
  ctx.beginPath(); ctx.ellipse(sx, sy - 8 * s, 3 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a3220'; ctx.fillRect(sx - 3 * s, sy - 6 * s, 6 * s, 0.8 * s); ctx.fillRect(sx - 3 * s, sy - 2.5 * s, 6 * s, 0.8 * s);
}

function crate(ctx, x, y, s = 0.09, col = '#b8874c') {
  box(ctx, x - s, y - s, x + s, y + s, 0, s * 70, col);
}

// ---------- gebouwen ----------

function house(ctx, L) {
  shadow(ctx, 0.36);
  if (L <= 1) {
    box(ctx, -0.28, -0.22, 0.28, 0.22, 0, 15, C.plaster);
    quadL(ctx, 0.221, -0.28, -0.25, 0, 15, C.timber); quadL(ctx, 0.221, 0.25, 0.28, 0, 15, C.timber);
    doorL(ctx, 0.22, -0.06, 0.12, 10);
    windowR(ctx, 0.28, -0.06, 6, 0.1, 5);
    gableX(ctx, -0.28, -0.22, 0.28, 0.22, 15, 15, C.thatch, C.plaster, 0.08);
  } else if (L === 2) {
    box(ctx, -0.34, -0.27, 0.34, 0.27, 0, 19, C.plaster);
    for (const x of [-0.34, -0.1, 0.12]) quadL(ctx, 0.271, x, x + 0.03, 0, 19, C.timber);
    quadL(ctx, 0.271, -0.34, 0.34, 9, 10.5, C.timber);
    doorL(ctx, 0.27, -0.06, 0.13, 11);
    windowL(ctx, 0.27, 0.17, 11, 0.1, 6); windowL(ctx, 0.27, -0.28, 11, 0.1, 6);
    windowR(ctx, 0.34, -0.12, 9, 0.12, 6);
    box(ctx, 0.12, -0.16, 0.22, -0.06, 19, 36, C.stoneDark);
    gableX(ctx, -0.34, -0.27, 0.34, 0.27, 19, 16, C.roof, C.plaster);
  } else {
    box(ctx, -0.36, -0.3, 0.36, 0.3, 0, 12, C.stone);
    box(ctx, -0.38, -0.32, 0.38, 0.32, 12, 28, C.plaster);
    for (const x of [-0.38, -0.13, 0.12, 0.35]) quadL(ctx, 0.321, x, x + 0.03, 12, 28, C.timber);
    for (const y of [-0.32, -0.02, 0.29]) quadR(ctx, 0.381, y, y + 0.03, 12, 28, C.timber);
    doorL(ctx, 0.3, -0.05, 0.13, 11);
    windowL(ctx, 0.32, -0.3, 17, 0.12, 7); windowL(ctx, 0.32, 0.18, 17, 0.12, 7);
    windowR(ctx, 0.38, -0.2, 17, 0.12, 7); windowR(ctx, 0.36, 0.05, 3, 0.12, 6);
    box(ctx, -0.25, -0.2, -0.14, -0.09, 28, 47, C.stoneDark);
    gableY(ctx, -0.38, -0.32, 0.38, 0.32, 28, 18, C.roofDark, C.plaster);
  }
}

function farm(ctx, L) {
  ground(ctx, -0.47, -0.47, 0.47, 0.47, C.soil, 'rgba(60,40,20,0.4)');
  const rows = 6;
  const crop = L >= 2 ? C.wheat : '#a7c75a';
  for (let i = 0; i < rows; i++) {
    const y = -0.42 + (i + 0.5) * (0.84 / rows);
    ctx.strokeStyle = shade(crop, i % 2 ? -0.1 : 0.05); ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(...P(-0.42, y, 1)); ctx.lineTo(...P(0.42, y, 1)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,180,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(...P(-0.42, y - 0.02, 2.5)); ctx.lineTo(...P(0.42, y - 0.02, 2.5)); ctx.stroke();
  }
  // hekje
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) {
    const t = -0.47 + (i / 6) * 0.94;
    for (const [x, y] of [[t, 0.47], [0.47, t]]) {
      const [a, b] = P(x, y, 0); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, b - 5); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.moveTo(...P(-0.47, 0.47, 3.5)); ctx.lineTo(...P(0.47, 0.47, 3.5)); ctx.lineTo(...P(0.47, -0.47, 3.5)); ctx.stroke();
  if (L === 1) {
    // vogelverschrikker
    const [sx, sy] = P(0.05, 0.05);
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 18); ctx.moveTo(sx - 6, sy - 13); ctx.lineTo(sx + 6, sy - 13); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(sx - 3, sy - 15, 6, 6);
    ctx.fillStyle = C.thatch; ctx.beginPath(); ctx.arc(sx, sy - 18, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  if (L >= 2) {
    // hooibalen
    const [sx, sy] = P(-0.25, 0.28);
    ctx.fillStyle = '#e0b84c'; ctx.beginPath(); ctx.ellipse(sx, sy - 4, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b48a2c'; ctx.lineWidth = 0.7; ctx.stroke();
  }
  if (L >= 3) {
    // kleine molen (wieken worden geanimeerd getekend)
    box(ctx, -0.42, -0.42, -0.22, -0.22, 0, 26, C.plaster);
    hipRoof(ctx, -0.42, -0.42, -0.22, -0.22, 26, 10, C.roofDark, 0.03);
  }
}

function lumber(ctx, L) {
  shadow(ctx, 0.4);
  // open schuur
  const z = 16 + L * 2;
  for (const [x, y] of [[-0.4, -0.35], [0.05, -0.35], [-0.4, 0], [0.05, 0]]) box(ctx, x, y, x + 0.05, y + 0.05, 0, z, C.woodDark);
  poly(ctx, [P(-0.45, -0.4, z + 4), P(0.12, -0.4, z + 4), P(0.12, 0.08, z - 2), P(-0.45, 0.08, z - 2)], shade(C.wood, -0.05), EDGE);
  quadL(ctx, 0.08, -0.45, 0.12, z - 3, z - 2, C.woodDark);
  // boomstammen
  const logs = 3 + L * 2;
  let n = 0;
  for (let row = 0; row < 3 && n < logs; row++) {
    for (let i = 0; i < 4 - row && n < logs; i++, n++) {
      const r = 3.2;
      const [ax, ay] = P(0.05, 0.12 + i * 0.1 + row * 0.05, r + row * 5.5);
      const [bx, by] = P(0.42, 0.12 + i * 0.1 + row * 0.05, r + row * 5.5);
      ctx.strokeStyle = shade(C.wood, -0.15 + row * 0.05); ctx.lineWidth = r * 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = '#ddb882'; ctx.beginPath(); ctx.arc(bx, by, r - 0.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
  // boomstronk met bijl
  const [sx, sy] = P(-0.25, 0.3);
  ctx.fillStyle = '#7a5129'; ctx.fillRect(sx - 4, sy - 5, 8, 5);
  ctx.fillStyle = '#d9b27a'; ctx.beginPath(); ctx.ellipse(sx, sy - 5, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx + 1, sy - 5); ctx.lineTo(sx + 5, sy - 13); ctx.stroke();
  ctx.fillStyle = C.iron; ctx.fillRect(sx + 3.5, sy - 14, 4, 3);
}

function rockBlob(ctx, x, y, r, col) {
  const [sx, sy] = P(x, y);
  ctx.fillStyle = shade(col, -0.15);
  ctx.beginPath();
  ctx.moveTo(sx - r, sy);
  ctx.lineTo(sx - r * 0.8, sy - r * 0.9); ctx.lineTo(sx - r * 0.1, sy - r * 1.3); ctx.lineTo(sx + r * 0.7, sy - r * 1.0);
  ctx.lineTo(sx + r, sy - r * 0.2); ctx.lineTo(sx + r * 0.6, sy + r * 0.25); ctx.lineTo(sx - r * 0.5, sy + r * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, 0.1);
  ctx.beginPath(); ctx.moveTo(sx - r * 0.8, sy - r * 0.9); ctx.lineTo(sx - r * 0.1, sy - r * 1.3); ctx.lineTo(sx + r * 0.1, sy - r * 0.5); ctx.lineTo(sx - r * 0.6, sy - r * 0.3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.4)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(sx - r, sy); ctx.lineTo(sx - r * 0.8, sy - r * 0.9); ctx.lineTo(sx - r * 0.1, sy - r * 1.3); ctx.lineTo(sx + r * 0.7, sy - r * 1.0); ctx.lineTo(sx + r, sy - r * 0.2); ctx.stroke();
}

function quarry(ctx, L) {
  ground(ctx, -0.46, -0.46, 0.46, 0.46, '#a59d8c', 'rgba(60,50,40,0.3)');
  rockBlob(ctx, -0.2, -0.22, 20 + L * 2, '#a8a294');
  rockBlob(ctx, 0.15, -0.3, 12, '#9a9486');
  const blocks = 2 + L * 2;
  for (let i = 0; i < blocks; i++) {
    const x = 0.05 + (i % 3) * 0.13; const y = 0.1 + Math.floor(i / 3) * 0.14;
    box(ctx, x, y, x + 0.1, y + 0.1, 0, 6, '#d6d0c2');
  }
  // kar
  box(ctx, -0.35, 0.15, -0.12, 0.32, 3, 9, C.wood);
  const [wx, wy] = P(-0.24, 0.33, 3);
  ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.arc(wx, wy, 3, 0, Math.PI * 2); ctx.fill();
}

function goldmine(ctx, L) {
  ground(ctx, -0.46, -0.46, 0.46, 0.46, '#8f8170', 'rgba(60,50,40,0.3)');
  rockBlob(ctx, -0.05, -0.1, 28 + L * 2, '#7d7264');
  // ingang
  const [ex, ey] = P(0.05, 0.12);
  ctx.fillStyle = '#1d150e';
  ctx.beginPath(); ctx.moveTo(ex - 7, ey); ctx.lineTo(ex - 7, ey - 10); ctx.quadraticCurveTo(ex, ey - 17, ex + 7, ey - 10); ctx.lineTo(ex + 7, ey); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.wood; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ex - 8, ey); ctx.lineTo(ex - 8, ey - 12); ctx.lineTo(ex + 8, ey - 12); ctx.lineTo(ex + 8, ey); ctx.stroke();
  // goudklompjes
  const spots = [[-0.3, -0.25, 16], [0.1, -0.35, 12], [-0.15, -0.05, 22], [0.25, -0.1, 8], [-0.35, 0.05, 6]];
  for (let i = 0; i < Math.min(spots.length, 2 + L); i++) {
    const [x, y, z] = spots[i]; const [sx, sy] = P(x, y, z);
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6c0'; ctx.fillRect(sx - 0.8, sy - 1.6, 1.2, 1.2);
  }
  // kar met goud
  box(ctx, 0.2, 0.18, 0.4, 0.36, 3, 9, C.woodDark);
  const [cx, cy] = P(0.3, 0.27, 10);
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.ellipse(cx, cy, 6, 2.5, 0, Math.PI, 0); ctx.fill();
}

function storage(ctx, L) {
  shadow(ctx, 0.42);
  const h = 18 + L * 3;
  box(ctx, -0.4, -0.3, 0.3, 0.25, 0, h, C.wood);
  for (let i = 1; i < 6; i++) quadL(ctx, 0.251, -0.4, 0.3, (h / 6) * i, (h / 6) * i + 0.6, C.woodDark);
  quadL(ctx, 0.252, -0.15, 0.05, 0, 13, '#4a3220', EDGE);
  gableX(ctx, -0.4, -0.3, 0.3, 0.25, h, 12, L >= 3 ? C.slate : C.roofDark, C.wood);
  crate(ctx, 0.38, 0.0, 0.07); crate(ctx, 0.38, 0.18, 0.07);
  if (L >= 2) { barrel(ctx, 0.2, 0.38); barrel(ctx, 0.35, 0.38); }
  if (L >= 3) crate(ctx, -0.25, 0.38, 0.07, '#c99a5c');
}

function banner(ctx, x, y, z, color, h = 12) {
  quadL(ctx, y + 0.003, x, x + 0.1, z - h, z, color, 'rgba(0,0,0,0.3)');
  const [a, b] = P(x + 0.05, y + 0.003, z - h);
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath(); ctx.moveTo(a - 3, b + 1.5); ctx.lineTo(a, b - 2); ctx.lineTo(a + 3, b - 1); ctx.fill();
  const [ex, ey] = P(x + 0.05, y + 0.004, z - h / 2);
  ctx.fillStyle = 'rgba(255,240,200,0.85)'; ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, Math.PI * 2); ctx.fill();
}

function barracks(ctx, L, team) {
  shadow(ctx, 0.46);
  const h = 22 + L * 5;
  if (L >= 3) {
    box(ctx, -0.48, -0.42, -0.26, -0.2, 0, h + 14, C.stoneDark);
    hipRoof(ctx, -0.48, -0.42, -0.26, -0.2, h + 14, 12, C.slate, 0.04);
  }
  box(ctx, -0.42, -0.36, 0.38, 0.32, 0, h, C.stone);
  // stenen voeg
  for (let i = 1; i < 4; i++) quadL(ctx, 0.321, -0.42, 0.38, (h / 4) * i, (h / 4) * i + 0.5, 'rgba(80,70,60,0.35)');
  crenels(ctx, -0.42, -0.36, 0.38, 0.32, h, C.stone, 4, 4);
  quadL(ctx, 0.322, -0.1, 0.1, 0, 14, '#3d2a1a', EDGE);
  banner(ctx, -0.3, 0.32, h - 2, team, 13);
  banner(ctx, 0.18, 0.32, h - 2, team, 13);
  windowR(ctx, 0.38, -0.1, h - 12, 0.08, 6);
  // wapenrek
  const [rx, ry] = P(0.45, 0.4);
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(rx - 8, ry - 6); ctx.lineTo(rx + 4, ry - 12); ctx.stroke();
  for (let i = 0; i < 3 + L; i++) {
    ctx.strokeStyle = '#6b4a2b'; ctx.beginPath(); ctx.moveTo(rx - 7 + i * 3, ry); ctx.lineTo(rx - 5 + i * 3, ry - 18); ctx.stroke();
    ctx.fillStyle = C.iron; ctx.beginPath(); ctx.moveTo(rx - 5 + i * 3, ry - 18); ctx.lineTo(rx - 6 + i * 3, ry - 21); ctx.lineTo(rx - 4 + i * 3, ry - 18); ctx.fill();
  }
}

function target(ctx, x, y) {
  const [sx, sy] = P(x, y);
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx, sy - 12); ctx.lineTo(sx + 3, sy); ctx.stroke();
  const cols = ['#f4efe0', '#c0392b', '#f4efe0', '#c0392b'];
  for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(sx, sy - 13, 6 - i * 1.5, 7 - i * 1.7, 0, 0, Math.PI * 2); ctx.fill(); }
}

function range(ctx, L) {
  shadow(ctx, 0.4);
  box(ctx, -0.42, -0.4, 0.05, 0.05, 0, 18 + L * 3, C.wood);
  quadL(ctx, 0.051, -0.25, -0.1, 0, 11, '#3d2a1a', EDGE);
  gableY(ctx, -0.42, -0.4, 0.05, 0.05, 18 + L * 3, 14, C.thatch, C.wood);
  target(ctx, 0.3, -0.25);
  target(ctx, 0.32, 0.12);
  if (L >= 2) target(ctx, 0.0, 0.35);
  // pijlenbundel
  const [sx, sy] = P(-0.25, 0.3);
  ctx.fillStyle = '#7a5129'; ctx.fillRect(sx - 3, sy - 10, 6, 10);
  ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(sx + i, sy - 10); ctx.lineTo(sx + i * 1.6, sy - 15); ctx.stroke(); }
}

function stable(ctx, L) {
  shadow(ctx, 0.45);
  const h = 16 + L * 3;
  box(ctx, -0.42, -0.42, 0.0, 0.42, 0, h, '#9c6b3c');
  for (const y of [-0.3, 0.0, 0.3]) quadR(ctx, 0.001, y - 0.08, y + 0.08, 0, 11, '#4a3220', EDGE);
  gableY(ctx, -0.42, -0.42, 0.0, 0.42, h, 14, C.roofDark, '#9c6b3c');
  // omheining
  ctx.strokeStyle = '#e4d3ae'; ctx.lineWidth = 1.2;
  const pts = [P(0.08, -0.42, 0), P(0.46, -0.42, 0), P(0.46, 0.42, 0), P(0.08, 0.42, 0)];
  for (let i = 0; i < 3; i++) {
    const [a, b] = pts[i]; const [c, d] = pts[i + 1];
    ctx.beginPath(); ctx.moveTo(a, b - 4); ctx.lineTo(c, d - 4); ctx.moveTo(a, b - 7); ctx.lineTo(c, d - 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, b - 8); ctx.stroke();
  }
  // hooi
  const [hx, hy] = P(0.3, -0.25);
  ctx.fillStyle = '#e0b84c'; ctx.fillRect(hx - 6, hy - 6, 12, 6);
  ctx.fillStyle = '#f0cc66'; ctx.fillRect(hx - 6, hy - 8, 12, 2);
  // drinkbak
  box(ctx, 0.2, 0.15, 0.4, 0.25, 0, 4, C.woodDark);
  quadL(ctx, 0.249, 0.22, 0.38, 3, 4, '#5d9ad1');
}

function smithy(ctx, L) {
  shadow(ctx, 0.42);
  const h = 18 + L * 2;
  box(ctx, -0.4, -0.35, 0.3, 0.3, 0, h, C.stoneDark);
  quadL(ctx, 0.301, -0.25, -0.05, 0, 12, '#2a1d12', EDGE);
  quadL(ctx, 0.302, -0.23, -0.07, 1, 10, 'rgba(255,120,30,0.55)');
  gableX(ctx, -0.4, -0.35, 0.3, 0.3, h, 12, C.slate, C.stoneDark);
  box(ctx, 0.06, -0.25, 0.2, -0.11, h, h + 24, '#6f675c');
  // aambeeld
  const [ax, ay] = P(0.38, 0.32);
  ctx.fillStyle = '#3c4048'; ctx.fillRect(ax - 2, ay - 5, 4, 5);
  ctx.fillStyle = '#5a606b'; ctx.beginPath(); ctx.moveTo(ax - 7, ay - 8); ctx.lineTo(ax + 6, ay - 8); ctx.lineTo(ax + 4, ay - 5); ctx.lineTo(ax - 5, ay - 5); ctx.fill();
  if (L >= 3) { barrel(ctx, -0.15, 0.42); }
}

function awning(ctx, x, y, c1, c2) {
  // kraampje
  for (const [dx, dy] of [[0, 0], [0.22, 0], [0, 0.18], [0.22, 0.18]]) box(ctx, x + dx, y + dy, x + dx + 0.025, y + dy + 0.025, 0, 14, C.woodDark, null);
  box(ctx, x, y + 0.1, x + 0.24, y + 0.2, 0, 7, C.wood);
  for (let i = 0; i < 4; i++) {
    const a = x - 0.02 + i * 0.07;
    poly(ctx, [P(a, y - 0.03, 18), P(a + 0.07, y - 0.03, 18), P(a + 0.07, y + 0.24, 12), P(a, y + 0.24, 12)], i % 2 ? c2 : c1, 'rgba(0,0,0,0.2)');
  }
  const fruit = ['#e74c3c', '#f39c12', '#27ae60', '#8e44ad'];
  for (let i = 0; i < 4; i++) {
    const [fx, fy] = P(x + 0.04 + i * 0.05, y + 0.16, 8);
    ctx.fillStyle = fruit[(i + Math.round(x * 10)) % 4]; ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, Math.PI * 2); ctx.fill();
  }
}

function market(ctx, L) {
  ground(ctx, -0.46, -0.46, 0.46, 0.46, '#cdbb92', 'rgba(80,60,30,0.3)');
  awning(ctx, -0.38, -0.38, '#c0392b', '#f4efe0');
  awning(ctx, 0.08, -0.38, '#2e6fb5', '#f4efe0');
  if (L >= 2) awning(ctx, -0.38, 0.08, '#2f9a4a', '#f4efe0');
  if (L >= 3) awning(ctx, 0.08, 0.08, '#d4a017', '#f4efe0');
  else { barrel(ctx, 0.25, 0.3); crate(ctx, 0.1, 0.32, 0.06); }
}

function tower(ctx, L) {
  shadow(ctx, 0.3);
  const h = 44 + L * 14;
  box(ctx, -0.24, -0.24, 0.24, 0.24, 0, h, C.stone);
  for (let i = 1; i < 6; i++) {
    quadL(ctx, 0.241, -0.24, 0.24, (h / 6) * i, (h / 6) * i + 0.5, 'rgba(80,70,60,0.35)');
    quadR(ctx, 0.241, -0.24, 0.24, (h / 6) * i, (h / 6) * i + 0.5, 'rgba(60,50,40,0.35)');
  }
  windowL(ctx, 0.24, -0.04, h - 18, 0.07, 7);
  windowR(ctx, 0.24, -0.04, h - 30, 0.07, 7);
  quadL(ctx, 0.242, -0.07, 0.07, 0, 12, '#3d2a1a', EDGE);
  box(ctx, -0.3, -0.3, 0.3, 0.3, h, h + 5, C.stoneDark);
  crenels(ctx, -0.3, -0.3, 0.3, 0.3, h + 5, C.stoneDark, 3, 5);
  if (L >= 3) hipRoof(ctx, -0.26, -0.26, 0.26, 0.26, h + 10, 16, C.slate, 0.02);
}

function workshop(ctx, L) {
  shadow(ctx, 0.45);
  box(ctx, -0.42, -0.42, 0.1, 0.05, 0, 22 + L * 4, C.wood);
  quadL(ctx, 0.051, -0.3, 0.0, 0, 16, '#3d2a1a', EDGE);
  gableX(ctx, -0.42, -0.42, 0.1, 0.05, 22 + L * 4, 14, C.roofDark, C.wood);
  ram(ctx, ...P(0.28, 0.28), 1.1);
  // houtstapel
  cyl(ctx, -0.25, 0.3, 2.5, 0.3, C.wood);
  cyl(ctx, -0.25, 0.38, 2.5, 0.3, C.wood);
}

function monument(ctx, L) {
  // 2x2 grondvlak: -0.95 .. 0.95
  ctx.fillStyle = 'rgba(30,40,10,0.2)';
  ground(ctx, -0.95, -0.95, 1.05, 1.05, 'rgba(30,40,10,0.2)');
  ground(ctx, -0.95, -0.95, 0.95, 0.95, '#d9cfb4', 'rgba(80,60,30,0.3)');
  const tiers = Math.max(1, L);
  let z = 0;
  for (let i = 0; i < tiers; i++) {
    const s = 0.8 - i * 0.13;
    const h = 12;
    box(ctx, -s, -s, s, s, z, z + h, i % 2 ? '#e7dcc0' : '#d8c9a2');
    quadL(ctx, s + 0.001, -s, s, z + h - 2, z + h, C.gold);
    quadR(ctx, s + 0.001, -s, s, z + h - 2, z + h, shade(C.gold, -0.2));
    z += h;
  }
  // obelisk met gouden top
  const s = 0.12;
  box(ctx, -s, -s, s, s, z, z + 30 + L * 6, '#efe6cf');
  const top = z + 30 + L * 6;
  poly(ctx, [P(-s, s, top), P(s, s, top), P(0, 0, top + 14)], C.gold, EDGE);
  poly(ctx, [P(s, -s, top), P(s, s, top), P(0, 0, top + 14)], shade(C.gold, -0.25), EDGE);
  // trappen
  box(ctx, -0.2, 0.8, 0.2, 0.95, 0, 4, '#cbbd98');
}

function tc(ctx, L, team) {
  // 2x2 grondvlak
  ctx.fillStyle = 'rgba(30,40,10,0.22)';
  ground(ctx, -0.9, -0.9, 1.05, 1.05, 'rgba(30,40,10,0.2)');
  if (L <= 1) {
    // grote houten langhuis met rieten dak
    box(ctx, -0.7, -0.55, 0.7, 0.55, 0, 22, C.wood);
    for (let i = 1; i < 7; i++) quadL(ctx, 0.551, -0.7 + i * 0.2, -0.69 + i * 0.2, 0, 22, C.woodDark);
    doorL(ctx, 0.55, -0.1, 0.22, 14, '#3d2a1a');
    windowR(ctx, 0.7, -0.2, 9, 0.14, 6);
    gableX(ctx, -0.7, -0.55, 0.7, 0.55, 22, 28, C.thatch, C.wood, 0.1);
    // totem/vlaggenmast op de nok gebeurt in de overlay
    box(ctx, 0.75, 0.6, 0.85, 0.7, 0, 18, C.woodDark);
    const [fx, fy] = P(0.8, 0.65, 22);
    ctx.fillStyle = '#ff9d2e'; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill();
  } else if (L === 2) {
    box(ctx, -0.8, -0.7, 0.8, 0.7, 0, 12, C.stone);
    box(ctx, -0.75, -0.65, 0.75, 0.65, 12, 34, C.plaster);
    for (const x of [-0.75, -0.4, -0.05, 0.3, 0.72]) quadL(ctx, 0.651, x, x + 0.04, 12, 34, C.timber);
    for (const y of [-0.65, -0.25, 0.15, 0.62]) quadR(ctx, 0.751, y, y + 0.04, 12, 34, C.timber);
    quadL(ctx, 0.651, -0.75, 0.75, 22, 23.5, C.timber);
    doorL(ctx, 0.7, -0.12, 0.24, 15, '#3d2a1a');
    windowL(ctx, 0.65, -0.6, 24, 0.12, 7); windowL(ctx, 0.65, 0.45, 24, 0.12, 7);
    windowR(ctx, 0.75, -0.45, 24, 0.12, 7); windowR(ctx, 0.75, 0.25, 24, 0.12, 7);
    hipRoof(ctx, -0.75, -0.65, 0.75, 0.65, 34, 30, C.roof, 0.1);
    box(ctx, -0.12, -0.12, 0.12, 0.12, 50, 66, C.plaster);
    hipRoof(ctx, -0.12, -0.12, 0.12, 0.12, 66, 12, C.roofDark, 0.04);
  } else {
    const big = L >= 4;
    box(ctx, -0.85, -0.85, 0.85, 0.85, 0, 30, C.stone);
    for (let i = 1; i < 5; i++) {
      quadL(ctx, 0.851, -0.85, 0.85, i * 6, i * 6 + 0.5, 'rgba(80,70,60,0.35)');
      quadR(ctx, 0.851, -0.85, 0.85, i * 6, i * 6 + 0.5, 'rgba(60,50,40,0.35)');
    }
    crenels(ctx, -0.85, -0.85, 0.85, 0.85, 30, C.stone, 6, 5);
    // poort
    poly(ctx, [P(-0.16, 0.852, 0), P(0.16, 0.852, 0), P(0.16, 0.852, 14), P(0, 0.852, 20), P(-0.16, 0.852, 14)], '#3d2a1a', EDGE);
    // donjon
    box(ctx, -0.45, -0.45, 0.45, 0.45, 30, 64, big ? '#e6dfcf' : C.stone);
    windowL(ctx, 0.45, -0.2, 46, 0.1, 9); windowL(ctx, 0.45, 0.1, 46, 0.1, 9);
    windowR(ctx, 0.45, -0.2, 46, 0.1, 9); windowR(ctx, 0.45, 0.1, 46, 0.1, 9);
    hipRoof(ctx, -0.45, -0.45, 0.45, 0.45, 64, 28, big ? '#2f5d9e' : C.slate, 0.06);
    // hoektorens
    for (const [x, y] of [[-0.85, -0.85], [0.65, -0.85], [-0.85, 0.65], [0.65, 0.65]]) {
      box(ctx, x, y, x + 0.2, y + 0.2, 0, 44, C.stoneDark);
      hipRoof(ctx, x, y, x + 0.2, y + 0.2, 44, 14, big ? '#2f5d9e' : C.roofDark, 0.03);
      if (big) { const [gx, gy] = P(x + 0.1, y + 0.1, 58); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(gx, gy, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }
    if (big) { const [gx, gy] = P(0, 0, 92); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(gx, gy, 2.6, 0, Math.PI * 2); ctx.fill(); }
  }
}

// ---------- mensen, dieren en machines (in schermruimte) ----------

export function ram(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a5129'; ctx.fillRect(-10, -9, 20, 6);
  ctx.fillStyle = '#9c6b3c'; ctx.beginPath(); ctx.moveTo(-11, -9); ctx.lineTo(0, -17); ctx.lineTo(11, -9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(15, -7); ctx.stroke();
  ctx.fillStyle = C.iron; ctx.fillRect(13, -9.5, 4, 5);
  ctx.fillStyle = '#3a2716';
  for (const wx of [-7, 7]) { ctx.beginPath(); ctx.arc(wx, -2.5, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

const SKIN = ['#f1c9a0', '#e0ac7e', '#c98e5f', '#8d5a3b'];

export function person(ctx, x, y, o = {}) {
  const s = o.s || 1;
  const ph = o.phase || 0;
  const step = o.walking ? Math.sin(ph) * 2.2 * s : 0;
  const bob = o.walking ? Math.abs(Math.sin(ph)) * 0.8 * s : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y, 4 * s, 1.8 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = o.leg || '#4b3a28'; ctx.lineWidth = 1.6 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1.3 * s, y - 5 * s - bob); ctx.lineTo(x - 1.3 * s + step, y - 0.3 * s);
  ctx.moveTo(x + 1.3 * s, y - 5 * s - bob); ctx.lineTo(x + 1.3 * s - step, y - 0.3 * s);
  ctx.stroke();
  ctx.lineCap = 'butt';
  const by = y - 11 * s - bob;
  ctx.fillStyle = o.body || '#8b6a43';
  ctx.beginPath();
  ctx.moveTo(x - 3 * s, by + 7 * s); ctx.lineTo(x - 2.6 * s, by + 1 * s); ctx.quadraticCurveTo(x, by - 0.5 * s, x + 2.6 * s, by + 1 * s);
  ctx.lineTo(x + 3 * s, by + 7 * s); ctx.closePath(); ctx.fill();
  if (o.armor) { ctx.fillStyle = 'rgba(200,205,215,0.55)'; ctx.fillRect(x - 2.4 * s, by + 1.5 * s, 4.8 * s, 3 * s); }
  ctx.fillStyle = SKIN[o.skin || 0];
  ctx.beginPath(); ctx.arc(x, by - 2.2 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
  if (o.helmet) {
    ctx.fillStyle = o.helmet;
    ctx.beginPath(); ctx.arc(x, by - 2.6 * s, 2.7 * s, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 3 * s, by - 2.8 * s, 6 * s, 0.9 * s);
  } else if (o.hat) {
    ctx.fillStyle = o.hat;
    ctx.beginPath(); ctx.ellipse(x, by - 3.8 * s, 3.6 * s, 1.2 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, by - 4 * s, 1.8 * s, Math.PI, 0); ctx.fill();
  }
  const hx = x + 3.2 * s; const hy = by + 4 * s;
  if (o.weapon === 'spear') {
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.moveTo(hx, y - 1 * s); ctx.lineTo(hx + 1 * s, by - 10 * s); ctx.stroke();
    ctx.fillStyle = '#c9ced6'; ctx.beginPath(); ctx.moveTo(hx + 1 * s, by - 13 * s); ctx.lineTo(hx - 0.2 * s, by - 9.5 * s); ctx.lineTo(hx + 2.2 * s, by - 9.5 * s); ctx.fill();
  } else if (o.weapon === 'sword') {
    ctx.strokeStyle = '#d5dae2'; ctx.lineWidth = 1.3 * s;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 2 * s, hy - 7 * s); ctx.stroke();
    ctx.fillStyle = o.team || '#888';
    ctx.beginPath(); ctx.arc(x - 3 * s, by + 4 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
  } else if (o.weapon === 'bow') {
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.arc(hx - 0.5 * s, hy - 2 * s, 5 * s, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,230,200,0.8)'; ctx.lineWidth = 0.4 * s;
    ctx.beginPath(); ctx.moveTo(hx + 1.3 * s, hy - 6.7 * s); ctx.lineTo(hx + 1.3 * s, hy + 2.7 * s); ctx.stroke();
  } else if (o.weapon === 'tool') {
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.moveTo(hx - 1 * s, hy + 2 * s); ctx.lineTo(hx + 2 * s, hy - 6 * s); ctx.stroke();
    ctx.fillStyle = '#9aa1ab'; ctx.fillRect(hx + 0.8 * s, hy - 7.5 * s, 3 * s, 2 * s);
  }
  if (o.carry) {
    ctx.fillStyle = o.carry;
    ctx.beginPath(); ctx.ellipse(x - 0.5 * s, by - 6.5 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
  }
  if (o.team && o.weapon !== 'sword' && o.weapon !== 'tool') {
    ctx.fillStyle = o.team; ctx.fillRect(x - 2.6 * s, by + 3.2 * s, 5.2 * s, 1.3 * s);
  }
}

export function horseman(ctx, x, y, o = {}) {
  const s = o.s || 1;
  const ph = o.phase || 0;
  const g = o.walking ? Math.sin(ph) * 2 * s : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y, 8 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  const col = o.horse || '#7b4f2c';
  ctx.strokeStyle = shade('#5a3a1a', 0); ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [lx, d] of [[-5, g], [-3, -g], [3, -g], [5, g]]) { ctx.moveTo(x + lx * s, y - 6 * s); ctx.lineTo(x + lx * s + d, y - 0.4 * s); }
  ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 7 * s, 3.4 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 5 * s, y - 10 * s); ctx.lineTo(x + 8.5 * s, y - 15 * s); ctx.lineTo(x + 10.5 * s, y - 13.5 * s); ctx.lineTo(x + 7 * s, y - 7.5 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b1d10'; ctx.fillRect(x - 7.5 * s, y - 9 * s, 1.5 * s, 5 * s);
  if (o.team) { ctx.fillStyle = o.team; ctx.fillRect(x - 4 * s, y - 10 * s, 6 * s, 4 * s); }
  person(ctx, x - 0.5 * s, y - 7 * s, { s: s * 0.9, body: o.body, helmet: o.helmet, armor: o.armor, weapon: o.weapon, team: null, skin: o.skin });
}

// ---------- natuur ----------

export function conifer(ctx, x, y, s = 1, tint = 0) {
  ctx.fillStyle = 'rgba(20,40,10,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 2 * s, y, 7 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 1.2 * s, y - 5 * s, 2.4 * s, 5 * s);
  const base = mix('#2f6b34', '#4a7d2c', tint);
  for (let i = 0; i < 3; i++) {
    const w = (8 - i * 2) * s; const yb = y - (4 + i * 6) * s; const yt = yb - 11 * s;
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.moveTo(x - w, yb); ctx.lineTo(x, yt); ctx.lineTo(x + w, yb); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(x - w, yb); ctx.lineTo(x, yt); ctx.lineTo(x - w * 0.15, yb); ctx.closePath(); ctx.fill();
  }
}

export function broadleaf(ctx, x, y, s = 1, tint = 0) {
  ctx.fillStyle = 'rgba(20,40,10,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 2 * s, y, 8 * s, 3.2 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4523'; ctx.fillRect(x - 1.4 * s, y - 9 * s, 2.8 * s, 9 * s);
  const base = mix('#4f9a3a', '#86a83a', tint);
  const blobs = [[-4, -14, 6], [4, -15, 6], [0, -20, 7], [0, -13, 6]];
  for (const [dx, dy, r] of blobs) {
    ctx.fillStyle = base; ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,220,0.18)';
  ctx.beginPath(); ctx.arc(x - 2.5 * s, y - 21 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,30,0,0.18)';
  ctx.beginPath(); ctx.arc(x + 4 * s, y - 13 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
}

export function bush(ctx, x, y, s = 1) {
  ctx.fillStyle = '#4d8a35';
  for (const [dx, dy, r] of [[-2.5, -2, 3], [2.5, -2, 3], [0, -4, 3.2]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x - 1 * s, y - 5 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
}

export function rock(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#8d8778'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-4, -5); ctx.lineTo(1, -7); ctx.lineTo(6, -3); ctx.lineTo(5, 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a9a395'; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(1, -7); ctx.lineTo(0, -2); ctx.lineTo(-5, -1); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function tent(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(2, 0, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(0, -14); ctx.lineTo(10, -3); ctx.lineTo(2, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(0, -14); ctx.lineTo(2, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b1d10'; ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(0, -7); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -18); ctx.stroke();
  ctx.restore();
}

export function fire(ctx, x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, -2); ctx.moveTo(-4, -2); ctx.lineTo(4, 0); ctx.stroke();
  const f = Math.sin(t * 0.012) * 1.2 + Math.sin(t * 0.031) * 0.8;
  const g = ctx.createRadialGradient(0, -3, 0, 0, -3, 12);
  g.addColorStop(0, 'rgba(255,190,80,0.45)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -3, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath(); ctx.moveTo(-3, -1); ctx.quadraticCurveTo(-2, -7 - f, 0, -10 - f); ctx.quadraticCurveTo(2, -7 + f, 3, -1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.moveTo(-1.5, -1); ctx.quadraticCurveTo(-1, -5, 0, -7 + f * 0.5); ctx.quadraticCurveTo(1, -5, 1.5, -1); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function flag(ctx, x, y, h, color, t, s = 1) {
  ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = 1.2 * s;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h * s); ctx.stroke();
  const top = y - h * s;
  const w = 14 * s; const fh = 8 * s;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (let i = 0; i <= 6; i++) {
    const px = x + (w * i) / 6;
    ctx.lineTo(px, top + Math.sin(t * 0.006 + i * 0.9) * 1.6 * s * (i / 6));
  }
  for (let i = 6; i >= 0; i--) {
    const px = x + (w * i) / 6;
    ctx.lineTo(px, top + fh + Math.sin(t * 0.006 + i * 0.9) * 1.6 * s * (i / 6));
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6; ctx.stroke();
}

export function smoke(ctx, x, y, t, seed = 0, s = 1) {
  for (let i = 0; i < 4; i++) {
    const p = ((t * 0.0004 + i / 4 + seed * 0.37) % 1);
    const px = x + Math.sin(p * 6 + seed) * 4 * s + p * 6 * s;
    const py = y - p * 30 * s;
    ctx.fillStyle = `rgba(230,230,230,${0.45 * (1 - p)})`;
    ctx.beginPath(); ctx.arc(px, py, (2 + p * 5) * s, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- sprite-cache ----------

const DRAW = { house, farm, lumber, quarry, goldmine, storage, barracks, range, stable, smithy, market, tower, workshop, monument, tc };
const SIZES = { tc: 2, monument: 2 };

const cache = new Map();

export function buildingSprite(type, level, team = '#c0392b') {
  const key = `${type}:${level}:${team}`;
  let spr = cache.get(key);
  if (spr) return spr;
  const size = SIZES[type] || 1;
  const w = size * TW + 48;
  const h = size * TH + 170;
  const cv = document.createElement('canvas');
  cv.width = w * SCALE; cv.height = h * SCALE;
  const ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);
  const ax = w / 2;
  const ay = h - (size * TH) / 2 - 14;
  ctx.translate(ax, ay);
  (DRAW[type] || house)(ctx, Math.max(1, level), team);
  spr = { cv, w, h, ax, ay };
  cache.set(key, spr);
  return spr;
}

export function drawSprite(ctx, spr, x, y, scale = 1, alpha = 1) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(spr.cv, x - spr.ax * scale, y - spr.ay * scale, spr.w * scale, spr.h * scale);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// steigers voor gebouwen in aanbouw (live getekend omdat de voortgang verandert)
export function scaffold(ctx, x, y, size, progress) {
  ctx.save(); ctx.translate(x, y);
  const s = size === 2 ? 0.85 : 0.4;
  ground(ctx, -s - 0.05, -s - 0.05, s + 0.05, s + 0.05, '#b8955c', 'rgba(60,40,20,0.4)');
  const h = 8 + progress * (size === 2 ? 30 : 18);
  box(ctx, -s * 0.85, -s * 0.85, s * 0.85, s * 0.85, 0, Math.max(2, h * 0.8), '#cdb48a');
  ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 1.3;
  const corners = [[-s, -s], [s, -s], [s, s], [-s, s]];
  for (const [cx, cy] of corners) { ctx.beginPath(); ctx.moveTo(...P(cx, cy, 0)); ctx.lineTo(...P(cx, cy, h + 8)); ctx.stroke(); }
  for (const z of [h * 0.45, h + 6]) {
    ctx.beginPath(); ctx.moveTo(...P(-s, s, z)); ctx.lineTo(...P(s, s, z)); ctx.lineTo(...P(s, -s, z)); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(...P(-s, s, 0)); ctx.lineTo(...P(s, s, h + 6)); ctx.stroke();
  ctx.restore();
}

// ---------- terrein-tegels ----------

export function diamond(ctx, cx, cy, w, h, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - w / 2, cy); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

export const COLORS = C;
