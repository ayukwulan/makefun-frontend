import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';

const chromePath = '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const egress = { host: 'fd8b:4f84:7d32:99::1', port: 3128 };
const proxyPort = 3130;
const debugPort = 9222;
const destination = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(destination, { recursive: true });
const shots = [
  { file: '1-board.jpg', route: '#/' },
  { file: '2-bounty.jpg', route: '#/bounty/tiny-chess-01' },
  { file: '3-leaderboard.jpg', route: '#/bounty/tiny-chess-01/leaderboard' },
];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const proxy = net.createServer(client => {
  let incoming = Buffer.alloc(0);
  client.on('data', chunk => {
    incoming = Buffer.concat([incoming, chunk]);
    const stop = incoming.indexOf('\r\n\r\n');
    if (stop < 0) return;
    client.removeAllListeners('data');
    const firstLine = incoming.subarray(0, stop).toString().split('\r\n')[0];
    const match = firstLine.match(/^CONNECT ([^ ]+) HTTP/);
    if (!match) return client.end('HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n');
    const upstream = net.connect(egress.port, egress.host, () => {
      upstream.write(`CONNECT ${match[1]} HTTP/1.1\r\nHost: ${match[1]}\r\nUser-Agent: curl/8.5.0\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
      let response = Buffer.alloc(0);
      const onResponse = data => {
        response = Buffer.concat([response, data]);
        if (response.indexOf('\r\n\r\n') < 0) return;
        upstream.removeListener('data', onResponse);
        client.write(response);
        upstream.pipe(client);
        client.pipe(upstream);
      };
      upstream.on('data', onResponse);
    });
    upstream.on('error', () => client.destroy());
  });
  client.on('error', () => {});
});
await new Promise(resolve => proxy.listen(proxyPort, '127.0.0.1', resolve));
const browser = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${debugPort}`, '--user-data-dir=/tmp/makefun-capture-profile', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--hide-scrollbars', '--window-size=1280,800', `--proxy-server=http://127.0.0.1:${proxyPort}`, '--proxy-bypass-list=localhost,127.0.0.1', '--ignore-certificate-errors', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { browser.kill(); proxy.close(); });
for (let attempt = 0; attempt < 40; attempt++) {
  try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break; } catch {}
  await pause(500);
}
for (const shot of shots) {
  const url = `http://localhost:8080/${shot.route}`;
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
  const send = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  let ready = false;
  for (let n = 0; n < 60; n++) { await pause(500); const result = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }); if (result.result?.result?.value) { ready = true; break; } }
  if (!ready) throw new Error(`Route did not become ready: ${shot.route}`);
  const captured = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  const bytes = Buffer.from(captured.result.data, 'base64');
  writeFileSync(destination + shot.file, bytes);
  console.log(`${shot.file}: ${bytes.length} bytes`);
  socket.close();
}
browser.kill();
proxy.close();
