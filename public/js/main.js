// Hoofdprogramma: aanmelden, spelstatus, tekenlus en alle knoppen.
import { get, post, early } from './api.js';
import * as S3 from './sprite3d.js';
import { TownView } from './town.js';
import { WorldView } from './world.js';
import * as UI from './ui.js';
import * as FX from './fx.js';
import { setHTML, resetHTML } from './dom.js';
import { BattleView, askHtml, raidReplay } from './battleview.js';
import { advance, groupPos, isVillagerGroup, tcDoor, doFieldSend, doFieldOrder, doFieldSplit, doMove, doMoveWalls, wallRun, gateList, raidNow, slots as townSlots, toPlace, tradeWait } from '../shared/sim.js';
import { RES, RES_NAMES, BUILDINGS, BONUS, UNITS, fmtDuration, JOBS } from '../shared/rules.js';

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
  bbMin: !!store.get('rvs-buildbar-min'),
  bbTab: ['build', 'army', 'advice'].includes(store.get('rvs-buildbar-tab')) ? store.get('rvs-buildbar-tab') : 'build',
  adviceIdx: {}, // per soort + niveau: welk gebouw de vorige tik toonde (volgende tik = het volgende)
  now() { return Date.now() + this.offset; },
};
window.__app = app; // handig bij het debuggen in de console

// ---------- meldingen op je gsm (web push) ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const onIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standaloneApp = () => !!navigator.standalone || matchMedia('(display-mode: standalone)').matches;
try { if (document.referrer.startsWith('android-app://')) sessionStorage.setItem('twa', '1'); } catch { /* geen opslag */ }
app.inApp = () => { try { return sessionStorage.getItem('twa') === '1'; } catch { return false; } };
app.onAndroid = /Android/i.test(navigator.userAgent);
Object.defineProperty(app, 'pushState', {
  get() {
    if (onIOS && !standaloneApp() && !pushSupported()) return 'ios-home';
    if (!pushSupported()) return onIOS ? 'ios-home' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return app.pushOn ? 'on' : 'off';
  },
});
const unb64 = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

// bij het opstarten: bestaande inschrijving opnieuw doorgeven (nieuwe speler, vernieuwde sleutel, ...)
async function initPush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      const r = await post('/push/subscribe', sub.toJSON());
      app.pushOn = true;
      app.pushEndpoint = sub.endpoint;
      app.pushPrefs = r.prefs || null;
      renderPanel(true);
    }
  } catch (e) { console.warn('meldingen', e); }
}

// het kaartje 'Meldingen op je gsm' overal opnieuw tekenen (in het zijpaneel en in een open venster)
function refreshPushCards() {
  for (const el of document.querySelectorAll('.push-card')) {
    const html = UI.pushCardHtml(app);
    if (!html) { el.remove(); continue; }
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    el.replaceWith(tmp.firstElementChild);
  }
}

// een stap die te lang duurt, stopt met een duidelijke reden (anders gebeurt er voor de speler 'niets')
const within = (p, ms, why) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(why)), ms))]);

async function enablePush() {
  if (app.pushBusy) return;
  const fail = (msg) => { app.pushErr = msg; toast(msg, 'err', 'bell'); refreshPushCards(); };
  if (onIOS && !standaloneApp()) { fail('Zet het spel eerst op je beginscherm (Safari › Delen › Zet op beginscherm) en open het van daar.'); return; }
  if (!pushSupported()) { fail('Deze browser kan geen meldingen tonen.'); return; }
  app.pushBusy = true; app.pushErr = null; app.pushNote = null;
  // eerst de toestemming vragen (moet meteen na de tik gebeuren, dus vóór elke andere wachttijd)
  const ask = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
  refreshPushCards();
  try {
    const perm = await within(ask, 25000, app.inApp() || app.onAndroid
      ? 'Je gsm vroeg geen toestemming. Gebruik je de app? Installeer dan de nieuwste versie (1.1, link op het aanmeldscherm) over de oude heen en probeer opnieuw.'
      : 'Er kwam geen antwoord op de vraag om meldingen toe te staan. Probeer opnieuw.');
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Meldingen zijn geblokkeerd voor dit spel.' : 'Je gaf geen toestemming voor meldingen.');
    const reg = await within(navigator.serviceWorker.register('/sw.js'), 15000, 'De achtergronddienst van het spel startte niet. Herlaad het spel en probeer opnieuw.');
    await within(navigator.serviceWorker.ready, 15000, 'De achtergronddienst van het spel startte niet. Herlaad het spel en probeer opnieuw.');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await get('/push/key');
      sub = await within(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64(key) }), 20000,
        'De meldingendienst van je gsm antwoordde niet. Controleer je internet en probeer opnieuw.');
    }
    const sr = await post('/push/subscribe', sub.toJSON());
    app.pushOn = true;
    app.pushEndpoint = sub.endpoint;
    app.pushPrefs = sr.prefs || null;
    const r = await post('/push/test', {});
    app.pushNote = r.sent ? 'Gelukt! Je kreeg net een proefmelding.' : 'Aangezet, maar de proefmelding kon niet verstuurd worden. Probeer "Proefmelding".';
    toast(r.sent ? 'Meldingen staan aan. Je kreeg net een proefmelding.' : 'Meldingen staan aan.', 'ok', 'bell');
  } catch (e) {
    // foutmeldingen van de browser zijn in het Engels: vertaal de bekende
    const m = String((e && e.message) || '');
    app.pushErr = /permission|NotAllowed/i.test(m) || (e && e.name === 'NotAllowedError')
      ? (app.inApp() || app.onAndroid ? 'Je gsm weigert meldingen voor dit spel. Zet ze aan via Instellingen › Apps › Rijken van de Vallei › Meldingen (of in Chrome bij de site-instellingen).' : 'Je browser weigert meldingen voor dit spel. Zet ze aan bij de site-instellingen (slotje naast het adres).')
      : /push service|AbortError|network/i.test(m) || (e && e.name === 'AbortError')
        ? 'De meldingendienst van je gsm is niet bereikbaar. Controleer je internet en probeer opnieuw.'
        : /[a-z] (failed|error)|^[A-Z][a-z]+Error/.test(m) ? `Het lukte niet (${m}).` : (m || 'Het lukte niet.');
    toast(`Meldingen aanzetten lukte niet: ${app.pushErr}`, 'err', 'bell');
  } finally {
    app.pushBusy = false;
    renderPanel(true);
    refreshPushCards();
  }
}

// één soort melding aan of uit op dit toestel (aanval op je stad of een clanlid, bouwer vrij, je leger komt aan)
async function setPushPref(k) {
  if (!app.pushPrefs || !app.pushEndpoint || !(k in app.pushPrefs)) return;
  const before = { ...app.pushPrefs };
  app.pushPrefs = { ...before, [k]: !before[k] }; // meteen tonen; de server bevestigt
  refreshPushCards();
  try {
    const r = await post('/push/prefs', { endpoint: app.pushEndpoint, [k]: app.pushPrefs[k] });
    if (r.prefs) app.pushPrefs = r.prefs;
  } catch (e) {
    app.pushPrefs = before;
    toast(e.message, 'err', 'bell');
  }
  refreshPushCards();
}

async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch (e) { console.warn('meldingen', e); }
  app.pushOn = false; app.pushNote = null; app.pushErr = null;
  toast('Meldingen staan uit op dit toestel.', '', 'bell');
  renderPanel(true);
  refreshPushCards();
}

let town = null;
let world = null;
let authWorld = null;
let battle = null;

// ---------- meldingen ----------
function toast(msg, type = '', ic = null, action = null) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  if (action) { const [a, arg] = action.split(':'); el.dataset.action = a; if (arg) { el.dataset.chan = arg; el.dataset.id = arg; } el.classList.add('tap'); }
  const name = ic || (type === 'err' ? 'bell' : type === 'ok' ? 'star' : 'scroll');
  el.innerHTML = `${UI.icon(name)}<span>${UI.esc(msg)}</span>`;
  const box = $('#toasts');
  while (box.children.length >= 4) box.firstElementChild.remove();
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 4500 : 3200);
}

// ---------- opstarten ----------
async function boot() {
  // /state loopt al (index.html); de 3D-beelden van vorige keer worden ondertussen uit de cache gehaald
  const stateP = early('state', '/state');
  stateP.catch(() => {});
  try {
    app.info = await early('info', '/info');
  } catch (e) {
    showAuth(`Kan de server niet bereiken: ${e.message}`);
    return;
  }
  if (!app.info.world) {
    showAuth('Er is nog geen wereld aangemaakt. De spelleider moet eerst <a href="/admin.html">/admin.html</a> openen.');
    return;
  }
  try {
    // kort wachten op de 3D-beelden: zo start de stad meteen in 3D (anders eerst alles in 2D, dat kost extra werk)
    const [data] = await Promise.all([stateP, Promise.race([S3.preloaded, new Promise((r) => setTimeout(r, 2500))])]);
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
    const peace = `${UI.icon('dove')} Nieuwe spelers krijgen ${UI.peaceText(w.peaceMs)} vrede.`;
    const phase = { lobby: `Het seizoen start op <b>${f(w.startAt)}</b>. ${peace}`, war: `${UI.icon('swords')} Oorlog tot <b>${f(w.warEnd)}</b>! ${peace}`, ended: `${UI.icon('flag')} Het seizoen is afgelopen.` }[w.phase];
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
    town.onSelect = (b) => { app.pickStack = town.pickStack; app.selBuilding = b ? b.id : null; app.selWall = b && b.type === 'wall' ? town.selWall : null; renderPanel(); openPanelMobile(!!b); };
    town.onGate = async (i, j) => { const r = await act('/gate', { i, j }, 'Poort gebouwd'); if (r) setMode(null); };
    town.onPlace = placeBuilding;
    town.onCancelPlace = cancelPlace;
    town.onMove = moveBuilding;
    town.onMoveWalls = moveWalls;
    town.onNotice = (msg, ic) => toast(msg, '', ic || 'move');
    town.onMoveChange = renderMoveHint;
    town.onMoveEnd = () => { if (!app.placing && !app.mode) $('#placeHint').hidden = true; renderPlacePill(); };
    town.onHarvest = (node, walker) => harvestNode(node.id, walker ? walker.job : null);
    town.onSelChange = (sel) => {
      const g = sel && (sel.type === 'group' || sel.type === 'unit') ? sel.id : null;
      const changed = g !== app.selGroup;
      app.selGroup = g;
      renderSelHint();
      if (changed && app.view === 'town') renderPanel();
    };
    town.onFieldOrder = fieldOrder;
    town.onFieldOrders = fieldOrders;
    town.onBuyLot = async (li, lj) => { await act('/land', { li, lj }, 'Grond gekocht! Je kan er nu bouwen.'); };
    town.onWalls = async (tiles, remove) => {
      const r = await act('/walls', { tiles, remove }, remove ? 'Muur afgebroken' : `${tiles.length} muurstukken geplaatst`);
      if (r && !remove && UI.isEnclosed(app.live)) toast('Je stad is volledig ommuurd!', 'ok', 'castle');
    };
    town.onHarvested = (node) => toast(`Je dorpeling bracht ${node.amount} ${RES_NAMES[node.res].toLowerCase()} mee!`, 'ok', 'star');
    town.onCelebrate = (b) => {
      celebrateQueue.push(b);
      clearTimeout(celebrateTimer);
      celebrateTimer = setTimeout(flushCelebrate, 250);
    };
    town.calm = !!store.get('rvs-calm');
    renderLightBtn();
    renderCalmBtn();
    world.onSelect = () => { renderPanel(); openPanelMobile(!!world.selected); };
    app.views = { town, world };
  }
  app.seenReports = data.unseenReports;
  applyState(data, true);
  const tc = data.town.state.buildings.find((b) => b.type === 'tc');
  town.centerOn(tc);
  setInterval(tick, 1000);
  setInterval(poll, 20000);
  // de wereldkaart alvast op de achtergrond voorbereiden (anders hapert het even als je ze voor het eerst opent)
  setTimeout(() => { if (!app.map) loadMap(true); }, 6000);
  initPush();
  // geopend vanuit een melding: het adres opruimen (de aftelbalk toont de rest)
  if (location.search) history.replaceState(null, '', location.pathname);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  maybeShowIntro();
  setTimeout(checkNews, 4000);
}

