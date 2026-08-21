import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { execFile, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const consumerRepo = process.env.FAAAST_CONSUMER_REPO;

if (!process.env.LOCALGHOST_CONSUMER_WORKTREE) {
  test("faaast consumer dev can stop and restart cleanly", {
    skip: consumerRepo ? false : "Set FAAAST_CONSUMER_REPO to run the consumer lifecycle test"
  }, async () => {
    const scenario = join(repo, "tests/e2e/fixtures/faaast-dev-restart.mjs");
    await execFile(process.execPath, [
      join(repo, "scripts/consumer-worktree.mjs"),
      "test",
      "faaast",
      "--repo",
      consumerRepo,
      "--",
      process.execPath,
      scenario
    ], { cwd: repo, env: process.env, maxBuffer: 10 * 1024 * 1024 });
  });
}

async function waitFor(check, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw lastError ?? new Error(`Timed out after ${timeoutMs}ms`);
}

async function waitForPort(port, open) {
  return waitFor(async () => {
    const socket = createConnection({ host: "127.0.0.1", port });
    return new Promise((resolvePort, reject) => {
      socket.once("connect", () => {
        socket.destroy();
        resolvePort(open);
      });
      socket.once("error", () => {
        socket.destroy();
        resolvePort(!open);
      });
    });
  });
}

async function startAndStop() {
  const routesPath = join(process.cwd(), ".tmp/runtime/routes.json");
  let output = "";
  const child = spawn("./bin/faaast", ["dev"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    const routes = await waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`f dev exited early:\n${output}`);
      const value = JSON.parse(await readFile(routesPath, "utf8"));
      return value.browser?.web?.endsWith(".consumer.test") ? value : undefined;
    });
    const apiPort = Number(new URL(routes.internal.webToApi).port);
    await waitForPort(apiPort, true);
    assert.match(output, /\[faaast:dev\] Routing \(consumer\)/);
    assert.match(output, /\[web\]/);
    assert.match(output, /\[app\]/);
    assert.match(output, /\[api\]/);
    assert.match(output, /FAAAST API listening/);

    child.kill("SIGINT");
    const exitCode = await waitFor(() => child.exitCode === null ? undefined : child.exitCode, 20_000);
    assert.equal(exitCode, 0, output);
    await waitForPort(apiPort, false);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(routesPath, { force: true });
  }
}

if (process.env.LOCALGHOST_CONSUMER_WORKTREE) {
  await startAndStop();
  await startAndStop();
}
