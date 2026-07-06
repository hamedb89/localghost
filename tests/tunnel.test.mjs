import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  assertSecureGhostTunnelRequest,
  constructGhostTunnelHost,
  constructGhostTunnelURL,
  constructGhostTunnelUrl,
  getGhostTunnelDefaultDisplayUrl,
  getGhostTunnelDisplayUrl,
  getGhostTunnelDisplayUrls,
  getGhostTunnelWildcardHost,
  getGhostTunnelPreviewUrl,
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
    parseGhostTunnelHost("preview.ghost.moonlit-otter.example", "moonlit-otter.example"),
    null
  );
  assert.equal(
    parseGhostTunnelHost("plan-summer-base-hamed.other.moonlit-otter.example", "moonlit-otter.example"),
    null
  );
});

test("requires explicit HTTPS and authentication for secure requests", () => {
  const ghostTunnel = resolveGhostTunnelConfig({});

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
    getGhostTunnelWildcardHost("moonlit-otter.example"),
    "*.ghost.moonlit-otter.example"
  );
});

test("resolves configured preview URLs for logs", () => {
  const config = resolveGhostTunnelConfig({
    preview: {
      domain: "moonlit-otter.example",
      route: "plan",
      project: "summer-base",
      owner: "hamed"
    }
  });

  assert.equal(config.previewUrl, "https://plan-summer-base-hamed.ghost.moonlit-otter.example/");
  assert.equal(config.displayUrl, "https://plan-summer-base-hamed.ghost.moonlit-otter.example/");
  assert.equal(getGhostTunnelPreviewUrl(config), "https://plan-summer-base-hamed.ghost.moonlit-otter.example/");
  assert.equal(getGhostTunnelDisplayUrl(config), "https://plan-summer-base-hamed.ghost.moonlit-otter.example/");
  assert.equal(getGhostTunnelPreviewUrl({}), null);
});

test("logs default display templates when ghostTunnel is shorthand or object-only", () => {
  const defaults = resolveGhostTunnelConfig("manual");

  assert.equal(defaults.mode, "manual");
  assert.equal(defaults.displayUrl, "https://<route>-<project>-<owner>.ghost.*/");
  assert.equal(getGhostTunnelDisplayUrl({}), "https://<route>-<project>-<owner>.ghost.*/");
  assert.equal(getGhostTunnelDefaultDisplayUrl({}), "https://<route>-<project>-<owner>.ghost.*/");
  assert.equal(
    resolveGhostTunnelConfig({}, {
      domain: "moonlit-otter.example",
      route: "app",
      project: "decision-layer",
      owner: "hamed"
    }).displayUrl,
    "https://app-decision-layer-hamed.ghost.moonlit-otter.example/"
  );

  const custom = resolveGhostTunnelConfig({
    subdomain: "preview",
    namespace: {
      tags: ["owner", "project", "route"],
      spreadTag: "project"
    }
  });

  assert.equal(custom.displayUrl, "https://<owner>-<project>-<route>.preview.*/");
  assert.equal(getGhostTunnelPreviewUrl(custom), null);
});

test("supports manual/public mode and configured domains", () => {
  const config = resolveGhostTunnelConfig({
    mode: "public",
    domains: ["moonlit-otter.example", "staging.moonlit-otter.example"]
  }, {
    route: "plan",
    project: "summer-base",
    owner: "hamed"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.mode, "public");
  assert.deepEqual(config.domains, ["moonlit-otter.example", "staging.moonlit-otter.example"]);
  assert.deepEqual(getGhostTunnelDisplayUrls(config), [
    "https://plan-summer-base-hamed.ghost.moonlit-otter.example/",
    "https://plan-summer-base-hamed.ghost.staging.moonlit-otter.example/"
  ]);

  assert.equal(resolveGhostTunnelConfig("manual").mode, "manual");
  assert.equal(resolveGhostTunnelConfig("public").mode, "public");
});

test("uses defaults for public Ghost Tunnel display when domains are configured", () => {
  const configured = resolveGhostTunnelConfig({
    mode: "public",
    domains: "copper-comet.example"
  }, {
    route: "decisionlayer",
    project: "decision-layer",
    owner: "local"
  });

  assert.equal(configured.displayUrl, "https://decisionlayer-decision-layer-local.ghost.copper-comet.example/");

  const preview = resolveGhostTunnelConfig({
    mode: "public",
    domains: "copper-comet.example",
    preview: {
      route: "decisionlayer",
      project: "decision-layer",
      owner: "hamedbahrami"
    }
  }, {
    domain: "copper-comet.example",
    route: "local",
    project: "local",
    owner: "local"
  });

  assert.equal(preview.displayUrl, "https://decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example/");
});

test("keeps disabled Ghost Tunnel domains without displaying routes", () => {
  const config = resolveGhostTunnelConfig({
    domains: "moonlit-otter.example",
    enabled: false
  });

  assert.equal(config.enabled, false);
  assert.deepEqual(config.domains, ["moonlit-otter.example"]);
  assert.equal(config.displayUrl, undefined);
  assert.deepEqual(config.displayUrls, []);
  assert.equal(getGhostTunnelDisplayUrl(config), null);
  assert.deepEqual(getGhostTunnelDisplayUrls(config), []);
});
