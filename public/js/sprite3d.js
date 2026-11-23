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
const VERSION = 1;
const STORE = 'rvs-3d-v' + VERSION;
const hasStore = typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext;
const urlOf = (key) => `/__3d/${VERSION}/${SCALE}/${encodeURIComponent(key)}`;

function finish(key, cv, meta) {
  cache.set(key, { cv, w: cv.width / SCALE, h: cv.height / SCALE, ax: -meta.ox, ay: -meta.oy, lights: meta.lights.map(([x, y]) => [x, y, 1]), anchors: meta.anchors, d3: true });
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

function ensureWorker() {
  if (worker || failed) return;
  try {
    worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      pending.delete(m.id);
      if (m.error) { console.warn('3D-gebouw mislukt', m.id, m.error); cache.set(m.id, false); return; }
      const cv = document.createElement('canvas');
      cv.width = m.w; cv.height = m.h;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.data.buffer), m.w, m.h), 0, 0);
      const meta = { ox: m.ox, oy: m.oy, lights: m.lights, anchors: m.anchors };
      finish(m.id, cv, meta);
      toStore(m.id, cv, meta);
    };
    worker.onerror = () => { failed = true; worker = null; };
  } catch {
    failed = true;
  }
}

// kunnen we 3D-gebouwen maken? (zo niet: gewone tekeningen, met hun eigen schaduw)
export const enabled = () => !failed && typeof Worker !== 'undefined';
export const has = (type) => HAS_3D.has(type) && enabled();
export const readyCount = () => ready;

export function get(type, level, civ, id = 0) {
  if (!has(type) || level < 1) return null;
  const variant = type === 'house' ? Math.abs(id) % 3 : 0;
  const key = `${type}|${level}|${civ || ''}|${variant}`;
  const s = cache.get(key);
  if (s) return s;
  if (s === false) return null;
  request(key, { type, level, civ, variant });
  return null;
}

function request(key, job) {
  if (pending.has(key)) return;
  ensureWorker();
  if (!worker) return;
  pending.add(key);
  fromStore(key).then((hit) => {
    if (hit) { pending.delete(key); return; }
    worker.postMessage({ id: key, scale: SCALE, low: LOW, ...job });
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
