// 3D-gebouwen als afbeeldingen: worden op de achtergrond gerenderd (render-worker.js) en daarna bewaard.
// Zolang een gebouw nog niet klaar is, geeft get() null en tekent het spel de gewone (getekende) versie.
//
// Vlot laden:
// - de werkers maken het afgewerkte beeld (ImageBitmap, figuren met hun rand) en bewaren het zelf in Cache Storage;
// - de beelden die vorige keer gebruikt werden (lijst in localStorage) worden bij het opstarten in één keer uit de
//   cache gehaald (`preloaded`), zodat het spel meteen in 3D start in plaats van eerst alles in 2D te tekenen;
// - een figuur waarvan een beeld van de animatie nog niet klaar is, toont een ander beeld van dezelfde figuur.
import { HAS_3D } from './models3d.js';
import { HAS_PROP } from './propmodels.js';

const SCALE = typeof window !== 'undefined' && (window.devicePixelRatio || 1) > 1.5 && window.innerWidth > 900 ? 3 : 2;
const cache = new Map();
// sleutels die geladen of gerenderd worden; basePending = hoeveel daarvan gewone (geen scherpe '@') versies zijn
const pending = new Set();
let basePending = 0;
const addPending = (k) => { if (!pending.has(k)) { pending.add(k); if (!k.includes('@')) basePending++; } };
const delPending = (k) => { if (pending.delete(k) && !k.includes('@')) basePending--; };
let worker = null;
let failed = false;
let ready = 0;
const LOW = typeof window !== 'undefined' && (window.innerWidth < 800 || (navigator.hardwareConcurrency || 8) <= 4 || /Android/i.test(navigator.userAgent || ''));
// eenmaal gerenderde gebouwen bewaren in de browser (Cache Storage), zodat dat maar één keer gebeurt.
// Verhoog VERSION als de modellen of de renderer veranderen. (10: figuren worden mét hun rand bewaard)
const VERSION = 10;
const STORE = 'rvs-3d-v' + VERSION;
const hasStore = typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext;
const urlOf = (key) => `/__3d/${VERSION}/${SCALE}/${encodeURIComponent(key)}`;
let storeP = null;
const openStore = () => storeP || (storeP = caches.open(STORE).catch(() => null));

// Figuren in meerdere resoluties: eerst de gewone (SCALE), bij inzoomen een scherpere (HI). Zolang de scherpe niet
// klaar is, tekent het spel de beste die er al is. Scherpe beelden nemen veel geheugen: hooguit HI_BUDGET pixels.
const HI = [4, 6].filter((x) => x > SCALE + 0.5);
// geheugen voor scherpe beelden, in pixels (gebouwen op 6x zijn groot): de langst niet gebruikte gaan eerst weg
const HI_BUDGET = (LOW ? 12 : 28) * 1e6;
const hiKeys = new Set();
let hiPx = 0;

// figuren krijgen een zachte donkere rand (beter leesbaar op het gras); even dik bij elke resolutie
// (enkel nog als de werker geen OffscreenCanvas kent; anders doet de werker dit zelf)
function outlined(cv, scale) {
  const o = document.createElement('canvas');
  o.width = cv.width; o.height = cv.height;
  const g = o.getContext('2d');
  const r = Math.max(1, Math.round(scale / 2));
  const dirs = r === 1 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[-r, 0], [r, 0], [0, -r], [0, r], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, r * 0.7]];
  for (const [dx, dy] of dirs) g.drawImage(cv, dx, dy);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgba(24,16,8,0.55)'; g.fillRect(0, 0, o.width, o.height);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(cv, 0, 0);
  return o;
}

// img = canvas of ImageBitmap (beide gaan rechtstreeks in drawImage)
function finish(key, img, meta) {
  const sc = meta.sc || SCALE;
  cache.set(key, { cv: img, w: img.width / sc, h: img.height / sc, ax: -meta.ox, ay: -meta.oy, lights: meta.lights.map(([x, y]) => [x, y, 1]), anchors: meta.anchors, d3: true });
  if (key.includes('@')) {
    hiKeys.add(key);
    hiPx += img.width * img.height;
    while (hiPx > HI_BUDGET && hiKeys.size > 1) {
      const old = hiKeys.values().next().value;
      hiKeys.delete(old);
      const o = cache.get(old);
      if (o && o.cv) hiPx -= o.cv.width * o.cv.height;
      cache.delete(old);
    }
  }
  ready++;
}

// één beeld uit Cache Storage (al afgewerkt: figuren hebben hun rand al)
async function loadStored(c, key) {
  const r = await c.match(urlOf(key));
  if (!r) return false;
  const meta = JSON.parse(r.headers.get('x-meta'));
  const bmp = await createImageBitmap(await r.blob());
  finish(key, bmp, meta);
  return true;
}

async function fromStore(key) {
  if (!hasStore) return false;
  try {
    const c = await openStore();
    return c ? await loadStored(c, key) : false;
  } catch { return false; }
}

