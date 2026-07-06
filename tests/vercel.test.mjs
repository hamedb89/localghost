import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  constructGhostTunnelIpUrl,
  createGhostTunnelRouteHeartbeat,
  createMemoryGhostTunnelStore,
  decodeGhostTunnelBody,
  encodeGhostTunnelBody,
  createVercelGhostTunnelHandler
} = await importLocalghost();

async function eventually(read, timeoutMs = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for expected value.");
}

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

test("vercel ghost tunnel handler redirects signed IP transport requests", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-vercel-ip-handler-"));
  const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";
  const signingSecret = "vercel-ip-handler-test-secret";
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    mode: 'public',",
    "    domains: 'copper-comet.example',",
    "    requireAuth: false,",
    "    adapter: 'vercel',",
    "    transport: 'ip'",
    "  }",
    "};",
    ""
  ].join("\n"));
  await writeFile(join(cwd, ".ghosttunnel"), `${host} 5173\n`);

  const requestUrl = constructGhostTunnelIpUrl({
    url: `https://${host}/week/1?view=coach`,
    address: "203.0.113.10",
    signingSecret
  });

  const handler = createVercelGhostTunnelHandler({
    cwd,
    domain: "copper-comet.example",
    authenticated: false,
    ipSigningSecret: signingSecret
  });
  const response = createResponseRecorder();
  const url = new URL(requestUrl);

  await handler({
    url: `${url.pathname}${url.search}`,
    headers: {
      host,
      "x-forwarded-proto": "https"
    }
  }, response);

  assert.equal(response.statusCode, 307);
  assert.equal(response.headers["x-localghost-relay"], "ip");
  assert.equal(response.headers.location, "http://203.0.113.10:5173/week/1?view=coach");
  assert.match(response.body, /Redirecting to/);
});

test("vercel ghost tunnel handler relays tunnel transport through the store", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-vercel-tunnel-handler-"));
  const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    mode: 'public',",
    "    domains: 'copper-comet.example',",
    "    requireAuth: false,",
    "    adapter: 'vercel',",
    "    transport: {",
    "      kind: 'tunnel',",
    "      waitMs: 500,",
    "      pollIntervalMs: 10",
    "    }",
    "  }",
    "};",
    ""
  ].join("\n"));
  await writeFile(join(cwd, ".ghosttunnel"), `${host} 5173\n`);

  const store = createMemoryGhostTunnelStore();
  await store.heartbeatRoute(createGhostTunnelRouteHeartbeat({
    host,
    agentId: "agent-1",
    target: { protocol: "http", host: "127.0.0.1", port: 5173 },
    ttlSeconds: 30
  }), 30);

  const handler = createVercelGhostTunnelHandler({
    cwd,
    domain: "copper-comet.example",
    authenticated: false,
    tunnelStore: store
  });
  const response = createResponseRecorder();

  const handled = handler({
    url: "/week/1?view=coach",
    method: "POST",
    headers: {
      host,
      "x-forwarded-proto": "https",
      "content-type": "text/plain",
      connection: "keep-alive"
    },
    async *[Symbol.asyncIterator]() {
      yield "from-vercel";
    }
  }, response);

  const queued = await eventually(() => store.claimRequest(host));
  assert.equal(queued.method, "POST");
  assert.equal(queued.path, "/week/1?view=coach");
  assert.equal(queued.headers.connection, undefined);
  assert.equal(queued.headers["content-type"], "text/plain");
  assert.equal(decodeGhostTunnelBody(queued.bodyBase64)?.toString(), "from-vercel");

  await store.writeResponse({
    id: queued.id,
    status: 202,
    headers: {
      "content-type": "text/plain"
    },
    createdAt: new Date().toISOString(),
    bodyBase64: encodeGhostTunnelBody("from-local")
  }, 30);

  await handled;

  assert.equal(response.statusCode, 202);
  assert.equal(response.headers["x-localghost-relay"], "tunnel");
  assert.equal(response.headers["content-type"], "text/plain");
  assert.equal(response.body, "from-local");
});
