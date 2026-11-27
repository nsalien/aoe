// Meldingen op je gsm (Web Push), zonder externe bibliotheek: VAPID-handtekening (ES256) en
// versleuteling van de inhoud (aes128gcm, RFC 8291), allebei met de WebCrypto van Cloudflare Workers.
// notifyDue() stuurt ±2 minuten voor een aanval aankomt een melding naar de aanvaller (en de verdediger), notifyBuilds()
// als een bouwwerk klaar is, notifyAttack() meteen als iemand een aanval op je stad (of die van een clanlid) stuurt. Elke soort staat apart aan/uit
// per toestel (NOTIFY_KINDS). notifyAll() draait elke minuut in de cron-worker (cron/worker.js) en ook 'lui' bij gewone verzoeken.

import { BUILDINGS, AGES } from '../../public/shared/rules.js';
import { maxBuilds, ensureTerritory, advance, raidNow } from '../../public/shared/sim.js';
import { loadTown, saveTown, gameTime, raidNotice, ConflictError } from './game.js';

const enc = new TextEncoder();

export const b64u = (buf) => {
  let s = '';
  for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (str) => {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// Enkel echte meldingsdiensten (anders zou iemand de server naar willekeurige adressen kunnen laten posten).
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
export function validPushEndpoint(ep) {
  try {
    const u = new URL(ep);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

// VAPID-sleutels: de eerste keer gemaakt en bewaard in de database (tabel config), daarna altijd dezelfde.
export async function vapidKeys(db) {
  let row = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
    await db.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ pub, priv })).run();
    row = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  }
  return JSON.parse(row.v);
}

export async function vapidHeader(keys, endpoint, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: 'https://rijken-van-de-vallei.pages.dev' })));
  const key = await crypto.subtle.importKey('jwk', keys.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.pub}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// versleutel de inhoud voor één toestel (RFC 8291, één blok aes128gcm)
export async function encryptPayload(sub, payload) {
  const uaPub = unb64u(sub.p256dh);
  const auth = unb64u(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(JSON.stringify(payload)), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  return concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}

async function sendOne(keys, sub, payload, ttl) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(keys, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(Math.max(30, Math.round(ttl))),
      Urgency: 'high',
    },
    body: await encryptPayload(sub, payload),
  });
  return res.status;
}

// soorten meldingen, elk apart aan/uit per toestel (kolommen in push_subs, migraties 0008 en 0012; standaard aan):
//   now = aanval op je stad, meteen bij vertrek · ally = aanval op een clanlid, meteen bij vertrek
//   attack = aanval op je stad ±2 min voor aankomst, en een overval van de barbaren · build = bouwer vrij · march = je leger komt aan
export const NOTIFY_KINDS = { now: 'n_now', ally: 'n_ally', attack: 'n_attack', build: 'n_build', march: 'n_march' };

