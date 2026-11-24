// Scherpe grond bij inzoomen.
// De grond van de stad wordt één keer gebakken op lage resolutie (voor uitgezoomd). Zoom je in, dan tekent de stad
// het stuk dat je ziet opnieuw in vierkante stukken op schermresolutie (2 tot 6 pixels per wereldpixel), met dezelfde
// tekenfunctie (alles staat op vaste, gehashte plaatsen) plus fijne texturen die enkel van dichtbij zin hebben.
// Hier: die fijne texturen, het tekenen van één steen, en de cache van stukken.

const TAU = Math.PI * 2;

// resolutie (pixels per wereldpixel) en breedte van een stuk in wereldpixels: elk stuk is ±512-576 pixels breed.
// Ook op een gsm (klein scherm = weinig stukken) gaan we tot 6; enkel echt trage toestellen (≤ 4 kernen) tot 4,5.
const WEAK = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;
export const HD_TIERS = WEAK ? [[2, 256], [3, 192], [4.5, 128]] : [[2, 256], [3, 192], [4.5, 128], [6, 96]];
export const HD_FROM = 1.4; // vanaf zoveel schermpixels per wereldpixel (lager: de gebakken grond is scherp genoeg)
const BUDGET = (WEAK ? 5 : 8) * 1e6; // pixels in het geheugen (± 4 bytes per pixel)
const PAD = 2; // overlap tussen stukken (pixels), tegen naden

export function hdTier(need) {
  if (!(need >= HD_FROM)) return null;
  for (const t of HD_TIERS) if (t[0] >= need * 0.9) return t;
  return HD_TIERS[HD_TIERS.length - 1];
}

// ---------- kleine hulpmiddelen ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Teken iets naadloos: de vorm ook aan de overkant van de rand als hij erover hangt.
function wrapDraw(P, x, y, r, fn) {
  for (const ox of [-P, 0, P]) {
    if (x + ox < -r || x + ox > P + r) continue;
    for (const oy of [-P, 0, P]) {
      if (y + oy < -r || y + oy > P + r) continue;
      fn(x + ox, y + oy);
    }
  }
}

// ---------- fijne texturen (grijswaarden rond 128, gelegd met 'overlay') ----------
// P = herhaling in wereldpixels, S = pixels per wereldpixel. Elk soort bodem heeft twee lagen met een andere
// herhaling, zodat je geen patroon ziet.
const LAYERS = {
  grass: [[83, 0.62, 11], [59, 0.42, 12]],
  forest: [[71, 0.55, 21], [47, 0.35, 22]],
  dirt: [[67, 0.55, 31], [43, 0.4, 32]],
  grain: [[64, 0.3, 41]],
};
const texCache = new Map();

