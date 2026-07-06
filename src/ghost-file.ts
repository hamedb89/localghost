import { readDevHosts, resolveDevHostsPath, type ReadDevHostsOptions } from "./config.js";
import type { DevHostEntry } from "./parse.js";

export const LOCALGHOST_GHOST_TUNNEL_FILE = ".ghosttunnel";

export type ReadGhostTunnelOptions = ReadDevHostsOptions;

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
  return resolveDevHostsPath(toGhostTunnelOptions(options));
}

export function getGhostTunnelPath(options: ReadGhostTunnelOptions | string = {}) {
  return resolveGhostTunnelPath(options).path;
}

export function readGhostTunnelEntries(options: ReadGhostTunnelOptions | string = {}) {
  return readDevHosts(toGhostTunnelOptions(options));
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