// stuur een melding naar alle toestellen van een speler; vervallen inschrijvingen worden opgeruimd.
// kind: enkel naar de toestellen waar die soort aan staat (zonder kind: naar alle, bv. de proefmelding)
export async function notifyPlayer(db, keys, playerId, payload, ttl = 120, kind = null) {
  const col = kind ? NOTIFY_KINDS[kind] : null;
  if (kind && !col) throw new Error(`onbekende soort melding: ${kind}`);
  const subs = (await db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subs WHERE player_id = ?${col ? ` AND ${col} = 1` : ''} ORDER BY id DESC LIMIT 4`).bind(playerId).all()).results;
  if (kind) payload = { ...payload, kind };
  let ok = 0;
  for (const sub of subs) {
    try {
      const st = await sendOne(keys, sub, payload, ttl);
      if (st === 404 || st === 410) await db.prepare('DELETE FROM push_subs WHERE id = ?').bind(sub.id).run();
      else if (st < 300) ok++;
    } catch (e) { console.error('push', e && e.message); }
  }
  return ok;
}

export const NOTIFY_LEAD = 150000; // zo lang voor de aankomst gaat de eerste melding uit (de cron loopt elke minuut)
export const NOTIFY_UPDATE = 80000; // daarna nog één stille bijwerking van dezelfde melding

// Aanvallen die binnenkort aankomen: een melding voor de aanvaller en de verdediger (±2 min vooraf, met geluid),
// en ±1 min vooraf een stille bijwerking. {left} en {clock} vult de gsm zelf in (eigen klok en tijdzone).
// marches.notified: 0 = nog niets, 1 = eerste melding, 2 = ook de bijwerking.
export async function notifyDue(db, now, max = 6) {
  const rows = (await db.prepare(
    `SELECT m.id, m.player_id, m.target_kind, m.arrive_at, m.notified, t.name AS town, t.player_id AS def_player, p.name AS att_name
     FROM marches m LEFT JOIN towns t ON t.id = m.target_id AND m.target_kind = 'town' JOIN players p ON p.id = m.player_id
     WHERE m.status = 'out' AND m.arrive_at > ? AND m.arrive_at <= ? AND m.kind = 'attack'
       AND (m.notified = 0 OR (m.notified = 1 AND m.arrive_at <= ?))
     ORDER BY m.arrive_at LIMIT ?`,
  ).bind(now, now + NOTIFY_LEAD, now + NOTIFY_UPDATE, max).all()).results;
  if (!rows.length) return 0;
  const keys = await vapidKeys(db);
  let sent = 0;
  for (const m of rows) {
    const left = m.arrive_at - now;
    const next = m.notified === 0 && left > NOTIFY_UPDATE ? 1 : 2;
    const claim = await db.prepare('UPDATE marches SET notified = ? WHERE id = ? AND notified = ?').bind(next, m.id, m.notified).run();
    if (!claim.meta.changes) continue;
    const quiet = m.notified > 0; // bijwerking: zonder geluid
    const where = m.target_kind === 'town' ? m.town : 'het roverskamp';
    const data = { tag: `march-${m.id}`, url: `/?march=${m.id}`, at: m.arrive_at, quiet };
    sent += await notifyPlayer(db, keys, m.player_id, {
      ...data, title: 'Je leger komt over {left} aan',
      body: `Aanval op ${where}, aankomst om {clock}. Open het spel en kies: zelf besturen of automatisch.`,
    }, left / 1000, 'march');
    if (m.def_player) {
      sent += await notifyPlayer(db, keys, m.def_player, {
        ...data, title: `Aanval op ${m.town} over {left}!`,
        body: `${m.att_name} valt aan om {clock}. Open het spel om je stad zelf te verdedigen.`,
      }, left / 1000, 'attack');
    }
  }
  return sent;
}

// Meteen bij het vertrek van een aanval op een stad: de verdediger weet dat er iets aankomt (zonder de troepen, soort 'now';
// zelfde tag als de melding ±2 min vooraf, die deze later vervangt), en zijn clanleden ook (soort 'ally': ze kunnen
// versterking sturen). Wordt opgeroepen na /march en na een aanval van een bot.
export async function notifyAttack(db, marchId, now) {
  const m = await db.prepare(
    `SELECT m.id, m.kind, m.arrive_at, m.player_id AS att_player, t.name AS town, t.player_id AS def_player, d.name AS def_name, d.team_id AS def_team,
            p.name AS att_name, p.team_id AS att_team
     FROM marches m JOIN towns t ON t.id = m.target_id AND m.target_kind = 'town' JOIN players p ON p.id = m.player_id
     JOIN players d ON d.id = t.player_id
     WHERE m.id = ?`,
  ).bind(marchId).first();
  if (!m || m.kind !== 'attack' || m.arrive_at <= now) return 0;
  const keys = await vapidKeys(db);
  const ttl = Math.max(60, (m.arrive_at - now) / 1000);
  // verraad: de aanvaller zit in dezelfde clan als de verdediger
  const betray = m.def_team != null && m.att_team === m.def_team;
  let sent = await notifyPlayer(db, keys, m.def_player, {
    tag: `march-${m.id}`, url: `/?march=${m.id}`, at: m.arrive_at,
    title: betray ? `Verraad! ${m.att_name} valt ${m.town} aan` : `Aanval op ${m.town}!`,
    body: betray ? `Je bondgenoot ${m.att_name} stuurt een leger naar je stad. Aankomst om {clock} (over {left}).`
      : `${m.att_name} stuurt een leger naar je stad. Aankomst om {clock} (over {left}).`,
  }, ttl, 'now');
  if (m.def_team == null) return sent;
  // clanleden (echte spelers; enkel wie die melding aan heeft, krijgt ze; de verrader zelf niet)
  const mates = (await db.prepare(
    `SELECT DISTINCT p.id FROM players p JOIN push_subs s ON s.player_id = p.id
     WHERE p.team_id = ? AND p.id != ? AND p.id != ? AND p.bot = 0 AND s.n_ally = 1 LIMIT 8`,
  ).bind(m.def_team, m.def_player, m.att_player).all()).results;
  for (const r of mates) {
    sent += await notifyPlayer(db, keys, r.id, {
      tag: `ally-${m.id}`, url: `/?march=${m.id}`, at: m.arrive_at,
      title: betray ? `Verraad: ${m.att_name} valt clanlid ${m.def_name} aan!` : `Je clanlid ${m.def_name} wordt aangevallen!`,
      body: `${m.att_name} stuurt een leger naar ${m.town}. Aankomst om {clock} (over {left}). Stuur versterking!`,
    }, ttl, 'ally');
  }
  return sent;
}

// Bouwwerken die klaar zijn: 'een bouwer is vrij'. towns.build_at = het eerstvolgende einde (saveTown houdt het bij).
// Alles wat sinds build_at klaar is wordt gemeld en build_at schuift naar het volgende einde (de UPDATE met de oude
// waarde voorkomt dubbele meldingen als de cron en een verzoek tegelijk kijken).
export async function notifyBuilds(db, now, max = 4) {
  const rows = (await db.prepare(
    'SELECT id, player_id, name, state, build_at FROM towns WHERE build_at IS NOT NULL AND build_at <= ? ORDER BY build_at LIMIT ?',
  ).bind(now, max).all()).results;
  if (!rows.length) return 0;
  let keys = null;
  let sent = 0;
  for (const r of rows) {
    let s = null;
    try { s = JSON.parse(r.state); } catch { /* kapotte stad: enkel build_at opruimen */ }
    const builds = (s && s.builds) || [];
    const done = builds.filter((j) => j.end >= r.build_at && j.end <= now);
    let next = null;
    for (const j of builds) if (j.end > now && (next === null || j.end < next)) next = j.end;
    const claim = await db.prepare('UPDATE towns SET build_at = ? WHERE id = ? AND build_at = ?').bind(next, r.id, r.build_at).run();
    if (!claim.meta.changes || !done.length) continue;
    const names = done.map((j) => {
      const b = s.buildings.find((x) => x.id === j.bid);
      if (!b || !BUILDINGS[b.type]) return null;
      return b.type === 'tc' ? `je stadscentrum (${AGES[j.to] ? AGES[j.to].name : `niveau ${j.to}`})` : `${BUILDINGS[b.type].name} (niveau ${j.to})`;
    }).filter(Boolean);
    if (!names.length) continue;
    const free = Math.max(1, maxBuilds(s) - builds.filter((j) => j.end > now).length);
    if (!keys) keys = await vapidKeys(db);
    sent += await notifyPlayer(db, keys, r.player_id, {
      tag: `build-${r.id}`, url: '/',
      title: free === 1 ? `Een bouwer is vrij in ${r.name}` : `${free} bouwers zijn vrij in ${r.name}`,
      body: `Klaar: ${names.join(', ')}. Geef je bouwers een nieuwe opdracht.`,
    }, 6 * 3600, 'build');
  }
  return sent;
}

// Overvallen van de barbaren: towns.raid_at = wanneer de stad bekeken moet worden (raidNotice in game.js). De overvallen
// volgen uit de stad zelf (sim.js), dus de stad wordt hier tot nu doorgerekend en bewaard; begint er een overval, dan
// krijgt de speler een melding: 15 minuten om de slag zelf te spelen, anders verloopt ze automatisch.
// Spelers die al een week weg zijn, slaan we over (hun raid_at komt terug zodra hun stad weer bewaard wordt).
export const RAID_IDLE = 7 * 86400000;
export async function notifyRaids(db, world, now, max = 2) {
  if (!world) return 0;
  const rows = (await db.prepare(
    `SELECT t.id, t.name, t.player_id, t.raid_at, p.last_seen FROM towns t JOIN players p ON p.id = t.player_id
     WHERE t.raid_at IS NOT NULL AND t.raid_at <= ? ORDER BY t.raid_at LIMIT ?`,
  ).bind(now, max).all()).results;
  let keys = null;
  let sent = 0;
  for (const r of rows) {
    if (r.last_seen < now - RAID_IDLE) {
      await db.prepare('UPDATE towns SET raid_at = NULL WHERE id = ? AND raid_at = ?').bind(r.id, r.raid_at).run();
      continue;
    }
    const town = await loadTown(db, r.id);
    if (!town) continue;
    ensureTerritory(town.state, town.id);
    advance(town.state, gameTime(world, now), world.speed);
    const raid = raidNow(town.state);
    const tell = !!(raid && !raid.told && !raid.battle && now < raid.at);
    if (raid) raid.told = 1;
    try { await saveTown(db, town); } catch (e) { if (e instanceof ConflictError) continue; throw e; }
    // het seizoen is voorbij (de tijd staat stil): niet elke minuut opnieuw
    const nx = raidNotice(town.state);
    if (nx != null && nx <= now) await db.prepare('UPDATE towns SET raid_at = NULL WHERE id = ?').bind(r.id).run();
    if (!tell) continue;
    if (!keys) keys = await vapidKeys(db);
    sent += await notifyPlayer(db, keys, r.player_id, {
      tag: `raid-${r.id}`, url: '/?raid=1', at: raid.at,
      title: `Barbaren vallen ${r.name} aan!`,
      body: `${raid.n} barbaren trekken naar je dorp. Je hebt nog {left} om het gevecht zelf te spelen, daarna verloopt het automatisch.`,
    }, Math.max(60, (raid.at - now) / 1000), 'attack');
  }
  return sent;
}

// alles wat op tijd moet uitgaan (cron elke minuut, en als vangnet na gewone verzoeken)
// Een overval bekijken = een stad doorrekenen (±1 ms, hooguit ±5 ms): hooguit één per beurt, en enkel als er nog niets
// versleuteld werd (CPU-limiet). Overvallen komen hooguit een paar keer per dag per stad: één per minuut volstaat ruim.
export async function notifyAll(db, now, max = 6, world = null) {
  const sent = (await notifyDue(db, now, max)) + (await notifyBuilds(db, now, max));
  if (sent) return sent;
  return notifyRaids(db, world, now, 1);
}
