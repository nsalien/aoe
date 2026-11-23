// 3D-modellen van mensen en ruiters (voor render3d.js): kleine figuren uit capsules en bollen, met loop- en
// werkbewegingen (8 beelden per cyclus). De figuur kijkt naar +x (op het scherm rechtsonder); links (+y) draagt hij
// het schild, rechts (-y) het wapen. Voeten op (0, 0, 0). Hoogte van een mens: ±0,46 (zelfde als de getekende figuren).
import { Scene, rgb } from './render3d.js';

const TAU = Math.PI * 2;
const SKIN = ['#e9bf96', '#d8a375', '#c08455', '#86553a'];
const HAIR = ['#6b4a2b', '#3b2a1a', '#a0703c', '#1f1a16'];
const WORK_ARM = [-0.2, -1.1, -2.1, -2.6, -1.5, 0.3, 1.05, 0.55];

const shade = (hex, a) => {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.round(a < 0 ? c * (1 + a) : c + (255 - c) * a);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, f(c))).toString(16).padStart(2, '0')).join('');
};
const cloth = (c) => ({ k: 'cloth', c: rgb(c) });
const plain = (c, shiny = false) => ({ k: 'plain', c: rgb(c), shiny });
const metal = (c = '#a7afb9') => ({ k: 'plain', c: rgb(c), shiny: true });
const wood = (c = '#7a5129') => ({ k: 'plain', c: rgb(c) });

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// arm vanaf de schouder: hoek 0 = recht omlaag, positief = naar voren (+x); geeft de hand terug
function arm(s, sh, ang, sleeve, skin, bend = 0.35, len = 0.075) {
  const el = add(sh, [Math.sin(ang) * len, 0, -Math.cos(ang) * len]);
  const hand = add(el, [Math.sin(ang + bend) * len * 0.95, 0, -Math.cos(ang + bend) * len * 0.95]);
  s.cap(sh, el, 0.017, cloth(sleeve));
  s.cap(el, hand, 0.015, cloth(shade(sleeve, -0.08)));
  s.ell(hand[0], hand[1], hand[2], 0.014, 0.014, 0.014, plain(skin));
  return hand;
}

function tool(s, kind, hand, rot) {
  // rot 0 = steel recht omhoog; positief = naar voren
  const dir = [Math.sin(rot), 0, Math.cos(rot)];
  const end = add(hand, [dir[0] * 0.15, 0, dir[2] * 0.15]);
  const st = add(hand, [-dir[0] * 0.03, 0, -dir[2] * 0.03]);
  s.cap(st, end, 0.006, wood('#8a5f33'));
  const head = add(hand, [dir[0] * 0.14, 0, dir[2] * 0.14]);
  if (kind === 'pick') s.cap(add(head, [-dir[2] * 0.05, 0, dir[0] * 0.05]), add(head, [dir[2] * 0.05, 0, -dir[0] * 0.05]), 0.007, metal('#8e959f'));
  else if (kind === 'hoe') s.cap(head, add(head, [dir[2] * 0.04, 0, -dir[0] * 0.04]), 0.008, metal('#8e959f'));
  else if (kind === 'hammer') s.ell(head[0], head[1], head[2], 0.022, 0.016, 0.016, metal('#6e747c'));
  else s.ell(head[0] + dir[2] * 0.018, head[1], head[2] - dir[0] * 0.018, 0.022, 0.006, 0.026, metal('#c3c9d0'));
}

