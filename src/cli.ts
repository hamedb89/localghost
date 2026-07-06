#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import {
  getLocalghostActivityPath,
  listLocalghostSetups,
  listLocalghostRuns,
  registerLocalghostRun,
  registerLocalghostSetup,
  unregisterLocalghostSetup,
  unregisterLocalghostRun,
  type LocalghostRunRecord,
  type LocalghostSetupRecord
} from "./activity.js";
import { getProjectName, readDevHosts, resolveDevHostsPath, sanitizeProjectName, type ReadDevHostsOptions } from "./config.js";
import { getCaddyfilePath, renderCaddyfile, validateCaddyfile, writeCaddyfile, startCaddy, trustCaddy } from "./caddy.js";
import { resolveLocalghostContext } from "./context.js";
import { checkCaddy, runDoctor } from "./doctor.js";
import { assertLocalDevelopment } from "./env.js";
import { getSystemHostsPath, removeSystemHosts, renderHostsBlock, updateSystemHosts } from "./hosts-file.js";
import { initLocalghost, type PackageManager } from "./init.js";
import { findLocalMdnsHosts, type DevHostEntry } from "./parse.js";
import { isPortAvailable } from "./port.js";
import { canPrompt, confirm } from "./prompt.js";
import { formatDomainRoutes, formatGhostTunnel } from "./routes.js";
import { getLocalghostStatePath, patchLocalghostState, readLocalghostState, writeLocalghostState } from "./state.js";
import { checkForUpdate, formatUpdateMessage, LOCALGHOST_VERSION, maybeNotifyAboutUpdate } from "./update-check.js";
import type { GhostTunnelConfig } from "./tunnel.js";
import { execa } from "execa";

function warnAboutLocalMdns(entries: ReturnType<typeof readDevHosts>) {
  const localHosts = findLocalMdnsHosts(entries);

  if (localHosts.length > 0) {
    console.warn(
      `Warning: .local can collide with mDNS/Bonjour. Prefer .localhost for dev hosts: ${localHosts.join(", ")}`
    );
  }
}

function shouldColor() {
  return process.stdout.isTTY && !process.env.NO_COLOR;
}

function logDomainRoutes(
  entries: ReturnType<typeof readDevHosts>,
  options: { https?: boolean; ghostTunnel?: GhostTunnelConfig; verbose?: boolean } = {}
) {
  console.log(formatDomainRoutes(entries, options));
  if (options.ghostTunnel?.enabled) {
    console.log(formatGhostTunnel(options.ghostTunnel, {
      color: shouldColor(),
      label: "expected",
      verbose: options.verbose === true
    }));
  }
}

function parsePort(value: string) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError("Port must be a number between 1 and 65535.");
  }

  return port;
}

function parsePackageManager(value: string): PackageManager {
  if (value === "npm" || value === "yarn" || value === "pnpm") return value;
  throw new InvalidArgumentError("Package manager must be npm, yarn, or pnpm.");
}

function collect(value: string, previous: string[] = []) {
  return [...previous, value];
}

function parseBooleanLike(value: string | boolean) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new InvalidArgumentError("Value must be yes or no.");
}

type ConfigCliOptions = {
  cwd: string;
  config?: string[];
  configPattern?: string;
};

type ProxyModeCliOptions = {
  https?: boolean;
  ssl?: boolean;
};

type TrustCliOptions = {
  trust?: boolean;
};

function contextOptionsFromCli(options: ConfigCliOptions & { project?: string } & ProxyModeCliOptions) {
  return {
    cwd: options.cwd,
    ...(options.project ? { project: options.project } : {}),
    ...(options.config && options.config.length > 0 ? { configFiles: options.config } : {}),
    ...(options.configPattern ? { configPattern: options.configPattern } : {}),
    ...(useHttps(options) ? { https: true } : {})
  };
}

function readOptionsFromCli(options: ConfigCliOptions): ReadDevHostsOptions {
  return {
    cwd: options.cwd,
    ...(options.config && options.config.length > 0 ? { configFiles: options.config } : {}),
    ...(options.configPattern ? { configPattern: options.configPattern } : {})
  };
}

async function assertCaddyReady() {
  const caddy = await checkCaddy();
  if (caddy.found) return;

  throw new Error([
    "Caddy was not found.",
    `Install it with: ${caddy.installHint}`,
    "Localghost will not install it for you. No surprise spells."
  ].join("\n"));
}

