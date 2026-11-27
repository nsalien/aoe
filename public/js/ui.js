// HTML-sjablonen voor panelen, vensters en de bovenbalk.
import * as A from './art.js';
import * as FIG from './figures.js';
import {
  RES, RES_NAMES, BUILDINGS, BUILD_ORDER, UNITS, ARMY_UNITS, AGES, AGE_UP, MARKET, BONUS, WILD, FIELD, CIVS, CIV_IDS, CASTLE_LEVEL, levelCost, levelTime,
  JOBS, FISH, GATHER_RATE,
  LAND, landCost, WALL_TILE, TOWER, GATE, TECHS, TECH_LINES, TECH_LINE_IDS, techAt, LOYALTY, VASSAL, ransomCost, MAX_AGE, gearOf,
  fmtDuration, campUnits, campLoot, unitTime, COMBAT, levelAge, WAR, carryMult, bountyOf, REPLAY, CLAN,
} from '../shared/rules.js';
import {
  age, slots, popCap, capacity, homePop, rates, checkBuild, checkUpgrade, checkTrain, findType, bLevel,
  canAfford, protectAmount, totalVillagers, marketRate, maxBuilds, checkHarvest, homeVillagers,
  depositById, depLeft, campAlive, campSize, exploredNow, wallEnclosed, campGrowth, raidChance, raidNow,
  checkDemolish, demolishRefund, checkPlaceGate, buildTime, checkResearch, researchTime, techDone, loyalty, loyaltyRegen,
  isVassal, noblesOwned, noblesMax, boost, townScore, townBaseDef, towerDefense, effectiveWall, wallRun, tooBig,
  maxBoats, boatsReady, checkBoat, fishMult,
} from '../shared/sim.js';
import { wallHp } from '../shared/fieldbattle.js';
import { territory, exHas } from '../shared/territory.js';
import { attackPower, carryCapacity, slowestSpeed } from '../shared/battle.js';
import { icon } from './icons.js';

export { icon };
export const AGES_NAME = (a) => AGES[a].name;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.floor(n || 0).toLocaleString('nl-BE');

