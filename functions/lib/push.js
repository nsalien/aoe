// Meldingen op je gsm (Web Push), zonder externe bibliotheek: VAPID-handtekening (ES256) en
// versleuteling van de inhoud (aes128gcm, RFC 8291), allebei met de WebCrypto van Cloudflare Workers.
// notifyDue() stuurt ±2 minuten voor een aanval aankomt een melding naar de aanvaller (en de verdediger).
// Het draait elke minuut in de cron-worker (cron/worker.js) en ook 'lui' bij gewone verzoeken.

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

// stuur een melding naar alle toestellen van een speler; vervallen inschrijvingen worden opgeruimd
export async function notifyPlayer(db, keys, playerId, payload, ttl = 120) {
  const subs = (await db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE player_id = ? ORDER BY id DESC LIMIT 4').bind(playerId).all()).results;
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
    }, left / 1000);
    if (m.def_player) {
      sent += await notifyPlayer(db, keys, m.def_player, {
        ...data, title: `Aanval op ${m.town} over {left}!`,
        body: `${m.att_name} valt aan om {clock}. Open het spel om je stad zelf te verdedigen.`,
      }, left / 1000);
    }
  }
  return sent;
}
