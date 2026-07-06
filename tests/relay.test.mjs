import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  assertRelayLocalTarget,
  createRelayRouteRegistration,
  isRelayRouteActive,
  redactRelayHeaders,
  redactRelayLogUrl,
  renderRelayOfflineResponse,
  signRelayRouteClaim,
  stripRelayForwardHeaders,
  verifyRelayRouteClaim
} = await importLocalghost();

const signingSecret = "test-signing-secret";
const agentToken = "test-agent-token";
const host = "plan-summer-base-hamed.ghost.moonlit-otter.example";
const scope = "socialworkouts:preview";
const expiresAt = () => new Date(Date.now() + 60_000).toISOString();

function signedClaim(overrides = {}) {
  return signRelayRouteClaim({
    host,
    scope,
    agentId: "agent-1",
    expiresAt: expiresAt(),
    ...overrides
  }, signingSecret);
}

function baseRegistration(overrides = {}) {
  const claim = signedClaim(overrides.claim ?? {});
  const input = {
    authorizationHeader: `Bearer ${agentToken}`,
    agentToken,
    claimToken: claim.token,
    signingSecret,
    expectedScope: scope,
    target: { host: "127.0.0.1", port: 5173 },
    passwordProtected: true,
    ...overrides
  };
  delete input.claim;
  return input;
}

test("registers an exact signed route for an authenticated local agent", () => {
  const route = createRelayRouteRegistration(baseRegistration());

  assert.equal(route.host, host);
  assert.equal(route.scope, scope);
  assert.deepEqual(route.target, { protocol: "http", host: "127.0.0.1", port: 5173 });
  assert.equal(route.access, "private");
  assert.equal(route.passwordProtected, true);
  assert.equal(isRelayRouteActive(route, { agentConnected: true }), true);
});

test("rejects unauthenticated route registration", () => {
  assert.throws(
    () => createRelayRouteRegistration(baseRegistration({ authorizationHeader: "Bearer wrong-token" })),
    /authenticated local agent/
  );
});

test("rejects wildcard, tampered, wrong-scope, and expired route claims", () => {
  assert.throws(
    () => signedClaim({ host: "*.ghost.moonlit-otter.example" }),
    /exact hostname/
  );

  const claim = signedClaim();
  assert.throws(
    () => verifyRelayRouteClaim(`${claim.token}x`, signingSecret, { expectedScope: scope }),
    /Invalid relay route claim/
  );

  assert.throws(
    () => createRelayRouteRegistration(baseRegistration({ expectedScope: "other:scope" })),
    /scope mismatch/
  );

  assert.throws(
    () => createRelayRouteRegistration(baseRegistration({
      claim: { expiresAt: new Date(Date.now() - 1_000).toISOString() }
    })),
    /expired/
  );
});

test("allows only explicit configured local targets by default", () => {
  assert.deepEqual(
    assertRelayLocalTarget({ host: "localhost", port: 5173 }),
    { protocol: "http", host: "localhost", port: 5173 }
  );

  assert.deepEqual(
    assertRelayLocalTarget({ protocol: "https", host: "::1", port: 5173 }),
    { protocol: "https", host: "::1", port: 5173 }
  );

  assert.throws(
    () => assertRelayLocalTarget("http://127.0.0.1:5173"),
    /explicit local target object/
  );

  assert.throws(
    () => assertRelayLocalTarget({ host: "http://127.0.0.1", port: 5173 }),
    /Invalid relay target host/
  );

  assert.throws(
    () => assertRelayLocalTarget({ host: "example.com", port: 5173 }),
    /not explicitly allowed/
  );
});

test("blocks dangerous ports and private-network targets unless explicitly opted in", () => {
  for (const port of [22, 2375, 2376, 5432, 6379, 9200, 9229, 27017]) {
    assert.throws(
      () => assertRelayLocalTarget({ host: "127.0.0.1", port }),
      /port is blocked/
    );
  }

  assert.throws(
    () => assertRelayLocalTarget(
      { host: "192.168.1.10", port: 5173 },
      { allowedHosts: ["192.168.1.10"] }
    ),
    /Private-network relay target requires explicit opt-in/
  );

  assert.deepEqual(
    assertRelayLocalTarget(
      { host: "192.168.1.10", port: 5173 },
      { allowedHosts: ["192.168.1.10"], allowPrivateNetworkTargets: true }
    ),
    { protocol: "http", host: "192.168.1.10", port: 5173 }
  );
});

test("keeps previews private unless public mode is explicit", () => {
  assert.throws(
    () => createRelayRouteRegistration(baseRegistration({ passwordProtected: false })),
    /Private relay previews require password or auth/
  );

  assert.throws(
    () => createRelayRouteRegistration(baseRegistration({ access: "public" })),
    /public mode must be explicitly enabled/
  );

  const route = createRelayRouteRegistration(baseRegistration({
    publicMode: true,
    passwordProtected: false
  }));
  assert.equal(route.access, "public");
});

test("expires routes when the agent disconnects or the claim expires", () => {
  const route = createRelayRouteRegistration(baseRegistration());

  assert.equal(isRelayRouteActive(route, { agentConnected: false }), false);
  assert.equal(isRelayRouteActive(route, {
    agentConnected: true,
    now: new Date(Date.parse(route.expiresAt) + 1)
  }), false);
});

test("validates limits before route registration succeeds", () => {
  assert.throws(
    () => createRelayRouteRegistration(baseRegistration({
      limits: { requestBodyBytes: 0 }
    })),
    /Invalid relay limit requestBodyBytes/
  );

  const route = createRelayRouteRegistration(baseRegistration({
    limits: {
      requestBodyBytes: 1024,
      responseBytes: 2048,
      timeoutMs: 3000,
      maxConcurrentRequests: 2,
      perRouteRequestsPerMinute: 3,
      perIpRequestsPerMinute: 4
    }
  }));
  assert.equal(route.limits.requestBodyBytes, 1024);
  assert.equal(route.limits.perIpRequestsPerMinute, 4);
});

test("strips internal forwarding headers and redacts sensitive log data", () => {
  assert.deepEqual(
    stripRelayForwardHeaders({
      Connection: "keep-alive",
      "x-localghost-target": "secret",
      Accept: "text/html",
      Upgrade: "websocket"
    }),
    { Accept: "text/html" }
  );

  assert.deepEqual(
    redactRelayHeaders({
      Authorization: "Bearer secret",
      Cookie: "sid=secret",
      "Set-Cookie": "sid=secret",
      Accept: "text/html"
    }),
    {
      Authorization: "[redacted]",
      Cookie: "[redacted]",
      "Set-Cookie": "[redacted]",
      Accept: "text/html"
    }
  );

  assert.equal(
    redactRelayLogUrl("/preview?token=abc&view=coach&api_key=123"),
    "/preview?token=%5Bredacted%5D&view=coach&api_key=%5Bredacted%5D"
  );
});

test("offline response is safe and cache-disabled", () => {
  const response = renderRelayOfflineResponse();

  assert.equal(response.status, 503);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.body, /Preview offline/);
  assert.doesNotMatch(response.body, /secret|token|stack|trace/i);
});
