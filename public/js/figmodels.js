// 3D-modellen van mensen en ruiters (voor render3d.js): kleine figuren uit capsules en bollen, met loop- en
// werkbewegingen (8 beelden per cyclus). De figuur kijkt naar +x (op het scherm rechtsonder); links (+y) draagt hij
// het schild, rechts (-y) het wapen. Voeten op (0, 0, 0). Hoogte van een mens: ±0,46 (zelfde als de getekende figuren).
import { Scene, rgb } from './render3d.js';

const TAU = Math.PI * 2;
const SKIN = ['#e9bf96', '#d8a375', '#c08455', '#86553a'];
const HAIR = ['#6b4a2b', '#3b2a1a', '#a0703c', '#1f1a16'];
const WORK_ARM = [-0.2, -1.1, -2.1, -2.6, -1.5, 0.3, 1.05, 0.55];
// Aanvallen (mode 'atk', 8 beelden): beeld 0 = het moment van de slag of het schot, daarna uitzwaaien, herstellen,
// opnieuw aanzetten. Hoeken zoals arm(): 0 = omlaag, π/2 = recht vooruit, π = omhoog, meer = naar achter boven het hoofd.
// Zwaard: arm, buiging van de elleboog en de richting van het blad (0 = omhoog, + = naar voren).
export const SWORD_ARM = [1.55, 1.0, 0.55, 0.7, 0.85, 2.55, 3.35, 2.5];
const SWORD_BEND = [0.1, 0.25, 0.6, 0.6, 0.5, 0.35, 0.25, 0.1];
export const SWORD_ROT = [2.0, 2.7, 1.2, 0.7, 0.6, -0.6, -2.2, 1.2];
// speer: hoe ver de hand naar voren steekt (stoot op 0), en een beetje op en neer
export const SPEAR_X = [0.2, 0.16, 0.08, 0.01, -0.02, -0.02, 0.04, 0.14];
const SPEAR_DZ = [-0.1, -0.1, -0.06, -0.01, 0.02, 0.02, -0.03, -0.08];
// boog: trekken (0 = los, 1 = helemaal aangespannen); 1-2 = pijl uit de koker, 3 = op de pees
export const BOW_DRAW = [0, 0, 0, 0, 0.35, 0.7, 1, 1];
// werpspeer (peltast): arm ver naar achter en dan werpen; 0-2 heeft hij geen speer in de hand
const JAV_ARM = [2.0, 1.2, 0.4, 0.5, 2.6, 3.2, 3.5, 2.8];

const shade = (hex, a) => {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.round(a < 0 ? c * (1 + a) : c + (255 - c) * a);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, f(c))).toString(16).padStart(2, '0')).join('');
};
const cloth = (c) => ({ k: 'cloth', c: rgb(c) });
const plain = (c, shiny = false) => ({ k: 'plain', c: rgb(c), shiny });
const metal = (c = '#a7afb9') => ({ k: 'plain', c: rgb(c), shiny: true });
const wood = (c = '#7a5129') => ({ k: 'plain', c: rgb(c) });
const leather = (c = '#5a3a1e') => ({ k: 'leather', c: rgb(c) });
const mail = (c = '#9aa3ad') => ({ k: 'mail', c: rgb(c) });
const DARK = '#1c1410';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// arm vanaf de schouder: hoek 0 = recht omlaag, positief = naar voren (+x); geeft de hand terug
function arm(s, sh, ang, sleeve, skin, bend = 0.35, len = 0.075, guard = null) {
  const el = add(sh, [Math.sin(ang) * len, 0, -Math.cos(ang) * len]);
  const hand = add(el, [Math.sin(ang + bend) * len * 0.95, 0, -Math.cos(ang + bend) * len * 0.95]);
  s.cap(sh, el, 0.017, cloth(sleeve));
  s.cap(el, hand, 0.015, cloth(shade(sleeve, -0.08)));
  // manchet of armbeschermer op de onderarm
  const mid = [(el[0] + hand[0] * 2) / 3, (el[1] + hand[1] * 2) / 3, (el[2] + hand[2] * 2) / 3];
  s.cap(mid, [hand[0] * 0.85 + el[0] * 0.15, hand[1] * 0.85 + el[1] * 0.15, hand[2] * 0.85 + el[2] * 0.15], 0.0165, guard || leather(shade(sleeve, -0.3)));
  s.ell(hand[0], hand[1], hand[2], 0.014, 0.014, 0.014, plain(skin));
  return hand;
}

// arm naar een punt (eenvoudige inverse kinematica): de elleboog buigt naar 'pole'
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / (len3(a) || 1));
function armTo(s, sh, target, sleeve, skin, pole) {
  const L1 = 0.075; const L2 = 0.071;
  let v = sub(target, sh); let d = len3(v);
  const maxD = L1 + L2 - 0.002;
  let t = target;
  if (d > maxD) { t = add(sh, mul(v, maxD / d)); v = sub(t, sh); d = maxD; }
  const u = mul(v, 1 / (d || 1));
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * (d || 1));
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pp = norm(sub(pole, mul(u, dot(pole, u))));
  const el = add(add(sh, mul(u, a)), mul(pp, h));
  s.cap(sh, el, 0.017, cloth(sleeve));
  s.cap(el, t, 0.015, cloth(shade(sleeve, -0.08)));
  const mid = [(el[0] + t[0] * 2) / 3, (el[1] + t[1] * 2) / 3, (el[2] + t[2] * 2) / 3];
  s.cap(mid, [t[0] * 0.85 + el[0] * 0.15, t[1] * 0.85 + el[1] * 0.15, t[2] * 0.85 + el[2] * 0.15], 0.0165, leather(shade(sleeve, -0.3)));
  s.ell(t[0], t[1], t[2], 0.014, 0.014, 0.014, plain(skin));
  return t;
}

// zwaard vanuit de hand in richting rot (0 = omhoog, + = naar voren)
function swordAt(s, hand, rot, blade, big = false) {
  const d = [Math.sin(rot), 0, Math.cos(rot)];
  const L = big ? 0.17 : 0.155;
  s.cap(add(hand, mul(d, 0.012)), add(hand, mul(d, L)), 0.0068, metal(blade));
  s.cap(add(hand, mul(d, 0.04)), add(hand, mul(d, L - 0.012)), 0.0025, metal(shade(blade, -0.25))); // groef
  s.cap(add(hand, add(mul(d, 0.008), [0, -0.02, 0])), add(hand, add(mul(d, 0.008), [0, 0.02, 0])), 0.005, metal('#b08a3a')); // pareerstang
  s.cap(add(hand, mul(d, -0.004)), add(hand, mul(d, -0.022)), 0.006, leather('#3a2414')); // greep
  const k = add(hand, mul(d, -0.026)); s.ell(k[0], k[1], k[2], 0.008, 0.008, 0.008, { k: 'gold' }); // knop
}

