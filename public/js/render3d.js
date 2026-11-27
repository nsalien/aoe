// Kleine 3D-renderer voor gebouwen (straalvolger), zoals vooraf gerenderde sprites in klassieke strategiespellen.
// Een gebouw is een lijst eenvoudige vormen (convexe veelvlakken, cilinders, kegels, koepels) met een materiaal.
// Per pixel: welke vorm raakt de kijkstraal, welk materiaal (procedurele textuur), hoeveel zon (slagschaduw)
// en hoeveel hemel (omgevingsschaduw). Werkt zonder DOM, zodat het ook in een Web Worker kan draaien.
//
// Ruimte: x, y in tegels (zoals in het spel), z omhoog in tegels. Op het scherm (isometrisch, 64x32 per tegel):
//   sx = (x - y) * 32,  sy = (x + y) * 16 - z * ZPX
export const ZPX = 39.19; // schermpixels per eenheid hoogte (echte dimetrische projectie, kijkhoek 30 graden)
const VX = 0.6123724; const VY = 0.6123724; const VZ = 0.5; // richting naar de kijker
const EPS = 1e-4;

// zon links op het scherm (in tegelruimte -x), schaduw valt naar rechts, zoals de schaduwen in de stad
const SL = Math.hypot(-0.62, 0.14, 0.77);
export const SUN = [-0.62 / SL, 0.14 / SL, 0.77 / SL];
const SUN_COL = [1.08, 1.0, 0.86];
const SKY_COL = [0.5, 0.58, 0.72];
const GROUND_COL = [0.34, 0.33, 0.2];

