// Belegering die je zelf bestuurt (of bekijkt). De server is de baas over het verloop; de browser rekent
// tussen twee peilingen exact hetzelfde verder (fieldbattle.js is deterministisch) zodat alles vloeiend beweegt.
// Je eigen bevelen gaan meteen in, met het tijdstip (tik) waarop je tikte; de server voert ze op dezelfde tik uit.
// Je bestuurt regimenten (zoals in Rome: Total War): een kaartje of een tik op een soldaat kiest zijn hele eenheid.
import { UNITS } from '../shared/rules.js';
import { stepTo, queueOrder, FB, FORMS, formsFor, mobile, aliveN, battleTime, deployLeft, nav, cellOf, inZone } from '../shared/fieldbattle.js';
import { SiegeView, toWorld } from './siegeview.js';
import { icon } from './icons.js';
import { setHTML } from './dom.js';
import * as FX from './fx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const coarse = () => matchMedia('(pointer: coarse)').matches;
const FORM_ICON = { line: 'fline', block: 'fblock', wedge: 'fwedge', loose: 'floose', ring: 'fring' };
// wat een regiment nu doet (klein tekentje op het kaartje)
const doing = (r) => (r.st === 'rout' ? 'vlucht' : r.st === 'move' ? 'loopt' : r.st === 'wall' ? 'muur' : (r.st === 'attack' || r.st === 'charge') ? (r.eng ? 'vecht' : 'valt aan') : '');

