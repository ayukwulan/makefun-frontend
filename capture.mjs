import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repository = fileURLToPath(new URL('.', import.meta.url));
const chromium = '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const remoteProxy = { host: 'fd8b:4f84:7d32:99::1', port: 3128 };
const manifest = JSON.parse(await readFile(join(repository, 'shots.json'), 'utf8'));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const connections = new Set();
const originalDirectories = new Set(await readdir(repository));
let browser, profile, cdp, spawnFailure, browserLog = '';

// The egress proxy accepts curl's CONNECT bytes but rejects Chromium's header spelling/order.
const forwardingProxy = net.createServer(client => {
  connections.add(client);
  client.on('close', () => connections.delete(client));
  client.on('error', () => {});
  let request = Buffer.alloc(0);
  const receiveHeader = chunk => {
    request = Buffer.concat([request, chunk]);
    if (request.length > 16_384) { client.destroy(); return; }
    const boundary = request.indexOf('\r\n\r\n');
    if (boundary === -1) return;
    client.removeListener('data', receiveHeader);
    const authority = request.toString('ascii', 0, boundary).match(/^CONNECT\s+(\S+)\s+HTTP\/1\.[01]/)?.[1];
    if (!authority) { client.end('HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n'); return; }
    client.pause();
    const trailing = request.subarray(boundary + 4);
    const upstream = net.connect(remoteProxy);
    connections.add(upstream);
    upstream.on('close', () => { connections.delete(upstream); client.destroy(); });
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.once('connect', () => {
      upstream.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nUser-Agent: curl/8.5.0\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });
    let answer = Buffer.alloc(0);
    const receiveAnswer = chunk => {
      answer = Buffer.concat([answer, chunk]);
      if (answer.indexOf('\r\n\r\n') === -1) return;
      upstream.removeListener('data', receiveAnswer);
      client.write(answer);
      if (!/^HTTP\/1\.[01] 200/.test(answer.toString('ascii', 0, 24))) {
        console.error('Proxy refused ' + authority + ': ' + answer.toString('ascii').split('\r\n')[0]);
        client.end(); upstream.end(); return;
      }
      if (trailing.length) upstream.write(trailing);
      upstream.pipe(client); client.pipe(upstream); client.resume();
    };
    upstream.on('data', receiveAnswer);
  };
  client.on('data', receiveHeader);
});

async function connectCDP(url) {
  const websocket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP did not open')), 10_000);
    websocket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    websocket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  const issues = [], responses = [], requestURLs = new Map();
  websocket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') requestURLs.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.loadingFailed') issues.push({ url: requestURLs.get(message.params.requestId), reason: message.params.errorText, cors: message.params.corsErrorStatus });
    if (message.method === 'Network.responseReceivedExtraInfo') responses.push({ url: requestURLs.get(message.params.requestId), status: message.params.statusCode, cors: message.params.headers['access-control-allow-origin'] || message.params.headers['Access-Control-Allow-Origin'] || null });
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') issues.push({ console: message.params.entry.text });
    if (!message.id) return;
    const operation = pending.get(message.id);
    if (!operation) return;
    clearTimeout(operation.timer); pending.delete(message.id);
    if (message.error) operation.reject(new Error(message.error.message));
    else operation.resolve(message.result);
  });
  websocket.addEventListener('close', () => {
    for (const operation of pending.values()) {
      clearTimeout(operation.timer); operation.reject(new Error('CDP disconnected'));
    }
    pending.clear();
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 20_000);
    pending.set(id, { resolve, reject, timer });
    websocket.send(JSON.stringify({ id, method, params }));
  });
  return {
    command, exceptions, issues, responses, close: () => websocket.close(),
    async evaluate(expression) {
      const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result?.value;
    }
  };
}

async function waitForView(expected = null, acceptError = false) {
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    await delay(150);
    const state = await cdp.evaluate(`({ ready: window.__shotReady === true, error: window.__routeError || null, surface: document.querySelector('#pane')?.dataset.surface })`);
    if (state?.ready) {
      if (state.error && !acceptError) throw new Error('App route failed: ' + state.error);
      if (expected && state.surface !== expected) continue;
      return;
    }
  }
  throw new Error('The route never became ready: ' + await cdp.evaluate('document.body.innerText.slice(0, 600)'));
}

