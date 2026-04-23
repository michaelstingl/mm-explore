// Dev server with WebSocket-based live-reload
// Run: bun --hot dev.ts
// Open: http://localhost:8000

import { watch } from "node:fs";
import type { ServerWebSocket } from "bun";

const PORT = 8000;
const ROOT = import.meta.dir;
const sockets = new Set<ServerWebSocket<unknown>>();

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function ts() {
  const d = new Date();
  return c.dim(d.toTimeString().slice(0, 8));
}

function log(icon: string, msg: string) {
  console.log(`${ts()} ${icon} ${msg}`);
}

const pendingChanges = new Set<string>();
const debounced = (() => {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const files = [...pendingChanges];
      pendingChanges.clear();
      const summary = files.length <= 3
        ? files.map(f => c.cyan(f)).join(', ')
        : `${c.cyan(files.slice(0, 2).join(', '))} ${c.dim(`(+${files.length - 2})`)}`;
      log('🔄', `reload → ${sockets.size} client${sockets.size === 1 ? '' : 's'} ${c.dim('·')} ${summary}`);
      sockets.forEach(ws => {
        try { ws.send("reload"); } catch {}
      });
    }, 80);
  };
})();

watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (filename.startsWith(".git") || filename.startsWith("node_modules") || filename.startsWith("local")) return;
  if (filename.startsWith("tools/smoke-out")) return;
  if (filename === "dev.ts" || filename.startsWith("dev.ts.tmp")) return;
  if (filename.endsWith("~") || filename.endsWith(".swp")) return;
  pendingChanges.add(filename);
  debounced();
});

const INJECT = `
<script>
(() => {
  let ws;
  const connect = () => {
    try {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__reload');
      ws.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
      ws.onclose = () => setTimeout(connect, 1000);
      ws.onerror = () => { try { ws.close(); } catch {} };
    } catch {
      setTimeout(connect, 1000);
    }
  };
  connect();
})();
</script>
`;

function logRequest(method: string, path: string, status: number, bytes?: number) {
  const statusColor = status >= 500 ? c.yellow : status >= 400 ? c.yellow : status >= 300 ? c.dim : c.green;
  const sizeStr = bytes != null ? c.dim(` ${(bytes / 1024).toFixed(1)} kB`) : '';
  log(statusColor(String(status)), `${c.dim(method)} ${path}${sizeStr}`);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/__reload") {
      if (server.upgrade(req)) return;
      return new Response("upgrade failed", { status: 500 });
    }

    let path = url.pathname;
    if (path === "/" || path.endsWith("/")) path += "index.html";
    const file = Bun.file(ROOT + path);

    if (!(await file.exists())) {
      logRequest(req.method, url.pathname + url.search, 404);
      return new Response("Not Found", { status: 404 });
    }

    if (path.endsWith(".html")) {
      const text = await file.text();
      const body = text.includes("</body>")
        ? text.replace("</body>", INJECT + "</body>")
        : text + INJECT;
      logRequest(req.method, url.pathname + url.search, 200, new Blob([body]).size);
      return new Response(body, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const size = file.size;
    logRequest(req.method, url.pathname + url.search, 200, size);
    return new Response(file);
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
      log('🔌', c.green(`client connected`) + ` ${c.dim(`(${sockets.size} total)`)}`);
    },
    close(ws) {
      sockets.delete(ws);
      log('💨', c.dim(`client disconnected (${sockets.size} remaining)`));
    },
    message() { /* ignore client messages */ },
  },
});

console.log('');
console.log(`  ${c.bold('M+M Explore')} ${c.dim('· dev server')}`);
console.log(`  ${c.dim('→')} ${c.cyan(`http://localhost:${server.port}`)}`);
console.log(`  ${c.dim('→')} live-reload via WebSocket`);
console.log('');

process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});
