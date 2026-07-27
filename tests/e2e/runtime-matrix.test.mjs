import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { chmod, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = join(repo, "tests/e2e/fixtures");
const cli = join(repo, "dist/cli.js");
const viteCli = join(repo, "node_modules/vite/bin/vite.js");
const vitePlugin = pathToFileURL(join(repo, "dist/vite.js")).href;
const hasBun = spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;
const execFileAsync = promisify(execFile);

async function listen(server, port = 0) {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolveClose) => server.close(resolveClose));
}

async function findPortPair() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const first = createServer();
    const port = await listen(first);
    if (port >= 65_534) {
      await close(first);
      continue;
    }

    const second = createServer();
    try {
      await listen(second, port + 1);
      await close(second);
      return { busyServer: first, requestedPort: port, selectedPort: port + 1 };
    } catch {
      await close(first);
    }
  }

  throw new Error("Could not reserve a consecutive E2E port pair");
}

async function findFreePortExcluding(excluded) {
  const probes = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probe = createServer();
    const port = await listen(probe);
    probes.push(probe);
    if (!excluded.has(port)) {
      await Promise.all(probes.map(close));
      return port;
    }
  }
  await Promise.all(probes.map(close));
  throw new Error("Could not find a distinct free E2E port");
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }

  throw lastError ?? new Error(`Timed out after ${timeoutMs}ms`);
}

async function createProject(runtime, requestedPort) {
  const cwd = await mkdtemp(join(tmpdir(), `localghost-e2e-${runtime}-`));
  const bin = join(cwd, "bin");
  const activityPath = join(cwd, "activity.json");
  const caddyLog = join(cwd, "caddy.log");
  const hostsPath = join(cwd, "hosts");
  const configPath = join(cwd, ".localghost");
  const statePath = join(cwd, "ops/local/localghost-state.json");
  const fakeCaddy = join(fixtures, "fake-caddy.mjs");

  await mkdir(bin);
  await mkdir(dirname(statePath), { recursive: true });
  await chmod(fakeCaddy, 0o755);
  await symlink(fakeCaddy, join(bin, "caddy"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: `e2e-${runtime}`, type: "module" }));
  await writeFile(configPath, `app.localhost ${requestedPort}\n`);

  const entries = [
    { host: "app.localhost", port: requestedPort, target: `127.0.0.1:${requestedPort}` },
    { host: "www.app.localhost", port: requestedPort, target: `127.0.0.1:${requestedPort}` }
  ];
  const hostsBlock = [
    `# localghost:start e2e-${runtime}`,
    "127.0.0.1 app.localhost",
    "127.0.0.1 www.app.localhost",
    `# localghost:end e2e-${runtime}`,
    ""
  ].join("\n");

  await writeFile(hostsPath, hostsBlock);
  await writeFile(statePath, JSON.stringify({
    version: 1,
    action: "setup",
    updatedAt: new Date().toISOString(),
    projectName: `e2e-${runtime}`,
    cwd,
    configPath,
    hostsPath,
    entries
  }, null, 2));

  return { cwd, bin, activityPath, caddyLog, hostsPath };
}

async function commandFor(runtime, project) {
  if (runtime === "node") {
    return [process.execPath, join(fixtures, "node-server.mjs")];
  }
  if (runtime === "bun") {
    return ["bun", join(fixtures, "bun-server.ts")];
  }

  await cp(join(fixtures, "vite-index.html"), join(project.cwd, "index.html"));
  await writeFile(join(project.cwd, "vite.config.mjs"), [
    `import { localGhostPlugin } from ${JSON.stringify(vitePlugin)};`,
    "export default {",
    "  plugins: [",
    "    {",
    "      name: 'localghost-e2e-shutdown',",
    "      configureServer(server) {",
    "        server.middlewares.use('/shutdown', (_request, response) => {",
    "          response.end('stopping');",
    "          setTimeout(() => server.close().then(() => process.exit(0)), 10);",
    "        });",
    "      }",
    "    },",
    "    localGhostPlugin({ setup: false })",
    "  ]",
    "};",
    ""
  ].join("\n"));
  return [process.execPath, viteCli, "--clearScreen", "false"];
}

