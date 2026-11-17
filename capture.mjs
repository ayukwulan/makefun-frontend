import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.',import.meta.url));
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const DEBUG = 9222, PROXY = 3130;
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const sockets = new Set();
const profile = ROOT + '.capture-profile';
let browser;
const forwarder = createServer(client => {
  sockets.add(client);
  client.on('close',() => sockets.delete(client));
  client.on('error',() => {});
  let header = Buffer.alloc(0);
  function handshake(chunk) {
    header = Buffer.concat([header,chunk]);
    const end = header.indexOf('\r\n\r\n');
    if (end < 0) { if (header.length > 16384) client.destroy(); return; }
    client.removeListener('data',handshake);
    const match = header.toString().match(/^CONNECT ([^\s]+) HTTP\/1\.[01]\r\n/);
    if (!match) { client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'); return; }
    const upstream = connect(3128,'fd8b:4f84:7d32:99::1');
    sockets.add(upstream);
    upstream.on('close',() => { sockets.delete(upstream); client.destroy(); });
    client.on('close',() => upstream.destroy());
    upstream.on('error',() => client.destroy());
    upstream.on('connect',() => {
      upstream.write(`CONNECT ${match[1]} HTTP/1.1\r\nHost: ${match[1]}\r\nUser-Agent: curl/8.5.0\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
      const extra = header.subarray(end + 4);
      if (extra.length) upstream.write(extra);
      // The response and then the TLS stream pass through unchanged.
      upstream.pipe(client); client.pipe(upstream);
    });
  }
  client.on('data',handshake);
});

async function cdp(url) {
  const ws = new WebSocket(url), waiting = new Map();
  let serial = 0;
  await new Promise((resolve,reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    const pending = waiting.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer); waiting.delete(message.id);
    message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
  };
  ws.onclose = () => { for (const p of waiting.values()) { clearTimeout(p.timer); p.reject(new Error('CDP connection closed.')); } waiting.clear(); };
  return { close: () => ws.close(), send: (method,params = {}) => new Promise((resolve,reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('CDP timeout: ' + method)); },15000);
    waiting.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params}));
  }) };
}
async function evaluate(session,expression) {
  const reply = await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text);
  return reply.result.value;
}
async function capture(shot) {
  const response = await fetch(`http://127.0.0.1:${DEBUG}/json/new?about:blank`,{method:'PUT'});
  const target = await response.json(), session = await cdp(target.webSocketDebuggerUrl);
  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride',{...shot.viewport,deviceScaleFactor:1,mobile:false});
    await session.send('Page.navigate',{url:'http://localhost:8080/' + shot.path});
    await waitForRender(session,shot.path);
    await evaluate(session,'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const {data} = await session.send('Page.captureScreenshot',{format:'jpeg',quality:82,clip:{x:0,y:0,width:shot.viewport.width,height:shot.viewport.height,scale:1},captureBeyondViewport:false});
    const bytes = Buffer.from(data,'base64');
    if (bytes.length > 262144) throw new Error(shot.file + ' exceeds 256 KiB.');
    await writeFile(ROOT + 'screenshots/' + shot.file,bytes);
    const title = await evaluate(session,"document.querySelector('h1').textContent");
    console.log(`${shot.file}: ${bytes.length} bytes, ${shot.viewport.width}x${shot.viewport.height}, live data ready — ${title}`);
  } finally { session.close(); await fetch(`http://127.0.0.1:${DEBUG}/json/close/${target.id}`); }
}
async function waitForRender(session,path,allowError = false) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await delay(400);
    if (!await evaluate(session,'window.__shotReady === true')) continue;
    const error = await evaluate(session,'window.__routeError');
    if (error && !allowError) throw new Error('Route failed: ' + error);
    return;
  }
  throw new Error('Route did not render: ' + path);
}
async function verify() {
  const target = await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?about:blank`,{method:'PUT'})).json();
  const session = await cdp(target.webSocketDebuggerUrl);
  const assert = async (expression,label) => { if (!await evaluate(session,expression)) throw new Error('Verification failed: ' + label); console.log('PASS ' + label); };
  const navigate = async path => {
    await evaluate(session,"window.__shotReady = false");
    await session.send('Page.navigate',{url:'http://localhost:8080/' + path});
    await waitForRender(session,path);
  };
  const hash = async (path,allowError = false) => { await evaluate(session,`window.__shotReady = false; location.hash = ${JSON.stringify(path)}`); await waitForRender(session,path,allowError); };
  try {
    await session.send('Page.enable');
    await session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await navigate('#/');
    await assert("document.querySelectorAll('.bounty-row').length > 0",'board renders live bounties');
    await assert("!performance.getEntriesByType('resource').some(r => r.name.endsWith('/pages.js') || r.name.endsWith('/pages.css'))",'board keeps detail assets deferred');
    await evaluate(session,"const search = document.querySelector('[name=q]'); search.focus(); search.value='chess'; search.dispatchEvent(new Event('input',{bubbles:true}));");
    await assert("document.querySelectorAll('.bounty-row').length > 0 && [...document.querySelectorAll('.bounty-title')].every(n => /chess/i.test(n.textContent)) && document.activeElement.name === 'q'",'search filters and preserves focus');
    await evaluate(session,"document.querySelector('[name=q]').value=''; const state=document.querySelector('[name=state]'); state.value='ended'; state.dispatchEvent(new Event('change',{bubbles:true}));");
    await assert("[...document.querySelectorAll('[data-deadline]')].every(n => Date.parse(n.dataset.deadline) <= Date.now())",'ended state follows deadlines');
    await session.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await assert("document.documentElement.scrollWidth <= 390",'mobile board fits the viewport');
    await hash('#/bounty/tiny-chess-01');
    await assert("document.querySelectorAll('.rewards tbody tr').length === 20 && document.querySelectorAll('.submission').length === 8",'all rewards and latest eight submissions');
    await assert("document.documentElement.scrollWidth <= 390",'mobile bounty fits the viewport');
    await hash('#/bounty/tiny-chess-01/leaderboard');
    await assert("document.querySelectorAll('.standings tbody tr').length === 50",'leaderboard starts at 50 rows');
    await assert("document.documentElement.scrollWidth <= 390 && document.querySelector('.table-scroll').scrollWidth > document.querySelector('.table-scroll').clientWidth",'mobile tables scroll within the page');
    await evaluate(session,"window.firstRow = document.querySelector('tbody tr'); document.querySelector('#show-more').click();");
    await assert("document.querySelectorAll('tbody tr').length === 100 && document.querySelector('tbody tr') === window.firstRow",'show more appends fifty and retains existing rows');
    await evaluate(session,"document.querySelector('.view-tabs a:not(.selected)').click()");
    await waitForRender(session,'leaderboard view');
    await assert("location.hash.includes('?view=') && document.querySelectorAll('.view-tabs [aria-current=page]').length === 1",'view tabs update the API-backed route');
    await evaluate(session,"document.querySelector('.maker').click()");
    await waitForRender(session,'linked maker');
    await assert("location.hash.startsWith('#/u/') && document.querySelectorAll('.record>div').length === 5",'maker links open profile records');
    await hash('#/u/eraerla');
    await assert("document.querySelector('h1').textContent === 'eraerla' && Number(document.querySelector('.record strong').textContent) > 0",'profile URL renders API record fields');
    await assert("document.documentElement.scrollWidth <= 390",'mobile profile fits the viewport');
    await hash('#/does-not-exist',true);
    await assert("!!document.querySelector('#retry') && document.querySelector('main').getAttribute('aria-busy') === 'false'",'unknown routes have a recoverable error state');
    await hash('#/');
    await assert("document.querySelectorAll('.bounty-row').length > 0",'navigation recovers from an invalid route');
  } finally { session.close(); await fetch(`http://127.0.0.1:${DEBUG}/json/close/${target.id}`); }
}
try {
  await new Promise((resolve,reject) => { forwarder.once('error',reject); forwarder.listen(PROXY,'127.0.0.1',resolve); });
  browser = spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--hide-scrollbars','--window-size=1280,800','--ignore-certificate-errors',`--remote-debugging-port=${DEBUG}`,`--user-data-dir=${profile}`,`--proxy-server=http://127.0.0.1:${PROXY}`,'--proxy-bypass-list=localhost,127.0.0.1','about:blank'],{stdio:'ignore',detached:true});
  let started = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { const response = await fetch(`http://127.0.0.1:${DEBUG}/json/version`); if (response.ok) { started = true; break; } } catch {}
    await delay(250);
  }
  if (!started) throw new Error('Chromium did not start.');
  await mkdir(ROOT + 'screenshots',{recursive:true});
  const shots = JSON.parse(await readFile(ROOT + 'shots.json','utf8'));
  for (const shot of shots) await capture(shot);
  if (process.argv.includes('--verify')) await verify();
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (browser && browser.exitCode === null) {
    const stopped = new Promise(resolve => browser.once('exit',resolve));
    process.kill(-browser.pid,'SIGTERM');
    await Promise.race([stopped,delay(3000)]);
    if (browser.exitCode === null) { browser.kill('SIGKILL'); await stopped; }
  }
  // Helpers can outlive the main Chrome process briefly and still write to disk.
  if (browser?.pid) { try { process.kill(-browser.pid,'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  for (const socket of sockets) socket.destroy();
  if (forwarder.listening) await new Promise(resolve => forwarder.close(resolve));
  await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});
}