// ---------- ruis ----------
function hash(x, y, z = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  let fx = x - xi; let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s); const b = hash(xi + 1, yi, s); const c = hash(xi, yi + 1, s); const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, s = 0, o = 3) {
  let v = 0; let a = 0.5; let f = 1; let n = 0;
  for (let i = 0; i < o; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return v / n;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// ---------- vormen ----------
// Een scène is een gewoon object (te versturen naar een worker): { prims: [...], apron, lights }
export class Scene {
  constructor() { this.prims = []; this.lights = []; this.apron = null; }
  add(p, mat) { p.mat = typeof mat === 'string' ? { k: mat } : mat; this.prims.push(p); return p; }
  // convex veelvlak uit vlakken [nx, ny, nz, d] (binnen: n.p <= d)
  poly(planes, bb, mat) {
    const P = [];
    for (const [a, b, c, d] of planes) { const l = Math.hypot(a, b, c); P.push(a / l, b / l, c / l, d / l); }
    return this.add({ t: 0, P, bb }, mat);
  }
  box(x0, y0, z0, x1, y1, z1, mat) {
    return this.poly([[-1, 0, 0, -x0], [1, 0, 0, x1], [0, -1, 0, -y0], [0, 1, 0, y1], [0, 0, -1, -z0], [0, 0, 1, z1]], [x0, y0, z0, x1, y1, z1], mat);
  }
  // zadeldak met de nok langs x (along = 'x') of langs y; oh = overstek
  gable(x0, y0, x1, y1, z0, h, along, mat, oh = 0.05) {
    if (along === 'x') {
      const a = y0 - oh; const b = y1 + oh; const m = (y0 + y1) / 2; const w = m - a;
      return this.poly([[-1, 0, 0, -(x0 - oh * 0.6)], [1, 0, 0, x1 + oh * 0.6], [0, 0, -1, -z0],
        [0, h / w, 1, z0 + (h * b) / w], [0, -h / w, 1, z0 - (h * a) / w]], [x0 - oh, a, z0, x1 + oh, b, z0 + h * (b - a) / 2 / w], mat);
    }
    const a = x0 - oh; const b = x1 + oh; const m = (x0 + x1) / 2; const w = m - a;
    return this.poly([[0, -1, 0, -(y0 - oh * 0.6)], [0, 1, 0, y1 + oh * 0.6], [0, 0, -1, -z0],
      [h / w, 0, 1, z0 + (h * b) / w], [-h / w, 0, 1, z0 - (h * a) / w]], [a, y0 - oh, z0, b, y1 + oh, z0 + h], mat);
  }
  // schilddak (vier dakvlakken); bij een rechthoek krijg je een nok
  hip(x0, y0, x1, y1, z0, h, mat, oh = 0.05) {
    const a = x0 - oh; const b = x1 + oh; const c = y0 - oh; const d = y1 + oh;
    const hw = Math.min(b - a, d - c) / 2; const s = h / hw;
    return this.poly([[0, 0, -1, -z0], [s, 0, 1, z0 + s * b], [-s, 0, 1, z0 - s * a], [0, s, 1, z0 + s * d], [0, -s, 1, z0 - s * c]], [a, c, z0, b, d, z0 + h], mat);
  }
  // liggende cilinder (stam, wiel, ton) langs de x- of y-as, tussen a0 en a1
  hcyl(ax, c1, cz, r, a0, a1, mat) {
    const bb = ax === 'x' ? [a0, c1 - r, cz - r, a1, c1 + r, cz + r] : [c1 - r, a0, cz - r, c1 + r, a1, cz + r];
    return this.add({ t: 4, ax, c1, cz, r, a0, a1, bb }, mat);
  }
  // capsule (staaf met ronde uiteinden) tussen twee punten: armen, benen, speren, stelen
  cap(a, b, r, mat) {
    const bb = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
    return this.add({ t: 5, a, b, r, bb }, mat);
  }
  cyl(cx, cy, r, z0, z1, mat) { return this.add({ t: 1, cx, cy, r, z0, z1, bb: [cx - r, cy - r, z0, cx + r, cy + r, z1] }, mat); }
  cone(cx, cy, r, z0, z1, mat) { return this.add({ t: 2, cx, cy, r, z0, z1, bb: [cx - r, cy - r, z0, cx + r, cy + r, z1] }, mat); }
  // ellipsoïde; zmin knipt de onderkant af (koepel)
  ell(cx, cy, cz, rx, ry, rz, mat, zmin = -1e9) { return this.add({ t: 3, cx, cy, cz, rx, ry, rz, zmin, bb: [cx - rx, cy - ry, Math.max(zmin, cz - rz), cx + rx, cy + ry, cz + rz] }, mat); }
  // venster of deur: dun blokje tegen een muur (face: 'y' = linkervoorkant op y = c, 'x' = rechtervoorkant op x = c)
  win(face, c, a0, a1, z0, z1, mat = 'win', d = 0.012) {
    const p = face === 'y' ? this.box(a0, c - 0.004, z0, a1, c + d, z1, mat) : this.box(c - 0.004, a0, z0, c + d, a1, z1, mat);
    if (mat === 'win' || (mat && mat.k === 'win')) this.lights.push([face === 'y' ? (a0 + a1) / 2 : c, face === 'y' ? c : (a0 + a1) / 2, (z0 + z1) / 2]);
    return p;
  }
}

// ---------- stralen ----------
function hitPrim(p, ox, oy, oz, dx, dy, dz, tmax, out) {
  const bb = p.bb;
  // snelle test met de omhullende doos
  let t0 = 0; let t1 = tmax;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ox : k === 1 ? oy : oz; const d = k === 0 ? dx : k === 1 ? dy : dz;
    const lo = bb[k] - 1e-3; const hi = bb[k + 3] + 1e-3;
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return -1; } else {
      let ta = (lo - o) / d; let tb = (hi - o) / d;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
  }
  if (p.t === 0) {
    const P = p.P; let tn = -1e30; let tf = 1e30; let ni = -1;
    for (let i = 0; i < P.length; i += 4) {
      const den = P[i] * dx + P[i + 1] * dy + P[i + 2] * dz;
      const dist = P[i + 3] - (P[i] * ox + P[i + 1] * oy + P[i + 2] * oz);
      if (Math.abs(den) < 1e-12) { if (dist < 0) return -1; continue; }
      const t = dist / den;
      if (den < 0) { if (t > tn) { tn = t; ni = i; } } else if (t < tf) tf = t;
      if (tn > tf) return -1;
    }
    if (tn < EPS || tn > tmax || ni < 0) return -1;
    if (out) { out[0] = P[ni]; out[1] = P[ni + 1]; out[2] = P[ni + 2]; }
    return tn;
  }
  if (p.t === 1) { // staande cilinder met bovenvlak
    const fx = ox - p.cx; const fy = oy - p.cy;
    let best = -1;
    const a = dx * dx + dy * dy;
    if (a > 1e-12) {
      const b = 2 * (fx * dx + fy * dy); const c = fx * fx + fy * fy - p.r * p.r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        const z = oz + t * dz;
        if (t > EPS && t < tmax && z >= p.z0 && z <= p.z1) { best = t; if (out) { out[0] = (fx + t * dx) / p.r; out[1] = (fy + t * dy) / p.r; out[2] = 0; } }
      }
    }
    if (Math.abs(dz) > 1e-12) {
      const t = (p.z1 - oz) / dz;
      if (t > EPS && t < tmax && (best < 0 || t < best)) {
        const x = fx + t * dx; const y = fy + t * dy;
        if (x * x + y * y <= p.r * p.r) { best = t; if (out) { out[0] = 0; out[1] = 0; out[2] = 1; } }
      }
    }
    return best;
  }
  if (p.t === 2) { // kegel, punt boven
    const k = p.r / (p.z1 - p.z0);
    const fx = ox - p.cx; const fy = oy - p.cy; const fz = p.z1 - oz;
    const a = dx * dx + dy * dy - k * k * dz * dz;
    const b = 2 * (fx * dx + fy * dy + k * k * fz * dz);
    const c = fx * fx + fy * fy - k * k * fz * fz;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || Math.abs(a) < 1e-12) return -1;
    const sq = Math.sqrt(disc);
    for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].sort((u, v) => u - v)) {
      if (t <= EPS || t > tmax) continue;
      const z = oz + t * dz;
      if (z < p.z0 || z > p.z1) continue;
      if (out) { const x = fx + t * dx; const y = fy + t * dy; const l = Math.hypot(x, y, k * k * (p.z1 - z)) || 1; out[0] = x / l; out[1] = y / l; out[2] = (k * k * (p.z1 - z)) / l; }
      return t;
    }
    return -1;
  }
  if (p.t === 5) { // capsule (formule van Inigo Quilez)
    const dl = Math.hypot(dx, dy, dz); const rx = dx / dl; const ry = dy / dl; const rz = dz / dl;
    const [ax, ay, az] = p.a; const [bx, by, bz] = p.b;
    const bax = bx - ax; const bay = by - ay; const baz = bz - az;
    const oax = ox - ax; const oay = oy - ay; const oaz = oz - az;
    const baba = bax * bax + bay * bay + baz * baz; const bard = bax * rx + bay * ry + baz * rz; const baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = rx * oax + ry * oay + rz * oaz; const oaoa = oax * oax + oay * oay + oaz * oaz;
    const A2 = baba - bard * bard; const B2 = baba * rdoa - baoa * bard; const C2 = baba * oaoa - baoa * baoa - p.r * p.r * baba;
    let t = -1;
    const h = B2 * B2 - A2 * C2;
    if (h >= 0 && Math.abs(A2) > 1e-12) {
      t = (-B2 - Math.sqrt(h)) / A2;
      const y = baoa + t * bard;
      if (!(y > 0 && y < baba)) {
        const ocx = y <= 0 ? oax : ox - bx; const ocy = y <= 0 ? oay : oy - by; const ocz = y <= 0 ? oaz : oz - bz;
        const b2 = rx * ocx + ry * ocy + rz * ocz; const c2 = ocx * ocx + ocy * ocy + ocz * ocz - p.r * p.r;
        const h2 = b2 * b2 - c2;
        t = h2 > 0 ? -b2 - Math.sqrt(h2) : -1;
      }
    } else if (Math.abs(A2) <= 1e-12) return -1;
    if (t <= EPS) return -1;
    const td = t / dl; // terug naar de schaal van de oorspronkelijke richting
    if (td > tmax) return -1;
    if (out) {
      const px = ox + rx * t - ax; const py = oy + ry * t - ay; const pz = oz + rz * t - az;
      const k = Math.max(0, Math.min(1, (px * bax + py * bay + pz * baz) / baba));
      const nx = px - bax * k; const ny = py - bay * k; const nz = pz - baz * k; const l = Math.hypot(nx, ny, nz) || 1;
      out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    }
    return td;
  }
  if (p.t === 4) { // liggende cilinder: assen omwisselen zodat de as langs 'a' ligt
    const X = p.ax === 'x';
    const oa = X ? ox : oy; const da = X ? dx : dy; const ob = X ? oy : ox; const db = X ? dy : dx;
    const fb = ob - p.c1; const fz = oz - p.cz;
    let best = -1; let n0 = 0; let n1 = 0; let n2 = 0;
    const a = db * db + dz * dz;
    if (a > 1e-12) {
      const b = 2 * (fb * db + fz * dz); const c = fb * fb + fz * fz - p.r * p.r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a); const aa = oa + t * da;
        if (t > EPS && t < tmax && aa >= p.a0 && aa <= p.a1) { best = t; const nb = (fb + t * db) / p.r; n2 = (fz + t * dz) / p.r; if (X) { n0 = 0; n1 = nb; } else { n0 = nb; n1 = 0; } }
      }
    }
    if (Math.abs(da) > 1e-12) {
      for (const cap of [p.a0, p.a1]) {
        const t = (cap - oa) / da;
        if (t > EPS && t < tmax && (best < 0 || t < best)) {
          const bq = fb + t * db; const zq = fz + t * dz;
          if (bq * bq + zq * zq <= p.r * p.r) { best = t; const sg = cap === p.a1 ? 1 : -1; if (X) { n0 = sg; n1 = 0; } else { n0 = 0; n1 = sg; } n2 = 0; }
        }
      }
    }
    if (best > 0 && out) { out[0] = n0; out[1] = n1; out[2] = n2; }
    return best;
  }
  // ellipsoïde
  const fx = (ox - p.cx) / p.rx; const fy = (oy - p.cy) / p.ry; const fz = (oz - p.cz) / p.rz;
  const ex = dx / p.rx; const ey = dy / p.ry; const ez = dz / p.rz;
  const a = ex * ex + ey * ey + ez * ez; const b = 2 * (fx * ex + fy * ey + fz * ez); const c = fx * fx + fy * fy + fz * fz - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= EPS || t > tmax) return -1;
  const z = oz + t * dz;
  if (z < p.zmin) return -1;
  if (out) {
    const nx = (fx + t * ex) / p.rx; const ny = (fy + t * ey) / p.ry; const nz = (fz + t * ez) / p.rz;
    const l = Math.hypot(nx, ny, nz) || 1; out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  }
  return t;
}

