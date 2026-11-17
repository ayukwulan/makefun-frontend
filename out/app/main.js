import { fetchBoard, fetchBounty, fetchStandings, fetchMaker, observeRequests } from './api.js';
import { countdown, closingSoon, hasEnded, escapeHTML } from './format.js';
import {
  Board, masthead, workspace, patchHTML, text, loadingPane, errorPane,
  welcomePane, bountyPane, leaderboardPane, profilePane
} from './views.js';

window.__shotReady = false;
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
const styled = new Promise((resolve, reject) => {
  stylesheet.addEventListener('load', resolve, { once: true });
  stylesheet.addEventListener('error', () => reject(new Error('The stylesheet could not load. Reload this page.')), { once: true });
});
stylesheet.href = new URL('./style.css', import.meta.url).href;
document.head.append(stylesheet);

function parseRoute() {
  const raw = location.hash.slice(1) || '/';
  const question = raw.indexOf('?');
  const path = question < 0 ? raw : raw.slice(0, question);
  const query = new URLSearchParams(question < 0 ? '' : raw.slice(question + 1));
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { kind: 'welcome', key: 'welcome' };
  if (parts[0] === 'bounty' && parts[1] && parts.length === 2) return { kind: 'bounty', slug: parts[1], key: 'bounty-' + parts[1] };
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard' && parts.length === 3) {
    return { kind: 'leaderboard', slug: parts[1], view: query.get('view'), key: 'leaderboard-' + parts[1] };
  }
  if (parts[0] === 'u' && parts[1] && parts.length === 2) return { kind: 'profile', handle: parts[1], key: 'profile-' + parts[1] };
  throw new Error('That view does not exist. Pick a bounty from the board to keep exploring.');
}

