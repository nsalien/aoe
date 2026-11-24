// Edelmannen, trouw en vazallen.
// Elke stad heeft trouw (0-100, in towns.state.loy; ontbreekt = 100). Wint een aanvaller met een levende edelman,
// dan daalt de trouw met 25 per edelman. Bij 0 wordt de stad VASSAL.ms lang vazal van de aanvaller:
//   - ze stuurt om de VASSAL.tributeMs een karavaan met schatting (een deel van haar productie) naar haar heer;
//   - ze kan haar heer niet aanvallen (en de heer haar niet);
//   - een bot-vazal stuurt zijn heer ook versterking als die aangevallen wordt (bots.js);
//   - de heer krijgt een deel van haar punten (scoreShare).
// Vrij komen: wachten, losgeld betalen (/vassal/ransom), of een gewonnen aanval op de heer door de vazal of een clanlid.
// Daarna is de stad LOYALTY.shieldMs beschermd tegen edelmannen.
import { LOYALTY, VASSAL, RES, ransomCost } from '../../public/shared/rules.js';
import { age, rates, isVassal, loyalty, townScore, canAfford, pay, GameError } from '../../public/shared/sim.js';
import { mutateTown, addReport, travelMs } from './game.js';
import { MARKET } from '../../public/shared/rules.js';

// waarom de edelmannen van deze aanval niets kunnen doen (of null als het wel mag)
export function nobleBlock(s, t, attScore, lordCount) {
  if (isVassal(s, t)) return 'Deze stad is al vazal.';
  if (s.loyShield && s.loyShield > t) return 'Deze stad is net bevrijd en nog beschermd tegen edelmannen.';
  if (townScore(s) < attScore * LOYALTY.minScore) return 'Deze stad is veel kleiner dan de jouwe: daar doen edelmannen niets.';
  if (lordCount >= VASSAL.maxPerLord) return `Je hebt al ${VASSAL.maxPerLord} vazallen.`;
  return null;
}

// Pas de trouw aan na een gewonnen aanval (in de mutateTown van de verdediger). Geeft een samenvatting terug.
export function applyNobles(s, t, nobles, att, lordCount) {
  if (!nobles) return null;
  const why = nobleBlock(s, t, att.score, lordCount);
  const before = Math.floor(loyalty(s));
  if (why) return { nobles, before, after: before, blocked: why };
  const after = Math.max(0, loyalty(s) - LOYALTY.hit * nobles);
  s.loy = after;
  const out = { nobles, before, after: Math.floor(after), conquered: after < 1 }; // (de trouw herstelde intussen een fractie)
  if (out.conquered) {
    s.loy = 0;
    s.vas = { lord: att.playerId, lname: att.name, ltown: att.townId, ltname: att.town, since: t, until: t + VASSAL.ms };
  }
  return out;
}

export async function lordCount(db, playerId) {
  const r = await db.prepare('SELECT COUNT(*) AS c FROM vassals WHERE lord_player = ?').bind(playerId).first();
  return r ? r.c : 0;
}