// ---------- keuzevenster: zelf besturen of automatisch ----------
export function askHtml(b, now) {
  const att = b.role === 'att';
  const camp = b.kind === 'camp';
  const left = Math.max(0, b.chooseUntil - now);
  const head = att ? `Je leger staat bij ${esc(b.title)}!` : `${esc(b.title)} wordt aangevallen${b.attName ? ` door ${esc(b.attName)}` : ''}!`;
  const text = att
    ? (camp ? 'Stel je regimenten op en val het kamp zelf aan, of laat het gevecht automatisch uitrekenen.'
      : 'Bestuur de belegering zelf: stel je regimenten op, ram de poort of sla een bres in de muur en verover het plein. Of laat het gevecht automatisch uitrekenen.')
    : 'Verdedig je stad zelf: zet je schutters op de muur aan de kant van de aanval en je soldaten achter de poort. Of laat de verdediging haar gang gaan.';
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
    this.top = this.root.querySelector('.bt-top');
    this.bottom = this.root.querySelector('.bt-bottom');
    this.hint = this.root.querySelector('.bt-hint');
    this.resultEl = this.root.querySelector('.bt-result');
    this.sel = new Set(); // gekozen regimenten (id)
    this.targets = new Set();
    this.prev = new Map(); // positie één tik eerder (voor vloeiende beweging)
    this.offs = new Map(); // verschil met wat er op het scherm stond toen de server iets anders zei (vervaagt)
    this.pending = []; // eigen bevelen die de server nog niet bevestigde
    this.alpha = 0;
    this.drag = null; // lijn die je aan het trekken bent (richting en breedte van de formatie)
    this.view = new SiegeView(this.cv, this);
    this.view.cam.onRightDrag = (ph, x0, y0, x1, y1) => this.lineDrag(ph, x0, y0, x1, y1);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('click', (e) => this.onButton(e));
  }

  get open() { return !this.root.hidden; }
  get side() { return this.b && this.b.role === 'def' ? 1 : 0; }
  get manual() { return !!this.b && (this.b.role === 'att' ? this.b.attMode : this.b.defMode) === 'manual'; }

  show(id, battle = null) {
    if (this.id !== id) {
      this.routs = new Map();
      this.id = id; this.b = null; this.state = null; this.srv = null; this.fixed = null; this.sel.clear(); this.prev.clear(); this.offs.clear(); this.pending = [];
      this.resultShown = false; this.resultEl.hidden = true; this.view.key = null; this.setLine(false);
    }
    this.root.hidden = false;
    document.body.classList.add('in-battle');
    if (battle) this.apply(battle);
    this.poll();
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.poll(), FB.pollMs);
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('in-battle');
    clearInterval(this.pollTimer); this.pollTimer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.setLine(false);
    if (this.o.onClose) this.o.onClose(this.b);
  }

  // t0 van de slag waarvan we de vaste delen al hebben (dan stuurt de server ze niet opnieuw)
  get have() { return this.fixed && this.fixed.id === this.id ? this.fixed.t0 : null; }

  async poll() {
    if (!this.id || this.polling || document.hidden) return;
    this.polling = true;
    try {
      const h = this.have;
      const r = await this.o.get(`/battle?id=${this.id}${h != null ? `&have=${h}` : ''}`);
      this.apply(r.battle);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { this.o.toast(e.message, 'err'); this.close(); }
    } finally { this.polling = false; }
  }

  // nieuwe toestand van de server: verder rekenen tot nu, en het verschil met het scherm zacht wegwerken
  apply(b) {
    if (!b || b.id !== this.id) return;
    this.b = b;
    const ns = b.state;
    // de vaste delen (raster, binnenkant van de muren, stadsbeeld) komen maar één keer mee
    if (ns && !ns.lite && ns.grid) this.fixed = { id: this.id, t0: ns.t0, grid: ns.grid, ins: ns.ins, meta: ns.meta };
    if (ns && ns.lite) {
      if (!this.fixed || this.fixed.t0 !== ns.t0) { this.fixed = null; return; } // kan niet aanvullen: volgende peiling haalt alles
      ns.grid = this.fixed.grid; ns.ins = this.fixed.ins; ns.meta = this.fixed.meta; delete ns.lite;
    }
    // een antwoord dat na een nieuwer antwoord binnenkomt, slaan we over
    const stale = ns && this.srv && this.srv.t0 === ns.t0 && ns.n < this.srv.n;
    if (ns && ns.v === FB.v && !stale) {
      this.srv = { t0: ns.t0, n: ns.n };
      const tnow = performance.now();
      this.pending = this.pending.filter((p) => !(ns.ack || []).includes(p.cid) && tnow - p.sent < 10000);
      for (const p of this.pending) queueOrder(ns, this.side, p.ids, p.o, p.at, p.cid);
      const before = new Map();
      const now = this.o.now();
      const old = this.state;
      if (old && old.t0 === ns.t0) {
        // de oude toestand eerst ook tot nu verder rekenen: zo vergelijken we posities op hetzelfde moment
        // (anders krijgt elke lopende soldaat bij elke peiling een schokje terug, zeker op een trage gsm)
        let k = 0;
        while (old.over == null && old.t + FB.tick <= now && k < 10) {
          for (const u of old.units) this.prev.set(u.id, { x: u.x, y: u.y });
          stepTo(old, old.t + FB.tick, 1); k++;
        }
        this.alpha = Math.max(0, Math.min(1, (now - old.t) / FB.tick));
        for (const u of old.units) before.set(u.id, this.pos(u));
      }
      const prev = new Map();
      let k = 0;
      while (ns.over == null && ns.t + FB.tick <= now && k < 120) {
        if (ns.t + 2 * FB.tick > now) for (const u of ns.units) prev.set(u.id, { x: u.x, y: u.y });
        stepTo(ns, ns.t + FB.tick, 1); k++;
      }
      this.state = ns;
      this.prev = prev;
      this.alpha = Math.max(0, Math.min(1, (now - ns.t) / FB.tick));
      this.offs.clear();
      for (const u of ns.units) {
        const old = before.get(u.id);
        if (!old || u.hp <= 0) continue;
        const p = this.pos(u);
        const dx = old.x - p.x; const dy = old.y - p.y;
        if (dx * dx + dy * dy > 0.0004 && dx * dx + dy * dy < 9) this.offs.set(u.id, { x: dx, y: dy });
      }
      for (const id of [...this.sel]) if (!this.regAlive(id)) this.sel.delete(id);
      this.watchMorale(ns);
      this.view.setBattle(ns);
    }
    if (b.status === 'done') { clearInterval(this.pollTimer); this.pollTimer = null; this.setLine(false); this.showResult(); }
    this.renderBars(true);
  }

  // eigen regimenten die op de vlucht slaan of hergroeperen: even melden
  watchMorale(st) {
    if (!st.regs) return;
    this.routs = this.routs || new Map();
    for (const r of st.regs) {
      if (r.s !== this.side || !this.regAlive(r.id)) continue;
      const was = this.routs.get(r.id); const now = r.st === 'rout';
      if (was != null && was !== now) {
        const name = UNITS[r.k] ? UNITS[r.k].name.toLowerCase() : r.k;
        this.flashHint(now ? `Je regiment ${name} slaat op de vlucht! Na een tijdje rust hergroepeert het.` : `Je regiment ${name} hergroepeert en luistert weer.`);
      }
      this.routs.set(r.id, now);
      if (now) this.sel.delete(r.id);
    }
  }

  unit(id) {
    if (!this.state) return null;
    if (this.byIdN !== this.state.n || this.byIdS !== this.state) { this.byId = new Map(this.state.units.map((u) => [u.id, u])); this.byIdN = this.state.n; this.byIdS = this.state; }
    return this.byId.get(id) || null;
  }

  // waar staat u nu op het scherm (tussen twee tikken in, plus de zacht vervagende correctie)
  pos(u) {
    const p = this.prev.get(u.id);
    let x = u.x; let y = u.y;
    if (p && this.state && this.state.over == null) { x = p.x + (u.x - p.x) * this.alpha; y = p.y + (u.y - p.y) * this.alpha; }
    const o = this.offs.get(u.id);
    if (o) { x += o.x; y += o.y; }
    return { x, y };
  }

  // ---------- regimenten ----------
  reg(id) { return this.state && this.state.regs ? this.state.regs[id - 1] || null : null; }
  members(id) { return this.state ? this.state.units.filter((u) => u.sq === id && u.hp > 0) : []; }
  regAlive(id) { return !!this.state && this.state.units.some((u) => u.sq === id && u.hp > 0); }
  myRegs() {
    const st = this.state;
    if (!st || !st.regs) return [];
    const alive = new Set();
    for (const u of st.units) if (u.s === this.side && u.hp > 0 && u.sq) alive.add(u.sq);
    return st.regs.filter((r) => alive.has(r.id));
  }
  selIds() { return this.state ? this.state.units.filter((u) => u.hp > 0 && this.sel.has(u.sq)).map((u) => u.id) : []; }
  selectAll() { this.sel = new Set(this.myRegs().map((r) => r.id)); }
  selectKind(k) { this.sel = new Set(this.myRegs().filter((r) => r.k === k).map((r) => r.id)); }

  // ---------- bevelen ----------
  order(o) {
    const st = this.state;
    if (!this.manual || !st || st.over != null || this.b.status !== 'live') return;
    const needIds = !(o.ready || o.retreat || o.ai != null);
    const ids = needIds ? this.selIds() : null;
    if (needIds && !ids.length) return;
    const cid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    // heel even later uitvoeren: zo kent de tegenstander het bevel meestal al vóór het gebeurt (minder correcties)
    const at = st.n + FB.lead;
    queueOrder(st, this.side, ids, o, at, cid); // meteen tonen; de server voert het op dezelfde tik uit
    this.pending.push({ cid, at, ids, o, sent: performance.now() });
    this.o.post('/battle/order', { id: this.id, ids, at, cid, have: this.have, ...o })
      .then((r) => this.apply(r.battle))
      .catch((e) => this.o.toast(e.message, 'err'));
  }

  async setMode(mode) {
    try {
      const r = await this.o.post('/battle/mode', { id: this.id, mode, have: this.have });
      this.apply(r.battle);
    } catch (e) { this.o.toast(e.message, 'err'); }
  }

  setForm(f) {
    const regs = [...this.sel].map((id) => this.reg(id)).filter(Boolean);
    if (!regs.length) return;
    const ok = regs.filter((r) => formsFor(r.k).includes(f) && !r.spread);
    if (!ok.length) { this.flashHint(regs.some((r) => r.spread) ? 'Op de muur staan ze verspreid: daar kies je geen formatie.' : `${FORMS[f].name} kan niet voor deze eenheden.`); return; }
    this.order({ form: f });
    this.flashHint(`${FORMS[f].name}: ${FORMS[f].desc}`);
  }

  setLine(on) {
    this.lineOn = !!on;
    if (this.view && this.view.cam) this.view.cam.lineMode = this.lineOn;
    if (!on) this.drag = null;
  }

  onButton(e) {
    const el = e.target.closest('[data-bact]');
    if (!el || !this.root.contains(el)) return;
    const a = el.dataset.bact;
    if (a === 'close') this.close();
    else if (a === 'all') this.selectAll();
    else if (a === 'none') { this.sel.clear(); this.setLine(false); }
    else if (a === 'sq') this.cardClick(Number(el.dataset.sq), e);
    else if (a === 'form') this.setForm(el.dataset.form);
    else if (a === 'line') { this.setLine(!this.lineOn); if (this.lineOn) this.flashHint('Trek met je vinger een lijn: daar komen ze te staan, zo breed als de lijn, met het front naar de vijand.'); }
    else if (a === 'ready') this.order({ ready: true });
    else if (a === 'charge') this.order({ charge: true });
    else if (a === 'stop') this.order({ stop: true });
    else if (a === 'retreat') {
      if (confirm('Wil je je troepen terugtrekken? De overlevenden keren naar huis terug.')) this.order({ retreat: true });
    } else if (a === 'manual') this.setMode('manual');
    else if (a === 'auto') this.setMode('auto');
    else if (a === 'focus') { if (this.state) this.view.focus(this.state); }
    else if (a === 'reports') { this.close(); this.o.openReports(); }
    else if (a === 'again') { const role = this.b.role; this.close(); if (this.o.practice) this.o.practice(role); }
    this.renderBars(true);
  }

  onKey(e) {
    if (!this.open || e.target.closest('input, textarea')) return;
    const forms = { 1: 'line', 2: 'block', 3: 'wedge', 4: 'loose', 5: 'ring' };
    if (e.key === 'Escape') { if (this.drag) this.drag = null; else if (this.sel.size) this.sel.clear(); else this.close(); }
    else if (e.key === 'a' || e.key === 'A') this.selectAll();
    else if (e.key === 's' || e.key === 'S') this.order({ stop: true });
    else if (forms[e.key] && this.sel.size) this.setForm(forms[e.key]);
    else return;
    this.renderBars(true);
    e.preventDefault();
  }

  // kaartje onderaan: één klik = dat regiment, twee keer = alle regimenten van die soort, met Shift/Ctrl erbij
  cardClick(sq, e) {
    const r = this.reg(sq);
    if (!r || !this.regAlive(sq)) return;
    const now = performance.now();
    const dbl = this.lastCard && this.lastCard.sq === sq && now - this.lastCard.t < 380;
    this.lastCard = { sq, t: now };
    if (dbl) { this.selectKind(r.k); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (this.sel.has(sq)) this.sel.delete(sq); else this.sel.add(sq); return; }
    this.sel = new Set([sq]);
    // camera naar dat regiment als het buiten beeld is
    const list = this.members(sq);
    const c = list.reduce((a, u) => ({ x: a.x + u.x / list.length, y: a.y + u.y / list.length }), { x: 0, y: 0 });
    const w = toWorld(c.x, c.y); const s = this.view.cam.worldToScreen(w.x, w.y);
    if (s.x < 30 || s.y < 30 || s.x > this.view.cam.w - 30 || s.y > this.view.cam.h - 30) { this.view.cam.x = w.x; this.view.cam.y = w.y; this.view.cam.clamp(); }
  }

  // ---------- klikken op het slagveld ----------
  // eenheid onder de vinger; own = enkel je eigen troepen of enkel vijanden, r = zoekstraal op het scherm.
  // Ook het vaandel boven een regiment telt (makkelijk aan te tikken).
  pick(sx, sy, { own = null, r = null } = {}) {
    const st = this.state;
    if (!st) return null;
    for (const bn of this.view.banners || []) {
      if (own != null && (bn.s === this.side) !== own) continue;
      if (Math.abs(sx - bn.x) <= bn.w / 2 + 4 && sy >= bn.y - 4 && sy <= bn.y + bn.h + 4) { const u = st.units.find((x) => x.sq === bn.id && x.hp > 0); if (u) return u; }
    }
    const cam = this.view.cam;
    const w = cam.screenToWorld(sx, sy);
    const rad = (r ?? (coarse() ? 24 : 15)) / cam.zoom;
    let best = null; let bd = Infinity;
    for (const u of st.units) {
      if (u.hp <= 0) continue;
      if (own != null && (u.s === this.side) !== own) continue;
      if (u.k === 'tower') {
        const c = toWorld(u.x, u.y);
        if (Math.abs(w.x - c.x) < 26 && w.y < c.y + 10 && w.y > c.y - 90) { const d = rad * 0.8; if (d < bd) { bd = d; best = u; } }
        continue;
      }
      const p = this.pos(u); const c = toWorld(p.x, p.y);
      const z = this.view.zOf(u, p);
      const d = Math.hypot(w.x - c.x, w.y - (c.y - z - (UNITS[u.k] && UNITS[u.k].type === 'cav' ? 15 : 11)));
      if (d < rad && d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // muurstuk of poort onder de vinger (ook de voorkant van de muur telt)
  pickWall(sx, sy) {
    const st = this.state;
    const t = this.view.screenTile(sx, sy);
    for (const g of [{ gx: t.gx, gy: t.gy }, t.low]) {
      const i = Math.floor(g.gx); const j = Math.floor(g.gy);
      const k = st.walls.findIndex((w) => w.hp > 0 && w.i === i && w.j === j);
      if (k >= 0) return k;
    }
    return -1;
  }

  click(sx, sy, e) {
    if (!this.state) return;
    const now = performance.now();
    // Muis: links klikken op een eigen soldaat kiest zijn regiment (zoals in Rome: Total War), rechts klikken = bevel.
    // Aanraakscherm: met troepen gekozen is een tik een bevel; een ander regiment kies je met een kaartje, door op
    // zijn vaandel te tikken of door twee keer te tikken.
    const has = this.sel.size > 0;
    const touch = e && e.pointerType ? e.pointerType !== 'mouse' : coarse();
    const near = this.pick(sx, sy, { own: true });
    const onBanner = near && (this.view.banners || []).some((bn) => bn.id === near.sq && Math.abs(sx - bn.x) <= bn.w / 2 + 4 && sy >= bn.y - 4 && sy <= bn.y + bn.h + 4);
    const dbl = !!near && !!this.lastClick && now - this.lastClick.t < 380 && this.lastClick.sq === near.sq;
    let u = dbl || onBanner ? near : has ? (touch ? null : this.pick(sx, sy, { own: true, r: 9 })) : near;
    if (u && has && !dbl && !onBanner && this.sel.has(u.sq)) u = null;
    if (u && mobile(u)) {
      if (!this.manual) { this.flashHint('De computer leidt je troepen. Kies "Zelf besturen" om ze zelf te leiden.'); return; }
      this.lastClick = { t: now, sq: u.sq };
      if (dbl) this.selectKind(u.k);
      else if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) { if (this.sel.has(u.sq)) this.sel.delete(u.sq); else this.sel.add(u.sq); }
      else this.sel = new Set([u.sq]);
      this.renderBars(true);
      return;
    }
    this.lastClick = { t: now, sq: near ? near.sq : null };
    if (has) this.command(sx, sy);
    else if (this.manual) this.flashHint(coarse() ? 'Kies eerst een regiment: tik op een kaartje onderaan, op een vaandel of op een soldaat.' : 'Kies eerst een regiment: klik op een kaartje onderaan, op een vaandel of op een soldaat.');
  }

  command(sx, sy, u = this.pick(sx, sy, { own: false })) {
    const st = this.state;
    if (!this.manual || !this.sel.size || !st) return;
    const battle = st.phase === 'battle';
    if (battle && u && u.s !== this.side) {
      this.order({ target: u.id });
      this.mark = { x: u.x, y: u.y, at: performance.now(), attack: true };
      return;
    }
    const wk = this.pickWall(sx, sy);
    if (battle && wk >= 0 && this.side === 0) {
      this.order({ wall: wk });
      const w = st.walls[wk];
      this.mark = { x: w.i + 0.5, y: w.j + 0.5, at: performance.now(), attack: true };
      return;
    }
    let { gx, gy } = this.view.screenTile(sx, sy);
    if (wk >= 0 && this.side === 1) { gx = st.walls[wk].i + 0.5; gy = st.walls[wk].j + 0.5; }
    const c = cellOf(st, gx, gy);
    if (c < 0) { this.flashHint('Dat ligt buiten het slagveld.'); return; }
    // opstelling: buiten je gebied komen ze zo dicht mogelijk bij die plek
    const outside = !battle && !inZone(st, nav(st), this.side, c);
    if (outside) this.flashHint('Dat ligt buiten je opstelgebied (gekleurd). Je troepen staan zo dicht mogelijk bij die plek.');
    this.order({ x: Math.round(gx * 100) / 100, y: Math.round(gy * 100) / 100 });
    this.mark = { x: gx, y: gy, at: performance.now(), attack: false, warn: outside };
  }

  // lijn trekken (rechts slepen, of in de lijnstand met de vinger): waar en hoe breed de formatie komt te staan.
  // Het front staat dwars op de lijn en kijkt naar de vijand.
  lineDrag(ph, sx0, sy0, sx1, sy1) {
    if (ph === 'cancel' || !this.manual || !this.sel.size || !this.state) { this.drag = null; return; }
    const st = this.state;
    const a = this.view.screenTile(sx0, sy0); const b = this.view.screenTile(sx1, sy1);
    const m = { gx: (a.gx + b.gx) / 2, gy: (a.gy + b.gy) / 2 };
    const lx = b.gx - a.gx; const ly = b.gy - a.gy; const ll = Math.hypot(lx, ly) || 1;
    let fx = -ly / ll; let fy = lx / ll;
    // welke kant op? naar het midden van de vijand (of, zonder vijanden, naar de stad / naar buiten)
    let ex = 0; let ey = 0; let en = 0;
    for (const u of st.units) if (u.s !== this.side && u.hp > 0 && mobile(u)) { ex += u.x; ey += u.y; en++; }
    const tx = en ? ex / en - m.gx : (this.side ? st.dir.x : -st.dir.x); const ty = en ? ey / en - m.gy : (this.side ? st.dir.y : -st.dir.y);
    if (fx * tx + fy * ty < 0) { fx = -fx; fy = -fy; }
    const w = ll;
    this.drag = { ax: a.gx, ay: a.gy, bx: b.gx, by: b.gy, fx, fy };
    if (ph !== 'end') return;
    this.drag = null;
    if (this.lineOn) this.setLine(false);
    const c = cellOf(this.state, m.gx, m.gy);
    if (c < 0) { this.flashHint('Dat ligt buiten het slagveld.'); return; }
    const r2 = (v) => Math.round(v * 100) / 100;
    this.order({ x: r2(m.gx), y: r2(m.gy), fx: r2(fx), fy: r2(fy), w: r2(w) });
    this.mark = { x: m.gx, y: m.gy, at: performance.now(), attack: false };
    this.renderBars(true);
  }

  longPress() {
    if (!this.manual || !this.state) return;
    this.selectAll();
    this.flashHint(`Je hele leger is gekozen (${this.sel.size} regimenten).`);
    this.renderBars(true);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* geen trilfunctie */ }
  }

  flashHint(t) { this.hintMsg = { t, until: performance.now() + 4000 }; }

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
      const list = st ? st.units.filter((u) => u.s === s) : [];
      const hp = list.reduce((a, u) => a + Math.max(0, u.hp), 0); const hp0 = list.reduce((a, u) => a + u.hp0 * (u.n || 1), 0) || 1;
      const n = list.filter((u) => mobile(u)).reduce((a, u) => a + aliveN(u), 0);
      const info = s ? meta.def : meta.att;
      return `<div class="bt-side ${s ? 'def' : 'att'}${s === this.side ? ' me' : ''}">
        <span class="bt-name"><i class="bt-dot" style="background:${info ? info.color : '#888'}"></i>${esc(info ? info.name : s ? 'Verdediger' : 'Aanvaller')}${s === this.side ? ' (jij)' : ''}</span>
        <div class="bt-bar"><i style="width:${Math.round((hp / hp0) * 100)}%;background:${info ? info.color : '#888'}"></i></div>
        <span class="bt-count">${icon('people')} ${n}</span></div>`;
    };
    let mid;
    if (b.status === 'choose' || !st) mid = `<b>${esc(b.title)}</b><span class="bt-clock">Wachten op de tegenstander… <b data-askend="${b.chooseUntil}">${mmss(b.chooseUntil - this.o.now())}</b></span>`;
    else if (st.phase === 'deploy' && b.status !== 'done') {
      const waiting = st.ready[this.side] && !st.ready[1 - this.side];
      mid = `<b>${esc(b.title)}</b><span class="bt-clock">${icon('flag')} Opstelling ${mmss(deployLeft(st))}</span>
        <span class="bt-mode">${waiting ? 'Wachten op de tegenstander' : this.manual ? 'Zet je regimenten klaar' : 'Automatisch'}</span>`;
    } else {
      const cap = st.cap > 0 && b.status !== 'done' && st.over == null ? ` · plein nog ${Math.ceil((FB.capMs - st.cap) / 1000)} s` : '';
      mid = `<b>${esc(b.title)}</b><span class="bt-clock">${icon('hourglass')} ${b.status === 'done' ? 'Voorbij' : mmss(FB.maxMs - battleTime(st))}${cap}</span>
        <span class="bt-mode">${this.manual ? 'Jij voert het bevel' : 'Automatisch'}</span>`;
    }
    setHTML(this.top, `${side(0)}<div class="bt-mid">${mid}</div>${side(1)}`);

    // onderbalk: een kaartje per regiment, de formaties en de bevelen
    let html = '';
    if (b.status === 'live' && st) {
      if (this.manual) {
        const color = this.side ? (meta.def || {}).color : (meta.att || {}).color;
        const regs = this.myRegs();
        const cards = regs.map((r) => {
          let n = 0; let hp = 0; let hp0 = 0;
          for (const u of st.units) if (u.sq === r.id && u.hp > 0) { n += aliveN(u); hp += u.hp; hp0 += u.hp0 * (u.n || 1); }
          const name = UNITS[r.k] ? UNITS[r.k].name : r.k;
          const act = doing(r);
          const fi = formsFor(r.k).length && !r.spread ? `<em class="bt-form">${icon(FORM_ICON[r.f] || 'fline')}</em>` : '';
          return `<button class="bt-card${this.sel.has(r.id) ? ' on' : ''}${r.eng ? ' fight' : ''}${r.st === 'rout' ? ' rout' : ''}" data-bact="sq" data-sq="${r.id}" title="${esc(name)} · ${FORMS[r.f] ? FORMS[r.f].name : ''} · moed ${Math.round(r.mo ?? 100)}%${act ? ` · ${act}` : ''}">
            <img src="${this.o.unitThumb(r.k, color)}" alt=""><b>${n}</b>${fi}<i style="width:${Math.round((hp / (hp0 || 1)) * 100)}%"></i></button>`;
        }).join('');
        html += `<div class="bt-cards">${cards}</div>`;
        // formaties die alle gekozen regimenten kunnen aannemen
        const selRegs = [...this.sel].map((id) => this.reg(id)).filter((r) => r && !r.spread);
        let forms = selRegs.length ? formsFor(selRegs[0].k) : [];
        for (const r of selRegs) forms = forms.filter((f) => formsFor(r.k).includes(f));
        const cur = selRegs.length && selRegs.every((r) => r.f === selRegs[0].f) ? selRegs[0].f : null;
        const formBtns = forms.length ? `<div class="bt-forms" role="group" aria-label="Formatie">${forms.map((f) => `<button class="btn small bt-fbtn${f === cur ? ' on' : ''}" data-bact="form" data-form="${f}" title="${esc(`${FORMS[f].name}: ${FORMS[f].desc}`)}">${icon(FORM_ICON[f])}<span>${FORMS[f].name}</span></button>`).join('')}</div>` : '';
        const lineBtn = this.sel.size && coarse() ? `<button class="btn small${this.lineOn ? ' primary' : ''}" data-bact="line" title="Trek een lijn: richting en breedte van de formatie">${icon('flag')} Lijn</button>` : '';
        if (st.phase === 'deploy') {
          html += `${formBtns}<div class="bt-cmds">
            ${lineBtn}
            <button class="btn small primary" data-bact="ready" ${st.ready[this.side] ? 'disabled' : ''}>${icon('flag')} ${st.ready[this.side] ? 'Klaar' : 'Start de slag'}</button>
            <button class="btn small" data-bact="all">${icon('people')} Alles</button>
            <button class="btn small ghost" data-bact="auto" title="Laat de computer je troepen leiden">Automatisch</button>
            <button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
        } else {
          html += `${formBtns}<div class="bt-cmds">
            <button class="btn small" data-bact="all">${icon('people')} Alles</button>
            ${this.sel.size ? `<button class="btn small" data-bact="none">${icon('close')} ${this.sel.size}</button>` : ''}
            ${lineBtn}
            <button class="btn small danger" data-bact="charge" ${this.sel.size ? '' : 'disabled'} title="Val de dichtstbijzijnde vijand aan">${icon('swords')} Stormloop</button>
            <button class="btn small" data-bact="stop" ${this.sel.size ? '' : 'disabled'} title="Blijf staan en ga in formatie (S)">${icon('shield')} Halt</button>
            ${b.role === 'att' ? `<button class="btn small" data-bact="retreat">${icon('back')} Terugtrekken</button>` : ''}
            <button class="btn small ghost" data-bact="auto" title="Laat de computer je troepen leiden">Automatisch</button>
            <button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
        }
      } else {
        html += `<div class="bt-cmds"><span class="small">De computer leidt je troepen.</span>
          <button class="btn small primary" data-bact="manual">${icon('flag')} Zelf besturen</button>
          <button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
      }
    } else html += `<div class="bt-cmds"><button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
    setHTML(this.bottom, html);

    let hint = '';
    if (this.hintMsg && this.hintMsg.until > now) hint = this.hintMsg.t;
    else if (st && b.status === 'live' && this.manual && this.lineOn) hint = 'Trek met je vinger een lijn waar ze moeten staan.';
    else if (st && b.status === 'live' && this.manual && st.phase === 'deploy' && !st.ready[this.side]) {
      hint = this.sel.size ? (coarse() ? 'Tik in het gekleurde gebied waar ze moeten staan, of kies een formatie.' : 'Klik in het gekleurde gebied (of sleep met de rechtermuisknop een lijn) en kies een formatie.')
        : 'Opstelling: kies een regiment (kaartje of vaandel), zet het in het gekleurde gebied en druk op Start.';
    } else if (st && b.status === 'live' && this.manual && st.phase === 'battle' && !this.sel.size && battleTime(st) < 25000) {
      hint = coarse() ? 'Tik op een vaandel of kaartje, dan op de grond, een vijand of een muur.' : 'Klik op een vaandel of kaartje, dan rechts op de grond, een vijand of een muur. Rechts slepen = lijn met richting.';
    }
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
    const resPills = (o) => Object.entries(o || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span class="pill">${n} ${k === 'food' ? 'voedsel' : k === 'wood' ? 'hout' : k === 'stone' ? 'steen' : 'goud'}</span>`).join(' ');
    const loot = resPills(r.loot);
    const bounty = won ? resPills(r.bounty) : '';
    const practice = this.b.kind === 'practice' || r.practice;
    this.resultEl.innerHTML = `<div class="bt-res-card ${won ? 'won' : 'lost'}">
      <div class="bt-ask-crest">${icon(won ? 'trophy' : 'shield')}</div>
      <h2>${won ? 'Overwinning!' : 'Nederlaag'}</h2>
      ${practice ? '<p class="small muted" style="margin:0">Oefenslag: je stad en je leger blijven zoals ze waren.</p>' : ''}
      <p>${r.retreat ? 'Je troepen trokken zich terug. ' : ''}${this.b.role === 'att' ? (won ? 'De stad is ingenomen.' : 'De aanval is afgeslagen.') : (won ? 'Je stad hield stand!' : 'De vijand brak door je verdediging.')}</p>
      <dl class="kv"><dt>Jouw verliezen</dt><dd>${list(lost)}</dd><dt>Vijanden verslagen</dt><dd>${list(kill)}</dd>
      ${loot ? `<dt>${this.b.role === 'att' ? 'Buit' : 'Geplunderd'}</dt><dd>${loot}</dd>` : ''}
      ${bounty ? `<dt>Krijgsbuit</dt><dd>${bounty}</dd>` : ''}</dl>
      <div class="bt-ask-btns">${practice ? `<button class="btn primary" data-bact="again">${icon('swords')} Nog eens</button>` : `<button class="btn primary" data-bact="reports">${icon('scroll')} Rapport</button>`}<button class="btn" data-bact="close">Sluiten</button></div></div>`;
    this.resultEl.hidden = false;
    if (won && this.view.cam) { const c = this.view.cam; for (let i = 0; i < 4; i++) setTimeout(() => this.view.particles.confetti(c.x + (i - 1.5) * 80, c.y - 60, 40), i * 250); }
  }

  // ---------- tekenen ----------
  frame(t) {
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    if (this.root.hidden) return;
    if (!(this.pacer || (this.pacer = new FX.Pacer())).ok(t)) return; // hooguit ±60 beelden per seconde
    const dt = Math.min(100, t - (this.lastT || t));
    this.lastT = t;
    const st = this.state;
    const now = this.o.now();
    if (st && this.b.status === 'live' && st.over == null) {
      // verder rekenen tot nu, tik per tik (de server stuurt elke peiling de echte toestand)
      let k = 0;
      while (st.over == null && st.t + FB.tick <= now && k < 40) {
        for (const u of st.units) this.prev.set(u.id, { x: u.x, y: u.y });
        stepTo(st, st.t + FB.tick, 1);
        k++;
      }
      if (k >= 40) this.prev.clear();
    }
    if (st) this.alpha = Math.max(0, Math.min(1, (now - st.t) / FB.tick));
    // correcties van de server zacht laten verdwijnen
    // (exponentieel, maar nooit sneller dan ±2,5 tegels per seconde: zo glijdt een troep bij in plaats van te springen)
    if (this.offs.size) {
      const f = 1 - Math.exp(-dt / 220); const cap = 2.5 * dt / 1000;
      for (const [id, o] of this.offs) {
        const m = Math.sqrt(o.x * o.x + o.y * o.y);
        const k = m > 0 ? Math.max(0, m - Math.min(m * f + 0.0005, cap)) / m : 0;
        o.x *= k; o.y *= k;
        if (m * k < 0.004) this.offs.delete(id);
      }
    }
    if (!st) { this.drawWaiting(t); this.renderBars(); return; }
    // doelwitten van je gekozen regimenten en de vijand onder de muis
    this.targets.clear();
    for (const id of this.sel) {
      const r = this.reg(id);
      if (!r || (r.st !== 'attack' && r.st !== 'charge')) continue;
      if (r.tu) this.targets.add(r.tu);
      if (r.tr) for (const u of st.units) if (u.sq === r.tr && u.hp > 0) this.targets.add(u.id);
    }
    const hov = this.view.hoverS;
    this.hoverU = hov && this.manual && this.sel.size && !coarse() ? this.pick(hov.x, hov.y) : null;
    if (this.hoverU && this.hoverU.s === this.side) this.hoverU = null;
    this.hoverWall = hov && this.manual && this.sel.size && !coarse() && this.side === 0 && st.phase === 'battle' && !this.hoverU ? this.pickWall(hov.x, hov.y) : null;
    if (this.hoverWall === -1) this.hoverWall = null;
    this.view.setBattle(st);
    this.view.draw(t, dt, now);
    this.renderBars();
    for (const el of this.root.querySelectorAll('[data-askend]')) el.textContent = mmss(Number(el.dataset.askend) - now);
  }

  drawWaiting(t) {
    const cv = this.cv; const ctx = cv.getContext('2d');
    const w = cv.clientWidth; const h = cv.clientHeight; const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2a2015'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4e8cc'; ctx.font = '600 16px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
    const dots = '.'.repeat(1 + Math.floor(t / 400) % 3);
    ctx.fillText(this.b && this.b.status === 'choose' ? `De legers stellen zich op${dots}` : `Slagveld laden${dots}`, w / 2, h / 2);
  }
}

export { nav };
