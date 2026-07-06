import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getProjectName,
  readDevHosts,
  resolveDevHostsPath,
  sanitizeProjectName,
  type ConfigPattern,
  type ReadDevHostsOptions
} from "./config.js";
import { findAvailablePort } from "./port.js";
import type { DevHostEntry } from "./parse.js";
import { resolveGhostTunnelConfig, type GhostTunnelConfig, type GhostTunnelOptions } from "./tunnel.js";

export type LocalghostContextOptions = {
  cwd?: string;
  project?: string;
  localghostConfig?: string | false;
  fileName?: string;
  configFiles?: string[];
  configPattern?: ConfigPattern;
  port?: number;
  https?: boolean;
  bindHost?: string | boolean;
  primaryHost?: string;
  dynamicPort?: boolean;
  wwwAlias?: boolean;
  ghostTunnelDomain?: string;
  ghostTunnel?: GhostTunnelOptions;
};

export type LocalghostContext = {
  cwd: string;
  projectName: string;
  readOptions: ReadDevHostsOptions;
  configPath: string;
  configFileName: string;
  configEntries: DevHostEntry[];
  entries: DevHostEntry[];
  hosts: string[];
  requestedPort: number;
  port: number;
  dynamicPort: boolean;
  bindHost: string | boolean;
  primaryHost: string;
  https: boolean;
  wwwAlias: boolean;
  ghostTunnelDomain?: string;
  ghostTunnel: GhostTunnelConfig;
  projectConfigPath?: string;
};

export type LocalghostProjectConfig = Omit<LocalghostContextOptions, "cwd" | "localghostConfig">;

export type LocalghostProjectConfigResult = {
  config: LocalghostProjectConfig;
  path?: string;
};

const LOCALGHOST_PROJECT_CONFIG_FILES = [
  "localghost.config.mjs",
  "localghost.config.js",
  "localghost.config.cjs"
];

function parsePort(value: string | undefined) {
  if (!value) return undefined;
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

function envPort() {
  return parsePort(process.env.LOCALGHOST_PORT) ?? parsePort(process.env.VITE_PORT);
}

function envDynamicPort() {
  const value = process.env.LOCALGHOST_DYNAMIC_PORT;
  if (!value) return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envHttps() {
  const value = process.env.LOCALGHOST_HTTPS;
  if (!value) return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getPackageName(cwd: string) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { name?: unknown };
    return typeof pkg.name === "string" ? pkg.name : undefined;
  } catch {
    return undefined;
  }
}

function getPackageOwner(cwd: string) {
  const packageName = getPackageName(cwd);
  if (!packageName?.startsWith("@")) return undefined;
  return packageName.slice(1).split("/")[0];
}

function getLocalOwner(cwd: string) {
  return sanitizeProjectName(process.env.LOCALGHOST_OWNER ?? getPackageOwner(cwd) ?? process.env.USER ?? process.env.USERNAME ?? "local");
}

function getRouteName(primaryHost: string, fallback: string) {
  return sanitizeProjectName(primaryHost.split(".")[0] ?? fallback);
}

function readOptionsFromContext(options: LocalghostContextOptions): ReadDevHostsOptions {
  return {
    cwd: options.cwd ?? process.cwd(),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    ...(options.configFiles ? { configFiles: options.configFiles } : {}),
    ...(options.configPattern ? { configPattern: options.configPattern } : {})
  };
}

function withRuntimePort(entries: DevHostEntry[], requestedPort: number, port: number) {
  if (requestedPort === port) return entries;

  const hasRequestedPort = entries.some((entry) => entry.port === requestedPort);
  if (!hasRequestedPort) return entries;

  return entries.map((entry) => (entry.port === requestedPort ? { ...entry, port } : entry));
}

function uniqueHosts(entries: DevHostEntry[]) {
  return [...new Set(entries.map((entry) => entry.host))];
}

function isAliasableHost(host: string) {
  return host.includes(".") && !host.startsWith("www.") && !host.includes(":");
}

export function getDefaultWwwAlias(host: string) {
  return isAliasableHost(host) ? `www.${host}` : null;
}

export function addDefaultWwwAliases(entries: DevHostEntry[]) {
  const seen = new Set(entries.map((entry) => entry.host));
  const aliases: DevHostEntry[] = [];

  for (const entry of entries) {
    const alias = getDefaultWwwAlias(entry.host);
    if (alias && !seen.has(alias)) {
      aliases.push({ host: alias, port: entry.port, target: `127.0.0.1:${entry.port}` });
      seen.add(alias);
    }
  }

  return [...entries, ...aliases];
}

function defined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value !== "undefined")) as Partial<T>;
}

