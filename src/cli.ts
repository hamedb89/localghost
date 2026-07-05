#!/usr/bin/env node

import { existsSync, unlinkSync } from "node:fs";
import { Command, InvalidArgumentError } from "commander";
import { getProjectName, readDevHosts, resolveDevHostsPath, sanitizeProjectName, type ReadDevHostsOptions } from "./config.js";
import { getCaddyfilePath, validateCaddyfile, writeCaddyfile, runCaddy } from "./caddy.js";
import { checkCaddy, runDoctor } from "./doctor.js";
import { removeSystemHosts, updateSystemHosts } from "./hosts-file.js";
import { initLocalghost, type PackageManager } from "./init.js";
import { findLocalMdnsHosts } from "./parse.js";
import { formatDomainRoutes } from "./routes.js";
import { getLocalghostStatePath, readLocalghostState, writeLocalghostState } from "./state.js";

function warnAboutLocalMdns(entries: ReturnType<typeof readDevHosts>) {
  const localHosts = findLocalMdnsHosts(entries);

  if (localHosts.length > 0) {
    console.warn(
      `Warning: .local can collide with mDNS/Bonjour. Prefer .localhost for dev hosts: ${localHosts.join(", ")}`
    );
  }
}

function logDomainRoutes(entries: ReturnType<typeof readDevHosts>) {
  console.log(formatDomainRoutes(entries));
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

const program = new Command();

program
  .name("localghost")
  .description("Buh. Friendly local hostnames for app repos.")
  .version("0.1.0");

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
  .command("setup")
  .description("Update /etc/hosts and generate/validate Caddyfile")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .action(async (options: ConfigCliOptions & { project?: string }) => {
    await assertCaddyReady();

    const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
    const readOptions = readOptionsFromCli(options);
    const configPath = resolveDevHostsPath(readOptions).path;
    const entries = readDevHosts(readOptions);

    warnAboutLocalMdns(entries);
    logDomainRoutes(entries);

    const hostsResult = await updateSystemHosts(projectName, entries);

    if (hostsResult.changed) {
      console.log(`Updated ${hostsResult.hostsPath}`);
    } else {
      console.log(`${hostsResult.hostsPath} already up to date`);
    }

    const caddyfile = await writeCaddyfile(entries, options.cwd);
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
      entries
    });

    console.log(`Generated ${caddyfile}`);
    console.log(`State ${statePath}`);
    console.log("Setup complete.");
  });

program
  .command("teardown")
  .description("Remove Localghost's managed /etc/hosts block")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--remove-caddyfile", "Also remove ops/local/Caddyfile")
  .action(async (options: { project?: string; cwd: string; removeCaddyfile?: boolean }) => {
    const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
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
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--json", "Print raw JSON")
  .action((options: { cwd: string; json?: boolean }) => {
    const state = readLocalghostState(options.cwd);
    const statePath = getLocalghostStatePath(options.cwd);

    if (!state) {
      console.log(`No Localghost state found at ${statePath}`);
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(state, null, 2));
      return;
    }

    console.log(`State: ${statePath}`);
    console.log(`Last action: ${state.action}`);
    console.log(`Updated: ${state.updatedAt}`);
    console.log(`Project: ${state.projectName}`);
    if (state.configPath) console.log(`Config: ${state.configPath}`);
    if (state.hostsPath) console.log(`Hosts: ${state.hostsPath}`);
    if (state.caddyfilePath) console.log(`Caddyfile: ${state.caddyfilePath}`);
    if (typeof state.caddyfileRemoved === "boolean") console.log(`Caddyfile removed: ${state.caddyfileRemoved}`);
  });

program
  .command("routes")
  .description("Print domain to upstream routes")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .option("--http", "Print domain URLs with http instead of https")
  .action((options: ConfigCliOptions & { http?: boolean }) => {
    const entries = readDevHosts(readOptionsFromCli(options));
    warnAboutLocalMdns(entries);
    console.log(formatDomainRoutes(entries, { https: !options.http }));
  });

program
  .command("dev")
  .description("Generate Caddyfile and run Caddy")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--config <file>", "Config file to look for. Can be repeated.", collect, [])
  .option("--config-pattern <regex>", "Regex for config filenames in the project root")
  .action(async (options: ConfigCliOptions) => {
    await assertCaddyReady();

    const entries = readDevHosts(readOptionsFromCli(options));

    warnAboutLocalMdns(entries);
    logDomainRoutes(entries);

    const caddyfile = await writeCaddyfile(entries, options.cwd);
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
