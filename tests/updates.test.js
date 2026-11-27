// Nieuws: elk artikel in public/js/updates.js is volledig en staat in de juiste volgorde.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UPDATES, unreadUpdates, updatesHtml, latestUpdate } from '../public/js/updates.js';
import { ICON_NAMES } from '../public/js/icons.js';

test('nieuws: elk artikel is volledig, het nieuwste staat bovenaan', () => {
  assert.ok(UPDATES.length >= 1);
  const ids = UPDATES.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, 'unieke nummers');
  for (let i = 1; i < UPDATES.length; i++) {
    assert.ok(UPDATES[i - 1].id > UPDATES[i].id, 'nummers aflopend (nieuwste eerst)');
    assert.ok(Date.parse(UPDATES[i - 1].at) >= Date.parse(UPDATES[i].at), 'datums aflopend');
  }
  for (const u of UPDATES) {
    assert.ok(Number.isInteger(u.id) && u.id > 0, `id van ${u.title}`);
    assert.ok(Number.isFinite(Date.parse(u.at)), `datum van ${u.id}`);
    for (const k of ['title', 'intro', 'tag']) assert.ok(typeof u[k] === 'string' && u[k].trim(), `${k} van ${u.id}`);
    assert.ok(Array.isArray(u.body) && u.body.length, `inhoud van ${u.id}`);
    for (const ic of [u.icon, ...u.body.map((b) => b.icon)].filter(Boolean)) assert.ok(ICON_NAMES.includes(ic), `icoon ${ic} bestaat`);
    for (const b of u.body) assert.ok(b.p || b.ul, `blok zonder tekst in ${u.id}`);
  }
  assert.equal(latestUpdate(), UPDATES[0]);
});

test('nieuws: gelezen en nieuw, en artikels van voor je start zijn geen nieuws', () => {
  const top = UPDATES[0];
  assert.equal(unreadUpdates(0, 0).length, UPDATES.length);
  assert.equal(unreadUpdates(top.id, 0).length, 0, 'alles gelezen');
  assert.equal(unreadUpdates(0, Date.parse(top.at) + 1).length, 0, 'later begonnen');
  const html = updatesHtml({ seen: 0 });
  assert.ok(html.includes(top.title));
  assert.ok(html.includes('upd-new'), 'ongelezen staat als nieuw');
  assert.ok(!updatesHtml().includes('upd-new'), 'zonder lezer (losse pagina) niets als nieuw');
});

test('nieuws: knop in het spel, link op het aanmeldscherm en een losse pagina', () => {
  const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(index, /data-action="news"/);
  assert.match(index, /href="\/updates"/);
  const page = readFileSync(new URL('../public/updates.html', import.meta.url), 'utf8');
  assert.match(page, /from '\/js\/updates\.js'/);
});