function head(s, L, hz, skin) {
  const hair = HAIR[(L.skin || 0) % HAIR.length];
  s.ell(0.006, 0, hz, 0.036, 0.034, 0.04, plain(skin));
  s.ell(0.04, 0, hz - 0.004, 0.006, 0.008, 0.008, plain(shade(skin, -0.08))); // neus
  if (L.barb) {
    s.ell(0, 0, hz + 0.008, 0.04, 0.038, 0.034, metal('#5c5f63'));
    s.cap([0, 0.034, hz + 0.02], [0.0, 0.07, hz + 0.075], 0.007, plain('#efe6d2'));
    s.cap([0, -0.034, hz + 0.02], [0.0, -0.07, hz + 0.075], 0.007, plain('#efe6d2'));
    s.ell(0.025, 0, hz - 0.035, 0.022, 0.028, 0.028, plain('#7a4a24')); // baard
    return;
  }
  if (L.look === 'hoplite') {
    s.ell(0.002, 0, hz + 0.006, 0.042, 0.039, 0.044, metal('#c8963e'));
    s.ell(-0.01, 0, hz + 0.06, 0.055, 0.008, 0.03, cloth(L.team || '#b03a2e'));
    return;
  }
  if (L.look === 'samurai' || L.look === 'yabusame') {
    s.ell(0, 0, hz + 0.01, 0.042, 0.04, 0.035, plain('#25242a', true));
    s.ell(0, 0, hz - 0.005, 0.058, 0.056, 0.01, plain('#3a3840'));
    s.cap([0.03, 0.012, hz + 0.03], [0.035, 0.03, hz + 0.075], 0.004, metal('#e0b23a'));
    s.cap([0.03, -0.012, hz + 0.03], [0.035, -0.03, hz + 0.075], 0.004, metal('#e0b23a'));
    return;
  }
  if (L.look === 'lionguard') { s.cyl(0, 0, 0.037, hz, hz + 0.075, cloth('#244e8f')); s.cyl(0, 0, 0.039, hz + 0.004, hz + 0.014, metal('#e0b23a')); return; }
  if (L.look === 'immortal') { s.cyl(0, 0, 0.038, hz + 0.005, hz + 0.05, cloth('#e8dcc0')); s.cyl(0, 0, 0.04, hz + 0.02, hz + 0.03, cloth('#1f9a9a')); return; }
  if (L.look === 'peltast') { s.ell(0, 0, hz + 0.012, 0.039, 0.037, 0.038, cloth('#7a5129')); return; }
  if (L.helmet) {
    s.ell(0, 0, hz + 0.006, 0.041, 0.039, 0.04, metal(L.helmet), hz - 0.004);
    s.cap([0.04, 0, hz + 0.01], [0.044, 0, hz - 0.022], 0.005, metal(shade(L.helmet, -0.15)));
    if (L.armor && L.team) { s.ell(-0.01, 0, hz + 0.05, 0.045, 0.008, 0.022, cloth(L.team)); }
    return;
  }
  if (L.hat && L.weapon === 'bow') { s.ell(-0.004, 0, hz + 0.004, 0.043, 0.041, 0.046, cloth(L.hat), hz - 0.03); return; }
  if (L.hat) {
    s.ell(0, 0, hz + 0.028, 0.07, 0.07, 0.01, cloth(shade(L.hat, -0.1)));
    s.ell(0, 0, hz + 0.028, 0.034, 0.034, 0.03, cloth(L.hat), hz + 0.028);
    return;
  }
  s.ell(-0.006, 0, hz + 0.01, 0.039, 0.037, 0.034, plain(hair), hz - 0.005);
}

