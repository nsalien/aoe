// Belegering die je zelf bestuurt (of bekijkt). De server is de baas over het verloop; de browser rekent
// tussen twee peilingen exact hetzelfde verder (fieldbattle.js is deterministisch) zodat alles vloeiend beweegt.
// Je eigen bevelen gaan meteen in, met het tijdstip (tik) waarop je tikte; de server voert ze op dezelfde tik uit.
import { UNITS } from '../shared/rules.js';
import { stepTo, queueOrder, FB, mobile, aliveN, battleTime, deployLeft, nav, cellOf, inZone } from '../shared/fieldbattle.js';
import { SiegeView, toWorld } from './siegeview.js';
import { icon } from './icons.js';
import { setHTML } from './dom.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const coarse = () => matchMedia('(pointer: coarse)').matches;

// ---------- keuzevenster: zelf besturen of automatisch ----------
export function askHtml(b, now) {
  const att = b.role === 'att';
  const camp = b.kind === 'camp';
  const left = Math.max(0, b.chooseUntil - now);
  const head = att ? `Je leger staat bij ${esc(b.title)}!` : `${esc(b.title)} wordt aangevallen${b.attName ? ` door ${esc(b.attName)}` : ''}!`;
  const text = att
    ? (camp ? 'Stel je troepen op en val het kamp zelf aan, of laat het gevecht automatisch uitrekenen.'
      : 'Bestuur de belegering zelf: stel je leger op, ram de poort of sla een bres in de muur en verover het plein. Of laat het gevecht automatisch uitrekenen.')
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
    this.sel = new Set();
    this.targets = new Set();
    this.prev = new Map(); // positie één tik eerder (voor vloeiende beweging)
    this.offs = new Map(); // verschil met wat er op het scherm stond toen de server iets anders zei (vervaagt)
    this.pending = []; // eigen bevelen die de server nog niet bevestigde
    this.alpha = 0;
    this.view = new SiegeView(this.cv, this);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('click', (e) => this.onButton(e));
  }

  get open() { return !this.root.hidden; }
  get side() { return this.b && this.b.role === 'def' ? 1 : 0; }
  get manual() { return !!this.b && (this.b.role === 'att' ? this.b.attMode : this.b.defMode) === 'manual'; }

  show(id, battle = null) {
    if (this.id !== id) {
      this.id = id; this.b = null; this.state = null; this.srv = null; this.sel.clear(); this.prev.clear(); this.offs.clear(); this.pending = [];
      this.resultShown = false; this.resultEl.hidden = true; this.view.key = null;
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

  // nieuwe toestand van de server: verder rekenen tot nu, en het verschil met het scherm zacht wegwerken
  apply(b) {
    if (!b || b.id !== this.id) return;
    this.b = b;
    const ns = b.state;
    // een antwoord dat na een nieuwer antwoord binnenkomt, slaan we over
    const stale = ns && this.srv && this.srv.t0 === ns.t0 && ns.n < this.srv.n;
    if (ns && ns.v === 2 && !stale) {
      this.srv = { t0: ns.t0, n: ns.n };
      const tnow = performance.now();
      this.pending = this.pending.filter((p) => !(ns.ack || []).includes(p.cid) && tnow - p.sent < 10000);
      for (const p of this.pending) queueOrder(ns, this.side, p.ids, p.o, p.at, p.cid);
      const before = new Map();
      if (this.state && this.state.t0 === ns.t0) for (const u of this.state.units) before.set(u.id, this.pos(u));
      const now = this.o.now();
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
      for (const id of [...this.sel]) { const u = this.unit(id); if (!u || u.hp <= 0) this.sel.delete(id); }
      this.view.setBattle(ns);
    }
    if (b.status === 'done') { clearInterval(this.pollTimer); this.pollTimer = null; this.showResult(); }
    this.renderBars(true);
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

  // ---------- bevelen ----------
  order(o, ids = [...this.sel]) {
    const st = this.state;
    if (!this.manual || !st || st.over != null || this.b.status !== 'live') return;
    const needIds = !(o.ready || o.retreat || o.ai != null);
    if (needIds && !ids.length) return;
    const cid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    // heel even later uitvoeren: zo kent de tegenstander het bevel meestal al vóór het gebeurt (minder correcties)
    const at = st.n + FB.lead;
    const list = needIds ? ids : null;
    queueOrder(st, this.side, list, o, at, cid); // meteen tonen; de server voert het op dezelfde tik uit
    this.pending.push({ cid, at, ids: list, o, sent: performance.now() });
    this.o.post('/battle/order', { id: this.id, ids: list, at, cid, ...o })
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
    else if (a === 'sq') this.cardClick(Number(el.dataset.sq), e);
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
    if (e.key === 'Escape') { if (this.sel.size) this.sel.clear(); else this.close(); }
    else if (e.key === 'a' || e.key === 'A') this.selectAll();
    else if (e.key === 's' || e.key === 'S') this.order({ stop: true });
    else return;
    this.renderBars(true);
    e.preventDefault();
  }

  mine() { return this.state ? this.state.units.filter((u) => u.s === this.side && u.hp > 0 && mobile(u)) : []; }
  selectAll() { this.sel = new Set(this.mine().map((u) => u.id)); }
  selectKind(k) { this.sel = new Set(this.mine().filter((u) => u.k === k).map((u) => u.id)); }

  // kaartje onderaan: één klik = die eenheid, twee keer = alle van die soort, met Shift/Ctrl erbij
  cardClick(sq, e) {
    const list = this.mine().filter((u) => u.sq === sq);
    if (!list.length) return;
    const now = performance.now();
    const dbl = this.lastCard && this.lastCard.sq === sq && now - this.lastCard.t < 380;
    this.lastCard = { sq, t: now };
    if (dbl) { this.selectKind(list[0].k); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { const on = list.every((u) => this.sel.has(u.id)); for (const u of list) if (on) this.sel.delete(u.id); else this.sel.add(u.id); return; }
    this.sel = new Set(list.map((u) => u.id));
    // camera naar die eenheid als ze buiten beeld is
    const c = list.reduce((a, u) => ({ x: a.x + u.x / list.length, y: a.y + u.y / list.length }), { x: 0, y: 0 });
    const w = toWorld(c.x, c.y); const s = this.view.cam.worldToScreen(w.x, w.y);
    if (s.x < 30 || s.y < 30 || s.x > this.view.cam.w - 30 || s.y > this.view.cam.h - 30) { this.view.cam.x = w.x; this.view.cam.y = w.y; this.view.cam.clamp(); }
  }

  // ---------- klikken op het slagveld ----------
  // eenheid onder de vinger; own = enkel je eigen troepen of enkel vijanden, r = zoekstraal op het scherm
  pick(sx, sy, { own = null, r = null } = {}) {
    const st = this.state;
    if (!st) return null;
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
    // met troepen gekozen is een tik een bevel; enkel wie precies op een andere eigen troep tikt, kiest die.
    // Twee keer snel op een troep tikken kiest altijd alle troepen van die soort.
    // Aanraakscherm: met troepen gekozen is een tik altijd een bevel (een andere troep kies je met een kaartje of
    // door twee keer te tikken). Muis: links klikken op een eigen troep kiest die, zoals in Age of Empires.
    const has = this.sel.size > 0;
    const touch = e && e.pointerType ? e.pointerType !== 'mouse' : coarse();
    const near = this.pick(sx, sy, { own: true });
    const dbl = !!near && !!this.lastClick && now - this.lastClick.t < 380 && this.lastClick.k === near.k;
    let u = dbl ? near : has ? (touch ? null : this.pick(sx, sy, { own: true, r: 9 })) : near;
    if (u && has && !dbl && this.sel.has(u.id)) u = null;
    if (u && mobile(u)) {
      if (!this.manual) { this.flashHint('De computer leidt je troepen. Kies "Zelf besturen" om ze zelf te leiden.'); return; }
      this.lastClick = { t: now, k: u.k };
      if (dbl) this.selectKind(u.k);
      else if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) { if (this.sel.has(u.id)) this.sel.delete(u.id); else this.sel.add(u.id); }
      else this.sel = new Set([u.id]);
      this.renderBars(true);
      return;
    }
    this.lastClick = { t: now, k: near ? near.k : null };
    if (has) this.command(sx, sy);
    else if (this.manual) this.flashHint(coarse() ? 'Kies eerst troepen: tik op een kaartje onderaan of op een figuur.' : 'Kies eerst troepen: klik op een kaartje onderaan of op een figuur.');
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

  longPress() {
    if (!this.manual || !this.state) return;
    this.selectAll();
    this.flashHint(`Je hele leger is gekozen (${this.sel.size}).`);
    this.renderBars(true);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* geen trilfunctie */ }
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
        <span class="bt-mode">${waiting ? 'Wachten op de tegenstander' : this.manual ? 'Zet je troepen klaar' : 'Automatisch'}</span>`;
    } else {
      const cap = st.cap > 0 && b.status !== 'done' && st.over == null ? ` · plein nog ${Math.ceil((FB.capMs - st.cap) / 1000)} s` : '';
      mid = `<b>${esc(b.title)}</b><span class="bt-clock">${icon('hourglass')} ${b.status === 'done' ? 'Voorbij' : mmss(FB.maxMs - battleTime(st))}${cap}</span>
        <span class="bt-mode">${this.manual ? 'Jij voert het bevel' : 'Automatisch'}</span>`;
    }
    setHTML(this.top, `${side(0)}<div class="bt-mid">${mid}</div>${side(1)}`);

    // onderbalk: een kaartje per eenheid en de bevelen
    let html = '';
    if (b.status === 'live' && st) {
      if (this.manual) {
        const color = this.side ? (meta.def || {}).color : (meta.att || {}).color;
        const sqs = new Map();
        for (const u of this.mine()) {
          const q = sqs.get(u.sq) || { sq: u.sq, k: u.k, n: 0, hp: 0, hp0: 0, on: true };
          q.n += aliveN(u); q.hp += u.hp; q.hp0 += u.hp0 * (u.n || 1); if (!this.sel.has(u.id)) q.on = false;
          sqs.set(u.sq, q);
        }
        const cards = [...sqs.values()].sort((a, c) => a.sq - c.sq).map((q) => `<button class="bt-card${q.on ? ' on' : ''}" data-bact="sq" data-sq="${q.sq}" title="${esc(UNITS[q.k] ? UNITS[q.k].name : q.k)}">
          <img src="${this.o.unitThumb(q.k, color)}" alt=""><b>${q.n}</b><i style="width:${Math.round((q.hp / (q.hp0 || 1)) * 100)}%"></i></button>`).join('');
        html += `<div class="bt-cards">${cards}</div>`;
        if (st.phase === 'deploy') {
          html += `<div class="bt-cmds">
            <button class="btn small primary" data-bact="ready" ${st.ready[this.side] ? 'disabled' : ''}>${icon('flag')} ${st.ready[this.side] ? 'Klaar' : 'Start de slag'}</button>
            <button class="btn small" data-bact="all">${icon('people')} Alles</button>
            <button class="btn small ghost" data-bact="auto" title="Laat de computer je troepen leiden">Automatisch</button>
            <button class="btn small ghost" data-bact="close">${icon('close')} Sluiten</button></div>`;
        } else {
          html += `<div class="bt-cmds">
            <button class="btn small" data-bact="all">${icon('people')} Alles</button>
            ${this.sel.size ? `<button class="btn small" data-bact="none">${icon('close')} ${this.sel.size}</button>` : ''}
            <button class="btn small danger" data-bact="charge" ${this.sel.size ? '' : 'disabled'} title="Val de dichtstbijzijnde vijand aan">${icon('swords')} Stormloop</button>
            <button class="btn small" data-bact="stop" ${this.sel.size ? '' : 'disabled'} title="Blijf staan (S)">${icon('shield')} Halt</button>
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
    else if (st && b.status === 'live' && this.manual && st.phase === 'deploy' && !st.ready[this.side]) {
      hint = this.sel.size ? 'Tik in het gekleurde gebied waar ze moeten staan.' : 'Opstelling: tik op een kaartje onderaan en dan in het gekleurde gebied. Druk daarna op Start.';
    } else if (st && b.status === 'live' && this.manual && st.phase === 'battle' && !this.sel.size && battleTime(st) < 25000) {
      hint = coarse() ? 'Tik op een troep of kaartje, dan op de grond, een vijand of een muur.' : 'Klik op een troep of kaartje, dan op de grond, een vijand of een muur (rechtsklik werkt ook).';
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
    const loot = Object.entries(r.loot || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span class="pill">${n} ${k === 'food' ? 'voedsel' : k === 'wood' ? 'hout' : k === 'stone' ? 'steen' : 'goud'}</span>`).join(' ');
    const practice = this.b.kind === 'practice' || r.practice;
    this.resultEl.innerHTML = `<div class="bt-res-card ${won ? 'won' : 'lost'}">
      <div class="bt-ask-crest">${icon(won ? 'trophy' : 'shield')}</div>
      <h2>${won ? 'Overwinning!' : 'Nederlaag'}</h2>
      ${practice ? '<p class="small muted" style="margin:0">Oefenslag: je stad en je leger blijven zoals ze waren.</p>' : ''}
      <p>${r.retreat ? 'Je troepen trokken zich terug. ' : ''}${this.b.role === 'att' ? (won ? 'De stad is ingenomen.' : 'De aanval is afgeslagen.') : (won ? 'Je stad hield stand!' : 'De vijand brak door je verdediging.')}</p>
      <dl class="kv"><dt>Jouw verliezen</dt><dd>${list(lost)}</dd><dt>Vijanden verslagen</dt><dd>${list(kill)}</dd>
      ${loot ? `<dt>${this.b.role === 'att' ? 'Buit' : 'Geplunderd'}</dt><dd>${loot}</dd>` : ''}</dl>
      <div class="bt-ask-btns">${practice ? `<button class="btn primary" data-bact="again">${icon('swords')} Nog eens</button>` : `<button class="btn primary" data-bact="reports">${icon('scroll')} Rapport</button>`}<button class="btn" data-bact="close">Sluiten</button></div></div>`;
    this.resultEl.hidden = false;
    if (won && this.view.cam) { const c = this.view.cam; for (let i = 0; i < 4; i++) setTimeout(() => this.view.particles.confetti(c.x + (i - 1.5) * 80, c.y - 60, 40), i * 250); }
  }

  // ---------- tekenen ----------
  frame(t) {
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    if (this.root.hidden) return;
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
    // doelwitten van je gekozen troepen en de vijand onder de muis
    this.targets.clear();
    for (const id of this.sel) { const u = this.unit(id); if (u && u.tg != null && u.st === 'attack') this.targets.add(u.tg); }
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