let lastHit = null;
const tmpN = [0, 0, 0];
function nearest(prims, ox, oy, oz, dx, dy, dz, tmax, nrm) {
  let best = tmax; let hit = null;
  for (let i = 0; i < prims.length; i++) {
    const t = hitPrim(prims[i], ox, oy, oz, dx, dy, dz, best, tmpN);
    if (t > 0 && t < best) { best = t; hit = prims[i]; nrm[0] = tmpN[0]; nrm[1] = tmpN[1]; nrm[2] = tmpN[2]; }
  }
  lastHit = hit;
  return hit ? best : -1;
}
function blocked(prims, ox, oy, oz, dx, dy, dz, tmax) {
  for (let i = 0; i < prims.length; i++) if (hitPrim(prims[i], ox, oy, oz, dx, dy, dz, tmax, null) > 0) return true;
  return false;
}

// kijkstraal naar beneden op schermpunt sx: enkel vormen uit de rij waarvan het schermvak sx bevat
function nearestAt(row, sb, sx, ox, oy, oz, nrm) {
  let best = 1e9; let hit = null;
  for (let i = 0; i < row.length; i++) {
    const p = row[i]; const b = sb[p.id];
    if (sx < b[0] || sx > b[2]) continue;
    const t = hitPrim(p, ox, oy, oz, -VX, -VY, -VZ, best, tmpN);
    if (t > 0 && t < best) { best = t; hit = p; nrm[0] = tmpN[0]; nrm[1] = tmpN[1]; nrm[2] = tmpN[2]; }
  }
  lastHit = hit;
  return hit ? best : -1;
}

