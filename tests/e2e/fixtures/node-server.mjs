import { createServer } from "node:http";

const port = Number.parseInt(process.env.LOCALGHOST_PORT ?? "", 10);
const server = createServer((request, response) => {
  if (request.url === "/shutdown") {
    response.end("stopping");
    server.close(() => process.exit(0));
    return;
  }

  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    runtime: "node",
    path: request.url,
    localghostPort: process.env.LOCALGHOST_PORT,
    vitePort: process.env.VITE_PORT
  }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`E2E_READY ${JSON.stringify({ runtime: "node", port })}`);
});

process.once("SIGINT", () => server.close(() => process.exit(0)));
process.once("SIGTERM", () => server.close(() => process.exit(0)));
