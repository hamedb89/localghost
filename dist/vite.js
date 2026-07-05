// src/vite.ts
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "fs";
import { normalize, resolve as resolve2 } from "path";

// src/config.ts
import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, join, resolve } from "path";

// src/parse.ts
var HOST_PATTERN = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.?$/i;
function parseDevHosts(input2, fileName = ".localghost") {
  const entries = [];
  input2.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      return;
    }
    const parts = line.split(/\s+/);
    const host = parts[0];
    const portRaw = parts[1];
    if (!host || !portRaw || parts.length > 2) {
      throw new Error(`Invalid ${fileName} line ${index + 1}: "${rawLine}"`);
    }
    if (!HOST_PATTERN.test(host)) {
      throw new Error(`Invalid host on line ${index + 1}: "${host}"`);
    }
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port on line ${index + 1}: "${portRaw}"`);
    }
    entries.push({
      host: host.toLowerCase().replace(/\.$/, ""),
      port,
      target: `127.0.0.1:${port}`
    });
  });
  return entries;
}

// src/config.ts
var LOCALGHOST_CONFIG_FILE = ".localghost";
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function toRegExp(pattern) {
  return typeof pattern === "string" ? new RegExp(pattern) : pattern;
}
function findPatternMatches(cwd, pattern) {
  const matcher = toRegExp(pattern);
  return readdirSync(cwd, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).filter((name) => {
    matcher.lastIndex = 0;
    return matcher.test(name);
  }).sort();
}
function getConfigFileCandidates(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const exactFiles = unique([
    ...options.fileName ? [options.fileName] : [],
    ...options.configFiles ?? []
  ]);
  const patternFiles = options.configPattern ? findPatternMatches(cwd, options.configPattern) : [];
  const candidates = unique([...exactFiles, ...patternFiles]);
  if (candidates.length > 0) return candidates;
  if (exactFiles.length > 0 || options.configPattern) return [];
  return [LOCALGHOST_CONFIG_FILE];
}
function resolveDevHostsPath(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const searchedFiles = getConfigFileCandidates(options);
  for (const fileName2 of searchedFiles) {
    const path = resolve(cwd, fileName2);
    if (existsSync(path)) {
      return {
        path,
        fileName: basename(fileName2),
        exists: true,
        searchedFiles,
        ...options.configPattern ? { configPattern: options.configPattern } : {}
      };
    }
  }
  const fileName = searchedFiles[0] ?? LOCALGHOST_CONFIG_FILE;
  return {
    path: resolve(cwd, fileName),
    fileName: basename(fileName),
    exists: false,
    searchedFiles,
    ...options.configPattern ? { configPattern: options.configPattern } : {}
  };
}
function formatSearchedFiles(files, pattern) {
  if (files.length > 0) return files.map((file) => `\`${file}\``).join(", ");
  if (pattern) return `files matching ${pattern.toString()}`;
  return `\`${LOCALGHOST_CONFIG_FILE}\``;
}
function readDevHosts(options = {}) {
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
function getProjectName(cwd = process.cwd()) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    const name = typeof pkg.name === "string" && pkg.name ? pkg.name : "app";
    return sanitizeProjectName(name.replace(/^@/, ""));
  } catch {
    return "app";
  }
}
function sanitizeProjectName(value) {
  const projectName = value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return projectName || "app";
}

// src/context.ts
import { existsSync as existsSync2 } from "fs";
import { pathToFileURL } from "url";

// src/port.ts
import { createServer } from "net";
async function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve3) => {
    const server = createServer();
    server.once("error", () => {
      resolve3(false);
    });
    server.once("listening", () => {
      server.close(() => resolve3(true));
    });
    server.listen(port, host);
  });
}
async function findAvailablePort(startPort, options = {}) {
  const host = options.host ?? "127.0.0.1";
  const maxAttempts = options.maxAttempts ?? 50;
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`No available port found from ${startPort} to ${startPort + maxAttempts - 1}.`);
}