// ---------- nieuws (updates.js wordt pas na het opstarten geladen) ----------
const newsSeen = () => Number(store.get('rvs-news-seen')) || 0;
// wanneer deze speler begon (artikels van daarvoor zijn voor hem geen nieuws)
const joinedAt = () => (app.data ? app.data.me.peaceEnd - app.data.world.peaceMs : 0);
function markNewsSeen(id) {
  if (id > newsSeen()) store.set('rvs-news-seen', id);
  const b = $('#badgeNews'); if (b) b.hidden = true;
}
async function checkNews() {
  try {
    const N = await import('./updates.js');
    const fresh = N.unreadUpdates(newsSeen(), joinedAt());
    const b = $('#badgeNews');
    if (b) { b.hidden = !fresh.length; b.textContent = fresh.length; b.classList.toggle('pulse', fresh.length > 0); }
    // één keer per artikel een melding (tik = lezen)
    const top = fresh[0];
    if (top && top.id > (Number(store.get('rvs-news-told')) || 0)) {
      store.set('rvs-news-told', top.id);
      toast(`Nieuw in het spel: ${top.title}`, 'chatmsg', 'news', 'news');
    }
  } catch { /* geen nieuws: niet erg */ }
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
  const prevTeam = app.data && app.data.me.teamId;
  app.data = data;
  // van clan gewisseld (ook als de andere kant je verzoek aanvaardde of je clan je buitenzette): bondgenoten en kaart opnieuw
  if (prevTeam != null && prevTeam !== data.me.teamId) {
    app.team = null;
    if (!app.chat.resetTeam) { app.chat.resetTeam = true; app.chat.last.team = null; toast(`Je zit nu in ${data.team.name}.`, 'ok', 'flag'); }
    setTimeout(() => loadMap(true), 0);
  }
  app.serverState = data.town.state;
  UI.setCiv(data.town.state.civ);
  if (fieldQueue.length) setBaseState(data.town.state);
  const off = data.now - Date.now();
  if (first || Math.abs(off - app.offset) > 1500) app.offset = off;
  app.canAct = data.world.phase === 'war';
  app.inPeace = app.now() < data.me.peaceEnd;
  town.setTown(data.town.id, data.team.color);
  computeLive(true);
  world.setMarches(data.marches);
  if (prevPhase && prevPhase !== data.world.phase) {
    if (data.world.phase === 'ended') { toast('Het seizoen is voorbij!', '', 'flag'); openModal('leaderboard'); }
  }
  // nieuwe rapporten
  if (data.unseenReports > app.seenReports) toast(`${data.unseenReports - app.seenReports} nieuw(e) rapport(en)`, '', 'scroll');
  app.seenReports = data.unseenReports;
  const br = $('#badgeReports');
  br.hidden = !data.unseenReports; br.textContent = data.unseenReports;
  // chat: ongelezen berichten (team en iedereen) duidelijk tonen, met een melding bij een nieuw bericht
  chatState(data.chat, first);
  handleBattles(data, first);
  // inkomende aanvallen
  for (const m of data.marches) {
    if (!m.ally && m.status === 'out' && (m.kind === 'attack' || m.kind === 'scout') && !app.knownHostile.has(m.id)) {
      app.knownHostile.add(m.id);
      if (!first) toast(`${m.betray ? `Verraad! Je bondgenoot ${m.player}` : m.player} stuurt een ${m.kind === 'scout' ? 'verkenning' : 'aanval'} naar ${m.to.name}!`, 'err', 'swords');
    }
  }
  renderAll();
}

// ---------- veldslagen ----------
const knownBattles = new Map();
// zit je in een echte slag? (een replay bekijken telt niet: een aanval die binnenkomt, verschijnt er gewoon boven)
const inLiveBattle = () => !!(battle && battle.open && !battle.rp);
const askedBattles = new Set();

function battleView() {
  if (!battle) {
    battle = new BattleView({
      now: () => app.now(), get, post, toast, unitThumb: UI.unitThumb, practice: (role) => startPractice(role),
      openReports: () => openModal('reports'), openReplay: (id) => openReplay(id),
      onClose: () => { renderAlert(); setTimeout(refresh, 400); },
    });
    window.__battle = battle; // handig bij het debuggen in de console
  }
  return battle;
}

// oefenslag starten (30 tegen 30 tegen de computer)
async function startPractice(role) {
  try {
    const r = await post('/battle/practice', { role });
    knownBattles.set(r.battle.id, 'live');
    openBattle(r.battle.id, r.battle);
  } catch (e) { toast(e.message, 'err', 'swords'); }
}

// replay van een automatisch verlopen slag (24 uur): het recept van de server, de browser speelt de slag na
async function openReplay(id) {
  try {
    const { replay } = await get(`/replay?id=${id}`);
    closeModal(); hideAsk();
    battleView().showReplay(replay);
  } catch (e) { toast(e.message, 'err', 'swords'); }
}

// replay van een overval van de barbaren (het recept staat in het logboek van je stad)
function openRaidReplay(lid) {
  const s = app.live;
  const e = s && s.terr && (s.terr.log || []).find((x) => x.id === lid);
  if (!e || !e.rp) { toast('Deze replay is niet meer beschikbaar.', 'err', 'swords'); return; }
  closeModal(); hideAsk();
  battleView().showReplay(raidReplay(s, e, { town: app.data.town.name, name: app.data.me.name, color: app.data.team.color }));
}

function openBattle(id, b = null) {
  hideAsk();
  battleView().show(id, b);
}

function handleBattles(data, first) {
  for (const b of data.battles || []) {
    const prev = knownBattles.get(b.id);
    knownBattles.set(b.id, b.status);
    const mine = b.role === 'att' ? b.attMode : b.defMode;
    if (b.kind === 'practice' || b.kind === 'raid') continue; // oefenslag en overval: geen meldingen, die open je zelf
    if (!prev && b.status !== 'done' && b.role === 'def') toast(`${b.title} wordt aangevallen${b.attName ? ` door ${b.attName}` : ''}!`, 'err', 'swords');
    if (b.status === 'choose' && !mine && !askedBattles.has(b.id) && !inLiveBattle()) { askedBattles.add(b.id); showAsk(b); }
    // de tegenpartij koos om zelf te besturen: bekijk of neem alsnog het bevel over
    if (b.status === 'live' && prev && prev !== 'live' && mine !== 'manual' && !inLiveBattle()) {
      toast(`De slag bij ${b.title} is begonnen. Klik bovenaan om mee te kijken.`, '', 'swords');
    }
    if (b.status === 'live' && mine === 'manual' && !inLiveBattle() && prev !== 'live') openBattle(b.id);
  }
  const ask = $('#battleAsk');
  if (ask && !ask.hidden && ask.dataset.id !== 'raid') {
    const b = (data.battles || []).find((x) => x.id === Number(ask.dataset.id));
    if (!b || b.status !== 'choose') hideAsk();
  }
}

function showAsk(b) {
  let el = $('#battleAsk');
  if (!el) {
    el = document.createElement('div');
    el.id = 'battleAsk'; el.className = 'bt-ask';
    document.body.appendChild(el);
  }
  el.dataset.id = b.id;
  el.dataset.until = b.chooseUntil;
  el.innerHTML = askHtml(b, app.now());
  el.hidden = false;
}

function hideAsk() {
  const el = $('#battleAsk');
  if (el) el.hidden = true;
}

async function chooseBattle(id, mode) {
  hideAsk();
  try {
    const r = await post('/battle/mode', { id, mode });
    if (mode === 'manual') openBattle(id, r.battle);
    else if (r.battle.status === 'done') { toast(r.battle.result && r.battle.result.attWins === (r.battle.role === 'att') ? 'Gewonnen! Bekijk het rapport.' : 'De slag is uitgevochten. Bekijk het rapport.', '', 'scroll'); refresh(); }
    else toast('Je troepen vechten de slag zelf uit.', '', 'hourglass');
    poll();
  } catch (e) { toast(e.message, 'err'); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('#battleAsk [data-bact="choose"]');
  if (el) chooseBattle(Number(el.dataset.id), el.dataset.mode);
  const rd = e.target.closest('#battleAsk [data-bact="raid"]');
  if (rd && !rd.disabled) {
    if (rd.dataset.mode === 'manual') defendRaid();
    else { hideAsk(); toast('Je soldaten, muur en torens vechten de overval automatisch uit.', '', 'hourglass'); }
  }
});

