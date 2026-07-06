import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "_site");

const args = process.argv.slice(2);
const portArgIndex = args.indexOf("--port");
const portArg = portArgIndex >= 0 ? args[portArgIndex + 1] : undefined;
const port = Number.parseInt(portArg || process.env.PORT || "4173", 10);
const host = process.env.HOST || "127.0.0.1";
const shouldBuild = !args.includes("--no-build");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"]
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid port: ${portArg || process.env.PORT}`);
}

if (shouldBuild) {
  await import("./build-site.mjs");
}

if (!existsSync(join(outDir, "index.html"))) {
  throw new Error("Missing _site/index.html. Run `npm run site:build` first or omit --no-build.");
}

function getFilePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const requestedPath = join(outDir, normalizedPath);
  const relativePath = relative(outDir, requestedPath);

  if (relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) {
    return null;
  }

  if (existsSync(requestedPath) && statSync(requestedPath).isDirectory()) {
    return join(requestedPath, "index.html");
  }

  return requestedPath;
}

const server = createServer((request, response) => {
  const filePath = getFilePath(request.url || "/");

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
});

server.on("error", (error) => {
  console.error(`Could not serve GitHub Pages artifact on http://${host}:${port}/`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Serving GitHub Pages artifact from ${outDir}`);
  console.log(`Local preview: http://${host}:${port}/`);
});