function existingTrustMarkers(cwd: string) {
  const state = readLocalghostState(cwd);
  return {
    ...(state?.caddyTrustedAt ? { caddyTrustedAt: state.caddyTrustedAt } : {}),
    ...(state?.caddyTrustPromptedAt ? { caddyTrustPromptedAt: state.caddyTrustPromptedAt } : {})
  };
}

function explainHostsPassword() {
  console.log("Localghost may ask for your password to update its managed block in /etc/hosts.");
  console.log("It will only touch the lines between # localghost:start and # localghost:end.");
}

function explainTrustPassword() {
  console.log("Localghost can trust Caddy's local HTTPS CA so browsers stop showing local certificate warnings.");
  console.log("macOS may ask for your password to add that local CA to Keychain.");
  console.log("This only affects Caddy's local development certificates on this machine.");
}

function useHttps(options: ProxyModeCliOptions) {
  return options.https === true || options.ssl === true;
}

function getSetupCommand(options: { https?: boolean; config?: string[]; configPattern?: string }) {
  const configFlags = [
    ...(options.config ?? []).map((config) => ` --config ${config}`),
    ...(options.configPattern ? [` --config-pattern ${options.configPattern}`] : [])
  ].join("");
  return `localghost setup${configFlags}${options.https ? " --https" : ""}`;
}

