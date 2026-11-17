import { createServer } from 'node:http';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./app',import.meta.url));
const flag = process.argv.indexOf('--port');
const port = flag < 0 ? 8080 : Number(process.argv[flag + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port requires an integer from 1 to 65535.');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png' };
const inside = path => path.startsWith(root + sep);
const server = createServer((request,response) => {
  if (!['GET','HEAD'].includes(request.method || '')) { response.writeHead(405,{Allow:'GET, HEAD'}).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/','http://localhost').pathname);
    const candidate = resolve(root,'.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!inside(candidate)) { response.writeHead(403).end('Forbidden'); return; }
    const path = realpathSync(candidate);
    if (!inside(path)) { response.writeHead(403).end('Forbidden'); return; }
    const file = statSync(path);
    if (!file.isFile()) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type':(types[extname(path)] || 'application/octet-stream') + (['.html','.js','.css','.json'].includes(extname(path)) ? '; charset=utf-8' : ''), 'Content-Length':file.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(path).on('error',() => response.destroy()).pipe(response);
  } catch (error) { response.writeHead(error instanceof URIError ? 400 : 404).end('Not found'); }
});
server.on('error',error => { console.error(error.message); process.exitCode = 1; });
server.listen(port,'127.0.0.1',() => console.log(`Serving make.fun at http://localhost:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => process.exit(0)));
