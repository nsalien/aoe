// Isometrische weergave van de eigen stad: gebouwen met slagschaduwen, dag en nacht,
// wandelende dorpelingen, troepen, schapen, eendjes, vogels en feestelijke effecten.
import * as A from './art.js';
import * as FX from './fx.js';
import { Camera, isoFns, hashInt } from './iso.js';
import { BUILDINGS, TOWN_GRID, RES, BONUS, RES_NAMES, WILD, UNITS, FIELD } from '../shared/rules.js';
import {
  canPlaceAt, totalVillagers, tcDoor, isPlaced, buildRing, clearedSet, isBuildable, canChop, groupPos, groupVision,
  exploredNow, depLeft, boarAlive, campAlive, campSize, raidSize, isVillagerGroup,
} from '../shared/sim.js';
import { territory, ringOf, tileIndex, tileOf, exHas, T_MIN, T_MAX, T_W, TILE } from '../shared/territory.js';
import { ICON } from './ui.js';
import * as NAT from './nature.js';
import * as FIG from './figures.js';
import { fbm } from '../shared/worldgen.js';

const N = TOWN_GRID;
const { toWorld, toGrid } = isoFns(A.TW, A.TH);
const BAKE = FX.LOW_POWER ? 0.9 : 1.25;

const SPRITE_H = { tc: 120, tower: 115, monument: 130, barracks: 70, house: 60, workshop: 60, smithy: 70 };
// gereedschap per soort werk
const TOOL = { food: 'hoe', wood: 'axe', stone: 'pick', gold: 'pick' };

// hoogte (px) per gebouw en niveau voor de slagschaduw, en de halve breedte van het grondvlak
const SHADOW = {
  tc: [[0, 40, 62, 80, 86], 0.85], house: [[0, 26, 33, 44], 0.32], farm: [[0, 0, 0, 24], 0.12],
  lumber: [[0, 20, 22, 24], 0.3], quarry: [[0, 16, 18, 20], 0.3], goldmine: [[0, 22, 24, 26], 0.34],
  storage: [[0, 28, 31, 34], 0.36], barracks: [[0, 30, 35, 50], 0.4], range: [[0, 26, 29, 32], 0.3],
  stable: [[0, 26, 29, 32], 0.34], smithy: [[0, 36, 38, 40, 42, 44], 0.34], market: [[0, 12, 12, 12], 0.3],
  tower: [[0, 60, 76, 104], 0.26], workshop: [[0, 32, 36], 0.36], monument: [[0, 50, 62, 74, 86, 98], 0.8],
};

// convex omhulsel (monotone chain) voor schaduwvormen
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; const up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Teken een figuur gespiegeld als hij naar links loopt.
function facing(ctx, x, dir, fn) {
  if (dir >= 0) { fn(); return; }
  ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0);
  fn();
  ctx.restore();
}

// Teken enkel het zichtbare stuk van een grote, vooraf getekende laag (veel minder pixelwerk per beeld).
function drawSub(ctx, cv, scale, ox, oy, W, H, v) {
  const x0 = Math.max(ox, v.x0); const y0 = Math.max(oy, v.y0);
  const x1 = Math.min(ox + W, v.x1); const y1 = Math.min(oy + H, v.y1);
  if (x1 <= x0 || y1 <= y0) return;
  const sx = (x0 - ox) * scale; const sy = (y0 - oy) * scale;
  const sw = Math.min(cv.width - sx, (x1 - x0) * scale); const sh = Math.min(cv.height - sy, (y1 - y0) * scale);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(cv, sx, sy, sw, sh, x0, y0, sw / scale, sh / scale);
}

const FOG_SCALE = 0.25;