// kledij, wapens en houding volgens de opties van de getekende figuur (zelfde namen)
export function person(s, L, mode, f, seated = null) {
  const a = (f / 8) * TAU;
  const walk = mode === 'walk' && !seated; const work = mode === 'work';
  const sw = walk ? Math.sin(a) : 0;
  const bob = walk ? Math.abs(Math.cos(a)) * 0.012 : 0;
  const skin = SKIN[L.skin || 0];
  const body = L.body || '#8b6a43';
  const pants = L.leg || shade(body, -0.42);
  const base = seated ? seated : 0;
  const hipZ = base + (seated ? 0.04 : 0.205 + bob); const shZ = hipZ + 0.15; const hz = shZ + 0.055;
  const boots = '#3a2a1c';
  // benen
  for (const side of [1, -1]) {
    const ph = side * sw;
    const hip = [0, side * 0.028, hipZ];
    if (seated) {
      const knee = [0.06, side * 0.075, hipZ - 0.02]; const foot = [0.045, side * 0.08, hipZ - 0.13];
      s.cap(hip, knee, 0.021, cloth(pants)); s.cap(knee, foot, 0.018, plain(boots));
      continue;
    }
    const lift = walk ? Math.max(0, ph) * 0.03 : 0;
    const foot = [ph * 0.075, side * 0.032, 0.02 + lift];
    const knee = [ph * 0.035 + 0.018, side * 0.03, 0.11 + bob + lift * 0.5];
    s.cap(hip, knee, 0.022, cloth(pants));
    s.cap(knee, foot, 0.019, plain(boots));
    s.ell(foot[0] + 0.016, foot[1], foot[2] - 0.006, 0.03, 0.017, 0.013, plain(boots));
  }
  // mantel in teamkleur (achter)
  if (L.team && !L.barb && (L.weapon === 'spear' || L.weapon === 'sword')) s.ell(-0.035, 0, hipZ + 0.06, 0.016, 0.062, 0.1, cloth(shade(L.team, -0.2)));
  // romp
  s.ell(0, 0, hipZ + 0.075, 0.048, 0.06, 0.1, cloth(body));
  if (!seated) s.ell(0, 0, hipZ + 0.005, 0.054, 0.062, 0.045, cloth(shade(body, -0.1)));
  s.ell(0, 0, hipZ + 0.03, 0.05, 0.061, 0.012, plain('#3e2a18'));
  if (L.armor) s.ell(0.006, 0, hipZ + 0.09, 0.047, 0.059, 0.07, metal('#b2bac4'));
  if (L.look === 'hoplite') s.ell(0.006, 0, hipZ + 0.09, 0.048, 0.06, 0.07, metal('#c8963e'));
  if (L.look === 'samurai') s.ell(0.006, 0, hipZ + 0.08, 0.05, 0.062, 0.085, plain('#7a1f1f', true));
  if (L.team && !L.barb && L.weapon && L.weapon !== 'tool') s.ell(0.036, 0, hipZ + 0.08, 0.016, 0.03, 0.085, cloth(L.team));
  if (L.armor) for (const side of [1, -1]) s.ell(0, side * 0.062, shZ, 0.026, 0.02, 0.018, metal('#9aa3ad'));
  s.cap([0, 0, shZ], [0.004, 0, shZ + 0.03], 0.016, plain(shade(skin, -0.1)));
  head(s, L, hz, skin);
  // armen
  const shL = [0, 0.066, shZ]; const shR = [0, -0.066, shZ];
  const sleeve = shade(body, -0.05);
  const carry = L.carry;
  let leftAng = walk ? -sw * 0.5 : 0.1;
  if (carry === 'wood') leftAng = Math.PI - 0.5;
  // schild links
  if (L.weapon === 'spear' || L.weapon === 'sword' || L.look === 'hoplite' || L.look === 'lionguard' || L.look === 'immortal' || L.look === 'peltast') {
    arm(s, shL, 0.6, sleeve, skin, 0.9);
    const big = L.look === 'hoplite';
    const sc = L.look === 'hoplite' ? '#c8963e' : L.look === 'lionguard' ? '#2c5fae' : L.look === 'immortal' ? '#a07a46' : L.look === 'peltast' ? '#8a6238' : L.team || '#8a6238';
    const rz = L.weapon === 'sword' && !L.look ? 0.085 : big ? 0.09 : 0.07;
    s.ell(0.04, 0.092, hipZ + 0.1, big ? 0.085 : 0.065, 0.012, rz, plain(sc, true));
    s.ell(0.04, 0.1, hipZ + 0.1, 0.014, 0.008, 0.014, metal('#c9a23a'));
  } else if (L.weapon === 'bow') {
    const hand = arm(s, shL, 1.45, sleeve, skin, 0.05);
    // boog: drie stukjes in een boog voor de hand
    const c = add(hand, [0.012, 0, 0]);
    const p = [[0.0, 0, 0.13], [0.03, 0, 0.06], [0.035, 0, 0], [0.03, 0, -0.06], [0.0, 0, -0.13]];
    for (let k = 0; k < 4; k++) s.cap(add(c, p[k]), add(c, p[k + 1]), 0.006, wood('#6b4523'));
    s.cap(add(c, p[0]), add(c, p[4]), 0.002, plain('#eee6d0'));
    s.cyl(-0.05, 0.02, 0.018, hipZ + 0.06, hipZ + 0.2, wood('#6b4523')); // pijlkoker
  } else {
    arm(s, shL, leftAng, sleeve, skin, carry === 'wood' ? 0.2 : 0.35);
  }
  // rechts: wapen of gereedschap
  if (L.weapon === 'spear' || L.look === 'hoplite' || L.look === 'lionguard' || L.look === 'immortal') {
    const hand = arm(s, shR, walk ? 0.45 + sw * 0.1 : 0.5, sleeve, skin, 0.9);
    s.cap([hand[0] + 0.012, hand[1], 0.02], [hand[0] + 0.04, hand[1], seated ? hipZ + 0.62 : 0.76], 0.007, wood('#7a5129'));
    s.ell(hand[0] + 0.041, hand[1], (seated ? hipZ + 0.62 : 0.76) + 0.025, 0.008, 0.006, 0.03, metal('#d5dbe2'));
  } else if (L.weapon === 'sword' || L.look === 'samurai') {
    const hand = arm(s, shR, walk ? 0.7 + sw * 0.15 : 0.75, sleeve, skin, 0.6);
    s.cap(hand, add(hand, [0.075, 0, 0.11]), 0.006, metal(L.look === 'samurai' ? '#e8edf2' : '#d5dbe2'));
    s.cap(add(hand, [0.005, -0.02, 0.008]), add(hand, [0.005, 0.02, 0.008]), 0.005, metal('#b08a3a'));
  } else if (L.look === 'peltast') {
    const hand = arm(s, shR, 2.4, sleeve, skin, 0.2);
    s.cap(add(hand, [-0.08, 0, -0.04]), add(hand, [0.1, 0, 0.06]), 0.005, wood('#7a5129'));
  } else if (L.weapon === 'tool') {
    const kind = L.tool || 'axe';
    if (work) { const ang = WORK_ARM[f]; const hand = arm(s, shR, ang, sleeve, skin, 0.15); tool(s, kind, hand, Math.PI - ang); }
    else if (carry === 'food') arm(s, shR, 0.8, sleeve, skin, 0.6);
    else { const hand = arm(s, shR, walk ? 0.35 + sw * 0.2 : 0.3, sleeve, skin, 0.2); tool(s, kind, hand, 0.5); }
  } else if (!seated || L.weapon !== 'bow') {
    arm(s, shR, walk ? sw * 0.5 : -0.05, sleeve, skin);
  }
  // lading
  if (carry === 'wood') { for (const [dy, dz] of [[0.0, 0], [0.02, 0.03], [-0.02, 0.03]]) s.cap([-0.09, 0.07 + dy, shZ + 0.03 + dz], [0.09, 0.07 + dy, shZ + 0.05 + dz], 0.018, { k: 'logs', c: rgb('#8b5a2b'), lh: 0.03 }); }
  else if (carry === 'stone') s.ell(-0.06, 0, hipZ + 0.1, 0.035, 0.045, 0.045, { k: 'rock', c: rgb('#a7a297') });
  else if (carry === 'gold') { s.ell(-0.06, 0, hipZ + 0.1, 0.035, 0.045, 0.05, plain('#b08850')); s.ell(-0.06, 0.02, hipZ + 0.16, 0.012, 0.012, 0.012, { k: 'gold' }); }
  else if (carry === 'food') { s.ell(0.07, 0, hipZ + 0.02, 0.04, 0.05, 0.025, plain('#b5864a')); for (const [dx, dy, c] of [[0.06, -0.02, '#d9483b'], [0.075, 0.015, '#e9b93a'], [0.065, 0.0, '#6ba33a']]) s.ell(dx, dy, hipZ + 0.045, 0.014, 0.014, 0.014, plain(c)); }
}

