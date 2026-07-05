import { existsSync, readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import type { ConfigEnv, HmrOptions, Plugin, UserConfig, ViteDevServer, WsOptions } from "vite";
import {
  getConfigFileCandidates,
  getProjectName,
  resolveDevHostsPath,
  sanitizeProjectName,
  type ConfigPattern,
  type ReadDevHostsOptions
} from "./config.js";
import { addDefaultWwwAliases, resolveLocalghostContext, type LocalghostContext } from "./context.js";
import { checkCaddy } from "./doctor.js";
import { isProductionLike } from "./env.js";
import { writeTextFile } from "./fs.js";
import { getSystemHostsPath, renderHostsBlock, updateSystemHosts } from "./hosts-file.js";
import { ask, canPrompt, confirm } from "./prompt.js";
import { getLocalghostStatePath, readLocalghostState, writeLocalghostState } from "./state.js";
import { getCaddyfilePath, renderCaddyfile, validateCaddyfile, writeCaddyfile } from "./caddy.js";
import type { DevHostEntry } from "./parse.js";

export type LocalGhostPluginOptions = {
  cwd?: string;
  fileName?: string;
  configFiles?: string[];
  configPattern?: ConfigPattern;
  port?: number;
  https?: boolean;
  bindHost?: string | boolean;
  dynamicPort?: boolean;
  primaryHost?: string;
  log?: boolean;
  setup?: boolean | "prompt";
  localghostConfig?: string | false;
  wwwAlias?: boolean;
};

type ServerOptions = NonNullable<UserConfig["server"]>;

function mergeAllowedHosts(current: ServerOptions["allowedHosts"], hosts: string[]) {
  if (Array.isArray(current)) {
    return [...new Set([...current, ...hosts])];
  }

  return hosts;
}

function getDisplayEntries(entries: DevHostEntry[], vitePort: number | undefined) {
  if (!vitePort) {
    return entries;
  }

  const matchingEntries = entries.filter((entry) => entry.port === vitePort);
  return matchingEntries.length > 0 ? matchingEntries : entries;
}

function printLocalHosts(server: ViteDevServer, entries: DevHostEntry[], vitePort: number | undefined, https: boolean) {
  const displayEntries = getDisplayEntries(entries, vitePort);
  const protocol = https ? "https" : "http";
  const urls = displayEntries.map((entry) => `${protocol}://${entry.host}/`);
  const primaryUrl = urls[0];

  if (!primaryUrl) {
    return;
  }

  const lines = [
    "",
    "  localghost",
    `  local:  ${primaryUrl}`,
    ...urls.slice(1).map((url) => `  also:   ${url}`),
    vitePort ? `  target: http://127.0.0.1:${vitePort}/` : undefined,
    https ? "  proxy:  Caddy local HTTPS" : undefined
  ].filter((line): line is string => Boolean(line));

  server.config.logger.info(lines.join("\n"), {
    clear: false,
    timestamp: false
  });
}

function readOptionsFromPlugin(options: LocalGhostPluginOptions): ReadDevHostsOptions {
  return {
    cwd: options.cwd ?? process.cwd(),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    ...(options.configFiles ? { configFiles: options.configFiles } : {}),
    ...(options.configPattern ? { configPattern: options.configPattern } : {})
  };
}

function getConfigWatchFiles(options: LocalGhostPluginOptions) {
  const readOptions = readOptionsFromPlugin(options);
  const cwd = readOptions.cwd ?? process.cwd();
  const resolvedPath = resolveDevHostsPath(readOptions);
  const candidatePaths = getConfigFileCandidates(readOptions).map((fileName) => resolve(cwd, fileName));
  const projectConfigPaths = options.localghostConfig === false
    ? []
    : options.localghostConfig
      ? [resolve(cwd, options.localghostConfig)]
      : ["localghost.config.mjs", "localghost.config.js", "localghost.config.cjs"].map((fileName) => resolve(cwd, fileName));

  return [...new Set([...candidatePaths, resolvedPath.path, ...projectConfigPaths])];
}

function normalizeWatchPath(filePath: string) {
  return normalize(resolve(filePath));
}

function renderConfig(hosts: string[], port: number) {
  return [
    "# Buh. Friendly names for local services.",
    "# Format: <host> <port>",
    ...hosts.map((host) => `${host} ${port}`),
    ""
  ].join("\n");
}

function defaultHost(cwd: string) {
  const projectName = sanitizeProjectName(getProjectName(cwd).split("/").pop() ?? "app");
  return `${projectName}.localhost`;
}

async function promptForHosts(cwd: string, port: number) {
  const primaryHost = await ask("Primary local domain", defaultHost(cwd));
  const hosts = [primaryHost.toLowerCase()];

  while (await confirm("Add another local domain?", false)) {
    const host = await ask("Domain");
    if (host) hosts.push(host.toLowerCase());
  }

  return [...new Set(addDefaultWwwAliases(hosts.map((host) => ({ host, port, target: `127.0.0.1:${port}` }))).map((entry) => entry.host))];
}

function hasReadySetup(cwd: string, entries: DevHostEntry[], configPath: string, https: boolean) {
  const state = readLocalghostState(cwd);
  const projectName = sanitizeProjectName(getProjectName(cwd));
  if (state?.action !== "setup" || state.configPath !== configPath) return false;

  try {
    const hosts = readFileSync(getSystemHostsPath(), "utf8");
    if (!hosts.includes(renderHostsBlock(projectName, entries).trimEnd())) return false;
  } catch {
    return false;
  }

  const caddyfilePath = getCaddyfilePath(cwd);
  return existsSync(caddyfilePath) && readFileSync(caddyfilePath, "utf8") === renderCaddyfile(entries, { https });
}

async function setupProject(cwd: string, entries: DevHostEntry[], configPath: string, https: boolean) {
  const caddy = await checkCaddy();
  if (!caddy.found) {
    throw new Error([
      "Caddy is missing.",
      `Run: ${caddy.installHint}`,
      "Localghost will not install it for you."
    ].join("\n"));
  }

  const projectName = sanitizeProjectName(getProjectName(cwd));
  console.log("Buh. macOS keeps local hostnames in /etc/hosts, so Localghost may ask for your password.");
  console.log("It will only touch its managed Localghost block.");
  const hostsResult = await updateSystemHosts(projectName, entries);
  const caddyfilePath = await writeCaddyfile(entries, cwd, { https });
  await validateCaddyfile(caddyfilePath);
  writeLocalghostState(cwd, {
    action: "setup",
    projectName,
    cwd,
    configPath,
    hostsPath: hostsResult.hostsPath,
    hostsChanged: hostsResult.changed,
    ...(hostsResult.tempPath ? { hostsTempPath: hostsResult.tempPath } : {}),
    caddyfilePath,
    caddyHttps: https,
    entries
  });
}

async function ensureLocalghostContext(options: LocalGhostPluginOptions, vitePort: number, https: boolean | undefined) {
  const cwd = options.cwd ?? process.cwd();
  const readOptions = readOptionsFromPlugin(options);
  const resolved = resolveDevHostsPath(readOptions);

  if (!resolved.exists) {
    if (options.setup === false || !canPrompt()) {
      throw new Error(
        `No .localghost found at ${resolved.path}. Run \`localghost init --write-scripts\` or start Vite in an interactive terminal.`
      );
    }

    console.log(`No .localghost found at ${resolved.path}.`);
    if (!(await confirm("Create one now?", true))) {
      throw new Error("Localghost setup skipped. Create .localghost before running the Vite plugin.");
    }

    const hosts = await promptForHosts(cwd, vitePort);
    writeTextFile(resolved.path, renderConfig(hosts, vitePort));
    console.log(`Created ${resolved.path}`);
  }

  const context = await resolveLocalghostContext({
    ...options,
    cwd,
    port: vitePort,
    ...(typeof https === "boolean" ? { https } : {})
  });

  if (!hasReadySetup(cwd, context.entries, resolved.path, context.https)) {
    if (options.setup === false || !canPrompt()) return context;

    const setup = await confirm("Run caddy:setup now?", true);
    if (setup) {
      await setupProject(cwd, context.entries, resolved.path, context.https);
      console.log(`All set. Setup state: ${getLocalghostStatePath(cwd)}`);
    }
  }

  return context;
}

export function localGhostPlugin(options: LocalGhostPluginOptions = {}): Plugin {
  let resolvedEntries: DevHostEntry[] = [];
  let resolvedVitePort: number | undefined;
  let resolvedHttps = false;
  let restartTimer: NodeJS.Timeout | undefined;

  return {
    name: "localghost:vite",
    enforce: "pre",

    async config(userConfig, configEnv: ConfigEnv): Promise<UserConfig> {
      if (configEnv.command !== "serve" || configEnv.mode === "production" || isProductionLike()) {
        return {};
      }

      const existingServer = userConfig.server ?? {};
      const envVitePort = Number.parseInt(process.env.LOCALGHOST_PORT ?? process.env.VITE_PORT ?? "", 10);
      const requestedVitePort =
        options.port ??
        existingServer.port ??
        (Number.isInteger(envVitePort) ? envVitePort : 5173);
      const context: LocalghostContext = await ensureLocalghostContext(options, requestedVitePort, options.https);
      const entries = context.entries;
      const hosts = context.hosts;
      const primaryHost = context.primaryHost;

      resolvedEntries = entries;
      resolvedVitePort = context.port;
      resolvedHttps = context.https;

      const server: ServerOptions = {
        ...existingServer,
        allowedHosts: mergeAllowedHosts(existingServer.allowedHosts, hosts),
        strictPort: existingServer.strictPort ?? true
      };

      if (typeof existingServer.host === "undefined") {
        server.host = context.bindHost;
      }

      if (context.port) {
        server.port = context.port;
      }

      if (context.https && primaryHost) {
        const existingWs = typeof server.ws === "object" && server.ws ? server.ws : {};
        const existingHmr = typeof existingServer.hmr === "object" && existingServer.hmr ? existingServer.hmr : {};

        server.ws = {
          ...existingWs,
          protocol: "wss",
          host: primaryHost,
          clientPort: 443
        } satisfies WsOptions;

        server.hmr = {
          ...existingHmr,
          protocol: "wss",
          host: primaryHost,
          clientPort: 443
        } satisfies HmrOptions;
      }

      return { server };
    },

    configureServer(server) {
      const watchFiles = getConfigWatchFiles(options);
      const watchedConfigFiles = new Set(watchFiles.map(normalizeWatchPath));

      server.watcher.add(watchFiles);

      const restartOnLocalghostConfigChange = (filePath: string) => {
        if (!watchedConfigFiles.has(normalizeWatchPath(filePath))) {
          return;
        }

        if (restartTimer) {
          clearTimeout(restartTimer);
        }

        restartTimer = setTimeout(() => {
          if (options.log !== false) {
            server.config.logger.info("localghost config changed; restarting Vite dev server", {
              clear: false,
              timestamp: false
            });
          }

          void server.restart().catch((error: unknown) => {
            server.config.logger.error(error instanceof Error ? error.message : String(error), {
              timestamp: false
            });
          });
        }, 50);
      };

      server.watcher.on("add", restartOnLocalghostConfigChange);
      server.watcher.on("change", restartOnLocalghostConfigChange);
      server.watcher.on("unlink", restartOnLocalghostConfigChange);

      if (options.log !== false) {
        server.printUrls = () => {
          printLocalHosts(server, resolvedEntries, resolvedVitePort, resolvedHttps);
        };
      }
    }
  };
}

export const localHostsPlugin = localGhostPlugin;
export type LocalHostsPluginOptions = LocalGhostPluginOptions;
