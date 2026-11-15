import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import { ended, left } from './format.js';
import { board, bounty, errorView, leaderboard, profile } from './views.js';

const app = document.querySelector('#app');
let boardData;
let boardFilters = { q: '', category: 'all', state: 'all', sort: 'deadline' };
window.__shotReady = false;

function route() {
  const raw = location.hash.slice(1) || '/';
  const [pathname, query = ''] = raw.split('?');
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, query: new URLSearchParams(query) };
}

async function render() {
  window.__shotReady = false;
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = '<p class="loading">Loading make.fun…</p>';
  const { parts, query } = route();
  try {
    if (!parts.length) {
      boardData ||= await getBounties();
      document.title = 'Open bounties | make.fun';
      app.innerHTML = board(boardData, boardFilters);
      bindBoard();
    } else if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') {
      const [data, comp] = await Promise.all([getLeaderboard(parts[1], query.get('view') || ''), getBounty(parts[1])]);
      document.title = `Leaderboard | ${comp.title || parts[1]} | make.fun`;
      app.innerHTML = leaderboard({ ...data, competition: data.competition || comp }, parts[1], query.get('view') || '');
      const button = document.querySelector('#show-more');
      if (button) button.addEventListener('click', () => {
        const rows = [...document.querySelectorAll('.leaderboard tbody tr')];
        const visible = rows.findIndex(row => row.hidden);
        const start = visible < 0 ? rows.length : visible;
        rows.slice(start, start + 50).forEach(row => { row.hidden = false; });
        const count = Math.min(start + 50, rows.length);
        button.nextElementSibling.textContent = `${count} of ${rows.length} entries`;
        if (count >= rows.length) button.remove();
      });
      document.querySelectorAll('.leaderboard tbody tr').forEach((row,i) => { if (i >= 50) row.hidden = true; });
    } else if (parts[0] === 'bounty' && parts[1]) {
      const data = await getBounty(parts[1]);
      document.title = `${data.title} | make.fun`;
      app.innerHTML = bounty(data);
    } else if (parts[0] === 'u' && parts[1]) {
      const data = await getProfile(parts[1]);
      document.title = `${data.display_name || data.handle} | make.fun`;
      app.innerHTML = profile(data);
    } else {
      app.innerHTML = errorView('This route is not available.');
    }
    window.scrollTo(0, 0);
  } catch (error) {
    app.innerHTML = errorView(error.message || 'Please try again.');
  }
  app.setAttribute('aria-busy', 'false');
  window.__shotReady = true;
}

function bindBoard() {
  const update = () => {
    boardFilters = { q: document.querySelector('#search').value, category: document.querySelector('#category').value, state: document.querySelector('#state').value, sort: document.querySelector('#sort').value };
    app.innerHTML = board(boardData, boardFilters);
    bindBoard();
  };
  for (const id of ['category','state','sort']) document.querySelector(`#${id}`).addEventListener('change', update);
  document.querySelector('#search').addEventListener('input', update);
}

window.addEventListener('hashchange', render);
render();
setInterval(() => {
  document.querySelectorAll('[data-deadline]').forEach(node => {
    const value = node.dataset.deadline;
    node.textContent = left(value);
    node.classList.toggle('urgent', !ended(value) && new Date(value) - Date.now() < 86400000);
  });
}, 30_000);
