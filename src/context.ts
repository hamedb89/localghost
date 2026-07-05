import { existsSync } from "node:fs";
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
  projectConfigPath?: string;
};

export type LocalghostProjectConfig = Omit<LocalghostContextOptions, "cwd" | "localghostConfig">;

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

async function readProjectConfig(cwd: string, configFile: string | false | undefined) {
  if (configFile === false) return {};

  const candidates = configFile ? [configFile] : LOCALGHOST_PROJECT_CONFIG_FILES;
  const path = candidates.map((candidate) => resolveDevHostsPath({ cwd, fileName: candidate }).path).find((candidate) => existsSync(candidate));
  if (!path) return {};

  const imported = await import(`${pathToFileURL(path).href}?localghost=${Date.now()}`);
  const config = (imported.default ?? imported) as LocalghostProjectConfig;

  return { config, path };
}

export function defineLocalghostConfig<T extends LocalghostContextOptions>(config: T) {
  return config;
}

export async function resolveLocalghostContext(options: LocalghostContextOptions = {}): Promise<LocalghostContext> {
  const cwd = options.cwd ?? process.cwd();
  const projectConfig = await readProjectConfig(cwd, options.localghostConfig);
  const merged = {
    ...projectConfig.config,
    ...defined(options)
  } as LocalghostContextOptions;
  const readOptions = readOptionsFromContext({ ...merged, cwd });
  const resolvedPath = resolveDevHostsPath(readOptions);
  const configEntries = readDevHosts(readOptions);
  const requestedPort = merged.port ?? envPort() ?? configEntries[0]?.port ?? 5173;
  const dynamicPort = merged.dynamicPort ?? envDynamicPort() ?? false;
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

  return {
    cwd,
    projectName: sanitizeProjectName(merged.project ?? getProjectName(cwd)),
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
    ...(projectConfig.path ? { projectConfigPath: projectConfig.path } : {})
  };
}
