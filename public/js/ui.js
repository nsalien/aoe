// HTML-sjablonen voor panelen, vensters en de bovenbalk.
import * as A from './art.js';
import {
  RES, RES_NAMES, BUILDINGS, BUILD_ORDER, UNITS, ARMY_UNITS, AGES, AGE_UP, MARKET, BONUS, levelCost, levelTime,
  fmtDuration, campUnits, campLoot,
} from '../shared/rules.js';
import {
  age, slots, popCap, capacity, homePop, rates, checkBuild, checkUpgrade, checkTrain, findType, bLevel,
  canAfford, protectAmount, totalVillagers, marketRate, maxBuilds, harvesting, checkHarvest,
} from '../shared/sim.js';
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
const thumbs = new Map();
export function buildingThumb(type, level = 1, team = '#c0392b') {
  const key = `${type}:${level}:${team}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const t = type === 'wall' ? 'tower' : type;
  const spr = A.buildingSprite(t, Math.max(1, level), team);
  const big = BUILDINGS[t]?.size === 2;
  const sc = big ? 1.05 : t === 'tower' ? 1.15 : 1.85;
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 140;
  const ctx = cv.getContext('2d');
  A.drawSprite(ctx, spr, 80, big ? 104 : 108, sc);
  const url = cv.toDataURL();
  thumbs.set(key, url);
  return url;
}

export function unitThumb(unit, team = '#3f7fd9') {
  const key = `u:${unit}:${team}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const cv = document.createElement('canvas');
  cv.width = 88; cv.height = 88;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  const o = { s: 2.1, team };
  switch (unit) {
    case 'villager': A.person(ctx, 22, 40, { ...o, team: null, body: '#8b6a43', hat: '#d8ae52', weapon: 'tool', carry: '#e6c45a' }); break;
    case 'spear': A.person(ctx, 20, 40, { ...o, body: '#7b5a3a', helmet: '#8e959f', weapon: 'spear' }); break;
    case 'sword': A.person(ctx, 22, 40, { ...o, body: '#5b6b85', helmet: '#aab1bb', armor: true, weapon: 'sword' }); break;
    case 'archer': A.person(ctx, 20, 40, { ...o, body: '#4f7a3a', hat: '#3f5a2a', weapon: 'bow' }); break;
    case 'scout': A.horseman(ctx, 20, 40, { s: 1.6, team, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b' }); break;
    case 'rider': A.horseman(ctx, 20, 40, { s: 1.6, team, body: '#7a2b2b', helmet: '#8e959f', weapon: 'spear' }); break;
    case 'knight': A.horseman(ctx, 20, 40, { s: 1.6, team, body: '#9aa1ab', helmet: '#c9ced6', armor: true, weapon: 'spear', horse: '#3d3530' }); break;
    case 'ram': A.ram(ctx, 21, 34, 1.5); break;
    default:
  }
  const url = cv.toDataURL();
  thumbs.set(key, url);
  return url;
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
const ageWord = (a) => ['', 'eerste', 'tweede', 'derde', 'vierde'][a];

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

export function phaseHtml(w, now) {
  if (w.phase === 'lobby') return { cls: 'lobby', html: `${icon('hourglass')} Start over <span class="timer" data-end="${w.startAt}"></span>` };
  if (w.phase === 'prep') return { cls: 'prep', html: `${icon('dove')} Vredestijd · nog <span class="timer" data-end="${w.prepEnd}"></span>` };
  if (w.phase === 'war') return { cls: 'war', html: `${icon('swords')} Oorlog! · nog <span class="timer" data-end="${w.warEnd}"></span>` };
  return { cls: 'ended', html: `${icon('flag')} Seizoen voorbij` };
}

// ---------- bouwbalk ----------
export function buildBarHtml(live, placing, team) {
  return BUILD_ORDER.map((type) => {
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

// ---------- stadsoverzicht ----------
export function townOverviewHtml(app, live) {
  const d = app.data;
  const sl = slots(live);
  const r = rates(live, d.world.speed);
  const away = harvesting(live);
  const total = totalVillagers(live) - away;
  const alloc = app.pendingAlloc || live.villagers;
  const assigned = RES.reduce((a, k) => a + alloc[k], 0);
  const idle = total - assigned;
  const canAct = app.canAct;
  const a = age(live);
  const wall = live.buildings.find((b) => b.type === 'wall');

  let html = `<div class="ph"><img class="thumb" src="${buildingThumb('tc', a, d.team.color)}" alt="">
    <div><h2>${esc(d.town.name)}</h2><div class="lvl">${AGES[a].name}</div>
    <div class="small muted">Positie (${d.town.x}, ${d.town.y}) · <span class="pill" style="background:${d.team.color}">${esc(d.team.name)}</span></div></div></div>`;

  html += bonusCardHtml(app, live);
  html += `<div class="card"><h3>${icon('people')} Dorpelingen <span class="right">${total + away} totaal · ${idle} vrij${away ? ` · ${away} op pad` : ''}</span></h3>`;
  for (const k of RES) {
    html += `<div class="vrow"><img src="${ICON[k]}" alt="">
      <div class="nm">${RES_NAMES[k]}<small>${alloc[k]}/${sl[k]} plaatsen · +${fmt(r[k])}/u</small></div>
      <div class="stepper">
        <button data-action="vill" data-res="${k}" data-d="-5" ${!canAct || alloc[k] <= 0 ? 'disabled' : ''} title="-5">«</button>
        <button data-action="vill" data-res="${k}" data-d="-1" ${!canAct || alloc[k] <= 0 ? 'disabled' : ''}>−</button>
        <b>${alloc[k]}</b>
        <button data-action="vill" data-res="${k}" data-d="1" ${!canAct || idle <= 0 || alloc[k] >= sl[k] ? 'disabled' : ''}>+</button>
        <button data-action="vill" data-res="${k}" data-d="5" ${!canAct || idle <= 0 || alloc[k] >= sl[k] ? 'disabled' : ''} title="+5">»</button>
      </div><span></span></div>`;
  }
  html += `<div class="row small" style="margin-top:8px"><span class="grow muted">Nieuwe dorpelingen gaan naar</span>
    <select class="field" data-change="rally" ${canAct ? '' : 'disabled'} style="width:auto">
      ${[['auto', 'Automatisch'], ...RES.map((k) => [k, RES_NAMES[k]])].map(([v, n]) => `<option value="${v}" ${live.rally === v ? 'selected' : ''}>${n}</option>`).join('')}
    </select></div>
    ${idle > 0 ? `<p class="req">${idle} dorpeling(en) doen niets! Bouw werkplaatsen (boerderij, kampen) of verdeel ze.</p>` : ''}
  </div>`;

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
    <dl class="kv"><dt>Stadsmuur</dt><dd>${wall.level ? `niveau ${wall.level}` : 'geen'}</dd>
    <dt>Wachttorens</dt><dd>${findType(live, 'tower').filter((b) => b.level).length}</dd>
    <dt>Verborgen in opslag</dt><dd>${fmt(protectAmount(live))} per grondstof</dd></dl>
    <div class="actions"><button class="btn" data-action="selectWall">Stadsmuur bekijken</button></div></div>`;
  return html;
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
  return buildQueueHtml(app, live) + trainQueueHtml(app, live.queues);
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
        <div><div class="nm">${it.n - it.done}× ${UNITS[it.unit].name} <span class="muted small">(${BUILDINGS[key].name})</span></div>
        ${i === 0 ? `<div class="small muted">volgende over ${timer(it.start + (it.done + 1) * it.dur)}</div>` : '<div class="small muted">wacht in de rij</div>'}</div>
        ${timer(end)}</div>`;
      t = end;
    }
  }
  return html + '</div>';
}

// ---------- gebouwpaneel ----------
export function buildingPanelHtml(app, live, b) {
  const d = app.data;
  const def = BUILDINGS[b.type];
  const job = live.builds.find((j) => j.bid === b.id);
  const canAct = app.canAct;
  const lvl = b.level;
  let html = `<div class="ph"><img class="thumb" src="${buildingThumb(b.type, Math.max(1, lvl), d.team.color)}" alt="">
    <div><h2>${def.name}</h2><div class="lvl">${lvl ? `Niveau ${lvl} van ${def.maxLevel}` : 'In aanbouw'}${b.type === 'tc' ? ` · ${AGES[lvl].short}tijd` : ''}</div></div></div>
    <p class="desc">${def.desc}</p>`;
  if (job) {
    html += `<div class="card"><h3>${icon('hammer')} ${lvl ? `Verbeteren naar niveau ${job.to}` : 'In aanbouw'}</h3>${bar(job.start, job.end)}
      <div class="row small" style="margin-top:6px"><span class="grow muted">Klaar over</span>${timer(job.end)}</div></div>`;
  }
  html += buildingInfo(app, live, b);
  if (!job && lvl < def.maxLevel) {
    const to = lvl + 1;
    const cost = levelCost(b.type, to);
    const err = checkUpgrade(live, b.id);
    const title = b.type === 'tc' ? `Naar het ${AGES[to].name}` : (lvl === 0 ? 'Bouwen' : `Verbeteren naar niveau ${to}`);
    html += `<div class="card"><h3>${icon('up')} ${title}</h3>${costHtml(cost, live.res)}
      <div class="small muted" style="margin-top:4px">${icon('clock')} ${fmtDuration(levelTime(b.type, to, d.world.speed))}</div>`;
    if (b.type === 'tc') html += unlocksHtml(to);
    if (err && err !== 'Niet genoeg grondstoffen.') html += `<p class="req">${err}</p>`;
    html += `<div class="actions"><button class="btn primary" data-action="upgrade" data-id="${b.id}" ${!canAct || err ? 'disabled' : ''}>${b.type === 'tc' ? 'Nieuw tijdperk' : (lvl === 0 ? 'Bouwen' : 'Verbeteren')}</button></div></div>`;
  } else if (lvl >= def.maxLevel) {
    html += `<p class="small muted">${icon('star')} Maximaal niveau bereikt.</p>`;
  }
  html += '<div class="actions"><button class="btn ghost" data-action="deselect">← Terug naar overzicht</button></div>';
  return html;
}

function unlocksHtml(a) {
  const bs = BUILD_ORDER.filter((t) => BUILDINGS[t].age === a).map((t) => BUILDINGS[t].name);
  const us = Object.keys(UNITS).filter((k) => UNITS[k].age === a).map((k) => UNITS[k].name);
  const more = a >= 3 ? ['een derde bouwer'] : [];
  const all = [...bs, ...us, ...more, 'hogere gebouwniveaus', '+10% productie'];
  return `<p class="small" style="margin:6px 0 0"><b>Ontgrendelt:</b> ${all.join(', ')}.</p>`;
}

function buildingInfo(app, live, b) {
  const d = app.data;
  const L = b.level;
  switch (b.type) {
    case 'tc': return trainHtml(app, live, b, ['villager']);
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
    case 'smithy': return `<div class="card"><dl class="kv"><dt>Bonus aanval en verdediging</dt><dd>+${5 * L}%</dd></dl></div>`;
    case 'tower': return `<div class="card"><dl class="kv"><dt>Verdediging</dt><dd>+${80 * L}</dd></dl></div>`;
    case 'wall': return `<div class="card"><dl class="kv"><dt>Verdedigingsbonus</dt><dd>+${8 * L}% en +${30 * L}</dd></dl>
      <p class="small muted" style="margin:6px 0 0">Vanaf niveau 3 wordt de palissade een stenen muur.</p></div>`;
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

function trainHtml(app, live, b, units) {
  const d = app.data;
  const canAct = app.canAct;
  let html = `<div class="card"><h3>${icon('target')} Trainen</h3>`;
  for (const k of units) {
    const u = UNITS[k];
    const err = checkTrain(live, k, 1, d.awayPop);
    const locked = age(live) < u.age || bLevel(live, u.building) < u.bl;
    const max = maxTrain(live, k, d.awayPop);
    const t = Math.round((u.time * Math.pow(0.85, Math.max(0, b.level - 1))) / d.world.speed);
    html += `<div class="urow"><img src="${unitThumb(k, d.team.color)}" alt="">
      <div><div class="nm">${u.name}</div>
      ${u.atk !== undefined ? `<div class="stats"><span title="Aanval">${icon('swords')} ${u.atk}</span><span title="Verdediging tegen voetvolk / ruiters / schutters">${icon('shield')} ${u.def.inf}/${u.def.cav}/${u.def.rng}</span><span title="Snelheid (tegels per uur)">${icon('horse')} ${u.speed}</span><span title="Draagvermogen">${icon('cart')} ${u.carry}</span>${u.pop > 1 ? `<span title="Bevolking">${icon('people')} ${u.pop}</span>` : ''}</div>` : ''}
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
      <p class="desc">Rovers plunderen de vallei. Versla ze voor buit en punten — ook tijdens de vredestijd! Na een aanval herstelt het kamp zich na een tijdje.</p>
      ${c.plundered ? `<div class="card"><b>Verlaten.</b> De rovers keren terug over ${timer(c.refreshAt)}.</div>` : ''}
      <div class="card"><h3>Geschatte bezetting (vol kamp)</h3><div class="unitgrid">${Object.keys(u).map((k) => `<div class="ucell"><img src="${unitThumb(k, '#333333')}" alt=""><b>${u[k]}</b>${UNITS[k].name}</div>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 2px">Buit (vol kamp):</p>${costHtml(loot)}</div>
      <div class="actions"><button class="btn danger" data-action="send" data-kind="attack" ${app.canAct ? '' : 'disabled'}>${icon('swords')} Aanvallen</button>
      <button class="btn" data-action="send" data-kind="scout" ${app.canAct ? '' : 'disabled'}>${icon('magnifier')} Verkennen</button></div>`;
  }
  const t = sel.obj;
  const team = app.map && app.map.teams.find((x) => x.id === t.teamId);
  const mine = t.id === me.id;
  const ally = t.teamId === d.me.teamId;
  const dist = Math.hypot(t.x - me.x, t.y - me.y);
  let html = `<div class="ph"><img class="thumb" src="${buildingThumb('tc', t.age, team ? team.color : '#888')}" alt="">
    <div><h2>${esc(t.name)}</h2><div class="lvl">${esc(t.player)} ${t.online ? '· <span style="color:#3f8f3c">● online</span>' : ''}</div>
    ${team ? `<span class="pill" style="background:${team.color}">${esc(team.name)}</span>` : ''}</div></div>
    <div class="card"><dl class="kv"><dt>Tijdperk</dt><dd>${AGES[t.age].short}</dd><dt>Punten</dt><dd>${fmt(t.score)}</dd>
    <dt>Gebouwen</dt><dd>${t.buildings}</dd><dt>Muur</dt><dd>${t.wall ? `niveau ${t.wall}` : 'geen'}</dd>
    ${t.monument ? `<dt>Monument</dt><dd>niveau ${t.monument}</dd>` : ''}
    <dt>Positie</dt><dd>(${t.x}, ${t.y})</dd>${mine ? '' : `<dt>Afstand</dt><dd>${dist.toFixed(1)} tegels</dd>`}</dl></div>`;
  if (mine) {
    html += `<div class="actions"><button class="btn primary" data-action="view" data-view="town">${icon('castle')} Naar mijn stad</button></div>`;
  } else if (ally) {
    html += `<p class="desc">${icon('team')} Dit is je bondgenoot. Help elkaar met troepen en grondstoffen!</p>
      <div class="actions"><button class="btn green" data-action="send" data-kind="support" ${app.canAct ? '' : 'disabled'}>${icon('shield')} Troepen sturen</button>
      <button class="btn" data-action="send" data-kind="trade" ${app.canAct ? '' : 'disabled'}>${icon('cart')} Grondstoffen</button></div>`;
  } else {
    const war = d.world.phase === 'war';
    html += `${war ? '' : `<p class="req">Vredestijd: spelers aanvallen kan pas vanaf de oorlogsweek (over ${timer(d.world.prepEnd)}).</p>`}
      <div class="actions"><button class="btn danger" data-action="send" data-kind="attack" ${war && app.canAct ? '' : 'disabled'}>${icon('swords')} Aanvallen</button>
      <button class="btn" data-action="send" data-kind="scout" ${war && app.canAct ? '' : 'disabled'}>${icon('magnifier')} Verkennen</button></div>`;
  }
  return html + `<div class="actions"><button class="btn ghost" data-action="deselect">← Overzicht</button></div>`;
}

const KIND = { attack: ['swords', 'Aanval'], scout: ['magnifier', 'Verkenning'], support: ['shield', 'Versterking'], trade: ['cart', 'Karavaan'], return: ['home', 'Terugkeer'] };

export function marchesHtml(app) {
  const d = app.data;
  const ms = [...d.marches].sort((a, b) => a.arriveAt - b.arriveAt);
  if (!ms.length) return '<p class="empty">Er zijn geen legers onderweg.</p>';
  return ms.map((m) => {
    const [ic, nm] = KIND[m.kind] || ['•', m.kind];
    const hostile = !m.ally;
    const back = m.status === 'back';
    const label = hostile ? `<b style="color:var(--red)">${nm} van ${esc(m.player)}</b> op ${esc(m.to.name)}`
      : back ? `${m.own ? '' : `${esc(m.player)}: `}Terug van ${esc(m.to.name)}` : `${m.own ? '' : `${esc(m.player)}: `}${nm} → ${esc(m.to.name)}`;
    return `<div class="qitem"><span class="qicon">${icon(back ? 'home' : ic)}</span>
      <div><div class="nm">${label}</div><div class="small muted">${marchCargo(m)}</div>
      ${bar(m.departAt, m.arriveAt)}</div>${timer(m.arriveAt)}</div>`;
  }).join('');
}

function marchCargo(m) {
  const res = m.res && RES.filter((r) => m.res[r] > 0).map((r) => `${fmt(m.res[r])} ${RES_NAMES[r].toLowerCase()}`).join(', ');
  if (m.kind === 'trade') return `lading: ${res || '—'}`;
  const units = m.units ? unitsText(m.units) : 'onbekende troepen';
  return res ? `${units} · buit: ${res}` : units;
}

function worldOverviewHtml(app) {
  const d = app.data;
  return `<div class="ph"><div><h2>De Vallei</h2><div class="lvl">Wereldkaart</div></div></div>
    <p class="desc">Klik op een stad of roverskamp. Bondgenoten herken je aan de kleur van hun gebied: <span class="pill" style="background:${d.team.color}">${esc(d.team.name)}</span></p>
    <div class="card"><h3>${icon('flag')} Onderweg</h3>${marchesHtml(app)}</div>
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
    html += `<span>${icon('swords')} Aanvalskracht <b>${fmt(p.total)}</b></span><span>${icon('cart')} Draagvermogen <b>${fmt(carryCapacity(units))}</b></span>`;
  }
  if (kind === 'trade') html += `<span>Totaal <b>${fmt(Object.values(res).reduce((a, b) => a + b, 0))}</b></span>`;
  if ((kind === 'attack' || kind === 'scout') && target.kind === 'town' && app.now() + ms > d.world.warEnd) html += '<span class="req">Komt pas na het einde van het seizoen aan!</span>';
  return html;
}

// ---------- rapporten ----------
const RICON = { attack: 'swords', defense: 'shield', scout: 'magnifier', support: 'team', trade: 'cart', info: 'bell' };

export function reportsHtml(list, activeId, detail) {
  return `<h2>${icon('scroll')} Rapporten</h2>
    <div class="split"><div class="rlist">
      ${list.length ? '' : '<p class="empty">Nog geen rapporten.</p>'}
      ${list.map((r) => `<button class="ritem ${r.seen ? '' : 'unseen'} ${r.id === activeId ? 'active' : ''}" data-action="openReport" data-id="${r.id}">
        <span class="ricon">${icon(RICON[r.kind] || 'scroll')}</span>${esc(r.title)}<small>${new Date(r.created_at).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></button>`).join('')}
      ${list.some((r) => !r.seen) ? '<button class="btn small" data-action="readAll">Alles gelezen</button>' : ''}
    </div><div>${detail ? reportDetailHtml(detail) : '<p class="empty">Kies een rapport.</p>'}</div></div>`;
}

function unitTable(rows, teamColor) {
  return `<table class="bt"><tr><th>Eenheid</th><th>Aantal</th><th>Verloren</th></tr>${rows.map(([k, n, l]) => `<tr><td><img src="${unitThumb(k, teamColor)}" alt="">${UNITS[k].name}</td><td>${fmt(n)}</td><td class="${l ? 'lost' : ''}">${l ? fmt(l) : '0'}</td></tr>`).join('')}</table>`;
}

export function reportDetailHtml(r) {
  const d = r.data;
  const when = new Date(r.created_at).toLocaleString('nl-BE');
  if (d.type === 'battle') {
    const win = (r.kind === 'attack') === d.attWins;
    const attRows = Object.keys(d.attUnits).filter((k) => d.attUnits[k]).map((k) => [k, d.attUnits[k], (d.attLost || {})[k] || 0]);
    const defRows = Object.keys(d.defUnits || {}).filter((k) => d.defUnits[k]).map((k) => [k, d.defUnits[k], (d.defLost || {})[k] || 0]);
    return `<p class="outcome ${win ? 'win' : 'lose'}">${win ? 'Overwinning!' : 'Nederlaag'}</p>
      <p class="small muted">${when}</p>
      <h3>Aanvaller: ${esc(d.attacker.name)} <span class="muted small">(${esc(d.attacker.town)})</span></h3>
      ${unitTable(attRows, '#d64545')}<p class="small">Aanvalskracht: <b>${fmt(d.A)}</b></p>
      <h3>Verdediger: ${esc(d.defender.name)} <span class="muted small">(${esc(d.defender.town)})</span></h3>
      ${defRows.length ? unitTable(defRows, '#3f7fd9') : '<p class="empty">Geen troepen aanwezig.</p>'}
      <p class="small">Verdedigingskracht: <b>${fmt(d.D)}</b>${d.supporters && d.supporters.length ? ` · met steun van ${d.supporters.map(esc).join(', ')}` : ''}</p>
      ${d.attWins ? `<h3>Buit</h3>${costHtml(d.loot)}` : ''}
      ${d.wallDamage ? `<p class="req">De muur werd ${d.wallDamage} niveau(s) beschadigd.</p>` : ''}
      ${d.monumentDamage ? `<p class="req">Het monument werd beschadigd!</p>` : ''}`;
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
  if (d.type === 'trade') return `<p class="outcome win">Karavaan aangekomen</p><p>${esc(d.from)} stuurde:</p>${costHtml(d.res)}`;
  if (d.type === 'info') return `<p class="outcome">Bericht van de spelleider</p><p>${esc(d.text)}</p>`;
  return '<p>Onbekend rapport.</p>';
}

// ---------- team en chat ----------
export function teamHtml(app, team, chan) {
  const d = app.data;
  const ago = (t) => {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 5) return '<span style="color:var(--green)">● online</span>';
    if (m < 60) return `${m} min geleden`;
    if (m < 1440) return `${Math.floor(m / 60)} u geleden`;
    return `${Math.floor(m / 1440)} d geleden`;
  };
  return `<h2>${icon('team')} <span style="color:${d.team.color}">${esc(d.team.name)}</span></h2>
    <p class="desc">Jullie zijn automatisch aan elkaar gekoppeld als bondgenoten. Bondgenoten kunnen elkaar niet aanvallen, maar wel troepen en grondstoffen sturen.</p>
    <div class="members">${(team || []).map((m) => `<div class="card" style="margin:0">
      <h3>${esc(m.player)}${m.me ? ' (jij)' : ''}<span class="right">${ago(m.lastSeen)}</span></h3>
      <div class="small">${esc(m.town)} · (${m.x}, ${m.y}) · ${AGES[m.age].short}tijd · ${fmt(m.score + m.killPts)} ptn</div>
      ${costHtml(m.res)}
      <div class="small muted" style="margin-top:4px">${m.villagers} dorpelingen · ${unitsText(m.units)}</div>
      <div class="actions">${m.me ? '' : `<button class="btn small" data-action="mapTo" data-x="${m.x}" data-y="${m.y}" data-id="${m.townId}">Op kaart</button>
        <button class="btn small green" data-action="sendTo" data-kind="support" data-id="${m.townId}">Troepen</button>
        <button class="btn small" data-action="sendTo" data-kind="trade" data-id="${m.townId}">Karavaan</button>`}</div>
    </div>`).join('')}</div>
    <div class="chat"><div class="tabs">
      <button class="tab ${chan === 'team' ? 'active' : ''}" data-action="chatTab" data-chan="team">Teamchat</button>
      <button class="tab ${chan === 'world' ? 'active' : ''}" data-action="chatTab" data-chan="world">Iedereen</button></div>
      <div class="msgs" id="chatMsgs"><p class="empty">Laden…</p></div>
      <form id="chatForm"><input class="field" name="text" maxlength="300" placeholder="Schrijf een bericht…" autocomplete="off"><button class="btn primary">Stuur</button></form>
    </div>`;
}

export function chatMsgsHtml(msgs) {
  if (!msgs.length) return '<p class="empty">Nog geen berichten. Zeg hallo!</p>';
  return msgs.map((m) => `<div class="msg"><b>${esc(m.name)}</b><time>${new Date(m.created_at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</time><br>${esc(m.text)}</div>`).join('');
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
    ${lb.players.map((p, i) => `<tr class="${p.name === d.me.name ? 'me' : ''}"><td>${i + 1}</td><td><span class="pill" style="background:${(lb.teams.find((t) => t.id === p.teamId) || {}).color || '#888'}">${esc(p.name)}</span></td><td>${esc(p.town)}</td><td class="n">${fmt(p.build)}</td><td class="n">${fmt(p.kills)}</td><td class="n">${fmt(p.score)}</td></tr>`).join('')}
    </table>
    <p class="small muted">Opbouwpunten komen uit gebouwen, dorpelingen, troepen en vooral het Monument. Gevechtspunten verdien je door vijanden en rovers te verslaan.</p>`;
}

// ---------- hulp ----------
export function helpHtml(w) {
  const f = (t) => new Date(t).toLocaleString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `<div class="help"><h2>${icon('book')} Hoe speel je?</h2>
    <div class="timeline"><div class="tp">${icon('dove')} Vredestijd<br><small>${f(w.startAt)}</small></div><div class="tw">${icon('swords')} Oorlog<br><small>${f(w.prepEnd)}</small></div></div>
    <p>Het seizoen eindigt op <b>${f(w.warEnd)}</b>. Het team met de meeste punten wint.</p>
    <h3>1. Bouw je economie</h3>
    <ul><li>Je <b>dorpelingen</b> verzamelen voedsel, hout, steen en goud — ook als je offline bent.</li>
    <li>Elke grondstof heeft <b>werkplekken</b>: bouw boerderijen, houthakkerskampen, steengroeves en goudmijnen.</li>
    <li>Bouw <b>huizen</b> voor meer bevolking en een <b>opslagplaats</b> zodat je niets verspilt.</li>
    <li>Breng je stadscentrum naar een nieuw <b>tijdperk</b> om nieuwe gebouwen en troepen te ontgrendelen.</li></ul>
    <h3>Vondsten</h3>
    <p>Af en toe duikt er rond je stad iets op: een <b>verdwaald schaap</b>, een <b>eik vol brandhout</b>, <b>losse rotsblokken</b> of een <b>goudader</b>
    (ze gloeien en hebben een icoontje). Klik op een dorpeling en daarna op de vondst — of tik gewoon op de vondst. De dorpeling legt even zijn werk neer,
    haalt de buit op en gaat daarna terug aan zijn vorige taak. Vondsten blijven liggen tot je ze ophaalt (maximaal 4 tegelijk).</p>
    <h3>2. Vredestijd (eerste weken)</h3>
    <p>Spelers kunnen elkaar nog niet aanvallen. Train wel al troepen en versla de <b>roverskampen</b> op de kaart: dat levert buit en punten op. Kampen dicht bij het midden zijn sterker.</p>
    <h3>3. Oorlogsweek</h3>
    <p>Nu mag je vijandelijke steden aanvallen en plunderen. Stuur eerst <b>verkenners</b>. Rammen beschadigen muren en monumenten. Een opslagplaats verbergt een deel van je grondstoffen.</p>
    <h3>4. Bondgenoten</h3>
    <p>Je wordt automatisch aan een bondgenoot gekoppeld. Stuur elkaar <b>versterking</b> (die verdedigt mee) en <b>karavanen</b> met grondstoffen via de markt. Overleg in de teamchat!</p>
    <h3>Gevechten</h3>
    <p>Speerdragers zijn sterk tegen ruiters, boogschutters verdedigen goed tegen voetvolk. Muren, torens en de smidse versterken je verdediging. De sterkste kant wint; de winnaar verliest minder naarmate zijn overmacht groter is.</p>
    <h3>Punten</h3>
    <p>Gebouwen, dorpelingen en troepen geven opbouwpunten; het <b>Monument</b> levert per niveau 1500 extra punten. Verslagen vijanden en rovers geven gevechtspunten.</p></div>`;
}

export { fmtDuration };
