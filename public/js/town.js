// Isometrische weergave van de eigen stad: gebouwen met slagschaduwen, dag en nacht,
// wandelende dorpelingen, troepen, schapen, eendjes, vogels en feestelijke effecten.
import * as A from './art.js';
import * as FX from './fx.js';
import { Camera, isoFns, hashInt } from './iso.js';
import { BUILDINGS, TOWN_GRID, RES, BONUS, RES_NAMES, WILD, UNITS, FIELD, LAND, ARMY_UNITS, landCost, WALL_TILE, techTier } from '../shared/rules.js';
import { soldierOpts, lookOf } from './troops.js';
import {
  canPlaceAt, totalVillagers, tcDoor, isPlaced, buildRing, clearedSet, isBuildable, canChop, groupPos, groupVision,
  exploredNow, homeSight, depLeft, boarAlive, campAlive, campSize, raidSize, isVillagerGroup, checkBuyLot, checkPlaceWalls, wallSet, bLevel,
  gateAxis, checkPlaceGate, routeTo, gateList, gateSpan, checkMove, checkMoveWalls,
} from '../shared/sim.js';
import { territory, ringOf, tileIndex, tileOf, exHas, T_MIN, T_MAX, T_W, TILE } from '../shared/territory.js';
import { ICON } from './ui.js';
import * as NAT from './nature.js';
import * as FIG from './figures.js';
import { fbm } from '../shared/worldgen.js';
import { buildDress, drawProp, dressKey } from './towndress.js';
import * as S3 from './sprite3d.js';
import * as GH from './groundhd.js';
import { runFight, lastSwing, maxHp } from '../shared/skirmish.js';

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