// lange stok (speer, lans, werpspeer) door de hand: 'back' achter de hand, 'front' ervoor, punt van metaal
function pole(s, hand, dir, back, front, shaft = '#7a5129', r = 0.007) {
  const d = norm(dir);
  const tip = add(hand, mul(d, front));
  s.cap(add(hand, mul(d, -back)), tip, r, wood(shaft));
  s.cap(add(tip, mul(d, -0.012)), add(tip, mul(d, 0.03)), 0.0095, metal('#dfe5ec'));
  s.cap(add(tip, mul(d, 0.03)), add(tip, mul(d, 0.055)), 0.004, metal('#dfe5ec'));
  return tip;
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

function face(s, L, hz, skin, hair) {
  for (const side of [1, -1]) {
    s.ell(0.036, side * 0.014, hz + 0.006, 0.004, 0.006, 0.0045, plain(DARK)); // ogen
    s.cap([0.037, side * 0.007, hz + 0.016], [0.034, side * 0.022, hz + 0.017], 0.0025, plain(shade(hair, -0.2))); // wenkbrauwen
  }
  s.cap([0.038, -0.009, hz - 0.017], [0.038, 0.009, hz - 0.017], 0.0028, plain(shade(skin, -0.3))); // mond
}

function head(s, L, hz, skin) {
  const hair = HAIR[(L.skin || 0) % HAIR.length];
  s.ell(0.006, 0, hz, 0.036, 0.034, 0.04, plain(skin));
  s.ell(0.04, 0, hz - 0.004, 0.006, 0.008, 0.008, plain(shade(skin, -0.08))); // neus
  face(s, L, hz, skin, hair);
  // baard bij een deel van de mannen (niet bij de elite met een eigen uitzicht)
  if (!L.look && !L.barb && (L.skin || 0) % 2 === 1) s.ell(0.026, 0, hz - 0.026, 0.017, 0.027, 0.02, cloth(hair));
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
  if (L.look === 'noble') { // edelman: gouden kroon
    s.ell(-0.006, 0, hz + 0.01, 0.039, 0.037, 0.034, plain(hair), hz - 0.005);
    s.cyl(0, 0, 0.04, hz + 0.02, hz + 0.042, { k: 'gold' });
    for (let k = 0; k < 6; k++) { const an = (k / 6) * TAU; s.cone(Math.cos(an) * 0.036, Math.sin(an) * 0.036, 0.01, hz + 0.042, hz + 0.065, { k: 'gold' }); }
    s.ell(0.04, 0, hz + 0.032, 0.006, 0.006, 0.006, plain('#c0392b', true));
    return;
  }
  if (L.look === 'lionguard') { s.cyl(0, 0, 0.037, hz, hz + 0.075, cloth('#244e8f')); s.cyl(0, 0, 0.039, hz + 0.004, hz + 0.014, metal('#e0b23a')); return; }
  if (L.look === 'immortal') { s.cyl(0, 0, 0.038, hz + 0.005, hz + 0.05, cloth('#e8dcc0')); s.cyl(0, 0, 0.04, hz + 0.02, hz + 0.03, cloth('#1f9a9a')); return; }
  if (L.look === 'peltast') { s.ell(0, 0, hz + 0.012, 0.039, 0.037, 0.038, cloth('#7a5129')); return; }
  if (L.look === 'mahout') { s.ell(0, 0, hz + 0.022, 0.043, 0.041, 0.034, cloth('#efe6d2')); s.ell(0.01, 0, hz + 0.03, 0.044, 0.042, 0.012, cloth('#d0a63a')); return; }
  if (L.helmet) {
    s.ell(0, 0, hz + 0.006, 0.041, 0.039, 0.04, metal(L.helmet), hz - 0.004);
    s.ell(0, 0, hz - 0.002, 0.044, 0.042, 0.007, metal(shade(L.helmet, -0.2))); // rand
    s.cap([0.04, 0, hz + 0.01], [0.044, 0, hz - 0.022], 0.005, metal(shade(L.helmet, -0.15)));
    for (const side of [1, -1]) s.ell(0.018, side * 0.036, hz - 0.016, 0.017, 0.006, 0.02, metal(shade(L.helmet, -0.08))); // wangstukken
    s.ell(-0.03, 0, hz - 0.02, 0.016, 0.036, 0.02, L.armor ? mail() : leather('#4a3320')); // nekbescherming
    if (L.team && (L.armor || (L.kit || '').includes('P'))) s.ell(-0.01, 0, hz + 0.05, 0.045, 0.008, 0.022, cloth(L.team));
    if ((L.kit || '').includes('P')) s.ell(-0.02, 0, hz + 0.075, 0.05, 0.007, 0.018, { k: 'gold' }); // krijgsdrill: gouden pluim
    return;
  }
  if (L.hat && L.weapon === 'bow') { s.ell(-0.004, 0, hz + 0.004, 0.043, 0.041, 0.046, cloth(L.hat), hz - 0.03); return; }
  if (L.hat) {
    s.ell(0, 0, hz + 0.028, 0.07, 0.07, 0.01, cloth(shade(L.hat, -0.1)));
    s.ell(0, 0, hz + 0.028, 0.034, 0.034, 0.03, cloth(L.hat), hz + 0.028);
    s.cyl(0, 0, 0.0345, hz + 0.03, hz + 0.038, cloth(shade(L.hat, -0.35))); // band
    s.ell(-0.02, 0, hz - 0.01, 0.022, 0.034, 0.02, cloth(hair)); // haar onder de hoed
    return;
  }
  s.ell(-0.006, 0, hz + 0.01, 0.039, 0.037, 0.034, cloth(hair), hz - 0.005);
  s.ell(-0.022, 0, hz - 0.012, 0.022, 0.034, 0.024, cloth(hair)); // achterhoofd
  for (const side of [1, -1]) s.ell(0.002, side * 0.035, hz - 0.002, 0.008, 0.005, 0.011, plain(shade(skin, -0.06))); // oren
}

// kledij, wapens en houding volgens de opties van de getekende figuur (zelfde namen)
export function person(s, L, mode, f, seated = null) {
  const a = (f / 8) * TAU;
  const walk = mode === 'walk' && !seated; const work = mode === 'work'; const atk = mode === 'atk';
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
    // in een gevecht: wijde stand, linkervoet voor, rechtervoet achter
    const st = atk ? side * 0.05 : ph * 0.075;
    const foot = [st, side * (atk ? 0.04 : 0.032), 0.02 + lift];
    const knee = [st * 0.45 + 0.018 + (atk ? 0.008 : 0), side * (atk ? 0.035 : 0.03), 0.11 + bob + lift * 0.5 - (atk ? 0.006 : 0)];
    s.cap(hip, knee, 0.022, cloth(pants));
    s.cap(knee, foot, 0.019, leather(boots));
    s.ell(foot[0] + 0.016, foot[1], foot[2] - 0.006, 0.03, 0.017, 0.013, leather(boots));
    const cuff = [knee[0] * 0.75 + foot[0] * 0.25, knee[1], knee[2] * 0.75 + foot[2] * 0.25];
    s.ell(cuff[0], cuff[1], cuff[2], 0.022, 0.022, 0.012, leather(shade(boots, 0.18))); // omslag van de laars
    s.ell(foot[0] + 0.016, foot[1], foot[2] - 0.016, 0.031, 0.018, 0.004, plain('#1a120c')); // zool
  }
  // mantel in teamkleur (achter), met een speld op de schouder
  const cape = L.team && !L.barb && (L.weapon === 'spear' || L.weapon === 'sword');
  if (cape) {
    s.ell(-0.03, 0, shZ - 0.012, 0.022, 0.072, 0.03, cloth(shade(L.team, -0.12)));
    s.ell(-0.04, 0, hipZ + 0.05, 0.016, 0.066, 0.12, cloth(shade(L.team, -0.22)));
    s.ell(0.026, 0.05, shZ - 0.004, 0.008, 0.008, 0.008, { k: 'gold' });
  }
  // romp
  s.ell(0, 0, hipZ + 0.075, 0.048, 0.06, 0.1, cloth(body));
  if (!seated) {
    s.ell(0, 0, hipZ + 0.005, 0.054, 0.062, 0.045, cloth(shade(body, -0.1)));
    s.ell(0, 0, hipZ - 0.032, 0.056, 0.064, 0.008, cloth(shade(body, -0.3))); // zoom van de tuniek
  }
  s.ell(0.02, 0, shZ - 0.01, 0.03, 0.034, 0.014, cloth(shade(body, -0.25))); // kraag
  s.ell(0, 0, hipZ + 0.03, 0.05, 0.061, 0.012, leather('#3e2a18'));
  s.ell(0.05, 0, hipZ + 0.03, 0.005, 0.011, 0.01, L.armor || L.look ? { k: 'gold' } : metal('#8e959f')); // gesp
  if (!L.armor && !L.look && !seated) s.ell(0.012, -0.058, hipZ + 0.008, 0.016, 0.012, 0.022, leather('#6b4523')); // buidel
  if (L.armor && !L.plate) {
    s.ell(0.006, 0, hipZ + 0.09, 0.048, 0.06, 0.072, mail('#b2bac4'));
    if (!seated) s.ell(0.004, 0, hipZ - 0.004, 0.056, 0.064, 0.04, mail('#a3abb5')); // maliënrok
  }
  if (L.armor && L.plate) {
    s.ell(0.006, 0, hipZ + 0.09, 0.05, 0.062, 0.075, metal('#dfe4ea'));
    s.ell(0.03, 0, hipZ + 0.1, 0.03, 0.03, 0.05, metal('#eef2f6')); // borstplaat
    if (!seated) for (const dz of [0, -0.022]) s.ell(0.004, 0, hipZ + dz, 0.056, 0.064, 0.014, metal(dz ? '#c3cad3' : '#d3d9e0')); // heupplaten
  }
  if (L.look === 'noble') { s.ell(-0.035, 0, hipZ + 0.06, 0.018, 0.065, 0.1, cloth('#5b2a7a')); s.ell(0.006, 0, hipZ + 0.03, 0.05, 0.062, 0.012, { k: 'gold' }); }
  if (L.look === 'hoplite') s.ell(0.006, 0, hipZ + 0.09, 0.048, 0.06, 0.07, metal('#c8963e'));
  if (L.look === 'samurai') s.ell(0.006, 0, hipZ + 0.08, 0.05, 0.062, 0.085, plain('#7a1f1f', true));
  if (L.team && !L.barb && L.weapon && L.weapon !== 'tool') s.ell(0.036, 0, hipZ + 0.08, 0.016, 0.03, 0.085, cloth(L.team));
  if (L.armor) for (const side of [1, -1]) {
    s.ell(0, side * 0.062, shZ, L.plate ? 0.032 : 0.026, L.plate ? 0.026 : 0.02, L.plate ? 0.022 : 0.018, metal(L.plate ? '#cfd6de' : '#9aa3ad'));
    if (L.plate) s.ell(0, side * 0.064, shZ - 0.016, 0.03, 0.024, 0.012, metal('#b7bfc8')); // tweede schouderplaat
  }
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
    arm(s, shL, atk ? 0.95 : 0.6, sleeve, skin, 0.9);
    const big = L.look === 'hoplite';
    const sc = L.look === 'hoplite' ? '#c8963e' : L.look === 'lionguard' ? '#2c5fae' : L.look === 'immortal' ? '#a07a46' : L.look === 'peltast' ? '#8a6238' : L.team || '#8a6238';
    const kit = L.kit || '';
    const wide = kit.includes('S') && !L.look; // schildmuur: een groter schild met een ijzeren rand
    const rz = (L.weapon === 'sword' && !L.look ? 0.085 : big ? 0.09 : 0.07) * (wide ? 1.3 : 1);
    const rw = (big ? 0.085 : 0.065) * (wide ? 1.15 : 1);
    const rim = kit.includes('G') ? { k: 'gold' } : wide || L.armor ? metal('#8e959f') : wood('#4a3020');
    // in een gevecht houdt hij het schild hoger en meer voor zich
    const sx = atk ? 0.065 : 0.04; const sz = hipZ + (atk ? 0.12 : 0.1);
    s.ell(sx, 0.088, sz, rw + 0.006, 0.01, rz + 0.006, rim);
    s.ell(sx, 0.092, sz, rw, 0.012, rz, { k: 'cloth', c: rgb(sc) });
    if (!L.look || L.look === 'lionguard') { // embleem: een kruis in een lichtere kleur
      const em = shade(sc, sc === L.team ? 0.55 : 0.3);
      s.ell(sx, 0.1, sz, 0.008, 0.006, rz * 0.82, plain(em));
      s.ell(sx, 0.1, sz, rw * 0.82, 0.006, 0.008, plain(em));
    } else if (L.look === 'hoplite') s.ell(sx, 0.1, sz, rw * 0.5, 0.006, rz * 0.5, plain('#7a2a20')); // hoplietenschild: rode cirkel
    s.ell(sx, 0.103, sz, 0.016, 0.01, 0.016, kit.includes('G') ? { k: 'gold' } : metal('#c9a23a'));
  } else if (L.weapon === 'bow' && atk) {
    // aanspannen en schieten: boog recht voor zich, de rechterhand haalt een pijl, legt aan, trekt en laat los
    const kit = L.kit || ''; const bl = kit.includes('L') ? 1.4 : 1;
    const B = [0.15, 0.035, shZ + 0.015];
    armTo(s, shL, B, sleeve, skin, [-0.3, 0.8, -0.6]);
    const dr = BOW_DRAW[f];
    const bend = 0.035 + dr * 0.03;
    const top = add(B, [-0.012 - dr * 0.025, 0, 0.13 * bl]); const bot = add(B, [-0.012 - dr * 0.025, 0, -0.13 * bl]);
    const p = [top, add(B, [bend * 0.85 - 0.005, 0, 0.065 * bl]), add(B, [bend, 0, 0]), add(B, [bend * 0.85 - 0.005, 0, -0.065 * bl]), bot];
    for (let k = 0; k < 4; k++) s.cap(p[k], p[k + 1], 0.006, wood(kit.includes('L') ? '#4a2e18' : '#6b4523'));
    s.cap(add(B, [bend - 0.002, 0, -0.012]), add(B, [bend - 0.002, 0, 0.012]), 0.008, leather('#3a2414')); // greep
    const nock = add(B, [-0.012, -0.002, 0.0]);
    const anchor = [0.02, -0.012, shZ + 0.035];
    const R = f === 0 ? [0.07, -0.03, shZ + 0.025] : f === 1 ? [-0.02, -0.075, shZ - 0.02] : f === 2 ? [-0.06, -0.02, hipZ + 0.2]
      : [nock[0] + (anchor[0] - nock[0]) * dr, nock[1] + (anchor[1] - nock[1]) * dr, nock[2] + (anchor[2] - nock[2]) * dr];
    armTo(s, shR, R, sleeve, skin, [-0.4, -0.8, -0.4]);
    // pees: los recht, aangespannen naar de hand
    if (f >= 3) { s.cap(top, R, 0.002, plain('#eee6d0')); s.cap(R, bot, 0.002, plain('#eee6d0')); } else s.cap(top, bot, 0.002, plain('#eee6d0'));
    // pijl: uit de koker (2), op de pees (3-7)
    const fire = kit.includes('F');
    if (f === 2) { s.cap(add(R, [0, 0, -0.03]), add(R, [0.01, 0, 0.15]), 0.0035, wood('#c9a26a')); }
    if (f >= 3) {
      const dir = norm(sub(add(B, [0.05, 0.002, 0.004]), R));
      const tip = add(R, mul(dir, 0.2));
      s.cap(add(R, mul(dir, -0.008)), tip, 0.0035, wood('#c9a26a'));
      s.cap(add(tip, mul(dir, -0.012)), add(tip, mul(dir, 0.012)), 0.006, fire ? plain('#ff8a1e', true) : metal('#9aa3ad'));
      s.cap(add(R, mul(dir, 0.0)), add(R, mul(dir, 0.035)), 0.007, plain('#d24a3a')); // veren
    }
    s.cap([0.04, -0.05, shZ + 0.01], [-0.04, 0.05, hipZ + 0.01], 0.006, leather('#4a2e18')); // riem van de pijlkoker
    for (const q of kit.includes('Q') ? [0, 1] : [0]) {
      const qx = -0.05 - q * 0.01; const qy = 0.02 - q * 0.04;
      s.cyl(qx, qy, 0.018, hipZ + 0.06, hipZ + 0.2, leather(q ? '#5a3a1e' : '#6b4523'));
      s.cyl(qx, qy, 0.0195, hipZ + 0.185, hipZ + 0.2, leather('#3a2414'));
      if (fire) s.ell(qx, qy, hipZ + 0.215, 0.016, 0.016, 0.018, plain('#ff8a1e', true));
      else for (const [dx, dy, col] of [[-0.006, -0.006, '#efe7d6'], [0.006, 0.004, '#d24a3a'], [-0.004, 0.008, '#efe7d6']]) s.cap([qx + dx, qy + dy, hipZ + 0.2], [qx + dx * 1.4, qy + dy * 1.4, hipZ + 0.235], 0.0045, plain(col));
    }
  } else if (L.weapon === 'bow') {
    const hand = arm(s, shL, 1.45, sleeve, skin, 0.05);
    // boog: drie stukjes in een boog voor de hand
    const c = add(hand, [0.012, 0, 0]);
    const kit = L.kit || ''; const bl = kit.includes('L') ? 1.4 : 1; // taxusboog: langer
    const p = [[0.0, 0, 0.13 * bl], [0.03, 0, 0.06 * bl], [0.035, 0, 0], [0.03, 0, -0.06 * bl], [0.0, 0, -0.13 * bl]];
    for (let k = 0; k < 4; k++) s.cap(add(c, p[k]), add(c, p[k + 1]), 0.006, wood(kit.includes('L') ? '#4a2e18' : '#6b4523'));
    s.cap(add(c, p[0]), add(c, p[4]), 0.002, plain('#eee6d0'));
    s.cap(add(c, [0.035, 0, -0.012]), add(c, [0.035, 0, 0.012]), 0.008, leather('#3a2414')); // greep
    s.cap([0.04, -0.05, shZ + 0.01], [-0.04, 0.05, hipZ + 0.01], 0.006, leather('#4a2e18')); // riem van de pijlkoker
    for (const q of kit.includes('Q') ? [0, 1] : [0]) { // pijlkoker (pijlenregen: twee)
      const qx = -0.05 - q * 0.01; const qy = 0.02 - q * 0.04;
      s.cyl(qx, qy, 0.018, hipZ + 0.06, hipZ + 0.2, leather(q ? '#5a3a1e' : '#6b4523'));
      s.cyl(qx, qy, 0.0195, hipZ + 0.185, hipZ + 0.2, leather('#3a2414')); // rand
      if (kit.includes('F')) s.ell(qx, qy, hipZ + 0.215, 0.016, 0.016, 0.018, plain('#ff8a1e', true)); // vuurpijlen
      else for (const [dx, dy, col] of [[-0.006, -0.006, '#efe7d6'], [0.006, 0.004, '#d24a3a'], [-0.004, 0.008, '#efe7d6']]) {
        s.cap([qx + dx, qy + dy, hipZ + 0.2], [qx + dx * 1.4, qy + dy * 1.4, hipZ + 0.235], 0.0045, plain(col)); // veren van de pijlen
      }
    }
  } else {
    arm(s, shL, leftAng, sleeve, skin, carry === 'wood' ? 0.2 : 0.35);
  }
  // rechts: wapen of gereedschap
  if (atk && L.weapon === 'bow') {
    // (de rechterhand trekt de pees: zie hierboven)
  } else if (atk && L.weapon === 'lance') { // lans neer en vooruit stoten
    const hand = armTo(s, shR, [0.03 + SPEAR_X[f] * 0.8, -0.06, shZ - 0.035], sleeve, skin, [-0.3, -0.8, -0.6]);
    const tip = pole(s, hand, [1, 0, -0.06], 0.16, 0.56, '#7a5129', 0.008);
    if (L.team) s.ell(tip[0] - 0.07, tip[1] + 0.012, tip[2] + 0.02, 0.035, 0.004, 0.014, cloth(L.team));
  } else if (atk && (L.weapon === 'spear' || L.look === 'hoplite' || L.look === 'lionguard' || L.look === 'immortal')) {
    // steken: de speer ligt vooruit, de hand trekt terug en stoot naar voren
    const over = L.look === 'hoplite' || seated; // hoplieten en ruiters steken van boven
    const hand = armTo(s, shR, [SPEAR_X[f], -0.05, over ? shZ + 0.055 : shZ - 0.025], sleeve, skin, over ? [-0.5, -0.6, 0.4] : [-0.3, -0.8, -0.6]);
    pole(s, hand, [1, 0, (over ? -0.14 : 0) + SPEAR_DZ[f]], 0.26, 0.48);
  } else if (atk && (L.weapon === 'sword' || L.look === 'samurai')) {
    const hand = arm(s, shR, SWORD_ARM[f], sleeve, skin, SWORD_BEND[f]);
    swordAt(s, hand, SWORD_ROT[f], L.look === 'samurai' ? '#e8edf2' : '#d5dbe2', L.look === 'samurai');
    if (!seated && L.look !== 'samurai') { // lege schede aan de heup
      s.cap([-0.006, 0.062, hipZ + 0.03], [-0.07, 0.07, hipZ - 0.09], 0.009, leather('#3a2414'));
      s.ell(-0.07, 0.07, hipZ - 0.092, 0.009, 0.009, 0.01, metal('#b08a3a'));
    }
  } else if (atk && L.look === 'peltast') {
    const hand = arm(s, shR, JAV_ARM[f], sleeve, skin, f >= 4 && f <= 6 ? 0.9 : 0.25);
    if (f >= 3) pole(s, hand, f === 3 ? [0.1, 0, 1] : [1, 0, 0.35], 0.11, 0.15, '#7a5129', 0.005);
  } else if (atk && L.weapon === 'tool') {
    const ang = WORK_ARM[(f + 6) % 8]; const hand = arm(s, shR, ang, sleeve, skin, 0.15); tool(s, L.tool || 'axe', hand, Math.PI - ang);
  } else if (L.weapon === 'lance') { // lans met wimpel, schuin naar voren
    const hand = arm(s, shR, 0.9, sleeve, skin, 0.5);
    const tip = add(hand, [0.34, 0, 0.18]);
    s.cap(add(hand, [-0.1, 0, -0.05]), tip, 0.008, wood('#7a5129'));
    s.ell(tip[0] + 0.02, tip[1], tip[2] + 0.01, 0.025, 0.006, 0.008, metal('#d5dbe2'));
    if (L.team) s.ell(tip[0] - 0.05, tip[1] + 0.012, tip[2] - 0.05, 0.035, 0.004, 0.014, cloth(L.team));
  } else if (L.weapon === 'spear' || L.look === 'hoplite' || L.look === 'lionguard' || L.look === 'immortal') {
    const hand = arm(s, shR, walk ? 0.45 + sw * 0.1 : 0.5, sleeve, skin, 0.9);
    const top = seated ? hipZ + 0.62 : 0.76;
    s.cap([hand[0] + 0.012, hand[1], 0.02], [hand[0] + 0.04, hand[1], top], 0.007, wood('#7a5129'));
    s.cyl(hand[0] + 0.04, hand[1], 0.0085, top - 0.012, top + 0.006, metal('#8e959f')); // huls
    s.ell(hand[0] + 0.041, hand[1], top + 0.03, 0.011, 0.005, 0.03, metal('#dfe5ec')); // blad
    s.cone(hand[0] + 0.041, hand[1], 0.007, top + 0.05, top + 0.075, metal('#dfe5ec'));
  } else if (L.weapon === 'sword' || L.look === 'samurai') {
    const hand = arm(s, shR, walk ? 0.7 + sw * 0.15 : 0.75, sleeve, skin, 0.6);
    const blade = L.look === 'samurai' ? '#e8edf2' : '#d5dbe2';
    s.cap(add(hand, [0.008, 0, 0.012]), add(hand, [0.075, 0, 0.11]), 0.0055, metal(blade));
    s.cap(add(hand, [0.03, 0, 0.045]), add(hand, [0.068, 0, 0.1]), 0.0025, metal(shade(blade, -0.25))); // groef
    s.cap(add(hand, [0.005, -0.02, 0.008]), add(hand, [0.005, 0.02, 0.008]), 0.005, metal('#b08a3a')); // pareerstang
    s.cap(add(hand, [-0.004, 0, -0.006]), add(hand, [-0.012, 0, -0.02]), 0.006, leather('#3a2414')); // greep
    s.ell(hand[0] - 0.014, hand[1], hand[2] - 0.024, 0.008, 0.008, 0.008, { k: 'gold' }); // knop
    if (!seated && L.look !== 'samurai') { // schede aan de heup
      s.cap([-0.006, 0.062, hipZ + 0.03], [-0.07, 0.07, hipZ - 0.09], 0.009, leather('#3a2414'));
      s.ell(-0.07, 0.07, hipZ - 0.092, 0.009, 0.009, 0.01, metal('#b08a3a'));
    }
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
  const hair = shade(coat, -0.55);
  const bob = walk ? Math.abs(Math.sin(a)) * 0.012 : 0;
  const bz = 0.33 + bob;
  const nod = walk ? Math.sin(a * 2) * 0.008 : 0;
  // benen (diagonaal paar beweegt samen): dij, scheen, kogel en hoef
  for (const [lx, side, ph] of [[0.11, 1, 0], [0.11, -1, Math.PI], [-0.12, 1, Math.PI], [-0.12, -1, 0]]) {
    const sw = walk ? Math.sin(a + ph) : 0; const lift = walk ? Math.max(0, Math.cos(a + ph)) * 0.035 : 0;
    const top = [lx, side * 0.042, bz - 0.03]; const knee = [lx + sw * 0.04 + 0.01, side * 0.045, 0.14 + lift];
    const hoof = [lx + sw * 0.07, side * 0.045, 0.015 + lift];
    s.cap(top, knee, lx > 0 ? 0.024 : 0.028, plain(coat)); s.cap(knee, hoof, 0.014, plain(shade(coat, -0.12)));
    s.ell(knee[0], knee[1], knee[2], 0.019, 0.017, 0.018, plain(shade(coat, -0.06))); // knie
    s.ell(hoof[0] + 0.004, hoof[1], hoof[2] + 0.022, 0.017, 0.016, 0.016, plain(shade(coat, -0.22))); // kogel
    s.ell(hoof[0] + 0.006, hoof[1], hoof[2], 0.021, 0.019, 0.015, plain('#2a1f17')); // hoef
  }
  // romp: borst, buik en kruis
  s.ell(0, 0, bz, 0.17, 0.074, 0.083, plain(coat));
  s.ell(0.11, 0, bz + 0.012, 0.075, 0.07, 0.08, plain(coat));
  s.ell(-0.12, 0, bz + 0.015, 0.08, 0.078, 0.082, plain(shade(coat, 0.04)));
  // hals en hoofd
  s.cap([0.13, 0, bz + 0.02], [0.21, 0, bz + 0.15 + nod], 0.05, plain(coat));
  s.cap([0.22, 0, bz + 0.165 + nod], [0.3, 0, bz + 0.1 + nod], 0.031, plain(coat));
  s.ell(0.226, 0, bz + 0.165 + nod, 0.04, 0.035, 0.034, plain(coat)); // kaak
  s.ell(0.31, 0, bz + 0.093 + nod, 0.024, 0.027, 0.026, plain(dark)); // snuit
  for (const side of [1, -1]) {
    s.ell(0.25, side * 0.026, bz + 0.158 + nod, 0.008, 0.005, 0.007, plain(DARK)); // ogen
    s.cap([0.2, side * 0.014, bz + 0.19 + nod], [0.195, side * 0.02, bz + 0.232 + nod], 0.008, plain(dark)); // oren
    s.ell(0.327, side * 0.011, bz + 0.098 + nod, 0.005, 0.004, 0.005, plain('#150f0b')); // neusgaten
  }
  // manen in plukjes langs de hals, staart in twee delen
  for (let k = 0; k < 5; k++) {
    const q = k / 4;
    s.ell(0.115 + q * 0.09, -0.006, bz + 0.07 + q * 0.14 + nod * q, 0.018, 0.02, 0.026, cloth(hair));
  }
  s.cap([0.19, 0, bz + 0.2 + nod], [0.24, 0, bz + 0.19 + nod], 0.012, cloth(hair)); // bles op het voorhoofd
  const tw = walk ? Math.sin(a) * 0.012 : 0;
  s.cap([-0.19, 0, bz + 0.04], [-0.23, 0, bz - 0.04], 0.02, cloth(hair));
  s.cap([-0.23, 0, bz - 0.04], [-0.245 + tw, tw, bz - 0.15], 0.017, cloth(hair));
  // hoofdstel en teugels (naar de handen van de ruiter)
  const lth = leather('#2e1d10');
  s.cap([0.29, 0.03, bz + 0.105 + nod], [0.29, -0.03, bz + 0.105 + nod], 0.004, lth); // neusriem
  s.cap([0.24, 0.035, bz + 0.13 + nod], [0.21, 0.03, bz + 0.2 + nod], 0.004, lth); // wangriem
  s.ell(0.3, 0.031, bz + 0.1 + nod, 0.005, 0.004, 0.005, metal('#c9a23a')); // bit
  s.cap([0.3, 0.033, bz + 0.1 + nod], [0.08, 0.045, bz + 0.2], 0.0028, lth); // teugel
  const hk = L.kit || '';
  if (L.armor && L.team) {
    s.ell(0, 0, bz - 0.01, 0.19, 0.082, 0.085, cloth(L.team), bz - 0.1);
    s.ell(0.12, 0, bz + 0.0, 0.08, 0.075, 0.085, cloth(L.team), bz - 0.1);
  } else if (hk.includes('B') && L.team) s.ell(-0.02, 0, bz + 0.01, 0.11, 0.079, 0.075, cloth(L.team), bz - 0.05); // hoefijzers: kleed
  if (hk.includes('H') && L.team) s.cap([0.2, 0, bz + 0.21 + nod], [0.15, 0, bz + 0.3 + nod], 0.014, cloth(L.team)); // flankrit: pluim
  if (L.armor && L.plate) {
    s.ell(0.24, 0, bz + 0.15 + nod, 0.045, 0.04, 0.05, metal('#c3cad3')); // halsstuk
    s.ell(0.27, 0, bz + 0.15 + nod, 0.04, 0.03, 0.02, metal('#d3d9e0')); // hoofdplaat
  }
  // zadel op een dekentje, met stijgbeugels
  s.ell(-0.01, 0, bz + 0.066, 0.075, 0.079, 0.012, cloth(L.team ? shade(L.team, -0.15) : '#7a6a48'));
  s.ell(-0.01, 0, bz + 0.075, 0.06, 0.07, 0.02, leather('#5a3a1e'));
  s.ell(0.04, 0, bz + 0.09, 0.014, 0.03, 0.022, leather('#4a2e18')); // zadelboog
  for (const side of [1, -1]) {
    s.cap([-0.005, side * 0.072, bz + 0.07], [0.04, side * 0.083, bz - 0.11], 0.0028, lth);
    s.ell(0.04, side * 0.083, bz - 0.115, 0.012, 0.006, 0.006, metal('#8e959f'));
  }
  // ruiter
  person(s, { ...L, horse: undefined }, mode === 'atk' ? 'atk' : 'idle', mode === 'atk' ? f : 0, bz + 0.05);
}