function makeTex(kind, P, S, seed) {
  const n = Math.max(8, Math.round(P * S));
  const cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  const c = cv.getContext('2d');
  const k = n / P; // exacte schaal (afgerond op hele pixels)
  c.fillStyle = '#808080'; c.fillRect(0, 0, n, n);
  const R = rng(seed * 7919 + Math.round(S * 10));
  if (kind === 'grain') {
    // korrel per pixel: stenen en aarde worden niet glad
    const img = c.getImageData(0, 0, n, n); const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 128 + (R() - 0.5) * 70; d[i] = v; d[i + 1] = v; d[i + 2] = v; }
    c.putImageData(img, 0, 0);
    c.scale(k, k);
    for (let i = 0; i < P * P * 0.08; i++) {
      const x = R() * P; const y = R() * P; const r = 0.15 + R() * 0.3;
      c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';
      wrapDraw(P, x, y, r, (a, b) => { c.beginPath(); c.ellipse(a, b, r, r * 0.6, 0, 0, TAU); c.fill(); });
    }
    return cv;
  }
  c.scale(k, k);
  c.lineCap = 'round';
  if (kind === 'grass') {
    // zachte vlekjes (dichter en ijler gras)
    for (let i = 0; i < P * P * 0.004; i++) {
      const x = R() * P; const y = R() * P; const r = 2 + R() * 5;
      c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
      wrapDraw(P, x, y, r, (a, b) => { c.beginPath(); c.ellipse(a, b, r, r * 0.5, 0, 0, TAU); c.fill(); });
    }
    // grasprietjes: donkere voet, lichte top (zon van linksboven)
    const nb = P * P * 0.42;
    for (let i = 0; i < nb; i++) {
      const x = R() * P; const y = R() * P;
      const h = 1.1 + R() * 1.9; const lean = (R() - 0.5) * 1.5; const w = 0.28 + R() * 0.26;
      const t = R();
      const col = t < 0.42 ? `rgba(0,0,0,${0.2 + R() * 0.25})` : t < 0.9 ? `rgba(255,255,255,${0.16 + R() * 0.22})` : `rgba(255,255,230,${0.35 + R() * 0.2})`;
      c.fillStyle = col;
      wrapDraw(P, x, y, 4, (a, b) => {
        c.beginPath(); c.moveTo(a - w, b); c.quadraticCurveTo(a + lean * 0.3, b - h * 0.6, a + lean, b - h); c.quadraticCurveTo(a + lean * 0.3 + w * 0.3, b - h * 0.5, a + w, b); c.closePath(); c.fill();
      });
    }
    // klavertjes en kleine schaduwkuiltjes
    for (let i = 0; i < P * P * 0.012; i++) {
      const x = R() * P; const y = R() * P;
      const light = R() < 0.6;
      wrapDraw(P, x, y, 2, (a, b) => {
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(a + 0.15, b + 0.3, 0.9, 0.45, 0, 0, TAU); c.fill();
        if (!light) return;
        c.fillStyle = 'rgba(255,255,255,0.3)';
        for (const [dx, dy] of [[-0.35, 0], [0.35, 0], [0, -0.3]]) { c.beginPath(); c.ellipse(a + dx, b + dy - 0.2, 0.33, 0.22, 0, 0, TAU); c.fill(); }
      });
    }
  } else if (kind === 'forest') {
    // gevallen blad, naalden en takjes
    for (let i = 0; i < P * P * 0.16; i++) {
      const x = R() * P; const y = R() * P; const a0 = R() * TAU; const t = R();
      wrapDraw(P, x, y, 3, (a, b) => {
        if (t < 0.55) {
          c.fillStyle = t < 0.3 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.22)';
          c.beginPath(); c.ellipse(a, b, 0.9 + t, 0.42 + t * 0.3, a0, 0, TAU); c.fill();
        } else if (t < 0.93) {
          c.strokeStyle = t < 0.75 ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.22)'; c.lineWidth = 0.18;
          c.beginPath(); c.moveTo(a, b); c.lineTo(a + Math.cos(a0) * 1.4, b + Math.sin(a0) * 0.7); c.stroke();
        } else {
          c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.3;
          c.beginPath(); c.moveTo(a, b); c.lineTo(a + Math.cos(a0) * 3.4, b + Math.sin(a0) * 1.7); c.stroke();
        }
      });
    }
  } else if (kind === 'dirt') {
    // gruis en steentjes, wat barstjes
    for (let i = 0; i < P * P * 0.1; i++) {
      const x = R() * P; const y = R() * P; const r = 0.15 + R() * R() * 0.9;
      wrapDraw(P, x, y, 2, (a, b) => {
        c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(a + r * 0.25, b + r * 0.35, r, r * 0.6, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.34)'; c.beginPath(); c.ellipse(a, b, r * 0.85, r * 0.5, 0, 0, TAU); c.fill();
      });
    }
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.2;
    for (let i = 0; i < P * P * 0.002; i++) {
      let x = R() * P; let y = R() * P;
      const pts = [[x, y]];
      for (let s = 0; s < 4; s++) { x += (R() - 0.5) * 3; y += (R() - 0.5) * 1.5; pts.push([x, y]); }
      wrapDraw(P, pts[0][0], pts[0][1], 8, (a, b) => {
        const dx = a - pts[0][0]; const dy = b - pts[0][1];
        c.beginPath(); c.moveTo(a, b); for (const [px, py] of pts) c.lineTo(px + dx, py + dy); c.stroke();
      });
    }
  }
  return cv;
}

// Patronen voor een context met wereldtransformatie (schaal S): één texel = één pixel.
export function hdPatterns(g, kind, S) {
  const layers = LAYERS[kind];
  if (!layers) return [];
  const out = [];
  for (const [P, alpha, seed] of layers) {
    const id = `${kind}|${P}|${S}`;
    let cv = texCache.get(id);
    if (!cv) { cv = makeTex(kind, P, S, seed); texCache.set(id, cv); }
    const pat = g.createPattern(cv, 'repeat');
    const k = cv.width / P;
    if (pat.setTransform) pat.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    out.push([pat, alpha]);
  }
  return out;
}

// ---------- één steen (kassei, kinderkopje, stapsteen) ----------
// P = 4 hoekpunten in wereldpixels, in volgorde rond. De vorm is een rechthoek met afgeronde hoeken (c = hoe rond).
// Eerst de donkere zijkant (iets lager), dan het bovenvlak met een verloop (licht van linksboven), dan een glansje.
function quadPath(g, P, s, dx, dy, c) {
  const cx = (P[0] + P[2] + P[4] + P[6]) / 4; const cy = (P[1] + P[3] + P[5] + P[7]) / 4;
  const X = (i) => cx + (P[2 * (i & 3)] - cx) * s + dx; const Y = (i) => cy + (P[2 * (i & 3) + 1] - cy) * s + dy;
  for (let i = 0; i < 4; i++) {
    const x = X(i); const y = Y(i);
    const ax = x + (X(i + 3) - x) * c; const ay = y + (Y(i + 3) - y) * c;
    const bx = x + (X(i + 1) - x) * c; const by = y + (Y(i + 1) - y) * c;
    if (i === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay);
    g.quadraticCurveTo(x, y, bx, by);
  }
  g.closePath();
}

const clamp255 = (v) => (v > 255 ? 255 : v < 0 ? 0 : v | 0);
const rgbS = (c, k) => `rgb(${clamp255(c[0] * k)},${clamp255(c[1] * k)},${clamp255(c[2] * k)})`;

