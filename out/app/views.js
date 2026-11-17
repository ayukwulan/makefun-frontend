import {
  escapeHTML as e, numeric, number, money, livePot, entries, category,
  hasEnded, closingSoon, countdown, date, openedAt, bountyState,
  bountyURL, makerURL, publicURL, safeURL, initials, shortWallet, scoreValue
} from './format.js';

const templates = new WeakMap();
const keyOf = node => node.nodeType === 1 ? node.getAttribute('data-key') : null;
const compatible = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

// Reconcile keyed siblings and compare text/attributes. Existing rows keep their identity.
function reconcile(parent, incoming) {
  const keyed = new Map([...parent.childNodes].map(node => [keyOf(node), node]).filter(([key]) => key));
  let cursor = parent.firstChild;
  for (const desired of [...incoming.childNodes]) {
    const key = keyOf(desired);
    let current = key ? keyed.get(key) : cursor && !keyOf(cursor) && compatible(cursor, desired) ? cursor : null;
    if (!current || !compatible(current, desired)) {
      current = desired.cloneNode(true);
      parent.insertBefore(current, cursor);
    } else {
      if (current !== cursor) parent.insertBefore(current, cursor);
      if (current.nodeType === 3) {
        if (current.data !== desired.data) current.data = desired.data;
      } else if (current.nodeType === 1) {
        for (const attribute of [...current.attributes]) {
          if (current.tagName === 'DETAILS' && attribute.name === 'open') continue;
          if (!desired.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
        }
        for (const attribute of desired.attributes) {
          if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
        }
        reconcile(current, desired);
      }
    }
    cursor = current.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}

export function patchHTML(element, html) {
  if (templates.get(element) === html) return;
  const blueprint = document.createElement('template');
  blueprint.innerHTML = html;
  reconcile(element, blueprint.content);
  templates.set(element, html);
}
export function text(element, value) {
  if (element.textContent !== String(value)) element.textContent = String(value);
}
export const externalLink = (url, label, className = '') => {
  const href = safeURL(url);
  return href ? `<a class="${className}" href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label)} <span aria-hidden="true">↗</span></a>` : '';
};
export const timer = deadline => `<time class="time${closingSoon(deadline) ? ' urgent' : ''}${hasEnded(deadline) ? ' ended' : ''}" data-deadline="${e(deadline || '')}" datetime="${e(deadline || '')}" title="${e(date(deadline, true))} UTC">${e(countdown(deadline))}</time>`;
const badge = label => `<span class="badge">${e(label)}</span>`;
const rankBadge = rank => `<span class="rank rank-${numeric(rank) >= 1 && numeric(rank) <= 3 ? numeric(rank) : 'plain'}" aria-label="Place ${e(rank ?? 'unknown')}">${e(rank ?? '—')}</span>`;
const table = (headers, rows, label, className = '') => `<div class="table-scroll ${className}" tabindex="0" role="region" aria-label="${e(label)}; scroll horizontally"><table><thead><tr>${headers.map(title => `<th scope="col">${e(title)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr data-key="empty"><td class="empty-cell" colspan="${headers.length}">No entries to show yet.</td></tr>`}</tbody></table></div>`;
const control = (kind, value, label) => `<button type="button" class="chip" data-filter="${kind}" data-value="${e(value)}" data-key="${kind}-${e(value)}" aria-pressed="false">${e(label)}</button>`;

export function masthead() {
  return `<div class="header-inner"><a class="brand" href="#/" aria-label="make.fun bounty board"><span class="brand-mark" aria-hidden="true">m</span>make<span>.</span>fun</a><nav aria-label="Main"><a class="board-nav" href="#/">Bounty board <span class="nav-dot"></span></a>${externalLink('https://make.fun', 'Visit make.fun')}</nav><div class="header-status"><span class="live-dot"></span>Live data<span class="request-pill" id="request-count">0 API requests</span><button class="refresh" data-action="refresh" aria-label="Refresh board and current view" title="Refresh live data">↻</button></div></div>`;
}
export function workspace() {
  return `<section id="board" class="board" aria-labelledby="board-title"><div class="board-intro"><p class="eyebrow">A little ambition goes a long way</p><h1 id="board-title">Good ideas.<br><span>Real rewards.</span><i aria-hidden="true">✳</i></h1><p>Find a challenge worth making.</p><div class="live-pots"><div><span class="live-dot"></span><span>Total live pots</span><strong id="live-total">—</strong></div><small><b id="live-count">—</b> live bounties<span id="closing-count"></span></small></div></div><form class="board-controls" role="search"><label class="search"><span aria-hidden="true">⌕</span><input id="search" name="q" type="search" autocomplete="off" placeholder="Search your next build…" aria-label="Search bounties"><kbd>/</kbd></label><div id="categories" class="chips" role="group" aria-label="Filter by category">${control('category', 'all', 'All categories')}</div><div class="control-row"><label class="state-control"><span class="sr-only">Bounty state</span><select id="state" name="state"><option value="all">All states</option><option value="soon">Closing soon · &lt;24h</option><option value="ended">Ended</option></select></label><div class="sort-chips" role="group" aria-label="Sort bounties"><span>Sort</span>${[['deadline', 'Closing'], ['pot', 'Pot'], ['entries', 'Entries'], ['title', 'A–Z']].map(([value, label]) => control('sort', value, label)).join('')}</div></div></form><div class="list-caption"><span><b id="match-count">—</b> bounties</span><span>Pick one to explore <span aria-hidden="true">→</span></span></div><ul id="bounty-list" class="bounty-list" aria-label="Bounties"><li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li></ul><div id="board-note" class="board-note" role="status"></div><button id="board-more" class="subtle" hidden>Load more bounties</button><div class="board-footer"><span id="board-requests">0 API requests</span><span>Public bounties · UTC</span></div></section><section id="detail" class="detail" tabindex="-1" aria-label="Selected bounty, leaderboard or maker profile"><div id="pane"></div><p id="pane-note" class="pane-note" role="status"></p><footer class="pane-footer"><span>Small builds. Big possibilities.</span><a href="#/">make<span>.</span>fun</a></footer></section>`;
}

const categoryMark = name => ({ Games: '♟', Code: '⌘', Trading: '↗', Growth: '✳', Forecasting: '◷' }[name] || '◇');
function bountyCard(bounty) {
  return `<a class="bounty-card" href="${bountyURL(bounty.slug)}"><div class="card-top"><span class="category-label"><span class="category-mark" aria-hidden="true">${categoryMark(category(bounty))}</span>${e(category(bounty))}</span><span class="card-phase${hasEnded(bounty.deadline) ? ' ended' : ''}">${e(closingSoon(bounty.deadline) ? 'Closing soon' : bountyState(bounty).replace(' for entries', ''))}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h3>${e(bounty.title || bounty.slug)}</h3><div class="card-bottom"><div class="card-money"><strong>${money(livePot(bounty))}</strong><small>${numeric(bounty.entryFeeUsd) ? money(bounty.entryFeeUsd) + ' fee' : 'Free entry'}</small></div><div class="card-time">${timer(bounty.deadline)}<small>${number(entries(bounty))} entries</small></div></div></a>`;
}

export class Board {
  constructor(element) {
    this.root = element;
    this.list = element.querySelector('#bounty-list');
    this.rows = new Map();
    this.items = [];
    this.selected = '';
    this.filters = { q: '', category: 'all', state: 'all', sort: 'deadline' };
    this.empty = document.createElement('li');
    this.empty.className = 'board-empty';
    this.empty.innerHTML = '<span aria-hidden="true">⌕</span><h3>No matching bounties</h3><p>A different search might spark something.</p><button data-action="clear">Clear filters</button>';
  }
  setItems(items) {
    this.items = items;
    const categories = [...new Set(items.map(category))].sort();
    patchHTML(this.root.querySelector('#categories'), control('category', 'all', 'All') + categories.map(name => control('category', name, name)).join(''));
    const present = new Set(items.map(item => item.slug));
    for (const [slug, row] of this.rows) if (!present.has(slug)) { row.remove(); this.rows.delete(slug); }
    this.list.querySelectorAll('.skeleton').forEach(node => node.remove());
    this.list.querySelector('.board-load-error')?.remove();
    for (const item of items) {
      let row = this.rows.get(item.slug);
      if (!row) {
        row = document.createElement('li');
        row.className = 'bounty-row';
        row.dataset.slug = item.slug;
        this.rows.set(item.slug, row);
      }
      patchHTML(row, bountyCard(item));
    }
    const live = items.filter(item => !hasEnded(item.deadline));
    text(this.root.querySelector('#live-total'), money(live.reduce((sum, item) => sum + livePot(item), 0)));
    text(this.root.querySelector('#live-count'), number(live.length));
    text(this.root.querySelector('#closing-count'), ' · ' + live.filter(item => closingSoon(item.deadline)).length + ' closing soon');
    this.applyFilters();
  }
  select(slug) {
    this.selected = slug;
    for (const [key, row] of this.rows) {
      row.classList.toggle('selected', key === slug);
      const anchor = row.querySelector('a');
      if (key === slug && anchor.getAttribute('aria-current') !== 'true') anchor.setAttribute('aria-current', 'true');
      else if (key !== slug && anchor.hasAttribute('aria-current')) anchor.removeAttribute('aria-current');
    }
  }
  applyFilters() {
    const f = this.filters;
    const query = f.q.toLocaleLowerCase().trim();
    const comparators = {
      deadline: (a, b) => Number(hasEnded(a.deadline)) - Number(hasEnded(b.deadline)) || (Date.parse(a.deadline) || Infinity) - (Date.parse(b.deadline) || Infinity),
      pot: (a, b) => livePot(b) - livePot(a),
      entries: (a, b) => entries(b) - entries(a),
      title: (a, b) => String(a.title).localeCompare(String(b.title))
    };
    const sorted = [...this.items].sort(comparators[f.sort]);
    let visible = 0, cursor = this.list.firstElementChild;
    for (const item of sorted) {
      const row = this.rows.get(item.slug);
      if (row !== cursor) this.list.insertBefore(row, cursor);
      cursor = row.nextElementSibling;
      const match = (!query || `${item.title} ${item.summary || ''} ${category(item)}`.toLocaleLowerCase().includes(query))
        && (f.category === 'all' || category(item) === f.category)
        && (f.state === 'all' || (f.state === 'soon' ? closingSoon(item.deadline) : hasEnded(item.deadline)));
      if (row.hidden === match) row.hidden = !match;
      if (match) visible += 1;
    }
    if (this.empty.hidden !== (visible !== 0)) this.empty.hidden = visible !== 0;
    if (!this.empty.isConnected) this.list.append(this.empty);
    text(this.root.querySelector('#match-count'), number(visible));
    this.root.querySelectorAll('[data-filter]').forEach(button => {
      const chosen = f[button.dataset.filter] === button.dataset.value;
      if (button.getAttribute('aria-pressed') !== String(chosen)) button.setAttribute('aria-pressed', String(chosen));
    });
    this.select(this.selected);
  }
  reset() {
    Object.assign(this.filters, { q: '', category: 'all', state: 'all', sort: 'deadline' });
    this.root.querySelector('#search').value = '';
    this.root.querySelector('#state').value = 'all';
    this.applyFilters();
  }
  reveal(slug) {
    const row = this.rows.get(slug);
    if (row && !row.hidden) this.list.scrollTop = Math.max(0, row.offsetTop - this.list.offsetTop - 8);
  }
  fail() {
    if (this.items.length) return;
    this.list.querySelectorAll('.skeleton').forEach(node => node.remove());
    if (!this.list.querySelector('.board-load-error')) {
      const row = document.createElement('li');
      row.className = 'board-load-error';
      row.textContent = 'The next good idea is still out there. Retry to load the live board.';
      this.list.append(row);
    }
  }
}

function inline(source) {
  return e(source).replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const url = safeURL(href.replace(/&amp;/g, '&'));
      return url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : label;
    });
}
export function markdown(source) {
  const blocks = [];
  let paragraph = [], list = '', code = null;
  const flush = () => { if (paragraph.length) { blocks.push('<p>' + inline(paragraph.join(' ')) + '</p>'); paragraph = []; } };
  const closeList = () => { if (list) { blocks.push(`</${list}>`); list = ''; } };
  for (const line of String(source || '').split(/\r?\n/)) {
    if (line.startsWith('```')) {
      flush(); closeList();
      if (code) { blocks.push('<pre><code>' + e(code.join('\n')) + '</code></pre>'); code = null; }
      else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)/), bullet = line.match(/^\s*([-*]|\d+\.)\s+(.+)/);
    if (heading) { flush(); closeList(); blocks.push('<h3>' + inline(heading[2]) + '</h3>'); }
    else if (bullet) {
      flush(); const kind = /\d/.test(bullet[1]) ? 'ol' : 'ul';
      if (list !== kind) { closeList(); blocks.push(`<${kind}>`); list = kind; }
      blocks.push('<li>' + inline(bullet[2]) + '</li>');
    } else if (!line.trim()) { flush(); closeList(); }
    else { closeList(); paragraph.push(line.trim()); }
  }
  flush(); closeList();
  if (code) blocks.push('<pre><code>' + e(code.join('\n')) + '</code></pre>');
  return blocks.join('');
}

