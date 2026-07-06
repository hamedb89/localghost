import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { createVercelGhostTunnelHandler } = await importLocalghost();

function createResponseRecorder() {
  const headers = {};
  let body = "";

  return {
    headers,
    body,
    statusCode: 200,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(value) {
      body = value;
      this.body = value;
    }
  };
}

test("vercel ghost tunnel handler returns offline for configured exact routes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-vercel-handler-"));
  const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    mode: 'public',",
    "    domains: 'copper-comet.example',",
    "    requireAuth: false,",
    "    adapter: 'vercel'",
    "  }",
    "};",
    ""
  ].join("\n"));
  await writeFile(join(cwd, ".ghosttunnel"), `${host} 5173\n`);

  const handler = createVercelGhostTunnelHandler({
    cwd,
    domain: "copper-comet.example",
    authenticated: false
  });
  const response = createResponseRecorder();

  await handler({
    headers: {
      host,
      "x-forwarded-proto": "https"
    }
  }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["x-localghost-relay"], "offline");
  assert.equal(response.headers["x-localghost-entry"], "configured");
  assert.match(response.body, /Ghost Tunnel offline/);
});
