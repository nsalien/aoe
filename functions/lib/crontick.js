// Wat de cron-worker (cron/worker.js) elke minuut doet: meldingen versturen (leger komt bijna aan, bouwer vrij) en een
// computerspeler aan de beurt laten, ook als niemand het spel open heeft (zo vertrekken de golven van een clanaanval op tijd).
import { notifyAll } from './push.js';
import { botTick } from './bots.js';
import { getWorld } from './game.js';

export async function cronTick(db, now) {
  const sent = await notifyAll(db, now, 8).catch((e) => { console.error('notify', e && e.stack); return 1; });
  // meldingen versleutelen kost CPU (limiet ±10 ms): een bot enkel als er deze minuut niets verstuurd werd
  if (sent) return { sent };
  const world = await getWorld(db);
  const bot = await botTick(db, world, now).catch((e) => { console.error('bot', e && e.stack); return null; });
  return { sent, bot };
}
