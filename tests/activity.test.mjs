import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const {
  LOCALGHOST_ACTIVITY_VERSION,
  pruneLocalghostActivity,
  readLocalghostActivity,
  registerLocalghostRun,
  writeLocalghostActivity
} = await importLocalghost();

test("prunes stale launcher records while retaining live runs", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-activity-"));
  const path = join(cwd, "activity.json");
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const now = new Date().toISOString();
  writeLocalghostActivity({
    version: LOCALGHOST_ACTIVITY_VERSION,
    setups: [],
    runs: [
      { id: "dead-run", pid: 999_999_999, mode: "run", cwd, projectName: "dead", startedAt: now, updatedAt: now, entries: [] },
      { id: "live-run", pid: process.pid, mode: "run", cwd, projectName: "live", startedAt: now, updatedAt: now, entries: [] }
    ]
  }, path);

  const result = pruneLocalghostActivity(path);

  assert.equal(result.pruned, true);
  assert.deepEqual(result.runs.map((run) => run.id), ["live-run"]);
  assert.deepEqual(readLocalghostActivity(path).runs.map((run) => run.id), ["live-run"]);
});

test("preserves legacy Caddy records without assigning them a process group", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "localghost-legacy-activity-"));
  const path = join(cwd, "activity.json");
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const record = registerLocalghostRun({
    id: "legacy-run",
    pid: process.pid,
    caddyPid: process.pid,
    mode: "run",
    cwd,
    projectName: "legacy",
    entries: []
  }, path);

  assert.equal(record.caddyPgid, undefined);
  assert.equal(readLocalghostActivity(path).runs[0]?.caddyPid, process.pid);
});
