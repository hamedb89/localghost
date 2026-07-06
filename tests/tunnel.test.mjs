import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  assertSecureGhostTunnelRequest,
  constructGhostTunnelHost,
  constructGhostTunnelURL,
  constructGhostTunnelUrl,
  getGhostTunnelWildcardHost,
  parseGhostTunnelHost,
  resolveGhostTunnelConfig
} = await importLocalghost();

test("constructs the default Social Workouts tunnel URL", () => {
  assert.equal(
    constructGhostTunnelUrl({
      domain: "moonlit-otter.example",
      route: "plan",
      project: "summer-base",
      owner: "hamed",
      path: "/week/1",
      searchParams: { view: "coach", token: null }
    }),
    "https://plan-summer-base-hamed.ghost.moonlit-otter.example/week/1?view=coach"
  );

  assert.equal(
    constructGhostTunnelURL({
      domain: "moonlit-otter.example",
      route: "plan",
      project: "summer-base",
      owner: "hamed"
    }),
    "https://plan-summer-base-hamed.ghost.moonlit-otter.example/"
  );
});

test("parses only the default route-project-owner namespace", () => {
  const route = parseGhostTunnelHost(
    "plan-summer-base-hamed.ghost.moonlit-otter.example",
    "moonlit-otter.example",
    true
  );

  assert.deepEqual(route?.namespace, {
    route: "plan",
    project: "summer-base",
    owner: "hamed"
  });

  assert.equal(
    parseGhostTunnelHost("preview.ghost.moonlit-otter.example", "moonlit-otter.example", true),
    null
  );
  assert.equal(
    parseGhostTunnelHost("plan-summer-base-hamed.other.moonlit-otter.example", "moonlit-otter.example", true),
    null
  );
});

test("requires explicit HTTPS and authentication for secure requests", () => {
  const ghostTunnel = resolveGhostTunnelConfig(true);

  assert.throws(
    () => assertSecureGhostTunnelRequest({
      host: "plan-summer-base-hamed.ghost.moonlit-otter.example",
      domain: "moonlit-otter.example",
      protocol: "http",
      authenticated: true,
      ghostTunnel
    }),
    /HTTPS/
  );

  assert.throws(
    () => assertSecureGhostTunnelRequest({
      host: "plan-summer-base-hamed.ghost.moonlit-otter.example",
      domain: "moonlit-otter.example",
      protocol: "https",
      ghostTunnel
    }),
    /authenticated/
  );

  assert.deepEqual(
    assertSecureGhostTunnelRequest({
      host: "plan-summer-base-hamed.ghost.moonlit-otter.example",
      domain: "moonlit-otter.example",
      protocol: "https",
      authenticated: true,
      ghostTunnel
    }).namespace,
    {
      route: "plan",
      project: "summer-base",
      owner: "hamed"
    }
  );
});

test("supports configurable namespace order without accepting wildcards", () => {
  const ghostTunnel = {
    namespace: {
      tags: ["owner", "project", "route"],
      spreadTag: "project"
    }
  };

  assert.equal(
    constructGhostTunnelHost({
      domain: "moonlit-otter.example",
      route: "plan",
      project: "summer-base",
      owner: "hamed",
      ghostTunnel
    }),
    "hamed-summer-base-plan.ghost.moonlit-otter.example"
  );

  assert.deepEqual(
    parseGhostTunnelHost(
      "hamed-summer-base-plan.ghost.moonlit-otter.example",
      "moonlit-otter.example",
      ghostTunnel
    )?.namespace,
    {
      owner: "hamed",
      project: "summer-base",
      route: "plan"
    }
  );

  assert.equal(
    parseGhostTunnelHost("*.ghost.moonlit-otter.example", "moonlit-otter.example", ghostTunnel),
    null
  );
});

test("keeps invalid tunnel config and namespace values out", () => {
  assert.throws(
    () => resolveGhostTunnelConfig({ subdomain: "*" }),
    /Invalid ghost tunnel subdomain/
  );

  assert.throws(
    () => resolveGhostTunnelConfig({ namespace: [] }),
    /namespace must include/
  );

  assert.throws(
    () => constructGhostTunnelUrl({
      domain: "moonlit-otter.example",
      route: "plan",
      project: "summer-base",
      owner: "owner-name",
      ghostTunnel: { namespace: ["route", "project", "owner"] }
    }),
    /cannot include separator/
  );
});

test("documents the production wildcard host without making it a route claim", () => {
  assert.equal(
    getGhostTunnelWildcardHost("moonlit-otter.example", true),
    "*.ghost.moonlit-otter.example"
  );
});