// src/context.ts
var LOCALGHOST_PROJECT_CONFIG_FILES = [
  "localghost.config.mjs",
  "localghost.config.js",
  "localghost.config.cjs"
];
function parsePort(value) {
  if (!value) return void 0;
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : void 0;
}
function envPort() {
  return parsePort(process.env.LOCALGHOST_PORT) ?? parsePort(process.env.VITE_PORT);
}
function envDynamicPort() {
  const value = process.env.LOCALGHOST_DYNAMIC_PORT;
  if (!value) return void 0;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function envHttps() {
  const value = process.env.LOCALGHOST_HTTPS;
  if (!value) return void 0;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function readOptionsFromContext(options) {
  return {
    cwd: options.cwd ?? process.cwd(),
    ...options.fileName ? { fileName: options.fileName } : {},
    ...options.configFiles ? { configFiles: options.configFiles } : {},
    ...options.configPattern ? { configPattern: options.configPattern } : {}
  };
}
function withRuntimePort(entries, requestedPort, port) {
  if (requestedPort === port) return entries;
  const hasRequestedPort = entries.some((entry) => entry.port === requestedPort);
  if (!hasRequestedPort) return entries;
  return entries.map((entry) => entry.port === requestedPort ? { ...entry, port } : entry);
}
function uniqueHosts(entries) {
  return [...new Set(entries.map((entry) => entry.host))];
}
function isAliasableHost(host) {
  return host.includes(".") && !host.startsWith("www.") && !host.includes(":");
}
function getDefaultWwwAlias(host) {
  return isAliasableHost(host) ? `www.${host}` : null;
}
function addDefaultWwwAliases(entries) {
  const seen = new Set(entries.map((entry) => entry.host));
  const aliases = [];
  for (const entry of entries) {
    const alias = getDefaultWwwAlias(entry.host);
    if (alias && !seen.has(alias)) {
      aliases.push({ host: alias, port: entry.port, target: `127.0.0.1:${entry.port}` });
      seen.add(alias);
    }
  }
  return [...entries, ...aliases];
}
function defined(input2) {
  return Object.fromEntries(Object.entries(input2).filter(([, value]) => typeof value !== "undefined"));
}
async function readProjectConfig(cwd, configFile) {
  if (configFile === false) return {};
  const candidates = configFile ? [configFile] : LOCALGHOST_PROJECT_CONFIG_FILES;
  const path = candidates.map((candidate) => resolveDevHostsPath({ cwd, fileName: candidate }).path).find((candidate) => existsSync2(candidate));
  if (!path) return {};
  const imported = await import(`${pathToFileURL(path).href}?localghost=${Date.now()}`);
  const config = imported.default ?? imported;
  return { config, path };
}
async function resolveLocalghostContext(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const projectConfig = await readProjectConfig(cwd, options.localghostConfig);
  const merged = {
    ...projectConfig.config,
    ...defined(options)
  };
  const readOptions = readOptionsFromContext({ ...merged, cwd });
  const resolvedPath = resolveDevHostsPath(readOptions);
  const configEntries = readDevHosts(readOptions);
  const requestedPort = merged.port ?? envPort() ?? configEntries[0]?.port ?? 5173;
  const dynamicPort = merged.dynamicPort ?? envDynamicPort() ?? false;
  const bindHost = merged.bindHost ?? "127.0.0.1";
  const probeHost = typeof bindHost === "string" ? bindHost : "127.0.0.1";
  const port = dynamicPort ? await findAvailablePort(requestedPort, { host: probeHost }) : requestedPort;
  const wwwAlias = merged.wwwAlias ?? true;
  const entries = wwwAlias ? addDefaultWwwAliases(withRuntimePort(configEntries, requestedPort, port)) : withRuntimePort(configEntries, requestedPort, port);
  const hosts = uniqueHosts(entries);
  const primaryHost = merged.primaryHost ?? entries.find((entry) => entry.port === port)?.host ?? hosts[0] ?? `${sanitizeProjectName(getProjectName(cwd))}.localhost`;
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
    ...projectConfig.path ? { projectConfigPath: projectConfig.path } : {}
  };
}

// src/doctor.ts
import { execa } from "execa";
async function checkCaddy() {
  try {
    const result = await execa("caddy", ["version"], { reject: false });
    const version = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    return {
      found: result.exitCode === 0,
      ...version ? { version } : {},
      installHint: "brew install caddy"
    };
  } catch {
    return {
      found: false,
      installHint: "brew install caddy"
    };
  }
}

// src/env.ts
function getProductionReason(env = process.env) {
  if (env.LOCALGHOST_ENV === "production") return "LOCALGHOST_ENV=production";
  if (env.NODE_ENV === "production") return "NODE_ENV=production";
  if (env.VERCEL_ENV === "production") return "VERCEL_ENV=production";
  if (env.NETLIFY === "true" && env.CONTEXT === "production") return "NETLIFY=true and CONTEXT=production";
  if (env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH === env.CF_PAGES_PRODUCTION_BRANCH) {
    return "CF_PAGES_BRANCH matches CF_PAGES_PRODUCTION_BRANCH";
  }
  return null;
}
function isProductionLike(env = process.env) {
  return getProductionReason(env) !== null;
}

// src/fs.ts
import { mkdirSync, readFileSync as readFileSync2, writeFileSync } from "fs";
import { dirname } from "path";
function readTextFile(path) {
  return readFileSync2(path, "utf8");
}
function writeTextFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
  return path;
}