function activeBattle() {
  return (app.data.battles || []).find((b) => b.status === 'live' || (b.status === 'choose' && (b.role === 'att' ? b.attMode : b.defMode)));
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
    s.buildings.map((b) => `${b.level}@${b.x},${b.y}`).join(''),
    JSON.stringify(s.units), JSON.stringify(s.villagers), s.rally,
    s.research ? s.research.id : '', Object.keys(s.tech || {}).join(','), Math.floor(s.loy ?? 100), s.vas ? s.vas.until : '',
    (s.nodes || []).map((n) => `${n.id}${n.claimed ? 'c' : ''}`).join(','),
    (s.harvests || []).map((h) => h.id).join(','),
    (s.field || []).map((g) => `${g.id}${g.pending ? 'p' : ''}${g.work ? g.work.type : ''}${g.order ? g.order.type : ''}`).join(','),
    s.terr ? `${s.terr.cl.length}:${s.terr.lid}:${s.terr.camp.down}:${Object.values(s.terr.boar).join('.')}` : '',
  ].join('|');
  if (s.terr) announceLog(s.terr);
  const changed = sig !== app.sig;
  app.sig = sig;
  if (changed || force) {
    town.setState(s);
    return true;
  }
  town.state = s;
  return false;
}

// nieuwe gebeurtenissen in je gebied (everzwijn gevangen, overval, ...) als melding tonen
const LOG_ICON = { boar: 'target', 'boar-lost': 'target', camp: 'swords', 'camp-lost': 'swords', 'raid-warn': 'swords', 'raid-lost': 'bell', 'raid-won': 'shield', dep: 'star' };
function announceLog(terr) {
  if (app.lastLid == null || terr.lid < app.lastLid) { app.lastLid = terr.lid; return; }
  if (terr.lid === app.lastLid) return;
  // 'raid-warn': daarvoor verschijnt het keuzevenster (offerRaid)
  for (const e of terr.log) if (e.id > app.lastLid && e.kind !== 'raid-warn') toast(e.text, /lost/.test(e.kind) ? 'err' : 'ok', LOG_ICON[e.kind] || 'star');
  app.lastLid = terr.lid;
}

async function poll() {
  if (document.hidden || !app.data || fieldQueue.length) return;
  try {
    const data = await get(statePath());
    applyState(data);
    if (app.view === 'world' && Date.now() - app.mapAt > 40000) loadMap();
  } catch (e) {
    if (e.status === 401) location.reload();
  }
}

async function refresh() {
  try { applyState(await get(statePath())); } catch (e) { toast(e.message, 'err'); }
}

// quiet: op de achtergrond (na het opstarten), zodat de wereldkaart klaar is als je ze opent
async function loadMap(quiet = false) {
  try {
    const map = await get('/map');
    app.map = map;
    app.mapAt = Date.now();
    world.setWorld(app.data.world.seed, app.data.world.size);
    world.setData(map, app.data.town.id, app.data.me.teamId, quiet && app.view !== 'world');
    if (app.view === 'world') renderPanel();
  } catch (e) { if (!quiet) toast(e.message, 'err'); }
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
  renderArrival();
  updateTimers();
  renderAlert();
  const w = app.data.world;
  const now = app.now();
  if (app.inPeace && now >= app.data.me.peaceEnd) {
    app.inPeace = false;
    toast('Je vrede is voorbij! Je kan nu vijandelijke steden aanvallen, en zij jou.', 'err', 'swords');
    renderAll();
  }
  if ((w.phase === 'war' && now >= w.warEnd) || (w.phase === 'lobby' && now >= w.startAt)) {
    w.phase = 'x';
    refresh();
  }
  // de barbaren trekken naar je dorp: één keer vanzelf het keuzevenster (daarna via de balk bovenaan)
  const rd = raidIncoming();
  if (rd && app.raidAsked !== rd.start) offerRaid(rd);
  const ask = $('#battleAsk');
  if (ask && !ask.hidden && ask.dataset.id === 'raid' && !rd) hideAsk();
  if (ask && !ask.hidden) {
    const until = Number(ask.dataset.until);
    const sec = Math.max(0, Math.ceil((until - now) / 1000));
    for (const el of ask.querySelectorAll('[data-askend]')) el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    if (now > until + 1500) { hideAsk(); refresh(); }
  }
  if (tickN % 5 === 0 && (app.data.battles || []).some((b) => b.status !== 'done') && !inLiveBattle()) poll();
  // legers die net aankwamen: even later opnieuw ophalen
  if (app.data.marches.some((m) => m.arriveAt <= now && m.arriveAt > now - 1000)) setTimeout(refresh, 1500);
}

// aftelbalk: je eigen aanval komt binnen 2 minuten aan
function renderArrival() {
  const now = app.now();
  const ms = app.data.marches.filter((m) => m.own && m.kind === 'attack' && m.status === 'out' && m.arriveAt > now && m.arriveAt - now <= 120000)
    .sort((a, b) => a.arriveAt - b.arriveAt);
  let el = $('#arrivalBar');
  if (!ms.length || (battle && battle.open)) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'arrivalBar'; el.className = 'arrival';
    $('#stage').appendChild(el);
  }
  el.hidden = false;
  setHTML(el, UI.arrivalHtml(app, ms[0], ms.length - 1));
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
  renderPlacePill();
  updateTimers();
}

// ---------- gebouwen die groter werden en opnieuw geplaatst moeten worden (gratis) ----------
// knop bovenaan de stad zolang er nog zijn; de eerste keer (per stad en toestel) ook een venster met uitleg
function renderPlacePill() {
  const pill = $('#rpPill');
  if (!pill || !app.live) return;
  const list = toPlace(app.live);
  const show = list.length > 0 && app.view === 'town' && !(town && town.moveB);
  pill.hidden = !show;
  if (show) setHTML(pill, `${UI.icon('move')}<span>${list.length === 1 ? `${BUILDINGS[list[0].type].name} opnieuw plaatsen` : `${list.length} gebouwen opnieuw plaatsen`}<span class="where"> (gratis)</span></span>`);
  const key = `rvs-grew-${app.data.town.id}`;
  if (list.length && app.live.szm && !app.grewAsked && !app.modal && (!store.get(key) || app.grewAgain)) {
    app.grewAsked = true;
    app.grewAgain = store.get(key) ? 0 : 1; // de eerste keer kan het welkomstvenster ervoor komen: dan nog één keer
    store.set(key, 1);
    openModal('grew');
  }
}

// het volgende gebouw (of het gekozen) opnieuw plaatsen: in de stad, doorschijnend op de dichtstbijzijnde vrije plek
function placeNext(id = null) {
  const list = toPlace(app.live);
  const b = (id && list.find((x) => x.id === id)) || list[0];
  if (!b || !town) return;
  if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return; }
  closeModal();
  if (app.view !== 'town') switchView('town');
  cancelPlace();
  if (app.mode) setMode(null);
  openPanelMobile(false);
  town.startMove(b);
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
  const p = UI.phaseHtml(app.data.world, app.now(), app.data.me.peaceEnd);
  const el = $('#phase');
  el.className = `phase ${p.cls}`;
  setHTML(el, p.html);
}

function renderAlert() {
  const el = $('#alert');
  const lb = activeBattle();
  if (lb) {
    el.hidden = false;
    el.dataset.action = 'battleGo';
    el.dataset.id = lb.id;
    setHTML(el, `${UI.icon('swords')} Veldslag bij ${UI.esc(lb.title)}${lb.status === 'live' ? ' is bezig' : ''} — bekijken`);
    return;
  }
  const hostile = app.data.marches.filter((m) => !m.ally && m.status === 'out' && m.arriveAt > app.now()).sort((a, b) => a.arriveAt - b.arriveAt);
  // overval van de barbaren: eerst kiezen (zelf verdedigen of automatisch), dat kan maar 15 minuten
  const raid = raidIncoming();
  if (raid) {
    el.hidden = false;
    el.dataset.action = 'raidAsk';
    setHTML(el, `${UI.icon('swords')} ${raid.n} barbaren vallen aan! Kies binnen <span data-end="${raid.at}">${fmtDuration(raid.at - app.now())}</span>`);
    return;
  }
  if (!hostile.length) { el.hidden = true; return; }
  const m = hostile[0];
  el.hidden = false;
  el.dataset.action = 'alertGo';
  el.dataset.x = m.to.x; el.dataset.y = m.to.y;
  setHTML(el, `${UI.icon('bell')} ${m.betray ? `Verraad door ${UI.esc(m.player)}! ` : ''}${m.kind === 'scout' ? 'Verkenners' : 'Aanval'} op ${UI.esc(m.to.name)} over <span data-end="${m.arriveAt}">${fmtDuration(m.arriveAt - app.now())}</span>${hostile.length > 1 ? ` (+${hostile.length - 1})` : ''}`);
}

// trekken de barbaren naar je dorp (en heb je nog niet gekozen om zelf te verdedigen)? { start, at, n } of null
function raidIncoming() {
  const r = raidNow(app.live);
  return r && !r.battle && app.now() < r.at ? r : null;
}

// keuzevenster bij een overval: zelf verdedigen (een slag in je eigen stad) of automatisch
function offerRaid(raid) {
  if (inLiveBattle()) return;
  let el = $('#battleAsk');
  if (el && !el.hidden && el.dataset.id !== 'raid') return; // eerst de andere keuze
  if (!el) {
    el = document.createElement('div');
    el.id = 'battleAsk'; el.className = 'bt-ask';
    document.body.appendChild(el);
  }
  app.raidAsked = raid.start;
  el.dataset.id = 'raid';
  el.dataset.until = raid.at;
  el.innerHTML = UI.raidAskHtml(app.live, raid, app.now());
  el.hidden = false;
}

async function defendRaid() {
  try {
    const r = await post('/raid/defend', {});
    knownBattles.set(r.battle.id, 'live');
    openBattle(r.battle.id, r.battle);
    refresh();
  } catch (e) { toast(e.message, 'err', 'swords'); }
}