// schaap: wollen lijf uit plukjes, donkere kop, dunne poten; graast met de kop omlaag
export function sheep(s, L, mode, f) {
  const a = (f / 8) * TAU; const walk = mode === 'walk'; const graze = mode === 'graze';
  const wool = L.body || '#f2eee6'; const face = L.body && L.body !== '#f2eee6' ? '#2a2420' : '#3a3430';
  const bob = walk ? Math.abs(Math.sin(a)) * 0.008 : 0;
  const bz = 0.13 + bob;
  for (const [lx, side, ph] of [[0.08, 1, 0], [0.08, -1, Math.PI], [-0.08, 1, Math.PI], [-0.08, -1, 0]]) {
    const sw = walk ? Math.sin(a + ph) * 0.03 : 0; const lift = walk ? Math.max(0, Math.cos(a + ph)) * 0.02 : 0;
    s.cap([lx, side * 0.045, bz - 0.04], [lx + sw, side * 0.047, 0.012 + lift], 0.014, plain(face));
  }
  s.ell(0, 0, bz + 0.01, 0.14, 0.09, 0.085, cloth(wool));
  const R = [[0.07, 0.055, 0.04], [-0.06, 0.055, 0.035], [0.0, 0.065, 0.05], [0.06, -0.055, 0.04], [-0.07, -0.045, 0.04], [0.0, -0.065, 0.045], [0.04, 0.0, 0.075], [-0.05, 0.0, 0.07], [0.11, 0.0, 0.03], [-0.12, 0.0, 0.03], [0.07, 0.03, -0.02], [-0.07, 0.03, -0.02]];
  for (const [x, y, z] of R) s.ell(x, y, bz + z - 0.01, 0.056, 0.05, 0.05, cloth(shade(wool, (x + y) * 0.6)));
  const hx = graze ? 0.17 : 0.15; const hz = graze ? 0.05 : bz + 0.07;
  s.cap([0.11, 0, bz + 0.02], [hx, 0, hz], 0.026, cloth(shade(wool, -0.05))); // hals
  s.ell(hx + 0.02, 0, hz, 0.045, 0.032, 0.035, plain(face));
  for (const side of [1, -1]) {
    s.ell(hx + 0.005, side * 0.035, hz + 0.012, 0.012, 0.018, 0.007, plain(face)); // oren
    s.ell(hx + 0.045, side * 0.018, hz + 0.01, 0.005, 0.005, 0.005, plain('#0e0b09')); // ogen
  }
  s.ell(-0.125, 0, bz + 0.03, 0.02, 0.02, 0.02, cloth(wool)); // staartje
}