// src/hosts-file.ts
import { writeFileSync as writeFileSync2 } from "fs";
import { tmpdir } from "os";
import { join as join2 } from "path";
import { execa as execa2 } from "execa";
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getManagedBlockPattern(projectName) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const start = `# localghost:start ${sanitizedProjectName}`;
  const end = `# localghost:end ${sanitizedProjectName}`;
  return new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
}
function getSystemHostsPath() {
  return process.platform === "win32" ? "C:\\Windows\\System32\\drivers\\etc\\hosts" : "/etc/hosts";
}
function renderHostsBlock(projectName, entries) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const hosts = [...new Set(entries.map((entry) => entry.host))].sort();
  return [
    `# localghost:start ${sanitizedProjectName}`,
    ...hosts.map((host) => `127.0.0.1 ${host}`),
    `# localghost:end ${sanitizedProjectName}`,
    ""
  ].join("\n");
}
function upsertManagedBlock(existing, projectName, block) {
  const pattern = getManagedBlockPattern(projectName);
  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }
  return `${existing.trimEnd()}

${block}`;
}
async function writeSystemHostsFile(hostsPath, next, projectName) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const tempPath = join2(tmpdir(), `localghost-${sanitizedProjectName}-hosts`);
  writeFileSync2(tempPath, next, "utf8");
  if (process.platform === "win32") {
    throw new Error(`Windows support: run as administrator and copy ${tempPath} to ${hostsPath}.`);
  }
  await execa2("sudo", ["cp", tempPath, hostsPath], { stdio: "inherit" });
  return tempPath;
}
async function updateSystemHosts(projectName, entries) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const hostsPath = getSystemHostsPath();
  const existing = readTextFile(hostsPath);
  const block = renderHostsBlock(sanitizedProjectName, entries);
  const next = upsertManagedBlock(existing, sanitizedProjectName, block);
  if (next === existing) {
    return { changed: false, hostsPath };
  }
  const tempPath = await writeSystemHostsFile(hostsPath, next, sanitizedProjectName);
  return { changed: true, hostsPath, tempPath };
}

