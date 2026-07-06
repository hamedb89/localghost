import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  findGhostTunnelEntry,
  listGhostTunnelEntries,
  LOCALGHOST_GHOST_TUNNEL_FILE,
  readGhostTunnelEntries,
  renderGhostTunnelRelayOfflineResponse,
  renderGhostTunnelRouteMissingResponse,
  resolveGhostTunnelRequest
} = await importLocalghost();

test("reads ghost tunnel entries from .ghosttunnel and finds exact hosts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-ghost-file-"));
  await writeFile(join(cwd, LOCALGHOST_GHOST_TUNNEL_FILE), [
    "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example 5173",
    "notes-decision-layer-hamedbahrami.ghost.copper-comet.example 4173",
    ""
  ].join("\n"));

  const entries = readGhostTunnelEntries({ cwd });
  assert.equal(entries.length, 2);
  assert.equal(listGhostTunnelEntries({ cwd }).length, 2);
  assert.equal(
    findGhostTunnelEntry("decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example", { cwd })?.port,
    5173
  );
  assert.equal(
    findGhostTunnelEntry("missing.ghost.copper-comet.example", { cwd }),
    undefined
  );
});

test("resolves a secure ghost tunnel request into an exact local relay target", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-ghost-request-"));
  const host = "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example";
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    mode: 'public',",
    "    domains: 'copper-comet.example'",
    "  }",
    "};",
    ""
  ].join("\n"));
  await writeFile(join(cwd, LOCALGHOST_GHOST_TUNNEL_FILE), `${host} 5173\n`);

  const resolved = await resolveGhostTunnelRequest({
    cwd,
    host,
    domain: "copper-comet.example",
    protocol: "https",
    authenticated: true
  });

  assert.equal(resolved.route.host, host);
  assert.equal(resolved.route.namespace.route, "decisionlayer");
  assert.equal(resolved.entry?.port, 5173);
  assert.deepEqual(resolved.target, { protocol: "http", host: "127.0.0.1", port: 5173 });
});

test("renders explicit same-project relay responses for missing and offline routes", () => {
  const route = {
    host: "decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example",
    slug: "decisionlayer-decision-layer-hamedbahrami",
    namespace: {
      route: "decisionlayer",
      project: "decision-layer",
      owner: "hamedbahrami"
    },
    entryHost: "ghost.copper-comet.example",
    wildcardHost: "*.ghost.copper-comet.example",
    domain: "copper-comet.example"
  };

  const missing = renderGhostTunnelRouteMissingResponse({ route });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers["x-localghost-relay"], "missing");
  assert.match(missing.body, /route not configured/i);

  const offline = renderGhostTunnelRelayOfflineResponse({ route, entry: { host: route.host, port: 5173, target: "127.0.0.1:5173" } });
  assert.equal(offline.status, 503);
  assert.equal(offline.headers["x-localghost-relay"], "offline");
  assert.equal(offline.headers["x-localghost-entry"], "configured");
  assert.match(offline.body, /local relay connection/i);
});
