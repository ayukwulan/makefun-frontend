import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer, connect } from "node:net";
import { fileURLToPath } from "node:url";
const wait = duration => new Promise(done => setTimeout(done, duration));
const captureRoot = new URL("./screenshots/", import.meta.url);
const profileDirectory = fileURLToPath(new URL("./.capture-profile", import.meta.url));
const definitions = JSON.parse(readFileSync(new URL("./shots.json", import.meta.url), "utf8"));
mkdirSync(captureRoot, { recursive: true });
// The egress gateway accepts curl's CONNECT handshake; relay Chromium's tunnels through it.
const relay = createServer(downstream => {
  let header = Buffer.alloc(0);
  const readHandshake = chunk => {
    header = Buffer.concat([header, chunk]);
    const boundary = header.indexOf("\r\n\r\n");
    if (boundary === -1) return;
    downstream.off("data", readHandshake);
    const target = /^CONNECT ([^ ]+) HTTP/.exec(header.toString().split("\r\n")[0]);
    if (!target) { downstream.end("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n"); return; }
    const tunnel = connect({ host: "fd8b:4f84:7d32:99::1", port: 3128 }, () => {
      tunnel.write([`CONNECT ${target[1]} HTTP/1.1`, `Host: ${target[1]}`, "User-Agent: curl/8.5.0", "Proxy-Connection: Keep-Alive", "", ""].join("\r\n"));
      let reply = Buffer.alloc(0);
      const establish = bytes => {
        reply = Buffer.concat([reply, bytes]);
        if (reply.indexOf("\r\n\r\n") === -1) return;
        tunnel.off("data", establish);
        downstream.write(reply);
        tunnel.pipe(downstream);
        downstream.pipe(tunnel);
      };
      tunnel.on("data", establish);
    });
    tunnel.on("error", () => downstream.destroy());
  };
  downstream.on("data", readHandshake);
  downstream.on("error", () => {});
});
await new Promise(done => relay.listen(3130, "127.0.0.1", done));
const chromium = spawn("/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", [
  "--headless=new", "--remote-debugging-port=9222", `--user-data-dir=${profileDirectory}`,
  "--no-sandbox", "--disable-gpu", "--disable-background-networking", "--no-first-run",
  "--hide-scrollbars", "--window-size=1280,800", "--proxy-server=http://127.0.0.1:3130",
  "--proxy-bypass-list=localhost,127.0.0.1", "--ignore-certificate-errors", "about:blank"
], { stdio: "ignore" });
const debugUrl = "http://127.0.0.1:9222";
process.on("exit", () => { chromium.kill(); relay.close(); });
async function connectPage(url) {
  const tab = await (await fetch(`${debugUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const channel = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((done, fail) => { channel.onopen = done; channel.onerror = fail; });
  const awaiting = new Map();
  let nextId = 0;
  channel.onmessage = event => {
    const packet = JSON.parse(event.data);
    const callback = awaiting.get(packet.id);
    if (callback) { awaiting.delete(packet.id); callback(packet); }
  };
  const command = (method, params = {}) => new Promise((done, fail) => {
    const id = ++nextId;
    awaiting.set(id, packet => packet.error ? fail(Error(packet.error.message)) : done(packet.result));
    channel.send(JSON.stringify({ id, method, params }));
  });
  return { channel, command };
}
try {
  for (let retry = 0; retry < 40; retry++) {
    try { if ((await fetch(debugUrl + "/json/version")).ok) break; } catch {}
    await wait(500);
  }
  for (const definition of definitions) {
    const address = "http://localhost:8080/" + definition.path;
    const { channel, command } = await connectPage(address);
    try {
      await command("Page.enable");
      await command("Runtime.enable");
      await command("Emulation.setDeviceMetricsOverride", { ...definition.viewport, deviceScaleFactor: 1, mobile: false });
      await command("Page.navigate", { url: address });
      let rendered = false;
      for (let retry = 0; retry < 60; retry++) {
        await wait(500);
        const evaluation = await command("Runtime.evaluate", { expression: "window.__shotReady === true", returnByValue: true });
        if (evaluation.result?.value) { rendered = true; break; }
      }
      if (!rendered) throw Error(`Route did not become ready: ${definition.path}`);
      const failure = await command("Runtime.evaluate", { expression: 'document.querySelector("#app .error")?.textContent || ""', returnByValue: true });
      if (failure.result?.value) throw Error(`Cannot capture ${definition.path}: ${failure.result.value}`);
      const screenshot = await command("Page.captureScreenshot", { quality: 82, format: "jpeg" });
      const jpeg = Buffer.from(screenshot.data, "base64");
      writeFileSync(new URL(definition.file, captureRoot), jpeg);
      console.log(`${definition.file}: ${jpeg.length} bytes`);
    } finally { channel.close(); }
  }
} finally {
  chromium.kill();
  relay.close();
  await new Promise(done => chromium.once("exit", done));
  rmSync(profileDirectory, { recursive: true, force: true });
}
