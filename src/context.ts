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
  fileName?: string;
  configFiles?: string[];
  configPattern?: ConfigPattern;
  port?: number;
  https?: boolean;
  bindHost?: string | boolean;
  primaryHost?: string;
  dynamicPort?: boolean;
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
};

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

export function defineLocalghostConfig<T extends LocalghostContextOptions>(config: T) {
  return config;
}

export async function resolveLocalghostContext(options: LocalghostContextOptions = {}): Promise<LocalghostContext> {
  const cwd = options.cwd ?? process.cwd();
  const readOptions = readOptionsFromContext({ ...options, cwd });
  const resolvedPath = resolveDevHostsPath(readOptions);
  const configEntries = readDevHosts(readOptions);
  const requestedPort = options.port ?? envPort() ?? configEntries[0]?.port ?? 5173;
  const dynamicPort = options.dynamicPort ?? envDynamicPort() ?? false;
  const bindHost = options.bindHost ?? "127.0.0.1";
  const probeHost = typeof bindHost === "string" ? bindHost : "127.0.0.1";
  const port = dynamicPort ? await findAvailablePort(requestedPort, { host: probeHost }) : requestedPort;
  const entries = withRuntimePort(configEntries, requestedPort, port);
  const hosts = uniqueHosts(entries);
  const primaryHost =
    options.primaryHost ??
    entries.find((entry) => entry.port === port)?.host ??
    hosts[0] ??
    `${sanitizeProjectName(getProjectName(cwd))}.localhost`;

  return {
    cwd,
    projectName: sanitizeProjectName(options.project ?? getProjectName(cwd)),
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
    https: options.https === true
  };
}