function jpegDimensions(bytes) {
  if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error('Capture is not a JPEG');
  let position = 2;
  while (position + 9 < bytes.length) {
    if (bytes[position] !== 255) { position += 1; continue; }
    const marker = bytes[position + 1];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: bytes.readUInt16BE(position + 5), width: bytes.readUInt16BE(position + 7) };
    if (marker === 0xda || marker === 0xd9) break;
    position += 2 + bytes.readUInt16BE(position + 2);
  }
  throw new Error('JPEG dimensions could not be read');
}

async function verifyApp() {
  console.log('Checking the split-board interaction contract…');
  await cdp.evaluate(`window.__contract = { board: document.getElementById('board'), list: document.getElementById('bounty-list'), row: document.querySelector('.bounty-row.selected'), top: document.getElementById('bounty-list').scrollTop }`);
  const persistent = async label => {
    assert.equal(await cdp.evaluate(`window.__contract.board === document.getElementById('board') && window.__contract.list === document.getElementById('bounty-list') && window.__contract.row === document.querySelector('.bounty-row[data-slug="tiny-chess-01"]') && Math.abs(window.__contract.top - document.getElementById('bounty-list').scrollTop) < 2`), true, label);
  };
  await cdp.evaluate('document.querySelector("[data-action=more-rows]").click()');
  assert.equal(await cdp.evaluate('document.querySelectorAll(".standings tbody tr").length'), 50, 'Paging must keep exactly 50 rows');
  assert.match(await cdp.evaluate('document.querySelector(".pagination p").textContent'), /51–100/, 'Second window must start at 51');
  await persistent('Paging changed the board');
  await cdp.evaluate('document.querySelector("[data-action=previous-rows]").click()');
  const alternative = await cdp.evaluate('document.querySelector(".view-tabs a:not([aria-current])").getAttribute("href")');
  await cdp.evaluate('location.hash = ' + JSON.stringify(alternative));
  await waitForView('leaderboard');
  assert.equal(await cdp.evaluate('document.querySelectorAll(".standings tbody tr").length'), 50);
  assert.equal(await cdp.evaluate('document.querySelector(".view-tabs a[aria-current]").getAttribute("href") === location.hash'), true, 'Scoring view was not selected');
  await persistent('Scoring tabs changed the board');
  await cdp.evaluate('document.querySelector(".bounty-row.selected .bounty-card").click()');
  await waitForView('bounty');
  assert.equal(await cdp.evaluate('document.querySelectorAll(".recent li").length'), 8, 'Latest submissions must be limited to eight');
  await persistent('Selecting a bounty changed the board scroll or nodes');
  await cdp.evaluate('location.hash = "#/u/eraerla"');
  await waitForView('profile');
  assert.equal(await cdp.evaluate('document.querySelectorAll(".record > div").length'), 5);
  assert.equal(await cdp.evaluate('document.querySelector(".wallet-card a").href.startsWith("https://solscan.io/")'), true);
  await persistent('Profile navigation changed the board');
  const before = await cdp.evaluate('document.getElementById("request-count").textContent');
  await cdp.evaluate('location.hash = "#/bounty/tiny-chess-01"');
  await waitForView('bounty');
  assert.equal(await cdp.evaluate('document.getElementById("request-count").textContent'), before, 'Cached navigation made a network request');
  await persistent('Cached navigation changed board nodes');
  await cdp.evaluate(`window.__refreshContract = { table: document.querySelector('.rewards-table table'), row: document.querySelector('.rewards-table tbody tr'), pot: document.querySelector('.pot-banner strong') }; document.querySelector('[data-action="refresh"]').click()`);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await delay(150);
    if (await cdp.evaluate('document.querySelector("[data-action=refresh]").disabled === false')) break;
  }
  assert.equal(await cdp.evaluate('document.querySelector("[data-action=refresh]").disabled'), false, 'Refresh did not complete');
  const refreshError = await cdp.evaluate('document.getElementById("pane-note").textContent');
  assert.equal(refreshError, '', 'Live ETag refresh failed: ' + JSON.stringify({ issues: cdp.issues, responses: cdp.responses.slice(-10) }));
  assert.equal(await cdp.evaluate(`window.__refreshContract.table === document.querySelector('.rewards-table table') && window.__refreshContract.row === document.querySelector('.rewards-table tbody tr') && window.__refreshContract.pot === document.querySelector('.pot-banner strong')`), true, 'Refreshing replaced detail rows or pot nodes');
  await persistent('Refreshing replaced board rows or moved its scroll');
  await cdp.evaluate('location.hash = "#/u/vinzsenzo"');
  await waitForView('profile');
  assert.equal(await cdp.evaluate(`Array.from(document.querySelectorAll('.avatar img')).every(image => image.crossOrigin === 'anonymous' && image.loading === 'lazy')`), true, 'Avatar attributes are invalid');
  assert.equal(await cdp.evaluate('document.querySelectorAll(".socials a").length'), 3, 'Structured social links are missing');
  await persistent('An avatar profile changed board state');
  const searchSurface = await cdp.evaluate('document.getElementById("pane").dataset.surface');
  await cdp.evaluate(`(() => { const input = document.getElementById('search'); input.value = 'no-matching-bounty-xyz'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.equal(await cdp.evaluate('document.querySelectorAll(".bounty-row:not([hidden])").length'), 0);
  assert.equal(await cdp.evaluate('document.getElementById("pane").dataset.surface'), searchSurface, 'Search must leave the detail visible');
  await cdp.evaluate('document.querySelector("[data-action=clear]").click()');
  await cdp.evaluate(`document.querySelector('[data-filter="category"][data-value="Games"]').click()`);
  assert.equal(await cdp.evaluate('Array.from(document.querySelectorAll(".bounty-row:not([hidden]) .category-label")).every(node => node.textContent.includes("Games"))'), true);
  await cdp.evaluate('document.querySelector("[data-action=clear]").click()');
  await cdp.evaluate(`(() => { const select = document.getElementById('state'); select.value = 'ended'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.equal(await cdp.evaluate('Array.from(document.querySelectorAll(".bounty-row:not([hidden]) time")).every(node => Date.parse(node.dateTime) <= Date.now())'), true);
  await cdp.evaluate('document.querySelector("[data-action=clear]").click()');
  await cdp.evaluate(`document.querySelector('[data-filter="sort"][data-value="pot"]').click()`);
  assert.equal(await cdp.evaluate(`(() => { const pots = Array.from(document.querySelectorAll('.bounty-row:not([hidden]) .card-money strong'), node => Number(node.textContent.replace(/[^0-9.]/g, ''))); return pots.some(pot => pot > 0) && pots.every((pot, index) => !index || pots[index - 1] >= pot); })()`), true, 'Pot sorting failed');
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 760, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await cdp.evaluate(`(() => { const board = document.getElementById('board').getBoundingClientRect(), pane = document.getElementById('detail').getBoundingClientRect(); return pane.top >= board.bottom && Math.abs(board.left - pane.left) < 2; })()`), true, 'Panes did not stack under 900px');
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Mobile page overflows horizontally');
  await cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await cdp.evaluate(`(() => { const node = document.createElement('div'); node.className = 'skeleton'; document.body.append(node); const value = getComputedStyle(node).animationName; node.remove(); return value; })()`), 'none', 'Reduced motion did not disable shimmer');
  await cdp.evaluate('location.hash = "#/"');
  await waitForView('welcome');
  assert.equal(await cdp.evaluate('document.getElementById("board") === window.__contract.board'), true);
  await cdp.evaluate('location.hash = "#/unknown-view"');
  await waitForView('error', true);
  assert.equal(await cdp.evaluate('document.querySelectorAll(".bounty-row:not([hidden])").length > 0'), true, 'The error view hid the board');
  await cdp.evaluate('delete window.__contract; delete window.__refreshContract');
  console.log('Verified: persistent board and scroll, live ETag refresh preserving detail nodes, all routes, avatars, controls, scoring tabs, cached navigation, 50-row windows, mobile stack, and reduced motion.');
}

