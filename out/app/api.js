const API = 'https://make.fun/api';
const memory = new Map();
const requests = new Map();
const TTL = 60_000;

export function get(path) {
  if (!path.startsWith('/') || path.startsWith('//')) return Promise.reject(new Error('Invalid API path.'));
  const saved = memory.get(path);
  if (saved && Date.now() < saved.expires) return Promise.resolve(saved.body);
  if (requests.has(path)) return requests.get(path);
  const task = (async () => {
    const response = await fetch(API + path, {
      method: 'GET', mode: 'cors', credentials: 'omit',
      headers: saved?.tag ? { 'If-None-Match': saved.tag } : {},
      signal: AbortSignal.timeout(25_000), redirect: 'error'
    });
    if (response.status === 304 && saved) {
      saved.expires = Date.now() + TTL;
      return saved.body;
    }
    if (!response.ok) throw new Error(response.status === 404 ? 'This bounty or maker could not be found.' : `make.fun returned ${response.status}. Please try again.`);
    const body = await response.json();
    memory.set(path, { body, tag: response.headers.get('etag'), expires: Date.now() + TTL });
    return body;
  })().finally(() => requests.delete(path));
  requests.set(path, task);
  return task;
}

export const board = cursor => get('/competitions?status=open&activity=times' + (cursor != null ? '&cursor=' + encodeURIComponent(cursor) : ''));
export const bounty = slug => get('/competitions/' + encodeURIComponent(slug));
export const leaderboard = (slug, view) => get('/competitions/' + encodeURIComponent(slug) + '/leaderboard' + (view ? '?view=' + encodeURIComponent(view) : ''));
export const profile = handle => get('/profiles/' + encodeURIComponent(handle));
