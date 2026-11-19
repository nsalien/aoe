// Alle /api/*-verzoeken komen hier binnen (Cloudflare Pages Functions).
import { handle } from '../lib/routes.js';

export const onRequest = (context) => handle(context);