// everzwijn: borstelig lijf, kam op de rug, snuit met slagtanden
export function boar(s, L, mode, f) {
  const a = (f / 8) * TAU; const walk = mode === 'walk';
  const bob = walk ? Math.abs(Math.sin(a)) * 0.01 : 0;
  const bz = 0.18 + bob;
  const hide = { k: 'leather', c: rgb('#4a3628') };
  for (const [lx, side, ph] of [[0.1, 1, 0], [0.1, -1, Math.PI], [-0.1, 1, Math.PI], [-0.1, -1, 0]]) {
    const sw = walk ? Math.sin(a + ph) * 0.04 : 0; const lift = walk ? Math.max(0, Math.cos(a + ph)) * 0.025 : 0;
    s.cap([lx, side * 0.045, bz - 0.04], [lx + sw, side * 0.048, 0.014 + lift], 0.018, plain('#2b1d14'));
    s.ell(lx + sw + 0.006, side * 0.048, 0.008 + lift, 0.016, 0.014, 0.009, plain('#15100c'));
  }
  s.ell(0, 0, bz, 0.17, 0.085, 0.1, hide);
  s.ell(0.07, 0, bz + 0.02, 0.09, 0.085, 0.1, hide); // schoft
  for (let i = 0; i < 11; i++) { const x = -0.13 + i * 0.026; const z = bz + 0.088 + (i > 5 ? 0.015 : 0) - Math.abs(i - 6) * 0.003; s.cap([x, 0, z], [x - 0.01, 0, z + 0.018], 0.011, plain('#1f1610')); } // borstels
  s.cap([0.15, 0, bz + 0.03], [0.27, 0, bz - 0.04], 0.05, hide); // kop
  s.ell(0.3, 0, bz - 0.055, 0.022, 0.03, 0.026, plain('#c99a86')); // snuit
  for (const side of [1, -1]) {
    s.ell(0.318, side * 0.011, bz - 0.055, 0.005, 0.005, 0.006, plain('#5a3a30'));
    s.cap([0.27, side * 0.03, bz - 0.07], [0.29, side * 0.04, bz - 0.02], 0.006, plain('#f4efe0', true)); // slagtanden
    s.ell(0.2, side * 0.035, bz + 0.03, 0.007, 0.006, 0.006, plain('#120c08')); // ogen
    s.cap([0.16, side * 0.035, bz + 0.06], [0.15, side * 0.045, bz + 0.1], 0.012, plain('#2b1d14')); // oren
  }
  s.cap([-0.17, 0, bz + 0.03], [-0.21, 0, bz - 0.04], 0.006, plain('#2b1d14')); // staart
}

