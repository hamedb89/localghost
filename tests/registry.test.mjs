import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { createLocalghostRegistry, canonicalizeLocalghostProjectCwd } = await import("../dist/index.js");

async function setup() {
  return mkdtemp(join(tmpdir(), "localghost-registry-"));
}

const available = () => true;

test("reuses a stable allocation and canonicalizes project cwd", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 101, isProcessRunning: () => true });
  const first = await registry.acquirePort({ projectCwd: "/tmp/project/../project", instanceKey: "web", startPort: 4100 });
  await registry.releasePort({ projectCwd: "/tmp/project", instanceKey: "web" });
  const second = await registry.acquirePort({ projectCwd: "/tmp/project", instanceKey: "web", startPort: 4100 });
  assert.equal(first.port, second.port);
  assert.equal(second.projectCwd, canonicalizeLocalghostProjectCwd("/tmp/project"));
});

test("gives distinct active leases and honors reserved ports", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 102, isProcessRunning: () => true });
  const first = await registry.acquirePort({ instanceKey: "one", startPort: 4200, reservedPorts: [4200] });
  const second = await registry.acquirePort({ instanceKey: "two", startPort: 4200, reservedPorts: [4200] });
  assert.equal(first.port, 4201);
  assert.equal(second.port, 4202);
});

test("does not let another process steal the same instance key", async () => {
  const root = await setup();
  const firstRegistry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 201, isProcessRunning: () => true });
  const secondRegistry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 202, isProcessRunning: () => true });
  const first = await firstRegistry.acquirePort({ instanceKey: "run", startPort: 4250 });
  const second = await secondRegistry.acquirePort({ instanceKey: "run", startPort: 4250 });
  assert.notEqual(first.ownerToken, second.ownerToken);
  assert.notEqual(first.port, second.port);
});

test("release removes the lease while preserving the allocation", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 103, isProcessRunning: () => true });
  const lease = await registry.acquirePort({ instanceKey: "web", startPort: 4300 });
  assert.equal(await registry.releasePort({ instanceKey: "web" }), true);
  assert.deepEqual((await registry.read()).leases, []);
  assert.equal((await registry.read()).allocations[0].port, lease.port);
});

test("renew extends only the owning live lease", async () => {
  const root = await setup();
  let now = 1_000;
  const registry = createLocalghostRegistry({ stateRoot: root, now: () => now, pid: 109, isProcessRunning: (pid) => pid === 109, availabilityCheck: available });
  const lease = await registry.acquirePort({ instanceKey: "test:one:default", startPort: 4350, leaseTtlMs: 100 });
  now = 1_050;
  const renewed = await registry.renewPort({ instanceKey: lease.instanceKey, leaseTtlMs: 500 });

  assert.equal(renewed?.port, 4350);
  assert.equal(renewed?.expiresAt, 1_550);
  assert.equal(await registry.renewPort({ instanceKey: "test:other:default" }), undefined);
});

test("reset clears leases and allocations", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available });
  await registry.acquirePort({ instanceKey: "test:reset:default", startPort: 4350 });
  await registry.reset();

  assert.deepEqual(await registry.read(), { version: 1, allocations: [], leases: [] });
});

test("prunes expired and dead leases before allocating", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 104, now: () => 1000, isProcessRunning: (pid) => pid === 104 });
  await writeFile(join(root, "registry.json"), JSON.stringify({ version: 1, allocations: [], leases: [
    { projectCwd: "/dead", instanceKey: "x", port: 4400, pid: 999, acquiredAt: 0, expiresAt: 2000 },
    { projectCwd: "/expired", instanceKey: "x", port: 4401, pid: 104, acquiredAt: 0, expiresAt: 999 }
  ] }));
  const lease = await registry.acquirePort({ instanceKey: "web", startPort: 4400 });
  assert.equal(lease.port, 4400);
  assert.equal((await registry.read()).leases.length, 1);
});

