#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const localghostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args.shift();

if (command !== "test") {
  console.error("Usage: ghost consumer test <name> --repo <path> [--keep] -- <command> [...args]");
  process.exit(2);
}

const name = args.shift();
const repoIndex = args.indexOf("--repo");
const separatorIndex = args.indexOf("--");
const repo = repoIndex >= 0 ? args[repoIndex + 1] : undefined;
const keep = args.includes("--keep");
const childCommand = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

if (!name || !repo || repoIndex + 1 >= args.length || childCommand.length === 0) {
  console.error("Usage: ghost consumer test <name> --repo <path> [--keep] -- <command> [...args]");
  process.exit(2);
}

const consumerRoot = resolve(repo);
if (!existsSync(resolve(consumerRoot, ".git")) && !existsSync(resolve(consumerRoot, "package.json"))) {
  throw new Error(`Consumer repository does not exist: ${consumerRoot}`);
}

const worktreeRoot = resolve(localghostRoot, ".tmp/consumer-worktrees", `${name}-${Date.now()}`);
await mkdir(dirname(worktreeRoot), { recursive: true });

try {
  await execa("git", ["worktree", "add", "--detach", worktreeRoot, "HEAD"], { cwd: consumerRoot, stdio: "inherit" });
  await writeConsumerLocalghostConfig(worktreeRoot, name);
  await execa("pnpm", ["install", "--frozen-lockfile"], { cwd: worktreeRoot, stdio: "inherit" });
  await execa("npm", ["run", "build"], { cwd: localghostRoot, stdio: "inherit" });
  await execa("pnpm", ["link", localghostRoot], { cwd: worktreeRoot, stdio: "inherit" });

  console.log(`Consumer worktree: ${worktreeRoot}`);
  console.log(`Localghost overlay: ${localghostRoot}`);
  await execa(childCommand[0], childCommand.slice(1), {
    cwd: worktreeRoot,
    stdio: "inherit",
    extendEnv: true,
    env: {
      ...process.env,
      LOCALGHOST_CONSUMER_WORKTREE: worktreeRoot,
      LOCALGHOST_SOURCE_ROOT: localghostRoot,
      ...(name === "faaast" ? { FAAAST_DEV_HOST_SUFFIX: ".consumer.test" } : {}),
    },
  });
} finally {
  if (keep) {
    console.log(`Keeping consumer worktree: ${worktreeRoot}`);
  } else {
    await execa("git", ["worktree", "remove", "--force", worktreeRoot], { cwd: consumerRoot, stdio: "inherit" });
    await rm(worktreeRoot, { recursive: true, force: true });
  }
}

async function writeConsumerLocalghostConfig(worktreeRoot, consumerName) {
  if (consumerName !== "faaast") return;

  await writeFile(resolve(worktreeRoot, ".localghost"), [
    "# Generated for the isolated Localghost consumer worktree.",
    "faaast.consumer.test 5915",
    "www.faaast.consumer.test 5915",
    "app.faaast.consumer.test 5914",
    "admin.faaast.consumer.test 5914",
    "moodboard.faaast.consumer.test 5916",
    "chat.faaast.consumer.test 5917",
    "api.faaast.consumer.test 5920",
    "mastra.faaast.consumer.test 5911",
    "socialworkouts.consumer.test 5990",
    "www.socialworkouts.consumer.test 5990",
    ""
  ].join("\n"));
}
