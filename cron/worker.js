// Tijdschema (Cloudflare Cron Trigger, elke minuut): stuurt de meldingen (leger komt bijna aan, bouwer vrij).
// Een Pages-project kan zelf geen tijdschema hebben; daarom deze aparte, kleine worker op dezelfde database.
// Wordt online gezet door scripts/deploy.sh (vraagt 'Workers Scripts: Edit' op het Cloudflare-token).
import { wrapDb } from '../functions/lib/http.js';
import { notifyAll } from '../functions/lib/push.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(notifyAll(wrapDb(env.DB), Date.now(), 8).catch((e) => console.error('notify', e && e.stack)));
  },
};
