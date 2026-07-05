// src/activity.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
var LOCALGHOST_ACTIVITY_VERSION = 1;
function getLocalghostActivityPath(env = process.env) {
  if (env.LOCALGHOST_ACTIVITY_PATH) return env.LOCALGHOST_ACTIVITY_PATH;
  const stateRoot = env.XDG_STATE_HOME || join(homedir(), ".local/state");
  return join(stateRoot, "localghost", "activity.json");
}
function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    return code === "EPERM";
  }
}
function emptyActivity() {
  return { version: LOCALGHOST_ACTIVITY_VERSION, runs: [] };
}
function readLocalghostActivity(path = getLocalghostActivityPath()) {
  if (!existsSync(path)) return emptyActivity();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      version: LOCALGHOST_ACTIVITY_VERSION,
      runs: Array.isArray(parsed.runs) ? parsed.runs : []
    };
  } catch {
    return emptyActivity();
  }
}
function writeLocalghostActivity(activity, path = getLocalghostActivityPath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(activity, null, 2)}
`, "utf8");
  return path;
}
function createRunId(input, pid) {
  return `${input.projectName}:${input.mode}:${pid}:${Date.now()}`;
}
function pruneLocalghostActivity(path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const activeRuns = activity.runs.filter((run) => isProcessRunning(run.pid));
  const pruned = activeRuns.length !== activity.runs.length;
  if (pruned) {
    writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs: activeRuns }, path);
  }
  return {
    path,
    pruned,
    runs: activeRuns
  };
}
function listLocalghostRuns(path = getLocalghostActivityPath()) {
  return pruneLocalghostActivity(path).runs;
}
function registerLocalghostRun(input, path = getLocalghostActivityPath()) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const pid = input.pid ?? process.pid;
  const record = {
    id: input.id ?? createRunId(input, pid),
    mode: input.mode,
    pid,
    cwd: input.cwd,
    projectName: input.projectName,
    startedAt: input.startedAt ?? now,
    updatedAt: now,
    ...input.configPath ? { configPath: input.configPath } : {},
    ...input.caddyfilePath ? { caddyfilePath: input.caddyfilePath } : {},
    ...input.caddyPid ? { caddyPid: input.caddyPid } : {},
    ...input.childPid ? { childPid: input.childPid } : {},
    ...input.childCommand ? { childCommand: input.childCommand } : {},
    ...typeof input.https === "boolean" ? { https: input.https } : {},
    ...input.requestedPort ? { requestedPort: input.requestedPort } : {},
    ...input.port ? { port: input.port } : {},
    ...typeof input.dynamicPort === "boolean" ? { dynamicPort: input.dynamicPort } : {},
    entries: input.entries
  };
  const current = pruneLocalghostActivity(path).runs.filter((run) => run.id !== record.id);
  writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs: [...current, record] }, path);
  return record;
}
function unregisterLocalghostRun(id, path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const runs = activity.runs.filter((run) => run.id !== id);
  if (runs.length !== activity.runs.length) {
    writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs }, path);
  }
}

// src/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, readdirSync } from "fs";
import { basename, join as join2, resolve } from "path";

// src/parse.ts
var HOST_PATTERN = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.?$/i;
function parseDevHosts(input, fileName = ".localghost") {
  const entries = [];
  input.split(/\r?\n/).forEach((rawLine, index) => {
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
function findLocalMdnsHosts(entries) {
  return [...new Set(entries.map((entry) => entry.host).filter((host) => host.endsWith(".local")))];
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
    if (existsSync2(path)) {
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
function getDevHostsPath(options = {}) {
  return resolveDevHostsPath(options).path;
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
  return parseDevHosts(readFileSync2(resolvedPath.path, "utf8"), resolvedPath.fileName);
}
function getProjectName(cwd = process.cwd()) {
  try {
    const pkg = JSON.parse(readFileSync2(join2(cwd, "package.json"), "utf8"));
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

// src/caddy.ts
import { dirname as dirname3, join as join3 } from "path";
import { execa } from "execa";

// src/fs.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2 } from "path";
function readTextFile(path) {
  return readFileSync3(path, "utf8");
}
function writeTextFile(path, value) {
  mkdirSync2(dirname2(path), { recursive: true });
  writeFileSync2(path, value, "utf8");
  return path;
}

// src/caddy.ts
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
  return join3(cwd, "ops/local/Caddyfile");
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
  await execa("caddy", ["validate", "--config", path], {
    cwd: dirname3(path),
    stdio: "inherit"
  });
}
async function runCaddy(path) {
  await execa("caddy", ["run", "--config", path], {
    cwd: dirname3(path),
    stdio: "inherit"
  });
}
function startCaddy(path) {
  return execa("caddy", ["run", "--config", path], {
    cwd: dirname3(path),
    stdio: "inherit"
  });
}
async function trustCaddy(path) {
  await execa("caddy", ["trust", "--config", path], {
    cwd: dirname3(path),
    stdio: "inherit"
  });
}

// src/context.ts
import { existsSync as existsSync3 } from "fs";
import { pathToFileURL } from "url";

// src/port.ts
import { createServer } from "net";
async function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve2) => {
    const server = createServer();
    server.once("error", () => {
      resolve2(false);
    });
    server.once("listening", () => {
      server.close(() => resolve2(true));
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
function defined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value !== "undefined"));
}
async function readProjectConfig(cwd, configFile) {
  if (configFile === false) return {};
  const candidates = configFile ? [configFile] : LOCALGHOST_PROJECT_CONFIG_FILES;
  const path = candidates.map((candidate) => resolveDevHostsPath({ cwd, fileName: candidate }).path).find((candidate) => existsSync3(candidate));
  if (!path) return {};
  const imported = await import(`${pathToFileURL(path).href}?localghost=${Date.now()}`);
  const config = imported.default ?? imported;
  return { config, path };
}
function defineLocalghostConfig(config) {
  return config;
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
import { execa as execa2 } from "execa";
async function checkCaddy() {
  try {
    const result = await execa2("caddy", ["version"], { reject: false });
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
async function runDoctor() {
  const caddy = await checkCaddy();
  return {
    ok: caddy.found,
    caddy
  };
}

// src/env.ts
var PRODUCTION_ENV_KEYS = ["NODE_ENV", "VERCEL_ENV", "NETLIFY", "CF_PAGES_BRANCH", "LOCALGHOST_ENV"];
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
function assertLocalDevelopment(command, env = process.env) {
  const reason = getProductionReason(env);
  if (!reason) return;
  throw new Error(`Localghost only runs in local development. Refusing \`${command}\` because ${reason}.`);
}
function getProductionEnvKeys() {
  return PRODUCTION_ENV_KEYS;
}

