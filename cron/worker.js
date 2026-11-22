// Tijdschema (Cloudflare Cron Trigger, elke minuut): stuurt de meldingen 'je leger komt bijna aan'.
// Een Pages-project kan zelf geen tijdschema hebben; daarom deze aparte, kleine worker op dezelfde database.
// Wordt online gezet door scripts/deploy.sh (vraagt 'Workers Scripts: Edit' op het Cloudflare-token).
import { wrapDb } from '../functions/lib/http.js';
import { notifyDue } from '../functions/lib/push.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(notifyDue(wrapDb(env.DB), Date.now(), 8).catch((e) => console.error('notify', e && e.stack)));
  },
};