// dezelfde scène, verschoven (om een figuur op een olifant te zetten)
const at = (s, dx, dy, dz) => ({
  cap: (a, b, r, m) => s.cap([a[0] + dx, a[1] + dy, a[2] + dz], [b[0] + dx, b[1] + dy, b[2] + dz], r, m),
  ell: (cx, cy, cz, rx, ry, rz, m, zmin = -1e9) => s.ell(cx + dx, cy + dy, cz + dz, rx, ry, rz, m, zmin + dz),
  cyl: (cx, cy, r, z0, z1, m) => s.cyl(cx + dx, cy + dy, r, z0 + dz, z1 + dz, m),
  cone: (cx, cy, r, z0, z1, m) => s.cone(cx + dx, cy + dy, r, z0 + dz, z1 + dz, m),
});
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Oorlogsolifant (Perzen): gerimpelde huid, slagtanden met gouden punten, een kleed in de teamkleur met gouden franje,
// een torentje met een boogschutter en een berijder op de nek. Lopen: telkens één poot (zoals een echte olifant).
// Aanval (8 beelden, 0 = de stoot): kop omlaag en slagtanden vooruit, daarna kop en slurf omhoog en een voorpoot op.
const E_HEAD_DZ = [-0.05, -0.035, -0.01, 0.02, 0.05, 0.07, 0.06, 0.0];
const E_HEAD_DX = [0.04, 0.025, 0.01, -0.005, -0.015, -0.02, -0.01, 0.02];
const E_TRUNK = [0.0, 0.08, 0.25, 0.5, 0.8, 1.0, 0.85, 0.3]; // 0 = hangt, 1 = opgerold omhoog
const E_STOMP = [0, 0, 0.02, 0.05, 0.09, 0.11, 0.08, 0.03];
const T_HANG = [[0, 0, 0], [0.05, 0, -0.085], [0.075, 0, -0.18], [0.085, 0, -0.27], [0.092, 0, -0.355], [0.12, 0, -0.405]];
const T_UP = [[0, 0, 0], [0.075, 0, 0.025], [0.125, 0, 0.095], [0.135, 0, 0.18], [0.105, 0, 0.245], [0.06, 0, 0.255]];
const T_R = [0.05, 0.043, 0.036, 0.03, 0.025, 0.021];

