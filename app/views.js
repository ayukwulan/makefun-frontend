import { esc, money, date, left, ended, pot, initials, short } from "./format.js";
const encode = encodeURIComponent;
const avatarLetters = label => esc(initials(label));
const category = item => item.category || item.categoryName || "Other";
const soon = stamp => !ended(stamp) && new Date(stamp) - Date.now() < 86400000;
const clock = item => `<span data-deadline="${esc(item.deadline)}" class="time ${soon(item.deadline) ? "urgent" : ""}">${left(item.deadline)}</span>`;
const option = (value, label, chosen) => `<option value="${value}" ${chosen === value ? "selected" : ""}>${label}</option>`;
function prose(source) {
  return esc(source || "").split("\n").map(part => {
    const heading = /^(#{1,3})\s+(.*)$/.exec(part);
    if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
    if (/^[-*]\s+/.test(part)) return `<p class="rule-item">• ${part.slice(2)}</p>`;
    if (!part) return "<br>";
    return `<p>${part.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/\*(.*?)\*/g, "<i>$1</i>")}</p>`;
  }).join("");
}
function listingRow(item) {
  return `<li class="bounty-row"><div class="row-main"><span class="category">${esc(category(item))}</span><a href="#/bounty/${encode(item.slug)}" class="row-title">${esc(item.title)}</a><p>${esc(item.summary || item.description || "")}</p></div><div class="row-pot"><strong>${money(pot(item))}</strong><small>live pot</small>${Number(item.entryFeeUsd || 0) ? `<span class="muted">${money(item.entryFeeUsd)} fee</span>` : ""}</div><div class="row-deadline">${clock(item)}<small>${date(item.deadline)}</small></div><div class="row-entries"><strong>${Number(item.submissionCount || 0)}</strong><small>entries</small></div></li>`;
}
export function board(payload, controls = {}) {
  const collection = payload.items || [];
  const categories = [...new Set(collection.map(category))].sort((first, second) => first.localeCompare(second));
  const ordering = controls.sort || "deadline";
  const matches = collection.filter(item => {
    if (controls.q && !`${item.title} ${item.summary || ""} ${category(item)}`.toLowerCase().includes(controls.q.toLowerCase())) return false;
    if (controls.category && controls.category !== "all" && category(item) !== controls.category) return false;
    if (controls.state === "soon") return soon(item.deadline);
    return controls.state !== "ended" || ended(item.deadline);
  });
  const comparators = {
    deadline: (first, second) => new Date(first.deadline) - new Date(second.deadline),
    pot: (first, second) => pot(second) - pot(first),
    entries: (first, second) => Number(second.submissionCount || 0) - Number(first.submissionCount || 0),
    title: (first, second) => String(first.title).localeCompare(String(second.title))
  };
  matches.sort(comparators[ordering] || comparators.deadline);
  const liveTotal = collection.reduce((sum, item) => sum + (ended(item.deadline) ? 0 : pot(item)), 0);
  return `<section class="page-head"><div><p class="eyebrow">MAKE.FUN / OPEN CALLS</p><h1>Build something worth backing.</h1><p class="subhead">Live bounties, open competitions, and the people making them.</p></div><div class="total"><span>Total live pots</span><strong>${money(liveTotal)}</strong></div></section>
<section aria-label="Filter bounties" class="filters"><label class="search">⌕ <input type="search" id="search" placeholder="Search bounties" aria-label="Search bounties" value="${esc(controls.q || "")}"></label><label>Category <select id="category"><option value="all">All categories</option>${categories.map(name => `<option ${controls.category === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label><label>State <select id="state">${[["all", "All"], ["soon", "Closing soon"], ["ended", "Ended"]].map(([value, label]) => option(value, label, controls.state || "all")).join("")}</select></label><label>Sort <select id="sort">${[["deadline", "Deadline"], ["pot", "Pot"], ["entries", "Entries"], ["title", "Title"]].map(([value, label]) => option(value, label, ordering)).join("")}</select></label></section>
<div class="table-label"><span>${matches.length} bounties</span><span>REWARD / DEADLINE / ENTRIES</span></div><ul class="board">${matches.map(listingRow).join("") || '<li class="empty">No bounties match these filters.</li>'}</ul>`;
}
function rewardRows(item) {
  if (Array.isArray(item.rewardsNow) && item.rewardsNow.length) return item.rewardsNow;
  if (!item.rewards || typeof item.rewards !== "object" || Array.isArray(item.rewards)) return [];
  return Object.entries(item.rewards).sort(([first], [second]) => Number(first) - Number(second)).map(([place, amount]) => ({ place, baseUsd: amount, feeShareUsd: 0, amountUsd: amount }));
}
export function bounty(item) {
  const recent = (item.submissions || []).slice(0, 8);
  const route = `#/bounty/${encode(item.slug)}`;
  const status = ended(item.deadline) ? "Ended" : item.acceptingSubmissions === false ? "Not accepting" : "Open";
  const facts = [["Status", status], ["Entry fee", Number(item.entryFeeUsd || 0) ? money(item.entryFeeUsd) : "Free"], ["Entries", Number(item.submissionCount || recent.length)], ["Opened", date(item.openedAt || item.opensAt || item.createdAt)], ["Deadline", date(item.deadline)]];
  return `<p class="crumb"><a href="#/">← All bounties</a><span> / ${esc(item.category || "Competition")}</span></p><section class="detail-head"><div><p class="eyebrow">OPEN BOUNTY</p><h1>${esc(item.title)}</h1><p class="subhead">${esc(item.summary || "")}</p></div><div class="detail-pot"><span>Current live pot</span><strong>${money(pot(item))}</strong><span class="${ended(item.deadline) ? "urgent" : ""}">${left(item.deadline)}</span></div></section>
<nav class="tabs"><a href="${route}" class="active">Overview</a><a href="${route}/leaderboard">Leaderboard</a>${item.url ? `<a href="${esc(item.url)}" rel="noopener" target="_blank">make.fun ↗</a>` : ""}</nav>
<div class="detail-grid"><div class="detail-copy"><h2>About this bounty</h2><div class="prose">${prose(item.description)}</div><h2>Rules</h2><div class="prose rules">${prose(item.rules || "No additional rules provided.")}</div></div><aside class="detail-side"><h2>At a glance</h2><dl>${facts.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}</dl><h2>Rewards</h2><div class="scroll-table"><table><thead><tr><th>Place</th><th>Base prize</th><th>Fee share</th><th>Now</th></tr></thead><tbody>${rewardRows(item).map(prize => `<tr><td>${esc(prize.place)}</td><td>${money(prize.baseUsd)}</td><td>${money(prize.feeShareUsd)}</td><td class="green">${money(prize.amountUsd)}</td></tr>`).join("") || '<tr><td colspan="4">Prize details unavailable</td></tr>'}</tbody></table></div></aside></div>
<section class="submissions"><div class="section-title"><h2>Latest submissions</h2><a href="${route}/leaderboard">Full leaderboard →</a></div>${recent.length ? `<div class="submission-list">${recent.map(entry => `<a href="#/u/${encode(entry.handle || entry.user?.handle || "")}"><span class="avatar mini">${avatarLetters(entry.handle || entry.title)}</span><span><b>${esc(entry.title || "Submission")}</b><small>${esc(entry.handle || entry.user?.handle || "maker")}</small></span><span class="muted">${date(entry.createdAt || entry.submittedAt)}</span></a>`).join("")}</div>` : '<p class="muted">No submissions yet.</p>'}</section>`;
}
export function leaderboard(payload, slug, activeView = "", visibleCount = 50) {
  const fields = (payload.columns || []).filter(field => !field.hidden);
  const entries = payload.entries || [];
  const variants = payload.views || [];
  const phaseLabel = typeof payload.phase === "string" ? payload.phase : payload.phase?.title || payload.phase?.key || "Results";
  const route = `#/bounty/${encode(slug)}`;
  const tabs = variants.length > 1 ? `<nav aria-label="Leaderboard view" class="view-tabs">${variants.map(variant => {
    const label = typeof variant === "string" ? variant : variant.name || variant.label || variant.id;
    return `<a href="${route}/leaderboard?view=${encode(label)}" class="${label === activeView ? "selected" : ""}">${esc(label)}</a>`;
  }).join("")}</nav>` : "";
  const tableRows = entries.slice(0, visibleCount).map(entry => {
    const metrics = fields.map(field => {
      const key = field.key || field.name || field.id;
      return `<td>${esc(entry.display?.[key] ?? entry.display?.[field.label] ?? entry.values?.[key] ?? "")}</td>`;
    }).join("");
    return `<tr><td><span class="rank">${esc(entry.rank)}</span>${entry.prize_rank ? `<span class="prize-badge">${esc(entry.prize_rank)}</span>` : ""}</td><td><a href="#/u/${encode(entry.handle || "")}">@${esc(entry.handle || "maker")}</a></td><td>${esc(entry.title || "Untitled entry")}</td>${metrics}</tr>`;
  }).join("");
  return `<p class="crumb"><a href="${route}">← Bounty overview</a></p><section class="page-head compact"><div><p class="eyebrow">COMPETITION RESULTS</p><h1>${esc(payload.competition?.title || slug)} leaderboard</h1></div><span class="live-tag">${esc(phaseLabel)}</span></section>${tabs}<div class="scroll-table leaderboard"><table><thead><tr><th>Rank</th><th>Maker</th><th>Entry</th>${fields.map(field => `<th>${esc(field.title || field.label || field.name || field.key)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div>${entries.length > visibleCount ? `<div class="more-wrap"><button id="show-more">Show 50 more</button><span class="muted">${Math.min(visibleCount, entries.length)} of ${entries.length} entries</span></div>` : `<p class="muted row-count">${entries.length} entries</p>`}`;
}
export function profile(maker) {
  const stats = maker.record || {};
  const picture = maker.image || maker.avatar;
  const links = [["GitHub", maker.github_login, `https://github.com/${encode(maker.github_login || "")}`], ["X", maker.x, `https://x.com/${encode(maker.x || "")}`], ["Discord", maker.discord, null]];
  const totals = [[stats.entered ?? stats.entered_count ?? 0, "Entered"], [stats.placed ?? stats.placed_count ?? 0, "Placed"], [money(stats.won ?? stats.won_usd ?? 0), "Won"], [stats.best_place ?? stats.bestPlacement ?? "—", "Best place"], [money(stats.prize ?? stats.prize_usd ?? 0), "Total prizes"]];
  return `<p class="crumb"><a href="#/">← Bounties</a></p><section class="profile-head"><div class="profile-avatar">${picture ? `<img crossorigin="anonymous" loading="lazy" src="${esc(picture)}" alt="">` : esc(initials(maker.display_name || maker.handle))}</div><div class="profile-intro"><p class="eyebrow">MAKER PROFILE</p><h1>${esc(maker.display_name || maker.handle)}</h1><p class="handle">@${esc(maker.handle)}</p><p>${esc(maker.bio || "No bio yet.")}</p><nav class="social-links">${links.filter(([, value]) => value).map(([label, value, url]) => url ? `<a target="_blank" rel="noopener" href="${url}">${esc(label)} ↗</a>` : `<span>${esc(label)}: ${esc(value)}</span>`).join("")}</nav></div><aside class="wallet">${maker.wallet?.address ? `<span>Wallet</span><a target="_blank" rel="noopener" href="${esc(maker.wallet.explorer_url || `https://solscan.io/account/${maker.wallet.address}`)}">${esc(short(maker.wallet.address))} ↗</a>` : ""}<small>Joined ${date(maker.joined_at)}</small></aside></section><section class="record-stats">${totals.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("")}</section><section class="entries"><h2>Competition entries</h2><div class="scroll-table"><table><thead><tr><th>Bounty</th><th>Place</th><th>Score</th><th>Prize</th><th>Entered</th></tr></thead><tbody>${(maker.solutions || []).map(entry => `<tr><td><a href="#/bounty/${encode(entry.competition?.slug || entry.competition?.id || "")}">${esc(entry.competition?.title || entry.competition?.name || "Competition")}</a></td><td>${esc(entry.placement ?? "—")}</td><td>${esc(entry.score?.display ?? entry.score?.value ?? "—")}</td><td class="green">${money(entry.prize_usd)}</td><td>${date(entry.entered_at)}</td></tr>`).join("") || '<tr><td colspan="5">No entries yet.</td></tr>'}</tbody></table></div></section>`;
}
export const errorView = detail => `<section class="error"><p class="eyebrow">CONNECTION ISSUE</p><h1>We could not load this page.</h1><p>${esc(detail)}</p><a href="#/">Return to bounties</a></section>`;
