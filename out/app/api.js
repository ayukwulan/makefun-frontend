const origin = 'https://make.fun/api';
const bodies = new Map();
const pending = new Map();
const freshFor = 60_000;

export function requestJson(path) {
  const cached = bodies.get(path);
  if (cached && Date.now() - cached.timestamp < freshFor) {
    return Promise.resolve(cached.data);
  }
  const existing = pending.get(path);
  if (existing) return existing;

  const operation = (async () => {
    const response = await fetch(origin + path, {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : {}
    });
    if (response.status === 304 && cached) {
      cached.timestamp = Date.now();
      return cached.data;
    }
    if (!response.ok) throw new Error(`make.fun returned ${response.status}`);
    const data = await response.json();
    bodies.set(path, {
      data,
      timestamp: Date.now(),
      etag: response.headers.get('ETag')
    });
    return data;
  })().finally(() => pending.delete(path));
  pending.set(path, operation);
  return operation;
}

const competitionUrl = name => '/competitions/' + encodeURIComponent(name);
export const loadBoard = () => requestJson('/competitions?status=open&activity=times');
export const loadCompetition = name => requestJson(competitionUrl(name));
export const loadMaker = name => requestJson('/profiles/' + encodeURIComponent(name));
export function loadResults(name, variant) {
  const query = variant ? '?view=' + encodeURIComponent(variant) : '';
  return requestJson(competitionUrl(name) + '/leaderboard' + query);
}
