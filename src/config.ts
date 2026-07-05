import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDevHosts } from "./parse.js";

export type ReadDevHostsOptions = {
  cwd?: string;
  fileName?: string;
};

export function getDevHostsPath(options: ReadDevHostsOptions = {}) {
  return resolve(options.cwd ?? process.cwd(), options.fileName ?? ".dev-hosts");
}

export function readDevHosts(options: ReadDevHostsOptions | string = {}) {
  const resolvedOptions = typeof options === "string" ? { cwd: options } : options;
  const path = getDevHostsPath(resolvedOptions);

  if (!existsSync(path)) {
    throw new Error(`Missing ${resolvedOptions.fileName ?? ".dev-hosts"} in ${resolvedOptions.cwd ?? process.cwd()}`);
  }

  return parseDevHosts(readFileSync(path, "utf8"));
}

export function getProjectName(cwd = process.cwd()) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { name?: unknown };
    const name = typeof pkg.name === "string" && pkg.name ? pkg.name : "app";
    return sanitizeProjectName(name.replace(/^@/, ""));
  } catch {
    return "app";
  }
}

export function sanitizeProjectName(value: string) {
  const projectName = value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return projectName || "app";
}
