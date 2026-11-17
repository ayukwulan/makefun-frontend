const origin = 'https://make.fun/api';
const lifetime = 60_000;
const savedResponses = new Map();
const activeRequests = new Map();
const observers = new Set();
const activity = { total: 0, board: 0 };

export function observeRequests(callback) {
  observers.add(callback);
  callback({ ...activity });
  return () => observers.delete(callback);
}

export function read(path, { refresh = false } = {}) {
  if (typeof path !== 'string' || !/^\/(competitions|profiles)(\/|\?|$)/.test(path)
    || !new URL(origin + path).pathname.startsWith('/api/')) {
    return Promise.reject(new Error('Unknown public API resource.'));
  }
  if (activeRequests.has(path)) return activeRequests.get(path);
  const previous = savedResponses.get(path);
  if (!refresh && previous?.until > Date.now()) return Promise.resolve(previous.data);

  const operation = (async () => {
    const headers = new Headers({ Accept: 'application/json' });
    if (previous?.etag) headers.set('If-None-Match', previous.etag);
    const request = (conditionalHeaders, cache = 'default') => {
      activity.total += 1;
      if (path.startsWith('/competitions?')) activity.board += 1;
      for (const notify of observers) notify({ ...activity });
      return fetch(origin + path, {
        method: 'GET', credentials: 'omit', mode: 'cors', redirect: 'error', cache,
        headers: conditionalHeaders, signal: AbortSignal.timeout(25_000)
      });
    };
    const failure = error => new Error(error.name === 'TimeoutError'
      ? 'make.fun took too long to answer. Try again in a moment.'
      : 'Cannot reach make.fun. Check your connection and try again.');
    let response;
    try {
      response = await request(headers);
    } catch (error) {
      if (!previous?.etag || error.name !== 'TypeError') throw failure(error);
      // A conditional response can lose its CORS headers at an edge cache.
      // Retry the same public GET with browser cache bypassed, keeping in-flight dedup.
      const regularHeaders = new Headers({ Accept: 'application/json' });
      try { response = await request(regularHeaders, 'reload'); }
      catch (retryError) { throw failure(retryError); }
    }
    if (response.status === 304 && previous) {
      previous.until = Date.now() + lifetime;
      return previous.data;
    }
    if (!response.ok) throw new Error(response.status === 404
      ? 'This bounty or maker could not be found.'
      : `make.fun answered with ${response.status}. Please try again.`);
    const etag = response.headers.get('ETag');
    if (previous && etag && previous.etag === etag) {
      previous.until = Date.now() + lifetime;
      return previous.data;
    }
    const data = await response.json();
    savedResponses.set(path, {
      data, etag, until: Date.now() + lifetime
    });
    return data;
  })();
  const tracked = operation.finally(() => activeRequests.delete(path));
  activeRequests.set(path, tracked);
  return tracked;
}

export const fetchBoard = (cursor, options) => read(
  '/competitions?status=open&activity=times' + (cursor != null ? '&cursor=' + encodeURIComponent(cursor) : ''), options
);
export const fetchBounty = (slug, options) => read('/competitions/' + encodeURIComponent(slug), options);
export const fetchStandings = (slug, view, options) => read(
  '/competitions/' + encodeURIComponent(slug) + '/leaderboard' + (view ? '?view=' + encodeURIComponent(view) : ''), options
);
export const fetchMaker = (handle, options) => read('/profiles/' + encodeURIComponent(handle), options);