export function elephant(s, L, mode, f) {
  const a = (f / 8) * TAU;
  const walk = mode === 'walk'; const atk = mode === 'atk';
  const team = L.team || '#c0392b';
  const skin = { k: 'hide', c: rgb('#726b63') };
  const skinD = { k: 'hide', c: rgb('#5f5952') };
  const bob = walk ? Math.abs(Math.sin(a * 2)) * 0.008 : 0;
  const bz = 0.5 + bob;
  // poten: zuilen met een knie, ronde voeten met teennagels; lopen in de volgorde links-achter, links-voor, rechts-achter, rechts-voor
  for (const [lx, side, ph, hind] of [[0.15, 1, 0.25, false], [0.15, -1, 0.75, false], [-0.17, 1, 0, true], [-0.17, -1, 0.5, true]]) {
    const q = (a / TAU + ph) * TAU;
    const sw = walk ? Math.sin(q) * 0.055 : 0;
    let lift = walk ? Math.max(0, Math.cos(q)) * 0.04 : 0;
    let fx = lx + sw;
    if (atk && !hind && side === 1) { lift = E_STOMP[f]; fx = lx + E_STOMP[f] * 0.6; }
    const top = [lx, side * 0.088, bz - 0.04];
    const knee = [(lx + fx) / 2 + (hind ? -0.01 : 0.012), side * 0.09, 0.25 + lift * 0.6];
    const foot = [fx, side * 0.09, 0.05 + lift];
    s.cap(top, knee, hind ? 0.082 : 0.076, skin);
    s.cap(knee, foot, 0.066, skin);
    s.ell(knee[0] + (hind ? -0.01 : 0.01), knee[1], knee[2], 0.07, 0.068, 0.056, skin); // knie
    s.ell(foot[0], foot[1], foot[2] - 0.008, 0.076, 0.074, 0.046, skinD); // voet
    for (const dy of [-0.036, 0, 0.036]) s.ell(foot[0] + 0.066, foot[1] + dy, foot[2] - 0.022, 0.015, 0.014, 0.013, plain('#e3d9c6')); // teennagels
    if (L.team) s.cyl(foot[0], foot[1], 0.071, foot[2] + 0.035, foot[2] + 0.055, { k: 'gold' }); // gouden enkelband
  }
  // romp: buik, schouders (hoogste punt) en achterhand
  s.ell(0, 0, bz, 0.3, 0.16, 0.17, skin);
  s.ell(0.13, 0, bz + 0.035, 0.17, 0.155, 0.19, skin);
  s.ell(-0.17, 0, bz + 0.015, 0.16, 0.155, 0.175, skin);
  s.ell(0.0, 0, bz - 0.09, 0.24, 0.13, 0.09, skinD); // buik
  // staart met een pluim
  const tw = walk ? Math.sin(a) * 0.02 : 0;
  s.cap([-0.33, 0, bz + 0.06], [-0.36, tw * 0.5, bz - 0.08], 0.013, skin);
  s.cap([-0.36, tw * 0.5, bz - 0.08], [-0.36, tw, bz - 0.17], 0.01, skin);
  s.ell(-0.36, tw, bz - 0.19, 0.012, 0.012, 0.025, plain('#2a2420'));
  // kleed in de teamkleur over de rug, met een donkere band, gouden boord en franje
  s.ell(-0.01, 0, bz + 0.04, 0.29, 0.168, 0.185, cloth(shade(team, -0.35)), bz - 0.05); // donkere band onderaan
  s.ell(-0.01, 0, bz + 0.04, 0.294, 0.171, 0.188, cloth(team), bz - 0.012);
  s.ell(-0.01, 0, bz - 0.052, 0.296, 0.172, 0.012, { k: 'gold' });
  for (let i = 0; i < 9; i++) {
    const x = -0.24 + i * 0.06; const y = 0.172 * Math.sqrt(Math.max(0, 1 - ((x + 0.01) / 0.3) ** 2));
    s.cap([x, y, bz - 0.06], [x, y + 0.004, bz - 0.095], 0.008, { k: 'gold' });
    s.ell(x, y + 0.004, bz - 0.1, 0.011, 0.011, 0.011, plain(shade(team, -0.2)));
  }
  s.ell(0.0, 0.17, bz + 0.0, 0.045, 0.012, 0.045, { k: 'gold' }); // medaillon op de flank
  s.ell(0.0, 0.176, bz + 0.0, 0.026, 0.008, 0.026, plain(shade(team, 0.35)));
  // kop
  const hx = 0.34 + (atk ? E_HEAD_DX[f] : 0); const hz = bz + 0.12 + (atk ? E_HEAD_DZ[f] : walk ? Math.sin(a * 2) * 0.006 : 0);
  s.cap([0.2, 0, bz + 0.08], [hx - 0.03, 0, hz - 0.01], 0.13, skin); // nek
  s.ell(hx, 0, hz, 0.12, 0.105, 0.13, skin);
  for (const side of [1, -1]) s.ell(hx + 0.025, side * 0.042, hz + 0.08, 0.07, 0.05, 0.06, skin); // twee bulten op het voorhoofd
  s.ell(hx + 0.05, 0, hz - 0.075, 0.08, 0.08, 0.07, skin); // kaak
  // oren: groot en plat, flapperen bij het lopen
  const flap = walk ? Math.sin(a * 2) * 0.012 : atk ? 0.02 : 0;
  for (const side of [1, -1]) {
    s.ell(hx - 0.07, side * (0.118 + flap), hz - 0.005, 0.078, 0.016, 0.11, skinD);
    s.ell(hx - 0.068, side * (0.124 + flap), hz - 0.01, 0.06, 0.01, 0.088, { k: 'hide', c: rgb('#9c8c86') }); // binnenkant
    s.ell(hx + 0.072, side * 0.087, hz + 0.02, 0.013, 0.008, 0.011, plain(DARK)); // oog
    s.cap([hx + 0.07, side * 0.09, hz + 0.036], [hx + 0.05, side * 0.094, hz + 0.042], 0.004, plain('#4e4a46')); // ooglid
  }
  // kopkleed in de teamkleur dat vooraan over het voorhoofd hangt, met een gouden rand, schijf en belletjes
  s.ell(hx + 0.088, 0, hz + 0.045, 0.05, 0.082, 0.12, { k: 'gold' });
  s.ell(hx + 0.094, 0, hz + 0.047, 0.05, 0.072, 0.11, cloth(team));
  s.ell(hx + 0.142, 0, hz + 0.075, 0.008, 0.026, 0.026, { k: 'gold' });
  s.ell(hx + 0.147, 0, hz + 0.075, 0.005, 0.014, 0.014, plain(shade(team, 0.35)));
  for (const dy of [-0.05, 0, 0.05]) s.ell(hx + 0.13, dy, hz - 0.075, 0.012, 0.012, 0.012, { k: 'gold' });
  // slurf: van hangend (met wat zwaai) tot opgerold omhoog
  const tu = atk ? E_TRUNK[f] : 0;
  const base = [hx + 0.11, 0, hz - 0.03];
  const pts = T_HANG.map((ph, i) => {
    const t = i / (T_HANG.length - 1);
    const p = lerp3(ph, T_UP[i], tu);
    return [base[0] + p[0], base[1] + p[1] + (walk ? Math.sin(a + 0.6) * 0.03 * t * t : 0), base[2] + p[2]];
  });
  for (let i = 0; i < pts.length - 1; i++) s.cap(pts[i], pts[i + 1], T_R[i], skin);
  const tip = pts[pts.length - 1];
  s.ell(tip[0] + 0.012, tip[1], tip[2] + (tu > 0.5 ? 0.01 : -0.012), 0.022, 0.022, 0.018, skinD);
  s.ell(hx + 0.085, 0, hz - 0.125, 0.03, 0.035, 0.022, plain('#6e5a55')); // onderlip
  // slagtanden (ivoor) die naar voren en omhoog buigen, met gouden punten
  for (const side of [1, -1]) {
    const t0 = [hx + 0.095, side * 0.048, hz - 0.085]; const t1 = [hx + 0.19, side * 0.054, hz - 0.13]; const t2 = [hx + 0.27, side * 0.058, hz - 0.085];
    s.cap(t0, t1, 0.019, plain('#efe6d2', true)); s.cap(t1, t2, 0.015, plain('#f4eddc', true));
    s.cap(t2, [t2[0] + 0.03, t2[1], t2[2] + 0.025], 0.012, { k: 'gold' });
    s.cyl(t0[0] + 0.02, t0[1], 0.022, t0[2] - 0.03, t0[2] - 0.01, { k: 'gold' }); // ring
  }
  // zadelkleed en torentje (howdah) van hout met gouden boorden en kantelen
  const tx = -0.07; const z0 = bz + 0.19;
  s.ell(tx, 0, z0 - 0.015, 0.17, 0.16, 0.03, cloth(shade(team, -0.25)));
  s.box(tx - 0.13, -0.115, z0, tx + 0.13, 0.115, z0 + 0.03, wood('#5c3b1f'));
  const wallM = { k: 'wood', c: rgb('#8a5f35'), bw: 0.028 };
  const wz = z0 + 0.13;
  s.box(tx - 0.13, 0.1, z0 + 0.03, tx + 0.13, 0.115, wz, wallM); // linkerwand (naar de kijker)
  s.box(tx - 0.13, -0.115, z0 + 0.03, tx + 0.13, -0.1, wz, wallM);
  s.box(tx + 0.115, -0.115, z0 + 0.03, tx + 0.13, 0.115, wz, wallM); // voorwand
  s.box(tx - 0.13, -0.115, z0 + 0.03, tx - 0.115, 0.115, wz, wallM);
  for (const [x0, y0, x1, y1] of [[tx - 0.135, 0.098, tx + 0.135, 0.12], [tx - 0.135, -0.12, tx + 0.135, -0.098], [tx + 0.113, -0.12, tx + 0.135, 0.12], [tx - 0.135, -0.12, tx - 0.113, 0.12]]) {
    s.box(x0, y0, wz - 0.012, x1, y1, wz, { k: 'gold' });
    s.box(x0, y0, z0 + 0.03, x1, y1, z0 + 0.042, { k: 'gold' });
  }
  for (let i = 0; i < 4; i++) { // kantelen op de linkerwand en de voorwand
    const x = tx - 0.1 + i * 0.066;
    s.box(x - 0.018, 0.1, wz, x + 0.018, 0.115, wz + 0.035, wallM);
    const y = -0.08 + i * 0.053;
    s.box(tx + 0.115, y - 0.016, wz, tx + 0.13, y + 0.016, wz + 0.035, wallM);
  }
  s.ell(tx, 0.117, z0 + 0.085, 0.03, 0.006, 0.03, cloth(team)); // schildje in teamkleur
  s.ell(tx, 0.121, z0 + 0.085, 0.014, 0.004, 0.014, { k: 'gold' });
  // vaandel achteraan
  s.cap([tx - 0.12, -0.09, z0 + 0.03], [tx - 0.12, -0.09, z0 + 0.5], 0.007, wood('#5c3b1f'));
  s.ell(tx - 0.12, -0.09, z0 + 0.51, 0.011, 0.011, 0.011, { k: 'gold' });
  const wave = walk ? Math.sin(a) * 0.01 : 0;
  s.ell(tx - 0.06, -0.09 + wave, z0 + 0.45, 0.06, 0.005, 0.04, cloth(team));
  // boogschutter in het torentje
  const P = at(s, tx + 0.01, 0, z0 - 0.045); // voeten in het torentje: de schutter staat tot zijn heupen achter de wand
  person(P, { team, body: '#1f6f78', leg: '#3a2a1c', hat: '#e8dcc0', weapon: 'bow', skin: 2, kit: L.kit }, atk ? 'atk' : 'idle', atk ? f : 0);
  // berijder (mahout) op de nek, met een stok
  person(at(s, 0.215, 0, 0), { body: '#c9a66b', leg: '#6b4a2b', skin: 3, look: 'mahout' }, 'idle', 0, bz + 0.165);
  s.cap([0.29, -0.06, bz + 0.27], [0.36, -0.07, bz + 0.33], 0.005, wood('#5c3b1f'));
}

