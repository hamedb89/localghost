import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
