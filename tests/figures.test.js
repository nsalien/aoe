// 3D-figuren: de olifant en de stormram bouwen en renderen in elke beweging (anders valt het spel terug op 2D)
import test from 'node:test';
import assert from 'node:assert/strict';
import { figureScene } from '../public/js/figmodels.js';
import { render } from '../public/js/render3d.js';

test('3D-figuren: olifant en stormram in elke beweging, met beelden die niet leeg zijn', () => {
  for (const kind of ['e', 'r']) {
    for (const mode of ['idle', 'walk', 'atk']) {
      for (let f = 0; f < (mode === 'idle' ? 1 : 8); f++) {
        const sc = figureScene(kind, { team: '#3f7fd9' }, mode, f);
        assert.ok(sc.prims.length > 60, `${kind} ${mode} ${f}: genoeg vormen`);
        for (const p of sc.prims) assert.ok(p.bb.every(Number.isFinite), `${kind} ${mode} ${f}: geldige vorm`);
      }
    }
    const r = render(figureScene(kind, { team: '#c0392b' }, 'walk', 3), 1, { ground: false, ao: 2, fill: 0.5 });
    let filled = 0;
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] > 0) filled++;
    assert.ok(filled > 200, `${kind}: zichtbaar beeld (${filled} pixels)`);
  }
});