export function loadingPane(label = 'Opening your next possibility') {
  return `<article class="pane-loading" data-key="loading"><p class="eyebrow">${e(label)}</p><div class="skeleton title-skeleton"></div><div class="skeleton"></div><div class="loading-grid"><div class="skeleton"></div><div class="skeleton"></div></div><span class="sr-only">Loading live data from make.fun.</span></article>`;
}
export function errorPane(message) {
  return `<article class="error-pane" data-key="error"><span class="error-mark" aria-hidden="true">↯</span><p class="eyebrow">A small interruption</p><h2>This view couldn't load.</h2><p>${e(message)}</p><button class="primary" data-action="retry">Try again <span aria-hidden="true">↻</span></button><a href="#/">Explore the board →</a></article>`;
}
export function welcomePane(items) {
  const featured = items.find(item => item.slug === 'tiny-chess-01') || items.find(item => !hasEnded(item.deadline));
  return `<article class="welcome" data-key="welcome"><p class="eyebrow"><span class="live-dot"></span>Made for people who make</p><h2>Small builds.<br>Big <em>possibilities.</em><span class="orange">✳</span></h2><p class="welcome-lede">make.fun is a playground for ambitious ideas. Pick a public bounty, build something brilliant, and see how your work stacks up.</p><div class="welcome-art" aria-hidden="true"><span class="art-circle">↗</span><span class="art-card">make it.<br><b>matter.</b><i>✳</i></span><span class="art-label">A good place to start something.</span></div><div class="welcome-steps"><div><span>01</span><h3>Find your challenge</h3><p>Search the board. Compare pots, deadlines and entry fees.</p></div><div><span>02</span><h3>Get the full picture</h3><p>Open a brief here. Explore its rules, rewards and live standings.</p></div><div><span>03</span><h3>Make your move</h3><p>When you're ready to enter, follow the bounty to make.fun.</p></div></div>${featured ? `<a class="primary" href="${bountyURL(featured.slug)}">Explore a bounty <span aria-hidden="true">→</span></a>` : ''}<p class="welcome-note">Your board stays right here as you explore.</p></article>`;
}

