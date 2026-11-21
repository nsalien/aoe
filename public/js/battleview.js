// Veldslag die je zelf bestuurt (of bekijkt). De server is de baas over het verloop; de browser rekent tussen
// twee peilingen exact hetzelfde verder (fieldbattle.js is deterministisch) zodat alles vloeiend beweegt.
import * as A from './art.js';
import * as FIG from './figures.js';
import * as N from './nature.js';
import { Particles } from './fx.js';
import { UNITS, TOWER } from '../shared/rules.js';
import { stepTo, giveOrder, FB } from '../shared/fieldbattle.js';
import { icon } from './icons.js';
import { setHTML } from './dom.js';

const TAU = Math.PI * 2;
const TOP = 1.7; // ruimte boven het slagveld voor de stad (in tegels)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const isCav = (k) => UNITS[k] && UNITS[k].type === 'cav';
const isRanged = (k) => k === 'tower' || !!(UNITS[k] && UNITS[k].ranged);
const mobile = (u) => u.k !== 'tower' && u.k !== 'wall';
const aliveN = (u) => Math.max(0, Math.min(u.n || 1, Math.ceil(u.hp / u.hp0 - 1e-6)));

function facing(ctx, x, dir, fn) {
  if (dir >= 0) { fn(); return; }
  ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0);
  fn();
  ctx.restore();
}

