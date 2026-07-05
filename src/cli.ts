#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import {
  getLocalghostActivityPath,
  listLocalghostRuns,
  registerLocalghostRun,
  unregisterLocalghostRun,
  type LocalghostRunRecord
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
import { formatDomainRoutes } from "./routes.js";
import { getLocalghostStatePath, patchLocalghostState, readLocalghostState, writeLocalghostState } from "./state.js";
import { checkForUpdate, formatUpdateMessage, LOCALGHOST_VERSION, maybeNotifyAboutUpdate } from "./update-check.js";
import { execa } from "execa";

function warnAboutLocalMdns(entries: ReturnType<typeof readDevHosts>) {
  const localHosts = findLocalMdnsHosts(entries);

  if (localHosts.length > 0) {
    console.warn(
      `Warning: .local can collide with mDNS/Bonjour. Prefer .localhost for dev hosts: ${localHosts.join(", ")}`
    );
  }
}

function logDomainRoutes(entries: ReturnType<typeof readDevHosts>, options: { https?: boolean } = {}) {
  console.log(formatDomainRoutes(entries, options));
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

type LocalghostRunView = LocalghostRunRecord & {
  routes: Array<{
    host: string;
    port: number;
    target: string;
    listening: boolean;
  }>;
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

async function getRunView(run: LocalghostRunRecord): Promise<LocalghostRunView> {
  const portStatus = new Map<number, boolean>();

  for (const entry of run.entries) {
    if (!portStatus.has(entry.port)) {
      portStatus.set(entry.port, !(await isPortAvailable(entry.port)));
    }
  }

  return {
    ...run,
    routes: run.entries.map((entry) => ({
      host: entry.host,
      port: entry.port,
      target: `127.0.0.1:${entry.port}`,
      listening: portStatus.get(entry.port) ?? false
    }))
  };
}

function formatRunViews(runs: LocalghostRunView[]) {
  if (runs.length === 0) return "No Localghost apps are running.";

  const lines = ["localghost ps"];
  for (const run of runs) {
    const command = run.childCommand?.length ? ` ${run.childCommand.join(" ")}` : "";
    const mode = command ? `${run.mode}:${command}` : run.mode;
    lines.push("");
    lines.push(`${run.projectName}  ${mode}`);
    lines.push(`  cwd: ${run.cwd}`);
    lines.push(`  pid: ${run.pid}${run.caddyPid ? `, caddy: ${run.caddyPid}` : ""}${run.childPid ? `, child: ${run.childPid}` : ""}`);
    lines.push(`  started: ${run.startedAt}`);
    for (const route of run.routes) {
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
    logDomainRoutes(entries, { https });

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
    logDomainRoutes(context.entries, { https: true });
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
  .action(async (options: ConfigCliOptions & { http?: boolean } & ProxyModeCliOptions) => {
    const context = await resolveLocalghostContext({ ...contextOptionsFromCli(options), dynamicPort: false });
    warnAboutLocalMdns(context.entries);
    console.log(formatDomainRoutes(context.entries, { https: options.http ? false : context.https }));
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
    }

    warnAboutLocalMdns(readiness.entries);
    logDomainRoutes(readiness.entries, { https });

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
  .option("--dynamic-port [yes|no]", "Use the requested port if free, otherwise continue upward", parseBooleanLike, false)
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
    logDomainRoutes(context.entries, { https });

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
  .description("Show Localghost dev sessions that are currently running")
  .option("--json", "Print raw JSON")
  .action(async (options: { json?: boolean }) => {
    const runs = await Promise.all(listLocalghostRuns().map((run) => getRunView(run)));

    if (options.json) {
      console.log(JSON.stringify({ activityPath: getLocalghostActivityPath(), runs }, null, 2));
      return;
    }

    console.log(formatRunViews(runs));
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