function getSetupReadiness(options: ConfigCliOptions & {
  project?: string;
  https?: boolean;
  ignoreCaddyfile?: boolean;
  entries?: DevHostEntry[];
  configPath?: string;
  projectName?: string;
}) {
  const projectName = sanitizeProjectName(options.projectName ?? options.project ?? getProjectName(options.cwd));
  const readOptions = readOptionsFromCli(options);
  const entries = options.entries ?? readDevHosts(readOptions);
  const configPath = options.configPath ?? resolveDevHostsPath(readOptions).path;
  const caddyfilePath = getCaddyfilePath(options.cwd);
  const statePath = getLocalghostStatePath(options.cwd);
  const state = readLocalghostState(options.cwd);
  const https = options.https === true;
  const reasons: string[] = [];

  if (!state) {
    reasons.push(`No Localghost setup state found at ${statePath}.`);
  } else {
    if (state.action !== "setup") reasons.push(`Last Localghost action is ${state.action}, not setup.`);
    if (state.projectName !== projectName) reasons.push(`Setup state is for project ${state.projectName}, not ${projectName}.`);
    if (state.configPath !== configPath) reasons.push(`Setup state points at ${state.configPath ?? "no config"}, not ${configPath}.`);
  }

  const hostsPath = getSystemHostsPath();
  try {
    const hosts = readFileSync(hostsPath, "utf8");
    const expectedHostsBlock = renderHostsBlock(projectName, entries).trimEnd();
    if (!hosts.includes(expectedHostsBlock)) {
      reasons.push(`The Localghost hosts block in ${hostsPath} is missing or stale.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reasons.push(`Could not read ${hostsPath}: ${message}`);
  }

  if (!options.ignoreCaddyfile) {
    if (!existsSync(caddyfilePath)) {
      reasons.push(`Missing Caddyfile at ${caddyfilePath}.`);
    } else {
      const expectedCaddyfile = renderCaddyfile(entries, { https });
      const currentCaddyfile = readFileSync(caddyfilePath, "utf8");
      if (currentCaddyfile !== expectedCaddyfile) {
        reasons.push(`Caddyfile at ${caddyfilePath} is stale for ${https ? "HTTPS" : "HTTP"} mode.`);
      }
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
    entries,
    projectName,
    configPath,
    caddyfilePath,
    statePath,
    setupCommand: getSetupCommand(options)
  };
}

async function runSetupFromReadiness(
  cwd: string,
  https: boolean,
  readiness: ReturnType<typeof getSetupReadiness>
) {
  explainHostsPassword();
  const hostsResult = await updateSystemHosts(readiness.projectName, readiness.entries);
  const caddyfilePath = await writeCaddyfile(readiness.entries, cwd, { https });
  await validateCaddyfile(caddyfilePath);
  writeLocalghostState(cwd, {
    action: "setup",
    projectName: readiness.projectName,
    cwd,
    configPath: readiness.configPath,
    hostsPath: hostsResult.hostsPath,
    hostsChanged: hostsResult.changed,
    ...(hostsResult.tempPath ? { hostsTempPath: hostsResult.tempPath } : {}),
    caddyfilePath,
    caddyHttps: https,
    ...existingTrustMarkers(cwd),
    entries: readiness.entries
  });
  registerLocalghostSetup({
    cwd,
    projectName: readiness.projectName,
    configPath: readiness.configPath,
    caddyfilePath,
    https,
    entries: readiness.entries
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTrust(cwd: string, caddyfilePath: string) {
  await wait(350);
  try {
    await trustCaddy(caddyfilePath);
  } catch {
    await wait(750);
    await trustCaddy(caddyfilePath);
  }

  patchLocalghostState(cwd, { caddyTrustedAt: new Date().toISOString() });
  console.log("Local HTTPS trust is ready.");
}

async function maybeTrustCaddy(
  options: {
    cwd: string;
    https: boolean;
    caddyfilePath: string;
    trust?: boolean;
  }
) {
  if (!options.https) return;

  const state = readLocalghostState(options.cwd);
  if (!options.trust && state?.caddyTrustedAt) return;

  let shouldTrust = options.trust === true;

  if (!shouldTrust) {
    if (state?.caddyTrustPromptedAt || !canPrompt()) return;

    explainTrustPassword();
    shouldTrust = await confirm("Trust local HTTPS certificates now?", true);
  }

  if (!shouldTrust) {
    patchLocalghostState(options.cwd, { caddyTrustPromptedAt: new Date().toISOString() });
    console.log("Okay. Localghost will still run HTTPS, but the browser may show a certificate warning.");
    console.log("Run localghost trust when you want to trust Caddy's local CA.");
    return;
  }

  await runTrust(options.cwd, options.caddyfilePath);
}

type LocalghostRouteView = {
  host: string;
  port: number;
  target: string;
  listening: boolean;
};

type LocalghostInstanceView = {
  id: string;
  cwd: string;
  projectName: string;
  running: boolean;
  mode: LocalghostRunRecord["mode"] | "setup";
  updatedAt?: string;
  startedAt?: string;
  pid?: number;
  caddyPid?: number;
  childPid?: number;
  childCommand?: string[];
  configPath?: string;
  caddyfilePath?: string;
  https?: boolean;
  routes: LocalghostRouteView[];
};

function maybePid(pid: number | undefined) {
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function registerCleanup(id: string) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    unregisterLocalghostRun(id);
  };

  process.once("exit", cleanup);

  return () => {
    cleanup();
    process.off("exit", cleanup);
  };
}

async function getRouteViews(entries: DevHostEntry[]): Promise<LocalghostRouteView[]> {
  const portStatus = new Map<number, boolean>();

  for (const entry of entries) {
    if (!portStatus.has(entry.port)) {
      portStatus.set(entry.port, !(await isPortAvailable(entry.port)));
    }
  }

  return entries.map((entry) => ({
    host: entry.host,
    port: entry.port,
    target: `127.0.0.1:${entry.port}`,
    listening: portStatus.get(entry.port) ?? false
  }));
}

function setupKey(input: Pick<LocalghostSetupRecord, "cwd" | "projectName" | "configPath">) {
  return `${input.projectName}:${input.cwd}:${input.configPath ?? ""}`;
}

function runKey(input: Pick<LocalghostRunRecord, "cwd" | "projectName" | "configPath">) {
  return `${input.projectName}:${input.cwd}:${input.configPath ?? ""}`;
}

async function getInstanceViews(setups: LocalghostSetupRecord[], runs: LocalghostRunRecord[]): Promise<LocalghostInstanceView[]> {
  const runBySetup = new Map(runs.map((run) => [runKey(run), run]));
  const instances: LocalghostInstanceView[] = [];

  for (const setup of setups) {
    const run = runBySetup.get(setupKey(setup));
    if (run) {
      instances.push(await getRunInstanceView(run, setup));
      runBySetup.delete(setupKey(setup));
      continue;
    }

    instances.push({
      id: setup.id,
      cwd: setup.cwd,
      projectName: setup.projectName,
      running: false,
      mode: "setup",
      updatedAt: setup.updatedAt,
      ...(setup.configPath ? { configPath: setup.configPath } : {}),
      ...(setup.caddyfilePath ? { caddyfilePath: setup.caddyfilePath } : {}),
      ...(typeof setup.https === "boolean" ? { https: setup.https } : {}),
      routes: await getRouteViews(setup.entries)
    });
  }

  for (const run of runBySetup.values()) {
    instances.push(await getRunInstanceView(run));
  }

  return instances.sort((left, right) => {
    if (left.running !== right.running) return left.running ? -1 : 1;
    return left.projectName.localeCompare(right.projectName);
  });
}

async function getRunInstanceView(run: LocalghostRunRecord, setup?: LocalghostSetupRecord): Promise<LocalghostInstanceView> {
  return {
    id: setup?.id ?? run.id,
    cwd: run.cwd,
    projectName: run.projectName,
    running: true,
    mode: run.mode,
    updatedAt: setup?.updatedAt ?? run.updatedAt,
    startedAt: run.startedAt,
    pid: run.pid,
    ...(run.caddyPid ? { caddyPid: run.caddyPid } : {}),
    ...(run.childPid ? { childPid: run.childPid } : {}),
    ...(run.childCommand ? { childCommand: run.childCommand } : {}),
    ...(run.configPath ? { configPath: run.configPath } : {}),
    ...(run.caddyfilePath ? { caddyfilePath: run.caddyfilePath } : {}),
    ...(typeof run.https === "boolean" ? { https: run.https } : {}),
    routes: await getRouteViews(run.entries)
  };
}

function formatInstanceViews(instances: LocalghostInstanceView[]) {
  if (instances.length === 0) return "No Localghost setups found.";

  const lines = ["localghost ps"];
  for (const instance of instances) {
    const command = instance.childCommand?.length ? ` ${instance.childCommand.join(" ")}` : "";
    const mode = command ? `${instance.mode}:${command}` : instance.mode === "setup" ? "" : instance.mode;
    lines.push("");
    lines.push(`${instance.projectName}  ${instance.running ? "running" : "setup"}${mode ? `  ${mode}` : ""}`);
    lines.push(`  cwd: ${instance.cwd}`);
    if (instance.pid) {
      lines.push(`  pid: ${instance.pid}${instance.caddyPid ? `, caddy: ${instance.caddyPid}` : ""}${instance.childPid ? `, child: ${instance.childPid}` : ""}`);
    }
    if (instance.startedAt) lines.push(`  started: ${instance.startedAt}`);
    if (!instance.startedAt && instance.updatedAt) lines.push(`  setup: ${instance.updatedAt}`);
    for (const route of instance.routes) {
      lines.push(`  ${route.host} -> ${route.target} (${route.listening ? "listening" : "not listening"})`);
    }
  }

  return lines.join("\n");
}

const program = new Command();

program
  .name("localghost")
  .description("Buh. Friendly local hostnames for app repos.")
  .version(LOCALGHOST_VERSION)
  .option("--no-update-check", "Skip the npm update check for this run");

program.hook("postAction", async (_thisCommand, actionCommand) => {
  if (actionCommand.name() === "update") return;

  const options = program.opts<{ updateCheck?: boolean }>();
  await maybeNotifyAboutUpdate({ disabled: options.updateCheck === false });
});

program
  .command("init")
  .description("Create a .localghost config for this project")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to create", ".localghost")
  .option("--host <host>", "Primary local hostname")
  .option("--port <number>", "Primary app port", parsePort)
  .option("--api-host <host>", "API local hostname")
  .option("--api-port <number>", "API port", parsePort)
  .option("--package-manager <npm|yarn|pnpm>", "Package manager for suggested commands", parsePackageManager)
  .option("--write-scripts", "Add localghost scripts to package.json")
  .option("--force", "Overwrite an existing config file")
  .action((options: {
    cwd: string;
    config: string;
    host?: string;
    port?: number;
    apiHost?: string;
    apiPort?: number;
    packageManager?: PackageManager;
    writeScripts?: boolean;
    force?: boolean;
  }) => {
    const result = initLocalghost({ ...options, configFile: options.config });

    if (result.configCreated) {
      console.log(`Buh. Created ${result.configPath}`);
    } else {
      console.log(`${result.configPath} already exists. Use --force to rewrite it.`);
    }

    if (options.writeScripts) {
      if (result.packageJsonChanged) {
        console.log(`Updated ${result.packageJsonPath}`);
      } else if (result.packageJsonPath) {
        console.log(`${result.packageJsonPath} already has localghost scripts.`);
      } else {
        console.log("No package.json found; skipped script setup.");
      }
    }

    console.log("Next:");
    for (const step of result.nextSteps) {
      console.log(`  ${step}`);
    }
  });

program
  .command("doctor")
  .description("Check machine prerequisites")
  .action(async () => {
    const result = await runDoctor();

    if (result.caddy.found) {
      console.log(`Caddy: ${result.caddy.version ?? "found"}`);
    } else {
      console.log("Caddy: missing");
      console.log(`Run: ${result.caddy.installHint}`);
      console.log("Localghost will not install it for you. No surprise spells.");
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("update")
  .description("Check npm for a newer localghost release")
  .option("--json", "Print raw JSON")
  .action(async (options: { json?: boolean }) => {
    const result = await checkForUpdate({ force: true, timeoutMs: 5000 });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const message = formatUpdateMessage(result);
    if (message) {
      console.log(message);
      return;
    }

    if (result.source === "error") {
      console.log(`Could not check npm for updates: ${result.error ?? "unknown error"}`);
      process.exitCode = 1;
      return;
    }

    console.log(`localghost is up to date. Current: ${result.currentVersion}`);
  });

program
  .command("setup")
  .description("Update /etc/hosts and generate/validate Caddyfile")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--https", "Generate a local HTTPS Caddy proxy with Caddy local certificates")
  .option("--ssl", "Alias for --https")
  .action(async (options: ConfigCliOptions & { project?: string } & ProxyModeCliOptions) => {
    assertLocalDevelopment("setup");
    await assertCaddyReady();

    const context = await resolveLocalghostContext({ ...contextOptionsFromCli(options), dynamicPort: false });
    const https = context.https;
    const projectName = context.projectName;
    const configPath = context.configPath;
    const entries = context.entries;

    warnAboutLocalMdns(entries);
    logDomainRoutes(entries, { https, ghostTunnel: context.ghostTunnel });

    explainHostsPassword();
    const hostsResult = await updateSystemHosts(projectName, entries);

    if (hostsResult.changed) {
      console.log(`Updated ${hostsResult.hostsPath}`);
    } else {
      console.log(`${hostsResult.hostsPath} already up to date`);
    }

    const caddyfile = await writeCaddyfile(entries, options.cwd, { https });
    await validateCaddyfile(caddyfile);

    const statePath = writeLocalghostState(options.cwd, {
      action: "setup",
      projectName,
      cwd: options.cwd,
      configPath,
      hostsPath: hostsResult.hostsPath,
      hostsChanged: hostsResult.changed,
      ...(hostsResult.tempPath ? { hostsTempPath: hostsResult.tempPath } : {}),
      caddyfilePath: caddyfile,
      caddyHttps: https,
      ...existingTrustMarkers(options.cwd),
      entries
    });
    registerLocalghostSetup({
      cwd: options.cwd,
      projectName,
      configPath,
      caddyfilePath: caddyfile,
      https,
      entries
    });

    console.log(`Generated ${caddyfile}`);
    console.log(`Mode ${https ? "HTTPS" : "HTTP"}`);
    console.log(`State ${statePath}`);
    console.log("Setup complete.");
  });

program
  .command("trust")
  .description("Trust Caddy's local HTTPS CA for this project's HTTPS proxy")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--https", "Use HTTPS mode for the Caddyfile")
  .option("--ssl", "Alias for --https")
  .action(async (options: ConfigCliOptions & { project?: string } & ProxyModeCliOptions) => {
    assertLocalDevelopment("trust");
    await assertCaddyReady();

    const context = await resolveLocalghostContext({ ...contextOptionsFromCli(options), dynamicPort: false });
    if (!context.https) {
      throw new Error("Localghost HTTPS is not enabled for this context. Set https: true in localghost.config.mjs or pass --https.");
    }

    warnAboutLocalMdns(context.entries);
    logDomainRoutes(context.entries, { https: true, ghostTunnel: context.ghostTunnel });
    explainTrustPassword();

    const caddyfile = await writeCaddyfile(context.entries, options.cwd, { https: true });
    await validateCaddyfile(caddyfile);
    await runTrust(options.cwd, caddyfile);
  });

program
  .command("reset")
  .description("Remove Localghost setup state without deleting .localghost")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .action(async (options: { project?: string; cwd: string }) => {
    assertLocalDevelopment("reset");

    const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
    const caddyfilePath = getCaddyfilePath(options.cwd);
    const statePath = getLocalghostStatePath(options.cwd);

    explainHostsPassword();
    const hostsResult = await removeSystemHosts(projectName);

    if (existsSync(caddyfilePath)) {
      unlinkSync(caddyfilePath);
      console.log(`Removed ${caddyfilePath}`);
    } else {
      console.log(`${caddyfilePath} was not present`);
    }

    if (existsSync(statePath)) {
      unlinkSync(statePath);
      console.log(`Removed ${statePath}`);
    } else {
      console.log(`${statePath} was not present`);
    }

    if (hostsResult.removed) {
      console.log(`Removed Localghost hosts block from ${hostsResult.hostsPath}`);
    } else {
      console.log(`No Localghost hosts block found in ${hostsResult.hostsPath}`);
    }

    unregisterLocalghostSetup({ cwd: options.cwd, projectName });
    console.log(".localghost was left in place. Run localghost setup when you are ready.");
  });

program
  .command("teardown")
  .description("Remove Localghost's managed /etc/hosts block")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--remove-caddyfile", "Also remove ops/local/Caddyfile")
  .action(async (options: { project?: string; cwd: string; removeCaddyfile?: boolean }) => {
    assertLocalDevelopment("teardown");
    const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
    explainHostsPassword();
    const hostsResult = await removeSystemHosts(projectName);
    const caddyfilePath = getCaddyfilePath(options.cwd);
    let caddyfileRemoved = false;

    if (options.removeCaddyfile && existsSync(caddyfilePath)) {
      unlinkSync(caddyfilePath);
      caddyfileRemoved = true;
    }

    const statePath = writeLocalghostState(options.cwd, {
      action: "teardown",
      projectName,
      cwd: options.cwd,
      hostsPath: hostsResult.hostsPath,
      hostsChanged: hostsResult.changed,
      ...(hostsResult.tempPath ? { hostsTempPath: hostsResult.tempPath } : {}),
      caddyfilePath,
      caddyfileRemoved
    });

    if (hostsResult.removed) {
      console.log(`Removed Localghost hosts block from ${hostsResult.hostsPath}`);
    } else {
      console.log(`No Localghost hosts block found in ${hostsResult.hostsPath}`);
    }

    if (options.removeCaddyfile) {
      console.log(caddyfileRemoved ? `Removed ${caddyfilePath}` : `${caddyfilePath} was not present`);
    }

    unregisterLocalghostSetup({ cwd: options.cwd, projectName });
    console.log(`State ${statePath}`);
  });

program
  .command("status")
  .description("Print Localghost's project-local state file")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--ready", "Exit non-zero when setup is missing or stale")
  .option("--https", "Check setup readiness for HTTPS mode")
  .option("--ssl", "Alias for --https")
  .option("--json", "Print raw JSON")
  .action(async (options: ConfigCliOptions & { project?: string; ready?: boolean; json?: boolean } & ProxyModeCliOptions) => {
    const state = readLocalghostState(options.cwd);
    const statePath = getLocalghostStatePath(options.cwd);
    const context = await resolveLocalghostContext({ ...contextOptionsFromCli(options), dynamicPort: false });
    const readiness = getSetupReadiness({
      ...options,
      https: context.https,
      entries: context.entries,
      configPath: context.configPath,
      projectName: context.projectName
    });

    if (options.json) {
      console.log(JSON.stringify({ state, setup: readiness }, null, 2));
      return;
    }

    if (!state) {
      console.log(`No Localghost state found at ${statePath}`);
    } else {
      console.log(`State: ${statePath}`);
      console.log(`Last action: ${state.action}`);
      console.log(`Updated: ${state.updatedAt}`);
      console.log(`Project: ${state.projectName}`);
      if (state.configPath) console.log(`Config: ${state.configPath}`);
      if (state.hostsPath) console.log(`Hosts: ${state.hostsPath}`);
      if (state.caddyfilePath) console.log(`Caddyfile: ${state.caddyfilePath}`);
      if (typeof state.caddyHttps === "boolean") console.log(`Mode: ${state.caddyHttps ? "HTTPS" : "HTTP"}`);
      if (state.caddyTrustedAt) console.log(`HTTPS trust: yes (${state.caddyTrustedAt})`);
      if (!state.caddyTrustedAt && state.caddyTrustPromptedAt) console.log(`HTTPS trust: not enabled (asked ${state.caddyTrustPromptedAt})`);
      if (typeof state.caddyfileRemoved === "boolean") console.log(`Caddyfile removed: ${state.caddyfileRemoved}`);
    }

    if (readiness.ready) {
      console.log("Setup ready: yes");
      return;
    }

    console.log("Setup ready: no");
    for (const reason of readiness.reasons) {
      console.log(`  - ${reason}`);
    }
    console.log(`Run: ${readiness.setupCommand}`);

    if (options.ready) {
      process.exitCode = 1;
    }
  });

program
  .command("routes")
  .description("Print domain to upstream routes")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--http", "Print domain URLs with http instead of https")
  .option("--https", "Print domain URLs with https")
  .option("--ssl", "Alias for --https")
  .option("--verbose", "Print Ghost Tunnel mode, domains, and guardrails")
  .action(async (options: ConfigCliOptions & { http?: boolean; verbose?: boolean } & ProxyModeCliOptions) => {
    const context = await resolveLocalghostContext({ ...contextOptionsFromCli(options), dynamicPort: false });
    warnAboutLocalMdns(context.entries);
    console.log(formatDomainRoutes(context.entries, { https: options.http ? false : context.https }));
    if (context.ghostTunnel.enabled) {
      console.log(formatGhostTunnel(context.ghostTunnel, {
        color: shouldColor(),
        label: "expected",
        verbose: options.verbose === true
      }));
    }
  });

program
  .command("dev")
  .description("Run the Localghost Caddy proxy after setup")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--https", "Run a local HTTPS proxy with Caddy local certificates")
  .option("--ssl", "Alias for --https")
  .option("--setup", "Run setup before starting the proxy when setup is missing or stale")
  .option("--trust", "Trust Caddy's local HTTPS CA before starting the proxy")
  .action(async (options: ConfigCliOptions & { project?: string; setup?: boolean } & ProxyModeCliOptions & TrustCliOptions) => {
    assertLocalDevelopment("dev");
    await assertCaddyReady();

    const context = await resolveLocalghostContext({ ...contextOptionsFromCli(options), dynamicPort: false });
    const https = context.https;
    const readiness = getSetupReadiness({
      ...options,
      https,
      entries: context.entries,
      configPath: context.configPath,
      projectName: context.projectName
    });

    if (!readiness.ready) {
      if (!options.setup) {
        throw new Error(
          [
            "Localghost setup is missing or stale.",
            ...readiness.reasons.map((reason) => `- ${reason}`),
            `Run: ${readiness.setupCommand}`,
            "Or rerun dev with --setup if you want Localghost to perform setup first."
          ].join("\n")
        );
      }

      explainHostsPassword();
      const hostsResult = await updateSystemHosts(readiness.projectName, readiness.entries);
      const caddyfilePath = await writeCaddyfile(readiness.entries, options.cwd, { https });
      await validateCaddyfile(caddyfilePath);
      writeLocalghostState(options.cwd, {
        action: "setup",
        projectName: readiness.projectName,
        cwd: options.cwd,
        configPath: readiness.configPath,
        hostsPath: hostsResult.hostsPath,
        hostsChanged: hostsResult.changed,
        ...(hostsResult.tempPath ? { hostsTempPath: hostsResult.tempPath } : {}),
        caddyfilePath,
        caddyHttps: https,
        ...existingTrustMarkers(options.cwd),
        entries: readiness.entries
      });
      registerLocalghostSetup({
        cwd: options.cwd,
        projectName: readiness.projectName,
        configPath: readiness.configPath,
        caddyfilePath,
        https,
        entries: readiness.entries
      });
    }

    warnAboutLocalMdns(readiness.entries);
    logDomainRoutes(readiness.entries, { https, ghostTunnel: context.ghostTunnel });

    const caddyfile = await writeCaddyfile(readiness.entries, options.cwd, { https });
    await validateCaddyfile(caddyfile);
    const caddy = startCaddy(caddyfile);
    try {
      await maybeTrustCaddy({
        cwd: options.cwd,
        https,
        caddyfilePath: caddyfile,
        ...(typeof options.trust === "boolean" ? { trust: options.trust } : {})
      });
    } catch (error) {
      if (!caddy.killed) caddy.kill("SIGINT");
      throw error;
    }
    const caddyPid = maybePid(caddy.pid);
    const runRecord = registerLocalghostRun({
      mode: "dev",
      cwd: options.cwd,
      projectName: readiness.projectName,
      configPath: readiness.configPath,
      caddyfilePath: caddyfile,
      ...(caddyPid ? { caddyPid } : {}),
      https,
      entries: readiness.entries
    });
    const cleanupRun = registerCleanup(runRecord.id);

    try {
      await caddy;
    } finally {
      cleanupRun();
    }
  });

program
  .command("run")
  .description("Run Caddy and a dev command from the same Localghost context")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--port <number>", "Initial app port", parsePort)
  .option("--https", "Run a local HTTPS proxy with Caddy local certificates")
  .option("--ssl", "Alias for --https")
  .option("--setup", "Run setup before starting when setup is missing or stale")
  .option("--trust", "Trust Caddy's local HTTPS CA before starting the child command")
  .option("--dynamic-port [yes|no]", "Use the requested port if free, otherwise continue upward", parseBooleanLike)
  .argument("<command...>", "Command to run after --, for example: localghost run -- vite")
  .action(async (
    command: string[],
    options: ConfigCliOptions & { project?: string; port?: number; setup?: boolean; dynamicPort?: boolean } & ProxyModeCliOptions & TrustCliOptions
  ) => {
    assertLocalDevelopment("run");
    await assertCaddyReady();

    const context = await resolveLocalghostContext({
      cwd: options.cwd,
      ...(options.project ? { project: options.project } : {}),
      ...(options.config && options.config.length > 0 ? { configFiles: options.config } : {}),
      ...(options.configPattern ? { configPattern: options.configPattern } : {}),
      ...(options.port ? { port: options.port } : {}),
      ...(useHttps(options) ? { https: true } : {}),
      ...(typeof options.dynamicPort === "boolean" ? { dynamicPort: options.dynamicPort } : {})
    });
    const https = context.https;
    const readiness = getSetupReadiness({
      ...options,
      https,
      ignoreCaddyfile: true,
      entries: context.entries,
      configPath: context.configPath,
      projectName: context.projectName
    });

    if (!readiness.ready) {
      const shouldSetup = options.setup === true || (canPrompt() && await confirm("Run caddy:setup now?", true));
      if (!shouldSetup) {
        throw new Error(
          [
            "Localghost setup is missing or stale.",
            ...readiness.reasons.map((reason) => `- ${reason}`),
            `Run: ${readiness.setupCommand}`
          ].join("\n")
        );
      }

      await runSetupFromReadiness(options.cwd, https, readiness);
      console.log(`All set. Setup state: ${getLocalghostStatePath(options.cwd)}`);
    }

    if (context.dynamicPort && context.port !== context.requestedPort) {
      console.log(`Port ${context.requestedPort} is busy; using ${context.port}.`);
    }

    warnAboutLocalMdns(context.entries);
    logDomainRoutes(context.entries, { https, ghostTunnel: context.ghostTunnel });

    const caddyfile = await writeCaddyfile(context.entries, options.cwd, { https });
    await validateCaddyfile(caddyfile);
    const caddy = startCaddy(caddyfile);
    const caddyExit = caddy.catch((error: unknown) => {
      if (!caddy.killed) throw error;
    });
    try {
      await maybeTrustCaddy({
        cwd: options.cwd,
        https,
        caddyfilePath: caddyfile,
        ...(typeof options.trust === "boolean" ? { trust: options.trust } : {})
      });
    } catch (error) {
      if (!caddy.killed) caddy.kill("SIGINT");
      throw error;
    }
    const [binary, ...args] = command;
    if (!binary) {
      throw new Error("Missing command. Use: localghost run -- vite");
    }

    const child = execa(binary, args, {
      cwd: options.cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        LOCALGHOST_PORT: String(context.port),
        LOCALGHOST_DYNAMIC_PORT: context.dynamicPort ? "1" : "0",
        VITE_PORT: String(context.port)
      }
    });
    const caddyPid = maybePid(caddy.pid);
    const childPid = maybePid(child.pid);
    const runRecord = registerLocalghostRun({
      mode: "run",
      cwd: context.cwd,
      projectName: context.projectName,
      configPath: context.configPath,
      caddyfilePath: caddyfile,
      ...(caddyPid ? { caddyPid } : {}),
      ...(childPid ? { childPid } : {}),
      childCommand: command,
      https,
      requestedPort: context.requestedPort,
      port: context.port,
      dynamicPort: context.dynamicPort,
      entries: context.entries
    });
    const cleanupRun = registerCleanup(runRecord.id);

    const stopCaddy = () => {
      if (!caddy.killed) caddy.kill("SIGINT");
    };
    const stopChild = () => {
      if (!child.killed) child.kill("SIGINT");
    };

    try {
      await Promise.race([child, caddyExit]);
    } finally {
      stopChild();
      stopCaddy();
      await Promise.allSettled([child, caddyExit]);
      cleanupRun();
    }
  });

program
  .command("ps")
  .description("Show Localghost setups and currently running sessions")
  .option("--json", "Print raw JSON")
  .action(async (options: { json?: boolean }) => {
    const setups = listLocalghostSetups();
    const runs = listLocalghostRuns();
    const instances = await getInstanceViews(setups, runs);

    if (options.json) {
      console.log(JSON.stringify({ activityPath: getLocalghostActivityPath(), setups, runs, instances }, null, 2));
      return;
    }

    console.log(formatInstanceViews(instances));
  });

program
  .command("print")
  .description("Print parsed host config")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .action((options: ConfigCliOptions) => {
    const entries = readDevHosts(readOptionsFromCli(options));
    warnAboutLocalMdns(entries);
    console.log(JSON.stringify(entries, null, 2));
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
