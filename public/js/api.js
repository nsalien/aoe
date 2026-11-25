// Kleine wrapper rond fetch voor de /api-routes.
async function handle(rp) {
  let r;
  try {
    r = await rp;
  } catch {
    const e = new Error('Geen verbinding met de server.');
    e.status = 0;
    throw e;
  }
  let j;
  try { j = await r.json(); } catch { j = { error: 'Ongeldig antwoord van de server.' }; }
  if (!r.ok) {
    const e = new Error(j.error || `Fout ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

export function api(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return handle(fetch('/api' + path, opts));
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);

// index.html start /info en /state al terwijl de scripts nog binnenkomen (window.__boot); die antwoorden één keer
// gebruiken, daarna gewoon opnieuw vragen
export function early(name, path) {
  const b = typeof window !== 'undefined' && window.__boot;
  const p = b && b[name];
  if (p) { b[name] = null; return handle(p); }
  return get(path);
}
