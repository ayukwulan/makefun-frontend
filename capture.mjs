import { spawn as launchProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect as openSocket, createServer as tcpServer } from 'node:net';
import { fileURLToPath as localPath } from 'node:url';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const plans = JSON.parse(readFileSync(new URL('shots.json', import.meta.url), 'utf8'));
const imageFolder = new URL('screenshots/', import.meta.url);
const browserFolder = localPath(new URL('.capture-profile', import.meta.url));
const debuggingOrigin = 'http://127.0.0.1:9222';
const appOrigin = 'http://localhost:8080/';
const connections = new Set();
mkdirSync(imageFolder, { recursive: true });

function track(socket) {
  connections.add(socket);
  socket.once('close', () => connections.delete(socket));
  return socket;
}

// Reissue CONNECT with curl's headers, which the VM's egress gateway accepts.
const forwardingProxy = tcpServer(browserSocket => {
  track(browserSocket);
  browserSocket.on('error', () => {});
  let received = Buffer.alloc(0);
  function readConnect(fragment) {
    received = Buffer.concat([received, fragment]);
    const separator = received.indexOf('\r\n\r\n');
    if (separator < 0) return;
    browserSocket.off('data', readConnect);
    const requestLine = received.toString().split('\r\n')[0];
    const destination = requestLine.match(/^CONNECT ([^ ]+) HTTP/);
    if (!destination) {
      browserSocket.end('HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    browserSocket.pause();
    const remainder = received.subarray(separator + 4);
    const gateway = track(openSocket({ port: 3128, host: 'fd8b:4f84:7d32:99::1' }));
    gateway.once('connect', () => {
      const authority = destination[1];
      gateway.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nUser-Agent: curl/8.5.0\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });
    let responseHeader = Buffer.alloc(0);
    function readResponse(bytes) {
      responseHeader = Buffer.concat([responseHeader, bytes]);
      if (responseHeader.indexOf('\r\n\r\n') < 0) return;
      gateway.off('data', readResponse);
      browserSocket.write(responseHeader);
      if (remainder.length) gateway.write(remainder);
      gateway.pipe(browserSocket);
      browserSocket.pipe(gateway);
      browserSocket.resume();
    }
    gateway.on('data', readResponse);
    gateway.on('error', () => browserSocket.destroy());
    browserSocket.once('close', () => gateway.destroy());
  }
  browserSocket.on('data', readConnect);
});

await new Promise((resolve, reject) => {
  forwardingProxy.once('error', reject);
  forwardingProxy.listen(3130, '127.0.0.1', resolve);
});

const browser = launchProcess('/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--no-first-run', '--hide-scrollbars', '--window-size=1280,800',
  '--remote-debugging-port=9222', '--user-data-dir=' + browserFolder,
  '--proxy-server=http://127.0.0.1:3130', '--proxy-bypass-list=localhost,127.0.0.1',
  '--ignore-certificate-errors', 'about:blank'
], { stdio: 'ignore' });
let launchFailure;
const browserStopped = new Promise(resolve => {
  browser.once('exit', resolve);
  browser.once('error', error => { launchFailure = error; resolve(); });
});
const stopProcesses = () => {
  browser.kill();
  for (const socket of connections) socket.destroy();
  forwardingProxy.close();
};
process.once('exit', stopProcesses);

async function awaitDebugger() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (launchFailure) throw launchFailure;
    try {
      const response = await fetch(debuggingOrigin + '/json/version');
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error('Chromium did not expose its debugging port');
}

async function openPage() {
  const response = await fetch(debuggingOrigin + '/json/new?about%3Ablank', { method: 'PUT' });
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let serial = 0;
  const callbacks = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = callbacks.get(message.id);
    if (!waiter) return;
    callbacks.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const waiter of callbacks.values()) waiter.reject(new Error('Chromium closed the page connection'));
    callbacks.clear();
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      callbacks.set(id, { resolve, reject });
      socket.send(JSON.stringify({ method, params, id }));
    });
  }
  return { socket, send };
}

async function recordRoute(plan) {
  const { socket, send } = await openPage();
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: plan.viewport.width, height: plan.viewport.height,
      mobile: false, deviceScaleFactor: 1
    });
    await send('Page.navigate', { url: appOrigin + plan.path });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await delay(500);
      const evaluated = await send('Runtime.evaluate', {
        returnByValue: true, expression: 'window.__shotReady === true'
      });
      if (evaluated.result?.value) { ready = true; break; }
    }
    if (!ready) throw new Error('Route did not become ready: ' + plan.path);
    const renderedError = await send('Runtime.evaluate', {
      returnByValue: true, expression: 'document.querySelector("#app .error")?.textContent || ""'
    });
    if (renderedError.result?.value) throw new Error(`Cannot capture ${plan.path}: ${renderedError.result.value}`);
    const frame = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    const bytes = Buffer.from(frame.data, 'base64');
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error('Chromium returned an invalid JPEG for ' + plan.file);
    }
    if (bytes.length > 262_144) throw new Error('Screenshot exceeds 256 KiB: ' + plan.file);
    writeFileSync(new URL(plan.file, imageFolder), bytes);
    console.log(`${plan.file}: ${bytes.length} bytes`);
  } finally {
    socket.close();
  }
}

try {
  await awaitDebugger();
  for (const plan of plans) await recordRoute(plan);
} finally {
  stopProcesses();
  await browserStopped;
  process.removeListener('exit', stopProcesses);
  rmSync(browserFolder, { force: true, recursive: true });
}
