// Het slagveld van een belegering: de echte stad van de verdediger (getekend door TownView, met zijn grond,
// bomen, gebouwen, muren en poorten) met daarin de troepen van beide kanten, pijlen, puin en het plein.
import * as A from './art.js';
import * as FIG from './figures.js';
import { TownView } from './town.js';
import { isoFns } from './iso.js';
import { UNITS } from '../shared/rules.js';
import { tileOf } from '../shared/territory.js';
import { FB, nav, inZone, cellOf, isRangedK, mobile } from '../shared/fieldbattle.js';

const { toWorld, toGrid } = isoFns(A.TW, A.TH);
const TAU = Math.PI * 2;
const isCav = (k) => UNITS[k] && UNITS[k].type === 'cav';
const EMPTY_V = { idle: 0, food: 0, wood: 0, stone: 0, gold: 0 };

// de stad zoals TownView ze verwacht (zonder dorpelingen, soldaten of oorlogsmist)
function fakeTown(v) {
  const base = { t: 0, builds: [], queues: {}, units: {}, villagers: { ...EMPTY_V }, field: [], harvests: [], nodes: [] };
  if (v.camp) {
    return { ...base, civ: null, walls: [], gates: [],
      buildings: [{ id: 1, type: 'tc', x: -99, y: -99, level: 3, hide: true }, { id: 2, type: 'wall', x: -1, y: -1, level: 0 }],
      terr: { seed: v.seed, cl: [], lots: [], fights: [] } };
  }
  return { ...base, civ: v.civ || null, buildings: v.buildings.map((b) => ({ ...b })), walls: [...(v.walls || [])], gates: [...(v.gates || [])],
    terr: { seed: v.seed, cl: v.cl || [], lots: v.lots || [], fights: [] } };
}

export class SiegeView extends TownView {
  constructor(canvas, bv) {
    super(canvas);
    this.battleMode = true;
    this.bv = bv;
    this.key = null;
    this.lastW = new Map();
    this.dirs = new Map();
    this.cam.onClick = (sx, sy, e) => bv.click(sx, sy, e);
    this.cam.onRightClick = (sx, sy) => bv.command(sx, sy);
    this.cam.onLongPress = (sx, sy) => bv.longPress(sx, sy);
    this.cam.onHover = (sx, sy) => { this.hoverS = sx < 0 ? null : { x: sx, y: sy }; };
  }

  // de gewone stadsklikken doen hier niets
  click() {}
  longPress() {}
  updateCursor() {}

  setBattle(st) {
    const meta = st.meta || {};
    const v = (meta.view && (meta.view.camp || meta.view.buildings)) ? meta.view : { seed: 50000, camp: true };
    const key = `${v.seed}|${st.t0}`;
    const defColor = (meta.def && meta.def.color) || '#c0392b';
    if (this.key !== key) {
      this.key = key;
      this.view = v;
      this.fake = fakeTown(v);
      this.wallsOrig = [...this.fake.walls]; this.gatesOrig = [...this.fake.gates];
      this.townKey = null;
      this.bst = st;
      this.setTown(v.seed, defColor);
      this.setState(this.fake);
      const b = st.box;
      const pts = [toWorld(b.x0, b.y0), toWorld(b.x0 + b.w, b.y0), toWorld(b.x0, b.y0 + b.h), toWorld(b.x0 + b.w, b.y0 + b.h)];
      this.cam.bounds = { x0: Math.min(...pts.map((p) => p.x)) + 60, x1: Math.max(...pts.map((p) => p.x)) - 60, y0: Math.min(...pts.map((p) => p.y)) + 40, y1: Math.max(...pts.map((p) => p.y)) - 20 };
      this.zoneKey = null; this.deadWalls = -1;
      this.focus(st);
    }
    this.team = defColor;
    this.syncDamage(st);
  }

  // bomen die het leger voor de slag kapte (open veld voor de muur), niet tekenen
  refreshTrees() {
    super.refreshTrees();
    const st = this.bst;
    if (!st || !this.visTrees) return;
    this.visTrees = this.visTrees.filter((t) => { const c = cellOf(st, t.i + 0.5, t.j + 0.5); return c < 0 || st.grid[c] === 'f'; });
    this.stumps = [];
  }

