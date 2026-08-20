import assert from "node:assert/strict";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { signalManagedProcessPid } = await importLocalghost();

test("signals the managed process group on POSIX", () => {
  const calls = [];

  signalManagedProcessPid(1234, "SIGINT", (pid, signal) => {
    calls.push({ pid, signal });
  });

  assert.deepEqual(calls, [{ pid: process.platform === "win32" ? 1234 : -1234, signal: "SIGINT" }]);
});

test("treats an already-exited process group as cleaned up", () => {
  const error = Object.assign(new Error("gone"), { code: "ESRCH" });

  assert.equal(
    signalManagedProcessPid(1234, "SIGTERM", () => {
      throw error;
    }),
    false
  );
});

test("does not hide permission failures", () => {
  const error = Object.assign(new Error("not allowed"), { code: "EPERM" });

  assert.throws(
    () => signalManagedProcessPid(1234, "SIGKILL", () => {
      throw error;
    }),
    /not allowed/
  );
});
