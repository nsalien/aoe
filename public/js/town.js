// Isometrische weergave van de eigen stad: gebouwen met slagschaduwen, dag en nacht,
// wandelende dorpelingen, troepen, schapen, eendjes, vogels en feestelijke effecten.
import * as A from './art.js';
import * as FX from './fx.js';
import { Camera, isoFns, hashInt } from './iso.js';
import { BUILDINGS, TOWN_GRID, RES } from '../shared/rules.js';
import { canPlaceAt, totalVillagers } from '../shared/sim.js';

const N = TOWN_GRID;
const R = 9;
const { toWorld, toGrid } = isoFns(A.TW, A.TH);
const BAKE = FX.LOW_POWER ? 1.25 : 1.6;

const SPRITE_H = { tc: 120, tower: 115, monument: 130, barracks: 70, house: 60, workshop: 60, smithy: 70 };
const CARRY = { food: '#d9534f', wood: '#8b5a2b', stone: '#b9b4a8', gold: '#f2c230' };

// hoogte (px) per gebouw en niveau voor de slagschaduw, en de halve breedte van het grondvlak
const SHADOW = {
  tc: [[0, 40, 62, 80, 86], 0.85], house: [[0, 26, 33, 44], 0.32], farm: [[0, 0, 0, 24], 0.12],
  lumber: [[0, 20, 22, 24], 0.3], quarry: [[0, 16, 18, 20], 0.3], goldmine: [[0, 22, 24, 26], 0.34],
  storage: [[0, 28, 31, 34], 0.36], barracks: [[0, 30, 35, 50], 0.4], range: [[0, 26, 29, 32], 0.3],
  stable: [[0, 26, 29, 32], 0.34], smithy: [[0, 36, 38, 40, 42, 44], 0.34], market: [[0, 12, 12, 12], 0.3],
  tower: [[0, 60, 76, 104], 0.26], workshop: [[0, 32, 36], 0.36], monument: [[0, 50, 62, 74, 86, 98], 0.8],
};

function treeSprites() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const cv = document.createElement('canvas');
    cv.width = 60 * 2; cv.height = 70 * 2;
    const c = cv.getContext('2d');
    c.scale(2, 2);
    const s = 1.05 + (i % 4) * 0.12;
    if (i < 4) A.conifer(c, 30, 64, s, i / 4); else A.broadleaf(c, 30, 64, s, (i - 4) / 4);
    out.push({ cv, w: 60, h: 70, ax: 30, ay: 64 });
  }
  return out;
}

