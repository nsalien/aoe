// Achtergrondwerker: rendert 3D-gebouwen zonder het spel te laten haperen.
// Waar de browser OffscreenCanvas kent, doet de werker ook de rest: de donkere rand rond figuren, het afgewerkte beeld
// (ImageBitmap, zonder kopie naar de hoofdthread) en het bewaren in Cache Storage. De hoofdthread hoeft dan niets meer
// te tekenen of te coderen. Anders stuurt hij de ruwe pixels en doet sprite3d.js het zoals vroeger.
import { render, ZPX } from './render3d.js';
import { build, wallScene, gateScene } from './models3d.js';
import { figureScene } from './figmodels.js';
import { propScene } from './propmodels.js';

const OC = typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
let canvasOk = OC;

// zachte donkere rand rond figuren (beter leesbaar op het gras); even dik bij elke resolutie (zelfde als sprite3d.js)
function outlined(cv, scale) {
  const o = new OffscreenCanvas(cv.width, cv.height);
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

let storeP = null;
const openStore = (name) => storeP || (storeP = (typeof caches !== 'undefined' ? caches.open(name) : Promise.reject(new Error('geen cache'))).catch(() => null));

self.onmessage = async (e) => {
  const { id, type, level, civ, variant, scale, wall, gate, low, fig, prop, store, url } = e.data;
  let msg;
  try {
    let sc; let r;
    if (prop) { sc = propScene(prop.kind, prop.v); r = render(sc, scale, { ao: low ? 3 : 4, aa: true, fill: 0.3, ground: prop.kind === 'tree' || prop.kind === 'campfront' ? false : undefined }); } else {
      sc = fig ? figureScene(fig.kind, fig.L, fig.mode, fig.f) : gate ? gateScene(gate) : wall ? wallScene(wall) : build(type, level, civ, variant);
      // scherpe versies (scale > 3) van gebouwen en muren krijgen ook gladde randen
      r = render(sc, scale, fig || wall || gate ? { ground: false, ao: fig ? 3 : low ? 3 : 5, fill: fig ? 0.5 : 0.16, aa: !!fig || scale > 3 } : { apron: sc.apron, ao: low ? 3 : 5, aa: scale > 3 });
    }
    const anchors = {};
    for (const k of Object.keys(sc.anchors || {})) { const a = sc.anchors[k]; if (!Array.isArray(a)) continue; const [x, y, z] = a; anchors[k] = [(x - y) * 32, (x + y) * 16 - z * ZPX]; }
    msg = { id, scale, w: r.w, h: r.h, ox: r.ox, oy: r.oy, lights: r.lights, anchors };
    if (canvasOk && r.w > 0 && r.h > 0) {
      try {
        let cv = new OffscreenCanvas(r.w, r.h);
        cv.getContext('2d').putImageData(new ImageData(r.data, r.w, r.h), 0, 0);
        if (fig) cv = outlined(cv, scale);
        const meta = { ox: r.ox, oy: r.oy, lights: r.lights, anchors, sc: scale };
        const blobP = store ? cv.convertToBlob({ type: 'image/png' }) : null; // eerst: neemt een kopie van het beeld
        const bmp = await createImageBitmap(cv);
        self.postMessage({ ...msg, bmp }, [bmp]);
        if (blobP) {
          try {
            const blob = await blobP;
            const c = await openStore(store);
            if (c) await c.put(url, new Response(blob, { headers: { 'content-type': 'image/png', 'x-meta': JSON.stringify(meta) } }));
          } catch { /* geen plaats: niet erg */ }
        }
        return;
      } catch {
        canvasOk = false; // deze browser kan het niet in een werker: verder zoals vroeger
      }
    }
    self.postMessage({ ...msg, data: r.data }, [r.data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
