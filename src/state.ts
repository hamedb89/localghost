import { existsSync } from "node:fs";
import { join } from "node:path";
import { readTextFile, writeTextFile } from "./fs.js";
import type { DevHostEntry } from "./parse.js";

export const LOCALGHOST_STATE_FILE = "ops/local/localghost-state.json";

export type LocalghostStateAction = "setup" | "teardown";

export type LocalghostState = {
  version: 1;
  action: LocalghostStateAction;
  updatedAt: string;
  projectName: string;
  cwd: string;
  configPath?: string;
  hostsPath?: string;
  hostsChanged?: boolean;
  hostsTempPath?: string;
  caddyfilePath?: string;
  caddyfileRemoved?: boolean;
  caddyHttps?: boolean;
  caddyTrustedAt?: string;
  caddyTrustPromptedAt?: string;
  entries?: DevHostEntry[];
};

export type WriteLocalghostStateInput = Omit<LocalghostState, "version" | "updatedAt">;

export function getLocalghostStatePath(cwd = process.cwd()) {
  return join(cwd, LOCALGHOST_STATE_FILE);
}

export function readLocalghostState(cwd = process.cwd()): LocalghostState | null {
  const path = getLocalghostStatePath(cwd);
  if (!existsSync(path)) return null;
  return JSON.parse(readTextFile(path)) as LocalghostState;
}

export function writeLocalghostState(cwd: string, state: WriteLocalghostStateInput) {
  const path = getLocalghostStatePath(cwd);
  writeTextFile(path, `${JSON.stringify({ ...state, version: 1, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  return path;
}

export function patchLocalghostState(cwd: string, patch: Partial<WriteLocalghostStateInput>) {
  const current = readLocalghostState(cwd);
  if (!current) return null;
  return writeLocalghostState(cwd, { ...(current as unknown as WriteLocalghostStateInput), ...patch });
}