export async function readLocalghostProjectConfig(options: {
  cwd?: string;
  configFile?: string | false;
} = {}): Promise<LocalghostProjectConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  if (options.configFile === false) return { config: {} };

  const candidates = options.configFile ? [options.configFile] : LOCALGHOST_PROJECT_CONFIG_FILES;
  const path = candidates.map((candidate) => resolveDevHostsPath({ cwd, fileName: candidate }).path).find((candidate) => existsSync(candidate));
  if (!path) return { config: {} };

  const imported = await import(`${pathToFileURL(path).href}?localghost=${Date.now()}`);
  const config = (imported.default ?? imported) as LocalghostProjectConfig;

  return { config, path };
}

export function defineLocalghostConfig<T extends LocalghostContextOptions>(config: T) {
  return config;
}

export async function resolveLocalghostContext(options: LocalghostContextOptions = {}): Promise<LocalghostContext> {
  const cwd = options.cwd ?? process.cwd();
  const projectConfig = await readLocalghostProjectConfig({
    cwd,
    ...(typeof options.localghostConfig !== "undefined" ? { configFile: options.localghostConfig } : {})
  });
  const merged = {
    ...projectConfig.config,
    ...defined(options)
  } as LocalghostContextOptions;
  const readOptions = readOptionsFromContext({ ...merged, cwd });
  const resolvedPath = resolveDevHostsPath(readOptions);
  const configEntries = readDevHosts(readOptions);
  const requestedPort = merged.port ?? envPort() ?? configEntries[0]?.port ?? 5173;
  const dynamicPort = merged.dynamicPort ?? envDynamicPort() ?? true;
  const bindHost = merged.bindHost ?? "127.0.0.1";
  const probeHost = typeof bindHost === "string" ? bindHost : "127.0.0.1";
  const port = dynamicPort ? await findAvailablePort(requestedPort, { host: probeHost }) : requestedPort;
  const wwwAlias = merged.wwwAlias ?? true;
  const entries = wwwAlias
    ? addDefaultWwwAliases(withRuntimePort(configEntries, requestedPort, port))
    : withRuntimePort(configEntries, requestedPort, port);
  const hosts = uniqueHosts(entries);
  const primaryHost =
    merged.primaryHost ??
    entries.find((entry) => entry.port === port)?.host ??
    hosts[0] ??
    `${sanitizeProjectName(getProjectName(cwd))}.localhost`;
  const projectName = sanitizeProjectName(merged.project ?? getProjectName(cwd));
  const ghostTunnelDomain = merged.ghostTunnelDomain;
  const ghostTunnel = resolveGhostTunnelConfig(merged.ghostTunnel, {
    ...(ghostTunnelDomain ? { domain: ghostTunnelDomain } : {}),
    route: getRouteName(primaryHost, projectName),
    project: projectName,
    owner: getLocalOwner(cwd)
  });

  return {
    cwd,
    projectName,
    readOptions,
    configPath: resolvedPath.path,
    configFileName: resolvedPath.fileName,
    configEntries,
    entries,
    hosts,
    requestedPort,
    port,
    dynamicPort,
    bindHost,
    primaryHost,
    https: merged.https ?? envHttps() ?? false,
    wwwAlias,
    ...(ghostTunnelDomain ? { ghostTunnelDomain } : {}),
    ghostTunnel,
    ...(projectConfig.path ? { projectConfigPath: projectConfig.path } : {})
  };
}
