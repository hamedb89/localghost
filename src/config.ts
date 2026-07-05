import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseDevHosts } from "./parse.js";

export const LOCALGHOST_CONFIG_FILE = ".localghost";

export type ConfigPattern = string | RegExp;

export type ReadDevHostsOptions = {
  cwd?: string;
  fileName?: string;
  configFiles?: string[];
  configPattern?: ConfigPattern;
};

export type ResolvedDevHostsPath = {
  path: string;
  fileName: string;
  exists: boolean;
  searchedFiles: string[];
  configPattern?: ConfigPattern;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toRegExp(pattern: ConfigPattern) {
  return typeof pattern === "string" ? new RegExp(pattern) : pattern;
}

function findPatternMatches(cwd: string, pattern: ConfigPattern) {
  const matcher = toRegExp(pattern);

  return readdirSync(cwd, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      matcher.lastIndex = 0;
      return matcher.test(name);
    })
    .sort();
}

export function getConfigFileCandidates(options: ReadDevHostsOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const exactFiles = unique([
    ...(options.fileName ? [options.fileName] : []),
    ...(options.configFiles ?? [])
  ]);
  const patternFiles = options.configPattern ? findPatternMatches(cwd, options.configPattern) : [];
  const candidates = unique([...exactFiles, ...patternFiles]);

  if (candidates.length > 0) return candidates;
  if (exactFiles.length > 0 || options.configPattern) return [];
  return [LOCALGHOST_CONFIG_FILE];
}

export function resolveDevHostsPath(options: ReadDevHostsOptions = {}): ResolvedDevHostsPath {
  const cwd = options.cwd ?? process.cwd();
  const searchedFiles = getConfigFileCandidates(options);

  for (const fileName of searchedFiles) {
    const path = resolve(cwd, fileName);
    if (existsSync(path)) {
      return {
        path,
        fileName: basename(fileName),
        exists: true,
        searchedFiles,
        ...(options.configPattern ? { configPattern: options.configPattern } : {})
      };
    }
  }

  const fileName = searchedFiles[0] ?? LOCALGHOST_CONFIG_FILE;

  return {
    path: resolve(cwd, fileName),
    fileName: basename(fileName),
    exists: false,
    searchedFiles,
    ...(options.configPattern ? { configPattern: options.configPattern } : {})
  };
}

export function getDevHostsPath(options: ReadDevHostsOptions = {}) {
  return resolveDevHostsPath(options).path;
}

function formatSearchedFiles(files: string[], pattern?: ConfigPattern) {
  if (files.length > 0) return files.map((file) => `\`${file}\``).join(", ");
  if (pattern) return `files matching ${pattern.toString()}`;
  return `\`${LOCALGHOST_CONFIG_FILE}\``;
}

export function readDevHosts(options: ReadDevHostsOptions | string = {}) {
  const resolvedOptions = typeof options === "string" ? { cwd: options } : options;
  const resolvedPath = resolveDevHostsPath(resolvedOptions);

  if (!resolvedPath.exists) {
    const cwd = resolvedOptions.cwd ?? process.cwd();
    throw new Error(
      `Missing Localghost config in ${cwd}. Looked for ${formatSearchedFiles(resolvedPath.searchedFiles, resolvedPath.configPattern)}. Run \`localghost init\` or pass --config/--config-pattern.`
    );
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
