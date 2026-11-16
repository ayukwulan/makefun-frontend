// Serve the unbundled frontend with Node's built-in HTTP and filesystem modules.
import { createServer } from "node:http";
import { createReadStream, statSync, realpathSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const publicDirectory = fileURLToPath(new URL("./app", import.meta.url));
const portFlag = process.argv.indexOf("--port");
const candidate = portFlag < 0 ? 8080 : Number(process.argv[portFlag + 1]);
const listenPort = Number.isInteger(candidate) && candidate > 0 && candidate < 65536 ? candidate : 8080;
const types: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json"
};
createServer((incoming, outgoing) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(incoming.url || "/", "http://localhost").pathname); }
  catch { outgoing.writeHead(400).end("bad request"); return; }
  if (pathname.endsWith("/")) pathname += "index.html";
  let filename = resolve(publicDirectory, "." + pathname);
  const inside = name => name === publicDirectory || name.startsWith(publicDirectory + sep);
  if (!inside(filename)) { outgoing.writeHead(403).end("forbidden"); return; }
  try {
    filename = realpathSync(filename);
    if (!inside(filename)) { outgoing.writeHead(403).end("forbidden"); return; }
    const info = statSync(filename);
    if (!info.isFile()) throw Error("Expected a regular file");
    outgoing.writeHead(200, { "content-type": types[extname(filename).toLowerCase()] || "application/octet-stream", "content-length": info.size, "cache-control": "no-store" });
    createReadStream(filename).pipe(outgoing);
  } catch { outgoing.writeHead(404).end("not found"); }
}).listen(listenPort, "127.0.0.1", () => console.log(`app/ is on http://localhost:${listenPort}`));
