import { GameError } from './http.js';

const ITER = 20000; // hou dit laag: het gratis plan geeft maar ~10ms CPU per verzoek
const COOKIE = 'rvs';
const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64(a).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256,
  );
  return b64(bits);
}

export function newSalt() {
  return randomToken(16);
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function sha256(s) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export async function createSession(db, playerId, now) {
  const token = randomToken(32);
  const expires = now + SESSION_DAYS * 86400000;
  await db.prepare('INSERT INTO sessions (token, player_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), playerId, expires).run();
  return { token, expires };
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export async function getSessionPlayer(db, request, now) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await db.prepare(
    `SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), now).first();
  return row || null;
}

export async function destroySession(db, request) {
  const token = readCookie(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
}

export function validateName(name) {
  if (typeof name !== 'string') throw new GameError('Geef een naam op.');
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 3 || n.length > 20) throw new GameError('Je naam moet 3 tot 20 tekens lang zijn.');
  if (!/^[\p{L}\p{N} _.\-']+$/u.test(n)) throw new GameError('Je naam bevat ongeldige tekens.');
  return n;
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6 || pw.length > 100) throw new GameError('Je wachtwoord moet minstens 6 tekens hebben.');
  return pw;
}
