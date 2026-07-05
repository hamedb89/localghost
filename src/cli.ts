#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import { getProjectName, readDevHosts, resolveDevHostsPath, sanitizeProjectName, type ReadDevHostsOptions } from "./config.js";
import { getCaddyfilePath, renderCaddyfile, validateCaddyfile, writeCaddyfile, runCaddy } from "./caddy.js";
import { checkCaddy, runDoctor } from "./doctor.js";
import { assertLocalDevelopment } from "./env.js";
import { getSystemHostsPath, removeSystemHosts, renderHostsBlock, updateSystemHosts } from "./hosts-file.js";
import { initLocalghost, type PackageManager } from "./init.js";
import { findLocalMdnsHosts } from "./parse.js";
import { formatDomainRoutes } from "./routes.js";
import { getLocalghostStatePath, readLocalghostState, writeLocalghostState } from "./state.js";
import { checkForUpdate, formatUpdateMessage, LOCALGHOST_VERSION, maybeNotifyAboutUpdate } from "./update-check.js";

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

type ConfigCliOptions = {
  cwd: string;
  config?: string[];
  configPattern?: string;
};

type ProxyModeCliOptions = {
  https?: boolean;
  ssl?: boolean;
};

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

function explainHostsPassword() {
  console.log("Localghost may ask for your password to update its managed block in /etc/hosts.");
  console.log("It will only touch the lines between # localghost:start and # localghost:end.");
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

function getSetupReadiness(options: ConfigCliOptions & { project?: string; https?: boolean }) {
  const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
  const readOptions = readOptionsFromCli(options);
  const entries = readDevHosts(readOptions);
  const configPath = resolveDevHostsPath(readOptions).path;
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

  if (!existsSync(caddyfilePath)) {
    reasons.push(`Missing Caddyfile at ${caddyfilePath}.`);
  } else {
    const expectedCaddyfile = renderCaddyfile(entries, { https });
    const currentCaddyfile = readFileSync(caddyfilePath, "utf8");
    if (currentCaddyfile !== expectedCaddyfile) {
      reasons.push(`Caddyfile at ${caddyfilePath} is stale for ${https ? "HTTPS" : "HTTP"} mode.`);
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

    const https = useHttps(options);
    const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
    const readOptions = readOptionsFromCli(options);
    const configPath = resolveDevHostsPath(readOptions).path;
    const entries = readDevHosts(readOptions);

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
      entries
    });

    console.log(`Generated ${caddyfile}`);
    console.log(`Mode ${https ? "HTTPS" : "HTTP"}`);
    console.log(`State ${statePath}`);
    console.log("Setup complete.");
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
  .action((options: ConfigCliOptions & { project?: string; ready?: boolean; json?: boolean } & ProxyModeCliOptions) => {
    const state = readLocalghostState(options.cwd);
    const statePath = getLocalghostStatePath(options.cwd);
    const readiness = getSetupReadiness({ ...options, https: useHttps(options) });

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
  .action((options: ConfigCliOptions & { http?: boolean } & ProxyModeCliOptions) => {
    const entries = readDevHosts(readOptionsFromCli(options));
    warnAboutLocalMdns(entries);
    console.log(formatDomainRoutes(entries, { https: options.http ? false : useHttps(options) }));
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
  .action(async (options: ConfigCliOptions & { project?: string; setup?: boolean } & ProxyModeCliOptions) => {
    assertLocalDevelopment("dev");
    await assertCaddyReady();

    const https = useHttps(options);
    const readiness = getSetupReadiness({ ...options, https });

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
        entries: readiness.entries
      });
    }

    warnAboutLocalMdns(readiness.entries);
    logDomainRoutes(readiness.entries, { https });

    const caddyfile = await writeCaddyfile(readiness.entries, options.cwd, { https });
    await validateCaddyfile(caddyfile);
    await runCaddy(caddyfile);
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