// src/hosts-file.ts
import { writeFileSync as writeFileSync3 } from "fs";
import { tmpdir } from "os";
import { join as join4 } from "path";
import { execa as execa3 } from "execa";
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
function removeManagedBlock(existing, projectName) {
  const pattern = getManagedBlockPattern(projectName);
  if (!pattern.test(existing)) {
    return existing;
  }
  return existing.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
async function writeSystemHostsFile(hostsPath, next, projectName) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const tempPath = join4(tmpdir(), `localghost-${sanitizedProjectName}-hosts`);
  writeFileSync3(tempPath, next, "utf8");
  if (process.platform === "win32") {
    throw new Error(`Windows support: run as administrator and copy ${tempPath} to ${hostsPath}.`);
  }
  await execa3("sudo", ["cp", tempPath, hostsPath], { stdio: "inherit" });
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
async function removeSystemHosts(projectName) {
  const sanitizedProjectName = sanitizeProjectName(projectName);
  const hostsPath = getSystemHostsPath();
  const existing = readTextFile(hostsPath);
  const next = removeManagedBlock(existing, sanitizedProjectName);
  if (next === existing) {
    return { changed: false, removed: false, hostsPath };
  }
  const tempPath = await writeSystemHostsFile(hostsPath, next, sanitizedProjectName);
  return { changed: true, removed: true, hostsPath, tempPath };
}

// src/init.ts
import { existsSync as existsSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync4 } from "fs";
import { join as join5 } from "path";
function detectPackageManager(cwd = process.cwd()) {
  if (existsSync4(join5(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync4(join5(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}
function packageRunCommand(packageManager, script) {
  if (packageManager === "yarn") return `yarn ${script}`;
  if (packageManager === "pnpm") return `pnpm ${script}`;
  return `npm run ${script}`;
}
function packageAddCommand(packageManager, packageName = "@hamedb89/localghost") {
  if (packageManager === "yarn") return `yarn add -D ${packageName}`;
  if (packageManager === "pnpm") return `pnpm add -D ${packageName}`;
  return `npm install -D ${packageName}`;
}
function renderConfig(options) {
  return [
    "# Buh. Friendly names for local services.",
    "# Format: <host> <port>",
    `${options.host} ${options.port}`,
    `www.${options.host} ${options.port}`,
    `${options.apiHost} ${options.apiPort}`,
    ""
  ].join("\n");
}
function readPackageJson(path) {
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return null;
  }
}
function shellQuote(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
function getConfigFlag(configFile) {
  return configFile === LOCALGHOST_CONFIG_FILE ? "" : ` --config ${shellQuote(configFile)}`;
}
function updatePackageScripts(packageJsonPath, configFile) {
  const pkg = readPackageJson(packageJsonPath);
  if (!pkg) return false;
  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  const configFlag = getConfigFlag(configFile);
  const nextScripts = {
    ...scripts,
    "localghost:setup": scripts["localghost:setup"] ?? `localghost setup${configFlag}`,
    "localghost:proxy": scripts["localghost:proxy"] ?? `localghost dev${configFlag}`,
    "localghost:proxy:https": scripts["localghost:proxy:https"] ?? `localghost dev${configFlag} --https`,
    "localghost:run": scripts["localghost:run"] ?? `localghost run${configFlag} --`,
    "localghost:ready": scripts["localghost:ready"] ?? `localghost status${configFlag} --ready`,
    "localghost:trust": scripts["localghost:trust"] ?? `localghost trust${configFlag}`,
    "localghost:ps": scripts["localghost:ps"] ?? "localghost ps",
    "localghost:print": scripts["localghost:print"] ?? `localghost print${configFlag}`,
    "localghost:routes": scripts["localghost:routes"] ?? `localghost routes${configFlag}`,
    "localghost:status": scripts["localghost:status"] ?? "localghost status",
    "localghost:reset": scripts["localghost:reset"] ?? "localghost reset",
    "localghost:teardown": scripts["localghost:teardown"] ?? "localghost teardown",
    "localghost:doctor": scripts["localghost:doctor"] ?? "localghost doctor",
    "localghost:update": scripts["localghost:update"] ?? "localghost update",
    "caddy:setup": scripts["caddy:setup"] ?? `localghost setup${configFlag}`,
    "caddy:dev": scripts["caddy:dev"] ?? `localghost dev${configFlag}`
  };
  const changed = JSON.stringify(scripts) !== JSON.stringify(nextScripts);
  if (!changed) return false;
  pkg.scripts = nextScripts;
  writeFileSync4(packageJsonPath, `${JSON.stringify(pkg, null, 2)}
`, "utf8");
  return true;
}
function initLocalghost(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const projectName = sanitizeProjectName(getProjectName(cwd).split("/").pop() ?? "app");
  const host = options.host ?? `${projectName}.localhost`;
  const port = options.port ?? 5173;
  const apiHost = options.apiHost ?? `api.${host}`;
  const apiPort = options.apiPort ?? 8787;
  const packageManager = options.packageManager ?? detectPackageManager(cwd);
  const configFile = options.configFile ?? LOCALGHOST_CONFIG_FILE;
  const configPath = join5(cwd, configFile);
  const configExists = existsSync4(configPath);
  if (configExists && !options.force) {
    return {
      configPath,
      configCreated: false,
      packageJsonChanged: false,
      packageManager,
      nextSteps: [
        packageRunCommand(packageManager, "localghost:doctor"),
        packageRunCommand(packageManager, "localghost:setup"),
        packageRunCommand(packageManager, "localghost:ready"),
        packageRunCommand(packageManager, "localghost:proxy")
      ]
    };
  }
  writeTextFile(configPath, renderConfig({ host, port, apiHost, apiPort }));
  const packageJsonPath = join5(cwd, "package.json");
  const packageJsonChanged = options.writeScripts ? updatePackageScripts(packageJsonPath, configFile) : false;
  return {
    configPath,
    configCreated: true,
    ...existsSync4(packageJsonPath) ? { packageJsonPath } : {},
    packageJsonChanged,
    packageManager,
    nextSteps: [
      packageRunCommand(packageManager, "localghost:doctor"),
      packageRunCommand(packageManager, "localghost:setup"),
      packageRunCommand(packageManager, "localghost:ready"),
      packageRunCommand(packageManager, "localghost:proxy")
    ]
  };
}

// src/routes.ts
function getDomainRoutes(entries, options = {}) {
  const protocol = options.https === true ? "https" : "http";
  return [...entries].sort((left, right) => left.host.localeCompare(right.host) || left.port - right.port).map((entry) => ({
    host: entry.host,
    port: entry.port,
    url: `${protocol}://${entry.host}/`,
    upstream: `http://${entry.target}`
  }));
}
function formatDomainRoutes(entries, options = {}) {
  const routes = getDomainRoutes(entries, options);
  if (routes.length === 0) {
    return "localghost routes\n  no routes";
  }
  return [
    "localghost routes",
    ...routes.map((route) => `  ${route.url} -> ${route.upstream}`)
  ].join("\n");
}

// src/state.ts
import { existsSync as existsSync5 } from "fs";
import { join as join6 } from "path";
var LOCALGHOST_STATE_FILE = "ops/local/localghost-state.json";
function getLocalghostStatePath(cwd = process.cwd()) {
  return join6(cwd, LOCALGHOST_STATE_FILE);
}
function readLocalghostState(cwd = process.cwd()) {
  const path = getLocalghostStatePath(cwd);
  if (!existsSync5(path)) return null;
  return JSON.parse(readTextFile(path));
}
function writeLocalghostState(cwd, state) {
  const path = getLocalghostStatePath(cwd);
  writeTextFile(path, `${JSON.stringify({ ...state, version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`);
  return path;
}
function patchLocalghostState(cwd, patch) {
  const current = readLocalghostState(cwd);
  if (!current) return null;
  return writeLocalghostState(cwd, { ...current, ...patch });
}

// src/update-check.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync3, readFileSync as readFileSync5, writeFileSync as writeFileSync5 } from "fs";
import { homedir as homedir2 } from "os";
import { dirname as dirname4, join as join7 } from "path";
var LOCALGHOST_PACKAGE_NAME = "@hamedb89/localghost";
var LOCALGHOST_VERSION = "0.1.7";
var UPDATE_CHECK_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var UPDATE_CHECK_NOTIFY_TTL_MS = 24 * 60 * 60 * 1e3;
var UPDATE_CHECK_TIMEOUT_MS = 900;
function truthyEnv(value) {
  return value === "1" || value === "true" || value === "yes";
}
function isUpdateCheckDisabled(env = process.env) {
  return truthyEnv(env.LOCALGHOST_NO_UPDATE_CHECK);
}
function getUpdateCheckCachePath(env = process.env) {
  if (env.LOCALGHOST_UPDATE_CHECK_CACHE) return env.LOCALGHOST_UPDATE_CHECK_CACHE;
  const cacheRoot = env.XDG_CACHE_HOME || join7(homedir2(), ".cache");
  return join7(cacheRoot, "localghost", "update-check.json");
}
function readCache(path = getUpdateCheckCachePath()) {
  if (!existsSync6(path)) return null;
  try {
    return JSON.parse(readFileSync5(path, "utf8"));
  } catch {
    return null;
  }
}
function writeCache(cache, path = getUpdateCheckCachePath()) {
  try {
    mkdirSync3(dirname4(path), { recursive: true });
    writeFileSync5(path, `${JSON.stringify(cache, null, 2)}
`, "utf8");
  } catch {
  }
}
function ageMs(date, now = Date.now()) {
  if (!date) return Number.POSITIVE_INFINITY;
  const time = Date.parse(date);
  return Number.isFinite(time) ? now - time : Number.POSITIVE_INFINITY;
}
function isCacheFresh(cache, ttlMs, now = Date.now()) {
  return Boolean(cache?.latestVersion && ageMs(cache.checkedAt, now) >= 0 && ageMs(cache.checkedAt, now) < ttlMs);
}
function parseVersion(version) {
  const match = version.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...match[4] ? { prerelease: match[4] } : {}
  };
}
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return a.localeCompare(b);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}
function isNewerVersion(candidate, current = LOCALGHOST_VERSION) {
  return Boolean(candidate && compareVersions(candidate, current) > 0);
}
async function fetchLatestVersion(packageName, timeoutMs) {
  const encodedName = packageName.startsWith("@") ? `@${packageName.slice(1).replace("/", "%2f")}` : packageName;
  const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/vnd.npm.install-v1+json"
    }
  });
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  const data = await response.json();
  const latest = data["dist-tags"]?.latest;
  if (typeof latest !== "string" || latest.length === 0) throw new Error("npm registry response did not include latest dist-tag");
  return latest;
}
async function checkForUpdate(options = {}) {
  const env = options.env ?? process.env;
  const packageName = options.packageName ?? LOCALGHOST_PACKAGE_NAME;
  const currentVersion = options.currentVersion ?? LOCALGHOST_VERSION;
  const cachePath = options.cachePath ?? getUpdateCheckCachePath(env);
  if (!options.force && isUpdateCheckDisabled(env)) {
    return {
      currentVersion,
      packageName,
      updateAvailable: false,
      source: "disabled"
    };
  }
  const cache = readCache(cachePath);
  if (!options.force && isCacheFresh(cache, UPDATE_CHECK_CACHE_TTL_MS)) {
    const latestVersion = cache?.latestVersion;
    return {
      currentVersion,
      packageName,
      ...latestVersion ? { latestVersion } : {},
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      source: "cache"
    };
  }
  try {
    const latestVersion = await fetchLatestVersion(packageName, options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS);
    writeCache({ checkedAt: (/* @__PURE__ */ new Date()).toISOString(), latestVersion }, cachePath);
    return {
      currentVersion,
      packageName,
      latestVersion,
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      source: "registry"
    };
  } catch (error) {
    const latestVersion = cache?.latestVersion;
    return {
      currentVersion,
      packageName,
      ...latestVersion ? { latestVersion } : {},
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      source: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function formatUpdateMessage(result) {
  if (!result.updateAvailable || !result.latestVersion) return null;
  return [
    `localghost ${result.latestVersion} is available. Current: ${result.currentVersion}`,
    `Update with: npm i -g ${result.packageName}@latest`
  ].join("\n");
}
function shouldNotifyAboutUpdate(result, cachePath = getUpdateCheckCachePath(), now = Date.now()) {
  if (!result.updateAvailable || !result.latestVersion) return false;
  const cache = readCache(cachePath);
  if (cache?.notifiedVersion !== result.latestVersion) return true;
  return ageMs(cache.notifiedAt, now) >= UPDATE_CHECK_NOTIFY_TTL_MS;
}
function markUpdateNotified(result, cachePath = getUpdateCheckCachePath()) {
  if (!result.latestVersion) return;
  const cache = readCache(cachePath) ?? { checkedAt: (/* @__PURE__ */ new Date()).toISOString() };
  writeCache(
    {
      ...cache,
      latestVersion: result.latestVersion,
      notifiedVersion: result.latestVersion,
      notifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    cachePath
  );
}
async function maybeNotifyAboutUpdate(options = {}) {
  if (options.disabled) return;
  const cachePath = getUpdateCheckCachePath();
  const result = await checkForUpdate({ cachePath });
  if (!shouldNotifyAboutUpdate(result, cachePath)) return;
  const message = formatUpdateMessage(result);
  if (!message) return;
  console.warn(`
${message}`);
  markUpdateNotified(result, cachePath);
}
export {
  LOCALGHOST_ACTIVITY_VERSION,
  LOCALGHOST_CONFIG_FILE,
  LOCALGHOST_PACKAGE_NAME,
  LOCALGHOST_STATE_FILE,
  LOCALGHOST_VERSION,
  UPDATE_CHECK_CACHE_TTL_MS,
  UPDATE_CHECK_NOTIFY_TTL_MS,
  UPDATE_CHECK_TIMEOUT_MS,
  assertLocalDevelopment,
  checkCaddy,
  checkForUpdate,
  compareVersions,
  defineLocalghostConfig,
  detectPackageManager,
  findAvailablePort,
  findLocalMdnsHosts,
  formatDomainRoutes,
  formatUpdateMessage,
  getCaddyfilePath,
  getConfigFileCandidates,
  getDevHostsPath,
  getDomainRoutes,
  getLocalghostActivityPath,
  getLocalghostStatePath,
  getProductionEnvKeys,
  getProductionReason,
  getProjectName,
  getSystemHostsPath,
  getUpdateCheckCachePath,
  initLocalghost,
  isNewerVersion,
  isPortAvailable,
  isProcessRunning,
  isProductionLike,
  isUpdateCheckDisabled,
  listLocalghostRuns,
  markUpdateNotified,
  maybeNotifyAboutUpdate,
  packageAddCommand,
  packageRunCommand,
  parseDevHosts,
  patchLocalghostState,
  pruneLocalghostActivity,
  readDevHosts,
  readLocalghostActivity,
  readLocalghostState,
  registerLocalghostRun,
  removeManagedBlock,
  removeSystemHosts,
  renderCaddyfile,
  renderHostsBlock,
  resolveDevHostsPath,
  resolveLocalghostContext,
  runCaddy,
  runDoctor,
  sanitizeProjectName,
  shouldNotifyAboutUpdate,
  startCaddy,
  trustCaddy,
  unregisterLocalghostRun,
  updateSystemHosts,
  upsertManagedBlock,
  validateCaddyfile,
  writeCaddyfile,
  writeLocalghostActivity,
  writeLocalghostState
};
//# sourceMappingURL=index.js.map