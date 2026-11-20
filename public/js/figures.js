// Mensen en ruiters: getekend met armen, gereedschap, schilden in teamkleur en een donkere omlijning.
// Elk animatiebeeld wordt één keer getekend en daarna gecachet: per beeld is een figuur dan één kopie.
// Coördinaten: voeten op (0, 0), de figuur kijkt naar rechts; 1 eenheid = 1 wereldpixel bij s = 1.

const TAU = Math.PI * 2;
const FR = 8; // animatiebeelden per stap- of werkcyclus

const SKIN = ['#f1c9a0', '#e0ac7e', '#c98e5f', '#8d5a3b'];
const HAIR = ['#6b4a2b', '#3b2a1a', '#a0703c', '#1f1a16'];
const IRON = '#9aa3ad';
const WOOD = '#7a5129';

function rgb(h) {
  if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) {
  const [r, g, b] = rgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const f = (c) => Math.round(c + (t - c) * p);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------- cache ----------

const cache = new Map();
const MAX_SPRITES = 2400;

// resolutie van de sprite afstemmen op hoe groot de figuur nu op het scherm staat
function resFor(ctx, s) {
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b) * s;
  return sc <= 1.3 ? 1.3 : sc <= 2 ? 2 : sc <= 3 ? 3 : sc <= 4.5 ? 4.5 : 6.5;
}

function sprite(key, R, box, draw) {
  let cv = cache.get(key);
  if (cv) return cv;
  if (cache.size >= MAX_SPRITES) {
    let n = 0;
    for (const k of cache.keys()) { cache.delete(k); if (++n >= 500) break; }
  }
  const [x0, y0, x1, y1] = box;
  const w = Math.ceil((x1 - x0) * R); const h = Math.ceil((y1 - y0) * R);
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const c = src.getContext('2d');
  c.scale(R, R); c.translate(-x0, -y0);
  c.lineCap = 'round'; c.lineJoin = 'round';
  draw(c);
  // donkere omlijning: figuren blijven leesbaar tegen gras, bos en gebouwen
  cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const o = cv.getContext('2d');
  const px = Math.max(0.9, R * 0.36);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7]]) o.drawImage(src, dx * px, dy * px);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = 'rgba(36,24,14,0.92)';
  o.fillRect(0, 0, w, h);
  o.globalCompositeOperation = 'source-over';
  o.drawImage(src, 0, 0);
  cache.set(key, cv);
  return cv;
}

function blit(ctx, cv, box, x, y, s) {
  const [x0, y0, x1, y1] = box;
  ctx.drawImage(cv, x + x0 * s, y + y0 * s, (x1 - x0) * s, (y1 - y0) * s);
}

const frameOf = (phase) => {
  const p = ((phase || 0) % TAU + TAU) % TAU;
  return Math.floor((p / TAU) * FR) % FR;
};

// ---------- onderdelen ----------

