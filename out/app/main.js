import * as api from './api.js';
import { timeLeft, soon, ended } from './format.js';
import { filters, boardPage, boardItems, loading, failure } from './views.js';

const main = document.querySelector('main');
const choice = { ...filters };
let generation = 0;
window.__shotReady = false;
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView(); });
main.addEventListener('error', event => { if (event.target.tagName === 'IMG') event.target.remove(); }, true);

function wireBoard(items, cursor) {
  const current = generation;
  const form = main.querySelector('form');
  const refresh = () => {
    Object.assign(choice,Object.fromEntries(new FormData(form)));
    const result = boardItems(items,choice);
    main.querySelector('#bounty-list').innerHTML = result.html;
    main.querySelector('#match-count').textContent = result.count;
  };
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  main.querySelector('#bounty-list').addEventListener('click', event => {
    if (!event.target.closest('[data-reset]')) return;
    Object.assign(choice,filters);
    for (const [key,value] of Object.entries(choice)) form.elements[key].value = value;
    refresh();
    form.elements.q.focus();
  });
  if (cursor) {
    const button = document.createElement('button');
    button.textContent = 'Load more bounties';
    main.querySelector('#board-more').append(button);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const page = await api.board(cursor);
        if (current !== generation) return;
        items.push(...(page.items || []));
        main.innerHTML = boardPage(items,choice);
        wireBoard(items,page.next_cursor);
      } catch { button.textContent = 'Couldn’t load more. Try again'; button.disabled = false; }
    });
  }
}
function wireLeaderboard(data, rows) {
  let shown = 50;
  const button = main.querySelector('#show-more');
  button?.addEventListener('click', () => {
    main.querySelector('tbody').insertAdjacentHTML('beforeend',rows(data,shown,shown + 50));
    shown = Math.min(shown + 50,data.entries.length);
    main.querySelector('#shown-count').textContent = `Showing ${shown} of ${data.entries.length.toLocaleString('en-US')} entries`;
    if (shown >= data.entries.length) { button.disabled = true; button.textContent = 'All entries shown'; }
  });
}
async function navigate() {
  const token = ++generation;
  window.__shotReady = false;
  main.setAttribute('aria-busy','true');
  main.innerHTML = loading();
  try {
    const [path,query = ''] = (location.hash.slice(1) || '/').split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    let html, title, mount;
    if (!parts.length) {
      const data = await api.board();
      const items = data.items || [];
      html = boardPage(items,choice); title = 'Find your next build'; mount = () => wireBoard(items,data.next_cursor);
    } else if (parts[0] === 'bounty' && parts[1] && parts.length === 2) {
      const [data,pages] = await Promise.all([api.bounty(parts[1]),import('./pages.js')]);
      await pages.ready;
      html = pages.bountyPage(data); title = data.title;
    } else if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard' && parts.length === 3) {
      const view = new URLSearchParams(query).get('view');
      const [data,c,pages] = await Promise.all([api.leaderboard(parts[1],view),api.bounty(parts[1]),import('./pages.js')]);
      await pages.ready;
      html = pages.leaderboardPage(data,parts[1],c); title = `Leaderboard · ${c.title}`; mount = () => wireLeaderboard(data,pages.leaderboardRows);
    } else if (parts[0] === 'u' && parts[1] && parts.length === 2) {
      const [data,pages] = await Promise.all([api.profile(parts[1]),import('./pages.js')]);
      await pages.ready;
      html = pages.profilePage(data); title = data.display_name || data.handle;
    } else throw new Error('This page doesn’t exist. Follow a bounty or maker link to explore.');
    if (token !== generation) return;
    main.innerHTML = html;
    document.title = `${title} | make.fun`;
    mount?.();
    document.querySelector('.nav-board').setAttribute('aria-current',parts.length ? 'false' : 'page');
    window.__routeError = null;
  } catch (error) {
    if (token !== generation) return;
    main.innerHTML = failure(error.name === 'TimeoutError' ? 'The request took too long. Check your connection and try again.' : error.message);
    window.__routeError = error.message;
    main.querySelector('#retry').addEventListener('click',navigate);
  }
  if (token !== generation) return;
  main.setAttribute('aria-busy','false');
  window.scrollTo(0,0);
  window.__shotReady = true;
}
setInterval(() => {
  main.querySelectorAll('[data-deadline]').forEach(node => {
    node.textContent = timeLeft(node.dataset.deadline);
    node.classList.toggle('urgent',soon(node.dataset.deadline));
    node.classList.toggle('ended',ended(node.dataset.deadline));
  });
},30_000);
window.addEventListener('hashchange',navigate);
navigate();
