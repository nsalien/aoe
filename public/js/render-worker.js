// Achtergrondwerker: rendert 3D-gebouwen zonder het spel te laten haperen.
import { render, ZPX } from './render3d.js';
import { build, wallScene } from './models3d.js';

self.onmessage = (e) => {
  const { id, type, level, civ, variant, scale, wall, low } = e.data;
  try {
    const sc = wall ? wallScene(wall) : build(type, level, civ, variant);
    const r = render(sc, scale, wall ? { ground: false, ao: low ? 3 : 5 } : { apron: sc.apron, ao: low ? 3 : 5 });
    const anchors = {};
    for (const k of Object.keys(sc.anchors || {})) { const [x, y, z] = sc.anchors[k]; anchors[k] = [(x - y) * 32, (x + y) * 16 - z * ZPX]; }
    self.postMessage({ id, w: r.w, h: r.h, ox: r.ox, oy: r.oy, data: r.data, lights: r.lights, anchors }, [r.data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