async function runRuntime(runtime, options = {}) {
  const { busyServer, requestedPort, selectedPort } = await findPortPair();
  const project = await createProject(runtime, requestedPort);
  const command = await commandFor(runtime, project);
  let output = "";
  let child;

  try {
    if (options.staleSetup) {
      await writeFile(project.hostsPath, "127.0.0.1 localhost\n");
    }
    if (options.implicit) {
      await writeFile(join(project.cwd, "package.json"), JSON.stringify({
        name: `e2e-${runtime}`,
        type: "module",
        packageManager: "npm@10.0.0",
        scripts: {
          dev: `${process.execPath} ${join(fixtures, "node-server.mjs")}`
        }
      }));
    }

    const cliArgs = options.implicit
      ? [cli, "--no-update-check", "--cwd", project.cwd]
      : [
          cli,
          "--no-update-check",
          "run",
          "--cwd",
          project.cwd,
          "--dynamic-port",
          "yes",
          "--",
          ...command
        ];

    child = spawn(process.execPath, cliArgs, {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${project.bin}${delimiter}${process.env.PATH ?? ""}`,
        LOCALGHOST_ACTIVITY_PATH: project.activityPath,
        LOCALGHOST_E2E_CADDY_LOG: project.caddyLog,
        LOCALGHOST_HOSTS_PATH: project.hostsPath,
        LOCALGHOST_UPDATE_CHECK_DISABLED: "1",
        NO_COLOR: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });

    const response = await waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`${runtime} wrapper exited early:\n${output}`);
      const result = await fetch(`http://127.0.0.1:${selectedPort}/runtime-check`);
      return result.ok ? result : undefined;
    });

    if (runtime === "vite") {
      assert.match(await response.text(), /<main id="runtime">vite<\/main>/);
    } else {
      assert.deepEqual(await response.json(), {
        runtime,
        path: "/runtime-check",
        localghostPort: String(selectedPort),
        vitePort: String(selectedPort)
      });
    }

    assert.match(output, new RegExp(`Port ${requestedPort} is busy; using ${selectedPort}`));
    assert.doesNotMatch(output, new RegExp(`-> http://127\\.0\\.0\\.1:${requestedPort}`));
    if (options.staleSetup) {
      assert.match(output, /setup is stale; repairing it now/);
      assert.match(await readFile(project.hostsPath, "utf8"), /# localghost:start e2e-node/);
    }
    if (options.implicit) {
      assert.match(output, /Localghost detected: npm run dev \(package\.json#scripts\.dev\)/);
    }
    const caddyfile = await readFile(join(project.cwd, "ops/local/Caddyfile"), "utf8");
    assert.match(caddyfile, new RegExp(`reverse_proxy 127\\.0\\.0\\.1:${selectedPort}`));

    await fetch(`http://127.0.0.1:${selectedPort}/shutdown`);

    await waitFor(() => child.exitCode !== null, 10_000);
    assert.equal(child.exitCode, 0, output);

    const caddyLifecycle = await readFile(project.caddyLog, "utf8");
    assert.match(caddyLifecycle, /started \d+/);
    assert.match(caddyLifecycle, /stopped \d+/);

    const activity = JSON.parse(await readFile(project.activityPath, "utf8"));
    assert.deepEqual(activity.runs, []);
  } finally {
    if (child?.exitCode === null) child.kill("SIGKILL");
    await close(busyServer);
    await rm(project.cwd, { recursive: true, force: true });
  }
}

test("bare localghost detects, repairs, and serves a Node app", () => (
  runRuntime("node", { staleSetup: true, implicit: true })
));
test("localghost run serves a Vite app with the Localghost plugin", () => runRuntime("vite"));
test("localghost run serves a Bun app on a dynamically selected port", {
  skip: hasBun ? false : "Bun is not installed"
}, () => runRuntime("bun"));

test("localghost repair reconciles stale hosts, Caddyfile, state, and HTTPS trust", async () => {
  const project = await createProject("repair", 51_73);
  const caddyfilePath = join(project.cwd, "ops/local/Caddyfile");
  const statePath = join(project.cwd, "ops/local/localghost-state.json");

  try {
    await writeFile(project.hostsPath, "127.0.0.1 localhost\n");
    await writeFile(caddyfilePath, "this is not a Caddyfile\n");
    await writeFile(statePath, JSON.stringify({
      version: 1,
      action: "teardown",
      updatedAt: new Date(0).toISOString(),
      projectName: "wrong-project",
      cwd: project.cwd
    }));

    const { stdout } = await execFileAsync(process.execPath, [
      cli,
      "--no-update-check",
      "repair",
      "--cwd",
      project.cwd,
      "--https",
      "--trust"
    ], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${project.bin}${delimiter}${process.env.PATH ?? ""}`,
        LOCALGHOST_ACTIVITY_PATH: project.activityPath,
        LOCALGHOST_E2E_CADDY_LOG: project.caddyLog,
        LOCALGHOST_HOSTS_PATH: project.hostsPath,
        LOCALGHOST_UPDATE_CHECK_DISABLED: "1",
        NO_COLOR: "1"
      }
    });

    assert.match(stdout, /Repair complete/);
    assert.match(await readFile(project.hostsPath, "utf8"), /# localghost:start e2e-repair/);
    assert.match(await readFile(caddyfilePath, "utf8"), /local_certs/);
    assert.match(await readFile(caddyfilePath, "utf8"), /reverse_proxy 127\.0\.0\.1:5173/);

    const state = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(state.action, "setup");
    assert.equal(state.projectName, "e2e-repair");
    assert.equal(state.caddyHttps, true);
    assert.ok(state.caddyTrustedAt);

    const caddyLog = await readFile(project.caddyLog, "utf8");
    assert.match(caddyLog, /validated/);
    assert.match(caddyLog, /trusted/);
  } finally {
    await rm(project.cwd, { recursive: true, force: true });
  }
});

test("localghost run can opt out of automatic repair", async () => {
  const project = await createProject("no-repair", 51_73);

  try {
    await writeFile(project.hostsPath, "127.0.0.1 localhost\n");

    await assert.rejects(
      execFileAsync(process.execPath, [
        cli,
        "--no-update-check",
        "run",
        "--cwd",
        project.cwd,
        "--auto-repair=no",
        "--",
        process.execPath,
        join(fixtures, "node-server.mjs")
      ], {
        cwd: repo,
        env: {
          ...process.env,
          PATH: `${project.bin}${delimiter}${process.env.PATH ?? ""}`,
          LOCALGHOST_ACTIVITY_PATH: project.activityPath,
          LOCALGHOST_E2E_CADDY_LOG: project.caddyLog,
          LOCALGHOST_HOSTS_PATH: project.hostsPath,
          LOCALGHOST_UPDATE_CHECK_DISABLED: "1",
          NO_COLOR: "1"
        }
      }),
      (error) => {
        assert.match(error.stderr, /Automatic repair is disabled/);
        return true;
      }
    );

    assert.equal(await readFile(project.hostsPath, "utf8"), "127.0.0.1 localhost\n");
  } finally {
    await rm(project.cwd, { recursive: true, force: true });
  }
});

test("bare localghost runs multiple services behind one Caddy configuration", async () => {
  const { busyServer, requestedPort: webRequestedPort, selectedPort: webPort } = await findPortPair();
  const apiPort = await findFreePortExcluding(new Set([webRequestedPort, webPort]));
  let project;
  try {
    project = await createProject("services", webRequestedPort);
  } catch (error) {
    await close(busyServer);
    throw error;
  }
  const webCwd = join(project.cwd, "apps/web");
  const apiCwd = join(project.cwd, "apps/api");
  const serviceServer = join(fixtures, "service-server.mjs");
  let output = "";
  let child;

  try {
    await mkdir(webCwd, { recursive: true });
    await mkdir(apiCwd, { recursive: true });
    await writeFile(project.hostsPath, "127.0.0.1 localhost\n");
    await writeFile(join(project.cwd, "localghost.config.mjs"), [
      "export default {",
      "  services: [",
      `    { name: 'web', cwd: 'apps/web', host: 'xyz.localhost', port: ${webRequestedPort}, command: [${JSON.stringify(process.execPath)}, ${JSON.stringify(serviceServer)}] },`,
      `    { name: 'api', cwd: 'apps/api', host: 'api.xyz.localhost', port: ${apiPort}, command: [${JSON.stringify(process.execPath)}, ${JSON.stringify(serviceServer)}] }`,
      "  ]",
      "};",
      ""
    ].join("\n"));

    child = spawn(process.execPath, [cli, "--no-update-check", "--cwd", project.cwd], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${project.bin}${delimiter}${process.env.PATH ?? ""}`,
        LOCALGHOST_ACTIVITY_PATH: project.activityPath,
        LOCALGHOST_E2E_CADDY_LOG: project.caddyLog,
        LOCALGHOST_HOSTS_PATH: project.hostsPath,
        LOCALGHOST_UPDATE_CHECK_DISABLED: "1",
        NO_COLOR: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });

    const [webResponse, apiResponse] = await Promise.all([
      waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${webPort}/check`);
        return response.ok ? response : undefined;
      }),
      waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${apiPort}/check`);
        return response.ok ? response : undefined;
      })
    ]);

    assert.deepEqual(await webResponse.json(), {
      service: "web",
      cwd: "web",
      path: "/check",
      localghostPort: String(webPort)
    });
    assert.deepEqual(await apiResponse.json(), {
      service: "api",
      cwd: "api",
      path: "/check",
      localghostPort: String(apiPort)
    });
    assert.match(output, /Localghost detected 2 services/);
    assert.match(output, new RegExp(`web: port ${webRequestedPort} is busy; using ${webPort}`));
    await waitFor(() => output.includes("localghost routes"));
    assert.ok(
      output.lastIndexOf("localghost routes") > output.lastIndexOf("api listening"),
      `expected routes after service startup logs:\n${output}`
    );

    const caddyfile = await readFile(join(project.cwd, "ops/local/Caddyfile"), "utf8");
    assert.match(caddyfile, new RegExp(`http://xyz\\.localhost[\\s\\S]*reverse_proxy 127\\.0\\.0\\.1:${webPort}`));
    assert.match(caddyfile, new RegExp(`http://api\\.xyz\\.localhost[\\s\\S]*reverse_proxy 127\\.0\\.0\\.1:${apiPort}`));

    await fetch(`http://127.0.0.1:${webPort}/shutdown`);
    await waitFor(() => child.exitCode !== null);
    assert.equal(child.exitCode, 0, output);
    await assert.rejects(fetch(`http://127.0.0.1:${apiPort}/check`));

    const caddyLifecycle = await readFile(project.caddyLog, "utf8");
    assert.match(caddyLifecycle, /started \d+/);
    assert.match(caddyLifecycle, /stopped \d+/);
  } finally {
    if (child?.exitCode === null) child.kill("SIGKILL");
    await close(busyServer);
    await rm(project.cwd, { recursive: true, force: true });
  }
});