test("recovers from malformed registry data", async () => {
  const root = await setup();
  await writeFile(join(root, "registry.json"), "not-json");
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 105, isProcessRunning: () => true });
  const lease = await registry.acquirePort({ instanceKey: "web", startPort: 4500 });
  assert.equal(lease.port, 4500);
  assert.equal((JSON.parse(await readFile(join(root, "registry.json"), "utf8"))).version, 1);
});

test("times out when a live lock owner holds the registry", async () => {
  const root = await setup();
  await writeFile(join(root, "registry.lock"), JSON.stringify({ pid: 106, createdAt: Date.now(), token: "held" }));
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 107, isProcessRunning: (pid) => pid === 106, lockTimeoutMs: 20, lockRetryMs: 2 });
  await assert.rejects(registry.acquirePort({ instanceKey: "web" }), /Timed out waiting/);
});

test("recovers a lock left by a dead process", async () => {
  const root = await setup();
  await writeFile(join(root, "registry.lock"), JSON.stringify({ pid: 999, createdAt: Date.now(), token: "dead" }));
  const registry = createLocalghostRegistry({ stateRoot: root, availabilityCheck: available, pid: 108, isProcessRunning: () => false });
  assert.equal((await registry.acquirePort({ instanceKey: "web", startPort: 4600 })).port, 4600);
});

test("prunes expired and dead leases without changing allocations", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, now: () => 1000, isProcessRunning: (pid) => pid === 108 });
  await writeFile(join(root, "registry.json"), JSON.stringify({ version: 1, allocations: [
    { projectCwd: "/project", instanceKey: "run", port: 4700, updatedAt: 1 }
  ], leases: [
    { projectCwd: "/dead", instanceKey: "run", port: 4701, pid: 999, acquiredAt: 0, expiresAt: 2000 },
    { projectCwd: "/expired", instanceKey: "run", port: 4702, pid: 108, acquiredAt: 0, expiresAt: 999 }
  ] }));

  assert.deepEqual(await registry.prune(), { removedLeases: 2 });
  assert.deepEqual((await registry.read()).allocations, [
    { projectCwd: "/project", instanceKey: "run", port: 4700, updatedAt: 1 }
  ]);
  assert.deepEqual((await registry.read()).leases, []);
});

test("test-session pruning removes only stale test state and preserves live sessions", async () => {
  const root = await setup();
  const registry = createLocalghostRegistry({ stateRoot: root, now: () => 1_000, isProcessRunning: (pid) => pid === 101 });
  await writeFile(join(root, "registry.json"), JSON.stringify({ version: 1, allocations: [
    { projectCwd: "/app", instanceKey: "test:stale:default", port: 4800, updatedAt: 1 },
    { projectCwd: "/app", instanceKey: "test:live:default", port: 4801, updatedAt: 1 },
    { projectCwd: "/app", instanceKey: "dev", port: 4802, updatedAt: 1 }
  ], leases: [
    { projectCwd: "/app", instanceKey: "test:stale:default", port: 4800, pid: 999, acquiredAt: 0, expiresAt: 2_000, ownerToken: "stale" },
    { projectCwd: "/app", instanceKey: "test:live:default", port: 4801, pid: 101, acquiredAt: 0, expiresAt: 2_000, ownerToken: "live" },
    { projectCwd: "/app", instanceKey: "dev", port: 4802, pid: 999, acquiredAt: 0, expiresAt: 2_000, ownerToken: "dev" }
  ] }));

  assert.deepEqual(await registry.pruneTestSessions(), { removedLeases: 1, removedAllocations: 1 });
  const result = await registry.read();
  assert.deepEqual(result.leases.map(({ instanceKey }) => instanceKey), ["test:live:default", "dev"]);
  assert.deepEqual(result.allocations.map(({ instanceKey }) => instanceKey), ["test:live:default", "dev"]);
});
