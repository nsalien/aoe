// Isometrische wereldkaart met terrein, steden, roverskampen en legers onderweg.
import * as A from './art.js';
import * as FX from './fx.js';
import { Camera, isoFns, hashInt } from './iso.js';
import { generateTerrain } from '../shared/worldgen.js';
import { bakeWorld, WTW, WTH } from './worldmap.js';

export { WTW, WTH };
const { toWorld } = isoFns(WTW, WTH);

export class WorldView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = new Camera(canvas, { zoom: 1.2, minZoom: 0.35, maxZoom: 3 });
    this.towns = [];
    this.camps = [];
    this.teams = new Map();
    this.marches = [];
    this.myTownId = null;
    this.myTeamId = null;
    this.selected = null;
    this.hover = null;
    this.onSelect = null;
    this.bakedKey = null;
    this.cam.onClick = (sx, sy) => {
      const hit = this.pick(sx, sy);
      this.selected = hit;
      if (this.onSelect) this.onSelect(hit);
    };
    this.cam.onHover = (sx, sy) => {
      this.hover = sx < 0 ? null : this.pick(sx, sy);
      this.canvas.style.cursor = this.hover ? 'pointer' : 'grab';
    };
  }

  setWorld(seed, size) {
    if (this.seed === seed && this.size === size) return;
    this.seed = seed; this.size = size;
    this.terrain = generateTerrain(seed, size);
    const l = toWorld(0, size); const r = toWorld(size, 0); const b = toWorld(size, size);
    this.cam.bounds = { x0: l.x + 100, x1: r.x - 100, y0: 60, y1: b.y - 60 };
    this.water = [];
    this.shore = [];
    const wb = { x0: l.x, x1: r.x, y0: 0, y1: b.y };
    this.particles = new FX.Particles(FX.LOW_POWER ? 150 : 300);
    this.birds = new FX.Birds(wb);
    this.clouds = new FX.Clouds({ x0: l.x - 300, x1: r.x, y0: -100, y1: b.y - 100 }, FX.LOW_POWER ? 6 : 11);
    this.dustT = 0;
    this.bakedKey = null;
  }

  // hoogte van het landschap op een punt (tegelcoördinaten)
  hAt(gx, gy) {
    return this.bakeInfo ? this.bakeInfo.hAt(gx, gy) : 0;
  }

  setData(data, myTownId, myTeamId) {
    this.towns = data.towns;
    this.camps = data.camps;
    this.teams = new Map(data.teams.map((t) => [t.id, t]));
    this.myTownId = myTownId;
    this.myTeamId = myTeamId;
    const key = [...data.towns.map((t) => `${t.x},${t.y}`), ...data.camps.map((c) => `${c.x},${c.y}`)].join('|');
    if (key !== this.bakedKey) { this.bakedKey = key; this.bake(); }
    if (this.selected) {
      const s = this.selected;
      const list = s.kind === 'town' ? this.towns : this.camps;
      const found = list.find((x) => x.id === s.obj.id);
      if (found) this.selected = { kind: s.kind, obj: found };
    }
  }

  setMarches(marches) { this.marches = marches || []; }

  bake() {
    const small = window.innerWidth < 800;
    const res = bakeWorld({
      seed: this.seed, size: this.size, tiles: this.terrain.tiles, towns: this.towns, camps: this.camps,
      scale: small ? 1 : 1.5, R: small ? 6 : FX.LOW_POWER ? 7 : 9,
    });
    this.bakeInfo = res;
    this.shore = res.shore;
    const nWaves = FX.LOW_POWER ? 260 : 520;
    this.water = res.water.slice(0, nWaves);
  }

  townPos(t) {
    const w = toWorld(t.x + 0.5, t.y + 0.5);
    return { x: w.x, y: w.y - this.hAt(t.x + 0.5, t.y + 0.5) };
  }

  pick(sx, sy) {
    let best = null; let bd = 26;
    for (const t of this.towns) {
      const p = this.townPos(t); const s = this.cam.worldToScreen(p.x, p.y - 10);
      const d = Math.hypot(s.x - sx, s.y - sy) / Math.max(0.6, this.cam.zoom);
      if (d < bd) { bd = d; best = { kind: 'town', obj: t }; }
    }
    for (const c of this.camps) {
      const p = this.townPos(c); const s = this.cam.worldToScreen(p.x, p.y - 6);
      const d = Math.hypot(s.x - sx, s.y - sy) / Math.max(0.6, this.cam.zoom);
      if (d < bd) { bd = d; best = { kind: 'camp', obj: c }; }
    }
    return best;
  }

  centerOnTile(x, y) {
    const w = toWorld(x + 0.5, y + 0.5);
    this.cam.x = w.x; this.cam.y = w.y;
  }

  teamColor(id) {
    const t = this.teams.get(id);
    return t ? t.color : '#888';
  }

  draw(t, dt, now) {
    const ctx = this.ctx;
    const cam = this.cam;
    cam.resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#245a8e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.bakeInfo) return;
    dt = Math.min(dt, 100);
    if (Math.floor(t / 1000) !== this.lightSecond) { this.lightSecond = Math.floor(t / 1000); this.light = FX.daylight(); }
    const light = this.light || FX.daylight();
    const night = light.dark;
    this.particles.update(dt);
    this.birds.update(dt);
    this.clouds.update(dt);
    cam.apply(ctx);
    const bk = this.bakeInfo;
    ctx.drawImage(bk.cv, bk.ox, bk.oy, bk.W, bk.H);

    // golfjes die op het strand aanspoelen
    ctx.lineCap = 'round'; ctx.lineWidth = 1.1;
    for (const e of this.shore) {
      const p = (t * 0.00022 + e.ph) % 1;
      const a = Math.sin(p * Math.PI) * 0.42;
      if (a < 0.04) continue;
      const off = (1 - p) * 6;
      const x = e.x + e.nx * off; const y = e.y + e.ny * off;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(x + e.ny * 3.5, y - e.nx * 3.5);
      ctx.quadraticCurveTo(x - e.nx * 1.2, y - e.ny * 1.2, x - e.ny * 3.5, y + e.nx * 3.5);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // golfjes
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    for (const w of this.water) {
      const a = Math.sin(t * 0.0018 + w.p);
      if (a < 0.4) continue;
      const p = toWorld(w.x, w.y);
      const drift = Math.sin(t * 0.0005 + w.p) * 3;
      ctx.globalAlpha = (a - 0.4) * 1.3;
      ctx.beginPath(); ctx.moveTo(p.x - 4 + drift, p.y - 4); ctx.quadraticCurveTo(p.x + drift, p.y - 7, p.x + 4 + drift, p.y - 4); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // gebieden van teams
    for (const tw of this.towns) {
      const p = this.townPos(tw);
      const col = this.teamColor(tw.teamId);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.transform(WTW / 2, WTH / 2, -WTW / 2, WTH / 2, 0, 0);
      const g = ctx.createRadialGradient(0, 0, 0.4, 0, 0, 2.1);
      g.addColorStop(0, A.mix(col, '#ffffff', 0.2)); g.addColorStop(1, col);
      ctx.beginPath(); ctx.arc(0, 0, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.globalAlpha = 0.18; ctx.fill();
      ctx.globalAlpha = 0.8; ctx.lineWidth = 0.07; ctx.setLineDash([0.25, 0.15]); ctx.lineDashOffset = -t * 0.0002; ctx.strokeStyle = col; ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // marsroutes
    for (const m of this.marches) this.drawRoute(ctx, m, t);
    this.clouds.drawShadows(ctx, 0.14 * (1 - night * 0.8));

    const items = [];
    for (const tw of this.towns) items.push({ d: tw.x + tw.y, kind: 'town', o: tw });
    for (const c of this.camps) items.push({ d: c.x + c.y, kind: 'camp', o: c });
    this.dustT += dt;
    const emit = this.dustT > 260;
    if (emit) this.dustT = 0;
    for (const m of this.marches) {
      const pos = this.marchPos(m, now);
      if (!pos) continue;
      items.push({ d: pos.gx + pos.gy, kind: 'march', o: m, pos });
      if (emit && m.kind !== 'trade') {
        const w = toWorld(pos.gx, pos.gy);
        this.particles.dust(w.x - pos.dir * 8, w.y - this.hAt(pos.gx, pos.gy) + 1, 1);
      }
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) {
      if (it.kind === 'town') this.drawTown(ctx, it.o, t);
      else if (it.kind === 'camp') this.drawCamp(ctx, it.o, t, now);
      else this.drawMarch(ctx, it.o, it.pos, t);
    }
    this.particles.draw(ctx);
    this.birds.draw(ctx, t, 60);

    // nacht: donker maken en dan lichtjes
    FX.applyLight(ctx, this.canvas.width, this.canvas.height, light);
    cam.apply(ctx);
    if (night > 0.05) this.drawNightLights(ctx, t, now, night);

    // wolken boven alles, doorzichtiger als je inzoomt
    const cloudAlpha = Math.max(0.12, Math.min(0.85, 1.25 - cam.zoom * 0.55)) * (1 - night * 0.6);
    this.clouds.draw(ctx, cloudAlpha);

    // labels in schermruimte
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    for (const tw of this.towns) this.drawTownLabel(ctx, tw, now);
    if (cam.zoom > 0.75) for (const c of this.camps) this.drawCampLabel(ctx, c, now);
  }

  drawNightLights(ctx, t, now, night) {
    for (const tw of this.towns) {
      const p = this.townPos(tw);
      FX.drawGlow(ctx, p.x, p.y - 6, 30, FX.WARM, night * 0.28);
      for (const part of this.townParts(tw)) {
        const lights = part.spr.lights || [];
        for (let i = 0; i < lights.length; i += 2) {
          const [lx, ly] = lights[i];
          const fl = 0.75 + Math.sin(t * 0.003 + lx + tw.id) * 0.2;
          const x = part.x + lx * part.scale; const y = part.y + ly * part.scale;
          ctx.fillStyle = `rgba(255,214,120,${night * fl})`;
          ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
          FX.drawGlow(ctx, x, y, 4, FX.WARM, night * fl * 0.35);
        }
      }
    }
    for (const c of this.camps) {
      if (c.plundered) continue;
      const p = this.townPos(c);
      FX.drawGlow(ctx, p.x + 1, p.y - 2, 30, FX.FIRE, night * (0.8 + Math.sin(t * 0.013 + c.id) * 0.15));
    }
    for (const m of this.marches) {
      const pos = this.marchPos(m, now);
      if (!pos) continue;
      const w = toWorld(pos.gx, pos.gy);
      FX.drawGlow(ctx, w.x, w.y - this.hAt(pos.gx, pos.gy) - 10, 16, FX.FIRE, night * 0.8);
    }
  }

  drawRoute(ctx, m, t) {
    const from = toWorld(m.from.x + 0.5, m.from.y + 0.5);
    const to = toWorld(m.to.x + 0.5, m.to.y + 0.5);
    const fh = this.hAt(m.from.x + 0.5, m.from.y + 0.5); const th = this.hAt(m.to.x + 0.5, m.to.y + 0.5);
    const hostile = !m.ally;
    ctx.save();
    ctx.strokeStyle = hostile ? '#ff3b30' : (m.own ? '#ffe28a' : this.teamColor(m.teamId));
    ctx.globalAlpha = hostile ? 0.6 + Math.sin(t * 0.008) * 0.3 : 0.75;
    ctx.lineWidth = hostile ? 2.4 : 1.8;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 0.02 * (m.status === 'back' ? -1 : 1);
    ctx.beginPath(); ctx.moveTo(from.x, from.y - fh); ctx.lineTo(to.x, to.y - th); ctx.stroke();
    ctx.restore();
  }

  marchPos(m, now) {
    const p = Math.min(1, Math.max(0, (now - m.departAt) / Math.max(1, m.arriveAt - m.departAt)));
    const a = m.status === 'back' ? m.to : m.from;
    const b = m.status === 'back' ? m.from : m.to;
    const gx = a.x + 0.5 + (b.x - a.x) * p; const gy = a.y + 0.5 + (b.y - a.y) * p;
    return { gx, gy, dir: b.x - a.x - (b.y - a.y) >= 0 ? 1 : -1 };
  }

  drawMarch(ctx, m, pos, t) {
    const w = toWorld(pos.gx, pos.gy);
    const y = w.y - this.hAt(pos.gx, pos.gy);
    const col = m.ally ? this.teamColor(m.teamId) : '#d63a2f';
    const ph = t * 0.012;
    ctx.save();
    ctx.translate(w.x, y);
    if (pos.dir < 0) ctx.scale(-1, 1);
    if (m.kind === 'trade') {
      ctx.fillStyle = '#7a5129'; ctx.fillRect(-6, -9, 12, 6);
      ctx.fillStyle = '#e6c45a'; ctx.beginPath(); ctx.ellipse(0, -9, 5, 2.5, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#3a2716'; ctx.beginPath(); ctx.arc(-4, -2.5, 2.4, 0, 7); ctx.arc(4, -2.5, 2.4, 0, 7); ctx.fill();
      A.horseman(ctx, 11, 0, { s: 0.5, walking: true, phase: ph, body: '#8b6a43', hat: '#d8ae52' });
    } else if (m.kind === 'scout') {
      A.horseman(ctx, 0, 0, { s: 0.6, walking: true, phase: ph, team: col, body: '#8a6a43', hat: '#6b4a2b' });
    } else {
      const units = m.units || {};
      const cav = (units.rider || 0) + (units.knight || 0);
      if (units.ram) A.ram(ctx, -12, 2, 0.55);
      A.person(ctx, -6, 1, { s: 0.65, walking: true, phase: ph + 1, team: col, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' });
      if (cav) A.horseman(ctx, 5, 3, { s: 0.6, walking: true, phase: ph, team: col, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear' });
      else A.person(ctx, 5, 3, { s: 0.65, walking: true, phase: ph + 2, team: col, body: '#5b6b85', helmet: '#aab1bb', weapon: 'sword' });
      A.flag(ctx, 0, -2, 22, col, t, 0.7);
    }
    ctx.restore();
  }

  drawTown(ctx, tw, t) {
    const p = this.townPos(tw);
    const col = this.teamColor(tw.teamId);
    const sel = this.selected && this.selected.kind === 'town' && this.selected.obj.id === tw.id;
    const mine = tw.id === this.myTownId;
    if (sel || mine) {
      const pulse = 0.5 + Math.sin(t * 0.005) * 0.3;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.transform(WTW / 2, WTH / 2, -WTW / 2, WTH / 2, 0, 0);
      ctx.beginPath(); ctx.arc(0, 0, 1.15, 0, Math.PI * 2);
      ctx.strokeStyle = sel ? `rgba(255,230,120,${pulse + 0.2})` : 'rgba(255,240,180,0.55)';
      ctx.lineWidth = 0.09; ctx.stroke();
      ctx.restore();
    }
    // stadsmuur
    if (tw.wall > 0) {
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.transform(WTW / 2, WTH / 2, -WTW / 2, WTH / 2, 0, 0);
      ctx.strokeStyle = tw.wall >= 3 ? '#b9b1a1' : '#8b5a2b';
      ctx.lineWidth = 0.12;
      ctx.strokeRect(-0.85, -0.85, 1.7, 1.7);
      ctx.restore();
    }
    for (const part of this.townParts(tw)) A.drawSprite(ctx, part.spr, part.x, part.y, part.scale);
    if (tw.age >= 2) A.smoke(ctx, p.x - 6, p.y - 26, t, tw.id, 0.55);
    const fz = [0, 21, 33, 39, 41][tw.age] || 24;
    A.flag(ctx, p.x, p.y - fz, 13, col, t + tw.id * 500, 0.8);
  }

  // de stukjes waaruit een stad op de kaart bestaat (stadscentrum, huizen, torens, monument)
  townParts(tw) {
    const key = `${tw.age}|${tw.buildings}|${tw.wall}|${tw.monument}|${tw.teamId}|${tw.x},${tw.y}`;
    if (tw._partsKey === key) return tw._parts;
    const p = this.townPos(tw);
    const col = this.teamColor(tw.teamId);
    const houses = Math.min(9, Math.floor(tw.buildings / 2));
    const spots = [[-0.55, -0.15], [0.05, -0.62], [-0.6, 0.45], [0.55, -0.4], [0.5, 0.45], [-0.1, 0.62], [0.65, 0.05], [-0.75, -0.6], [0.2, 0.85]];
    const parts = [{ ox: 0, oy: 0, spr: A.buildingSprite('tc', tw.age, col, tw.civ), scale: 0.42 }];
    for (let i = 0; i < houses; i++) parts.push({ ox: spots[i][0], oy: spots[i][1], spr: A.buildingSprite('house', Math.min(3, tw.age), col, tw.civ), scale: 0.4 });
    if (tw.wall >= 2) parts.push({ ox: -0.85, oy: 0.85, spr: A.buildingSprite('tower', Math.min(3, tw.wall - 1), col, tw.civ), scale: 0.32 });
    if (tw.monument) parts.push({ ox: 0.75, oy: 0.75, spr: A.buildingSprite('monument', tw.monument, col, tw.civ), scale: 0.3 });
    parts.sort((a, b) => a.ox + a.oy - (b.ox + b.oy));
    for (const part of parts) {
      const q = toWorld(part.ox, part.oy);
      part.x = p.x + q.x; part.y = p.y + q.y;
    }
    tw._partsKey = key;
    tw._parts = parts;
    return parts;
  }

  drawCamp(ctx, c, t, now) {
    const p = this.townPos(c);
    const sel = this.selected && this.selected.kind === 'camp' && this.selected.obj.id === c.id;
    if (sel) {
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.transform(WTW / 2, WTH / 2, -WTW / 2, WTH / 2, 0, 0);
      ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,230,120,0.8)'; ctx.lineWidth = 0.08; ctx.stroke();
      ctx.restore();
    }
    const dead = c.plundered;
    const col = dead ? '#8a8378' : ['#8a3324', '#8a3324', '#7a2d4f', '#5b3a6e', '#3d3d3d', '#2a2a2a'][c.level];
    A.tent(ctx, p.x - 8, p.y - 3, 0.62, col);
    A.tent(ctx, p.x + 7, p.y - 4, 0.55, col);
    if (c.level >= 3) A.tent(ctx, p.x, p.y + 4, 0.7, A.mix(col, '#000000', 0.15));
    if (dead) A.smoke(ctx, p.x, p.y, t, c.id, 0.6);
    else A.fire(ctx, p.x + 1, p.y + 1, 0.6, t + c.id * 300);
    // schedelvlag
    ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 12, p.y - 2); ctx.lineTo(p.x - 12, p.y - 22); ctx.stroke();
    ctx.fillStyle = dead ? '#777' : '#1c1c1c'; ctx.fillRect(p.x - 12, p.y - 22, 9, 6);
    ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(p.x - 7.5, p.y - 19.5, 1.5, 0, 7); ctx.fill();
  }

  label(ctx, x, y, text, sub, color, strong) {
    ctx.font = `${strong ? 700 : 600} 12px "Inter", system-ui, sans-serif`;
    const w = Math.max(ctx.measureText(text).width, sub ? ctx.measureText(sub).width * 0.85 : 0) + 14;
    const h = sub ? 30 : 18;
    ctx.fillStyle = 'rgba(28,22,14,0.78)';
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, 6); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(x - w / 2 + 4, y - h + 4, 3, h - 8);
    ctx.fillStyle = '#fff6e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x + 3, y - h + 13);
    if (sub) { ctx.font = '500 10.5px "Inter", system-ui, sans-serif'; ctx.fillStyle = '#e4d6b4'; ctx.fillText(sub, x + 3, y - 6); }
  }

  drawTownLabel(ctx, tw, now) {
    const p = this.townPos(tw);
    const s = this.cam.worldToScreen(p.x, p.y - 44);
    const col = this.teamColor(tw.teamId);
    const mine = tw.id === this.myTownId;
    const sel = this.selected && this.selected.kind === 'town' && this.selected.obj.id === tw.id;
    if (this.cam.zoom < 0.6 && !mine && !sel) return;
    const peace = now < (tw.peaceEnd || 0) ? ' · vrede' : '';
    const sub = this.cam.zoom > 0.9 || sel ? `${tw.player} · ${tw.score} ptn${peace}${tw.online ? ' · ●' : ''}` : null;
    this.label(ctx, s.x, s.y, tw.name, sub, col, mine);
  }

  drawCampLabel(ctx, c, now) {
    const p = this.townPos(c);
    const s = this.cam.worldToScreen(p.x, p.y - 26);
    const txt = c.plundered ? `Verlaten kamp` : `Rovers · niv. ${c.level}`;
    ctx.font = '600 10.5px "Inter", system-ui, sans-serif';
    const w = ctx.measureText(txt).width + 10;
    ctx.fillStyle = c.plundered ? 'rgba(60,60,60,0.65)' : 'rgba(70,20,15,0.72)';
    ctx.beginPath(); ctx.roundRect(s.x - w / 2, s.y - 14, w, 15, 5); ctx.fill();
    ctx.fillStyle = '#f6e7d0'; ctx.textAlign = 'center'; ctx.fillText(txt, s.x, s.y - 3);
  }
}
