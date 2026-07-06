import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  createGhostTunnelQueuedRequest,
  createGhostTunnelRouteHeartbeat,
  createMemoryGhostTunnelStore,
  decodeGhostTunnelBody,
  encodeGhostTunnelBody,
  resolveRedisGhostTunnelEnv
} = await importLocalghost();

const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";
const target = { protocol: "http", host: "127.0.0.1", port: 5173 };

test("memory Ghost Tunnel store tracks route heartbeats, queues, and responses", async () => {
  const store = createMemoryGhostTunnelStore();
  const route = createGhostTunnelRouteHeartbeat({
    host,
    agentId: "agent-1",
    target,
    ttlSeconds: 30
  });

  await store.heartbeatRoute(route, 30);
  assert.deepEqual(await store.getRoute(host), route);

  const request = createGhostTunnelQueuedRequest({
    host,
    method: "post",
    path: "/week/1?view=coach",
    headers: { "content-type": "text/plain" },
    body: "hello",
    ttlSeconds: 30
  });
  await store.enqueueRequest(request, 30);

  const claimed = await store.claimRequest(host);
  assert.equal(claimed?.id, request.id);
  assert.equal(claimed?.method, "POST");
  assert.equal(decodeGhostTunnelBody(claimed?.bodyBase64)?.toString(), "hello");
  assert.equal(await store.claimRequest(host), null);

  await store.writeResponse({
    id: request.id,
    status: 202,
    headers: { "content-type": "text/plain" },
    createdAt: new Date().toISOString(),
    bodyBase64: encodeGhostTunnelBody("accepted")
  }, 30);

  const response = await store.readResponse(request.id);
  assert.equal(response?.status, 202);
  assert.equal(decodeGhostTunnelBody(response?.bodyBase64)?.toString(), "accepted");

  await store.cleanup(request.id);
  assert.equal(await store.readResponse(request.id), null);
});

test("Redis Ghost Tunnel env resolution prefers explicit Localghost vars", () => {
  assert.deepEqual(resolveRedisGhostTunnelEnv({
    LOCALGHOST_REDIS_REST_URL: "https://localghost-redis.example",
    LOCALGHOST_REDIS_REST_TOKEN: "localghost-token",
    UPSTASH_REDIS_REST_URL: "https://upstash.example",
    UPSTASH_REDIS_REST_TOKEN: "upstash-token"
  }), {
    url: "https://localghost-redis.example",
    token: "localghost-token",
    source: "localghost"
  });

  assert.deepEqual(resolveRedisGhostTunnelEnv({
    KV_REST_API_URL: "https://kv.example",
    KV_REST_API_TOKEN: "kv-token"
  }), {
    url: "https://kv.example",
    token: "kv-token",
    source: "vercel-kv"
  });

  assert.throws(
    () => resolveRedisGhostTunnelEnv({}),
    /REST env vars/
  );
});