  // camera op je eigen troepen (en een beetje richting de stad)
  focus(st) {
    const mine = st.units.filter((u) => u.s === this.bv.side && u.hp > 0 && mobile(u));
    const c = mine.length ? { x: mine.reduce((a, u) => a + u.x, 0) / mine.length, y: mine.reduce((a, u) => a + u.y, 0) / mine.length } : st.plaza;
    const f = this.bv.side === 0 ? 0.35 : 0;
    const p = toWorld(c.x + (st.plaza.x - c.x) * f, c.y + (st.plaza.y - c.y) * f);
    this.cam.resize();
    this.cam.zoom = this.cam.w < 700 ? 0.8 : 1.05;
    this.cam.x = p.x; this.cam.y = p.y - 20;
    this.cam.clamp();
  }

  // gesloopte muren en torens verdwijnen uit de tekening van de stad
  syncDamage(st) {
    let dead = 0;
    for (const w of st.walls) if (w.hp <= 0) dead++;
    if (dead !== this.deadWalls) {
      this.deadWalls = dead;
      const gone = new Set(st.walls.filter((w) => w.hp <= 0).map((w) => `${w.i},${w.j}`));
      const alive = (list) => list.filter((idx) => { const p = tileOf(idx); return !gone.has(`${p.i},${p.j}`); });
      this.fake.walls = alive(this.wallsOrig); this.fake.gates = alive(this.gatesOrig);
    }
    for (const u of st.units) {
      if (u.k !== 'tower' || u.hp > 0) continue;
      const b = this.fake.buildings.find((x) => x.id === u.b);
      if (b && !b.hide) b.hide = true;
    }
  }

  // poort: open zolang er verdedigers vlakbij zijn
  gateOpenness(seg) {
    if (!this.gateOpen) this.gateOpen = new Map();
    const st = this.bv.state;
    let near = false;
    if (st) {
      for (const u of st.units) {
        if (u.s !== 1 || u.hp <= 0 || !mobile(u)) continue;
        const p = this.bv.pos(u);
        if (Math.abs(p.x - seg.i - 0.5) < 1.3 && Math.abs(p.y - seg.j - 0.5) < 1.3) { near = true; break; }
      }
    }
    const tnow = performance.now();
    const g = this.gateOpen.get(seg.idx) || { v: 0, at: tnow };
    const dt = Math.min(200, tnow - g.at);
    g.v = near ? Math.min(1, g.v + dt / 450) : Math.max(0, g.v - dt / 700);
    g.at = tnow;
    this.gateOpen.set(seg.idx, g);
    return g.v * g.v * (3 - 2 * g.v);
  }

  wallZ() {
    const L = this.bv.state ? this.bv.state.wallL || 1 : 1;
    return L >= 3 ? 16 + L * 2 : 15;
  }

  // staat deze eenheid (op dit moment, op het scherm) op de muur?
  zOf(u, p) {
    if (u.s !== 1 || !mobile(u)) return 0;
    const st = this.bv.state;
    const c = cellOf(st, p.x, p.y);
    if (c < 0) return 0;
    const nv = nav(st);
    return nv.p1[c] === 3 ? this.wallZ() : 0;
  }

