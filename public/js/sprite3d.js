// 3D-gebouwen als afbeeldingen: worden op de achtergrond gerenderd (render-worker.js) en daarna bewaard.
// Zolang een gebouw nog niet klaar is, geeft get() null en tekent het spel de gewone (getekende) versie.
import { HAS_3D } from './models3d.js';

const SCALE = typeof window !== 'undefined' && (window.devicePixelRatio || 1) > 1.5 && window.innerWidth > 900 ? 3 : 2;
const cache = new Map();
const pending = new Set();
let worker = null;
let failed = false;
let ready = 0;
const LOW = typeof window !== 'undefined' && (window.innerWidth < 800 || (navigator.hardwareConcurrency || 8) <= 4);
// eenmaal gerenderde gebouwen bewaren in de browser (Cache Storage), zodat dat maar één keer gebeurt.
// Verhoog VERSION als de modellen of de renderer veranderen.
const VERSION = 5;
const STORE = 'rvs-3d-v' + VERSION;
const hasStore = typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext;
const urlOf = (key) => `/__3d/${VERSION}/${SCALE}/${encodeURIComponent(key)}`;

// Figuren in meerdere resoluties: eerst de gewone (SCALE), bij inzoomen een scherpere (HI). Zolang de scherpe niet
// klaar is, tekent het spel de beste die er al is. Scherpe beelden nemen veel geheugen: hooguit MAX_HI tegelijk.
const HI = [4, 6].filter((x) => x > SCALE + 0.5);
const MAX_HI = LOW ? 140 : 360;
const hiKeys = new Set();

// figuren krijgen een zachte donkere rand (beter leesbaar op het gras); even dik bij elke resolutie
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

function finish(key, cv, meta) {
  const sc = meta.sc || SCALE;
  if (key.startsWith('f|')) cv = outlined(cv, sc);
  cache.set(key, { cv, w: cv.width / sc, h: cv.height / sc, ax: -meta.ox, ay: -meta.oy, lights: meta.lights.map(([x, y]) => [x, y, 1]), anchors: meta.anchors, d3: true });
  if (key.includes('@')) {
    hiKeys.add(key);
    if (hiKeys.size > MAX_HI) { const old = hiKeys.values().next().value; hiKeys.delete(old); cache.delete(old); }
  }
  ready++;
}

async function fromStore(key) {
  if (!hasStore) return false;
  try {
    const c = await caches.open(STORE);
    const r = await c.match(urlOf(key));
    if (!r) return false;
    const meta = JSON.parse(r.headers.get('x-meta'));
    const bmp = await createImageBitmap(await r.blob());
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext('2d').drawImage(bmp, 0, 0);
    finish(key, cv, meta);
    return true;
  } catch { return false; }
}

function toStore(key, cv, meta) {
  if (!hasStore) return;
  cv.toBlob(async (blob) => {
    if (!blob) return;
    try { const c = await caches.open(STORE); await c.put(urlOf(key), new Response(blob, { headers: { 'content-type': 'image/png', 'x-meta': JSON.stringify(meta) } })); } catch { /* geen plaats: niet erg */ }
  }, 'image/png');
}
// oude versies opruimen
if (hasStore) caches.keys().then((ks) => ks.filter((k) => k.startsWith('rvs-3d-') && k !== STORE).forEach((k) => caches.delete(k))).catch(() => {});

// een paar werkers naast elkaar (gebouwen en figuren tegelijk), elk met hun eigen wachtrij
const POOL = typeof navigator !== 'undefined' ? Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)) : 1;
let workers = [];
function onMsg(e) {
  const m = e.data;
  pending.delete(m.id);
  if (e.target) e.target.busy = Math.max(0, (e.target.busy || 0) - 1);
  pump();
  if (m.error) { console.warn('3D-model mislukt', m.id, m.error); cache.set(m.id, false); return; }
  const cv = document.createElement('canvas');
  cv.width = m.w; cv.height = m.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.data.buffer), m.w, m.h), 0, 0);
  const meta = { ox: m.ox, oy: m.oy, lights: m.lights, anchors: m.anchors, sc: m.scale };
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

