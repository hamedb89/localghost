import type { HmrOptions, Plugin, UserConfig, ViteDevServer, WsOptions } from "vite";
import { readDevHosts, type ConfigPattern, type ReadDevHostsOptions } from "./config.js";
import type { DevHostEntry } from "./parse.js";

export type LocalGhostPluginOptions = {
  cwd?: string;
  fileName?: string;
  configFiles?: string[];
  configPattern?: ConfigPattern;
  port?: number;
  https?: boolean;
  primaryHost?: string;
  log?: boolean;
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
    `  open:   ${primaryUrl}`,
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

export function localGhostPlugin(options: LocalGhostPluginOptions = {}): Plugin {
  let resolvedEntries: DevHostEntry[] = [];
  let resolvedVitePort: number | undefined;

  return {
    name: "localghost:vite",
    enforce: "pre",

    config(userConfig): UserConfig {
      const entries = readDevHosts(readOptionsFromPlugin(options));
      const hosts = [...new Set(entries.map((entry) => entry.host))];
      const existingServer = userConfig.server ?? {};
      const vitePort =
        options.port ??
        existingServer.port ??
        entries.find((entry) => !entry.host.startsWith("api."))?.port ??
        entries[0]?.port;
      const primaryHost =
        options.primaryHost ??
        entries.find((entry) => entry.port === vitePort)?.host ??
        hosts[0];

      resolvedEntries = entries;
      resolvedVitePort = vitePort;

      const server: ServerOptions = {
        ...existingServer,
        allowedHosts: mergeAllowedHosts(existingServer.allowedHosts, hosts),
        strictPort: existingServer.strictPort ?? true
      };

      if (vitePort) {
        server.port = vitePort;
      }

      if (options.https && primaryHost) {
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
      if (options.log === false) {
        return;
      }

      server.httpServer?.once("listening", () => {
        printLocalHosts(server, resolvedEntries, resolvedVitePort, Boolean(options.https));
      });
    }
  };
}

export const localHostsPlugin = localGhostPlugin;
export type LocalHostsPluginOptions = LocalGhostPluginOptions;
