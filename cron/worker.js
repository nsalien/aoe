// Tijdschema (Cloudflare Cron Trigger, elke minuut): meldingen versturen en een computerspeler aan de beurt laten
// (zie functions/lib/crontick.js). Een Pages-project kan zelf geen tijdschema hebben; daarom deze aparte, kleine worker
// op dezelfde database. Wordt online gezet door scripts/deploy.sh (vraagt 'Workers Scripts: Edit' op het Cloudflare-token).
import { wrapDb } from '../functions/lib/http.js';
import { cronTick } from '../functions/lib/crontick.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cronTick(wrapDb(env.DB), Date.now()));
  },
};
