import { loadBoard, loadCompetition, loadResults, loadMaker } from './api.js';
import { deadlinePassed, timeRemaining } from './format.js';
import { renderBoard, renderBounty, renderResults, renderMaker, renderFailure } from './views.js';

const content = document.getElementById('app');
let boardData;
let filters = { q: '', category: 'all', state: 'all', sort: 'deadline' };
window.__shotReady = false;

document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  content.focus();
  content.scrollIntoView({ block: 'start' });
});

function bindBoardControls() {
  const update = event => {
    const activeControl = event.currentTarget;
    const selection = activeControl.id === 'search'
      ? [activeControl.selectionStart, activeControl.selectionEnd] : null;
    filters = {
      q: document.getElementById('search').value,
      category: document.getElementById('category').value,
      state: document.getElementById('state').value,
      sort: document.getElementById('sort').value
    };
    content.innerHTML = renderBoard(boardData, filters);
    bindBoardControls();
    const replacement = document.getElementById(activeControl.id);
    replacement.focus();
    if (selection) replacement.setSelectionRange(...selection);
  };
  for (const control of ['category', 'state', 'sort']) {
    document.getElementById(control).addEventListener('change', update);
  }
  document.getElementById('search').addEventListener('input', update);
}

function mountResults(data, name, variant) {
  let shown = 50;
  function paint() {
    content.innerHTML = renderResults(data, name, variant, shown);
    document.getElementById('show-more')?.addEventListener('click', () => {
      shown += 50;
      paint();
    });
  }
  paint();
}

async function navigate() {
  window.__shotReady = false;
  content.setAttribute('aria-busy', 'true');
  content.innerHTML = '<p class="loading">Loading make.fun…</p>';
  try {
    const hashParts = (location.hash.substring(1) || '/').split('?');
    const routeParts = hashParts[0].split('/').filter(Boolean).map(decodeURIComponent);
    const variant = new URLSearchParams(hashParts[1] || '').get('view') || '';
    const [surfaceName, name, subpage] = routeParts;

    if (routeParts.length === 0) {
      if (!boardData) boardData = await loadBoard();
      document.title = 'Open bounties | make.fun';
      content.innerHTML = renderBoard(boardData, filters);
      bindBoardControls();
    } else if (surfaceName === 'bounty' && name && subpage === 'leaderboard') {
      const [scores, competition] = await Promise.all([loadResults(name, variant), loadCompetition(name)]);
      document.title = `Leaderboard | ${competition.title || name} | make.fun`;
      mountResults({ ...scores, competition: scores.competition || competition }, name, variant);
    } else if (surfaceName === 'bounty' && name) {
      const competition = await loadCompetition(name);
      document.title = `${competition.title} | make.fun`;
      content.innerHTML = renderBounty(competition);
    } else if (surfaceName === 'u' && name) {
      const person = await loadMaker(name);
      document.title = `${person.display_name || person.handle} | make.fun`;
      content.innerHTML = renderMaker(person);
    } else {
      content.innerHTML = renderFailure('This route is not available.');
    }
    window.scrollTo(0, 0);
  } catch (problem) {
    content.innerHTML = renderFailure(problem.message || 'Please try again.');
  }
  content.setAttribute('aria-busy', 'false');
  window.__shotReady = true;
}

setInterval(() => {
  document.querySelectorAll('[data-deadline]').forEach(node => {
    const timestamp = node.dataset.deadline;
    node.textContent = timeRemaining(timestamp);
    node.classList.toggle('urgent', !deadlinePassed(timestamp) && new Date(timestamp) - Date.now() < 86_400_000);
  });
}, 30_000);
window.addEventListener('hashchange', navigate);
navigate();
