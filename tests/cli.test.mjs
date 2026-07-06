import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { createRelayRouteRegistration, signRelayRouteClaim } = await importLocalghost();

const execFileAsync = promisify(execFile);

async function runCli(args) {
  return execFileAsync(process.execPath, ["dist/cli.js", "--no-update-check", ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      LOCALGHOST_OWNER: "tester",
      LOCALGHOST_UPDATE_CHECK_DISABLED: "1"
    }
  });
}

test("local CLI help is runnable without network update checks", async () => {
  const { stdout, stderr } = await runCli(["--help"]);

  assert.equal(stderr, "");
  assert.match(stdout, /Buh\. Friendly local hostnames/);
  assert.match(stdout, /setup/);
  assert.match(stdout, /run/);
});

test("CLI surface does not expose arbitrary URL proxying", async () => {
  const { stdout } = await runCli(["--help"]);
  const normalized = stdout.toLowerCase();

  assert.doesNotMatch(normalized, /proxy\?url/);
  assert.doesNotMatch(normalized, /--url/);
  assert.doesNotMatch(normalized, /<url>/);
  assert.doesNotMatch(normalized, /relay/);
});

test("relay registration remains a library guard, not public CLI target selection", () => {
  const signingSecret = "test-signing-secret";
  const agentToken = "test-agent-token";
  const claim = signRelayRouteClaim({
    host: "plan-summer-base-hamed.ghost.moonlit-otter.example",
    scope: "socialworkouts:preview",
    agentId: "agent-1",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }, signingSecret);

  assert.throws(
    () => createRelayRouteRegistration({
      authorizationHeader: `Bearer ${agentToken}`,
      agentToken,
      claimToken: claim.token,
      signingSecret,
      expectedScope: "socialworkouts:preview",
      target: "http://127.0.0.1:5173",
      passwordProtected: true
    }),
    /explicit local target object/
  );
});

test("routes CLI logs configured Ghost Tunnel preview URL", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-routes-"));
  await writeFile(join(cwd, ".localghost"), "app.localhost 5173\n");
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    preview: {",
    "      domain: 'moonlit-otter.example',",
    "      route: 'plan',",
    "      project: 'summer-base',",
    "      owner: 'hamed'",
    "    }",
    "  }",
    "};",
    ""
  ].join("\n"));

  const { stdout } = await runCli(["routes", "--cwd", cwd]);

  assert.match(stdout, /http:\/\/app\.localhost\//);
  assert.match(stdout, /localghost ghost tunnel/);
  assert.match(stdout, /expected: https:\/\/plan-summer-base-hamed\.ghost\.moonlit-otter\.example\//);
});

test("routes CLI logs default Ghost Tunnel wildcard when enabled with manual shorthand", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-routes-default-"));
  await writeFile(join(cwd, ".localghost"), "app.localhost 5173\n");
  await writeFile(join(cwd, "localghost.config.mjs"), "export default { ghostTunnel: 'manual' };\n");

  const { stdout } = await runCli(["routes", "--cwd", cwd]);

  assert.match(stdout, /http:\/\/app\.localhost\//);
  assert.match(stdout, /expected: https:\/\/app-app-tester\.ghost\.\*\//);
});

test("routes CLI fills the Ghost Tunnel domain when domains are configured", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-routes-domain-"));
  await writeFile(join(cwd, ".localghost"), "app.localhost 5173\n");
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    domains: 'moonlit-otter.example'",
    "  }",
    "};",
    ""
  ].join("\n"));

  const { stdout } = await runCli(["routes", "--cwd", cwd]);

  assert.match(stdout, /http:\/\/app\.localhost\//);
  assert.match(stdout, /expected: https:\/\/app-app-tester\.ghost\.moonlit-otter\.example\//);
});

test("Vite build hook logs configured Ghost Tunnel without local setup", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-vite-build-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "decision-layer" }, null, 2));
  await writeFile(join(cwd, ".localghost"), "decisionlayer.localhost 5173\n");
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    mode: 'public',",
    "    domains: 'decisionlayer.com'",
    "  }",
    "};",
    ""
  ].join("\n"));

  const previousOwner = process.env.LOCALGHOST_OWNER;
  process.env.LOCALGHOST_OWNER = "tester";
  const { localGhostPlugin } = await import(new URL("../dist/vite.js", import.meta.url));
  const plugin = localGhostPlugin({ cwd });
  const logs = [];
  const originalLog = console.log;
  console.log = (message) => {
    logs.push(String(message));
  };

  try {
    await plugin.config({}, { command: "build", mode: "production" });
  } finally {
    console.log = originalLog;
    if (typeof previousOwner === "undefined") {
      delete process.env.LOCALGHOST_OWNER;
    } else {
      process.env.LOCALGHOST_OWNER = previousOwner;
    }
  }

  const output = logs.join("\n");
  assert.match(output, /localghost ghost tunnel/);
  assert.match(output, /configured: https:\/\/decisionlayer-decision-layer-tester\.ghost\.decisionlayer\.com\//);
});

test("Vite serve hook logs interactive help for Localghost shortcut", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-vite-serve-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "decision-layer" }, null, 2));
  await writeFile(join(cwd, ".localghost"), "decisionlayer.test 5173\n");
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  ghostTunnel: {",
    "    mode: 'public',",
    "    domains: 'copper-comet.example'",
    "  }",
    "};",
    ""
  ].join("\n"));

  const previousOwner = process.env.LOCALGHOST_OWNER;
  const previousActivityPath = process.env.LOCALGHOST_ACTIVITY_PATH;
  const previousStdinIsTty = process.stdin.isTTY;
  process.env.LOCALGHOST_OWNER = "hamedbahrami";
  process.env.LOCALGHOST_ACTIVITY_PATH = join(cwd, "activity.json");
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: true
  });

  const { localGhostPlugin } = await import(new URL("../dist/vite.js", import.meta.url));
  const plugin = localGhostPlugin({ cwd, setup: false, dynamicPort: false });
  const logs = [];
  let closeServer;
  const server = {
    watcher: {
      add() {},
      on() {}
    },
    config: {
      logger: {
        info(message) {
          logs.push(String(message));
        },
        error(message) {
          logs.push(String(message));
        }
      }
    },
    httpServer: {
      once(event, callback) {
        if (event === "close") closeServer = callback;
      }
    },
    restart: async () => {}
  };

  try {
    await plugin.config({}, { command: "serve", mode: "development" });
    plugin.configureServer(server);
    server.printUrls();
  } finally {
    closeServer?.();
    process.stdin.pause();

    if (typeof previousOwner === "undefined") {
      delete process.env.LOCALGHOST_OWNER;
    } else {
      process.env.LOCALGHOST_OWNER = previousOwner;
    }

    if (typeof previousActivityPath === "undefined") {
      delete process.env.LOCALGHOST_ACTIVITY_PATH;
    } else {
      process.env.LOCALGHOST_ACTIVITY_PATH = previousActivityPath;
    }

    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: previousStdinIsTty
    });
  }

  const output = logs.join("\n");
  assert.match(output, /localghost/);
  assert.match(output, /ready: https:\/\/decisionlayer-decision-layer-hamedbahrami\.ghost\.copper-comet\.example\//);
  assert.match(output, /help:   press h \+ enter for Vite, g \+ enter for Localghost/);
});
