import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  constructGhostTunnelIpUrl,
  resolveGhostTunnelIpRedirect
} = await importLocalghost();

const signingSecret = "ghost-transport-test-secret";
const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";

test("constructs a signed Ghost Tunnel IP URL and resolves it into a direct redirect", () => {
  const sharedUrl = constructGhostTunnelIpUrl({
    domain: "copper-comet.example",
    route: "decisionlayer",
    project: "decision-layer",
    owner: "hamedbahrami",
    path: "/week/1",
    searchParams: {
      view: "coach"
    },
    address: "203.0.113.10",
    signingSecret,
    ghostTunnel: {
      mode: "public",
      domains: "copper-comet.example",
      transport: "ip"
    }
  });

  assert.match(sharedUrl, /__localghost=/);

  const redirect = resolveGhostTunnelIpRedirect({
    requestUrl: sharedUrl,
    host,
    entryPort: 5173,
    signingSecret,
    transport: "ip"
  });

  assert.deepEqual(redirect.target, {
    protocol: "http",
    host: "203.0.113.10",
    port: 5173
  });
  assert.equal(redirect.url, "http://203.0.113.10:5173/week/1?view=coach");
});

test("rejects expired or private-network Ghost Tunnel IP tokens unless explicitly allowed", () => {
  const expiredUrl = constructGhostTunnelIpUrl({
    url: `https://${host}/`,
    address: "203.0.113.10",
    signingSecret,
    expiresAt: new Date(Date.now() - 1_000).toISOString()
  });

  assert.throws(
    () => resolveGhostTunnelIpRedirect({
      requestUrl: expiredUrl,
      host,
      entryPort: 5173,
      signingSecret,
      transport: "ip"
    }),
    /expired/
  );

  const privateUrl = constructGhostTunnelIpUrl({
    url: `https://${host}/demo`,
    address: "192.168.1.10",
    signingSecret,
    allowPrivateNetworkAddress: true
  });

  assert.throws(
    () => resolveGhostTunnelIpRedirect({
      requestUrl: privateUrl,
      host,
      entryPort: 5173,
      signingSecret,
      transport: "ip"
    }),
    /private-network opt-in/
  );

  const redirect = resolveGhostTunnelIpRedirect({
    requestUrl: privateUrl,
    host,
    entryPort: 5173,
    signingSecret,
    transport: {
      kind: "ip",
      allowPrivateNetworkAddress: true
    }
  });

  assert.equal(redirect.url, "http://192.168.1.10:5173/demo");
});