function rnd(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- keuzevenster: zelf besturen of automatisch ----------
export function askHtml(b, now, unitThumb) {
  const att = b.role === 'att';
  const left = Math.max(0, b.chooseUntil - now);
  const head = att ? `Je leger is aangekomen bij ${esc(b.title)}!` : `${esc(b.title)} wordt aangevallen${b.attName ? ` door ${esc(b.attName)}` : ''}!`;
  const text = att
    ? 'Bestuur de aanval zelf: kies wie welke vijand aanvalt, spaar je schutters en sloop eerst de torens. Of laat het gevecht automatisch uitrekenen.'
    : 'Verdedig je stad zelf: stuur je troepen naar de bres, laat je schutters achter de muur en val de rammen aan. Of laat de verdediging haar gang gaan.';
  return `<div class="bt-ask-card" role="dialog" aria-modal="true">
    <div class="bt-ask-crest">${icon('swords')}</div>
    <h2>${head}</h2>
    <p>${text}</p>
    <div class="bt-ask-btns">
      <button class="btn primary big" data-bact="choose" data-mode="manual" data-id="${b.id}">${icon('flag')} Zelf besturen</button>
      <button class="btn big" data-bact="choose" data-mode="auto" data-id="${b.id}">${icon('hourglass')} Automatisch</button>
    </div>
    <p class="small muted">Nog <b data-askend="${b.chooseUntil}">${mmss(left)}</b> om te kiezen, daarna verloopt de slag automatisch.</p>
  </div>`;
}

export class BattleView {
  // opts: { now(), get(path), post(path, body), toast(msg, type, icon), onClose(), unitThumb(k, color), openReports() }
  constructor(opts) {
    this.o = opts;
    this.root = document.createElement('div');
    this.root.className = 'battle';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="bt-top"></div><div class="bt-stage"><canvas class="bt-canvas"></canvas><div class="bt-hint"></div></div>
      <div class="bt-bottom"></div><div class="bt-result" hidden></div>`;
    document.body.appendChild(this.root);
    this.cv = this.root.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.top = this.root.querySelector('.bt-top');
    this.bottom = this.root.querySelector('.bt-bottom');
    this.hint = this.root.querySelector('.bt-hint');
    this.resultEl = this.root.querySelector('.bt-result');
    this.sel = new Set();
    this.prev = new Map(); // positie vóór de laatste tik (voor vloeiende beweging)
    this.disp = new Map();
    this.dirs = new Map();
    this.lastHp = new Map();
    this.particles = new Particles(300);
    this.cam = { x: FB.W / 2, y: FB.H / 2 };
    this.bindInput();
    window.addEventListener('resize', () => { if (!this.root.hidden) this.layout(); });
    this.root.addEventListener('click', (e) => this.onButton(e));
  }

  get open() { return !this.root.hidden; }

  show(id, battle = null) {
    if (this.id !== id) {
      this.id = id; this.b = null; this.state = null; this.sel.clear(); this.prev.clear(); this.disp.clear();
      this.lastHp.clear(); this.resultShown = false; this.ground = null; this.camSet = false;
      this.resultEl.hidden = true;
    }
    this.root.hidden = false;
    document.body.classList.add('in-battle');
    this.layout();
    if (battle) this.apply(battle);
    this.poll();
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.poll(), 1200);
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('in-battle');
    clearInterval(this.pollTimer); this.pollTimer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.o.onClose) this.o.onClose(this.b);
  }

  async poll() {
    if (!this.id || this.polling || document.hidden) return;
    this.polling = true;
    try {
      const r = await this.o.get(`/battle?id=${this.id}`);
      this.apply(r.battle);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { this.o.toast(e.message, 'err'); this.close(); }
    } finally { this.polling = false; }
  }

  get side() { return this.b && this.b.role === 'def' ? 1 : 0; }
  get manual() { return !!this.b && (this.b.role === 'att' ? this.b.attMode : this.b.defMode) === 'manual'; }

  // nieuwe toestand van de server
  apply(b) {
    if (!b || b.id !== this.id) return;
    this.b = b;
    if (b.state) {
      // wat nu op het scherm staat, wordt het vertrekpunt van de volgende tik (geen sprongen)
      for (const u of b.state.units) {
        const d = this.disp.get(u.id);
        this.prev.set(u.id, d ? { x: d.x, y: d.y } : { x: u.x, y: u.y });
      }
      const ground = !this.state || this.state.kind !== b.state.kind;
      this.state = b.state;
      for (const id of [...this.sel]) { const u = this.unit(id); if (!u || u.hp <= 0) this.sel.delete(id); }
      if (ground) this.ground = null;
      if (!this.camSet) this.centerCam();
    }
    if (b.status === 'done') { clearInterval(this.pollTimer); this.pollTimer = null; this.showResult(); }
    this.renderBars(true);
  }

  unit(id) { return this.state && this.state.units.find((u) => u.id === id); }

  // ---------- opdrachten ----------
  order(o) {
    if (!this.manual || !this.state || this.state.over != null) return;
    const ids = [...this.sel];
    if (!ids.length && !o.charge && !o.retreat) return;
    giveOrder(this.state, this.side, ids.length ? ids : null, o); // meteen tonen, de server bevestigt
    this.o.post('/battle/order', { id: this.id, ids: ids.length ? ids : null, ...o })
      .then((r) => this.apply(r.battle))
      .catch((e) => this.o.toast(e.message, 'err'));
  }

  async setMode(mode) {
    try {
      const r = await this.o.post('/battle/mode', { id: this.id, mode });
      this.apply(r.battle);
    } catch (e) { this.o.toast(e.message, 'err'); }
  }

  onButton(e) {
    const el = e.target.closest('[data-bact]');
    if (!el || !this.root.contains(el)) return;
    const a = el.dataset.bact;
    if (a === 'close') this.close();
    else if (a === 'all') this.selectAll();
    else if (a === 'none') this.sel.clear();
    else if (a === 'kind') this.selectKind(el.dataset.k);
    else if (a === 'charge') this.order({ charge: true });
    else if (a === 'retreat') {
      if (confirm('Wil je je troepen terugtrekken? De overlevenden keren naar huis terug.')) this.order({ retreat: true });
    } else if (a === 'manual') this.setMode('manual');
    else if (a === 'auto') this.setMode('auto');
    else if (a === 'reports') { this.close(); this.o.openReports(); }
    this.renderBars(true);
  }

  mine() { return this.state ? this.state.units.filter((u) => u.s === this.side && u.hp > 0 && mobile(u)) : []; }
  selectAll() { this.sel = new Set(this.mine().map((u) => u.id)); }
  selectKind(k) { this.sel = new Set(this.mine().filter((u) => u.k === k).map((u) => u.id)); }

  // ---------- schermindeling ----------
  layout() {
    const r = this.cv.getBoundingClientRect();
    const w = Math.max(200, r.width); const h = Math.max(200, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    this.K = h > w ? 0.8 : 0.6;
    const narrow = w < 700;
    let S = Math.min(w / FB.W, h / (FB.H * this.K + TOP + 0.4));
    if (narrow) S = Math.max(S, 27);
    this.S = S;
    this.fs = Math.max(0.6, Math.min(1.5, S / 44));
    this.ground = null;
    this.clampCam();
  }

  worldW() { return FB.W * this.S; }
  worldH() { return (FB.H * this.K + TOP + 0.4) * this.S; }
  W(x, y) { return [x * this.S, (TOP + y * this.K) * this.S]; } // veld → wereldpixels

  centerCam() {
    const mine = this.mine();
    if (mine.length) {
      this.cam.x = mine.reduce((a, u) => a + u.x, 0) / mine.length;
      this.cam.y = this.side ? FB.wallY : FB.H * 0.62;
    }
    this.camSet = true;
    this.clampCam();
  }

  clampCam() {
    if (!this.S) return;
    const ww = this.worldW(); const wh = this.worldH();
    const halfX = this.w / 2 / this.S; const halfY = this.h / 2 / this.S;
    if (ww <= this.w) this.ox = (this.w - ww) / 2;
    else { this.cam.x = Math.max(halfX, Math.min(FB.W - halfX, this.cam.x)); this.ox = this.w / 2 - this.cam.x * this.S; }
    if (wh <= this.h) this.oy = (this.h - wh) / 2;
    else {
      const cy = TOP + this.cam.y * this.K;
      const maxY = wh / this.S - halfY;
      const c = Math.max(halfY, Math.min(maxY, cy));
      this.cam.y = (c - TOP) / this.K;
      this.oy = this.h / 2 - c * this.S;
    }
  }

  toField(sx, sy) { return { x: (sx - this.ox) / this.S, y: ((sy - this.oy) / this.S - TOP) / this.K }; }

  // ---------- invoer ----------
  bindInput() {
    const cv = this.cv;
    let down = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = this.pt(e);
      down = { x: p.x, y: p.y, sx: p.x, sy: p.y, btn: e.button, touch: e.pointerType !== 'mouse', moved: false, camX: this.cam.x, camY: this.cam.y };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pt(e);
      this.hover = p;
      if (!down) return;
      down.x = p.x; down.y = p.y;
      if (Math.hypot(p.x - down.sx, p.y - down.sy) > (down.touch ? 10 : 6)) down.moved = true;
      if (down.moved && down.touch) {
        // vegen = het slagveld verschuiven (op een gsm past het niet helemaal op het scherm)
        this.cam.x = down.camX - (p.x - down.sx) / this.S;
        this.cam.y = down.camY - (p.y - down.sy) / (this.S * this.K);
        this.clampCam();
      }
    });
    const end = (e) => {
      if (!down) return;
      const d = down; down = null;
      this.box = null;
      if (d.touch && d.moved) return;
      if (!d.touch && d.moved && d.btn === 0) { this.boxSelect(d.sx, d.sy, d.x, d.y, e.shiftKey); return; }
      if (d.btn === 2) { this.command(d.sx, d.sy); return; }
      this.click(d.sx, d.sy, e.shiftKey || e.ctrlKey || e.metaKey);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', () => { down = null; this.box = null; });
    cv.addEventListener('pointerleave', () => { this.hover = null; });
    this.boxFn = () => (down && !down.touch && down.moved && down.btn === 0 ? down : null);
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.target.closest('input, textarea')) return;
      if (e.key === 'Escape') { if (this.sel.size) this.sel.clear(); else this.close(); }
      else if (e.key === 'a' || e.key === 'A') this.selectAll();
      else return;
      this.renderBars(true);
      e.preventDefault();
    });
  }

  pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  // eenheid onder de cursor (eerst levende figuren, dan torens en muren)
  pick(sx, sy, touch = false) {
    if (!this.state) return null;
    const rad = (touch ? 24 : 15) * this.fs;
    let best = null; let bd = Infinity;
    for (const u of this.state.units) {
      if (u.hp <= 0) continue;
      const d0 = this.disp.get(u.id) || u;
      const [wx, wy] = this.W(d0.x, d0.y);
      const x = wx + this.ox; const y = wy + this.oy;
      let d;
      if (u.k === 'wall') { if (Math.abs(sx - x) > this.S / 2 || sy > y + 6 || sy < y - this.S) continue; d = rad * 0.9; }
      else if (u.k === 'tower') { if (Math.abs(sx - x) > this.S * 0.7 || sy > y + 8 || sy < y - this.S * 2.4) continue; d = rad * 0.8; }
      else d = Math.hypot(sx - x, sy - (y - (isCav(u.k) ? 16 : 12) * this.fs));
      if (d < rad && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  click(sx, sy, add) {
    if (!this.state) return;
    const u = this.pick(sx, sy, matchMedia('(pointer: coarse)').matches);
    const now = performance.now();
    if (u && u.s === this.side && mobile(u)) {
      if (!this.manual) { this.flashHint('Je laat deze slag automatisch verlopen. Kies "Zelf besturen" om je troepen te leiden.'); return; }
      const dbl = this.lastClick && now - this.lastClick.t < 380 && this.lastClick.k === u.k;
      this.lastClick = { t: now, k: u.k };
      if (dbl) this.selectKind(u.k);
      else if (add) { if (this.sel.has(u.id)) this.sel.delete(u.id); else this.sel.add(u.id); }
      else this.sel = new Set([u.id]);
      this.renderBars(true);
      return;
    }
    this.lastClick = null;
    if (this.sel.size) this.command(sx, sy);
  }

  command(sx, sy) {
    if (!this.manual || !this.sel.size) return;
    const u = this.pick(sx, sy, matchMedia('(pointer: coarse)').matches);
    if (u && u.s !== this.side) {
      this.order({ target: u.id });
      this.mark = { x: u.x, y: u.y, at: performance.now(), attack: true };
      return;
    }
    const f = this.toField(sx, sy);
    if (f.x < 0 || f.x > FB.W || f.y < 0 || f.y > FB.H) return;
    this.order({ x: Math.round(f.x * 100) / 100, y: Math.round(f.y * 100) / 100 });
    this.mark = { x: f.x, y: f.y, at: performance.now(), attack: false };
  }

  boxSelect(x0, y0, x1, y1, add) {
    if (!this.manual) return;
    const a = Math.min(x0, x1); const b = Math.max(x0, x1); const c = Math.min(y0, y1); const d = Math.max(y0, y1);
    const ids = this.mine().filter((u) => {
      const p = this.disp.get(u.id) || u;
      const [wx, wy] = this.W(p.x, p.y);
      const x = wx + this.ox; const y = wy + this.oy - 10 * this.fs;
      return x >= a && x <= b && y >= c && y <= d;
    }).map((u) => u.id);
    if (!add) this.sel.clear();
    for (const id of ids) this.sel.add(id);
    this.renderBars(true);
  }

  flashHint(t) { this.hintMsg = { t, until: performance.now() + 3500 }; }

  // ---------- balken boven en onder ----------
  renderBars(force = false) {
    const now = performance.now();
    if (!force && now - (this.barsAt || 0) < 250) return;
    this.barsAt = now;
    const b = this.b;
    if (!b) { setHTML(this.top, '<div class="bt-mid"><b>Slagveld laden…</b></div>'); return; }
    const st = this.state;
    const meta = (st && st.meta) || {};
    const side = (s) => {
      const list = st ? st.units.filter((u) => u.s === s && u.k !== 'wall') : [];
      const hp = list.reduce((a, u) => a + Math.max(0, u.hp), 0); const hp0 = list.reduce((a, u) => a + u.hp0 * (u.n || 1), 0) || 1;
      const n = list.filter((u) => mobile(u)).reduce((a, u) => a + aliveN(u), 0);
      const info = s ? meta.def : meta.att;
      return `<div class="bt-side ${s ? 'def' : 'att'}${s === this.side ? ' me' : ''}">
        <span class="bt-name"><i class="bt-dot" style="background:${info ? info.color : '#888'}"></i>${esc(info ? info.name : s ? 'Verdediger' : 'Aanvaller')}${s === this.side ? ' (jij)' : ''}</span>
        <div class="bt-bar"><i style="width:${Math.round((hp / hp0) * 100)}%;background:${info ? info.color : '#888'}"></i></div>
        <span class="bt-count">${icon('people')} ${n}</span></div>`;
    };
    let mid;
    if (b.status === 'choose') mid = `<b>${esc(b.title)}</b><span class="bt-clock">Wachten op de tegenstander… <b data-askend="${b.chooseUntil}">${mmss(b.chooseUntil - this.o.now())}</b></span>`;
    else {
      const left = st ? FB.maxMs - st.n * FB.tick : 0;
      mid = `<b>Slag bij ${esc(b.title)}</b><span class="bt-clock">${icon('hourglass')} ${b.status === 'done' ? 'Voorbij' : mmss(left)}</span>
        <span class="bt-mode">${this.manual ? 'Jij voert het bevel' : 'Automatisch'}</span>`;
    }
    setHTML(this.top, `${side(0)}<div class="bt-mid">${mid}</div>${side(1)}`);

    // onderbalk: je troepen per soort en de bevelen
    let html = '';
    if (b.status === 'live' && st) {
      if (this.manual) {
        const kinds = {};
        for (const u of this.mine()) kinds[u.k] = (kinds[u.k] || 0) + aliveN(u);
        const selK = new Set([...this.sel].map((id) => { const u = this.unit(id); return u && u.k; }));
        const color = this.side ? (meta.def || {}).color : (meta.att || {}).color;
        html += `<div class="bt-kinds">${Object.keys(kinds).map((k) => `<button class="bt-kind${selK.has(k) ? ' on' : ''}" data-bact="kind" data-k="${k}" title="Selecteer alle ${esc(UNITS[k] ? UNITS[k].name : k)}">
          <img src="${this.o.unitThumb(k, color)}" alt=""><b>${kinds[k]}</b></button>`).join('')}</div>`;
        html += `<div class="bt-cmds">
          <button class="btn small" data-bact="all">${icon('people')} Alles</button>
          ${this.sel.size ? `<button class="btn small" data-bact="none">${icon('close')} ${this.sel.size}</button>` : ''}
          <button class="btn small danger" data-bact="charge" ${this.sel.size ? '' : 'disabled'} title="De geselecteerde troepen vallen de dichtstbijzijnde vijand aan">${icon('swords')} Stormloop</button>
          ${b.role === 'att' ? `<button class="btn small" data-bact="retreat">${icon('back')} Terugtrekken</button>` : ''}
          <button class="btn small ghost" data-bact="auto" title="Laat je troepen zelf vechten">Automatisch</button>
          <button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
      } else {
        html += `<div class="bt-cmds"><span class="small">Je kijkt mee; je troepen vechten zelf.</span>
          <button class="btn small primary" data-bact="manual">${icon('flag')} Zelf besturen</button>
          <button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
      }
    } else html += `<div class="bt-cmds"><button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
    setHTML(this.bottom, html);

    let hint = '';
    if (this.hintMsg && this.hintMsg.until > now) hint = this.hintMsg.t;
    else if (b.status === 'live' && this.manual && !this.sel.size) hint = matchMedia('(pointer: coarse)').matches
      ? 'Tik op je troepen om ze te kiezen (twee keer tikken = alle van die soort). Tik daarna op de grond of op een vijand. Veeg om rond te kijken.'
      : 'Klik op je troepen of sleep een kader (dubbelklik = alle van die soort). Klik of rechtsklik daarna op de grond om te lopen, of op een vijand om aan te vallen.';
    else if (b.status === 'live' && this.manual) hint = `${this.sel.size} geselecteerd: klik op een vijand, toren of muur om aan te vallen, of op de grond om te verplaatsen.`;
    this.hint.textContent = hint;
    this.hint.hidden = !hint;
  }

  showResult() {
    if (this.resultShown || !this.b || !this.b.result || this.b.result.pending) return;
    this.resultShown = true;
    const r = this.b.result;
    const won = this.b.role === 'att' ? r.attWins : !r.attWins;
    const lost = this.b.role === 'att' ? r.attLost : r.defLost;
    const kill = this.b.role === 'att' ? r.defLost : r.attLost;
    const list = (o) => Object.entries(o || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span class="pill">${n}× ${esc(UNITS[k] ? UNITS[k].name : k)}</span>`).join(' ') || '<span class="muted">geen</span>';
    const loot = Object.entries(r.loot || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span class="pill">${n} ${k === 'food' ? 'voedsel' : k === 'wood' ? 'hout' : k === 'stone' ? 'steen' : 'goud'}</span>`).join(' ');
    this.resultEl.innerHTML = `<div class="bt-res-card ${won ? 'won' : 'lost'}">
      <div class="bt-ask-crest">${icon(won ? 'trophy' : 'shield')}</div>
      <h2>${won ? 'Overwinning!' : 'Nederlaag'}</h2>
      <p>${r.retreat ? 'Je troepen trokken zich terug. ' : ''}${this.b.role === 'att' ? (won ? 'De verdedigers zijn verslagen.' : 'De aanval is afgeslagen.') : (won ? 'Je stad hield stand!' : 'De vijand brak door je verdediging.')}</p>
      <dl class="kv"><dt>Jouw verliezen</dt><dd>${list(lost)}</dd><dt>Vijanden verslagen</dt><dd>${list(kill)}</dd>
      ${loot ? `<dt>${this.b.role === 'att' ? 'Buit' : 'Geplunderd'}</dt><dd>${loot}</dd>` : ''}</dl>
      <div class="bt-ask-btns"><button class="btn primary" data-bact="reports">${icon('scroll')} Rapport</button><button class="btn" data-bact="close">Sluiten</button></div></div>`;
    this.resultEl.hidden = false;
    if (won) for (let i = 0; i < 4; i++) setTimeout(() => this.particles.confetti(this.worldW() / 2 + (i - 1.5) * 80, this.worldH() * 0.4, 40), i * 250);
  }

  // ---------- tekenen ----------
  frame(t) {
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    if (this.root.hidden) return;
    const dt = Math.min(100, t - (this.lastT || t));
    this.lastT = t;
    const st = this.state;
    const now = this.o.now();
    // verder rekenen tot nu, tik per tik (de server stuurt elke peiling de echte toestand)
    if (st && this.b.status === 'live' && st.over == null) {
      let k = 0;
      while (st.over == null && st.t + FB.tick <= now && k < 30) {
        for (const u of st.units) this.prev.set(u.id, { x: u.x, y: u.y });
        stepTo(st, st.t + FB.tick, 1);
        k++;
      }
      if (k >= 30) this.prev.clear();
    }
    const alpha = st ? Math.max(0, Math.min(1, (now - st.t) / FB.tick)) : 0;
    if (st) {
      for (const u of st.units) {
        const p = this.prev.get(u.id);
        this.disp.set(u.id, p && st.over == null ? { x: p.x + (u.x - p.x) * alpha, y: p.y + (u.y - p.y) * alpha } : { x: u.x, y: u.y });
      }
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#2a2015'; ctx.fillRect(0, 0, this.w, this.h);
    if (!st) { this.renderBars(); this.drawWaiting(ctx, t); return; }
    if (!this.ground) this.ground = this.paintGround(st);
    ctx.save();
    ctx.translate(Math.round(this.ox), Math.round(this.oy));
    ctx.drawImage(this.ground, -this.gm.x, -this.gm.y, this.gm.w, this.gm.h);
    this.drawScene(ctx, st, t, now);
    this.particles.update(dt);
    this.particles.draw(ctx);
    ctx.restore();
    const box = this.boxFn();
    if (box) {
      ctx.fillStyle = 'rgba(255,225,120,0.12)'; ctx.strokeStyle = 'rgba(255,225,120,0.9)'; ctx.lineWidth = 1;
      ctx.fillRect(Math.min(box.sx, box.x), Math.min(box.sy, box.y), Math.abs(box.x - box.sx), Math.abs(box.y - box.sy));
      ctx.strokeRect(Math.min(box.sx, box.x) + 0.5, Math.min(box.sy, box.y) + 0.5, Math.abs(box.x - box.sx), Math.abs(box.y - box.sy));
    }
    this.renderBars();
    for (const el of this.root.querySelectorAll('[data-askend]')) el.textContent = mmss(Number(el.dataset.askend) - now);
  }

  drawWaiting(ctx, t) {
    ctx.fillStyle = '#f4e8cc'; ctx.font = '600 16px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
    const dots = '.'.repeat(1 + Math.floor(t / 400) % 3);
    ctx.fillText(this.b && this.b.status === 'choose' ? `De legers stellen zich op${dots}` : `Slagveld laden${dots}`, this.w / 2, this.h / 2);
  }

  // het slagveld zelf: gras, een pad naar de poort, bomen aan de rand en de stad (of het kamp) achteraan
  paintGround(st) {
    const S = this.S; const K = this.K;
    const fw = this.worldW(); const fh = this.worldH();
    // ook de rand rond het slagveld vullen (bos en gras tot aan de schermrand)
    const mx = Math.ceil(Math.max(0, (this.w - fw) / 2) / S) + 1;
    const my = Math.ceil(Math.max(0, (this.h - fh) / 2) / S) + 1;
    const ww = fw + 2 * mx * S; const wh = fh + 2 * my * S;
    this.gm = { x: mx * S, y: my * S, w: ww, h: wh };
    const cv = document.createElement('canvas');
    const q = Math.min(2, this.dpr);
    cv.width = Math.round(ww * q); cv.height = Math.round(wh * q);
    const c = cv.getContext('2d');
    c.scale(q, q);
    c.translate(mx * S, my * S);
    const R = rnd(4242 + (st.kind === 'camp' ? 7 : 0));
    const g = c.createLinearGradient(0, -my * S, 0, wh - my * S);
    g.addColorStop(0, '#7a9645'); g.addColorStop(0.5, '#86a64c'); g.addColorStop(1, '#6c8d3e');
    c.fillStyle = g; c.fillRect(-mx * S, -my * S, ww, wh);
    // vlekken lichter en donkerder gras
    for (let i = 0; i < 46; i++) {
      const x = R() * ww - mx * S; const y = R() * wh - my * S; const r = (0.8 + R() * 2.2) * S;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.5;
      gr.addColorStop(0, dark ? 'rgba(50,80,25,0.22)' : 'rgba(190,200,110,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(x, y, r, r * K, 0, 0, TAU); c.fill();
    }
    // pad van onder naar de poort en de stad in
    const gy0 = fh + my * S; const [, gy1] = this.W(0, 0.8);
    c.save();
    c.beginPath();
    const steps = 24;
    const xAt = (f) => FB.W / 2 + Math.sin(f * 5.2) * 0.7 * (1 - f * 0.6);
    for (let i = 0; i <= steps; i++) { const f = i / steps; const y = gy0 + (gy1 - gy0) * f; c.lineTo((xAt(f) - 1.05 - Math.sin(i * 1.7) * 0.08) * S, y); }
    for (let i = steps; i >= 0; i--) { const f = i / steps; const y = gy0 + (gy1 - gy0) * f; c.lineTo((xAt(f) + 1.05 + Math.cos(i * 1.3) * 0.08) * S, y); }
    c.closePath();
    c.fillStyle = '#a98b5c'; c.fill();
    c.clip();
    c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.55;
    c.fillStyle = c.createPattern(N.groundTexture('dirt', 128), 'repeat'); c.fillRect(-mx * S, -my * S, ww, wh);
    c.restore();
    // graskorrel over alles
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.5;
    const pat = c.createPattern(N.groundTexture('grass', 256), 'repeat');
    c.fillStyle = pat; c.fillRect(-mx * S, -my * S, ww, wh); c.restore();
    // plukjes, bloemen en steentjes
    for (let i = 0; i < 160 + mx * 20; i++) {
      const x = R() * ww - mx * S; const y = R() * wh - my * S; const k = R();
      if (k < 0.55) N.tuft(c, x, y, 0.8 + R() * 0.6, '#5d8a33', '#a6c45e');
      else if (k < 0.75) N.flower(c, x, y, ['#f4e04d', '#ffffff', '#d96bb0', '#7fb3e8'][Math.floor(R() * 4)]);
      else N.pebble(c, x, y, 0.8 + R() * 0.8);
    }
    // achtergrond: de stad of het kamp van de verdediger
    const meta = st.meta || {};
    const defColor = (meta.def && meta.def.color) || '#c0392b';
    const civ = meta.style ? meta.style.civ : null;
    const sc = S / 50;
    const items = [];
    if (st.kind === 'town') {
      const age = Math.max(1, Math.min(4, (meta.style && meta.style.age) || 1));
      const hl = Math.min(3, age);
      // plein voor het stadscentrum
      const [px, py] = this.W(FB.W / 2, 1.4);
      c.fillStyle = 'rgba(170,140,95,0.55)'; c.beginPath(); c.ellipse(px, py + S * 0.3, S * 3.4, S * 1.3 * K, 0, 0, TAU); c.fill();
      items.push({ x: FB.W / 2, y: 0.9, spr: A.buildingSprite('tc', age, defColor, civ), s: sc * 1.05 });
      for (const [x, y, type] of [[4.2, 1.6, 'house'], [7.4, 0.5, 'house'], [16.6, 0.5, 'house'], [19.8, 1.6, 'house'], [1.6, 0.4, 'farm'], [22.4, 0.4, 'lumber'], [9.6, 2.6, 'house'], [14.4, 2.6, 'barracks']]) {
        items.push({ x, y, spr: A.buildingSprite(type, type === 'house' ? hl : 1, defColor, civ), s: sc * 0.95 });
      }
    } else {
      for (const [x, y, s] of [[5, 0.9, 1], [8.5, 0.2, 0.9], [15.5, 0.2, 0.9], [19, 0.9, 1], [3, 2.6, 0.8], [21, 2.6, 0.8], [10.5, 1.9, 0.85], [13.5, 1.9, 0.85]]) items.push({ x, y, tent: s });
    }
    // bomen langs de randen (en een bos daarbuiten)
    const nTrees = 26 + mx * 18;
    for (let i = 0; i < nTrees; i++) {
      const left = i % 2 === 0;
      const depth = R() * (1.1 + mx);
      const x = left ? 0.8 - depth : FB.W - 0.8 + depth;
      const y = -0.6 - my * 0.5 + R() * (FB.H + 0.6 + my);
      items.push({ x, y, tree: N.treeSprite(R() < 0.4 ? N.CONIFERS[i % 4] : N.LEAFY[i % N.LEAFY.length]), s: sc * (0.8 + R() * 0.35) });
    }
    for (let i = 0; i < 6; i++) items.push({ x: 1.5 + R() * 3, y: FB.H - R() * 1.2, tree: N.treeSprite(N.LEAFY[i]), s: sc * 0.8 });
    for (let i = 0; i < 6; i++) items.push({ x: FB.W - 1.5 - R() * 3, y: FB.H - R() * 1.2, tree: N.treeSprite(N.CONIFERS[i % 4]), s: sc * 0.8 });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const [x, y] = this.W(it.x, it.y);
      if (it.spr) A.drawSprite(c, it.spr, x, y, it.s);
      else if (it.tree) {
        c.fillStyle = 'rgba(30,40,15,0.25)'; c.beginPath(); c.ellipse(x + 4 * it.s, y, 16 * it.s, 6 * it.s, 0, 0, TAU); c.fill();
        c.drawImage(it.tree.cv, x - it.tree.ax * it.s, y - it.tree.ay * it.s, it.tree.w * it.s, it.tree.h * it.s);
      } else if (it.tent) A.tent(c, x, y, it.tent * sc * 1.3, '#7a1b12');
    }
    // zachte schaduw aan de randen
    const v = c.createRadialGradient(fw / 2, fh / 2, Math.min(fw, fh) * 0.4, fw / 2, fh / 2, Math.max(ww, wh) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,10,0,0.4)');
    c.fillStyle = v; c.fillRect(-mx * S, -my * S, ww, wh);
    return cv;
  }

  drawScene(ctx, st, t, now) {
    const bt = now - st.t0; // tijd sinds het begin van de slag
    const meta = st.meta || {};
    const colors = [(meta.att && meta.att.color) || '#2e6fb5', (meta.def && meta.def.color) || '#c0392b'];
    const items = [];
    for (const u of st.units) {
      const p = this.disp.get(u.id) || u;
      if (u.hp <= 0 && mobile(u) && (u.died == null || bt - u.died > 7000)) continue;
      items.push({ u, p, y: p.y + (u.k === 'wall' ? 0.02 : 0) });
    }
    items.sort((a, b) => a.y - b.y || a.u.id - b.u.id);
    const byId = new Map(st.units.map((u) => [u.id, u]));
    // markering van het doel van een opdracht
    if (this.mark && performance.now() - this.mark.at < 900) {
      const f = (performance.now() - this.mark.at) / 900;
      const [x, y] = this.W(this.mark.x, this.mark.y);
      ctx.strokeStyle = this.mark.attack ? `rgba(230,60,40,${1 - f})` : `rgba(150,240,120,${1 - f})`;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, (6 + f * 14) * this.fs, (3 + f * 7) * this.fs, 0, 0, TAU); ctx.stroke();
    }
    // looplijnen van de geselecteerde troepen
    if (this.sel.size) {
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,240,180,0.5)';
      const flags = new Set();
      for (const id of this.sel) {
        const u = byId.get(id); if (!u || u.hp <= 0 || u.mx == null) continue;
        const p = this.disp.get(id) || u;
        const [x0, y0] = this.W(p.x, p.y); const [x1, y1] = this.W(u.mx, u.my);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        flags.add(`${Math.round(u.mx)}:${Math.round(u.my)}`);
      }
      ctx.setLineDash([]);
    }
    const hoverU = this.hover && this.manual && this.sel.size ? this.pick(this.hover.x, this.hover.y) : null;
    const targets = new Set();
    for (const id of this.sel) { const u = byId.get(id); if (u && u.tg != null && u.forced) targets.add(u.tg); }
    for (const it of items) {
      const { u, p } = it;
      const [x, y] = this.W(p.x, p.y);
      if (u.k === 'wall') { this.drawWall(ctx, u, x, y, t); continue; }
      if (u.k === 'tower') { this.drawTower(ctx, u, x, y, t, colors[1], civOf(meta), hoverU === u || targets.has(u.id)); continue; }
      const dead = u.hp <= 0;
      const fs = this.fs;
      if (!dead) {
        // kleur van de kant onder de voeten, ring rond selectie en doelwitten
        ctx.fillStyle = colors[u.s]; ctx.globalAlpha = 0.32;
        ctx.beginPath(); ctx.ellipse(x, y + 0.5, (isCav(u.k) ? 10 : 7) * fs, (isCav(u.k) ? 4.6 : 3.4) * fs, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        if (this.sel.has(u.id)) { ctx.strokeStyle = 'rgba(255,228,90,0.95)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y + 0.5, (isCav(u.k) ? 12 : 9) * fs, (isCav(u.k) ? 5.6 : 4.4) * fs, 0, 0, TAU); ctx.stroke(); }
        if (hoverU === u || targets.has(u.id)) { ctx.strokeStyle = 'rgba(235,60,40,0.95)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 10 * fs, 4.8 * fs, 0, 0, TAU); ctx.stroke(); }
      }
      // richting: naar het doelwit of de looprichting
      const tg = u.tg != null ? byId.get(u.tg) : null;
      const pv = this.prev.get(u.id);
      const moving = !dead && pv && Math.hypot(u.x - pv.x, u.y - pv.y) > 0.004;
      let dir = this.dirs.get(u.id) || (u.s ? 1 : -1);
      if (moving && Math.abs(u.x - pv.x) > 0.002) dir = u.x > pv.x ? 1 : -1;
      else if (tg) dir = tg.x >= u.x ? 1 : -1;
      this.dirs.set(u.id, dir);
      const age = bt - (u.at ?? -1e9);
      const swing = !dead && u.at >= 0 && age >= 0 && age < 340 && !isRanged(u.k) ? Math.sin((age / 340) * Math.PI) : 0;
      if (dead) {
        const da = Math.min(1, (bt - u.died) / 7000);
        ctx.save(); ctx.globalAlpha = 1 - da * 0.9;
        ctx.translate(x, y); ctx.rotate(-dir * Math.min(1.45, (bt - u.died) / 260)); ctx.translate(-x, -y);
        this.drawFigure(ctx, u, x, y, t, false, dir, colors[u.s]);
        ctx.restore();
        continue;
      }
      const lx = tg ? Math.sign(tg.x - u.x) * swing * 3 * fs : 0;
      this.drawFigure(ctx, u, x + lx, y, t, moving || swing > 0, dir, colors[u.s], swing);
      const n = aliveN(u);
      const tall = (u.k === 'elephant' ? 54 : isCav(u.k) ? 40 : u.k === 'ram' || u.k === 'stonethrower' ? 26 : 32) * fs;
      const max = u.hp0 * (u.n || 1);
      if (u.hp < max || n > 1) {
        const w = (u.k === 'elephant' ? 20 : 13) * fs;
        const frac = Math.max(0, u.hp / max);
        ctx.fillStyle = 'rgba(20,12,6,0.72)'; ctx.fillRect(x - w / 2 - 1, y - tall - 1, w + 2, 4);
        ctx.fillStyle = u.s === this.side ? (frac > 0.6 ? '#62d44c' : frac > 0.3 ? '#f2c230' : '#e2452f') : (frac > 0.3 ? '#e2452f' : '#9b1c12');
        ctx.fillRect(x - w / 2, y - tall, w * frac, 2);
      }
      if (n > 1) {
        ctx.font = `700 ${Math.round(9 * Math.max(1, fs * 0.9))}px Inter, sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(30,20,10,0.78)'; ctx.beginPath(); ctx.roundRect(x - 9 * fs, y - tall - 13 * fs, 18 * fs, 10 * fs, 4); ctx.fill();
        ctx.fillStyle = '#fff3d6'; ctx.fillText(`×${n}`, x, y - tall - 5 * fs);
      }
    }
    // wie achter een muur staat, blijft als schim zichtbaar
    if (st.units.some((u) => u.k === 'wall' && u.hp > 0)) {
      const cols = new Set(st.units.filter((u) => u.k === 'wall' && u.hp > 0).map((u) => Math.floor(u.x)));
      ctx.save(); ctx.globalAlpha = 0.42;
      for (const it of items) {
        const { u, p } = it;
        if (u.hp <= 0 || !mobile(u) || p.y >= FB.wallY || p.y < FB.wallY - 1.6 || !cols.has(Math.floor(p.x))) continue;
        const [x, y] = this.W(p.x, p.y);
        this.drawFigure(ctx, u, x, y, t, false, this.dirs.get(u.id) || 1, colors[u.s]);
      }
      ctx.restore();
    }
    this.drawShots(ctx, st, bt);
    this.wallFx(st, bt);
  }

  drawFigure(ctx, u, x, y, t, moving, dir, team, swing = 0) {
    const s = 1.05 * this.fs;
    const o = { s, team, phase: t * 0.012 + u.id, walking: moving };
    facing(ctx, x, dir, () => {
      if (u.k === 'stonethrower') { A.stoneThrower(ctx, x, y, 0.8 * this.fs, t); return; }
      if (u.k === 'barbarian') { A.person(ctx, x, y, { ...o, body: u.id % 2 ? '#4f3a2a' : '#5b4636', weapon: u.id % 3 === 2 ? 'spear' : 'sword', barb: true, skin: 1 + (u.id % 3), team: null }); return; }
      if (u.k === 'villager') { A.person(ctx, x, y, { ...o, s: s * 0.92, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: 'axe', working: swing > 0, walking: moving && !swing }); return; }
      if (FIG.uniqueUnit(ctx, u.k, x, y, o)) return;
      switch (u.k) {
        case 'spear': A.person(ctx, x, y, { ...o, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }); break;
        case 'sword': A.person(ctx, x, y, { ...o, body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }); break;
        case 'archer': A.person(ctx, x, y, { ...o, body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }); break;
        case 'scout': A.horseman(ctx, x, y, { s: 0.8 * this.fs, team, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b', walking: moving, phase: o.phase }); break;
        case 'rider': A.horseman(ctx, x, y, { s: 0.85 * this.fs, team, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear', horse: '#7b4f2c', walking: moving, phase: o.phase }); break;
        case 'knight': A.horseman(ctx, x, y, { s: 0.9 * this.fs, team, body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530', walking: moving, phase: o.phase }); break;
        case 'ram': A.ram(ctx, x, y, 0.9 * this.fs); break;
        default: A.person(ctx, x, y, o);
      }
    });
  }

  // muurblok: houten palissade (niveau 1-2) of stenen muur met kantelen (vanaf niveau 3)
  drawWall(ctx, u, x, y, t) {
    const S = this.S; const K = this.K;
    const x0 = x - S / 2; const w = S;
    const stone = (u.L || 1) >= 3;
    const h = S * (stone ? 0.46 + 0.03 * u.L : 0.46);
    const d = S * K * 0.34;
    if (u.hp <= 0) {
      // puin
      const R = rnd(u.id * 97);
      for (let i = 0; i < 7; i++) {
        const px = x0 + R() * w; const py = y - R() * d * 0.6;
        ctx.fillStyle = stone ? ['#9b9282', '#b4ab98', '#7e766a'][i % 3] : ['#7a5129', '#5e3d1d', '#8f6436'][i % 3];
        ctx.beginPath(); ctx.ellipse(px, py, S * (0.07 + R() * 0.08), S * 0.05, R() * 3, 0, TAU); ctx.fill();
      }
      return;
    }
    const frac = u.hp / u.hp0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0, y, w, d * 0.5);
    if (stone) {
      ctx.fillStyle = '#d2c8b2'; ctx.fillRect(x0, y - h - d, w, d); // looppad
      const face = ctx.createLinearGradient(0, y - h, 0, y);
      face.addColorStop(0, '#c2b8a3'); face.addColorStop(1, '#988f7d');
      ctx.fillStyle = face; ctx.fillRect(x0, y - h, w, h);
      ctx.strokeStyle = 'rgba(70,60,45,0.45)'; ctx.lineWidth = 0.8;
      const rows = 4;
      for (let r = 1; r < rows; r++) { const yy = y - h + (h * r) / rows; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke(); }
      for (let r = 0; r < rows; r++) {
        const y0 = y - h + (h * r) / rows; const off = r % 2 ? w / 6 : 0;
        for (let k = off; k < w; k += w / 3) { ctx.beginPath(); ctx.moveTo(x0 + k, y0); ctx.lineTo(x0 + k, y0 + h / rows); ctx.stroke(); }
      }
      // kantelen
      ctx.fillStyle = '#b5ab96';
      for (let k = 0; k < 3; k++) {
        if (frac < 0.4 && k === 1) continue;
        const mx = x0 + k * (w / 3) + w / 12; const mw = w / 6;
        ctx.fillRect(mx, y - h - S * 0.16, mw, S * 0.16);
        ctx.fillStyle = '#d6cdb8'; ctx.fillRect(mx, y - h - S * 0.16 - d * 0.35, mw, d * 0.35); ctx.fillStyle = '#b5ab96';
      }
    } else {
      // houten palen met een punt
      const n = 6; const pw = w / n;
      for (let i = 0; i < n; i++) {
        const px = x0 + i * pw; const ph = h * (0.92 + ((u.id * 7 + i * 13) % 5) * 0.03) * (frac < 0.4 && i % 3 === 1 ? 0.6 : 1);
        ctx.fillStyle = i % 2 ? '#7d532a' : '#8f6232';
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - ph); ctx.lineTo(px + pw / 2, y - ph - pw * 0.9); ctx.lineTo(px + pw, y - ph); ctx.lineTo(px + pw, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,180,0.18)'; ctx.fillRect(px + 1, y - ph, pw * 0.25, ph);
      }
      ctx.fillStyle = '#5e3d1d'; ctx.fillRect(x0, y - h * 0.62, w, S * 0.06);
    }
    if (frac < 0.7) {
      ctx.strokeStyle = 'rgba(40,25,10,0.7)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(x0 + w * 0.3, y - h); ctx.lineTo(x0 + w * 0.4, y - h * 0.6); ctx.lineTo(x0 + w * 0.32, y - h * 0.3); ctx.stroke();
      if (frac < 0.4) { ctx.beginPath(); ctx.moveTo(x0 + w * 0.7, y - h * 0.9); ctx.lineTo(x0 + w * 0.62, y - h * 0.45); ctx.lineTo(x0 + w * 0.75, y - h * 0.1); ctx.stroke(); }
    }
    if (frac < 1) {
      const bw = S * 0.6;
      ctx.fillStyle = 'rgba(20,12,6,0.6)'; ctx.fillRect(x - bw / 2, y - h - d - 7, bw, 3);
      ctx.fillStyle = frac > 0.5 ? '#d9c68a' : '#e2452f'; ctx.fillRect(x - bw / 2, y - h - d - 7, bw * frac, 3);
    }
  }

  drawTower(ctx, u, x, y, t, color, civ, hl) {
    const S = this.S;
    if (u.hp <= 0) {
      const R = rnd(u.id * 31);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = ['#9b9282', '#b4ab98', '#7e766a', '#6b4a2b'][i % 4];
        ctx.beginPath(); ctx.ellipse(x + (R() - 0.5) * S * 1.1, y - R() * S * 0.3, S * (0.08 + R() * 0.1), S * 0.06, R() * 3, 0, TAU); ctx.fill();
      }
      A.smoke(ctx, x, y - S * 0.3, t, u.id, this.fs);
      return;
    }
    if (hl) { ctx.strokeStyle = 'rgba(235,60,40,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, S * 0.6, S * 0.6 * this.K * 0.6, 0, 0, TAU); ctx.stroke(); }
    const spr = A.buildingSprite('tower', u.L || 1, color, civ);
    A.drawSprite(ctx, spr, x, y, S / 52);
    const frac = u.hp / u.hp0;
    const bw = S * 0.9; const top = y - S * 2.1;
    ctx.fillStyle = 'rgba(20,12,6,0.72)'; ctx.fillRect(x - bw / 2 - 1, top - 1, bw + 2, 5);
    ctx.fillStyle = u.s === this.side ? '#62d44c' : '#e2452f'; ctx.fillRect(x - bw / 2, top, bw * frac, 3);
    if (frac < 0.5) A.smoke(ctx, x + S * 0.1, y - S * 1.4, t, u.id, this.fs * 0.7);
  }

  // pijlen, stenen en torenschoten
  drawShots(ctx, st, bt) {
    for (const u of st.units) {
      if (u.at == null || u.at < 0 || !(isRanged(u.k) || u.k === 'stonethrower')) continue;
      if (u.hp <= 0 && u.k !== 'tower') continue;
      const fly = u.k === 'stonethrower' ? 650 : 420;
      const age = bt - u.at;
      if (age < 0 || age > fly) continue;
      const p = this.disp.get(u.id) || u;
      const [ax, ay0] = this.W(p.x, p.y);
      const ay = ay0 - (u.k === 'tower' ? this.S * 1.6 : 16 * this.fs);
      const [bx, by0] = this.W(u.ax, u.ay);
      const by = by0 - 10 * this.fs;
      const f = age / fly;
      const arc = Math.min(60, Math.hypot(bx - ax, by - ay) * 0.25);
      const x = ax + (bx - ax) * f; const y = ay + (by - ay) * f - Math.sin(f * Math.PI) * arc;
      const ang = Math.atan2((by - ay) - Math.cos(f * Math.PI) * arc * Math.PI, bx - ax);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(this.fs, this.fs);
      if (u.k === 'stonethrower') { ctx.fillStyle = '#8f887c'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
      else {
        ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(5, 0); ctx.stroke();
        ctx.fillStyle = '#d5dbe2'; ctx.beginPath(); ctx.moveTo(6.5, 0); ctx.lineTo(4.2, -1.4); ctx.lineTo(4.2, 1.4); ctx.fill();
        ctx.fillStyle = '#f4efe0'; ctx.fillRect(-6.5, -1.1, 1.8, 2.2);
      }
      ctx.restore();
    }
  }

  // stof en brokken wanneer muren en torens geraakt worden
  wallFx(st, bt) {
    for (const u of st.units) {
      if (u.k !== 'wall' && u.k !== 'tower') continue;
      const before = this.lastHp.get(u.id);
      this.lastHp.set(u.id, u.hp);
      if (before == null || u.hp >= before) continue;
      const [x, y] = this.W(u.x, u.y);
      const top = u.k === 'tower' ? this.S * 1.2 : this.S * 0.4;
      this.particles.dust(x, y - top * 0.5, u.hp <= 0 ? 14 : 2);
      if (u.hp <= 0 && bt - (u.died || 0) < 2000) this.particles.dust(x, y - top, 10);
    }
  }
}

const civOf = (meta) => (meta.style ? meta.style.civ : null);