export function horse(s, L, mode, f) {
  const a = (f / 8) * TAU;
  const walk = mode === 'walk';
  const coat = L.horse || '#7b4f2c';
  const dark = shade(coat, -0.35);
  const bob = walk ? Math.abs(Math.sin(a)) * 0.012 : 0;
  const bz = 0.33 + bob;
  // benen (diagonaal paar beweegt samen)
  for (const [lx, side, ph] of [[0.11, 1, 0], [0.11, -1, Math.PI], [-0.12, 1, Math.PI], [-0.12, -1, 0]]) {
    const sw = walk ? Math.sin(a + ph) : 0; const lift = walk ? Math.max(0, Math.cos(a + ph)) * 0.035 : 0;
    const top = [lx, side * 0.042, bz - 0.03]; const knee = [lx + sw * 0.04 + 0.01, side * 0.045, 0.14 + lift];
    const hoof = [lx + sw * 0.07, side * 0.045, 0.015 + lift];
    s.cap(top, knee, 0.024, plain(coat)); s.cap(knee, hoof, 0.016, plain(shade(coat, -0.15)));
    s.ell(hoof[0], hoof[1], hoof[2], 0.02, 0.018, 0.014, plain('#2a1f17'));
  }
  s.ell(0, 0, bz, 0.18, 0.075, 0.085, plain(coat));
  s.cap([0.13, 0, bz + 0.02], [0.21, 0, bz + 0.15], 0.05, plain(coat));
  s.cap([0.22, 0, bz + 0.16], [0.31, 0, bz + 0.1], 0.032, plain(coat));
  s.ell(0.315, 0, bz + 0.095, 0.022, 0.026, 0.024, plain(dark));
  s.cap([0.2, 0.012, bz + 0.19], [0.2, 0.015, bz + 0.225], 0.008, plain(dark));
  s.cap([0.11, 0, bz + 0.06], [0.2, 0, bz + 0.2], 0.018, plain(dark)); // manen
  s.cap([-0.17, 0, bz + 0.03], [-0.24, 0, bz - 0.12 + (walk ? Math.sin(a) * 0.01 : 0)], 0.018, plain(dark));
  if (L.armor && L.team) {
    s.ell(0, 0, bz - 0.01, 0.19, 0.082, 0.085, cloth(L.team), bz - 0.1);
    s.cyl(0, 0, 0.001, 0, 0.001, plain('#000')); // (houdt de lijst niet leeg)
  }
  s.ell(-0.01, 0, bz + 0.075, 0.06, 0.07, 0.02, plain('#5a3a1e'));
  // ruiter
  person(s, { ...L, horse: undefined }, 'idle', 0, bz + 0.05);
}

// de opties van de getekende figuur → een scène
export function figureScene(kind, L, mode, f) {
  const s = new Scene();
  if (kind === 'h') horse(s, L, mode, f);
  else person(s, L, mode, f);
  return s;
}

// voor het testen van de modellen (wordt in het spel niet gebruikt)
export const GALLERY = [
  ['dorpeling', () => figureScene('p', { body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: 'axe' }, 'walk', 2), { ground: false, scale: 4, show: 4, fill: 0.5, ao: 3 }],
  ['speer', () => figureScene('p', { team: '#c0392b', body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }, 'walk', 1), { ground: false, scale: 4, show: 4, fill: 0.5, ao: 3 }],
  ['zwaard', () => figureScene('p', { team: '#c0392b', body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }, 'idle', 0), { ground: false, scale: 4, show: 4, fill: 0.5, ao: 3 }],
  ['boog', () => figureScene('p', { team: '#c0392b', body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }, 'idle', 0), { ground: false, scale: 4, show: 4, fill: 0.5, ao: 3 }],
  ['ridder', () => figureScene('h', { team: '#c0392b', body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530' }, 'walk', 3), { ground: false, scale: 4, show: 3, fill: 0.5, ao: 3 }],
];
