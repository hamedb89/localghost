import { createServer } from "node:http";

const port = Number.parseInt(process.env.LOCALGHOST_PORT ?? "8787", 10);
const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    ok: true,
    service: process.env.LOCALGHOST_SERVICE ?? "api",
    port,
    path: request.url
  }, null, 2));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`api listening on http://127.0.0.1:${port}`);
});

const stop = () => server.close(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
