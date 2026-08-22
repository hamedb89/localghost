import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

export type DevHostEntry = {
  host: string;
  port: number;
  target: string;
};

export const LOCALGHOST_GHOST_TUNNEL_FILE = ".ghosttunnel";

export type ReadGhostTunnelOptions = ReadDevHostsOptions;

export type ReadDevHostsOptions = {
  cwd?: string;
  fileName?: string;
  configFiles?: string[];
  configPattern?: string | RegExp;
};

function getCandidates(options: ReadGhostTunnelOptions) {
  const exact = [...new Set([...(options.fileName ? [options.fileName] : []), ...(options.configFiles ?? [])])];
  const pattern = options.configPattern
    ? readdirSync(options.cwd ?? process.cwd(), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => {
        const matcher = typeof options.configPattern === "string"
          ? new RegExp(options.configPattern)
          : options.configPattern;
        if (!matcher) return false;
        matcher.lastIndex = 0;
        return matcher.test(name);
      })
      .sort()
    : [];
  if (exact.length > 0 || pattern.length > 0) return [...new Set([...exact, ...pattern])];
  return [LOCALGHOST_GHOST_TUNNEL_FILE];
}

function parseGhostTunnelEntries(input: string, fileName: string): DevHostEntry[] {
  const entries: DevHostEntry[] = [];
  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const host = parts[0];
    const portRaw = parts[1];
    if (!host || !portRaw || parts.length > 2) {
      throw new Error(`Invalid ${fileName} line ${index + 1}: "${rawLine}"`);
    }
    if (!/^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.?$/i.test(host)) {
      throw new Error(`Invalid host on line ${index + 1}: "${host}"`);
    }
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port on line ${index + 1}: "${portRaw}"`);
    }
    entries.push({ host: host.toLowerCase().replace(/\.$/, ""), port, target: `127.0.0.1:${port}` });
  });
  return entries;
}

function toGhostTunnelOptions(options: ReadGhostTunnelOptions | string = {}): ReadGhostTunnelOptions {
  const resolved = typeof options === "string" ? { cwd: options } : options;

  return {
    ...resolved,
    fileName: resolved.fileName ?? LOCALGHOST_GHOST_TUNNEL_FILE
  };
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function resolveGhostTunnelPath(options: ReadGhostTunnelOptions | string = {}) {
  const resolved = toGhostTunnelOptions(options);
  const cwd = resolved.cwd ?? process.cwd();
  const searchedFiles = getCandidates(resolved);
  for (const fileName of searchedFiles) {
    const path = resolve(cwd, fileName);
    if (existsSync(path)) return { path, fileName: basename(fileName), exists: true, searchedFiles };
  }
  const fileName = searchedFiles[0] ?? LOCALGHOST_GHOST_TUNNEL_FILE;
  return { path: resolve(cwd, fileName), fileName: basename(fileName), exists: false, searchedFiles };
}

export function getGhostTunnelPath(options: ReadGhostTunnelOptions | string = {}) {
  return resolveGhostTunnelPath(options).path;
}

export function readGhostTunnelEntries(options: ReadGhostTunnelOptions | string = {}) {
  const resolved = resolveGhostTunnelPath(options);
  if (!resolved.exists) throw new Error(`Missing Ghost Tunnel file: ${resolved.path}`);
  return parseGhostTunnelEntries(readFileSync(resolved.path, "utf8"), resolved.fileName);
}

export function listGhostTunnelEntries(options: ReadGhostTunnelOptions | string = {}) {
  const resolved = resolveGhostTunnelPath(options);
  if (!resolved.exists) return [] satisfies DevHostEntry[];
  return readGhostTunnelEntries(options);
}

export function findGhostTunnelEntry(host: string, options: ReadGhostTunnelOptions | string = {}) {
  const normalizedHost = normalizeHost(host);
  return listGhostTunnelEntries(options).find((entry) => entry.host === normalizedHost);
}