// ---------- het barbarendorp (één keer getekend: achterkant en voorkant van de palissade) ----------
let CAMP_SPR = null;
function campSprites() {
  if (CAMP_SPR) return CAMP_SPR;
  const W = 156; const H = 124; const AY = 84; const K = 2;
  const make = (fn) => {
    const cv = document.createElement('canvas');
    cv.width = W * K; cv.height = H * K;
    const c = cv.getContext('2d');
    c.scale(K, K); c.translate(W / 2, AY);
    c.lineCap = 'round'; c.lineJoin = 'round';
    fn(c);
    return cv;
  };
  const RX = 60; const RY = 29;
  const stakes = [];
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 0.5) < 0.26) continue; // poort vooraan
    stakes.push({ x: Math.cos(a) * RX, y: Math.sin(a) * RY, h: 15 + ((i * 7) % 5), lean: Math.cos(a) * 0.8 });
  }
  const stake = (c, st) => {
    const { x, y, h } = st;
    c.fillStyle = '#5e4027'; c.beginPath(); c.moveTo(x - 1.9, y); c.lineTo(x - 1.7 + st.lean, y - h); c.lineTo(x + st.lean * 1.1, y - h - 4.5); c.lineTo(x + 1.7 + st.lean, y - h); c.lineTo(x + 1.9, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 0.2, y - h, 1.7, h);
    c.fillStyle = 'rgba(255,220,170,0.18)'; c.fillRect(x - 1.7, y - h, 0.6, h);
    c.fillStyle = '#b89a6a'; c.fillRect(x - 2, y - h * 0.55, 4, 1);
  };
  const hut = (c, x, y, r, roof) => {
    const wh = r * 0.85;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 3, y + 1, r * 1.3, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    const g = c.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, '#9a7448'); g.addColorStop(0.5, '#7a5a36'); g.addColorStop(1, '#4e3820');
    c.fillStyle = g; c.beginPath(); c.moveTo(x - r, y - wh); c.lineTo(x - r, y); c.ellipse(x, y, r, r * 0.45, 0, Math.PI, 0, true); c.lineTo(x + r, y - wh); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,25,10,0.45)'; c.lineWidth = 0.5;
    for (let k = -r + 2; k < r; k += 2.2) { c.beginPath(); c.moveTo(x + k, y - wh); c.lineTo(x + k, y + Math.sqrt(Math.max(0, 1 - (k / r) ** 2)) * r * 0.45); c.stroke(); }
    c.fillStyle = '#2a1a10'; c.beginPath(); c.moveTo(x - r * 0.25, y + r * 0.42); c.lineTo(x - r * 0.25, y - wh * 0.45); c.quadraticCurveTo(x, y - wh * 0.75, x + r * 0.25, y - wh * 0.45); c.lineTo(x + r * 0.25, y + r * 0.42); c.fill();
    const top = y - wh - r * 1.45;
    const rg = c.createLinearGradient(x - r, top, x + r, y - wh);
    rg.addColorStop(0, '#e3c47a'); rg.addColorStop(0.55, roof); rg.addColorStop(1, '#7a5a26');
    c.fillStyle = rg; c.beginPath(); c.moveTo(x - r * 1.2, y - wh + 1); c.lineTo(x, top); c.lineTo(x + r * 1.2, y - wh + 1); c.ellipse(x, y - wh + 1, r * 1.2, r * 0.5, 0, 0, Math.PI); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(90,60,20,0.5)'; c.lineWidth = 0.5;
    for (let k = -5; k <= 5; k++) { c.beginPath(); c.moveTo(x, top + 2); c.lineTo(x + (k / 5) * r * 1.2, y - wh + 1 + Math.sqrt(Math.max(0, 1 - (k / 5) ** 2)) * r * 0.5); c.stroke(); }
    c.fillStyle = '#3a2a18'; c.beginPath(); c.ellipse(x, top + 2.5, 1.6, 0.8, 0, 0, Math.PI * 2); c.fill();
  };
  const totem = (c, x, y) => {
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 2, y + 1, 5, 2, 0, 0, Math.PI * 2); c.fill();
    const cols = ['#7a4a26', '#a8432f', '#2a2018', '#c49a3a', '#7a4a26'];
    for (let i = 0; i < 5; i++) {
      c.fillStyle = cols[i]; c.fillRect(x - 2.6, y - 6 - i * 6, 5.2, 6);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 0.6, y - 6 - i * 6, 2, 6);
      c.fillStyle = '#f0e6d0'; c.fillRect(x - 1.6, y - 3.6 - i * 6, 1, 1); c.fillRect(x + 0.6, y - 3.6 - i * 6, 1, 1);
    }
    c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(x, y - 33, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1a10'; c.fillRect(x - 1.4, y - 33.6, 1, 1); c.fillRect(x + 0.4, y - 33.6, 1, 1);
    c.strokeStyle = '#efe6d2'; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(x - 2.4, y - 34); c.quadraticCurveTo(x - 6, y - 37, x - 5, y - 41); c.moveTo(x + 2.4, y - 34); c.quadraticCurveTo(x + 6, y - 37, x + 5, y - 41); c.stroke();
  };
  const rack = (c, x, y) => {
    c.strokeStyle = '#5e4027'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x - 7, y - 14); c.moveTo(x + 7, y - 2); c.lineTo(x + 7, y - 16); c.moveTo(x - 8, y - 13); c.lineTo(x + 8, y - 15); c.stroke();
    c.fillStyle = '#c9a77a'; c.beginPath(); c.moveTo(x - 5.5, y - 12.5); c.lineTo(x + 5.5, y - 14); c.quadraticCurveTo(x + 6, y - 7, x + 4.5, y - 4); c.lineTo(x - 4.5, y - 3); c.quadraticCurveTo(x - 6.4, y - 7, x - 5.5, y - 12.5); c.fill();
    c.strokeStyle = 'rgba(90,60,30,0.6)'; c.lineWidth = 0.4; c.stroke();
  };
  const bones = (c, x, y) => { c.strokeStyle = '#efe6d2'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 2, y - 1); c.moveTo(x - 1, y + 1.5); c.lineTo(x + 3, y + 2.5); c.stroke(); };
  const back = make((c) => {
    c.fillStyle = 'rgba(80,60,35,0.45)'; c.beginPath(); c.ellipse(0, 0, RX - 4, RY - 2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(60,40,20,0.35)'; c.beginPath(); c.ellipse(-4, 4, 14, 7, 0, 0, Math.PI * 2); c.fill();
    for (const [x, y] of [[-20, 14], [18, 16], [-36, 2], [40, 6]]) bones(c, x, y);
    for (const st of stakes) if (st.y < 0) stake(c, st);
    hut(c, -30, -8, 11, '#c9a24a');
    hut(c, 26, -12, 13, '#b8913e');
    hut(c, -4, -18, 9, '#d0ab55');
    totem(c, 44, -4);
    rack(c, -46, 6);
    // houtstapel bij het vuur
    for (let i = 0; i < 3; i++) { c.fillStyle = '#6b4826'; c.beginPath(); c.ellipse(10 + i * 2, 12 - i * 2.4, 6, 1.6, 0.2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d6b27a'; c.beginPath(); c.ellipse(16 + i * 2, 13 - i * 2.4, 1, 1.4, 0, 0, Math.PI * 2); c.fill(); }
  });
  const front = make((c) => {
    for (const st of stakes) if (st.y >= 0) stake(c, st);
    // schedels op palen bij de poort
    for (const x of [-15, 15]) {
      c.strokeStyle = '#5e4027'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, RY + 1); c.lineTo(x, RY - 22); c.stroke();
      c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(x, RY - 24, 2.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a1a10'; c.fillRect(x - 1.5, RY - 24.6, 1, 1); c.fillRect(x + 0.5, RY - 24.6, 1, 1);
    }
  });
  CAMP_SPR = { back, front, w: W, h: H, ay: AY };
  return CAMP_SPR;
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

// kleine gebouwen iets groter tekenen dan hun tegel, zodat de stad voller en gedetailleerder oogt
const bScale = (b) => ((BUILDINGS[b.type].size || 1) === 1 ? 1.12 : 1);

const FOG_SCALE = 0.25;
// kleur per diepte (f = waarde / 255 * 1,6) voor de scherpe meren: zandrand, schuim, ondiep, diep
let lakeLut = null;
function lakeLUT() {
  if (lakeLut) return lakeLut;
  const L = new Uint8ClampedArray(256 * 4);
  const ramp = (f, a, b) => Math.min(1, Math.max(0, (f - a) / (b - a)));
  for (let v = 0; v < 256; v++) {
    const f = (v / 255) * 1.6;
    let r = 0; let g = 0; let b = 0; let a = 0;
    if (f < 0.22) a = 0;
    else if (f < 0.4) {
      const t = ramp(f, 0.22, 0.3);
      r = 210; g = 192; b = 138; a = t * (f < 0.34 ? 0.75 : 0.95);
      if (f > 0.34) { r = 178; g = 158; b = 106; } // natte rand
    } else if (f < 0.46) { r = 236; g = 244; b = 246; a = 0.92; } // schuim
    else {
      const dpt = ramp(f, 0.46, 1.5);
      r = 96 - dpt * 52; g = 168 - dpt * 52; b = 206 - dpt * 22; a = 1;
      if (f < 0.6) { const t = 1 - ramp(f, 0.46, 0.6); r += (130 - r) * t * 0.5; g += (205 - g) * t * 0.5; b += (215 - b) * t * 0.5; }
      if (f > 0.47 && f < 0.5) { r += 18; g += 18; b += 14; } // lichte lijn net binnen het schuim
    }
    L[v * 4] = r; L[v * 4 + 1] = g; L[v * 4 + 2] = b; L[v * 4 + 3] = Math.round(a * 255);
  }
  lakeLut = L;
  return L;
}
// resolutie van getekende (2D) stukken die als afbeelding bewaard worden: scherper als je inzoomt
const spriteQ = (need) => (need > 4.5 ? 6 : need > 3 ? 4 : 2.5);

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
    this.treeSprites = []; // getekende (2D) bomen: pas gemaakt als de 3D-boom (nog) niet klaar is, zie treeSpr()
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
      if (this.moveB && !this.moveB.dragging && sx >= 0) { this.moveB.gdx = 0; this.moveB.gdy = 0; this.updateMove(sx, sy); }
      this.updateCursor();
    };
    this.cam.onLongPress = (sx, sy) => this.longPress(sx, sy);
    this.cam.onHoldDrag = (ph, sx, sy) => this.holdDrag(ph, sx, sy);
    this.cam.onGrab = (sx, sy) => this.grabMove(sx, sy);
    this.cam.onRightClick = (sx, sy) => {
      if (this.moveB) { this.cancelMove(); return; }
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
    if (this.sel && (this.sel.type === 'group' || this.sel.type === 'unit') && !(state.field || []).some((g) => g.id === this.sel.id)) this.setSel(null);
    if (this.sel && this.sel.type === 'unit') {
      const g = state.field.find((x) => x.id === this.sel.id);
      if (!g.units[this.sel.kind]) this.setSel(null);
    }
    if (this.sel && (this.sel.type === 'kind' || this.sel.type === 'army')) this.refreshMultiSel();
    if (this.sel && this.sel.type === 'groups') {
      const ids = this.sel.ids.filter((id) => (state.field || []).some((g) => g.id === id));
      if (!ids.length) this.setSel(null); else this.sel.ids = ids;
    }
  }

  // ---------- selectie ----------

  setSel(sel) {
    this.sel = sel;
    if (sel) { this.selected = null; this.selWall = null; }
    if (this.onSelChange) this.onSelChange(sel);
  }

  clearSel() {
    this.setSel(null);
  }

  selGroup() {
    if (!this.sel || (this.sel.type !== 'group' && this.sel.type !== 'unit') || !this.state) return null;
    return (this.state.field || []).find((g) => g.id === this.sel.id) || null;
  }

  // kan de selectie bomen kappen of bronnen ontginnen? (enkel dorpelingen)
  selIsVillager() {
    if (!this.sel) return false;
    if (this.sel.type === 'walker' || this.sel.type === 'villagers') return true;
    if (this.sel.type === 'groups' || this.sel.type === 'kind' || this.sel.type === 'unit') return this.sel.kind === 'villager';
    if (this.sel.type === 'army') return false;
    const g = this.selGroup();
    return !!(g && isVillagerGroup(g));
  }

  // ---------- bomen (wijken bij een nieuw tijdperk of als je ze kapt) ----------

  refreshTrees() {
    const s = this.state;
    if (!s || !this.terr) return;
    const k = buildRing(s);
    const cl = s.terr ? s.terr.cl : [];
    const key = `${k}|${cl.length}|${s.buildings.length}|${(s.terr && s.terr.lots || []).length}`;
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
      const forest = this.terr.tiles[tileIndex(t.i, t.j)] === TILE.FOREST;
      const clump = forest && hashInt(t.i, t.j, sd + 304) < 0.55;
      const list = clump ? (zone < 0.42 ? NAT.CLUMP.conifer : zone > 0.56 ? NAT.CLUMP.leafy : NAT.CLUMP.mixed)
        : h < 0.06 ? NAT.AUTUMN : zone < 0.42 ? (h < 0.8 ? NAT.CONIFERS : NAT.LEAFY) : zone > 0.56 ? (h < 0.85 ? NAT.LEAFY : NAT.CONIFERS) : (h < 0.5 ? NAT.LEAFY : NAT.CONIFERS);
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
    const origin = toWorld(T_MIN, T_MIN); // bovenste hoek
    this.groundOrigin = { x: origin.x - W / 2, y: origin.y };
    const ISO = [A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0];
    const mid = N / 2;
    // naadloze texturen (één keer per sessie)
    if (!this.tex) {
      const ts = FX.LOW_POWER ? 128 : 256;
      this.tex = { grass: NAT.groundTexture('grass', ts), forest: NAT.groundTexture('forest', ts), dirt: NAT.groundTexture('dirt', ts), water: NAT.groundTexture('water', ts) };
    }
    this.pond = terr.pond;
    this.near = terr.near;
    this.pasture = terr.pasture;
    const pd = this.pond;
    const inPond = (x, y) => Math.hypot(x - pd.x, (y - pd.y) / 0.8) < pd.r + 0.6;

    // ---------- voorbereiden (één keer per stad): alles wat de tekenfunctie nodig heeft ----------
    this.lakeWaves = [];
    const lakes = [];
    for (let j = T_MIN; j < T_MAX; j++) {
      for (let i = T_MIN; i < T_MAX; i++) {
        if (terr.tiles[tileIndex(i, j)] !== TILE.WATER || inPond(i + 0.5, j + 0.5)) continue;
        lakes.push([i + 0.5, j + 0.5]);
        if (hashInt(i, j, sd + 2) < 0.35) this.lakeWaves.push({ gx: i + 0.5, gy: j + 0.5, p: hashInt(i, j, sd + 3) * 6.28 });
      }
    }
    const lakeImg = lakes.length ? this.lakeImage(lakes, sd) : null;
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
    // bodemkleur: zachte overgangen (geen zichtbare tegels), donkere bosgrond, droge plekjes in de wei
    const base = document.createElement('canvas');
    {
      const RS = FX.LOW_POWER ? 3 : 4;
      const NW = T_W * RS;
      base.width = NW; base.height = NW;
      const bc = base.getContext('2d');
      const img = bc.createImageData(NW, NW);
      const px = img.data;
      const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const C0 = hex('#5c9838'); const C1 = hex('#93bd54'); const DRY = hex('#b9b764'); const OUT = hex('#557f33');
      const FOR = hex('#3c6628'); const MOSS = hex('#5d6f2c'); const SAND = hex('#cdbb85'); const LUSH = hex('#467f2c');
      const SUN = hex('#b3c95e'); const COOL = hex('#2e5e3c');
      const lerp = (c, d, t) => { c[0] += (d[0] - c[0]) * t; c[1] += (d[1] - c[1]) * t; c[2] += (d[2] - c[2]) * t; };
      const c = [0, 0, 0];
      // zacht glooiend land: hoogte uit ruis, belicht van linksboven (de kant die naar -i kijkt krijgt licht)
      const HN = NW + 2;
      const HG = new Float32Array(HN * HN);
      for (let v = 0; v < HN; v++) for (let u = 0; u < HN; u++) {
        const gx = T_MIN + (u - 0.5) / RS; const gy = T_MIN + (v - 0.5) / RS;
        HG[v * HN + u] = fbm(gx / 5.5, gy / 5.5, sd + 701, 3) + fbm(gx / 2, gy / 2, sd + 702, 2) * 0.3;
      }
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
          // sappige, donkerder plekken gras
          const n4 = fbm(gx / 3.1 + 20, gy / 3.1, sd + 14, 2);
          if (n4 > 0.56 && f < 0.5) lerp(c, LUSH, Math.min(0.42, (n4 - 0.56) * 2.2));
          // reliëf: helling naar het licht, iets vlakker in de stad
          const hc = HG[(v + 1) * HN + u + 1];
          const hu = (HG[(v + 1) * HN + u + 2] - HG[(v + 1) * HN + u]) * RS * 0.5;
          const hv = (HG[(v + 2) * HN + u + 1] - HG[v * HN + u + 1]) * RS * 0.5;
          const flat = Math.min(1, 0.3 + ringOf(i, j) / 7);
          const sh = Math.max(-0.2, Math.min(0.2, (hu * 1.7 + hv * 0.25) * flat));
          if (sh > 0) lerp(c, SUN, sh * 1.3); else lerp(c, COOL, -sh * 1.1);
          const lv = 1 + sh * 0.6 - (hc < 0.42 ? (0.42 - hc) * 0.3 * flat : 0);
          const o = (v * NW + u) * 4;
          px[o] = c[0] * lv; px[o + 1] = c[1] * lv; px[o + 2] = c[2] * lv; px[o + 3] = 255;
        }
      }
      bc.putImageData(img, 0, 0);
    }
    const roads = [[mid, mid, mid, T_MAX], [mid, mid, mid, T_MIN], [mid, mid, T_MAX, mid], [mid, mid, T_MIN, mid]];
    const onRoad = (i, j) => (Math.abs(i - mid) < 0.62 || Math.abs(j - mid) < 0.62);
    const okGround = (i, j) => {
      const t = terr.tiles[tileIndex(Math.floor(i), Math.floor(j))];
      return t !== TILE.WATER && t !== TILE.SAND && !inPond(i, j) && Math.hypot(i - mid, j - mid) > 3.4 && !onRoad(i, j);
    };
    const meadows = FX.LOW_POWER ? 45 : 90;
    this.flowerSpots = [];
    for (let k = 0; k < meadows; k++) {
      const ci = T_MIN + hashInt(k, 71, sd) * T_W; const cj = T_MIN + hashInt(k, 72, sd) * T_W;
      if (!okGround(ci, cj) || fAt(ci, cj) > 0.35) continue;
      if (ringOf(Math.floor(ci), Math.floor(cj)) <= 6) this.flowerSpots.push(toWorld(ci, cj));
    }
    this.lilies = [];
    for (let k = 0; k < 7; k++) {
      const a = hashInt(k, 41, sd) * Math.PI * 2; const rr = pd.r * (0.35 + hashInt(k, 42, sd) * 0.5);
      this.lilies.push({ gx: pd.x + Math.cos(a) * rr, gy: pd.y + Math.sin(a) * rr * 0.8, f: k % 3 === 0 });
    }
    // kasseien op het plein: in kringen rond het midden, met een sierring van donkere stenen
    const plaza = [];
    {
      const SP = 0.14;
      const PAL = [[186, 174, 148], [204, 193, 168], [170, 162, 144], [195, 181, 151], [178, 170, 158], [210, 200, 178]];
      for (let k = 0; ; k++) {
        const r = 0.16 + k * SP;
        if (r > 3.22) break;
        const n = Math.max(5, Math.round((Math.PI * 2 * r) / 0.16));
        const off = hashInt(k, 5, sd + 501) * Math.PI * 2;
        const band = k % 7 === 4 || k === 1;
        for (let q = 0; q < n; q++) {
          const id = k * 131 + q;
          const h = hashInt(id, 7, sd + 502);
          if (r > 2.45 && h < (r - 2.45) * 1.05) continue; // rafelige rand: buiten het plein zand
          const a0 = off + (q / n) * Math.PI * 2; const a1 = off + ((q + 1) / n) * Math.PI * 2;
          const ga = (a1 - a0) * 0.045; const gr = 0.011;
          const ri = Math.max(0.02, r - SP / 2 + gr); const ro = r + SP / 2 - gr;
          const jit = (u) => (hashInt(id, u, sd + 503) - 0.5) * 0.016;
          const P = [];
          let cx = 0; let cy = 0;
          [[ri, a0 + ga], [ri, a1 - ga], [ro, a1 - ga], [ro, a0 + ga]].forEach(([rr, aa], c) => {
            const w = toWorld(mid + Math.cos(aa) * rr + jit(c * 2), mid + Math.sin(aa) * rr + jit(c * 2 + 1));
            P.push(w.x, w.y); cx += w.x / 4; cy += w.y / 4;
          });
          const v = hashInt(id, 9, sd + 504);
          let col = PAL[Math.floor(hashInt(id, 11, sd + 505) * PAL.length)];
          if (band) col = v < 0.5 ? [150, 132, 112] : [166, 128, 104];
          const b = 0.92 + v * 0.14;
          plaza.push({ P, col: [col[0] * b, col[1] * b, col[2] * b], cx, cy });
        }
      }
      plaza.sort((a, b) => a.cy - b.cy);
    }
    // korrels en grasplukjes: plaatsen één keer uitrekenen (elk stuk overloopt dan enkel een lijst)
    const grains = [[], [], []];
    {
      const n = FX.LOW_POWER ? 9000 : 22000;
      for (let k = 0; k < n; k++) {
        const i = T_MIN + hashInt(k, 61, sd) * T_W; const j = T_MIN + hashInt(k, 62, sd) * T_W;
        if (terr.tiles[tileIndex(Math.floor(i), Math.floor(j))] === TILE.WATER) continue;
        const p = toWorld(i, j);
        grains[k % 3].push(p.x, p.y);
      }
    }
    const tuftList = [];
    const tuftHD = [];
    for (let k = 0; k < (FX.LOW_POWER ? 4200 : 9500); k++) {
      const i = T_MIN + hashInt(k, 3, sd) * T_W; const j = T_MIN + hashInt(k, 4, sd) * T_W;
      if (!okGround(i, j)) continue;
      const r = hashInt(k, 5, sd);
      const p = toWorld(i, j);
      const dark = fAt(i, j) > 0.45 || r < 0.45;
      tuftList.push({ x: p.x, y: p.y, s: 0.75 + r * 0.55, col: dark ? 'rgba(40,88,22,0.62)' : 'rgba(150,200,92,0.62)', tip: r > 0.82 ? 'rgba(232,240,170,0.7)' : null });
      tuftHD.push({ x: p.x, y: p.y, s: (0.75 + r * 0.55) * 0.95, d: dark ? '#3a7424' : '#6fa23c', l: dark ? '#6fae3e' : '#b9de74', h: hashInt(k, 6, sd) });
    }
    // wilde bloemen in groepjes (kleur per plek) en stenen met mos, buiten de bouwgrond
    const WILD = ['#ffffff', '#f6e05a', '#c9a2f0', '#f2a0c0', '#9ec2f5', '#ffd27a', '#ffffff'];
    const wildFlowers = [];
    for (let k = 0; k < (FX.LOW_POWER ? 5000 : 10000); k++) {
      const i = T_MIN + hashInt(k, 731, sd) * T_W; const j = T_MIN + hashInt(k, 732, sd) * T_W;
      if (ringOf(Math.floor(i), Math.floor(j)) === 0 || !okGround(i, j) || fAt(i, j) > 0.4) continue;
      const m = fbm(i / 3.5, j / 3.5, sd + 733, 2);
      if (hashInt(k, 734, sd) > (m - 0.34) * 2.6) continue;
      const p = toWorld(i, j);
      const cl = Math.floor(fbm(i / 2.2, j / 2.2, sd + 735, 1) * 11) % WILD.length;
      wildFlowers.push({ x: p.x, y: p.y, col: WILD[cl], h: hashInt(k, 736, sd), s: 0.85 + hashInt(k, 737, sd) * 0.5 });
    }
    // extra fijne grasplukjes, enkel van dichtbij (dicht, sappig gras)
    const fineClumps = [];
    for (let k = 0; k < (FX.LOW_POWER ? 7000 : 14000); k++) {
      const i = T_MIN + hashInt(k, 751, sd) * T_W; const j = T_MIN + hashInt(k, 752, sd) * T_W;
      if (!okGround(i, j)) continue;
      const p = toWorld(i, j);
      const f = fAt(i, j); const h = hashInt(k, 753, sd);
      const pal = f > 0.45 ? ['#2f5f20', '#5a8f36'] : h < 0.5 ? ['#4b8a2c', '#8cc24f'] : h < 0.85 ? ['#5e9a34', '#a8d264'] : ['#7d9a3a', '#cbd884'];
      fineClumps.push({ x: p.x, y: p.y, s: 0.55 + hashInt(k, 754, sd) * 0.35, d: pal[0], l: pal[1], h });
    }
    const rockList = [];
    for (let k = 0; k < (FX.LOW_POWER ? 150 : 300); k++) {
      const i = T_MIN + hashInt(k, 741, sd) * T_W; const j = T_MIN + hashInt(k, 742, sd) * T_W;
      if (ringOf(Math.floor(i), Math.floor(j)) <= 3 || !okGround(i, j)) continue;
      const p = toWorld(i, j);
      const h = hashInt(k, 743, sd);
      rockList.push({ x: p.x, y: p.y, r: 1.3 + h * h * 2.8, h: hashInt(k, 744, sd), moss: fAt(i, j) > 0.2 || h < 0.6 });
    }
    const FLOWERS = ['#f4e04d', '#ffffff', '#e86f9a', '#b48cf0', '#ff9f43', '#f2f2f2', '#7fb0f0'];
    const LEAVES = ['rgba(150,95,35,0.55)', 'rgba(190,130,45,0.5)', 'rgba(95,85,35,0.5)', 'rgba(120,60,30,0.45)'];

    // ---------- tekenen: g staat in wereldcoördinaten (schaal S), R = het stuk dat getekend moet worden ----------
    // S = 0: de gebakken grond op lage resolutie (zonder de fijne texturen).
    this.paintGround = (g, R, S = 0) => {
      const WM = g.getTransform();
      const vis = (x, y, m) => x > R.x0 - m && x < R.x1 + m && y > R.y0 - m && y < R.y1 + m;
      const gvis = (gx, gy, m) => { const p = toWorld(gx, gy); return vis(p.x, p.y, m); };
      // textuur over een vorm leggen; de vorm wordt in tegelruimte opgebouwd, de textuur ligt in wereldpixels
      const texture = (kind, alpha, shape) => {
        g.save();
        g.setTransform(WM); g.transform(...ISO);
        g.beginPath(); shape();
        g.setTransform(WM);
        g.globalCompositeOperation = 'overlay'; g.globalAlpha = S ? alpha * 0.7 : alpha;
        g.fillStyle = g.createPattern(this.tex[kind], 'repeat');
        g.fill('nonzero');
        if (S) for (const [pat, a] of GH.hdPatterns(g, kind, S)) { g.globalAlpha = a; g.fillStyle = pat; g.fill('nonzero'); }
        g.restore();
      };
      const ell = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
      g.save();
      g.transform(...ISO);
      g.imageSmoothingEnabled = true;
      if (S) g.imageSmoothingQuality = 'high';
      g.drawImage(base, T_MIN, T_MIN, T_W, T_W);
      g.restore();
      texture('grass', 0.62, () => g.rect(T_MIN, T_MIN, T_W, T_W));
      texture('forest', 0.75, () => {
        for (let j = T_MIN; j < T_MAX; j++) {
          for (let i = T_MIN; i < T_MAX; i++) {
            if (forestD[tileIndex(i, j)] < 0.45 || !gvis(i + 0.5, j + 0.5, 70)) continue;
            g.moveTo(i + 0.5 + 0.9, j + 0.5); g.arc(i + 0.5, j + 0.5, 0.9, 0, Math.PI * 2);
          }
        }
      });
      // fijne korrel in het gras (anders oogt de grond te glad)
      // per kleur één pad (duizenden korreltjes: één fill i.p.v. duizenden; ze overlappen amper)
      ['rgba(25,55,12,0.16)', 'rgba(255,255,205,0.10)', 'rgba(70,100,25,0.14)'].forEach((col, c) => {
        g.fillStyle = col;
        const L = grains[c];
        g.beginPath();
        for (let k = 0; k < L.length; k += 2) {
          const x = L[k]; const y = L[k + 1];
          if (x < R.x0 - 3 || x > R.x1 + 3 || y < R.y0 - 3 || y > R.y1 + 3) continue;
          if (S) { g.moveTo(x + 1.85, y + 0.45); g.ellipse(x + 0.9, y + 0.45, 0.95, 0.5, 0, 0, Math.PI * 2); } else g.rect(x, y, 1.8, 0.9);
        }
        g.fill();
      });
      // grote, zachte kleurvlekken voor een natuurlijke look
      for (let k = 0; k < 140; k++) {
        const i = T_MIN + hashInt(k, 21, sd) * T_W; const j = T_MIN + hashInt(k, 22, sd) * T_W;
        const p = toWorld(i, j);
        const r = 30 + hashInt(k, 23, sd) * 80;
        if (!vis(p.x, p.y, r)) continue;
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        const light = k % 2 === 0;
        gr.addColorStop(0, light ? 'rgba(200,230,120,0.13)' : 'rgba(40,80,20,0.12)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); g.fill();
      }

      // in grid-ruimte tekenen (cirkels worden isometrische ellipsen)
      g.save();
      g.transform(...ISO);
      if (lakeImg && !S) g.drawImage(...lakeImg.img);
      if (lakeImg && S) { g.restore(); this.lakeHD(g, lakeImg); g.save(); g.transform(...ISO); }
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
      g.fillStyle = 'rgba(245,250,255,0.75)'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r + 0.1, pd.r * 0.8 + 0.1, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f6f9e'; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r, pd.r * 0.8, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(20,50,90,0.35)'; g.beginPath(); g.ellipse(pd.x + 0.2, pd.y + 0.15, pd.r * 0.6, pd.r * 0.45, 0.4, 0, Math.PI * 2); g.fill();
      texture('dirt', 0.8, () => {
        g.rect(mid - 0.45, T_MIN, 0.9, T_W); g.rect(T_MIN, mid - 0.45, T_W, 0.9);
        g.moveTo(mid + 3.3, mid); g.arc(mid, mid, 3.3, 0, Math.PI * 2);
      });
      texture('water', 0.5, () => {
        g.moveTo(pd.x + pd.r, pd.y); g.ellipse(pd.x, pd.y, pd.r, pd.r * 0.8, 0.4, 0, Math.PI * 2);
      });
      g.setTransform(WM); g.transform(...ISO);
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
      // plein: voegen (donker zand) onder de kasseien, naar de rand toe zachter
      if (gvis(mid, mid, 230)) {
        const mo = g.createRadialGradient(mid, mid, 0, mid, mid, 3.25);
        mo.addColorStop(0, 'rgba(104,92,72,0.95)'); mo.addColorStop(0.74, 'rgba(110,96,74,0.92)'); mo.addColorStop(1, 'rgba(120,102,76,0)');
        g.fillStyle = mo; g.beginPath(); g.arc(mid, mid, 3.25, 0, Math.PI * 2); g.fill();
      }
      g.restore();

      // mos en grasjes in de voegen, dan de kasseien (van achter naar voor)
      for (let k = 0; k < 420; k++) {
        const a = hashInt(k, 601, sd) * Math.PI * 2; const r = 0.4 + Math.sqrt(hashInt(k, 602, sd)) * 2.8;
        const p = toWorld(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
        if (!vis(p.x, p.y, 3)) continue;
        g.fillStyle = k % 3 ? 'rgba(88,118,48,0.55)' : 'rgba(120,150,60,0.5)';
        ell(p.x, p.y, 1.1, 0.55);
      }
      for (const st of plaza) if (vis(st.cx, st.cy, 9)) GH.stone(g, st.P, st.col, 1, 1);
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
            if (!vis(p.x, p.y, 10)) continue;
            if (h < 0.55) { g.fillStyle = h < 0.25 ? 'rgba(168,138,88,0.75)' : 'rgba(190,160,108,0.6)'; g.beginPath(); g.ellipse(p.x, p.y, 3 + h * 5, 1.4 + h * 2, 0, 0, Math.PI * 2); g.fill(); }
            else if (h > 0.78) { if (S) GH.grassClump(g, p.x, p.y, 0.85, '#4f8a2e', '#9cc95c', h); else NAT.tuft(g, p.x, p.y, 0.9, 'rgba(70,120,35,0.7)', null); }
          }
        }
      }
      // grind op de aardewegen: kleine steentjes met een schaduwkant
      for (let k = 0; k < (FX.LOW_POWER ? 1600 : 3400); k++) {
        const along = T_MIN + hashInt(k, 34, sd) * T_W;
        const side = (hashInt(k, 35, sd) - 0.5) * 0.84;
        const vertical = k % 2 === 0;
        const gx = vertical ? mid + side : along; const gy = vertical ? along : mid + side;
        if (Math.hypot(gx - mid, gy - mid) < 3.4) continue;
        const p = toWorld(gx, gy);
        if (!vis(p.x, p.y, 3)) continue;
        const r = 0.3 + hashInt(k, 36, sd) * 0.6;
        g.fillStyle = 'rgba(70,52,30,0.5)'; ell(p.x + r * 0.3, p.y + r * 0.4, r, r * 0.6);
        g.fillStyle = hashInt(k, 37, sd) < 0.5 ? 'rgba(150,136,112,0.95)' : 'rgba(208,194,164,0.95)'; ell(p.x, p.y, r * 0.85, r * 0.5);
      }
      // kiezels langs de wegen
      for (let k = 0; k < 500; k++) {
        const along = T_MIN + hashInt(k, 31, sd) * T_W;
        const side = (hashInt(k, 32, sd) - 0.5) * 0.9;
        const vertical = k % 2 === 0;
        const gx = vertical ? mid + side : along; const gy = vertical ? along : mid + side;
        if (Math.hypot(gx - mid, gy - mid) < 3.4) continue;
        const p = toWorld(gx, gy);
        if (!vis(p.x, p.y, 3)) continue;
        if (S) { NAT.pebble(g, p.x, p.y, 0.55, hashInt(k, 33, sd) < 0.5 ? '#8f8573' : '#c9bb9c'); continue; }
        g.fillStyle = hashInt(k, 33, sd) < 0.5 ? 'rgba(140,125,100,0.8)' : 'rgba(205,190,160,0.8)';
        ell(p.x, p.y, 1.4, 0.8);
      }
      // gras, bloemenweitjes, steentjes en een rijke bosbodem
      if (S) {
        // grasplukjes met echte sprieten, wilde bloemen en stenen
        GH.grassClumps(g, fineClumps.filter((c, k) => (S >= 3 || k % 2 === 0) && vis(c.x, c.y, 6)));
        for (const r of rockList) if (vis(r.x, r.y, r.r * 1.6)) GH.rock(g, r.x, r.y, r.r, r.h, r.moss);
        GH.grassClumps(g, tuftHD.filter((c) => vis(c.x, c.y, 9)));
        GH.flowers(g, wildFlowers.filter((f) => vis(f.x, f.y, 4)));
      } else {
        for (const r of rockList) if (vis(r.x, r.y, 4)) NAT.pebble(g, r.x, r.y, r.r / 2.2, r.moss ? '#8f9784' : '#a49e90');
        for (const t of tuftList) if (vis(t.x, t.y, 7)) NAT.tuft(g, t.x, t.y, t.s, t.col, t.tip);
        for (const f of wildFlowers) if (vis(f.x, f.y, 2)) { g.fillStyle = f.col; g.fillRect(f.x - 0.6, f.y - 1.4, 1.2, 1.2); }
      }
      for (let k = 0; k < meadows; k++) {
        const ci = T_MIN + hashInt(k, 71, sd) * T_W; const cj = T_MIN + hashInt(k, 72, sd) * T_W;
        if (!gvis(ci, cj, 80) || !okGround(ci, cj) || fAt(ci, cj) > 0.35) continue;
        const col = FLOWERS[k % FLOWERS.length]; const col2 = FLOWERS[(k + 3) % FLOWERS.length];
        const n = 6 + Math.floor(hashInt(k, 73, sd) * 12);
        const batch = [];
        for (let q = 0; q < n; q++) {
          const a = hashInt(k, 80 + q, sd) * Math.PI * 2; const d = Math.sqrt(hashInt(k, 120 + q, sd)) * 1.1;
          const i = ci + Math.cos(a) * d; const j = cj + Math.sin(a) * d;
          if (!okGround(i, j)) continue;
          const p = toWorld(i, j);
          if (!vis(p.x, p.y, 4)) continue;
          if (S) batch.push({ x: p.x, y: p.y, col: q % 4 === 0 ? col2 : col, s: 1.1, h: hashInt(k, 160 + q, sd) });
          else NAT.flower(g, p.x, p.y, q % 4 === 0 ? col2 : col);
        }
        if (S) GH.flowers(g, batch);
      }
      for (let k = 0; k < (FX.LOW_POWER ? 160 : 300); k++) {
        const i = T_MIN + hashInt(k, 91, sd) * T_W; const j = T_MIN + hashInt(k, 92, sd) * T_W;
        const p = toWorld(i, j);
        if (!vis(p.x, p.y, 4) || !okGround(i, j)) continue;
        NAT.pebble(g, p.x, p.y, 0.45 + hashInt(k, 93, sd) * 0.6, hashInt(k, 94, sd) < 0.5 ? '#9c978b' : '#b3ad9f');
      }
      // bosbodem: gevallen blad, varens, struikjes, paddenstoelen en een omgevallen stam
      for (let j = T_MIN; j < T_MAX; j++) {
        for (let i = T_MIN; i < T_MAX; i++) {
          if (terr.tiles[tileIndex(i, j)] !== TILE.FOREST || ringOf(i, j) === 0 || onRoad(i + 0.5, j + 0.5)) continue;
          if (!gvis(i + 0.5, j + 0.5, 48)) continue;
          for (let q = 0; q < 7; q++) {
            const p = toWorld(i + hashInt(i * 7 + q, j, sd + 101), j + hashInt(i, j * 7 + q, sd + 102));
            g.fillStyle = LEAVES[q % 4]; g.beginPath(); g.ellipse(p.x, p.y, 1.4, 0.7, q, 0, Math.PI * 2); g.fill();
          }
          const r1 = hashInt(i, j, sd + 103); const r2 = hashInt(i, j, sd + 104); const r3 = hashInt(i, j, sd + 105);
          if (r1 < 0.6) {
            const p = toWorld(i + 0.2 + r2 * 0.6, j + 0.2 + r3 * 0.6);
            if (S) GH.fern(g, p.x, p.y, 0.8 + r3 * 0.5, r2 < 0.5 ? '#4f8f34' : '#62a03e', r1); else NAT.fern(g, p.x, p.y, 0.8 + r3 * 0.5, r2 < 0.5 ? '#3f7a2c' : '#4f8a34');
          }
          if (r2 < 0.3) {
            const p = toWorld(i + 0.15 + r3 * 0.7, j + 0.6 * r1 + 0.2);
            if (S) GH.shrub(g, p.x, p.y, 0.7 + r1 * 0.5, r3 < 0.5 ? '#86c050' : '#97c85a', '#2f5e22', r2); else NAT.shrub(g, p.x, p.y, 0.7 + r1 * 0.5, r3 < 0.5 ? '#6faa44' : '#7fb84a', '#3a6e28');
          }
          if (r3 < 0.06) { const p = toWorld(i + 0.5, j + 0.6); NAT.mushroom(g, p.x, p.y, 1); NAT.mushroom(g, p.x + 3, p.y + 1, 0.75); }
          if (r3 > 0.975) { const p = toWorld(i + 0.5, j + 0.5); NAT.log(g, p.x, p.y, 0.9); }
        }
      }
      // riet en waterlelies bij de meertjes
      for (const [x, y] of lakes) {
        if (!gvis(x, y, 60)) continue;
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
      // riet rond de vijver
      for (let k = 0; k < 34; k++) {
        const a = hashInt(k, 9, sd) * Math.PI * 2;
        const rr = pd.r * (0.95 + hashInt(k, 10, sd) * 0.25);
        const p = toWorld(pd.x + Math.cos(a) * rr, pd.y + Math.sin(a) * rr * 0.8);
        if (!vis(p.x, p.y, 14)) continue;
        g.strokeStyle = k % 2 ? '#4f7d2c' : '#6a9a3a'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 1.5, p.y - 9); g.moveTo(p.x + 2, p.y); g.lineTo(p.x + 3, p.y - 7); g.moveTo(p.x - 1, p.y); g.lineTo(p.x - 4, p.y - 6); g.stroke();
        if (k % 3 === 0) { g.fillStyle = '#6b4523'; g.fillRect(p.x - 2.3, p.y - 12, 2, 4.5); }
      }
      // kiezels op de oever van de vijver
      for (let k = 0; k < 60; k++) {
        const a = hashInt(k, 801, sd) * Math.PI * 2;
        const rr = pd.r + 0.18 + hashInt(k, 802, sd) * 0.32;
        const p = toWorld(pd.x + Math.cos(a) * rr * Math.cos(0.4) - Math.sin(a) * rr * 0.8 * Math.sin(0.4), pd.y + Math.cos(a) * rr * Math.sin(0.4) + Math.sin(a) * rr * 0.8 * Math.cos(0.4));
        if (!vis(p.x, p.y, 4)) continue;
        if (S) GH.rock(g, p.x, p.y, 0.8 + hashInt(k, 803, sd) * 1.1, hashInt(k, 804, sd), false);
        else NAT.pebble(g, p.x, p.y, 0.5, '#a9a291');
      }
    };

    // de gebakken grond (uitgezoomd)
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * BAKE); cv.height = Math.round(H * BAKE);
    const g = cv.getContext('2d');
    g.setTransform(BAKE, 0, 0, BAKE, -this.groundOrigin.x * BAKE, -this.groundOrigin.y * BAKE);
    this.paintGround(g, { x0: this.groundOrigin.x, y0: this.groundOrigin.y, x1: this.groundOrigin.x + W, y1: this.groundOrigin.y + H }, 0);
    this.ground = { cv, W, H };
    this.groundComp = null;
    if (this.hdg) this.hdg.clear();

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

  // meertjes in de wildernis met vloeiende oevers: een zacht 'metaball'-veld rond de watertegels,
  // met zandrand, schuimlijn, ondiep en diep water. Geeft [beeld, x, y, breedte, hoogte] in tegelruimte.
  // Meren in een scherp stuk: het diepte-beeld (zacht, bilineair vergroot) per pixel omzetten naar kleur. Omdat de diepte
  // glad verloopt, worden de randen (zand, schuim, ondiep, diep) haarscherp op elke resolutie.
  lakeHD(g, L) {
    const T = g.getTransform();
    const [x0, y0, x1, y1] = L.box;
    let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity;
    for (const [gx, gy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const w = toWorld(gx, gy);
      const dx = T.a * w.x + T.c * w.y + T.e; const dy = T.b * w.x + T.d * w.y + T.f;
      bx0 = Math.min(bx0, dx); by0 = Math.min(by0, dy); bx1 = Math.max(bx1, dx); by1 = Math.max(by1, dy);
    }
    const cw = g.canvas.width; const ch = g.canvas.height;
    const bx = Math.max(0, Math.floor(bx0)); const by = Math.max(0, Math.floor(by0));
    const bw = Math.min(cw, Math.ceil(bx1)) - bx; const bh = Math.min(ch, Math.ceil(by1)) - by;
    if (bw <= 0 || bh <= 0) return;
    if (!this.lakeTmp) this.lakeTmp = document.createElement('canvas');
    const tmp = this.lakeTmp;
    if (tmp.width < cw || tmp.height < ch) { tmp.width = cw; tmp.height = ch; }
    const t = tmp.getContext('2d', { willReadFrequently: true });
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, tmp.width, tmp.height);
    t.setTransform(T); t.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
    const [, ix, iy, iw, ih] = L.img;
    t.drawImage(L.field, ix, iy, iw, ih);
    const id = t.getImageData(bx, by, bw, bh);
    const d = id.data;
    const lut = lakeLUT();
    // golfjes: dunne, lichte, golvende lijnen in wereldcoördinaten (lopen naadloos door over de stukken)
    const ia = 1 / T.a;
    for (let i = 0, k = 0; i < d.length; i += 4, k++) {
      if (d[i + 3] === 0) continue;
      const v = d[i];
      const o = v * 4;
      const a = lut[o + 3];
      if (!a) { d[i + 3] = 0; continue; }
      let r = lut[o]; let gg = lut[o + 1]; let b = lut[o + 2];
      if (a === 255) {
        const n = ((((k * 2654435761) >>> 27) - 16) * 0.25); // fijne ruis
        r += n; gg += n; b += n;
        if (v > 100) {
          const px = bx + (k % bw); const py = by + ((k / bw) | 0);
          const wx = (px - T.e) * ia; const wy = (py - T.f) * ia;
          const w = Math.sin(wx * 0.11 + wy * 0.42 + Math.sin(wx * 0.045 + wy * 0.03) * 2.6);
          if (w > 0.9) { const l = (w - 0.9) * 140; r += l; gg += l; b += l * 0.8; }
          else if (w < -0.95) { const l = (-0.95 - w) * 160; r -= l; gg -= l; b -= l * 0.6; }
        }
      }
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
    }
    t.putImageData(id, bx, by);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(tmp, bx, by, bw, bh, bx, by, bw, bh);
    g.restore();
  }

  lakeImage(lakes, sd) {
    const RS = FX.LOW_POWER ? 10 : 14; // pixels per tegel
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const [x, y] of lakes) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 = Math.floor(x0 - 2); y0 = Math.floor(y0 - 2); x1 = Math.ceil(x1 + 2); y1 = Math.ceil(y1 + 2);
    const TWd = x1 - x0; const THd = y1 - y0;
    const W = TWd * RS; const H = THd * RS;
    const near = new Map();
    for (const [x, y] of lakes) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const k = (Math.floor(y) + dy - y0) * TWd + (Math.floor(x) + dx - x0);
        if (!near.has(k)) near.set(k, []);
        near.get(k).push(x, y);
      }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const img = c.createImageData(W, H);
    const d = img.data;
    // tweede beeld: de 'diepte' f zelf (grijswaarde), voor scherpe meren in de HD-stukken (zie lakeHD)
    const fcv = document.createElement('canvas');
    fcv.width = W; fcv.height = H;
    const fc = fcv.getContext('2d');
    const fimg = fc.createImageData(W, H);
    const fd = fimg.data;
    for (let i = 3; i < fd.length; i += 4) fd[i] = 255;
    const R2 = 1.3 * 1.3;
    const ramp = (f, a, b) => Math.min(1, Math.max(0, (f - a) / (b - a)));
    for (let v = 0; v < H; v++) {
      for (let u = 0; u < W; u++) {
        const gx = x0 + (u + 0.5) / RS; const gy = y0 + (v + 0.5) / RS;
        const list = near.get(Math.floor(gy - y0) * TWd + Math.floor(gx - x0));
        if (!list) continue;
        let f = 0;
        for (let k = 0; k < list.length; k += 2) {
          const q = 1 - ((gx - list[k]) ** 2 + (gy - list[k + 1]) ** 2) / R2;
          if (q > 0) f += q * q;
        }
        f += (fbm(gx * 0.8, gy * 0.8, sd + 141, 2) - 0.5) * 0.5 + (fbm(gx * 2.6, gy * 2.6, sd + 142, 2) - 0.5) * 0.14;
        { const fv = Math.max(0, Math.min(255, Math.round((f / 1.6) * 255))); const fo = (v * W + u) * 4; fd[fo] = fv; fd[fo + 1] = fv; fd[fo + 2] = fv; }
        if (f < 0.22) continue;
        const o = (v * W + u) * 4;
        let r; let gg; let b; let a;
        if (f < 0.4) { // zandrand
          const t = ramp(f, 0.22, 0.3);
          r = 210; gg = 192; b = 138; a = t * (f < 0.34 ? 0.75 : 0.95);
          if (f > 0.34) { r = 186; gg = 166; b = 112; }
        } else if (f < 0.46) { r = 236; gg = 244; b = 246; a = 0.9; } // schuim
        else {
          const dpt = ramp(f, 0.46, 1.5);
          r = 96 - dpt * 52; gg = 168 - dpt * 52; b = 206 - dpt * 22; a = 1;
          const n = (hashInt(u, v, sd + 7) - 0.5) * 8 + (fbm(gx * 3, gy * 6, sd + 143, 2) - 0.5) * 22;
          r += n * 0.5; gg += n * 0.7; b += n;
          if (f < 0.6) { const t = 1 - ramp(f, 0.46, 0.6); r += (130 - r) * t * 0.5; gg += (205 - gg) * t * 0.5; b += (215 - b) * t * 0.5; }
        }
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = a * 255;
      }
    }
    c.putImageData(img, 0, 0);
    fc.putImageData(fimg, 0, 0);
    return { img: [cv, x0, y0, TWd, THd], field: fcv, box: [x0, y0, x1, y1] };
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
        let tg;
        if (w.job === 'idle') {
          tg = { gx: N / 2 + (Math.random() - 0.5) * 4, gy: N / 2 + 1.5 + Math.random() * 2 };
        } else if (w.phase === 'out') {
          const ts = this.jobTargets(w.job);
          const t0 = ts[Math.floor(Math.random() * ts.length)];
          tg = { gx: t0.gx + (Math.random() - 0.5) * 0.4, gy: t0.gy + (Math.random() - 0.5) * 0.4 };
        } else {
          tg = { gx: door.gx + (Math.random() - 0.5) * 0.8, gy: door.gy + Math.random() * 0.3 };
        }
        // rond water en muren; in een ommuurde stad via de poort naar buiten en weer binnen
        const q = routeTo(this.state, { x: w.gx, y: w.gy }, { x: tg.gx, y: tg.gy }).map((p) => ({ gx: p.x, gy: p.y }));
        w.target = q.shift() || tg; w.queue = q.length ? q : null;
      }
      const dx = w.target.gx - w.gx; const dy = w.target.gy - w.gy;
      const d = Math.hypot(dx, dy);
      const sp = 0.0009 * dt;
      if (d <= sp) {
        w.gx = w.target.gx; w.gy = w.target.gy; w.target = null;
        if (w.queue && w.queue.length) { w.target = w.queue.shift(); continue; } // tussenstop aan de poort
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
    const order = ['elephant', 'chariot', 'camel', 'yabusame', 'knight', 'rider', 'samurai', 'hoplite', 'lionguard', 'immortal', 'sword', 'spear', 'peltast', 'archer', 'scout', 'stonethrower', 'ram'];
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

  // uitzicht van de eigen troepen (smidse en Academie), even bewaard
  troopLook() {
    const st = this.state;
    const k = `${bLevel(st, 'smithy')}|${Object.keys(st.tech || {}).join(',')}`;
    if (this._lookKey !== k) { this._lookKey = k; this._look = lookOf(bLevel(st, 'smithy'), st.tech); }
    return this._look;
  }

  // welke soorten onderzoek er klaar zijn (voor het uitzicht van de Academie)
  academyVariant() {
    const t = this.state.tech || {};
    return (techTier(t, 'inf') ? 1 : 0) | (techTier(t, 'rng') ? 2 : 0) | (techTier(t, 'cav') ? 4 : 0) | (techTier(t, 'town') ? 8 : 0);
  }

  drawSoldier(ctx, s, x, y, t) {
    const team = this.team;
    const bob = s.walking ? 0 : Math.sin(t * 0.004 + s.gx * 3 + s.gy * 5) * 0.3;
    const o = { s: 1.05, team, phase: t * 0.012, walking: !!s.walking, attack: s.attack };
    const sl = this.sel;
    if (sl && !s.walking && ((sl.type === 'soldier' && sl.kind === s.kind && Math.abs(sl.gx - s.gx) < 0.01 && Math.abs(sl.gy - s.gy) < 0.01)
      || ((sl.type === 'soldiers' || sl.type === 'kind') && sl.kind === s.kind) || sl.type === 'army')) {
      ctx.strokeStyle = 'rgba(255,225,90,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, 9, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (s.kind === 'stonethrower') { A.stoneThrower(ctx, x, y, 0.8, t); return; }
    if (FIG.uniqueUnit(ctx, s.kind, x, y + bob, o)) return;
    if (s.kind === 'ram') { A.ram(ctx, x, y, 0.9); return; }
    // uitrusting volgens de smidse en het onderzoek van de Academie
    const look = soldierOpts(s.kind, this.troopLook());
    if (look && look.fig === 'h') A.horseman(ctx, x, y, { ...look, team, walking: o.walking, phase: o.phase, attack: o.attack });
    else if (look) A.person(ctx, x, y + bob, { ...o, ...look });
    else A.person(ctx, x, y, o);
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
      if (!A.prop3d(ctx, 'tree', 1, p.x - 3, p.y, 1.1)) { const spr = this.treeSpr(1); ctx.drawImage(spr.cv, p.x - 3 - spr.ax * 1.1, p.y - spr.ay * 1.1, spr.w * 1.1, spr.h * 1.1); }
      // stapeltje brandhout
      if (!A.prop3d(ctx, 'woodpile', 0, p.x + 10, p.y + 3, 1.1)) for (let i = 0; i < 3; i++) {
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
      if (A.prop3d(ctx, 'gold', n.id % 8, p.x - 1, p.y + 3, 1.6)) A.prop3d(ctx, 'gold', (n.id + 3) % 8, p.x + 9, p.y + 5, 0.9);
      else {
        A.rock(ctx, p.x - 3, p.y + 2, 2.3);
        A.rock(ctx, p.x + 9, p.y + 4, 1.5);
        ctx.fillStyle = '#f2c230';
        for (const [dx, dy, r] of [[-7, -7, 1.9], [-1, -10, 1.5], [4, -5, 1.7], [9, 1, 1.2]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2); ctx.fill(); }
      }
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

  // muurstukken uit de muurtegels: een paal per tegel en een stuk muur naar elke buur; poorten als poortgebouw
  wallSegments(level) {
    const s = this.state;
    const list = s.walls || []; const gl = s.gates || [];
    if (!list.length && !gl.length) return [];
    const key = `${list.length}:${list[0]}:${list[list.length - 1]}|${gl.join(',')}`;
    if (this.wallCache && this.wallCache.key === key) return this.wallCache.segs;
    const set = new Set([...list, ...gl]); const gates = new Set(gl);
    const segs = [];
    const th = 0.09; const pw = 0.14; const gt = 0.34; // gt: afstand van het midden van de poort tot een poorttoren
    for (const idx of list) {
      const { i, j } = tileOf(idx);
      const cx = i + 0.5; const cy = j + 0.5;
      const has = (a, b) => set.has(tileIndex(a, b));
      const isG = (a, b) => gates.has(tileIndex(a, b));
      const e = has(i + 1, j); const so = has(i, j + 1); const w = has(i - 1, j); const n = has(i, j - 1);
      if (e) segs.push({ x0: cx, y0: cy - th, x1: cx + 1 - (isG(i + 1, j) ? gt : 0), y1: cy + th });
      if (so) segs.push({ x0: cx - th, y0: cy, x1: cx + th, y1: cy + 1 - (isG(i, j + 1) ? gt : 0) });
      if (w && isG(i - 1, j)) segs.push({ x0: cx - 1 + gt, y0: cy - th, x1: cx, y1: cy + th });
      if (n && isG(i, j - 1)) segs.push({ x0: cx - th, y0: cy - 1 + gt, x1: cx + th, y1: cy });
      if (!e && !so && !w && !n) segs.push({ x0: cx - 0.36, y0: cy - th, x1: cx + 0.36, y1: cy + th });
      const corner = (e || w) && (n || so);
      const end = (e ? 1 : 0) + (w ? 1 : 0) + (n ? 1 : 0) + (so ? 1 : 0) <= 1;
      if (corner || end || (i + j) % 4 === 0) segs.push({ x0: cx - pw, y0: cy - pw, x1: cx + pw, y1: cy + pw, tower: true, gate: (corner || end) && (i * 7 + j * 3) % 3 === 0 });
    }
    // poorten (2 tegels breed; oude poorten 1 tegel): één stuk met een toren aan elke kant
    for (const g of gateList(s)) {
      const [a, b] = [g.tiles[0], g.tiles[g.tiles.length - 1]];
      segs.push({ gateTile: true, idx: g.idx, i: a[0], j: a[1], ax: g.ax, cx: g.cx, cy: g.cy, w: g.w, x0: a[0] + 0.1, y0: a[1] + 0.1, x1: b[0] + 0.9, y1: b[1] + 0.9 });
    }
    this.wallCache = { key, segs };
    return segs;
  }

  // poort: open zolang er troepen vlakbij zijn (zacht open en dicht)
  gateOpenness(seg, now) {
    if (!this.gateOpen) this.gateOpen = new Map();
    const cx = seg.cx; const cy = seg.cy;
    let near = false;
    for (const g of this.state.field || []) {
      const p = groupPos(g, now);
      if (Math.hypot(p.x - cx, p.y - cy) < 1.5) { near = true; break; }
    }
    if (!near) for (const w of this.walkers) if (Math.hypot(w.gx - cx, w.gy - cy) < 1.1) { near = true; break; }
    const tnow = performance.now();
    const st = this.gateOpen.get(seg.idx) || { v: 0, at: tnow };
    const dt = Math.min(200, tnow - st.at);
    st.v = near ? Math.min(1, st.v + dt / 450) : Math.max(0, st.v - dt / 700);
    st.at = tnow;
    this.gateOpen.set(seg.idx, st);
    return st.v * st.v * (3 - 2 * st.v);
  }

  drawGate(ctx, seg, level) {
    const stone = level >= 3;
    const cx = seg.cx; const cy = seg.cy;
    const wide = (seg.w || 1) >= 2;
    const gt = wide ? 0.84 : 0.34; const tw = wide ? 0.17 : 0.15; // afstand van het midden tot een poorttoren
    const along = seg.ax === 'x'; // muur loopt langs x: torens links en rechts, doorgang langs y
    const th = stone ? 36 + level * 3 : 30;
    const hDoor = stone ? 20 : 18;
    const wallC = stone ? (level >= 5 ? '#d3cbb8' : '#b9b1a1') : '#9a6a38';
    const capC = stone ? '#a39a89' : '#7a5129';
    const t1 = along ? { x: cx - gt, y: cy } : { x: cx, y: cy - gt };
    const t2 = along ? { x: cx + gt, y: cy } : { x: cx, y: cy + gt };
    const open = this.gateOpenness(seg, this.now);
    const tower = (c, p) => {
      A.box(c, p.x - tw, p.y - tw, p.x + tw, p.y + tw, 0, th, wallC);
      A.box(c, p.x - tw - 0.03, p.y - tw - 0.03, p.x + tw + 0.03, p.y + tw + 0.03, th, th + 4, capC);
      if (!stone) {
        const [px, py] = A.P(p.x, p.y, th + 4);
        c.fillStyle = '#b07d45'; c.beginPath(); c.moveTo(px - 6, py + 2); c.lineTo(px, py - 8); c.lineTo(px + 6, py + 2); c.closePath(); c.fill();
      }
    };
    // achterste toren eerst (verder weg in de isometrie); torens en boog als afbeelding (enkel de deuren bewegen)
    const [back, front] = t1.x + t1.y <= t2.x + t2.y ? [t1, t2] : [t2, t1];
    const t3 = (p) => S3.getWall({ x0: p.x - tw, y0: p.y - tw, x1: p.x + tw, y1: p.y + tw, tower: true }, level, th, this.treeNeed);
    const tb = t3(back); const tf = t3(front);
    const use3d = tb && tf;
    if (use3d) { const w = toWorld(back.x, back.y); A.drawSprite(ctx, tb, w.x, w.y, 1); }
    else this.gatePart(ctx, seg, level, 'b', th + 10, (c) => tower(c, back));
    // deurvleugels: scharnier bij de torens, draaien naar binnen open
    const leaf = (hinge, toward) => {
      const L = gt - tw;
      const ang = open * 1.35;
      const dx = toward.x - hinge.x; const dy = toward.y - hinge.y; const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl; const uy = dy / dl; // langs de muur
      const px = along ? 0 : 1; const py = along ? 1 : 0; // dwars op de muur (de doorgang)
      const ex = hinge.x + (ux * Math.cos(ang) + px * Math.sin(ang)) * L;
      const ey = hinge.y + (uy * Math.cos(ang) + py * Math.sin(ang)) * L;
      const a = A.P(hinge.x, hinge.y, 0); const b = A.P(ex, ey, 0); const c = A.P(ex, ey, hDoor); const d = A.P(hinge.x, hinge.y, hDoor);
      ctx.fillStyle = stone ? '#6b4524' : '#7a5129';
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,25,10,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
      // ijzeren banden
      ctx.strokeStyle = '#3b3733'; ctx.lineWidth = 1.2;
      for (const f of [0.3, 0.72]) {
        const z = hDoor * f;
        const p1 = A.P(hinge.x, hinge.y, z); const p2 = A.P(ex, ey, z);
        ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke();
      }
    };
    const hinge1 = along ? { x: t1.x + tw, y: cy } : { x: cx, y: t1.y + tw };
    const hinge2 = along ? { x: t2.x - tw, y: cy } : { x: cx, y: t2.y - tw };
    leaf(hinge1, { x: cx, y: cy });
    leaf(hinge2, { x: cx, y: cy });
    // boog boven de doorgang, dan de voorste toren
    const lintel = (c) => {
      if (along) A.box(c, t1.x + tw, cy - 0.08, t2.x - tw, cy + 0.08, hDoor, hDoor + 8, wallC);
      else A.box(c, cx - 0.08, t1.y + tw, cx + 0.08, t2.y - tw, hDoor, hDoor + 8, wallC);
    };
    if (use3d) {
      this.gatePart(ctx, seg, level, 'l', th + 10, lintel);
      const w = toWorld(front.x, front.y); A.drawSprite(ctx, tf, w.x, w.y, 1);
    } else {
      this.gatePart(ctx, seg, level, 'f', th + 10, (c) => { lintel(c); tower(c, front); });
    }
    // vlag bovenop
    const top = A.P(cx, cy, hDoor + 8);
    A.flag(ctx, top[0], top[1], 16, this.team || '#c0392b', performance.now(), 0.7);
  }

  // vaste stukken van een poort (torens, boog) één keer tekenen en daarna als afbeelding hergebruiken
  gatePart(ctx, seg, level, which, top, draw) {
    const Q = spriteQ(this.treeNeed);
    if (!this.gateSprites || this.gateSprites.level !== level || this.gateSprites.q !== Q) this.gateSprites = { level, q: Q, map: new Map() };
    const key = `${seg.cx},${seg.cy},${seg.ax},${seg.w || 1},${which}`;
    let spr = this.gateSprites.map.get(key);
    if (!spr) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const gx of [seg.cx - 1.25, seg.cx + 1.25]) {
        for (const gy of [seg.cy - 1.25, seg.cy + 1.25]) {
          for (const z of [0, top]) { const [px, py] = A.P(gx, gy, z); x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
        }
      }
      x0 = Math.floor(x0 - 3); y0 = Math.floor(y0 - 3); x1 = Math.ceil(x1 + 3); y1 = Math.ceil(y1 + 3);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((x1 - x0) * Q)); cv.height = Math.max(1, Math.round((y1 - y0) * Q));
      const c = cv.getContext('2d');
      c.scale(Q, Q); c.translate(-x0, -y0);
      draw(c);
      spr = { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      this.gateSprites.map.set(key, spr);
    }
    ctx.drawImage(spr.cv, spr.x, spr.y, spr.w, spr.h);
  }

  wallHeight(seg, level) {
    const stone = level >= 3;
    return seg.tower ? (stone ? 30 + level * 3 : 26) : (stone ? 16 + level * 2 : 15);
  }

  // muurstukken één keer tekenen en daarna als afbeelding hergebruiken (stenen textuur is duur)
  drawWallPiece(ctx, seg, level) {
    if (seg.gateTile) { this.drawGate(ctx, seg, Math.max(1, level)); return; }
    const w3 = S3.getWall(seg, level, this.wallHeight(seg, level), this.treeNeed);
    if (w3) {
      const c = toWorld((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2);
      A.drawSprite(ctx, w3, c.x, c.y, 1);
      if (seg.gate) this.drawTorch(ctx, seg, level);
      return;
    }
    const Q = spriteQ(this.treeNeed);
    if (!this.wallSprites || this.wallSprites.level !== level || this.wallSprites.q !== Q) this.wallSprites = { level, q: Q, map: new Map() };
    const key = `${seg.x0},${seg.y0},${seg.x1},${seg.y1},${seg.tower ? 1 : 0}${seg.gate ? 1 : 0}`;
    let spr = this.wallSprites.map.get(key);
    if (!spr) {
      const top = this.wallHeight(seg, level) + 14;
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const gx of [seg.x0 - 0.05, seg.x1 + 0.05]) {
        for (const gy of [seg.y0 - 0.05, seg.y1 + 0.05]) {
          for (const z of [0, top]) { const [px, py] = A.P(gx, gy, z); x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
        }
      }
      x0 = Math.floor(x0 - 3); y0 = Math.floor(y0 - 3); x1 = Math.ceil(x1 + 3); y1 = Math.ceil(y1 + 3);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((x1 - x0) * Q)); cv.height = Math.max(1, Math.round((y1 - y0) * Q));
      const c = cv.getContext('2d');
      c.scale(Q, Q); c.translate(-x0, -y0);
      this.drawWallPieceRaw(c, seg, level);
      spr = { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      this.wallSprites.map.set(key, spr);
    }
    ctx.drawImage(spr.cv, spr.x, spr.y, spr.w, spr.h);
  }

  // fakkel op een muurtoren (bij 3D-muren apart getekend)
  drawTorch(ctx, seg, level) {
    const h = this.wallHeight(seg, level) + (level >= 3 ? 4 : 3);
    const [px, py] = A.P((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2, h);
    ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, py + 2); ctx.lineTo(px, py - 5); ctx.stroke();
    ctx.fillStyle = '#ff9d2e'; ctx.beginPath(); ctx.ellipse(px, py - 7, 1.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(px, py - 6.5, 0.9, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawWallPieceRaw(ctx, seg, level) {
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

  // het beeld dat drawBuilding voor dit gebouw tekent, met de schaal (null voor steigers)
  buildingImage(b) {
    if (b.level === 0) return null;
    const s3 = S3.get(b.type, b.level, this.state.civ, b.id, b.type === 'academy' ? this.academyVariant() : null, this.treeNeed);
    if (s3) return { spr: s3, sc: 1 };
    return { spr: A.buildingSprite(b.type, b.level, this.team, this.state.civ, b.id, S3.has(b.type) ? 0 : this.treeNeed * bScale(b)), sc: bScale(b) };
  }

  // raakt het punt (wereldpixels) het getekende gebouw? Kijkt naar de doorzichtigheid van het beeld rond dat punt.
  hitsBuilding(b, w) {
    const size = BUILDINGS[b.type].size;
    const c = toWorld(b.x + size / 2, b.y + size / 2);
    const im = this.buildingImage(b);
    if (!im) return Math.abs(w.x - c.x) < size * 22 && w.y < c.y + 6 && w.y > c.y - 30;
    const { spr, sc } = im;
    const x0 = c.x - spr.ax * sc; const y0 = c.y - spr.ay * sc;
    const R = 2.5; // marge in wereldpixels: dunne torens en palen blijven raak te tikken
    if (w.x < x0 - R || w.y < y0 - R || w.x > x0 + spr.w * sc + R || w.y > y0 + spr.h * sc + R) return false;
    const cv = spr.cv; const kx = cv.width / (spr.w * sc); const ky = cv.height / (spr.h * sc);
    if (!this.pickCv) { this.pickCv = document.createElement('canvas'); this.pickCv.width = 8; this.pickCv.height = 8; this.pickCtx = this.pickCv.getContext('2d', { willReadFrequently: true }); }
    const g = this.pickCtx;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 8, 8);
    try { g.drawImage(cv, (w.x - R - x0) * kx, (w.y - R - y0) * ky, 2 * R * kx, 2 * R * ky, 0, 0, 8, 8); } catch { return true; }
    const d = g.getImageData(0, 0, 8, 8).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 165) return true; // slagschaduw op de grond (hooguit 60% dekking) telt niet
    return false;
  }

  // alle gebouwen onder dit punt, het voorste eerst (zelfde volgorde als het tekenen)
  buildingsAt(sx, sy) {
    const s = this.state;
    const w = this.cam.screenToWorld(sx, sy); const g = toGrid(w.x, w.y);
    const out = [];
    s.buildings.forEach((b, k) => {
      if (!isPlaced(b) || b.hide) return;
      const size = BUILDINGS[b.type].size;
      const foot = g.gx >= b.x && g.gx < b.x + size && g.gy >= b.y && g.gy < b.y + size;
      if (foot || this.hitsBuilding(b, w)) out.push({ b, d: b.x + b.y + size, k });
    });
    out.sort((a, b) => b.d - a.d || b.k - a.k);
    return out.map((o) => o.b);
  }

  pick(sx, sy) {
    const s = this.state;
    if (!s) return null;
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    const hits = this.buildingsAt(sx, sy);
    if (hits.length) {
      // staat het gekozen (of net nog gekozen) gebouw op deze plek, dan kiest een nieuwe tik het gebouw erachter, en zo rond.
      // 'Net nog' = zelfde plek binnen 8 s, ook als het paneel intussen dicht ging (gsm).
      const last = this.lastPick; const tnow = performance.now();
      const ref = hits.some((b) => b.id === this.selected) ? this.selected
        : last && tnow - last.t < 8000 && Math.hypot(sx - last.sx, sy - last.sy) < 24 ? last.id : null;
      const k = hits.findIndex((b) => b.id === ref);
      const b = k >= 0 ? hits[(k + 1) % hits.length] : hits[0];
      this.lastPick = { sx, sy, t: tnow, id: b.id };
      this.pickStack = hits.length > 1 ? hits.map((x) => x.id) : null;
      if (hits.length > 1 && k < 0) this.hintBehind();
      return b;
    }
    this.pickStack = null;
    // een muurtegel aanklikken = het muurpaneel
    const wall = s.buildings.find((b) => b.type === 'wall');
    if (wall && ((s.walls || []).length || (s.gates || []).length)) {
      const set = wallSet(s);
      for (const [dx, dy] of [[0, 0], [0, 0.35], [0.35, 0], [0.35, 0.35]]) {
        const i = Math.floor(g.gx + dx); const j = Math.floor(g.gy + dy);
        if (i >= T_MIN && j >= T_MIN && i < T_MAX && j < T_MAX && set.has(tileIndex(i, j))) {
          this.pickedWall = { i, j, gate: (s.gates || []).includes(tileIndex(i, j)) };
          return wall;
        }
      }
    }
    return null;
  }

  // eenmalige tip (hooguit 3 keer per toestel) wanneer er op de getikte plek meer dan één gebouw staat
  hintBehind() {
    let n = 0;
    try { n = Number(localStorage.getItem('rvdv-hint-behind')) || 0; } catch { /* geen opslag */ }
    if (n >= 3 || this.hintShown) return;
    this.hintShown = true;
    try { localStorage.setItem('rvdv-hint-behind', String(n + 1)); } catch { /* geen opslag */ }
    if (this.onNotice) this.onNotice('Hier staan meer gebouwen: tik nog eens, of kies bij "Ook op deze plek".', 'magnifier');
  }

  click(sx, sy, e, order) {
    if (!this.state) return;
    if (this.moveB) {
      // muis: klikken zet het gebouw meteen neer; aanraken: het gebouw gaat naar die plek (bevestigen met 'Zet hier')
      if (order) { this.cancelMove(); return; }
      this.moveB.gdx = 0; this.moveB.gdy = 0;
      this.updateMove(sx, sy);
      if (this.cam.lastType === 'mouse') this.dropMove();
      return;
    }
    const w = this.cam.screenToWorld(sx, sy);
    const tnow = performance.now();
    const dbl = !order && this.lastTap && tnow - this.lastTap.t < 420 && Math.hypot(sx - this.lastTap.x, sy - this.lastTap.y) < 28;
    this.lastTap = { t: tnow, x: sx, y: sy };
    if (this.landMode) {
      const g = toGrid(w.x, w.y);
      if (this.onBuyLot) this.onBuyLot(Math.floor(g.gx / LAND.size), Math.floor(g.gy / LAND.size));
      return;
    }
    if (this.gateMode) {
      const g = toGrid(w.x, w.y);
      if (this.onGate) this.onGate(Math.floor(g.gx), Math.floor(g.gy));
      return;
    }
    if (this.wallMode) {
      const g = toGrid(w.x, w.y);
      const tile = { i: Math.floor(g.gx), j: Math.floor(g.gy) };
      if (!this.wallStart) { this.wallStart = tile; return; }
      const tiles = this.wallLine(this.wallStart, tile);
      this.wallStart = null;
      if (this.onWalls) this.onWalls(tiles, this.wallMode === 'remove');
      return;
    }
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
      if (grp) {
        const kind = this.groupFigureAt(grp, w);
        if (dbl) this.selectKind(kind);
        else if (Object.values(grp.units).reduce((a, b) => a + b, 0) <= 1) this.setSel({ type: 'group', id: grp.id });
        else this.setSel({ type: 'unit', id: grp.id, kind });
        return;
      }
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
        if (v) { if (dbl) this.selectAllVillagers(v); else this.setSel({ type: 'walker', w: v }); return; }
        const so = this.pickSoldier(w);
        if (so) { if (dbl) this.selectKind(so.kind, so); else this.setSel({ type: 'soldier', kind: so.kind, gx: so.gx, gy: so.gy }); return; }
        const b = this.pick(sx, sy);
        if (b && b.type === 'tc' && ['group', 'unit', 'kind', 'army', 'groups'].includes(sel.type)) { this.issue(sel, null, { type: 'home' }); return; }
        if (b) { this.setSel(null); this.selected = b.id; this.selWall = b.type === 'wall' ? this.pickedWall : null; if (this.onSelect) this.onSelect(b); return; }
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
    this.pickedWall = null;
    const b = this.pick(sx, sy);
    this.selected = b ? b.id : null;
    this.selWall = b && b.type === 'wall' ? this.pickedWall : null;
    if (this.onSelect) this.onSelect(b);
  }

  // dubbelklik: alle troepen van die soort, thuis en in het veld
  selectKind(kind, at = null) {
    const s = this.state;
    const home = kind === 'villager' ? 0 : (s.units || {})[kind] || 0;
    const ids = (s.field || []).filter((g) => g.units[kind]).map((g) => g.id);
    const n = home + (s.field || []).reduce((a, g) => a + (g.units[kind] || 0), 0);
    if (!n) { this.setSel(null); return; }
    const d = tcDoor();
    this.setSel({ type: 'kind', kind, home, ids, n, gx: at ? at.gx : d.gx, gy: at ? at.gy : d.gy });
  }

  // ingedrukt houden: het hele leger (alle soldaten thuis en alle groepen soldaten in het veld)
  selectArmy() {
    const sel = this.armySel();
    this.setSel(sel);
    return !!sel;
  }

  armySel() {
    const s = this.state;
    const home = {};
    for (const k of ARMY_UNITS) if ((s.units || {})[k] > 0) home[k] = s.units[k];
    const ids = (s.field || []).filter((g) => !isVillagerGroup(g)).map((g) => g.id);
    const n = Object.values(home).reduce((a, b) => a + b, 0)
      + (s.field || []).filter((g) => ids.includes(g.id)).reduce((a, g) => a + Object.values(g.units).reduce((x, y) => x + y, 0), 0);
    return n ? { type: 'army', home, ids, n } : null;
  }

  // na een wijziging (training, sneuvelen, nieuwe groep) de selectie 'alle ...' bijwerken
  refreshMultiSel() {
    const sel = this.sel;
    const key = (x) => JSON.stringify([x.ids, x.n, x.home]);
    const before = key(sel);
    if (sel.type === 'kind') {
      const s = this.state;
      const home = sel.kind === 'villager' ? 0 : (s.units || {})[sel.kind] || 0;
      const ids = (s.field || []).filter((g) => g.units[sel.kind]).map((g) => g.id);
      const n = home + (s.field || []).reduce((a, g) => a + (g.units[sel.kind] || 0), 0);
      if (!n) { this.setSel(null); return; }
      Object.assign(sel, { home, ids, n });
    } else {
      const a = this.armySel();
      if (!a) { this.setSel(null); return; }
      Object.assign(sel, a);
    }
    if (key(sel) !== before && this.onSelChange) this.onSelChange(sel);
  }

  // ingedrukt houden = je hele leger kiezen
  longPress(sx, sy) {
    if (this.placing || this.landMode || this.wallMode || this.moveB || !this.state || this.battleMode) return false;
    if (!this.selectArmy()) return false;
    const w = this.cam.screenToWorld(sx, sy);
    this.pressMark = { x: w.x, y: w.y, at: performance.now() };
    if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* geen trilfunctie */ }
    return false;
  }

  // ---------- gebouw verplaatsen (knop Verplaatsen in het gebouwpaneel) ----------
  // Het gebouw staat eerst doorschijnend op zijn eigen plek. Tik (of klik) op de nieuwe plek, of sleep het gebouw zelf;
  // met een muis zet een klik het meteen neer, op een aanraakscherm bevestig je met 'Zet hier' (dropMove).
  startMove(b) {
    if (!b || b.type === 'tc' || !isPlaced(b)) return;
    this.setSel(null);
    this.selected = b.id;
    this.moveB = { id: b.id, size: BUILDINGS[b.type].size, x: b.x, y: b.y, ok: false, same: true, gdx: 0, gdy: 0, sx: null, sy: null, dragging: false };
    if (this.onMoveChange) this.onMoveChange(this.moveB);
  }

  // muurstukken (of een poort) verplaatsen: tiles = de tegels, (ai, aj) = het stuk waarop je tikte (ankerpunt)
  startWallMove(tiles, ai, aj, label) {
    if (!tiles || !tiles.length) return;
    this.setSel(null);
    this.selected = null;
    this.moveB = { kind: 'walls', tiles, ai, aj, label, size: 1, x: ai, y: aj, ok: false, same: true, gdx: 0, gdy: 0, sx: null, sy: null, dragging: false };
    if (this.onMoveChange) this.onMoveChange(this.moveB);
  }

  cancelMove() {
    if (!this.moveB) return;
    this.moveB = null;
    if (this.onMoveEnd) this.onMoveEnd();
  }

  updateMove(sx, sy) {
    const m = this.moveB;
    if (!m || !this.state) return;
    m.sx = sx; m.sy = sy;
    const w = this.cam.screenToWorld(sx + m.gdx, sy + m.gdy);
    const g = toGrid(w.x, w.y);
    const x = Math.floor(g.gx - m.size / 2 + 0.5); const y = Math.floor(g.gy - m.size / 2 + 0.5);
    const before = `${m.x},${m.y},${m.ok}`;
    m.x = x; m.y = y;
    if (m.kind === 'walls') {
      m.same = x === m.ai && y === m.aj;
      m.ok = !m.same && !checkMoveWalls(this.state, m.tiles, x - m.ai, y - m.aj);
    } else {
      const b = this.state.buildings.find((q) => q.id === m.id);
      if (!b) { this.cancelMove(); return; }
      m.same = b.x === x && b.y === y;
      m.ok = !m.same && !checkMove(this.state, m.id, x, y);
    }
    if (before !== `${m.x},${m.y},${m.ok}` && this.onMoveChange) this.onMoveChange(m);
  }

  // neerdrukken op het doorschijnende gebouw = het verslepen (in plaats van de kaart te verschuiven)
  grabMove(sx, sy) {
    const m = this.moveB;
    // met een muis volgt het gebouw de muis al en zet een klik het neer: niets vast te pakken
    if (!m || !this.state || this.cam.lastType === 'mouse') return false;
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    if (m.kind === 'walls') { // op een van de doorschijnende muurstukken
      const dx = m.x - m.ai; const dy = m.y - m.aj;
      const hit = m.tiles.some(([i, j]) => g.gx >= i + dx - 0.2 && g.gx < i + dx + 1.2 && g.gy >= j + dy - 0.2 && g.gy < j + dy + 1.2);
      if (!hit) return false;
      const c = toWorld(m.x + 0.5, m.y + 0.5); const sc = this.cam.worldToScreen(c.x, c.y);
      m.gdx = sc.x - sx; m.gdy = sc.y - sy;
      m.dragging = true;
      return true;
    }
    const c = toWorld(m.x + m.size / 2, m.y + m.size / 2);
    const b = this.state.buildings.find((q) => q.id === m.id);
    const h = b && b.level > 0 ? (SPRITE_H[b.type] || 55) : 30;
    const onFoot = g.gx >= m.x - 0.15 && g.gx < m.x + m.size + 0.15 && g.gy >= m.y - 0.15 && g.gy < m.y + m.size + 0.15;
    const onSprite = Math.abs(w.x - c.x) < m.size * 24 && w.y < c.y + 6 && w.y > c.y - h;
    if (!onFoot && !onSprite) return false;
    const sc = this.cam.worldToScreen(c.x, c.y);
    m.gdx = sc.x - sx; m.gdy = sc.y - sy;
    m.dragging = true;
    return true;
  }

  holdDrag(ph, sx, sy) {
    const m = this.moveB;
    if (!m) return;
    if (ph === 'move') this.updateMove(sx, sy);
    else { if (ph === 'end') this.updateMove(sx, sy); m.dragging = false; }
  }

  // neerzetten (enkel als de nieuwe plek mag); anders blijft de verplaatsstand open
  dropMove() {
    const m = this.moveB;
    if (!m) return;
    if (m.kind === 'walls') {
      if (!m.ok) {
        const why = m.same ? null : checkMoveWalls(this.state, m.tiles, m.x - m.ai, m.y - m.aj);
        if (this.onNotice) this.onNotice(why || 'Kies eerst een nieuwe plek voor de muur.');
        return;
      }
      this.moveB = null;
      if (this.onMoveWalls) this.onMoveWalls(m.tiles, m.x - m.ai, m.y - m.aj);
      if (this.onMoveEnd) this.onMoveEnd();
      return;
    }
    if (!m.ok) { if (this.onNotice) this.onNotice(m.same ? 'Kies eerst een nieuwe plek voor het gebouw.' : 'Daar kan het gebouw niet staan: kies vrije bouwgrond.'); return; }
    this.moveB = null;
    if (this.onMove) this.onMove(m.id, m.x, m.y);
    if (this.onMoveEnd) this.onMoveEnd();
  }

  // tijdens het slepen: kaart mee laten schuiven aan de rand van het scherm
  moveEdgePan(dt) {
    const m = this.moveB;
    if (!m || !m.dragging || m.sx == null) return;
    const cam = this.cam; const e = 44;
    let vx = 0; let vy = 0;
    if (m.sx < e) vx = -1; else if (m.sx > cam.w - e) vx = 1;
    if (m.sy < e + 30) vy = -1; else if (m.sy > cam.h - e) vy = 1;
    if (!vx && !vy) return;
    const sp = (0.45 * dt) / cam.zoom;
    cam.x += vx * sp; cam.y += vy * sp;
    cam.clamp();
    this.updateMove(m.sx, m.sy);
  }

  // het gebouw op zijn nieuwe plek (doorschijnend), met een groene of rode voet
  drawMoveGhost(ctx, t, now) {
    const m = this.moveB;
    if (!m || !this.state) return;
    if (m.kind === 'walls') { this.drawWallGhost(ctx, m); return; }
    const b = this.state.buildings.find((q) => q.id === m.id);
    if (!b) { this.moveB = null; return; }
    const c = toWorld(m.x + m.size / 2, m.y + m.size / 2);
    const ok = m.ok || m.same;
    A.diamond(ctx, c.x, c.y, m.size * A.TW, m.size * A.TH, ok ? 'rgba(80,220,90,0.35)' : 'rgba(230,60,50,0.4)', ok ? '#5fe06a' : '#e64a3c');
    ctx.save();
    ctx.globalAlpha = ok ? 0.82 : 0.5;
    const sel = this.selected; this.selected = null;
    this.drawBuilding(ctx, { ...b, x: m.x, y: m.y }, null, t, now, false);
    this.selected = sel;
    ctx.restore();
  }

  // doorschijnende muurstukken op hun nieuwe plek: een blok per tegel (steen of hout volgens het muurniveau), groene of rode voet
  drawWallGhost(ctx, m) {
    const dx = m.x - m.ai; const dy = m.y - m.aj;
    const ok = m.ok || m.same;
    const wall = this.state.buildings.find((b) => b.type === 'wall');
    const stone = wall && wall.level >= 3;
    const gates = new Set(this.state.gates || []);
    const H = stone ? 20 : 17;
    const list = m.tiles.map(([i, j]) => ({ i: i + dx, j: j + dy, gate: gates.has(tileIndex(i, j)) })).sort((a, b) => a.i + a.j - (b.i + b.j));
    for (const q of list) {
      const c = toWorld(q.i + 0.5, q.j + 0.5);
      A.diamond(ctx, c.x, c.y, A.TW, A.TH, ok ? 'rgba(80,220,90,0.35)' : 'rgba(230,60,50,0.4)', ok ? '#5fe06a' : '#e64a3c');
    }
    ctx.save();
    ctx.globalAlpha = ok ? 0.8 : 0.5;
    for (const q of list) {
      const c = toWorld(q.i + 0.5, q.j + 0.5);
      const w = A.TW * 0.34; const hh = A.TH * 0.34; const h = q.gate ? H * 0.35 : H;
      const top = stone ? '#cfc7b6' : '#a87a48'; const left = stone ? '#a39b8a' : '#7f5a33'; const right = stone ? '#8a8373' : '#6b4a2a';
      ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(c.x - w, c.y); ctx.lineTo(c.x, c.y + hh); ctx.lineTo(c.x, c.y + hh - h); ctx.lineTo(c.x - w, c.y - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(c.x + w, c.y); ctx.lineTo(c.x, c.y + hh); ctx.lineTo(c.x, c.y + hh - h); ctx.lineTo(c.x + w, c.y - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(c.x, c.y - hh - h); ctx.lineTo(c.x + w, c.y - h); ctx.lineTo(c.x, c.y + hh - h); ctx.lineTo(c.x - w, c.y - h); ctx.closePath(); ctx.fill();
      if (q.gate) { ctx.strokeStyle = '#6b4224'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x - w * 0.6, c.y - h - 2); ctx.lineTo(c.x + w * 0.6, c.y - h - 2); ctx.stroke(); }
    }
    ctx.restore();
  }

  // waar staat het eerste figuurtje van die soort in een groep?
  groupFigurePos(g, kind, now) {
    const kinds = [];
    for (const k of Object.keys(g.units)) for (let i = 0; i < Math.min(g.units[k], 7); i++) kinds.push(k);
    const offs = [[0, 0], [0.34, -0.06], [-0.06, 0.34], [0.36, 0.3], [-0.32, 0.04], [0.04, -0.34], [0.38, -0.4]];
    const i = Math.max(0, Math.min(6, kinds.indexOf(kind)));
    const pos = groupPos(g, now);
    return toWorld(pos.x + offs[i][0], pos.y + offs[i][1]);
  }

  // welke soort staat er op die plek in een groep? (de figuurtjes zoals drawGroup ze tekent)
  groupFigureAt(g, w) {
    const kinds = [];
    for (const k of Object.keys(g.units)) for (let i = 0; i < Math.min(g.units[k], 7); i++) kinds.push(k);
    const figs = kinds.slice(0, 7);
    const offs = [[0, 0], [0.34, -0.06], [-0.06, 0.34], [0.36, 0.3], [-0.32, 0.04], [0.04, -0.34], [0.38, -0.4]];
    const pos = groupPos(g, this.now);
    let best = figs[0]; let bd = Infinity;
    figs.forEach((k, i) => {
      const p = toWorld(pos.x + offs[i][0], pos.y + offs[i][1]);
      const d = Math.hypot(w.x - p.x, w.y - (p.y - 10));
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  selectAllVillagers(v) {
    const n = Math.min(40, this.state.villagers[v.job] || 0);
    if (n > 0) this.setSel({ type: 'villagers', job: v.job, n, gx: v.gx, gy: v.gy });
  }

  // rechte muurlijn tussen twee tegels (langs de langste richting)
  wallLine(a, b) {
    const out = [];
    if (Math.abs(b.i - a.i) >= Math.abs(b.j - a.j)) {
      const d = Math.sign(b.i - a.i) || 1;
      for (let i = a.i; i !== b.i + d; i += d) out.push([i, a.j]);
    } else {
      const d = Math.sign(b.j - a.j) || 1;
      for (let j = a.j; j !== b.j + d; j += d) out.push([a.i, j]);
    }
    return out.slice(0, WALL_TILE.maxPerOrder);
  }

  // een opdracht doorgeven (de server rekent het na en bewaart het)
  issue(sel, to, target) {
    if (!this.onFieldOrder) return;
    let mark = to ? { gx: to.x, gy: to.y } : this.targetPos(target);
    if (sel.type === 'group') this.onFieldOrder({ action: 'order', id: sel.id, to, target });
    else if (sel.type === 'unit') this.onFieldOrder({ action: 'split', id: sel.id, units: { [sel.kind]: 1 }, to, target });
    else if (sel.type === 'kind' || sel.type === 'army') {
      // thuis = één nieuwe groep; in het veld = elke groep (of het deel van die soort).
      // Alles in één bevel, in formatie (zoals ze nu staan) en aan het tempo van de traagste: samen aankomen.
      const s = this.state;
      const now = this.now;
      const parts = [];
      const goingHome = target && target.type === 'home';
      const door = tcDoor();
      if (sel.type === 'kind') {
        const home = sel.kind === 'villager' ? 0 : (s.units || {})[sel.kind] || 0;
        if (home && !goingHome) parts.push({ op: { action: 'send', spec: { units: { [sel.kind]: home } }, from: { x: sel.gx, y: sel.gy } }, pos: { x: sel.gx, y: sel.gy }, units: { [sel.kind]: home } });
        for (const g of s.field || []) {
          if (!g.units[sel.kind]) continue;
          const op = Object.keys(g.units).length === 1 ? { action: 'order', id: g.id } : { action: 'split', id: g.id, units: { [sel.kind]: g.units[sel.kind] } };
          parts.push({ op, pos: groupPos(g, now), units: { [sel.kind]: g.units[sel.kind] } });
        }
      } else {
        const home = {};
        for (const k of ARMY_UNITS) if ((s.units || {})[k] > 0) home[k] = s.units[k];
        if (Object.keys(home).length && !goingHome) parts.push({ op: { action: 'send', spec: { units: home } }, pos: { x: door.gx, y: door.gy }, units: home });
        for (const g of s.field || []) if (!isVillagerGroup(g)) parts.push({ op: { action: 'order', id: g.id }, pos: groupPos(g, now), units: g.units });
      }
      if (!parts.length) return;
      // formatie: dezelfde onderlinge ligging als nu, maar compact rond het doel
      const cx = parts.reduce((a, p) => a + p.pos.x, 0) / parts.length;
      const cy = parts.reduce((a, p) => a + p.pos.y, 0) / parts.length;
      const far = Math.max(0.001, ...parts.map((p) => Math.hypot(p.pos.x - cx, p.pos.y - cy)));
      const R = 0.8 + 0.3 * Math.sqrt(parts.length);
      const k = Math.min(1, R / far);
      const offs = [];
      parts.forEach((p, i) => {
        let ox = (p.pos.x - cx) * k; let oy = (p.pos.y - cy) * k;
        // staan ze (bijna) op dezelfde plek? dan een eigen plekje ernaast
        if (offs.some(([x, y]) => Math.hypot(x - ox, y - oy) < 0.5)) { ox += Math.cos(i * 2.4) * 0.6 * Math.sqrt(i); oy += Math.sin(i * 2.4) * 0.6 * Math.sqrt(i); }
        offs.push([ox, oy]);
      });
      const pace = parts.length > 1 ? Math.min(...parts.map((p) => Math.min(...Object.keys(p.units).map((u) => FIELD.speed[u] || 1)))) : null;
      const list = parts.map((p, i) => ({ ...p.op, to: to && { x: to.x + offs[i][0], y: to.y + offs[i][1] }, target, pace, keepSel: true }));
      if (this.onFieldOrders) this.onFieldOrders(list); else list.forEach((o) => this.onFieldOrder(o));
      if (sel.type === 'kind') this.selectKind(sel.kind); else this.selectArmy();
    }
    else if (sel.type === 'walker') { sel.w.leaving = true; this.onFieldOrder({ action: 'send', spec: { villager: sel.w.job }, from: { x: sel.w.gx, y: sel.w.gy }, to, target }); }
    else if (sel.type === 'soldier') this.onFieldOrder({ action: 'send', spec: { units: { [sel.kind]: 1 } }, from: { x: sel.gx, y: sel.gy }, to, target });
    else if (sel.type === 'soldiers') this.onFieldOrder({ action: 'send', spec: { units: { [sel.kind]: sel.n } }, from: { x: sel.gx, y: sel.gy }, to, target });
    else if (sel.type === 'villagers') {
      let left = sel.n; for (const w of this.walkers) if (left > 0 && w.job === sel.job) { w.leaving = true; left--; }
      this.onFieldOrder({ action: 'send', spec: { villager: sel.job, n: sel.n }, from: { x: sel.gx, y: sel.gy }, to, target });
    } else if (sel.type === 'groups') {
      // elke groep een eigen plekje rond het doel, zodat ze niet op elkaar staan
      sel.ids.forEach((id, k) => {
        const off = k === 0 ? [0, 0] : [Math.cos(k * 2.4) * 0.6 * Math.sqrt(k), Math.sin(k * 2.4) * 0.6 * Math.sqrt(k)];
        this.onFieldOrder({ action: 'order', id, to: to && { x: to.x + off[0], y: to.y + off[1] }, target });
      });
    }
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
    if (this.landMode || this.wallMode) { this.canvas.style.cursor = 'crosshair'; return; }
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
    // je eigen stad (bouwgrond, muren en alles erbinnen) en een rand errond zie je altijd
    const vis = homeSight(s).slice();
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
  // de aankleding opnieuw maken als er gebouwd is of de zon verder staat
  townDress(segs, wallLevel, light) {
    const s = this.state;
    const len = 0.75 + Math.min(0.7, Math.abs(light.hour - 13) / 8);
    const alpha = 0.26 * (1 - light.dark * 0.75);
    const lk = `${Math.round(len * 10)}|${Math.round(alpha * 40)}`;
    if (this.dressState !== s || this.dressLight !== lk) {
      this.dressState = s; this.dressLight = lk;
      const key = dressKey(s, `${lk}|${wallLevel}`);
      if (!this.dress || this.dress.key !== key) {
        const wallTiles = [...(s.walls || []), ...(s.gates || [])].map((t) => { const q = tileOf(t); return [q.i, q.j]; });
        this.dress = buildDress({ state: s, seed: this.seed, wallTiles, shadows: (g) => this.drawShadows(g, segs, wallLevel, light, null) });
        this.dress.key = key;
      }
    }
    return this.dress;
  }

  groundLayer(light, dress = null) {
    const len = 0.75 + Math.min(0.7, Math.abs(light.hour - 13) / 8);
    const alpha = 0.26 * (1 - light.dark * 0.75);
    const key = `${this.treeKey}|${Math.round(len * 10)}|${Math.round(alpha * 40)}|${dress ? dress.key : '-'}`;
    const L = this.groundComp;
    if (L && L.key === key) return L.cv;
    const gnd = this.ground;
    const cv = L ? L.cv : document.createElement('canvas');
    if (cv.width !== gnd.cv.width || cv.height !== gnd.cv.height) { cv.width = gnd.cv.width; cv.height = gnd.cv.height; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(gnd.cv, 0, 0);
    g.setTransform(BAKE, 0, 0, BAKE, -this.groundOrigin.x * BAKE, -this.groundOrigin.y * BAKE);
    this.paintTreeShadows(g, null, len, alpha);
    if (dress) {
      g.setTransform(BAKE, 0, 0, BAKE, -this.groundOrigin.x * BAKE, -this.groundOrigin.y * BAKE);
      g.drawImage(dress.cv, dress.x, dress.y, dress.W, dress.H);
    }
    this.groundComp = { cv, key, len, alpha };
    return cv;
  }

  // schaduwen van de bomen op de grond (R = enkel dit stuk, null = alles)
  paintTreeShadows(g, R, len, alpha) {
    if (alpha < 0.02) return;
    g.beginPath();
    const Ls = 26 * (Math.round(len * 10) / 10);
    const rx = Ls * 0.55 + 6;
    for (const d of this.visTrees) {
      const p = toWorld(d.gx, d.gy);
      const ex = p.x + 4 + Ls * 0.5; const ey = p.y + 2 + Ls * 0.2;
      if (R && (ex < R.x0 - rx || ex > R.x1 + rx || ey < R.y0 - 8 || ey > R.y1 + 8)) continue;
      g.moveTo(ex + rx * Math.cos(0.38), ey + rx * Math.sin(0.38));
      g.ellipse(ex, ey, rx, 5, 0.38, 0, Math.PI * 2);
    }
    g.fillStyle = `rgba(20,32,8,${Math.round(alpha * 40) / 40})`;
    g.fill('nonzero');
  }

  // Ingezoomd: de grond in scherpe stukken op schermresolutie (zie groundhd.js), over de gebakken grond heen.
  drawGroundHD(ctx, vis, dress) {
    const need = this.cam.zoom * this.cam.dpr;
    if (!GH.hdTier(need) || !this.groundComp) return;
    if (!this.hdg) this.hdg = new GH.HDGround();
    const L = this.groundComp;
    const o = this.groundOrigin;
    const bounds = { x0: o.x, y0: o.y, x1: o.x + this.ground.W, y1: o.y + this.ground.H };
    const ISO = [A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0];
    // tijdens het slepen of knijpen: hooguit één nieuw stuk per 3 beelden (een stuk kost op een gsm al snel 50 ms);
    // na het loslaten komen de rest snel bij
    // net na het opstarten (eerste 1,2 s) nog geen: dan is er al genoeg te doen en de gebakken grond staat er al;
    // zolang er 3D-beelden laden ook maar af en toe één
    const moving = this.cam.dragging || this.cam.pinch;
    this.hdTick = (this.hdTick || 0) + 1;
    if (!this.hdFrom) this.hdFrom = performance.now() + 1200;
    const maxNew = performance.now() < this.hdFrom ? 0 : moving || S3.busy() ? (this.hdTick % 3 === 0 ? 1 : 0) : 2;
    this.hdPending = this.hdg.draw(ctx, vis, need, bounds, L.key, (g, R, S) => {
      this.paintGround(g, R, S);
      this.paintTreeShadows(g, R, L.len, L.alpha);
      if (dress) dress.paint(g, R, S);
      // fijne korrel over alles (stenen, aarde, gras), enkel binnen het gebied
      const WM = g.getTransform();
      g.save();
      g.transform(...ISO); g.beginPath(); g.rect(T_MIN, T_MIN, T_W, T_W); g.setTransform(WM); g.clip();
      g.globalCompositeOperation = 'overlay';
      for (const [pat, a] of GH.hdPatterns(g, 'grain', S)) { g.globalAlpha = a; g.fillStyle = pat; g.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0); }
      g.restore();
    }, 8, maxNew);
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
  // Tijdens het laden (3D-beelden, scherpe grondstukken) zegt de beeldsnelheid niets over het toestel: dan niet meten.
  // Traag = minder dan ±40 beelden/s én het tekenen zelf kost veel (een gsm in energiebesparing geeft er sowieso maar 30:
  // dat is geen reden om wazig te tekenen). Gaat het weer vlot, dan gaat de resolutie stap per stap terug omhoog; een
  // stap die te traag bleek, proberen we pas na een minuut opnieuw.
  adaptQuality(dt) {
    if (!(dt > 0) || dt > 250) return;
    if (this.throttled || S3.busy() || this.hdPending > 0) return; // deze beelden niet meetellen (maar ook niet opnieuw beginnen)
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.94 + dt * 0.06 : dt;
    const w = this.workMs || 0;
    this.workAvg = this.workAvg ? this.workAvg * 0.94 + w * 0.06 : w;
    this.frameN++;
    this.measMs = (this.measMs || 0) + dt;
    if (this.frameN < 30 || this.measMs < 2500) return;
    const cam = this.cam;
    const now = performance.now();
    const reset = () => { this.frameN = 0; this.measMs = 0; this.frameAvg = 0; this.workAvg = 0; };
    if (this.frameAvg > 25 && (this.workAvg > 8 || this.frameAvg > 40) && cam.quality > 0.55) {
      this.qFail = { q: cam.quality, at: now };
      cam.quality = Math.max(0.55, Math.round((cam.quality - 0.15) * 100) / 100);
      reset();
    } else if (cam.quality < 1 && this.measMs > 6000 && this.frameAvg < 18.5 && this.workAvg < 6) {
      const up = Math.min(1, Math.round((cam.quality + 0.15) * 100) / 100);
      if (!this.qFail || this.qFail.q > up + 0.01 || now - this.qFail.at > 60000) { cam.quality = up; reset(); }
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
    const w0 = performance.now();
    this.drawFrame(t, dt, now);
    this.workMs = performance.now() - w0;
  }

  drawFrame(t, dt, now) {
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
    if (this.moveB && this.moveB.dragging) this.moveEdgePan(dt);
    if (!this.battleMode && (now - this.fogAt > 120 || now < this.fogAt)) this.updateFog(now);
    cam.apply(ctx);
    const gnd = this.ground;
    const vis = this.viewRect(2);
    const s = this.state;
    const wall = s.buildings.find((b) => b.type === 'wall');
    const wallLevel = wall ? Math.max(wall.level, (s.walls || []).length || (s.gates || []).length ? 1 : 0) : 0;
    const segs = this.wallSegments(wallLevel);
    // aankleding (straten, paadjes, tuintjes, zachte schaduwen) zit mee in de grondafbeelding; in een slag gewone schaduwen
    const dress = this.battleMode ? null : this.townDress(segs, wallLevel, light);
    drawSub(ctx, this.groundLayer(this.light, dress), BAKE, this.groundOrigin.x, this.groundOrigin.y, gnd.W, gnd.H, vis);
    this.drawGroundHD(ctx, vis, dress);
    this.drawPond(ctx, t);
    this.drawLakes(ctx, t);

    const v = this.viewRect();
    const inView = (p) => p.x > v.x0 && p.x < v.x1 && p.y > v.y0 && p.y < v.y1;
    this.treeMip = cam.zoom * cam.dpr < 0.95;
    this.treeNeed = cam.zoom * cam.dpr;
    if (this.battleMode) this.underlay(ctx, t, now); // slagveld: opstelplaats en looplijnen op de grond
    else if (this.placing || this.moveB) this.drawGrid(ctx); else this.drawBuildArea(ctx);
    if (this.landMode) this.drawLandLots(ctx);
    if (this.wallMode) this.drawWallPreview(ctx);
    if (this.gateMode) this.drawGatePreview(ctx);
    this.drawWallSel(ctx, t);
    if (!dress) this.drawShadows(ctx, segs, wallLevel, light, vis);

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
      if (!isPlaced(b) || b.hide) continue;
      const size = BUILDINGS[b.type].size;
      items.push({ depth: b.x + b.y + size, kind: 'building', b });
    }
    for (const seg of segs) items.push({ depth: (seg.x0 + seg.x1) / 2 + (seg.y0 + seg.y1) / 2 + 0.2, kind: 'wall', seg });
    if (dress) for (const p of dress.props) if (inView(toWorld(p.gx, p.gy))) items.push({ depth: p.depth, kind: 'prop', p });
    for (const w of this.walkers) if (w.wait <= 0 || w.phase === 'work' || w.job === 'idle') items.push({ depth: w.gx + w.gy, kind: 'walker', w });
    for (const sol of this.soldierSpots()) items.push({ depth: sol.gx + sol.gy, kind: 'soldier', sol });
    for (const sh of this.sheep) items.push({ depth: sh.gx + sh.gy, kind: 'sheep', sh });
    if (s.terr && !this.battleMode) {
      const terr = this.terr;
      for (const d of terr.deposits) {
        if (depLeft(s, d) <= 0 || !this.isExplored(d.x, d.y) || !inView(toWorld(d.x, d.y))) continue;
        items.push({ depth: d.x + d.y, kind: 'deposit', d });
      }
      const scene = this.fightScene(now);
      this.fighting = scene;
      for (const sc of scene) for (const u of sc.units) if (!u.gone) items.push({ depth: u.x + u.y, kind: 'fighter', u, sc });
      const busyBoar = new Set(scene.filter((sc) => sc.f.foe.type === 'boar').map((sc) => sc.f.foe.id));
      for (const b of terr.boars) {
        if (!boarAlive(s, b.id, now) || busyBoar.has(b.id)) continue;
        const bp = this.boarPos(b);
        if (!this.isVisible(bp.x, bp.y)) continue;
        items.push({ depth: bp.x + bp.y, kind: 'boar', b, bp });
      }
      if (terr.camp && this.isExplored(terr.camp.x, terr.camp.y)) items.push({ depth: terr.camp.x + terr.camp.y, kind: 'camp' });
      const raid = this.raidParty(now);
      if (raid && this.isExplored(raid.x, raid.y)) items.push({ depth: raid.x + raid.y, kind: 'raid', raid });
      for (const g of s.field || []) {
        if (g.fight && scene.some((sc) => sc.f.id === g.fight)) continue;
        const p = groupPos(g, now);
        items.push({ depth: p.x + p.y, kind: 'group', g, p });
      }
      this.fightEffects(scene, now);
    }
    if (this.battleMode) this.battleItems(items, now, inView); // troepen, puin en tenten op het slagveld
    items.sort((a, b) => a.depth - b.depth);

    const jobs = new Map(s.builds.map((j) => [j.bid, j]));
    this.emitT += dt;
    const emit = this.emitT > 380;
    if (emit) this.emitT = 0;
    this.drawOrderMark(ctx, t);
    this.drawPressMark(ctx);
    for (const it of items) {
      switch (it.kind) {
        case 'decor': this.drawDecor(ctx, it.d, t); break;
        case 'prop': drawProp(ctx, it.p); break;
        case 'tree': this.drawTree(ctx, it.tr, t, it.shake); break;
        case 'stump': this.drawStump(ctx, it.st); break;
        case 'wall': this.drawWallPiece(ctx, it.seg, wallLevel); break;
        case 'building':
          if (this.moveB && it.b.id === this.moveB.id) { ctx.save(); ctx.globalAlpha = 0.35; this.drawBuilding(ctx, it.b, jobs.get(it.b.id), t, now, false); ctx.restore(); } else this.drawBuilding(ctx, it.b, jobs.get(it.b.id), t, now, emit);
          break;
        case 'walker': this.drawWalker(ctx, it.w, t); break;
        case 'sheep': this.drawSheep(ctx, it.sh, t); break;
        case 'node': this.drawNode(ctx, it.n, t, emit); break;
        case 'harvester': this.drawHarvester(ctx, it.hv, it.pos, t, emit); break;
        case 'deposit': this.drawDeposit(ctx, it.d, t); break;
        case 'boar': this.drawBoar(ctx, it.b, it.bp, t); break;
        case 'camp': this.drawCamp(ctx, t, now); break;
        case 'raid': this.drawRaid(ctx, it.raid, t); break;
        case 'group': this.drawGroup(ctx, it.g, it.p, t, now, emit); break;
        case 'fighter': this.drawFighter(ctx, it.u, it.sc, t, now); break;
        case 'x': it.draw(ctx); break;
        default: { const p = toWorld(it.sol.gx, it.sol.gy); this.drawSoldier(ctx, it.sol, p.x, p.y, t); }
      }
    }
    this.drawSelXray(ctx, t);

    // vuurwerk bij een nieuw tijdperk
    const pn = performance.now();
    this.fireworks = this.fireworks.filter((f) => { if (pn >= f.at) { this.particles.firework(f.x, f.y); return false; } return true; });
    this.particles.draw(ctx);
    if (this.flutter && night < 0.5) this.flutter.draw(ctx, t, night);
    this.clouds.drawShadows(ctx, 0.12 * (1 - night));
    this.birds.draw(ctx, t, 90);
    if (!this.battleMode) this.drawFog(ctx, vis);

    // licht en donker
    if (!FX.LOW_POWER) FX.grade(ctx, this.canvas.width, this.canvas.height, light);
    FX.applyLight(ctx, this.canvas.width, this.canvas.height, light);
    cam.apply(ctx);
    if (night > 0.05) this.drawNightLights(ctx, t, night, segs, wallLevel);
    if (this.flutter && night >= 0.5) this.flutter.draw(ctx, t, night);

    if (this.placing && this.hoverTile) this.drawGhost(ctx);
    if (this.moveB) this.drawMoveGhost(ctx, t, now);
    for (const b of s.buildings) {
      const job = jobs.get(b.id);
      if (!job || !isPlaced(b)) continue;
      const c = this.footprintCenter(b);
      this.drawProgress(ctx, c.x, c.y - (b.level === 0 ? 50 : (SPRITE_H[b.type] || 60)), job, now);
    }
    if (wall && jobs.has(wall.id)) this.drawWallProgress(ctx, jobs.get(wall.id), now);
    this.drawWorkProgress(ctx, now);
    if (this.fighting && this.fighting.length) this.drawProjectiles(ctx, this.fighting, now);
    if (this.battleMode) this.overlay(ctx, t, now);
    this.drawHover(ctx);
    this.drawSelMarker(ctx, t);
    if (this.landMode) this.drawLandLabel(ctx);
  }

  // gekozen muurstuk of poort: gouden tegel op de grond
  drawWallSel(ctx, t) {
    const w = this.selWall;
    if (!w || this.selected == null) return;
    const pulse = 0.55 + Math.sin(t * 0.006) * 0.25;
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    // een poort: beide tegels
    const g = w.gate ? gateList(this.state).find((x) => x.tiles.some(([a, b]) => a === w.i && b === w.j)) : null;
    const t0 = g ? g.tiles[0] : [w.i, w.j]; const t1 = g ? g.tiles[g.tiles.length - 1] : [w.i, w.j];
    const bw = t1[0] - t0[0] + 1.16; const bh = t1[1] - t0[1] + 1.16;
    ctx.fillStyle = `rgba(255,215,90,${pulse * 0.45})`; ctx.fillRect(t0[0] - 0.08, t0[1] - 0.08, bw, bh);
    ctx.strokeStyle = `rgba(255,232,140,${pulse + 0.25})`; ctx.lineWidth = 0.07; ctx.strokeRect(t0[0] - 0.08, t0[1] - 0.08, bw, bh);
    ctx.restore();
  }

  // gouden pijl boven het gekozen gebouw of muurstuk (altijd bovenop, zodat je ziet wat je koos)
  drawSelMarker(ctx, t) {
    const s = this.state;
    let p = null; let h = 0;
    if (this.selWall && this.selected != null) {
      p = toWorld(this.selWall.i + 0.5, this.selWall.j + 0.5); h = this.selWall.gate ? 52 : 40;
    } else if (this.selected != null) {
      const b = s.buildings.find((x) => x.id === this.selected);
      if (!b || !isPlaced(b)) return;
      p = this.footprintCenter(b); h = (b.level > 0 ? (SPRITE_H[b.type] || 58) : 36) + 8;
    }
    if (!p) return;
    if (this.selWall) {
      // de tegel zelf, bovenop de muur, met een gouden rand
      const pulse = 0.65 + Math.sin(t * 0.006) * 0.25;
      ctx.save();
      ctx.shadowColor = 'rgba(255,210,80,0.9)'; ctx.shadowBlur = 6;
      A.diamond(ctx, p.x, p.y, A.TW + 6, A.TH + 3, null, `rgba(255,228,120,${pulse})`);
      ctx.lineWidth = 2.4; ctx.stroke();
      ctx.restore();
    }
    const y = p.y - h + Math.sin(t * 0.006) * 3;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#5a3a0c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p.x - 8, y - 11); ctx.lineTo(p.x + 8, y - 11); ctx.lineTo(p.x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // poort maken: de tegel onder de muis groen (kan) of rood (kan niet)
  drawGatePreview(ctx) {
    const h = this.hoverTile;
    if (!h) return;
    const i = Math.floor(h.gx); const j = Math.floor(h.gy);
    const err = checkPlaceGate(this.state, i, j);
    const span = !err ? gateSpan(this.state, i, j) : null;
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    ctx.fillStyle = err ? 'rgba(230,90,70,0.45)' : 'rgba(120,230,110,0.5)';
    for (const [a, b] of span ? span.tiles : [[i, j]]) ctx.fillRect(a + 0.06, b + 0.06, 0.88, 0.88);
    ctx.restore();
    const p = toWorld(i + 0.5, j + 0.5);
    const txt = err && !/grondstoffen/.test(err) ? 'Hier kan geen poort' : err ? 'Niet genoeg grondstoffen' : 'Poort hier maken';
    ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(txt).width + 16;
    ctx.fillStyle = 'rgba(28,20,12,0.88)'; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, p.y - 44, tw, 20, 8); ctx.fill();
    ctx.fillStyle = err ? '#ffb4a4' : '#ffe28a'; ctx.fillText(txt, p.x, p.y - 30);
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

  treeSpr(k) {
    return this.treeSprites[k] || (this.treeSprites[k] = NAT.treeSprite(k));
  }

  drawTree(ctx, tr, t, shake) {
    const p = toWorld(tr.gx, tr.gy);
    let sway = Math.sin(t * 0.0012 + tr.gx) * 0.6;
    if (shake) sway += Math.sin(t * 0.05) * 1.6;
    // 3D-boom (zelfde stijl als de gebouwen); de schaduw zit al in de grondlaag
    const d3 = S3.getProp('tree', tr.kind ?? tr.v, this.treeNeed);
    if (d3) { ctx.drawImage(d3.cv, p.x - d3.ax + sway, p.y - d3.ay, d3.w, d3.h); return; }
    const spr = this.treeSpr(tr.kind ?? tr.v);
    ctx.drawImage(this.treeMip ? spr.small : spr.cv, p.x - spr.ax + sway, p.y - spr.ay, spr.w, spr.h);
  }

  drawStump(ctx, st) {
    const p = toWorld(st.gx, st.gy);
    if (A.prop3d(ctx, 'stump', Math.floor(st.gx * 7 + st.gy * 3) & 7, p.x, p.y, 0.9)) return;
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
      if (A.prop3d(ctx, 'gold', d.id % 8, p.x - 8, p.y + 2, 2.4)) { A.prop3d(ctx, 'gold', (d.id + 2) % 8, p.x + 9, p.y + 4, 1.8); A.prop3d(ctx, 'gold', (d.id + 5) % 8, p.x, p.y + 9, 1.3); } else {
        A.rock(ctx, p.x - 8, p.y + 2, 2.8); A.rock(ctx, p.x + 9, p.y + 4, 2.1); A.rock(ctx, p.x, p.y + 8, 1.6);
        ctx.fillStyle = '#f2c230';
        for (const [dx, dy, r] of [[-12, -9, 2.2], [-5, -13, 1.8], [2, -7, 2], [10, -3, 1.6], [-1, 2, 1.5], [6, -9, 1.3]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2); ctx.fill(); }
      }
      const tw = Math.sin(t * 0.005 + d.id * 3);
      if (tw > 0.5) { ctx.fillStyle = `rgba(255,255,230,${(tw - 0.5) * 2})`; ctx.fillRect(p.x - 6, p.y - 15, 2, 2); ctx.fillRect(p.x + 3, p.y - 9, 1.6, 1.6); }
    } else if (d.kind === 'stone') {
      A.rock(ctx, p.x - 10, p.y + 1, 3.2); A.rock(ctx, p.x + 7, p.y, 2.8); A.rock(ctx, p.x - 1, p.y + 9, 2.2); A.rock(ctx, p.x + 13, p.y + 7, 1.5);
    } else if (d.kind === 'wood') {
      for (const [dx, dy, sc] of [[-12, 2, 1.75], [10, 0, 1.6], [-1, 9, 1.85]]) A.broadleaf(ctx, p.x + dx, p.y + dy, sc, 0.15);
      if (!A.prop3d(ctx, 'logs', 0, p.x + 20, p.y + 11, 0.8)) {
        ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(p.x + 14 - i, p.y + 12 - i * 3); ctx.lineTo(p.x + 26 - i, p.y + 9 - i * 3); ctx.stroke(); }
        ctx.lineCap = 'butt';
      }
    } else {
      for (const [dx, dy] of [[-12, 0], [0, -5], [11, 1], [-4, 8], [8, 9]]) {
        if (A.prop3d(ctx, 'berry', (dx + 20) % 3, p.x + dx, p.y + dy, 0.85)) continue;
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
    const busy = (this.fighting || []).some((sc) => sc.f.foe.type === 'camp');
    if (!campAlive(s, now)) {
      ctx.fillStyle = 'rgba(30,25,20,0.55)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 54, 26, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.fillStyle = '#2a2018'; ctx.fillRect(p.x + Math.cos(a) * 44 - 1.5, p.y + Math.sin(a) * 20 - 5, 3, 5); }
      A.smoke(ctx, p.x, p.y - 4, t, 7, 0.8);
      return;
    }
    // dorp uit vooraf getekende lagen (achterkant en voorkant van de palissade), daartussen vuur en barbaren
    const spr = campSprites();
    // 3D (zelfde stijl als de stad) zodra beide lagen klaar zijn, anders de getekende versie
    const cm = ctx.getTransform(); const cneed = Math.hypot(cm.a, cm.b);
    const b3 = S3.getProp('campback', 0, cneed); const f3 = b3 && S3.getProp('campfront', 0, cneed);
    if (b3 && f3) ctx.drawImage(b3.cv, -b3.ax, -b3.ay, b3.w, b3.h);
    else ctx.drawImage(spr.back, -spr.w / 2, -spr.ay, spr.w, spr.h);
    A.fire(ctx, p.x - 4, p.y + 4, 1.15, t);
    A.smoke(ctx, p.x - 26, p.y - 30, t, 3, 0.7);
    A.smoke(ctx, p.x + 24, p.y - 34, t, 5, 0.7);
    A.flag(ctx, p.x + 44, p.y - 2, 32, '#1c1c1c', t, 1);
    ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(p.x + 51, p.y - 30, 2.2, 0, Math.PI * 2); ctx.fill();
    A.flag(ctx, p.x - 50, p.y - 4, 28, '#5a1a12', t + 700, 0.9);
    if (!busy) {
      // zoveel barbaren als er echt wonen (tot 12 figuren; het aantal staat erboven)
      const n = Math.min(12, Math.max(1, campSize(s)));
      const spots = [[-30, 8, 0], [26, 8, 2], [8, -14, 4], [-14, 16, 1], [36, -8, 3], [-40, -4, 5],
        [12, 18, 1], [-22, -12, 2], [44, 6, 4], [-48, 10, 3], [0, 4, 5], [20, -4, 0]];
      for (let i = 0; i < n; i++) {
        const [dx, dy, ph] = spots[i];
        const dir = dx < 0 ? 1 : -1;
        facing(ctx, p.x + dx, dir, () => A.person(ctx, p.x + dx, p.y + dy + Math.sin(t * 0.004 + ph) * 0.4, { s: 1.05, body: ph % 2 ? '#4f3a2a' : '#5b4636', weapon: ph === 2 || ph === 5 ? 'spear' : 'sword', barb: true, skin: 1 + (ph % 3) }));
      }
    }
    if (b3 && f3) ctx.drawImage(f3.cv, -f3.ax, -f3.ay, f3.w, f3.h);
    else ctx.drawImage(spr.front, -spr.w / 2, -spr.ay, spr.w, spr.h);
    if (!busy) {
      // hoeveel barbaren wonen hier? (altijd zichtbaar, zodat je weet waar je aan begint)
      const txt = `${Math.max(1, campSize(s))} barbaren`;
      ctx.font = '700 9px Inter, sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(txt).width + 18;
      ctx.fillStyle = 'rgba(60,14,8,0.82)'; ctx.beginPath(); ctx.roundRect(-tw / 2, -78, tw, 14, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(240,190,120,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#ffe9c9'; ctx.fillText(txt, 4, -68);
      ctx.strokeStyle = '#ffe9c9'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-tw / 2 + 5, -74); ctx.lineTo(-tw / 2 + 11, -68); ctx.moveTo(-tw / 2 + 11, -74); ctx.lineTo(-tw / 2 + 5, -68); ctx.stroke();
    }
  }

  // ---------- gevechten ----------

  // waar staat elk mannetje in elk gevecht, en hoeveel levens heeft het nog?
  fightScene(now) {
    const s = this.state;
    const out = [];
    for (const f of (s.terr && s.terr.fights) || []) {
      const groups = (s.field || []).filter((g) => g.fight === f.id);
      if (!groups.length) continue;
      const r = runFight(f, now, true);
      let ax = 0; let ay = 0;
      for (const g of groups) { const p = groupPos(g, now); ax += p.x; ay += p.y; }
      ax /= groups.length; ay /= groups.length;
      let fx; let fy;
      if (f.foe.type === 'boar') {
        const b = this.terr.boars.find((x) => x.id === f.foe.id);
        fx = b ? b.x : ax + 0.8; fy = b ? b.y : ay;
      } else {
        const c = this.terr.camp; const d = Math.hypot(c.x - ax, c.y - ay) || 1;
        fx = ax + ((c.x - ax) / d) * 1.1; fy = ay + ((c.y - ay) / d) * 1.1;
      }
      let ux = fx - ax; let uy = fy - ay; const dl = Math.hypot(ux, uy) || 1; ux /= dl; uy /= dl;
      if (dl < 0.7) { ax = fx - ux * 0.8; ay = fy - uy * 0.8; }
      const px = -uy; const py = ux;
      const units = [];
      // de eerste anderhalve seconde stormen beide kanten op elkaar af
      const charge = Math.max(0, 1 - (now - f.t0) / FIELD.engageMs);
      const place = (list, side, cx, cy) => list.forEach((u, i) => {
        const per = 6;
        const row = Math.floor(i / per); const col = (i % per) - Math.min(per - 1, list.length - 1 - row * per) / 2 + (row % 2) * 0.25;
        const back = side ? 1 : -1;
        const gap = row * 0.42 + charge * charge * (side ? 1.6 : 0.6);
        const x = cx + ux * back * gap + px * col * 0.44 + ((i * 37) % 7 - 3) * 0.02;
        const y = cy + uy * back * gap + py * col * 0.44 + ((i * 53) % 7 - 3) * 0.02;
        const gone = u.died != null && now - u.died > 4500;
        units.push({ side, i, k: u.k, hp: u.hp, max: maxHp(u.k), died: u.died, x, y, gone, charging: charge > 0.05, ux: side ? -ux : ux, uy: side ? -uy : uy });
      });
      place(r.a, 0, ax + ux * 0.1, ay + uy * 0.1);
      place(r.b, 1, fx - ux * 0.1, fy - uy * 0.1);
      // treffers van de komende 0,4 s: daarvoor vliegen de pijlen al
      const ranged = [...f.a, ...f.b].some((u) => UNITS[u.k] && UNITS[u.k].ranged);
      const future = ranged ? runFight(f, now + 400, true).events.filter((e) => e.t > now - 50) : [];
      out.push({ f, r, units, future });
    }
    return out;
  }

  // treffers: stofjes en vonken bij wie geraakt wordt
  fightEffects(scene, now) {
    const from = this.lastFightNow || now;
    this.lastFightNow = now;
    if (now <= from) return;
    for (const sc of scene) {
      for (const e of sc.r.events) {
        if (e.t <= from || e.t > now) continue;
        const u = sc.units.find((x) => x.side !== e.side && x.i === e.target);
        if (!u) continue;
        const p = toWorld(u.x, u.y);
        if (e.kill) this.particles.dust(p.x, p.y - 4, 4); else this.particles.sparks(p.x, p.y - 10, 2);
      }
    }
  }

  drawFighter(ctx, u, sc, t, now) {
    const p = toWorld(u.x, u.y);
    const dir = u.ux - u.uy >= 0 ? 1 : -1;
    const dead = u.died != null && u.died <= now;
    if (dead) {
      // gesneuveld: valt om en vervaagt
      const age = Math.min(1, (now - u.died) / 4500);
      ctx.save(); ctx.globalAlpha = 1 - age * 0.85;
      ctx.translate(p.x, p.y); ctx.rotate(-dir * Math.min(1.45, (now - u.died) / 250));
      this.drawFightFigure(ctx, u, 0, 0, t, false, dir);
      ctx.restore();
      return;
    }
    const ls = lastSwing(sc.f, u.side, u.i, u.k, now);
    const swing = ls != null && now - ls < 340 ? Math.sin(((now - ls) / 340) * Math.PI) : 0;
    const q = toWorld(u.x + u.ux * swing * 0.16, u.y + u.uy * swing * 0.16);
    // aanvalsbeweging: fase tussen twee slagen (0 = de slag of het schot), daarvoor in de aanslag
    const R = (UNITS[u.k] && UNITS[u.k].rate) || 1500;
    const atk = !u.charging && FIG.hasAttackAnim(u.k) ? (ls != null && now - ls < R ? (now - ls) / R : FIG.attackReady(u.k)) : null;
    this.drawFightFigure(ctx, u, q.x, q.y, t, (swing > 0 && atk == null) || u.charging, dir, ls != null ? (now - ls) / 340 : t * 0.004, atk);
    // levensbalk (pas na de eerste treffer, anders wordt het te druk)
    if (u.hp >= u.max) return;
    const tall = u.k === 'elephant' ? 50 : UNITS[u.k] && UNITS[u.k].type === 'cav' ? 38 : u.k === 'boar' ? 22 : 30;
    const frac = Math.max(0, u.hp / u.max);
    const w = u.k === 'elephant' ? 20 : 12;
    ctx.fillStyle = 'rgba(20,12,6,0.7)'; ctx.fillRect(q.x - w / 2 - 1, q.y - tall - 1, w + 2, 4);
    ctx.fillStyle = frac > 0.6 ? '#62d44c' : frac > 0.3 ? '#f2c230' : '#e2452f';
    ctx.fillRect(q.x - w / 2, q.y - tall, w * frac, 2);
    if (u.side) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(q.x - w / 2, q.y - tall, w * frac, 0.7); }
  }

  // pijlen van schutters vliegen naar hun doelwit
  drawProjectiles(ctx, scene, now) {
    for (const sc of scene) {
      for (const e of sc.future) {
        const age = now - e.t + 380;
        if (age < 0 || age > 380) continue;
        const from = sc.units.find((x) => x.side === e.side && x.i === e.i);
        const to = sc.units.find((x) => x.side !== e.side && x.i === e.target);
        if (!from || !to || !(UNITS[from.k] && UNITS[from.k].ranged)) continue;
        const a = toWorld(from.x, from.y); const b = toWorld(to.x, to.y);
        const f = age / 380;
        const x = a.x + (b.x - a.x) * f; const y = a.y - 14 + (b.y - a.y + 6) * f - Math.sin(f * Math.PI) * 18;
        const ang = Math.atan2((b.y - a.y + 6) - Math.cos(f * Math.PI) * 18 * Math.PI, b.x - a.x);
        // bij uitzoomen (gsm) groter, zodat je de pijlen blijft zien
        A.shot(ctx, x, y, ang, 0.85 * Math.max(1, 1 / this.cam.zoom), from.k === 'stonethrower' ? 'stone' : 'arrow');
      }
    }
  }

  drawFightFigure(ctx, u, x, y, t, swinging, dir, sp = 0, atk = null) {
    facing(ctx, x, dir, () => {
      if (u.k === 'barbarian') A.person(ctx, x, y, { s: 1.05, body: u.i % 2 ? '#4f3a2a' : '#5b4636', weapon: u.i % 3 === 2 ? 'spear' : 'sword', barb: true, skin: 1 + (u.i % 3), walking: swinging, phase: sp * Math.PI, attack: atk });
      else if (u.k === 'boar') FIG.boar(ctx, x, y, { s: 1.15, walking: swinging, phase: sp * 6 });
      else if (u.k === 'villager') A.person(ctx, x, y, { s: 0.95, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: 'axe', working: swinging, phase: sp * Math.PI * 2, attack: atk });
      else this.drawSoldier(ctx, { kind: u.k, gx: u.x, gy: u.y, walking: swinging, attack: atk }, x, y, t);
    });
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
    const sl = this.sel;
    const part = sl && sl.type === 'unit' && sl.id === g.id;
    const sel = sl && (part || (sl.type === 'group' && sl.id === g.id) || ((sl.type === 'groups' || sl.type === 'army') && sl.ids.includes(g.id))
      || (sl.type === 'kind' && g.units[sl.kind]));
    const moving = g.pending && now < g.t1;
    if (sel) {
      const pulse = 0.6 + Math.sin(t * 0.008) * 0.3;
      ctx.strokeStyle = `rgba(255,225,90,${pulse})`; ctx.lineWidth = 2;
      if (part) {
        // één troep uit de groep: kleine ring rond dat figuurtje, de groep zelf gestippeld
        const q = this.groupFigurePos(g, sl.kind, now);
        ctx.beginPath(); ctx.ellipse(q.x, q.y + 1, 8, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,225,90,0.45)';
      }
      ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 3, 18, 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (moving && !part) {
        const pts = [{ x: g.x1, y: g.y1 }, ...(g.via || [])].map((q) => toWorld(q.x, q.y));
        ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,240,180,0.65)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); for (const d of pts) ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
        const d = pts[pts.length - 1];
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
    if (part) {
      // gouden pijltje boven de gekozen troep
      const q = this.groupFigurePos(g, sl.kind, now);
      const bob = Math.sin(t * 0.008) * 1.5;
      const top = q.y - (UNITS[sl.kind] && UNITS[sl.kind].type === 'cav' ? 49 : 43) + bob;
      ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = 'rgba(60,35,5,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(q.x - 5, top - 7); ctx.lineTo(q.x + 5, top - 7); ctx.lineTo(q.x, top); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const total = Object.values(g.units).reduce((a, b) => a + b, 0);
    if (g.hp) {
      let hp = 0; let max = 0;
      for (const k of Object.keys(g.units)) { const n = g.units[k]; const list = g.hp[k] || []; for (let i = 0; i < n; i++) { hp += list[i] != null ? list[i] : maxHp(k); max += maxHp(k); } }
      if (hp < max) {
        const frac = hp / max;
        ctx.fillStyle = 'rgba(20,12,6,0.7)'; ctx.fillRect(p.x - 10, p.y - 47, 20, 4);
        ctx.fillStyle = frac > 0.6 ? '#62d44c' : frac > 0.3 ? '#f2c230' : '#e2452f'; ctx.fillRect(p.x - 9, p.y - 46, 18 * frac, 2);
      }
    }
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

  // gouden ring waar je ingedrukt hield (hele leger gekozen)
  drawPressMark(ctx) {
    const m = this.pressMark;
    if (!m) return;
    const age = performance.now() - m.at;
    if (age > 700) { this.pressMark = null; return; }
    const f = age / 700;
    ctx.strokeStyle = `rgba(255,220,100,${1 - f})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 10 + f * 46, 5 + f * 23, 0, 0, Math.PI * 2); ctx.stroke();
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
    if (!w || !s.terr || this.placing || this.battleMode) return;
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

  // ---------- grond kopen en muren plaatsen ----------

  landCandidates() {
    const s = this.state;
    const key = `${(s.terr.lots || []).length}|${s.terr.cl.length}|${buildRing(s)}|${Math.floor(Date.now() / 1000)}`;
    if (this.lotCache && this.lotCache.key === key) return this.lotCache.list;
    const list = [];
    for (let lj = Math.floor(T_MIN / LAND.size); lj <= Math.floor((T_MAX - 1) / LAND.size); lj++) {
      for (let li = Math.floor(T_MIN / LAND.size); li <= Math.floor((T_MAX - 1) / LAND.size); li++) {
        const err = checkBuyLot(s, li, lj);
        if (!err || /grondstoffen|maximaal/.test(err)) list.push({ li, lj, ok: !err, err });
      }
    }
    this.lotCache = { key, list };
    return list;
  }

  hoverLot() {
    if (!this.hoverTile) return null;
    const li = Math.floor(this.hoverTile.gx / LAND.size); const lj = Math.floor(this.hoverTile.gy / LAND.size);
    return this.landCandidates().find((c) => c.li === li && c.lj === lj) || null;
  }

  drawLandLots(ctx) {
    const z = LAND.size;
    const hov = this.hoverLot();
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    for (const c of this.landCandidates()) {
      const on = hov && hov.li === c.li && hov.lj === c.lj;
      ctx.fillStyle = c.ok ? (on ? 'rgba(255,215,90,0.42)' : 'rgba(255,215,90,0.16)') : 'rgba(220,80,60,0.15)';
      ctx.fillRect(c.li * z + 0.08, c.lj * z + 0.08, z - 0.16, z - 0.16);
      ctx.strokeStyle = c.ok ? 'rgba(255,230,140,0.95)' : 'rgba(230,110,90,0.8)';
      ctx.lineWidth = on ? 0.09 : 0.05; ctx.setLineDash(on ? [] : [0.3, 0.2]);
      ctx.strokeRect(c.li * z + 0.08, c.lj * z + 0.08, z - 0.16, z - 0.16);
    }
    ctx.restore();
  }

  drawLandLabel(ctx) {
    const c = this.hoverLot();
    if (!c) return;
    const p = toWorld(c.li * LAND.size + LAND.size / 2, c.lj * LAND.size + LAND.size / 2);
    const cost = landCost((this.state.terr.lots || []).length);
    const txt = c.ok ? `Kopen: ${Object.entries(cost).map(([r, v]) => `${v} ${RES_NAMES[r].toLowerCase()}`).join(', ')}` : c.err;
    ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(txt).width + 16;
    ctx.fillStyle = 'rgba(28,20,12,0.88)'; ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - 12, w, 20, 8); ctx.fill();
    ctx.fillStyle = c.ok ? '#ffe28a' : '#ffb4a4'; ctx.fillText(txt, p.x, p.y + 2);
  }

  drawWallPreview(ctx) {
    const s = this.state;
    const h = this.hoverTile;
    if (!h) return;
    const end = { i: Math.floor(h.gx), j: Math.floor(h.gy) };
    const tiles = this.wallStart ? this.wallLine(this.wallStart, end) : [[end.i, end.j]];
    const remove = this.wallMode === 'remove';
    const ok = remove || !checkPlaceWalls(s, tiles);
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    ctx.fillStyle = remove ? 'rgba(230,90,70,0.45)' : ok ? 'rgba(120,230,110,0.45)' : 'rgba(230,90,70,0.45)';
    for (const [i, j] of tiles) ctx.fillRect(i + 0.08, j + 0.08, 0.84, 0.84);
    ctx.restore();
    if (this.wallStart) {
      const L = Math.max(1, bLevel(s, 'wall'));
      const cost = WALL_TILE.cost[L] || {};
      const p = toWorld(end.i + 0.5, end.j + 0.5);
      const txt = remove ? `${tiles.length} muurstukken afbreken` : `${tiles.length} muurstukken · ${Object.entries(cost).map(([r, v]) => `${v * tiles.length} ${RES_NAMES[r].toLowerCase()}`).join(', ')}`;
      ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center';
      const w = ctx.measureText(txt).width + 16;
      ctx.fillStyle = 'rgba(28,20,12,0.88)'; ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - 40, w, 20, 8); ctx.fill();
      ctx.fillStyle = ok ? '#ffe28a' : '#ffb4a4'; ctx.fillText(txt, p.x, p.y - 26);
    }
  }

  // Omtrek van al je bouwgrond: het bouwvierkant + gekochte loten + gekapte stukken (één stippellijn errond).
  // Berekend als de randen tussen bouwgrond en de rest, samengevoegd tot lange lijnen; bewaard tot er iets verandert.
  buildOutline() {
    const s = this.state;
    const k = buildRing(s);
    const key = `${k}|${s.terr ? s.terr.cl.length : 0}|${s.terr ? JSON.stringify(s.terr.lots || []) : ''}`;
    if (this.outline && this.outline.key === key) return this.outline;
    const cl = s.terr ? clearedSet(s) : new Set();
    const ok = (i, j) => (ringOf(i, j) <= k) || (!!s.terr && i >= T_MIN && j >= T_MIN && i < T_MAX && j < T_MAX && cl.has(tileIndex(i, j)));
    const lo = Math.min(-k, T_MIN); const hi = Math.max(N + k, T_MAX);
    const hor = new Map(); const ver = new Map(); // y -> [x...], x -> [y...]
    const extra = [];
    for (let j = lo; j < hi; j++) {
      for (let i = lo; i < hi; i++) {
        if (!ok(i, j)) continue;
        if (ringOf(i, j) > k) extra.push([i, j]);
        if (!ok(i, j - 1)) (hor.get(j) || hor.set(j, []).get(j)).push(i);
        if (!ok(i, j + 1)) (hor.get(j + 1) || hor.set(j + 1, []).get(j + 1)).push(i);
        if (!ok(i - 1, j)) (ver.get(i) || ver.set(i, []).get(i)).push(j);
        if (!ok(i + 1, j)) (ver.get(i + 1) || ver.set(i + 1, []).get(i + 1)).push(j);
      }
    }
    // aaneengesloten stukjes samenvoegen tot lange lijnen (dan lopen de stippels mooi door)
    const runs = (m, horiz) => {
      const out = [];
      for (const [c, list] of m) {
        list.sort((a, b) => a - b);
        let a = list[0]; let b = a + 1;
        for (let n = 1; n <= list.length; n++) {
          if (n < list.length && list[n] === b) { b++; continue; }
          out.push(horiz ? [a, c, b, c] : [c, a, c, b]);
          if (n < list.length) { a = list[n]; b = a + 1; }
        }
      }
      return out;
    };
    this.outline = { key, segs: [...runs(hor, true), ...runs(ver, false)], extra };
    return this.outline;
  }

  // rand van je bouwgrond zacht aanduiden
  drawBuildArea(ctx) {
    const o = this.buildOutline();
    ctx.save();
    ctx.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    ctx.fillStyle = 'rgba(255,240,190,0.08)';
    for (const [i, j] of o.extra) ctx.fillRect(i, j, 1, 1);
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of o.segs) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    // donkere schaduw + lichte stippels: goed zichtbaar op licht en donker gras
    ctx.setLineDash([0.3, 0.2]);
    ctx.strokeStyle = 'rgba(40,28,10,0.28)'; ctx.lineWidth = 0.1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,225,0.72)'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.setLineDash([]);
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
      if (!isPlaced(b) || (b.level > 0 && S3.has(b.type))) continue;
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
      const s3 = S3.get(b.type, b.level, this.state.civ, b.id, b.type === 'academy' ? this.academyVariant() : null);
      const spr = s3 || A.buildingSprite(b.type, b.level, this.team, this.state.civ, b.id);
      const k = s3 ? 1 : bScale(b);
      for (const [lx, ly, r] of spr.lights || []) {
        const fl = 0.85 + Math.sin(t * 0.003 + lx * 3.1 + b.id) * 0.08;
        FX.drawGlow(ctx, c.x + lx * k, c.y + ly * k, 9 * r, FX.WARM, night * fl * 0.85);
      }
      if (b.type === 'smithy') FX.drawGlow(ctx, c.x + 4, c.y - 2, 26, FX.FIRE, night * (0.7 + Math.sin(t * 0.02) * 0.15));
      if (b.type === 'tc') FX.drawGlow(ctx, c.x + 6, c.y + 24, 40, FX.WARM, night * 0.45);
    }
    if (this.dress && !this.battleMode) {
      for (const l of this.dress.lamps) {
        const p = toWorld(l.gx, l.gy);
        FX.drawGlow(ctx, p.x + 7.1, p.y - 21.5, 16, FX.WARM, night * (0.85 + Math.sin(t * 0.004 + l.gx * 7) * 0.08));
        FX.drawGlow(ctx, p.x + 4, p.y, 22, FX.WARM, night * 0.25);
      }
    }
    for (const seg of segs) {
      if (!seg.gate) continue;
      const h = this.wallHeight(seg, wallLevel);
      const [px, py] = A.P((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2, h + 10);
      FX.drawGlow(ctx, px, py, 22, FX.FIRE, night * (0.75 + Math.sin(t * 0.015 + px) * 0.15));
    }
    // kampvuur van de barbaren en groepen in het veld
    if (s.terr && s.terr.camp && this.terr.camp && campAlive(s, this.now) && this.isExplored(this.terr.camp.x, this.terr.camp.y)) {
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
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    for (const [i, j] of this.buildOutline().extra) { ctx.fillRect(i, j, 1, 1); ctx.strokeRect(i, j, 1, 1); }
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
    A.drawSprite(ctx, A.buildingSprite(type, 1, this.team, this.state.civ), c.x, c.y, 1, ok ? 0.7 : 0.35);
  }

  drawDecor(ctx, d, t) {
    const p = toWorld(d.gx, d.gy);
    if (d.kind === 'bush') A.bush(ctx, p.x, p.y, 1.2);
    else if (d.kind === 'rock') A.rock(ctx, p.x, p.y, 1.2);
    else if (d.kind === 'stone') A.rock(ctx, p.x, p.y, d.s);
    else if (d.kind === 'gold' && A.prop3d(ctx, 'gold', Math.floor(d.gx * 5 + d.gy * 3) & 7, p.x, p.y + 1.2 * d.s, d.s)) { /* 3D */ }
    else if (d.kind === 'gold') {
      A.rock(ctx, p.x, p.y, d.s);
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.arc(p.x - 2, p.y - 5 * d.s, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 3, p.y - 3 * d.s, 1.2, 0, Math.PI * 2); ctx.fill();
      if (Math.sin(t * 0.003 + d.gx * 7) > 0.92) { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 2.5, p.y - 6 * d.s, 1.5, 1.5); }
    } else if (d.kind === 'berry' && A.prop3d(ctx, 'berry', Math.floor(d.gx * 3 + d.gy) % 3, p.x, p.y, 0.7)) { /* 3D */
    } else if (d.kind === 'berry') {
      A.bush(ctx, p.x, p.y, 1.4);
      ctx.fillStyle = '#d6324a';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(p.x - 3 + i * 2, p.y - 4 - (i % 2) * 2, 1, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  drawWalker(ctx, w, t) {
    const p = toWorld(w.gx, w.gy);
    if (this.sel && ((this.sel.type === 'walker' && this.sel.w === w) || (this.sel.type === 'villagers' && this.sel.job === w.job))) {
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

  // schermvak (wereldpixels) van het getekende gebouw
  buildingRect(b) {
    const size = BUILDINGS[b.type].size;
    const c = toWorld(b.x + size / 2, b.y + size / 2);
    const im = this.buildingImage(b);
    if (!im) return { x0: c.x - size * 32, y0: c.y - 50, x1: c.x + size * 32, y1: c.y + size * 16, c };
    const { spr, sc } = im;
    return { x0: c.x - spr.ax * sc, y0: c.y - spr.ay * sc, x1: c.x - spr.ax * sc + spr.w * sc, y1: c.y - spr.ay * sc + spr.h * sc, c, im };
  }

  // het gekozen gebouw doorschijnend bovenop tekenen als een ander gebouw ervoor staat:
  // zo zie je ook een klein gebouw achter het stadscentrum (dat je niet kunt verplaatsen)
  drawSelXray(ctx, t) {
    const s = this.state;
    if (this.selected == null || this.moveB || this.battleMode) return;
    const k = s.buildings.findIndex((x) => x.id === this.selected);
    const b = s.buildings[k];
    if (!b || !isPlaced(b) || b.hide || b.type === 'wall') return;
    const size = BUILDINGS[b.type].size; const d = b.x + b.y + size;
    const r = this.buildingRect(b);
    const area = Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0));
    let cover = 0;
    s.buildings.forEach((o, j) => {
      if (o === b || !isPlaced(o) || o.hide || o.type === 'wall') return;
      const od = o.x + o.y + BUILDINGS[o.type].size;
      if (od < d || (od === d && j < k)) return; // staat erachter
      const q = this.buildingRect(o);
      const w = Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0); const h = Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0);
      if (w > 0 && h > 0) cover = Math.max(cover, (w * h) / area);
    });
    if (cover < 0.2) return;
    const pulse = 0.7 + Math.sin(t * 0.006) * 0.2;
    ctx.save();
    if (r.im) { ctx.globalAlpha = 0.55; A.drawSprite(ctx, r.im.spr, r.c.x, r.c.y, r.im.sc); }
    const w = (size * A.TW) / 2 + 5; const hh = (size * A.TH) / 2 + 2.5;
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(255,210,80,0.9)'; ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(255,228,120,${pulse})`; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(r.c.x - w, r.c.y); ctx.lineTo(r.c.x, r.c.y - hh); ctx.lineTo(r.c.x + w, r.c.y); ctx.lineTo(r.c.x, r.c.y + hh); ctx.closePath(); ctx.stroke();
    ctx.restore();
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
      const s3 = S3.get(b.type, b.level, this.state.civ, b.id, b.type === 'academy' ? this.academyVariant() : null, this.treeNeed);
      if (s3) A.drawSprite(ctx, s3, c.x, c.y, 1);
      else A.drawSprite(ctx, A.buildingSprite(b.type, b.level, this.team, this.state.civ, b.id, S3.has(b.type) ? 0 : this.treeNeed * bScale(b)), c.x, c.y, bScale(b));
      if (s3) this.drawOverlay3d(ctx, b, c, t, s3); else this.drawOverlay(ctx, b, c, t);
      if (sel) {
        // voorste randen van de voet in goud, over het gebouw heen: zo zie je duidelijk wat gekozen is
        const pulse = 0.7 + Math.sin(t * 0.006) * 0.25;
        const w = (size * A.TW) / 2 + 5; const hh = (size * A.TH) / 2 + 2.5;
        ctx.save();
        ctx.shadowColor = 'rgba(255,210,80,0.9)'; ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(255,228,120,${pulse})`; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(c.x - w, c.y); ctx.lineTo(c.x, c.y + hh); ctx.lineTo(c.x + w, c.y); ctx.stroke();
        ctx.restore();
      }
      if (job && emit) this.particles.dust(c.x, c.y + 6, 1);
      if (b.type === 'smithy' && emit && Math.random() < 0.6) {
        const [gx, gy] = A.P(0.36, 0.3, 6);
        this.particles.sparks(c.x + gx, c.y + gy, 3);
      }
    }
  }

  // vlag, rook en gloed op de ankerpunten van het 3D-model
  drawOverlay3d(ctx, b, c, t, s3) {
    const a = s3.anchors || {};
    if (a.blades) {
      // wieken van het molentje op de boerderij (draaien)
      ctx.save(); ctx.translate(c.x + a.blades[0], c.y + a.blades[1]); ctx.rotate(t * 0.0015);
      ctx.fillStyle = '#efe6cf'; ctx.strokeStyle = '#6b4527'; ctx.lineWidth = 0.6;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(0, -0.6, 12, 1.2);
        ctx.fillStyle = '#efe6cf'; ctx.fillRect(3, 0.6, 9, 2.6); ctx.strokeRect(3, 0.6, 9, 2.6);
      }
      ctx.fillStyle = '#4d4f54'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (a.flag) A.flag(ctx, c.x + a.flag[0], c.y + a.flag[1], b.type === 'tower' ? 14 : 17, this.team, t + b.id * 300);
    if (a.smoke && (b.type !== 'house' || b.level >= 2 || b.id % 2 === 0)) A.smoke(ctx, c.x + a.smoke[0], c.y + a.smoke[1], t, b.id);
    if (a.glow) {
      if (b.type === 'smithy' || b.type === 'tower') { // vuur van de smidse of het vuurbaken op de toren
        const fl = 0.35 + Math.sin(t * 0.02) * 0.1 + Math.sin(t * 0.047) * 0.08;
        FX.drawGlow(ctx, c.x + a.glow[0], c.y + a.glow[1], 12, FX.FIRE, fl + 0.2);
      } else {
        const k = 0.5 + 0.5 * Math.sin(t * 0.004);
        FX.drawGlow(ctx, c.x + a.glow[0], c.y + a.glow[1], 16, 'rgba(255,220,120,1)', 0.35 + k * 0.35);
      }
    }
  }

  drawOverlay(ctx, b, c, t) {
    const L = b.level;
    const k = bScale(b);
    const at = (x, y, z) => { const [px, py] = A.P(x, y, z); return [c.x + px * k, c.y + py * k]; };
    switch (b.type) {
      case 'tc': {
        const st = A.STYLES[this.state.civ];
        // de kastelen van de volkeren hebben hun eigen vlaggen; anders een vlag op het hoogste punt
        const z = st ? [0, 50, { flat: 70, crenel: 74, pagoda: 76, greek: 72, dome: 82 }[st.roof], null, null][L] : [0, 50, 78, 92, 96][L];
        const [x, y] = L === 1 ? at(0.7, 0, 46) : at(0, 0, z || 0);
        if (L === 1 || z) A.flag(ctx, x, y, 18, this.team, t);
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
