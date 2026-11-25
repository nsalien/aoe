// Wat de cron-worker (cron/worker.js) elke minuut doet: meldingen versturen (leger komt bijna aan, bouwer vrij) en een
// computerspeler aan de beurt laten, ook als niemand het spel open heeft (zo vertrekken de golven van een clanaanval op tijd).
import { notifyAll } from './push.js';
import { botTick } from './bots.js';
import { getWorld } from './game.js';
import { runOneOff } from './relocate.js';

export async function cronTick(db, now) {
  // eenmalige opdrachten (bv. een clan verplaatsen): die minuut niets anders (CPU-limiet)
  const once = await runOneOff(db, await getWorld(db), now).catch((e) => { console.error('eenmalig', e && e.stack); return []; });
  if (once.length) return { once };
  const sent = await notifyAll(db, now, 8).catch((e) => { console.error('notify', e && e.stack); return 1; });
  // meldingen versleutelen kost CPU (limiet ±10 ms): een bot enkel als er deze minuut niets verstuurd werd
  if (sent) return { sent };
  const world = await getWorld(db);
  const bot = await botTick(db, world, now).catch((e) => { console.error('bot', e && e.stack); return null; });
  return { sent, bot };
}
