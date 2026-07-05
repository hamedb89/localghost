import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { sanitizeProjectName } from "./config.js";
import { readTextFile } from "./fs.js";
import type { DevHostEntry } from "./parse.js";

export type UpdateSystemHostsResult = {
  changed: boolean;
  hostsPath: string;
  tempPath?: string;
};

export type RemoveSystemHostsResult = UpdateSystemHostsResult & {
  removed: boolean;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getManagedBlockPattern(projectName: string) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const start = `# localghost:start ${sanitizedProjectName}`;
  const end = `# localghost:end ${sanitizedProjectName}`;
  return new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
}

export function getSystemHostsPath() {
  return process.platform === "win32" ? "C:\\Windows\\System32\\drivers\\etc\\hosts" : "/etc/hosts";
}

export function renderHostsBlock(projectName: string, entries: DevHostEntry[]) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const hosts = [...new Set(entries.map((entry) => entry.host))].sort();

  return [
    `# localghost:start ${sanitizedProjectName}`,
    ...hosts.map((host) => `127.0.0.1 ${host}`),
    `# localghost:end ${sanitizedProjectName}`,
    ""
  ].join("\n");
}

export function upsertManagedBlock(existing: string, projectName: string, block: string) {
  const pattern = getManagedBlockPattern(projectName);

  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }

  return `${existing.trimEnd()}\n\n${block}`;
}

export function removeManagedBlock(existing: string, projectName: string) {
  const pattern = getManagedBlockPattern(projectName);

  if (!pattern.test(existing)) {
    return existing;
  }

  return existing.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

async function writeSystemHostsFile(hostsPath: string, next: string, projectName: string) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const tempPath = join(tmpdir(), `localghost-${sanitizedProjectName}-hosts`);
  writeFileSync(tempPath, next, "utf8");

  if (process.platform === "win32") {
    throw new Error(`Windows support: run as administrator and copy ${tempPath} to ${hostsPath}.`);
  }

  await execa("sudo", ["cp", tempPath, hostsPath], { stdio: "inherit" });

  return tempPath;
}

export async function updateSystemHosts(projectName: string, entries: DevHostEntry[]): Promise<UpdateSystemHostsResult> {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const hostsPath = getSystemHostsPath();
  const existing = readTextFile(hostsPath);
  const block = renderHostsBlock(sanitizedProjectName, entries);
  const next = upsertManagedBlock(existing, sanitizedProjectName, block);

  if (next === existing) {
    return { changed: false, hostsPath };
  }

  const tempPath = await writeSystemHostsFile(hostsPath, next, sanitizedProjectName);

  return { changed: true, hostsPath, tempPath };
}

export async function removeSystemHosts(projectName: string): Promise<RemoveSystemHostsResult> {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const hostsPath = getSystemHostsPath();
  const existing = readTextFile(hostsPath);
  const next = removeManagedBlock(existing, sanitizedProjectName);

  if (next === existing) {
    return { changed: false, removed: false, hostsPath };
  }

  const tempPath = await writeSystemHostsFile(hostsPath, next, sanitizedProjectName);

  return { changed: true, removed: true, hostsPath, tempPath };
}