// uitleg bovenaan als je een dorpeling, soldaat of groep gekozen hebt
// Gekozen troepen: geen uitleg meer, enkel 'Naar huis' (als ze buiten zijn) en 'Klaar', klein rechts onderaan.
function renderSelHint() {
  const box = $('#selActions');
  const sel = town.sel;
  const g = sel && (sel.type === 'group' || sel.type === 'unit') ? town.selGroup() : null;
  const wrap = $('#buildwrap');
  if (!sel || app.placing || ((sel.type === 'group' || sel.type === 'unit') && !g)) { box.hidden = true; wrap.classList.remove('has-sel'); return; }
  wrap.classList.add('has-sel'); // op een smalle gsm: tabbladen enkel als icoon (de knoppen moeten ernaast passen)
  const out = (sel.type === 'group' && !(g.order && g.order.type === 'home' && g.pending)) || sel.type === 'unit'
    || ((sel.type === 'kind' || sel.type === 'army' || sel.type === 'groups') && sel.ids.length);
  box.hidden = false;
  setHTML(box, `${out ? `<button class="btn small" data-action="selHome">${UI.icon('home')} Naar huis</button>` : ''}<button class="btn small" data-action="cancelVillager">Klaar</button>`);
}

// muren plaatsen of grond kopen (aparte modus op de kaart)
function setMode(mode) {
  cancelPlace();
  town.clearSel();
  app.mode = mode;
  town.landMode = mode === 'land';
  town.gateMode = mode === 'gate';
  town.wallMode = mode === 'wall' ? 'build' : mode === 'wallremove' ? 'remove' : null;
  town.wallStart = null;
  const hint = $('#placeHint');
  if (!mode) { hint.hidden = true; renderBuildBar(); return; }
  hint.hidden = false;
  if (mode === 'land') {
    setHTML(hint, `<span><b>Grond kopen</b> <span class="muted">Tik op een gouden lot naast je bouwgrond.</span></span><button class="btn small" data-action="modeDone">Klaar</button>`);
  } else if (mode === 'gate') {
    setHTML(hint, `<span><b>Poort maken</b> <span class="muted">Tik op een muurstuk of een gat van één tegel in een recht stuk muur.</span></span><button class="btn small" data-action="modeDone">Klaar</button>`);
  } else {
    const rm = mode === 'wallremove';
    setHTML(hint, `<span><b>${rm ? 'Muur afbreken' : 'Muur bouwen'}</b> <span class="muted">Tik op een begintegel en daarna op een eindtegel.</span></span>
      <button class="btn small" data-action="${rm ? 'wallMode' : 'wallRemove'}">${rm ? 'Bouwen' : 'Afbreken'}</button><button class="btn small" data-action="modeDone">Klaar</button>`);
  }
  openPanelMobile(false);
  renderBuildBar();
}

// opdracht voor een groep in het veld (de server controleert alles opnieuw)
// Opdrachten voor groepen in het veld voeren we meteen zelf uit (zelfde spelregels als de server), zodat
// een mannetje direct begint te lopen. De server krijgt het tijdstip mee en rekent exact hetzelfde pad na.
// Opdrachten gaan één voor één naar de server; wat nog niet bevestigd is, leggen we telkens opnieuw
// bovenop de laatste toestand van de server.
const fieldQueue = [];
let fieldBusy = false;

function applyFieldOp(s, op) {
  advance(s, Math.min(op.at, app.data.world.warEnd), app.data.world.speed);
  if (op.action === 'send') return doFieldSend(s, op.spec || {}, op.from, op.to, op.target, op.at, op.pace);
  if (op.action === 'split') return doFieldSplit(s, op.id, op.units, op.to, op.target, op.at, op.pace);
  return doFieldOrder(s, op.id, op.to, op.target, op.at, op.pace);
}

// toestand van de server + de bevelen die nog onderweg zijn
function setBaseState(state) {
  let s = state;
  for (const b of fieldQueue) {
    for (const op of b.ops) {
      if (b.sent && (s.field || []).some((g) => g.t0 === op.at)) continue; // zit al in de toestand van de server
      try { const c = structuredClone(s); applyFieldOp(c, op); s = c; } catch { /* de server zal het ook weigeren */ }
    }
  }
  app.data.town.state = s;
}

// Eén of meer bevelen tegelijk (een heel leger = één verzoek). Ze krijgen allemaal hetzelfde tijdstip en
// worden meteen in de browser uitgevoerd; de server rekent ze op exact dat tijdstip na.
function fieldOrders(list) {
  if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return null; }
  let s = structuredClone(app.data.town.state);
  const at = Math.max(Math.round(app.now()), s.t || 0);
  const ops = [];
  let last = null; let err = null;
  for (const p of list) {
    const op = { action: p.action, id: p.id, spec: p.spec, units: p.units, from: p.from, to: p.to, target: p.target, pace: p.pace, at };
    try {
      const c = structuredClone(s);
      last = applyFieldOp(c, op);
      s = c;
      ops.push(op);
    } catch (e) { err = err || e; }
  }
  if (!ops.length) {
    toast(err ? err.message : 'Dat lukt niet.', 'err');
    if (list.length === 1 && list[0].action === 'send') town.clearSel();
    return null;
  }
  if (err) toast(err.message, 'err');
  app.data.town.state = s;
  // nog niet verstuurde bevelen samen in één verzoek
  const tail = fieldQueue[fieldQueue.length - 1];
  if (tail && !tail.sent && tail.ops.length + ops.length <= 16) tail.ops.push(...ops);
  else fieldQueue.push({ ops, sent: false });
  computeLive(true);
  const one = list.length === 1 ? list[0] : null;
  if (one && (one.action === 'send' || one.action === 'split') && last && !one.keepSel) town.setSel({ type: 'group', id: last.id });
  renderSelHint();
  renderPanel();
  pumpField();
  return last;
}

const fieldOrder = async (p) => fieldOrders([p]);

async function pumpField() {
  if (fieldBusy) return;
  fieldBusy = true;
  while (fieldQueue.length) {
    const b = fieldQueue[0];
    b.sent = true;
    try {
      const r = await post('/field', { ops: b.ops });
      fieldQueue.shift();
      app.serverState = r.state;
      setBaseState(r.state);
      if (r.errors && r.errors.length) toast(r.errors[0], 'err');
    } catch (e) {
      fieldQueue.shift();
      if (app.serverState) setBaseState(app.serverState);
      toast(e.message, 'err');
      if (e.status === 401) location.reload();
    }
    computeLive(true);
    renderAll();
    renderSelHint();
  }
  fieldBusy = false;
}

function readFieldUnits() {
  const units = {};
  for (const i of document.querySelectorAll('[data-field-unit]')) {
    const n = Math.floor(Number(i.value) || 0);
    if (n > 0) units[i.dataset.fieldUnit] = n;
  }
  return units;
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
  const wrap = $('#buildwrap');
  wrap.hidden = app.view !== 'town' || !app.canAct;
  if (wrap.hidden) return;
  renderBuildToggle();
  if (!force && isBusy('buildbar')) { pending.buildbar = true; return; }
  pending.buildbar = false;
  const tab = bbTabNow();
  bb.dataset.tab = tab;
  if (tab === 'army') setHTML(bb, UI.armyBarHtml(app, app.live));
  else if (tab === 'advice') setHTML(bb, UI.adviceBarHtml(app, app.live));
  else setHTML(bb, UI.buildBarHtml(app.live, app.placing || (app.mode === 'wallremove' ? 'wall' : app.mode), app.data.team.color));
}

// welk tabblad onderaan: tijdens het bouwen of muren plaatsen altijd 'Bouwen'
const bbTabNow = () => (app.placing || app.mode ? 'build' : app.bbTab);

// naar een gebouw gaan (camera erheen) en het kiezen: het paneel toont dan wat het kost en de knop Verbeteren
function focusBuilding(b) {
  if (b.rp) { placeNext(b.id); return; } // staat nog nergens: eerst opnieuw plaatsen
  if (app.view !== 'town') switchView('town');
  town.clearSel();
  if (b.type === 'wall') town.centerOnWalls(); else town.centerOn(b);
  app.selBuilding = b.id; town.selected = b.id;
  app.selWall = null; town.selWall = null; app.pickStack = null; town.lastPick = null;
  renderPanel();
  openPanelMobile(true);
}

// Sluitknop bovenaan het schuifpaneel (gsm): een breed pijltje naar beneden (liggend: naar rechts, het paneel komt dan van
// rechts). Hoort bij de inhoud zelf, zodat hij bij elke verversing blijft staan; op pc verborgen (CSS).
const SHEET_CLOSE = '<button class="sheet-close" data-action="closeSheet" aria-label="Sluiten" title="Sluiten">'
  + '<svg class="sc-down" viewBox="0 0 72 20" aria-hidden="true"><path d="M6 5L36 15L66 5"/></svg>'
  + '<svg class="sc-right" viewBox="0 0 16 30" aria-hidden="true"><path d="M4 4L12 15L4 26"/></svg></button>';

// paneel wegschuiven; daarna het gekozen gebouw (of de gekozen stad) loslaten, anders blijft het gemarkeerd zonder uitleg
function closeSheet() {
  const panel = $('#panel');
  panel.classList.remove('open');
  clearTimeout(app.sheetTimer);
  app.sheetTimer = setTimeout(() => {
    if (panel.classList.contains('open')) return;
    if (app.selBuilding == null && !app.selWall && !(world && world.selected)) return;
    app.selBuilding = null; town.selected = null; app.selWall = null; town.selWall = null; app.pickStack = null;
    if (world) world.selected = null;
    renderPanel();
  }, 280);
}

// over de sluitknop naar beneden vegen (liggend: naar rechts) sluit ook
let sheetDrag = null;
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('.sheet-close');
  sheetDrag = b ? { x: e.clientX, y: e.clientY } : null;
});
document.addEventListener('pointermove', (e) => {
  if (!sheetDrag) return;
  const side = matchMedia('(orientation: landscape) and (max-height: 540px)').matches;
  if ((side ? e.clientX - sheetDrag.x : e.clientY - sheetDrag.y) > 28) { sheetDrag = null; closeSheet(); }
});
document.addEventListener('pointerup', () => { sheetDrag = null; });

