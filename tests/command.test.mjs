import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  detectDevCommand,
  detectPackageManager,
  formatDetectedDevCommand,
  packageAddCommand,
  packageRunCommand,
  renderLocalghostBanner
} = await importLocalghost();
const execFileAsync = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repo, "dist/cli.js");

async function project(t, pkg, files = []) {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-command-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "package.json"), JSON.stringify(pkg));
  for (const file of files) await writeFile(join(cwd, file), "");
  return cwd;
}

test("detects dev:raw before dev and honors the declared package manager", async (t) => {
  const cwd = await project(t, {
    packageManager: "pnpm@10.0.0",
    scripts: {
      "dev:raw": "vite",
      dev: "localghost run -- pnpm dev:raw"
    }
  });

  const detected = detectDevCommand({ cwd });
  assert.deepEqual(detected.command, ["pnpm", "run", "dev:raw"]);
  assert.equal(detected.source, "script");
  assert.match(formatDetectedDevCommand(detected), /package\.json#scripts\.dev:raw/);
});

test("renders the Localghost terminal identity", () => {
  assert.equal(renderLocalghostBanner(), [
    "   .-.",
    "  (o o)   LOCALGHOST",
    "  | O \\   friendly local domains",
    "   \\   \\",
    "    `~~~'"
  ].join("\n"));
});

test("detects Bun from its lockfile", async (t) => {
  const cwd = await project(t, { scripts: { dev: "bun server.ts" } }, ["bun.lock"]);
  assert.deepEqual(detectDevCommand({ cwd }).command, ["bun", "run", "dev"]);
  assert.equal(detectPackageManager(cwd), "bun");
  assert.equal(packageRunCommand("bun", "localghost:setup"), "bun run localghost:setup");
  assert.equal(packageAddCommand("bun"), "bun add -d @hamedb89/localghost");
});

test("uses an explicit configured command", async (t) => {
  const cwd = await project(t, { scripts: { dev: "vite" } });
  assert.deepEqual(
    detectDevCommand({ cwd, command: ["node", "server.mjs"] }),
    { command: ["node", "server.mjs"], source: "config" }
  );
});

test("rejects recursive or missing inferred commands", async (t) => {
  const cwd = await project(t, { scripts: { dev: "npm exec localghost" } });
  assert.throws(() => detectDevCommand({ cwd }), /Could not detect a safe development command/);
  assert.throws(
    () => detectDevCommand({ cwd, command: ["npm", "exec", "localghost"] }),
    /cannot invoke Localghost recursively/
  );
});

test("bare localghost dry-run describes an explicit multi-service application", async (t) => {
  const cwd = await project(t, {
    name: "multi-app",
    private: true,
    packageManager: "pnpm@10.0.0"
  });
  await mkdir(join(cwd, "apps/web"), { recursive: true });
  await mkdir(join(cwd, "apps/api"), { recursive: true });
  await writeFile(join(cwd, "localghost.config.mjs"), [
    "export default {",
    "  services: [",
    "    {",
    "      name: 'web',",
    "      cwd: 'apps/web',",
    "      host: 'xyz.localhost',",
    "      port: 5173,",
    "      command: ['pnpm', 'dev']",
    "    },",
    "    {",
    "      name: 'api',",
    "      cwd: 'apps/api',",
    "      host: 'api.xyz.localhost',",
    "      port: 8787,",
    "      command: ['pnpm', 'dev']",
    "    }",
    "  ]",
    "};",
    ""
  ].join("\n"));

  const { stdout } = await execFileAsync(process.execPath, [
    cli,
    "--no-update-check",
    "--dry-run",
    "--cwd",
    cwd
  ]);

  assert.match(stdout, /\(o o\)   LOCALGHOST/);
  assert.match(stdout, /Localghost detected 2 services:/);
  assert.match(stdout, /web: pnpm dev \(apps\/web, xyz\.localhost -> 5173\)/);
  assert.match(stdout, /api: pnpm dev \(apps\/api, api\.xyz\.localhost -> 8787\)/);
});
