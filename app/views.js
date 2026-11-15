import { date, ended, esc, initials, left, money, pot, short } from './format.js';

const fee = b => Number(b.entryFeeUsd || 0) ? `<span class="muted">${money(b.entryFeeUsd)} fee</span>` : '';
const titleLink = b => `<a class="row-title" href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a>`;
const deadline = b => `<span class="time ${!ended(b.deadline) && new Date(b.deadline) - Date.now() < 86400000 ? 'urgent' : ''}" data-deadline="${esc(b.deadline)}">${left(b.deadline)}</span>`;
const categoryOf = b => b.category || b.categoryName || 'Other';

export function board(data, filters = {}) {
  const all = data.items || [];
  const cats = [...new Set(all.map(categoryOf))].sort((a,b) => a.localeCompare(b));
  let items = all.filter(b => !filters.q || `${b.title} ${b.summary || ''} ${categoryOf(b)}`.toLowerCase().includes(filters.q.toLowerCase()));
  if (filters.category && filters.category !== 'all') items = items.filter(b => categoryOf(b) === filters.category);
  if (filters.state === 'soon') items = items.filter(b => !ended(b.deadline) && new Date(b.deadline) - Date.now() < 86400000);
  if (filters.state === 'ended') items = items.filter(b => ended(b.deadline));
  const sort = filters.sort || 'deadline';
  items.sort((a,b) => sort === 'pot' ? pot(b)-pot(a) : sort === 'entries' ? Number(b.submissionCount||0)-Number(a.submissionCount||0) : sort === 'title' ? String(a.title).localeCompare(String(b.title)) : new Date(a.deadline)-new Date(b.deadline));
  const total = all.filter(b => !ended(b.deadline)).reduce((n,b) => n + pot(b), 0);
  return `<section class="page-head"><div><p class="eyebrow">MAKE.FUN / OPEN CALLS</p><h1>Build something worth backing.</h1><p class="subhead">Live bounties, open competitions, and the people making them.</p></div><div class="total"><span>Total live pots</span><strong>${money(total)}</strong></div></section>
  <section class="filters" aria-label="Filter bounties"><label class="search">⌕ <input id="search" type="search" placeholder="Search bounties" value="${esc(filters.q || '')}" aria-label="Search bounties"></label><label>Category <select id="category"><option value="all">All categories</option>${cats.map(c=>`<option ${filters.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>State <select id="state"><option value="all" ${!filters.state||filters.state==='all'?'selected':''}>All</option><option value="soon" ${filters.state==='soon'?'selected':''}>Closing soon</option><option value="ended" ${filters.state==='ended'?'selected':''}>Ended</option></select></label><label>Sort <select id="sort"><option value="deadline" ${sort==='deadline'?'selected':''}>Deadline</option><option value="pot" ${sort==='pot'?'selected':''}>Pot</option><option value="entries" ${sort==='entries'?'selected':''}>Entries</option><option value="title" ${sort==='title'?'selected':''}>Title</option></select></label></section>
  <div class="table-label"><span>${items.length} bounties</span><span>REWARD / DEADLINE / ENTRIES</span></div><ul class="board">${items.map(b=>`<li class="bounty-row"><div class="row-main"><span class="category">${esc(categoryOf(b))}</span>${titleLink(b)}<p>${esc(b.summary || b.description || '')}</p></div><div class="row-pot"><strong>${money(pot(b))}</strong><small>live pot</small>${fee(b)}</div><div class="row-deadline">${deadline(b)}<small>${date(b.deadline)}</small></div><div class="row-entries"><strong>${Number(b.submissionCount || 0)}</strong><small>entries</small></div></li>`).join('') || '<li class="empty">No bounties match these filters.</li>'}</ul>`;
}

function markdown(text) {
  return esc(text || '').split('\n').map(line => {
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) return `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
    if (/^[-*]\s+/.test(line)) return `<p class="rule-item">• ${line.slice(2)}</p>`;
    return line ? `<p>${line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>')}</p>` : '<br>';
  }).join('');
}

