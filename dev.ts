// Simple dev server with live-reload for mm-explore
// Run: bun dev.ts
// Open: http://localhost:8000

import { watch } from "node:fs";

const PORT = 8000;
const ROOT = import.meta.dir;
const clients = new Set<(msg: string) => void>();

// Watch files, notify all connected SSE clients on any change
const debounced = (() => {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      clients.forEach(send => send("reload"));
    }, 80);
  };
})();

const watcher = watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (filename.startsWith(".git") || filename.startsWith("node_modules") || filename.startsWith("local")) return;
  if (filename.endsWith("~") || filename.endsWith(".swp")) return;
  console.log(`[watch] ${filename} changed`);
  debounced();
});

const INJECT = `
<script>
(() => {
  let es;
  const connect = () => {
    es = new EventSource('/__reload');
    es.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
    es.onerror = () => { es.close(); setTimeout(connect, 1000); };
  };
  connect();
})();
</script>
`;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // SSE endpoint for reload notifications
    if (url.pathname === "/__reload") {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const sendRaw = (chunk: string) => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {}
          };
          const send = (msg: string) => sendRaw(`data: ${msg}\n\n`);
          clients.add(send);
          send("hello");
          // Keep-alive ping every 15s (SSE comment, ignored by client)
          const keepalive = setInterval(() => sendRaw(`: ping\n\n`), 15_000);
          req.signal.addEventListener("abort", () => {
            clearInterval(keepalive);
            clients.delete(send);
            try { controller.close(); } catch {}
          });
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Static file serving
    let path = url.pathname;
    if (path === "/" || path.endsWith("/")) path += "index.html";
    const file = Bun.file(ROOT + path);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });

    // Inject live-reload snippet into HTML
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
});

console.log(`[dev] serving ${ROOT}`);
console.log(`[dev] http://localhost:${server.port}`);
console.log(`[dev] live-reload active`);

process.on("SIGINT", () => {
  watcher.close();
  server.stop();
  process.exit(0);
});
