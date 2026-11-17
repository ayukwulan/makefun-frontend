import { createServer as httpServer } from 'node:http';
import { createReadStream as fileStream, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const documentRoot = resolve(fileURLToPath(new URL('app/', import.meta.url)));
const flagPosition = process.argv.indexOf('--port');
const requestedPort = flagPosition === -1 ? 8080 : Number(process.argv[flagPosition + 1]);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 8080;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};
const withinApp = candidate => candidate === documentRoot || candidate.startsWith(documentRoot + sep);

httpServer((request, response) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const relativeUrl = urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath;
  let diskPath = resolve(documentRoot, '.' + relativeUrl);
  if (!withinApp(diskPath)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    diskPath = realpathSync(diskPath);
    if (!withinApp(diskPath)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    const metadata = statSync(diskPath);
    if (!metadata.isFile()) throw new Error('File required');
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': metadata.size,
      'content-type': mime[extname(diskPath).toLowerCase()] || 'application/octet-stream'
    });
    fileStream(diskPath).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`app/ is on http://localhost:${port}`));
