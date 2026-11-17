import { escape as e, money, number, date, pot, count, category, ended, route, initials, avatar } from './format.js';
import { crumb, tag, timer, table, external } from './views.js';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
export const ready = new Promise((resolve,reject) => {
  stylesheet.addEventListener('load',resolve,{once:true});
  stylesheet.addEventListener('error',() => reject(new Error('Page styles could not load. Please refresh.')),{once:true});
});
stylesheet.href = './pages.css';
document.head.append(stylesheet);

function markdown(value) {
  const inline = text => e(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  let inList = false;
  const output = String(value || '').split(/\r?\n/).map(line => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { const prefix = inList ? '' : '<ul>'; inList = true; return prefix + '<li>' + inline(bullet[1]) + '</li>'; }
    const prefix = inList ? '</ul>' : ''; inList = false;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    return prefix + (heading ? '<h3>' + inline(heading[1]) + '</h3>' : line.trim() ? '<p>' + inline(line) + '</p>' : '');
  });
  return output.join('') + (inList ? '</ul>' : '');
}

const publicBounty = slug => 'https://make.fun/bounty/' + encodeURIComponent(slug);
function tabs(slug, active) {
  return `<nav class="tabs" aria-label="Bounty navigation">${[['','Overview'],['/leaderboard','Leaderboard']].map(([suffix,label]) => `<a ${active === suffix ? 'class="active" aria-current="page"' : ''} href="${route(slug,suffix)}">${label}</a>`).join('')}${external(publicBounty(slug) + active,'View on make.fun')}</nav>`;
}
function rewardList(c) {
  if (Array.isArray(c.rewardsNow) && c.rewardsNow.length) return c.rewardsNow;
  return Object.entries(c.rewards || {}).sort(([a],[b]) => Number(a)-Number(b)).map(([place,value]) => ({place,baseUsd:value,feeShareUsd:0,amountUsd:value}));
}
export function bountyPage(c) {
  const rewards = rewardList(c);
  const status = ended(c.deadline) ? 'Ended' : c.acceptingSubmissions === false ? 'Not accepting entries' : 'Open for entries';
  const facts = [['Status',status],['Entry fee',Number(c.entryFeeUsd) ? money(c.entryFeeUsd) : 'Free to enter'],['Entries',number(count(c))],['Opened',date(c.openedAt || c.opensAt || c.publishedAt || c.createdAt,true)],['Deadline',date(c.deadline,true)]];
  const payouts = rewards.map(r => `<tr><td class="place">#${e(r.place)}</td><td>${money(r.baseUsd)}</td><td>${money(r.feeShareUsd)}</td><td class="green">${money(r.amountUsd)}</td></tr>`).join('');
  const recent = [...(c.submissions || [])].sort((a,b) => Date.parse(b.createdAt || b.submittedAt) - Date.parse(a.createdAt || a.submittedAt)).slice(0,8).map(s => {
    const handle = s.handle || s.hunter || s.user?.handle;
    return `<div class="submission"><span class="avatar small" aria-hidden="true">${e(initials(handle || s.title))}</span><div><b>${e(s.title || 'Untitled entry')}</b>${handle ? `<a href="#/u/${encodeURIComponent(handle)}">@${e(handle)}</a>` : '<small>Maker</small>'}</div><small>${date(s.createdAt || s.submittedAt)}</small></div>`;
  }).join('');
  return `${crumb('#/','All bounties',category(c))}<section class="detail-hero"><div>${tag(category(c))}<h1>${e(c.title)}</h1><p class="intro">${e(c.summary || '')}</p></div><aside class="pot-card"><span class="card-label">Current live pot</span><strong>${money(pot(c))}</strong><div>${timer(c.deadline)}<span>${rewards.length} paid places</span></div></aside></section>${tabs(c.slug,'')}<div class="detail-grid"><div><section class="paper prose"><p class="eyebrow">The challenge</p><h2>About this bounty</h2>${markdown(c.description || c.summary || 'The brief is coming soon.')}</section><section class="paper prose rules"><p class="eyebrow">Before you build</p><h2>Rules & requirements</h2>${markdown(c.rules || 'No additional rules have been published.')}</section></div><aside><section class="paper facts"><h2>At a glance</h2><dl>${facts.map(([key,value]) => `<div><dt>${key}</dt><dd>${e(value)}</dd></div>`).join('')}</dl><small>Dates shown in UTC</small></section><section class="paper rewards"><div class="section-heading"><h2>Reward breakdown</h2>${tag(rewards.length + ' places')}</div><p class="muted">Base prizes + a share of entry fees.</p>${table(['Place','Base','Fee share','Total now'],payouts)}<a class="text-link" href="${route(c.slug,'/leaderboard')}">Explore the leaderboard →</a></section></aside></div><section class="paper recent"><div class="section-heading"><h2>Latest submissions</h2><a class="text-link" href="${route(c.slug,'/leaderboard')}">All results →</a></div><div class="submission-grid">${recent || '<p class="muted">No submissions yet. The first entry could be yours.</p>'}</div></section>`;
}