function renderPanel(force = false) {
  const panel = $('#panel');
  const key = `${app.view}|${app.selBuilding}|${app.selWall ? `${app.selWall.i},${app.selWall.j}` : ''}|${world && world.selected ? world.selected.kind + world.selected.obj.id : ''}`;
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
  html = SHEET_CLOSE + html;
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
    ? allies.map((m) => {
      // naar eenzelfde speler hooguit één karavaan per 8 uur
      const wait = app.live ? tradeWait(app.live, m.playerId, app.now()) : 0;
      return `<div class="row"><span class="grow">${UI.esc(m.player)} — ${UI.esc(m.town)}${wait > 0 ? `<br><span class="muted">volgende karavaan over ${fmtDuration(wait)}</span>` : ''}</span><button class="btn small" data-action="sendTo" data-kind="trade" data-id="${m.townId}">Karavaan</button></div>`;
    }).join('')
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

// rustige stad: geen sfeerbeweging (dorpelingen, soldaten, dieren, rook, vlaggen...), onthouden per toestel
function renderCalmBtn() {
  const b = $('#calmBtn');
  if (!b) return;
  const on = !!(town && town.calm);
  b.innerHTML = UI.icon(on ? 'motionoff' : 'motion');
  b.classList.toggle('on', on);
  b.title = on ? 'Rustige stad: beweging staat uit (tik om weer aan te zetten)' : 'Beweging in de stad uitzetten (het spel loopt soepeler)';
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}

// is het zijpaneel een schuifpaneel? (gsm rechtop of liggend; zie de CSS)
const sheetPanel = () => window.innerWidth <= 900 || matchMedia('(orientation: landscape) and (max-height: 540px)').matches;

// tabbladen onderaan (Bouwen, Mijn leger, Bouwadvies) en in- of uitklappen (onthouden per toestel)
function renderBuildToggle() {
  const min = !!app.bbMin && !app.placing && !app.mode;
  const wrap = $('#buildwrap');
  wrap.classList.toggle('min', min);
  const tab = bbTabNow();
  const live = app.live;
  const soldiers = live ? UI.armySummary(live, app.data).reduce((a, r) => a + r.total, 0) : 0;
  const ready = live ? UI.adviceReady(live) : 0;
  // [id, tabblad, icoon, naam, korte naam (smalle gsm), getal, uitleg]
  const tabs = [
    ['bbToggle', 'build', 'hammer', 'Bouwen', 'Bouwen', '', 'Bouwmenu'],
    ['bbArmy', 'army', 'swords', 'Mijn leger', 'Leger', soldiers ? `<b class="bdg">${UI.fmt(soldiers)}</b>` : '', 'Mijn leger: hoeveel soldaten je hebt en waar ze zijn'],
    ['bbAdvice', 'advice', 'up', 'Bouwadvies', 'Advies', ready ? `<b class="bdg go">${ready}</b>` : '', 'Bouwadvies: wat je nog kan verbeteren en waar je bouwers mee bezig zijn'],
  ];
  for (const [id, t, ic, label, short, badge, title] of tabs) {
    const btn = $(`#${id}`);
    if (!btn) continue;
    const on = t === tab;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-selected', String(on));
    btn.setAttribute('aria-expanded', String(on && !min));
    btn.title = on && !min ? `${title} (tik om in te klappen)` : title;
    const html = `${UI.icon(ic)}<span class="lb long">${label}</span><span class="lb short">${short}</span>${badge}${on ? '<i class="chev"></i>' : ''}`;
    if (btn.innerHTML !== html) btn.innerHTML = html;
  }
}

function openPanelMobile(open) {
  if (!sheetPanel()) return;
  $('#panel').classList.toggle('open', open);
}

// ---------- tekenlus ----------
let lastT = performance.now();
let modalEl = null;
const pacer = new FX.Pacer();
function frame(t) {
  // hooguit ±60 beelden per seconde, ook op een scherm van 90/120 Hz (zie FX.Pacer)
  if (!pacer.ok(t)) { requestAnimationFrame(frame); return; }
  // achter een open venster (vervaagd) is 60 beelden per seconde verspilling: 5 per seconde volstaat
  if (!modalEl) modalEl = $('#modal');
  const behind = !!(modalEl && !modalEl.hidden);
  if (behind && t - lastT < 200) { requestAnimationFrame(frame); return; }
  const dt = t - lastT; lastT = t;
  if (town) town.throttled = behind; // dan zegt de beeldsnelheid niets over het toestel
  if (battle && battle.open) {
    // het slagveld tekent zichzelf; de stad hoeft dan niet mee te tekenen
  } else if (!$('#game').hidden && app.data) {
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
      app.serverState = r.state;
      setBaseState(r.state);
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

// Gebouw verplaatsen: meteen in de browser (zelfde regels als de server), dan de server. Weigert die, dan terug.
async function moveBuilding(id, x, y) {
  if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return; }
  const base = app.serverState || app.data.town.state;
  try {
    const c = structuredClone(base);
    doMove(c, id, x, y);
    setBaseState(c);
    computeLive(true);
    renderAll();
  } catch (e) { toast(e.message, 'err'); return; }
  const was = (base.buildings.find((b) => b.id === id) || {}).rp;
  const r = await act('/move', { id, x, y }, was ? 'Gebouw geplaatst' : 'Gebouw verplaatst');
  if (!r && app.serverState) { setBaseState(app.serverState); computeLive(true); renderAll(); }
  // nog meer gebouwen te plaatsen: meteen het volgende
  if (r && was && toPlace(app.live).length) setTimeout(() => { if (!town.moveB) placeNext(); }, 600);
}

// balk bovenaan tijdens het verplaatsen: wat je moet doen, 'Zet hier' (enkel als de plek mag) en 'Stoppen'
function renderMoveHint(m) {
  const hint = $('#placeHint');
  if (!m) { hint.hidden = true; return; }
  const walls = m.kind === 'walls';
  const b = !walls && app.live && app.live.buildings.find((x) => x.id === m.id);
  const name = walls ? m.label : b ? BUILDINGS[b.type].name : 'Gebouw';
  const mouse = town.cam.lastType === 'mouse';
  const what = walls ? 'de muur' : 'het gebouw';
  const how = m.ok ? (m.rp ? (mouse ? 'Mag hier staan: klik om het neer te zetten, of kies een andere plek.' : 'Mag hier staan. Of tik op een andere plek.') : 'Mag hier staan.')
    : m.same ? (mouse ? 'Klik op de nieuwe plek.' : `Tik op de nieuwe plek of sleep ${what}.`) : 'Daar kan het niet staan.';
  hint.hidden = false;
  renderPlacePill();
  setHTML(hint, `<span><b>${UI.esc(name)} ${m.rp ? `opnieuw plaatsen (${BUILDINGS[b.type].size}x${BUILDINGS[b.type].size}, gratis)` : 'verplaatsen'}</b> <span class="muted">${how}</span></span>
    <button class="btn small primary" data-action="moveHere" ${m.ok ? '' : 'disabled'}>Zet hier</button><button class="btn small" data-action="moveStop">Stoppen</button>`);
}

// muurstukken of een poort verplaatsen: meteen in de browser, dan de server (weigert die, dan terug)
async function moveWalls(tiles, dx, dy) {
  if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return; }
  const base = app.serverState || app.data.town.state;
  try {
    const c = structuredClone(base);
    doMoveWalls(c, tiles, dx, dy);
    setBaseState(c);
    app.selWall = null; town.selWall = null; app.selBuilding = null; town.selected = null;
    computeLive(true);
    renderAll();
  } catch (e) { toast(e.message, 'err'); return; }
  const r = await act('/walls/move', { tiles, dx, dy }, 'Muur verplaatst');
  if (!r && app.serverState) { setBaseState(app.serverState); computeLive(true); renderAll(); }
}

function cancelPlace() {
  if (town && town.moveB) town.cancelMove();
  app.placing = null;
  town.placing = null;
  $('#placeHint').hidden = true;
  renderBuildBar();
}

let allocTimer = null;
function changeVillagers(res, d) {
  const live = app.live;
  const alloc = { ...(app.pendingAlloc || live.villagers) };
  const total = JOBS.reduce((a, k) => a + (live.villagers[k] || 0), live.villagers.idle);
  // dezelfde plaatsen als de server (ook de vissers: 2 per bootje)
  const slotsNow = townSlots(live);
  if (alloc[res] == null) alloc[res] = 0;
  let used = JOBS.reduce((a, k) => a + (alloc[k] || 0), 0);
  let step = d;
  if (step > 0) step = Math.min(step, total - used, (slotsNow[res] || 0) - alloc[res]);
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
  const r = await act('/villagers', { food: a.food, wood: a.wood, stone: a.stone, gold: a.gold, fish: a.fish || 0 });
  allocBusy = false;
  if (seq === allocSeq || !r) app.pendingAlloc = null;
  renderPanel(true);
}

function switchView(v) {
  app.view = v;
  setTimeout(renderPlacePill, 0);
  for (const b of document.querySelectorAll('.navbtn[data-view]')) b.classList.toggle('active', b.dataset.view === v);
  $('#townCanvas').hidden = v !== 'town';
  $('#worldCanvas').hidden = v !== 'world';
  const calmBtn = $('#calmBtn');
  if (calmBtn) calmBtn.hidden = v !== 'town'; // enkel voor de stad
  if (v === 'world') {
    cancelPlace();
    // de eerste keer: op je eigen stad (ook als de kaart al op de achtergrond geladen werd)
    const first = !app.worldSeen;
    app.worldSeen = true;
    if (!app.map) loadMap().then(() => world.centerOnTile(app.data.town.x, app.data.town.y));
    else {
      if (first) world.centerOnTile(app.data.town.x, app.data.town.y);
      if (Date.now() - app.mapAt > 20000) loadMap();
    }
  }
  renderAll();
}

const sendCtx = { target: null, kind: null };

function townTarget(id) {
  const t = app.map && app.map.towns.find((x) => x.id === id);
  return t && { kind: 'town', id: t.id, name: t.name, x: t.x, y: t.y, peaceEnd: t.peaceEnd, playerId: t.playerId, player: t.player };
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

let dismissNeed = null;
function readDismiss() {
  const units = {};
  const villagers = {};
  for (const el of document.querySelectorAll('[data-dismiss-unit], [data-dismiss-vill]')) {
    const v = Math.max(0, Math.min(Number(el.max), Math.floor(Number(el.value) || 0)));
    if (!v) continue;
    if (el.dataset.dismissUnit) units[el.dataset.dismissUnit] = v; else villagers[el.dataset.dismissVill] = v;
  }
  return { units, villagers };
}
function updateDismissSummary() {
  const el = $('#dismissSummary');
  if (!el) return;
  const { units, villagers } = readDismiss();
  el.innerHTML = UI.dismissSummaryHtml(app, app.live, units, dismissNeed, villagers);
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
  if (app.modal === 'grew' && type !== 'grew') app.grewAsked = false; // de uitleg werd weggedrukt: na dit venster opnieuw
  app.modal = type;
  const body = $('#modalBody');
  $('#modal').hidden = false;
  clearInterval(chatTimer);
  if (type === 'help') body.innerHTML = UI.helpHtml(app.data.world, app.data.me.peaceEnd);
  if (type === 'updates') {
    body.innerHTML = `<h2>${UI.icon('news')} Nieuws uit de vallei</h2><p class="empty">Laden…</p>`;
    try {
      const N = await import('./updates.js');
      body.innerHTML = N.updatesHtml({ seen: newsSeen(), joinedAt: joinedAt() });
      const top = N.latestUpdate();
      if (top) markNewsSeen(top.id);
    } catch (e) { body.innerHTML = `<p class="req">${UI.esc(e.message)}</p>`; }
  }
  if (type === 'dismiss') body.innerHTML = UI.dismissHtml(app, app.live, arg || {});
  if (type === 'grew') body.innerHTML = UI.grewHtml(app.live, app.data.team.color);
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
      const r = await get('/team');
      app.team = r.members; app.clan = r.clan;
      body.innerHTML = UI.teamHtml(app, app.team, app.chat.chan, app.clan);
      renderChatBadges();
      loadChat();
      // meteen naar de chat scrollen als je via 'nieuwe berichten' of 'Bericht' kwam
      const ch = body.querySelector('.chat');
      if (ch && (arg === 'chat' || (app.chat.unread || {})[app.chat.chan])) ch.scrollIntoView({ block: 'start' });
      chatTimer = setInterval(loadChat, 8000);
    } catch (e) { body.innerHTML = `<p class="req">${UI.esc(e.message)}</p>`; }
  }
}

