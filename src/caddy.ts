import { dirname, join } from "node:path";
import { execa } from "execa";
import { writeTextFile } from "./fs.js";
import type { DevHostEntry } from "./parse.js";

export type CaddyModeOptions = {
  https?: boolean;
};

function groupByPort(entries: DevHostEntry[]) {
  const groups = new Map<number, DevHostEntry[]>();

  for (const entry of entries) {
    const group = groups.get(entry.port) ?? [];
    group.push(entry);
    groups.set(entry.port, group);
  }

  return groups;
}

export function getCaddyfilePath(cwd = process.cwd()) {
  return join(cwd, "ops/local/Caddyfile");
}

export function renderCaddyfile(entries: DevHostEntry[], options: CaddyModeOptions = {}) {
  const groups = groupByPort(entries);
  const https = options.https === true;
  const blocks = [...groups.entries()]
    .sort(([leftPort], [rightPort]) => leftPort - rightPort)
    .map(([port, group]) => {
      const hosts = group
        .map((entry) => (https ? entry.host : `http://${entry.host}`))
        .sort()
        .join(", ");

      return `${hosts} {
  reverse_proxy 127.0.0.1:${port}
}`;
    });

  const globalOptions = https
    ? `{
  local_certs
}

`
    : "";

  return `${globalOptions}${blocks.join("\n\n")}
`;
}

export async function writeCaddyfile(entries: DevHostEntry[], cwd = process.cwd(), options: CaddyModeOptions = {}) {
  const path = getCaddyfilePath(cwd);
  writeTextFile(path, renderCaddyfile(entries, options));
  return path;
}

export async function validateCaddyfile(path: string) {
  await execa("caddy", ["validate", "--config", path], {
    cwd: dirname(path),
    stdio: "inherit"
  });
}

export async function runCaddy(path: string) {
  await execa("caddy", ["run", "--config", path], {
    cwd: dirname(path),
    stdio: "inherit"
  });
}
