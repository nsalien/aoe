// Kleine wrapper rond fetch voor de /api-routes.
// Geeft Cloudflare een foutpagina in plaats van een antwoord van het spel (bv. de server was even overbelast: te veel
// rekentijd of te veel verzoeken op het gratis plan), dan proberen GET-verzoeken en het aanmelden het vanzelf opnieuw.
const BUSY = 'De server is even overbelast. Probeer het over enkele seconden opnieuw.';
const RETRY_MS = [600, 1800];

async function handle(rp) {
  let r;
  try {
    r = await rp;
  } catch {
    const e = new Error('Geen verbinding met de server.');
    e.status = 0; e.retry = true;
    throw e;
  }
  let j = null;
  try { j = await r.json(); } catch { /* geen JSON: een foutpagina van Cloudflare */ }
  if (!j || typeof j !== 'object') {
    const e = new Error(BUSY);
    e.status = r.status || 503; e.retry = true;
    throw e;
  }
  if (!r.ok) {
    const e = new Error(j.error || `Fout ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

export async function api(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  // enkel wat veilig twee keer kan: lezen en aanmelden (een bouwopdracht nooit dubbel)
  const safe = method === 'GET' || path === '/login';
  for (let k = 0; ; k++) {
    try {
      return await handle(fetch('/api' + path, opts));
    } catch (e) {
      if (!safe || !e.retry || k >= RETRY_MS.length) throw e;
      await wait(RETRY_MS[k]);
    }
  }
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);

// index.html start /info en /state al terwijl de scripts nog binnenkomen (window.__boot); die antwoorden één keer
// gebruiken (lukte dat niet, dan gewoon opnieuw vragen)
export async function early(name, path) {
  const b = typeof window !== 'undefined' && window.__boot;
  const p = b && b[name];
  if (p) {
    b[name] = null;
    try { return await handle(p); } catch (e) { if (!e.retry) throw e; }
  }
  return get(path);
}