  // ---------- onder de troepen: opstelplaats, plein, looplijnen ----------
  underlay(ctx, t, now) {
    const bv = this.bv; const st = bv.state;
    if (!st) return;
    const nv = nav(st);
    // opstelplaats tijdens de opstelling
    if (st.phase === 'deploy' && bv.manual) {
      const zk = `${bv.side}|${st.nv}`;
      if (this.zoneKey !== zk) {
        this.zoneKey = zk;
        this.zone = [];
        const set = new Set();
        for (let c = 0; c < nv.N; c++) if (inZone(st, nv, bv.side, c)) { this.zone.push(c); set.add(c); }
        // rand van het gebied: zijden van een zonetegel waar geen zonetegel naast ligt
        this.zoneEdge = [];
        const w = st.box.w;
        for (const c of this.zone) {
          const i = st.box.x0 + (c % w); const j = st.box.y0 + Math.floor(c / w);
          if (!set.has(c - w) || c < w) this.zoneEdge.push([i, j, i + 1, j]);
          if (!set.has(c + w)) this.zoneEdge.push([i, j + 1, i + 1, j + 1]);
          if (c % w === 0 || !set.has(c - 1)) this.zoneEdge.push([i, j, i, j + 1]);
          if ((c + 1) % w === 0 || !set.has(c + 1)) this.zoneEdge.push([i + 1, j, i + 1, j + 1]);
        }
      }
      const pulse = 0.26 + Math.sin(t * 0.004) * 0.06;
      ctx.fillStyle = bv.side ? `rgba(120,200,255,${pulse})` : `rgba(255,220,90,${pulse})`;
      ctx.beginPath();
      for (const c of this.zone) {
        const i = st.box.x0 + (c % st.box.w); const j = st.box.y0 + Math.floor(c / st.box.w);
        const a = toWorld(i, j); const b = toWorld(i + 1, j); const d = toWorld(i + 1, j + 1); const e = toWorld(i, j + 1);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = bv.side ? 'rgba(150,215,255,0.95)' : 'rgba(255,225,110,0.95)'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (const [i0, j0, i1, j1] of this.zoneEdge) { const a = toWorld(i0, j0); const b = toWorld(i1, j1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    // het plein: wie het lang genoeg houdt, wint
    const P = toWorld(st.plaza.x, st.plaza.y);
    const rx = FB.capR * A.TW * 0.5 * 1.41; const ry = rx / 2;
    ctx.save();
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1.6;
    ctx.strokeStyle = st.cap > 0 ? 'rgba(255,90,60,0.85)' : 'rgba(255,240,200,0.45)';
    ctx.beginPath(); ctx.ellipse(P.x, P.y, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (st.cap > 0) {
      ctx.strokeStyle = 'rgba(255,90,60,0.95)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(P.x, P.y, rx + 4, ry + 2, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, st.cap / FB.capMs)); ctx.stroke();
    }
    ctx.restore();
    // looplijnen van de gekozen troepen
    if (bv.sel.size) {
      ctx.save(); ctx.setLineDash([4, 5]); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(255,240,180,0.55)';
      const goals = new Map();
      for (const id of bv.sel) {
        const u = bv.unit(id);
        if (!u || u.hp <= 0 || !u.path || !u.path.length) continue;
        const p = bv.pos(u); const a = toWorld(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        for (const q of u.path) { const b = toWorld(q[0], q[1]); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
        const end = u.path[u.path.length - 1];
        goals.set(`${Math.round(end[0] * 2)},${Math.round(end[1] * 2)}`, end);
      }
      ctx.setLineDash([]);
      for (const g of goals.values()) {
        const b = toWorld(g[0], g[1]);
        ctx.fillStyle = 'rgba(150,240,120,0.5)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 4, 2, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // waar je net een bevel gaf
    const m = bv.mark;
    if (m && performance.now() - m.at < 900) {
      const f = (performance.now() - m.at) / 900;
      const p = toWorld(m.x, m.y);
      ctx.strokeStyle = m.attack ? `rgba(230,60,40,${1 - f})` : m.warn ? `rgba(255,170,40,${1 - f})` : `rgba(150,240,120,${1 - f})`;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y, 8 + f * 18, 4 + f * 9, 0, 0, TAU); ctx.stroke();
    }
  }

  // ---------- de troepen tussen de gebouwen ----------
  battleItems(items, now, inView) {
    const bv = this.bv; const st = bv.state;
    if (!st) return;
    const bt = now - st.t0;
    const t = this.frameT;
    const meta = st.meta || {};
    this.colors = [(meta.att && meta.att.color) || '#2e6fb5', (meta.def && meta.def.color) || '#c0392b'];
    // puin van gesloopte muren en poorten
    for (const w of st.walls) {
      if (w.hp > 0) continue;
      items.push({ depth: w.i + w.j + 1, kind: 'x', draw: (ctx) => this.drawRubble(ctx, w.i + 0.5, w.j + 0.5, w.i * 31 + w.j, w.g ? 1.2 : 1, bt - (w.died || 0)) });
    }
    // tenten en een kampvuur bij een roverskamp
    if (st.tents) {
      for (const tn of st.tents) {
        const p = toWorld(tn.i + 0.5, tn.j + 0.5);
        items.push({ depth: tn.i + tn.j + 1, kind: 'x', draw: (ctx) => A.tent(ctx, p.x, p.y + 4, 2.1, '#7a1b12') });
      }
      const fp = toWorld(st.plaza.x, st.plaza.y);
      items.push({ depth: st.plaza.x + st.plaza.y - 0.5, kind: 'x', draw: (ctx) => A.fire(ctx, fp.x, fp.y, 1.6, t) });
    }
    for (const u of st.units) {
      if (u.k === 'tower') {
        if (u.hp <= 0) items.push({ depth: u.x + u.y + 0.5, kind: 'x', draw: (ctx) => this.drawRubble(ctx, u.x, u.y, u.id * 7, 1.6, bt - (u.died || 0), true) });
        continue;
      }
      if (u.hp <= 0 && (u.died == null || bt - u.died > 6000)) continue;
      const p = bv.pos(u);
      const w = toWorld(p.x, p.y);
      if (!inView(w)) continue;
      const z = u.hp > 0 ? this.zOf(u, p) : 0;
      items.push({ depth: p.x + p.y + (z ? 1.9 : 0), kind: 'x', draw: (ctx) => this.drawUnit(ctx, u, p, w, z, t, bt) });
    }
  }

  drawRubble(ctx, x, y, seed, s, age, tower = false) {
    const c = toWorld(x, y);
    let r = (((Math.floor(seed) * 9301 + 49297) % 233280) + 233280) % 233280; // ook voor negatieve tegels positief
    const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const stone = (this.bv.state.wallL || 1) >= 3 || tower;
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = stone ? ['#9b9282', '#b4ab98', '#7e766a'][i % 3] : ['#7a5129', '#5e3d1d', '#8f6436'][i % 3];
      ctx.beginPath(); ctx.ellipse(c.x + (R() - 0.5) * 30 * s, c.y + (R() - 0.5) * 12 * s, (3 + R() * 4) * s, (2 + R() * 2) * s, R() * 3, 0, TAU); ctx.fill();
    }
    if (age < 5000) A.smoke(ctx, c.x, c.y - 6, this.frameT, seed, 0.9);
  }

  drawUnit(ctx, u, p, w, z, t, bt) {
    const bv = this.bv;
    const x = w.x; const y = w.y - z;
    const color = this.colors[u.s];
    // richting: loopt hij naar links of rechts op het scherm, of kijkt hij naar zijn doelwit?
    const lw = this.lastW.get(u.id);
    this.lastW.set(u.id, { x: w.x, y: w.y });
    const moving = u.hp > 0 && lw && Math.abs(lw.x - w.x) + Math.abs(lw.y - w.y) > 0.12;
    let dir = this.dirs.get(u.id) || (u.s ? -1 : 1);
    const tg = u.tg != null ? bv.unit(u.tg) : null;
    if (moving && Math.abs(lw.x - w.x) > 0.06) dir = w.x > lw.x ? 1 : -1;
    else if (tg) dir = toWorld(tg.x, tg.y).x >= w.x ? 1 : -1;
    else if (u.tw >= 0 && bv.state.walls[u.tw]) dir = toWorld(bv.state.walls[u.tw].i + 0.5, bv.state.walls[u.tw].j + 0.5).x >= w.x ? 1 : -1;
    this.dirs.set(u.id, dir);
    if (u.hp <= 0) {
      const a = Math.min(1, (bt - u.died) / 6000);
      ctx.save(); ctx.globalAlpha = 1 - a * 0.9;
      ctx.translate(x, y); ctx.rotate(-dir * Math.min(1.45, (bt - u.died) / 260)); ctx.translate(-x, -y);
      this.figure(ctx, u, x, y, t, false, dir, color);
      ctx.restore();
      return;
    }
    const cav = isCav(u.k);
    // kleur van de kant onder de voeten, ring rond selectie en doelwit
    ctx.fillStyle = color; ctx.globalAlpha = 0.38;
    ctx.beginPath(); ctx.ellipse(x, y + 0.5, cav ? 10 : 7, cav ? 4.6 : 3.4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (bv.sel.has(u.id)) { ctx.strokeStyle = 'rgba(255,228,90,0.95)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y + 0.5, cav ? 12 : 9, cav ? 5.6 : 4.4, 0, 0, TAU); ctx.stroke(); }
    if (bv.hoverU === u || bv.targets.has(u.id)) { ctx.strokeStyle = 'rgba(235,60,40,0.95)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 11, 5, 0, 0, TAU); ctx.stroke(); }
    const age = bt - (u.at ?? -1e9);
    const swing = u.at >= 0 && age >= 0 && age < 340 && !isRangedK(u.k) ? Math.sin((age / 340) * Math.PI) : 0;
    const lx = swing ? dir * swing * 3 : 0;
    this.figure(ctx, u, x + lx, y, t, moving || swing > 0, dir, color);
    // levens en aantal
    const max = u.hp0 * (u.n || 1);
    const tall = u.k === 'elephant' ? 54 : cav ? 40 : u.k === 'ram' || u.k === 'stonethrower' ? 28 : 32;
    if (u.hp < max - 0.01) {
      const bw = u.k === 'elephant' ? 20 : 13;
      const frac = Math.max(0, u.hp / max);
      ctx.fillStyle = 'rgba(20,12,6,0.72)'; ctx.fillRect(x - bw / 2 - 1, y - tall - 1, bw + 2, 4);
      ctx.fillStyle = u.s === bv.side ? (frac > 0.6 ? '#62d44c' : frac > 0.3 ? '#f2c230' : '#e2452f') : (frac > 0.3 ? '#e2452f' : '#9b1c12');
      ctx.fillRect(x - bw / 2, y - tall, bw * frac, 2);
    }
  }

  figure(ctx, u, x, y, t, moving, dir, team) {
    const k = u.k;
    const o = { s: 1.05, team, phase: t * 0.012 + u.id, walking: moving };
    const flip = dir < 0;
    if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    if (k === 'stonethrower') A.stoneThrower(ctx, x, y, 0.8, t);
    else if (k === 'barbarian') A.person(ctx, x, y, { ...o, body: u.id % 2 ? '#4f3a2a' : '#5b4636', weapon: u.id % 3 === 2 ? 'spear' : 'sword', barb: true, skin: 1 + (u.id % 3), team: null });
    else if (k === 'villager') A.person(ctx, x, y, { ...o, s: 0.95, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: 'axe' });
    else if (!FIG.uniqueUnit(ctx, k, x, y, o)) {
      switch (k) {
        case 'spear': A.person(ctx, x, y, { ...o, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }); break;
        case 'sword': A.person(ctx, x, y, { ...o, body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }); break;
        case 'archer': A.person(ctx, x, y, { ...o, body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }); break;
        case 'scout': A.horseman(ctx, x, y, { s: 0.8, team, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b', walking: moving, phase: o.phase }); break;
        case 'rider': A.horseman(ctx, x, y, { s: 0.85, team, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear', horse: '#7b4f2c', walking: moving, phase: o.phase }); break;
        case 'knight': A.horseman(ctx, x, y, { s: 0.9, team, body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530', walking: moving, phase: o.phase }); break;
        case 'ram': A.ram(ctx, x, y, 0.9); break;
        default: A.person(ctx, x, y, o);
      }
    }
    if (flip) ctx.restore();
  }

  // ---------- bovenop: pijlen, levens van torens en muren ----------
  overlay(ctx, t, now) {
    const bv = this.bv; const st = bv.state;
    if (!st) return;
    const bt = now - st.t0;
    for (const u of st.units) {
      // schoten van schutters, torens en stenenwerpers
      if (u.at != null && u.at >= 0 && (isRangedK(u.k) || u.k === 'stonethrower') && (u.hp > 0 || u.k === 'tower')) {
        const fly = u.k === 'stonethrower' ? 650 : 420;
        const age = bt - u.at;
        if (age >= 0 && age <= fly) {
          const p = u.k === 'tower' ? { x: u.x, y: u.y } : bv.pos(u);
          const a = toWorld(p.x, p.y); const b = toWorld(u.ax, u.ay);
          const ay = a.y - (u.k === 'tower' ? 70 : 16 + this.zOf(u, p)); const by = b.y - 10;
          const f = age / fly;
          const arc = Math.min(50, Math.hypot(b.x - a.x, by - ay) * 0.25);
          const x = a.x + (b.x - a.x) * f; const y = ay + (by - ay) * f - Math.sin(f * Math.PI) * arc;
          const ang = Math.atan2((by - ay) - Math.cos(f * Math.PI) * arc * Math.PI, b.x - a.x);
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          if (u.k === 'stonethrower') { ctx.fillStyle = '#8f887c'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
          else {
            ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(5, 0); ctx.stroke();
            ctx.fillStyle = '#d5dbe2'; ctx.beginPath(); ctx.moveTo(6.5, 0); ctx.lineTo(4.2, -1.4); ctx.lineTo(4.2, 1.4); ctx.fill();
          }
          ctx.restore();
        }
      }
      // torens: levensbalk
      if (u.k === 'tower' && u.hp > 0 && u.hp < u.hp0) {
        const c = toWorld(u.x, u.y);
        const frac = u.hp / u.hp0; const bw = 36;
        ctx.fillStyle = 'rgba(20,12,6,0.72)'; ctx.fillRect(c.x - bw / 2 - 1, c.y - 108, bw + 2, 5);
        ctx.fillStyle = bv.side === 1 ? '#62d44c' : '#e2452f'; ctx.fillRect(c.x - bw / 2, c.y - 107, bw * frac, 3);
        if (frac < 0.5) A.smoke(ctx, c.x + 4, c.y - 80, t, u.id, 0.8);
      }
    }
    // beschadigde muren en poorten
    for (const w of st.walls) {
      if (w.hp <= 0 || w.hp >= w.hp0) continue;
      const c = toWorld(w.i + 0.5, w.j + 0.5);
      const frac = w.hp / w.hp0; const bw = 26; const top = c.y - this.wallZ() - (w.g ? 20 : 12);
      ctx.fillStyle = 'rgba(20,12,6,0.7)'; ctx.fillRect(c.x - bw / 2 - 1, top - 1, bw + 2, 4);
      ctx.fillStyle = frac > 0.5 ? '#d9c68a' : '#e2452f'; ctx.fillRect(c.x - bw / 2, top, bw * frac, 2);
      const prev = this.wallHp ? this.wallHp.get(w) : null;
      if (prev != null && w.hp < prev) this.particles.dust(c.x, c.y - 8, 3);
    }
    this.wallHp = new Map(st.walls.map((w) => [w, w.hp]));
    // gekozen muurstuk om aan te vallen
    if (bv.hoverWall != null && st.walls[bv.hoverWall]) {
      const w = st.walls[bv.hoverWall];
      const a = toWorld(w.i, w.j); const b = toWorld(w.i + 1, w.j); const d = toWorld(w.i + 1, w.j + 1); const e = toWorld(w.i, w.j + 1);
      ctx.strokeStyle = 'rgba(235,60,40,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.stroke();
    }
  }

  // schermpunt → tegel (ook als je op de voorkant van een muur tikt)
  screenTile(sx, sy) {
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    return { gx: g.gx, gy: g.gy, wx: w.x, wy: w.y, low: toGrid(w.x, w.y + this.wallZ()) };
  }
}

export { toWorld };
