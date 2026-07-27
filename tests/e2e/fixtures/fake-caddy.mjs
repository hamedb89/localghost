#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const command = process.argv[2];
const logPath = process.env.LOCALGHOST_E2E_CADDY_LOG;

if (command === "version") {
  console.log("v2.0.0 localghost-e2e");
  process.exit(0);
}

if (command === "validate") {
  if (logPath) appendFileSync(logPath, "validated\n");
  process.exit(0);
}

if (command === "trust") {
  if (logPath) appendFileSync(logPath, "trusted\n");
  process.exit(0);
}

if (command !== "run") {
  console.error(`Unsupported fake Caddy command: ${command ?? "<missing>"}`);
  process.exit(2);
}

if (logPath) appendFileSync(logPath, `started ${process.pid}\n`);

const stop = () => {
  if (logPath) appendFileSync(logPath, `stopped ${process.pid}\n`);
  process.exit(0);
};

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
setInterval(() => {}, 60_000);