export function bounty(b) {
  const rewards = Array.isArray(b.rewardsNow) && b.rewardsNow.length
    ? b.rewardsNow.map(r => ({ place: r.place, baseUsd: r.baseUsd, feeShareUsd: r.feeShareUsd, amountUsd: r.amountUsd }))
    : b.rewards && typeof b.rewards === 'object' && !Array.isArray(b.rewards)
      ? Object.entries(b.rewards).sort(([a], [c]) => Number(a) - Number(c)).map(([place, amount]) => ({ place, baseUsd: amount, feeShareUsd: 0, amountUsd: amount }))
      : [];
  const submissions = (b.submissions || []).slice(0, 8);
  return `<p class="crumb"><a href="#/">← All bounties</a><span> / ${esc(b.category || 'Competition')}</span></p><section class="detail-head"><div><p class="eyebrow">OPEN BOUNTY</p><h1>${esc(b.title)}</h1><p class="subhead">${esc(b.summary || '')}</p></div><div class="detail-pot"><span>Current live pot</span><strong>${money(pot(b))}</strong><span class="${ended(b.deadline)?'urgent':''}">${left(b.deadline)}</span></div></section>
  <nav class="tabs"><a class="active" href="#/bounty/${encodeURIComponent(b.slug)}">Overview</a><a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard</a>${b.url ? `<a target="_blank" rel="noopener" href="${esc(b.url)}">make.fun ↗</a>` : ''}</nav>
  <div class="detail-grid"><div class="detail-copy"><h2>About this bounty</h2><div class="prose">${markdown(b.description || '')}</div><h2>Rules</h2><div class="prose rules">${markdown(b.rules || 'No additional rules provided.')}</div></div><aside class="detail-side"><h2>At a glance</h2><dl><dt>Status</dt><dd>${ended(b.deadline)?'Ended':b.acceptingSubmissions===false?'Not accepting':'Open'}</dd><dt>Entry fee</dt><dd>${Number(b.entryFeeUsd||0) ? money(b.entryFeeUsd) : 'Free'}</dd><dt>Entries</dt><dd>${Number(b.submissionCount || submissions.length)}</dd><dt>Opened</dt><dd>${date(b.openedAt || b.opensAt || b.createdAt)}</dd><dt>Deadline</dt><dd>${date(b.deadline)}</dd></dl><h2>Rewards</h2><div class="scroll-table"><table><thead><tr><th>Place</th><th>Base prize</th><th>Fee share</th><th>Now</th></tr></thead><tbody>${rewards.map(r=>`<tr><td>${esc(r.place)}</td><td>${money(r.baseUsd)}</td><td>${money(r.feeShareUsd)}</td><td class="green">${money(r.amountUsd)}</td></tr>`).join('') || '<tr><td colspan="4">Prize details unavailable</td></tr>'}</tbody></table></div></aside></div>
  <section class="submissions"><div class="section-title"><h2>Latest submissions</h2><a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Full leaderboard →</a></div>${submissions.length ? `<div class="submission-list">${submissions.map(s=>`<a href="#/u/${encodeURIComponent(s.handle || s.user?.handle || '')}"><span class="avatar mini">${initials(s.handle || s.title)}</span><span><b>${esc(s.title || 'Submission')}</b><small>${esc(s.handle || s.user?.handle || 'maker')}</small></span><span class="muted">${date(s.createdAt || s.submittedAt)}</span></a>`).join('')}</div>` : '<p class="muted">No submissions yet.</p>'}</section>`;
}

