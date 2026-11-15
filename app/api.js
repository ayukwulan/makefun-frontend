const ROOT = 'https://make.fun/api';
const TTL = 60_000;
const cache = new Map();
const inflight = new Map();

export async function get(path) {
  const now = Date.now();
  const old = cache.get(path);
  if (old && now - old.at < TTL) return old.body;
  if (inflight.has(path)) return inflight.get(path);
  const request = (async () => {
    const headers = old?.etag ? { 'If-None-Match': old.etag } : {};
    const response = await fetch(ROOT + path, { headers });
    if (response.status === 304 && old) {
      old.at = Date.now();
      return old.body;
    }
    if (!response.ok) throw new Error(`make.fun returned ${response.status}`);
    const body = await response.json();
    cache.set(path, { body, etag: response.headers.get('ETag'), at: Date.now() });
    return body;
  })().finally(() => inflight.delete(path));
  inflight.set(path, request);
  return request;
}

export const getBounties = () => get('/competitions?status=open&activity=times');
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);
export const getLeaderboard = (slug, view) => get(`/competitions/${encodeURIComponent(slug)}/leaderboard${view ? `?view=${encodeURIComponent(view)}` : ''}`);
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);