function toStore(key, cv, meta) {
  if (!hasStore) return;
  cv.toBlob(async (blob) => {
    if (!blob) return;
    try { const c = await openStore(); if (c) await c.put(urlOf(key), new Response(blob, { headers: { 'content-type': 'image/png', 'x-meta': JSON.stringify(meta) } })); } catch { /* geen plaats: niet erg */ }
  }, 'image/png');
}
// oude versies opruimen
if (hasStore) caches.keys().then((ks) => ks.filter((k) => k.startsWith('rvs-3d-') && k !== STORE).forEach((k) => caches.delete(k))).catch(() => {});

// ---------- welke beelden gebruikt het spel? (om ze de volgende keer meteen voor te laden) ----------
const USED_KEY = `rvs-3d-used-${VERSION}-${SCALE}`;
const MAX_USED = 1400;
let usedBefore = [];
try { usedBefore = JSON.parse(localStorage.getItem(USED_KEY)) || []; } catch { /* privévenster */ }
const usedNow = new Set();
let usedDirty = false;
function saveUsed() {
  if (!usedDirty) return;
  usedDirty = false;
  const list = [...usedNow];
  for (const k of usedBefore) { if (list.length >= MAX_USED) break; if (!usedNow.has(k)) list.push(k); }
  try { localStorage.setItem(USED_KEY, JSON.stringify(list.slice(0, MAX_USED))); } catch { /* vol of privévenster */ }
}
if (typeof window !== 'undefined') {
  setInterval(saveUsed, 20000);
  addEventListener('pagehide', saveUsed);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveUsed(); });
  // oude lijsten (andere versie of resolutie) opruimen
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('rvs-3d-used-') && k !== USED_KEY) localStorage.removeItem(k); } } catch { /* */ }
}

// Bij het opstarten: alles wat vorige keer gebruikt werd in één keer uit de cache halen (een paar tegelijk; het
// decoderen gebeurt buiten de hoofdthread). main.js wacht hier kort op voor het de stad toont.
async function preloadAll(keys) {
  const c = await openStore();
  if (!c) return;
  for (const k of keys) addPending(k);
  let i = 0;
  const next = async () => {
    while (i < keys.length) {
      const k = keys[i++];
      try { await loadStored(c, k); } catch { /* beschadigd: wordt opnieuw gemaakt */ }
      delPending(k);
    }
  };
  await Promise.all(Array.from({ length: 8 }, next));
}
export const preloaded = hasStore && usedBefore.length
  ? preloadAll(usedBefore.filter((k) => typeof k === 'string' && !k.includes('@'))).catch(() => {})
  : Promise.resolve();

// een paar werkers naast elkaar (gebouwen en figuren tegelijk), elk met hun eigen wachtrij
const POOL = typeof navigator !== 'undefined' ? Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)) : 1;
let workers = [];
function onMsg(e) {
  const m = e.data;
  delPending(m.id);
  if (e.target) e.target.busy = Math.max(0, (e.target.busy || 0) - 1);
  pump();
  if (m.error) { console.warn('3D-model mislukt', m.id, m.error); cache.set(m.id, false); return; }
  const meta = { ox: m.ox, oy: m.oy, lights: m.lights, anchors: m.anchors, sc: m.scale };
  // de werker maakte het beeld zelf af en bewaarde het al
  if (m.bmp) { finish(m.id, m.bmp, meta); return; }
  let cv = document.createElement('canvas');
  cv.width = m.w; cv.height = m.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.data.buffer), m.w, m.h), 0, 0);
  if (m.id.startsWith('f|')) cv = outlined(cv, m.scale);
  finish(m.id, cv, meta);
  toStore(m.id, cv, meta);
}
function ensureWorker() {
  if (workers.length || failed) return;
  try {
    for (let i = 0; i < POOL; i++) {
      const w = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = onMsg;
      w.onerror = () => { failed = true; workers = []; worker = null; };
      workers.push(w);
    }
    worker = workers[0];
  } catch {
    failed = true;
  }
}

// kunnen we 3D-gebouwen maken? (zo niet: gewone tekeningen, met hun eigen schaduw)
export const enabled = () => !failed && typeof Worker !== 'undefined';
export const has = (type) => HAS_3D.has(type) && enabled();
export const readyCount = () => ready;
// is er nog werk bezig (laden uit de cache of renderen)? Dan zegt de beeldsnelheid niets over het toestel.
// (scherpe versies bij het inzoomen tellen niet mee: die komen er tijdens het spelen voortdurend bij)
export const busy = () => basePending > 0 && enabled();

// v: variant voor gebouwen die er anders uitzien volgens de stad (Academie: welke soorten onderzoek klaar zijn)
// need = schermpixels per wereldpixel: bij inzoomen een scherpere versie (zoals bij de figuren)
export function get(type, level, civ, id = 0, v = null, need = 0) {
  if (!has(type) || level < 1) return null;
  const variant = type === 'house' ? Math.abs(id) % 3 : v || 0;
  return tiered(`${type}|${level}|${civ || ''}|${variant}`, { type, level, civ, variant }, need);
}