export async function addVassal(db, townId, playerId, s, t) {
  await db.prepare(
    `INSERT OR REPLACE INTO vassals (town_id, player_id, lord_player, lord_town, since, until, next_tribute)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(townId, playerId, s.vas.lord, s.vas.ltown, t, s.vas.until, Math.min(s.vas.until, t + VASSAL.tributeMs)).run();
}

// zijn deze twee spelers heer en vazal van elkaar? ('lord' = a is heer van b, 'vassal' = a is vazal van b)
export async function relation(db, aPlayer, bPlayer) {
  const r = await db.prepare(
    'SELECT player_id, lord_player FROM vassals WHERE (player_id = ? AND lord_player = ?) OR (player_id = ? AND lord_player = ?) LIMIT 1',
  ).bind(aPlayer, bPlayer, bPlayer, aPlayer).first();
  if (!r) return null;
  return r.lord_player === aPlayer ? 'lord' : 'vassal';
}

// zet een vazal vrij (in de stad zelf én in de tabel)
export async function freeVassal(db, world, row, t, why) {
  const del = await db.prepare('DELETE FROM vassals WHERE town_id = ?').bind(row.town_id).run();
  if (!del.meta.changes) return false;
  const { town } = await mutateTown(db, world, row.town_id, t, (s) => {
    s.vas = null;
    delete s.loy;
    s.loyShield = t + LOYALTY.shieldMs;
  });
  const lord = await db.prepare('SELECT name FROM players WHERE id = ?').bind(row.lord_player).first();
  const lname = lord ? lord.name : '?';
  const text = {
    time: [`${town.name} is weer vrij`, `${town.name} is niet langer je vazal`],
    ransom: [`Losgeld betaald: ${town.name} is vrij`, `${town.name} kocht zich vrij`],
    attack: [`${town.name} is bevrijd`, `${town.name} werd bevrijd`],
  }[why] || [`${town.name} is vrij`, `${town.name} is vrij`];
  const data = { type: 'vassal', event: 'free', why, town: town.name, lord: lname, shieldUntil: t + LOYALTY.shieldMs };
  await addReport(db, row.player_id, t, 'vassal', text[0], data);
  await addReport(db, row.lord_player, t, 'vassal', text[1], data);
  return true;
}

// Na een gewonnen aanval op de heer: zijn vazallen uit het team van de aanvaller zijn vrij.
export async function liberateByAttack(db, world, lordPlayer, attackerTeam, t) {
  const rows = (await db.prepare(
    'SELECT v.* FROM vassals v JOIN players p ON p.id = v.player_id WHERE v.lord_player = ? AND p.team_id = ?',
  ).bind(lordPlayer, attackerTeam).all()).results;
  const freed = [];
  for (const r of rows) if (await freeVassal(db, world, r, t, 'attack')) freed.push(r.town_id);
  return freed;
}

// Schatting en einde van de vazallen die aan de beurt zijn (licht: hooguit 2 per verzoek, via de index).
export async function processVassals(db, world, now, max = 2) {
  const due = (await db.prepare('SELECT * FROM vassals WHERE next_tribute <= ? ORDER BY next_tribute LIMIT ?').bind(now, max).all()).results;
  for (const v of due) {
    try {
      if (v.until <= now) { await freeVassal(db, world, v, v.until, 'time'); continue; }
      await sendTribute(db, world, v, now);
    } catch (e) {
      console.error('vassal', v.town_id, e && e.stack);
    }
  }
}

async function sendTribute(db, world, v, now) {
  const lock = await db.prepare('UPDATE vassals SET next_tribute = ? WHERE town_id = ? AND next_tribute = ?')
    .bind(Math.min(v.until, now + VASSAL.tributeMs), v.town_id, v.next_tribute).run();
  if (!lock.meta.changes) return;
  const lordTown = await db.prepare('SELECT t.id, t.x, t.y, p.team_id FROM towns t JOIN players p ON p.id = t.player_id WHERE t.id = ?').bind(v.lord_town).first();
  if (!lordTown) { await db.prepare('DELETE FROM vassals WHERE town_id = ?').bind(v.town_id).run(); return; }
  const hours = VASSAL.tributeMs / 3600000;
  const { town, result: res } = await mutateTown(db, world, v.town_id, now, (s) => {
    const r = rates(s, world.speed);
    const out = {};
    for (const k of RES) {
      const amt = Math.floor(Math.min(s.res[k], r[k] * hours * VASSAL.tribute));
      if (amt > 0) { out[k] = amt; s.res[k] -= amt; }
    }
    return out;
  });
  if (!Object.keys(res).length) return;
  const owner = await db.prepare('SELECT team_id FROM players WHERE id = ?').bind(v.player_id).first();
  const dur = travelMs(world, town, lordTown, MARKET.merchantSpeed);
  await db.prepare(
    `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
       units, res, depart_at, arrive_at, status) VALUES (?, ?, 'tribute', ?, ?, ?, 'town', ?, ?, ?, ?, '{}', ?, ?, ?, 'out')`,
  ).bind(v.player_id, owner ? owner.team_id : 0, v.town_id, town.x, town.y, lordTown.id, lordTown.team_id, lordTown.x, lordTown.y,
    JSON.stringify(res), now, now + dur).run();
}

// Losgeld: de vazal betaalt en is meteen vrij; de grondstoffen gaan als karavaan naar de heer.
export async function payRansom(db, world, player, now) {
  const v = await db.prepare('SELECT * FROM vassals WHERE player_id = ?').bind(player.id).first();
  if (!v) throw new GameError('Je bent geen vazal.');
  const lordTown = await db.prepare('SELECT t.id, t.x, t.y, p.team_id FROM towns t JOIN players p ON p.id = t.player_id WHERE t.id = ?').bind(v.lord_town).first();
  let cost = null;
  const { town } = await mutateTown(db, world, v.town_id, now, (s) => {
    cost = ransomCost(age(s));
    if (!canAfford(s.res, cost)) throw new GameError('Niet genoeg grondstoffen voor het losgeld.');
    pay(s.res, cost);
  });
  if (lordTown) {
    const dur = travelMs(world, town, lordTown, MARKET.merchantSpeed);
    await db.prepare(
      `INSERT INTO marches (player_id, team_id, kind, from_town, from_x, from_y, target_kind, target_id, target_team, to_x, to_y,
         units, res, depart_at, arrive_at, status) VALUES (?, ?, 'tribute', ?, ?, ?, 'town', ?, ?, ?, ?, '{}', ?, ?, ?, 'out')`,
    ).bind(player.id, player.team_id, v.town_id, town.x, town.y, lordTown.id, lordTown.team_id, lordTown.x, lordTown.y,
      JSON.stringify(cost), now, now + dur).run();
  }
  await freeVassal(db, world, v, now, 'ransom');
  return cost;
}

// punten die een heer krijgt van zijn vazallen: { lordPlayerId: punten }
export function vassalShare(rows, scoreOf) {
  const out = {};
  for (const v of rows) out[v.lord_player] = (out[v.lord_player] || 0) + Math.round((scoreOf(v.player_id) || 0) * VASSAL.scoreShare);
  return out;
}

export { loyalty };