function line(c, x0, y0, x1, y1, col, w) {
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
}
function disc(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

// arm vanaf de schouder; hoek 0 = recht omlaag, positief = naar voren (rechts)
function arm(c, sx, sy, ang, sleeve, skin, len = 4.4) {
  const ex = sx + Math.sin(ang) * len; const ey = sy + Math.cos(ang) * len;
  const mx = sx + Math.sin(ang) * len * 0.55; const my = sy + Math.cos(ang) * len * 0.55;
  line(c, sx, sy, mx, my, sleeve, 1.7);
  line(c, mx, my, ex, ey, shade(sleeve, -0.08), 1.45);
  disc(c, ex, ey, 0.78, skin);
  return [ex, ey];
}

// gereedschap in de hand; rot = 0: steel recht omhoog
function tool(c, kind, hx, hy, rot) {
  c.save(); c.translate(hx, hy); c.rotate(rot);
  line(c, 0, 1.6, 0, -6.6, '#8a5f33', 0.95);
  c.fillStyle = IRON;
  if (kind === 'pick') {
    c.strokeStyle = '#7f8892'; c.lineWidth = 1.05;
    c.beginPath(); c.moveTo(-2.8, -5.2); c.quadraticCurveTo(0, -7.6, 2.8, -5.2); c.stroke();
    c.strokeStyle = '#d5dbe2'; c.lineWidth = 0.35;
    c.beginPath(); c.moveTo(-2.2, -5.9); c.quadraticCurveTo(0, -7.6, 2.2, -5.9); c.stroke();
  } else if (kind === 'hoe') {
    c.beginPath(); c.moveTo(0, -6.8); c.lineTo(2.6, -6.2); c.lineTo(2.4, -5.1); c.lineTo(0, -5.6); c.closePath(); c.fill();
  } else if (kind === 'hammer') {
    c.fillRect(-1.6, -7.2, 3.2, 1.7);
  } else { // bijl
    c.beginPath(); c.moveTo(0.2, -6.9); c.quadraticCurveTo(2.9, -7.6, 2.9, -5.6); c.quadraticCurveTo(2.9, -4.1, 0.2, -4.6); c.closePath(); c.fill();
    c.fillStyle = '#e4e9ee'; c.beginPath(); c.moveTo(2.9, -7.2); c.quadraticCurveTo(3.3, -5.6, 2.9, -4.3); c.lineTo(2.5, -4.5); c.quadraticCurveTo(2.8, -5.6, 2.5, -7); c.fill();
  }
  c.restore();
}

// wat een dorpeling naar huis draagt
function load(c, kind, x, y) {
  if (kind === 'wood') {
    for (const [dx, dy] of [[0, 0.7], [-0.4, -0.4], [0.5, -0.5]]) {
      c.fillStyle = '#8b5a2b'; c.beginPath(); c.ellipse(x + dx, y + dy, 4, 0.9, -0.28, 0, TAU); c.fill();
      c.fillStyle = '#e0b47a'; c.beginPath(); c.ellipse(x + dx + 3.8, y + dy - 1.05, 0.55, 0.85, -0.28, 0, TAU); c.fill();
    }
  } else if (kind === 'stone') {
    c.fillStyle = '#a7a297'; c.beginPath(); c.moveTo(x - 2.6, y + 1.2); c.lineTo(x - 2, y - 1.3); c.lineTo(x + 0.6, y - 2); c.lineTo(x + 2.7, y - 0.4); c.lineTo(x + 2.2, y + 1.4); c.closePath(); c.fill();
    c.fillStyle = '#cdc9bf'; c.beginPath(); c.moveTo(x - 2, y - 1.3); c.lineTo(x + 0.6, y - 2); c.lineTo(x + 0.2, y - 0.2); c.lineTo(x - 1.8, y); c.closePath(); c.fill();
  } else if (kind === 'gold') {
    c.fillStyle = '#b08850'; c.beginPath(); c.ellipse(x, y + 0.2, 2.7, 2, 0, 0, TAU); c.fill();
    c.fillStyle = '#8a6a3c'; c.fillRect(x - 0.8, y - 2.2, 1.6, 1.2);
    for (const [dx, dy] of [[-1, -0.6], [0.6, -0.9], [1.3, 0.2]]) disc(c, x + dx, y + dy, 0.6, '#f6d046');
  } else if (kind === 'food') {
    c.fillStyle = '#b5864a'; c.beginPath(); c.moveTo(x - 2.8, y - 0.6); c.lineTo(x + 2.8, y - 0.6); c.lineTo(x + 2.1, y + 1.8); c.lineTo(x - 2.1, y + 1.8); c.closePath(); c.fill();
    c.strokeStyle = '#8a6334'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(x - 2.5, y + 0.4); c.lineTo(x + 2.5, y + 0.4); c.stroke();
    for (const [dx, col] of [[-1.5, '#d9483b'], [0, '#e9b93a'], [1.4, '#d9483b'], [-0.6, '#6ba33a'], [0.8, '#e9b93a']]) disc(c, x + dx, y - 1 + (dx % 1 ? -0.4 : 0), 0.85, col);
  } else {
    c.fillStyle = kind; c.beginPath(); c.ellipse(x, y, 2.9, 1.9, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(x - 0.8, y - 0.6, 1.1, 0.6, 0, 0, TAU); c.fill();
  }
}

function roundShield(c, x, y, r, col, wood) {
  disc(c, x, y, r, wood ? '#6b4a2b' : shade(col, -0.35));
  disc(c, x, y, r * 0.84, wood ? '#8a6238' : col);
  if (wood) { line(c, x - r * 0.8, y, x + r * 0.8, y, '#6b4a2b', 0.3); line(c, x, y - r * 0.8, x, y + r * 0.8, '#6b4a2b', 0.3); }
  else { c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(x - r * 0.25, y - r * 0.25, r * 0.5, 0, TAU); c.fill(); }
  disc(c, x, y, r * 0.28, IRON);
}

function kiteShield(c, x, y, col) {
  const path = () => { c.beginPath(); c.moveTo(x - 2.3, y - 3.4); c.quadraticCurveTo(x, y - 4.2, x + 2.3, y - 3.4); c.lineTo(x + 2.1, y + 0.6); c.quadraticCurveTo(x + 1.2, y + 3.2, x, y + 4.4); c.quadraticCurveTo(x - 1.2, y + 3.2, x - 2.1, y + 0.6); c.closePath(); };
  path(); c.fillStyle = shade(col, -0.35); c.fill();
  c.save(); c.translate(x, y); c.scale(0.84, 0.86); c.translate(-x, -y); path(); c.fillStyle = col; c.fill(); c.restore();
  c.fillStyle = 'rgba(255,248,225,0.85)'; c.fillRect(x - 0.35, y - 3.2, 0.7, 6.4); c.fillRect(x - 1.8, y - 1.2, 3.6, 0.7);
}

// hoofd met haar, oog en hoofddeksel
function head(c, o, hx, hy) {
  const skin = SKIN[o.skin || 0];
  const hair = HAIR[(o.skin || 0) % HAIR.length];
  if (!o.helmet && !o.barb && !(o.hat && o.weapon === 'bow')) {
    c.fillStyle = hair; c.beginPath(); c.arc(hx - 0.5, hy - 0.2, 2.75, 0, TAU); c.fill();
  }
  disc(c, hx, hy, 2.55, skin);
  c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.arc(hx, hy, 2.55, -0.9, 1.6); c.lineTo(hx, hy); c.fill();
  disc(c, hx + 1.35, hy - 0.15, 0.36, '#2a1a10');
  disc(c, hx + 1.05, hy + 1.05, 0.55, 'rgba(225,95,75,0.28)');
  if (o.barb) {
    c.fillStyle = '#7a4a24'; c.beginPath(); c.moveTo(hx - 1.2, hy + 0.8); c.quadraticCurveTo(hx + 0.6, hy + 4.4, hx + 2.4, hy + 0.9); c.closePath(); c.fill();
    c.fillStyle = '#5c5f63'; c.beginPath(); c.arc(hx, hy - 0.6, 2.75, Math.PI, 0); c.fill();
    c.fillRect(hx - 2.9, hy - 0.9, 5.8, 0.9);
    c.strokeStyle = '#efe6d2'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(hx - 2.4, hy - 1.6); c.quadraticCurveTo(hx - 4.4, hy - 3, hx - 3.4, hy - 5.4); c.stroke();
    c.beginPath(); c.moveTo(hx + 2.4, hy - 1.6); c.quadraticCurveTo(hx + 4.4, hy - 3, hx + 3.4, hy - 5.4); c.stroke();
    return;
  }
  if (o.helmet) {
    c.fillStyle = o.helmet; c.beginPath(); c.arc(hx, hy - 0.5, 2.85, Math.PI, 0); c.fill();
    c.fillStyle = shade(o.helmet, -0.25); c.fillRect(hx - 3, hy - 0.8, 6, 0.85);
    c.fillStyle = shade(o.helmet, -0.1); c.fillRect(hx + 1.3, hy - 0.7, 0.6, 2);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.arc(hx - 0.9, hy - 2, 0.9, 0, TAU); c.fill();
    if (o.armor && o.team) { c.fillStyle = o.team; c.beginPath(); c.ellipse(hx - 0.6, hy - 3.6, 1.6, 0.9, -0.4, 0, TAU); c.fill(); }
    return;
  }
  if (o.hat && o.weapon === 'bow') { // kap
    c.fillStyle = o.hat; c.beginPath();
    c.moveTo(hx - 3.1, hy + 2.2); c.quadraticCurveTo(hx - 3.6, hy - 3.6, hx + 0.6, hy - 3.2);
    c.quadraticCurveTo(hx + 3.2, hy - 2.6, hx + 2.6, hy - 0.4); c.lineTo(hx + 0.8, hy - 1.3); c.lineTo(hx - 1.2, hy + 2.6); c.closePath(); c.fill();
    return;
  }
  if (o.hat) { // hoed met brede rand
    c.fillStyle = shade(o.hat, -0.18); c.beginPath(); c.ellipse(hx, hy - 1.5, 4.1, 1.15, -0.05, 0, TAU); c.fill();
    c.fillStyle = o.hat; c.beginPath(); c.ellipse(hx - 0.1, hy - 2.3, 2.2, 1.6, 0, Math.PI, 0); c.fill();
    c.fillRect(hx - 2.3, hy - 2.4, 4.6, 0.9);
    c.fillStyle = 'rgba(120,60,30,0.55)'; c.fillRect(hx - 2.25, hy - 2, 4.5, 0.45);
  }
}

// ---------- mens ----------

const P_BOX = [-9, -31, 10, 3];
const WORK_ARM = [-0.2, -1.1, -2.1, -2.6, -1.5, 0.3, 1.05, 0.55];

function drawPerson(c, o, mode, f) {
  const a = (f / FR) * TAU;
  const walk = mode === 'walk';
  const work = mode === 'work';
  const sw = walk ? Math.sin(a) : 0;
  const bob = walk ? Math.abs(Math.cos(a)) * 0.55 : work ? Math.max(0, Math.sin(a)) * 0.35 : 0;
  const skin = SKIN[o.skin || 0];
  const body = o.body || '#8b6a43';
  const pants = o.leg || shade(body, -0.42);
  const hipY = -5.4 - bob;
  const ty = -11.9 - bob; // schouders
  const hx = 0.3; const hy = ty - 2.9;

  // pijlkoker op de rug
  if (o.weapon === 'bow') {
    c.save(); c.translate(-2.3, ty + 1.5); c.rotate(-0.35);
    c.fillStyle = '#6b4523'; c.fillRect(-0.9, -1, 1.8, 6);
    for (const dx of [-0.5, 0.1, 0.6]) { line(c, dx, -1, dx, -3, '#d8cfb8', 0.3); c.fillStyle = '#d24a3a'; c.fillRect(dx - 0.3, -3.6, 0.6, 1); }
    c.restore();
  }

  // benen: achterste donkerder, voeten met laarsjes
  const leg = (dx, s, col) => {
    const fx = dx + s * 2.3;
    const lift = walk ? Math.max(0, s) * 0.7 : 0;
    const kx = dx * 0.7 + s * 1.4; const ky = hipY + 2.6 - lift * 0.5;
    c.strokeStyle = col; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(dx * 0.7, hipY); c.lineTo(kx, ky); c.lineTo(fx, -1 - lift); c.stroke();
    c.fillStyle = '#3a2a1c'; c.beginPath(); c.ellipse(fx + 0.55, -0.65 - lift, 1.35, 0.72, 0, 0, TAU); c.fill();
  };
  leg(-0.8, -sw, shade(pants, -0.18));
  leg(0.8, sw, pants);

  const carry = o.carry;
  const onBack = carry === 'stone' || carry === 'gold';
  // zak op de rug
  if (onBack) load(c, carry, -3.3, ty + 2.4);
  // achterste arm
  let backAng = walk ? -sw * 0.55 : 0.12;
  if (carry === 'wood') backAng = Math.PI - 0.35;
  if (o.weapon === 'bow') backAng = 0.2;
  arm(c, -1.9, ty + 1.1, backAng, shade(body, -0.3), shade(skin, -0.12));
  // stammen op de schouder (achter het hoofd)
  if (carry === 'wood') load(c, 'wood', -1.9, ty - 0.9);

  // romp: tuniek met schaduw rechts en licht links
  const torso = () => {
    c.beginPath();
    c.moveTo(-2.8, ty + 1.3);
    c.quadraticCurveTo(-2.9, ty - 0.2, -1.3, ty - 0.45);
    c.lineTo(1.5, ty - 0.45);
    c.quadraticCurveTo(3.0, ty - 0.2, 2.9, ty + 1.3);
    c.lineTo(3.35, hipY + 1.5);
    c.quadraticCurveTo(0.2, hipY + 2.3, -3.15, hipY + 1.5);
    c.closePath();
  };
  torso(); c.fillStyle = body; c.fill();
  c.save(); torso(); c.clip();
  if (o.armor) {
    c.fillStyle = 'rgba(205,212,222,0.55)'; c.fillRect(-3.5, ty - 1, 7, 6.2);
    c.fillStyle = 'rgba(80,90,100,0.35)';
    for (let yy = ty; yy < ty + 5; yy += 1) for (let xx = -3 + ((yy - ty) % 2) * 0.5; xx < 3.4; xx += 1) c.fillRect(xx, yy, 0.45, 0.45);
  }
  if (o.barb) { c.fillStyle = '#d4c3a0'; c.beginPath(); c.ellipse(0, ty + 0.2, 3.6, 1.9, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(120,90,50,0.5)'; for (let i = -3; i < 4; i++) c.fillRect(i * 0.9, ty + 0.6, 0.35, 1.3); }
  if (o.team && !o.barb && o.weapon && o.weapon !== 'tool') { c.fillStyle = o.team; c.fillRect(-1.25, ty - 0.2, 2.5, hipY - ty + 1.9); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(-1.25, ty + 1.6, 2.5, 0.45); }
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(1.0, ty - 1, 4, 12);
  c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(-3.6, ty - 1, 1.3, 12);
  c.restore();
  c.fillStyle = '#3e2a18'; c.fillRect(-3.0, hipY - 0.45, 6.3, 0.95);
  c.fillStyle = '#c9a23a'; c.fillRect(0.4, hipY - 0.45, 0.9, 0.95);

  // schild (vooraan, aan de linkerkant)
  if (o.weapon === 'spear') roundShield(c, -2.5, ty + 3.6, 2.9, o.team || '#8a6238', !o.team);
  if (o.weapon === 'sword') {
    if (o.barb) roundShield(c, -2.6, ty + 3.4, 2.8, '#8a6238', true);
    else kiteShield(c, -2.6, ty + 3.4, o.team || '#7a8696');
  }

  // nek en hoofd
  c.fillStyle = shade(skin, -0.12); c.fillRect(-0.6, ty - 1.5, 1.4, 1.3);
  head(c, o, hx, hy);

  // voorste arm met wapen of gereedschap
  const sleeve = shade(body, -0.06);
  if (o.weapon === 'spear') {
    const [ex, ey] = arm(c, 2.1, ty + 1.1, walk ? 0.45 + sw * 0.1 : 0.5, sleeve, skin, 4);
    line(c, ex + 0.2, 1.2, ex + 1.3, -27.5, '#7a5129', 0.95);
    c.fillStyle = '#d5dbe2'; c.beginPath(); c.moveTo(ex + 1.45, -30.4); c.lineTo(ex + 0.55, -27.2); c.lineTo(ex + 2.2, -27.3); c.closePath(); c.fill();
    disc(c, ex, ey, 0.8, skin);
  } else if (o.weapon === 'sword') {
    const [ex, ey] = arm(c, 2.1, ty + 1.1, walk ? 0.7 + sw * 0.15 : 0.75, sleeve, skin, 4.2);
    if (o.barb) { // bijl
      c.save(); c.translate(ex, ey); c.rotate(0.45);
      line(c, 0, 1.2, 0, -6.4, '#6b4523', 0.9);
      c.fillStyle = '#7d8790'; c.beginPath(); c.moveTo(0.2, -6.6); c.quadraticCurveTo(3.4, -7.2, 3.2, -4.6); c.quadraticCurveTo(2.6, -3.4, 0.2, -4.2); c.closePath(); c.fill();
      c.restore();
    } else {
      c.save(); c.translate(ex, ey); c.rotate(0.55);
      c.fillStyle = '#e6eaef'; c.beginPath(); c.moveTo(-0.45, -1); c.lineTo(0.45, -1); c.lineTo(0.3, -7.6); c.lineTo(0, -8.4); c.lineTo(-0.3, -7.6); c.closePath(); c.fill();
      c.fillStyle = '#b08a3a'; c.fillRect(-1.5, -1.3, 3, 0.65);
      c.fillStyle = '#5a3a1e'; c.fillRect(-0.35, -0.7, 0.7, 1.6);
      c.restore();
    }
    disc(c, ex, ey, 0.8, skin);
  } else if (o.weapon === 'bow') {
    const [ex, ey] = arm(c, 2.0, ty + 1.1, 1.35, sleeve, skin, 4.1);
    c.strokeStyle = '#7a5129'; c.lineWidth = 0.85;
    c.beginPath(); c.arc(ex - 2.2, ey, 4.6, -0.95, 0.95); c.stroke();
    const bx0 = ex - 2.2 + Math.cos(-0.95) * 4.6; const by0 = ey + Math.sin(-0.95) * 4.6;
    line(c, bx0, by0, bx0, ey + (ey - by0), 'rgba(245,238,215,0.9)', 0.28);
    disc(c, ex, ey, 0.8, skin);
  } else if (o.weapon === 'tool') {
    const kind = o.tool || 'axe';
    if (work) {
      const ang = WORK_ARM[f];
      const [ex, ey] = arm(c, 2.0, ty + 1.1, ang, sleeve, skin, 4.2);
      tool(c, kind, ex, ey, Math.PI - ang);
      disc(c, ex, ey, 0.8, skin);
    } else if (carry === 'food') {
      arm(c, 2.0, ty + 1.1, 0.75, sleeve, skin, 3.8);
    } else {
      const [ex, ey] = arm(c, 2.0, ty + 1.1, walk ? 0.35 + sw * 0.2 : 0.3, sleeve, skin, 4.2);
      tool(c, kind, ex, ey, 0.5);
      disc(c, ex, ey, 0.8, skin);
    }
  } else if (carry === 'food') {
    arm(c, 2.0, ty + 1.1, 0.75, sleeve, skin, 3.8);
  } else {
    arm(c, 2.0, ty + 1.1, walk ? sw * 0.55 : -0.08, sleeve, skin);
  }
  // mand met eten voor de buik
  if (carry === 'food') load(c, 'food', 3.4, hipY - 1.2);
  else if (carry && !onBack && carry !== 'wood') load(c, carry, -3.3, ty + 2.4);
}

export function person(ctx, x, y, o = {}) {
  const s = o.s || 1;
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(x + 0.4 * s, y, 4.4 * s, 1.9 * s, 0, 0, TAU); ctx.fill();
  const mode = o.working ? 'work' : o.walking ? 'walk' : 'idle';
  const f = mode === 'idle' ? 0 : frameOf(o.phase);
  const R = resFor(ctx, s);
  const key = `p|${mode}${f}|${R}|${o.body || ''}|${o.leg || ''}|${o.armor ? 1 : 0}|${o.skin || 0}|${o.helmet || ''}|${o.hat || ''}|${o.weapon || ''}|${o.tool || ''}|${o.carry || ''}|${o.team || ''}|${o.barb ? 1 : 0}`;
  blit(ctx, sprite(key, R, P_BOX, (c) => drawPerson(c, o, mode, f)), P_BOX, x, y, s);
}

// ---------- paard met ruiter ----------

const H_BOX = [-12, -36, 14, 3];

function drawHorse(c, o, mode, f) {
  const a = (f / FR) * TAU;
  const walk = mode === 'walk';
  const coat = o.horse || '#7b4f2c';
  const dark = shade(coat, -0.32);
  const bob = walk ? Math.abs(Math.sin(a)) * 0.7 : 0;
  const by = -10 - bob;

  // benen: verre kant eerst (donkerder)
  const legs = [[-4.4, 0, true], [4.6, Math.PI, true], [-3.2, Math.PI, false], [5.6, 0, false]];
  for (const [lx, ph, far] of legs) {
    const sw = walk ? Math.sin(a + ph) : 0;
    const lift = walk ? Math.max(0, Math.cos(a + ph)) * 1.1 : 0;
    const col = far ? shade(coat, -0.42) : shade(coat, -0.12);
    const kx = lx + sw * 1.2; const ky = by + 4.6 - lift * 0.6;
    c.strokeStyle = col; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(lx, by + 1.5); c.lineTo(kx, ky); c.lineTo(lx + sw * 2.1, -0.9 - lift); c.stroke();
    c.fillStyle = '#2a1f17'; c.fillRect(lx + sw * 2.1 - 0.8, -1.2 - lift, 1.6, 1.1);
  }
  // staart
  c.strokeStyle = dark; c.lineWidth = 1.9;
  c.beginPath(); c.moveTo(-7.4, by - 1.2); c.quadraticCurveTo(-10.6, by + 0.4, -9.6 + (walk ? Math.sin(a) * 0.6 : 0), by + 6.2); c.stroke();
  // lijf
  const bodyPath = () => {
    c.beginPath();
    c.ellipse(-0.2, by, 7.2, 3.4, 0, 0, TAU);
    c.moveTo(8, by - 0.4); c.arc(4.6, by - 0.4, 3.3, 0, TAU);
    c.moveTo(-1.4, by - 0.2); c.arc(-4.8, by - 0.2, 3.4, 0, TAU);
  };
  bodyPath(); c.fillStyle = coat; c.fill('nonzero');
  c.save(); bodyPath(); c.clip('nonzero');
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(-9, by + 1, 18, 4);
  c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(-9, by - 4, 18, 1.6);
  if (o.armor && o.team) { // kleed van de ridder
    c.fillStyle = o.team; c.fillRect(-9, by - 1.4, 18, 6);
    c.fillStyle = 'rgba(255,240,200,0.6)';
    for (let i = -8; i < 9; i += 2.2) { c.beginPath(); c.arc(i, by + 3.3, 1, 0, Math.PI); c.fill(); }
  }
  c.restore();
  // hals en hoofd
  c.fillStyle = coat;
  c.beginPath(); c.moveTo(2.8, by - 2.4); c.quadraticCurveTo(5.2, by - 7.4, 7.2, by - 9.4); c.lineTo(10.2, by - 8.2); c.quadraticCurveTo(8.4, by - 4.4, 8.4, by - 0.4); c.closePath(); c.fill();
  c.save(); c.translate(9.9, by - 8.4); c.rotate(0.72);
  c.fillStyle = coat; c.beginPath(); c.ellipse(1.8, 0, 3.9, 1.8, 0, 0, TAU); c.fill();
  c.fillStyle = dark; c.beginPath(); c.ellipse(4.6, 0.25, 1.35, 1.4, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(1.2, -0.8, 2.2, 0.5, 0, 0, TAU); c.fill();
  if (o.armor) { c.fillStyle = IRON; c.beginPath(); c.ellipse(1.3, -0.3, 2.5, 1.35, 0, 0, TAU); c.fill(); }
  c.restore();
  c.fillStyle = dark; c.beginPath(); c.moveTo(8.5, by - 10.2); c.lineTo(8.9, by - 12.3); c.lineTo(9.8, by - 10); c.closePath(); c.fill();
  disc(c, 10.5, by - 8.9, 0.42, '#140d08');
  // manen
  c.strokeStyle = dark; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(3.0, by - 3.2); c.quadraticCurveTo(5.2, by - 7.4, 8.5, by - 9.9); c.stroke();
  c.lineWidth = 0.7;
  for (let i = 0; i < 4; i++) { const t = i / 4; c.beginPath(); c.moveTo(3.4 + t * 4.6, by - 3.6 - t * 5.6); c.lineTo(2.8 + t * 4.6, by - 2.4 - t * 5.4); c.stroke(); }
  // zadeldek en zadel
  c.fillStyle = o.team || '#8a6a43';
  c.beginPath(); c.moveTo(-2.8, by - 3.2); c.lineTo(2.4, by - 3.2); c.lineTo(2.8, by + 1.4); c.lineTo(-3.2, by + 1.4); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,240,200,0.5)'; c.fillRect(-3.1, by + 0.8, 5.8, 0.5);
  c.fillStyle = '#5a3a1e'; c.beginPath(); c.ellipse(-0.2, by - 3.3, 2.6, 0.9, 0, 0, TAU); c.fill();

  // ruiter
  const skin = SKIN[o.skin || 0];
  const body = o.body || '#8b6a43';
  const sy = by - 3.6; // zadel
  line(c, 0.2, sy + 0.4, 1.6, sy + 3.6, shade(body, -0.42), 1.7);
  c.fillStyle = '#3a2a1c'; c.beginPath(); c.ellipse(2.1, sy + 4.1, 1.2, 0.65, 0, 0, TAU); c.fill();
  const ty = sy - 5.6;
  if (o.weapon === 'spear' && o.team) roundShield(c, -2.3, ty + 3.4, 2.6, o.team);
  const torso = () => {
    c.beginPath();
    c.moveTo(-2.4, ty + 1.2); c.quadraticCurveTo(-2.5, ty - 0.3, -1.1, ty - 0.45); c.lineTo(1.4, ty - 0.45);
    c.quadraticCurveTo(2.7, ty - 0.3, 2.6, ty + 1.2); c.lineTo(2.8, sy + 0.6); c.lineTo(-2.6, sy + 0.6); c.closePath();
  };
  torso(); c.fillStyle = body; c.fill();
  c.save(); torso(); c.clip();
  if (o.armor) { c.fillStyle = 'rgba(205,212,222,0.55)'; c.fillRect(-3, ty - 1, 6, 7); }
  if (o.team && !o.armor) { c.fillStyle = o.team; c.fillRect(-1.1, ty - 0.2, 2.2, 6); }
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0.9, ty - 1, 3, 8);
  c.restore();
  c.fillStyle = shade(skin, -0.12); c.fillRect(-0.6, ty - 1.5, 1.4, 1.3);
  head(c, { ...o, weapon: null }, 0.3, ty - 2.9);
  const sleeve = shade(body, -0.06);
  if (o.weapon === 'spear') {
    const [ex, ey] = arm(c, 1.9, ty + 1, 0.9, sleeve, skin, 3.8);
    line(c, ex - 1.4, ey + 5, ex + 2.4, ey - 17, '#7a5129', 0.9);
    c.fillStyle = '#d5dbe2'; c.beginPath(); c.moveTo(ex + 2.75, ey - 19.6); c.lineTo(ex + 1.75, ey - 16.6); c.lineTo(ex + 3.2, ey - 16.8); c.closePath(); c.fill();
    if (o.armor && o.team) { c.fillStyle = o.team; c.beginPath(); c.moveTo(ex + 2.2, ey - 15); c.lineTo(ex + 5.4, ey - 14.2); c.lineTo(ex + 2.05, ey - 13); c.closePath(); c.fill(); }
    disc(c, ex, ey, 0.75, skin);
  } else {
    // verkenner: hand aan de teugels, hoorn aan de riem
    arm(c, 1.9, ty + 1, 1.2, sleeve, skin, 3.8);
    c.fillStyle = '#e8dcc0'; c.beginPath(); c.moveTo(-2.6, sy - 0.6); c.quadraticCurveTo(-3.8, sy + 0.8, -2.2, sy + 1.4); c.lineTo(-1.8, sy + 0.6); c.closePath(); c.fill();
  }
}

export function horseman(ctx, x, y, o = {}) {
  const s = o.s || 1;
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(x + 0.8 * s, y, 9 * s, 2.6 * s, 0, 0, TAU); ctx.fill();
  const mode = o.walking ? 'walk' : 'idle';
  const f = mode === 'idle' ? 0 : frameOf(o.phase);
  const R = resFor(ctx, s);
  const key = `h|${mode}${f}|${R}|${o.body || ''}|${o.horse || ''}|${o.armor ? 1 : 0}|${o.skin || 0}|${o.helmet || ''}|${o.hat || ''}|${o.weapon || ''}|${o.team || ''}`;
  blit(ctx, sprite(key, R, H_BOX, (c) => drawHorse(c, o, mode, f)), H_BOX, x, y, s);
}

// ---------- dieren ----------

const S_BOX = [-9, -13, 11, 2];

function drawSheepFig(c, o, mode, f) {
  const a = (f / FR) * TAU;
  const walk = mode === 'walk';
  const graze = mode === 'graze';
  const bob = walk ? Math.abs(Math.sin(a)) * 0.7 : 0;
  const wool = o.black ? '#4f4844' : '#f2eee6';
  const woolDark = o.black ? '#36302c' : '#d4cdbf';
  for (const [lx, ph, far] of [[-3.6, 0, true], [2.2, Math.PI, true], [-2.2, Math.PI, false], [3.8, 0, false]]) {
    const sw = walk ? Math.sin(a + ph) * 1.1 : 0;
    line(c, lx, -3.4 - bob, lx + sw, -0.4, far ? '#2a2420' : '#3a3330', 1.15);
  }
  const blobs = [[-3.4, -6, 3.3], [0, -7.3, 3.8], [3.2, -6.2, 3.3], [-0.4, -4.4, 3.5], [2.6, -4.3, 3]];
  for (const [bx, by, r] of blobs) disc(c, bx + 0.5, by - bob + 0.7, r, woolDark);
  for (const [bx, by, r] of blobs) disc(c, bx, by - bob, r * 0.92, wool);
  c.fillStyle = o.black ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)';
  for (const [bx, by] of [[-3.6, -8], [-0.6, -9.8], [2.4, -8.6], [-1.8, -6.4]]) { c.beginPath(); c.arc(bx, by - bob, 1.3, 0, TAU); c.fill(); }
  const hx = graze ? 6.3 : 6.1; const hy = graze ? -2.6 : -7.4 - bob;
  c.fillStyle = '#2d2724';
  c.beginPath(); c.ellipse(hx, hy, 2.3, 1.75, graze ? 0.9 : 0.25, 0, TAU); c.fill();
  c.fillStyle = '#4a403a'; c.beginPath(); c.ellipse(hx - 1.6, hy - 1.2, 1.3, 0.55, -0.5, 0, TAU); c.fill();
  disc(c, hx + 0.6, hy - 0.5, 0.35, '#d8d0c0');
  disc(c, hx - 1.4, hy - 1.6, 1.3, wool);
}

export function sheep(ctx, x, y, o = {}) {
  const s = o.s || 1;
  ctx.fillStyle = 'rgba(20,35,10,0.24)';
  ctx.beginPath(); ctx.ellipse(x + 1 * s, y, 7 * s, 2.4 * s, 0, 0, TAU); ctx.fill();
  const mode = o.walking ? 'walk' : o.graze ? 'graze' : 'idle';
  const f = mode === 'walk' ? frameOf(o.phase) : 0;
  const R = resFor(ctx, s);
  const key = `s|${mode}${f}|${R}|${o.black ? 1 : 0}`;
  blit(ctx, sprite(key, R, S_BOX, (c) => drawSheepFig(c, o, mode, f)), S_BOX, x, y, s);
}

const B_BOX = [-11, -15, 15, 2];

function drawBoarFig(c, mode, f) {
  const a = (f / FR) * TAU;
  const walk = mode === 'walk';
  const bob = walk ? Math.abs(Math.sin(a)) * 0.6 : 0;
  for (const [lx, ph, far] of [[-5.4, 0, true], [3.4, Math.PI, true], [-3.6, Math.PI, false], [5.2, 0, false]]) {
    const sw = walk ? Math.sin(a + ph) * 1.3 : 0;
    line(c, lx, -4 - bob, lx + sw, -0.5, far ? '#1f150f' : '#2b1d14', 1.7);
    c.fillStyle = '#15100c'; c.fillRect(lx + sw - 0.7, -1, 1.4, 0.9);
  }
  // lijf
  c.fillStyle = '#3a2a20'; c.beginPath(); c.ellipse(0.4, -7.2 - bob, 8.4, 4.9, 0, 0, TAU); c.fill();
  c.fillStyle = '#54402f'; c.beginPath(); c.ellipse(-0.2, -7.8 - bob, 7.6, 4.1, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,230,200,0.12)'; c.beginPath(); c.ellipse(-1.5, -9.6 - bob, 5, 1.6, 0, 0, TAU); c.fill();
  // borstelige rug
  c.strokeStyle = '#1f1610'; c.lineWidth = 0.8;
  c.beginPath();
  for (let i = 0; i < 10; i++) { const x = -6 + i * 1.3; const y = -11.6 - bob + Math.abs(i - 5) * 0.18; c.moveTo(x, y + 1); c.lineTo(x - 0.4, y - 1.1); }
  c.stroke();
  // kop met snuit en slagtanden
  c.fillStyle = '#4a3628';
  c.beginPath(); c.moveTo(5.6, -10.6 - bob); c.lineTo(12.6, -6.8 - bob); c.lineTo(11.6, -3.8 - bob); c.lineTo(5.2, -3.6 - bob); c.closePath(); c.fill();
  c.fillStyle = '#c99a86'; c.beginPath(); c.ellipse(12.6, -5.3 - bob, 1.25, 1.65, 0, 0, TAU); c.fill();
  disc(c, 12.9, -5.7 - bob, 0.3, '#5a3a30'); disc(c, 12.9, -4.8 - bob, 0.3, '#5a3a30');
  c.strokeStyle = '#f4efe0'; c.lineWidth = 0.95;
  c.beginPath(); c.moveTo(10.7, -4.4 - bob); c.quadraticCurveTo(11.8, -6.8 - bob, 10, -7.9 - bob); c.stroke();
  c.fillStyle = '#2b1d14'; c.beginPath(); c.moveTo(6.4, -10.2 - bob); c.lineTo(7.2, -12.6 - bob); c.lineTo(8.2, -10 - bob); c.closePath(); c.fill();
  disc(c, 8.9, -8.3 - bob, 0.5, '#120c08');
  disc(c, 9.05, -8.45 - bob, 0.16, '#d6c4a0');
}

export function boar(ctx, x, y, o = {}) {
  const s = o.s || 1;
  ctx.fillStyle = 'rgba(15,25,8,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 1 * s, y, 9.5 * s, 3 * s, 0, 0, TAU); ctx.fill();
  const mode = o.walking ? 'walk' : 'idle';
  const f = mode === 'walk' ? frameOf(o.phase) : 0;
  const R = resFor(ctx, s);
  blit(ctx, sprite(`b|${mode}${f}|${R}`, R, B_BOX, (c) => drawBoarFig(c, mode, f)), B_BOX, x, y, s);
}
