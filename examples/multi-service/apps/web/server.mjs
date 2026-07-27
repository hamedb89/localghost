import { createServer } from "node:http";

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

const port = Number.parseInt(process.env.LOCALGHOST_PORT ?? "4173", 10);
const server = createServer((request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html>
<html>
  <head><title>Localghost web example</title></head>
  <body>
    <h1>Web service is ready</h1>
    <dl>
      <dt>Service</dt><dd>${escapeHtml(process.env.LOCALGHOST_SERVICE ?? "web")}</dd>
      <dt>Port</dt><dd>${port}</dd>
      <dt>Path</dt><dd>${escapeHtml(request.url ?? "/")}</dd>
    </dl>
  </body>
</html>`);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`web listening on http://127.0.0.1:${port}`);
});

const stop = () => server.close(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
