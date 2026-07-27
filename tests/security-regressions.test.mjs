import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { checkForUpdate, sanitizeProjectName } = await importLocalghost();

test("project-name sanitization handles long edge runs in linear time", () => {
  assert.equal(sanitizeProjectName(`${"-".repeat(10_000)}hello${"-".repeat(10_000)}`), "hello");
  assert.equal(sanitizeProjectName("-".repeat(10_000)), "app");
  assert.equal(sanitizeProjectName("hello / world"), "hello-world");
});

test("update checks encode every slash in a custom scoped package name", async (t) => {
  const originalFetch = globalThis.fetch;
  const cacheDir = await mkdtemp(join(tmpdir(), "localghost-update-security-"));
  let requestedUrl;

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ "dist-tags": { latest: "1.0.0" } }));
  };

  t.after(async () => {
    globalThis.fetch = originalFetch;
    await rm(cacheDir, { recursive: true, force: true });
  });

  await checkForUpdate({
    force: true,
    packageName: "@scope/name/extra",
    currentVersion: "1.0.0",
    cachePath: join(cacheDir, "update-check.json")
  });

  assert.equal(requestedUrl, "https://registry.npmjs.org/@scope%2fname%2fextra");
});
