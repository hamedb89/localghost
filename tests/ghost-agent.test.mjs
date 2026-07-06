import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  createGhostTunnelQueuedRequest,
  createMemoryGhostTunnelStore,
  decodeGhostTunnelBody,
  serveGhostTunnelLocalRequest,
  startGhostTunnelAgent
} = await importLocalghost();

const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";

async function eventually(read, timeoutMs = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for expected value.");
}

test("serves a queued Ghost Tunnel request against the local target", async () => {
  const request = createGhostTunnelQueuedRequest({
    host,
    method: "POST",
    path: "/api/demo?x=1",
    headers: {
      connection: "keep-alive",
      "content-type": "text/plain",
      "x-demo": "yes"
    },
    body: "payload",
    ttlSeconds: 30
  });

  const response = await serveGhostTunnelLocalRequest({
    request,
    target: { protocol: "http", host: "127.0.0.1", port: 5173 },
    maxResponseBodyBytes: 1024,
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:5173/api/demo?x=1");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.connection, undefined);
      assert.equal(init.headers["x-forwarded-host"], host);
      assert.equal(init.headers["x-localghost-tunnel"], "1");
      assert.equal(Buffer.from(init.body).toString(), "payload");
      return new Response("local-ok", {
        status: 201,
        headers: {
          "content-type": "text/plain"
        }
      });
    }
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers["content-type"], "text/plain");
  assert.equal(decodeGhostTunnelBody(response.bodyBase64)?.toString(), "local-ok");
});

test("Ghost Tunnel agent heartbeats routes and writes local responses", async () => {
  const store = createMemoryGhostTunnelStore();
  const agent = startGhostTunnelAgent({
    entries: [{ host, port: 5173, target: "127.0.0.1:5173" }],
    store,
    agentId: "agent-test",
    pollIntervalMs: 10,
    routeTtlSeconds: 5,
    requestTtlSeconds: 5,
    maxResponseBodyBytes: 1024,
    fetch: async () => new Response("agent-ok", {
      status: 200,
      headers: {
        "content-type": "text/plain"
      }
    })
  });

  try {
    const route = await eventually(() => store.getRoute(host));
    assert.equal(route.agentId, "agent-test");
    assert.deepEqual(route.target, { protocol: "http", host: "127.0.0.1", port: 5173 });

    const request = createGhostTunnelQueuedRequest({
      host,
      method: "GET",
      path: "/",
      ttlSeconds: 5
    });
    await store.enqueueRequest(request, 5);

    const response = await eventually(() => store.readResponse(request.id));
    assert.equal(response.status, 200);
    assert.equal(decodeGhostTunnelBody(response.bodyBase64)?.toString(), "agent-ok");
  } finally {
    agent.stop();
    await agent.done;
  }
});