const visibleColumns = data => (data.columns || []).filter(column => !column.hidden);
export function leaderboardRows(data, from, to) {
  const columns = visibleColumns(data);
  return (data.entries || []).slice(from,to).map(row => {
    const cells = columns.map(c => `<td class="numeric">${e(row.display?.[c.key] ?? row.values?.[c.key] ?? '—')}</td>`).join('');
    const rankClass = Number(row.rank) <= 3 ? row.rank : 'other';
    const badge = row.prize_rank ? `<span class="prize-badge" title="Paid place ${e(row.prize_rank)}">Prize #${e(row.prize_rank)}</span>` : '';
    return `<tr><td><span class="rank rank-${e(rankClass)}">${e(row.rank ?? '—')}</span></td><td><a class="maker" href="#/u/${encodeURIComponent(row.handle || '')}">@${e(row.handle || 'maker')}</a>${badge}</td><td class="entry-title" title="${e(row.title)}">${e(row.title || 'Untitled entry')}</td>${cells}</tr>`;
  }).join('');
}
export function leaderboardPage(data, slug, c) {
  const phase = typeof data.phase === 'string' ? data.phase : data.phase?.title || data.phase?.key || 'Results';
  const total = data.entries?.length || 0;
  const views = data.views || [];
  const controls = views.length > 1 ? `<nav class="view-tabs" aria-label="Leaderboard views">${views.map(v => {
    const name = typeof v === 'string' ? v : v.name || v.key || v.id;
    const label = typeof v === 'string' ? v : v.label || v.title || name;
    return `<a ${data.view === name ? 'class="selected" aria-current="page"' : ''} href="${route(slug,'/leaderboard?view=' + encodeURIComponent(name))}">${e(label)}</a>`;
  }).join('')}</nav>` : '';
  return `${crumb('#/','All bounties',category(c))}<section class="results-hero"><p class="eyebrow">The builders setting the bar</p><h1>${e(data.competition?.title || c.title || slug)}</h1><div class="results-meta">${tag('Leaderboard')}<span class="phase"><i></i>${e(phase)}</span></div></section>${tabs(slug,'/leaderboard')}<div class="standings-toolbar"><div><h2>Live standings <span class="count-pill">${number(total)}</span></h2><p class="muted">${data.phase?.placements_held ? 'Practice scores · Paid places confirmed after final grading.' : 'Ranked entries and the latest published scores.'}</p></div>${controls}</div>${table(['Rank','Maker / paid place','Entry',...visibleColumns(data).map(c => c.title || c.label || c.key)],leaderboardRows(data,0,50),'standings')}<div class="pagination"><span id="shown-count" class="muted">Showing ${Math.min(50,total)} of ${number(total)} entries</span>${total > 50 ? '<button id="show-more">Show 50 more <span aria-hidden="true">↓</span></button>' : ''}</div>`;
}

export function profilePage(p) {
  const name = p.display_name || p.handle, r = p.record || {};
  const image = avatar(p.image || p.avatar), address = p.wallet?.address;
  const stats = [[r.competitions_entered ?? r.entered ?? r.entered_count ?? 0,'Entered'],[r.competitions_placed ?? r.placed ?? r.placed_count ?? 0,'Placed'],[r.competitions_won ?? r.won ?? 0,'Won'],[r.best_placement ?? r.best_place ?? '—','Best place'],[money(r.prize_usd ?? r.prize ?? 0),'Total prizes']];
  const links = [p.github_login ? external('https://github.com/' + encodeURIComponent(p.github_login),'GitHub') : '',p.x ? external('https://x.com/' + encodeURIComponent(p.x.replace(/^@/,'')),'X') : '',p.discord ? `<span>Discord: ${e(p.discord)}</span>` : ''].join('');
  const rows = (p.solutions || []).map(s => `<tr><td><a class="text-link" href="${route(s.competition?.slug || s.competition?.id || '')}">${e(s.competition?.title || 'Bounty')}</a><small>${e(s.title || '')}</small></td><td>${s.placement ? '#' + e(s.placement) : '—'}</td><td>${e(s.score?.display ?? s.score?.value ?? '—')}<small>${e(s.score?.column?.title || '')}</small></td><td class="green">${money(s.prize_usd)}</td><td>${date(s.entered_at)}</td></tr>`).join('');
  return `${crumb('#/','All bounties','Maker profile')}<section class="profile-hero paper"><div class="avatar large">${e(initials(name))}${image ? `<img crossorigin="anonymous" loading="lazy" src="${image}" alt="${e(name)}">` : ''}</div><div class="profile-copy"><p class="eyebrow">Meet the maker</p><h1>${e(name)}</h1><p class="handle">@${e(p.handle)}</p><p>${e(p.bio || 'This maker has not added a bio yet.')}</p><div class="socials">${links}</div></div><aside class="wallet"><span class="card-label">Joined ${date(p.joined_at)}</span>${address ? `<small>Solana wallet</small>${external(p.wallet.explorer_url || 'https://solscan.io/account/' + address,address.slice(0,5) + '…' + address.slice(-5))}` : '<small>No public wallet</small>'}</aside></section><section class="record" aria-label="Competition record">${stats.map(([value,label]) => `<div><strong>${e(value)}</strong><span>${label}</span></div>`).join('')}</section><section class="profile-entries"><div class="section-heading"><h2>Competition entries</h2><span class="muted">${p.solutions?.length || 0} entries</span></div>${table(['Bounty','Place','Score','Prize','Entered'],rows)}</section>`;
}
