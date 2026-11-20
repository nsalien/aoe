// Hoofdprogramma: aanmelden, spelstatus, tekenlus en alle knoppen.
import { get, post } from './api.js';
import { TownView } from './town.js';
import { WorldView } from './world.js';
import * as UI from './ui.js';
import * as FX from './fx.js';
import { setHTML, resetHTML } from './dom.js';
import { advance } from '../shared/sim.js';
import { RES, RES_NAMES, BUILDINGS, BONUS, fmtDuration } from '../shared/rules.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privé-venster */ } },
};

const app = {
  info: null,
  data: null,
  offset: 0,
  view: 'town',
  map: null,
  mapAt: 0,
  live: null,
  sig: '',
  selBuilding: null,
  placing: null,
  pendingAlloc: null,
  canAct: false,
  modal: null,
  seenReports: 0,
  knownHostile: new Set(),
  chat: { chan: 'team', seen: store.get('rvs-chat-seen') || {}, last: {} },
  now() { return Date.now() + this.offset; },
};
window.__app = app; // handig bij het debuggen in de console

let town = null;
let world = null;
let authWorld = null;

// ---------- meldingen ----------
function toast(msg, type = '', ic = null) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const name = ic || (type === 'err' ? 'bell' : type === 'ok' ? 'star' : 'scroll');
  el.innerHTML = `${UI.icon(name)}<span>${UI.esc(msg)}</span>`;
  const box = $('#toasts');
  while (box.children.length >= 4) box.firstElementChild.remove();
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 4500 : 3200);
}

// ---------- opstarten ----------
async function boot() {
  try {
    app.info = await get('/info');
  } catch (e) {
    showAuth(`Kan de server niet bereiken: ${e.message}`);
    return;
  }
  if (!app.info.world) {
    showAuth('Er is nog geen wereld aangemaakt. De spelleider moet eerst <a href="/admin.html">/admin.html</a> openen.');
    return;
  }
  try {
    const data = await get('/state');
    startGame(data);
  } catch (e) {
    if (e.status === 401) showAuth();
    else showAuth(e.message);
  }
}

function hideSplash() {
  const s = $('#splash');
  if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 700); }
}

function showAuth(msg) {
  hideSplash();
  $('#auth').hidden = false;
  $('#game').hidden = true;
  const w = app.info && app.info.world;
  const f = (t) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  let html = msg || '';
  if (w && !msg) {
    const phase = { lobby: `Het seizoen start op <b>${f(w.startAt)}</b>.`, prep: `${UI.icon('dove')} Vredestijd tot <b>${f(w.prepEnd)}</b>.`, war: `${UI.icon('swords')} Oorlog tot <b>${f(w.warEnd)}</b>!`, ended: `${UI.icon('flag')} Het seizoen is afgelopen.` }[w.phase];
    html = `${phase}<br>${app.info.players} heerser(s) in de vallei · teams van ${w.teamSize}`;
    $('#joinCodeRow').hidden = !w.needsCode;
  }
  $('#authInfo').innerHTML = html;
  if (!authWorld) {
    authWorld = new WorldView($('#authCanvas'));
    authWorld.cam.enabled = false;
    const seed = w ? w.seed : 12345;
    authWorld.setWorld(seed, w ? w.size : 56);
    authWorld.setData({ towns: [], camps: [], teams: [] }, null, null);
    authWorld.cam.zoom = 1.3;
    authWorld.centerOnTile(20, 24);
  }
}

// meldingen over afgewerkte gebouwen bundelen
let celebrateQueue = [];
let celebrateTimer = null;
function flushCelebrate() {
  const q = celebrateQueue;
  celebrateQueue = [];
  const tc = q.find((b) => b.type === 'tc');
  if (tc) toast(`Je volk leeft nu in het ${UI.AGES_NAME(tc.level)}!`, 'ok', 'crown');
  const rest = q.filter((b) => b.type !== 'tc');
  if (rest.length === 1) {
    const b = rest[0];
    toast(`${BUILDINGS[b.type].name} ${b.level === 1 ? 'is klaar' : `is nu niveau ${b.level}`}`, 'ok', 'hammer');
  } else if (rest.length > 1) {
    toast(`${rest.length} bouwwerken zijn klaar`, 'ok', 'hammer');
  }
}