async function cleanup() {
  cdp?.close();
  for (const connection of connections) connection.destroy();
  if (forwardingProxy.listening) await new Promise(resolve => forwardingProxy.close(resolve));
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    const stopped = once(browser, 'exit');
    try { process.kill(-browser.pid, 'SIGTERM'); } catch { browser.kill('SIGTERM'); }
    await Promise.race([stopped, delay(2_000)]);
    if (browser.exitCode === null && browser.signalCode === null) {
      try { process.kill(-browser.pid, 'SIGKILL'); } catch { browser.kill('SIGKILL'); }
      await Promise.race([stopped, delay(2_000)]);
    }
  }
  if (profile) await rm(profile, { recursive: true, force: true });
  for (const name of await readdir(repository)) {
    if (name.startsWith('.org.chromium.Chromium.') && !originalDirectories.has(name)) {
      await rm(join(repository, name), { recursive: true, force: true });
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await cleanup(); process.exit(130); });

try {
  await new Promise((resolve, reject) => {
    forwardingProxy.once('error', reject);
    forwardingProxy.listen(3130, '127.0.0.1', resolve);
  });
  profile = await mkdtemp(join(repository, '.capture-'));
  await mkdir(join(profile, 'tmp'), { recursive: true });
  browser = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-breakpad',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--window-size=1280,800', '--force-device-scale-factor=1',
    '--proxy-server=http://127.0.0.1:3130', '--proxy-bypass-list=localhost,127.0.0.1',
    '--ignore-certificate-errors', `--user-data-dir=${profile}`, 'about:blank'
  ], { detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: repository, XDG_CACHE_HOME: join(profile, 'cache'), XDG_CONFIG_HOME: join(profile, 'config') } });
  browser.on('error', error => { spawnFailure = error; });
  browser.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-6000); });
  let debugPort;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (spawnFailure) throw spawnFailure;
    try { debugPort = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (debugPort) break; }
    catch { /* Chromium is still starting. */ }
    if (browser.exitCode !== null || browser.signalCode !== null) throw new Error(`Chromium exited (${browser.exitCode ?? browser.signalCode}) before CDP became available: ` + browserLog);
    await delay(100);
  }
  if (!debugPort) throw new Error('Chromium did not publish its debugging port');
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = await connectCDP(target.webSocketDebuggerUrl);
  await cdp.command('Page.enable');
  await cdp.command('Runtime.enable');
  await cdp.command('Log.enable');
  await cdp.command('Network.enable');
  await mkdir(join(repository, 'screenshots'), { recursive: true });
  for (const shot of manifest) {
    await cdp.command('Emulation.setDeviceMetricsOverride', { ...shot.viewport, deviceScaleFactor: 1, mobile: false });
    await cdp.command('Page.navigate', { url: 'http://localhost:8080/' + shot.path });
    await waitForView(shot.path.endsWith('/leaderboard') ? 'leaderboard' : 'bounty');
    await cdp.evaluate('document.fonts.ready.then(() => true)');
    if (shot.detailScroll) await cdp.evaluate('document.getElementById("detail").scrollTop = ' + Number(shot.detailScroll));
    const probe = await cdp.evaluate(`(() => {
      const board = document.getElementById('board'), detail = document.getElementById('detail');
      const left = board.getBoundingClientRect(), right = detail.getBoundingClientRect();
      return { split: left.right <= right.left && Math.abs(left.top - right.top) < 4,
        boardRows: document.querySelectorAll('.bounty-row:not([hidden])').length,
        leaderboardRows: document.querySelectorAll('.standings tbody tr').length,
        surface: document.getElementById('pane').dataset.surface,
        selected: document.querySelector('.bounty-row.selected')?.dataset.slug,
        heading: document.querySelector('.pane-title')?.textContent };
    })()`);
    if (!probe.split || !probe.boardRows || probe.selected !== 'tiny-chess-01') throw new Error('The capture does not show the persistent split board: ' + JSON.stringify(probe));
    if (shot.path.endsWith('/leaderboard') && (probe.surface !== 'leaderboard' || probe.leaderboardRows !== 50)) throw new Error('Leaderboard window is invalid');
    await delay(200);
    const screenshot = await cdp.command('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: false });
    const bytes = Buffer.from(screenshot.data, 'base64');
    const dimensions = jpegDimensions(bytes);
    if (dimensions.width !== 1280 || dimensions.height !== 800 || bytes.length > 262_144) throw new Error('Capture exceeds its limits: ' + JSON.stringify({ ...dimensions, bytes: bytes.length }));
    await writeFile(join(repository, 'screenshots', shot.file), bytes);
    console.log(`${shot.file}: ${bytes.length} bytes · ${dimensions.width}×${dimensions.height} JPEG · split=${probe.split} · ${probe.boardRows} bounties · ${probe.leaderboardRows} leaderboard rows`);
  }
  if (process.argv.includes('--verify')) await verifyApp();
  if (cdp.exceptions.length) throw new Error('Browser exceptions: ' + cdp.exceptions.join('; '));
  console.log('All three live views captured.');
} finally {
  await cleanup();
}