function closeModal() {
  $('#modal').hidden = true;
  app.modal = null;
  clearInterval(chatTimer);
  if (!app.grewAsked) setTimeout(renderPlacePill, 400); // wachtte de uitleg over de grotere gebouwen op dit venster?
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
  if (chan === 'dm') return loadDm();
  const form = $('#chatForm');
  if (form) { form.hidden = false; form.elements.text.placeholder = 'Schrijf een bericht…'; }
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
    if (app.chat.unread) app.chat.unread[chan] = 0;
    renderChatBadges();
  } catch { /* stil */ }
}

// privéberichten: zonder gekozen speler de lijst met gesprekken, anders het gesprek (wat aan jou gericht was, is dan gelezen)
async function loadDm() {
  const el = $('#chatMsgs');
  const form = $('#chatForm');
  const other = app.chat.dm;
  if (form) { form.hidden = !other; form.elements.text.placeholder = 'Privébericht…'; }
  try {
    if (!other) {
      const list = await get('/dm/list');
      if (!el || app.chat.chan !== 'dm' || app.chat.dm) return;
      setHTML(el, UI.dmListHtml(list));
      return;
    }
    const conv = await get(`/dm?with=${other}`);
    if (!el || app.chat.chan !== 'dm' || app.chat.dm !== other) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setHTML(el, UI.dmConvHtml(conv));
    if (atBottom || el.dataset.loaded !== `dm${other}`) el.scrollTop = el.scrollHeight;
    el.dataset.loaded = `dm${other}`;
    if (conv.unreadLeft != null && app.chat.unread) { app.chat.unread.dm = conv.unreadLeft; renderChatBadges(); }
  } catch (e) { if (el && other) setHTML(el, `<p class="req">${UI.esc(e.message)}</p>`); }
}

// een privégesprek openen (vanuit de kaart, het Team-venster of een melding)
function openDm(id) {
  app.chat.chan = 'dm';
  app.chat.dm = id || null;
  if (app.modal === 'team') {
    for (const t of document.querySelectorAll('.chat .tab')) t.classList.toggle('active', t.dataset.chan === 'dm');
    const m = $('#chatMsgs');
    if (m) { resetHTML(m); m.innerHTML = '<p class="empty">Laden…</p>'; delete m.dataset.loaded; }
    loadChat();
    const ch = document.querySelector('#modalBody .chat'); if (ch) ch.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (id) setTimeout(() => { const i = $('#chatForm') && $('#chatForm').elements.text; if (i && matchMedia('(pointer: fine)').matches) i.focus(); }, 300);
  } else openModal('team', 'chat');
}

// na een wissel van clan: alles opnieuw (kleur, bondgenoten, kaart) en het Team-venster bijwerken
async function afterClanChange(msg) {
  if (msg) toast(msg, 'ok', 'flag');
  app.chat.resetTeam = true; app.chat.last.team = null; // nieuwe clanchat: de oude berichten daar tellen niet als nieuw
  await refresh();
  await loadMap(true).catch(() => {});
  if (app.view === 'world') renderPanel();
  if (app.modal === 'team') openModal('team');
}

// Team-venster bijwerken zonder het te sluiten (na een uitnodiging, verzoek, ...)
async function reloadClan() {
  try {
    const r = await get('/team');
    app.team = r.members; app.clan = r.clan;
    const a = $('#clanAsk'); const l = $('#clanList');
    if (a) setHTML(a, UI.clanAskHtml(app.clan));
    if (l) setHTML(l, UI.clanListHtml(app, app.clan));
  } catch { /* stil */ }
}

async function clanCall(path, body, el) {
  if (el) el.disabled = true;
  try {
    const r = await post(path, body);
    if (r.joined || r.team) await afterClanChange(r.msg);
    else { toast(r.msg || 'Gedaan.', 'ok', 'flag'); await reloadClan(); }
    return r;
  } catch (e) { toast(e.message, 'err'); if (el) el.disabled = false; return null; }
}

// /state vraagt meteen hoeveel chatberichten nieuwer zijn dan wat deze browser al zag
function statePath() {
  const s = app.chat.seen || {};
  return `/state?cw=${s.world || 0}&ct=${s.team || 0}`;
}

// Ongelezen chat. chat = { world, team: laatste id per kanaal, newWorld/newTeam: zoveel nieuwer van anderen (max. 9),
// lastWorld/lastTeam: laatste bericht { name, text, me } }.
function chatState(chat, first) {
  if (!chat) return;
  const seen = app.chat.seen;
  // eerste keer op dit toestel: oude berichten tellen niet als nieuw
  if (seen.world == null && seen.team == null) { seen.world = chat.world || 0; seen.team = chat.team || 0; store.set('rvs-chat-seen', seen); }
  if (app.chat.resetTeam) { app.chat.resetTeam = false; seen.team = chat.team || 0; store.set('rvs-chat-seen', seen); }
  const open = app.modal === 'team';
  const prev = app.chat.last || {};
  const unread = { world: 0, team: 0 };
  for (const [c, n, last] of [['world', chat.newWorld, chat.lastWorld], ['team', chat.newTeam, chat.lastTeam]]) {
    const id = chat[c] || 0;
    if (id <= (seen[c] || 0)) continue;
    if (!n || (open && app.chat.chan === c)) { seen[c] = id; store.set('rvs-chat-seen', seen); continue; } // enkel eigen berichten, of je leest mee
    unread[c] = n;
    // een nieuw bericht sinds de vorige peiling: kort tonen wie wat schreef (tik = naar de chat)
    if (!first && prev[c] != null && id > prev[c] && last && !last.me) {
      toast(`${c === 'team' ? 'Teamchat' : 'Iedereen'} · ${last.name}: ${last.text}`, 'chatmsg', 'chat', `openChat:${c}`);
    }
  }
  // privéberichten: de server weet wat gelezen is (ook op een ander toestel)
  unread.dm = chat.newDm || 0;
  const ld = chat.lastDm;
  const reading = open && app.chat.chan === 'dm' && ld && app.chat.dm === ld.from;
  if (reading) unread.dm = 0;
  if (!first && ld && ld.id > (prev.dm || 0) && !reading) toast(`Privé · ${ld.name}: ${ld.text}`, 'chatmsg', 'chat', `dmOpen:${ld.from}`);
  // uitnodigingen voor jou en verzoeken om bij je clan te komen
  const cl = app.data && app.data.clan ? app.data.clan : { invites: 0, requests: 0 };
  const pc = app.chat.clan || { invites: 0, requests: 0 };
  if (!first && cl.invites > pc.invites) toast('Een clan nodigt je uit! Antwoord in het Team-venster.', 'chatmsg', 'flag', 'openChat:team');
  if (!first && cl.requests > pc.requests) toast('Iemand vraagt om bij jullie clan te komen. Antwoord in het Team-venster.', 'chatmsg', 'flag', 'openChat:team');
  if (open && (cl.invites !== pc.invites || cl.requests !== pc.requests)) reloadClan();
  app.chat.clan = { invites: cl.invites, requests: cl.requests };
  unread.clan = cl.invites + cl.requests;
  app.chat.last = { world: chat.world || 0, team: chat.team || 0, dm: ld ? Math.max(ld.id, prev.dm || 0) : prev.dm || 0 };
  app.chat.unread = unread;
  renderChatBadges();
}

function renderChatBadges() {
  const u = app.chat.unread || { world: 0, team: 0 };
  const total = (u.world || 0) + (u.team || 0) + (u.dm || 0) + (u.clan || 0);
  const txt = total >= 9 ? '9+' : String(total);
  const b = $('#badgeChat');
  b.hidden = !total; b.textContent = txt;
  b.classList.toggle('pulse', total > 0);
  const pill = $('#chatPill');
  if (pill) {
    pill.hidden = !total;
    if (total) {
      const kinds = ['team', 'world', 'dm', 'clan'].filter((k) => u[k]);
      const where = kinds.length > 1 ? '' : { team: ' in de clanchat', world: ' van iedereen', dm: ' (privé)', clan: '' }[kinds[0]] || '';
      const what = kinds.length === 1 && kinds[0] === 'clan' ? (u.clan === 1 ? 'uitnodiging of verzoek' : 'uitnodigingen of verzoeken') : total === 1 ? 'nieuw bericht' : 'nieuwe berichten';
      setHTML(pill, `${UI.icon(kinds.length === 1 && kinds[0] === 'clan' ? 'flag' : 'chat')}<span>${txt} ${what}<span class="where">${where}</span></span>`);
      pill.dataset.chan = u.clan ? 'team' : u.dm ? 'dm' : u.team ? 'team' : 'world';
    }
  }
  // ook in de titel van het tabblad (zie je in een ander tabblad of op de taakbalk)
  const base = document.title.replace(/^\(\d\+?\) /, '');
  document.title = total ? `(${txt}) ${base}` : base;
  // aantallen op de tabbladen in de chat
  for (const t of document.querySelectorAll('.chat .tab[data-chan]')) {
    const n = u[t.dataset.chan] || 0;
    let bd = t.querySelector('.bdg');
    if (n && !bd) { bd = document.createElement('b'); bd.className = 'bdg'; t.appendChild(bd); }
    if (bd) { if (n) bd.textContent = n >= 9 ? '9+' : String(n); else bd.remove(); }
  }
}

