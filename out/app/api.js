const responses = new Map(), requests = new Map();
const endpoint = "https://make.fun/api";
export async function get(resource) {
  const saved = responses.get(resource);
  if (saved && Date.now() - saved.checked < 60000) return saved.payload;
  if (requests.has(resource)) return requests.get(resource);
  const task = (async () => {
    const reply = await fetch(endpoint + resource, { headers: saved?.tag ? { "If-None-Match": saved.tag } : {} });
    if (reply.status === 304 && saved) {
      saved.checked = Date.now();
      return saved.payload;
    }
    if (!reply.ok) throw Error(`make.fun returned ${reply.status}`);
    const payload = await reply.json();
    responses.set(resource, { payload, tag: reply.headers.get("ETag"), checked: Date.now() });
    return payload;
  })().finally(() => requests.delete(resource));
  requests.set(resource, task);
  return task;
}
const competitionPath = slug => `/competitions/${encodeURIComponent(slug)}`;
export const getProfile = handle => get(`/profiles/${encodeURIComponent(handle)}`);
export const getBounty = slug => get(competitionPath(slug));
export const getBounties = () => get("/competitions?status=open&activity=times");
export const getLeaderboard = (slug, view) => get(competitionPath(slug) + "/leaderboard" + (view ? `?view=${encodeURIComponent(view)}` : ""));