// ---------- iconen ----------
const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`)}`;
export const ICON = {
  food: svg('<path d="M12 22V9" stroke="#8a6a1c" stroke-width="1.6"/><g fill="#e9b93a" stroke="#a8781c" stroke-width=".6"><ellipse cx="12" cy="5" rx="2" ry="3.2"/><ellipse cx="9" cy="9" rx="1.8" ry="3" transform="rotate(-30 9 9)"/><ellipse cx="15" cy="9" rx="1.8" ry="3" transform="rotate(30 15 9)"/><ellipse cx="8.6" cy="13.5" rx="1.8" ry="3" transform="rotate(-35 8.6 13.5)"/><ellipse cx="15.4" cy="13.5" rx="1.8" ry="3" transform="rotate(35 15.4 13.5)"/></g><circle cx="17.5" cy="18" r="3.6" fill="#d9483b"/><path d="M17.5 14.6c.4-1 1.2-1.5 2-1.6" stroke="#4a7a2a" stroke-width="1" fill="none"/>'),
  wood: svg('<rect x="2.5" y="8" width="15" height="9" rx="2" fill="#8b5a2b"/><path d="M4 10.5h12M4 14.5h11" stroke="#6b4220" stroke-width=".8"/><ellipse cx="17.5" cy="12.5" rx="3.6" ry="4.5" fill="#e0b47a" stroke="#8b5a2b" stroke-width="1"/><ellipse cx="17.5" cy="12.5" rx="1.9" ry="2.5" fill="none" stroke="#b5864f" stroke-width=".8"/>'),
  stone: svg('<path d="M3 18l2.5-7 5-4 6 1.5 4.5 5-1 5.5z" fill="#9e998e" stroke="#6d685e" stroke-width=".8"/><path d="M5.5 11l5-4 6 1.5-3 4-6 .5z" fill="#c4c0b6"/><path d="M13 19l1.5-5 6 0" stroke="#6d685e" stroke-width=".7" fill="none"/>'),
  fish: svg('<path d="M3 12c3-5 9-6.5 13-3l4-3v12l-4-3c-4 3.5-10 2-13-3z" fill="#6fa3c8" stroke="#2f5f86" stroke-width="1"/><path d="M8 9.5c1.5 1.5 1.5 3.5 0 5" stroke="#2f5f86" stroke-width=".9" fill="none"/><circle cx="6" cy="11" r="1" fill="#1d2f3f"/><path d="M11 9l1.5-2.5M13 9.3l1.2-2" stroke="#cfe3f2" stroke-width=".8"/>'),
  gold: svg('<circle cx="12" cy="12" r="8.5" fill="#f2c230" stroke="#b5861a" stroke-width="1.2"/><circle cx="12" cy="12" r="5.8" fill="none" stroke="#d9a523" stroke-width="1"/><path d="M10.2 9.2h3.2l-1.6 5.6" stroke="#b5861a" stroke-width="1.3" fill="none"/><path d="M7.5 8.5a6 6 0 0 1 3-2.6" stroke="#fff6c8" stroke-width="1.2" fill="none"/>'),
  pop: svg('<circle cx="12" cy="7" r="3.6" fill="#f1c9a0" stroke="#8b6a43" stroke-width=".8"/><path d="M5 21c0-5 3.2-8 7-8s7 3 7 8z" fill="#8b6a43"/>'),
  atk: svg('<path d="M5 19L18 6l1-3-3 1L3 17z" fill="#c9ced6" stroke="#6b717c" stroke-width=".8"/><path d="M4 15l5 5M3 21l3-3" stroke="#6b4a2b" stroke-width="2"/>'),
  def: svg('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#3f7fd9" stroke="#26518f" stroke-width="1"/><path d="M12 5v14" stroke="#f2c230" stroke-width="2"/>'),
  time: svg('<circle cx="12" cy="12" r="9" fill="#fff6e0" stroke="#6b5535" stroke-width="1.6"/><path d="M12 7v5l3.5 2" stroke="#3a2a18" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  carry: svg('<path d="M5 9h14l-1.5 11h-11z" fill="#b8874c" stroke="#7a5129" stroke-width="1"/><path d="M9 9V6a3 3 0 0 1 6 0v3" stroke="#7a5129" stroke-width="1.5" fill="none"/>'),
  speed: svg('<path d="M4 16a8 8 0 1 1 16 0" fill="none" stroke="#6b5535" stroke-width="2"/><path d="M12 16l5-6" stroke="#b2372a" stroke-width="2" stroke-linecap="round"/>'),
};
export const resImg = (r, cls = 'ico') => `<img class="${cls}" src="${ICON[r]}" alt="${RES_NAMES[r] || r}">`;

// ---------- miniatuurafbeeldingen (één keer gerenderd) ----------
// Niet meer meteen getekend: bij het opstarten kostte dat ±0,2 s op pc en ±1 s op een gsm (elk gebouw in 2D tekenen).
// De eerste keer komt er een leeg plaatje met een eigen adres; de tekening volgt kort daarna op de achtergrond (een paar
// per 6 ms) en dan krijgen alle <img> met dat adres de echte afbeelding, waar ze ook staan (paneel, venster, rapport).
const thumbs = new Map();
const thumbsTodo = new Map(); // sleutel -> { make, ph }
let thumbTimer = null;
function lazyThumb(key, make) {
  const u = thumbs.get(key);
  if (u) return u;
  let p = thumbsTodo.get(key);
  if (!p) {
    p = { make, ph: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1' data-k='${encodeURIComponent(key).replace(/'/g, '%27')}'/%3E` };
    thumbsTodo.set(key, p);
    if (!thumbTimer) thumbTimer = setTimeout(makeThumbs, 0);
  }
  return p.ph;
}
function makeThumbs() {
  thumbTimer = null;
  const t0 = performance.now();
  for (const [key, p] of thumbsTodo) {
    if (performance.now() - t0 > 6) break;
    thumbsTodo.delete(key);
    let url = '';
    try { url = p.make().toDataURL(); } catch { /* geen canvas (bv. tests) */ }
    if (!url) continue;
    thumbs.set(key, url);
    if (typeof document !== 'undefined') for (const img of document.images) if (img.getAttribute('src') === p.ph) img.setAttribute('src', url);
  }
  if (thumbsTodo.size) thumbTimer = setTimeout(makeThumbs, 16);
}
// ---------- volkeren ----------
const EMBLEM = {
  egypt: '<circle cx="12" cy="12" r="10.5" fill="#2f5fa8" stroke="#d4a017" stroke-width="1.6"/><path d="M12 13v7M8.5 13.2h7" stroke="#f2c230" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="12" cy="8.6" rx="2.6" ry="3.4" fill="none" stroke="#f2c230" stroke-width="2"/>',
  greek: '<circle cx="12" cy="12" r="10.5" fill="#2e5fa8" stroke="#f3efe5" stroke-width="1.6"/><path d="M6 8.2h12l-6-3.4z" fill="#f3efe5"/><path d="M7.4 9.6h1.8v7.4H7.4zM11.1 9.6h1.8v7.4h-1.8zM14.8 9.6h1.8v7.4h-1.8z" fill="#f3efe5"/><path d="M6 17.6h12v1.6H6z" fill="#f3efe5"/>',
  yamato: '<circle cx="12" cy="12" r="10.5" fill="#f6f1e6" stroke="#2e2018" stroke-width="1.6"/><circle cx="12" cy="12" r="5" fill="#c0392b"/>',
  babylon: '<circle cx="12" cy="12" r="10.5" fill="#244e8f" stroke="#e0b23a" stroke-width="1.6"/><path d="M12 4.5l1.6 4.6 4.8-1.6-3 4 3 4-4.8-1.6L12 19.5l-1.6-4.6-4.8 1.6 3-4-3-4 4.8 1.6z" fill="#e0b23a"/>',
  persia: '<circle cx="12" cy="12" r="10.5" fill="#f0e6ce" stroke="#1f9a9a" stroke-width="1.6"/><path d="M6 17.5h12v-3H6z" fill="#e2d4b6" stroke="#8a6a3a" stroke-width=".8"/><path d="M7.5 14.5c0-4 2-6.6 4.5-6.6s4.5 2.6 4.5 6.6z" fill="#29a9a9"/><path d="M12 4.6v3.3" stroke="#d4a017" stroke-width="1.4"/><circle cx="12" cy="4.4" r="1" fill="#d4a017"/>',
};
export function civEmblem(civ, size = 18) {
  const e = EMBLEM[civ];
  return e ? `<svg class="civ-emblem" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${e}</svg>` : '';
}
export const isEnclosed = (live) => wallEnclosed(live);
export const civName = (civ) => (CIVS[civ] ? CIVS[civ].name : '');

// keuze van een volk bij het stichten van een rijk
export function civPickerHtml() {
  return CIV_IDS.map((c, i) => {
    const v = CIVS[c];
    return `<label class="civ-card"><input type="radio" name="civ" value="${c}" ${i === 0 ? 'checked' : ''}>
      <img src="${buildingThumb('tc', CASTLE_LEVEL, v.color, c)}" alt="">
      <span class="civ-name">${civEmblem(c, 16)} ${v.name}</span>
      <span class="civ-desc">${v.desc}</span>
      <span class="civ-units">${v.units.map((k) => `<img src="${unitThumb(k, v.color)}" alt="" title="${esc(UNITS[k].name)}">`).join('')}${v.units.map((k) => UNITS[k].name).join(' · ')}</span>
    </label>`;
  }).join('');
}

// volk van de eigen stad (bepaalt de bouwstijl van de afbeeldingen in de panelen)
let myCiv = null;
export function setCiv(civ) { myCiv = civ; }

export function buildingThumb(type, level = 1, team = '#c0392b', civ = myCiv) {
  return lazyThumb(`${type}:${level}:${team}:${civ || ''}`, () => {
    const t = type === 'wall' ? 'tower' : type;
    const spr = A.buildingSprite(t, Math.max(1, level), team, civ);
    const big = BUILDINGS[t]?.size === 2;
    const sc = big ? 1.05 : t === 'tower' ? 1.15 : 1.85;
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 140;
    const ctx = cv.getContext('2d');
    A.drawSprite(ctx, spr, 80, big ? 104 : 108, sc);
    return cv;
  });
}

export function unitThumb(unit, team = '#3f7fd9') {
  return lazyThumb(`u:${unit}:${team}`, () => makeUnitThumb(unit, team));
}

function makeUnitThumb(unit, team) {
  const cv = document.createElement('canvas');
  cv.width = 88; cv.height = 88;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  const o = { s: 2.1, team, thumb: true };
  const big = { elephant: 1.0, chariot: 1.4, camel: 1.12, yabusame: 1.24 };
  if (FIG.uniqueUnit(ctx, unit, 22, 42, { s: big[unit] || 2.1, team, thumb: true })) return cv;
  switch (unit) {
    case 'villager': A.person(ctx, 22, 40, { ...o, team: null, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', tool: 'axe' }); break;
    case 'spear': A.person(ctx, 20, 40, { ...o, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }); break;
    case 'sword': A.person(ctx, 22, 40, { ...o, body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }); break;
    case 'archer': A.person(ctx, 20, 40, { ...o, body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }); break;
    case 'scout': A.horseman(ctx, 20, 40, { s: 1.6, team, thumb: true, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b' }); break;
    case 'rider': A.horseman(ctx, 20, 40, { s: 1.6, team, thumb: true, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear' }); break;
    case 'knight': A.horseman(ctx, 20, 40, { s: 1.6, team, thumb: true, body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530' }); break;
    case 'ram': A.ram(ctx, 21, 34, 1.5); break;
    case 'noble': A.horseman(ctx, 20, 40, { s: 1.6, team, thumb: true, body: '#5b2a7a', look: 'noble', horse: '#efe6d6', kit: 'B' }); break;
    case 'stonethrower': A.stoneThrower(ctx, 22, 38, 1.5); break;
    default:
  }
  return cv;
}

// ---------- kleine bouwstenen ----------
export function costHtml(cost, res, mult = 1) {
  if (!cost) return '';
  return `<div class="cost">${RES.filter((r) => cost[r]).map((r) => {
    const need = cost[r] * mult;
    const no = res && (res[r] || 0) + 1e-6 < need;
    return `<span class="${no ? 'no' : ''}">${resImg(r, '')}${fmt(need)}</span>`;
  }).join('')}</div>`;
}

const timer = (end, start) => `<span class="timer" data-end="${end}"${start ? ` data-start="${start}"` : ''}></span>`;
const bar = (start, end) => `<div class="bar"><i data-bstart="${start}" data-bend="${end}" style="width:0"></i></div>`;
const ageWord = (a) => ['', 'eerste', 'tweede', 'derde', 'vierde', 'vijfde'][a];

export const capacityOf = (live) => capacity(live);

export function resBarHtml(live, speed, bumps = []) {
  const cap = capacity(live);
  const r = rates(live, speed);
  const used = homePop(live) + (live._away || 0);
  const pc = popCap(live);
  return RES.map((k) => `
    <div class="res ${live.res[k] >= cap - 0.5 ? 'full' : ''} ${bumps.includes(k) ? 'bump' : ''}" title="${RES_NAMES[k]}: ${fmt(live.res[k])} / ${fmt(cap)} (+${fmt(r[k])} per uur)">
      ${resImg(k)}<span class="amt">${fmt(live.res[k])}</span><span class="sub"><span>/${fmt(cap)}</span><span>+${fmt(r[k])}/u</span></span>
    </div>`).join('') + `
    <div class="res ${used >= pc ? 'full' : ''}" title="Bevolking: ${used} van ${pc}">
      ${resImg('pop')}<span class="amt">${used}/${pc}</span>
    </div>`;
}

// '24 uur', '30 min', …
export function peaceText(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 && m % 60 === 0 ? `${m / 60} uur` : m >= 60 ? `${(m / 60).toFixed(1).replace('.', ',')} uur` : `${m} min`;
}

export function phaseHtml(w, now, peaceEnd) {
  if (w.phase === 'lobby') return { cls: 'lobby', html: `${icon('hourglass')} Start over <span class="timer" data-end="${w.startAt}"></span>` };
  if (w.phase === 'war' && now < peaceEnd) return { cls: 'prep', html: `${icon('dove')} Vrede · nog <span class="timer" data-end="${peaceEnd}"></span>` };
  if (w.phase === 'war') return { cls: 'war', html: `${icon('swords')} Oorlog! · nog <span class="timer" data-end="${w.warEnd}"></span>` };
  return { cls: 'ended', html: `${icon('flag')} Seizoen voorbij` };
}

// ---------- bouwbalk ----------
// kleine tekeningen voor de muur- en grondkaart in de bouwbalk
function specialThumb(kind, level = 1) {
  return lazyThumb(`sp:${kind}:${level}`, () => makeSpecialThumb(kind, level));
}

function makeSpecialThumb(kind, level) {
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 140;
  const ctx = cv.getContext('2d');
  ctx.translate(80, 92); ctx.scale(1.7, 1.7);
  if (kind === 'wall') {
    const stone = level >= 3;
    const col = stone ? '#b9b1a1' : '#9a6a38';
    A.box(ctx, -0.6, -0.08, 0.6, 0.08, 0, stone ? 20 : 16, col);
    A.box(ctx, -0.16, -0.16, 0.16, 0.16, 0, stone ? 28 : 22, stone ? '#a39a89' : '#7a5129');
    if (stone) for (const x of [-0.55, -0.35, 0.25, 0.45]) A.box(ctx, x, -0.08, x + 0.1, 0.08, 20, 24, '#a39a89');
  } else {
    A.diamond(ctx, 0, 0, 64 * 1.1, 32 * 1.1, '#8cc45a', 'rgba(60,90,30,0.6)');
    ctx.strokeStyle = '#7a5129'; ctx.lineWidth = 1.6;
    for (const [x, y] of [[-34, 0], [0, -17], [34, 0], [0, 17]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 9); ctx.stroke(); }
    ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(4, -26); ctx.lineTo(16, -22); ctx.lineTo(4, -18); ctx.fill();
    ctx.strokeStyle = '#5a3a1e'; ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(4, -27); ctx.stroke();
  }
  return cv;
}

export function buildBarHtml(live, placing, team) {
  const wallL = bLevel(live, 'wall');
  const wallCost = WALL_TILE.cost[Math.max(1, wallL)];
  const lots = ((live.terr && live.terr.lots) || []).length;
  const lc = landCost(lots);
  const special = `<button class="bcard special ${placing === 'wall' ? 'active' : ''} ${wallL ? '' : 'locked'}" data-action="wallMode" title="${esc(wallL ? 'Muren plaatsen: klik een begin- en een eindtegel' : 'Bouw eerst de stadsmuur (niveau 1) via het muurpaneel')}">
      <span class="cnt">${(live.walls || []).length}</span>
      <img src="${specialThumb('wall', wallL)}" alt="">
      <span class="bn">Muur</span>
      <span class="bc">${RES.filter((r) => wallCost[r]).map((r) => `<span>${resImg(r, '')}${wallCost[r]}</span>`).join('')}<span class="muted">/tegel</span></span>
    </button>
    <button class="bcard special ${placing === 'land' ? 'active' : ''} ${lots >= LAND.max ? 'locked' : ''}" data-action="landMode" title="Grond bijkopen: een lot van ${LAND.size} x ${LAND.size} tegels">
      <span class="cnt">${lots}/${LAND.max}</span>
      <img src="${specialThumb('land')}" alt="">
      <span class="bn">Grond kopen</span>
      <span class="bc">${RES.filter((r) => lc[r]).map((r) => `<span>${resImg(r, '')}${fmt(lc[r])}</span>`).join('')}</span>
    </button>`;
  return special + BUILD_ORDER.map((type) => {
    const def = BUILDINGS[type];
    const have = findType(live, type).length;
    const err = checkBuild(live, type);
    const locked = age(live) < def.age || have >= def.max;
    const poor = !canAfford(live.res, levelCost(type, 1));
    const cost = levelCost(type, 1);
    const title = err ? `${def.name}: ${err}` : `${def.name} — ${def.desc}`;
    return `<button class="bcard ${locked ? 'locked' : ''} ${poor ? 'poor' : ''} ${placing === type ? 'active' : ''}" data-action="place" data-type="${type}" title="${esc(title)}">
      <span class="cnt">${have}/${def.max}</span>
      <img src="${buildingThumb(type, 1, team)}" alt="">
      <span class="bn">${def.name}</span>
      <span class="bc">${RES.filter((r) => cost[r]).map((r) => `<span>${resImg(r, '')}${fmt(cost[r])}</span>`).join('')}</span>
    </button>`;
  }).join('');
}

// ---------- tabbladen onder de stad: mijn leger en bouwadvies ----------

// Hoeveel soldaten van elke soort en waar: thuis, in je gebied (groepen in het veld), onderweg op de wereldkaart of
// bij een bondgenoot (away), en in opleiding (train, telt niet mee in het totaal). Dorpelingen niet.
export function armySummary(live, data) {
  const rows = new Map();
  const add = (k, where, n) => {
    if (!(n > 0) || k === 'villager' || !UNITS[k]) return;
    let r = rows.get(k);
    if (!r) { r = { k, home: 0, field: 0, away: 0, train: 0, total: 0 }; rows.set(k, r); }
    r[where] += n;
    if (where !== 'train') r.total += n;
  };
  for (const [k, n] of Object.entries(live.units || {})) add(k, 'home', n);
  for (const g of live.field || []) for (const [k, n] of Object.entries(g.units || {})) add(k, 'field', n);
  for (const m of (data && data.marches) || []) if (m.own && m.units) for (const [k, n] of Object.entries(m.units)) add(k, 'away', n);
  for (const sp of (data && data.mySupport) || []) for (const [k, n] of Object.entries(sp.units || {})) add(k, 'away', n);
  for (const q of Object.values(live.queues || {})) for (const it of q) add(it.unit, 'train', it.n - it.done);
  const order = (k) => { const i = ARMY_UNITS.indexOf(k); return i < 0 ? 99 : i; };
  return [...rows.values()].sort((a, b) => order(a.k) - order(b.k));
}

const ARMY_WHERE = [['home', 'thuis'], ['field', 'in je gebied'], ['away', 'onderweg of elders'], ['train', 'in opleiding']];

export function armyBarHtml(app, live) {
  const rows = armySummary(live, app.data);
  if (!rows.length) return `<div class="bb-note">${icon('swords')} Je hebt nog geen soldaten. Train ze in de kazerne, de schietbaan of de stal.</div>`;
  const team = app.data.team.color;
  const sum = (f) => rows.reduce((a, r) => a + r[f], 0);
  const head = `<div class="bcard static wide army-sum"><span class="bn">${icon('swords')} Mijn leger</span><b class="bnum">${fmt(sum('total'))}</b>
    <span class="where">${ARMY_WHERE.filter(([f]) => sum(f)).map(([f, l]) => `<span>${fmt(sum(f))} ${l}</span>`).join('')}</span></div>`;
  return head + rows.map((r) => {
    const parts = ARMY_WHERE.filter(([f]) => r[f]).map(([f, l]) => `${fmt(r[f])} ${l}`);
    const short = [r.home && `${fmt(r.home)} thuis`, r.field && `${fmt(r.field)} veld`, r.away && `${fmt(r.away)} weg`].filter(Boolean).join(' · ');
    return `<div class="bcard static unit" title="${esc(`${UNITS[r.k].name}: ${parts.join(', ')}`)}">
      ${r.train ? `<span class="cnt">+${fmt(r.train)}</span>` : ''}
      <img src="${unitThumb(r.k, team)}" alt="">
      <span class="bn">${UNITS[r.k].name}</span>
      <b class="bnum">${fmt(r.total)}</b>
      <span class="where">${short || 'in opleiding'}</span>
    </div>`;
  }).join('');
}

// Welke gebouwen kan je in dit tijdperk nog verbeteren? Gelijke gebouwen (soort + niveau) samen. err = waarom het nu
// (nog) niet kan (geen bouwer vrij, te weinig grondstoffen, ...) of null. Wat nu kan eerst, dan het stadscentrum,
// dan wat het minst tekort komt.
export function upgradeAdvice(live) {
  const busyIds = new Set(live.builds.map((j) => j.bid));
  const a = age(live);
  const groups = new Map();
  for (const b of live.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || busyIds.has(b.id) || b.level >= def.maxLevel) continue;
    if (b.level < 1 && b.type !== 'wall') continue; // (een nieuw gebouw staat altijd in de bouwlijst)
    const to = b.level + 1;
    if (a < levelAge(b.type, to)) continue;
    const key = `${b.type}|${b.level}`;
    let g = groups.get(key);
    if (!g) {
      const cost = levelCost(b.type, to);
      if (!cost) continue;
      let short = 0;
      for (const r of RES) short += Math.max(0, (cost[r] || 0) - (live.res[r] || 0));
      g = { type: b.type, level: b.level, to, ids: [], cost, short, err: checkUpgrade(live, b.id) };
      groups.set(key, g);
    }
    g.ids.push(b.id);
  }
  const costSum = (c) => RES.reduce((t, r) => t + (c[r] || 0), 0);
  return [...groups.values()].sort((x, y) => (!!x.err - !!y.err) || ((y.type === 'tc') - (x.type === 'tc')) || (x.short - y.short) || (costSum(x.cost) - costSum(y.cost)));
}

// gebouwen die je in dit tijdperk kan zetten maar nog helemaal niet hebt (bv. een nieuw gebouw van een nieuw tijdperk)
export function newBuildAdvice(live) {
  const a = age(live);
  const out = [];
  for (const type of BUILD_ORDER) {
    const def = BUILDINGS[type];
    if (!def || def.placeable === false || a < def.age || findType(live, type).length) continue;
    const cost = levelCost(type, 1);
    let short = 0;
    for (const r of RES) short += Math.max(0, (cost[r] || 0) - (live.res[r] || 0));
    out.push({ type, cost, short, err: checkBuild(live, type) });
  }
  return out.sort((x, y) => (!!x.err - !!y.err) || (x.short - y.short));
}

// hoeveel gebouwen je nu meteen kan verbeteren of nieuw zetten (voor het bolletje op het tabblad)
export const adviceReady = (live) => upgradeAdvice(live).reduce((n, g) => n + (g.err ? 0 : g.ids.length), 0)
  + newBuildAdvice(live).filter((g) => !g.err).length;

const upName = (type, to) => (type === 'tc' ? `${AGES[to].short}tijd` : BUILDINGS[type].name);

export function adviceBarHtml(app, live) {
  const team = app.data.team.color;
  const builds = [...live.builds].sort((x, y) => x.end - y.end);
  const max = maxBuilds(live);
  const free = Math.max(0, max - builds.length);
  // eerst de bouwers: hoeveel bezig en vrij, dan elke lopende bouw als kaartje (tik = naar het gebouw)
  let html = `<div class="bcard static wide builders ${free ? 'has-free' : ''}"><span class="bn">${icon('hammer')} Bouwers</span><b class="bnum">${builds.length}/${max}</b>
    <span class="where"><span>${builds.length ? 'bezig' : 'niemand bezig'}</span>${free ? `<span class="free">${free === 1 ? '1 bouwer' : `${free} bouwers`} vrij</span>` : '<span>allemaal bezig</span>'}</span></div>`;
  for (const j of builds) {
    const b = live.buildings.find((x) => x.id === j.bid);
    if (!b) continue;
    const name = b.type === 'tc' ? `${AGES[j.to].short}tijd` : BUILDINGS[b.type].name;
    html += `<button class="bcard job" data-action="adviceGo" data-id="${b.id}" title="${esc(`${name}${b.type === 'tc' ? '' : ` → niveau ${j.to}`}: naar het gebouw`)}">
      <span class="cnt">${icon('hammer')}</span>
      <img src="${buildingThumb(b.type, j.to, team)}" alt="">
      <span class="bn">${name}</span>
      <span class="lv">${b.type === 'tc' ? 'nieuw tijdperk' : `→ niveau ${j.to}`}</span>
      <span class="t" data-end="${j.end}">${fmtDuration(j.end - app.now())}</span>${bar(j.start, j.end)}
    </button>`;
  }
  html += '<span class="bb-sep" aria-hidden="true"></span>';
  const list = upgradeAdvice(live);
  // nieuwe gebouwen die je nog niet hebt (tik = meteen plaatsen, zoals in het bouwmenu)
  const fresh = newBuildAdvice(live);
  const freshHtml = fresh.length ? `<span class="bb-sep" aria-hidden="true"></span>${fresh.map((g) => {
    const def = BUILDINGS[g.type];
    const title = g.err ? `${def.name}: ${g.err}` : `${def.name} (nieuw): ${def.desc} Tik om het te plaatsen.`;
    return `<button class="bcard adv new ${g.err ? 'poor' : 'ready'}" data-action="place" data-type="${g.type}" title="${esc(title)}">
      <span class="cnt newtag">nieuw</span>
      <img src="${buildingThumb(g.type, 1, team)}" alt="">
      <span class="bn">${def.name}</span>
      <span class="lv">nog te bouwen</span>
      <span class="bc">${RES.filter((r) => g.cost[r]).map((r) => `<span class="${(live.res[r] || 0) + 1e-6 < g.cost[r] ? 'no' : ''}">${resImg(r, '')}${fmt(g.cost[r])}</span>`).join('')}</span>
    </button>`;
  }).join('')}` : '';
  if (!list.length) return `${html}<div class="bb-note">${icon('star')} Alles staat op het hoogste niveau dat dit tijdperk toelaat.${age(live) < MAX_AGE ? ' Verbeter je stadscentrum voor een nieuw tijdperk.' : ''}</div>${freshHtml}`;
  return html + list.map((g) => {
    const n = g.ids.length;
    const title = `${BUILDINGS[g.type].name} van niveau ${g.level} naar ${g.to}${n > 1 ? ` (${n} gebouwen)` : ''}: ${g.err || 'kan nu!'} Tik om er naartoe te gaan.`;
    return `<button class="bcard adv ${g.err ? 'poor' : 'ready'}" data-action="adviceGo" data-type="${g.type}" data-level="${g.level}" title="${esc(title)}">
      ${n > 1 ? `<span class="cnt">×${n}</span>` : ''}
      <img src="${buildingThumb(g.type, g.to, team)}" alt="">
      <span class="bn">${upName(g.type, g.to)}</span>
      <span class="lv">${g.type === 'tc' ? 'nieuw tijdperk' : `niveau ${g.level} → ${g.to}`}</span>
      <span class="bc">${RES.filter((r) => g.cost[r]).map((r) => `<span class="${(live.res[r] || 0) + 1e-6 < g.cost[r] ? 'no' : ''}">${resImg(r, '')}${fmt(g.cost[r])}</span>`).join('')}</span>
    </button>`;
  }).join('') + freshHtml;
}

// ---------- stadsoverzicht ----------
export function townOverviewHtml(app, live) {
  const d = app.data;
  const sl = slots(live);
  const r = rates(live, d.world.speed);
  const total = homeVillagers(live);
  const away = totalVillagers(live) - total;
  const alloc = app.pendingAlloc || live.villagers;
  const harbor = bLevel(live, 'harbor') > 0;
  const jobs = harbor ? JOBS : RES; // vissers enkel met een havenhuis
  const assigned = JOBS.reduce((a, k) => a + (alloc[k] || 0), 0);
  const idle = total - assigned;
  const canAct = app.canAct;
  const a = age(live);
  const wall = live.buildings.find((b) => b.type === 'wall');

  let html = `<div class="ph"><img class="thumb" src="${buildingThumb('tc', a, d.team.color)}" alt="">
    <div><h2>${esc(d.town.name)}</h2><div class="lvl">${AGES[a].name}${live.civ ? ` · <span class="civ-tag">${civEmblem(live.civ, 14)} ${civName(live.civ)}</span>` : ''}</div>
    <div class="small muted">Positie (${d.town.x}, ${d.town.y}) · <span class="pill" style="background:${d.team.color}">${esc(d.team.name)}</span></div></div></div>`;

  html += loyaltyCardHtml(app, live);
  html += bonusCardHtml(app, live);
  html += `<div class="card"><h3>${icon('people')} Dorpelingen <span class="right">${total + away} totaal · ${idle} vrij${away ? ` · ${away} op pad` : ''}</span></h3>`;
  const fishRate = (n) => n * FISH.rate * (1 + 0.1 * (a - 1)) * d.world.speed * (1 + boost(live).food) * fishMult(live);
  for (const k of jobs) {
    const nm = k === 'fish' ? 'Vissers' : RES_NAMES[k];
    const per = k === 'fish' ? `${alloc.fish || 0}/${sl.fish} op ${boatsReady(live)} bootje${boatsReady(live) === 1 ? '' : 's'} · +${fmt(fishRate(alloc.fish || 0))}/u`
      : `${alloc[k]}/${sl[k]} plaatsen · +${fmt(k === 'food' ? r.food - fishRate(live.villagers.fish || 0) : r[k])}/u`;
    html += `<div class="vrow"><img src="${ICON[k]}" alt="">
      <div class="nm">${nm}<small>${per}</small></div>
      <div class="stepper">
        <button data-action="vill" data-res="${k}" data-d="-5" ${!canAct || !(alloc[k] > 0) ? 'disabled' : ''} title="-5">«</button>
        <button data-action="vill" data-res="${k}" data-d="-1" ${!canAct || !(alloc[k] > 0) ? 'disabled' : ''}>−</button>
        <b>${alloc[k] || 0}</b>
        <button data-action="vill" data-res="${k}" data-d="1" ${!canAct || idle <= 0 || (alloc[k] || 0) >= sl[k] ? 'disabled' : ''}>+</button>
        <button data-action="vill" data-res="${k}" data-d="5" ${!canAct || idle <= 0 || (alloc[k] || 0) >= sl[k] ? 'disabled' : ''} title="+5">»</button>
      </div><span></span></div>`;
  }
  html += `<div class="row small" style="margin-top:8px"><span class="grow muted">Nieuwe dorpelingen gaan naar</span>
    <select class="field" data-change="rally" ${canAct ? '' : 'disabled'} style="width:auto">
      ${[['auto', 'Automatisch'], ...jobs.map((k) => [k, k === 'fish' ? 'Vissen' : RES_NAMES[k]])].map(([v, n]) => `<option value="${v}" ${live.rally === v ? 'selected' : ''}>${n}</option>`).join('')}
    </select></div>
    ${idle > 0 ? `<p class="req">${idle} dorpeling(en) doen niets! Bouw werkplaatsen (boerderij, kampen) of verdeel ze.</p>` : ''}
  </div>`;

  html += fieldCardHtml(app, live);
  html += queuesHtml(app, live);

  const units = ARMY_UNITS.filter((k) => live.units[k]);
  html += `<div class="card"><h3>${icon('shield')} Leger thuis <span class="right">${units.reduce((s, k) => s + live.units[k], 0)} man</span></h3>`;
  html += units.length ? `<div class="unitgrid">${units.map((k) => `<div class="ucell"><img src="${unitThumb(k, d.team.color)}" alt=""><b>${fmt(live.units[k])}</b>${UNITS[k].name}</div>`).join('')}</div>`
    : '<p class="empty">Nog geen soldaten. Bouw een kazerne!</p>';
  html += '</div>';

  if (d.supportHere.length || d.mySupport.length) {
    html += `<div class="card"><h3>${icon('team')} Versterkingen</h3>`;
    for (const s of d.supportHere) {
      html += `<div class="row small"><span class="grow">Van <b>${esc(s.player)}</b>: ${unitsText(s.units)}</span>
        <button class="btn small" data-action="recall" data-id="${s.id}" ${canAct ? '' : 'disabled'}>Terugsturen</button></div>`;
    }
    for (const s of d.mySupport) {
      html += `<div class="row small"><span class="grow">Bij <b>${esc(s.host)}</b>: ${unitsText(s.units)}</span>
        <button class="btn small" data-action="recall" data-id="${s.id}" ${canAct ? '' : 'disabled'}>Terugroepen</button></div>`;
    }
    html += '</div>';
  }

  html += `<div class="card"><h3>${icon('castle')} Verdediging</h3>
    <dl class="kv"><dt>Stadsmuur</dt><dd>${wall.level ? `niveau ${wall.level} · ${(live.walls || []).length ? (wallEnclosed(live) ? 'gesloten' : 'nog open') : 'nog geen muren'}` : 'geen'}</dd>
    <dt>Wachttorens</dt><dd>${findType(live, 'tower').filter((b) => b.level).length}</dd>
    <dt>Verborgen in opslag</dt><dd>${fmt(protectAmount(live))} per grondstof</dd>
    ${live.terr ? `<dt>Barbarenkamp</dt><dd>${campText(live, app.now())}</dd>` : ''}</dl>
    <div class="actions"><button class="btn" data-action="selectWall">Stadsmuur bekijken</button></div></div>`;
  // meldingen op je gsm (aanval op je stad, bouwer vrij, ...): ook hier, niet enkel bij de wereldkaart
  html += pushCardHtml(app);
  return html;
}

// wat weet je over het barbarenkamp?
function campText(live, now) {
  const c = territory(live.terr.seed).camp;
  if (!c) return 'geen';
  if (!exHas(exploredNow(live, now), Math.floor(c.x), Math.floor(c.y))) return 'nog niet gevonden';
  if (!campAlive(live, now)) return `verwoest (herbouwd over <span data-end="${live.terr.camp.down}"></span>)`;
  const raid = raidNow(live);
  const grow = campGrowth(live, now);
  const more = grow > 1.04 ? `, ${Math.round((grow - 1) * 100)}% sterker dan eerst` : '';
  if (raid && !raid.battle) return `ongeveer ${Math.max(1, campSize(live))} barbaren${more}. <b>${raid.n} van hen trekken naar je dorp!</b>`;
  return `ongeveer ${Math.max(1, campSize(live))} barbaren${more}. Kans op een overval: ${raidRisk(live, now)}`;
}

// hoe groot is de kans dat de barbaren binnenkort je dorp overvallen? (groeit zolang je hun kamp met rust laat)
export function raidRisk(live, now) {
  const p = raidChance(live, now);
  return p >= 0.3 ? 'groot' : p >= 0.12 ? 'gemiddeld' : 'klein';
}

// keuzevenster: de barbaren trekken naar je dorp (15 minuten om de slag zelf te spelen)
export function raidAskHtml(live, raid, now) {
  const left = Math.max(0, Math.ceil((raid.at - now) / 1000));
  const soldiers = Object.values(live.units || {}).reduce((a, b) => a + b, 0);
  const wall = bLevel(live, 'wall'); const towers = findType(live, 'tower').length;
  const def = [soldiers ? `${soldiers} soldaten thuis` : 'geen soldaten thuis', wall ? `muur niveau ${wall}` : 'geen muur', towers ? `${towers} ${towers === 1 ? 'toren' : 'torens'}` : ''].filter(Boolean).join(' · ');
  return `<div class="bt-ask-card" role="dialog" aria-modal="true">
    <div class="bt-ask-crest">${icon('swords')}</div>
    <h2>${raid.n} barbaren vallen je dorp aan!</h2>
    <p>Ze verzamelen bij hun kamp en trekken dan naar je stad. Verdedig je dorp zelf: zet je schutters op de muur en je soldaten
    voor de poort. Of laat je soldaten, muur en torens het gevecht automatisch uitvechten.</p>
    <p class="small"><b>Jouw verdediging:</b> ${def}</p>
    <div class="bt-ask-btns">
      <button class="btn primary big" data-bact="raid" data-mode="manual"${soldiers ? '' : ' disabled'}>${icon('flag')} Zelf verdedigen</button>
      <button class="btn big" data-bact="raid" data-mode="auto">${icon('hourglass')} Automatisch</button>
    </div>
    ${soldiers ? '' : '<p class="small muted">Zelf verdedigen kan enkel met soldaten thuis.</p>'}
    <p class="small muted">Nog <b data-askend="${raid.at}">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b> om te kiezen, daarna verloopt het gevecht automatisch.</p>
  </div>`;
}

// waar is een groep in het veld mee bezig?
export function groupStatus(live, g, now) {
  const o = g.order ? g.order.type : null;
  if (g.pending && now < g.t1) {
    const eta = ` <span class="muted">(<span data-end="${g.t1}"></span>)</span>`;
    if (o === 'home') return `keert terug naar huis${eta}`;
    if (o === 'boar') return `op jacht naar een everzwijn${eta}`;
    if (o === 'camp') return `trekt naar het barbarenkamp${eta}`;
    if (o === 'chop') return `op weg om een boom te kappen${eta}`;
    if (o === 'gather') { const d = depositById(live, g.order.id); return `op weg naar ${d ? WILD.deposits[d.kind].name.toLowerCase() : 'een bron'}${eta}`; }
    return `onderweg${eta}`;
  }
  if (g.work && g.work.type === 'chop') return `kapt een boom <span class="muted">(<span data-end="${g.work.end}"></span>)</span>`;
  if (g.work && g.work.type === 'gather') {
    const d = depositById(live, g.work.id);
    if (d) return `verzamelt ${RES_NAMES[WILD.deposits[d.kind].res].toLowerCase()} · nog ${fmt(depLeft(live, d))}`;
  }
  return 'wacht op een opdracht';
}

// groepen die in je eigen gebied rondtrekken, en nieuwe groepen op pad sturen
function fieldCardHtml(app, live) {
  if (!live.terr) return '';
  const now = app.now();
  const groups = live.field || [];
  const canAct = app.canAct;
  let html = `<div class="card field-card"><h3>${icon('map')} Op pad in je gebied <span class="right">${groups.length}/${FIELD.maxGroups} groepen</span></h3>`;
  if (!groups.length) {
    html += `<p class="small muted" style="margin:0 0 6px">Tik op een dorpeling of soldaat in je stad en daarna op de grond om hem te verplaatsen. Waar hij komt, verdwijnt de mist.
      Dorpelingen kunnen bomen kappen en bronnen ontginnen; soldaten jagen op everzwijnen en vallen barbaren aan.</p>`;
  }
  for (const g of groups) {
    const sel = app.selGroup === g.id;
    html += `<div class="row field-row${sel ? ' sel' : ''}"><span class="grow"><b>${esc(unitsText(g.units))}</b><br><span class="small">${groupStatus(live, g, now)}</span></span>
      <button class="btn small" data-action="fieldPick" data-id="${g.id}" title="Kies en toon op de kaart">${icon('target')}</button>
      ${g.order && g.order.type === 'home' && g.pending ? '' : `<button class="btn small" data-action="fieldHome" data-id="${g.id}" ${canAct ? '' : 'disabled'}>${icon('home')} Naar huis</button>`}</div>`;
  }
  if (canAct && groups.length < FIELD.maxGroups) {
    const home = ARMY_UNITS.filter((k) => live.units[k]);
    html += `<details class="field-send"><summary>${icon('plus')} Een groep samenstellen</summary><div class="field-send-body">`;
    html += `<div class="row small"><span class="grow">Dorpeling (kapt en ontgint)</span><button class="btn small" data-action="fieldVillager" ${homeVillagers(live) > 0 ? '' : 'disabled'}>Stuur 1</button></div>`;
    for (const k of home) {
      html += `<div class="row small"><img src="${unitThumb(k, app.data.team.color)}" alt="" class="ico"><span class="grow">${UNITS[k].name} <span class="muted">(${fmt(live.units[k])} thuis)</span></span>
        <input class="field num" type="number" min="0" max="${live.units[k]}" value="0" data-field-unit="${k}" inputmode="numeric"></div>`;
    }
    html += home.length ? `<div class="actions"><button class="btn primary small" data-action="fieldSend">Soldaten op pad</button></div>` : '<p class="small muted">Geen soldaten thuis.</p>';
    html += '</div></details>';
  }
  const log = (live.terr.log || []).slice(-5).reverse();
  if (log.length) {
    html += `<div class="field-log"><div class="small muted">Laatste gebeurtenissen</div>`;
    for (const e of log) {
      const bad = /lost/.test(e.kind);
      const rp = e.rp && e.t + REPLAY.ms > Date.now() ? ` <button class="btn small log-replay" data-action="raidReplay" data-id="${e.id}" title="Bekijk hoe de overval verliep">${icon('play')} Replay</button>` : '';
      html += `<div class="small log-row${bad ? ' bad' : ''}"><span class="muted">${new Date(e.t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</span> ${esc(e.text)}${rp}</div>`;
    }
    html += '</div>';
  }
  return html + '</div>';
}

// vondsten rond de stad die je kan laten oogsten
function bonusCardHtml(app, live) {
  const nodes = live.nodes || [];
  if (!nodes.length && !(live.harvests || []).length) return '';
  let html = `<div class="card bonus-card"><h3>${icon('star')} Vondsten <span class="right">${nodes.length} rond je stad</span></h3>
    <p class="small muted" style="margin:0 0 6px">Klik op een dorpeling en dan op de vondst, of gebruik de knop. De dorpeling komt daarna terug naar zijn werk.</p>`;
  for (const n of nodes) {
    const def = BONUS.kinds[n.kind];
    const hv = (live.harvests || []).find((h) => h.node === n.id);
    const err = n.claimed ? null : checkHarvest(live, n.id);
    html += `<div class="row bonus-row"><img src="${ICON[n.res]}" alt="" class="ico"><span class="grow"><b>${def.name}</b><br><span class="small muted">+${fmt(n.amount)} ${RES_NAMES[n.res].toLowerCase()}</span></span>
      ${hv ? `<span class="small timer" data-end="${hv.end}"></span>` : `<button class="btn small primary" data-action="harvest" data-id="${n.id}" ${!app.canAct || err ? `disabled title="${esc(err || '')}"` : ''}>Oogsten</button>`}</div>`;
  }
  return html + '</div>';
}

export function unitsText(units) {
  const parts = Object.keys(units || {}).filter((k) => units[k] > 0 && UNITS[k]).map((k) => `${fmt(units[k])} ${UNITS[k].name.toLowerCase()}`);
  return parts.length ? parts.join(', ') : '—';
}

function queuesHtml(app, live) {
  return buildQueueHtml(app, live) + researchQueueHtml(app, live) + trainQueueHtml(app, live.queues);
}

function researchQueueHtml(app, live) {
  const r = live.research;
  if (!r) return '';
  return `<div class="card"><h3>${icon('book')} Onderzoek</h3><div class="qitem"><span class="qicon">${icon(LINE_ICON[TECHS[r.id].line])}</span>
    <div><div class="nm">${TECHS[r.id].name} <span class="muted small">(Academie)</span></div>${bar(r.start, r.end)}</div>${timer(r.end)}</div></div>`;
}

// ---------- trouw en vazallen ----------
const loyBar = (v, cls = '') => `<div class="loybar ${cls}" title="Trouw ${Math.floor(v)}/100"><i style="width:${Math.max(0, Math.min(100, v))}%"></i><span>${Math.floor(v)}</span></div>`;

function loyaltyCardHtml(app, live) {
  const d = app.data;
  const now = app.now();
  const v = loyalty(live);
  const vas = isVassal(live, now) ? live.vas : null;
  const mine = d.vassals || [];
  let html = '';
  if (vas) {
    const cost = ransomCost(age(live));
    html += `<div class="card vassal-card"><h3>${icon('crown')} Vazal van ${esc(vas.lname)} <span class="right">nog ${timer(vas.until)}</span></h3>
      <p class="small" style="margin:0 0 6px">Je stad betaalt schatting: om de ${VASSAL.tributeMs / 3600000} uur vertrekt een karavaan met ${Math.round(VASSAL.tribute * 100)}% van je productie naar ${esc(vas.ltname || vas.lname)}.
      Je kan je heer niet aanvallen. Vrij komen: wachten, losgeld betalen, of een clanlid dat je heer verslaat.</p>
      <div class="row small"><span class="grow">Losgeld:</span>${costHtml(cost, live.res)}</div>
      <div class="actions"><button class="btn primary" data-action="ransom" ${app.canAct && canAfford(live.res, cost) ? '' : 'disabled'}>${icon('scales')} Losgeld betalen</button></div></div>`;
  } else if (v < LOYALTY.max || (live.loyShield && live.loyShield > now)) {
    html += `<div class="card"><h3>${icon('crown')} Trouw van je volk</h3>${loyBar(v, v < 50 ? 'low' : '')}
      <p class="small muted" style="margin:6px 0 0">${v < LOYALTY.max ? `Edelmannen van een vijand hebben je volk opgestookt. De trouw herstelt met ${loyaltyRegen(live)} per uur${bLevel(live, 'cathedral') ? ' (dankzij je kathedraal)' : ''}. Bij 0 word je vazal.` : ''}
      ${live.loyShield && live.loyShield > now ? `Je bent net bevrijd: nog ${timer(live.loyShield)} beschermd tegen edelmannen.` : ''}</p></div>`;
  }
  if (mine.length) {
    html += `<div class="card"><h3>${icon('crown')} Je vazallen <span class="right">${mine.length}/${VASSAL.maxPerLord}</span></h3>
      ${mine.map((m) => `<div class="row small"><span class="grow"><b>${esc(m.town)}</b> (${esc(m.player)}) · vrij over ${timer(m.until)}</span>
        <button class="btn small" data-action="mapTo" data-x="${m.x}" data-y="${m.y}" data-id="${m.townId}">Op kaart</button></div>`).join('')}
      <p class="small muted" style="margin:6px 0 0">Ze sturen je om de ${VASSAL.tributeMs / 3600000} uur schatting en je krijgt ${Math.round(VASSAL.scoreShare * 100)}% van hun punten.</p></div>`;
  }
  return html;
}

// ---------- Academie ----------
const LINE_ICON = { inf: 'shield', rng: 'target', cav: 'horse', town: 'castle' };

function academyHtml(app, live, b) {
  const d = app.data;
  const L = b.level;
  let html = `<div class="card"><h3>${icon('book')} Onderzoek <span class="right">${Object.keys(live.tech || {}).length}/${Object.keys(TECHS).length}</span></h3>
    <p class="small muted" style="margin:0 0 8px">Eén onderzoek tegelijk. Elke rij vraagt een hoger niveau van de Academie; per soort werk je van links naar rechts.
    Wat je onderzoekt, zie je aan je troepen (en aan de Academie).</p><div class="techgrid">`;
  for (const line of TECH_LINE_IDS) {
    html += `<div class="techline"><div class="tl-head">${icon(LINE_ICON[line])} ${TECH_LINES[line].name}</div>`;
    for (let row = 1; row <= 3; row++) {
      const id = techAt(line, row);
      const T = TECHS[id];
      const done = techDone(live, id);
      const busy = live.research && live.research.id === id;
      const err = done || busy ? null : checkResearch(live, id);
      const locked = !done && !busy && err && !/grondstoffen|loopt al/.test(err);
      html += `<div class="tech ${done ? 'done' : busy ? 'busy' : locked ? 'locked' : ''}">
        <div class="tn">${done ? icon('star') : ''}${T.name} <span class="muted small">rij ${row}</span></div>
        <div class="small">${T.desc}</div>
        ${done ? '<div class="small ok">Onderzocht</div>' : busy ? `${bar(live.research.start, live.research.end)}<div class="small">klaar over ${timer(live.research.end)}</div>`
        : `${costHtml(T.cost, live.res)}<div class="small muted">${icon('clock')} ${fmtDuration(researchTime(id, d.world.speed))}</div>
          ${locked ? `<p class="req">${err}</p>` : `<button class="btn small primary" data-action="research" data-id="${id}" ${!app.canAct || err ? 'disabled' : ''}>Onderzoeken</button>`}`}
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  if (L < 3) html += `<p class="small muted" style="margin:8px 0 0">Rij ${L + 1} komt vrij met Academie niveau ${L + 1} (${AGES[L + 3].name}).</p>`;
  return html + '</div>';
}

// ---------- Adelshof ----------
function awayNobles(app) {
  let n = 0;
  for (const m of app.data.marches || []) if (m.own && m.units) n += m.units.noble || 0;
  for (const sp of app.data.mySupport || []) n += sp.units.noble || 0;
  return n;
}

function courtHtml(app, live, b) {
  const have = noblesOwned(live, awayNobles(app));
  return `<div class="card"><dl class="kv"><dt>Edelmannen</dt><dd>${have}/${noblesMax(live)}</dd>
    <dt>Je vazallen</dt><dd>${(app.data.vassals || []).length}/${VASSAL.maxPerLord}</dd></dl>
    <p class="small muted" style="margin:6px 0 0">Stuur een edelman mee met een aanval op een speler. Wint je leger en overleeft hij, dan daalt de trouw van die stad met ${LOYALTY.hit}
    (per edelman). Bij 0 wordt de stad ${VASSAL.ms / 86400000} dagen je <b>vazal</b>: ze stuurt je schatting en je krijgt een deel van haar punten.
    Niet tegen steden met minder dan ${Math.round(LOYALTY.minScore * 100)}% van jouw punten, en niet tegen een stad die net bevrijd werd.</p></div>`
    + trainHtml(app, live, b, ['noble']);
}

function buildQueueHtml(app, live) {
  const builds = [...live.builds].sort((a, b) => a.end - b.end);
  let html = `<div class="card"><h3>${icon('hammer')} Bouwplaats <span class="right">${builds.length}/${maxBuilds(live)} bouwers bezig</span></h3>`;
  if (!builds.length) html += '<p class="empty">Je bouwers wachten op opdrachten. Kies een gebouw onderaan.</p>';
  for (const j of builds) {
    const b = live.buildings.find((x) => x.id === j.bid);
    const name = b.type === 'tc' ? `Naar ${AGES[j.to].short}tijd` : `${BUILDINGS[b.type].name} → niv. ${j.to}`;
    html += `<div class="qitem"><img src="${buildingThumb(b.type, j.to, app.data.team.color)}" alt="">
      <div><div class="nm">${name}</div>${bar(j.start, j.end)}</div>${timer(j.end)}</div>`;
  }
  if (age(live) < 3) html += `<p class="small muted" style="margin:6px 0 0">Meer bouwers? In het ${AGES[3].name} (stadscentrum niveau 3) krijg je er een derde bij.</p>`;
  return html + '</div>';
}

function trainQueueHtml(app, queues) {
  const qs = Object.entries(queues || {});
  if (!qs.length) return '';
  let html = `<div class="card"><h3>${icon('target')} Training</h3>`;
  for (const [key, q] of qs) {
    let t = q[0].start;
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      const startNext = i === 0 ? it.start + it.done * it.dur : t;
      const end = startNext + (it.n - it.done) * it.dur;
      html += `<div class="qitem"><img src="${unitThumb(it.unit, app.data.team.color)}" alt="">
        <div><div class="nm">${it.n - it.done}× ${UNITS[it.unit].name} <span class="muted small">(${key === 'castle' ? 'Kasteel' : BUILDINGS[key].name})</span></div>
        ${i === 0 ? `<div class="small muted">volgende over ${timer(it.start + (it.done + 1) * it.dur)}</div>` : '<div class="small muted">wacht in de rij</div>'}</div>
        ${timer(end)}</div>`;
      t = end;
    }
  }
  return html + '</div>';
}

// grondstoffen die je terugkrijgt (geen kleur voor 'te duur')
function refundHtml(res) {
  const parts = RES.filter((r) => res[r] > 0).map((r) => `<span class="chip">${resImg(r)} ${fmt(res[r])}</span>`);
  return parts.length ? parts.join(' ') : 'niets';
}

// ---------- wat een niveau erbij oplevert ----------
// Rekent de stad uit met dit gebouw één niveau hoger (zelfde functies als de simulatie) en toont wat verandert.
const pct = (x) => `${Math.round(x * 100)}%`;
const per = (n) => `${fmt(n)}/u`;

// trainingstijden (elk niveau 15% sneller) en eenheden die op het nieuwe niveau vrijkomen
function trainRows(rows, notes, live, nx, units, lvlNow, lvlNext, speed) {
  for (const k of units) {
    const u = UNITS[k];
    if (!u || (u.civ && u.civ !== live.civ)) continue;
    if (u.bl > lvlNext) continue;
    if (u.bl > lvlNow) {
      // het stadscentrum toont nieuwe eenheden al bij 'Ontgrendelt'
      if (u.building !== 'tc') notes.push(`<b>Nieuw:</b> ${u.name}${age(nx) < u.age ? ` (vraagt het ${AGES[u.age].name})` : ''}.`);
      continue;
    }
    if (age(live) < u.age) continue;
    const lv = (x) => (u.queue === 'castle' ? x - CASTLE_LEVEL + 1 : x);
    rows.push([`${u.name} trainen`, fmtDuration(unitTime(k, lv(lvlNow), speed)), fmtDuration(unitTime(k, lv(lvlNext), speed))]);
  }
}

export function gainsHtml(app, live, b, to) {
  const d = app.data;
  const speed = d.world.speed;
  const L = b.level;
  const nx = { ...live, buildings: live.buildings.map((x) => (x.id === b.id ? { ...x, level: to } : x)) };
  const rows = [];
  const notes = [];
  const add = (label, a, z) => { if (a !== z) rows.push([label, a, z]); };

  // productiegebouwen: werkplekken en wat ze opbrengen als ze bezet zijn
  const sl = BUILDINGS[b.type].slots;
  if (sl) {
    const r = Object.keys(sl)[0];
    const one = rates({ ...live, villagers: { food: 0, wood: 0, stone: 0, gold: 0, idle: 0, [r]: 1 } }, speed)[r];
    const s0 = slots(live)[r];
    const s1 = slots(nx)[r];
    const name = RES_NAMES[r].toLowerCase();
    add(`Werkplekken ${name}`, fmt(s0), fmt(s1));
    add(`${RES_NAMES[r]} als alles bezet is`, per(s0 * one), per(s1 * one));
    const free = s0 - live.villagers[r];
    if (free > 0) notes.push(`Je hebt nu al <b>${free} vrije werkplek${free === 1 ? '' : 'ken'}</b> voor ${name}. Meer plekken helpen pas als je ook meer dorpelingen hebt.`);
    else if (live.villagers.idle > 0) notes.push(`Je hebt ${live.villagers.idle} dorpeling${live.villagers.idle === 1 ? '' : 'en'} zonder werk: die kunnen hier meteen aan de slag (+${per(Math.min(live.villagers.idle, s1 - s0) * one)}).`);
    else notes.push(`Alle werkplekken voor ${name} zijn bezet: met extra dorpelingen haal je hier tot +${per((s1 - s0) * one)}.`);
  }

  // algemene getallen van de stad: enkel wat verandert
  add('Bevolking (ruimte)', fmt(popCap(live)), fmt(popCap(nx)));
  if (b.type === 'house') {
    const used = homePop(live) + (d.awayPop || 0);
    notes.push(used >= popCap(live) - 2 ? `Je stad zit vol (${fmt(used)}/${fmt(popCap(live))}): zonder extra ruimte kun je niemand meer trainen.`
      : `Je gebruikt nu ${fmt(used)} van ${fmt(popCap(live))} plaatsen.`);
  }
  add('Opslag per grondstof', fmt(capacity(live)), fmt(capacity(nx)));
  add('Verborgen voor plunderaars', fmt(protectAmount(live)), fmt(protectAmount(nx)));
  if (b.type === 'storage') {
    const cap = capacity(live);
    const top = RES.reduce((m, r) => (live.res[r] > live.res[m] ? r : m), RES[0]);
    notes.push(live.res[top] >= cap * 0.9 ? `Je ${RES_NAMES[top].toLowerCase()} zit (bijna) aan de grens: wat je daarboven verdient, gaat verloren.`
      : `Je grootste voorraad (${RES_NAMES[top].toLowerCase()}) is ${fmt(live.res[top])} van ${fmt(cap)}.`);
  }
  add('Bouwers tegelijk', String(maxBuilds(live)), String(maxBuilds(nx)));
  if (b.type === 'harbor') {
    add('Plaats voor bootjes', String(maxBoats(live)), String(maxBoats(nx)));
    const one = (st) => FISH.rate * (1 + 0.1 * (age(st) - 1)) * speed * (1 + boost(st).food) * fishMult(st);
    add('Vangst per visser', per(one(live)), per(one(nx)));
    if (maxBoats(nx) > maxBoats(live)) notes.push('Na de verbetering kan je een bootje meer bouwen (en 2 vissers meer laten varen).');
  }
  if (!sl) {
    const r0 = rates(live, speed); const r1 = rates(nx, speed);
    for (const r of RES) if (Math.floor(r0[r]) !== Math.floor(r1[r])) add(`${RES_NAMES[r]} per uur`, per(r0[r]), per(r1[r]));
  }
  add('Basisverdediging van de stad', fmt(townBaseDef(live)), fmt(townBaseDef(nx)));
  add('Verdediging van je torens', fmt(towerDefense(live)), fmt(towerDefense(nx)));
  add('Herstel van de trouw', `${loyaltyRegen(live)} per uur`, `${loyaltyRegen(nx)} per uur`);
  add('Edelmannen', String(noblesMax(live)), String(noblesMax(nx)));

  // per soort gebouw
  switch (b.type) {
    case 'tc':
      trainRows(rows, notes, live, nx, ['villager', ...(CIVS[live.civ] ? CIVS[live.civ].units : [])], L, to, speed);
      break;
    case 'barracks': case 'range': case 'stable': case 'workshop':
      trainRows(rows, notes, live, nx, Object.keys(UNITS).filter((k) => UNITS[k].building === b.type), L, to, speed);
      break;
    case 'smithy': {
      add('Aanval en verdediging van al je troepen', `+${5 * L}%`, `+${5 * to}%`);
      const names = ['leer en brons', 'ijzer en maliën', 'plaatharnas'];
      if (gearOf(to) !== gearOf(L)) notes.push(`<b>Nieuwe uitrusting:</b> je soldaten krijgen ${names[gearOf(to)]}.`);
      break;
    }
    case 'market':
      add('Koers (100 geven →)', fmt(marketRate(live) * 100), fmt(marketRate(nx) * 100));
      add('Max. per karavaan', fmt(MARKET.shipPerLevel * L), fmt(MARKET.shipPerLevel * to));
      break;
    case 'tower': {
      const n = Math.max(1, L);
      if (L) { add('Schade per pijl', String(TOWER.dmg[n]), String(TOWER.dmg[to])); add('Levens', String(TOWER.hp[n]), String(TOWER.hp[to])); }
      break;
    }
    case 'wall': {
      const e0 = effectiveWall(live); const e1 = effectiveWall(nx);
      const txt = (e) => (e ? `+${Math.round(e * COMBAT.wallBonus * 100)}% en +${fmt(e * COMBAT.wallFlat)}` : '—');
      add('Verdedigingsbonus', txt(e0), txt(e1));
      add('Levens per muurstuk (veldslag)', L ? fmt(wallHp(L)) : '—', fmt(wallHp(to)));
      if (L < 3 && to >= 3) notes.push('Je houten palissade wordt een <b>stenen muur</b>.');
      if (!(live.walls || []).length) notes.push('Je hebt nog geen muurstukken geplaatst: de bonus telt pas zodra je muren zet.');
      else if (!wallEnclosed(live)) notes.push('Je stad is nog niet helemaal ommuurd: zolang er een gat is, krijg je maar 30% van de bonus.');
      else notes.push('Al je muurstukken en poorten worden meteen sterker.');
      break;
    }
    case 'lodge':
      add('Sneller bouwen', `${5 * L}%`, `${5 * to}%`);
      break;
    case 'mill': case 'guild': {
      const bo = BUILDINGS[b.type].boost;
      const all = Object.keys(bo).length === RES.length;
      const r = Object.keys(bo)[0];
      add(`Bonus van ${b.type === 'mill' ? 'de molen' : 'het gildehuis'} (${all ? 'alle grondstoffen' : RES_NAMES[r].toLowerCase()})`, `+${pct(bo[r] * L)}`, `+${pct(bo[r] * to)}`);
      break;
    }
    case 'academy':
      notes.push(`<b>Nieuwe rij onderzoek:</b> ${TECH_LINE_IDS.map((line) => TECHS[techAt(line, to)].name).join(', ')}.`);
      break;
    default: break;
  }

  const pts = townScore(nx) - townScore(live);
  if (pts > 0) rows.push(['Punten', fmt(townScore(live)), `${fmt(townScore(nx))} <span class="muted">(+${fmt(pts)})</span>`]);

  if (!rows.length && !notes.length) return '';
  return `<div class="gains"><div class="gh">Wat levert het op?</div>
    ${rows.length ? `<dl class="kv">${rows.map(([l, a, z]) => `<dt>${l}</dt><dd><span class="was">${a}</span> → <b class="up">${z}</b></dd>`).join('')}</dl>` : ''}
    ${notes.map((n) => `<p class="small gnote">${n}</p>`).join('')}</div>`;
}

// ---------- gebouwpaneel ----------
// andere gebouwen op de plek waar je tikte (bv. een klein gebouw achter het stadscentrum): één tik om ze te kiezen
export function alsoHereHtml(app, live, b) {
  const ids = app.pickStack || [];
  if (ids.length < 2 || !ids.includes(b.id)) return '';
  const others = ids.filter((id) => id !== b.id).map((id) => live.buildings.find((x) => x.id === id)).filter(Boolean);
  if (!others.length) return '';
  return `<div class="also-here">${icon('magnifier')}<span>Ook op deze plek:</span>${others.map((o) => `<button class="btn small" data-action="pickBuilding" data-id="${o.id}">${BUILDINGS[o.type].name}${o.level ? ` <small>niv. ${o.level}</small>` : ''}</button>`).join('')}</div>`;
}

export function buildingPanelHtml(app, live, b) {
  const d = app.data;
  const def = BUILDINGS[b.type];
  const job = live.builds.find((j) => j.bid === b.id);
  const canAct = app.canAct;
  const lvl = b.level;
  let html = `<div class="ph"><img class="thumb" src="${buildingThumb(b.type, Math.max(1, lvl), d.team.color)}" alt="">
    <div><h2>${def.name}</h2><div class="lvl">${lvl ? `Niveau ${lvl} van ${def.maxLevel}` : 'In aanbouw'}${b.type === 'tc' ? ` · ${AGES[lvl].short}tijd` : ''}</div></div></div>`;
  html += alsoHereHtml(app, live, b);
  html += `<p class="desc">${def.desc}</p>`;
  // verplaatsen: meteen bovenaan, zodat je de knop ook op een gsm direct ziet
  if (b.type !== 'tc' && b.type !== 'wall') {
    html += `<div class="actions move-row"><button class="btn" data-action="moveBuilding" data-id="${b.id}" ${canAct ? '' : 'disabled'}>${icon('move')} Verplaatsen</button></div>`;
  }
  if (job) {
    html += `<div class="card"><h3>${icon('hammer')} ${lvl ? (b.type === 'tc' ? `Naar het ${AGES[job.to].name}` : `Verbeteren naar niveau ${job.to}`) : 'In aanbouw'}</h3>${bar(job.start, job.end)}
      <div class="row small" style="margin-top:6px"><span class="grow muted">Klaar over</span>${timer(job.end)}</div>${gainsHtml(app, live, b, job.to)}</div>`;
  }
  html += buildingInfo(app, live, b);
  if (!job && lvl < def.maxLevel) {
    const to = lvl + 1;
    const cost = levelCost(b.type, to);
    const err = checkUpgrade(live, b.id);
    const title = b.type === 'tc' ? `Naar het ${AGES[to].name}` : (lvl === 0 ? 'Bouwen' : `Verbeteren naar niveau ${to}`);
    html += `<div class="card"><h3>${icon('up')} ${title}</h3>${gainsHtml(app, live, b, to)}
      <div class="gcost">${costHtml(cost, live.res)}
      <div class="small muted" style="margin-top:4px">${icon('clock')} ${fmtDuration(buildTime(live, b.type, to, d.world.speed))}</div></div>`;
    if (b.type === 'tc') html += unlocksHtml(to, live.civ);
    if (err && err !== 'Niet genoeg grondstoffen.') html += `<p class="req">${err}</p>`;
    html += `<div class="actions"><button class="btn primary" data-action="upgrade" data-id="${b.id}" ${!canAct || err ? 'disabled' : ''}>${b.type === 'tc' ? 'Nieuw tijdperk' : (lvl === 0 ? 'Bouwen' : 'Verbeteren')}</button></div></div>`;
  } else if (lvl >= def.maxLevel) {
    html += `<p class="small muted">${icon('star')} Maximaal niveau bereikt.</p>`;
  }
  if (b.type !== 'tc' && b.type !== 'wall') {
    // afbreken (of een bouw stoppen): een deel van de grondstoffen komt terug
    const err = checkDemolish(live, b.id);
    const back = demolishRefund(live, b);
    const stop = lvl === 0;
    html += `<div class="card demolish"><h3>${icon('hammer')} ${stop ? 'Bouw stoppen' : 'Afbreken'}</h3>
      <div class="small muted">Je krijgt terug: ${refundHtml(back)}</div>
      ${err ? `<p class="req">${err}</p>` : ''}
      <div class="actions"><button class="btn danger small" data-action="demolish" data-id="${b.id}" data-name="${esc(def.name)}" data-stop="${stop ? 1 : 0}" ${!canAct || err ? 'disabled' : ''}>${stop ? 'Bouw stoppen' : `${def.name} afbreken`}</button></div></div>`;
  }
  html += '<div class="actions"><button class="btn ghost" data-action="deselect">← Terug naar overzicht</button></div>';
  return html;
}

// eigen eenheden van het volk, getraind in het kasteel (stadscentrum vanaf niveau 3)
function castleHtml(app, live, b) {
  const civ = CIVS[live.civ];
  if (!civ) return '';
  const castle = b.level >= CASTLE_LEVEL;
  const head = `${civEmblem(live.civ, 18)} ${castle ? 'Kasteel' : 'Eenheden van je volk'} <span class="right">${civ.name}</span>`;
  if (!castle) {
    return `<div class="card castle-card"><h3>${head}</h3>
      <p class="small muted" style="margin:0 0 6px">Zodra je stadscentrum een kasteel wordt (${AGES[CASTLE_LEVEL].name}), train je hier de elite van je volk:</p>
      ${civ.units.map((k) => `<div class="row small castle-preview"><img src="${unitThumb(k, app.data.team.color)}" alt=""><span class="grow"><b>${UNITS[k].name}</b><br><span class="muted">${UNITS[k].desc}</span></span></div>`).join('')}</div>`;
  }
  return trainHtml(app, live, b, civ.units, head, 'castle-card');
}

function unlocksHtml(a, civ) {
  const bs = BUILD_ORDER.filter((t) => BUILDINGS[t].age === a).map((t) => BUILDINGS[t].name);
  const us = Object.keys(UNITS).filter((k) => UNITS[k].age === a && UNITS[k].building && (!UNITS[k].civ || UNITS[k].civ === civ)).map((k) => UNITS[k].name);
  if (a === CASTLE_LEVEL && CIVS[civ]) us.push('het kasteel');
  const more = a === 3 ? ['een derde bouwer'] : [];
  const all = [...bs, ...us, ...more, 'hogere gebouwniveaus', '+10% productie'];
  return `<p class="small" style="margin:6px 0 0"><b>Ontgrendelt:</b> ${all.join(', ')}.</p>`;
}

// het muurstuk of de poort die je aantikte
function wallTileHtml(app, live) {
  const w = app.selWall;
  if (!w) return '';
  const canAct = app.canAct;
  if (w.gate) {
    return `<div class="card"><h3>${icon('castle')} Deze poort</h3>
      <p class="small muted" style="margin:0">2 tegels breed. Gaat vanzelf open als je troepen erdoor willen en weer dicht als ze voorbij zijn.</p>
      <div class="actions move-row"><button class="btn" data-action="moveWall" data-what="gate" data-i="${w.i}" data-j="${w.j}" ${canAct ? '' : 'disabled'}>${icon('move')} Poort verplaatsen</button></div>
      <div class="actions"><button class="btn danger small" data-action="wallTileRemove" data-i="${w.i}" data-j="${w.j}" ${canAct ? '' : 'disabled'}>Poort afbreken</button></div></div>`;
  }
  const err = checkPlaceGate(live, w.i, w.j);
  const run = wallRun(live, w.i, w.j).length;
  return `<div class="card"><h3>${icon('hammer')} Dit muurstuk</h3>
    <div class="small muted" style="margin-bottom:4px">Verplaatsen (gratis):</div>
    <div class="actions move-row" style="margin-top:0"><button class="btn" data-action="moveWall" data-what="one" data-i="${w.i}" data-j="${w.j}" ${canAct ? '' : 'disabled'}>${icon('move')} Dit muurstuk</button>
      ${run > 1 ? `<button class="btn" data-action="moveWall" data-what="run" data-i="${w.i}" data-j="${w.j}" ${canAct ? '' : 'disabled'}>${icon('move')} Rechte muur (${run})</button>` : ''}</div>
    <div class="small muted">Poort maken (2 tegels breed, met het muurstuk ernaast): ${costHtml(GATE.cost, live.res)}</div>
    ${err && !/grondstoffen/.test(err) ? `<p class="req">${err}</p>` : ''}
    <div class="actions"><button class="btn small" data-action="gateHere" data-i="${w.i}" data-j="${w.j}" ${canAct && !err ? '' : 'disabled'}>Poort van maken</button>
      <button class="btn danger small" data-action="wallTileRemove" data-i="${w.i}" data-j="${w.j}" ${canAct ? '' : 'disabled'}>Afbreken</button></div></div>`;
}

// havenhuis: bootjes (bouwen, hoeveel bemand) en wat de vissers opbrengen
function harborHtml(app, live, b) {
  const d = app.data;
  const max = maxBoats(live); const boats = live.boats || 0; const ready = boatsReady(live);
  const fish = live.villagers.fish || 0;
  const per = FISH.rate * (1 + 0.1 * (age(live) - 1)) * d.world.speed * (1 + boost(live).food) * fishMult(live);
  const farm = GATHER_RATE.food * (1 + 0.1 * (age(live) - 1)) * d.world.speed * (1 + boost(live).food);
  const job = live.boatJob;
  const err = checkBoat(live);
  const boatIcons = Array.from({ length: FISH.boats[FISH.boats.length - 1] }, (_, k) => `<span class="boat-slot ${k < ready ? (k < Math.ceil(fish / FISH.crew) ? 'on' : 'idle') : k < max ? 'free' : 'locked'}" title="${k < ready ? (k < Math.ceil(fish / FISH.crew) ? 'vaart uit' : 'ligt aan de steiger: geef vissers') : k < max ? 'plaats voor een bootje' : 'meer bootjes op een hoger niveau'}">${icon('fish')}</span>`).join('');
  return `<div class="card"><h3>${icon('fish')} Vissersbootjes <span class="right">${boats}/${max}</span></h3>
    <div class="boat-slots">${boatIcons}</div>
    <dl class="kv"><dt>Vissers</dt><dd>${fish}/${ready * FISH.crew} (${FISH.crew} per bootje)</dd>
      <dt>Vangst per visser</dt><dd>${fmt(per)} voedsel/u <span class="muted">(boer: ${fmt(farm)})</span></dd>
      <dt>Vangst in totaal</dt><dd>+${fmt(per * fish)} voedsel/u</dd></dl>
    ${job ? `<div class="job"><span>Bootje in aanbouw</span> <span data-end="${job.end}"></span><div class="bar"><i data-start="${job.start}" data-end="${job.end}"></i></div></div>`
      : `<div class="row small" style="margin-top:6px"><span class="grow">Nieuw bootje: ${costHtml(FISH.boatCost, live.res)} <span class="muted">${fmtDuration(FISH.boatTime * 1000 / d.world.speed)}</span></span>
      <button class="btn small primary" data-action="buildBoat" ${app.canAct && !err ? '' : 'disabled'}>${icon('hammer')} Bootje bouwen</button></div>
      ${err && !/grondstoffen/.test(err) ? `<p class="small muted" style="margin:4px 0 0">${err}</p>` : ''}`}
    ${ready && fish < ready * FISH.crew ? `<p class="small" style="margin:6px 0 0">Er is nog plaats aan boord: geef dorpelingen de taak <b>Vissers</b>.</p>` : ''}
    <div class="actions"><button class="btn" data-action="deselect">Dorpelingen verdelen</button></div>
    <p class="small muted" style="margin:6px 0 0">Elk niveau: een bootje meer (hooguit ${FISH.boats[FISH.boats.length - 1]}) en ${Math.round(FISH.levelBonus * 100)}% sneller vissen. Niveau 3: kraan en lantaarn, 4: visafslag, 5: vuurtoren.</p></div>`;
}

function buildingInfo(app, live, b) {
  const d = app.data;
  const L = b.level;
  switch (b.type) {
    case 'tc': return trainHtml(app, live, b, ['villager']) + castleHtml(app, live, b);
    case 'barracks': case 'range': case 'stable': case 'workshop':
      return trainHtml(app, live, b, Object.keys(UNITS).filter((k) => UNITS[k].building === b.type));
    case 'house': return `<div class="card"><dl class="kv"><dt>Bevolking door dit huis</dt><dd>+${5 * L}</dd><dt>Totale ruimte</dt><dd>${popCap(live)}</dd></dl></div>`;
    case 'farm': case 'lumber': case 'quarry': case 'goldmine': {
      const r = Object.keys(BUILDINGS[b.type].slots)[0];
      return `<div class="card"><dl class="kv"><dt>Werkplekken (${RES_NAMES[r].toLowerCase()})</dt><dd>+${BUILDINGS[b.type].slots[r] * L}</dd>
        <dt>In totaal</dt><dd>${live.villagers[r]}/${slots(live)[r]} bezet</dd></dl>
        <div class="actions"><button class="btn" data-action="deselect">Dorpelingen verdelen</button></div></div>`;
    }
    case 'storage': return `<div class="card"><dl class="kv"><dt>Opslag per grondstof</dt><dd>${fmt(capacity(live))}</dd><dt>Verborgen voor plunderaars</dt><dd>${fmt(protectAmount(live))}</dd></dl></div>`;
    case 'smithy': return `<div class="card"><dl class="kv"><dt>Bonus aanval en verdediging</dt><dd>+${5 * L}%</dd>
      <dt>Uitrusting van je troepen</dt><dd>${['leer en brons', 'ijzer en maliën', 'plaatharnas'][gearOf(L)]}</dd></dl>
      <p class="small muted" style="margin:6px 0 0">Op niveau 3 krijgen je soldaten ijzeren helmen en maliën, op niveau 5 een glanzend plaatharnas.</p></div>`;
    case 'mill': return `<div class="card"><dl class="kv"><dt>Extra voedsel</dt><dd>+${5 * L}%</dd></dl></div>`;
    case 'harbor': return harborHtml(app, live, b);
    case 'guild': { const bo = boost(live); return `<div class="card"><dl class="kv"><dt>Extra productie</dt><dd>+${3 * L}% van alles</dd>
      <dt>In totaal</dt><dd>${RES.map((r) => `${RES_NAMES[r].toLowerCase()} +${Math.round(bo[r] * 100)}%`).join(' · ')}</dd></dl></div>`; }
    case 'lodge': return `<div class="card"><dl class="kv"><dt>Bouwers</dt><dd>${maxBuilds(live)} (+${BUILDINGS.lodge.builders})</dd><dt>Sneller bouwen</dt><dd>${L * 5}%</dd></dl></div>`;
    case 'academy': return academyHtml(app, live, b);
    case 'court': return courtHtml(app, live, b);
    case 'cathedral': return `<div class="card"><dl class="kv"><dt>Trouw van je volk</dt><dd>${Math.floor(loyalty(live))}/100</dd>
      <dt>Herstel</dt><dd>${loyaltyRegen(live)} per uur</dd><dt>Punten</dt><dd>+${fmt(600 * L)}</dd></dl></div>`;
    case 'tower': {
      const top = TOWER.hp.length - 1;
      const n = Math.max(1, Math.min(top, L));
      return `<div class="card"><dl class="kv"><dt>Schade per pijl</dt><dd>${TOWER.dmg[n]}</dd>
        <dt>Levens</dt><dd>${TOWER.hp[n]}</dd><dt>Bereik</dt><dd>${TOWER.range} passen</dd>
        <dt>Schiet om de</dt><dd>${TOWER.rate / 1000} s</dd><dt>Verdediging (automatisch)</dt><dd>+${80 * L}</dd></dl>
      <p class="small muted" style="margin:6px 0 0">Tijdens een veldslag schiet de toren op de dichtstbijzijnde vijand. Wordt hij gesloopt, dan verliest hij een niveau.</p></div>`;
    }
    case 'wall': {
      const n = (live.walls || []).length;
      const closed = n && wallEnclosed(live);
      return `${wallTileHtml(app, live)}<div class="card"><dl class="kv"><dt>Muurstukken</dt><dd>${n}</dd>
        <dt>Je stad is</dt><dd>${!n ? 'niet ommuurd' : closed ? '<b style="color:#3f8f3c">volledig ommuurd</b>' : '<b style="color:#b2372a">nog open</b>'}</dd>
        <dt>Verdedigingsbonus</dt><dd>${L ? `+${8 * L}% en +${30 * L}${closed ? '' : ' (30% zolang er een gat is)'}` : '—'}</dd></dl>
      <p class="small muted" style="margin:6px 0 0">Plaats muren zelf, tegel per tegel. Een gesloten ring rond je stadscentrum verdedigt volledig.
      Is je stad helemaal ommuurd, dan gaan je troepen enkel via een <b>poort</b> naar binnen en buiten.
      Vanaf niveau 3 worden houten palissades stenen muren; een hoger tijdperk laat sterkere muren toe.</p>
      <div class="actions" style="flex-wrap:wrap"><button class="btn primary" data-action="wallMode" ${L && app.canAct ? '' : 'disabled'}>${icon('hammer')} Muren plaatsen</button>
        <button class="btn" data-action="gateMode" ${L && app.canAct ? '' : 'disabled'}>Poort maken</button></div></div>`;
    }
    case 'monument': return `<div class="card"><dl class="kv"><dt>Punten van dit monument</dt><dd>${fmt(1500 * L)}+</dd></dl>
      <p class="small muted" style="margin:6px 0 0">Bescherm het goed: vijandelijke rammen kunnen het afbreken.</p></div>`;
    case 'market': return marketHtml(app, live);
    default: return '';
  }
}

export function maxTrain(live, unit, away) {
  const u = UNITS[unit];
  let n = 500;
  for (const r of RES) if (u.cost[r]) n = Math.min(n, Math.floor((live.res[r] + 1e-6) / u.cost[r]));
  n = Math.min(n, Math.floor((popCap(live) - homePop(live) - away) / u.pop));
  return Math.max(0, n);
}

function trainHtml(app, live, b, units, title = null, cls = '') {
  const d = app.data;
  const canAct = app.canAct;
  let html = `<div class="card ${cls}"><h3>${title || `${icon('target')} Trainen`}</h3>`;
  for (const k of units) {
    const u = UNITS[k];
    const err = checkTrain(live, k, 1, d.awayPop, u.noble ? awayNobles(app) : 0);
    const locked = age(live) < u.age || bLevel(live, u.building) < u.bl;
    const max = u.noble ? (err ? 0 : 1) : maxTrain(live, k, d.awayPop);
    const lvl = u.queue === 'castle' ? b.level - CASTLE_LEVEL + 1 : b.level;
    const t = Math.round((u.time * Math.pow(0.85, Math.max(0, lvl - 1))) / d.world.speed);
    html += `<div class="urow"><img src="${unitThumb(k, d.team.color)}" alt="">
      <div><div class="nm">${u.name}${u.unique ? ` <span class="elite-tag">${icon('star')} elite</span>` : ''}</div>
      ${u.atk !== undefined && ARMY_UNITS.includes(k) ? `<div class="stats"><span title="Levenspunten">${icon('heart')} ${u.hp}</span><span title="Aanval">${icon('swords')} ${u.atk}</span><span title="Verdediging tegen voetvolk / ruiters / schutters">${icon('shield')} ${u.def.inf}/${u.def.cav}/${u.def.rng}</span><span title="Snelheid (tegels per uur)">${icon('horse')} ${u.speed}</span><span title="Draagvermogen">${icon('cart')} ${u.carry}</span>${u.pop > 1 ? `<span title="Bevolking">${icon('people')} ${u.pop}</span>` : ''}</div>` : ''}
      ${u.desc ? `<div class="small muted">${u.desc}</div>` : ''}
      <div class="row small" style="margin-top:3px">${costHtml(u.cost, live.res)}<span class="muted">${icon('clock')} ${fmtDuration(t * 1000)}</span></div>
      ${locked ? `<p class="req">${err}</p>` : `<div class="trainrow">
        <input class="num" type="number" min="1" max="${Math.max(1, max)}" value="${Math.min(Math.max(1, max), k === 'villager' ? 5 : 10)}" id="tn-${k}">
        <button class="btn small" data-action="setmax" data-unit="${k}" data-max="${max}">max ${max}</button>
        <button class="btn primary small" data-action="train" data-unit="${k}" ${!canAct || max < 1 ? 'disabled' : ''}>Trainen</button>
      </div>${max < 1 && err ? `<p class="req">${err}</p>` : ''}`}
      </div></div>`;
  }
  html += '</div>';
  const q = live.queues[b.type];
  if (q && q.length) html += trainQueueHtml(app, { [b.type]: q });
  return html;
}

function marketHtml(app, live) {
  const rate = marketRate(live);
  const canAct = app.canAct;
  const L = bLevel(live, 'market');
  const opts = (sel) => RES.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${RES_NAMES[r]}</option>`).join('');
  return `<div class="card"><h3>${icon('scales')} Ruilen met handelaars</h3>
    <p class="small muted" style="margin:0 0 6px">Koers: 100 → ${Math.round(rate * 100)}</p>
    <div class="trainrow"><select class="field" id="tr-give" style="width:auto">${opts('food')}</select> →
      <select class="field" id="tr-get" style="width:auto">${opts('gold')}</select></div>
    <div class="trainrow"><input class="num" id="tr-amount" type="number" min="10" step="10" value="100">
      <button class="btn primary small" data-action="trade" ${canAct ? '' : 'disabled'}>Ruilen</button></div></div>
    <div class="card"><h3>${icon('cart')} Karavaan naar bondgenoot</h3>
    <p class="small muted" style="margin:0 0 6px">Max. ${fmt(MARKET.shipPerLevel * L)} grondstoffen per karavaan. Kies je bondgenoot op de wereldkaart of hieronder.</p>
    <div id="allyList" class="small muted">Bondgenoten laden…</div></div>`;
}

// ---------- wereldpaneel ----------
export function worldPanelHtml(app, sel) {
  const d = app.data;
  const now = app.now();
  if (!sel) return worldOverviewHtml(app);
  const me = d.town;
  if (sel.kind === 'camp') {
    const c = sel.obj;
    const dist = Math.hypot(c.x - me.x, c.y - me.y);
    const u = campUnits(c.level);
    const loot = campLoot(c.level);
    return `<div class="ph"><div><h2>Roverskamp</h2><div class="lvl">Niveau ${c.level} · positie (${c.x}, ${c.y}) · ${dist.toFixed(1)} tegels</div></div></div>
      <p class="desc">Rovers plunderen de vallei. Versla ze voor buit en punten — ook tijdens je vrede! Na een aanval herstelt het kamp zich na een tijdje.</p>
      ${targetMarchesHtml(app, 'camp', c.id)}
      ${c.plundered ? `<div class="card"><b>Verlaten.</b> De rovers keren terug over ${timer(c.refreshAt)}.</div>` : ''}
      <div class="card"><h3>Geschatte bezetting (vol kamp)</h3><div class="unitgrid">${Object.keys(u).map((k) => `<div class="ucell"><img src="${unitThumb(k, '#333333')}" alt=""><b>${u[k]}</b>${UNITS[k].name}</div>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 2px">Buit (vol kamp):</p>${costHtml(loot)}
      <p class="small muted" style="margin:8px 0 2px">Plus krijgsbuit als je alle rovers verslaat (${Math.round(WAR.bounty * 100)}% van hun uitrusting):</p>${costHtml(bountyOf(u))}</div>
      <div class="actions"><button class="btn danger" data-action="send" data-kind="attack" ${app.canAct ? '' : 'disabled'}>${icon('swords')} Aanvallen</button>
      <button class="btn" data-action="send" data-kind="scout" ${app.canAct ? '' : 'disabled'}>${icon('magnifier')} Verkennen</button></div>`;
  }
  const t = sel.obj;
  const team = app.map && app.map.teams.find((x) => x.id === t.teamId);
  const mine = t.id === me.id;
  const ally = t.teamId === d.me.teamId;
  const dist = Math.hypot(t.x - me.x, t.y - me.y);
  let html = `<div class="ph"><img class="thumb" src="${buildingThumb('tc', t.age, team ? team.color : '#888', t.civ)}" alt="">
    <div><h2>${esc(t.name)}</h2><div class="lvl">${esc(t.player)} ${t.bot ? `· <span class="bot-tag" title="Een computerspeler: bouwt zijn rijk uit en valt aan zoals een echte speler. Sterkte: ${t.botTier || 'gemiddeld'} (t.o.v. de echte spelers)">computer${t.botTier ? ` · ${t.botTier}` : ''}</span>` : t.online ? '· <span style="color:#3f8f3c">● online</span>' : ''}</div>
    ${t.civ ? `<div class="small">${civEmblem(t.civ, 14)} ${civName(t.civ)}</div>` : ''}
    ${team ? `<span class="pill" style="background:${team.color}">${esc(team.name)}</span>` : ''}</div></div>
    ${t.vassal && t.vassal.until > now ? `<p class="vassal-tag">${icon('crown')} Vazal van <b>${esc(t.vassal.lname)}</b> · nog ${timer(t.vassal.until)}</p>` : ''}
    <div class="card"><dl class="kv"><dt>Tijdperk</dt><dd>${AGES[t.age].short}</dd><dt>Punten</dt><dd>${fmt(t.score)}</dd>
    <dt>Trouw</dt><dd>${loyBar(t.loyalty ?? 100, (t.loyalty ?? 100) < 50 ? 'low' : '')}${t.shield && t.shield > now ? `<span class="small muted">beschermd nog ${timer(t.shield)}</span>` : ''}</dd>
    <dt>Gebouwen</dt><dd>${t.buildings}</dd><dt>Muur</dt><dd>${t.wall ? `niveau ${t.wall}` : 'geen'}</dd>
    ${t.monument ? `<dt>Monument</dt><dd>niveau ${t.monument}</dd>` : ''}
    <dt>Positie</dt><dd>(${t.x}, ${t.y})</dd>${mine ? '' : `<dt>Afstand</dt><dd>${dist.toFixed(1)} tegels</dd>`}</dl></div>
    ${targetMarchesHtml(app, 'town', t.id)}`;
  // heer en vazal: elkaar helpen mag, aanvallen niet
  const myVassal = t.vassal && t.vassal.until > now && t.vassal.lord === d.me.id;
  const myLord = app.live && app.live.vas && app.live.vas.until > now && app.live.vas.ltown === t.id;
  if (mine) {
    html += `<div class="actions"><button class="btn primary" data-action="view" data-view="town">${icon('castle')} Naar mijn stad</button></div>`;
  } else if (myVassal || myLord) {
    html += `<p class="desc">${icon('crown')} ${myVassal ? 'Dit is je vazal: je valt hem niet aan, maar je kan hem helpen.' : 'Dit is je heer: je kan hem niet aanvallen. Koop je vrij of laat een clanlid hem verslaan.'}</p>
      <div class="actions"><button class="btn green" data-action="send" data-kind="support" ${app.canAct ? '' : 'disabled'}>${icon('shield')} Troepen sturen</button>
      <button class="btn" data-action="send" data-kind="trade" ${app.canAct ? '' : 'disabled'}>${icon('cart')} Grondstoffen</button></div>`;
  } else if (ally) {
    const peace = now < d.me.peaceEnd || now < (t.peaceEnd || 0);
    html += `<p class="desc">${icon('team')} Dit is je bondgenoot. Help elkaar met troepen en grondstoffen!</p>
      <div class="actions wrapbtns"><button class="btn green" data-action="send" data-kind="support" ${app.canAct ? '' : 'disabled'}>${icon('shield')} Troepen sturen</button>
      <button class="btn" data-action="send" data-kind="trade" ${app.canAct ? '' : 'disabled'}>${icon('cart')} Grondstoffen</button>
      <button class="btn" data-action="dmOpen" data-id="${t.playerId}">${icon('chat')} Bericht</button></div>
      <details class="betray"><summary>${icon('swords')} Verraad…</summary>
      <p class="small muted">Je kan je bondgenoot ook aanvallen terwijl hij nog in je clan zit. Hij en je clan zien je leger aankomen, en de clan kan je daarna ${CLAN.traitorMs / 86400000} dagen lang buitenzetten.</p>
      <div class="actions wrapbtns"><button class="btn danger" data-action="send" data-kind="attack" data-betray="1" ${!peace && app.canAct ? '' : 'disabled'}>${icon('swords')} Bondgenoot aanvallen</button>
      <button class="btn" data-action="send" data-kind="scout" data-betray="1" ${!peace && app.canAct ? '' : 'disabled'}>${icon('magnifier')} Verkennen</button></div>
      ${peace ? `<p class="small req">${icon('dove')} Nog vrede: aanvallen kan pas na ${clockTime((Math.max(d.me.peaceEnd, t.peaceEnd || 0)) - (app.offset || 0))}.</p>` : ''}</details>`;
  } else {
    // vrede: een aanval mag pas aankomen als de vrede van beide spelers voorbij is
    const mine = now < d.me.peaceEnd;
    const theirs = now < (t.peaceEnd || 0);
    if (mine) html += `<p class="req">${icon('dove')} Je hebt nog vrede (nog ${timer(d.me.peaceEnd)}): tot dan kan je geen spelers aanvallen, en zij jou niet.</p>`;
    else if (theirs) html += `<p class="req">${icon('dove')} ${esc(t.player)} is net begonnen en heeft nog vrede (nog ${timer(t.peaceEnd)}, tot ${clockTime(t.peaceEnd - (app.offset || 0))}). Je leger mag pas daarna aankomen.</p>`;
    const nob = (app.live && app.live.units.noble) || 0;
    if (nob && !mine) {
      const why = t.vassal && t.vassal.until > now ? 'deze stad is al vazal' : t.shield && t.shield > now ? 'deze stad is net bevrijd'
        : t.score < (((app.map && app.map.towns.find((x) => x.id === me.id)) || {}).score || 0) * LOYALTY.minScore ? 'deze stad is veel kleiner dan de jouwe' : (d.vassals || []).length >= VASSAL.maxPerLord ? `je hebt al ${VASSAL.maxPerLord} vazallen` : null;
      html += `<p class="small ${why ? 'req' : 'muted'}">${icon('crown')} ${why ? `Edelmannen kunnen hier niets doen: ${why}.` : `Stuur een edelman mee: wint je leger en overleeft hij, dan zakt de trouw met ${LOYALTY.hit}.`}</p>`;
    }
    html += `<div class="actions"><button class="btn danger" data-action="send" data-kind="attack" ${!mine && app.canAct ? '' : 'disabled'}>${icon('swords')} Aanvallen</button>
      <button class="btn" data-action="send" data-kind="scout" ${!mine && app.canAct ? '' : 'disabled'}>${icon('magnifier')} Verkennen</button></div>`;
    // onderhandelen en clans: een bericht sturen, uitnodigen in je clan of vragen om bij de zijne te komen
    if (!t.bot) {
      html += `<div class="actions wrapbtns"><button class="btn" data-action="dmOpen" data-id="${t.playerId}">${icon('chat')} Bericht</button>
        <button class="btn" data-action="clanInvite" data-id="${t.playerId}" data-name="${esc(t.player)}">${icon('plus')} In je clan uitnodigen</button>
        ${team ? `<button class="btn" data-action="clanRequest" data-id="${team.id}" data-name="${esc(team.name)}">${icon('flag')} Vraag om bij ${esc(team.name)} te komen</button>` : ''}</div>`;
    }
  }
  return html + `<div class="actions"><button class="btn ghost" data-action="deselect">← Overzicht</button></div>`;
}

const KIND = { attack: ['swords', 'Aanval'], scout: ['magnifier', 'Verkenning'], support: ['shield', 'Versterking'], trade: ['cart', 'Karavaan'], tribute: ['crown', 'Schatting'], return: ['home', 'Terugkeer'] };

export function marchesHtml(app) {
  const d = app.data;
  const ms = [...d.marches].sort((a, b) => a.arriveAt - b.arriveAt);
  if (!ms.length) return '<p class="empty">Er zijn geen legers onderweg.</p>';
  return ms.map(marchItem).join('');
}

function marchItem(m) {
  const [ic, nm] = KIND[m.kind] || ['•', m.kind];
  const hostile = !m.ally;
  const back = m.status === 'back';
  const label = hostile ? `<b style="color:var(--red)">${m.betray ? 'Verraad! ' : ''}${nm} van ${esc(m.player)}</b> op ${esc(m.to.name)}`
    : m.betray && !back ? `<b style="color:var(--red)">Verraad:</b> ${m.own ? '' : `${esc(m.player)}: `}${nm} → ${esc(m.to.name)}`
    : back ? `${m.own ? '' : `${esc(m.player)}: `}Terug van ${esc(m.to.name)}` : `${m.own ? '' : `${esc(m.player)}: `}${nm} → ${esc(m.to.name)}`;
  const fight = m.status === 'battle' ? ` <b style="color:var(--red)">· veldslag bezig</b>` : '';
  return `<div class="qitem"><span class="qicon">${icon(back ? 'home' : ic)}</span>
    <div><div class="nm">${label}${fight}</div><div class="small muted">${marchCargo(m)}</div>
    ${bar(m.departAt, m.arriveAt)}</div>${m.status === 'battle' ? '' : timer(m.arriveAt)}</div>`;
}

// klokuur (en dag als het niet vandaag is), bv. 'om 14:05' of 'ma om 09:30'
function clockTime(t) {
  const d = new Date(t);
  const hm = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? `om ${hm}` : `${d.toLocaleDateString('nl-BE', { weekday: 'short' })} om ${hm}`;
}

// legers die op weg zijn naar deze stad of dit kamp (je eigen aanvallen, die van bondgenoten en vijandelijke)
function targetMarchesHtml(app, kind, id) {
  const ms = app.data.marches.filter((m) => m.to.kind === kind && m.to.id === id && m.status !== 'back').sort((a, b) => a.arriveAt - b.arriveAt);
  if (!ms.length) return '';
  const first = ms[0];
  const head = first.status === 'battle' ? 'Veldslag bezig' : `Aankomst ${clockTime(first.arriveAt - (app.offset || 0))} · over ${timer(first.arriveAt)}`;
  return `<div class="card march-target"><h3>${icon('flag')} Onderweg hierheen <span class="right">${head}</span></h3>${ms.map(marchItem).join('')}</div>`;
}

function marchCargo(m) {
  const res = m.res && RES.filter((r) => m.res[r] > 0).map((r) => `${fmt(m.res[r])} ${RES_NAMES[r].toLowerCase()}`).join(', ');
  if (m.kind === 'trade' || m.kind === 'tribute') return `lading: ${res || '—'}`;
  const units = m.units ? unitsText(m.units) : 'onbekende troepen';
  return res ? `${units} · buit: ${res}` : units;
}

// soorten meldingen, elk apart aan/uit op dit toestel (zelfde namen als NOTIFY_KINDS op de server)
const PUSH_KINDS = [
  ['now', 'shield', 'Aanval op je stad', 'meteen als iemand een leger naar je stad stuurt'],
  ['ally', 'team', 'Aanval op een clanlid', 'meteen als iemand een leger naar de stad van een clanlid stuurt: tijd om versterking te sturen'],
  ['attack', 'hourglass', 'Aanval komt bijna aan', '±2 minuten voor een aanval op je stad aankomt, en bij een overval van de barbaren'],
  ['build', 'hammer', 'Een bouwer is vrij', 'als een bouwwerk klaar is (niet als je het spel open hebt)'],
  ['march', 'swords', 'Je leger komt bijna aan', '±2 minuten vooraf, om zelf te kiezen: zelf besturen of automatisch'],
];

function pushPrefsHtml(app) {
  const p = app.pushPrefs;
  if (!p) return '';
  return `<div class="push-prefs">${PUSH_KINDS.map(([k, ic, label, sub]) => `
    <button class="push-pref ${p[k] ? 'on' : ''}" data-action="pushPref" data-k="${k}" role="switch" aria-checked="${!!p[k]}">
      <span class="pp-ic">${icon(ic)}</span><span class="pp-tx"><b>${label}</b><span>${sub}</span></span><i class="tgl" aria-hidden="true"></i>
    </button>`).join('')}</div>`;
}

// meldingen op je gsm: aanval op je stad of op een clanlid, bouwer vrij, je leger komt aan (elk apart aan/uit)
export function pushCardHtml(app) {
  const st = app.pushState;
  if (st === 'unsupported') return '';
  const head = `<h3>${icon('bell')} Meldingen op je gsm</h3>`;
  const note = (t, cls) => (t ? `<p class="push-msg ${cls}">${icon(cls === 'ok' ? 'star' : 'bell')}<span>${esc(t)}</span></p>` : '');
  if (app.pushBusy) {
    return `<div class="card push-card">${head}<p class="small muted" style="margin:0">Bezig met aanzetten… Tik op <b>Toestaan</b> als je gsm het vraagt.</p>
      <div class="actions"><button class="btn primary small" disabled><span class="spin"></span> Bezig…</button></div></div>`;
  }
  if (st === 'on') {
    return `<div class="card push-card on">${head}${note(app.pushNote, 'ok')}<p class="small muted" style="margin:0">Staan aan op dit toestel. Kies welke meldingen je wil krijgen:</p>
      ${pushPrefsHtml(app)}
      <div class="actions"><button class="btn small" data-action="pushTest">Proefmelding</button><button class="btn small ghost" data-action="pushOff">Alles uitzetten</button></div></div>`;
  }
  if (st === 'ios-home') {
    return `<div class="card push-card">${head}<p class="small muted" style="margin:0">Op een iPhone kan dat enkel vanuit de app op je beginscherm:
      tik in Safari op <b>Delen</b> › <b>Zet op beginscherm</b>, open het spel van daar en zet hier de meldingen aan.</p></div>`;
  }
  if (st === 'denied') {
    const how = app.inApp && app.inApp()
      ? 'Ga op je gsm naar <b>Instellingen › Apps › Rijken van de Vallei › Meldingen</b> en zet ze aan. Werkt dat niet, installeer dan de nieuwste app (1.1) over de oude heen.'
      : app.onAndroid
        ? 'Tik in Chrome op het <b>slotje</b> (of ⋮ › Site-instellingen) naast het adres › <b>Meldingen</b> › <b>Toestaan</b>. In de app: <b>Instellingen › Apps › Rijken van de Vallei › Meldingen</b>.'
        : 'Klik op het <b>slotje</b> naast het adres › <b>Meldingen</b> › <b>Toestaan</b>.';
    return `<div class="card push-card err">${head}${note('Meldingen zijn geblokkeerd voor dit spel.', 'err')}<p class="small muted" style="margin:0">${how} Kom daarna terug en tik op <b>Opnieuw proberen</b>.</p>
      <div class="actions"><button class="btn small" data-action="pushOn">${icon('bell')} Opnieuw proberen</button></div></div>`;
  }
  return `<div class="card push-card${app.pushErr ? ' err' : ''}">${head}${note(app.pushErr, 'err')}<p class="small muted" style="margin:0">Krijg een melding op je gsm bij een aanval op je stad of op een clanlid, als een bouwer vrij is en als je leger bijna aankomt. Daarna kies je zelf welke.</p>
    <div class="actions"><button class="btn primary small" data-action="pushOn">${icon('bell')} ${app.pushErr ? 'Opnieuw proberen' : 'Meldingen aanzetten'}</button></div></div>`;
}

// oefenslag: meteen 30 tegen 30 tegen de computer, zonder gevolgen
export function practiceCardHtml() {
  return `<div class="card practice-card"><h3>${icon('swords')} Oefenslag</h3><p class="small muted" style="margin:0">Oefen een belegering van 30 tegen 30 tegen de computer: meteen, zonder mars en zonder gevolgen voor je stad of leger.</p>
    <div class="actions"><button class="btn primary small" data-action="practice" data-role="att">${icon('swords')} Een stad aanvallen</button><button class="btn small" data-action="practice" data-role="def">${icon('shield')} Je stad verdedigen</button></div></div>`;
}

// aftelbalk: je leger komt binnen 2 minuten aan; kies nu al hoe de slag moet verlopen
export function arrivalHtml(app, m, more) {
  const pref = m.pref;
  return `<div class="arr-head">${icon('swords')} Je leger komt aan bij <b>${esc(m.to.name)}</b></div>
    <div class="arr-count"><span data-end="${m.arriveAt}">${fmtDuration(m.arriveAt - app.now())}</span></div>
    <div class="arr-choose"><span class="small">Bij aankomst:</span>
      <button class="btn small ${pref === 'manual' ? 'primary' : ''}" data-action="prechoose" data-id="${m.id}" data-mode="manual">${icon('flag')} Zelf besturen</button>
      <button class="btn small ${pref === 'auto' ? 'primary' : ''}" data-action="prechoose" data-id="${m.id}" data-mode="auto">${icon('hourglass')} Automatisch</button></div>
    <div class="small arr-note">${pref === 'manual' ? 'De slag begint meteen als je leger aankomt.' : pref === 'auto' ? 'De slag wordt automatisch uitgerekend.' : 'Kies je niets, dan krijg je bij aankomst nog 45 seconden.'}${more ? ` · +${more} andere aanval${more > 1 ? 'len' : ''}` : ''}</div>`;
}

function worldOverviewHtml(app) {
  const d = app.data;
  return `<div class="ph"><div><h2>De Vallei</h2><div class="lvl">Wereldkaart</div></div></div>
    <p class="desc">Klik op een stad of roverskamp. Bondgenoten herken je aan de kleur van hun gebied: <span class="pill" style="background:${d.team.color}">${esc(d.team.name)}</span></p>
    <div class="card"><h3>${icon('flag')} Onderweg</h3>${marchesHtml(app)}</div>
    ${pushCardHtml(app)}
    ${practiceCardHtml()}
    <div class="card small"><b>Legende</b><br>${icon('castle')} steden met teamkleur · ${icon('tent')} roverskampen (altijd aan te vallen) · gestippelde lijnen: legers onderweg (rood = vijandelijke aanval)</div>
    <div class="actions"><button class="btn" data-action="home">⌂ Naar mijn stad op de kaart</button></div>`;
}

// ---------- leger sturen ----------
export function sendHtml(app, live, target, kind) {
  const d = app.data;
  const me = d.town;
  const dist = Math.hypot(target.x - me.x, target.y - me.y);
  const titles = { attack: `${icon('swords')} Aanvallen`, scout: `${icon('magnifier')} Verkennen`, support: `${icon('shield')} Troepen sturen`, trade: `${icon('cart')} Grondstoffen sturen` };
  let html = `<h2>${titles[kind]}: ${esc(target.name)}</h2><p class="desc">Afstand: ${dist.toFixed(1)} tegels.</p>`;
  if (target.betray) html += `<p class="req">${icon('swords')} <b>Verraad.</b> ${esc(target.player || 'Deze speler')} is je bondgenoot. Hij en je clan zien je leger aankomen${kind === 'attack' ? `, en de clan kan je ${CLAN.traitorMs / 86400000} dagen lang buitenzetten` : ''}.</p>`;
  if (kind === 'trade') {
    const L = bLevel(live, 'market');
    if (!L) return html + '<p class="req">Je hebt een markt nodig om karavanen te sturen.</p>';
    html += `<p class="small muted">Je markt kan ${fmt(MARKET.shipPerLevel * L)} grondstoffen per karavaan versturen.</p>`;
    for (const r of RES) {
      html += `<div class="sendrow"><img src="${ICON[r]}" alt=""><div><b>${RES_NAMES[r]}</b><div class="small muted">${fmt(live.res[r])} beschikbaar</div></div>
        <input class="num" type="number" min="0" value="0" data-send-res="${r}" max="${Math.floor(live.res[r])}"><span></span></div>`;
    }
  } else {
    const list = kind === 'scout' ? ['scout'] : ARMY_UNITS;
    const avail = list.filter((k) => live.units[k] > 0);
    if (!avail.length) return html + `<p class="req">${kind === 'scout' ? 'Je hebt geen verkenners thuis (train ze in de stal).' : 'Je hebt geen troepen thuis.'}</p>`;
    for (const k of avail) {
      html += `<div class="sendrow"><img src="${unitThumb(k, d.team.color)}" alt=""><div><b>${UNITS[k].name}</b><div class="small muted">${fmt(live.units[k])} thuis</div></div>
        <input class="num" type="number" min="0" max="${live.units[k]}" value="0" data-send-unit="${k}">
        <button class="btn small" data-action="sendall" data-unit="${k}" data-n="${live.units[k]}">alle</button></div>`;
    }
  }
  html += `<div id="sendSummary" class="summary"></div>
    ${kind === 'attack' && (app.pushState !== 'on' || app.pushNote) ? pushCardHtml(app) : ''}
    <div class="actions"><button class="btn ${kind === 'attack' ? 'danger' : 'primary'} big" data-action="dosend" data-kind="${kind}">Vertrekken</button></div>`;
  return html;
}

export function sendSummaryHtml(app, live, target, kind, units, res) {
  const d = app.data;
  const me = d.town;
  const dist = Math.hypot(target.x - me.x, target.y - me.y);
  const speed = kind === 'trade' ? MARKET.merchantSpeed : slowestSpeed(units);
  if (!speed) return '<span class="muted">Kies wat je wil sturen.</span>';
  const ms = Math.max(10000, (dist / speed) * 3600000 / d.world.speed);
  const arrive = new Date(app.now() + ms);
  let html = `<span>${icon('clock')} Reistijd <b>${fmtDuration(ms)}</b></span><span>${icon('clock')} Aankomst <b>${arrive.toLocaleString('nl-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</b></span>`;
  if (kind === 'attack') {
    const p = attackPower(units, bLevel(live, 'smithy'));
    const cm = carryMult(age(live));
    html += `<span>${icon('swords')} Aanvalskracht <b>${fmt(p.total)}</b></span><span title="Je troepen dragen ×${String(cm).replace('.', ',')} door je tijdperk (karren en lastdieren)">${icon('cart')} Draagvermogen <b>${fmt(carryCapacity(units, age(live)))}</b></span>`;
  }
  if (kind === 'trade') html += `<span>Totaal <b>${fmt(Object.values(res).reduce((a, b) => a + b, 0))}</b></span>`;
  if ((kind === 'attack' || kind === 'scout') && target.kind === 'town') {
    const peace = Math.max(d.me.peaceEnd, target.peaceEnd || 0);
    if (app.now() + ms > d.world.warEnd) html += '<span class="req">Komt pas na het einde van het seizoen aan!</span>';
    else if (app.now() + ms < peace) html += `<span class="req">${icon('dove')} Komt aan tijdens de vrede (die eindigt ${clockTime(peace - (app.offset || 0))}): dat mag niet.</span>`;
  }
  return html;
}

// ---------- rapporten ----------
const RICON = { attack: 'swords', defense: 'shield', scout: 'magnifier', support: 'team', trade: 'cart', info: 'bell', vassal: 'crown' };

export function reportsHtml(list, activeId, detail) {
  return `<h2>${icon('scroll')} Rapporten</h2>
    <div class="split"><div class="rlist">
      ${list.length ? '' : '<p class="empty">Nog geen rapporten.</p>'}
      ${list.map((r) => `<button class="ritem ${r.seen ? '' : 'unseen'} ${r.id === activeId ? 'active' : ''}" data-action="openReport" data-id="${r.id}">
        <span class="ricon">${icon(RICON[r.kind] || 'scroll')}</span>${esc(r.title)}<small>${new Date(r.created_at).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></button>`).join('')}
      ${list.some((r) => !r.seen) ? '<button class="btn small" data-action="readAll">Alles gelezen</button>' : ''}
    </div><div>${detail ? reportDetailHtml(detail) : '<p class="empty">Kies een rapport.</p>'}</div></div>`;
}

const bountySum = (b) => (b ? RES.reduce((a, r) => a + (b[r] || 0), 0) : 0);

function unitTable(rows, teamColor) {
  return `<table class="bt"><tr><th>Eenheid</th><th>Aantal</th><th>Verloren</th></tr>${rows.map(([k, n, l]) => `<tr><td><img src="${unitThumb(k, teamColor)}" alt="">${UNITS[k].name}</td><td>${fmt(n)}</td><td class="${l ? 'lost' : ''}">${l ? fmt(l) : '0'}</td></tr>`).join('')}</table>`;
}

// knop 'Bekijk de replay' bij een automatisch verlopen slag (24 uur lang)
function replayBtnHtml(id, at, attrs = `data-action="replay" data-id="${id}"`) {
  if (!id) return '';
  const left = at + REPLAY.ms - Date.now();
  if (left <= 0) return '<p class="small muted">De replay van deze slag is niet meer beschikbaar (24 uur).</p>';
  const h = Math.floor(left / 3600000); const m = Math.floor((left % 3600000) / 60000);
  return `<div class="replay-row"><button class="btn primary small" ${attrs}>${icon('play')} Bekijk de replay</button>
    <span class="small muted">De slag verliep automatisch. Nog ${h ? `${h} u ` : ''}${m} min te bekijken.</span></div>`;
}

export function reportDetailHtml(r) {
  const d = r.data;
  const when = new Date(r.created_at).toLocaleString('nl-BE');
  if (d.type === 'battle') {
    const win = (r.kind === 'attack') === d.attWins;
    const attRows = Object.keys(d.attUnits).filter((k) => d.attUnits[k]).map((k) => [k, d.attUnits[k], (d.attLost || {})[k] || 0]);
    const defRows = Object.keys(d.defUnits || {}).filter((k) => d.defUnits[k]).map((k) => [k, d.defUnits[k], (d.defLost || {})[k] || 0]);
    return `<p class="outcome ${win ? 'win' : 'lose'}">${win ? 'Overwinning!' : 'Nederlaag'}</p>
      <p class="small muted">${when}</p>${replayBtnHtml(d.replay, r.created_at)}
      <h3>Aanvaller: ${esc(d.attacker.name)} <span class="muted small">(${esc(d.attacker.town)})</span></h3>
      ${unitTable(attRows, '#d64545')}<p class="small">Aanvalskracht: <b>${fmt(d.A)}</b></p>
      <h3>Verdediger: ${esc(d.defender.name)} <span class="muted small">(${esc(d.defender.town)})</span></h3>
      ${defRows.length ? unitTable(defRows, '#3f7fd9') : '<p class="empty">Geen troepen aanwezig.</p>'}
      <p class="small">Verdedigingskracht: <b>${fmt(d.D)}</b>${d.supporters && d.supporters.length ? ` · met steun van ${d.supporters.map(esc).join(', ')}` : ''}</p>
      ${d.attWins ? `<h3>Buit</h3>${costHtml(d.loot)}` : ''}
      ${bountySum(d.bounty) ? `<h3>Krijgsbuit</h3><p class="small muted">${d.attWins ? 'De aanvaller' : 'De verdediger'} hield het slagveld en raapte de wapens en uitrusting van de gesneuvelde ${d.attWins ? 'verdedigers' : 'aanvallers'} op (${Math.round(WAR.bounty * 100)}% van hun waarde).</p>${costHtml(d.bounty)}` : ''}
      ${d.wallDamage ? `<p class="req">De muur werd ${d.wallDamage} niveau(s) beschadigd.</p>` : ''}
      ${d.monumentDamage ? `<p class="req">Het monument werd beschadigd!</p>` : ''}
      ${d.noble ? `<h3>${icon('crown')} Trouw van ${esc(d.defender.town)}</h3>${d.noble.blocked ? `<p class="small">${esc(d.noble.blocked)}</p>`
        : `<div class="row small"><span>${d.noble.before}</span><span class="grow">${loyBar(d.noble.after, d.noble.after < 50 ? 'low' : '')}</span></div>
        <p class="small">${d.noble.conquered ? `<b>${esc(d.defender.town)} is nu vazal van ${esc(d.attacker.name)}!</b>` : `De edelm${d.noble.nobles > 1 ? 'annen' : 'an'} verlaagde${d.noble.nobles > 1 ? 'n' : ''} de trouw van ${d.noble.before} naar ${d.noble.after}.`}</p>`}` : ''}
      ${d.freed ? `<p class="outcome win">${icon('crown')} ${d.freed > 1 ? `${d.freed} vazallen zijn` : 'Een vazal is'} bevrijd!</p>` : ''}`;
  }
  if (d.type === 'scout') {
    let html = `<p class="outcome ${d.success ? 'win' : 'lose'}">${d.success ? 'Verkenning geslaagd' : 'Verkenners gevangen'}</p><p class="small muted">${when} · ${esc(d.target)} · ${d.left}/${d.sent} verkenners terug</p>`;
    if (d.success) {
      const u = d.units || {};
      const keys = Object.keys(u).filter((k) => u[k]);
      html += `<h3>Troepen</h3>${keys.length ? `<div class="unitgrid">${keys.map((k) => `<div class="ucell"><img src="${unitThumb(k, '#888888')}" alt=""><b>${fmt(u[k])}</b>${UNITS[k].name}</div>`).join('')}</div>` : '<p class="empty">Geen troepen.</p>'}`;
      if (d.support && Object.keys(d.support).length) html += `<p class="small">Plus versterking: ${unitsText(d.support)}</p>`;
      if (d.res) html += `<h3>Grondstoffen</h3>${costHtml(d.res)}${d.protect ? `<p class="small muted">Waarvan ${fmt(d.protect)} per soort verborgen in de opslag.</p>` : ''}`;
      if (d.levels) html += `<h3>Gebouwen</h3><p class="small">${Object.keys(d.levels).map((k) => `${BUILDINGS[k].name} ${d.levels[k]}`).join(' · ')}</p>`;
      if (d.villagers) html += `<p class="small">Dorpelingen: ${d.villagers}</p>`;
    }
    return html;
  }
  if (d.type === 'scouted') return `<p class="outcome ${d.success ? 'lose' : 'win'}">${d.success ? 'Je werd bespioneerd' : 'Spionnen gevangen!'}</p><p>${esc(d.attacker)} stuurde ${d.sent} verkenners.</p>`;
  if (d.type === 'support') return `<p class="outcome win">Versterking aangekomen</p><p>${esc(d.from)} stuurde: ${unitsText(d.units)}.</p>`;
  if (d.type === 'trade') return `<p class="outcome win">${d.tribute ? 'Schatting aangekomen' : 'Karavaan aangekomen'}</p><p>${esc(d.from)} stuurde${d.tribute ? ' (als vazal)' : ''}:</p>${costHtml(d.res)}`;
  if (d.type === 'vassal') {
    const why = { time: 'De tijd als vazal is voorbij.', ransom: 'Er werd losgeld betaald.', attack: 'Een clanlid versloeg de heer.' }[d.why] || '';
    return `<p class="outcome win">${icon('crown')} ${esc(d.town)} is vrij</p><p>${why} Heer was: ${esc(d.lord)}.</p>
      <p class="small muted">De stad is nu ${LOYALTY.shieldMs / 3600000} uur beschermd tegen edelmannen.</p>`;
  }
  if (d.type === 'info') return `<p class="outcome">Bericht van de spelleider</p><p>${esc(d.text)}</p>`;
  if (d.type === 'clan') return `<p class="outcome">${icon('flag')} Clan</p><p>${esc(d.text)}</p>`;
  return '<p>Onbekend rapport.</p>';
}

// ---------- team en chat ----------
const agoText = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 5) return '<span style="color:var(--green)">● online</span>';
  if (m < 60) return `${m} min geleden`;
  if (m < 1440) return `${Math.floor(m / 60)} u geleden`;
  return `${Math.floor(m / 1440)} d geleden`;
};
const clanPill = (t) => (t ? `<span class="pill" style="background:${t.color || '#888'}">${esc(t.name)}</span>` : '');

export function teamHtml(app, team, chan, clan) {
  const d = app.data;
  const c = clan || { clans: [], invites: [], requests: [], sent: [], max: 4, alone: (team || []).length <= 1, switchAt: 0 };
  return `<h2>${icon('team')} <span style="color:${d.team.color}">${esc(d.team.name)}</span></h2>
    <p class="desc">Bondgenoten helpen elkaar met troepen en grondstoffen. Je kan je clan verlaten, andere spelers uitnodigen of vragen om bij hun clan te komen, en iedereen een privébericht sturen.</p>
    <div id="clanAsk">${clanAskHtml(c)}</div>
    <div class="members">${(team || []).map((m) => `<div class="card${m.traitor ? ' traitor' : ''}" style="margin:0">
      <h3>${esc(m.player)}${m.me ? ' (jij)' : ''}${m.traitor ? ` <span class="traitor-tag" title="Viel de laatste dagen een clanlid aan">${icon('swords')} verrader</span>` : ''}<span class="right">${agoText(m.lastSeen)}</span></h3>
      <div class="small">${esc(m.town)} · (${m.x}, ${m.y}) · ${AGES[m.age].short}tijd · ${fmt(m.score + m.killPts)} ptn</div>
      ${costHtml(m.res)}
      <div class="small muted" style="margin-top:4px">${m.villagers} dorpelingen · ${unitsText(m.units)}</div>
      <div class="actions wrapbtns">${m.me ? '' : `<button class="btn small" data-action="mapTo" data-x="${m.x}" data-y="${m.y}" data-id="${m.townId}">Op kaart</button>
        <button class="btn small green" data-action="sendTo" data-kind="support" data-id="${m.townId}">Troepen</button>
        <button class="btn small" data-action="sendTo" data-kind="trade" data-id="${m.townId}">Karavaan</button>
        <button class="btn small" data-action="dmOpen" data-id="${m.playerId}">${icon('chat')} Bericht</button>
        ${m.traitor ? `<button class="btn small danger" data-action="clanKick" data-id="${m.playerId}" data-name="${esc(m.player)}">Uit de clan zetten</button>` : ''}`}</div>
    </div>`).join('')}</div>
    <div class="chat"><div class="tabs">
      <button class="tab ${chan === 'team' ? 'active' : ''}" data-action="chatTab" data-chan="team">Clanchat</button>
      <button class="tab ${chan === 'world' ? 'active' : ''}" data-action="chatTab" data-chan="world">Iedereen</button>
      <button class="tab ${chan === 'dm' ? 'active' : ''}" data-action="chatTab" data-chan="dm">Privé</button></div>
      <div class="msgs" id="chatMsgs"><p class="empty">Laden…</p></div>
      <form id="chatForm"><input class="field" name="text" maxlength="300" placeholder="Schrijf een bericht…" autocomplete="off"><button class="btn primary">Stuur</button></form>
    </div>
    <div id="clanList">${clanListHtml(app, c)}</div>`;
}

// bovenaan het Team-venster: uitnodigingen voor jou en verzoeken om bij jouw clan te komen
export function clanAskHtml(c) {
  const left = (r) => `<span class="small muted">nog ${fmtDuration(Math.max(0, r.until - Date.now()))}</span>`;
  let html = '';
  if (c.invites.length) {
    html += `<div class="card clan-ask"><h3>${icon('flag')} Uitnodiging${c.invites.length > 1 ? 'en' : ''}</h3>
      <p class="small muted" style="margin:0 0 6px">Aanvaarden = je verlaat je huidige clan en komt meteen bij de nieuwe.</p>
      ${c.invites.map((r) => `<div class="row"><span class="grow">${clanPill(r.team)} nodigt je uit${r.by ? ` (door ${esc(r.by)})` : ''} · ${r.team ? r.team.count : '?'}/${c.max} leden · ${left(r)}</span>
        <button class="btn small green" data-action="clanAnswer" data-id="${r.id}" data-accept="1">Aanvaarden</button>
        <button class="btn small" data-action="clanAnswer" data-id="${r.id}">Weigeren</button></div>`).join('')}</div>`;
  }
  if (c.requests.length) {
    html += `<div class="card clan-ask"><h3>${icon('people')} Wil${c.requests.length > 1 ? 'len' : ''} bij jullie clan komen</h3>
      ${c.requests.map((r) => `<div class="row"><span class="grow"><b>${esc(r.player.name)}</b> vraagt om toe te treden · ${left(r)}</span>
        <button class="btn small" data-action="dmOpen" data-id="${r.player.id}">${icon('chat')}</button>
        <button class="btn small green" data-action="clanAnswer" data-id="${r.id}" data-accept="1">Aanvaarden</button>
        <button class="btn small" data-action="clanAnswer" data-id="${r.id}">Weigeren</button></div>`).join('')}</div>`;
  }
  return html;
}

// onderaan: alle clans in de vallei (toetreding vragen, uitnodigen, bericht), wat je stuurde, en je clan verlaten
export function clanListHtml(app, c) {
  const d = app.data;
  const now = Date.now();
  const mine = c.clans.find((x) => x.id === d.me.teamId);
  const full = mine && mine.members.length >= c.max;
  const invited = new Set(c.sent.filter((r) => r.kind === 'invite').map((r) => r.player.id));
  const asked = new Set(c.sent.filter((r) => r.kind === 'request').map((r) => r.team && r.team.id));
  const wait = c.switchAt > now;
  const others = c.clans.filter((x) => x.id !== d.me.teamId).sort((a, b) => a.bot - b.bot || a.name.localeCompare(b.name));
  let html = `<div class="card"><h3>${icon('flag')} Clans in de vallei</h3><p class="small muted" style="margin:0 0 4px">Hooguit ${c.max} leden per clan. Vraag om toe te treden, nodig spelers uit of stuur ze een bericht om te onderhandelen.</p>`;
  html += others.length ? others.map((t) => {
    const tFull = t.members.length >= c.max;
    const btn = t.bot ? '<span class="small muted">computerclan</span>'
      : asked.has(t.id) ? '<span class="small muted">gevraagd</span>'
        : `<button class="btn small" data-action="clanRequest" data-id="${t.id}" data-name="${esc(t.name)}" ${tFull ? 'disabled title="Deze clan is vol"' : ''}>Vraag toetreding</button>`;
    return `<div class="clan-row"><div class="row"><span class="grow">${clanPill(t)} <span class="small muted">${t.members.length}/${c.max}</span></span>${btn}</div>
      <div class="clan-members">${t.members.map((m) => `<span class="clan-mem">${m.online ? '<i class="on"></i>' : ''}${esc(m.name)}${m.bot ? ' <span class="bot-tag">computer</span>' : `
        <button class="btn tiny" data-action="dmOpen" data-id="${m.id}" title="Privébericht">${icon('chat')}</button>${invited.has(m.id) ? '<span class="small muted">uitgenodigd</span>'
          : `<button class="btn tiny" data-action="clanInvite" data-id="${m.id}" data-name="${esc(m.name)}" ${full ? 'disabled title="Je clan is vol"' : ''}>${icon('plus')} Uitnodigen</button>`}`}</span>`).join('')}</div></div>`;
  }).join('') : '<p class="empty">Er zijn nog geen andere clans.</p>';
  html += '</div>';
  if (c.sent.length) {
    html += `<div class="card"><h3>${icon('hourglass')} Wacht op antwoord</h3>${c.sent.map((r) => `<div class="row"><span class="grow">${r.kind === 'invite'
      ? `Jullie nodigden <b>${esc(r.player.name)}</b> uit${r.by ? ` (${esc(r.by)})` : ''}` : `Je vroeg om bij ${clanPill(r.team)} te komen`}</span>
      <button class="btn small" data-action="clanAnswer" data-id="${r.id}">Intrekken</button></div>`).join('')}</div>`;
  }
  html += `<div class="card"><h3>${icon('door')} Clan verlaten</h3>${c.alone
    ? '<p class="small muted" style="margin:0">Je bent alleen in je clan. Vraag om bij een andere clan te komen, of nodig spelers uit.</p>'
    : `<p class="small muted" style="margin:0 0 6px">Je sticht dan je eigen clan. Je troepen bij je bondgenoten komen naar huis (en die van hen bij jou). Wil je naar een andere clan, aanvaard dan gewoon een uitnodiging: dan wissel je meteen.</p>
      <div class="row"><input class="field grow" id="clanNewName" maxlength="24" placeholder="Naam nieuwe clan (mag leeg)"><button class="btn danger small" data-action="clanLeave" ${wait ? 'disabled' : ''}>Verlaten</button></div>`}
    ${wait ? `<p class="small req" style="margin:6px 0 0">Je wisselde net van clan: opnieuw wisselen kan over ${fmtDuration(c.switchAt - now)}.</p>` : ''}
    <p class="small muted" style="margin:6px 0 0">Je kan ook een bondgenoot aanvallen (verraad): tik zijn stad aan op de wereldkaart. De clan kan een verrader daarna ${CLAN.traitorMs / 86400000} dagen lang buitenzetten.</p></div>`;
  return html;
}

export function chatMsgsHtml(msgs) {
  if (!msgs.length) return '<p class="empty">Nog geen berichten. Zeg hallo!</p>';
  return msgs.map((m) => (m.player_id === 0
    ? `<div class="msg sys"><time>${new Date(m.created_at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</time> ${m.name !== 'Clan' ? `<b>${esc(m.name)}</b>: ` : ''}${esc(m.text)}</div>`
    : `<div class="msg${m.me ? ' me' : ''}"><b>${esc(m.name)}</b><time>${new Date(m.created_at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</time><br>${esc(m.text)}</div>`)).join('');
}

// privé: de lijst met gesprekken en alle spelers om een nieuw gesprek te beginnen
export function dmListHtml(list) {
  const day = (t) => { const x = new Date(t); return new Date().toDateString() === x.toDateString() ? x.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }); };
  const talked = new Set(list.convs.map((c) => c.with));
  const rest = list.players.filter((p) => !talked.has(p.id));
  return `${list.convs.length ? list.convs.map((c) => `<button class="dm-conv${c.unread ? ' unread' : ''}" data-action="dmOpen" data-id="${c.with}">
      <span class="grow"><b>${esc(c.name)}</b> ${clanPill(c.team ? { name: c.team, color: c.color } : null)}<br><span class="small muted">${c.me ? 'Jij: ' : ''}${esc(c.text)}</span></span>
      <span class="small muted">${day(c.at)}</span>${c.unread ? `<b class="bdg">${c.unread}</b>` : ''}</button>`).join('')
    : '<p class="empty">Nog geen privégesprekken. Onderhandel met een speler: kies hieronder met wie.</p>'}
    ${rest.length ? `<p class="small muted" style="margin:8px 0 2px">Nieuw gesprek met:</p><div class="dm-new">${rest.map((p) => `<button class="btn tiny" data-action="dmOpen" data-id="${p.id}"><i class="dot" style="background:${p.color || '#888'}"></i>${esc(p.name)}</button>`).join('')}</div>` : ''}`;
}

// privé: één gesprek
export function dmConvHtml(conv) {
  const w = conv.with;
  return `<div class="dm-head"><button class="btn tiny" data-action="dmBack">${icon('back')} Gesprekken</button>
    <span class="grow">met <b>${esc(w.name)}</b> ${clanPill(w.team ? { name: w.team, color: w.color } : null)}${w.ally ? ' <span class="small muted">bondgenoot</span>' : ''}</span></div>
    ${conv.messages.length ? chatMsgsHtml(conv.messages) : `<p class="empty">Nog geen berichten met ${esc(w.name)}. Alleen jullie twee lezen dit gesprek.</p>`}`;
}

// ---------- ranglijst ----------
export function leaderboardHtml(app, lb) {
  const d = app.data;
  const max = Math.max(1, ...lb.teams.map((t) => t.score));
  const ended = lb.phase === 'ended';
  return `<h2>${icon('trophy')} ${ended ? 'Eindstand' : 'Ranglijst'}</h2>
    ${ended && lb.teams[0] ? `<p class="outcome win">${icon('crown')} ${esc(lb.teams[0].name)} wint het seizoen!</p>` : ''}
    <h3>Teams</h3>
    ${lb.teams.map((t, i) => `<div class="teambar"><b>${i + 1}.</b><div class="tb"><i style="width:${(t.score / max) * 100}%;background:${t.color}"></i><span>${esc(t.name)} — ${t.members.map(esc).join(' & ')}</span></div><b>${fmt(t.score)}</b></div>`).join('')}
    <h3>Spelers</h3>
    <table class="lb"><tr><th>#</th><th>Speler</th><th>Burcht</th><th class="n">Opbouw</th><th class="n">Gevecht</th><th class="n">Totaal</th></tr>
    ${lb.players.map((p, i) => `<tr class="${p.name === d.me.name ? 'me' : ''}"><td>${i + 1}</td><td><span class="pill" style="background:${(lb.teams.find((t) => t.id === p.teamId) || {}).color || '#888'}">${esc(p.name)}</span>${p.bot ? ` <span class="bot-tag">computer${p.botTier ? ` · ${p.botTier}` : ''}</span>` : ''}${p.lord ? ` <span class="vassal-mini" title="Vazal van ${esc(p.lord)}">${icon('crown')} vazal van ${esc(p.lord)}</span>` : ''}${p.vassals ? ` <span class="vassal-mini lord" title="${p.vassals} vazal(len): +${fmt(p.vassalPts)} punten">${icon('crown')} ${p.vassals}</span>` : ''}</td><td>${esc(p.town)}</td><td class="n">${fmt(p.build + (p.vassalPts || 0))}</td><td class="n">${fmt(p.kills)}</td><td class="n">${fmt(p.score)}</td></tr>`).join('')}
    </table>
    <p class="small muted">Opbouwpunten komen uit gebouwen, onderzoek, dorpelingen, troepen, het Monument en de Kathedraal, plus ${Math.round(VASSAL.scoreShare * 100)}% van de punten van je vazallen. Gevechtspunten verdien je door vijanden en rovers te verslaan.</p>`;
}

// ---------- hulp ----------
export function helpHtml(w, peaceEnd) {
  const f = (t) => new Date(t).toLocaleString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const pt = peaceText(w.peaceMs);
  return `<div class="help"><h2>${icon('book')} Hoe speel je?</h2>
    <p class="small"><button class="btn small" data-action="news">${icon('news')} Nieuws: wat is er onlangs veranderd?</button></p>
    <div class="timeline"><div class="tp">${icon('dove')} Vrede (${pt})<br><small>${f(peaceEnd - w.peaceMs)}</small></div><div class="tw">${icon('swords')} Oorlog<br><small>${f(peaceEnd)}</small></div></div>
    <p>Het seizoen eindigt op <b>${f(w.warEnd)}</b>. Het team met de meeste punten wint.</p>
    <h3>1. Bouw je economie</h3>
    <ul><li>Je <b>dorpelingen</b> verzamelen voedsel, hout, steen en goud — ook als je offline bent.</li>
    <li>Elke grondstof heeft <b>werkplekken</b>: bouw boerderijen, houthakkerskampen, steengroeves en goudmijnen.</li>
    <li>Bouw <b>huizen</b> voor meer bevolking en een <b>opslagplaats</b> zodat je niets verspilt.</li>
    <li>Breng je stadscentrum naar een nieuw <b>tijdperk</b> om nieuwe gebouwen en troepen te ontgrendelen.
    Elk tijdperk wordt je <b>bouwgrond</b> groter (de stippellijn rond je stad).</li></ul>
    <h3>Volkeren</h3>
    <p>Elk rijk hoort bij een volk met een eigen bouwstijl. Zodra je stadscentrum een <b>kasteel</b> wordt (${AGES[CASTLE_LEVEL].name}),
    train je daar twee elite-eenheden die enkel jouw volk heeft:</p>
    <ul>${CIV_IDS.map((c) => `<li>${civEmblem(c, 15)} <b>${CIVS[c].name}</b>: ${CIVS[c].units.map((k) => `<b>${UNITS[k].name}</b> (${UNITS[k].desc.charAt(0).toLowerCase()}${UNITS[k].desc.slice(1).replace(/\.$/, '')})`).join(' en ')}.</li>`).join('')}</ul>
    <h3>Vijf tijdperken</h3>
    <ul>${AGES.slice(1).map((a, i) => `<li><b>${a.name}</b>${['', ': schietbaan, stal, smidse, markt, wachttorens, de <b>molen</b> en het <b>havenhuis</b>', ': het kasteel, ridders, rammen en de <b>Academie</b>', ': het monument, het <b>gildehuis</b> en de <b>bouwloods</b>', ': het <b>Adelshof</b> (edelmannen) en de <b>kathedraal</b>'][i] || ': je begint met huizen, werkplekken, een opslagplaats en een kazerne'}.</li>`).join('')}</ul>
    <p><b>Verplaatsen:</b> tik op een gebouw en kies <b>Verplaatsen</b>. Tik daarna op de nieuwe plek (of sleep het gebouw)
    en kies <b>Zet hier</b>; met een muis klik je gewoon op de nieuwe plek. Dat is gratis. Het stadscentrum blijft in het midden.</p>
    <p>Gebouwen verbeter je <b>één niveau per tijdperk</b> (niveau 4 vraagt het Tijdperk van de Gilden, niveau 5 de Kroon). Hoge niveaus zie je ook: vaandels, gouden pieken, aanbouwen.</p>
    <ul><li><b>Molen</b>: +5% voedsel per niveau. <b>Gildehuis</b>: +3% van alle grondstoffen per niveau. <b>Bouwloods</b>: een bouwer extra en sneller bouwen.</li>
    <li><b>Havenhuis</b> (vanaf het Brons): bouw het op een blauwe plek aan de vijver bij je dorp. Bouw er vissersbootjes (één per niveau, hooguit ${FISH.boats[FISH.boats.length - 1]})
    en geef dorpelingen de taak <b>Vissers</b> (${FISH.crew} per bootje): een visser vangt ${FISH.rate} voedsel per uur, een boer haalt er ${GATHER_RATE.food}. Elk niveau vist ${Math.round(FISH.levelBonus * 100)}% sneller.</li>
    <li><b>Smidse</b>: +5% aanval en verdediging per niveau, en betere uitrusting: leer en brons, dan ijzer en maliën (niveau 3), dan plaatharnas (niveau 5).</li>
    <li><b>Academie</b>: onderzoek in vier soorten (voetvolk, schutters, ruiterij, stad), drie rijen diep. Geen ruwe kracht maar nieuwe vaardigheden:
    ${Object.values(TECHS).map((T) => `<b>${T.name}</b>`).join(', ')}. Je ziet het aan je troepen: grotere schilden, gouden pluimen, brandende pijlen, lange bogen, kleden en lansen.</li>
    <li><b>Kathedraal</b>: punten en een trouw die sneller herstelt.</li></ul>
    <h3>Edelmannen en vazallen</h3>
    <p>In de Kroon train je in het <b>Adelshof</b> een <b>edelman</b> (één per niveau van het Adelshof). Stuur hem mee met een aanval op een speler.
    Wint je leger en overleeft hij, dan daalt de <b>trouw</b> van die stad met ${LOYALTY.hit} per edelman (de trouw herstelt vanzelf met ${LOYALTY.regen} per uur).
    Bij 0 wordt de stad <b>${VASSAL.ms / 86400000} dagen je vazal</b>: niemand verliest zijn stad, maar een vazal</p>
    <ul><li>stuurt om de ${VASSAL.tributeMs / 3600000} uur een karavaan met <b>schatting</b> (${Math.round(VASSAL.tribute * 100)}% van zijn productie);</li>
    <li>kan zijn heer niet aanvallen (en de heer hem niet); een computerspeler helpt zijn heer ook met versterking;</li>
    <li>geeft zijn heer ${Math.round(VASSAL.scoreShare * 100)}% van zijn punten.</li></ul>
    <p>Vrij komen kan door te wachten, door <b>losgeld</b> te betalen (${fmt(VASSAL.ransom)} van elke grondstof per tijdperk), of doordat een <b>clanlid de heer verslaat</b>.
    Daarna is de stad ${LOYALTY.shieldMs / 3600000} uur beschermd. Je hebt hooguit ${VASSAL.maxPerLord} vazallen, en edelmannen werken niet tegen een stad met minder dan
    ${Math.round(LOYALTY.minScore * 100)}% van jouw punten.</p>
    <h3>Gevechten</h3>
    <p>Elke eenheid heeft <b>levenspunten</b> (${icon('heart')}): een dorpeling ${UNITS.villager.hp}, een speerdrager ${UNITS.spear.hp},
    een ridder ${UNITS.knight.hp}, een oorlogsolifant ${UNITS.elephant.hp}. In je eigen gebied zie je elk gevecht gebeuren: de mannetjes
    slaan om de beurt toe, verliezen bij elke klap levens (de balk boven hun hoofd) en vallen als die leeg is.
    Barbaren vallen <b>meteen aan</b> wie hun dorp nadert, ook dorpelingen. Geef een vechtende groep een andere opdracht om te vluchten.
    Gewonde eenheden genezen zodra ze terug thuis zijn.</p>
    <p>Zodra je het barbarenkamp ontdekt hebt, staat erboven hoeveel barbaren er wonen: een handvol, iets meer in een later tijdperk.
    Ongeveer evenveel soldaten volstaan om het te verwoesten. Stuur je leger liefst samen: wie alleen aankomt, vecht alleen.
    Wacht niet te lang: <b>het kamp groeit elke dag</b> dat je het met rust laat (tot drie keer zo sterk), en hoe groter het wordt,
    hoe groter en vaker de overvallen op je dorp. Een groot kamp verwoesten levert wel meer buit op.</p>
    <h3>Overvallen op je dorp</h3>
    <p>Komen de barbaren je dorp overvallen, dan krijg je een melding (ook op je gsm, bij 'aanval op je stad'). Je hebt dan
    <b>${Math.round(WILD.raid.warnMs / 60000)} minuten</b> om te kiezen: <b>zelf verdedigen</b> (een veldslag in je eigen stad, met je
    soldaten die thuis zijn) of het gevecht <b>automatisch</b> laten verlopen. Kies je niets, dan gaat het automatisch. Winnen de
    barbaren, dan stelen ze grondstoffen (tot wat je opslagplaats beschermt).</p>
    <h3>Je eigen gebied verkennen</h3>
    <p>Rond je stad ligt een stuk wildernis dat enkel van jou is, verborgen in de mist. Kies troepen en tik daarna op de grond:
    ze lopen er meteen naartoe en de mist verdwijnt waar ze komen. Tik op het stadscentrum of op <b>Naar huis</b> om ze terug te roepen.</p>
    <ul><li><b>1 klik</b>: één troep (ook één uit een groep in het veld).</li>
    <li><b>Dubbelklik</b>: alle troepen van die soort, thuis en in het veld.</li>
    <li><b>Ingedrukt houden</b>: je hele leger, om samen te verplaatsen. Thuis vertrekken ze samen, aan het tempo van de traagste.</li></ul>
    <ul><li><b>Bomen kappen</b>: stuur een dorpeling naar een boom aan de rand van je bouwgrond. Gekapte grond wordt bouwgrond en levert hout op.</li>
    <li><b>Bronnen</b>: in de wildernis liggen goudaders, rotswanden, oude eikenbossen en bessenstruiken. Stuur er een dorpeling heen om ze leeg te halen.</li>
    <li><b>Everzwijnen</b>: stuur een paar soldaten (twee à drie speerdragers volstaan) en tik op het beest voor extra voedsel.</li>
    <li><b>Barbarenkamp</b>: ergens in je gebied woont een bende barbaren die af en toe je stad overvalt en grondstoffen steelt.
    Vind hun kamp en val het aan met een paar soldaten (ongeveer evenveel als er barbaren zijn): dat levert buit op en de overvallen stoppen een tijd.
    Hoe langer je wacht, hoe sterker het kamp en hoe vaker ze komen. Muren en torens helpen ook tegen overvallen.</li></ul>
    <h3>Vondsten</h3>
    <p>Af en toe duikt er rond je stad iets op: een <b>verdwaald schaap</b>, een <b>eik vol brandhout</b>, <b>losse rotsblokken</b> of een <b>goudader</b>
    (ze gloeien en hebben een icoontje). Klik op een dorpeling en daarna op de vondst — of tik gewoon op de vondst. De dorpeling legt even zijn werk neer,
    haalt de buit op en gaat daarna terug aan zijn vorige taak. Vondsten blijven liggen tot je ze ophaalt (maximaal 4 tegelijk).</p>
    <h3>2. Vrede (je eerste ${pt})</h3>
    <p>De eerste ${pt} nadat je begint, kan niemand je aanvallen en kan jij zelf geen spelers aanvallen. Gebruik die tijd om je economie op te bouwen,
    een muur te zetten en troepen te trainen. <b>Roverskampen</b> mag je altijd aanvallen: dat levert buit en punten op. Kampen dicht bij het midden zijn sterker.</p>
    <h3>3. Oorlog</h3>
    <p>Na je vrede mag je op eender welk moment vijandelijke steden aanvallen en plunderen, en zij jou. Wie later begint, krijgt ook ${pt} vrede:
    zo'n stad toont op de kaart hoelang nog. Stuur eerst <b>verkenners</b>. Rammen beschadigen muren en monumenten. Een opslagplaats verbergt een deel van je grondstoffen.</p>
    <p><b>Aanvallen loont</b>: je troepen dragen meer buit naarmate je tijdperk stijgt (×${String(WAR.carry[1]).replace('.', ',')} in de Vuursteen tot ×${String(WAR.carry[MAX_AGE]).replace('.', ',')} in de Kroon: karren en lastdieren).
    Wie de slag wint, raapt de wapens en uitrusting van de gesneuvelde vijanden op: <b>krijgsbuit</b> = ${Math.round(WAR.bounty * 100)}% van hun waarde, bovenop de gewone buit.
    Ook een verdediger die standhoudt, krijgt die krijgsbuit. Verslagen vijanden en geplunderde grondstoffen leveren gevechtspunten op.</p>
    <h3>4. Bondgenoten</h3>
    <p>Je wordt automatisch aan een bondgenoot gekoppeld. Stuur elkaar <b>versterking</b> (die verdedigt mee) en <b>karavanen</b> met grondstoffen via de markt. Overleg in de clanchat!</p>
    <ul><li><b>Van clan wisselen</b> (Team-venster): vraag om bij een andere clan te komen, of nodig spelers uit in de jouwe (hooguit ${CLAN.maxMembers} leden).
    Aanvaard je een uitnodiging, dan wissel je meteen. Je kan je clan ook <b>verlaten</b>: dan sticht je je eigen clan. Na een wissel wacht je ${CLAN.switchMs / 3600000} uur voor de volgende.
    Troepen bij je oude bondgenoten komen dan naar huis.</li>
    <li><b>Privéberichten</b>: stuur iedere speler een bericht om te onderhandelen (tabblad Privé in de chat, of 'Bericht' bij zijn stad).</li>
    <li><b>Verraad</b>: je kan een bondgenoot aanvallen terwijl hij nog in je clan zit. Hij en je clan zien je leger aankomen, en de clan kan je daarna ${CLAN.traitorMs / 86400000} dagen lang uit de clan zetten.</li></ul>
    <h3>Veldslagen: zelf besturen of automatisch</h3>
    <p>Komt je leger aan bij een stad of roverskamp terwijl jij (of de verdediger) online bent, dan kies je: <b>zelf besturen</b> of <b>automatisch</b>.
    Wie niets kiest of offline is, laat de slag automatisch verlopen. Is de verdediger online, dan krijgt hij een melding en mag hij zijn stad zelf verdedigen.</p>
    <p>Je vecht met <b>regimenten</b>, zoals in Rome: Total War: elk kaartje onderaan en elk vaandel boven het slagveld is één eenheid die samen loopt en samen vecht.</p>
    <ul><li><b>Kiezen</b>: tik op een kaartje, een vaandel of een soldaat (dan kies je zijn hele regiment). Twee keer tikken = alle regimenten van die soort,
    lang drukken = je hele leger. Met Shift of Ctrl voeg je er een toe. Op een gsm veeg je om rond te kijken.</li>
    <li><b>Bevelen</b>: tik (of klik rechts) op de <b>grond</b> om er in formatie heen te lopen, op een <b>vijand</b> om dat regiment aan te vallen, op een <b>muur of poort</b> om een bres te slaan.
    Meerdere regimenten stellen zich op in slagorde: voetvolk vooraan, schutters erachter, ruiters op de flanken.
    <b>Stormloop</b> = op de dichtstbijzijnde vijand af, <b>Halt</b> = blijven staan en in formatie gaan.</li>
    <li><b>Lijn trekken</b>: sleep met de rechtermuisknop (op een gsm: knop <b>Lijn</b>, dan met je vinger). Daar komen ze te staan, zo breed als de lijn, met het front naar de vijand.
    De groene stippen tonen waar elke soldaat komt te staan.</li>
    <li><b>Formaties</b> (knoppen onderaan, of de toetsen 1 tot 5): <b>Linie</b> (breed, veel soldaten tegelijk in het gevecht), <b>Blok</b> (minder schade, moeilijk te flankeren, iets trager),
    <b>Wig</b> (harde stormloop, vooral voor ruiters), <b>Los</b> (veel minder last van pijlen en torens) en <b>Kring</b> (niet te flankeren, sterk tegen ruiters, traag).</li>
    <li><b>Flanken en stormlopen</b>: wie een regiment van opzij of in de rug aanvalt, doet meer schade en breekt zijn moed. De eerste klap na een aanloop is extra hard.</li>
    <li><b>Moed</b>: het gouden balkje onder je vaandel. Een regiment dat zwaar verliest of omsingeld wordt, <b>slaat op de vlucht</b> (witte vlag) en luistert even niet;
    na wat rust hergroepeert het. Slaat een heel leger op de vlucht, dan is de slag verloren.</li>
    <li>Tactieken: stuur speerdragers op ruiters, laat schutters achter je voetvolk, val met ruiters in de flank, sloop torens met rammen of stenenwerpers, zoek een gat in de muur.
    Als aanvaller kan je je op elk moment <b>terugtrekken</b>; na 10 minuten trekt je leger zich vanzelf terug.</li>
    <li><b>Wachttorens</b> (vanaf het Tijdperk van het Brons) schieten op de dichtstbijzijnde vijand. Hogere niveaus doen meer schade en hebben meer levens. Een gesloopte toren verliest een niveau.</li>
    <li><b>Muren</b> houden aanvallers tegen tot ze een bres slaan; verdedigers kunnen er net overheen vechten. Een open muur heeft een poort in het midden.</li></ul>
    <h3>Gevechten</h3>
    <p>Speerdragers zijn sterk tegen ruiters, boogschutters verdedigen goed tegen voetvolk. Muren, torens en de smidse versterken je verdediging. De sterkste kant wint; de winnaar verliest minder naarmate zijn overmacht groter is.</p>
    <h3>Meldingen op je gsm</h3>
    <p>Zet op de wereldkaart (of bij een aanval) de <b>meldingen</b> aan. ±2 minuten voor je leger aankomt, krijg je een melding op je gsm,
    ook als het spel dicht is; de verdediger krijgt er ook een. Open je het spel, dan zie je een aftelling en kan je al kiezen:
    <b>zelf besturen</b> of <b>automatisch</b>. Op een iPhone werkt dit enkel vanuit de app op je beginscherm.</p>
    <h3>Muren, poorten en afbreken</h3>
    <p>Muren plaats je tegel per tegel. Een <b>poort</b> is <b>2 tegels breed</b> en komt in een recht stuk muur: tik op een muurstuk en kies
    <b>Poort van maken</b> (het muurstuk ernaast wordt mee de poort), of laat een gat van twee tegels en kies <b>Poort maken</b>. Is je stad helemaal ommuurd, dan gaan je troepen enkel via een poort naar binnen
    en buiten; die gaat vanzelf open en dicht. Een gebouw of muurstuk dat je aantikt, krijgt een gouden pijl; in het paneel kan je het
    ook <b>afbreken</b> (je krijgt een deel van de grondstoffen terug).</p>
    <h3>Op je gsm als app</h3>
    <p><b>Android:</b> <a href="/rijken-van-de-vallei.apk" download>download de app</a>, open het bestand en kies <b>Installeren</b>
    (de eerste keer vraagt je gsm om installaties uit je browser toe te staan). De app opent het spel volledig scherm;
    updates van het spel krijg je vanzelf. <b>iPhone of iPad:</b> open de site in <b>Safari</b>, tik onderaan op <b>Delen</b> en kies
    <b>Zet op beginscherm</b>. Het spel krijgt dan een eigen icoon en opent volledig scherm, net als een app.</p>
    <h3>Punten</h3>
    <p>Gebouwen, onderzoek, dorpelingen en troepen geven opbouwpunten; het <b>Monument</b> levert per niveau 1500 extra punten en de <b>Kathedraal</b> 600.
    Vazallen geven je ${Math.round(VASSAL.scoreShare * 100)}% van hun punten. Verslagen vijanden en rovers geven gevechtspunten.</p></div>`;
}

export { fmtDuration };