// Stormram: een overdekt onderstel op vier spaakwielen, een dak van natte huiden met touwen, een stam aan kettingen met
// een ijzeren ramskop en een vaandel in de teamkleur. Rijden: de wielen draaien. Aanval (0 = de stoot): de stam zwaait
// naar achter en slaat naar voren.
const RAM_X = [0.075, 0.035, -0.02, -0.065, -0.095, -0.11, -0.085, -0.01];
export function ram(s, L, mode, f) {
  const walk = mode === 'walk'; const atk = mode === 'atk';
  const team = L.team || '#c0392b';
  const timber = wood('#6e4826'); const timberD = wood('#4f331b');
  const iron = metal('#5f666e');
  // wielen: schijf, vier spaken (draaien bij het rijden), ijzeren band en naaf
  const spin = walk ? (f / 8) * (Math.PI / 4) : 0;
  const R = 0.078; const wz = 0.078;
  for (const wx of [-0.21, 0.21]) {
    for (const side of [1, -1]) {
      const wy = side * 0.17;
      s.hcyl('y', wx, wz, R, wy - 0.016, wy + 0.016, wood('#5a3a1e'));
      const fy = wy + side * 0.018;
      for (let k = 0; k < 4; k++) {
        const an = spin + (k / 4) * Math.PI;
        s.cap([wx + Math.cos(an) * R * 0.82, fy, wz + Math.sin(an) * R * 0.82], [wx - Math.cos(an) * R * 0.82, fy, wz - Math.sin(an) * R * 0.82], 0.008, wood('#8a6238'));
      }
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * TAU; const a1 = ((k + 1) / 12) * TAU;
        s.cap([wx + Math.cos(a0) * R, fy - side * 0.004, wz + Math.sin(a0) * R], [wx + Math.cos(a1) * R, fy - side * 0.004, wz + Math.sin(a1) * R], 0.009, iron);
      }
      s.hcyl('y', wx, wz, 0.02, side > 0 ? wy : wy - 0.03, side > 0 ? wy + 0.03 : wy, iron); // naaf
    }
    s.hcyl('y', wx, wz, 0.012, -0.175, 0.175, iron); // as
  }
  // onderstel en palen
  for (const side of [1, -1]) s.box(-0.35, side > 0 ? 0.115 : -0.15, 0.115, 0.35, side > 0 ? 0.15 : -0.115, 0.155, timber);
  for (const x of [-0.31, 0, 0.31]) s.box(x - 0.02, -0.15, 0.115, x + 0.02, 0.15, 0.15, timberD);
  for (const x of [-0.32, 0.32]) for (const side of [1, -1]) s.cap([x, side * 0.13, 0.15], [x, side * 0.13, 0.29], 0.017, timber);
  // de stam aan kettingen, met ijzeren banden; vooraan steekt hij uit met een ijzeren ramskop
  const lx = atk ? RAM_X[f] : walk ? Math.sin((f / 8) * TAU) * 0.008 : 0;
  const cz = 0.215 + Math.abs(Math.min(0, lx)) * 0.22;
  const x0 = -0.3 + lx; const x1 = 0.47 + lx;
  s.hcyl('x', 0, cz, 0.045, x0, x1, { k: 'wood', c: rgb('#7a5530'), bw: 0.02 });
  for (const bx of [-0.2, 0.08, 0.36]) s.hcyl('x', 0, cz, 0.049, bx + lx - 0.014, bx + lx + 0.014, iron);
  for (const hx of [-0.14, 0.14]) s.cap([hx, 0, 0.47], [hx + lx, 0, cz + 0.04], 0.006, metal('#55595f')); // kettingen
  const head = metal('#6d747c'); const horn = metal('#8c7240');
  s.ell(x1 + 0.065, 0, cz - 0.004, 0.09, 0.06, 0.058, head);
  s.ell(x1 + 0.025, 0, cz + 0.035, 0.06, 0.062, 0.05, head);
  s.ell(x1 + 0.135, 0, cz - 0.014, 0.028, 0.04, 0.036, metal('#545a61')); // snuit
  for (const side of [1, -1]) {
    const H = [[x1 + 0.005, side * 0.04, cz + 0.06], [x1 - 0.05, side * 0.075, cz + 0.07], [x1 - 0.07, side * 0.1, cz + 0.008], [x1 - 0.025, side * 0.104, cz - 0.045], [x1 + 0.025, side * 0.088, cz - 0.034]];
    for (let k = 0; k < H.length - 1; k++) s.cap(H[k], H[k + 1], 0.025 - k * 0.0035, horn);
    s.ell(x1 + 0.085, side * 0.05, cz + 0.016, 0.01, 0.007, 0.009, plain('#d8b23a', true)); // ogen
  }
  // dak van natte huiden: steil, laag tot boven de wielen, met lappen, touwen en een nokbalk
  const hideM = { k: 'leather', c: rgb('#5e4430') };
  s.gable(-0.35, -0.13, 0.35, 0.13, 0.285, 0.235, 'x', hideM, 0.05);
  s.cap([-0.39, 0, 0.523], [0.39, 0, 0.523], 0.018, timberD);
  for (const x of [-0.24, 0, 0.24]) for (const side of [1, -1]) s.cap([x, side * 0.18, 0.287], [x, 0, 0.527], 0.0055, plain('#a88e5e'));
  // huiden die opzij tot net boven de wielen hangen, met schilden in de teamkleur
  for (const side of [1, -1]) s.box(-0.36, side > 0 ? 0.165 : -0.175, 0.16, 0.36, side > 0 ? 0.175 : -0.165, 0.29, { k: 'leather', c: rgb('#4f3a28') });
  for (const x of [-0.18, 0.12]) {
    s.ell(x, 0.181, 0.225, 0.052, 0.008, 0.052, wood('#4a3020'));
    s.ell(x, 0.186, 0.225, 0.046, 0.007, 0.046, cloth(team));
    s.ell(x, 0.192, 0.225, 0.013, 0.006, 0.013, { k: 'gold' });
  }
  // voorkant: een plank met een opening voor de stam
  s.box(0.345, -0.13, 0.27, 0.36, 0.13, 0.32, timber);
  // vaandel in de teamkleur op de nok
  s.cap([-0.3, 0, 0.52], [-0.3, 0, 0.8], 0.008, timberD);
  s.ell(-0.3, 0, 0.81, 0.012, 0.012, 0.012, { k: 'gold' });
  const wave = walk ? Math.sin((f / 8) * TAU) * 0.008 : 0;
  s.ell(-0.235, wave, 0.75, 0.065, 0.006, 0.045, cloth(team));
  s.ell(-0.225, wave + 0.004, 0.75, 0.02, 0.004, 0.02, { k: 'gold' });
}

// de opties van de getekende figuur → een scène
export function figureScene(kind, L, mode, f) {
  const s = new Scene();
  if (kind === 'h') horse(s, L, mode, f);
  else if (kind === 's') sheep(s, L, mode, f);
  else if (kind === 'b') boar(s, L, mode, f);
  else if (kind === 'e') elephant(s, L, mode, f);
  else if (kind === 'r') ram(s, L, mode, f);
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
  ['olifant', () => figureScene('e', { team: '#c0392b' }, 'walk', 2), { ground: false, scale: 4, show: 2, fill: 0.5, ao: 3 }],
  ['ram', () => figureScene('r', { team: '#c0392b' }, 'idle', 0), { ground: false, scale: 4, show: 3, fill: 0.5, ao: 3 }],
];
