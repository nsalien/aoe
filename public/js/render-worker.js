// Achtergrondwerker: rendert 3D-gebouwen zonder het spel te laten haperen.
import { render, ZPX } from './render3d.js';
import { build, wallScene } from './models3d.js';
import { figureScene } from './figmodels.js';
import { propScene } from './propmodels.js';

self.onmessage = (e) => {
  const { id, type, level, civ, variant, scale, wall, low, fig, prop } = e.data;
  try {
    let sc; let r;
    if (prop) { sc = propScene(prop.kind, prop.v); r = render(sc, scale, { ao: low ? 3 : 4, aa: true, fill: 0.3, ground: prop.kind === 'tree' || prop.kind === 'campfront' ? false : undefined }); } else {
      sc = fig ? figureScene(fig.kind, fig.L, fig.mode, fig.f) : wall ? wallScene(wall) : build(type, level, civ, variant);
      r = render(sc, scale, fig || wall ? { ground: false, ao: fig ? 3 : low ? 3 : 5, fill: fig ? 0.5 : 0.16, aa: !!fig } : { apron: sc.apron, ao: low ? 3 : 5 });
    }
    const anchors = {};
    for (const k of Object.keys(sc.anchors || {})) { const [x, y, z] = sc.anchors[k]; anchors[k] = [(x - y) * 32, (x + y) * 16 - z * ZPX]; }
    self.postMessage({ id, scale, w: r.w, h: r.h, ox: r.ox, oy: r.oy, data: r.data, lights: r.lights, anchors }, [r.data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