// ---------- gebeurtenissen ----------
const actions = {
  authTab(el) {
    for (const t of document.querySelectorAll('.tab[data-tab]')) t.classList.toggle('active', t === el);
    $('#loginForm').hidden = el.dataset.tab !== 'login';
    $('#registerForm').hidden = el.dataset.tab !== 'register';
    if (!$('#registerForm').hidden && !$('#civPicker').children.length) $('#civPicker').innerHTML = UI.civPickerHtml();
    $('#authError').textContent = '';
  },
  view(el) { closeModal(); openPanelMobile(false); switchView(el.dataset.view); },
  reports() { openModal('reports'); },
  team() { openModal('team'); },
  leaderboard() { openModal('leaderboard'); },
  help() { openModal('help'); },
  news() { openModal('updates'); },
  closeModal,
  async logout() {
    if (!confirm('Wil je afmelden?')) return;
    await post('/logout').catch(() => {});
    location.reload();
  },
  calmMode() {
    if (!town) return;
    town.calm = !town.calm;
    store.set('rvs-calm', town.calm);
    // wie je net koos (een dorpeling of één soldaat) is niet meer te zien: loslaten
    if (town.calm && town.sel && ['walker', 'villagers', 'soldier'].includes(town.sel.type)) town.setSel(null);
    renderCalmBtn();
    renderPanel(true);
    toast(town.calm ? 'Rustige stad: geen dorpelingen, troepen, dieren, rook of wapperende vlaggen meer. Vondsten en gevechten blijven.'
      : 'Beweging in de stad staat weer aan', 'ok', town.calm ? 'motionoff' : 'motion');
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
  closeSheet() { closeSheet(); },
  place(el) {
    const type = el.dataset.type;
    if (app.placing === type) { cancelPlace(); return; }
    const err = el.classList.contains('locked') || el.classList.contains('poor') ? el.title.split(': ').slice(1).join(': ') : null;
    if (err) { toast(err, 'err'); return; }
    if (town.moveB) town.cancelMove();
    app.placing = type;
    if (app.mode) setMode(null);
    town.clearSel();
    town.placing = type;
    town.selected = null;
    app.selBuilding = null;
    const hint = $('#placeHint');
    hint.hidden = false;
    // het havenhuis: enkel aan het water (blauwe tegels); kijk meteen naar de dichtste plek
    const shore = BUILDINGS[type].shore;
    const anyShore = shore ? town.showShore() : true;
    hint.innerHTML = shore
      ? (anyShore ? `Kies een <b>blauwe plek aan het water</b> voor het ${BUILDINGS[type].name.toLowerCase()}.` : 'Er is geen vrij land aan het water dicht genoeg bij je stad.') + '<button class="btn small" data-action="cancelPlace">Annuleren</button>'
      : `Kies een plek voor: <b>${BUILDINGS[type].name}</b> <span class="muted">(shift = meerdere)</span><button class="btn small" data-action="cancelPlace">Annuleren</button>`;
    openPanelMobile(false);
    renderBuildBar();
    renderPanel();
  },
  cancelPlace,
  wallMode(el) { if (el && el.classList.contains('locked')) { toast(el.title, 'err'); return; } setMode(app.mode === 'wall' ? null : 'wall'); },
  wallRemove() { setMode('wallremove'); },
  gateMode() { setMode(app.mode === 'gate' ? null : 'gate'); },
  async gateHere(el) {
    const r = await act('/gate', { i: Number(el.dataset.i), j: Number(el.dataset.j) }, 'Poort gebouwd');
    if (r) { town.selWall = { ...town.selWall, gate: true }; app.selWall = town.selWall; renderPanel(true); }
  },
  async wallTileRemove(el) {
    const r = await act('/walls', { tiles: [[Number(el.dataset.i), Number(el.dataset.j)]], remove: true }, app.selWall && app.selWall.gate ? 'Poort afgebroken' : 'Muurstuk afgebroken');
    if (r) { town.selWall = null; app.selWall = null; renderPanel(true); }
  },
  moveBuilding(el) {
    const b = app.live && app.live.buildings.find((x) => x.id === Number(el.dataset.id));
    if (!b || !town) return;
    if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return; }
    cancelPlace();
    if (app.mode) setMode(null);
    openPanelMobile(false);
    town.startMove(b);
  },
  moveWall(el) {
    const live = app.live;
    if (!live || !town) return;
    if (!app.canAct) { toast('Het spel is nu niet actief.', 'err'); return; }
    const i = Number(el.dataset.i); const j = Number(el.dataset.j); const what = el.dataset.what;
    const gate = gateList(live).find((g) => g.tiles.some(([a, b]) => a === i && b === j));
    let tiles; let label;
    if (what === 'run') { tiles = wallRun(live, i, j); label = `Muur (${tiles.length} stukken)`; }
    else if (gate && (what === 'gate' || what === 'one')) { tiles = gate.tiles.map(([a, b]) => [a, b]); label = 'Poort'; }
    else { tiles = [[i, j]]; label = 'Muurstuk'; }
    cancelPlace();
    if (app.mode) setMode(null);
    openPanelMobile(false);
    town.startWallMove(tiles, i, j, label);
  },
  moveHere() { if (town) town.dropMove(); },
  placeNext(el) { placeNext(el && el.dataset.id ? Number(el.dataset.id) : null); },
  moveStop() { if (town) town.cancelMove(); },
  async demolish(el) {
    const stop = el.dataset.stop === '1';
    if (!confirm(stop ? `De bouw van ${el.dataset.name} stoppen? Je krijgt de helft van de grondstoffen terug.` : `${el.dataset.name} afbreken? Je krijgt een deel van de grondstoffen terug.`)) return;
    const r = await act('/demolish', { id: Number(el.dataset.id) }, stop ? 'Bouw gestopt' : `${el.dataset.name} afgebroken`);
    if (r) actions.deselect();
  },
  landMode() { setMode(app.mode === 'land' ? null : 'land'); },
  modeDone() { setMode(null); },
  // de gekozen troepen naar huis (een groep, één troep uit een groep, alle van een soort of het hele leger)
  selHome() {
    const sel = town.sel;
    if (!sel) return;
    if (sel.type === 'group') fieldOrder({ action: 'order', id: sel.id, target: { type: 'home' } });
    else if (sel.type === 'groups') fieldOrders(sel.ids.map((id) => ({ action: 'order', id, target: { type: 'home' }, keepSel: true })));
    else town.issue(sel, null, { type: 'home' });
    town.clearSel();
  },
  groupsHome() {
    const sel = town.sel;
    if (sel && (sel.type === 'groups' || sel.type === 'army')) fieldOrders(sel.ids.map((id) => ({ action: 'order', id, target: { type: 'home' }, keepSel: true })));
    else if (sel && sel.type === 'kind') town.issue(sel, null, { type: 'home' });
    town.clearSel();
  },
  cancelVillager() {
    town.clearSel();
    $('#placeHint').hidden = true;
  },
  fieldPick(el) {
    const g = (app.live.field || []).find((x) => x.id === Number(el.dataset.id));
    if (!g) return;
    town.setSel({ type: 'group', id: g.id });
    const p = groupPos(g, app.now());
    town.centerOnPos(p.x, p.y);
    openPanelMobile(false);
  },
  fieldHome(el) { fieldOrder({ action: 'order', id: Number(el.dataset.id), target: { type: 'home' } }); },
  fieldVillager() {
    const d = tcDoor();
    fieldOrder({ action: 'send', spec: { villager: 'idle' }, to: { x: d.gx, y: d.gy + 1.6 } }).then((r) => { if (r) openPanelMobile(false); });
  },
  fieldSend() {
    const units = readFieldUnits();
    if (!Object.keys(units).length) { toast('Kies hoeveel soldaten er op pad gaan.', 'err'); return; }
    const d = tcDoor();
    fieldOrder({ action: 'send', spec: { units }, to: { x: d.gx + 0.8, y: d.gy + 1.8 } }).then((r) => { if (r) openPanelMobile(false); });
  },
  raidAsk() {
    const raid = raidIncoming();
    if (raid) offerRaid(raid);
  },
  harvest(el) { harvestNode(Number(el.dataset.id), null); },
  vill(el) { changeVillagers(el.dataset.res, Number(el.dataset.d)); },
  upgrade(el) {
    const b = app.live.buildings.find((x) => x.id === Number(el.dataset.id));
    act('/upgrade', { id: Number(el.dataset.id) }, b && b.type === 'tc' ? 'Je volk maakt zich klaar voor een nieuw tijdperk!' : 'Verbetering gestart');
  },
  // troepen en dorpelingen ontslaan (plaats maken in de bevolking, bv. voor een ram)
  async dismissOpen(el) {
    dismissNeed = (el && el.dataset.need) || null;
    // een verdeling van de dorpelingen die nog moet vertrekken, eerst versturen (anders kloppen de aantallen niet)
    if (app.pendingAlloc) { clearTimeout(allocTimer); await sendAlloc(); }
    openModal('dismiss', { need: dismissNeed, first: el && el.dataset.first });
  },
  dismissAll(el) {
    const i = document.querySelector(el.dataset.vill ? `[data-dismiss-vill="${el.dataset.vill}"]` : `[data-dismiss-unit="${el.dataset.unit}"]`);
    if (i) { i.value = el.dataset.n; updateDismissSummary(); }
  },
  async dodismiss(el) {
    const { units, villagers } = readDismiss();
    const n = Object.values(units).reduce((a, b) => a + b, 0);
    const v = Object.values(villagers).reduce((a, b) => a + b, 0);
    if (!n && !v) { toast('Kies wie je wil ontslaan.', 'err'); return; }
    const words = [n && `${n} ${n > 1 ? 'soldaten' : 'soldaat'}`, v && `${v} ${v > 1 ? 'dorpelingen' : 'dorpeling'}`].filter(Boolean).join(' en ');
    if (!confirm(`${words} ontslaan? Dat kan je niet ongedaan maken.`)) return;
    el.disabled = true;
    const r = await act('/dismiss', { units, villagers }, `${words} ontslagen: er is weer plaats in je bevolking.`);
    if (r) closeModal(); else el.disabled = false;
  },
  setmax(el) { const i = document.getElementById(`tn-${el.dataset.unit}`); if (i) i.value = Math.max(1, Number(el.dataset.max)); },
  train(el) {
    const i = document.getElementById(`tn-${el.dataset.unit}`);
    const n = Math.floor(Number(i && i.value) || 0);
    if (n < 1) { toast('Kies een aantal.', 'err'); return; }
    act('/train', { unit: el.dataset.unit, count: n }, 'Training gestart');
  },
  research(el) {
    act('/research', { id: el.dataset.id }, 'Onderzoek gestart');
  },
  buildBoat() {
    act('/boat', {}, 'Het bootje wordt gebouwd: vrije dorpelingen gaan meteen aan boord.');
  },
  async ransom() {
    if (!confirm('Losgeld betalen? Je bent meteen vrij.')) return;
    const r = await act('/vassal/ransom', {}, 'Losgeld betaald: je bent weer vrij!');
    if (r) refresh();
  },
  trade() {
    act('/trade', { give: $('#tr-give').value, get: $('#tr-get').value, amount: Math.floor(Number($('#tr-amount').value) || 0) }, 'Ruil voltooid');
  },
  async recall(el) {
    const r = await act('/recall', { id: Number(el.dataset.id) }, 'Troepen keren terug');
    if (r) refresh();
  },
  // een ander gebouw op de plek waar je tikte (rij 'Ook op deze plek' in het paneel)
  pickBuilding(el) {
    const id = Number(el.dataset.id);
    if (!app.live.buildings.some((x) => x.id === id)) return;
    app.selBuilding = id; town.selected = id; app.selWall = null; town.selWall = null;
    town.lastPick = null;
    renderPanel();
  },
  deselect() {
    app.selBuilding = null; town.selected = null; app.selWall = null; town.selWall = null; app.pickStack = null;
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
      : { kind: 'town', id: o.id, name: o.name, x: o.x, y: o.y, peaceEnd: o.peaceEnd, player: o.player, playerId: o.playerId, betray: el.dataset.betray === '1' };
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
    if (t.betray && !confirm(`${t.player || 'Deze speler'} is je bondgenoot. Wil je hem echt verraden en ${kind === 'scout' ? 'verkennen' : 'aanvallen'}?`)) return;
    el.disabled = true;
    try {
      await post('/march', { kind, targetKind: t.kind, targetId: t.id, units, res, betray: !!t.betray });
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
  replay(el) { openReplay(Number(el.dataset.id)); },
  raidReplay(el) { openRaidReplay(Number(el.dataset.id)); },
  async readAll() {
    await post('/reports/read-all').catch(() => {});
    app.data.unseenReports = 0; app.seenReports = 0;
    $('#badgeReports').hidden = true;
    openModal('reports');
  },
  // naar de chat (knop 'nieuwe berichten' of een melding): het kanaal met ongelezen berichten
  openChat(el) {
    const u = app.chat.unread || {};
    app.chat.chan = (el && el.dataset.chan) || (u.team ? 'team' : u.world ? 'world' : u.dm ? 'dm' : app.chat.chan);
    if (app.chat.chan === 'dm') app.chat.dm = null;
    openModal('team', u.clan ? null : 'chat');
  },
  // privébericht aan een speler (of de lijst met gesprekken)
  dmOpen(el) { openDm(Number(el.dataset.id) || null); },
  dmBack() { openDm(null); },
  clanAnswer(el) {
    const accept = el.dataset.accept === '1';
    const r = app.clan && [...app.clan.invites, ...app.clan.requests].find((x) => x.id === Number(el.dataset.id));
    if (accept && r && r.kind === 'invite' && !confirm(`Bij ${r.team ? r.team.name : 'deze clan'} gaan? Je verlaat dan ${app.data.team.name}. Troepen bij je bondgenoten komen naar huis.`)) return;
    clanCall('/clan/answer', { id: Number(el.dataset.id), accept }, el);
  },
  clanInvite(el) { clanCall('/clan/invite', { player: Number(el.dataset.id) }, el); },
  clanRequest(el) {
    if (!confirm(`Vragen om bij ${el.dataset.name} te komen? Aanvaarden ze, dan verlaat je meteen ${app.data.team.name}.`)) return;
    clanCall('/clan/request', { team: Number(el.dataset.id) }, el);
  },
  clanLeave(el) {
    const name = ($('#clanNewName') && $('#clanNewName').value.trim()) || '';
    if (!confirm(`Wil je ${app.data.team.name} echt verlaten? Je troepen bij je bondgenoten komen naar huis, en die van hen bij jou.`)) return;
    clanCall('/clan/leave', { name }, el);
  },
  clanKick(el) {
    if (!confirm(`${el.dataset.name} uit de clan zetten? Hij viel een clanlid aan.`)) return;
    clanCall('/clan/kick', { player: Number(el.dataset.id) }, el);
  },
  chatTab(el) {
    if (el.dataset.chan === 'dm') { openDm(app.chat.chan === 'dm' ? null : app.chat.dm); return; }
    app.chat.chan = el.dataset.chan;
    for (const t of document.querySelectorAll('.chat .tab')) t.classList.toggle('active', t === el);
    const m = $('#chatMsgs');
    if (m) { resetHTML(m); m.innerHTML = '<p class="empty">Laden…</p>'; delete m.dataset.loaded; }
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
  battleGo(el) { openBattle(Number(el.dataset.id)); },
  practice(el) { startPractice(el.dataset.role); },
  pushOn() { enablePush(); },
  pushOff() { disablePush(); },
  pushPref(el) { setPushPref(el.dataset.k); },
  async pushTest() {
    try {
      const r = await post('/push/test', {});
      app.pushNote = r.sent ? 'Proefmelding verstuurd: kijk bovenaan je scherm of in je meldingen.' : null;
      app.pushErr = r.sent ? null : 'Er staat geen toestel ingeschreven. Zet de meldingen opnieuw aan.';
      if (!r.sent) app.pushOn = false;
      toast(r.sent ? 'Proefmelding verstuurd.' : 'Geen toestel gevonden: zet de meldingen opnieuw aan.', r.sent ? 'ok' : 'err', 'bell');
      refreshPushCards();
    } catch (e) { toast(e.message, 'err'); }
  },
  async prechoose(el) {
    const id = Number(el.dataset.id); const mode = el.dataset.mode;
    const m = app.data.marches.find((x) => x.id === id);
    const next = m && m.pref === mode ? null : mode; // nog eens tikken = keuze ongedaan maken
    try {
      await post('/march/mode', { id, mode: next });
      if (m) m.pref = next;
      renderArrival();
    } catch (e) { toast(e.message, 'err'); }
  },
  // tabblad onderaan: een ander tabblad opent dat; hetzelfde (open) tabblad klapt het menu in
  bbTab(el) {
    const t = el.dataset.tab;
    if (t !== 'build' && (app.placing || app.mode)) setMode(null);
    if (t === bbTabNow() && !app.bbMin) app.bbMin = true;
    else { app.bbTab = t; app.bbMin = false; }
    store.set('rvs-buildbar-min', app.bbMin);
    store.set('rvs-buildbar-tab', app.bbTab);
    renderBuildBar(true);
    updateTimers();
  },
  // bouwadvies: naar het gebouw (een gebundelde kaart toont bij elke tik het volgende gebouw van die soort)
  adviceGo(el) {
    const live = app.live;
    let b = null;
    if (el.dataset.id) b = live.buildings.find((x) => x.id === Number(el.dataset.id));
    else {
      const key = `${el.dataset.type}|${el.dataset.level}`;
      const list = live.buildings.filter((x) => x.type === el.dataset.type && x.level === Number(el.dataset.level) && !live.builds.some((j) => j.bid === x.id));
      if (!list.length) return;
      const i = ((app.adviceIdx[key] ?? -1) + 1) % list.length;
      app.adviceIdx[key] = i;
      b = list[i];
    }
    if (b) focusBuilding(b);
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
  if (e.target.matches('[data-dismiss-unit], [data-dismiss-vill]')) updateDismissSummary();
});

document.addEventListener('keydown', (e) => {
  if (battle && battle.open) return; // het slagveld heeft zijn eigen toetsen
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) closeModal();
    else if (town && town.moveB) town.cancelMove();
    else if (app.placing) cancelPlace();
    else if (app.mode) setMode(null);
    else if (town && town.sel) actions.cancelVillager();
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
    await post('/register', { name: f.get('name'), password: f.get('password'), townName: f.get('townName'), joinCode: f.get('joinCode'), civ: f.get('civ') });
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
  try {
    if (app.chat.chan === 'dm') {
      if (!app.chat.dm) { input.value = text; return; }
      await post('/dm', { to: app.chat.dm, text });
    } else await post('/chat', { channel: app.chat.chan, text });
    loadChat();
  } catch (err) { input.value = text; toast(err.message, 'err'); }
});

// Op een iPhone/iPad: uitleg om het spel als app op het beginscherm te zetten (in plaats van de Android-app).
// Al geopend vanaf het beginscherm? Dan tonen we niets.
(function appLink() {
  const el = $('#appLink');
  if (!el) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone) { el.hidden = true; return; }
  if (ios) {
    el.classList.add('ios');
    el.innerHTML = `<b>Als app op je iPhone:</b> tik in Safari onderaan op <span class="share-ic" aria-label="Delen"></span> <b>Delen</b> en kies <b>Zet op beginscherm</b>.`;
  }
})();

for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', UI.icon(el.dataset.icon));
boot();
