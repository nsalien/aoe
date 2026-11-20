// Sfeer en effecten: dag/nacht, lichtgloed, deeltjes, vogels, wolken, vlinders en vuurvliegjes.
// Alles in wereldcoördinaten tenzij anders vermeld.

export const LOW_POWER = typeof window !== 'undefined' && (window.innerWidth < 800 || (navigator.hardwareConcurrency || 8) <= 4);

// ---------- dag en nacht ----------

let lightMode = 'auto';
try { lightMode = localStorage.getItem('rvs-light') || 'auto'; } catch { /* privévenster */ }

export function getLightMode() { return lightMode; }
export function setLightMode(m) {
  lightMode = m;
  try { localStorage.setItem('rvs-light', m); } catch { /* */ }
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Geeft de lichtsituatie: dark (0 = volle dag, 1 = diepe nacht) en warm (avondrood 0..1).
export function daylight(date = new Date()) {
  if (lightMode === 'day') return { dark: 0, warm: 0, hour: 13 };
  if (lightMode === 'night') return { dark: 1, warm: 0, hour: 23 };
  const h = date.getHours() + date.getMinutes() / 60;
  let dark;
  if (h >= 7.5 && h < 18.5) dark = 0;
  else if (h >= 18.5 && h < 21) dark = smooth(clamp01((h - 18.5) / 2.5));
  else if (h >= 5.5 && h < 7.5) dark = 1 - smooth(clamp01((h - 5.5) / 2));
  else dark = 1;
  // avondrood en ochtendgloren
  const warm = Math.max(0, 1 - Math.abs(h - 19.2) / 1.6) * 0.9 + Math.max(0, 1 - Math.abs(h - 6.8) / 1.2) * 0.6;
  return { dark, warm: clamp01(warm), hour: h };
}

// Kleurt het hele canvas (schermcoördinaten). Daarna gloed tekenen met drawGlow.
export function applyLight(ctx, w, h, light) {
  if (light.dark <= 0.01 && light.warm <= 0.01) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  const d = light.dark * 0.62;
  const wr = light.warm * (1 - light.dark * 0.6);
  // mengsel van wit (geen effect), avondoranje en nachtblauw
  const r = Math.round(255 * (1 - d) + 40 * d - 20 * wr);
  const g = Math.round(255 * (1 - d) + 60 * d - 70 * wr);
  const b = Math.round(255 * (1 - d) + 130 * d - 110 * wr);
  ctx.fillStyle = `rgb(${Math.max(0, r)},${Math.max(0, g)},${Math.max(0, b)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------- gloed ----------

const glowCache = new Map();
function glowSprite(color) {
  let cv = glowCache.get(color);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.55)'));
  grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, cv);
  return cv;
}

export const WARM = 'rgba(255,190,100,1)';
export const FIRE = 'rgba(255,140,50,1)';
export const COLD = 'rgba(170,210,255,1)';

export function drawGlow(ctx, x, y, r, color = WARM, alpha = 1) {
  if (alpha <= 0.01) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

// ---------- deeltjes ----------

export class Particles {
  constructor(max = LOW_POWER ? 220 : 600) {
    this.list = [];
    this.max = max;
  }

  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ vx: 0, vy: 0, g: 0, age: 0, life: 1000, size: 2, rot: 0, vr: 0, ...p });
  }

  sparkle(x, y, n = 24, colors = ['#ffe28a', '#fff6c8', '#f2c230']) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.03 + Math.random() * 0.09;
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 0.06, g: 0.00012, life: 700 + Math.random() * 700, size: 1.2 + Math.random() * 1.8, color: colors[i % colors.length] });
    }
  }

  dust(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'dust', x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.02, vy: -0.008 - Math.random() * 0.01, life: 900 + Math.random() * 700, size: 3 + Math.random() * 4 });
    }
  }

  sparks(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'spark', x, y, vx: (Math.random() - 0.5) * 0.12, vy: -0.05 - Math.random() * 0.08, g: 0.0003, life: 300 + Math.random() * 300, size: 1 + Math.random(), color: Math.random() < 0.5 ? '#ffb347' : '#ffe08a' });
    }
  }

  confetti(x, y, n = 50) {
    const cols = ['#d64545', '#3f7fd9', '#3fae5a', '#e0b020', '#9455d1', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 0.12 + Math.random() * 0.18;
      this.add({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.00025, life: 1800 + Math.random() * 1200, size: 2 + Math.random() * 2, color: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02 });
    }
  }

  firework(x, y) {
    const cols = ['#ffd166', '#ef476f', '#06d6a0', '#8ecae6', '#ffffff'];
    const c = cols[Math.floor(Math.random() * cols.length)];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const sp = 0.09 + Math.random() * 0.03;
      this.add({ kind: 'spark', glow: true, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.00006, life: 1200 + Math.random() * 400, size: 1.6, color: c });
    }
  }

  text(x, y, txt, color = '#fff3c4') {
    this.add({ kind: 'text', x, y, vy: -0.025, life: 2200, txt, color });
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = p.age / p.life;
      const a = 1 - t;
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(190,165,120,${0.45 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + t * 1.5), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'spark') {
        if (p.glow) drawGlow(ctx, p.x, p.y, 6, 'rgba(255,220,150,1)', a * 0.6);
        ctx.fillStyle = p.color; ctx.globalAlpha = a;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'confetti') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        ctx.restore();
      } else if (p.kind === 'text') {
        ctx.globalAlpha = Math.min(1, a * 2.5);
        ctx.font = '800 13px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,25,10,0.85)';
        ctx.strokeText(p.txt, p.x, p.y);
        ctx.fillStyle = p.color; ctx.fillText(p.txt, p.x, p.y);
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ---------- vogels ----------

export class Birds {
  constructor(bounds) {
    this.bounds = bounds; // {x0,x1,y0,y1}
    this.flocks = [];
    this.next = 4000 + Math.random() * 6000;
  }

  update(dt) {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 14000 + Math.random() * 18000;
      const b = this.bounds;
      const left = Math.random() < 0.5;
      const y = b.y0 + Math.random() * (b.y1 - b.y0);
      const n = 3 + Math.floor(Math.random() * 5);
      const members = [];
      for (let i = 0; i < n; i++) members.push({ dx: -i * 14 + (Math.random() - 0.5) * 6, dy: (i % 2 ? 1 : -1) * i * 7 + (Math.random() - 0.5) * 4, ph: Math.random() * 6 });
      this.flocks.push({ x: left ? b.x0 - 80 : b.x1 + 80, y, vx: (left ? 1 : -1) * (0.05 + Math.random() * 0.03), vy: (Math.random() - 0.5) * 0.015, members });
    }
    for (const f of this.flocks) { f.x += f.vx * dt; f.y += f.vy * dt; }
    const b = this.bounds;
    this.flocks = this.flocks.filter((f) => f.x > b.x0 - 300 && f.x < b.x1 + 300);
  }

  draw(ctx, t, shadowDist = 70) {
    for (const f of this.flocks) {
      const dir = f.vx > 0 ? 1 : -1;
      for (const m of f.members) {
        const x = f.x + m.dx * dir; const y = f.y + m.dy;
        const flap = Math.sin(t * 0.016 + m.ph) * 4;
        // schaduw op de grond
        ctx.fillStyle = 'rgba(20,30,10,0.18)';
        ctx.beginPath(); ctx.ellipse(x + 10, y + shadowDist, 4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 6, y - flap); ctx.quadraticCurveTo(x - 3, y - 2 - flap * 0.3, x, y);
        ctx.quadraticCurveTo(x + 3, y - 2 - flap * 0.3, x + 6, y - flap);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  }
}

// ---------- wolken ----------

const cloudSprites = [];
function makeCloud(seed, dark) {
  const cv = document.createElement('canvas');
  cv.width = 400; cv.height = 220;
  const g = cv.getContext('2d');
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const blobs = 9 + Math.floor(rnd() * 5);
  for (let i = 0; i < blobs; i++) {
    const r = 24 + rnd() * 30;
    const x = 115 + rnd() * 170; const y = 110 + (rnd() - 0.5) * 34;
    const grad = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    if (dark) { grad.addColorStop(0, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
    else { grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.6, 'rgba(245,248,255,0.7)'); grad.addColorStop(1, 'rgba(230,236,248,0)'); }
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return cv;
}
function clouds() {
  if (!cloudSprites.length) for (let i = 0; i < 4; i++) cloudSprites.push({ light: makeCloud(1234 + i * 977, false), dark: makeCloud(1234 + i * 977, true) });
  return cloudSprites;
}

export class Clouds {
  constructor(bounds, n = LOW_POWER ? 5 : 9) {
    this.bounds = bounds;
    this.items = [];
    for (let i = 0; i < n; i++) this.items.push(this.spawn(true));
  }

  spawn(anywhere) {
    const b = this.bounds;
    return {
      x: anywhere ? b.x0 + Math.random() * (b.x1 - b.x0) : b.x0 - 400,
      y: b.y0 + Math.random() * (b.y1 - b.y0),
      s: 0.9 + Math.random() * 1.4,
      v: 0.006 + Math.random() * 0.008,
      k: Math.floor(Math.random() * 4),
      a: 0.35 + Math.random() * 0.3,
    };
  }

  update(dt) {
    for (const c of this.items) c.x += c.v * dt;
    this.items = this.items.map((c) => (c.x > this.bounds.x1 + 400 ? this.spawn(false) : c));
  }

  drawShadows(ctx, alpha = 0.16) {
    const cs = clouds();
    for (const c of this.items) {
      const spr = cs[c.k].dark;
      ctx.globalAlpha = alpha;
      ctx.drawImage(spr, c.x + 90 * c.s, c.y + 120 * c.s, 400 * c.s, 150 * c.s);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx, alphaMul = 1) {
    const cs = clouds();
    for (const c of this.items) {
      ctx.globalAlpha = c.a * alphaMul;
      ctx.drawImage(cs[c.k].light, c.x, c.y, 400 * c.s, 220 * c.s);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- vlinders (dag) en vuurvliegjes (nacht) ----------

export class Flutter {
  constructor(spots, n = LOW_POWER ? 6 : 12) {
    this.items = [];
    for (let i = 0; i < n && spots.length; i++) {
      const s = spots[Math.floor(Math.random() * spots.length)];
      this.items.push({ hx: s.x, hy: s.y, x: s.x, y: s.y, ph: Math.random() * 100, col: ['#ffd84d', '#ffffff', '#ff9ec7', '#9fd3ff'][i % 4] });
    }
  }

  draw(ctx, t, night) {
    for (const f of this.items) {
      const tt = t * 0.0006 + f.ph;
      f.x = f.hx + Math.sin(tt * 1.3) * 26 + Math.sin(tt * 3.1) * 6;
      f.y = f.hy + Math.cos(tt * 1.1) * 14 - 10 + Math.sin(tt * 4.3) * 3;
      if (night > 0.5) {
        const blink = 0.5 + 0.5 * Math.sin(t * 0.004 + f.ph * 7);
        drawGlow(ctx, f.x, f.y, 7, 'rgba(210,255,120,1)', blink * night);
        ctx.fillStyle = `rgba(235,255,170,${blink * night})`;
        ctx.fillRect(f.x - 0.8, f.y - 0.8, 1.6, 1.6);
      } else if (night < 0.3) {
        const w = Math.abs(Math.sin(t * 0.03 + f.ph)) * 2.6 + 0.6;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x - w / 2, f.y, w / 2, 1.8, 0, 0, Math.PI * 2); ctx.ellipse(f.x + w / 2, f.y, w / 2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