// src/prompt.ts
import { stdin as input, stdout as output } from "process";
import { createInterface } from "readline/promises";
function canPrompt() {
  return Boolean(input.isTTY && output.isTTY);
}
async function withPrompt(run) {
  const rl = createInterface({ input, output });
  try {
    return await run((question) => rl.question(question));
  } finally {
    rl.close();
  }
}
async function confirm(question, defaultValue = true) {
  return withPrompt(async (prompt) => {
    const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
    const answer = (await prompt(`${question}${suffix}`)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return answer === "y" || answer === "yes";
  });
}
async function ask(question, defaultValue) {
  return withPrompt(async (prompt) => {
    const suffix = defaultValue ? ` (${defaultValue}) ` : " ";
    const answer = (await prompt(`${question}${suffix}`)).trim();
    return answer || defaultValue || "";
  });
}

// src/state.ts
import { existsSync as existsSync3 } from "fs";
import { join as join3 } from "path";
var LOCALGHOST_STATE_FILE = "ops/local/localghost-state.json";
function getLocalghostStatePath(cwd = process.cwd()) {
  return join3(cwd, LOCALGHOST_STATE_FILE);
}
function readLocalghostState(cwd = process.cwd()) {
  const path = getLocalghostStatePath(cwd);
  if (!existsSync3(path)) return null;
  return JSON.parse(readTextFile(path));
}
function writeLocalghostState(cwd, state) {
  const path = getLocalghostStatePath(cwd);
  writeTextFile(path, `${JSON.stringify({ ...state, version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`);
  return path;
}

// src/caddy.ts
import { dirname as dirname2, join as join4 } from "path";
import { execa as execa3 } from "execa";
function groupByPort(entries) {
  const groups = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const group = groups.get(entry.port) ?? [];
    group.push(entry);
    groups.set(entry.port, group);
  }
  return groups;
}
function getCaddyfilePath(cwd = process.cwd()) {
  return join4(cwd, "ops/local/Caddyfile");
}
function renderCaddyfile(entries, options = {}) {
  const groups = groupByPort(entries);
  const https = options.https === true;
  const blocks = [...groups.entries()].sort(([leftPort], [rightPort]) => leftPort - rightPort).map(([port, group]) => {
    const hosts = group.map((entry) => https ? entry.host : `http://${entry.host}`).sort().join(", ");
    return `${hosts} {
  reverse_proxy 127.0.0.1:${port}
}`;
  });
  const globalOptions = https ? `{
  local_certs
}

` : "";
  return `${globalOptions}${blocks.join("\n\n")}
`;
}
async function writeCaddyfile(entries, cwd = process.cwd(), options = {}) {
  const path = getCaddyfilePath(cwd);
  writeTextFile(path, renderCaddyfile(entries, options));
  return path;
}
async function validateCaddyfile(path) {
  await execa3("caddy", ["validate", "--config", path], {
    cwd: dirname2(path),
    stdio: "inherit"
  });
}

