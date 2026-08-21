import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { createRelayRouteRegistration, signRelayRouteClaim } = await importLocalghost();

const execFileAsync = promisify(execFile);

async function runCli(args, env = {}) {
  return execFileAsync(process.execPath, ["dist/cli.js", "--no-update-check", ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      LOCALGHOST_OWNER: "tester",
      LOCALGHOST_UPDATE_CHECK_DISABLED: "1",
      ...env
    }
  });
}

test("local CLI help is runnable without network update checks", async () => {
  const { stdout, stderr } = await runCli(["--help"]);

  assert.equal(stderr, "");
  assert.match(stdout, /Buh\. Friendly local hostnames/);
  assert.match(stdout, /setup/);
  assert.match(stdout, /run/);
  assert.match(stdout, /release/);

  const { stdout: devHelp } = await runCli(["dev", "--help"]);
  assert.match(devHelp, /--clean-caddy/);

  const { stdout: repairHelp } = await runCli(["repair", "--help"]);
  assert.match(repairHelp, /--reallocate-port/);
  assert.match(repairHelp, /--prune-registry/);
});

test("agent guide describes the supported repository workflow", async () => {
  const { stdout } = await runCli(["guide", "--agent", "--json"]);
  const guide = JSON.parse(stdout);

  assert.equal(guide.preferredScript, "localghost");
  assert.equal(guide.packageUpgrade, "localghost upgrade");
  assert.match(guide.packageLaunchers.npm, /npm exec/);
  assert.equal(guide.proxyOnlyCommand, "localghost dev");
  assert.equal(guide.userState, "~/.localghost");
});

test("upgrade updates Localghost through the detected package manager", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-upgrade-"));
  const npmPath = join(cwd, "npm");
  const argsPath = join(cwd, "npm-args.txt");
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "consumer" }));
  await writeFile(npmPath, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$LOCALGHOST_NPM_ARGS\"\n");
  await chmod(npmPath, 0o755);

  const { stdout } = await runCli(["upgrade", "--cwd", cwd], {
    PATH: `${cwd}:${process.env.PATH ?? ""}`,
    LOCALGHOST_NPM_ARGS: argsPath
  });

  assert.match(stdout, /Localghost is upgraded/);
  assert.deepEqual((await readFile(argsPath, "utf8")).trim().split("\n"), [
    "install",
    "--save-dev",
    "@hamedb89/localghost@latest"
  ]);
});

test("upgrade explicitly targets a pnpm workspace root", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-pnpm-upgrade-"));
  const pnpmPath = join(cwd, "pnpm");
  const argsPath = join(cwd, "pnpm-args.txt");
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "workspace-root" }));
  await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(pnpmPath, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$LOCALGHOST_PNPM_ARGS\"\n");
  await chmod(pnpmPath, 0o755);

  const { stdout } = await runCli(["upgrade", "--cwd", cwd], {
    PATH: `${cwd}:${process.env.PATH ?? ""}`,
    LOCALGHOST_PNPM_ARGS: argsPath
  });

  assert.match(stdout, /Localghost is upgraded/);
  assert.deepEqual((await readFile(argsPath, "utf8")).trim().split("\n"), [
    "add",
    "--workspace-root",
    "--save-dev",
    "@hamedb89/localghost@latest"
  ]);
});

test("status ports reports registry leases and free port candidates", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-status-ports-"));
  const home = join(cwd, "localghost-home");
  const activityPath = join(cwd, "activity.json");
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "registry.json"), JSON.stringify({
    version: 1,
    allocations: [{ projectCwd: "/workspace/app", instanceKey: "api", port: 49123, updatedAt: 1 }],
    leases: [{
      projectCwd: "/workspace/app",
      instanceKey: "api",
      port: 49123,
      pid: process.pid,
      acquiredAt: 1,
      expiresAt: Date.now() + 60_000,
      ownerToken: "test"
    }]
  }));
  await writeFile(activityPath, JSON.stringify({ version: 1, runs: [], setups: [] }));

  const { stdout } = await runCli(["status", "--ports", "--from", "49124", "--count", "2", "--json"], {
    LOCALGHOST_HOME: home,
    LOCALGHOST_ACTIVITY_PATH: activityPath
  });
  const result = JSON.parse(stdout);

  assert.equal(result.ports[0].port, 49123);
  assert.equal(result.ports[0].state, "active");
  assert.deepEqual(result.free.ports, [49124, 49125]);
});

test("init writes package-manager launchers when Localghost is not installed locally", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-init-launcher-"));
  const packageJsonPath = join(cwd, "package.json");
  await writeFile(packageJsonPath, JSON.stringify({ name: "consumer", scripts: {} }));

  await runCli(["init", "--cwd", cwd, "--write-scripts"]);

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  assert.equal(
    packageJson.scripts["localghost:setup"],
    "npm exec --yes --package=@hamedb89/localghost -- localghost setup"
  );
});

test("release command dispatches the requested semantic bump", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-release-"));
  const ghPath = join(cwd, "gh");
  const argsPath = join(cwd, "gh-args.txt");
  await writeFile(ghPath, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$LOCALGHOST_GH_ARGS\"\n");
  await chmod(ghPath, 0o755);

  const { stdout } = await runCli(["release", "patch"], {
    PATH: `${cwd}:${process.env.PATH ?? ""}`,
    LOCALGHOST_GH_ARGS: argsPath
  });

  assert.match(stdout, /Dispatched a patch Localghost release from main/);
  assert.deepEqual((await readFile(argsPath, "utf8")).trim().split("\n"), [
    "workflow",
    "run",
    "release.yml",
    "--repo",
    "hamedb89/localghost",
    "--ref",
    "main",
    "-f",
    "bump=patch"
  ]);
});

test("release command rejects unsupported version bumps", async () => {
  await assert.rejects(
    runCli(["release", "banana"]),
    (error) => error.code === 1 && /patch, minor, or major/.test(error.stderr)
  );
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
