#!/usr/bin/env node

import { Command } from "commander";
import { getProjectName, readDevHosts, sanitizeProjectName } from "./config.js";
import { validateCaddyfile, writeCaddyfile, runCaddy } from "./caddy.js";
import { updateSystemHosts } from "./hosts-file.js";
import { findLocalMdnsHosts } from "./parse.js";

function warnAboutLocalMdns(entries: ReturnType<typeof readDevHosts>) {
  const localHosts = findLocalMdnsHosts(entries);

  if (localHosts.length > 0) {
    console.warn(
      `Warning: .local can collide with mDNS/Bonjour. Prefer .localhost for dev hosts: ${localHosts.join(", ")}`
    );
  }
}

const program = new Command();

program
  .name("localghost")
  .description("Friendly local hostnames for app repos")
  .version("0.1.0");

program
  .command("setup")
  .description("Update /etc/hosts and generate/validate Caddyfile")
  .option("--project <name>", "Managed /etc/hosts block name")
  .option("--cwd <path>", "Project directory", process.cwd())
  .action(async (options: { project?: string; cwd: string }) => {
    const projectName = sanitizeProjectName(options.project ?? getProjectName(options.cwd));
    const entries = readDevHosts({ cwd: options.cwd });

    warnAboutLocalMdns(entries);

    const hostsResult = await updateSystemHosts(projectName, entries);

    if (hostsResult.changed) {
      console.log(`Updated ${hostsResult.hostsPath}`);
    } else {
      console.log(`${hostsResult.hostsPath} already up to date`);
    }

    const caddyfile = await writeCaddyfile(entries, options.cwd);
    await validateCaddyfile(caddyfile);

    console.log(`Generated ${caddyfile}`);
    console.log("Setup complete.");
  });

program
  .command("dev")
  .description("Generate Caddyfile and run Caddy")
  .option("--cwd <path>", "Project directory", process.cwd())
  .action(async (options: { cwd: string }) => {
    const entries = readDevHosts({ cwd: options.cwd });

    warnAboutLocalMdns(entries);

    const caddyfile = await writeCaddyfile(entries, options.cwd);
    await validateCaddyfile(caddyfile);
    await runCaddy(caddyfile);
  });

program
  .command("print")
  .description("Print parsed host config")
  .option("--cwd <path>", "Project directory", process.cwd())
  .action((options: { cwd: string }) => {
    const entries = readDevHosts({ cwd: options.cwd });
    warnAboutLocalMdns(entries);
    console.log(JSON.stringify(entries, null, 2));
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