export function stone(g, P, rgb, lift = 1, shine = 1, round = 0.3) {
  let x0 = P[0]; let x1 = P[0]; let y0 = P[1]; let y1 = P[1];
  for (let i = 2; i < 8; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  g.fillStyle = `rgb(${rgb[0] * 0.42 | 0},${rgb[1] * 0.4 | 0},${rgb[2] * 0.37 | 0})`;
  g.beginPath(); quadPath(g, P, 1.03, 0.1 * lift, 0.5 * lift, round); g.fill();
  const gr = g.createLinearGradient(x0 + (x1 - x0) * 0.15, y0, x0 + (x1 - x0) * 0.7, y1);
  gr.addColorStop(0, rgbS(rgb, 1.16)); gr.addColorStop(0.45, rgbS(rgb, 1)); gr.addColorStop(1, rgbS(rgb, 0.74));
  g.fillStyle = gr;
  g.beginPath(); quadPath(g, P, 1, 0, 0, round); g.fill();
  if (shine > 0) {
    g.fillStyle = `rgba(255,250,236,${0.22 * shine})`;
    g.beginPath(); quadPath(g, P, 0.42, -(x1 - x0) * 0.12, -(y1 - y0) * 0.14, 0.5); g.fill();
  }
}

// kleurmenging van twee [r,g,b] (t 0..1)
export const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- cache van scherpe stukken ----------
export class HDGround {
  constructor() { this.map = new Map(); this.px = 0; this.frame = 0; }

  clear() {
    for (const c of this.map.values()) c.cv.width = 0;
    this.map.clear(); this.px = 0;
  }

  // vis: zichtbare wereldrechthoek; bounds: waar grond ligt; key: verandert als de grond verandert;
  // paint(g, R, S): tekent de grond (g staat al in wereldcoördinaten op schaal S)
  draw(ctx, vis, need, bounds, key, paint, budgetMs = 8) {
    let tier = hdTier(need);
    if (!tier) return 0;
    // blijf op dezelfde resolutie zolang die nog goed genoeg is (geen nieuwe stukken bij elke kleine zoom)
    const last = this.tier;
    if (last && last !== tier && need >= HD_FROM && need > last[0] * 0.65 && need < last[0] * 1.15) tier = last;
    this.tier = tier;
    const [S, CW] = tier;
    this.frame++;
    const cx0 = Math.floor(Math.max(vis.x0, bounds.x0) / CW); const cx1 = Math.floor(Math.min(vis.x1, bounds.x1) / CW);
    const cy0 = Math.floor(Math.max(vis.y0, bounds.y0) / CW); const cy1 = Math.floor(Math.min(vis.y1, bounds.y1) / CW);
    const t0 = performance.now();
    let made = 0;
    // eerst het midden van het scherm
    const mx = (vis.x0 + vis.x1) / 2 / CW; const my = (vis.y0 + vis.y1) / 2 / CW;
    const list = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) list.push([cx, cy, Math.abs(cx + 0.5 - mx) + Math.abs(cy + 0.5 - my)]);
    list.sort((a, b) => a[2] - b[2]);
    const todo = [];
    for (const [cx, cy] of list) {
      const id = `${S}|${cx}|${cy}`;
      const c = this.map.get(id);
      if (!c || c.key !== key) todo.push([cx, cy, id, c]);
    }
    for (const [cx, cy, id, old] of todo) {
      if (made >= 2 || (made && performance.now() - t0 > budgetMs)) break;
      const n = Math.ceil(CW * S) + 2 * PAD;
      const cv = old ? old.cv : document.createElement('canvas');
      if (cv.width !== n) { cv.width = n; cv.height = n; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, n, n);
      const x0 = cx * CW; const y0 = cy * CW;
      g.setTransform(S, 0, 0, S, -x0 * S + PAD, -y0 * S + PAD);
      paint(g, { x0: x0 - PAD / S, y0: y0 - PAD / S, x1: x0 + CW + PAD / S, y1: y0 + CW + PAD / S }, S);
      if (!old) this.px += n * n;
      this.map.set(id, { cv, key, used: this.frame, S, CW, cx, cy });
      made++;
    }
    // tekenen: elk stuk met 1 pixel overlap naar de buren (geen naden)
    for (const [cx, cy] of list) {
      const c = this.map.get(`${S}|${cx}|${cy}`);
      if (!c) continue;
      c.used = this.frame;
      const sz = CW * S;
      ctx.drawImage(c.cv, PAD - 1, PAD - 1, sz + 2, sz + 2, cx * CW - 1 / S, cy * CW - 1 / S, CW + 2 / S, CW + 2 / S);
    }
    // geheugen: de langst niet gebruikte stukken weg
    if (this.px > BUDGET) {
      const all = [...this.map.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [id, c] of all) {
        if (this.px <= BUDGET * 0.8 || c.used === this.frame) break;
        this.px -= c.cv.width * c.cv.height;
        c.cv.width = 0;
        this.map.delete(id);
      }
    }
    return todo.length - made; // nog te maken
  }
}
