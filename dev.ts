// Dev server with WebSocket-based live-reload
// Run: bun --hot dev.ts
// Open: http://localhost:8000

import { watch } from "node:fs";
import type { ServerWebSocket } from "bun";

const PORT = 8000;
const ROOT = import.meta.dir;
const sockets = new Set<ServerWebSocket<unknown>>();

const debounced = (() => {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      sockets.forEach(ws => {
        try { ws.send("reload"); } catch {}
      });
    }, 80);
  };
})();

watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (filename.startsWith(".git") || filename.startsWith("node_modules") || filename.startsWith("local")) return;
  if (filename === "dev.ts") return; // don't trigger on dev-server edits
  if (filename.endsWith("~") || filename.endsWith(".swp")) return;
  console.log(`[watch] ${filename} changed`);
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
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });

    if (path.endsWith(".html")) {
      const text = await file.text();
      const body = text.includes("</body>")
        ? text.replace("</body>", INJECT + "</body>")
        : text + INJECT;
      return new Response(body, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(file);
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
    },
    close(ws) {
      sockets.delete(ws);
    },
    message() { /* ignore client messages */ },
  },
});

console.log(`[dev] ${ROOT}`);
console.log(`[dev] http://localhost:${server.port}`);
console.log(`[dev] live-reload via websocket`);

process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});