export function leaderboard(data, slug, currentView = '') {
  const views = data.views || [];
  const cols = (data.columns || []).filter(c => !c.hidden);
  const rows = data.entries || [];
  const paid = rows.filter(r => r.prize_rank != null).length ? null : null;
  const shown = rows.slice(0, 50);
  const cells = r => cols.map(c => { const key = c.key || c.name || c.id; return `<td>${esc(r.display?.[key] ?? r.display?.[c.label] ?? r.values?.[key] ?? '')}</td>`; }).join('');
  const phase = typeof data.phase === 'string' ? data.phase : data.phase?.title || data.phase?.key || 'Results';
  return `<p class="crumb"><a href="#/bounty/${encodeURIComponent(slug)}">← Bounty overview</a></p><section class="page-head compact"><div><p class="eyebrow">COMPETITION RESULTS</p><h1>${esc(data.competition?.title || slug)} leaderboard</h1></div><span class="live-tag">${esc(phase)}</span></section>${views.length>1?`<nav class="view-tabs" aria-label="Leaderboard view">${views.map(v=>{const name=typeof v==='string'?v:(v.name||v.label||v.id);return `<a class="${name===currentView?'selected':''}" href="#/bounty/${encodeURIComponent(slug)}/leaderboard?view=${encodeURIComponent(name)}">${esc(name)}</a>`}).join('')}</nav>`:''}<div class="scroll-table leaderboard"><table><thead><tr><th>Rank</th><th>Maker</th><th>Entry</th>${cols.map(c=>`<th>${esc(c.title || c.label || c.name || c.key)}</th>`).join('')}</tr></thead><tbody>${shown.map(r=>`<tr><td><span class="rank">${esc(r.rank)}</span>${r.prize_rank ? `<span class="prize-badge">${esc(r.prize_rank)}</span>`:''}</td><td><a href="#/u/${encodeURIComponent(r.handle || '')}">@${esc(r.handle || 'maker')}</a></td><td>${esc(r.title || 'Untitled entry')}</td>${cells(r)}</tr>`).join('')}</tbody></table></div>${rows.length>50?`<div class="more-wrap"><button id="show-more">Show 50 more</button><span class="muted">${Math.min(50,rows.length)} of ${rows.length} entries</span></div>`:`<p class="muted row-count">${rows.length} entries</p>`}`;
}

export function profile(p) {
  const record = p.record || {};
  const avatar = p.image || p.avatar;
  const social = [['GitHub',p.github_login,`https://github.com/${encodeURIComponent(p.github_login || '')}`],['X',p.x,`https://x.com/${encodeURIComponent(p.x || '')}`],['Discord',p.discord,null]].filter(x=>x[1]);
  return `<p class="crumb"><a href="#/">← Bounties</a></p><section class="profile-head"><div class="profile-avatar">${avatar ? `<img crossorigin="anonymous" loading="lazy" src="${esc(avatar)}" alt="">` : esc(initials(p.display_name || p.handle))}</div><div class="profile-intro"><p class="eyebrow">MAKER PROFILE</p><h1>${esc(p.display_name || p.handle)}</h1><p class="handle">@${esc(p.handle)}</p><p>${esc(p.bio || 'No bio yet.')}</p><nav class="social-links">${social.map(([name,value,url])=>url?`<a href="${url}" target="_blank" rel="noopener">${esc(name)} ↗</a>`:`<span>${esc(name)}: ${esc(value)}</span>`).join('')}</nav></div><aside class="wallet">${p.wallet?.address?`<span>Wallet</span><a href="${esc(p.wallet.explorer_url || `https://solscan.io/account/${p.wallet.address}`)}" target="_blank" rel="noopener">${esc(short(p.wallet.address))} ↗</a>`:''}<small>Joined ${date(p.joined_at)}</small></aside></section><section class="record-stats"><div><strong>${record.entered ?? record.entered_count ?? 0}</strong><span>Entered</span></div><div><strong>${record.placed ?? record.placed_count ?? 0}</strong><span>Placed</span></div><div><strong>${money(record.won ?? record.won_usd ?? 0)}</strong><span>Won</span></div><div><strong>${record.best_place ?? record.bestPlacement ?? '—'}</strong><span>Best place</span></div><div><strong>${money(record.prize ?? record.prize_usd ?? 0)}</strong><span>Total prizes</span></div></section><section class="entries"><h2>Competition entries</h2><div class="scroll-table"><table><thead><tr><th>Bounty</th><th>Place</th><th>Score</th><th>Prize</th><th>Entered</th></tr></thead><tbody>${(p.solutions||[]).map(s=>`<tr><td><a href="#/bounty/${encodeURIComponent(s.competition?.slug || s.competition?.id || '')}">${esc(s.competition?.title || s.competition?.name || 'Competition')}</a></td><td>${esc(s.placement ?? '—')}</td><td>${esc(s.score?.display ?? s.score?.value ?? '—')}</td><td class="green">${money(s.prize_usd)}</td><td>${date(s.entered_at)}</td></tr>`).join('') || '<tr><td colspan="5">No entries yet.</td></tr>'}</tbody></table></div></section>`;
}

export const errorView = (message) => `<section class="error"><p class="eyebrow">CONNECTION ISSUE</p><h1>We could not load this page.</h1><p>${esc(message)}</p><a href="#/">Return to bounties</a></section>`;