function startGame(data) {
  hideSplash();
  $('#auth').hidden = true;
  $('#game').hidden = false;
  if (!town) {
    town = new TownView($('#townCanvas'));
    world = new WorldView($('#worldCanvas'));
    town.onSelect = (b) => { app.selBuilding = b ? b.id : null; renderPanel(); openPanelMobile(!!b); };
    town.onPlace = placeBuilding;
    town.onCancelPlace = cancelPlace;
    town.onHarvest = (node, walker) => harvestNode(node.id, walker ? walker.job : null);
    town.onVillagerSelect = (v) => {
      const hint = $('#placeHint');
      if (!v) { if (!app.placing) hint.hidden = true; return; }
      const job = v.job === 'idle' ? 'niets aan het doen' : `aan het werk met ${RES_NAMES[v.job].toLowerCase()}`;
      hint.hidden = false;
      hint.innerHTML = `Dorpeling gekozen (${job}). Klik op een <b>vondst</b> om te oogsten.<button class="btn small" data-action="cancelVillager">Annuleren</button>`;
    };
    town.onHarvested = (node) => toast(`Je dorpeling bracht ${node.amount} ${RES_NAMES[node.res].toLowerCase()} mee!`, 'ok', 'star');
    town.onCelebrate = (b) => {
      celebrateQueue.push(b);
      clearTimeout(celebrateTimer);
      celebrateTimer = setTimeout(flushCelebrate, 250);
    };
    renderLightBtn();
    world.onSelect = () => { renderPanel(); openPanelMobile(!!world.selected); };
    app.views = { town, world };
  }
  app.seenReports = data.unseenReports;
  applyState(data, true);
  const tc = data.town.state.buildings.find((b) => b.type === 'tc');
  town.centerOn(tc);
  setInterval(tick, 1000);
  setInterval(poll, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  maybeShowIntro();
}

function maybeShowIntro() {
  const key = `rvs-intro-${app.data.world.startAt}-${app.data.me.id}`;
  if (!store.get(key)) {
    store.set(key, 1);
    openModal('help');
  } else if (app.data.world.phase === 'ended' && !store.get(`${key}-end`)) {
    store.set(`${key}-end`, 1);
    openModal('leaderboard');
  }
}

// ---------- spelstatus ----------
function applyState(data, first = false) {
  const prevPhase = app.data && app.data.world.phase;
  app.data = data;
  const off = data.now - Date.now();
  if (first || Math.abs(off - app.offset) > 1500) app.offset = off;
  app.canAct = data.world.phase === 'prep' || data.world.phase === 'war';
  town.setTown(data.town.id, data.team.color);
  computeLive(true);
  world.setMarches(data.marches);
  if (prevPhase && prevPhase !== data.world.phase) {
    if (data.world.phase === 'war') toast('De oorlog is begonnen! Je kan nu vijandelijke steden aanvallen.', 'err', 'swords');
    if (data.world.phase === 'ended') { toast('Het seizoen is voorbij!', '', 'flag'); openModal('leaderboard'); }
  }
  // nieuwe rapporten
  if (data.unseenReports > app.seenReports) toast(`${data.unseenReports - app.seenReports} nieuw(e) rapport(en)`, '', 'scroll');
  app.seenReports = data.unseenReports;
  const br = $('#badgeReports');
  br.hidden = !data.unseenReports; br.textContent = data.unseenReports;
  // chat
  const chatNew = ['team', 'world'].some((c) => (data.chat[c] || 0) > (app.chat.seen[c] || 0));
  $('#badgeChat').hidden = !chatNew;
  // inkomende aanvallen
  for (const m of data.marches) {
    if (!m.ally && m.status === 'out' && !app.knownHostile.has(m.id)) {
      app.knownHostile.add(m.id);
      if (!first) toast(`${m.player} stuurt een ${m.kind === 'scout' ? 'verkenning' : 'aanval'} naar ${m.to.name}!`, 'err', 'swords');
    }
  }
  renderAll();
}

function computeLive(force) {
  const d = app.data;
  if (!d) return;
  const s = structuredClone(d.town.state);
  advance(s, Math.min(app.now(), d.world.warEnd), d.world.speed);
  s._away = d.awayPop;
  app.live = s;
  const sig = [
    s.builds.map((j) => `${j.bid}:${j.to}`).join(','),
    Object.entries(s.queues).map(([k, q]) => `${k}${q.length}:${q[0].done}`).join(','),
    s.buildings.map((b) => b.level).join(''),
    JSON.stringify(s.units), JSON.stringify(s.villagers), s.rally,
    (s.nodes || []).map((n) => `${n.id}${n.claimed ? 'c' : ''}`).join(','),
    (s.harvests || []).map((h) => h.id).join(','),
  ].join('|');
  const changed = sig !== app.sig;
  app.sig = sig;
  if (changed || force) {
    town.setState(s);
    return true;
  }
  town.state = s;
  return false;
}

async function poll() {
  if (document.hidden || !app.data) return;
  try {
    const data = await get('/state');
    applyState(data);
    if (app.view === 'world' && Date.now() - app.mapAt > 40000) loadMap();
  } catch (e) {
    if (e.status === 401) location.reload();
  }
}

async function refresh() {
  try { applyState(await get('/state')); } catch (e) { toast(e.message, 'err'); }
}

async function loadMap() {
  try {
    const map = await get('/map');
    app.map = map;
    app.mapAt = Date.now();
    world.setWorld(app.data.world.seed, app.data.world.size);
    world.setData(map, app.data.town.id, app.data.me.teamId);
    if (app.view === 'world') renderPanel();
  } catch (e) { toast(e.message, 'err'); }
}

let tickN = 0;
function tick() {
  if (!app.data) return;
  tickN++;
  const changed = computeLive(false);
  renderResBar();
  if (changed || tickN % 5 === 0) {
    if (app.view === 'town') renderPanel();
    renderBuildBar();
  }
  updateTimers();
  renderAlert();
  const w = app.data.world;
  const now = app.now();
  if ((w.phase === 'prep' && now >= w.prepEnd) || (w.phase === 'war' && now >= w.warEnd) || (w.phase === 'lobby' && now >= w.startAt)) {
    w.phase = 'x';
    refresh();
  }
  // legers die net aankwamen: even later opnieuw ophalen
  if (app.data.marches.some((m) => m.arriveAt <= now && m.arriveAt > now - 1000)) setTimeout(refresh, 1500);
}

function updateTimers() {
  const now = app.now();
  for (const el of document.querySelectorAll('[data-end]')) {
    const left = Number(el.dataset.end) - now;
    el.textContent = left > 0 ? fmtDuration(left) : 'klaar';
  }
  for (const el of document.querySelectorAll('[data-bend]')) {
    const a = Number(el.dataset.bstart); const b = Number(el.dataset.bend);
    el.style.width = `${Math.max(0, Math.min(100, ((now - a) / Math.max(1, b - a)) * 100))}%`;
  }
}

// ---------- weergave ----------
function renderAll() {
  renderResBar();
  renderPhase();
  renderBuildBar();
  renderPanel();
  renderViewTitle();
  renderAlert();
  updateTimers();
}

function renderResBar() {
  const live = app.live;
  const prev = app.prevRes || live.res;
  const cap = Math.max(1, UI.capacityOf(live));
  const now = Date.now();
  app.bumpUntil = app.bumpUntil || {};
  for (const r of RES) if (live.res[r] - prev[r] > cap * 0.02) app.bumpUntil[r] = now + 700;
  app.prevRes = { ...live.res };
  const bumps = RES.filter((r) => (app.bumpUntil[r] || 0) > now);
  setHTML($('#resbar'), UI.resBarHtml(live, app.data.world.speed, bumps));
}

function renderPhase() {
  const p = UI.phaseHtml(app.data.world, app.now());
  const el = $('#phase');
  el.className = `phase ${p.cls}`;
  setHTML(el, p.html);
}

function renderAlert() {
  const el = $('#alert');
  const hostile = app.data.marches.filter((m) => !m.ally && m.status === 'out' && m.arriveAt > app.now()).sort((a, b) => a.arriveAt - b.arriveAt);
  if (!hostile.length) { el.hidden = true; return; }
  const m = hostile[0];
  el.hidden = false;
  el.dataset.action = 'alertGo';
  el.dataset.x = m.to.x; el.dataset.y = m.to.y;
  setHTML(el, `${UI.icon('bell')} ${m.kind === 'scout' ? 'Verkenners' : 'Aanval'} op ${UI.esc(m.to.name)} over <span data-end="${m.arriveAt}">${fmtDuration(m.arriveAt - app.now())}</span>${hostile.length > 1 ? ` (+${hostile.length - 1})` : ''}`);
}

function renderViewTitle() {
  const d = app.data;
  $('#viewTitle').innerHTML = app.view === 'town'
    ? `${UI.esc(d.town.name)}<small>${UI.esc(d.me.name)} · ${UI.esc(d.team.name)}</small>`
    : 'De Vallei<small>Wereldkaart · sleep om rond te kijken</small>';
}

// Panelen niet verversen terwijl je erop klikt of in een veld typt (anders gaan klikken verloren).
const busy = { panel: false, buildbar: false };
const pending = { panel: false, buildbar: false };
function isBusy(id) {
  if (busy[id]) return true;
  const a = document.activeElement;
  return id === 'panel' && a && $('#panel').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
}
function flushPending() {
  if (pending.panel && !isBusy('panel')) renderPanel();
  if (pending.buildbar && !isBusy('buildbar')) renderBuildBar();
}
for (const id of ['panel', 'buildbar']) {
  document.getElementById(id).addEventListener('pointerdown', () => { busy[id] = true; });
}
const release = () => setTimeout(() => { busy.panel = false; busy.buildbar = false; flushPending(); }, 0);
document.addEventListener('pointerup', release);
document.addEventListener('pointercancel', release);
document.getElementById('panel').addEventListener('focusout', () => setTimeout(flushPending, 0));

function renderBuildBar(force = false) {
  const bb = $('#buildbar');
  bb.hidden = app.view !== 'town' || !app.canAct;
  if (bb.hidden) return;
  if (!force && isBusy('buildbar')) { pending.buildbar = true; return; }
  pending.buildbar = false;
  setHTML(bb, UI.buildBarHtml(app.live, app.placing, app.data.team.color));
}

function renderPanel(force = false) {
  const panel = $('#panel');
  const key = `${app.view}|${app.selBuilding}|${world && world.selected ? world.selected.kind + world.selected.obj.id : ''}`;
  const newContext = key !== app.panelKey;
  if (!newContext && !force && isBusy('panel')) { pending.panel = true; return; }
  pending.panel = false;
  let html;
  if (app.view === 'town') {
    const b = app.selBuilding && app.live.buildings.find((x) => x.id === app.selBuilding);
    if (!b) app.selBuilding = null;
    town.selected = app.selBuilding;
    html = b ? UI.buildingPanelHtml(app, app.live, b) : UI.townOverviewHtml(app, app.live);
  } else {
    html = UI.worldPanelHtml(app, world.selected);
  }
  if (newContext) {
    // ander gebouw of andere weergave: alles vervangen en zacht laten inschuiven
    app.panelKey = key;
    resetHTML(panel);
    setHTML(panel, html);
    panel.scrollTop = 0;
    panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter');
    clearTimeout(app.enterTimer);
    app.enterTimer = setTimeout(() => panel.classList.remove('enter'), 450);
  } else {
    setHTML(panel, html);
  }
  updateTimers();
  if (panel.querySelector('#allyList') && !panel.querySelector('#allyList')._filled) fillAllyList();
}

async function fillAllyList() {
  const el = $('#allyList');
  if (!app.team) {
    try { app.team = (await get('/team')).members; } catch { el.textContent = 'Kon bondgenoten niet laden.'; return; }
  }
  const allies = app.team.filter((m) => !m.me);
  const cur = $('#allyList');
  if (!cur) return;
  cur.innerHTML = allies.length
    ? allies.map((m) => `<div class="row"><span class="grow">${UI.esc(m.player)} — ${UI.esc(m.town)}</span><button class="btn small" data-action="sendTo" data-kind="trade" data-id="${m.townId}">Karavaan</button></div>`).join('')
    : 'Je hebt (nog) geen bondgenoot.';
  cur._filled = true;
}

function renderLightBtn() {
  const b = $('#lightBtn');
  if (!b) return;
  const m = FX.getLightMode();
  b.innerHTML = UI.icon(m === 'night' ? 'moon' : m === 'day' ? 'sun' : 'sunmoon');
  b.title = { auto: 'Dag en nacht volgen je klok', day: 'Altijd dag', night: 'Altijd nacht' }[m];
}

function openPanelMobile(open) {
  if (window.innerWidth > 900) return;
  $('#panel').classList.toggle('open', open);
}

// ---------- tekenlus ----------
let lastT = performance.now();
function frame(t) {
  const dt = t - lastT; lastT = t;
  if (!$('#game').hidden && app.data) {
    const now = app.now();
    if (app.view === 'town') town.draw(t, dt, now);
    else world.draw(t, dt, now);
  } else if (authWorld && !$('#auth').hidden) {
    authWorld.cam.x += dt * 0.012;
    authWorld.cam.y += dt * 0.004;
    if (authWorld.cam.x > 900) authWorld.cam.x = -500;
    authWorld.draw(t, dt, Date.now());
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- acties ----------
async function act(path, body, okMsg) {
  try {
    const r = await post(path, body);
    if (r.state) {
      app.data.town.state = r.state;
      computeLive(true);
      renderAll();
    }
    if (okMsg) toast(okMsg, 'ok');
    return r;
  } catch (e) {
    toast(e.message, 'err');
    if (e.status === 401) location.reload();
    return null;
  }
}

async function harvestNode(nodeId, job) {
  $('#placeHint').hidden = !app.placing;
  if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return; }
  const node = (app.live.nodes || []).find((n) => n.id === nodeId);
  const r = await act('/harvest', { nodeId, job });
  if (r && node) toast(`Een dorpeling gaat de ${BONUS.kinds[node.kind].name.toLowerCase()} oogsten`, '', 'people');
  if (!r) town.pendingFrom = null;
}

async function placeBuilding(type, x, y, keep) {
  const r = await act('/build', { type, x, y }, `${BUILDINGS[type].name} wordt gebouwd`);
  if (!r || !keep) cancelPlace();
}

function cancelPlace() {
  app.placing = null;
  town.placing = null;
  $('#placeHint').hidden = true;
  renderBuildBar();
}

let allocTimer = null;
function changeVillagers(res, d) {
  const live = app.live;
  const alloc = { ...(app.pendingAlloc || live.villagers) };
  const total = RES.reduce((a, k) => a + live.villagers[k], live.villagers.idle);
  const slotsNow = slotsOf(live);
  let used = RES.reduce((a, k) => a + alloc[k], 0);
  let step = d;
  if (step > 0) step = Math.min(step, total - used, slotsNow[res] - alloc[res]);
  else step = Math.max(step, -alloc[res]);
  if (!step) return;
  alloc[res] += step;
  used += step;
  alloc.idle = total - used;
  app.pendingAlloc = alloc;
  allocSeq++;
  renderPanel(true);
  clearTimeout(allocTimer);
  allocTimer = setTimeout(sendAlloc, 600);
}

// Stuurt de laatste verdeling. Komen er tijdens het versturen nieuwe klikken bij,
// dan blijven die zichtbaar en worden ze daarna verstuurd.
let allocSeq = 0;
let allocBusy = false;
async function sendAlloc() {
  if (allocBusy) { allocTimer = setTimeout(sendAlloc, 300); return; }
  const a = app.pendingAlloc;
  if (!a) return;
  const seq = allocSeq;
  allocBusy = true;
  const r = await act('/villagers', { food: a.food, wood: a.wood, stone: a.stone, gold: a.gold });
  allocBusy = false;
  if (seq === allocSeq || !r) app.pendingAlloc = null;
  renderPanel(true);
}

function slotsOf(live) {
  const out = { food: 5, wood: 5, stone: 2, gold: 2 };
  for (const b of live.buildings) {
    const s = BUILDINGS[b.type].slots;
    if (s && b.level > 0) for (const k of Object.keys(s)) out[k] += s[k] * b.level;
  }
  return out;
}

function switchView(v) {
  app.view = v;
  for (const b of document.querySelectorAll('.navbtn[data-view]')) b.classList.toggle('active', b.dataset.view === v);
  $('#townCanvas').hidden = v !== 'town';
  $('#worldCanvas').hidden = v !== 'world';
  if (v === 'world') {
    cancelPlace();
    if (!app.map) loadMap().then(() => world.centerOnTile(app.data.town.x, app.data.town.y));
    else if (Date.now() - app.mapAt > 20000) loadMap();
  }
  renderAll();
}

const sendCtx = { target: null, kind: null };

function townTarget(id) {
  const t = app.map && app.map.towns.find((x) => x.id === id);
  return t && { kind: 'town', id: t.id, name: t.name, x: t.x, y: t.y };
}

function openSend(target, kind) {
  sendCtx.target = target;
  sendCtx.kind = kind;
  openModal('send');
}

function readSend() {
  const units = {};
  const res = {};
  for (const el of document.querySelectorAll('[data-send-unit]')) {
    const v = Math.max(0, Math.min(Number(el.max), Math.floor(Number(el.value) || 0)));
    if (v) units[el.dataset.sendUnit] = v;
  }
  for (const el of document.querySelectorAll('[data-send-res]')) {
    const v = Math.max(0, Math.min(Number(el.max), Math.floor(Number(el.value) || 0)));
    if (v) res[el.dataset.sendRes] = v;
  }
  return { units, res };
}

function updateSendSummary() {
  const el = $('#sendSummary');
  if (!el) return;
  const { units, res } = readSend();
  el.innerHTML = UI.sendSummaryHtml(app, app.live, sendCtx.target, sendCtx.kind, units, res);
}

// ---------- vensters ----------
let chatTimer = null;
async function openModal(type, arg) {
  app.modal = type;
  const body = $('#modalBody');
  $('#modal').hidden = false;
  clearInterval(chatTimer);
  if (type === 'help') body.innerHTML = UI.helpHtml(app.data.world);
  if (type === 'send') {
    body.innerHTML = UI.sendHtml(app, app.live, sendCtx.target, sendCtx.kind);
    updateSendSummary();
  }
  if (type === 'leaderboard') {
    body.innerHTML = `<h2>${UI.icon('trophy')} Ranglijst</h2><p class="empty">Laden…</p>`;
    try { body.innerHTML = UI.leaderboardHtml(app, await get('/leaderboard')); } catch (e) { body.innerHTML = `<p class="req">${UI.esc(e.message)}</p>`; }
  }
  if (type === 'reports') {
    body.innerHTML = `<h2>${UI.icon('scroll')} Rapporten</h2><p class="empty">Laden…</p>`;
    try {
      const { reports } = await get('/reports');
      app.reports = reports;
      const first = arg || null;
      body.innerHTML = UI.reportsHtml(reports, first, null);
      if (first) showReport(first);
    } catch (e) { body.innerHTML = `<p class="req">${UI.esc(e.message)}</p>`; }
  }
  if (type === 'team') {
    body.innerHTML = `<h2>${UI.icon('team')} Team</h2><p class="empty">Laden…</p>`;
    try {
      app.team = (await get('/team')).members;
      body.innerHTML = UI.teamHtml(app, app.team, app.chat.chan);
      loadChat();
      chatTimer = setInterval(loadChat, 8000);
    } catch (e) { body.innerHTML = `<p class="req">${UI.esc(e.message)}</p>`; }
  }
}

function closeModal() {
  $('#modal').hidden = true;
  app.modal = null;
  clearInterval(chatTimer);
}

async function showReport(id) {
  try {
    const { report } = await get(`/report?id=${id}`);
    const r = app.reports.find((x) => x.id === id);
    if (r && !r.seen) {
      r.seen = 1;
      app.data.unseenReports = Math.max(0, app.data.unseenReports - 1);
      app.seenReports = app.data.unseenReports;
      $('#badgeReports').hidden = !app.data.unseenReports;
      $('#badgeReports').textContent = app.data.unseenReports;
    }
    if (app.modal === 'reports') $('#modalBody').innerHTML = UI.reportsHtml(app.reports, id, report);
  } catch (e) { toast(e.message, 'err'); }
}

async function loadChat() {
  const chan = app.chat.chan;
  try {
    const { messages } = await get(`/chat?channel=${chan}`);
    const el = $('#chatMsgs');
    if (!el || app.chat.chan !== chan) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = UI.chatMsgsHtml(messages);
    if (atBottom || !el.dataset.loaded) el.scrollTop = el.scrollHeight;
    el.dataset.loaded = '1';
    if (messages.length) {
      app.chat.seen[chan] = messages[messages.length - 1].id;
      store.set('rvs-chat-seen', app.chat.seen);
    }
    const chatNew = ['team', 'world'].some((c) => (app.data.chat[c] || 0) > (app.chat.seen[c] || 0));
    $('#badgeChat').hidden = !chatNew;
  } catch { /* stil */ }
}

// ---------- gebeurtenissen ----------
const actions = {
  authTab(el) {
    for (const t of document.querySelectorAll('.tab[data-tab]')) t.classList.toggle('active', t === el);
    $('#loginForm').hidden = el.dataset.tab !== 'login';
    $('#registerForm').hidden = el.dataset.tab !== 'register';
    $('#authError').textContent = '';
  },
  view(el) { closeModal(); openPanelMobile(false); switchView(el.dataset.view); },
  reports() { openModal('reports'); },
  team() { openModal('team'); },
  leaderboard() { openModal('leaderboard'); },
  help() { openModal('help'); },
  closeModal,
  async logout() {
    if (!confirm('Wil je afmelden?')) return;
    await post('/logout').catch(() => {});
    location.reload();
  },
  lightMode() {
    const order = ['auto', 'day', 'night'];
    const next = order[(order.indexOf(FX.getLightMode()) + 1) % order.length];
    FX.setLightMode(next);
    town.lightSecond = -1; world.lightSecond = -1;
    renderLightBtn();
    toast({ auto: 'Licht volgt je klok (dag en nacht)', day: 'Altijd dag', night: 'Altijd nacht' }[next]);
  },
  zoom(el) {
    const cam = app.view === 'town' ? town.cam : world.cam;
    cam.zoomAt(cam.w / 2, cam.h / 2, el.dataset.dir === '1' ? 1.25 : 0.8);
  },
  home() {
    if (app.view === 'town') town.centerOn(app.live.buildings.find((b) => b.type === 'tc'));
    else world.centerOnTile(app.data.town.x, app.data.town.y);
  },
  togglePanel() { $('#panel').classList.toggle('open'); },
  place(el) {
    const type = el.dataset.type;
    if (app.placing === type) { cancelPlace(); return; }
    const err = el.classList.contains('locked') || el.classList.contains('poor') ? el.title.split(': ').slice(1).join(': ') : null;
    if (err) { toast(err, 'err'); return; }
    app.placing = type;
    town.placing = type;
    town.selected = null;
    app.selBuilding = null;
    const hint = $('#placeHint');
    hint.hidden = false;
    hint.innerHTML = `Kies een plek voor: <b>${BUILDINGS[type].name}</b> <span class="muted">(shift = meerdere)</span><button class="btn small" data-action="cancelPlace">Annuleren</button>`;
    openPanelMobile(false);
    renderBuildBar();
    renderPanel();
  },
  cancelPlace,
  cancelVillager() {
    town.selVillager = null;
    $('#placeHint').hidden = true;
  },
  harvest(el) { harvestNode(Number(el.dataset.id), null); },
  vill(el) { changeVillagers(el.dataset.res, Number(el.dataset.d)); },
  upgrade(el) {
    const b = app.live.buildings.find((x) => x.id === Number(el.dataset.id));
    act('/upgrade', { id: Number(el.dataset.id) }, b && b.type === 'tc' ? 'Je volk maakt zich klaar voor een nieuw tijdperk!' : 'Verbetering gestart');
  },
  setmax(el) { const i = document.getElementById(`tn-${el.dataset.unit}`); if (i) i.value = Math.max(1, Number(el.dataset.max)); },
  train(el) {
    const i = document.getElementById(`tn-${el.dataset.unit}`);
    const n = Math.floor(Number(i && i.value) || 0);
    if (n < 1) { toast('Kies een aantal.', 'err'); return; }
    act('/train', { unit: el.dataset.unit, count: n }, 'Training gestart');
  },
  trade() {
    act('/trade', { give: $('#tr-give').value, get: $('#tr-get').value, amount: Math.floor(Number($('#tr-amount').value) || 0) }, 'Ruil voltooid');
  },
  async recall(el) {
    const r = await act('/recall', { id: Number(el.dataset.id) }, 'Troepen keren terug');
    if (r) refresh();
  },
  deselect() {
    app.selBuilding = null; town.selected = null;
    if (world) world.selected = null;
    renderPanel();
  },
  selectWall() {
    const w = app.live.buildings.find((b) => b.type === 'wall');
    app.selBuilding = w.id;
    renderPanel();
  },
  send(el) {
    const sel = world.selected;
    if (!sel) return;
    const o = sel.obj;
    const target = sel.kind === 'camp'
      ? { kind: 'camp', id: o.id, name: `Roverskamp (niveau ${o.level})`, x: o.x, y: o.y }
      : { kind: 'town', id: o.id, name: o.name, x: o.x, y: o.y };
    openSend(target, el.dataset.kind);
  },
  async sendTo(el) {
    if (!app.map) await loadMap();
    const target = townTarget(Number(el.dataset.id));
    if (target) openSend(target, el.dataset.kind);
  },
  sendall(el) {
    const i = document.querySelector(`[data-send-unit="${el.dataset.unit}"]`);
    if (i) { i.value = el.dataset.n; updateSendSummary(); }
  },
  async dosend(el) {
    const { units, res } = readSend();
    const kind = el.dataset.kind;
    const t = sendCtx.target;
    el.disabled = true;
    try {
      await post('/march', { kind, targetKind: t.kind, targetId: t.id, units, res });
      toast(kind === 'trade' ? 'De karavaan vertrekt!' : 'Je troepen zijn vertrokken!', 'ok');
      closeModal();
      await refresh();
      if (app.view === 'world') { world.setMarches(app.data.marches); renderPanel(); }
    } catch (e) {
      toast(e.message, 'err');
      el.disabled = false;
    }
  },
  openReport(el) { showReport(Number(el.dataset.id)); },
  async readAll() {
    await post('/reports/read-all').catch(() => {});
    app.data.unseenReports = 0; app.seenReports = 0;
    $('#badgeReports').hidden = true;
    openModal('reports');
  },
  chatTab(el) {
    app.chat.chan = el.dataset.chan;
    for (const t of document.querySelectorAll('.chat .tab')) t.classList.toggle('active', t === el);
    const m = $('#chatMsgs');
    if (m) { m.innerHTML = '<p class="empty">Laden…</p>'; delete m.dataset.loaded; }
    loadChat();
  },
  async mapTo(el) {
    closeModal();
    switchView('world');
    if (!app.map) await loadMap();
    world.centerOnTile(Number(el.dataset.x), Number(el.dataset.y));
    const t = app.map.towns.find((x) => x.id === Number(el.dataset.id));
    if (t) { world.selected = { kind: 'town', obj: t }; renderPanel(); }
  },
  async alertGo(el) {
    switchView('world');
    if (!app.map) await loadMap();
    world.centerOnTile(Number(el.dataset.x), Number(el.dataset.y));
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    e.preventDefault();
    actions[el.dataset.action](el);
    return;
  }
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.change === 'rally') {
    const v = app.live.villagers;
    act('/villagers', { food: v.food, wood: v.wood, stone: v.stone, gold: v.gold, rally: el.value }, 'Instelling bewaard');
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches('[data-send-unit], [data-send-res]')) updateSendSummary();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) closeModal();
    else if (app.placing) cancelPlace();
    else if (app.selBuilding) actions.deselect();
  }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#authError').textContent = '';
  try {
    await post('/login', { name: f.get('name'), password: f.get('password') });
    startGame(await get('/state'));
  } catch (err) { $('#authError').textContent = err.message; }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#authError').textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await post('/register', { name: f.get('name'), password: f.get('password'), townName: f.get('townName'), joinCode: f.get('joinCode') });
    startGame(await get('/state'));
  } catch (err) { $('#authError').textContent = err.message; } finally { btn.disabled = false; }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'chatForm') return;
  e.preventDefault();
  const input = e.target.elements.text;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try { await post('/chat', { channel: app.chat.chan, text }); loadChat(); } catch (err) { toast(err.message, 'err'); }
});

for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', UI.icon(el.dataset.icon));
boot();
