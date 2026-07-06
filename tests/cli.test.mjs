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
  assert.match(stdout, /ghostTunnel running on https:\/\/plan-summer-base-hamed\.ghost\.moonlit-otter\.example\//);
});

test("routes CLI logs default Ghost Tunnel template when enabled with true", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-routes-default-"));
  await writeFile(join(cwd, ".localghost"), "app.localhost 5173\n");
  await writeFile(join(cwd, "localghost.config.mjs"), "export default { ghostTunnel: true };\n");

  const { stdout } = await runCli(["routes", "--cwd", cwd]);

  assert.match(stdout, /http:\/\/app\.localhost\//);
  assert.match(stdout, /ghostTunnel running on https:\/\/<route>-<project>-<owner>\.ghost\.<domain>\//);
});
