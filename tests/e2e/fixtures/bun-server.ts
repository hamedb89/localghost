const port = Number.parseInt(process.env.LOCALGHOST_PORT ?? "", 10);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    if (new URL(request.url).pathname === "/shutdown") {
      setTimeout(() => {
        server.stop();
        process.exit(0);
      }, 10);
      return new Response("stopping");
    }

    return Response.json({
      runtime: "bun",
      path: new URL(request.url).pathname,
      localghostPort: process.env.LOCALGHOST_PORT,
      vitePort: process.env.VITE_PORT
    });
  }
});

console.log(`E2E_READY ${JSON.stringify({ runtime: "bun", port: server.port })}`);

process.once("SIGINT", () => {
  server.stop();
  process.exit(0);
});
process.once("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
