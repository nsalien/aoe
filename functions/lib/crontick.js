// Wat de cron-worker (cron/worker.js) elke minuut doet. Een gewoon verzoek laat dit aan hem over zolang hij draait
// (world.cron_at, zie handle() in routes.js), zodat verzoeken van spelers licht blijven (±10 ms CPU, gratis plan).
//   1. eenmalige opdrachten (relocate.js)
//   2. aangekomen legers, slagen en vazallen (processDue: hooguit 3 legers per minuut; ze stapelen zich zo niet op tot
//      iemand het spel opent)
//   3. meldingen (leger komt bijna aan, bouwer vrij)
//   4. één computerspeler aan de beurt
// Elke stap die iets deed, sluit de beurt af (CPU-limiet per beurt).
import { notifyAll } from './push.js';
import { botTick } from './bots.js';
import { getWorld, processDue } from './game.js';
import { runOneOff } from './relocate.js';

export async function cronTick(db, now) {
  const world = await getWorld(db);
  if (world) await db.prepare('UPDATE world SET cron_at = ? WHERE id = 1').bind(now).run();
  const once = await runOneOff(db, world, now).catch((e) => { console.error('eenmalig', e && e.stack); return []; });
  if (once.some((d) => d.r)) return { once }; // iets verplaatst: genoeg voor deze minuut
  const marches = world ? await processDue(db, world, now, 24, { max: 3 }).catch((e) => { console.error('legers', e && e.stack); return 0; }) : 0;
  if (marches) return { marches };
  const sent = await notifyAll(db, now, 8).catch((e) => { console.error('notify', e && e.stack); return 1; });
  // meldingen versleutelen kost CPU: een bot enkel als er deze minuut niets verstuurd werd
  if (sent) return { sent };
  const bot = await botTick(db, world, now).catch((e) => { console.error('bot', e && e.stack); return null; });
  return { sent, bot };
}
