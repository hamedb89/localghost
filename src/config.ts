import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDevHosts } from "./parse.js";

export const LOCALGHOST_CONFIG_FILE = ".localghost";
export const LEGACY_DEV_HOSTS_FILE = ".dev-hosts";

export type ReadDevHostsOptions = {
  cwd?: string;
  fileName?: string;
};

export type ResolvedDevHostsPath = {
  path: string;
  fileName: string;
  exists: boolean;
  isLegacy: boolean;
};

export function resolveDevHostsPath(options: ReadDevHostsOptions = {}): ResolvedDevHostsPath {
  const cwd = options.cwd ?? process.cwd();

  if (options.fileName) {
    const path = resolve(cwd, options.fileName);
    return {
      path,
      fileName: options.fileName,
      exists: existsSync(path),
      isLegacy: options.fileName === LEGACY_DEV_HOSTS_FILE
    };
  }

  const localghostPath = resolve(cwd, LOCALGHOST_CONFIG_FILE);
  if (existsSync(localghostPath)) {
    return {
      path: localghostPath,
      fileName: LOCALGHOST_CONFIG_FILE,
      exists: true,
      isLegacy: false
    };
  }

  const legacyPath = resolve(cwd, LEGACY_DEV_HOSTS_FILE);
  if (existsSync(legacyPath)) {
    return {
      path: legacyPath,
      fileName: LEGACY_DEV_HOSTS_FILE,
      exists: true,
      isLegacy: true
    };
  }

  return {
    path: localghostPath,
    fileName: LOCALGHOST_CONFIG_FILE,
    exists: false,
    isLegacy: false
  };
}

export function getDevHostsPath(options: ReadDevHostsOptions = {}) {
  return resolveDevHostsPath(options).path;
}

export function readDevHosts(options: ReadDevHostsOptions | string = {}) {
  const resolvedOptions = typeof options === "string" ? { cwd: options } : options;
  const resolvedPath = resolveDevHostsPath(resolvedOptions);

  if (!resolvedPath.exists) {
    const cwd = resolvedOptions.cwd ?? process.cwd();
    throw new Error(`Missing ${LOCALGHOST_CONFIG_FILE} in ${cwd}. Run \`localghost init\` or create ${LOCALGHOST_CONFIG_FILE}.`);
  }

  return parseDevHosts(readFileSync(resolvedPath.path, "utf8"), resolvedPath.fileName);
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