function bountyTabs(slug, leaderboard = false) {
  return `<nav class="pane-tabs" aria-label="Bounty views"><a href="${bountyURL(slug)}" ${!leaderboard ? 'aria-current="page"' : ''}>Overview</a><a href="${bountyURL(slug, '/leaderboard')}" ${leaderboard ? 'aria-current="page"' : ''}>Leaderboard <span aria-hidden="true">↗</span></a>${externalLink(publicURL(slug, leaderboard ? '/leaderboard' : ''), 'Open on make.fun')}</nav>`;
}
function phaseStrip(bounty) {
  const phases = Array.isArray(bounty.phases) ? bounty.phases : [];
  return phases.length ? `<div class="phases" aria-label="Bounty phases">${phases.map(phase => {
    const start = phase.startsAt || phase.starts_at, end = phase.endsAt || phase.ends_at;
    const active = Date.parse(start) <= Date.now() && Date.parse(end) > Date.now();
    return `<span data-key="${e(phase.key)}" class="phase-step${active ? ' active' : ''}" title="${e(date(start, true))} – ${e(date(end, true))} UTC"><i></i>${e(phase.title || phase.key)}${active ? '<small>Now</small>' : ''}</span>`;
  }).join('<span class="phase-line" aria-hidden="true">—</span>')}</div>` : '';
}
function rewardRows(rewards, maximum) {
  return rewards.map(reward => `<tr data-key="reward-${e(reward.place)}"><td>${rankBadge(reward.place)}</td><td>${money(reward.baseUsd)}</td><td class="muted">${money(reward.feeShareUsd)}</td><td class="payout-cell"><strong>${money(reward.amountUsd)}</strong><span class="payout-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, numeric(reward.amountUsd) / maximum * 100))}%"></i></span></td></tr>`).join('');
}
function rewardCard(bounty) {
  const rewards = bounty.rewardsNow?.length ? bounty.rewardsNow : Object.entries(bounty.rewards || {}).map(([place, amount]) => ({ place, baseUsd: amount, feeShareUsd: 0, amountUsd: amount }));
  const sorted = [...rewards].sort((a, b) => numeric(a.place) - numeric(b.place));
  const maximum = Math.max(1, ...sorted.map(reward => numeric(reward.amountUsd)));
  return `<section class="paper rewards" id="rewards" data-key="rewards"><div class="section-title"><h2>Worth the work.</h2>${badge(sorted.length + ' paid places')}</div><p class="muted">Base prizes + your share of entry fees.</p>${table(['Place', 'Base', 'Fee share', 'Total now'], rewardRows(sorted.slice(0, 5), maximum), 'Current rewards', 'rewards-table')}${sorted.length > 5 ? `<details class="more-rewards" data-key="more-rewards"><summary>See all ${sorted.length} paid places <span aria-hidden="true">↓</span></summary>${table(['Place', 'Base', 'Fee share', 'Total now'], rewardRows(sorted.slice(5), maximum), 'Remaining paid places', 'rewards-table')}</details>` : ''}</section>`;
}
export function bountyPane(bounty) {
  const recent = [...(bounty.submissions || [])].sort((a, b) => Date.parse(b.createdAt || b.submittedAt || b.received_at) - Date.parse(a.createdAt || a.submittedAt || a.received_at)).slice(0, 8);
  const facts = [['Status', bountyState(bounty)], ['Entry fee', numeric(bounty.entryFeeUsd) ? money(bounty.entryFeeUsd) : 'Free to enter'], ['Entries', number(entries(bounty))], ['Opened', date(openedAt(bounty), true)], ['Deadline', date(bounty.deadline, true)]];
  return `<article class="bounty-detail" data-key="bounty-${e(bounty.slug)}"><div class="pane-crumb"><span>${e(category(bounty))} / Bounty brief</span><span class="status-badge${hasEnded(bounty.deadline) ? ' ended' : ''}"><span class="live-dot"></span>${e(bountyState(bounty))}</span></div><h2 class="pane-title">${e(bounty.title)}</h2><p class="summary">${e(bounty.summary || '')}</p>${bountyTabs(bounty.slug)}<div class="pot-banner" data-key="pot"><div><span>Current live pot</span><strong>${money(livePot(bounty))}<small>USD</small></strong></div><div>${timer(bounty.deadline)}<small>${number(entries(bounty))} entries so far</small></div><span class="pot-star" aria-hidden="true">✳</span></div>${phaseStrip(bounty)}<div class="facts-rewards"><section class="paper facts" data-key="facts"><h2>At a glance</h2><dl>${facts.map(([label, value]) => `<div data-key="${label}"><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl><small>All dates in UTC</small></section>${rewardCard(bounty)}</div><section class="paper prose" id="about" data-key="about"><p class="eyebrow">The challenge</p><h2>A small build. A serious brief.</h2>${markdown(bounty.description || bounty.summary || 'The full brief is coming soon.')}</section><section class="paper prose rules" data-key="rules"><p class="eyebrow">Before you begin</p><h2>Rules & requirements</h2>${markdown(bounty.rules || 'No additional rules have been published.')}</section><section class="paper recent" data-key="recent"><div class="section-title"><h2>Latest submissions</h2><a class="text-link" href="${bountyURL(bounty.slug, '/leaderboard')}">See standings →</a></div><ul>${recent.map(submission => {
    const handle = submission.handle || submission.hunter || submission.user?.handle;
    return `<li data-key="submission-${e(submission.id || handle + submission.createdAt)}"><span class="avatar small" aria-hidden="true">${e(initials(handle || submission.title))}</span><div><strong>${e(submission.title || 'Untitled entry')}</strong>${handle ? `<a href="${makerURL(handle)}">@${e(handle)}</a>` : '<small>Anonymous maker</small>'}</div><time>${date(submission.createdAt || submission.submittedAt || submission.received_at)}</time></li>`;
  }).join('') || '<li class="muted">No submissions yet. Every great build starts somewhere.</li>'}</ul></section></article>`;
}

export function leaderboardPane(data, slug, bounty = {}, start = 0) {
  const columns = (data.columns || []).filter(column => !column.hidden);
  const all = data.entries || [];
  const shown = all.slice(start, start + 50);
  const phase = typeof data.phase === 'string' ? data.phase : data.phase?.title || data.phase?.key || 'Live standings';
  const views = (Array.isArray(data.views) ? data.views : []).map(view => typeof view === 'string' ? { name: view, label: view } : { name: view.name || view.key || view.id, label: view.label || view.title || view.name || view.key });
  const rows = shown.map((row, index) => `<tr data-key="entry-${e(row.submission_id || row.id || (row.handle ? row.handle + ':' + row.title : start + index))}" class="${row.prize_rank ? 'paid-place' : ''}"><td>${rankBadge(row.rank)}</td><td class="maker-cell"><a href="${makerURL(row.handle || 'maker')}">@${e(row.handle || 'maker')}</a>${row.prize_rank ? `<span class="prize-badge">Prize #${e(row.prize_rank)}</span>` : ''}</td><td class="entry-cell" title="${e(row.title || '')}">${e(row.title || 'Untitled entry')}</td>${columns.map(column => `<td class="numeric" data-key="metric-${e(column.key)}">${e(scoreValue(row, column))}</td>`).join('')}</tr>`).join('');
  const viewTabs = views.length > 1 ? `<nav class="view-tabs" aria-label="Leaderboard scoring views">${views.map(view => `<a data-key="view-${e(view.name)}" href="${bountyURL(slug, '/leaderboard?view=' + encodeURIComponent(view.name))}" ${data.view === view.name ? 'aria-current="page"' : ''}>${e(view.label)}</a>`).join('')}</nav>` : '';
  const range = `${all.length ? start + 1 : 0}–${Math.min(start + 50, all.length)}`;
  const buttons = (start ? '<button data-action="previous-rows">← Previous 50</button>' : '')
    + (start + 50 < all.length ? '<button class="primary" data-action="more-rows">Show 50 more ↓</button>' : '');
  return `<article class="leaderboard-detail" data-key="leaderboard-${e(slug)}"><div class="pane-crumb"><span>${e(category(bounty))} / Leaderboard</span>${badge(money(livePot(bounty)) + ' pot')}</div><h2 class="pane-title">${e(data.competition?.title || bounty.title || slug)}</h2><p class="leaderboard-lede">Good work deserves a little recognition.</p>${bountyTabs(slug, true)}<div class="standings-heading"><div><p class="eyebrow">${e(phase)}</p><h2>Who's setting the bar<span class="orange">.</span></h2><p>${data.phase?.placements_held ? 'Practice scores. Paid places are confirmed after final grading.' : 'Ranked entries and the latest published scores.'}</p></div><span class="entry-total"><b>${number(all.length)}</b>ranked entries</span></div><div class="leaderboard-tools">${viewTabs}<div class="window-tools"><span><b>${range}</b> of ${number(all.length)}</span>${buttons}</div></div>${table(['Rank', 'Maker', 'Entry', ...columns.map(column => column.title || column.label || column.key)], rows, 'Leaderboard', 'standings')}<div class="pagination"><p>Showing <b>${range}</b> of ${number(all.length)}</p><div>${buttons}</div></div></article>`;
}

