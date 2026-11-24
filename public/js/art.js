// Procedurele isometrische tekeningen: gebouwen, bomen, mensen, tenten...
// Alles wordt met Canvas 2D getekend, zonder externe afbeeldingen.
// Coördinaten: (x, y) in tegels t.o.v. het midden van het grondvlak, z in pixels omhoog.
import { groundTexture } from './nature.js';

export const TW = 64;
export const TH = 32;
// sprites worden op hogere resolutie gecachet voor scherpte bij inzoomen (nog scherper op grote retina-schermen)
const SCALE = typeof window !== 'undefined' && (window.devicePixelRatio || 1) > 1.5 && window.innerWidth > 900 ? 3 : 2;
let grainTex = null;

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
const BASE_C = { ...C }; // basispalet (de volkeren vervangen tijdelijk enkele kleuren)

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

// materiaal afleiden uit de kleur, zodat bestaande tekeningen automatisch textuur krijgen
const STONES = new Set(['#bdb5a6', '#8f887c', '#b9b1a1', '#d3cbb8', '#e6dfcf', '#6f675c', '#a39a89']);
const WOODS = new Set(['#a8743f', '#7a5129', '#9c6b3c', '#9a6a38']);
const PLASTERS = new Set(['#efe2c0', '#efe6cf']);
// ---------- bouwstijlen per volk ----------
// Elk volk vervangt de kleuren van het basispalet en het daktype; alle gebouwen volgen automatisch.
export const STYLES = {
  egypt: {
    roof: 'flat', trim: '#2f6fb5', trim2: '#c0392b', accent: '#d4a017', side: 'palm',
    palette: { plaster: '#e6cf9a', timber: '#b08850', stone: '#d8c08c', stoneDark: '#bca06a', wood: '#c39563', woodDark: '#8a6238', thatch: '#d8c08c', roof: '#d8c08c', roofDark: '#bca06a', slate: '#d8c08c' },
  },
  greek: {
    roof: 'greek', trim: '#2e5fa8', trim2: '#b5523a', accent: '#c9a23a', side: 'amphora',
    palette: { plaster: '#f3efe5', timber: '#ddd5c3', stone: '#ebe5d6', stoneDark: '#cfc7b4', wood: '#d6c8a8', woodDark: '#8a6238', thatch: '#bb5a3c', roof: '#bb5a3c', roofDark: '#a24a32', slate: '#bb5a3c' },
  },
  yamato: {
    roof: 'pagoda', trim: '#b8322a', trim2: '#2e2018', accent: '#d4a017', side: 'lantern',
    palette: { plaster: '#f2ede1', timber: '#3a2a20', stone: '#a29d93', stoneDark: '#7f7a71', wood: '#6a4630', woodDark: '#2e2018', thatch: '#41464f', roof: '#41464f', roofDark: '#33373e', slate: '#41464f' },
  },
  babylon: {
    roof: 'crenel', trim: '#2c5fae', trim2: '#e0b23a', accent: '#e0b23a', side: 'palm',
    palette: { plaster: '#cfae78', timber: '#2c5fae', stone: '#c9a068', stoneDark: '#a98252', wood: '#b48c5c', woodDark: '#7a5a38', thatch: '#c9a068', roof: '#2c5fae', roofDark: '#244e8f', slate: '#2c5fae' },
  },
  persia: {
    roof: 'dome', trim: '#1f9a9a', trim2: '#d4a017', accent: '#d4a017', side: 'cypress',
    palette: { plaster: '#f0e6ce', timber: '#1f9a9a', stone: '#e2d4b6', stoneDark: '#c7b48f', wood: '#c9a77a', woodDark: '#7a5a38', thatch: '#29a9a9', roof: '#29a9a9', roofDark: '#1f8787', slate: '#29a9a9' },
  },
};
let STYLE = null;
for (const st of Object.values(STYLES)) {
  STONES.add(st.palette.stone); STONES.add(st.palette.stoneDark);
  WOODS.add(st.palette.wood); WOODS.add(st.palette.woodDark);
  PLASTERS.add(st.palette.plaster);
}

function materialOf(color) {
  if (typeof color !== 'string') return null;
  if (STONES.has(color)) return 'stone';
  if (WOODS.has(color)) return 'wood';
  if (PLASTERS.has(color)) return 'plaster';
  return null;
}

let rs = 1;
const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };

