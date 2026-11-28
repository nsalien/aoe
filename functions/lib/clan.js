// Clans wisselen: verlaten (je sticht een eigen clan), toetreding vragen, uitnodigen, een verrader buitenzetten.
// Regels in CLAN (rules.js). Een speler zit altijd in precies één clan (players.team_id); een lege clan verdwijnt.
// Bij een wissel gaan troepen die bij de oude clan gestationeerd staan naar huis (en die van de oude clan bij jou),
// versterking die nog onderweg is keert om, en legers tussen jou en je nieuwe clan keren om (jullie zijn nu bondgenoten).
import { GameError } from './http.js';
import { travelMs, fmtLeft, addReport } from './game.js';
import { slowestSpeed } from '../../public/shared/battle.js';
import { CLAN, CLAN_COLORS, MAX_TEAMS, TEAM_NAMES } from '../../public/shared/rules.js';

// hooguit zoveel leden per clan
export const clanMax = (world) => Math.max((world && world.team_size) || 2, CLAN.maxMembers);

// eerste vrije plaats (0..MAX_TEAMS-1) voor een automatisch team; zelf gestichte clans tellen niet mee
export function freeSlot(teams) {
  const used = new Set(teams.filter((t) => t.founder == null).map((t) => t.slot));
  for (let s = 0; s < MAX_TEAMS; s++) if (!used.has(s)) return s;
  return -1;
}

const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const v = m ? parseInt(m[1], 16) : 0; return [v >> 16, (v >> 8) & 255, v & 255]; };
const dist2 = (a, b) => { const x = rgb(a); const y = rgb(b); return x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0); };

// een kleur voor een nieuwe clan: liefst een die geen automatisch team krijgt, zo verschillend mogelijk van de rest
export function pickColor(used) {
  const u = used.filter(Boolean).map((c) => c.toLowerCase());
  let cand = CLAN_COLORS.slice(MAX_TEAMS).filter((c) => !u.includes(c));
  if (!cand.length) cand = CLAN_COLORS.filter((c) => !u.includes(c));
  if (!cand.length) cand = CLAN_COLORS;
  let best = cand[0]; let bd = -1;
  for (const c of cand) {
    const d = u.length ? Math.min(...u.map((x) => dist2(c, x))) : 0;
    if (d > bd) { bd = d; best = c; }
  }
  return best;
}