async function start() {
  await styled;
  const app = document.querySelector('#app');
  document.querySelector('header').className = 'header';
  patchHTML(document.querySelector('header'), masthead());
  app.className = 'workspace';
  app.setAttribute('aria-busy', 'true');
  patchHTML(app, workspace());
  document.body.insertAdjacentHTML('afterbegin', '<a class="skip" href="#detail">Skip to detail pane</a><a class="skip skip-board" href="#board">Skip to bounty board</a>');
  const board = new Board(document.querySelector('#board'));
  const detail = document.querySelector('#detail');
  const pane = document.querySelector('#pane');
  const paneNote = document.querySelector('#pane-note');
  const boardNote = document.querySelector('#board-note');
  const refreshButton = document.querySelector('[data-action="refresh"]');
  const moreBounties = document.querySelector('#board-more');
  const pages = new Map();
  let nextCursor = null, route = null, routeData = null, generation = 0;
  let pageStart = 0, firstRoute = true, refreshing = false;

  observeRequests(({ total, board: count }) => {
    text(document.querySelector('#request-count'), `${total} API request${total === 1 ? '' : 's'}`);
    text(document.querySelector('#board-requests'), `${count} API request${count === 1 ? '' : 's'}`);
  });

  async function loadBoard(cursor = null, refresh = false) {
    try {
      const response = await fetchBoard(cursor, { refresh });
      pages.set(cursor || '', response);
      const unique = new Map();
      for (const page of pages.values()) for (const item of page.items || []) if (item.slug) unique.set(item.slug, item);
      board.setItems([...unique.values()]);
      nextCursor = [...pages.values()].at(-1)?.next_cursor || null;
      moreBounties.hidden = !nextCursor;
      text(boardNote, '');
      return response;
    } catch (error) {
      board.fail();
      patchHTML(boardNote, `<span>Board unavailable. ${escapeHTML(error.message)}</span><button data-action="retry-board">Try again</button>`);
      throw error;
    }
  }

  function fetchPane(destination, refresh = false) {
    const options = { refresh };
    if (destination.kind === 'bounty') return fetchBounty(destination.slug, options);
    if (destination.kind === 'leaderboard') return fetchStandings(destination.slug, destination.view, options);
    if (destination.kind === 'profile') return fetchMaker(destination.handle, options);
    return Promise.resolve(null);
  }
  function renderPane() {
    let html, title;
    if (route.kind === 'welcome') { html = welcomePane(board.items); title = 'Good ideas. Real rewards.'; }
    if (route.kind === 'bounty') { html = bountyPane(routeData); title = routeData.title; }
    if (route.kind === 'leaderboard') {
      const competition = board.items.find(item => item.slug === route.slug) || {};
      pageStart = Math.min(pageStart, Math.max(0, Math.ceil((routeData.entries?.length || 0) / 50) - 1) * 50);
      html = leaderboardPane(routeData, route.slug, competition, pageStart);
      title = 'Leaderboard · ' + (routeData.competition?.title || route.slug);
    }
    if (route.kind === 'profile') { html = profilePane(routeData); title = routeData.display_name || routeData.handle; }
    patchHTML(pane, html);
    document.title = `${title} | make.fun`;
    pane.dataset.surface = route.kind;
  }

  async function navigate() {
    const token = ++generation;
    window.__shotReady = false;
    window.__routeError = null;
    app.setAttribute('aria-busy', 'true');
    detail.setAttribute('aria-busy', 'true');
    text(paneNote, '');
    const boardRequest = loadBoard();
    try {
      const destination = parseRoute();
      const changed = destination.key !== route?.key;
      const viewChanged = destination.view !== route?.view;
      route = destination;
      if (changed || viewChanged) pageStart = 0;
      if (route.slug) board.select(route.slug);
      else if (route.kind === 'welcome') board.select('');
      if (changed) { patchHTML(pane, loadingPane()); detail.scrollTop = 0; }
      const [boardResult, paneResult] = await Promise.allSettled([boardRequest, fetchPane(route)]);
      if (token !== generation) return;
      if (paneResult.status === 'rejected') throw paneResult.reason;
      if (boardResult.status === 'rejected' && route.kind === 'welcome') throw boardResult.reason;
      routeData = paneResult.value;
      renderPane();
      if (boardResult.status === 'rejected') window.__routeError = boardResult.reason.message;
      if (firstRoute && route.slug) board.reveal(route.slug);
      firstRoute = false;
    } catch (error) {
      await boardRequest.catch(() => {});
      if (token !== generation) return;
      if (error instanceof URIError) error = new Error('This link is malformed. Pick a bounty from the board to open a valid view.');
      route = null;
      routeData = null;
      patchHTML(pane, errorPane(error.message));
      pane.dataset.surface = 'error';
      window.__routeError = error.message;
      document.title = 'View unavailable | make.fun';
    } finally {
      if (token === generation) {
        app.setAttribute('aria-busy', 'false');
        detail.setAttribute('aria-busy', 'false');
        window.__shotReady = true;
      }
    }
  }

  async function refresh() {
    if (refreshing || !route) return;
    refreshing = true;
    refreshButton.disabled = true;
    const token = generation;
    const [boardResult, result] = await Promise.allSettled([loadBoard(null, true), fetchPane(route, true)]);
    if (token === generation) {
      if (result.status === 'fulfilled') { routeData = result.value; renderPane(); }
      text(paneNote, result.status === 'rejected' ? `Keeping the last loaded view. ${result.reason.message}`
        : boardResult.status === 'rejected' ? 'The board could not refresh. Try again shortly.' : '');
    }
    refreshing = false;
    refreshButton.disabled = false;
  }

  board.root.querySelector('form').addEventListener('submit', event => event.preventDefault());
  document.querySelector('#search').addEventListener('input', event => { board.filters.q = event.target.value; board.applyFilters(); });
  document.querySelector('#state').addEventListener('change', event => { board.filters.state = event.target.value; board.applyFilters(); });
  board.root.addEventListener('click', event => {
    const filter = event.target.closest('[data-filter]');
    if (filter) { board.filters[filter.dataset.filter] = filter.dataset.value; board.applyFilters(); }
  });
  document.body.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'refresh') refresh();
    if (button.dataset.action === 'retry') navigate();
    if (button.dataset.action === 'retry-board') { try { await loadBoard(null, true); } catch { /* Board already shows the error. */ } }
    if (button.dataset.action === 'clear') { board.reset(); document.querySelector('#search').focus(); }
    if (['more-rows', 'previous-rows'].includes(button.dataset.action) && route?.kind === 'leaderboard' && routeData) {
      pageStart = Math.max(0, pageStart + (button.dataset.action === 'more-rows' ? 50 : -50));
      renderPane();
      detail.scrollTop = pane.querySelector('.standings').offsetTop - detail.offsetTop - 12;
    }
  });
  moreBounties.addEventListener('click', async () => {
    moreBounties.disabled = true;
    try { await loadBoard(nextCursor); } catch { /* Retry stays available in the board. */ }
    moreBounties.disabled = false;
  });
  document.querySelectorAll('.skip').forEach(anchor => anchor.addEventListener('click', event => {
    event.preventDefault();
    const target = anchor.classList.contains('skip-board') ? document.querySelector('#search') : detail;
    target.focus();
    target.scrollIntoView({ block: 'nearest' });
  }));
  app.addEventListener('error', event => {
    if (event.target.tagName === 'IMG') event.target.remove();
  }, true);
  document.querySelector('#search').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.target.value = ''; board.filters.q = ''; board.applyFilters(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input,textarea,select,[contenteditable]')) {
      event.preventDefault(); document.querySelector('#search').focus();
    }
  });
  const clock = setInterval(() => app.querySelectorAll('[data-deadline]').forEach(node => {
    text(node, countdown(node.dataset.deadline));
    node.classList.toggle('urgent', closingSoon(node.dataset.deadline));
    node.classList.toggle('ended', hasEnded(node.dataset.deadline));
  }), 30_000);
  const updates = setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
  window.addEventListener('pagehide', () => { clearInterval(clock); clearInterval(updates); }, { once: true });
  window.addEventListener('hashchange', navigate);
  await navigate();
}

start().catch(error => {
  document.querySelector('#app').className = '';
  document.querySelector('#app').textContent = error.message;
  window.__routeError = error.message;
  window.__shotReady = true;
});
