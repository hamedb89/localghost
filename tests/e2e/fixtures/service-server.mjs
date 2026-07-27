import { createServer } from "node:http";
import { basename } from "node:path";

const port = Number.parseInt(process.env.LOCALGHOST_PORT ?? "", 10);
const server = createServer((request, response) => {
  if (request.url === "/shutdown") {
    response.end("stopping");
    server.close(() => process.exit(0));
    return;
  }

  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    service: process.env.LOCALGHOST_SERVICE,
    cwd: basename(process.cwd()),
    path: request.url,
    localghostPort: process.env.LOCALGHOST_PORT
  }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`${process.env.LOCALGHOST_SERVICE} listening on ${port}`);
});
process.once("SIGINT", () => server.close(() => process.exit(0)));
process.once("SIGTERM", () => server.close(() => process.exit(0)));