// naam van een nieuwe clan (gekozen, of 'Clan van <naam>'); uniek, ook t.o.v. de namen van de automatische teams
export function clanName(raw, teams, playerName) {
  const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  const taken = new Set([...teams.map((t) => t.name.toLowerCase()), ...TEAM_NAMES.map((x) => x.toLowerCase())]);
  const chosen = clean(raw);
  if (chosen) {
    if (chosen.length < CLAN.nameMin || chosen.length > CLAN.nameMax) throw new GameError(`Een clannaam heeft ${CLAN.nameMin} tot ${CLAN.nameMax} tekens.`);
    if (taken.has(chosen.toLowerCase())) throw new GameError('Die clannaam is al in gebruik.');
    return chosen;
  }
  const base = `Clan van ${clean(playerName)}`.slice(0, CLAN.nameMax);
  if (!taken.has(base.toLowerCase())) return base;
  for (let k = 2; ; k++) {
    const n = `${base.slice(0, CLAN.nameMax - String(k).length - 1)} ${k}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

const sysMsg = (db, team, text, now) => db.prepare("INSERT INTO messages (channel, player_id, name, text, created_at) VALUES (?, 0, 'Clan', ?, ?)")
  .bind(`team:${team}`, text, now);
const qs = (n) => Array(n).fill('?').join(', ');

// Speler p (rij uit players) wisselt naar clan toTeam (id), of sticht een eigen clan (toTeam = null, opts.name).
// opts.force = buitengezet (geen wachttijd), opts.self = de speler doet het zelf (voor de foutmelding).
export async function switchClan(db, world, p, toTeam, now, opts = {}) {
  if (!p) throw new GameError('Speler niet gevonden.', 404);
  if (p.bot) throw new GameError('Computerspelers wisselen niet van clan.');
  const from = p.team_id;
  const teams = (await db.prepare(
    'SELECT t.id, t.slot, t.name, t.color, t.founder, COUNT(p.id) AS c, COALESCE(SUM(p.bot), 0) AS b FROM teams t LEFT JOIN players p ON p.team_id = t.id GROUP BY t.id',
  ).all()).results;
  const cur = teams.find((t) => t.id === from) || { id: from, name: '?', c: 1 };
  if (toTeam == null && cur.c <= 1) throw new GameError('Je bent al alleen in je clan.');
  const wait = (p.clan_at || 0) + CLAN.switchMs - now;
  if (!opts.force && wait > 0) {
    throw new GameError(`${opts.self ? 'Je wisselde' : `${p.name} wisselde`} net van clan: dat kan pas weer over ${fmtLeft(wait)}.`);
  }
  let team; let max;
  if (toTeam == null) {
    const name = clanName(opts.name, teams, p.name);
    const color = pickColor(teams.map((t) => t.color));
    const ins = await db.prepare('INSERT INTO teams (slot, name, color, founder) VALUES (?, ?, ?, ?)').bind(MAX_TEAMS, name, color, p.id).run();
    team = { id: ins.meta.last_row_id, name, color, c: 0, founded: true };
    max = 1;
  } else {
    team = teams.find((t) => t.id === toTeam);
    if (!team) throw new GameError('Die clan bestaat niet meer.', 404);
    if (team.id === from) throw new GameError(`${opts.self ? 'Je zit' : `${p.name} zit`} al in die clan.`);
    if (team.b) throw new GameError('Computerclans nemen geen spelers op.');
    max = clanMax(world);
    if (team.c >= max) throw new GameError(`${team.name} is vol (hooguit ${max} leden).`);
  }
  // de wissel zelf (enkel als de speler nog in zijn oude clan zit en de nieuwe niet intussen vol raakte)
  const upd = await db.prepare(
    'UPDATE players SET team_id = ?, clan_at = ?, traitor_at = NULL WHERE id = ? AND team_id = ? AND (SELECT COUNT(*) FROM players WHERE team_id = ?) < ?',
  ).bind(team.id, opts.force ? (p.clan_at || 0) : now, p.id, from, team.id, max).run();
  if (!upd.meta.changes) {
    if (team.founded) await db.prepare('DELETE FROM teams WHERE id = ?').bind(team.id).run();
    throw new GameError('Dat lukte niet: de clan veranderde net. Probeer opnieuw.', 409);
  }

  const town = await db.prepare('SELECT id, name, x, y FROM towns WHERE player_id = ?').bind(p.id).first();
  const mates = (await db.prepare(
    'SELECT t.id, t.name, t.player_id, pl.team_id FROM towns t JOIN players pl ON pl.id = t.player_id WHERE pl.team_id IN (?, ?) AND pl.id != ?',
  ).bind(from, team.id, p.id).all()).results;
  const oldT = mates.filter((r) => r.team_id === from);
  const newT = mates.filter((r) => r.team_id === team.id);
  const stmts = [];
  const notes = []; // [speler, tekst] voor een rapport

  if (town) {
    // legers die nog onderweg zijn: versterking van/naar de oude clan en aanvallen tussen jou en je nieuwe clan keren om
    const pair = (list, kinds) => (list.length ? `(kind IN (${kinds}) AND ((player_id = ? AND target_kind = 'town' AND target_id IN (${qs(list.length)}))
      OR (player_id IN (${qs(list.length)}) AND target_kind = 'town' AND target_id = ?)))` : null);
    const parts = []; const args = [];
    const a = pair(oldT, "'support'"); if (a) { parts.push(a); args.push(p.id, ...oldT.map((r) => r.id), ...oldT.map((r) => r.player_id), town.id); }
    const b = pair(newT, "'attack','scout'"); if (b) { parts.push(b); args.push(p.id, ...newT.map((r) => r.id), ...newT.map((r) => r.player_id), town.id); }
    if (parts.length) {
      const turn = (await db.prepare(`SELECT id, player_id, kind, target_id FROM marches WHERE status = 'out' AND (${parts.join(' OR ')})`).bind(...args).all()).results;
      if (turn.length) {
        stmts.push(db.prepare(`UPDATE marches SET status = 'back', arrive_at = ? + (MIN(?, arrive_at) - depart_at), depart_at = ?, lock_until = 0
          WHERE status = 'out' AND id IN (${qs(turn.length)})`).bind(now, now, now, ...turn.map((m) => m.id)));
        const names = new Map([...mates.map((r) => [r.id, r.name]), [town.id, town.name]]);
        for (const m of turn) {
          if (m.kind === 'support') notes.push([m.player_id, `Je versterking naar ${names.get(m.target_id) || '?'} keert om: jullie zijn geen bondgenoten meer.`]);
          else notes.push([m.player_id, `Je ${m.kind === 'scout' ? 'verkenning' : 'aanval'} op ${names.get(m.target_id) || '?'} keert om: jullie zijn nu bondgenoten.`]);
        }
      }
    }
    // de legers van de speler horen nu bij zijn nieuwe clan (zo ziet hij ze en ziet zijn oude clan ze niet meer)
    stmts.push(db.prepare('UPDATE marches SET team_id = ? WHERE player_id = ?').bind(team.id, p.id));
    stmts.push(db.prepare("UPDATE marches SET target_team = ? WHERE target_kind = 'town' AND target_id = ? AND kind != 'return'").bind(team.id, town.id));
    // gestationeerde troepen tussen de speler en zijn oude clan gaan naar huis
    if (oldT.length) {
      const sup = (await db.prepare(
        `SELECT s.id, s.player_id, s.from_town, s.host_town, s.units, h.x AS hx, h.y AS hy, h.name AS hname, f.x AS fx, f.y AS fy FROM support s
         JOIN towns h ON h.id = s.host_town JOIN towns f ON f.id = s.from_town
         WHERE (s.player_id = ? AND s.host_town IN (${qs(oldT.length)})) OR (s.host_town = ? AND s.player_id IN (${qs(oldT.length)}))`,
      ).bind(p.id, ...oldT.map((r) => r.id), town.id, ...oldT.map((r) => r.player_id)).all()).results;
      for (const sp of sup) {
        const owner = sp.player_id === p.id ? team.id : from;
        const units = JSON.parse(sp.units);
        const dur = travelMs(world, { x: sp.hx, y: sp.hy }, { x: sp.fx, y: sp.fy }, slowestSpeed(units));
        stmts.push(db.prepare('DELETE FROM support WHERE id = ?').bind(sp.id));
        stmts.push(db.prepare(
          `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
             units, res, depart_at, arrive_at, status) VALUES (?, ?, 'return', ?, ?, ?, 'town', ?, ?, ?, ?, ?, '{}', ?, ?, 'back')`,
        ).bind(sp.player_id, owner, sp.from_town, sp.fx, sp.fy, sp.host_town, owner, sp.hx, sp.hy, sp.units, now, now + dur));
        notes.push([sp.player_id, `Je troepen in ${sp.hname} keren naar huis: jullie zijn geen bondgenoten meer.`]);
      }
    }
  }
  // uitnodigingen en verzoeken: wie bij een clan komt, heeft gekozen
  if (toTeam != null) stmts.push(db.prepare('DELETE FROM clan_invites WHERE player_id = ?').bind(p.id));
  // berichten in de clanchat
  const why = opts.kicked ? `${p.name} werd uit de clan gezet na verraad.` : toTeam == null ? `${p.name} heeft de clan verlaten en sticht ${team.name}.` : `${p.name} heeft de clan verlaten voor ${team.name}.`;
  if (cur.c > 1) stmts.push(sysMsg(db, from, why, now));
  if (toTeam != null) stmts.push(sysMsg(db, team.id, `${p.name} is bij de clan gekomen. Welkom!`, now));
  // een lege clan verdwijnt (met zijn uitnodigingen en chat)
  const empty = 'NOT EXISTS (SELECT 1 FROM players WHERE team_id = ?)';
  stmts.push(db.prepare(`DELETE FROM clan_invites WHERE team_id = ? AND ${empty}`).bind(from, from));
  stmts.push(db.prepare(`DELETE FROM messages WHERE channel = ? AND ${empty}`).bind(`team:${from}`, from));
  stmts.push(db.prepare(`DELETE FROM teams WHERE id = ? AND ${empty}`).bind(from, from));
  await db.batch(stmts);
  for (const [pid, text] of notes) {
    if (pid === p.id && !opts.kicked) continue; // wie zelf wisselt, weet het al (het venster toont het)
    await addReport(db, pid, now, 'info', 'Clan', { type: 'clan', text });
  }
  if (opts.kicked) await addReport(db, p.id, now, 'info', `Je werd uit ${cur.name} gezet`, { type: 'clan', text: `Je clan zette je buiten na je aanval op een clanlid. Je bent nu alleen in ${team.name}.` });
  return { id: team.id, name: team.name, color: team.color, left: cur.name };
}

const loadPlayer = (db, id) => db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
const loadTeam = (db, id) => db.prepare(
  'SELECT t.id, t.name, t.color, COUNT(p.id) AS c, COALESCE(SUM(p.bot), 0) AS b FROM teams t LEFT JOIN players p ON p.team_id = t.id WHERE t.id = ? GROUP BY t.id',
).bind(id).first();

async function pending(db, teamId, playerId, now) {
  const r = await db.prepare('SELECT * FROM clan_invites WHERE team_id = ? AND player_id = ?').bind(teamId, playerId).first();
  if (r && r.created_at < now - CLAN.inviteMs) { await db.prepare('DELETE FROM clan_invites WHERE id = ?').bind(r.id).run(); return null; }
  return r;
}

async function upsertInvite(db, teamId, playerId, kind, by, now) {
  await db.prepare(
    `INSERT INTO clan_invites (team_id, player_id, kind, by_player, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(team_id, player_id) DO UPDATE SET kind = excluded.kind, by_player = excluded.by_player, created_at = excluded.created_at`,
  ).bind(teamId, playerId, kind, by, now).run();
  // af en toe vervallen uitnodigingen opruimen
  if (Math.random() < 0.15) await db.prepare('DELETE FROM clan_invites WHERE created_at < ?').bind(now - CLAN.inviteMs).run();
}

// Een clanlid nodigt een speler uit. Vroeg die speler zelf al om toe te treden, dan komt hij meteen bij de clan.
export async function inviteToClan(db, world, me, targetId, now) {
  const t = await loadPlayer(db, targetId);
  if (!t) throw new GameError('Speler niet gevonden.', 404);
  if (t.bot) throw new GameError('Computerspelers wisselen niet van clan.');
  if (t.id === me.id || t.team_id === me.team_id) throw new GameError(`${t.name} zit al in je clan.`);
  const team = await loadTeam(db, me.team_id);
  if (!team) throw new GameError('Je clan werd niet gevonden.', 404);
  if (team.c >= clanMax(world)) throw new GameError(`Je clan is vol (hooguit ${clanMax(world)} leden).`);
  const ex = await pending(db, me.team_id, t.id, now);
  if (ex && ex.kind === 'request') {
    const r = await switchClan(db, world, t, me.team_id, now);
    return { joined: true, msg: `${t.name} had al gevraagd om toe te treden en is nu bij de clan.`, team: r };
  }
  await upsertInvite(db, me.team_id, t.id, 'invite', me.id, now);
  await sysMsg(db, me.team_id, `${me.name} nodigde ${t.name} uit in de clan.`, now).run();
  return { joined: false, msg: `${t.name} is uitgenodigd. Zodra hij aanvaardt, zit hij bij jullie clan.` };
}

// Een speler vraagt om bij een clan te komen. Was hij al uitgenodigd, dan komt hij er meteen bij.
export async function requestClan(db, world, me, teamId, now) {
  const team = await loadTeam(db, teamId);
  if (!team) throw new GameError('Die clan bestaat niet (meer).', 404);
  if (team.id === me.team_id) throw new GameError('Je zit al in die clan.');
  if (team.b) throw new GameError('Computerclans nemen geen spelers op.');
  if (team.c >= clanMax(world)) throw new GameError(`${team.name} is vol (hooguit ${clanMax(world)} leden).`);
  const ex = await pending(db, team.id, me.id, now);
  if (ex && ex.kind === 'invite') {
    const r = await switchClan(db, world, me, team.id, now, { self: true });
    return { joined: true, msg: `Je was al uitgenodigd: je zit nu in ${team.name}.`, team: r };
  }
  const wait = (me.clan_at || 0) + CLAN.switchMs - now;
  if (wait > 0) throw new GameError(`Je wisselde net van clan: dat kan pas weer over ${fmtLeft(wait)}.`);
  await upsertInvite(db, team.id, me.id, 'request', me.id, now);
  await sysMsg(db, team.id, `${me.name} vraagt om bij de clan te komen. Antwoord in het Team-venster.`, now).run();
  return { joined: false, msg: `Je vroeg om bij ${team.name} te komen. Een lid van die clan moet je verzoek aanvaarden.` };
}

// Antwoorden op een uitnodiging of verzoek (aanvaarden of weigeren), of je eigen uitnodiging/verzoek intrekken.
export async function answerInvite(db, world, me, id, accept, now) {
  const r = await db.prepare('SELECT * FROM clan_invites WHERE id = ?').bind(id).first();
  if (!r || r.created_at < now - CLAN.inviteMs) {
    if (r) await db.prepare('DELETE FROM clan_invites WHERE id = ?').bind(r.id).run();
    throw new GameError('Deze uitnodiging of dit verzoek bestaat niet meer.', 404);
  }
  const forMe = r.player_id === me.id; // ik ben uitgenodigd of ik vroeg het zelf
  const forClan = r.team_id === me.team_id; // het gaat om mijn clan
  if (!forMe && !forClan) throw new GameError('Dit gaat niet over jou.', 403);
  // aanvaarden kan enkel de andere kant: de uitgenodigde speler, of een lid van de clan bij een verzoek
  const canAccept = (r.kind === 'invite' && forMe) || (r.kind === 'request' && forClan);
  if (accept) {
    if (!canAccept) throw new GameError('Daar moet de andere kant op antwoorden.');
    const who = forMe ? me : await loadPlayer(db, r.player_id);
    if (!who) { await db.prepare('DELETE FROM clan_invites WHERE id = ?').bind(r.id).run(); throw new GameError('Die speler bestaat niet meer.', 404); }
    const team = await switchClan(db, world, who, r.team_id, now, { self: forMe });
    return { joined: true, team, msg: forMe ? `Je zit nu in ${team.name}.` : `${who.name} zit nu in jullie clan.` };
  }
  await db.prepare('DELETE FROM clan_invites WHERE id = ?').bind(r.id).run();
  const other = await loadPlayer(db, r.player_id);
  const name = other ? other.name : '?';
  if (canAccept && r.kind === 'request') await sysMsg(db, r.team_id, `${me.name} weigerde het verzoek van ${name}.`, now).run();
  if (canAccept && r.kind === 'invite') await sysMsg(db, r.team_id, `${name} sloeg de uitnodiging af.`, now).run();
  return { joined: false, msg: canAccept ? 'Geweigerd.' : 'Ingetrokken.' };
}

// Een clanlid dat een ander clanlid aanviel (verraad, de laatste CLAN.traitorMs), kan de clan buitenzetten.
export async function kickTraitor(db, world, me, targetId, now) {
  const t = await loadPlayer(db, targetId);
  if (!t || t.team_id !== me.team_id || t.id === me.id) throw new GameError('Die speler zit niet in je clan.');
  if (!t.traitor_at || now - t.traitor_at > CLAN.traitorMs) throw new GameError(`Je kan enkel een verrader buitenzetten: een clanlid dat de laatste ${CLAN.traitorMs / 86400000} dagen een ander clanlid aanviel.`);
  const team = await switchClan(db, world, t, null, now, { force: true, kicked: true });
  return { msg: `${t.name} is uit de clan gezet en zit nu alleen in ${team.name}.` };
}

// Alles voor het Team-venster: alle clans en hun leden, uitnodigingen en verzoeken, wachttijd.
export async function clanInfo(db, world, player, now) {
  const rows = (await db.prepare(
    'SELECT t.id AS tid, t.name AS tname, t.color, p.id, p.name, p.bot, p.last_seen FROM teams t JOIN players p ON p.team_id = t.id ORDER BY t.id, p.id',
  ).all()).results;
  const clans = []; const byTeam = new Map(); const names = new Map();
  for (const r of rows) {
    names.set(r.id, r.name);
    let c = byTeam.get(r.tid);
    if (!c) { c = { id: r.tid, name: r.tname, color: r.color, bot: true, members: [] }; byTeam.set(r.tid, c); clans.push(c); }
    c.members.push({ id: r.id, name: r.name, bot: !!r.bot, online: !r.bot && now - r.last_seen < 5 * 60000 });
    if (!r.bot) c.bot = false;
  }
  const inv = (await db.prepare('SELECT * FROM clan_invites WHERE (player_id = ? OR team_id = ?) AND created_at > ? ORDER BY id').bind(player.id, player.team_id, now - CLAN.inviteMs).all()).results;
  const team = (id) => { const c = byTeam.get(id); return c ? { id: c.id, name: c.name, color: c.color, count: c.members.length } : null; };
  const out = (r) => ({ id: r.id, kind: r.kind, team: team(r.team_id), player: { id: r.player_id, name: names.get(r.player_id) || '?' }, by: names.get(r.by_player) || null, at: r.created_at, until: r.created_at + CLAN.inviteMs });
  const mine = byTeam.get(player.team_id);
  return {
    max: clanMax(world),
    alone: !mine || mine.members.length <= 1,
    switchAt: (player.clan_at || 0) + CLAN.switchMs,
    clans,
    invites: inv.filter((r) => r.kind === 'invite' && r.player_id === player.id && team(r.team_id)).map(out), // ik ben uitgenodigd
    requests: inv.filter((r) => r.kind === 'request' && r.team_id === player.team_id && names.has(r.player_id)).map(out), // vragen om bij ons te komen
    sent: inv.filter((r) => (r.kind === 'request' && r.player_id === player.id && team(r.team_id)) || (r.kind === 'invite' && r.team_id === player.team_id && names.has(r.player_id))).map(out),
  };
}