// v: variant voor gebouwen die er anders uitzien volgens de stad (Academie: welke soorten onderzoek klaar zijn)
export function get(type, level, civ, id = 0, v = null) {
  if (!has(type) || level < 1) return null;
  const variant = type === 'house' ? Math.abs(id) % 3 : v || 0;
  const key = `${type}|${level}|${civ || ''}|${variant}`;
  const s = cache.get(key);
  if (s) return s;
  if (s === false) return null;
  request(key, { type, level, civ, variant });
  return null;
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
        if (q.pri && now - q.t > 2500) { queue.delete(q.key); pending.delete(q.key); continue; }
        if (!best || q.pri < best.pri) best = q;
        if (!best.pri) break;
      }
      if (!best) return;
      queue.delete(best.key);
      w.busy = (w.busy || 0) + 1;
      w.postMessage({ id: best.key, scale: best.scale, low: LOW, ...best.job });
    }
  }
}

function request(key, job, scale = SCALE, pri = 0) {
  if (pending.has(key)) { const q = queue.get(key); if (q) q.t = performance.now(); return; }
  ensureWorker();
  if (!worker) return;
  pending.add(key);
  fromStore(key).then((hit) => {
    if (hit) { pending.delete(key); return; }
    queue.set(key, { key, job, scale, pri, t: performance.now() });
    pump();
  });
}

// stuk stadsmuur: anker = midden van het stuk op de grond
export function getWall(seg, level, hPx) {
  if (!enabled()) return null;
  const dx = Math.round((seg.x1 - seg.x0) * 100) / 100; const dy = Math.round((seg.y1 - seg.y0) * 100) / 100;
  const h = Math.round((hPx / 39.19) * 100) / 100;
  const key = `wall|${level}|${dx}|${dy}|${h}|${seg.tower ? 1 : 0}`;
  const s = cache.get(key);
  if (s) return s;
  if (s === false) return null;
  request(key, { wall: { dx, dy, h, level, tower: !!seg.tower } });
  return null;
}

// figuur (mens of ruiter) in 3D; L = de opties van de getekende figuur, mode = idle/walk/work, f = beeld 0..7
// need = hoeveel schermpixels per wereldpixel de figuur nu krijgt (zoom x pixeldichtheid x grootte): bepaalt de resolutie
const FIG_KEYS = ['body', 'leg', 'armor', 'skin', 'helmet', 'hat', 'weapon', 'tool', 'carry', 'team', 'barb', 'look', 'horse', 'plate', 'kit'];
export function getFig(kind, o, mode, f, need = 0) {
  if (!enabled() || o.thumb) return null;
  const L = {};
  let key = `f|${kind}|${mode}${f}`;
  for (const k of FIG_KEYS) { const v = o[k]; if (v !== undefined && v !== null && v !== false && v !== '') { L[k] = v; key += `|${k}=${v}`; } }
  const s = cache.get(key);
  if (s === undefined) request(key, { fig: { kind, L, mode, f } });
  if (!HI.length || !(need > SCALE * 1.2) || s === false) return s || null;
  // scherpere versie: de kleinste die volstaat (anders de grootste)
  const tier = HI.find((x) => x >= need * 0.85) || HI[HI.length - 1];
  const hk = `${key}@${tier}`;
  const h = cache.get(hk);
  if (h) { hiKeys.delete(hk); hiKeys.add(hk); return h; }
  if (h === undefined && s) request(hk, { fig: { kind, L, mode, f } }, tier, 1);
  for (let i = HI.indexOf(tier) - 1; i >= 0; i--) { const lo = cache.get(`${key}@${HI[i]}`); if (lo) return lo; }
  return s || null;
}