export function profilePane(profile) {
  const name = profile.display_name || profile.handle, record = profile.record || {};
  const avatar = safeURL(profile.image || (typeof profile.avatar === 'string' ? profile.avatar : profile.avatar?.url)), address = profile.wallet?.address;
  const x = typeof profile.x === 'string' ? (/^https:\/\//.test(profile.x) ? { url: profile.x } : { username: profile.x.replace(/^@/, '') }) : profile.x;
  const discord = typeof profile.discord === 'string' ? { username: profile.discord, user_id: profile.discord } : profile.discord;
  const stats = [
    [number(record.competitions_entered ?? record.entered ?? record.entered_count), 'Entered'],
    [number(record.competitions_placed ?? record.placed ?? record.placed_count), 'Placed'],
    [number(record.competitions_won ?? record.won), 'Won'],
    [record.best_placement ?? record.best_place ?? '—', 'Best place'],
    [money(record.prize_usd ?? record.prize), 'Prizes won']
  ];
  const rows = (profile.solutions || []).map((solution, index) => `<tr data-key="solution-${e(solution.submission_id || index)}"><td class="solution-cell"><a href="${bountyURL(solution.competition?.slug || solution.competition?.id || '')}">${e(solution.competition?.title || 'Bounty')}</a><small>${e(solution.title || '')}</small></td><td>${solution.placement ? rankBadge(solution.placement) : '—'}</td><td>${e(solution.score?.display ?? solution.score?.value ?? '—')}<small>${e(solution.score?.column?.title || '')}</small></td><td class="green">${money(solution.prize_usd)}</td><td>${date(solution.entered_at)}</td></tr>`).join('');
  const socials = [
    profile.github_login ? externalLink('https://github.com/' + encodeURIComponent(profile.github_login), 'GitHub', 'social') : '',
    x ? externalLink(x.url || 'https://x.com/' + encodeURIComponent(x.username || x.user_id || ''), 'X', 'social') : '',
    discord ? externalLink(discord.url || (/^https:\/\//.test(discord.username || '') ? discord.username : 'https://discord.com/users/' + encodeURIComponent(discord.user_id || '')), 'Discord · ' + (discord.global_name || discord.username || 'Profile'), 'social') : ''
  ].join('');
  return `<article class="profile-detail" data-key="profile-${e(profile.handle)}"><div class="pane-crumb"><span>The people behind the builds / Maker profile</span><a href="#/">Browse bounties →</a></div><section class="profile-hero"><span class="avatar large">${e(initials(name))}${avatar ? `<img crossorigin="anonymous" loading="lazy" src="${e(avatar)}" width="88" height="88" alt="${e(name)}">` : ''}</span><div><p class="eyebrow">Meet the maker</p><h2 class="pane-title">${e(name)}</h2><p class="handle">@${e(profile.handle)}</p></div></section><p class="profile-bio">${e(profile.bio || 'This maker is letting their work do the talking.')}</p><div class="socials">${socials}</div><div class="wallet-card"><div><span class="eyebrow">Solana wallet</span>${address ? externalLink(profile.wallet.explorer_url || 'https://solscan.io/account/' + encodeURIComponent(address), shortWallet(address), 'text-link') : '<p>No public wallet</p>'}</div><span>Joined ${date(profile.joined_at)}</span></div><section class="record" aria-label="Maker's competition record">${stats.map(([value, label]) => `<div data-key="stat-${label}"><strong>${e(value)}</strong><span>${label}</span></div>`).join('')}</section><div class="section-title"><h2>The work so far<span class="orange">.</span></h2><span class="muted">${number(profile.solutions?.length)} entries</span></div>${table(['Bounty', 'Place', 'Score', 'Prize', 'Entered'], rows, 'Maker competition entries', 'profile-entries')}</article>`;
}
