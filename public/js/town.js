// Isometrische weergave van de eigen stad, met wandelende dorpelingen en troepen.
import * as A from './art.js';
import { Camera, isoFns, hashInt } from './iso.js';
import { BUILDINGS, TOWN_GRID, RES } from '../shared/rules.js';
import { canPlaceAt, totalVillagers } from '../shared/sim.js';

const N = TOWN_GRID;
const R = 9;
const { toWorld, toGrid } = isoFns(A.TW, A.TH);
const BAKE = 1.5;

const SPRITE_H = { tc: 120, tower: 115, monument: 130, barracks: 70, house: 60, workshop: 60, smithy: 70 };
const CARRY = { food: '#d9534f', wood: '#8b5a2b', stone: '#b9b4a8', gold: '#f2c230' };

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
    this.state = null;
    this.townKey = null;
    this.team = '#c0392b';
    this.placing = null;
    this.hoverTile = null;
    this.selected = null;
    this.walkers = [];
    this.trees = treeSprites();
    this.onSelect = null;
    this.onPlace = null;
    this.onCancelPlace = null;
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
    this.bakeGround();
  }

  setState(state) {
    this.state = state;
    this.syncWalkers();
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
    // vijver: kies een plek buiten de stad
    const spots = [[-5, 4], [4, -5], [N + 4, 3], [3, N + 4]];
    const pond = spots[Math.floor(hashInt(1, 2, sd) * spots.length)];
    this.pond = { x: pond[0], y: pond[1], r: 2.4 };
    const deposits = spots.filter((s) => s !== pond);
    this.deposits = {
      stone: { x: deposits[0][0], y: deposits[0][1] },
      gold: { x: deposits[1][0], y: deposits[1][1] },
      food: { x: deposits[2][0], y: deposits[2][1] },
    };
    // grastegels
    for (let j = -R; j < N + R; j++) {
      for (let i = -R; i < N + R; i++) {
        const n = hashInt(Math.floor(i / 3), Math.floor(j / 3), sd) * 0.6 + hashInt(i, j, sd + 1) * 0.4;
        let col = A.mix('#78b046', '#93c35a', n);
        if (!this.inBuild(i, j)) col = A.mix('#6ea43f', '#86b84f', n);
        const p = toWorld(i + 0.5, j + 0.5);
        A.diamond(g, p.x, p.y, A.TW + 1, A.TH + 1, col);
      }
    }
    // in grid-ruimte tekenen (cirkels worden isometrische ellipsen)
    g.save();
    g.transform(A.TW / 2, A.TH / 2, -A.TW / 2, A.TH / 2, 0, 0);
    // wegen
    g.strokeStyle = '#c2a36a'; g.lineCap = 'round';
    g.lineWidth = 0.9;
    const mid = N / 2;
    for (const [x0, y0, x1, y1] of [[mid, mid, mid, N + R], [mid, mid, mid, -R], [mid, mid, N + R, mid], [mid, mid, -R, mid]]) {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.globalAlpha = 0.5; g.lineWidth = 1.3; g.strokeStyle = '#b39660';
    for (const [x0, y0, x1, y1] of [[mid, N, mid, N + R], [mid, 0, mid, -R], [N, mid, N + R, mid], [0, mid, -R, mid]]) {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.globalAlpha = 1;
    // dorpsplein
    const grad = g.createRadialGradient(mid, mid, 0.5, mid, mid, 3.2);
    grad.addColorStop(0, '#cdb07a'); grad.addColorStop(0.7, '#c4a46c'); grad.addColorStop(1, 'rgba(196,164,108,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(mid, mid, 3.2, 0, Math.PI * 2); g.fill();
    // rand van het bouwgebied
    g.strokeStyle = 'rgba(255,248,220,0.35)'; g.lineWidth = 0.05; g.setLineDash([0.3, 0.2]);
    g.strokeRect(0, 0, N, N);
    g.setLineDash([]);
    // vijver
    g.fillStyle = '#d9c88e'; g.beginPath(); g.ellipse(this.pond.x, this.pond.y, this.pond.r + 0.35, this.pond.r * 0.8 + 0.35, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4c8fc4'; g.beginPath(); g.ellipse(this.pond.x, this.pond.y, this.pond.r, this.pond.r * 0.8, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6aa8d8'; g.beginPath(); g.ellipse(this.pond.x - 0.4, this.pond.y - 0.3, this.pond.r * 0.6, this.pond.r * 0.4, 0.4, 0, Math.PI * 2); g.fill();
    // grondplekken voor grondstoffen
    for (const k of ['stone', 'gold']) {
      const d = this.deposits[k];
      g.fillStyle = k === 'gold' ? 'rgba(150,120,70,0.5)' : 'rgba(150,145,130,0.5)';
      g.beginPath(); g.arc(d.x, d.y, 1.4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // grassprietjes en bloemen
    for (let k = 0; k < 900; k++) {
      const i = -R + hashInt(k, 3, sd) * (N + 2 * R);
      const j = -R + hashInt(k, 4, sd) * (N + 2 * R);
      if (Math.hypot(i - this.pond.x, j - this.pond.y) < this.pond.r + 0.4) continue;
      if (Math.hypot(i - mid, j - mid) < 3) continue;
      const p = toWorld(i, j);
      const r = hashInt(k, 5, sd);
      if (r < 0.12) {
        g.fillStyle = ['#f4e04d', '#ffffff', '#e86f9a', '#b48cf0'][k % 4];
        g.beginPath(); g.arc(p.x, p.y, 1.3, 0, Math.PI * 2); g.fill();
      } else {
        g.strokeStyle = r < 0.5 ? 'rgba(60,110,30,0.55)' : 'rgba(170,210,110,0.5)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(p.x - 2, p.y); g.lineTo(p.x - 3, p.y - 4); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 5); g.moveTo(p.x + 2, p.y); g.lineTo(p.x + 3, p.y - 4); g.stroke();
      }
    }
    // riet rond de vijver
    for (let k = 0; k < 24; k++) {
      const a = hashInt(k, 9, sd) * Math.PI * 2;
      const rr = this.pond.r * (0.95 + hashInt(k, 10, sd) * 0.25);
      const p = toWorld(this.pond.x + Math.cos(a) * rr, this.pond.y + Math.sin(a) * rr * 0.8);
      g.strokeStyle = '#4f7d2c'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 1, p.y - 8); g.moveTo(p.x + 2, p.y); g.lineTo(p.x + 3, p.y - 6); g.stroke();
      if (k % 3 === 0) { g.fillStyle = '#6b4523'; g.fillRect(p.x - 2, p.y - 10, 2, 4); }
    }
    this.ground = { cv, W, H };

    // decor: bomen, struiken, rotsen
    const decor = [];
    for (let j = -R; j < N + R; j++) {
      for (let i = -R; i < N + R; i++) {
        if (this.inBuild(i, j, 1)) continue;
        const dx = Math.max(-1 - i, i - N, 0); const dy = Math.max(-1 - j, j - N, 0);
        const d = Math.max(dx, dy);
        if (Math.abs(i + 0.5 - mid) < 0.8 || Math.abs(j + 0.5 - mid) < 0.8) continue; // wegen
        if (Math.hypot(i + 0.5 - this.pond.x, j + 0.5 - this.pond.y) < this.pond.r + 0.7) continue;
        let skip = false;
        for (const k of Object.keys(this.deposits)) if (Math.hypot(i + 0.5 - this.deposits[k].x, j + 0.5 - this.deposits[k].y) < 2) skip = true;
        if (skip) continue;
        const p = Math.min(0.92, Math.max(0, (d - 1) / 4.5));
        const r = hashInt(i, j, sd + 77);
        if (r < p) {
          const ox = (hashInt(i, j, sd + 5) - 0.5) * 0.5; const oy = (hashInt(i, j, sd + 6) - 0.5) * 0.5;
          const conif = hashInt(Math.floor(i / 4), Math.floor(j / 4), sd + 8) < 0.45;
          decor.push({ kind: 'tree', gx: i + 0.5 + ox, gy: j + 0.5 + oy, v: (conif ? 0 : 4) + Math.floor(hashInt(i, j, sd + 9) * 4) });
        } else if (r < p + 0.06) {
          decor.push({ kind: hashInt(i, j, 3) < 0.5 ? 'bush' : 'rock', gx: i + 0.5, gy: j + 0.5 });
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
    const n = Math.min(total, 36);
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

  // ---------- soldaten ----------

  soldierSpots() {
    const s = this.state;
    const units = s.units || {};
    const order = ['knight', 'rider', 'sword', 'spear', 'archer', 'scout', 'ram'];
    const total = order.reduce((a, k) => a + (units[k] || 0), 0);
    if (!total) return [];
    const show = Math.min(total, 40);
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
    for (let y = -1; y <= N; y++) for (let x = -1; x <= N; x++) {
      if (occ.has(`${x},${y}`)) continue;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
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
    // poorttorens
    const towers = [];
    const tw = 0.3;
    for (const [x, y] of [[-tw, -tw], [N, -tw], [-tw, N], [N, N],
      [N / 2 - 1 - tw, -tw], [N / 2 + 1, -tw], [-tw, N / 2 - 1 - tw], [-tw, N / 2 + 1],
      [N, N / 2 - 1 - tw], [N, N / 2 + 1], [N / 2 - 1 - tw, N], [N / 2 + 1, N]]) {
      towers.push({ x0: x, y0: y, x1: x + tw, y1: y + tw, tower: true });
    }
    return [...segs, ...towers];
  }

  drawWallPiece(ctx, seg, level) {
    const stone = level >= 3;
    const h = seg.tower ? (stone ? 30 + level * 3 : 26) : (stone ? 16 + level * 2 : 15);
    ctx.save();
    ctx.translate(0, 0);
    if (!stone) {
      A.box(ctx, seg.x0, seg.y0, seg.x1, seg.y1, 0, h, '#9a6a38');
      if (!seg.tower) {
        // puntige palen
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
    ctx.restore();
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
    ctx.fillStyle = '#4f7d33';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.state || !this.ground) return;
    this.updateWalkers(Math.min(dt, 100));
    cam.apply(ctx);
    const gnd = this.ground;
    ctx.drawImage(gnd.cv, this.groundOrigin.x, this.groundOrigin.y, gnd.W, gnd.H);

    const s = this.state;
    // bouwraster tijdens het plaatsen
    if (this.placing) this.drawGrid(ctx);

    const items = [];
    for (const d of this.decor) items.push({ depth: d.gx + d.gy, kind: 'decor', d });
    for (const b of s.buildings) {
      if (b.x < 0) continue;
      const size = BUILDINGS[b.type].size;
      items.push({ depth: b.x + b.y + size, kind: 'building', b });
    }
    const wall = s.buildings.find((b) => b.type === 'wall');
    const wallLevel = wall ? wall.level : 0;
    for (const seg of this.wallSegments(wallLevel)) items.push({ depth: (seg.x0 + seg.x1) / 2 + (seg.y0 + seg.y1) / 2 + 0.2, kind: 'wall', seg });
    for (const w of this.walkers) if (w.wait <= 0 || w.phase === 'work' || w.job === 'idle') items.push({ depth: w.gx + w.gy, kind: 'walker', w });
    for (const sol of this.soldierSpots()) items.push({ depth: sol.gx + sol.gy, kind: 'soldier', sol });
    items.sort((a, b) => a.depth - b.depth);

    const jobs = new Map(s.builds.map((j) => [j.bid, j]));
    for (const it of items) {
      if (it.kind === 'decor') this.drawDecor(ctx, it.d, t);
      else if (it.kind === 'wall') this.drawWallPiece(ctx, it.seg, wallLevel);
      else if (it.kind === 'building') this.drawBuilding(ctx, it.b, jobs.get(it.b.id), t, now);
      else if (it.kind === 'walker') this.drawWalker(ctx, it.w, t);
      else this.drawSoldier(ctx, it.sol, ...Object.values(toWorld(it.sol.gx, it.sol.gy)), t);
    }

    // wolkenschaduwen
    for (let i = 0; i < 4; i++) {
      const sp = 0.012 + i * 0.003;
      const cx = ((t * sp + i * 700) % 2600) - 1300;
      const cy = 150 + i * 160 - 400 + Math.sin(i * 2) * 100;
      ctx.fillStyle = 'rgba(20,35,10,0.07)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 200, 220 + i * 30, 90, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (this.placing && this.hoverTile) this.drawGhost(ctx);
    if (wall && jobs.has(wall.id)) this.drawWallProgress(ctx, jobs.get(wall.id), now);
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

  drawBuilding(ctx, b, job, t, now) {
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
      // bouwvakker
      A.person(ctx, c.x + 14, c.y + 6, { s: 0.9, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', phase: t * 0.01 });
    } else {
      A.drawSprite(ctx, A.buildingSprite(b.type, b.level, this.team), c.x, c.y);
      this.drawOverlay(ctx, b, c, t);
    }
    if (job) this.drawProgress(ctx, c.x, c.y - (b.level === 0 ? 50 : (SPRITE_H[b.type] || 60)), job, now);
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
      default:
    }
  }

  drawProgress(ctx, x, y, job, now) {
    const p = Math.min(1, Math.max(0, (now - job.start) / (job.end - job.start)));
    const w = 46;
    ctx.fillStyle = 'rgba(30,20,10,0.75)';
    ctx.beginPath(); ctx.roundRect(x - w / 2 - 2, y - 2, w + 4, 8, 4); ctx.fill();
    ctx.fillStyle = '#f2c230';
    ctx.beginPath(); ctx.roundRect(x - w / 2, y, Math.max(3, w * p), 4, 2); ctx.fill();
    // hamertje
    ctx.fillStyle = '#e8dcc0'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🔨', x - w / 2 - 9, y + 6);
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
