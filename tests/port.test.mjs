import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { importLocalghost } from "./_localghost.mjs";

const { findAvailablePort, isPortAvailable } = await importLocalghost();

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("findAvailablePort skips an occupied starting port", async (t) => {
  const blocker = createServer();
  const startPort = await listen(blocker);
  t.after(() => close(blocker));

  assert.equal(await isPortAvailable(startPort), false);
  assert.equal(await findAvailablePort(startPort, { maxAttempts: 2 }), startPort + 1);
});

test("findAvailablePort reports an exhausted range", async (t) => {
  const blockers = [createServer(), createServer()];
  const firstPort = await listen(blockers[0]);
  await new Promise((resolve, reject) => {
    blockers[1].once("error", reject);
    blockers[1].listen(firstPort + 1, "127.0.0.1", resolve);
  });
  t.after(() => Promise.all(blockers.map(close)));

  await assert.rejects(
    findAvailablePort(firstPort, { maxAttempts: 2 }),
    new RegExp(`No available port found from ${firstPort}`)
  );
});