// lijsten per vorm: wie kan er zon wegnemen (in de richting van de zon, overlappend gezien vanuit de zon) en wie ligt
// binnen het bereik van de korte straaltjes voor omgevingsschaduw
function buildAccel(prims, proj) {
  const n = prims.length;
  const corners = (b) => { const c = []; for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) c.push([x, y, z]); return c; };
  // twee richtingen loodrecht op de zon
  let e1 = [SUN[1], -SUN[0], 0]; const l1 = Math.hypot(e1[0], e1[1]) || 1; e1 = [e1[0] / l1, e1[1] / l1, 0];
  const e2 = [SUN[1] * e1[2] - SUN[2] * e1[1], SUN[2] * e1[0] - SUN[0] * e1[2], SUN[0] * e1[1] - SUN[1] * e1[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sb = []; const ps = [];
  for (const p of prims) {
    const cs = corners(p.bb);
    let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity; let s0 = Infinity; let s1 = -Infinity;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (const c of cs) {
      const u = dot(c, e1); const v = dot(c, e2); const w = dot(c, SUN);
      a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); s0 = Math.min(s0, w); s1 = Math.max(s1, w);
      const [sx, sy] = proj(c[0], c[1], c[2]);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    sb.push([x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01]);
    ps.push([a0, a1, b0, b1, s0, s1]);
  }
  const E = 0.01; const R = 0.24;
  const sh = []; const ao = [];
  for (let i = 0; i < n; i++) {
    const P = ps[i]; const B = prims[i].bb;
    const s = []; const o = [];
    for (let k = 0; k < n; k++) {
      const Q = ps[k]; const C = prims[k].bb;
      if (Q[1] >= P[0] - E && Q[0] <= P[1] + E && Q[3] >= P[2] - E && Q[2] <= P[3] + E && Q[5] >= P[4] - E) s.push(prims[k]);
      if (C[3] >= B[0] - R && C[0] <= B[3] + R && C[4] >= B[1] - R && C[1] <= B[4] + R && C[5] >= B[2] - R && C[2] <= B[5] + R) o.push(prims[k]);
    }
    sh.push(s); ao.push(o);
  }
  return { sb, sh, ao };
}

// ---------- materialen ----------
// Elk materiaal zet een kleur (alb) en mag de normaal licht verbuigen (voor reliëf: voegen, pannen, balken).
const alb = [0, 0, 0];
const MAT = {
  stone(m, p, n, u, v) {
    const base = m.c || [0.74, 0.7, 0.63];
    const rowH = m.row || 0.075; const row = Math.floor(v / rowH); const fv = v / rowH - row;
    const bw = (m.bw || 0.14) * (0.8 + 0.4 * hash(row, 3, 9));
    const uu = u / bw + hash(row, 7, 1) * 3; const col = Math.floor(uu); const fu = uu - col;
    const eu = Math.min(fu, 1 - fu) * bw; const ev = Math.min(fv, 1 - fv) * rowH;
    const mort = 0.0055;
    if (eu < mort || ev < mort) { const k = 0.55; alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k; return 0.75; }
    let k = 0.82 + 0.3 * hash(col, row, 5);
    k *= 0.9 + 0.2 * fbm(u * 30, v * 30, 3, 2);
    if (fv > 1 - 0.18 && ev < 0.014) k *= 1.12; // lichte bovenrand
    if (fv < 0.2 && ev < 0.012) k *= 0.82; // schaduw onderaan het blok
    const t = hash(col, row, 8);
    alb[0] = base[0] * k * (0.97 + t * 0.06); alb[1] = base[1] * k; alb[2] = base[2] * k * (1.03 - t * 0.06);
    if (p[2] < 0.12 && fbm(u * 10, v * 10, 4) > 0.55) { alb[0] *= 0.8; alb[1] *= 0.9; alb[2] *= 0.7; } // mos onderaan
    return 1;
  },
  plaster(m, p, n, u, v) {
    const base = m.c || [0.92, 0.86, 0.72];
    let k = 0.9 + 0.14 * fbm(u * 7, v * 7, 11, 3) + (hash(Math.floor(u * 300), Math.floor(v * 300), 2) - 0.5) * 0.05;
    k *= 0.8 + 0.2 * sstep(0, 0.22, p[2] - (m.z0 || 0)); // vuil onderaan
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    if (m.grid && Math.abs(n[2]) < 0.3) { // houten roosters (shoji)
      const fu = ((u % 0.055) + 0.055) % 0.055; const zl = p[2] - (m.z0 || 0);
      if (fu < 0.008 || zl % 0.07 < 0.008) { alb[0] = 0.2; alb[1] = 0.14; alb[2] = 0.1; return 0.9; }
    }
    if (m.timber && Math.abs(n[2]) < 0.3) {
      const W = m.tw || 0.03;
      const sp = m.ts || 0.21;
      const fu = ((u % sp) + sp) % sp;
      const zl = p[2] - (m.z0 || 0); const zh = (m.z1 || 1) - (m.z0 || 0);
      let beam = fu < W || zl < W || zh - zl < W * 1.2 || Math.abs(zl - zh * 0.5) < W * 0.5;
      // schuine schoren in de vakken
      const pu = Math.floor(u / sp); const lu = fu / sp;
      if (!beam && hash(pu, 2, 77) < 0.5 && zl < zh * 0.5) { const diag = Math.abs(lu - zl / (zh * 0.5)); beam = diag * sp < W * 0.7; }
      if (beam) {
        const g = 0.85 + 0.3 * vnoise(u * 60, v * 9, 4);
        alb[0] = 0.27 * g; alb[1] = 0.17 * g; alb[2] = 0.09 * g;
        return 0.9;
      }
    }
    return 1;
  },
  wood(m, p, n, u, v) { // staande planken
    const base = m.c || [0.55, 0.37, 0.2];
    const bw = m.bw || 0.045; const b = Math.floor(u / bw); const fu = u / bw - b;
    let k = 0.85 + 0.3 * hash(b, 1, 21);
    k *= 0.85 + 0.3 * vnoise(u * 40, v * 6 + b * 3, 5);
    if (fu < 0.09 || fu > 0.95) k *= 0.45;
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  logs(m, p, n, u, v) { // liggende stammen
    const base = m.c || [0.5, 0.33, 0.18];
    const lh = m.lh || 0.06; const r = Math.floor(v / lh); const fv = v / lh - r;
    let k = 0.55 + 0.55 * Math.sin(fv * Math.PI);
    k *= 0.85 + 0.25 * vnoise(u * 12, r * 5, 6);
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  tiles(m, p, n, u, v) { // dakpannen
    const base = m.c || [0.66, 0.3, 0.18];
    const rh = m.rh || 0.045; const r = Math.floor(v / rh); const fv = v / rh - r;
    const tw = m.tw || 0.042; const uu = u / tw + (r % 2) * 0.5; const c = Math.floor(uu); const fu = uu - c;
    let k = 0.62 + 0.5 * Math.sin(fu * Math.PI); // bolle pan
    if (fv < 0.25) k *= 0.55 + fv * 1.8; // overlap: schaduw van de rij erboven
    k *= 0.85 + 0.3 * hash(c, r, 13);
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    if (fbm(u * 6, v * 6, 14) > 0.62) { alb[0] = alb[0] * 0.6 + 0.08; alb[1] = alb[1] * 0.6 + 0.14; alb[2] = alb[2] * 0.6 + 0.04; } // mos
    return 1;
  },
  slate(m, p, n, u, v) {
    const base = m.c || [0.36, 0.39, 0.45];
    const rh = m.rh || 0.04; const r = Math.floor(v / rh); const fv = v / rh - r;
    const tw = 0.05; const uu = u / tw + (r % 2) * 0.5; const c = Math.floor(uu); const fu = uu - c;
    let k = 0.85 + 0.25 * hash(c, r, 15);
    if (fv < 0.2) k *= 0.6 + fv * 2;
    if (fu < 0.06) k *= 0.7;
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  thatch(m, p, n, u, v) {
    const base = m.c || [0.78, 0.62, 0.3];
    const rh = 0.09; const r = Math.floor(v / rh); const fv = v / rh - r;
    let k = 0.7 + 0.45 * vnoise(u * 140, v * 5 + r * 2.3, 16);
    k *= 0.85 + 0.2 * fbm(u * 6, v * 6, 17);
    if (fv < 0.22) k *= 0.6 + fv * 1.8;
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  cloth(m, p, n, u, v) {
    const s = m.c2 && Math.floor((m.vert ? v : u) / (m.sw || 0.06)) % 2;
    const base = s ? m.c2 : m.c || [0.7, 0.2, 0.15];
    const k = 0.9 + 0.15 * fbm(u * 20, v * 20, 18);
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  rock(m, p, n, u, v) {
    const base = m.c || [0.55, 0.53, 0.5];
    // ruw oppervlak: de normaal kantelen volgens ruis (facetten en barsten)
    const f = 7; const e = 0.02;
    const h0 = fbm(p[0] * f + p[2] * 3, p[1] * f - p[2] * 3, 19, 3);
    const hx = fbm((p[0] + e) * f + p[2] * 3, p[1] * f - p[2] * 3, 19, 3);
    const hy = fbm(p[0] * f + p[2] * 3, (p[1] + e) * f - p[2] * 3, 19, 3);
    n[0] -= (hx - h0) * 22; n[1] -= (hy - h0) * 22;
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l;
    let k = 0.72 + 0.4 * h0;
    if (vnoise(p[0] * 25 + p[2] * 9, p[1] * 25, 20) > 0.82) k *= 0.62;
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  dirt(m, p, n, u, v) {
    const base = m.c || [0.5, 0.41, 0.28];
    let k = 0.82 + 0.3 * fbm(p[0] * 14, p[1] * 14, 21, 3);
    if (hash(Math.floor(p[0] * 90), Math.floor(p[1] * 90), 22) > 0.96) k *= 1.3;
    alb[0] = base[0] * k; alb[1] = base[1] * k; alb[2] = base[2] * k;
    return 1;
  },
  plain(m) { const c = m.c || [0.6, 0.6, 0.6]; alb[0] = c[0]; alb[1] = c[1]; alb[2] = c[2]; return m.shiny ? 2 : 1; },
  // maliënkolder: rijen kleine ringetjes (verspringend), glanzend
  mail(m, p, n, u, v) {
    const c = m.c || [0.62, 0.65, 0.7];
    const f = 130; const rv = v * f * 1.25; const row = Math.floor(rv); const ru = u * f + (row % 2) * 0.5;
    const du = ru - Math.floor(ru) - 0.5; const dv = rv - row - 0.5;
    const d = Math.sqrt(du * du + dv * dv);
    const ring = 1 - Math.min(1, Math.abs(d - 0.32) * 5);
    const k = 0.55 + 0.55 * ring;
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k;
    return 2;
  },
  // bladeren: kleine vlekjes licht en donker (struiken, fruitbomen)
  leaf(m, p, n, u, v) {
    const c = m.c || [0.3, 0.55, 0.2];
    const k = 0.62 + 0.5 * vnoise(p[0] * 160 + p[2] * 40, p[1] * 160 - p[2] * 40, 61) + 0.18 * vnoise(p[0] * 40, p[1] * 40 + p[2] * 30, 62);
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k * 0.95;
    return 1;
  },
  // boomstam: schors met groeven in de lengte, op de zaagkant licht hout met jaarringen (prim = liggende/staande cilinder)
  bark(m, p, n, u, v, prim) {
    const c = m.c || [0.36, 0.24, 0.14];
    let axial = 0; let rr = 0;
    if (prim && prim.t === 4) { axial = prim.ax === 'x' ? Math.abs(n[0]) : Math.abs(n[1]); const a = prim.ax === 'x' ? p[1] - prim.c1 : p[0] - prim.c1; const b = p[2] - prim.cz; rr = Math.sqrt(a * a + b * b) / prim.r; }
    else if (prim && prim.t === 1) { axial = Math.abs(n[2]); const a = p[0] - prim.cx; const b = p[1] - prim.cy; rr = Math.sqrt(a * a + b * b) / prim.r; }
    if (axial > 0.9) { // zaagkant
      const ring = 0.5 + 0.5 * Math.sin(rr * 26 + vnoise(p[0] * 30, p[1] * 30 + p[2] * 30, 63) * 2);
      const edge = rr > 0.86 ? 0.55 : 1;
      const k = (0.85 + 0.12 * ring) * edge;
      alb[0] = 0.84 * k; alb[1] = 0.66 * k; alb[2] = 0.42 * k;
      return 1;
    }
    let along = p[2]; let ang;
    if (prim && prim.t === 4) { along = prim.ax === 'x' ? p[0] : p[1]; ang = Math.atan2(p[2] - prim.cz, prim.ax === 'x' ? p[1] - prim.c1 : p[0] - prim.c1); }
    else if (prim && prim.t === 5) ang = Math.atan2(p[1] - prim.a[1], p[0] - prim.a[0]);
    else ang = Math.atan2(p[1] - (prim && prim.cy !== undefined ? prim.cy : 0), p[0] - (prim && prim.cx !== undefined ? prim.cx : 0));
    const k = 0.7 + 0.3 * vnoise(ang * 9, along * 14, 64) + 0.12 * vnoise(ang * 30, along * 60, 65);
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k;
    return 1;
  },
  // water: donkerblauw met een lichte rimpeling, glanzend
  water(m, p) {
    const c = m.c || [0.13, 0.28, 0.38];
    const k = 0.85 + 0.3 * vnoise(p[0] * 50 + p[1] * 20, p[1] * 50, 66);
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k;
    return 2;
  },
  // leer: warme kleur met vlekjes en fijne nerf
  leather(m, p, n, u, v) {
    const c = m.c || [0.42, 0.27, 0.15];
    const k = 0.8 + 0.25 * fbm(u * 70, v * 70, 52) + 0.06 * vnoise(u * 300, v * 40, 53);
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k;
    return 1;
  },
  brick(m, p, n, u, v) { // leemstenen: kleine blokjes, warm van kleur
    return MAT.stone({ c: m.c || [0.74, 0.58, 0.4], row: 0.045, bw: 0.09 }, p, n, u, v);
  },
  glaze(m, p, n, u, v) { // geglazuurde tegels (koepels)
    const c = m.c || [0.16, 0.62, 0.62];
    const a = Math.atan2(p[1] - (m.cy || 0), p[0] - (m.cx || 0));
    const rib = Math.abs(Math.sin(a * (m.ribs || 8)));
    let k = 0.85 + 0.2 * vnoise(a * 20, p[2] * 40, 41);
    if (rib > 0.96) k *= 1.25;
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k;
    return 2;
  },
  gold(m, p, n, u, v) { const c = m.c || [0.95, 0.72, 0.2]; const k = 0.8 + 0.3 * vnoise(u * 40, v * 40, 42); alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k; return 2; },
  hay(m, p, n, u, v) {
    const c = m.c || [0.86, 0.7, 0.32];
    const k = 0.7 + 0.45 * vnoise(u * 90 + p[2] * 20, v * 30, 43) * (0.8 + 0.2 * vnoise(p[0] * 30, p[1] * 30, 44));
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k; return 1;
  },
  target(m, p, n) { // schietschijf: ringen
    const d = Math.hypot(p[1] - (m.cy || 0), p[2] - (m.cz || 0)) / (m.r || 0.1);
    const ring = Math.floor(d * 5);
    const c = ring >= 4 ? [0.85, 0.8, 0.65] : ring % 2 ? [0.95, 0.93, 0.85] : [0.78, 0.15, 0.12];
    if (Math.abs(n[0]) < 0.5) { alb[0] = 0.75; alb[1] = 0.6; alb[2] = 0.35; return 1; }
    alb[0] = c[0]; alb[1] = c[1]; alb[2] = c[2]; return 1;
  },
  metal(m, p, n, u, v) { const c = m.c || [0.55, 0.57, 0.6]; const k = 0.85 + 0.2 * vnoise(u * 30, v * 30, 23); alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k; return 1; },
  // venster: houten kozijn, donker glas met weerspiegeling en een kruis
  win(m, p, n, u, v, prim) {
    const bb = prim.bb;
    const along = Math.abs(n[1]) > Math.abs(n[0]);
    if (Math.abs(n[2]) > 0.5 || (along ? Math.abs(n[1]) < 0.5 : Math.abs(n[0]) < 0.5)) { alb[0] = 0.42; alb[1] = 0.3; alb[2] = 0.18; return 1; }
    const fu = along ? (p[0] - bb[0]) / (bb[3] - bb[0]) : (p[1] - bb[1]) / (bb[4] - bb[1]);
    const fz = (p[2] - bb[2]) / (bb[5] - bb[2]);
    const fr = 0.16;
    if (fu < fr || fu > 1 - fr || fz < fr * 0.8 || fz > 1 - fr * 0.8 || Math.abs(fu - 0.5) < 0.05 || Math.abs(fz - 0.55) < 0.04) {
      const c = m.frame || [0.48, 0.34, 0.2]; alb[0] = c[0]; alb[1] = c[1]; alb[2] = c[2]; return 1;
    }
    const g = 0.1 + 0.16 * clamp01(1 - fz + (fu - 0.5) * 0.6);
    alb[0] = g * 0.8; alb[1] = g * 0.9; alb[2] = g * 1.1;
    return 2; // glas: wat glans
  },
  door(m, p, n, u, v, prim) {
    const bb = prim.bb;
    const along = Math.abs(n[1]) > Math.abs(n[0]);
    const fu = along ? (p[0] - bb[0]) / (bb[3] - bb[0]) : (p[1] - bb[1]) / (bb[4] - bb[1]);
    const fz = (p[2] - bb[2]) / (bb[5] - bb[2]);
    const c = m.c || [0.4, 0.25, 0.13];
    let k = 0.85 + 0.25 * vnoise(fu * 40, fz * 4, 24);
    if ((fu * 4) % 1 < 0.08) k *= 0.55;
    if (Math.abs(fz - 0.25) < 0.04 || Math.abs(fz - 0.75) < 0.04) { alb[0] = 0.2; alb[1] = 0.19; alb[2] = 0.18; return 1; }
    alb[0] = c[0] * k; alb[1] = c[1] * k; alb[2] = c[2] * k;
    return 1;
  },
};

// ---------- weergeven ----------
// Geeft { w, h, ax, ay, data (RGBA), lights } terug. scale = pixels per wereldpixel.
// opts.apron: straal van de aangestampte aarde rond het gebouw (tegels), opts.size: grootte van de voet in tegels.
export function render(scene, scale = 2, opts = {}) {
  const prims = scene.prims;
  // schermvak bepalen uit alle omhullende dozen (+ ruimte voor de schaduw rechts)
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let zTop = 0;
  const proj = (x, y, z) => [(x - y) * 32, (x + y) * 16 - z * ZPX];
  for (const p of prims) {
    const b = p.bb;
    zTop = Math.max(zTop, b[5]);
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
      const [sx, sy] = proj(x, y, z); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
  }
  // Versnelling (exact, zelfde beeld): per vorm de vormen die er schaduw op kunnen werpen (sh) of dichtbij liggen (ao),
  // en per vorm het vak op het scherm (sb) zodat een kijkstraal enkel de vormen op zijn pixel test.
  for (let k = 0; k < prims.length; k++) prims[k].id = k;
  const accel = buildAccel(prims, proj);
  const ap = opts.apron || 0;
  if (ap) for (const [x, y] of [[-ap, -ap], [ap, -ap], [-ap, ap], [ap, ap]]) { const [sx, sy] = proj(x, y, 0); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  if (opts.ground !== false) { x1 += zTop * 40 + 6; y1 += zTop * 8 + 4; } // slagschaduw
  x0 = Math.floor(x0 - 3); y0 = Math.floor(y0 - 3); x1 = Math.ceil(x1 + 3); y1 = Math.ceil(y1 + 3);
  const W = Math.ceil((x1 - x0) * scale); const H = Math.ceil((y1 - y0) * scale);
  const data = new Uint8ClampedArray(W * H * 4);
  const ZT = zTop + 0.5;
  const nrm = [0, 0, 0]; const pt = [0, 0, 0];
  const AO_N = opts.ao === undefined ? 5 : opts.ao;
  const FILL = opts.fill === undefined ? 0.16 : opts.fill;
  const dirs = [];
  for (let k = 0; k < AO_N; k++) { const a = (k / AO_N) * Math.PI * 2 + 0.4; dirs.push([Math.cos(a), Math.sin(a)]); }
  const shade = (px, py, pz, n, mat, prim, out) => {
    // textuurcoördinaten op het vlak
    let u; let v;
    if (Math.abs(n[2]) > 0.94) { u = px + py * 0.37; v = py - px * 0.37; }
    else {
      let tx = n[1]; let ty = -n[0]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      u = px * tx + py * ty;
      if (Math.abs(n[2]) < 0.25) v = pz;
      else { // dakvlak: afstand langs de helling
        const bx = n[1] * 0 - n[2] * ty; const by = n[2] * tx; const bz = n[0] * ty - n[1] * tx;
        v = px * bx + py * by + pz * bz; v = -v;
      }
    }
    pt[0] = px; pt[1] = py; pt[2] = pz;
    const fn = MAT[mat.k] || MAT.plain;
    const kind = fn(mat, pt, n, u, v, prim);
    // zon
    const dl = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
    let sun = 0;
    if (dl > 0) sun = blocked(prim ? accel.sh[prim.id] : prims, px + n[0] * 0.002, py + n[1] * 0.002, pz + n[2] * 0.002, SUN[0], SUN[1], SUN[2], 20) ? 0 : dl;
    // hemel en omgevingsschaduw: korte straaltjes rond de normaal
    let ao = 1;
    if (AO_N) {
      let occ = 0;
      // raaklijnen
      let ax = Math.abs(n[2]) < 0.9 ? 0 : 1; let ay = 0; let az = Math.abs(n[2]) < 0.9 ? 1 : 0;
      let tx = ay * n[2] - az * n[1]; let ty = az * n[0] - ax * n[2]; let tz = ax * n[1] - ay * n[0];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const bx = n[1] * tz - n[2] * ty; const by = n[2] * tx - n[0] * tz; const bz = n[0] * ty - n[1] * tx;
      for (const [ca, sa] of dirs) {
        const dx = n[0] * 0.75 + (tx * ca + bx * sa) * 0.66; const dy = n[1] * 0.75 + (ty * ca + by * sa) * 0.66; const dz = n[2] * 0.75 + (tz * ca + bz * sa) * 0.66;
        const ox = px + n[0] * 0.003; const oy = py + n[1] * 0.003; const oz = pz + n[2] * 0.003;
        if ((dz < 0 && oz + dz * 0.22 < 0) || blocked(prim ? accel.ao[prim.id] : prims, ox, oy, oz, dx, dy, dz, 0.22)) occ++;
      }
      ao = 1 - (occ / AO_N) * 0.75;
    }
    if (pz < 0.08) ao *= 0.7 + 0.3 * (pz / 0.08);
    const sky = 0.55 + 0.45 * n[2];
    const bounce = (1 - n[2]) * 0.5;
    // zacht invullicht vanuit de kijker, zodat de kant naar de speler niet te donker wordt
    const fill = FILL * Math.max(0, n[0] * VX + n[1] * VY + n[2] * VZ) * ao;
    for (let c = 0; c < 3; c++) {
      out[c] = alb[c] * (SUN_COL[c] * sun * 1.05 + (SKY_COL[c] * sky + GROUND_COL[c] * bounce) * ao + fill);
    }
    if (kind === 2) { // glans van glas
      const hx = SUN[0] + VX; const hy = SUN[1] + VY; const hz = SUN[2] + VZ; const hl = Math.hypot(hx, hy, hz);
      const sp = Math.pow(clamp01((n[0] * hx + n[1] * hy + n[2] * hz) / hl), 30) * 0.6;
      out[0] += sp; out[1] += sp; out[2] += sp;
    }
    return sun;
  };
  const col = [0, 0, 0];
  // de grond (z = 0) onder een kijkstraal: aarde rond het gebouw en de slagschaduw; out = [r, g, b, a] (0..255)
  const GR = [0, 0, 0, 0];
  const ground = (ox, oy, oz, out) => {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    const tg = oz / VZ;
    const gx = ox - VX * tg; const gy = oy - VY * tg;
    const inShadow = blocked(prims, gx, gy, 0.001, SUN[0], SUN[1], SUN[2], 20);
    let aoG = 0;
    for (const [ca, sa] of dirs) if (blocked(prims, gx, gy, 0.003, ca * 0.6, sa * 0.6, 0.8, 0.3)) aoG++;
    aoG = AO_N ? aoG / AO_N : 0;
    let a = 0;
    if (ap) {
      const d = Math.max(Math.abs(gx), Math.abs(gy));
      const edge = ap * (0.9 + 0.2 * fbm(gx * 4, gy * 4, 31, 2));
      a = 1 - sstep(edge - 0.1, edge, d);
    }
    if (a > 0.01) {
      shade(gx, gy, 0, [0, 0, 1], apronMat, null, col);
      const sh = inShadow ? 0.55 : 1;
      const k = (1 - aoG * 0.5);
      const f = (c) => tone(c);
      out[0] = f(col[0] * (inShadow ? sh : 1) * k); out[1] = f(col[1] * (inShadow ? sh : 1) * k); out[2] = f(col[2] * (inShadow ? sh * 1.05 : 1) * k);
      out[3] = Math.round(a * 255);
      if (inShadow) { out[0] = f(col[0] * 0.5 * k); out[1] = f(col[1] * 0.52 * k); out[2] = f(col[2] * 0.6 * k); }
    } else {
      const s = (inShadow ? 0.42 : 0) + aoG * 0.3;
      if (s > 0.01) { out[0] = 18; out[1] = 24; out[2] = 10; out[3] = Math.round(Math.min(0.6, s) * 255); }
    }
  };
  // anti-aliasing (figuren en spullen): per pixel onthouden welke vorm geraakt werd (-1 = niets, -2 = schaduw op de grond);
  // waar buren verschillen, daarna 4 extra stralen per pixel en het gemiddelde nemen (gladde randen, ook vergroot)
  const ids = opts.aa ? new Int32Array(W * H).fill(-1) : null;
  // per pixelrij: de vormen waarvan het schermvak die rij raakt
  const rowList = (j) => { const ya = y0 + j / scale; const yb = y0 + (j + 1) / scale; return prims.filter((p) => accel.sb[p.id][1] <= yb && accel.sb[p.id][3] >= ya); };
  const apronMat = { k: 'dirt', c: opts.apronC || [0.52, 0.43, 0.3] };
  for (let j = 0; j < H; j++) {
    const sy = y0 + (j + 0.5) / scale;
    const row = rowList(j);
    for (let i = 0; i < W; i++) {
      const sx = x0 + (i + 0.5) / scale;
      // punt op hoogte ZT dat op deze pixel valt, dan langs de kijkrichting naar beneden
      const dxy = sx / 32; const sxy = (sy + ZT * ZPX) / 16;
      const ox = (sxy + dxy) / 2; const oy = (sxy - dxy) / 2; const oz = ZT;
      const t = nearestAt(row, accel.sb, sx, ox, oy, oz, nrm);
      const o = (j * W + i) * 4;
      if (t > 0) {
        const hit = lastHit;
        if (ids) ids[j * W + i] = hit.id;
        let n0 = nrm[0]; let n1 = nrm[1]; let n2 = nrm[2];
        if (n0 * VX + n1 * VY + n2 * VZ < 0) { n0 = -n0; n1 = -n1; n2 = -n2; }
        const px = ox - VX * t; const py = oy - VY * t; const pz = oz - VZ * t;
        const mat = hit.mat.side && Math.abs(n2) < 0.2 ? hit.mat.side : hit.mat;
        shade(px, py, pz, [n0, n1, n2], mat, hit, col);
        data[o] = tone(col[0]); data[o + 1] = tone(col[1]); data[o + 2] = tone(col[2]); data[o + 3] = 255;
      } else if (opts.ground === false) {
        // geen grond: blijft doorzichtig (de schaduw tekent het spel zelf)
      } else {
        ground(ox, oy, oz, GR);
        if (GR[3]) { data[o] = GR[0]; data[o + 1] = GR[1]; data[o + 2] = GR[2]; data[o + 3] = GR[3]; }
        if (ids) ids[j * W + i] = GR[3] ? -2 : -1;
      }
    }
  }
  if (ids) {
    const SUB = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
    const edge = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i; const id = ids[k];
        if ((i > 0 && ids[k - 1] !== id) || (i < W - 1 && ids[k + 1] !== id) || (j > 0 && ids[k - W] !== id) || (j < H - 1 && ids[k + W] !== id)) edge[k] = 1;
      }
    }
    let rj = -1; let row = null;
    const base = data.slice(); // kleuren van de eerste ronde: een extra straal op dezelfde vorm als een buur hergebruikt die
    for (let k = 0; k < W * H; k++) {
      if (!edge[k]) continue;
      const i = k % W; const j = (k - i) / W;
      if (j !== rj) { rj = j; row = rowList(j); }
      let r = 0; let g = 0; let b = 0; let n = 0;
      const GS = opts.ground !== false;
      for (const [du, dv] of SUB) {
        const sx = x0 + (i + 0.5 + du) / scale; const sy = y0 + (j + 0.5 + dv) / scale;
        const dxy = sx / 32; const sxy = (sy + ZT * ZPX) / 16;
        const ox = (sxy + dxy) / 2; const oy = (sxy - dxy) / 2; const oz = ZT;
        const t = nearestAt(row, accel.sb, sx, ox, oy, oz, nrm);
        if (!(t > 0)) {
          if (!GS) continue;
          ground(ox, oy, oz, GR);
          const w = GR[3] / 255;
          r += GR[0] * w; g += GR[1] * w; b += GR[2] * w; n += w;
          continue;
        }
        const hit = lastHit;
        n++;
        let src = ids[k] === hit.id ? k : -1;
        if (src < 0) for (const q of [k - 1, k + 1, k - W, k + W]) if (q >= 0 && q < W * H && ids[q] === hit.id && Math.abs((q % W) - i) <= 1) { src = q; break; }
        if (src >= 0) { r += base[src * 4]; g += base[src * 4 + 1]; b += base[src * 4 + 2]; continue; }
        let n0 = nrm[0]; let n1 = nrm[1]; let n2 = nrm[2];
        if (n0 * VX + n1 * VY + n2 * VZ < 0) { n0 = -n0; n1 = -n1; n2 = -n2; }
        const mat = hit.mat.side && Math.abs(n2) < 0.2 ? hit.mat.side : hit.mat;
        shade(ox - VX * t, oy - VY * t, oz - VZ * t, [n0, n1, n2], mat, hit, col);
        r += tone(col[0]); g += tone(col[1]); b += tone(col[2]);
      }
      const o = k * 4;
      if (n < 1e-6) { data[o + 3] = 0; continue; }
      data[o] = Math.round(r / n); data[o + 1] = Math.round(g / n); data[o + 2] = Math.round(b / n); data[o + 3] = Math.round((n / SUB.length) * 255);
    }
  }
  // lichtpunten (vensters) op het scherm, voor de nacht
  const lights = scene.lights.map(([x, y, z]) => [(x - y) * 32, (x + y) * 16 - z * ZPX]);
  return { w: W, h: H, ox: x0, oy: y0, data, lights };
}

function tone(c) {
  // zachte schouder zodat fel zonlicht niet uitbrandt, plus gamma
  const x = c / (1 + c * 0.18) * 1.12;
  return Math.round(Math.pow(clamp01(x), 1 / 1.12) * 255);
}