// Wachtrij: gebouwen en gewone figuren eerst (pri 0), scherpe figuren daarna (pri 1). Hooguit 2 opdrachten per werker
// tegelijk, zodat nieuwe dingen niet achter een lange rij scherpe beelden moeten wachten. Een scherp beeld dat al een
// tijdje niet meer gevraagd werd (weer uitgezoomd), valt uit de rij.
const queue = new Map();
function pump() {
  const now = performance.now();
  for (const w of workers) {
    while ((w.busy || 0) < 2 && queue.size) {
      let best = null;
      for (const q of queue.values()) {
        if (q.pri && now - q.t > 2500) { queue.delete(q.key); delPending(q.key); continue; }
        if (!best || q.pri < best.pri) best = q;
        if (!best.pri) break;
      }
      if (!best) return;
      queue.delete(best.key);
      w.busy = (w.busy || 0) + 1;
      w.postMessage({ id: best.key, scale: best.scale, low: LOW, store: hasStore ? STORE : null, url: urlOf(best.key), ...best.job });
    }
  }
}

function request(key, job, scale = SCALE, pri = 0) {
  if (pending.has(key)) { const q = queue.get(key); if (q) q.t = performance.now(); return; }
  ensureWorker();
  if (!worker) return;
  addPending(key);
  fromStore(key).then((hit) => {
    if (hit) { delPending(key); return; }
    queue.set(key, { key, job, scale, pri, t: performance.now() });
    pump();
  });
}

// stuk stadsmuur: anker = midden van het stuk op de grond
export function getWall(seg, level, hPx, need = 0) {
  if (!enabled()) return null;
  const dx = Math.round((seg.x1 - seg.x0) * 100) / 100; const dy = Math.round((seg.y1 - seg.y0) * 100) / 100;
  const h = Math.round((hPx / 39.19) * 100) / 100;
  return tiered(`wall|${level}|${dx}|${dy}|${h}|${seg.tower ? 1 : 0}`, { wall: { dx, dy, h, level, tower: !!seg.tower } }, need);
}

// figuur (mens of ruiter) in 3D; L = de opties van de getekende figuur, mode = idle/walk/work, f = beeld 0..7
// need = hoeveel schermpixels per wereldpixel de figuur nu krijgt (zoom x pixeldichtheid x grootte): bepaalt de resolutie
const FIG_KEYS = ['body', 'leg', 'armor', 'skin', 'helmet', 'hat', 'weapon', 'tool', 'carry', 'team', 'barb', 'look', 'horse', 'plate', 'kit'];
export function getFig(kind, o, mode, f, need = 0) {
  if (!enabled() || o.thumb) return null;
  let rest = '';
  const L = {};
  for (const k of FIG_KEYS) { const v = o[k]; if (v !== undefined && v !== null && v !== false && v !== '') { L[k] = v; rest += `|${k}=${v}`; } }
  const head = `f|${kind}|`;
  const key = head + mode + f + rest;
  const got = tiered(key, { fig: { kind, L, mode, f } }, need);
  if (got) return got;
  // nog niet klaar: een ander beeld van dezelfde figuur (eerst dezelfde beweging, dan stilstaand), zo hoeft het spel
  // de figuur niet eerst in 2D te tekenen
  for (let d = 1; d < 4; d++) {
    const a = cache.get(head + mode + ((f + d) & 7) + rest) || cache.get(head + mode + ((f + 8 - d) & 7) + rest);
    if (a) return a;
  }
  if (mode !== 'idle') return cache.get(head + 'idle0' + rest) || cache.get(head + mode + ((f + 4) & 7) + rest) || null;
  return null;
}

// de gewone versie, en bij inzoomen een scherpere (de beste die er al is, tot de gevraagde klaar is)
function tiered(key, job, need) {
  const s = cache.get(key);
  if (s === undefined) request(key, job);
  if (!usedNow.has(key)) { usedNow.add(key); usedDirty = true; }
  if (!HI.length || !(need > SCALE * 1.2) || s === false || !s) return s || null;
  // scherpere versie: de kleinste die volstaat (anders de grootste)
  const tier = HI.find((x) => x >= need * 0.85) || HI[HI.length - 1];
  const hk = `${key}@${tier}`;
  const h = cache.get(hk);
  if (h) { hiKeys.delete(hk); hiKeys.add(hk); return h; }
  if (h === false) return s;
  if (h === undefined) request(hk, job, tier, 1);
  for (let i = HI.indexOf(tier) - 1; i >= 0; i--) { const lo = cache.get(`${key}@${HI[i]}`); if (lo) return lo; }
  return s;
}

// spullen in en rond de stad (propmodels.js): lantaarn, put, tonnen, kar, rots, stronk, ...; met hun eigen slagschaduw
export function getProp(kind, v = 0, need = 0) {
  if (!enabled() || !HAS_PROP.has(kind)) return null;
  return tiered(`p|${kind}|${v}`, { prop: { kind, v } }, need);
}