// textuur op een zijvlak; map(u, z) geeft het schermpunt voor positie u (tegels) en hoogte z
function texFace(ctx, map, u0, u1, z0, z1, kind, ao) {
  const h = z1 - z0; const w = u1 - u0;
  if (h < 5 || w < 0.1) return;
  ctx.save();
  ctx.beginPath();
  const pts = [map(u0, z0), map(u1, z0), map(u1, z1), map(u0, z1)];
  ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath();
  ctx.clip();
  const quad = (ua, ub, za, zb) => { ctx.beginPath(); ctx.moveTo(...map(ua, za)); ctx.lineTo(...map(ub, za)); ctx.lineTo(...map(ub, zb)); ctx.lineTo(...map(ua, zb)); ctx.closePath(); };
  const seg = (ua, za, ub, zb) => { ctx.beginPath(); ctx.moveTo(...map(ua, za)); ctx.lineTo(...map(ub, zb)); ctx.stroke(); };
  ctx.lineWidth = 0.55;
  if (kind === 'stone') {
    // gekapte blokken van ongelijke breedte met een lichte bovenrand en een schaduw onderaan
    const rh = 4.8;
    let r = 0;
    for (let z = z0; z < z1; z += rh, r++) {
      let u = u0 - rnd() * 0.1;
      while (u < u1) {
        const bw = 0.09 + rnd() * 0.09;
        const v = rnd();
        ctx.fillStyle = v < 0.45 ? `rgba(255,250,235,${0.04 + v * 0.28})` : `rgba(25,18,10,${0.03 + (v - 0.45) * 0.3})`;
        quad(u, u + bw, z, z + rh); ctx.fill();
        if (z < z0 + 7 && rnd() < 0.35) { ctx.fillStyle = 'rgba(85,110,45,0.22)'; quad(u, u + bw, z, z + rh * 0.6); ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,248,230,0.32)'; seg(u + 0.008, z + rh - 0.7, u + bw - 0.008, z + rh - 0.7);
        ctx.strokeStyle = 'rgba(40,30,20,0.42)'; seg(u, z, u, z + rh);
        if (v > 0.94) { ctx.strokeStyle = 'rgba(30,22,14,0.5)'; seg(u + bw * 0.3, z + rh * 0.8, u + bw * 0.55, z + rh * 0.3); }
        u += bw;
      }
      ctx.strokeStyle = 'rgba(40,30,20,0.45)'; ctx.lineWidth = 0.7; seg(u0, z, u1, z); ctx.lineWidth = 0.55;
    }
  } else if (kind === 'wood') {
    // planken met een donkere naad, nerf en hier en daar een knoest
    for (let z = z0; z < z1; z += 3.4) {
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(255,225,180,${v * 0.2})` : `rgba(40,20,5,${(v - 0.5) * 0.22})`;
      quad(u0, u1, z, z + 3.4); ctx.fill();
      ctx.strokeStyle = 'rgba(50,28,10,0.45)'; seg(u0, z, u1, z);
      ctx.strokeStyle = 'rgba(255,230,190,0.16)'; seg(u0, z + 2.7, u1, z + 2.7);
      ctx.strokeStyle = 'rgba(70,40,15,0.16)'; ctx.lineWidth = 0.35;
      seg(u0, z + 1.1 + rnd(), u1, z + 1.3 + rnd()); ctx.lineWidth = 0.55;
      if (rnd() < 0.3) { const [kx, ky] = map(u0 + rnd() * w, z + 1.7); ctx.fillStyle = 'rgba(60,32,12,0.5)'; ctx.beginPath(); ctx.ellipse(kx, ky, 0.9, 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    for (let u = u0 + 0.21; u < u1; u += 0.27 + rnd() * 0.1) {
      ctx.strokeStyle = 'rgba(50,28,10,0.3)'; seg(u, z0, u, z1);
      ctx.fillStyle = 'rgba(40,40,45,0.6)';
      for (let z = z0 + 1.7; z < z1; z += 3.4) { const [nx, ny] = map(u + 0.012, z); ctx.fillRect(nx - 0.35, ny - 0.35, 0.7, 0.7); }
    }
  } else if (kind === 'plaster') {
    // vlekkerige kalk, regensporen en een plekje waar de bakstenen doorkomen
    for (let i = 0; i < w * 22; i++) {
      const [x, y] = map(u0 + rnd() * w, z0 + rnd() * h);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(130,100,60,0.07)' : 'rgba(255,255,250,0.12)';
      ctx.beginPath(); ctx.ellipse(x, y, 1.5 + rnd() * 3, 1 + rnd() * 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < w * 40; i++) {
      const [x, y] = map(u0 + rnd() * w, z0 + rnd() * h);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,95,60,0.14)' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, y, 0.9, 0.9);
    }
    if (rnd() < 0.8) {
      const su = u0 + rnd() * w; const [sx, sy] = map(su, z1);
      const g = ctx.createLinearGradient(sx, sy, sx, sy + h * 0.6);
      g.addColorStop(0, 'rgba(110,90,60,0.16)'); g.addColorStop(1, 'rgba(110,90,60,0)');
      ctx.fillStyle = g; quad(su, su + 0.05 + rnd() * 0.06, z1 - h * 0.65, z1); ctx.fill();
    }
    if (h > 10 && w > 0.3 && rnd() < 0.6) {
      const pu = u0 + 0.05 + rnd() * (w - 0.2); const pz = z0 + 2 + rnd() * (h - 8);
      for (let rr = 0; rr < 3; rr++) {
        for (let k = 0; k < 3 - (rr % 2); k++) {
          const ua = pu + k * 0.045 + (rr % 2) * 0.022; const za = pz + rr * 1.8;
          ctx.fillStyle = rnd() < 0.5 ? '#b0704c' : '#9c5f3f'; quad(ua, ua + 0.04, za, za + 1.5); ctx.fill();
        }
      }
    }
  }
  // licht: bovenaan iets lichter, onderaan donkerder
  {
    const [tx, ty] = map((u0 + u1) / 2, z1); const [, by] = map((u0 + u1) / 2, z0);
    const g = ctx.createLinearGradient(tx, ty, tx, by);
    g.addColorStop(0, 'rgba(255,246,225,0.1)'); g.addColorStop(1, 'rgba(25,15,5,0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(...pts.map((p) => p[0])) - 2, Math.min(...pts.map((p) => p[1])) - 2, 400, 400);
  }
  if (ao) {
    const [ax, ay] = map((u0 + u1) / 2, z0);
    const [, by] = map((u0 + u1) / 2, z0 + Math.min(11, h * 0.45));
    const g = ctx.createLinearGradient(ax, ay, ax, by);
    g.addColorStop(0, 'rgba(25,15,5,0.38)'); g.addColorStop(1, 'rgba(25,15,5,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(...pts.map((p) => p[0])) - 2, Math.min(...pts.map((p) => p[1])) - 2, 400, 400);
  }
  ctx.restore();
}

export function box(ctx, x0, y0, x1, y1, z0, z1, color, edge = EDGE, tex = 'auto') {
  const c = typeof color === 'string' ? mat(color) : color;
  const kind = tex === 'auto' ? materialOf(color) : tex;
  const ao = z0 === 0 && z1 > 8 && tex !== 'none';
  rs = (Math.abs(Math.floor((x0 * 997 + y0 * 131 + z1 * 7 + 5) * 1000)) % 2147483646) + 1;
  poly(ctx, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c.left, edge);
  if (tex !== 'none' || ao) texFace(ctx, (u, z) => P(u, y1, z), x0, x1, z0, z1, kind, ao);
  poly(ctx, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c.right, edge);
  if (tex !== 'none' || ao) texFace(ctx, (u, z) => P(x1, u, z), y0, y1, z0, z1, kind, ao);
  poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], c.top, edge);
  if (z1 - z0 > 6 && x1 - x0 > 0.12) {
    // randlicht aan de bovenrand (zon van linksboven)
    ctx.strokeStyle = 'rgba(255,250,235,0.35)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(...P(x0, y1, z1)); ctx.lineTo(...P(x0, y0, z1)); ctx.lineTo(...P(x1, y0, z1)); ctx.stroke();
  }
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

const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

// dakpannen, leien of riet op een dakvlak (eA-eB = dakgoot, rA-rB = nok)
function slopeTex(ctx, eA, eB, rA, rB, color) {
  const thatch = color === C.thatch;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...eA); ctx.lineTo(...eB); ctx.lineTo(...rB); ctx.lineTo(...rA); ctx.closePath();
  ctx.clip();
  const len = Math.hypot(eB[0] - eA[0], eB[1] - eA[1]);
  const rows = thatch ? 5 : 7;
  const at = (s, t) => lerp2(lerp2(eA, eB, s), lerp2(rA, rB, s), t);
  if (thatch) {
    // rietbundels: veel korte halmen, per laag een donkere onderrand
    for (let i = 0; i < len * 5; i++) {
      const sx = rnd(); const t = rnd();
      const p = at(sx, t); const q = at(sx + (rnd() - 0.5) * 0.02, Math.max(0, t - 0.1));
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(115,75,18,0.38)' : 'rgba(255,240,180,0.36)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
    }
  }
  for (let i = 1; i < rows; i++) {
    const t = i / rows;
    const a = lerp2(eA, rA, t); const b = lerp2(eB, rB, t);
    if (thatch) {
      const t2 = t - 0.06;
      ctx.fillStyle = 'rgba(90,55,10,0.18)';
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...lerp2(eB, rB, t2)); ctx.lineTo(...lerp2(eA, rA, t2)); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = thatch ? 'rgba(110,70,15,0.4)' : 'rgba(30,10,5,0.4)';
    ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    if (!thatch) {
      const t2 = (i - 1) / rows;
      const a2 = lerp2(eA, rA, t2); const b2 = lerp2(eB, rB, t2);
      const n = Math.max(3, Math.round(len / 4));
      for (let k = 0; k < n; k++) {
        const u0 = (k + (i % 2) * 0.5) / n; const u1 = u0 + 1 / n;
        const v = rnd();
        ctx.fillStyle = v < 0.5 ? `rgba(255,240,220,${v * 0.26})` : `rgba(20,5,0,${(v - 0.5) * 0.3})`;
        ctx.beginPath(); ctx.moveTo(...lerp2(a2, b2, u0)); ctx.lineTo(...lerp2(a2, b2, u1)); ctx.lineTo(...lerp2(a, b, u1)); ctx.lineTo(...lerp2(a, b, u0)); ctx.closePath(); ctx.fill();
        // bolle pan: licht streepje links, schaduw rechts
        ctx.strokeStyle = 'rgba(255,240,220,0.22)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(...lerp2(a2, b2, u0 + 0.3 / n)); ctx.lineTo(...lerp2(a, b, u0 + 0.3 / n)); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(30,10,5,0.26)'; ctx.lineWidth = 0.5;
      for (let k = 0; k < n; k++) {
        const u = (k + (i % 2) * 0.5) / n;
        ctx.beginPath(); ctx.moveTo(...lerp2(a2, b2, u)); ctx.lineTo(...lerp2(a, b, u)); ctx.stroke();
      }
    }
  }
  if (!thatch) {
    // mos en verkleuring vlak boven de dakgoot
    for (let i = 0; i < len / 9; i++) {
      const [x, y] = at(rnd(), rnd() * 0.45);
      ctx.fillStyle = rnd() < 0.6 ? 'rgba(95,120,55,0.2)' : 'rgba(40,30,20,0.16)';
      ctx.beginPath(); ctx.ellipse(x, y, 1.5 + rnd() * 2.5, 0.8 + rnd(), -0.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // licht naar de nok toe
  const g = ctx.createLinearGradient(...lerp2(eA, eB, 0.5), ...lerp2(rA, rB, 0.5));
  g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(255,245,220,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(Math.min(eA[0], eB[0], rA[0], rB[0]) - 2, Math.min(eA[1], eB[1], rA[1], rB[1]) - 2, len + 60, 200);
  ctx.restore();
  // dikte van de dakrand
  ctx.strokeStyle = shade(color, -0.45); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(...eA); ctx.lineTo(...eB); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,215,0.25)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(eA[0], eA[1] - 0.9); ctx.lineTo(eB[0], eB[1] - 0.9); ctx.stroke();
}

// plat dak met een kroonlijst (Egypte), kantelen (Babylon) of een koepel (Perzië)
function flatRoof(ctx, x0, y0, x1, y1, z, color) {
  const st = STYLE;
  const oh = 0.035;
  box(ctx, x0 - oh, y0 - oh, x1 + oh, y1 + oh, z, z + 3.2, C.stoneDark, EDGE, 'none');
  // gekleurde band onder de dakrand
  const band = (y, a, b) => { for (let u = a; u < b - 0.001; u += 0.08) quadL(ctx, y + 0.002, u, Math.min(b, u + 0.04), z - 2.6, z, st.trim); };
  const bandR = (x, a, b) => { for (let u = a; u < b - 0.001; u += 0.08) quadR(ctx, x + 0.002, u, Math.min(b, u + 0.04), z - 2.6, z, shade(st.trim, -0.2)); };
  band(y1, x0, x1); bandR(x1, y0, y1);
  quadL(ctx, y1 + 0.003, x0, x1, z - 3.4, z - 2.6, st.trim2);
  quadR(ctx, x1 + 0.003, y0, y1, z - 3.4, z - 2.6, shade(st.trim2, -0.2));
  if (st.roof === 'crenel') {
    const n = Math.max(2, Math.round((x1 - x0) / 0.14));
    crenels(ctx, x0 - oh, y0 - oh, x1 + oh, y1 + oh, z + 3.2, C.plaster, n, 4);
  } else if (st.roof === 'dome') {
    dome(ctx, (x0 + x1) / 2, (y0 + y1) / 2, z + 3.2, Math.min(x1 - x0, y1 - y0) * 0.36, st.palette.roof);
  } else {
    // kavetto-kroonlijst
    quadL(ctx, y1 + oh + 0.002, x0 - oh, x1 + oh, z + 3.2, z + 5, shade(C.stone, 0.15));
    quadR(ctx, x1 + oh + 0.002, y0 - oh, y1 + oh, z + 3.2, z + 5, shade(C.stone, -0.1));
  }
}

// koepel met tamboer, ribben en gouden pinakel
export function dome(ctx, gx, gy, z, r, color, onion = false) {
  const [cx, cy] = P(gx, gy, z);
  const rx = r * TW * 0.72; const ry = rx * 0.5;
  const drum = Math.max(3, rx * 0.35);
  ctx.fillStyle = shade(C.plaster, -0.08);
  ctx.fillRect(cx - rx, cy - drum, rx * 2, drum);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = shade(C.plaster, -0.25); ctx.fillRect(cx, cy - drum, rx, drum);
  const top = cy - drum;
  const hgt = rx * (onion ? 1.7 : 1.15);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(cx - rx, top);
    if (onion) { ctx.bezierCurveTo(cx - rx * 1.25, top - hgt * 0.45, cx - rx * 0.2, top - hgt * 0.7, cx, top - hgt); ctx.bezierCurveTo(cx + rx * 0.2, top - hgt * 0.7, cx + rx * 1.25, top - hgt * 0.45, cx + rx, top); }
    else { ctx.bezierCurveTo(cx - rx, top - hgt * 0.75, cx - rx * 0.45, top - hgt, cx, top - hgt); ctx.bezierCurveTo(cx + rx * 0.45, top - hgt, cx + rx, top - hgt * 0.75, cx + rx, top); }
    ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI);
    ctx.closePath();
  };
  path();
  const g = ctx.createLinearGradient(cx - rx, top - hgt, cx + rx, top);
  g.addColorStop(0, shade(color, 0.35)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.6;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * rx * 0.42, top + ry * Math.cos(i * 0.5) * 0.9); ctx.quadraticCurveTo(cx + i * rx * 0.3, top - hgt * 0.6, cx, top - hgt); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(40,30,20,0.4)'; ctx.lineWidth = 0.6; path(); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.fillRect(cx - 0.6, top - hgt - 6, 1.2, 6);
  ctx.beginPath(); ctx.arc(cx, top - hgt - 6.5, 1.6, 0, Math.PI * 2); ctx.fill();
}

// laag Grieks zadeldak met fronton (driehoekig gevelveld met lijst)
function greekGable(ctx, x0, y0, x1, y1, z, h, color, alongX) {
  const hh = Math.max(6, h * 0.5);
  if (alongX) {
    const ym = (y0 + y1) / 2; const a = x0 - 0.05; const b = x1 + 0.05; const c0 = y0 - 0.05; const c1 = y1 + 0.05;
    poly(ctx, [P(a, c0, z), P(b, c0, z), P(b, ym, z + hh), P(a, ym, z + hh)], shade(color, -0.15), EDGE);
    poly(ctx, [P(a, c1, z), P(b, c1, z), P(b, ym, z + hh), P(a, ym, z + hh)], color, EDGE);
    slopeTex(ctx, P(a, c1, z), P(b, c1, z), P(a, ym, z + hh), P(b, ym, z + hh), color);
    poly(ctx, [P(b, c0, z), P(b, c1, z), P(b, ym, z + hh)], C.plaster, 'rgba(90,80,60,0.6)');
    poly(ctx, [P(b, y0 + 0.05, z + 1.2), P(b, y1 - 0.05, z + 1.2), P(b, ym, z + hh - 1.5)], shade(STYLE.trim, -0.1));
  } else {
    const xm = (x0 + x1) / 2; const a = y0 - 0.05; const b = y1 + 0.05; const c0 = x0 - 0.05; const c1 = x1 + 0.05;
    poly(ctx, [P(c0, a, z), P(c0, b, z), P(xm, b, z + hh), P(xm, a, z + hh)], shade(color, -0.05), EDGE);
    poly(ctx, [P(c1, a, z), P(c1, b, z), P(xm, b, z + hh), P(xm, a, z + hh)], shade(color, -0.22), EDGE);
    slopeTex(ctx, P(c1, a, z), P(c1, b, z), P(xm, a, z + hh), P(xm, b, z + hh), color);
    poly(ctx, [P(c0, b, z), P(c1, b, z), P(xm, b, z + hh)], C.plaster, 'rgba(90,80,60,0.6)');
    poly(ctx, [P(x0 + 0.05, b, z + 1.2), P(x1 - 0.05, b, z + 1.2), P(xm, b, z + hh - 1.5)], STYLE.trim);
  }
  // kroonlijst onder het dak
  quadL(ctx, y1 + 0.004, x0, x1, z - 2, z, C.plaster);
  quadR(ctx, x1 + 0.004, y0, y1, z - 2, z, shade(C.plaster, -0.15));
}

// pagodedak: brede overstek, opgekrulde hoeken, donkere pannen
function pagoda(ctx, x0, y0, x1, y1, z, h, color) {
  const oh = 0.13;
  const a = x0 - oh; const b = x1 + oh; const c = y0 - oh; const d = y1 + oh;
  const xm = (x0 + x1) / 2; const ym = (y0 + y1) / 2;
  const hh = Math.max(8, h * 0.8);
  const rx = (x1 - x0) * 0.18; const ry = (y1 - y0) * 0.18;
  const r0 = P(xm - rx, ym, z + hh); const r1 = P(xm + rx, ym, z + hh);
  const lift = 3.5;
  const corner = (x, y) => P(x, y, z + lift);
  const mid = (x, y) => P(x, y, z);
  // achterkant en zijkanten
  poly(ctx, [corner(a, c), corner(b, c), r1, r0], shade(color, -0.18), EDGE);
  poly(ctx, [corner(a, c), corner(a, d), r0], shade(color, 0.06), EDGE);
  // voorkant (links) met doorbuiging
  const front = () => { ctx.beginPath(); ctx.moveTo(...corner(a, d)); ctx.quadraticCurveTo(...mid((a + b) / 2, d), ...corner(b, d)); ctx.lineTo(...r1); ctx.lineTo(...r0); ctx.closePath(); };
  front(); ctx.fillStyle = shade(color, 0); ctx.fill();
  slopeTex(ctx, corner(a, d), corner(b, d), r0, r1, color);
  const side = () => { ctx.beginPath(); ctx.moveTo(...corner(b, c)); ctx.quadraticCurveTo(...mid(b, (c + d) / 2), ...corner(b, d)); ctx.lineTo(...r1); ctx.closePath(); };
  side(); ctx.fillStyle = shade(color, -0.25); ctx.fill();
  // nok met eindstukken
  ctx.strokeStyle = shade(color, -0.45); ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(...r0); ctx.lineTo(...r1); ctx.stroke();
  for (const p of [r0, r1]) { ctx.fillStyle = shade(color, -0.4); ctx.beginPath(); ctx.arc(p[0], p[1] - 1, 1.6, 0, Math.PI * 2); ctx.fill(); }
  // dakrand
  ctx.strokeStyle = shade(color, 0.25); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(...corner(a, d)); ctx.quadraticCurveTo(...mid((a + b) / 2, d), ...corner(b, d)); ctx.quadraticCurveTo(...mid(b, (c + d) / 2), ...corner(b, c)); ctx.stroke();
}

function styledRoof(ctx, x0, y0, x1, y1, z, h, color, alongX) {
  const r = STYLE.roof;
  if (r === 'greek') greekGable(ctx, x0, y0, x1, y1, z, h, color, alongX);
  else if (r === 'pagoda') pagoda(ctx, x0, y0, x1, y1, z, h, color);
  else flatRoof(ctx, x0, y0, x1, y1, z, color);
}

function gableX(ctx, x0, y0, x1, y1, z, h, color, wall, oh = 0.06) {
  if (STYLE) { styledRoof(ctx, x0, y0, x1, y1, z, h, color, true); return; }
  const ym = (y0 + y1) / 2;
  const a = x0 - oh; const b = x1 + oh; const c0 = y0 - oh; const c1 = y1 + oh;
  poly(ctx, [P(a, c0, z), P(b, c0, z), P(b, ym, z + h), P(a, ym, z + h)], shade(color, -0.15), EDGE);
  poly(ctx, [P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + h)], shade(wall || color, -0.24), EDGE);
  if (materialOf(wall)) { rs = 77; ctx.save(); ctx.beginPath(); ctx.moveTo(...P(x1, y0, z)); ctx.lineTo(...P(x1, y1, z)); ctx.lineTo(...P(x1, ym, z + h)); ctx.closePath(); ctx.clip(); texFace(ctx, (u, zz) => P(x1, u, zz), y0, y1, z, z + h, materialOf(wall), false); ctx.restore(); }
  poly(ctx, [P(a, c1, z), P(b, c1, z), P(b, ym, z + h), P(a, ym, z + h)], shade(color, 0), EDGE);
  slopeTex(ctx, P(a, c1, z), P(b, c1, z), P(a, ym, z + h), P(b, ym, z + h), color);
  // nok
  ctx.strokeStyle = shade(color, -0.35); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(...P(a, ym, z + h)); ctx.lineTo(...P(b, ym, z + h)); ctx.stroke();
}

function gableY(ctx, x0, y0, x1, y1, z, h, color, wall, oh = 0.06) {
  if (STYLE) { styledRoof(ctx, x0, y0, x1, y1, z, h, color, false); return; }
  const xm = (x0 + x1) / 2;
  const a = y0 - oh; const b = y1 + oh; const c0 = x0 - oh; const c1 = x1 + oh;
  poly(ctx, [P(c0, a, z), P(c0, b, z), P(xm, b, z + h), P(xm, a, z + h)], shade(color, -0.1), EDGE);
  poly(ctx, [P(x0, y1, z), P(x1, y1, z), P(xm, y1, z + h)], shade(wall || color, -0.06), EDGE);
  poly(ctx, [P(c1, a, z), P(c1, b, z), P(xm, b, z + h), P(xm, a, z + h)], shade(color, -0.22), EDGE);
  slopeTex(ctx, P(c1, a, z), P(c1, b, z), P(xm, a, z + h), P(xm, b, z + h), color);
  ctx.strokeStyle = shade(color, -0.4); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(...P(xm, a, z + h)); ctx.lineTo(...P(xm, b, z + h)); ctx.stroke();
}

function hipRoof(ctx, x0, y0, x1, y1, z, h, color, oh = 0.06) {
  if (STYLE && !STYLE.plainHip) {
    const r = STYLE.roof;
    if (r === 'pagoda') { pagoda(ctx, x0, y0, x1, y1, z, h, color); return; }
    if (r === 'greek') { greekGable(ctx, x0, y0, x1, y1, z, h, color, true); return; }
    if (r === 'dome') { box(ctx, x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, z, z + 2.5, C.stoneDark, EDGE, 'none'); dome(ctx, (x0 + x1) / 2, (y0 + y1) / 2, z + 2.5, Math.min(x1 - x0, y1 - y0) * 0.42, STYLE.palette.roof, x1 - x0 < 0.35); return; }
    if (r === 'flat') { // Egyptische piramidevorm met gouden top
      STYLE.plainHip = true; hipRoof(ctx, x0, y0, x1, y1, z, h * 0.9, C.stone, 0.02); STYLE.plainHip = false;
      const [tx, ty] = P((x0 + x1) / 2, (y0 + y1) / 2, z + h * 0.9);
      ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 3.5, ty + 4); ctx.lineTo(tx + 3.5, ty + 4); ctx.closePath(); ctx.fill();
      return;
    }
    flatRoof(ctx, x0, y0, x1, y1, z, color); return;
  }
  const xm = (x0 + x1) / 2; const ym = (y0 + y1) / 2;
  const a = x0 - oh; const b = x1 + oh; const c = y0 - oh; const d = y1 + oh;
  const apex = P(xm, ym, z + h);
  poly(ctx, [P(a, c, z), P(b, c, z), apex], shade(color, -0.12), EDGE);
  poly(ctx, [P(a, c, z), P(a, d, z), apex], shade(color, 0.05), EDGE);
  poly(ctx, [P(a, d, z), P(b, d, z), apex], shade(color, -0.02), EDGE);
  if (b - a > 0.3) slopeTex(ctx, P(a, d, z), P(b, d, z), apex, apex, color);
  poly(ctx, [P(b, c, z), P(b, d, z), apex], shade(color, -0.22), EDGE);
  if (b - a > 0.3) slopeTex(ctx, P(b, d, z), P(b, c, z), apex, apex, color);
}

function crenels(ctx, x0, y0, x1, y1, z, color, n = 4, hgt = 4) {
  const w = (x1 - x0) / (n * 2 - 1);
  const d = (y1 - y0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) box(ctx, x0 + i * 2 * w, y0, x0 + i * 2 * w + w, y0 + 0.06, z, z + hgt, color);
  for (let i = 0; i < n; i++) box(ctx, x0, y0 + i * 2 * d, x0 + 0.06, y0 + i * 2 * d + d, z, z + hgt, color);
  for (let i = 0; i < n; i++) box(ctx, x1 - 0.06, y0 + i * 2 * d, x1, y0 + i * 2 * d + d, z, z + hgt, color);
  for (let i = 0; i < n; i++) box(ctx, x0 + i * 2 * w, y1 - 0.06, x0 + i * 2 * w + w, y1, z, z + hgt, color);
}

function shadow(ctx, s = 0.5, flowers = false) {
  // contactschaduw onder het gebouw (de lange slagschaduw tekent de stadsweergave)
  poly(ctx, [P(-s - 0.02, -s - 0.02), P(s + 0.06, -s - 0.02), P(s + 0.06, s + 0.06), P(-s - 0.02, s + 0.06)], 'rgba(30,40,10,0.22)');
  tufts(ctx, s, flowers);
}

// aangestampte aarde rond een gebouw: het gebouw staat zo echt in het landschap
function apron(ctx, size, type) {
  if (type === 'farm' || type === 'monument') return;
  const s = size === 2 ? 1.02 : 0.52;
  const stony = type === 'quarry' || type === 'goldmine' || type === 'tower';
  const base = stony ? [150, 140, 120] : [152, 124, 80];
  const col = (a) => `rgba(${base[0]},${base[1]},${base[2]},${a})`;
  for (let k = 0; k < 26; k++) {
    const side = k % 4; const u = (rnd() * 2 - 1) * s;
    const gx = side === 0 ? u : side === 1 ? s : side === 2 ? u : -s;
    const gy = side === 0 ? s : side === 1 ? u : side === 2 ? -s : u;
    const [x, y] = P(gx * 0.92, gy * 0.92);
    const r = 5 + rnd() * 8;
    ctx.fillStyle = col(0.28 + rnd() * 0.2);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  poly(ctx, [P(-s, -s), P(s, -s), P(s, s), P(-s, s)], col(0.55));
  poly(ctx, [P(-s * 0.75, -s * 0.75), P(s * 0.75, -s * 0.75), P(s * 0.75, s * 0.75), P(-s * 0.75, s * 0.75)], col(0.35));
  for (let k = 0; k < 18; k++) {
    const [x, y] = P((rnd() * 2 - 1) * s, (rnd() * 2 - 1) * s);
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,70,45,0.45)' : 'rgba(235,220,185,0.5)';
    ctx.beginPath(); ctx.ellipse(x, y, 1.2, 0.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- spullen rond gebouwen ----------

function propBarrel(ctx, gx, gy) {
  const [x, y] = P(gx, gy);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 0.5, 4.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a5a2c'; ctx.fillRect(x - 3.2, y - 8, 6.4, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 0.8, y - 8, 2.4, 8);
  ctx.fillStyle = 'rgba(255,230,190,0.2)'; ctx.fillRect(x - 2.8, y - 8, 1, 8);
  ctx.fillStyle = '#5a5f66'; ctx.fillRect(x - 3.3, y - 6.8, 6.6, 0.9); ctx.fillRect(x - 3.3, y - 2.2, 6.6, 0.9);
  ctx.fillStyle = '#a8743f'; ctx.beginPath(); ctx.ellipse(x, y - 8, 3.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.lineWidth = 0.5; ctx.stroke();
}
function propCrates(ctx, gx, gy) {
  box(ctx, gx - 0.08, gy - 0.08, gx + 0.06, gy + 0.06, 0, 8, '#a8743f');
  box(ctx, gx + 0.07, gy - 0.02, gx + 0.17, gy + 0.08, 0, 6, '#9a6a38');
  box(ctx, gx - 0.05, gy - 0.05, gx + 0.04, gy + 0.04, 8, 14, '#a8743f');
}
function propSacks(ctx, gx, gy) {
  for (const [dx, dy, z] of [[0, 0, 0], [0.09, 0.03, 0], [0.04, 0.01, 5]]) {
    const [x, y] = P(gx + dx, gy + dy, z);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; if (!z) { ctx.beginPath(); ctx.ellipse(x + 1, y + 0.5, 3.6, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d9c497'; ctx.beginPath(); ctx.ellipse(x, y - 3, 3.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,90,50,0.35)'; ctx.beginPath(); ctx.ellipse(x + 1, y - 2.2, 2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6a3c'; ctx.fillRect(x - 0.7, y - 6.6, 1.4, 1.2);
  }
}
function propHay(ctx, gx, gy) {
  box(ctx, gx - 0.1, gy - 0.07, gx + 0.1, gy + 0.07, 0, 7, '#d8b45a', 'rgba(110,80,20,0.45)', 'none');
  for (let i = 0; i < 10; i++) {
    const [x, y] = P(gx - 0.1 + rnd() * 0.2, gy + 0.07, 1 + rnd() * 5);
    ctx.strokeStyle = 'rgba(150,110,30,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1.5, y - 1); ctx.stroke();
  }
}
function propTrough(ctx, gx, gy) {
  box(ctx, gx - 0.14, gy - 0.05, gx + 0.14, gy + 0.05, 0, 4, '#7a5129');
  poly(ctx, [P(gx - 0.12, gy - 0.035, 4), P(gx + 0.12, gy - 0.035, 4), P(gx + 0.12, gy + 0.035, 4), P(gx - 0.12, gy + 0.035, 4)], '#4f8fc0');
}
function propPots(ctx, gx, gy) {
  for (const [dx, col] of [[0, '#e86f9a'], [0.07, '#f4e04d']]) {
    const [x, y] = P(gx + dx, gy);
    ctx.fillStyle = '#b5603a'; ctx.beginPath(); ctx.moveTo(x - 2, y - 3.5); ctx.lineTo(x + 2, y - 3.5); ctx.lineTo(x + 1.4, y); ctx.lineTo(x - 1.4, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4f8a34'; ctx.beginPath(); ctx.arc(x, y - 4.6, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; for (const [a, b] of [[-1, -5.4], [1, -4.8], [0, -6]]) { ctx.beginPath(); ctx.arc(x + a, y + b, 0.8, 0, Math.PI * 2); ctx.fill(); }
  }
}
function propRack(ctx, gx, gy, team) {
  const [x, y] = P(gx, gy);
  ctx.strokeStyle = '#6b4523'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 5, y - 9); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 5, y - 7); ctx.moveTo(x - 5.5, y - 7.5); ctx.lineTo(x + 5.5, y - 5.5); ctx.stroke();
  ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 0.7;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 3.6 + i * 2.4, y + 0.4 + i * 0.4); ctx.lineTo(x - 2.6 + i * 2.4, y - 15 + i * 0.4); ctx.stroke(); }
  ctx.fillStyle = '#d5dbe2'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 2.6 + i * 2.4, y - 17 + i * 0.4); ctx.lineTo(x - 3.2 + i * 2.4, y - 14.6 + i * 0.4); ctx.lineTo(x - 2 + i * 2.4, y - 14.6 + i * 0.4); ctx.fill(); }
  ctx.fillStyle = team; ctx.beginPath(); ctx.arc(x + 6.5, y - 3, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(x + 6.5, y - 3, 0.9, 0, Math.PI * 2); ctx.fill();
}
function propBlocks(ctx, gx, gy) {
  box(ctx, gx - 0.09, gy - 0.06, gx + 0.05, gy + 0.06, 0, 5, '#bdb5a6');
  box(ctx, gx + 0.06, gy - 0.04, gx + 0.16, gy + 0.06, 0, 5, '#d3cbb8');
  box(ctx, gx - 0.05, gy - 0.04, gx + 0.05, gy + 0.04, 5, 10, '#d3cbb8');
}
function propCart(ctx, gx, gy) {
  box(ctx, gx - 0.12, gy - 0.06, gx + 0.12, gy + 0.06, 3, 7, '#7a5129');
  for (let i = 0; i < 5; i++) { const [x, y] = P(gx - 0.08 + i * 0.04, gy, 8); ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill(); }
  for (const dx of [-0.08, 0.08]) { const [x, y] = P(gx + dx, gy + 0.07, 2.5); ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.ellipse(x, y, 2.4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8a6238'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }
}
function propLogs(ctx, gx, gy) {
  for (const [dz, dx] of [[0, 0], [0, 0.07], [3, 0.035]]) {
    const [x, y] = P(gx + dx, gy, dz + 1.6);
    ctx.fillStyle = '#7a5129'; ctx.beginPath(); ctx.ellipse(x - 4, y + 2, 5, 1.6, 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d6b27a'; ctx.beginPath(); ctx.ellipse(x, y + 4, 1.4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}
const PROPS = {
  house: [[0.44, 0.12, propBarrel], [0.12, 0.46, propPots]],
  storage: [[0.45, 0.06, propCrates], [0.06, 0.47, propSacks]],
  barracks: [[0.46, 0.18, propRack]],
  stable: [[0.46, 0.1, propHay], [0.14, 0.47, propTrough]],
  smithy: [[0.12, 0.47, propBarrel]],
  market: [[0.46, 0.38, propCrates]],
  quarry: [[0.44, 0.38, propBlocks]],
  goldmine: [[0.42, 0.4, propCart]],
  workshop: [[0.44, 0.3, propLogs]],
  tc: [[1.02, 0.4, propCrates], [0.5, 1.03, propBarrel], [-0.3, 1.04, propSacks], [1.03, -0.4, propHay]],
};

// ---------- versiering per volk ----------

function palm(ctx, gx, gy, s = 1) {
  const [x, y] = P(gx, gy);
  ctx.fillStyle = 'rgba(20,30,10,0.25)'; ctx.beginPath(); ctx.ellipse(x + 6 * s, y + 1, 9 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  // geschubde stam, licht gebogen
  for (let i = 0; i < 9; i++) {
    const t = i / 9; const px = x + Math.sin(t * 1.4) * 4 * s; const py = y - t * 30 * s;
    ctx.fillStyle = i % 2 ? '#8a6a42' : '#a07d50';
    ctx.beginPath(); ctx.ellipse(px, py, 2.1 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  const tx = x + Math.sin(1.4) * 4 * s; const ty = y - 30 * s;
  for (const [a, len, col] of [[-2.7, 15, '#2f6b2a'], [-2.2, 16, '#3f8a34'], [-1.6, 13, '#4f9a3c'], [-0.9, 15, '#3f8a34'], [-0.35, 16, '#2f6b2a'], [0.3, 12, '#4f9a3c'], [2.8, 11, '#2f6b2a']]) {
    const ex = tx + Math.cos(a) * len * s; const ey = ty + Math.sin(a) * len * 0.55 * s + 6 * s;
    ctx.strokeStyle = col; ctx.lineWidth = 2.4 * s;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5 * s, ty + Math.sin(a) * len * 0.3 * s - 4 * s, ex, ey); ctx.stroke();
  }
  ctx.fillStyle = '#6b3d1e'; for (const d of [-1.5, 1.5]) { ctx.beginPath(); ctx.arc(tx + d, ty + 2.5, 1.4, 0, Math.PI * 2); ctx.fill(); }
}

function cypress(ctx, gx, gy, s = 1) {
  const [x, y] = P(gx, gy);
  ctx.fillStyle = 'rgba(20,30,10,0.25)'; ctx.beginPath(); ctx.ellipse(x + 5 * s, y + 1, 8 * s, 2.2 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 1, y - 4 * s, 2, 4 * s);
  const shape = (dx, w, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + dx, y - 40 * s); ctx.bezierCurveTo(x + dx + w * s, y - 30 * s, x + dx + w * s, y - 8 * s, x + dx, y - 3 * s); ctx.bezierCurveTo(x + dx - w * s, y - 8 * s, x + dx - w * s, y - 30 * s, x + dx, y - 40 * s); ctx.fill(); };
  shape(0.6, 6, '#1d4a2a'); shape(0, 5.4, '#2a6236');
  ctx.fillStyle = 'rgba(160,210,120,0.35)'; ctx.beginPath(); ctx.ellipse(x - 1.8 * s, y - 24 * s, 1.6 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
}

function lantern(ctx, gx, gy) {
  const [x, y] = P(gx, gy);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 0.5, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  const stone = '#9a958c';
  ctx.fillStyle = shade(stone, -0.15); ctx.fillRect(x - 3.5, y - 2.5, 7, 2.5);
  ctx.fillStyle = stone; ctx.fillRect(x - 1.3, y - 10, 2.6, 7.5);
  ctx.fillStyle = shade(stone, 0.1); ctx.fillRect(x - 3.6, y - 11.5, 7.2, 1.6);
  ctx.fillStyle = '#f6d77a'; ctx.fillRect(x - 2.2, y - 15.5, 4.4, 4);
  ctx.fillStyle = stone; ctx.fillRect(x - 2.6, y - 15.5, 1, 4); ctx.fillRect(x + 1.6, y - 15.5, 1, 4);
  ctx.fillStyle = shade(stone, -0.1); ctx.beginPath(); ctx.moveTo(x - 5, y - 15.5); ctx.lineTo(x, y - 20); ctx.lineTo(x + 5, y - 15.5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - 20.5, 1, 0, Math.PI * 2); ctx.fill();
  addLight([x, y - 13.5], 0.8);
}

function amphora(ctx, gx, gy) {
  for (const [dx, sc] of [[0, 1], [0.07, 0.8]]) {
    const [x, y] = P(gx + dx, gy);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 1, y, 3.5 * sc, 1.4 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5603a';
    ctx.beginPath(); ctx.moveTo(x - 1 * sc, y); ctx.bezierCurveTo(x - 5 * sc, y - 4 * sc, x - 4 * sc, y - 9 * sc, x - 1.2 * sc, y - 11 * sc);
    ctx.lineTo(x - 1.2 * sc, y - 13 * sc); ctx.lineTo(x + 1.2 * sc, y - 13 * sc); ctx.lineTo(x + 1.2 * sc, y - 11 * sc);
    ctx.bezierCurveTo(x + 4 * sc, y - 9 * sc, x + 5 * sc, y - 4 * sc, x + 1 * sc, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 3.4 * sc, y - 7 * sc, 6.8 * sc, 1.2 * sc);
    ctx.fillStyle = 'rgba(255,230,190,0.3)'; ctx.fillRect(x - 2.6 * sc, y - 9 * sc, 1 * sc, 5 * sc);
  }
}

function obelisk(ctx, gx, gy, hgt = 34) {
  const s = 0.045;
  box(ctx, gx - s * 1.6, gy - s * 1.6, gx + s * 1.6, gy + s * 1.6, 0, 3, C.stoneDark);
  box(ctx, gx - s, gy - s, gx + s, gy + s, 3, hgt, '#e2cc96', EDGE, 'none');
  for (let z = 8; z < hgt - 4; z += 4) { quadL(ctx, gy + s + 0.002, gx - s * 0.5, gx + s * 0.5, z, z + 1.4, 'rgba(90,60,30,0.45)'); }
  poly(ctx, [P(gx - s, gy + s, hgt), P(gx + s, gy + s, hgt), P(gx, gy, hgt + 7)], C.gold, EDGE);
  poly(ctx, [P(gx + s, gy - s, hgt), P(gx + s, gy + s, hgt), P(gx, gy, hgt + 7)], shade(C.gold, -0.25), EDGE);
}

function lionStatue(ctx, gx, gy) {
  box(ctx, gx - 0.07, gy - 0.05, gx + 0.07, gy + 0.05, 0, 5, '#2c5fae');
  const [x, y] = P(gx, gy, 5);
  ctx.fillStyle = '#e0b23a';
  ctx.beginPath(); ctx.ellipse(x, y - 3, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, y - 6, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b88a20'; ctx.beginPath(); ctx.arc(x + 3.6, y - 6, 3.3, Math.PI * 0.5, Math.PI * 1.6); ctx.fill();
  ctx.fillRect(x - 4, y - 2, 1.4, 2.6); ctx.fillRect(x + 2.4, y - 2, 1.4, 2.6);
}

function torii(ctx, gx, gy) {
  const red = '#c0392b';
  for (const dy of [-0.14, 0.14]) box(ctx, gx - 0.02, gy + dy - 0.02, gx + 0.02, gy + dy + 0.02, 0, 26, red, 'rgba(60,10,5,0.5)', 'none');
  box(ctx, gx - 0.035, gy - 0.22, gx + 0.035, gy + 0.22, 26, 29, '#2e2018', null, 'none');
  box(ctx, gx - 0.025, gy - 0.18, gx + 0.025, gy + 0.18, 21, 23, red, null, 'none');
}

const SIDE = { palm, cypress, lantern, amphora };

// lichtpunten (vensters, deuren) van de sprite die nu getekend wordt
let LIGHTS = null;
const addLight = (pt, r = 1) => { if (LIGHTS) LIGHTS.push([pt[0], pt[1], r]); };

function windowL(ctx, y, x, z, w = 0.08, h = 6) {
  quadL(ctx, y + 0.001, x - 0.012, x + w + 0.012, z - 1, z + h + 1, '#e9dcc0');
  quadL(ctx, y + 0.002, x, x + w, z, z + h, C.window);
  quadL(ctx, y + 0.003, x + 0.01, x + w - 0.01, z + 1, z + h - 1, 'rgba(246,215,122,0.5)');
  ctx.strokeStyle = 'rgba(60,40,20,0.7)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(...P(x + w / 2, y + 0.004, z)); ctx.lineTo(...P(x + w / 2, y + 0.004, z + h));
  ctx.moveTo(...P(x, y + 0.004, z + h / 2)); ctx.lineTo(...P(x + w, y + 0.004, z + h / 2)); ctx.stroke();
  quadL(ctx, y + 0.004, x - 0.015, x + w + 0.015, z - 1.6, z - 0.4, '#d8c8a4');
  addLight(P(x + w / 2, y, z + h / 2), 1);
}
function windowR(ctx, x, y, z, w = 0.08, h = 6) {
  quadR(ctx, x + 0.001, y - 0.012, y + w + 0.012, z - 1, z + h + 1, '#d9cbae');
  quadR(ctx, x + 0.002, y, y + w, z, z + h, C.window);
  quadR(ctx, x + 0.003, y + 0.01, y + w - 0.01, z + 1, z + h - 1, 'rgba(246,215,122,0.38)');
  ctx.strokeStyle = 'rgba(60,40,20,0.7)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(...P(x + 0.004, y + w / 2, z)); ctx.lineTo(...P(x + 0.004, y + w / 2, z + h));
  ctx.moveTo(...P(x + 0.004, y, z + h / 2)); ctx.lineTo(...P(x + 0.004, y + w, z + h / 2)); ctx.stroke();
  addLight(P(x, y + w / 2, z + h / 2), 0.9);
}
function doorL(ctx, y, x, w = 0.1, h = 10, col = C.woodDark) {
  quadL(ctx, y + 0.001, x - 0.015, x + w + 0.015, 0, h + 1.5, '#6b5a44', EDGE);
  quadL(ctx, y + 0.002, x, x + w, 0, h, col, EDGE);
  ctx.strokeStyle = 'rgba(30,15,5,0.4)'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(...P(x + (w * i) / 3, y + 0.003, 0)); ctx.lineTo(...P(x + (w * i) / 3, y + 0.003, h)); ctx.stroke(); }
  ctx.fillStyle = '#e2c26a'; const [kx, ky] = P(x + w * 0.8, y + 0.003, h * 0.45); ctx.fillRect(kx - 0.6, ky - 0.6, 1.2, 1.2);
  addLight(P(x + w / 2, y, h * 0.5), 0.7);
}

// graspollen en bloemetjes rond de voet van een gebouw
function tufts(ctx, s, flowers = false) {
  const spots = [[-s - 0.05, s + 0.02], [s * 0.2, s + 0.08], [s + 0.06, s * 0.3], [s + 0.08, -s * 0.6], [-s * 0.6, s + 0.06]];
  for (const [x, y] of spots) {
    const [px, py] = P(x, y);
    ctx.strokeStyle = 'rgba(70,120,40,0.8)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(px - 2, py); ctx.lineTo(px - 3, py - 4); ctx.moveTo(px, py); ctx.lineTo(px, py - 5); ctx.moveTo(px + 2, py); ctx.lineTo(px + 3, py - 3.5); ctx.stroke();
    if (flowers) { ctx.fillStyle = ['#e85d75', '#f4d35e', '#ffffff', '#b48cf0'][Math.abs(Math.round(x * 10)) % 4]; ctx.beginPath(); ctx.arc(px + 1, py - 4.5, 1.3, 0, Math.PI * 2); ctx.fill(); }
  }
}

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
  shadow(ctx, 0.36, true);
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
  if (STYLE) houseCiv(ctx, L);
}

// eigen details per volk op de huizen: dakterras met luifel, palmdak, zuilenportiek, veranda en tralies, tegelboog
function houseCiv(ctx, L) {
  const D = [null, { x0: -0.28, y0: -0.22, x1: 0.28, y1: 0.22, h: 15, dx: -0.06, dw: 0.12, dh: 10 },
    { x0: -0.34, y0: -0.27, x1: 0.34, y1: 0.27, h: 19, dx: -0.06, dw: 0.13, dh: 11 },
    { x0: -0.38, y0: -0.32, x1: 0.38, y1: 0.32, h: 28, dx: -0.05, dw: 0.13, dh: 11 }][Math.min(3, Math.max(1, L))];
  const { x0, y0, x1, y1, h } = D;
  const st = STYLE;
  const line = (a, b, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
  const canopy = (xa, ya, xb, yb, z0, z1, c1, c2) => {
    for (const [px, py] of [[xa, ya], [xb, ya], [xa, yb], [xb, yb]]) line(P(px, py, z0), P(px, py, z1), '#5a3a1e', 1);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = xa + ((xb - xa) * k) / n; const b = xa + ((xb - xa) * (k + 1)) / n;
      poly(ctx, [P(a, ya, z1 + 1.2), P(b, ya, z1 + 1.2), P(b, yb, z1), P(a, yb, z1)], k % 2 ? c1 : c2, 'rgba(40,25,10,0.35)');
    }
    for (let k = 0; k < n; k++) { // franje aan de voorkant
      const a = xa + ((xb - xa) * k) / n; const b = xa + ((xb - xa) * (k + 1)) / n;
      poly(ctx, [P(a, yb, z1), P(b, yb, z1), P((a + b) / 2, yb, z1 - 2.6)], shade(k % 2 ? c1 : c2, -0.15));
    }
  };
  if (st.roof === 'crenel') { // Babylon: uitstekende balkkoppen, dakterras met gestreepte luifel, potplant
    for (let x = x0 + 0.07; x < x1 - 0.03; x += 0.11) box(ctx, x - 0.014, y1, x + 0.014, y1 + 0.05, h - 6, h - 4, '#5a3a1e', EDGE, 'none');
    for (let y = y0 + 0.07; y < y1 - 0.03; y += 0.11) box(ctx, x1, y - 0.014, x1 + 0.05, y + 0.014, h - 6, h - 4, '#4a2e18', EDGE, 'none');
    if (L >= 2) canopy(x0 + 0.06, y0 + 0.06, x1 - 0.06, (y0 + y1) / 2, h + 3.2, h + 15, st.trim, '#efe6cf');
    const [px, py] = P(x1 - 0.1, y1 - 0.08, h + 3.2);
    ctx.fillStyle = '#b5603a'; ctx.fillRect(px - 1.8, py - 3.5, 3.6, 3.5);
    ctx.fillStyle = '#4f8a34'; ctx.beginPath(); ctx.arc(px, py - 5, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6faa44'; ctx.beginPath(); ctx.arc(px - 0.8, py - 5.8, 1.4, 0, Math.PI * 2); ctx.fill();
    if (L >= 3) { // ladder naar het dak
      const a = P(x1 + 0.06, y0 + 0.12, 0); const b = P(x1 + 0.02, y0 + 0.2, h + 6);
      const a2 = P(x1 + 0.06, y0 + 0.2, 0); const b2 = P(x1 + 0.02, y0 + 0.28, h + 6);
      line(a, b, '#6b4523', 0.9); line(a2, b2, '#6b4523', 0.9);
      for (let t = 0.1; t < 1; t += 0.12) line([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t], '#8a5f33', 0.6);
    }
  } else if (st.roof === 'flat') { // Egypte: schaduwdak van palmbladeren op het dak, kruiken bij de deur
    if (L >= 2) {
      const xa = x0 + 0.05; const xb = x0 + (x1 - x0) * 0.55; const ya = y0 + 0.05; const yb = y0 + (y1 - y0) * 0.55;
      for (const [px, py] of [[xa, ya], [xb, ya], [xa, yb], [xb, yb]]) line(P(px, py, h + 5), P(px, py, h + 15), '#7a5a32', 1);
      poly(ctx, [P(xa - 0.03, ya - 0.03, h + 15.5), P(xb + 0.03, ya - 0.03, h + 15.5), P(xb + 0.03, yb + 0.03, h + 14.5), P(xa - 0.03, yb + 0.03, h + 14.5)], '#a8955a', 'rgba(60,45,20,0.5)');
      ctx.strokeStyle = 'rgba(80,100,40,0.7)'; ctx.lineWidth = 0.6;
      for (let t = 0; t <= 1; t += 0.14) { const a = P(xa + (xb - xa) * t, ya, h + 15.5); const b = P(xa + (xb - xa) * t, yb + 0.05, h + 13.5); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    }
    for (const [dx, sc] of [[D.dx - 0.08, 1], [D.dx + D.dw + 0.05, 0.8]]) {
      const [x, y] = P(dx, y1 + 0.06);
      ctx.fillStyle = '#b5603a'; ctx.beginPath(); ctx.moveTo(x - 1 * sc, y); ctx.bezierCurveTo(x - 4 * sc, y - 3 * sc, x - 3 * sc, y - 7 * sc, x - 1 * sc, y - 8 * sc); ctx.lineTo(x + 1 * sc, y - 8 * sc); ctx.bezierCurveTo(x + 3 * sc, y - 7 * sc, x + 4 * sc, y - 3 * sc, x + 1 * sc, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,190,0.3)'; ctx.fillRect(x - 2 * sc, y - 6 * sc, 0.8 * sc, 4 * sc);
    }
  } else if (st.roof === 'greek') { // Grieken: zuilenportiek met een klein fronton voor de deur
    if (L >= 2) {
      const xa = D.dx - 0.1; const xb = D.dx + D.dw + 0.1; const yf = y1 + 0.16; const zt = D.dh + 3;
      column(ctx, xa, yf, 0, zt, C.plaster, 1.6); column(ctx, xb, yf, 0, zt, C.plaster, 1.6);
      box(ctx, xa - 0.04, y1, xb + 0.04, yf + 0.04, zt, zt + 2.5, C.plaster, EDGE, 'none');
      poly(ctx, [P(xa - 0.05, yf + 0.05, zt + 2.5), P(xb + 0.05, yf + 0.05, zt + 2.5), P((xa + xb) / 2, yf + 0.05, zt + 8)], C.plaster, 'rgba(90,80,60,0.6)');
      poly(ctx, [P(xa - 0.02, yf + 0.06, zt + 3.2), P(xb + 0.02, yf + 0.06, zt + 3.2), P((xa + xb) / 2, yf + 0.06, zt + 7)], st.trim);
      poly(ctx, [P(xb + 0.05, y1, zt + 2.5), P(xb + 0.05, yf + 0.05, zt + 2.5), P((xa + xb) / 2 + 0.06, (y1 + yf) / 2, zt + 8)], shade(C.roof, -0.2), EDGE);
    }
  } else if (st.roof === 'pagoda') { // Yamato: houten tralies, veranda en een doek voor de deur
    ctx.strokeStyle = 'rgba(46,32,24,0.65)'; ctx.lineWidth = 0.45;
    const zt = L >= 3 ? h - 2 : h - 2; const zb = L >= 3 ? 14 : 2;
    for (let x = x0 + 0.05; x < x1; x += 0.07) { if (x > D.dx - 0.02 && x < D.dx + D.dw + 0.02) continue; ctx.beginPath(); ctx.moveTo(...P(x, y1 + 0.004, zb)); ctx.lineTo(...P(x, y1 + 0.004, zt)); ctx.stroke(); }
    for (let z = zb + 3; z < zt; z += 4) { ctx.beginPath(); ctx.moveTo(...P(x0, y1 + 0.004, z)); ctx.lineTo(...P(D.dx - 0.02, y1 + 0.004, z)); ctx.moveTo(...P(D.dx + D.dw + 0.02, y1 + 0.004, z)); ctx.lineTo(...P(x1, y1 + 0.004, z)); ctx.stroke(); }
    for (let y = y0 + 0.05; y < y1; y += 0.07) { ctx.beginPath(); ctx.moveTo(...P(x1 + 0.004, y, zb)); ctx.lineTo(...P(x1 + 0.004, y, zt)); ctx.stroke(); }
    if (L >= 2) {
      box(ctx, x0 - 0.02, y1 + 0.005, x1 + 0.02, y1 + 0.11, 0, 2.6, '#8a6238');
      box(ctx, x1 + 0.005, y0 - 0.02, x1 + 0.11, y1 + 0.11, 0, 2.6, '#7a5129');
    }
    for (let k = 0; k < 3; k++) {
      const a = D.dx + (D.dw * k) / 3 + 0.004; const b = D.dx + (D.dw * (k + 1)) / 3 - 0.004;
      poly(ctx, [P(a, y1 + 0.006, D.dh + 0.5), P(b, y1 + 0.006, D.dh + 0.5), P(b, y1 + 0.006, D.dh - 4), P(a, y1 + 0.006, D.dh - 4)], '#2f3f6b');
    }
    const [mx, my] = P(D.dx + D.dw / 2, y1 + 0.007, D.dh - 1.6);
    ctx.fillStyle = '#f2ede1'; ctx.beginPath(); ctx.arc(mx, my, 1.1, 0, Math.PI * 2); ctx.fill();
  } else if (st.roof === 'dome') { // Perzië: tegelboog rond de deur en een windtoren
    const fx0 = D.dx - 0.05; const fx1 = D.dx + D.dw + 0.05; const zt = D.dh + 6;
    quadL(ctx, y1 + 0.006, fx0, fx0 + 0.035, 0, zt, st.trim);
    quadL(ctx, y1 + 0.006, fx1 - 0.035, fx1, 0, zt, st.trim);
    quadL(ctx, y1 + 0.006, fx0, fx1, zt - 2, zt, st.trim);
    quadL(ctx, y1 + 0.007, fx0, fx1, zt - 0.6, zt, st.accent);
    const a = P(D.dx, y1 + 0.007, D.dh); const b = P(D.dx + D.dw / 2, y1 + 0.007, D.dh + 4.2); const c = P(D.dx + D.dw, y1 + 0.007, D.dh);
    ctx.fillStyle = '#1b2a3a'; ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(a[0], b[1] + 1, ...b); ctx.quadraticCurveTo(c[0], b[1] + 1, ...c); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = st.accent; ctx.lineWidth = 0.5; ctx.stroke();
    if (L >= 2) {
      const bx0 = x1 - 0.14; const by0 = y0 + 0.02; const top = h + 13;
      box(ctx, bx0, by0, bx0 + 0.1, by0 + 0.1, h, top, C.plaster);
      for (const k of [0.25, 0.6]) quadL(ctx, by0 + 0.101, bx0 + 0.015 + k * 0.05, bx0 + 0.03 + k * 0.05, top - 7, top - 1.5, '#2b2620');
      box(ctx, bx0 - 0.01, by0 - 0.01, bx0 + 0.11, by0 + 0.11, top, top + 1.5, st.trim, EDGE, 'none');
    }
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

// ---------- kastelen (stadscentrum vanaf het IJzertijdperk) per volk ----------

// afgeknotte piramide: schuine muren zoals Egyptische pylonen en ziggurats
function taper(ctx, x0, y0, x1, y1, z0, z1, k, color, bands = 0, bandCol = null) {
  const t = [x0 + k, y0 + k, x1 - k, y1 - k];
  poly(ctx, [P(x0, y1, z0), P(x1, y1, z0), P(t[2], t[3], z1), P(t[0], t[3], z1)], shade(color, -0.04), EDGE);
  poly(ctx, [P(x1, y0, z0), P(x1, y1, z0), P(t[2], t[3], z1), P(t[2], t[1], z1)], shade(color, -0.26), EDGE);
  poly(ctx, [P(t[0], t[1], z1), P(t[2], t[1], z1), P(t[2], t[3], z1), P(t[0], t[3], z1)], shade(color, 0.12), EDGE);
  // baksteenlagen
  ctx.strokeStyle = 'rgba(70,45,20,0.28)'; ctx.lineWidth = 0.5;
  for (let z = z0 + 3; z < z1; z += 3) {
    const f = (z - z0) / (z1 - z0); const kk = k * f;
    ctx.beginPath(); ctx.moveTo(...P(x0 + kk, y1 - kk, z)); ctx.lineTo(...P(x1 - kk, y1 - kk, z)); ctx.lineTo(...P(x1 - kk, y0 + kk, z)); ctx.stroke();
  }
  if (bands && bandCol) {
    const z = z1 - 3;
    const kk = k * ((z - z0) / (z1 - z0));
    poly(ctx, [P(x0 + kk, y1 - kk, z - 2), P(x1 - kk, y1 - kk, z - 2), P(x1 - k, y1 - k, z1), P(x0 + k, y1 - k, z1)], bandCol);
    poly(ctx, [P(x1 - kk, y0 + kk, z - 2), P(x1 - kk, y1 - kk, z - 2), P(x1 - k, y1 - k, z1), P(x1 - k, y0 + k, z1)], shade(bandCol, -0.25));
  }
}

// zuil met voet, groeven en kapiteel
function column(ctx, gx, gy, z0, z1, col = C.plaster, w = 2.6, cap = null) {
  const [x, y0] = P(gx, gy, z0); const [, y1] = P(gx, gy, z1);
  ctx.fillStyle = shade(col, -0.1); ctx.fillRect(x - w - 0.8, y0 - 1.6, w * 2 + 1.6, 1.6);
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, shade(col, 0.12)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.3));
  ctx.fillStyle = g; ctx.fillRect(x - w, y1, w * 2, y0 - y1 - 1.6);
  ctx.strokeStyle = 'rgba(80,70,55,0.3)'; ctx.lineWidth = 0.35;
  for (const dx of [-w * 0.4, 0, w * 0.4]) { ctx.beginPath(); ctx.moveTo(x + dx, y1 + 1); ctx.lineTo(x + dx, y0 - 2); ctx.stroke(); }
  ctx.fillStyle = cap || shade(col, -0.05); ctx.fillRect(x - w - 1, y1 - 1.8, w * 2 + 2, 1.8);
}

function tcEgypt(ctx, L, team) {
  ground(ctx, -0.95, -0.95, 0.95, 0.95, '#d9c48e', 'rgba(110,80,40,0.35)');
  // zuilenhal achteraan
  box(ctx, -0.85, -0.85, 0.6, 0.15, 0, 32, C.stone);
  flatRoof(ctx, -0.85, -0.85, 0.6, 0.15, 32, C.stone);
  for (let x = -0.75; x <= 0.5; x += 0.25) column(ctx, x, 0.24, 0, 30, '#e8d6a6', 2.6, '#3f7f3a');
  // pyloon: twee schuine torens met een poort ertussen
  for (const [a, b] of [[-0.85, -0.18], [0.18, 0.85]]) {
    taper(ctx, a, 0.45, b, 0.8, 0, 48 + L * 4, 0.06, C.stone, 1, STYLE.trim);
    const [hx, hy] = P((a + b) / 2, 0.79, 26);
    ctx.fillStyle = 'rgba(120,70,30,0.45)'; for (let i = 0; i < 3; i++) ctx.fillRect(hx - 9 + i * 7, hy - 6, 4, 10);
  }
  box(ctx, -0.18, 0.5, 0.18, 0.76, 0, 34, C.stoneDark);
  quadL(ctx, 0.761, -0.1, 0.1, 0, 22, '#3d2a1a', EDGE);
  quadL(ctx, 0.762, -0.18, 0.18, 30, 34, STYLE.trim);
  // vlaggenmasten met teamkleur
  for (const x of [-0.5, 0.5]) { const [fx, fy] = P(x, 0.84, 0); ctx.strokeStyle = '#6b4523'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 70 - L * 4); ctx.stroke(); ctx.fillStyle = team; ctx.beginPath(); ctx.moveTo(fx, fy - 70 - L * 4); ctx.lineTo(fx + 9, fy - 66 - L * 4); ctx.lineTo(fx, fy - 62 - L * 4); ctx.fill(); }
  obelisk(ctx, 0.92, 0.35, 40 + L * 3);
  obelisk(ctx, -0.35, 0.92, 40 + L * 3);
  if (L >= 4) { // gouden sfinx op het voorplein
    const [sx, sy] = P(0.75, 0.9);
    ctx.fillStyle = '#e0b23a'; ctx.beginPath(); ctx.ellipse(sx, sy - 4, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(sx + 3, sy - 12, 4, 8); ctx.fillStyle = STYLE.trim; ctx.fillRect(sx + 2, sy - 13, 6, 2);
  }
}

function tcGreek(ctx, L, team) {
  ground(ctx, -0.95, -0.95, 0.95, 0.95, '#ddd5c2', 'rgba(110,100,80,0.35)');
  for (let i = 0; i < 3; i++) box(ctx, -0.88 + i * 0.05, -0.78 + i * 0.05, 0.88 - i * 0.05, 0.78 - i * 0.05, i * 3, i * 3 + 3, C.stone);
  const z0 = 9; const zc = 44 + (L - 3) * 6;
  box(ctx, -0.6, -0.5, 0.6, 0.5, z0, zc, C.plaster);
  quadL(ctx, 0.501, -0.12, 0.12, z0, z0 + 22, '#5a4632', EDGE);
  for (let x = -0.68; x <= 0.69; x += 0.17) column(ctx, x, 0.66, z0, zc, '#f4f1e8', 2.4);
  for (let y = -0.55; y <= 0.5; y += 0.17) column(ctx, 0.76, y, z0, zc, '#e9e5da', 2.4);
  box(ctx, -0.78, -0.68, 0.78, 0.68, zc, zc + 6, C.plaster);
  // fries met trigliefen in de teamkleur
  for (let x = -0.74; x < 0.74; x += 0.1) quadL(ctx, 0.681, x, x + 0.04, zc + 1, zc + 5, x * 10 % 2 < 1 ? STYLE.trim : team);
  for (let y = -0.64; y < 0.64; y += 0.1) quadR(ctx, 0.781, y, y + 0.04, zc + 1, zc + 5, shade(STYLE.trim, -0.2));
  greekGable(ctx, -0.78, -0.68, 0.78, 0.68, zc + 6, 34, C.roof, false);
  const [tx, ty] = P(0, 0.72, zc + 6 + 17);
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(tx, ty - 2, L >= 4 ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  amphora(ctx, 0.92, 0.6);
  if (L >= 4) { // gouden standbeeld voor de tempel
    box(ctx, -0.42, 0.82, -0.28, 0.94, 0, 8, C.stone);
    const [sx, sy] = P(-0.35, 0.88, 8);
    ctx.fillStyle = '#e0b23a'; ctx.fillRect(sx - 1.8, sy - 16, 3.6, 16); ctx.beginPath(); ctx.arc(sx, sy - 18, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e0b23a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 2, sy - 14); ctx.lineTo(sx + 5, sy - 24); ctx.stroke();
  }
}

function tcYamato(ctx, L, team) {
  ground(ctx, -0.95, -0.95, 0.95, 0.95, '#c9c1ad', 'rgba(90,80,60,0.35)');
  taper(ctx, -0.85, -0.85, 0.85, 0.85, 0, 18, 0.1, C.stone);
  const tiers = L >= 4 ? 4 : 3;
  let z = 18; let s = 0.6;
  for (let i = 0; i < tiers; i++) {
    const h = i === 0 ? 18 : 13;
    box(ctx, -s, -s, s, s, z, z + h, C.plaster);
    for (const x of [-s, -s / 3, s / 3, s - 0.03]) quadL(ctx, s + 0.001, x, x + 0.03, z, z + h, C.timber);
    for (const y of [-s, 0, s - 0.03]) quadR(ctx, s + 0.001, y, y + 0.03, z, z + h, C.timber);
    quadL(ctx, s + 0.002, -s, s, z, z + 2, C.timber);
    windowL(ctx, s, -s * 0.5, z + h * 0.35, 0.06, 4); windowL(ctx, s, s * 0.35, z + h * 0.35, 0.06, 4);
    windowR(ctx, s, -s * 0.1, z + h * 0.35, 0.06, 4);
    pagoda(ctx, -s, -s, s, s, z + h, 14 - i * 1.5, C.roof);
    z += h + 7; s *= 0.74;
  }
  // gouden shachihoko op de nok
  const [ax, ay] = P(-s * 0.6, 0, z - 2); const [bx, by] = P(s * 0.6, 0, z - 2);
  ctx.fillStyle = C.gold; for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 2, y - 6, x + 1.5, y - 7); ctx.lineTo(x + 1, y); ctx.fill(); }
  torii(ctx, 0.92, 0.55);
  lantern(ctx, -0.55, 0.95);
  lantern(ctx, 0.95, -0.45);
  banner(ctx, -0.65, 0.86, 30, team, 12);
}

function tcBabylon(ctx, L, team) {
  ground(ctx, -0.95, -0.95, 0.95, 0.95, '#cdb07c', 'rgba(110,80,40,0.35)');
  const tiers = L >= 4 ? 4 : 3;
  let z = 0; let s = 0.9;
  for (let i = 0; i < tiers; i++) {
    const h = 15 - i;
    taper(ctx, -s, -s, s, s, z, z + h, 0.04, C.stone, 1, STYLE.trim);
    z += h; s -= 0.22;
  }
  // heiligdom bovenop: blauw geglazuurd met gouden kantelen
  const r = Math.max(0.16, s + 0.05);
  box(ctx, -r, -r, r, r, z, z + 14, STYLE.trim, EDGE, 'none');
  for (let x = -r + 0.03; x < r - 0.04; x += 0.09) quadL(ctx, r + 0.002, x, x + 0.04, z + 4, z + 9, STYLE.trim2);
  quadL(ctx, r + 0.003, -0.05, 0.05, z, z + 8, '#2a1d12');
  crenels(ctx, -r, -r, r, r, z + 14, STYLE.trim2, 3, 3);
  // grote trap aan de voorkant
  const st = [P(-0.16, 0.95, 0), P(0.16, 0.95, 0), P(0.12, 0.25, z - 2), P(-0.12, 0.25, z - 2)];
  poly(ctx, st, shade(C.stone, 0.08), EDGE);
  ctx.strokeStyle = 'rgba(70,45,20,0.45)'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 14; i++) { const f = i / 14; ctx.beginPath(); ctx.moveTo(...P(-0.16 + 0.04 * f, 0.95 - 0.7 * f, (z - 2) * f)); ctx.lineTo(...P(0.16 - 0.04 * f, 0.95 - 0.7 * f, (z - 2) * f)); ctx.stroke(); }
  lionStatue(ctx, -0.32, 0.92);
  lionStatue(ctx, 0.92, -0.3);
  banner(ctx, 0.3, 0.9, 22, team, 14);
  palm(ctx, 0.95, 0.5, 0.9);
}

function tcPersia(ctx, L, team) {
  ground(ctx, -0.95, -0.95, 0.95, 0.95, '#e0d2b2', 'rgba(110,90,60,0.35)');
  box(ctx, -0.9, -0.9, 0.9, 0.9, 0, 6, C.stone);
  const minaret = (x, y) => {
    box(ctx, x, y, x + 0.12, y + 0.12, 0, 58, C.plaster);
    quadL(ctx, y + 0.121, x, x + 0.12, 40, 43, STYLE.trim); quadR(ctx, x + 0.121, y, y + 0.12, 40, 43, shade(STYLE.trim, -0.2));
    box(ctx, x - 0.02, y - 0.02, x + 0.14, y + 0.14, 58, 61, C.stoneDark);
    dome(ctx, x + 0.06, y + 0.06, 61, 0.09, STYLE.palette.roof, true);
  };
  if (L >= 4) minaret(0.72, -0.86); // achteraan
  box(ctx, -0.72, -0.72, 0.6, 0.55, 6, 38, C.plaster);
  for (const z of [16, 30]) { quadL(ctx, 0.551, -0.72, 0.6, z, z + 2, STYLE.trim); quadR(ctx, 0.601, -0.72, 0.55, z, z + 2, shade(STYLE.trim, -0.2)); }
  windowR(ctx, 0.6, -0.4, 20, 0.1, 8); windowR(ctx, 0.6, 0.1, 20, 0.1, 8);
  // iwan: hoge poort met een spitsboog in turquoise tegels
  box(ctx, -0.32, 0.5, 0.2, 0.62, 6, 54, C.plaster);
  const y = 0.622;
  const arch = (x0, x1, zb, zs, zt) => {
    const xm = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.moveTo(...P(x0, y, zb)); ctx.lineTo(...P(x0, y, zs));
    ctx.quadraticCurveTo(...P(x0, y, zt - 4), ...P(xm, y, zt));
    ctx.quadraticCurveTo(...P(x1, y, zt - 4), ...P(x1, y, zs));
    ctx.lineTo(...P(x1, y, zb)); ctx.closePath();
  };
  arch(-0.27, 0.15, 6, 32, 50); ctx.fillStyle = STYLE.trim; ctx.fill();
  arch(-0.21, 0.09, 6, 30, 45); ctx.fillStyle = '#2a2018'; ctx.fill();
  arch(-0.21, 0.09, 6, 30, 45); ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,200,120,0.18)'; ctx.fillRect(...P(-0.21, y, 30), 40, 30); ctx.restore();
  const [ga, gb] = P(-0.06, y, 47); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(ga, gb - 2, 1.6, 0, Math.PI * 2); ctx.fill();
  dome(ctx, -0.1, -0.12, 38, L >= 4 ? 0.5 : 0.42, STYLE.palette.roof);
  minaret(0.72, 0.68);
  minaret(-0.86, 0.68);
  banner(ctx, 0.36, 0.62, 30, team, 12);
  cypress(ctx, 0.97, 0.2, 0.9);
}

const TC_CIV = { egypt: tcEgypt, greek: tcGreek, yamato: tcYamato, babylon: tcBabylon, persia: tcPersia };

// ---------- mensen, dieren en machines (in schermruimte) ----------

export function ram(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(1, 0, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  // wielen achteraan
  for (const wx of [-7, 6]) { ctx.fillStyle = '#3a2716'; ctx.beginPath(); ctx.arc(wx + 1.5, -3.2, 3, 0, Math.PI * 2); ctx.fill(); }
  // onderstel en stam met ijzeren kop
  ctx.fillStyle = '#6b4826'; ctx.fillRect(-11, -9, 22, 5);
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 0.6; ctx.strokeRect(-11, -9, 22, 5);
  ctx.fillStyle = '#7a5129'; ctx.beginPath(); ctx.ellipse(1, -8.2, 14, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d6b27a'; ctx.beginPath(); ctx.ellipse(-12.8, -8.2, 0.9, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.iron; ctx.beginPath(); ctx.moveTo(13, -10.6); ctx.lineTo(18, -9.4); ctx.lineTo(18, -7); ctx.lineTo(13, -5.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(13.5, -10, 4, 0.8);
  // dak van huiden
  ctx.fillStyle = '#8a6a48'; ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-1, -19); ctx.lineTo(12, -9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a5845c'; ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-1, -19); ctx.lineTo(1, -9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(70,45,25,0.6)'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 3, -9); ctx.lineTo(-1, -19 + i * 0.4); ctx.stroke(); }
  ctx.strokeStyle = '#3e2a18'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-1, -19); ctx.lineTo(12, -9); ctx.stroke();
  // wielen vooraan
  for (const wx of [-8, 5]) {
    ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.arc(wx, -2.8, 3.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a6238'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; ctx.moveTo(wx + Math.cos(a) * 2.6, -2.8 + Math.sin(a) * 2.6); ctx.lineTo(wx - Math.cos(a) * 2.6, -2.8 - Math.sin(a) * 2.6); }
    ctx.stroke();
    ctx.fillStyle = C.iron; ctx.beginPath(); ctx.arc(wx, -2.8, 0.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// mensen en ruiters staan in figures.js (rijker getekend en per animatiebeeld gecachet)
export { person, horseman } from './figures.js';

// stenenwerper: houten werparm met een kei, op wielen
export function stoneThrower(ctx, x, y, s = 1, t = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(1, 0, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4826'; ctx.fillRect(-11, -7, 22, 3.6);
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 0.6; ctx.strokeRect(-11, -7, 22, 3.6);
  ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(-1, -17); ctx.lineTo(2, -7); ctx.moveTo(3, -7); ctx.lineTo(0, -17); ctx.stroke();
  const ang = -0.9 + Math.sin(t * 0.002) * 0.08;
  ctx.save(); ctx.translate(-0.5, -16); ctx.rotate(ang);
  ctx.fillStyle = '#8a6238'; ctx.fillRect(-1, -14, 2, 20);
  ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.arc(0, -14, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9a958c'; ctx.beginPath(); ctx.arc(0, -15.2, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a5048'; ctx.fillRect(-2.6, 4, 5.2, 4);
  ctx.restore();
  ctx.fillStyle = '#2c5fae'; ctx.fillRect(-10, -6.4, 4, 2.4); ctx.fillStyle = '#e0b23a'; ctx.fillRect(-10, -5.6, 4, 0.7);
  for (const wx of [-8, 7]) {
    ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.arc(wx, -2.6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6238'; ctx.beginPath(); ctx.arc(wx, -2.6, 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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

// rotsblok met facetten, barsten en korrel; per vorm en resolutie één keer getekend
const rockCache = new Map();
function rockSprite(v, R) {
  const key = `${v}|${R}`;
  let cv = rockCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = Math.ceil(16 * R); cv.height = Math.ceil(11 * R);
  const c = cv.getContext('2d');
  c.scale(R, R); c.translate(8, 9.5);
  let seed = v * 7919 + 13;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const j = () => (r() - 0.5) * 1.6;
  const ptsTop = [[-6.4 + j(), -0.2], [-4.6 + j(), -5 + j() * 0.5], [-0.6 + j(), -7.4 + j() * 0.4], [3.6 + j(), -6 + j() * 0.5], [6.6 + j(), -2.2], [5.6, 1.2], [-0.2, 1.8]];
  const tone = ['#8d8778', '#968f80', '#857f72', '#9a9384'][v % 4];
  // schaduwzijde (rechts), lichtzijde (links), bovenkant
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(1, 1.2, 7, 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(tone, -0.28); c.beginPath(); c.moveTo(...ptsTop[0]); for (const p of ptsTop.slice(1)) c.lineTo(...p); c.closePath(); c.fill();
  const mx = ptsTop[2][0] + 0.6; const my = ptsTop[2][1] + 3.6;
  c.fillStyle = tone; c.beginPath(); c.moveTo(...ptsTop[0]); c.lineTo(...ptsTop[1]); c.lineTo(...ptsTop[2]); c.lineTo(mx, my); c.lineTo(-0.2, 1.8); c.closePath(); c.fill();
  c.fillStyle = shade(tone, 0.22); c.beginPath(); c.moveTo(...ptsTop[1]); c.lineTo(...ptsTop[2]); c.lineTo(...ptsTop[3]); c.lineTo(mx, my); c.closePath(); c.fill();
  c.fillStyle = shade(tone, 0.4); c.beginPath(); c.moveTo(...ptsTop[2]); c.lineTo(ptsTop[2][0] + 1.6, ptsTop[2][1] + 0.6); c.lineTo(mx, my); c.closePath(); c.fill();
  // barsten en korrel
  c.strokeStyle = 'rgba(40,35,30,0.5)'; c.lineWidth = 0.35;
  c.beginPath(); c.moveTo(mx, my); c.lineTo(mx - 1.2 + j() * 0.3, my + 2.4); c.moveTo(-3, -2.2); c.lineTo(-1.8, -0.6); c.lineTo(-2.4, 0.8); c.stroke();
  for (let k = 0; k < 26; k++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255,255,245,0.35)' : 'rgba(30,25,20,0.3)';
    c.fillRect(-5.5 + r() * 11, -6 + r() * 7, 0.45, 0.45);
  }
  c.fillStyle = 'rgba(80,110,40,0.55)'; c.beginPath(); c.ellipse(-4.2, 0.6, 1.6, 0.5, 0, 0, Math.PI * 2); c.fill();
  rockCache.set(key, cv);
  return cv;
}

export function rock(ctx, x, y, s = 1) {
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b) * s;
  const R = sc <= 1.5 ? 1.5 : sc <= 3 ? 3 : sc <= 5 ? 5 : 8;
  const v = Math.abs(Math.round(x * 3.7 + y * 7.3)) % 8;
  ctx.drawImage(rockSprite(v, R), x - 8 * s, y - 9.5 * s, 16 * s, 11 * s);
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


// ---------- nieuwe gebouwen (getekende versie, zolang het 3D-model nog niet klaar is) ----------

function roofFor(ctx, x0, y0, x1, y1, z, h, along = 'x') {
  if (STYLE && STYLE.roof && STYLE.roof !== 'gable') return styledRoof(ctx, x0, y0, x1, y1, z, h, C.roof, along === 'x');
  if (along === 'x') gableX(ctx, x0, y0, x1, y1, z, h, C.roof, C.plaster); else gableY(ctx, x0, y0, x1, y1, z, h, C.roof, C.plaster);
}

function mill(ctx, L) {
  shadow(ctx, 0.32);
  const h = 36 + L * 4;
  box(ctx, -0.18, -0.24, 0.18, 0.12, 0, h, C.plaster);
  doorL(ctx, 0.12, -0.06, 0.1, 10);
  poly(ctx, [P(-0.22, -0.28, h), P(0.22, -0.28, h), P(0.22, 0.16, h), P(-0.22, 0.16, h), P(0, -0.06, h + 20)], C.thatch, EDGE);
  poly(ctx, [P(0.22, -0.28, h), P(0.22, 0.16, h), P(0, -0.06, h + 20)], shade(C.thatch, -0.2), EDGE);
  const [hx, hy] = P(0.24, -0.06, h - 4);
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 1.6;
  for (const a of [0.5, 2.07, 3.64, 5.21]) {
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * 22, hy + Math.sin(a) * 22); ctx.stroke();
    ctx.fillStyle = 'rgba(240,232,210,0.9)';
    ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6); ctx.lineTo(hx + Math.cos(a) * 21, hy + Math.sin(a) * 21);
    ctx.lineTo(hx + Math.cos(a + 0.25) * 20, hy + Math.sin(a + 0.25) * 20); ctx.lineTo(hx + Math.cos(a + 0.5) * 6, hy + Math.sin(a + 0.5) * 6); ctx.fill();
  }
  ctx.fillStyle = C.iron; ctx.beginPath(); ctx.arc(hx, hy, 2, 0, Math.PI * 2); ctx.fill();
}

function academy(ctx, L) {
  shadow(ctx, 0.44);
  const h = 26 + L * 3;
  box(ctx, -0.42, -0.4, 0.26, 0.1, 0, h, C.plaster);
  for (let k = 0; k < 4; k++) column(ctx, -0.36 + k * 0.19, 0.28, 0, h * 0.8);
  box(ctx, -0.42, 0.1, 0.26, 0.32, h * 0.8, h * 0.8 + 3, C.plaster);
  doorL(ctx, 0.1, -0.12, 0.12, 12);
  roofFor(ctx, -0.42, -0.4, 0.26, 0.1, h, 14);
  if (L >= 2) {
    box(ctx, -0.4, -0.38, -0.18, -0.16, h, h + 18, C.plaster);
    if (L >= 3) dome(ctx, -0.29, -0.27, h + 18, 0.14, '#5f7f9e');
    else hipRoof(ctx, -0.42, -0.4, -0.16, -0.14, h + 18, 10, C.roofDark, 0.02);
  }
  target(ctx, 0.36, 0.3);
}

function guild(ctx, L) {
  shadow(ctx, 0.42);
  const h = 38 + L * 4;
  box(ctx, -0.32, -0.36, 0.3, 0.2, 0, h, '#c9b48e');
  for (let k = 0; k < 4; k++) {
    const w = 0.31 - k * 0.075;
    box(ctx, -0.01 - w, 0.17, -0.01 + w, 0.21, h + k * 4.5, h + (k + 1) * 4.5, '#c9b48e');
  }
  gableY(ctx, -0.32, -0.36, 0.3, 0.17, h, 18, C.roof, '#c9b48e');
  for (const a of [-0.26, -0.04, 0.16]) { windowL(ctx, 0.21, a, h - 12, 0.08, 7); windowL(ctx, 0.21, a, 6, 0.1, 9); }
  windowR(ctx, 0.3, -0.12, h - 12, 0.1, 7);
  const [sx, sy] = P(0.38, 0.14, 26);
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
}

function lodge(ctx, L) {
  shadow(ctx, 0.42);
  const h = 16 + L * 2;
  for (const [x, y] of [[-0.4, -0.4], [0.06, -0.4], [-0.4, 0.02], [0.06, 0.02]]) box(ctx, x - 0.02, y - 0.02, x + 0.02, y + 0.02, 0, h, C.woodDark, null);
  gableX(ctx, -0.42, -0.42, 0.08, 0.04, h, 10, C.roof, C.wood);
  const [bx, by] = P(0.26, -0.2);
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 46 - L * 4); ctx.lineTo(bx - 18, by - 34 - L * 4); ctx.stroke();
  ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(bx - 18, by - 34 - L * 4); ctx.lineTo(bx - 18, by - 16); ctx.stroke();
  ctx.fillStyle = '#d3cbb8'; ctx.fillRect(bx - 22, by - 16, 8, 6);
  box(ctx, 0.2, 0.22, 0.42, 0.38, 0, 5, '#cfc6b2');
}

function court(ctx, L, team) {
  shadow(ctx, 0.44);
  const h = 30 + L * 4;
  box(ctx, -0.36, -0.34, 0.28, 0.2, 0, h, C.stone);
  hipRoof(ctx, -0.38, -0.36, 0.3, 0.22, h, 20, '#3f4a5c', 0.04);
  for (const [x, y] of [[0.22, 0.14], [-0.36, 0.14]]) { box(ctx, x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, h + 10, C.stone); poly(ctx, [P(x - 0.08, y + 0.08, h + 10), P(x + 0.08, y + 0.08, h + 10), P(x + 0.08, y - 0.08, h + 10), P(x, y, h + 26)], C.roofDark, EDGE); }
  doorL(ctx, 0.2, -0.12, 0.14, 13);
  banner(ctx, -0.25, 0.2, h - 4, team, 12); banner(ctx, 0.08, 0.2, h - 4, team, 12);
  const [gx, gy] = P(-0.04, -0.07, h + 20); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(gx, gy, 2.2, 0, Math.PI * 2); ctx.fill();
}

function cathedral(ctx, L) {
  shadow(ctx, 0.46);
  const h = 30 + L * 3;
  box(ctx, -0.42, -0.24, 0.14, 0.18, 0, h, '#d3cbb8');
  gableX(ctx, -0.42, -0.24, 0.14, 0.18, h, 16, C.slate, '#d3cbb8');
  for (let k = 0; k < 4; k++) windowL(ctx, 0.18, -0.36 + k * 0.13, 10, 0.05, 12);
  const th = h + 22 + L * 8;
  box(ctx, 0.14, -0.13, 0.4, 0.13, 0, th, '#e0d9c8');
  windowR(ctx, 0.4, -0.04, th - 14, 0.08, 9);
  const [rx, ry] = P(0.4, 0, 22); ctx.fillStyle = '#3d6fb5'; ctx.beginPath(); ctx.ellipse(rx, ry, 3.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [P(0.14, 0.13, th), P(0.4, 0.13, th), P(0.27, 0, th + 34 + L * 6)], C.slate, EDGE);
  poly(ctx, [P(0.4, -0.13, th), P(0.4, 0.13, th), P(0.27, 0, th + 34 + L * 6)], shade(C.slate, -0.25), EDGE);
  const [cx, cy] = P(0.27, 0, th + 34 + L * 6); ctx.fillStyle = C.gold; ctx.fillRect(cx - 0.6, cy - 7, 1.2, 7); ctx.fillRect(cx - 2.5, cy - 5, 5, 1.2);
}

const DRAW = { house, farm, lumber, quarry, goldmine, storage, barracks, range, stable, smithy, market, tower, workshop, monument, tc, mill, academy, guild, lodge, court, cathedral };
const SIZES = { tc: 2, monument: 2 };

const cache = new Map();

// variant: huizen krijgen per gebouw een iets andere tint van muur en dak (minder eentonig)
export function buildingSprite(type, level, team = '#c0392b', civ = null, id = 0) {
  const st = STYLES[civ] || null;
  const variant = type === 'house' ? Math.abs(id) % 3 : 0;
  const key = `${type}:${level}:${team}:${st ? civ : ''}:${variant}`;
  let spr = cache.get(key);
  if (spr) return spr;
  const size = SIZES[type] || 1;
  const w = size * TW + 48;
  const h = size * TH + 170;
  const mk = () => { const c = document.createElement('canvas'); c.width = w * SCALE; c.height = h * SCALE; return c; };
  const cv = mk(); // grond (aangestampte aarde) + het gebouw met omlijning
  const bcv = mk(); // enkel het gebouw
  const ax = w / 2;
  const ay = h - (size * TH) / 2 - 14;
  const g0 = cv.getContext('2d');
  g0.scale(SCALE, SCALE); g0.translate(ax, ay);
  const ctx = bcv.getContext('2d');
  ctx.scale(SCALE, SCALE); ctx.translate(ax, ay);
  LIGHTS = [];
  rs = 12345;
  if (st) { Object.assign(C, st.palette); STYLE = st; }
  if (variant) {
    const tint = (c, a) => { const v = shade(c, a); const m = v.match(/\d+/g).map(Number); return '#' + m.map((x) => x.toString(16).padStart(2, '0')).join(''); };
    const k = variant === 1 ? 1 : -1;
    C.plaster = tint(C.plaster, -0.05 * (variant === 1 ? 1 : 0.4));
    C.roof = tint(C.roof, 0.1 * k); C.roofDark = tint(C.roofDark, 0.1 * k); C.thatch = tint(C.thatch, -0.08 * k);
    PLASTERS.add(C.plaster); WOODS.add(C.wood);
  }
  try {
    apron(g0, size, type);
    const L = Math.max(1, level);
    if (st && type === 'tc' && L >= 3) TC_CIV[civ](ctx, L, team);
    else (DRAW[type] || house)(ctx, L, team);
    const landmark = st && type === 'tc' && L >= 3;
    if (!landmark) for (const [px, py, fn] of PROPS[type] || []) if (type !== 'house' || fn !== propPots || level >= 2) fn(ctx, px, py, team);
    // versiering van het volk naast het gebouw
    if (st && !['farm', 'market', 'quarry', 'goldmine', 'monument'].includes(type) && !(type === 'tc' && L >= 3)) {
      const side = SIDE[st.side];
      if (type === 'tc') { side(ctx, -0.98, 0.98); side(ctx, 0.98, -0.98); } else side(ctx, -0.46, 0.46);
    }
  } finally {
    Object.assign(C, BASE_C); STYLE = null;
  }
  addGrain(bcv);
  outline(g0, bcv, type === 'farm' ? 0.3 : 0.62);
  spr = { cv, w, h, ax, ay, lights: LIGHTS };
  LIGHTS = null;
  cache.set(key, spr);
  return spr;
}

// donkere omlijning rond het gebouw (zoals bij de figuren): scherper en beter leesbaar op het gras
function outline(dst, src, alpha) {
  const w = src.width; const h = src.height;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d');
  const px = SCALE * 0.55;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7]]) t.drawImage(src, dx * px, dy * px);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = `rgba(34,22,12,${alpha})`;
  t.fillRect(0, 0, w, h);
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.drawImage(tmp, 0, 0);
  dst.drawImage(src, 0, 0);
  dst.restore();
}

// fijne materiaalkorrel over alles wat getekend is (muren, daken, hout): minder glad, meer 'echt'
function addGrain(cv) {
  if (!grainTex) grainTex = groundTexture('grain', 128);
  const tmp = document.createElement('canvas');
  tmp.width = cv.width; tmp.height = cv.height;
  const t = tmp.getContext('2d');
  t.fillStyle = t.createPattern(grainTex, 'repeat');
  t.fillRect(0, 0, tmp.width, tmp.height);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(cv, 0, 0);
  const c = cv.getContext('2d');
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = 0.42;
  c.drawImage(tmp, 0, 0);
  c.restore();
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
