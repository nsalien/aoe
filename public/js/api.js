// Kleine wrapper rond fetch voor de /api-routes.
export async function api(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch('/api' + path, opts);
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

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