export class TownView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = new Camera(canvas, { zoom: window.innerWidth < 700 ? 1.1 : 1.45, minZoom: 0.38, maxZoom: 2.8 });
    const c = toWorld(N / 2, N / 2);
    this.cam.x = c.x; this.cam.y = c.y - 30;
    const l = toWorld(T_MIN + 4, T_MAX - 4); const r = toWorld(T_MAX - 4, T_MIN + 4);
    const t = toWorld(T_MIN + 4, T_MIN + 4); const b = toWorld(T_MAX - 4, T_MAX - 4);
    this.cam.bounds = { x0: l.x, x1: r.x, y0: t.y, y1: b.y };
    const wb = { x0: toWorld(T_MIN, T_MAX).x, x1: toWorld(T_MAX, T_MIN).x, y0: toWorld(T_MIN, T_MIN).y, y1: toWorld(T_MAX, T_MAX).y };
    this.worldBounds = wb;
    this.state = null;
    this.townKey = null;
    this.team = '#c0392b';
    this.placing = null;
    this.hoverTile = null;
    this.hoverW = null;
    this.selected = null;
    this.walkers = [];
    this.sheep = [];
    this.ducks = [];
    this.trees = Array.from({ length: NAT.TREE_COUNT }, (_, k) => NAT.treeSprite(k));
    this.particles = new FX.Particles();
    this.birds = new FX.Birds(wb);
    this.clouds = new FX.Clouds({ x0: wb.x0 - 200, x1: wb.x1, y0: wb.y0 - 100, y1: wb.y1 - 200 }, FX.LOW_POWER ? 4 : 7);
    this.flutter = null;
    this.prevLevels = null;
    this.fireworks = [];
    this.emitT = 0;
    this.light = FX.daylight();
    this.now = Date.now();
    this.onSelect = null;
    this.onPlace = null;
    this.onCancelPlace = null;
    this.onCelebrate = null;
    this.onHarvest = null; // (vondst, gekozen dorpeling) => void
    this.onHarvested = null; // (vondst) => void
    this.onFieldOrder = null; // ({ action, id, spec, from, to, target }) => void
    this.onSelChange = null; // (selectie | null) => void
    this.sel = null; // { type: 'walker' | 'soldier' | 'group', ... }
    this.orderMark = null;
    this.pendingFrom = null;
    this.harvestFrom = new Map();
    this.prevHarvests = null;
    this.nodeSheep = new Map();
    this.resImg = {};
    for (const r of RES) { const img = new Image(); img.src = ICON[r]; this.resImg[r] = img; }
    // oorlogsmist: één pixel per tegel, zacht uitvergroot
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = T_W + 2; this.fogCv.height = T_W + 2;
    this.fogCtx = this.fogCv.getContext('2d');
    this.fogAt = 0;
    this.fogPrev = null;
    this.fogIso = document.createElement('canvas');
    this.fogIso.width = Math.ceil((T_W + 2) * A.TW * FOG_SCALE); this.fogIso.height = Math.ceil((T_W + 2) * A.TH * FOG_SCALE);
    this.fogIsoCtx = this.fogIso.getContext('2d');
    this.fogOrigin = { x: toWorld(T_MIN - 1, T_MAX + 1).x, y: toWorld(T_MIN - 1, T_MIN - 1).y };
    this.groundComp = null; // grond + boomschaduwen als één laag
    this.frameAvg = 0;
    this.frameN = 0;
    this.explored = null;
    this.visibleArr = null;
    this.treeKey = '';
    this.visTrees = [];
    this.stumps = [];
    this.cam.onClick = (sx, sy, e) => this.click(sx, sy, e, false);
    this.cam.onHover = (sx, sy) => {
      this.hoverTile = sx < 0 ? null : this.screenGrid(sx, sy);
      this.hoverW = sx < 0 ? null : this.cam.screenToWorld(sx, sy);
      this.updateCursor();
    };
    this.cam.onRightClick = (sx, sy) => {
      if (this.placing) { if (this.onCancelPlace) this.onCancelPlace(); return; }
      if (this.sel) this.click(sx, sy, null, true);
    };
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
    this.terr = territory(id);
    this.prevLevels = null;
    this.treeKey = '';
    this.bakeGround();
  }

  setState(state) {
    this.state = state;
    if (state.terr && this.terr && state.terr.seed !== this.terr.seed) { this.terr = territory(state.terr.seed); this.bakeGround(); }
    this.refreshTrees();
    this.trackHarvests();
    this.syncWalkers();
    this.detectUpgrades();
    this.fogAt = 0;
    if (this.sel && this.sel.type === 'group' && !(state.field || []).some((g) => g.id === this.sel.id)) this.setSel(null);
  }

  // ---------- selectie ----------

  setSel(sel) {
    this.sel = sel;
    if (sel) { this.selected = null; }
    if (this.onSelChange) this.onSelChange(sel);
  }

  clearSel() {
    this.setSel(null);
  }

  selGroup() {
    if (!this.sel || this.sel.type !== 'group' || !this.state) return null;
    return (this.state.field || []).find((g) => g.id === this.sel.id) || null;
  }

  // kan de selectie bomen kappen of bronnen ontginnen? (enkel dorpelingen)
  selIsVillager() {
    if (!this.sel) return false;
    if (this.sel.type === 'walker') return true;
    const g = this.selGroup();
    return !!(g && isVillagerGroup(g));
  }

  // ---------- bomen (wijken bij een nieuw tijdperk of als je ze kapt) ----------

  refreshTrees() {
    const s = this.state;
    if (!s || !this.terr) return;
    const k = buildRing(s);
    const cl = s.terr ? s.terr.cl : [];
    const key = `${k}|${cl.length}|${s.buildings.length}`;
    if (key === this.treeKey) return;
    this.treeKey = key;
    const set = clearedSet(s);
    this.visTrees = this.terr.trees.filter((t) => !isBuildable(s, t.i, t.j, set));
    // boomsoort: naaldbossen en loofbossen in grote vlekken, hier en daar een herfstboom
    const sd = this.seed;
    for (const t of this.visTrees) {
      if (t.kind !== undefined && t.kindSeed === sd) continue;
      const zone = fbm(t.i / 9, t.j / 9, sd + 301, 2);
      const h = hashInt(t.i, t.j, sd + 302);
      const list = h < 0.06 ? NAT.AUTUMN : zone < 0.42 ? (h < 0.8 ? NAT.CONIFERS : NAT.LEAFY) : zone > 0.56 ? (h < 0.85 ? NAT.LEAFY : NAT.CONIFERS) : (h < 0.5 ? NAT.LEAFY : NAT.CONIFERS);
      t.kind = list[Math.floor(hashInt(t.j, t.i, sd + 303) * list.length)];
      t.kindSeed = sd;
    }
    const mid = N / 2;
    this.forestEdge = [...this.visTrees].sort((a, b) => Math.hypot(a.gx - mid, a.gy - mid) - Math.hypot(b.gx - mid, b.gy - mid)).slice(0, 12);
    const occ = new Set();
    for (const b of s.buildings) {
      if (!isPlaced(b)) continue;
      const sz = BUILDINGS[b.type].size;
      for (let dx = 0; dx < sz; dx++) for (let dy = 0; dy < sz; dy++) occ.add(`${b.x + dx},${b.y + dy}`);
    }
    this.stumps = cl.map((idx) => tileOf(idx)).filter((p) => ringOf(p.i, p.j) > k && !occ.has(`${p.i},${p.j}`))
      .map((p) => ({ gx: p.i + 0.5, gy: p.j + 0.55 }));
  }

  trackHarvests() {
    const s = this.state;
    const hs = s.harvests || [];
    const prev = this.prevHarvests;
    const door = tcDoor();
    for (const hv of hs) {
      if (prev && prev.has(hv.id)) continue;
      const from = this.pendingFrom && this.pendingFrom.node === hv.node ? this.pendingFrom : null;
      if (from && from.walker) this.walkers = this.walkers.filter((w) => w !== from.walker);
      this.harvestFrom.set(hv.id, from ? { gx: from.gx, gy: from.gy } : { gx: door.gx, gy: door.gy });
      if (from) this.pendingFrom = null;
    }
    if (prev) {
      for (const [id, info] of prev) {
        if (hs.some((h) => h.id === id)) continue;
        this.harvestFrom.delete(id);
        if (!info.node || (s.nodes || []).some((n) => n.id === info.node.id)) continue;
        const p = toWorld(door.gx, door.gy);
        this.particles.sparkle(p.x, p.y - 10, 16);
        this.particles.text(p.x, p.y - 34, `+${info.node.amount} ${RES_NAMES[info.node.res].toLowerCase()}`);
        if (this.onHarvested) this.onHarvested(info.node);
      }
    }
    this.prevHarvests = new Map(hs.map((hv) => [hv.id, { hv, node: (s.nodes || []).find((n) => n.id === hv.node) }]));
  }

  // feest als een gebouw klaar is of een nieuw tijdperk begint
  detectUpgrades() {
    const now = new Map(this.state.buildings.map((b) => [b.id, b.level]));
    if (this.prevLevels) {
      for (const b of this.state.buildings) {
        const before = this.prevLevels.get(b.id) ?? 0;
        if (b.level <= before) continue;
        const size = BUILDINGS[b.type].size || 1;
        const c = isPlaced(b) ? toWorld(b.x + size / 2, b.y + size / 2) : toWorld(N / 2, N);
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

  bakeGround() {
    const sd = this.seed;
    const terr = this.terr;
    const W = T_W * A.TW; const H = T_W * A.TH + 20;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * BAKE); cv.height = Math.round(H * BAKE);
    const g = cv.getContext('2d');
    const origin = toWorld(T_MIN, T_MIN); // bovenste hoek
    this.groundOrigin = { x: origin.x - W / 2, y: origin.y };
    g.scale(BAKE, BAKE);
    g.translate(W / 2, 0);
    g.translate(-origin.x, -origin.y);
    const mid = N / 2;
    this.pond = terr.pond;
    this.near = terr.near;
    this.pasture = terr.pasture;
    const pd = this.pond;
    const inPond = (x, y) => Math.hypot(x - pd.x, (y - pd.y) / 0.8) < pd.r + 0.6;

    // bodemkleur: zachte overgangen (geen zichtbare tegels), donkere bosgrond, droge plekjes in de wei
    this.lakeWaves = [];
    const lakes = [];
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        if (terr.tiles[tileIndex(i, j)] !== TILE.WATER || inPond(i + 0.5, j + 0.5)) continue;
        lakes.push([i + 0.5, j + 0.5]);
        if (hashInt(i, j, sd + 2) < 0.35) this.lakeWaves.push({ gx: i + 0.5, gy: j + 0.5, p: hashInt(i, j, sd + 3) * 6.28 });
      }
    }
    const tileAt = (i, j) => (i < T_MIN || j < T_MIN || i >= T_MAX || j >= T_MAX ? -1 : terr.tiles[tileIndex(i, j)]);
    const forestD = new Float32Array(T_W * T_W);
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        let n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const t = tileAt(i + di, j + dj); n += t === TILE.FOREST ? 1 : t === -1 ? 0.6 : 0; }
        forestD[tileIndex(i, j)] = n / 9;
      }
    }
    const fAt = (gx, gy) => {
      const x = Math.min(T_MAX - 1.001, Math.max(T_MIN, gx - 0.5)); const y = Math.min(T_MAX - 1.001, Math.max(T_MIN, gy - 0.5));
      const i = Math.floor(x); const j = Math.floor(y); const fx = x - i; const fy = y - j;
      const v = (a, b) => forestD[tileIndex(Math.min(T_MAX - 1, a), Math.min(T_MAX - 1, b))];
      return (v(i, j) * (1 - fx) + v(i + 1, j) * fx) * (1 - fy) + (v(i, j + 1) * (1 - fx) + v(i + 1, j + 1) * fx) * fy;
    };
    {
      const RS = FX.LOW_POWER ? 3 : 4;
      const NW = T_W * RS;
      const base = document.createElement('canvas');
      base.width = NW; base.height = NW;
      const bc = base.getContext('2d');
      const img = bc.createImageData(NW, NW);
      const px = img.data;
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const C0 = hex('#6aa940'); const C1 = hex('#a0cc5e'); const DRY = hex('#bcc56e'); const OUT = hex('#5b8c36');
      const FOR = hex('#3c6628'); const MOSS = hex('#5d6f2c'); const SAND = hex('#cdbb85');
      const lerp = (c, d, t) => { c[0] += (d[0] - c[0]) * t; c[1] += (d[1] - c[1]) * t; c[2] += (d[2] - c[2]) * t; };
      const c = [0, 0, 0];
      for (let v = 0; v < NW; v++) {
        for (let u = 0; u < NW; u++) {
          const gx = T_MIN + (u + 0.5) / RS; const gy = T_MIN + (v + 0.5) / RS;
          const n1 = fbm(gx / 7, gy / 7, sd + 11, 3); const n2 = fbm(gx / 2.3, gy / 2.3, sd + 12, 2); const n3 = fbm(gx / 4.5 + 9, gy / 4.5, sd + 13, 2);
          c[0] = C0[0]; c[1] = C0[1]; c[2] = C0[2];
          lerp(c, C1, Math.min(1, Math.max(0, (n1 - 0.3) * 2.2 + (n2 - 0.5) * 0.6)));
          if (n3 > 0.58) lerp(c, DRY, Math.min(0.5, (n3 - 0.58) * 2.4));
          const i = Math.floor(gx); const j = Math.floor(gy);
          lerp(c, OUT, Math.min(0.3, ringOf(i, j) / 45));
          const f = fAt(gx, gy);
          if (f > 0) { lerp(c, FOR, Math.min(0.78, f * 0.9)); lerp(c, MOSS, f * n2 * 0.4); }
          const t = terr.tiles[tileIndex(i, j)];
          if (t === TILE.SAND || t === TILE.WATER) lerp(c, SAND, 0.4);
          const o = (v * NW + u) * 4;
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
        }
      }
      bc.putImageData(img, 0, 0);
      g.save();
      g.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(base, T_MIN, T_MIN, T_W, T_W);
      g.restore();
    }
    // fijne korrel in het gras (anders oogt de grond te glad)
    {
      const n = FX.LOW_POWER ? 9000 : 22000;
      for (const [col, from] of [['rgba(25,55,12,0.16)', 0], ['rgba(255,255,205,0.10)', 1], ['rgba(70,100,25,0.14)', 2]]) {
        g.fillStyle = col;
        for (let k = from; k < n; k += 3) {
          const i = T_MIN + hashInt(k, 61, sd) * T_W; const j = T_MIN + hashInt(k, 62, sd) * T_W;
          if (terr.tiles[tileIndex(Math.floor(i), Math.floor(j))] === TILE.WATER) continue;
          const p = toWorld(i, j);
          g.fillRect(p.x, p.y, 1.8, 0.9);
        }
      }
    }
    // grote, zachte kleurvlekken voor een natuurlijke look
    for (let k = 0; k < 140; k++) {
      const i = T_MIN + hashInt(k, 21, sd) * T_W; const j = T_MIN + hashInt(k, 22, sd) * T_W;
      const p = toWorld(i, j);
      const r = 30 + hashInt(k, 23, sd) * 80;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const light = k % 2 === 0;
      gr.addColorStop(0, light ? 'rgba(200,230,120,0.13)' : 'rgba(40,80,20,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); g.fill();
    }

    // in grid-ruimte tekenen (cirkels worden isometrische ellipsen)
    g.save();
    g.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    // meertjes in de wildernis: zachte vormen met een zandrand
    const blob = (list, r, col) => {
      g.fillStyle = col; g.beginPath();
      for (const [x, y] of list) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
      g.fill();
    };
    const wet = new Set(lakes.map(([x, y]) => `${x - 0.5},${y - 0.5}`));
    const deep = lakes.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => wet.has(`${x - 0.5 + dx},${y - 0.5 + dy}`)));
    blob(lakes, 1.02, 'rgba(160,140,90,0.55)');
    blob(lakes, 0.9, '#d9c890');
    blob(lakes, 0.8, '#5a9fce');
    blob(lakes, 0.74, '#3d86bd');
    blob(deep, 0.74, '#387fb5');
    const roads = [[mid, mid, mid, T_MAX], [mid, mid, mid, T_MIN], [mid, mid, T_MAX, mid], [mid, mid, T_MIN, mid]];
    g.lineCap = 'round';
    for (const [w, col] of [[1.3, 'rgba(95,80,40,0.22)'], [0.98, '#a88a58'], [0.8, '#bfa06b'], [0.36, 'rgba(226,206,160,0.35)']]) {
      g.strokeStyle = col; g.lineWidth = w;
      for (const [x0, y0, x1, y1] of roads) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    }
    // karrensporen, licht golvend, met een grasstrookje ertussen buiten de stad
    for (const [x0, y0, x1, y1] of roads) {
      const vx = y1 - y0 ? 1 : 0; const vy = x1 - x0 ? 1 : 0;
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (const [o, col, w] of [[-0.19, 'rgba(105,78,42,0.42)', 0.075], [0.19, 'rgba(105,78,42,0.42)', 0.075], [0, 'rgba(105,150,55,0.22)', 0.1]]) {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath();
        for (let t = o === 0 ? 4.5 : 3.2; t <= len; t += 0.25) {
          const wob = (fbm(t * 0.7, o * 9 + x1 * 0.1 + y1 * 0.13, sd + 40, 2) - 0.5) * 0.12;
          const x = x0 + ((x1 - x0) / len) * t + vx * (o + wob); const y = y0 + ((y1 - y0) / len) * t + vy * (o + wob);
          if (t <= (o === 0 ? 4.5 : 3.2)) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    const grad = g.createRadialGradient(mid, mid, 0.5, mid, mid, 3.3);
    grad.addColorStop(0, '#c9b088'); grad.addColorStop(0.8, '#c2a674'); grad.addColorStop(1, 'rgba(194,166,116,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(mid, mid, 3.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a99a62'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r + 0.55, pd.r * 0.8 + 0.55, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#dccb92'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r + 0.38, pd.r * 0.8 + 0.38, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f6f9e'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r, pd.r * 0.8, 0.4, 0, Math.PI * 2); g.fill();
    for (const k of ['stone', 'gold']) {
      const d = this.near[k];
      g.fillStyle = k === 'gold' ? 'rgba(140,110,65,0.45)' : 'rgba(150,145,130,0.45)';
      g.beginPath(); g.arc(d.x, d.y, 1.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(170,215,100,0.25)'; g.beginPath(); g.arc(this.pasture.x, this.pasture.y, 2.3, 0, Math.PI * 2); g.fill();
    // plekken van wilde bronnen en het kamp: kale grond
    for (const d of terr.deposits) {
      g.fillStyle = d.kind === 'food' ? 'rgba(120,150,60,0.25)' : d.kind === 'wood' ? 'rgba(60,90,30,0.3)' : 'rgba(130,120,100,0.35)';
      g.beginPath(); g.arc(d.x, d.y, 1.3, 0, Math.PI * 2); g.fill();
    }
    if (terr.camp) {
      g.fillStyle = 'rgba(120,95,60,0.45)'; g.beginPath(); g.arc(terr.camp.x, terr.camp.y, 2.4, 0, Math.PI * 2); g.fill();
    }
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
    // rafelige wegranden: plukjes zand en gras die over de rand gaan
    for (const [x0, y0, x1, y1] of roads) {
      const vx = y1 - y0 ? 1 : 0; const vy = x1 - x0 ? 1 : 0;
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let t = 3.4; t < len; t += 0.17) {
        for (const side of [-1, 1]) {
          const h = hashInt(Math.round(t * 10), side + x1 * 3 + y1 * 7, sd + 44);
          const off = side * (0.44 + (h - 0.5) * 0.14);
          const gx = x0 + ((x1 - x0) / len) * t + vx * off; const gy = y0 + ((y1 - y0) / len) * t + vy * off;
          const p = toWorld(gx, gy);
          if (h < 0.55) { g.fillStyle = h < 0.25 ? 'rgba(168,138,88,0.75)' : 'rgba(190,160,108,0.6)'; g.beginPath(); g.ellipse(p.x, p.y, 3 + h * 5, 1.4 + h * 2, 0, 0, Math.PI * 2); g.fill(); }
          else if (h > 0.78) NAT.tuft(g, p.x, p.y, 0.9, 'rgba(70,120,35,0.7)', null);
        }
      }
    }
    // kiezels langs de wegen
    for (let k = 0; k < 500; k++) {
      const along = T_MIN + hashInt(k, 31, sd) * T_W;
      const side = (hashInt(k, 32, sd) - 0.5) * 0.9;
      const vertical = k % 2 === 0;
      const gx = vertical ? mid + side : along; const gy = vertical ? along : mid + side;
      if (Math.hypot(gx - mid, gy - mid) < 3.4) continue;
      const p = toWorld(gx, gy);
      g.fillStyle = hashInt(k, 33, sd) < 0.5 ? 'rgba(140,125,100,0.8)' : 'rgba(205,190,160,0.8)';
      g.beginPath(); g.ellipse(p.x, p.y, 1.4, 0.8, 0, 0, Math.PI * 2); g.fill();
    }
    // gras, bloemenweitjes, steentjes en een rijke bosbodem
    this.flowerSpots = [];
    const onRoad = (i, j) => (Math.abs(i - mid) < 0.62 || Math.abs(j - mid) < 0.62);
    const okGround = (i, j) => {
      const t = terr.tiles[tileIndex(Math.floor(i), Math.floor(j))];
      return t !== TILE.WATER && t !== TILE.SAND && !inPond(i, j) && Math.hypot(i - mid, j - mid) > 3.4 && !onRoad(i, j);
    };
    const tufts = FX.LOW_POWER ? 4200 : 9500;
    for (let k = 0; k < tufts; k++) {
      const i = T_MIN + hashInt(k, 3, sd) * T_W; const j = T_MIN + hashInt(k, 4, sd) * T_W;
      if (!okGround(i, j)) continue;
      const r = hashInt(k, 5, sd);
      const forest = fAt(i, j) > 0.45;
      const p = toWorld(i, j);
      NAT.tuft(g, p.x, p.y, 0.75 + r * 0.55, forest || r < 0.45 ? 'rgba(40,88,22,0.62)' : 'rgba(150,200,92,0.62)', r > 0.82 ? 'rgba(232,240,170,0.7)' : null);
    }
    const FLOWERS = ['#f4e04d', '#ffffff', '#e86f9a', '#b48cf0', '#ff9f43', '#f2f2f2', '#7fb0f0'];
    const meadows = FX.LOW_POWER ? 45 : 90;
    for (let k = 0; k < meadows; k++) {
      const ci = T_MIN + hashInt(k, 71, sd) * T_W; const cj = T_MIN + hashInt(k, 72, sd) * T_W;
      if (!okGround(ci, cj) || fAt(ci, cj) > 0.35) continue;
      const col = FLOWERS[k % FLOWERS.length]; const col2 = FLOWERS[(k + 3) % FLOWERS.length];
      const n = 6 + Math.floor(hashInt(k, 73, sd) * 12);
      for (let q = 0; q < n; q++) {
        const a = hashInt(k, 80 + q, sd) * Math.PI * 2; const d = Math.sqrt(hashInt(k, 120 + q, sd)) * 1.1;
        const i = ci + Math.cos(a) * d; const j = cj + Math.sin(a) * d;
        if (!okGround(i, j)) continue;
        const p = toWorld(i, j);
        NAT.flower(g, p.x, p.y, q % 4 === 0 ? col2 : col);
      }
      if (ringOf(Math.floor(ci), Math.floor(cj)) <= 6) this.flowerSpots.push(toWorld(ci, cj));
    }
    for (let k = 0; k < (FX.LOW_POWER ? 160 : 300); k++) {
      const i = T_MIN + hashInt(k, 91, sd) * T_W; const j = T_MIN + hashInt(k, 92, sd) * T_W;
      if (!okGround(i, j)) continue;
      const p = toWorld(i, j);
      NAT.pebble(g, p.x, p.y, 0.45 + hashInt(k, 93, sd) * 0.6, hashInt(k, 94, sd) < 0.5 ? '#9c978b' : '#b3ad9f');
    }
    // bosbodem: gevallen blad, varens, struikjes, paddenstoelen en een omgevallen stam
    const LEAVES = ['rgba(150,95,35,0.55)', 'rgba(190,130,45,0.5)', 'rgba(95,85,35,0.5)', 'rgba(120,60,30,0.45)'];
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        if (terr.tiles[tileIndex(i, j)] !== TILE.FOREST || ringOf(i, j) === 0 || onRoad(i + 0.5, j + 0.5)) continue;
        for (let q = 0; q < 7; q++) {
          const p = toWorld(i + hashInt(i * 7 + q, j, sd + 101), j + hashInt(i, j * 7 + q, sd + 102));
          g.fillStyle = LEAVES[q % 4]; g.beginPath(); g.ellipse(p.x, p.y, 1.4, 0.7, q, 0, Math.PI * 2); g.fill();
        }
        const r1 = hashInt(i, j, sd + 103); const r2 = hashInt(i, j, sd + 104); const r3 = hashInt(i, j, sd + 105);
        if (r1 < 0.6) { const p = toWorld(i + 0.2 + r2 * 0.6, j + 0.2 + r3 * 0.6); NAT.fern(g, p.x, p.y, 0.8 + r3 * 0.5, r2 < 0.5 ? '#3f7a2c' : '#4f8a34'); }
        if (r2 < 0.3) { const p = toWorld(i + 0.15 + r3 * 0.7, j + 0.6 * r1 + 0.2); NAT.shrub(g, p.x, p.y, 0.7 + r1 * 0.5, r3 < 0.5 ? '#6faa44' : '#7fb84a', '#3a6e28'); }
        if (r3 < 0.06) { const p = toWorld(i + 0.5, j + 0.6); NAT.mushroom(g, p.x, p.y, 1); NAT.mushroom(g, p.x + 3, p.y + 1, 0.75); }
        if (r3 > 0.975) { const p = toWorld(i + 0.5, j + 0.5); NAT.log(g, p.x, p.y, 0.9); }
      }
    }
    // riet en waterlelies bij de meertjes
    for (const [x, y] of lakes) {
      const i = Math.floor(x); const j = Math.floor(y);
      const h = hashInt(i, j, sd + 111);
      const dry = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => tileAt(i + dx, j + dy) !== TILE.WATER);
      if (dry.length && h < 0.55) {
        const [dx, dy] = dry[Math.floor(h * 10) % dry.length];
        const p = toWorld(x + dx * 0.62, y + dy * 0.62);
        NAT.reed(g, p.x, p.y, 0.8 + h * 0.5);
      } else if (!dry.length && h < 0.14) {
        const p = toWorld(x + (h - 0.07) * 4, y);
        NAT.lily(g, p.x, p.y, 1, h < 0.05);
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
    this.groundComp = null;

    // vaste versiering: struiken, rotsen en de grondstofplekjes vlak bij de stad
    const decor = [];
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        if (ringOf(i, j) === 0) continue;
        if (terr.tiles[tileIndex(i, j)] !== TILE.GRASS) continue;
        if (Math.abs(i + 0.5 - mid) < 1.2 || Math.abs(j + 0.5 - mid) < 1.2 || inPond(i + 0.5, j + 0.5)) continue;
        const r = hashInt(i, j, sd + 78);
        if (r < 0.045) decor.push({ kind: hashInt(i, j, 3) < 0.6 ? 'bush' : 'rock', gx: i + 0.5, gy: j + 0.5 });
      }
    }
    for (const k of ['stone', 'gold']) {
      const d = this.near[k];
      for (let n = 0; n < 6; n++) {
        const a = (n / 6) * Math.PI * 2;
        decor.push({ kind: k, gx: d.x + Math.cos(a) * 0.7, gy: d.y + Math.sin(a) * 0.7, s: 1.3 + hashInt(n, 1, sd) * 0.6 });
      }
    }
    const f = this.near.food;
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * Math.PI * 2;
      decor.push({ kind: 'berry', gx: f.x + Math.cos(a) * 0.8, gy: f.y + Math.sin(a) * 0.8 });
    }
    this.decor = decor;

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

  tcDoor() {
    const tc = this.state.buildings.find((b) => b.type === 'tc');
    return { gx: tc.x + 1, gy: tc.y + 2.35 };
  }

  jobTargets(job) {
    const s = this.state;
    const map = { food: 'farm', wood: 'lumber', stone: 'quarry', gold: 'goldmine' };
    const bs = s.buildings.filter((b) => b.type === map[job] && b.level > 0);
    if (bs.length) return bs.map((b) => ({ gx: b.x + 0.5 + (job === 'food' ? 0 : 0.35), gy: b.y + 0.5 + (job === 'food' ? 0 : 0.45) }));
    if (job === 'wood') return (this.forestEdge || []).map((t) => ({ gx: t.gx + 0.4, gy: t.gy + 0.4 }));
    const d = this.near[job];
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
    // wie net op pad ging, verdwijnt als eerste uit de stad
    for (const w of [...this.walkers].sort((a, b) => (b.leaving ? 1 : 0) - (a.leaving ? 1 : 0))) (byJob[w.job] = byJob[w.job] || []).push(w);
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
    if (this.spotCache && this.spotCache.state === this.state) return this.spotCache.out;
    const out = this.computeSoldierSpots();
    this.spotCache = { state: this.state, out };
    return out;
  }

  computeSoldierSpots() {
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
      if (!isPlaced(b)) continue;
      const sz = BUILDINGS[b.type].size;
      for (let dx = 0; dx < sz; dx++) for (let dy = 0; dy < sz; dy++) occ.add(`${b.x + dx},${b.y + dy}`);
    }
    const free = [];
    const k = buildRing(s);
    for (let y = -k; y < N + k; y++) for (let x = -k; x < N + k; x++) {
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
    const bob = s.walking ? 0 : Math.sin(t * 0.004 + s.gx * 3 + s.gy * 5) * 0.3;
    const o = { s: 1.05, team, phase: t * 0.012, walking: !!s.walking };
    if (this.sel && this.sel.type === 'soldier' && this.sel.kind === s.kind && Math.abs(this.sel.gx - s.gx) < 0.01 && Math.abs(this.sel.gy - s.gy) < 0.01) {
      ctx.strokeStyle = 'rgba(255,225,90,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, 9, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    switch (s.kind) {
      case 'spear': A.person(ctx, x, y + bob, { ...o, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }); break;
      case 'sword': A.person(ctx, x, y + bob, { ...o, body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }); break;
      case 'archer': A.person(ctx, x, y + bob, { ...o, body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }); break;
      case 'scout': A.horseman(ctx, x, y, { s: 0.8, team, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b', walking: o.walking, phase: o.phase }); break;
      case 'rider': A.horseman(ctx, x, y, { s: 0.85, team, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear', horse: '#7b4f2c', walking: o.walking, phase: o.phase }); break;
      case 'knight': A.horseman(ctx, x, y, { s: 0.9, team, body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530', walking: o.walking, phase: o.phase }); break;
      case 'ram': A.ram(ctx, x, y, 0.9); break;
      default: A.person(ctx, x, y, o);
    }
  }

  // waar is de dorpeling die een vondst gaat halen? (heen, werken, terug met de buit)
  harvesterPos(hv, now) {
    const node = (this.state.nodes || []).find((n) => n.id === hv.node);
    if (!node) return null;
    const door = tcDoor();
    const from = this.harvestFrom.get(hv.id) || door;
    const at = { gx: node.gx + 0.38, gy: node.gy + 0.32 };
    const D = hv.end - hv.start;
    const walk = Math.max(1, (D - BONUS.gatherMs) / 2);
    const el = Math.max(0, now - hv.start);
    const lerp = (a, b, f) => ({ gx: a.gx + (b.gx - a.gx) * f, gy: a.gy + (b.gy - a.gy) * f });
    const dirOf = (a, b) => ((b.gx - a.gx) - (b.gy - a.gy) >= 0 ? 1 : -1);
    if (el < walk) return { ...lerp(from, at, el / walk), phase: 'out', node, dir: dirOf(from, at) };
    if (el < walk + BONUS.gatherMs) return { ...at, phase: 'work', node, dir: 1 };
    return { ...lerp(at, door, Math.min(1, (el - walk - BONUS.gatherMs) / walk)), phase: 'back', node, dir: dirOf(at, door) };
  }

  drawHarvester(ctx, hv, pos, t, emit) {
    const p = toWorld(pos.gx, pos.gy);
    const work = pos.phase === 'work';
    facing(ctx, p.x, pos.dir, () => A.person(ctx, p.x, p.y, {
      s: 0.95, walking: !work, working: work, phase: work ? t * 0.009 : t * 0.012, body: '#8b6a43', hat: '#d8ae52',
      weapon: pos.phase === 'back' ? null : 'tool', tool: TOOL[pos.node.res], carry: pos.phase === 'back' ? pos.node.res : null,
    }));
    if (work && emit) {
      const n = toWorld(pos.node.gx, pos.node.gy);
      if (pos.node.kind === 'stone' || pos.node.kind === 'gold') this.particles.sparks(n.x + 6, n.y - 8, 3);
      else this.particles.dust(n.x, n.y, 1);
    }
  }

  drawNode(ctx, n, t, emit) {
    const p = toWorld(n.gx, n.gy);
    const pulse = 0.5 + Math.sin(t * 0.004 + n.id) * 0.5;
    if (!n.claimed) {
      ctx.strokeStyle = `rgba(255,220,110,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 17 + pulse * 3, 8.5 + pulse * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,230,140,${0.08 + pulse * 0.08})`; ctx.fill();
    }
    let top = 30;
    if (n.kind === 'sheep') {
      let sh = this.nodeSheep.get(n.id);
      if (!sh) { sh = { gx: n.gx, gy: n.gy, tx: null, ty: null, wait: 1e9, ph: n.id, dir: n.id % 2 ? 1 : -1 }; this.nodeSheep.set(n.id, sh); }
      this.drawSheep(ctx, sh, t);
      top = 24;
    } else if (n.kind === 'tree') {
      A.broadleaf(ctx, p.x - 3, p.y, 1.45, 0.75);
      // stapeltje brandhout
      for (let i = 0; i < 3; i++) {
        const lx = p.x + 10; const ly = p.y + 3 - i * 3.2;
        ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lx - 6 + i, ly); ctx.lineTo(lx + 5 - i, ly - 2); ctx.stroke();
        ctx.fillStyle = '#ddb882'; ctx.beginPath(); ctx.arc(lx + 5 - i, ly - 2, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineCap = 'butt';
      top = 62;
    } else if (n.kind === 'stone') {
      A.rock(ctx, p.x - 7, p.y + 1, 2.3);
      A.rock(ctx, p.x + 8, p.y + 2, 1.7);
      A.rock(ctx, p.x + 1, p.y + 7, 1.3);
      top = 28;
    } else {
      A.rock(ctx, p.x - 3, p.y + 2, 2.3);
      A.rock(ctx, p.x + 9, p.y + 4, 1.5);
      ctx.fillStyle = '#f2c230';
      for (const [dx, dy, r] of [[-7, -7, 1.9], [-1, -10, 1.5], [4, -5, 1.7], [9, 1, 1.2]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2); ctx.fill(); }
      const tw = Math.sin(t * 0.006 + n.id);
      if (tw > 0.6) {
        ctx.strokeStyle = `rgba(255,255,220,${(tw - 0.6) * 2.5})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x - 1, p.y - 14); ctx.lineTo(p.x - 1, p.y - 6); ctx.moveTo(p.x - 5, p.y - 10); ctx.lineTo(p.x + 3, p.y - 10); ctx.stroke();
      }
      top = 28;
    }
    if (!n.claimed) {
      // zwevend icoontje: "hier valt iets te halen"
      const by = p.y - top - 12 + Math.sin(t * 0.004 + n.id) * 2.5;
      ctx.fillStyle = 'rgba(255,250,235,0.95)';
      ctx.strokeStyle = 'rgba(120,80,20,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, by, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 3, by + 8); ctx.lineTo(p.x, by + 12); ctx.lineTo(p.x + 3, by + 8); ctx.fill();
      const img = this.resImg[n.res];
      if (img && img.complete) ctx.drawImage(img, p.x - 7, by - 7, 14, 14);
    }
  }

  drawSheep(ctx, s, t) {
    const p = toWorld(s.gx, s.gy);
    const moving = s.tx !== null && s.wait <= 0;
    const graze = !moving && Math.sin(t * 0.002 + s.ph) > 0.2;
    facing(ctx, p.x, s.dir || 1, () => FIG.sheep(ctx, p.x, p.y, { walking: moving, graze, phase: t * 0.012 + s.ph, black: s.black }));
  }

  // ---------- muur ----------

  wallSegments(level) {
    if (!level) return [];
    const k = buildRing(this.state);
    const lo = -k; const hi = N + k;
    const segs = [];
    const th = 0.16;
    const gate = (i) => i === N / 2 - 1 || i === N / 2;
    for (let i = lo; i < hi; i++) {
      if (!gate(i)) {
        segs.push({ x0: i, y0: lo - th, x1: i + 1, y1: lo });
        segs.push({ x0: lo - th, y0: i, x1: lo, y1: i + 1 });
        segs.push({ x0: hi, y0: i, x1: hi + th, y1: i + 1 });
        segs.push({ x0: i, y0: hi, x1: i + 1, y1: hi + th });
      }
    }
    const towers = [];
    const tw = 0.3;
    for (const [x, y, gateT] of [[lo - tw, lo - tw], [hi, lo - tw], [lo - tw, hi], [hi, hi],
      [N / 2 - 1 - tw, lo - tw, 1], [N / 2 + 1, lo - tw, 1], [lo - tw, N / 2 - 1 - tw, 1], [lo - tw, N / 2 + 1, 1],
      [hi, N / 2 - 1 - tw, 1], [hi, N / 2 + 1, 1], [N / 2 - 1 - tw, hi, 1], [N / 2 + 1, hi, 1]]) {
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
    const list = s.buildings.filter(isPlaced).map((b) => ({ b, d: b.x + b.y + BUILDINGS[b.type].size }))
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
      const k = buildRing(s);
      const lo = -k; const hi = N + k;
      const nearEdge = (v) => (v > lo - 0.45 && v < lo + 0.2) || (v > hi - 0.2 && v < hi + 0.45);
      const inside = (v) => v > lo - 0.45 && v < hi + 0.45;
      if ((nearEdge(g.gx) && inside(g.gy)) || (nearEdge(g.gy) && inside(g.gx))) return wall;
    }
    return null;
  }

  click(sx, sy, e, order) {
    if (!this.state) return;
    const w = this.cam.screenToWorld(sx, sy);
    if (this.placing) {
      const g = toGrid(w.x, w.y);
      const size = BUILDINGS[this.placing].size;
      const x = Math.floor(g.gx - (size - 1) / 2); const y = Math.floor(g.gy - (size - 1) / 2);
      if (canPlaceAt(this.state, this.placing, x, y) && this.onPlace) this.onPlace(this.placing, x, y, e && e.shiftKey);
      return;
    }
    // een groep in het veld kiezen
    if (!order) {
      const grp = this.pickGroup(w);
      if (grp) { this.setSel({ type: 'group', id: grp.id }); return; }
    }
    const sel = this.sel;
    if (sel) {
      // dorpeling uit de stad + vondst = oogsten (kort uitstapje)
      if (sel.type === 'walker') {
        const node = this.pickNode(w);
        if (node) {
          const v = sel.w;
          this.pendingFrom = { node: node.id, gx: v.gx, gy: v.gy, walker: v };
          this.setSel(null);
          if (this.onHarvest) this.onHarvest(node, v);
          return;
        }
      }
      const target = this.pickTarget(w);
      if (target) { this.issue(sel, null, target); return; }
      if (!order) {
        const v = this.pickWalker(w);
        if (v) { this.setSel({ type: 'walker', w: v }); return; }
        const so = this.pickSoldier(w);
        if (so) { this.setSel({ type: 'soldier', kind: so.kind, gx: so.gx, gy: so.gy }); return; }
        const b = this.pick(sx, sy);
        if (b && b.type === 'tc' && sel.type === 'group') { this.issue(sel, null, { type: 'home' }); return; }
        if (b) { this.setSel(null); this.selected = b.id; if (this.onSelect) this.onSelect(b); return; }
      }
      const g = toGrid(w.x, w.y);
      this.issue(sel, { x: g.gx, y: g.gy }, null);
      return;
    }
    const node = this.pickNode(w);
    if (node) {
      this.pendingFrom = null;
      if (this.onHarvest) this.onHarvest(node, null);
      return;
    }
    const v = this.pickWalker(w);
    if (v) { this.setSel({ type: 'walker', w: v }); return; }
    const so = this.pickSoldier(w);
    if (so) { this.setSel({ type: 'soldier', kind: so.kind, gx: so.gx, gy: so.gy }); return; }
    const b = this.pick(sx, sy);
    this.selected = b ? b.id : null;
    if (this.onSelect) this.onSelect(b);
  }

  // een opdracht doorgeven (de server rekent het na en bewaart het)
  issue(sel, to, target) {
    if (!this.onFieldOrder) return;
    let mark = to ? { gx: to.x, gy: to.y } : this.targetPos(target);
    if (sel.type === 'group') this.onFieldOrder({ action: 'order', id: sel.id, to, target });
    else if (sel.type === 'walker') { sel.w.leaving = true; this.onFieldOrder({ action: 'send', spec: { villager: sel.w.job }, from: { x: sel.w.gx, y: sel.w.gy }, to, target }); }
    else if (sel.type === 'soldier') this.onFieldOrder({ action: 'send', spec: { units: { [sel.kind]: 1 } }, from: { x: sel.gx, y: sel.gy }, to, target });
    if (mark) this.orderMark = { ...mark, at: performance.now(), attack: !!(target && (target.type === 'boar' || target.type === 'camp')) };
  }

  targetPos(target) {
    if (!target) return null;
    const terr = this.terr;
    if (target.type === 'boar') { const b = terr.boars.find((x) => x.id === target.id); return b && { gx: b.x, gy: b.y }; }
    if (target.type === 'camp') return terr.camp && { gx: terr.camp.x, gy: terr.camp.y };
    if (target.type === 'dep') { const d = terr.deposits.find((x) => x.id === target.id); return d && { gx: d.x, gy: d.y }; }
    if (target.type === 'tree') return { gx: target.i + 0.5, gy: target.j + 0.5 };
    if (target.type === 'home') { const d = tcDoor(); return { gx: d.gx, gy: d.gy }; }
    return null;
  }

  // wat ligt er onder de muis dat je als doel kan kiezen?
  pickTarget(w) {
    const s = this.state;
    if (!s.terr) return null;
    const terr = this.terr;
    const now = this.now;
    const fighter = !this.selIsVillager();
    for (const b of fighter ? terr.boars : []) {
      if (!boarAlive(s, b.id, now) || !this.isVisible(b.x, b.y)) continue;
      const bp = this.boarPos(b); const p = toWorld(bp.x, bp.y);
      if (Math.abs(w.x - p.x) < 18 && w.y < p.y + 6 && w.y > p.y - 22) return { type: 'boar', id: b.id };
    }
    if (fighter && terr.camp && campAlive(s, now) && this.isExplored(terr.camp.x, terr.camp.y)) {
      const p = toWorld(terr.camp.x, terr.camp.y);
      if (Math.abs(w.x - p.x) < 68 && w.y < p.y + 30 && w.y > p.y - 52) return { type: 'camp' };
    }
    for (const d of terr.deposits) {
      if (depLeft(s, d) <= 0 || !this.isExplored(d.x, d.y)) continue;
      const p = toWorld(d.x, d.y);
      const top = d.kind === 'wood' ? 60 : 30;
      if (Math.abs(w.x - p.x) < 30 && w.y < p.y + 12 && w.y > p.y - top) return this.selIsVillager() ? { type: 'dep', id: d.id } : null;
    }
    if (this.selIsVillager()) {
      const g = toGrid(w.x, w.y + 16);
      const i = Math.floor(g.gx); const j = Math.floor(g.gy);
      if (this.isExplored(i + 0.5, j + 0.5) && canChop(s, i, j)) return { type: 'tree', i, j };
    }
    return null;
  }

  pickGroup(w) {
    let best = null; let bd = Infinity;
    for (const g of this.state.field || []) {
      const pos = groupPos(g, this.now);
      const p = toWorld(pos.x, pos.y);
      const tol = Math.max(14, 16 / this.cam.zoom);
      if (Math.abs(w.x - p.x) < tol && w.y < p.y + 8 && w.y > p.y - 26) {
        const d = Math.abs(w.x - p.x) + Math.abs(w.y - (p.y - 10));
        if (d < bd) { bd = d; best = g; }
      }
    }
    return best;
  }

  pickSoldier(w) {
    let best = null; let bd = Infinity;
    const tol = Math.max(9, 12 / this.cam.zoom);
    for (const so of this.soldierSpots()) {
      const p = toWorld(so.gx, so.gy);
      if (Math.abs(w.x - p.x) < tol && w.y < p.y + 5 && w.y > p.y - 24) {
        const d = Math.abs(w.x - p.x) + Math.abs(w.y - (p.y - 10));
        if (d < bd) { bd = d; best = so; }
      }
    }
    return best;
  }

  updateCursor() {
    let c = 'grab';
    if (this.hoverW && this.state && !this.placing) {
      if (this.sel) c = this.pickTarget(this.hoverW) ? 'pointer' : 'crosshair';
      else if (this.pickGroup(this.hoverW) || this.pickNode(this.hoverW)) c = 'pointer';
    }
    this.canvas.style.cursor = c;
  }

  // ---------- oorlogsmist ----------

  updateFog(now) {
    const s = this.state;
    this.fogAt = now;
    if (!s || !s.terr) { this.explored = null; this.visibleArr = null; return; }
    const ex = exploredNow(s, now);
    const k = buildRing(s);
    const vis = new Uint8Array(T_W * T_W);
    for (let j = T_MIN; j < T_MAX; j++) for (let i = T_MIN; i < T_MAX; i++) if (ringOf(i, j) <= k + 3) vis[tileIndex(i, j)] = 1;
    for (const g of s.field || []) {
      const p = groupPos(g, now);
      const r = groupVision(g);
      for (let j = Math.floor(p.y - r); j <= Math.ceil(p.y + r); j++) {
        for (let i = Math.floor(p.x - r); i <= Math.ceil(p.x + r); i++) {
          if (i < T_MIN || j < T_MIN || i >= T_MAX || j >= T_MAX) continue;
          if (Math.hypot(i + 0.5 - p.x, j + 0.5 - p.y) <= r) vis[tileIndex(i, j)] = 1;
        }
      }
    }
    const S = T_W + 2;
    const img = this.fogCtx.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const o = (y * S + x) * 4;
        d[o] = 12; d[o + 1] = 16; d[o + 2] = 22;
        let a = 248;
        if (x > 0 && y > 0 && x < S - 1 && y < S - 1) {
          const i = x - 1 + T_MIN; const j = y - 1 + T_MIN;
          const idx = tileIndex(i, j);
          if (vis[idx]) a = 0;
          else if (exHas(ex, i, j)) a = 115;
        }
        d[o + 3] = a;
      }
    }
    this.explored = ex;
    this.visibleArr = vis;
    const prev = this.fogPrev;
    if (prev && prev.length === d.length) {
      let same = true;
      for (let i = 3; i < d.length; i += 4) if (prev[i] !== d[i]) { same = false; break; }
      if (same) return;
    }
    this.fogPrev = d;
    // tegels die volledig in het donker liggen (ook hun buren): daar hoeven we geen bomen of decor te tekenen
    const dark = new Uint8Array(T_W * T_W);
    const seen = (i, j) => i < T_MIN || j < T_MIN || i >= T_MAX || j >= T_MAX ? false : vis[tileIndex(i, j)] === 1 || exHas(ex, i, j);
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        let lit = false;
        for (let dj = -1; dj <= 1 && !lit; dj++) for (let di = -1; di <= 1; di++) if (seen(i + di, j + dj)) { lit = true; break; }
        if (!lit) dark[tileIndex(i, j)] = 1;
      }
    }
    this.dark = dark;
    this.fogCtx.putImageData(img, 0, 0);
    const g = this.fogIsoCtx;
    const o = this.fogOrigin;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.fogIso.width, this.fogIso.height);
    g.setTransform(FOG_SCALE, 0, 0, FOG_SCALE, -o.x * FOG_SCALE, -o.y * FOG_SCALE);
    g.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogCv, T_MIN - 1, T_MIN - 1, T_W + 2, T_W + 2);
  }

  isExplored(gx, gy) {
    if (!this.explored) return true;
    return exHas(this.explored, Math.floor(gx), Math.floor(gy));
  }

  isVisible(gx, gy) {
    if (!this.visibleArr) return true;
    const i = Math.floor(gx); const j = Math.floor(gy);
    if (i < T_MIN || j < T_MIN || i >= T_MAX || j >= T_MAX) return false;
    return this.visibleArr[tileIndex(i, j)] === 1;
  }

  drawFog(ctx, v) {
    if (!this.explored || !this.fogInView(v)) return;
    drawSub(ctx, this.fogIso, FOG_SCALE, this.fogOrigin.x, this.fogOrigin.y, (T_W + 2) * A.TW, (T_W + 2) * A.TH, v);
  }

  // De grond met alle boomschaduwen erop, als één laag. Wordt enkel opnieuw samengesteld als het bos,
  // de stand van de zon of de duisternis merkbaar verandert; per beeld is het dan één enkele kopie.
  groundLayer(light) {
    const len = 0.75 + Math.min(0.7, Math.abs(light.hour - 13) / 8);
    const alpha = 0.26 * (1 - light.dark * 0.75);
    const key = `${this.treeKey}|${Math.round(len * 10)}|${Math.round(alpha * 40)}`;
    const L = this.groundComp;
    if (L && L.key === key) return L.cv;
    const gnd = this.ground;
    const cv = L ? L.cv : document.createElement('canvas');
    if (cv.width !== gnd.cv.width || cv.height !== gnd.cv.height) { cv.width = gnd.cv.width; cv.height = gnd.cv.height; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(gnd.cv, 0, 0);
    if (alpha >= 0.02) {
      g.setTransform(BAKE, 0, 0, BAKE, -this.groundOrigin.x * BAKE, -this.groundOrigin.y * BAKE);
      g.beginPath();
      const Ls = 26 * (Math.round(len * 10) / 10);
      const rx = Ls * 0.55 + 6;
      for (const d of this.visTrees) {
        const p = toWorld(d.gx, d.gy);
        const ex = p.x + 4 + Ls * 0.5; const ey = p.y + 2 + Ls * 0.2;
        g.moveTo(ex + rx * Math.cos(0.38), ey + rx * Math.sin(0.38));
        g.ellipse(ex, ey, rx, 5, 0.38, 0, Math.PI * 2);
      }
      g.fillStyle = `rgba(20,32,8,${Math.round(alpha * 40) / 40})`;
      g.fill('nonzero');
    }
    this.groundComp = { cv, key };
    return cv;
  }

  // ligt er in beeld ergens mist? (anders hoeft die laag niet getekend te worden)
  fogInView(v) {
    const d = this.fogPrev;
    if (!d) return false;
    const cs = [toGrid(v.x0, v.y0), toGrid(v.x1, v.y0), toGrid(v.x0, v.y1), toGrid(v.x1, v.y1)];
    const S = T_W + 2;
    const xa = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.gx))) - T_MIN);
    const xb = Math.min(S - 1, Math.ceil(Math.max(...cs.map((c) => c.gx))) - T_MIN + 2);
    const ya = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.gy))) - T_MIN);
    const yb = Math.min(S - 1, Math.ceil(Math.max(...cs.map((c) => c.gy))) - T_MIN + 2);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (d[(y * S + x) * 4 + 3] > 0) return true;
    return false;
  }

  // Als het tekenen te traag gaat, tekenen we op een iets lagere resolutie zodat alles vlot blijft bewegen.
  adaptQuality(dt) {
    if (!(dt > 0) || dt > 250) return;
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.94 + dt * 0.06 : dt;
    this.frameN++;
    if (this.frameN < 120) return;
    const cam = this.cam;
    if (this.frameAvg > 25 && cam.quality > 0.55) {
      cam.quality = Math.max(0.55, cam.quality - 0.15);
      this.frameN = 0;
    }
  }

  viewRect(m = 140) {
    const a = this.cam.screenToWorld(0, 0);
    const b = this.cam.screenToWorld(this.cam.w, this.cam.h);
    return { x0: a.x - m, y0: a.y - m, x1: b.x + m, y1: b.y + m + 60 };
  }

  pickNode(w) {
    let best = null; let bd = Infinity;
    for (const n of this.state.nodes || []) {
      if (n.claimed) continue;
      const p = toWorld(n.gx, n.gy);
      const top = n.kind === 'tree' ? 62 : 30;
      const tol = Math.max(18, 14 / this.cam.zoom);
      if (Math.abs(w.x - p.x) < tol && w.y < p.y + 10 && w.y > p.y - top) {
        const d = Math.abs(w.x - p.x) + Math.abs(w.y - (p.y - top / 2));
        if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }

  pickWalker(w) {
    let best = null; let bd = Infinity;
    const tol = Math.max(9, 13 / this.cam.zoom);
    for (const v of this.walkers) {
      if (!(v.wait <= 0 || v.phase === 'work' || v.job === 'idle')) continue;
      const p = toWorld(v.gx, v.gy);
      if (Math.abs(w.x - p.x) < tol && w.y < p.y + 5 && w.y > p.y - 22) {
        const d = Math.abs(w.x - p.x) + Math.abs(w.y - (p.y - 9));
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best;
  }

  // ---------- tekenen ----------

  draw(t, dt, now) {
    const ctx = this.ctx;
    const cam = this.cam;
    cam.resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#12181c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.state || !this.ground) return;
    this.now = now;
    this.frameT = t;
    dt = Math.min(dt, 100);
    if (Math.floor(t / 1000) !== this.lightSecond) { this.lightSecond = Math.floor(t / 1000); this.light = FX.daylight(); }
    const light = this.light;
    const night = light.dark;
    this.updateWalkers(dt);
    this.updateAnimals(dt);
    this.particles.update(dt);
    this.birds.update(dt);
    this.clouds.update(dt);
    this.adaptQuality(dt);
    if (now - this.fogAt > 120 || now < this.fogAt) this.updateFog(now);
    cam.apply(ctx);
    const gnd = this.ground;
    const vis = this.viewRect(2);
    drawSub(ctx, this.groundLayer(this.light), BAKE, this.groundOrigin.x, this.groundOrigin.y, gnd.W, gnd.H, vis);
    this.drawPond(ctx, t);
    this.drawLakes(ctx, t);

    const s = this.state;
    const v = this.viewRect();
    const inView = (p) => p.x > v.x0 && p.x < v.x1 && p.y > v.y0 && p.y < v.y1;
    this.treeMip = cam.zoom * cam.dpr < 0.95;
    if (this.placing) this.drawGrid(ctx); else this.drawBuildArea(ctx);
    const wall = s.buildings.find((b) => b.type === 'wall');
    const wallLevel = wall ? wall.level : 0;
    const segs = this.wallSegments(wallLevel);
    this.drawShadows(ctx, segs, wallLevel, light, vis);

    const items = [];
    const nodes = s.nodes || [];
    const dark = this.dark;
    const inDark = (gx, gy) => {
      if (!dark) return false;
      const i = Math.floor(gx); const j = Math.floor(gy);
      return i >= T_MIN && j >= T_MIN && i < T_MAX && j < T_MAX && dark[tileIndex(i, j)] === 1;
    };
    for (const d of this.decor) { const p = toWorld(d.gx, d.gy); if (inView(p) && !inDark(d.gx, d.gy)) items.push({ depth: d.gx + d.gy, kind: 'decor', d }); }
    const chopping = new Set((s.field || []).filter((g) => g.work && g.work.type === 'chop').map((g) => `${g.work.i},${g.work.j}`));
    for (const tr of this.visTrees) {
      if (dark && dark[tileIndex(tr.i, tr.j)] === 1) continue;
      const p = toWorld(tr.gx, tr.gy);
      if (!inView(p)) continue;
      if (nodes.some((n) => Math.hypot(n.gx - tr.gx, n.gy - tr.gy) < 1)) continue;
      items.push({ depth: tr.gx + tr.gy, kind: 'tree', tr, shake: chopping.has(`${tr.i},${tr.j}`) });
    }
    for (const st of this.stumps) items.push({ depth: st.gx + st.gy - 0.3, kind: 'stump', st });
    for (const n of nodes) items.push({ depth: n.gx + n.gy, kind: 'node', n });
    for (const hv of s.harvests || []) {
      const pos = this.harvesterPos(hv, now);
      if (pos) items.push({ depth: pos.gx + pos.gy, kind: 'harvester', hv, pos });
    }
    for (const b of s.buildings) {
      if (!isPlaced(b)) continue;
      const size = BUILDINGS[b.type].size;
      items.push({ depth: b.x + b.y + size, kind: 'building', b });
    }
    for (const seg of segs) items.push({ depth: (seg.x0 + seg.x1) / 2 + (seg.y0 + seg.y1) / 2 + 0.2, kind: 'wall', seg });
    for (const w of this.walkers) if (w.wait <= 0 || w.phase === 'work' || w.job === 'idle') items.push({ depth: w.gx + w.gy, kind: 'walker', w });
    for (const sol of this.soldierSpots()) items.push({ depth: sol.gx + sol.gy, kind: 'soldier', sol });
    for (const sh of this.sheep) items.push({ depth: sh.gx + sh.gy, kind: 'sheep', sh });
    if (s.terr) {
      const terr = this.terr;
      for (const d of terr.deposits) {
        if (depLeft(s, d) <= 0 || !this.isExplored(d.x, d.y) || !inView(toWorld(d.x, d.y))) continue;
        items.push({ depth: d.x + d.y, kind: 'deposit', d });
      }
      for (const b of terr.boars) {
        if (!boarAlive(s, b.id, now)) continue;
        const bp = this.boarPos(b);
        if (!this.isVisible(bp.x, bp.y)) continue;
        items.push({ depth: bp.x + bp.y, kind: 'boar', b, bp });
      }
      if (terr.camp && this.isExplored(terr.camp.x, terr.camp.y)) items.push({ depth: terr.camp.x + terr.camp.y, kind: 'camp' });
      const raid = this.raidParty(now);
      if (raid && this.isExplored(raid.x, raid.y)) items.push({ depth: raid.x + raid.y, kind: 'raid', raid });
      for (const g of s.field || []) {
        const p = groupPos(g, now);
        items.push({ depth: p.x + p.y, kind: 'group', g, p });
      }
    }
    items.sort((a, b) => a.depth - b.depth);

    const jobs = new Map(s.builds.map((j) => [j.bid, j]));
    this.emitT += dt;
    const emit = this.emitT > 380;
    if (emit) this.emitT = 0;
    this.drawOrderMark(ctx, t);
    for (const it of items) {
      switch (it.kind) {
        case 'decor': this.drawDecor(ctx, it.d, t); break;
        case 'tree': this.drawTree(ctx, it.tr, t, it.shake); break;
        case 'stump': this.drawStump(ctx, it.st); break;
        case 'wall': this.drawWallPiece(ctx, it.seg, wallLevel); break;
        case 'building': this.drawBuilding(ctx, it.b, jobs.get(it.b.id), t, now, emit); break;
        case 'walker': this.drawWalker(ctx, it.w, t); break;
        case 'sheep': this.drawSheep(ctx, it.sh, t); break;
        case 'node': this.drawNode(ctx, it.n, t, emit); break;
        case 'harvester': this.drawHarvester(ctx, it.hv, it.pos, t, emit); break;
        case 'deposit': this.drawDeposit(ctx, it.d, t); break;
        case 'boar': this.drawBoar(ctx, it.b, it.bp, t); break;
        case 'camp': this.drawCamp(ctx, t, now); break;
        case 'raid': this.drawRaid(ctx, it.raid, t); break;
        case 'group': this.drawGroup(ctx, it.g, it.p, t, now, emit); break;
        default: { const p = toWorld(it.sol.gx, it.sol.gy); this.drawSoldier(ctx, it.sol, p.x, p.y, t); }
      }
    }

    // vuurwerk bij een nieuw tijdperk
    const pn = performance.now();
    this.fireworks = this.fireworks.filter((f) => { if (pn >= f.at) { this.particles.firework(f.x, f.y); return false; } return true; });
    this.particles.draw(ctx);
    if (this.flutter && night < 0.5) this.flutter.draw(ctx, t, night);
    this.clouds.drawShadows(ctx, 0.12 * (1 - night));
    this.birds.draw(ctx, t, 90);
    this.drawFog(ctx, vis);

    // licht en donker
    FX.applyLight(ctx, this.canvas.width, this.canvas.height, light);
    cam.apply(ctx);
    if (night > 0.05) this.drawNightLights(ctx, t, night, segs, wallLevel);
    if (this.flutter && night >= 0.5) this.flutter.draw(ctx, t, night);

    if (this.placing && this.hoverTile) this.drawGhost(ctx);
    for (const b of s.buildings) {
      const job = jobs.get(b.id);
      if (!job || !isPlaced(b)) continue;
      const c = this.footprintCenter(b);
      this.drawProgress(ctx, c.x, c.y - (b.level === 0 ? 50 : (SPRITE_H[b.type] || 60)), job, now);
    }
    if (wall && jobs.has(wall.id)) this.drawWallProgress(ctx, jobs.get(wall.id), now);
    this.drawWorkProgress(ctx, now);
    this.drawHover(ctx);
  }

  // ---------- wildernis tekenen ----------

  drawLakes(ctx, t) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    for (const w of this.lakeWaves || []) {
      const a = Math.sin(t * 0.0016 + w.p);
      if (a < 0.45) continue;
      const p = toWorld(w.gx, w.gy);
      ctx.globalAlpha = (a - 0.45) * 1.6;
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.quadraticCurveTo(p.x, p.y - 3, p.x + 6, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawTree(ctx, tr, t, shake) {
    const p = toWorld(tr.gx, tr.gy);
    const spr = this.trees[tr.kind ?? tr.v];
    let sway = Math.sin(t * 0.0012 + tr.gx) * 0.6;
    if (shake) sway += Math.sin(t * 0.05) * 1.6;
    ctx.drawImage(this.treeMip ? spr.small : spr.cv, p.x - spr.ax + sway, p.y - spr.ay, spr.w, spr.h);
  }

  drawStump(ctx, st) {
    const p = toWorld(st.gx, st.gy);
    ctx.fillStyle = 'rgba(20,30,10,0.25)'; ctx.beginPath(); ctx.ellipse(p.x + 1, p.y, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4523'; ctx.fillRect(p.x - 3.5, p.y - 4, 7, 4);
    ctx.fillStyle = '#d9b27a'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 3.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a07a46'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 1.8, 0.8, 0, 0, Math.PI * 2); ctx.stroke();
  }

  boarPos(b) {
    const t = this.frameT || 0;
    return { x: b.x + Math.sin(t * 0.00035 + b.id * 1.7) * 0.55, y: b.y + Math.cos(t * 0.00028 + b.id) * 0.4 };
  }

  drawBoar(ctx, b, bp, t) {
    const p = toWorld(bp.x, bp.y);
    const vx = Math.cos(t * 0.00035 + b.id * 1.7) * 0.55 * 0.00035; const vy = -Math.sin(t * 0.00028 + b.id) * 0.4 * 0.00028;
    const dir = vx - vy >= 0 ? 1 : -1;
    facing(ctx, p.x, dir, () => FIG.boar(ctx, p.x, p.y, { s: 1.15, walking: true, phase: t * 0.009 + b.id }));
  }

  drawDeposit(ctx, d, t) {
    const w = toWorld(d.x, d.y);
    ctx.save(); ctx.translate(w.x, w.y); ctx.scale(1.25, 1.25);
    this.drawDepositInner(ctx, d, t);
    ctx.restore();
  }

  drawDepositInner(ctx, d, t) {
    const p = { x: 0, y: 0 };
    if (d.kind === 'gold') {
      A.rock(ctx, p.x - 8, p.y + 2, 2.8); A.rock(ctx, p.x + 9, p.y + 4, 2.1); A.rock(ctx, p.x, p.y + 8, 1.6);
      ctx.fillStyle = '#f2c230';
      for (const [dx, dy, r] of [[-12, -9, 2.2], [-5, -13, 1.8], [2, -7, 2], [10, -3, 1.6], [-1, 2, 1.5], [6, -9, 1.3]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2); ctx.fill(); }
      const tw = Math.sin(t * 0.005 + d.id * 3);
      if (tw > 0.5) { ctx.fillStyle = `rgba(255,255,230,${(tw - 0.5) * 2})`; ctx.fillRect(p.x - 6, p.y - 15, 2, 2); ctx.fillRect(p.x + 3, p.y - 9, 1.6, 1.6); }
    } else if (d.kind === 'stone') {
      A.rock(ctx, p.x - 10, p.y + 1, 3.2); A.rock(ctx, p.x + 7, p.y, 2.8); A.rock(ctx, p.x - 1, p.y + 9, 2.2); A.rock(ctx, p.x + 13, p.y + 7, 1.5);
    } else if (d.kind === 'wood') {
      for (const [dx, dy, sc] of [[-12, 2, 1.75], [10, 0, 1.6], [-1, 9, 1.85]]) A.broadleaf(ctx, p.x + dx, p.y + dy, sc, 0.15);
      ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(p.x + 14 - i, p.y + 12 - i * 3); ctx.lineTo(p.x + 26 - i, p.y + 9 - i * 3); ctx.stroke(); }
      ctx.lineCap = 'butt';
    } else {
      for (const [dx, dy] of [[-12, 0], [0, -5], [11, 1], [-4, 8], [8, 9]]) {
        A.bush(ctx, p.x + dx, p.y + dy, 1.6);
        ctx.fillStyle = '#d6324a';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(p.x + dx - 3 + i * 2, p.y + dy - 4 - (i % 2) * 2, 1.1, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }

  drawCamp(ctx, t, now) {
    const s = this.state;
    const c = this.terr.camp;
    const w = toWorld(c.x, c.y);
    ctx.save(); ctx.translate(w.x, w.y); ctx.scale(1.3, 1.3);
    this.drawCampInner(ctx, t, now, s);
    ctx.restore();
  }

  drawCampInner(ctx, t, now, s) {
    const p = { x: 0, y: 0 };
    if (!campAlive(s, now)) {
      ctx.fillStyle = 'rgba(30,25,20,0.55)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 54, 26, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.fillStyle = '#2a2018'; ctx.fillRect(p.x + Math.cos(a) * 44 - 1.5, p.y + Math.sin(a) * 20 - 5, 3, 5); }
      A.smoke(ctx, p.x, p.y - 4, t, 7, 0.8);
      return;
    }
    // palissade, tenten, vuur en barbaren
    const stakes = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 0.5) < 0.28) continue; // poortje vooraan
      stakes.push({ x: p.x + Math.cos(a) * 54, y: p.y + Math.sin(a) * 26 });
    }
    const drawStake = (st) => {
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(st.x - 1.6, st.y - 13, 3.2, 13);
      ctx.fillStyle = '#8a6238'; ctx.beginPath(); ctx.moveTo(st.x - 1.6, st.y - 13); ctx.lineTo(st.x, st.y - 17); ctx.lineTo(st.x + 1.6, st.y - 13); ctx.fill();
    };
    for (const st of stakes) if (st.y <= p.y) drawStake(st);
    A.tent(ctx, p.x - 22, p.y - 6, 1.1, '#5b3a2a');
    A.tent(ctx, p.x + 20, p.y - 9, 1.0, '#6b2f2a');
    A.tent(ctx, p.x + 2, p.y + 8, 1.15, '#4a4038');
    A.fire(ctx, p.x - 6, p.y + 2, 1, t);
    for (const [dx, dy, ph] of [[-30, 6, 0], [28, 6, 2], [10, -16, 4]]) {
      A.person(ctx, p.x + dx, p.y + dy + Math.sin(t * 0.004 + ph) * 0.4, { s: 1.05, body: '#5b4636', weapon: ph === 2 ? 'spear' : 'sword', barb: true, skin: 1 + (ph % 3) });
    }
    A.flag(ctx, p.x + 40, p.y - 4, 30, '#1c1c1c', t, 1);
    ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(p.x + 47, p.y - 30, 2.2, 0, Math.PI * 2); ctx.fill();
    for (const st of stakes) if (st.y > p.y) drawStake(st);
  }

  // barbaren die op weg zijn naar je stad (de laatste anderhalve minuut voor een overval)
  raidParty(now) {
    const s = this.state;
    if (!s.terr || !this.terr.camp) return null;
    const c = s.terr.camp;
    if (c.next == null || !campAlive(s, now)) return null;
    const start = c.next - WILD.raid.warnMs;
    if (now < start || now >= c.next) return null;
    const f = (now - start) / WILD.raid.warnMs;
    const d = tcDoor();
    return { x: this.terr.camp.x + (d.gx - this.terr.camp.x) * f, y: this.terr.camp.y + (d.gy - this.terr.camp.y) * f, n: raidSize(s), dir: d.gx - d.gy - (this.terr.camp.x - this.terr.camp.y) >= 0 ? 1 : -1 };
  }

  drawRaid(ctx, raid, t) {
    const p = toWorld(raid.x, raid.y);
    const n = Math.min(8, raid.n);
    const offs = [[0, 0], [0.35, -0.1], [-0.1, 0.35], [0.4, 0.3], [-0.35, 0.05], [0.1, -0.4], [0.5, -0.4], [-0.4, 0.4]];
    for (let i = n - 1; i >= 0; i--) {
      const q = toWorld(offs[i][0], offs[i][1]);
      facing(ctx, p.x + q.x, raid.dir, () => A.person(ctx, p.x + q.x, p.y + q.y, { s: 1, walking: true, phase: t * 0.014 + i, body: '#5b4636', weapon: i % 2 ? 'sword' : 'spear', barb: true, skin: 1 + (i % 3) }));
    }
    A.flag(ctx, p.x + 4, p.y - 2, 28, '#7a1b12', t, 0.9);
  }

  // ---------- groepen in het veld ----------

  drawGroup(ctx, g, pos, t, now, emit) {
    const p = toWorld(pos.x, pos.y);
    const sel = this.sel && this.sel.type === 'group' && this.sel.id === g.id;
    const moving = g.pending && now < g.t1;
    if (sel) {
      const pulse = 0.6 + Math.sin(t * 0.008) * 0.3;
      ctx.strokeStyle = `rgba(255,225,90,${pulse})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 3, 18, 9, 0, 0, Math.PI * 2); ctx.stroke();
      if (moving) {
        const d = toWorld(g.x1, g.y1);
        ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,240,180,0.65)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
        A.flag(ctx, d.x, d.y, 16, '#ffe28a', t, 0.6);
      }
    }
    const kinds = [];
    for (const k of Object.keys(g.units)) for (let i = 0; i < Math.min(g.units[k], 7); i++) kinds.push(k);
    const figs = kinds.slice(0, 7);
    const offs = [[0, 0], [0.34, -0.06], [-0.06, 0.34], [0.36, 0.3], [-0.32, 0.04], [0.04, -0.34], [0.38, -0.4]];
    const working = !!g.work;
    if (!this.groupDir) this.groupDir = new Map();
    if (moving) this.groupDir.set(g.id, (g.x1 - g.x0) - (g.y1 - g.y0) >= 0 ? 1 : -1);
    const dir = this.groupDir.get(g.id) || 1;
    const order = figs.map((k, i) => ({ k, o: offs[i] })).sort((a, b) => a.o[0] + a.o[1] - (b.o[0] + b.o[1]));
    for (const { k, o } of order) {
      const q = toWorld(o[0], o[1]);
      const fx = p.x + q.x;
      facing(ctx, fx, dir, () => this.drawFigure(ctx, k, fx, p.y + q.y, t, moving, working, this.groupTool(g)));
    }
    const total = Object.values(g.units).reduce((a, b) => a + b, 0);
    if (total > figs.length) {
      ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(30,20,10,0.8)'; ctx.beginPath(); ctx.roundRect(p.x - 12, p.y - 40, 24, 13, 6); ctx.fill();
      ctx.fillStyle = '#fff3d6'; ctx.fillText(`×${total}`, p.x, p.y - 30);
    }
    if (working && emit) {
      if (g.work.type === 'chop') this.particles.dust(p.x + 8, p.y - 6, 1);
      else {
        const d = this.terr.deposits.find((x) => x.id === g.work.id);
        if (d && (d.kind === 'gold' || d.kind === 'stone')) this.particles.sparks(p.x + 6, p.y - 8, 2);
      }
    }
  }

  // welk gereedschap neemt een dorpeling in het veld mee?
  groupTool(g) {
    const w = g.work || g.order;
    if (!w) return 'axe';
    if (w.type === 'chop') return 'axe';
    if (w.type === 'gather') {
      const d = this.terr.deposits.find((x) => x.id === w.id);
      return d ? TOOL[WILD.deposits[d.kind].res] : 'axe';
    }
    return 'axe';
  }

  drawFigure(ctx, kind, x, y, t, moving, working, toolKind) {
    if (kind === 'villager') {
      A.person(ctx, x, y, { s: 0.95, walking: moving, working: working && !moving, phase: working && !moving ? t * 0.009 + x : t * 0.012, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: toolKind });
      return;
    }
    this.drawSoldier(ctx, { kind, gx: x * 0.01, gy: y * 0.01, walking: moving }, x, y, t);
  }

  // doel-markering na een opdracht
  drawOrderMark(ctx, t) {
    const m = this.orderMark;
    if (!m) return;
    const age = performance.now() - m.at;
    if (age > 900) { this.orderMark = null; return; }
    const p = toWorld(m.gx, m.gy);
    const f = age / 900;
    ctx.strokeStyle = m.attack ? `rgba(230,60,40,${1 - f})` : `rgba(140,230,120,${1 - f})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 6 + f * 14, 3 + f * 7, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // voortgang van kappen in het veld
  drawWorkProgress(ctx, now) {
    for (const g of this.state.field || []) {
      if (!g.work || g.work.type !== 'chop') continue;
      const p = toWorld(g.work.i + 0.5, g.work.j + 0.5);
      this.drawProgress(ctx, p.x, p.y - 52, { start: g.work.end - FIELD.chopMs, end: g.work.end }, now);
    }
  }

  // naam en voorraad tonen als je over iets in de wildernis beweegt
  drawHover(ctx) {
    const w = this.hoverW;
    const s = this.state;
    if (!w || !s.terr || this.placing) return;
    let label = null; let at = null;
    for (const d of this.terr.deposits) {
      if (depLeft(s, d) <= 0 || !this.isExplored(d.x, d.y)) continue;
      const p = toWorld(d.x, d.y);
      if (Math.abs(w.x - p.x) < 30 && w.y < p.y + 12 && w.y > p.y - 40) { label = `${WILD.deposits[d.kind].name} · nog ${Math.floor(depLeft(s, d))}`; at = p; }
    }
    for (const b of this.terr.boars) {
      if (!boarAlive(s, b.id, this.now) || !this.isVisible(b.x, b.y)) continue;
      const bp = this.boarPos(b); const p = toWorld(bp.x, bp.y);
      if (Math.abs(w.x - p.x) < 18 && w.y < p.y + 6 && w.y > p.y - 22) { label = `${WILD.boar.name} · +${WILD.boar.loot.food} voedsel`; at = p; }
    }
    const c = this.terr.camp;
    if (c && this.isExplored(c.x, c.y)) {
      const p = toWorld(c.x, c.y);
      if (Math.abs(w.x - p.x) < 68 && w.y < p.y + 30 && w.y > p.y - 52) {
        label = campAlive(s, this.now) ? `${WILD.camp.name} · ${Math.max(1, campSize(s))} barbaren` : `${WILD.camp.name} (verwoest)`;
        at = p;
      }
    }
    if (!label) return;
    ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width + 14;
    const y = at.y - 52;
    ctx.fillStyle = 'rgba(28,20,12,0.85)'; ctx.beginPath(); ctx.roundRect(at.x - tw / 2, y - 14, tw, 18, 7); ctx.fill();
    ctx.fillStyle = '#fff3d6'; ctx.fillText(label, at.x, y - 1);
  }

  // rand van je bouwgrond (en gekapte stukken) zacht aanduiden
  drawBuildArea(ctx) {
    const s = this.state;
    const k = buildRing(s);
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    ctx.strokeStyle = 'rgba(255,248,220,0.3)'; ctx.lineWidth = 0.05; ctx.setLineDash([0.3, 0.2]);
    ctx.strokeRect(-k, -k, N + 2 * k, N + 2 * k);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,240,190,0.08)';
    for (const idx of s.terr ? s.terr.cl : []) {
      const { i, j } = tileOf(idx);
      if (ringOf(i, j) > k) ctx.fillRect(i, j, 1, 1);
    }
    ctx.restore();
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

  drawShadows(ctx, segs, wallLevel, light, vis) {
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
      if (!isPlaced(b)) continue;
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
    ctx.fillStyle = `rgba(20,32,8,${alpha})`;
    ctx.fill('nonzero');
  }

  drawNightLights(ctx, t, night, segs, wallLevel) {
    const s = this.state;
    for (const b of s.buildings) {
      if (!isPlaced(b) || b.level === 0) continue;
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
    // kampvuur van de barbaren en groepen in het veld
    if (s.terr && this.terr.camp && campAlive(s, this.now) && this.isExplored(this.terr.camp.x, this.terr.camp.y)) {
      const p = toWorld(this.terr.camp.x, this.terr.camp.y);
      FX.drawGlow(ctx, p.x - 6, p.y - 2, 46, FX.FIRE, night * (0.8 + Math.sin(t * 0.013) * 0.15));
    }
    for (const g of s.field || []) {
      const pos = groupPos(g, this.now); const p = toWorld(pos.x, pos.y);
      FX.drawGlow(ctx, p.x + 3, p.y - 10, 12, FX.WARM, night * 0.7);
    }
    // dorpelingen met lantaarns
    for (const w of this.walkers) {
      if (!(w.wait <= 0 || w.phase === 'work')) continue;
      const p = toWorld(w.gx, w.gy);
      FX.drawGlow(ctx, p.x + 3, p.y - 8, 8, FX.WARM, night * 0.5);
    }
  }

  drawGrid(ctx) {
    const s = this.state;
    const k = buildRing(s);
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.025;
    for (let i = -k; i <= N + k; i++) {
      ctx.beginPath(); ctx.moveTo(i, -k); ctx.lineTo(i, N + k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-k, i); ctx.lineTo(N + k, i); ctx.stroke();
    }
    for (const idx of s.terr ? s.terr.cl : []) {
      const { i, j } = tileOf(idx);
      if (ringOf(i, j) > k) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(i, j, 1, 1); ctx.strokeRect(i, j, 1, 1); }
    }
    ctx.restore();
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
    if (d.kind === 'bush') A.bush(ctx, p.x, p.y, 1.2);
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
    if (this.sel && this.sel.type === 'walker' && this.sel.w === w) {
      const pulse = 0.6 + Math.sin(t * 0.008) * 0.3;
      ctx.strokeStyle = `rgba(255,225,90,${pulse})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe28a';
      const ay = p.y - 30 + Math.sin(t * 0.008) * 2;
      ctx.beginPath(); ctx.moveTo(p.x - 4, ay); ctx.lineTo(p.x + 4, ay); ctx.lineTo(p.x, ay + 5); ctx.closePath(); ctx.fill();
    }
    const walking = !!w.target && w.wait <= 0;
    const working = w.phase === 'work' && w.wait > 0 && w.job !== 'idle';
    const idle = w.job === 'idle';
    facing(ctx, p.x, w.dir || 1, () => A.person(ctx, p.x, p.y, {
      s: 0.9, walking, working, phase: working ? w.t * 0.009 + w.gx : w.t * 0.012, skin: w.skin,
      body: idle ? '#a08560' : ['#8b6a43', '#7a5a3a', '#6f7f4a', '#8a5a4a'][w.skin % 4], hat: idle ? null : '#d8ae52',
      weapon: idle || w.phase === 'back' ? null : 'tool', tool: TOOL[w.job], carry: w.phase === 'back' && !idle ? w.job : null,
    }));
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
      facing(ctx, c.x + 14, -1, () => A.person(ctx, c.x + 14, c.y + 6, { s: 0.9, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: 'hammer', working: true, phase: t * 0.01 }));
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
    const k = buildRing(this.state);
    const c = toWorld(N / 2, N + k + 0.6);
    this.drawProgress(ctx, c.x, c.y - 36, job, now);
  }

  centerOn(b) {
    const size = BUILDINGS[b.type].size;
    const c = toWorld(b.x + size / 2, b.y + size / 2);
    this.cam.x = c.x; this.cam.y = c.y - 30;
  }

  centerOnPos(gx, gy) {
    const c = toWorld(gx, gy);
    this.cam.x = c.x; this.cam.y = c.y - 20;
    this.cam.clamp();
  }
}
