// Een clan naar een andere plek op de wereldkaart verplaatsen (beheer, of eenmalig via de cron-worker: ONE_OFF).
// De nieuwe plek is willekeurig, maar op bebouwbaar land en zo ver mogelijk van alle andere steden; de clanleden
// komen naast elkaar te staan, zoals bij de start. Legers die onderweg zijn, volgen de nieuwe plek (enkel de lijn
// op de kaart: aankomsttijden blijven gelijk). Het eigen gebied rond een stad hangt aan het stadsnummer en blijft.
import { generateTerrain, findSpot, isBuildable } from '../../public/shared/worldgen.js';

// team = id of naam van de clan
export async function relocateTeam(db, world, team, now, rnd = Math.random) {
  const t = await db.prepare(typeof team === 'number' ? 'SELECT id, name FROM teams WHERE id = ?' : 'SELECT id, name FROM teams WHERE name = ?').bind(team).first();
  if (!t || !world) return null;
  const towns = (await db.prepare('SELECT t.id, t.x, t.y, t.name, p.id AS pid, p.team_id FROM towns t JOIN players p ON p.id = t.player_id ORDER BY t.id').all()).results;
  const mine = towns.filter((x) => x.team_id === t.id);
  if (!mine.length) return null;
  const others = towns.filter((x) => x.team_id !== t.id);
  const camps = (await db.prepare('SELECT x, y FROM camps').all()).results;
  const terrain = generateTerrain(world.seed, world.size);
  const S = world.size;
  // kandidaten: bebouwbaar land, niet aan de rand, niet op een kamp; hoe ver ligt de dichtste andere stad?
  const cands = [];
  for (let y = 4; y < S - 4; y++) {
    for (let x = 4; x < S - 4; x++) {
      if (!isBuildable(terrain.tiles[y * S + x])) continue;
      if (camps.some((c) => Math.hypot(c.x - x, c.y - y) < 3)) continue;
      const d = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - x, o.y - y))) : S;
      cands.push({ x, y, d });
    }
  }
  if (!cands.length) return null;
  const far = Math.max(...cands.map((c) => c.d));
  const pool = cands.filter((c) => c.d >= far * 0.8);
  const pick = pool[Math.floor(rnd() * pool.length) % pool.length];
  // de clanleden naast elkaar (minstens 4 tegels uit elkaar, zoals bij de start)
  const taken = [...others.map((o) => ({ x: o.x, y: o.y })), ...camps];
  const moved = [];
  for (const town of mine) {
    const spot = moved.length ? findSpot(terrain, pick.x, pick.y, taken, 4) : { x: pick.x, y: pick.y };
    if (!spot) continue;
    taken.push(spot);
    moved.push({ id: town.id, pid: town.pid, name: town.name, from: { x: town.x, y: town.y }, to: spot });
  }
  const st = [];
  for (const m of moved) {
    st.push(db.prepare('UPDATE towns SET x = ?, y = ? WHERE id = ?').bind(m.to.x, m.to.y, m.id));
    st.push(db.prepare('UPDATE marches SET from_x = ?, from_y = ? WHERE from_town = ?').bind(m.to.x, m.to.y, m.id));
    st.push(db.prepare("UPDATE marches SET to_x = ?, to_y = ? WHERE target_kind = 'town' AND target_id = ?").bind(m.to.x, m.to.y, m.id));
    const text = `Je clan ${t.name} kreeg een nieuwe plek op de wereldkaart: ${m.name} ligt nu op (${m.to.x}, ${m.to.y}), verder van de andere steden. Je stad zelf blijft zoals ze was.`;
    st.push(db.prepare('INSERT INTO reports (player_id, created_at, kind, title, data) VALUES (?, ?, ?, ?, ?)')
      .bind(m.pid, now, 'info', 'Je stad kreeg een nieuwe plek', JSON.stringify({ type: 'info', text })));
  }
  if (st.length) await db.batch(st);
  return { team: t.name, moved, dist: Math.round(pick.d * 10) / 10 };
}

// Eenmalige opdrachten (elk één keer, bijgehouden in config 'once:<key>'), uitgevoerd door de cron-worker.
// 25/11: de gebruiker vroeg de 2 spelers van de Rozenwacht weg te zetten (5 spelers zaten te dicht bij elkaar).
// until = daarna niet meer uitvoeren (een volgend seizoen kan ook een Rozenwacht hebben).
export const ONE_OFF = [{ key: 'move-rozenwacht-1', team: 'Rozenwacht', until: Date.UTC(2026, 10, 27) }];

// Geeft terug wat er gedaan werd (leeg = niets te doen). Wordt de opdracht onderbroken (bv. CPU-limiet), dan probeert
// een volgende tik het na 5 minuten opnieuw ('busy:<tijd>').
export async function runOneOff(db, world, now, jobs = ONE_OFF) {
  const done = [];
  for (const job of jobs) {
    if (job.until && now > job.until) continue;
    const k = `once:${job.key}`;
    const row = await db.prepare('SELECT v FROM config WHERE k = ?').bind(k).first();
    if (row && !String(row.v).startsWith('busy:')) continue; // al gedaan
    if (row && now - Number(String(row.v).slice(5)) < 5 * 60000) continue; // een andere tik is ermee bezig
    // eerst claimen (nooit dubbel, ook niet als twee tikken tegelijk lopen)
    const claim = row
      ? await db.prepare('UPDATE config SET v = ? WHERE k = ? AND v = ?').bind(`busy:${now}`, k, row.v).run()
      : await db.prepare('INSERT OR IGNORE INTO config (k, v) VALUES (?, ?)').bind(k, `busy:${now}`).run();
    if (!claim.meta.changes) continue;
    const r = await relocateTeam(db, world, job.team, now);
    await db.prepare('UPDATE config SET v = ? WHERE k = ?').bind(JSON.stringify(r || { skipped: true, at: now }), k).run();
    console.log('eenmalig', job.key, JSON.stringify(r));
    done.push({ job: job.key, r });
  }
  return done;
}
