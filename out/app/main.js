import { getProfile, getLeaderboard, getBounty, getBounties } from "./api.js";
import { left, ended } from "./format.js";
import { profile, leaderboard, bounty, board, errorView } from "./views.js";
const surface = document.querySelector("#app");
let listings;
let selection = { q: "", category: "all", state: "all", sort: "deadline" };
window.__shotReady = false;
function attachFilters() {
  const refresh = () => {
    selection = Object.fromEntries([ ["q", "search"], ["category", "category"], ["state", "state"], ["sort", "sort"] ].map(([key, id]) => [key, document.getElementById(id).value]));
    surface.innerHTML = board(listings, selection);
    attachFilters();
  };
  ["category", "state", "sort"].forEach(id => document.getElementById(id).addEventListener("change", refresh));
  document.getElementById("search").addEventListener("input", refresh);
}
async function showRoute() {
  window.__shotReady = false;
  surface.setAttribute("aria-busy", "true");
  surface.innerHTML = '<p class="loading">Loading make.fun…</p>';
  try {
    const [path, search = ""] = (location.hash.slice(1) || "/").split("?");
    const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
    const view = new URLSearchParams(search).get("view") || "";
    const [kind, identifier, page] = segments;
    if (!segments.length) {
      listings ||= await getBounties();
      document.title = "Open bounties | make.fun";
      surface.innerHTML = board(listings, selection);
      attachFilters();
    } else if (kind === "bounty" && identifier && page === "leaderboard") {
      const [results, details] = await Promise.all([getLeaderboard(identifier, view), getBounty(identifier)]);
      document.title = `Leaderboard | ${details.title || identifier} | make.fun`;
      const combined = { ...results, competition: results.competition || details };
      let count = 50;
      const draw = () => {
        surface.innerHTML = leaderboard(combined, identifier, view, count);
        document.getElementById("show-more")?.addEventListener("click", () => { count += 50; draw(); });
      };
      draw();
    } else if (kind === "bounty" && identifier) {
      const details = await getBounty(identifier);
      document.title = `${details.title} | make.fun`;
      surface.innerHTML = bounty(details);
    } else if (kind === "u" && identifier) {
      const maker = await getProfile(identifier);
      document.title = `${maker.display_name || maker.handle} | make.fun`;
      surface.innerHTML = profile(maker);
    } else surface.innerHTML = errorView("This route is not available.");
    window.scrollTo(0, 0);
  } catch (failure) {
    surface.innerHTML = errorView(failure.message || "Please try again.");
  }
  surface.setAttribute("aria-busy", "false");
  window.__shotReady = true;
}
window.addEventListener("hashchange", showRoute);
showRoute();
setInterval(() => {
  for (const element of document.querySelectorAll("[data-deadline]")) {
    const stamp = element.dataset.deadline;
    element.textContent = left(stamp);
    element.classList.toggle("urgent", !ended(stamp) && new Date(stamp) - Date.now() < 86400000);
  }
}, 30000);