// src/vite.ts
function mergeAllowedHosts(current, hosts) {
  if (Array.isArray(current)) {
    return [.../* @__PURE__ */ new Set([...current, ...hosts])];
  }
  return hosts;
}
function getDisplayEntries(entries, vitePort) {
  if (!vitePort) {
    return entries;
  }
  const matchingEntries = entries.filter((entry) => entry.port === vitePort);
  return matchingEntries.length > 0 ? matchingEntries : entries;
}
function printLocalHosts(server, entries, vitePort, https) {
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
    vitePort ? `  target: http://127.0.0.1:${vitePort}/` : void 0,
    https ? "  proxy:  Caddy local HTTPS" : void 0
  ].filter((line) => Boolean(line));
  server.config.logger.info(lines.join("\n"), {
    clear: false,
    timestamp: false
  });
}
function readOptionsFromPlugin(options) {
  return {
    cwd: options.cwd ?? process.cwd(),
    ...options.fileName ? { fileName: options.fileName } : {},
    ...options.configFiles ? { configFiles: options.configFiles } : {},
    ...options.configPattern ? { configPattern: options.configPattern } : {}
  };
}
function getConfigWatchFiles(options) {
  const readOptions = readOptionsFromPlugin(options);
  const cwd = readOptions.cwd ?? process.cwd();
  const resolvedPath = resolveDevHostsPath(readOptions);
  const candidatePaths = getConfigFileCandidates(readOptions).map((fileName) => resolve2(cwd, fileName));
  const projectConfigPaths = options.localghostConfig === false ? [] : options.localghostConfig ? [resolve2(cwd, options.localghostConfig)] : ["localghost.config.mjs", "localghost.config.js", "localghost.config.cjs"].map((fileName) => resolve2(cwd, fileName));
  return [.../* @__PURE__ */ new Set([...candidatePaths, resolvedPath.path, ...projectConfigPaths])];
}
function normalizeWatchPath(filePath) {
  return normalize(resolve2(filePath));
}
function renderConfig(hosts, port) {
  return [
    "# Buh. Friendly names for local services.",
    "# Format: <host> <port>",
    ...hosts.map((host) => `${host} ${port}`),
    ""
  ].join("\n");
}
function defaultHost(cwd) {
  const projectName = sanitizeProjectName(getProjectName(cwd).split("/").pop() ?? "app");
  return `${projectName}.localhost`;
}
async function promptForHosts(cwd, port) {
  const primaryHost = await ask("Primary local domain", defaultHost(cwd));
  const hosts = [primaryHost.toLowerCase()];
  while (await confirm("Add another local domain?", false)) {
    const host = await ask("Domain");
    if (host) hosts.push(host.toLowerCase());
  }
  return [...new Set(addDefaultWwwAliases(hosts.map((host) => ({ host, port, target: `127.0.0.1:${port}` }))).map((entry) => entry.host))];
}
function hasReadySetup(cwd, entries, configPath, https) {
  const state = readLocalghostState(cwd);
  const projectName = sanitizeProjectName(getProjectName(cwd));
  if (state?.action !== "setup" || state.configPath !== configPath) return false;
  try {
    const hosts = readFileSync3(getSystemHostsPath(), "utf8");
    if (!hosts.includes(renderHostsBlock(projectName, entries).trimEnd())) return false;
  } catch {
    return false;
  }
  const caddyfilePath = getCaddyfilePath(cwd);
  return existsSync4(caddyfilePath) && readFileSync3(caddyfilePath, "utf8") === renderCaddyfile(entries, { https });
}
async function setupProject(cwd, entries, configPath, https) {
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
    ...hostsResult.tempPath ? { hostsTempPath: hostsResult.tempPath } : {},
    caddyfilePath,
    caddyHttps: https,
    entries
  });
}
async function ensureLocalghostContext(options, vitePort, https) {
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
    if (!await confirm("Create one now?", true)) {
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
    ...typeof https === "boolean" ? { https } : {}
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
function localGhostPlugin(options = {}) {
  let resolvedEntries = [];
  let resolvedVitePort;
  let resolvedHttps = false;
  let restartTimer;
  return {
    name: "localghost:vite",
    enforce: "pre",
    async config(userConfig, configEnv) {
      if (configEnv.command !== "serve" || configEnv.mode === "production" || isProductionLike()) {
        return {};
      }
      const existingServer = userConfig.server ?? {};
      const envVitePort = Number.parseInt(process.env.LOCALGHOST_PORT ?? process.env.VITE_PORT ?? "", 10);
      const requestedVitePort = options.port ?? existingServer.port ?? (Number.isInteger(envVitePort) ? envVitePort : 5173);
      const context = await ensureLocalghostContext(options, requestedVitePort, options.https);
      const entries = context.entries;
      const hosts = context.hosts;
      const primaryHost = context.primaryHost;
      resolvedEntries = entries;
      resolvedVitePort = context.port;
      resolvedHttps = context.https;
      const server = {
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
        };
        server.hmr = {
          ...existingHmr,
          protocol: "wss",
          host: primaryHost,
          clientPort: 443
        };
      }
      return { server };
    },
    configureServer(server) {
      const watchFiles = getConfigWatchFiles(options);
      const watchedConfigFiles = new Set(watchFiles.map(normalizeWatchPath));
      server.watcher.add(watchFiles);
      const restartOnLocalghostConfigChange = (filePath) => {
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
          void server.restart().catch((error) => {
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
var localHostsPlugin = localGhostPlugin;
export {
  localGhostPlugin,
  localHostsPlugin
};
//# sourceMappingURL=vite.js.map