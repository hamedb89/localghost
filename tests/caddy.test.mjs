import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { stopCaddyProcesses } = await importLocalghost();

test("stops only the supplied Caddy PIDs and reports each outcome", () => {
  const signals = [];
  const result = stopCaddyProcesses([101, 202, 101, 303], (pid, signal) => {
    signals.push([pid, signal]);
    if (pid === 202) {
      const error = new Error("process is gone");
      error.code = "ESRCH";
      throw error;
    }
    if (pid === 303) throw new Error("permission denied");
  });

  assert.deepEqual(signals, [[101, "SIGINT"], [202, "SIGINT"], [303, "SIGINT"]]);
  assert.deepEqual(result.stopped, [101]);
  assert.deepEqual(result.alreadyExited, [202]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].pid, 303);
  assert.match(result.failed[0].error.message, /permission denied/);
});

test("returns empty results without attempting to discover or kill processes", () => {
  let called = false;
  const result = stopCaddyProcesses([], () => {
    called = true;
  });

  assert.equal(called, false);
  assert.deepEqual(result, { stopped: [], alreadyExited: [], failed: [] });
});