// convex omhulsel (monotone chain) voor schaduwvormen
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; const up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export class TownView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = new Camera(canvas, { zoom: window.innerWidth < 700 ? 1.1 : 1.45, minZoom: 0.45, maxZoom: 2.8 });
    const c = toWorld(N / 2, N / 2);
    this.cam.x = c.x; this.cam.y = c.y - 30;
    const l = toWorld(-R + 3, N + R - 3); const r = toWorld(N + R - 3, -R + 3);
    const t = toWorld(-R + 3, -R + 3); const b = toWorld(N + R - 3, N + R - 3);
    this.cam.bounds = { x0: l.x, x1: r.x, y0: t.y, y1: b.y };
    const wb = { x0: toWorld(-R, N + R).x, x1: toWorld(N + R, -R).x, y0: toWorld(-R, -R).y, y1: toWorld(N + R, N + R).y };
    this.worldBounds = wb;
    this.state = null;
    this.townKey = null;
    this.team = '#c0392b';
    this.placing = null;
    this.hoverTile = null;
    this.selected = null;
    this.walkers = [];
    this.sheep = [];
    this.ducks = [];
    this.trees = treeSprites();
    this.particles = new FX.Particles();
    this.birds = new FX.Birds(wb);
    this.clouds = new FX.Clouds({ x0: wb.x0 - 200, x1: wb.x1, y0: wb.y0 - 100, y1: wb.y1 - 200 }, FX.LOW_POWER ? 3 : 5);
    this.flutter = null;
    this.prevLevels = null;
    this.fireworks = [];
    this.emitT = 0;
    this.light = FX.daylight();
    this.onSelect = null;
    this.onPlace = null;
    this.onCancelPlace = null;
    this.onCelebrate = null;
    this.cam.onClick = (sx, sy, e) => this.click(sx, sy, e);
    this.cam.onHover = (sx, sy) => { this.hoverTile = sx < 0 ? null : this.screenGrid(sx, sy); };
    this.cam.onRightClick = () => { if (this.placing && this.onCancelPlace) this.onCancelPlace(); };
  }

  screenGrid(sx, sy) {
    const w = this.cam.screenToWorld(sx, sy);
    return toGrid(w.x, w.y);
  }

  setTown(id, color) {
    this.team = color;
    if (this.townKey === id) return;
    this.townKey = id;
    this.seed = id * 7919 + 13;
    this.prevLevels = null;
    this.bakeGround();
  }

  setState(state) {
    this.state = state;
    this.syncWalkers();
    this.detectUpgrades();
  }

  // feest als een gebouw klaar is of een nieuw tijdperk begint
  detectUpgrades() {
    const now = new Map(this.state.buildings.map((b) => [b.id, b.level]));
    if (this.prevLevels) {
      for (const b of this.state.buildings) {
        const before = this.prevLevels.get(b.id) ?? 0;
        if (b.level <= before) continue;
        const size = BUILDINGS[b.type].size || 1;
        const c = b.x >= 0 ? toWorld(b.x + size / 2, b.y + size / 2) : toWorld(N / 2, N);
        if (b.type === 'tc') {
          this.particles.confetti(c.x, c.y - 70, 90);
          for (let i = 0; i < 7; i++) this.fireworks.push({ at: performance.now() + i * 420, x: c.x + (Math.random() - 0.5) * 220, y: c.y - 140 - Math.random() * 90 });
          this.particles.text(c.x, c.y - 120, 'Nieuw tijdperk!', '#ffe28a');
        } else {
          this.particles.sparkle(c.x, c.y - 30, 30);
          this.particles.text(c.x, c.y - 60, b.level === 1 ? 'Klaar!' : `Niveau ${b.level}!`);
        }
        if (this.onCelebrate) this.onCelebrate(b);
      }
    }
    this.prevLevels = now;
  }

  // ---------- grond en decor (één keer per stad) ----------

  inBuild(x, y, m = 0) {
    return x >= -m && y >= -m && x < N + m && y < N + m;
  }

  bakeGround() {
    const sd = this.seed;
    const W = (N + 2 * R) * A.TW; const H = (N + 2 * R) * A.TH + 20;
    const cv = document.createElement('canvas');
    cv.width = W * BAKE; cv.height = H * BAKE;
    const g = cv.getContext('2d');
    const origin = toWorld(-R, -R); // bovenste hoek
    this.groundOrigin = { x: origin.x - W / 2, y: origin.y };
    g.scale(BAKE, BAKE);
    g.translate(W / 2, 0);
    g.translate(-origin.x, -origin.y);
    const mid = N / 2;
    // vijver, grondstoffen en weide: kies plekken buiten de stad
    const spots = [[-5, 4], [4, -5], [N + 4, 3], [3, N + 4]];
    const pond = spots[Math.floor(hashInt(1, 2, sd) * spots.length)];
    this.pond = { x: pond[0], y: pond[1], r: 2.4 };
    const deposits = spots.filter((s) => s !== pond);
    this.deposits = {
      stone: { x: deposits[0][0], y: deposits[0][1] },
      gold: { x: deposits[1][0], y: deposits[1][1] },
      food: { x: deposits[2][0], y: deposits[2][1] },
    };
    this.pasture = { x: N + 4.2, y: N - 2.2 };

    // grastegels met zachte vlekken; donkerder naar het bos toe
    for (let j = -R; j < N + R; j++) {
      for (let i = -R; i < N + R; i++) {
        const n = hashInt(Math.floor(i / 3), Math.floor(j / 3), sd) * 0.6 + hashInt(i, j, sd + 1) * 0.4;
        const dx = Math.max(-1 - i, i - N, 0); const dy = Math.max(-1 - j, j - N, 0);
        const d = Math.max(dx, dy);
        let col = A.mix('#7db64a', '#97c75c', n);
        if (d > 0) col = A.mix(col, '#4f7f30', Math.min(0.7, (d - 0.5) / 7));
        const p = toWorld(i + 0.5, j + 0.5);
        A.diamond(g, p.x, p.y, A.TW + 1, A.TH + 1, col);
      }
    }
    // grote, zachte kleurvlekken voor een natuurlijke look
    for (let k = 0; k < 70; k++) {
      const i = -R + hashInt(k, 21, sd) * (N + 2 * R); const j = -R + hashInt(k, 22, sd) * (N + 2 * R);
      const p = toWorld(i, j);
      const r = 30 + hashInt(k, 23, sd) * 70;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const light = k % 2 === 0;
      gr.addColorStop(0, light ? 'rgba(200,230,120,0.14)' : 'rgba(40,80,20,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); g.fill();
    }

    // in grid-ruimte tekenen (cirkels worden isometrische ellipsen)
    g.save();
    g.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    // wegen: donkere rand, lichtere kern
    const roads = [[mid, mid, mid, N + R], [mid, mid, mid, -R], [mid, mid, N + R, mid], [mid, mid, -R, mid]];
    g.lineCap = 'round';
    for (const [w, col] of [[1.05, 'rgba(120,90,45,0.55)'], [0.82, '#c0a067'], [0.5, '#cdb07a']]) {
      g.strokeStyle = col; g.lineWidth = w;
      for (const [x0, y0, x1, y1] of roads) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    }
    // karrensporen
    g.strokeStyle = 'rgba(110,80,40,0.35)'; g.lineWidth = 0.05;
    for (const [x0, y0, x1, y1] of roads) {
      const vx = y1 - y0 ? 1 : 0; const vy = x1 - x0 ? 1 : 0;
      for (const o of [-0.18, 0.18]) { g.beginPath(); g.moveTo(x0 + vx * o, y0 + vy * o); g.lineTo(x1 + vx * o, y1 + vy * o); g.stroke(); }
    }
    // dorpsplein
    const grad = g.createRadialGradient(mid, mid, 0.5, mid, mid, 3.3);
    grad.addColorStop(0, '#c9b088'); grad.addColorStop(0.8, '#c2a674'); grad.addColorStop(1, 'rgba(194,166,116,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(mid, mid, 3.3, 0, Math.PI * 2); g.fill();
    // rand van het bouwgebied
    g.strokeStyle = 'rgba(255,248,220,0.3)'; g.lineWidth = 0.05; g.setLineDash([0.3, 0.2]);
    g.strokeRect(0, 0, N, N);
    g.setLineDash([]);
    // vijveroever
    const pd = this.pond;
    g.fillStyle = '#a99a62'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r + 0.55, pd.r * 0.8 + 0.55, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#dccb92'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r + 0.38, pd.r * 0.8 + 0.38, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f6f9e'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r, pd.r * 0.8, 0.4, 0, Math.PI * 2); g.fill();
    // grondplekken voor grondstoffen en de weide
    for (const k of ['stone', 'gold']) {
      const d = this.deposits[k];
      g.fillStyle = k === 'gold' ? 'rgba(140,110,65,0.45)' : 'rgba(150,145,130,0.45)';
      g.beginPath(); g.arc(d.x, d.y, 1.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(170,215,100,0.25)'; g.beginPath(); g.arc(this.pasture.x, this.pasture.y, 2.3, 0, Math.PI * 2); g.fill();
    g.restore();

    // kasseien op het plein
    for (let gy = mid - 3.4; gy < mid + 3.4; gy += 0.2) {
      for (let gx = mid - 3.4; gx < mid + 3.4; gx += 0.2) {
        const jx = gx + (hashInt(Math.round(gx * 10), Math.round(gy * 10), sd) - 0.5) * 0.08;
        const jy = gy + (hashInt(Math.round(gy * 10), Math.round(gx * 10), sd + 3) - 0.5) * 0.08;
        const dist = Math.hypot(jx - mid, jy - mid);
        if (dist > 3.2 || hashInt(Math.round(gx * 10), Math.round(gy * 10), sd + 4) < (dist - 2.2) * 0.9) continue;
        const p = toWorld(jx, jy);
        const v = hashInt(Math.round(gx * 10), Math.round(gy * 10), sd + 5);
        g.fillStyle = A.mix('#b9aa8c', '#d8cbb0', v);
        g.beginPath(); g.ellipse(p.x, p.y, 4.6, 2.3, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(90,75,50,0.45)'; g.lineWidth = 0.6; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(p.x - 1, p.y - 0.7, 2, 0.9, 0, 0, Math.PI * 2); g.fill();
      }
    }
    // kiezels langs de wegen
    for (let k = 0; k < 260; k++) {
      const along = -R + hashInt(k, 31, sd) * (N + 2 * R);
      const side = (hashInt(k, 32, sd) - 0.5) * 0.9;
      const vertical = k % 2 === 0;
      const gx = vertical ? mid + side : along; const gy = vertical ? along : mid + side;
      if (Math.hypot(gx - mid, gy - mid) < 3.4) continue;
      const p = toWorld(gx, gy);
      g.fillStyle = hashInt(k, 33, sd) < 0.5 ? 'rgba(140,125,100,0.8)' : 'rgba(205,190,160,0.8)';
      g.beginPath(); g.ellipse(p.x, p.y, 1.4, 0.8, 0, 0, Math.PI * 2); g.fill();
    }
    // grassprietjes, klaver en bloemen
    this.flowerSpots = [];
    for (let k = 0; k < 2200; k++) {
      const i = -R + hashInt(k, 3, sd) * (N + 2 * R);
      const j = -R + hashInt(k, 4, sd) * (N + 2 * R);
      if (Math.hypot(i - pd.x, j - pd.y) < pd.r + 0.5) continue;
      if (Math.hypot(i - mid, j - mid) < 3.3) continue;
      if (Math.abs(i - mid) < 0.5 || Math.abs(j - mid) < 0.5) continue;
      const p = toWorld(i, j);
      const r = hashInt(k, 5, sd);
      if (r < 0.06) {
        const col = ['#f4e04d', '#ffffff', '#e86f9a', '#b48cf0', '#ff9f43'][k % 5];
        for (let q = 0; q < 3; q++) {
          g.fillStyle = col;
          g.beginPath(); g.arc(p.x + (q - 1) * 2.5, p.y - (q % 2) * 1.5, 1.3, 0, Math.PI * 2); g.fill();
        }
        if (k % 4 === 0) this.flowerSpots.push(p);
      } else if (r < 0.12) {
        g.fillStyle = 'rgba(60,110,30,0.25)'; g.beginPath(); g.ellipse(p.x, p.y, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
      } else {
        g.strokeStyle = r < 0.55 ? 'rgba(55,105,28,0.5)' : 'rgba(175,215,115,0.5)';
        g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(p.x - 2, p.y); g.lineTo(p.x - 3, p.y - 4); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 5); g.moveTo(p.x + 2, p.y); g.lineTo(p.x + 3, p.y - 4); g.stroke();
      }
    }
    // riet en waterlelies rond de vijver
    for (let k = 0; k < 34; k++) {
      const a = hashInt(k, 9, sd) * Math.PI * 2;
      const rr = pd.r * (0.95 + hashInt(k, 10, sd) * 0.25);
      const p = toWorld(pd.x + Math.cos(a) * rr, pd.y + Math.sin(a) * rr * 0.8);
      g.strokeStyle = k % 2 ? '#4f7d2c' : '#6a9a3a'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 1.5, p.y - 9); g.moveTo(p.x + 2, p.y); g.lineTo(p.x + 3, p.y - 7); g.moveTo(p.x - 1, p.y); g.lineTo(p.x - 4, p.y - 6); g.stroke();
      if (k % 3 === 0) { g.fillStyle = '#6b4523'; g.fillRect(p.x - 2.3, p.y - 12, 2, 4.5); }
    }
    this.lilies = [];
    for (let k = 0; k < 7; k++) {
      const a = hashInt(k, 41, sd) * Math.PI * 2; const rr = pd.r * (0.35 + hashInt(k, 42, sd) * 0.5);
      this.lilies.push({ gx: pd.x + Math.cos(a) * rr, gy: pd.y + Math.sin(a) * rr * 0.8, f: k % 3 === 0 });
    }
    this.ground = { cv, W, H };

    // decor: bomen, struiken, rotsen
    const decor = [];
    for (let j = -R; j < N + R; j++) {
      for (let i = -R; i < N + R; i++) {
        if (this.inBuild(i, j, 1)) continue;
        const dx = Math.max(-1 - i, i - N, 0); const dy = Math.max(-1 - j, j - N, 0);
        const d = Math.max(dx, dy);
        if (Math.abs(i + 0.5 - mid) < 0.9 || Math.abs(j + 0.5 - mid) < 0.9) continue; // wegen
        if (Math.hypot(i + 0.5 - pd.x, j + 0.5 - pd.y) < pd.r + 0.8) continue;
        if (Math.hypot(i + 0.5 - this.pasture.x, j + 0.5 - this.pasture.y) < 2.6) continue;
        let skip = false;
        for (const k of Object.keys(this.deposits)) if (Math.hypot(i + 0.5 - this.deposits[k].x, j + 0.5 - this.deposits[k].y) < 2) skip = true;
        if (skip) continue;
        const p = Math.min(0.94, Math.max(0, (d - 1) / 4));
        const r = hashInt(i, j, sd + 77);
        if (r < p) {
          const ox = (hashInt(i, j, sd + 5) - 0.5) * 0.5; const oy = (hashInt(i, j, sd + 6) - 0.5) * 0.5;
          const conif = hashInt(Math.floor(i / 4), Math.floor(j / 4), sd + 8) < 0.45;
          decor.push({ kind: 'tree', gx: i + 0.5 + ox, gy: j + 0.5 + oy, v: (conif ? 0 : 4) + Math.floor(hashInt(i, j, sd + 9) * 4) });
        } else if (r < p + 0.07) {
          decor.push({ kind: hashInt(i, j, 3) < 0.6 ? 'bush' : 'rock', gx: i + 0.5, gy: j + 0.5 });
        }
      }
    }
    for (const k of ['stone', 'gold']) {
      const d = this.deposits[k];
      for (let n = 0; n < 6; n++) {
        const a = (n / 6) * Math.PI * 2;
        decor.push({ kind: k, gx: d.x + Math.cos(a) * 0.7, gy: d.y + Math.sin(a) * 0.7, s: 1.3 + hashInt(n, 1, sd) * 0.6 });
      }
    }
    const f = this.deposits.food;
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * Math.PI * 2;
      decor.push({ kind: 'berry', gx: f.x + Math.cos(a) * 0.8, gy: f.y + Math.sin(a) * 0.8 });
    }
    this.decor = decor;
    // bosrand voor houthakkers zonder kamp
    this.forestEdge = decor.filter((d) => d.kind === 'tree').sort((a, b) => Math.hypot(a.gx - mid, a.gy - mid) - Math.hypot(b.gx - mid, b.gy - mid)).slice(0, 12);

    // dieren
    this.sheep = [];
    for (let k = 0; k < 5; k++) {
      this.sheep.push({ gx: this.pasture.x + (hashInt(k, 51, sd) - 0.5) * 3, gy: this.pasture.y + (hashInt(k, 52, sd) - 0.5) * 3, tx: null, ty: null, wait: Math.random() * 4000, ph: Math.random() * 6, black: k === 3 });
    }
    this.ducks = [0, 1, 2].map((k) => ({ a: k * 2.1, sp: 0.00012 + k * 0.00004, rr: 0.45 + k * 0.18, dir: k % 2 ? -1 : 1 }));
    const fl = [...this.flowerSpots];
    const pc = toWorld(pd.x, pd.y);
    for (let k = 0; k < 6; k++) fl.push({ x: pc.x + (k - 3) * 22, y: pc.y + 10 });
    this.flutter = new FX.Flutter(fl, FX.LOW_POWER ? 7 : 14);
  }

  // ---------- wandelaars ----------

  tcDoor() {
    const tc = this.state.buildings.find((b) => b.type === 'tc');
    return { gx: tc.x + 1, gy: tc.y + 2.35 };
  }

  jobTargets(job) {
    const s = this.state;
    const map = { food: 'farm', wood: 'lumber', stone: 'quarry', gold: 'goldmine' };
    const bs = s.buildings.filter((b) => b.type === map[job] && b.level > 0);
    if (bs.length) return bs.map((b) => ({ gx: b.x + 0.5 + (job === 'food' ? 0 : 0.35), gy: b.y + 0.5 + (job === 'food' ? 0 : 0.45) }));
    if (job === 'wood') return this.forestEdge.map((t) => ({ gx: t.gx + 0.4, gy: t.gy + 0.4 }));
    const d = this.deposits[job];
    return [{ gx: d.x + 0.9, gy: d.y + 0.9 }, { gx: d.x - 0.3, gy: d.y + 1.1 }, { gx: d.x + 1.1, gy: d.y - 0.2 }];
  }

  syncWalkers() {
    const s = this.state;
    if (!s) return;
    const total = totalVillagers(s);
    const n = Math.min(total, FX.LOW_POWER ? 24 : 40);
    const want = [];
    for (const r of [...RES, 'idle']) {
      const k = total ? Math.round((s.villagers[r] / total) * n) : 0;
      for (let i = 0; i < k; i++) want.push(r);
    }
    const byJob = {};
    for (const w of this.walkers) (byJob[w.job] = byJob[w.job] || []).push(w);
    const next = [];
    const door = this.tcDoor();
    for (const job of want) {
      const pool = byJob[job];
      if (pool && pool.length) { next.push(pool.pop()); continue; }
      next.push({ job, gx: door.gx + (Math.random() - 0.5), gy: door.gy + Math.random() * 0.6, phase: 'out', wait: Math.random() * 4000, target: null, t: 0, skin: Math.floor(Math.random() * 4) });
    }
    this.walkers = next;
  }

  updateWalkers(dt) {
    if (!this.state) return;
    const door = this.tcDoor();
    for (const w of this.walkers) {
      w.t += dt;
      if (w.wait > 0) {
        w.wait -= dt;
        if (w.wait <= 0 && w.phase === 'work') w.phase = 'back';
        continue;
      }
      if (!w.target) {
        if (w.job === 'idle') {
          w.target = { gx: N / 2 + (Math.random() - 0.5) * 4, gy: N / 2 + 1.5 + Math.random() * 2 };
        } else if (w.phase === 'out') {
          const ts = this.jobTargets(w.job);
          const tg = ts[Math.floor(Math.random() * ts.length)];
          w.target = { gx: tg.gx + (Math.random() - 0.5) * 0.4, gy: tg.gy + (Math.random() - 0.5) * 0.4 };
        } else {
          w.target = { gx: door.gx + (Math.random() - 0.5) * 0.8, gy: door.gy + Math.random() * 0.3 };
        }
      }
      const dx = w.target.gx - w.gx; const dy = w.target.gy - w.gy;
      const d = Math.hypot(dx, dy);
      const sp = 0.0009 * dt;
      if (d <= sp) {
        w.gx = w.target.gx; w.gy = w.target.gy; w.target = null;
        if (w.job === 'idle') { w.wait = 1500 + Math.random() * 4000; continue; }
        if (w.phase === 'out') { w.phase = 'work'; w.wait = 2500 + Math.random() * 3500; }
        else { w.phase = 'out'; w.wait = 600 + Math.random() * 1200; }
      } else {
        w.gx += (dx / d) * sp; w.gy += (dy / d) * sp;
        w.dir = dx - dy >= 0 ? 1 : -1;
      }
    }
  }

  updateAnimals(dt) {
    for (const s of this.sheep) {
      if (s.wait > 0) { s.wait -= dt; continue; }
      if (s.tx === null) {
        s.tx = this.pasture.x + (Math.random() - 0.5) * 3.4;
        s.ty = this.pasture.y + (Math.random() - 0.5) * 3.4;
      }
      const dx = s.tx - s.gx; const dy = s.ty - s.gy; const d = Math.hypot(dx, dy);
      const sp = 0.00025 * dt;
      if (d <= sp) { s.tx = null; s.wait = 2500 + Math.random() * 6000; } else { s.gx += (dx / d) * sp; s.gy += (dy / d) * sp; s.dir = dx - dy >= 0 ? 1 : -1; }
    }
    for (const d of this.ducks) d.a += d.sp * dt * d.dir;
  }

  // ---------- soldaten ----------

  soldierSpots() {
    const s = this.state;
    const units = s.units || {};
    const order = ['knight', 'rider', 'sword', 'spear', 'archer', 'scout', 'ram'];
    const total = order.reduce((a, k) => a + (units[k] || 0), 0);
    if (!total) return [];
    const show = Math.min(total, FX.LOW_POWER ? 28 : 44);
    const list = [];
    for (const k of order) {
      const c = Math.round(((units[k] || 0) / total) * show) || ((units[k] || 0) > 0 ? 1 : 0);
      for (let i = 0; i < c; i++) list.push(k);
    }
    const anchor = s.buildings.find((b) => b.type === 'barracks' && b.level > 0) || s.buildings.find((b) => b.type === 'tc');
    const size = BUILDINGS[anchor.type].size;
    const ax = anchor.x + size / 2; const ay = anchor.y + size / 2;
    const occ = new Set();
    for (const b of s.buildings) {
      if (b.x < 0) continue;
      const sz = BUILDINGS[b.type].size;
      for (let dx = 0; dx < sz; dx++) for (let dy = 0; dy < sz; dy++) occ.add(`${b.x + dx},${b.y + dy}`);
    }
    const free = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (occ.has(`${x},${y}`)) continue;
      free.push({ x, y, d: Math.hypot(x + 0.5 - ax, y + 0.5 - ay) + (y < ay ? 0.3 : 0) });
    }
    free.sort((a, b) => a.d - b.d);
    const out = [];
    let ti = 0;
    for (let i = 0; i < list.length; i += 4) {
      const tile = free[ti++];
      if (!tile) break;
      for (let k = 0; k < 4 && i + k < list.length; k++) {
        out.push({ kind: list[i + k], gx: tile.x + 0.3 + (k % 2) * 0.42, gy: tile.y + 0.3 + Math.floor(k / 2) * 0.42 });
      }
    }
    return out;
  }

  drawSoldier(ctx, s, x, y, t) {
    const team = this.team;
    const bob = Math.sin(t * 0.004 + s.gx * 3 + s.gy * 5) * 0.3;
    const o = { s: 1.05, team, phase: 0 };
    switch (s.kind) {
      case 'spear': A.person(ctx, x, y + bob, { ...o, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }); break;
      case 'sword': A.person(ctx, x, y + bob, { ...o, body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }); break;
      case 'archer': A.person(ctx, x, y + bob, { ...o, body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }); break;
      case 'scout': A.horseman(ctx, x, y, { s: 0.8, team, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b' }); break;
      case 'rider': A.horseman(ctx, x, y, { s: 0.85, team, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear', horse: '#7b4f2c' }); break;
      case 'knight': A.horseman(ctx, x, y, { s: 0.9, team, body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530' }); break;
      case 'ram': A.ram(ctx, x, y, 0.9); break;
      default: A.person(ctx, x, y, o);
    }
  }

  drawSheep(ctx, s, t) {
    const p = toWorld(s.gx, s.gy);
    const moving = s.tx !== null && s.wait <= 0;
    const bob = moving ? Math.abs(Math.sin(t * 0.012 + s.ph)) * 0.8 : 0;
    const graze = !moving && Math.sin(t * 0.002 + s.ph) > 0.2;
    const dir = s.dir || 1;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(20,35,10,0.22)'; ctx.beginPath(); ctx.ellipse(1, 0, 7, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a3330'; ctx.lineWidth = 1.2;
    ctx.beginPath(); for (const lx of [-3.5, -1.5, 2, 4]) { ctx.moveTo(lx, -3); ctx.lineTo(lx, -0.3); } ctx.stroke();
    const wool = s.black ? '#4a4440' : '#f4f1ea';
    ctx.fillStyle = wool;
    for (const [bx, by, r] of [[-3, -6, 3.4], [0, -7, 3.8], [3, -6, 3.4], [0, -4.5, 3.5]]) { ctx.beginPath(); ctx.arc(bx, by - bob, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.arc(1, -4 - bob, 3.6, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#2d2724';
    ctx.beginPath(); ctx.ellipse(6, graze ? -2.5 : -7 - bob, 2.2, 1.7, graze ? 0.6 : 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- muur ----------

  wallSegments(level) {
    if (!level) return [];
    const segs = [];
    const th = 0.16;
    const gate = (i) => i === N / 2 - 1 || i === N / 2;
    for (let i = 0; i < N; i++) {
      if (!gate(i)) {
        segs.push({ x0: i, y0: -th, x1: i + 1, y1: 0 });
        segs.push({ x0: -th, y0: i, x1: 0, y1: i + 1 });
        segs.push({ x0: N, y0: i, x1: N + th, y1: i + 1 });
        segs.push({ x0: i, y0: N, x1: i + 1, y1: N + th });
      }
    }
    const towers = [];
    const tw = 0.3;
    for (const [x, y, gateT] of [[-tw, -tw], [N, -tw], [-tw, N], [N, N],
      [N / 2 - 1 - tw, -tw, 1], [N / 2 + 1, -tw, 1], [-tw, N / 2 - 1 - tw, 1], [-tw, N / 2 + 1, 1],
      [N, N / 2 - 1 - tw, 1], [N, N / 2 + 1, 1], [N / 2 - 1 - tw, N, 1], [N / 2 + 1, N, 1]]) {
      towers.push({ x0: x, y0: y, x1: x + tw, y1: y + tw, tower: true, gate: !!gateT });
    }
    return [...segs, ...towers];
  }

  wallHeight(seg, level) {
    const stone = level >= 3;
    return seg.tower ? (stone ? 30 + level * 3 : 26) : (stone ? 16 + level * 2 : 15);
  }

  drawWallPiece(ctx, seg, level) {
    const stone = level >= 3;
    const h = this.wallHeight(seg, level);
    if (!stone) {
      A.box(ctx, seg.x0, seg.y0, seg.x1, seg.y1, 0, h, '#9a6a38');
      if (!seg.tower) {
        const n = 4;
        for (let k = 0; k < n; k++) {
          const fx = seg.x1 - seg.x0 > 0.5 ? seg.x0 + ((k + 0.5) / n) * (seg.x1 - seg.x0) : (seg.x0 + seg.x1) / 2;
          const fy = seg.y1 - seg.y0 > 0.5 ? seg.y0 + ((k + 0.5) / n) * (seg.y1 - seg.y0) : (seg.y0 + seg.y1) / 2;
          const [px, py] = A.P(fx, fy, h);
          ctx.fillStyle = '#b07d45';
          ctx.beginPath(); ctx.moveTo(px - 3.5, py + 1.5); ctx.lineTo(px, py - 5); ctx.lineTo(px + 3.5, py + 1.5); ctx.closePath(); ctx.fill();
        }
      } else {
        A.box(ctx, seg.x0 - 0.04, seg.y0 - 0.04, seg.x1 + 0.04, seg.y1 + 0.04, h, h + 3, '#7a5129');
      }
    } else {
      A.box(ctx, seg.x0, seg.y0, seg.x1, seg.y1, 0, h, level >= 5 ? '#d3cbb8' : '#b9b1a1');
      const n = seg.tower ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const t0 = k / n; const t1 = t0 + 0.5 / n;
        const lx = seg.x1 - seg.x0; const ly = seg.y1 - seg.y0;
        if (lx >= ly) A.box(ctx, seg.x0 + lx * t0, seg.y0, seg.x0 + lx * t1, seg.y1, h, h + 4, '#a39a89');
        else A.box(ctx, seg.x0, seg.y0 + ly * t0, seg.x1, seg.y0 + ly * t1, h, h + 4, '#a39a89');
      }
    }
    if (seg.gate) {
      // fakkel op de poorttoren
      const [px, py] = A.P((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2, h + 4);
      ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py + 2); ctx.lineTo(px, py - 5); ctx.stroke();
      ctx.fillStyle = '#ff9d2e'; ctx.beginPath(); ctx.ellipse(px, py - 7, 1.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(px, py - 6.5, 0.9, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- interactie ----------

  footprintCenter(b) {
    const size = BUILDINGS[b.type].size;
    return toWorld(b.x + size / 2, b.y + size / 2);
  }

  pick(sx, sy) {
    const s = this.state;
    if (!s) return null;
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    const list = s.buildings.filter((b) => b.x >= 0).map((b) => ({ b, d: b.x + b.y + BUILDINGS[b.type].size }))
      .sort((a, b) => b.d - a.d);
    for (const { b } of list) {
      const size = BUILDINGS[b.type].size;
      if (g.gx >= b.x && g.gx < b.x + size && g.gy >= b.y && g.gy < b.y + size) return b;
      const c = this.footprintCenter(b);
      const h = b.level > 0 ? (SPRITE_H[b.type] || 55) : 30;
      if (Math.abs(w.x - c.x) < size * 22 && w.y < c.y && w.y > c.y - h) return b;
    }
    const wall = s.buildings.find((b) => b.type === 'wall');
    if (wall && (wall.level > 0 || s.builds.some((j) => j.bid === wall.id))) {
      const nearEdge = (v) => (v > -0.45 && v < 0.2) || (v > N - 0.2 && v < N + 0.45);
      const inside = (v) => v > -0.45 && v < N + 0.45;
      if ((nearEdge(g.gx) && inside(g.gy)) || (nearEdge(g.gy) && inside(g.gx))) return wall;
    }
    return null;
  }

  click(sx, sy, e) {
    if (!this.state) return;
    if (this.placing) {
      const g = this.screenGrid(sx, sy);
      const size = BUILDINGS[this.placing].size;
      const x = Math.floor(g.gx - (size - 1) / 2); const y = Math.floor(g.gy - (size - 1) / 2);
      if (canPlaceAt(this.state, this.placing, x, y) && this.onPlace) this.onPlace(this.placing, x, y, e && e.shiftKey);
      return;
    }
    const b = this.pick(sx, sy);
    this.selected = b ? b.id : null;
    if (this.onSelect) this.onSelect(b);
  }

  // ---------- tekenen ----------

  draw(t, dt, now) {
    const ctx = this.ctx;
    const cam = this.cam;
    cam.resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3c6428';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.state || !this.ground) return;
    dt = Math.min(dt, 100);
    if (Math.floor(t / 1000) !== this.lightSecond) { this.lightSecond = Math.floor(t / 1000); this.light = FX.daylight(); }
    const light = this.light;
    const night = light.dark;
    this.updateWalkers(dt);
    this.updateAnimals(dt);
    this.particles.update(dt);
    this.birds.update(dt);
    this.clouds.update(dt);
    cam.apply(ctx);
    const gnd = this.ground;
    ctx.drawImage(gnd.cv, this.groundOrigin.x, this.groundOrigin.y, gnd.W, gnd.H);
    this.drawPond(ctx, t);

    const s = this.state;
    if (this.placing) this.drawGrid(ctx);
    const wall = s.buildings.find((b) => b.type === 'wall');
    const wallLevel = wall ? wall.level : 0;
    const segs = this.wallSegments(wallLevel);
    this.drawShadows(ctx, segs, wallLevel, light);

    const items = [];
    for (const d of this.decor) items.push({ depth: d.gx + d.gy, kind: 'decor', d });
    for (const b of s.buildings) {
      if (b.x < 0) continue;
      const size = BUILDINGS[b.type].size;
      items.push({ depth: b.x + b.y + size, kind: 'building', b });
    }
    for (const seg of segs) items.push({ depth: (seg.x0 + seg.x1) / 2 + (seg.y0 + seg.y1) / 2 + 0.2, kind: 'wall', seg });
    for (const w of this.walkers) if (w.wait <= 0 || w.phase === 'work' || w.job === 'idle') items.push({ depth: w.gx + w.gy, kind: 'walker', w });
    for (const sol of this.soldierSpots()) items.push({ depth: sol.gx + sol.gy, kind: 'soldier', sol });
    for (const sh of this.sheep) items.push({ depth: sh.gx + sh.gy, kind: 'sheep', sh });
    items.sort((a, b) => a.depth - b.depth);

    const jobs = new Map(s.builds.map((j) => [j.bid, j]));
    this.emitT += dt;
    const emit = this.emitT > 380;
    if (emit) this.emitT = 0;
    for (const it of items) {
      if (it.kind === 'decor') this.drawDecor(ctx, it.d, t);
      else if (it.kind === 'wall') this.drawWallPiece(ctx, it.seg, wallLevel);
      else if (it.kind === 'building') this.drawBuilding(ctx, it.b, jobs.get(it.b.id), t, now, emit);
      else if (it.kind === 'walker') this.drawWalker(ctx, it.w, t);
      else if (it.kind === 'sheep') this.drawSheep(ctx, it.sh, t);
      else { const p = toWorld(it.sol.gx, it.sol.gy); this.drawSoldier(ctx, it.sol, p.x, p.y, t); }
    }

    // vuurwerk bij een nieuw tijdperk
    const pn = performance.now();
    this.fireworks = this.fireworks.filter((f) => { if (pn >= f.at) { this.particles.firework(f.x, f.y); return false; } return true; });
    this.particles.draw(ctx);
    if (this.flutter && night < 0.5) this.flutter.draw(ctx, t, night);
    this.clouds.drawShadows(ctx, 0.12 * (1 - night));
    this.birds.draw(ctx, t, 90);

    // licht en donker
    FX.applyLight(ctx, this.canvas.width, this.canvas.height, light);
    cam.apply(ctx);
    if (night > 0.05) this.drawNightLights(ctx, t, night, segs, wallLevel);
    if (this.flutter && night >= 0.5) this.flutter.draw(ctx, t, night);

    if (this.placing && this.hoverTile) this.drawGhost(ctx);
    for (const b of s.buildings) {
      const job = jobs.get(b.id);
      if (!job || b.x < 0) continue;
      const c = this.footprintCenter(b);
      this.drawProgress(ctx, c.x, c.y - (b.level === 0 ? 50 : (SPRITE_H[b.type] || 60)), job, now);
    }
    if (wall && jobs.has(wall.id)) this.drawWallProgress(ctx, jobs.get(wall.id), now);
    FX.vignette(ctx, this.canvas.width, this.canvas.height, 0.28);
  }

  drawPond(ctx, t) {
    const pd = this.pond;
    const c = toWorld(pd.x, pd.y);
    ctx.save();
    ctx.translate(0, 0);
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.r - 0.04, pd.r * 0.8 - 0.04, 0.4, 0, Math.PI * 2);
    ctx.restore();
    ctx.save();
    ctx.clip();
    const g = ctx.createRadialGradient(c.x - 20, c.y - 10, 5, c.x, c.y, 110);
    g.addColorStop(0, '#6fb3e0'); g.addColorStop(0.6, '#3f88c0'); g.addColorStop(1, '#2b6a99');
    ctx.fillStyle = g; ctx.fillRect(c.x - 150, c.y - 90, 300, 180);
    // hemelreflectie en golfjes
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const ph = t * 0.0012 + k * 1.7;
      const a = 0.5 + 0.5 * Math.sin(ph);
      if (a < 0.4) continue;
      const x = c.x + Math.sin(k * 12.9) * 70 + Math.sin(t * 0.0003 + k) * 6;
      const y = c.y + Math.cos(k * 7.3) * 32;
      ctx.globalAlpha = (a - 0.4) * 1.4;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x, y - 2.5, x + 6, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // waterlelies
    for (const l of this.lilies) {
      const p = toWorld(l.gx, l.gy);
      ctx.fillStyle = '#4f9a3c'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 5, 2.4, 0, 0.3, Math.PI * 2 - 0.1); ctx.lineTo(p.x, p.y); ctx.fill();
      if (l.f) { ctx.fillStyle = '#ffd6e6'; ctx.beginPath(); ctx.arc(p.x + 1, p.y - 1.5, 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
    // eendjes met kielzog
    for (const d of this.ducks) {
      const gx = pd.x + Math.cos(d.a) * pd.r * d.rr; const gy = pd.y + Math.sin(d.a) * pd.r * 0.8 * d.rr;
      const p = toWorld(gx, gy);
      const ahead = toWorld(pd.x + Math.cos(d.a + 0.1 * d.dir) * pd.r * d.rr, pd.y + Math.sin(d.a + 0.1 * d.dir) * pd.r * 0.8 * d.rr);
      const face = ahead.x >= p.x ? 1 : -1;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(p.x - face * 4, p.y + 1); ctx.lineTo(p.x - face * 11, p.y - 2); ctx.moveTo(p.x - face * 4, p.y + 1); ctx.lineTo(p.x - face * 11, p.y + 4); ctx.stroke();
      ctx.save(); ctx.translate(p.x, p.y + Math.sin(t * 0.004 + d.a) * 0.4); ctx.scale(face, 1);
      ctx.fillStyle = '#f5f0e0'; ctx.beginPath(); ctx.ellipse(0, -1.5, 4.2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f6b3a'; ctx.beginPath(); ctx.arc(3.4, -4.4, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2a33a'; ctx.fillRect(4.8, -4.6, 2, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  drawShadows(ctx, segs, wallLevel, light) {
    const s = this.state;
    const h = light.hour;
    const len = 0.75 + Math.min(0.7, Math.abs(h - 13) / 8);
    const alpha = 0.26 * (1 - light.dark * 0.75);
    if (alpha < 0.02) return;
    const vx = 0.95 * len; const vy = 0.38 * len;
    ctx.beginPath();
    const addShape = (cx, cy, half, hgt) => {
      if (hgt <= 0) return;
      const corners = [toWorld(cx - half, cy - half), toWorld(cx + half, cy - half), toWorld(cx + half, cy + half), toWorld(cx - half, cy + half)]
        .map((p) => [p.x, p.y]);
      const pts = corners.concat(corners.map(([x, y]) => [x + vx * hgt, y + vy * hgt]));
      const hl = hull(pts);
      ctx.moveTo(hl[0][0], hl[0][1]);
      for (let i = 1; i < hl.length; i++) ctx.lineTo(hl[i][0], hl[i][1]);
      ctx.closePath();
    };
    for (const b of s.buildings) {
      if (b.x < 0) continue;
      const def = SHADOW[b.type];
      if (!def) continue;
      const size = BUILDINGS[b.type].size;
      const lv = Math.min(b.level, def[0].length - 1);
      const hgt = b.level === 0 ? 10 : def[0][lv];
      let cx = b.x + size / 2; let cy = b.y + size / 2;
      if (b.type === 'farm') { cx = b.x + 0.18; cy = b.y + 0.18; }
      addShape(cx, cy, def[1], hgt);
    }
    for (const seg of segs) {
      const hgt = this.wallHeight(seg, wallLevel);
      const cx = (seg.x0 + seg.x1) / 2; const cy = (seg.y0 + seg.y1) / 2;
      const hx = (seg.x1 - seg.x0) / 2; const hy = (seg.y1 - seg.y0) / 2;
      const corners = [toWorld(cx - hx, cy - hy), toWorld(cx + hx, cy - hy), toWorld(cx + hx, cy + hy), toWorld(cx - hx, cy + hy)].map((p) => [p.x, p.y]);
      const hl = hull(corners.concat(corners.map(([x, y]) => [x + vx * hgt, y + vy * hgt])));
      ctx.moveTo(hl[0][0], hl[0][1]);
      for (let i = 1; i < hl.length; i++) ctx.lineTo(hl[i][0], hl[i][1]);
      ctx.closePath();
    }
    for (const d of this.decor) {
      if (d.kind !== 'tree') continue;
      const p = toWorld(d.gx, d.gy);
      const L = 26 * len;
      const ex = p.x + 4 + L * 0.5; const ey = p.y + 2 + L * 0.2; const rx = L * 0.55 + 6;
      ctx.moveTo(ex + rx * Math.cos(0.38), ey + rx * Math.sin(0.38));
      ctx.ellipse(ex, ey, rx, 5, 0.38, 0, Math.PI * 2);
    }
    ctx.fillStyle = `rgba(20,32,8,${alpha})`;
    ctx.fill('nonzero');
  }

  drawNightLights(ctx, t, night, segs, wallLevel) {
    const s = this.state;
    for (const b of s.buildings) {
      if (b.x < 0 || b.level === 0) continue;
      const c = this.footprintCenter(b);
      const spr = A.buildingSprite(b.type, b.level, this.team);
      for (const [lx, ly, r] of spr.lights || []) {
        const fl = 0.85 + Math.sin(t * 0.003 + lx * 3.1 + b.id) * 0.08;
        FX.drawGlow(ctx, c.x + lx, c.y + ly, 9 * r, FX.WARM, night * fl * 0.85);
      }
      if (b.type === 'smithy') FX.drawGlow(ctx, c.x + 4, c.y - 2, 26, FX.FIRE, night * (0.7 + Math.sin(t * 0.02) * 0.15));
      if (b.type === 'tc') FX.drawGlow(ctx, c.x + 6, c.y + 24, 40, FX.WARM, night * 0.45);
    }
    for (const seg of segs) {
      if (!seg.gate) continue;
      const h = this.wallHeight(seg, wallLevel);
      const [px, py] = A.P((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2, h + 10);
      FX.drawGlow(ctx, px, py, 22, FX.FIRE, night * (0.75 + Math.sin(t * 0.015 + px) * 0.15));
    }
    // dorpelingen met lantaarns
    for (const w of this.walkers) {
      if (!(w.wait <= 0 || w.phase === 'work')) continue;
      const p = toWorld(w.gx, w.gy);
      FX.drawGlow(ctx, p.x + 3, p.y - 8, 8, FX.WARM, night * 0.5);
    }
  }

  drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      const a = toWorld(i, 0); const b = toWorld(i, N);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = toWorld(0, i); const d = toWorld(N, i);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
  }

  drawGhost(ctx) {
    const type = this.placing;
    const size = BUILDINGS[type].size;
    const g = this.hoverTile;
    const x = Math.floor(g.gx - (size - 1) / 2); const y = Math.floor(g.gy - (size - 1) / 2);
    const ok = canPlaceAt(this.state, type, x, y);
    const c = toWorld(x + size / 2, y + size / 2);
    A.diamond(ctx, c.x, c.y, size * A.TW, size * A.TH, ok ? 'rgba(80,220,90,0.35)' : 'rgba(230,60,50,0.4)', ok ? '#5fe06a' : '#e64a3c');
    A.drawSprite(ctx, A.buildingSprite(type, 1, this.team), c.x, c.y, 1, ok ? 0.7 : 0.35);
  }

  drawDecor(ctx, d, t) {
    const p = toWorld(d.gx, d.gy);
    if (d.kind === 'tree') {
      const spr = this.trees[d.v];
      const sway = Math.sin(t * 0.0012 + d.gx) * 0.6;
      ctx.drawImage(spr.cv, p.x - spr.ax + sway, p.y - spr.ay, spr.w, spr.h);
    } else if (d.kind === 'bush') A.bush(ctx, p.x, p.y, 1.2);
    else if (d.kind === 'rock') A.rock(ctx, p.x, p.y, 1.2);
    else if (d.kind === 'stone') A.rock(ctx, p.x, p.y, d.s);
    else if (d.kind === 'gold') {
      A.rock(ctx, p.x, p.y, d.s);
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.arc(p.x - 2, p.y - 5 * d.s, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 3, p.y - 3 * d.s, 1.2, 0, Math.PI * 2); ctx.fill();
      if (Math.sin(t * 0.003 + d.gx * 7) > 0.92) { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 2.5, p.y - 6 * d.s, 1.5, 1.5); }
    } else if (d.kind === 'berry') {
      A.bush(ctx, p.x, p.y, 1.4);
      ctx.fillStyle = '#d6324a';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(p.x - 3 + i * 2, p.y - 4 - (i % 2) * 2, 1, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  drawWalker(ctx, w, t) {
    const p = toWorld(w.gx, w.gy);
    const walking = !!w.target && w.wait <= 0;
    const tool = w.phase === 'work';
    let y = p.y;
    if (tool) y += Math.sin(t * 0.012 + w.gx) * 0.6;
    A.person(ctx, p.x, y, {
      s: 0.9, walking, phase: w.t * 0.012, body: w.job === 'idle' ? '#a08560' : '#8b6a43', hat: w.job === 'idle' ? null : '#d8ae52',
      weapon: tool || w.phase === 'out' ? 'tool' : null, carry: w.phase === 'back' ? CARRY[w.job] : null, skin: w.skin,
    });
  }

  drawBuilding(ctx, b, job, t, now, emit) {
    const size = BUILDINGS[b.type].size;
    const c = toWorld(b.x + size / 2, b.y + size / 2);
    const sel = this.selected === b.id;
    if (sel) {
      const pulse = 0.5 + Math.sin(t * 0.006) * 0.25;
      A.diamond(ctx, c.x, c.y, size * A.TW + 6, size * A.TH + 3, `rgba(255,215,90,${pulse * 0.5})`, `rgba(255,225,120,${pulse + 0.3})`);
    }
    if (b.level === 0) {
      const p = job ? Math.min(1, Math.max(0, (now - job.start) / (job.end - job.start))) : 0;
      A.scaffold(ctx, c.x, c.y, size, p);
      A.person(ctx, c.x + 14, c.y + 6, { s: 0.9, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', phase: t * 0.01 });
      if (emit) { this.particles.dust(c.x, c.y + 4, 2); if (Math.random() < 0.5) this.particles.sparks(c.x + 18, c.y - 6, 3); }
    } else {
      A.drawSprite(ctx, A.buildingSprite(b.type, b.level, this.team), c.x, c.y);
      this.drawOverlay(ctx, b, c, t);
      if (job && emit) this.particles.dust(c.x, c.y + 6, 1);
      if (b.type === 'smithy' && emit && Math.random() < 0.6) {
        const [gx, gy] = A.P(0.36, 0.3, 6);
        this.particles.sparks(c.x + gx, c.y + gy, 3);
      }
    }
  }

  drawOverlay(ctx, b, c, t) {
    const L = b.level;
    const at = (x, y, z) => { const [px, py] = A.P(x, y, z); return [c.x + px, c.y + py]; };
    switch (b.type) {
      case 'tc': {
        const z = [0, 50, 78, 92, 96][L];
        const [x, y] = L === 1 ? at(0.7, 0, 46) : at(0, 0, z);
        A.flag(ctx, x, y, 18, this.team, t);
        if (L === 1) A.smoke(ctx, ...at(-0.3, 0, 46), t, b.id);
        break;
      }
      case 'barracks': { const h = 22 + L * 5; A.flag(ctx, ...at(0, 0, h), 16, this.team, t); break; }
      case 'tower': { const h = 44 + L * 14 + 5 + (L >= 3 ? 16 : 0); A.flag(ctx, ...at(0, 0, h), 14, this.team, t); break; }
      case 'house':
        if (L === 2) A.smoke(ctx, ...at(0.17, -0.11, 37), t, b.id);
        if (L === 3) A.smoke(ctx, ...at(-0.195, -0.145, 48), t, b.id);
        break;
      case 'smithy': {
        const h = 18 + L * 2;
        A.smoke(ctx, ...at(0.13, -0.18, h + 25), t, b.id);
        const [gx, gy] = at(0.302, -0.15, 5);
        const fl = 0.35 + Math.sin(t * 0.02) * 0.1 + Math.sin(t * 0.047) * 0.08;
        ctx.fillStyle = `rgba(255,140,40,${fl})`;
        ctx.beginPath(); ctx.arc(gx, gy, 9, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'farm':
        if (L >= 3) {
          const [mx, my] = at(-0.32, -0.32, 23);
          ctx.save(); ctx.translate(mx + 4, my); ctx.rotate(t * 0.0015);
          ctx.fillStyle = '#efe6cf'; ctx.strokeStyle = '#6b4527'; ctx.lineWidth = 0.6;
          for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(0, -1.5, 13, 3); ctx.strokeRect(0, -1.5, 13, 3); }
          ctx.restore();
        }
        break;
      case 'monument': {
        // glinsterende top
        const top = 12 * Math.max(1, L) + 30 + L * 6 + 12;
        const [mx, my] = at(0, 0, top);
        const a = 0.5 + 0.5 * Math.sin(t * 0.004);
        FX.drawGlow(ctx, mx, my, 16, 'rgba(255,220,120,1)', 0.35 + a * 0.35);
        break;
      }
      default:
    }
  }

  drawProgress(ctx, x, y, job, now) {
    const p = Math.min(1, Math.max(0, (now - job.start) / (job.end - job.start)));
    const w = 46;
    ctx.fillStyle = 'rgba(30,20,10,0.78)';
    ctx.beginPath(); ctx.roundRect(x - w / 2 - 2, y - 2, w + 4, 8, 4); ctx.fill();
    const gr = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, '#d9a43a'); gr.addColorStop(1, '#ffe28a');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y, Math.max(3, w * p), 4, 2); ctx.fill();
    // hamertje
    ctx.save(); ctx.translate(x - w / 2 - 8, y + 2); ctx.rotate(-0.6);
    ctx.fillStyle = '#7a5129'; ctx.fillRect(-0.8, -1, 1.6, 7);
    ctx.fillStyle = '#9aa1ab'; ctx.fillRect(-3, -2.5, 6, 3);
    ctx.restore();
  }

  drawWallProgress(ctx, job, now) {
    const c = toWorld(N / 2, N + 0.6);
    this.drawProgress(ctx, c.x, c.y - 36, job, now);
  }

  centerOn(b) {
    const size = BUILDINGS[b.type].size;
    const c = toWorld(b.x + size / 2, b.y + size / 2);
    this.cam.x = c.x; this.cam.y = c.y - 30;
  }
}
