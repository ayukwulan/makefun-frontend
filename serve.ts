import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = await realpath(fileURLToPath(new URL('./app/', import.meta.url)));
const portFlag = process.argv.indexOf('--port');
const port = portFlag === -1 ? 8080 : Number(process.argv[portFlag + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use --port followed by a port between 1 and 65535.');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.svg', 'image/svg+xml']
]);
const withinApp = filename => filename.startsWith(appDirectory + sep);
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Read-only server');
    return;
  }
  try {
    const route = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    if (route === '/favicon.ico') { response.writeHead(204).end(); return; }
    const requestedFile = resolve(appDirectory, '.' + (route.endsWith('/') ? route + 'index.html' : route));
    if (!withinApp(requestedFile)) { response.writeHead(403).end('Outside the app'); return; }
    const filename = await realpath(requestedFile);
    if (!withinApp(filename)) { response.writeHead(403).end('Outside the app'); return; }
    const details = await stat(filename);
    if (!details.isFile()) { response.writeHead(404).end('File not found'); return; }
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(extname(filename)) || 'application/octet-stream',
      'Content-Length': details.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end(error instanceof URIError ? 'Invalid path' : 'File not found');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`make.fun is available at http://localhost:${port} (app/ only)`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(() => process.exit(0));
  server.closeIdleConnections();
});
