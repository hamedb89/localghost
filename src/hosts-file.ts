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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const start = `# localghost:start ${sanitizedProjectName}`;
  const end = `# localghost:end ${sanitizedProjectName}`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");

  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }

  return `${existing.trimEnd()}\n\n${block}`;
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

  const tempPath = join(tmpdir(), `localghost-${sanitizedProjectName}-hosts`);
  writeFileSync(tempPath, next, "utf8");

  if (process.platform === "win32") {
    throw new Error(`Windows support: run as administrator and copy ${tempPath} to ${hostsPath}.`);
  }

  await execa("sudo", ["cp", tempPath, hostsPath], { stdio: "inherit" });

  return { changed: true, hostsPath, tempPath };
}
