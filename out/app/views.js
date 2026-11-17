import { htmlText as safe, dollars, calendar, timeRemaining, deadlinePassed, livePot, monogram, walletLabel } from './format.js';

const routePart = encodeURIComponent;
const categoryOf = contest => contest.category || contest.categoryName || 'Other';
const closesSoon = timestamp => !deadlinePassed(timestamp) && new Date(timestamp) - Date.now() < 86_400_000;
const selectedOption = (key, caption, current) => `<option ${current === key ? 'selected' : ''} value="${key}">${caption}</option>`;
const timeNode = contest => `<span class="time ${closesSoon(contest.deadline) ? 'urgent' : ''}" data-deadline="${safe(contest.deadline)}">${timeRemaining(contest.deadline)}</span>`;
const headings = captions => '<thead><tr>' + captions.map(caption => `<th>${caption}</th>`).join('') + '</tr></thead>';

export function renderFailure(message) {
  return `<section class="error"><p class="eyebrow">CONNECTION ISSUE</p><h1>We could not load this page.</h1><p>${safe(message)}</p><a href="#/">Return to bounties</a></section>`;
}

function markdownParagraphs(rawText) {
  return safe(rawText || '').split('\n').map(line => {
    const match = line.match(/^(#{1,3})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      return `<h${level}>${match[2]}</h${level}>`;
    }
    if (/^[-*]\s+/.test(line)) return `<p class="rule-item">• ${line.substring(2)}</p>`;
    if (line === '') return '<br>';
    const inline = line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>');
    return `<p>${inline}</p>`;
  }).join('');
}

function boardEntry(contest) {
  const fee = Number(contest.entryFeeUsd || 0)
    ? `<span class="muted">${dollars(contest.entryFeeUsd)} fee</span>` : '';
  return `<li class="bounty-row">
<div class="row-main"><span class="category">${safe(categoryOf(contest))}</span><a class="row-title" href="#/bounty/${routePart(contest.slug)}">${safe(contest.title)}</a><p>${safe(contest.summary || contest.description || '')}</p></div>
<div class="row-pot"><strong>${dollars(livePot(contest))}</strong><small>live pot</small>${fee}</div>
<div class="row-deadline">${timeNode(contest)}<small>${calendar(contest.deadline)}</small></div>
<div class="row-entries"><strong>${Number(contest.submissionCount || 0)}</strong><small>entries</small></div></li>`;
}

export function renderBoard(response, choice = {}) {
  const all = response.items || [];
  const sortKey = choice.sort || 'deadline';
  const categoryNames = [...new Set(all.map(categoryOf))].sort((a, b) => a.localeCompare(b));
  const ordering = {
    title: (a, b) => String(a.title).localeCompare(String(b.title)),
    entries: (a, b) => Number(b.submissionCount || 0) - Number(a.submissionCount || 0),
    pot: (a, b) => livePot(b) - livePot(a),
    deadline: (a, b) => new Date(a.deadline) - new Date(b.deadline)
  };
  const visible = all.filter(contest => {
    const haystack = `${contest.title} ${contest.summary || ''} ${categoryOf(contest)}`.toLowerCase();
    if (choice.q && !haystack.includes(choice.q.toLowerCase())) return false;
    if (choice.category && choice.category !== 'all' && categoryOf(contest) !== choice.category) return false;
    if (choice.state === 'soon') return closesSoon(contest.deadline);
    if (choice.state === 'ended') return deadlinePassed(contest.deadline);
    return true;
  }).sort(ordering[sortKey] || ordering.deadline);
  const total = all.reduce((amount, contest) => amount + (deadlinePassed(contest.deadline) ? 0 : livePot(contest)), 0);
  const categories = categoryNames.map(name => `<option ${choice.category === name ? 'selected' : ''}>${safe(name)}</option>`).join('');
  const states = [['all', 'All'], ['soon', 'Closing soon'], ['ended', 'Ended']]
    .map(([key, caption]) => selectedOption(key, caption, choice.state || 'all')).join('');
  const sorts = [['deadline', 'Deadline'], ['pot', 'Pot'], ['entries', 'Entries'], ['title', 'Title']]
    .map(([key, caption]) => selectedOption(key, caption, sortKey)).join('');
  return `<section class="page-head"><div><p class="eyebrow">MAKE.FUN / OPEN CALLS</p><h1>Build something worth backing.</h1><p class="subhead">Live bounties, open competitions, and the people making them.</p></div><div class="total"><span>Total live pots</span><strong>${dollars(total)}</strong></div></section>
<section class="filters" aria-label="Filter bounties"><label class="search">⌕ <input id="search" type="search" value="${safe(choice.q || '')}" aria-label="Search bounties" placeholder="Search bounties"></label><label>Category <select id="category"><option value="all">All categories</option>${categories}</select></label><label>State <select id="state">${states}</select></label><label>Sort <select id="sort">${sorts}</select></label></section>
<div class="table-label"><span>${visible.length} bounties</span><span>REWARD / DEADLINE / ENTRIES</span></div><ul class="board">${visible.map(boardEntry).join('') || '<li class="empty">No bounties match these filters.</li>'}</ul>`;
}

function currentRewards(contest) {
  if (Array.isArray(contest.rewardsNow) && contest.rewardsNow.length > 0) return contest.rewardsNow;
  const base = contest.rewards;
  if (!base || typeof base !== 'object' || Array.isArray(base)) return [];
  return Object.keys(base).sort((a, b) => Number(a) - Number(b)).map(position => ({
    place: position, baseUsd: base[position], feeShareUsd: 0, amountUsd: base[position]
  }));
}

function recentSubmissions(submitted) {
  if (!submitted.length) return '<p class="muted">No submissions yet.</p>';
  const cards = submitted.map(solution => {
    const handle = solution.handle || solution.user?.handle || '';
    return `<a href="#/u/${routePart(handle)}"><span class="avatar mini">${safe(monogram(solution.handle || solution.title))}</span><span><b>${safe(solution.title || 'Submission')}</b><small>${safe(handle || 'maker')}</small></span><span class="muted">${calendar(solution.createdAt || solution.submittedAt)}</span></a>`;
  });
  return '<div class="submission-list">' + cards.join('') + '</div>';
}

export function renderBounty(contest) {
  const baseRoute = '#/bounty/' + routePart(contest.slug);
  const submitted = (contest.submissions || []).slice(0, 8);
  const closed = deadlinePassed(contest.deadline);
  const state = closed ? 'Ended' : contest.acceptingSubmissions === false ? 'Not accepting' : 'Open';
  const facts = [
    ['Status', state],
    ['Entry fee', Number(contest.entryFeeUsd || 0) ? dollars(contest.entryFeeUsd) : 'Free'],
    ['Entries', Number(contest.submissionCount || submitted.length)],
    ['Opened', calendar(contest.openedAt || contest.opensAt || contest.createdAt)],
    ['Deadline', calendar(contest.deadline)]
  ].map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('');
  const payouts = currentRewards(contest).map(reward => `<tr><td>${safe(reward.place)}</td><td>${dollars(reward.baseUsd)}</td><td>${dollars(reward.feeShareUsd)}</td><td class="green">${dollars(reward.amountUsd)}</td></tr>`).join('');
  const external = contest.url ? `<a target="_blank" href="${safe(contest.url)}" rel="noopener">make.fun ↗</a>` : '';
  return `<p class="crumb"><a href="#/">← All bounties</a><span> / ${safe(contest.category || 'Competition')}</span></p>
<section class="detail-head"><div><p class="eyebrow">OPEN BOUNTY</p><h1>${safe(contest.title)}</h1><p class="subhead">${safe(contest.summary || '')}</p></div><div class="detail-pot"><span>Current live pot</span><strong>${dollars(livePot(contest))}</strong><span class="${closed ? 'urgent' : ''}">${timeRemaining(contest.deadline)}</span></div></section>
<nav class="tabs"><a class="active" href="${baseRoute}">Overview</a><a href="${baseRoute}/leaderboard">Leaderboard</a>${external}</nav>
<div class="detail-grid"><div class="detail-copy"><h2>About this bounty</h2><div class="prose">${markdownParagraphs(contest.description)}</div><h2>Rules</h2><div class="prose rules">${markdownParagraphs(contest.rules || 'No additional rules provided.')}</div></div><aside class="detail-side"><h2>At a glance</h2><dl>${facts}</dl><h2>Rewards</h2><div class="scroll-table"><table>${headings(['Place', 'Base prize', 'Fee share', 'Now'])}<tbody>${payouts || '<tr><td colspan="4">Prize details unavailable</td></tr>'}</tbody></table></div></aside></div>
<section class="submissions"><div class="section-title"><h2>Latest submissions</h2><a href="${baseRoute}/leaderboard">Full leaderboard →</a></div>${recentSubmissions(submitted)}</section>`;
}

function resultTabs(variants, selected, baseRoute) {
  if (variants.length <= 1) return '';
  const links = variants.map(variant => {
    const caption = typeof variant === 'string' ? variant : variant.name || variant.label || variant.id;
    return `<a class="${caption === selected ? 'selected' : ''}" href="${baseRoute}/leaderboard?view=${routePart(caption)}">${safe(caption)}</a>`;
  });
  return '<nav class="view-tabs" aria-label="Leaderboard view">' + links.join('') + '</nav>';
}

export function renderResults(response, name, variant = '', rowLimit = 50) {
  const baseRoute = '#/bounty/' + routePart(name);
  const fields = (response.columns || []).filter(column => !column.hidden);
  const scores = response.entries || [];
  const phase = typeof response.phase === 'string' ? response.phase : response.phase?.title || response.phase?.key || 'Results';
  const rows = scores.slice(0, rowLimit).map(solution => {
    const cells = fields.map(column => {
      const key = column.key || column.name || column.id;
      const value = solution.display?.[key] ?? solution.display?.[column.label] ?? solution.values?.[key] ?? '';
      return `<td>${safe(value)}</td>`;
    }).join('');
    const badge = solution.prize_rank ? `<span class="prize-badge">${safe(solution.prize_rank)}</span>` : '';
    return `<tr><td><span class="rank">${safe(solution.rank)}</span>${badge}</td><td><a href="#/u/${routePart(solution.handle || '')}">@${safe(solution.handle || 'maker')}</a></td><td>${safe(solution.title || 'Untitled entry')}</td>${cells}</tr>`;
  }).join('');
  const labels = ['Rank', 'Maker', 'Entry', ...fields.map(column => safe(column.title || column.label || column.name || column.key))];
  const continuation = scores.length > rowLimit
    ? `<div class="more-wrap"><button id="show-more">Show 50 more</button><span class="muted">${Math.min(rowLimit, scores.length)} of ${scores.length} entries</span></div>`
    : `<p class="muted row-count">${scores.length} entries</p>`;
  return `<p class="crumb"><a href="${baseRoute}">← Bounty overview</a></p><section class="page-head compact"><div><p class="eyebrow">COMPETITION RESULTS</p><h1>${safe(response.competition?.title || name)} leaderboard</h1></div><span class="live-tag">${safe(phase)}</span></section>${resultTabs(response.views || [], variant, baseRoute)}<div class="scroll-table leaderboard"><table>${headings(labels)}<tbody>${rows}</tbody></table></div>${continuation}`;
}

function makerLinks(person) {
  const contacts = [
    ['GitHub', person.github_login, 'https://github.com/' + routePart(person.github_login || '')],
    ['X', person.x, 'https://x.com/' + routePart(person.x || '')],
    ['Discord', person.discord, null]
  ];
  return contacts.filter(contact => contact[1]).map(([label, value, url]) => url
    ? `<a href="${url}" rel="noopener" target="_blank">${safe(label)} ↗</a>`
    : `<span>${safe(label)}: ${safe(value)}</span>`).join('');
}

export function renderMaker(person) {
  const record = person.record || {};
  const pictureUrl = person.image || person.avatar;
  const avatar = pictureUrl
    ? `<img crossorigin="anonymous" loading="lazy" src="${safe(pictureUrl)}" alt="">`
    : safe(monogram(person.display_name || person.handle));
  const statistics = [
    [record.entered ?? record.entered_count ?? 0, 'Entered'],
    [record.placed ?? record.placed_count ?? 0, 'Placed'],
    [dollars(record.won ?? record.won_usd ?? 0), 'Won'],
    [record.best_place ?? record.bestPlacement ?? '—', 'Best place'],
    [dollars(record.prize ?? record.prize_usd ?? 0), 'Total prizes']
  ].map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  const address = person.wallet?.address;
  const wallet = address ? `<span>Wallet</span><a rel="noopener" href="${safe(person.wallet.explorer_url || 'https://solscan.io/account/' + address)}" target="_blank">${safe(walletLabel(address))} ↗</a>` : '';
  const entries = (person.solutions || []).map(solution => {
    const competition = solution.competition;
    return `<tr><td><a href="#/bounty/${routePart(competition?.slug || competition?.id || '')}">${safe(competition?.title || competition?.name || 'Competition')}</a></td><td>${safe(solution.placement ?? '—')}</td><td>${safe(solution.score?.display ?? solution.score?.value ?? '—')}</td><td class="green">${dollars(solution.prize_usd)}</td><td>${calendar(solution.entered_at)}</td></tr>`;
  }).join('');
  return `<p class="crumb"><a href="#/">← Bounties</a></p><section class="profile-head"><div class="profile-avatar">${avatar}</div><div class="profile-intro"><p class="eyebrow">MAKER PROFILE</p><h1>${safe(person.display_name || person.handle)}</h1><p class="handle">@${safe(person.handle)}</p><p>${safe(person.bio || 'No bio yet.')}</p><nav class="social-links">${makerLinks(person)}</nav></div><aside class="wallet">${wallet}<small>Joined ${calendar(person.joined_at)}</small></aside></section>
<section class="record-stats">${statistics}</section><section class="entries"><h2>Competition entries</h2><div class="scroll-table"><table>${headings(['Bounty', 'Place', 'Score', 'Prize', 'Entered'])}<tbody>${entries || '<tr><td colspan="5">No entries yet.</td></tr>'}</tbody></table></div></section>`;
}
