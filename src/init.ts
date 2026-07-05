import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectName, LOCALGHOST_CONFIG_FILE, sanitizeProjectName } from "./config.js";
import { writeTextFile } from "./fs.js";

export type PackageManager = "npm" | "yarn" | "pnpm";

export type InitOptions = {
  cwd?: string;
  host?: string;
  port?: number;
  apiHost?: string;
  apiPort?: number;
  force?: boolean;
  packageManager?: PackageManager;
  writeScripts?: boolean;
  configFile?: string;
};

export type InitResult = {
  configPath: string;
  configCreated: boolean;
  packageJsonPath?: string;
  packageJsonChanged: boolean;
  packageManager: PackageManager;
  nextSteps: string[];
};

export function detectPackageManager(cwd = process.cwd()): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

export function packageRunCommand(packageManager: PackageManager, script: string): string {
  if (packageManager === "yarn") return `yarn ${script}`;
  if (packageManager === "pnpm") return `pnpm ${script}`;
  return `npm run ${script}`;
}

export function packageAddCommand(packageManager: PackageManager, packageName = "@hamedb89/localghost"): string {
  if (packageManager === "yarn") return `yarn add -D ${packageName}`;
  if (packageManager === "pnpm") return `pnpm add -D ${packageName}`;
  return `npm install -D ${packageName}`;
}

function renderConfig(options: Required<Pick<InitOptions, "host" | "port" | "apiHost" | "apiPort">>) {
  return [
    "# Buh. Friendly names for local services.",
    "# Format: <host> <port>",
    `${options.host} ${options.port}`,
    `www.${options.host} ${options.port}`,
    `${options.apiHost} ${options.apiPort}`,
    ""
  ].join("\n");
}

function readPackageJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getConfigFlag(configFile: string) {
  return configFile === LOCALGHOST_CONFIG_FILE ? "" : ` --config ${shellQuote(configFile)}`;
}

function updatePackageScripts(packageJsonPath: string, configFile: string): boolean {
  const pkg = readPackageJson(packageJsonPath);
  if (!pkg) return false;

  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? (pkg.scripts as Record<string, unknown>) : {};
  const configFlag = getConfigFlag(configFile);
  const nextScripts = {
    ...scripts,
    "localghost:setup": scripts["localghost:setup"] ?? `localghost setup${configFlag}`,
    "localghost:proxy": scripts["localghost:proxy"] ?? `localghost dev${configFlag}`,
    "localghost:proxy:https": scripts["localghost:proxy:https"] ?? `localghost dev${configFlag} --https`,
    "localghost:ready": scripts["localghost:ready"] ?? `localghost status${configFlag} --ready`,
    "localghost:print": scripts["localghost:print"] ?? `localghost print${configFlag}`,
    "localghost:routes": scripts["localghost:routes"] ?? `localghost routes${configFlag}`,
    "localghost:status": scripts["localghost:status"] ?? "localghost status",
    "localghost:teardown": scripts["localghost:teardown"] ?? "localghost teardown",
    "localghost:doctor": scripts["localghost:doctor"] ?? "localghost doctor",
    "localghost:update": scripts["localghost:update"] ?? "localghost update",
    "caddy:setup": scripts["caddy:setup"] ?? `localghost setup${configFlag}`,
    "caddy:dev": scripts["caddy:dev"] ?? `localghost dev${configFlag}`
  };

  const changed = JSON.stringify(scripts) !== JSON.stringify(nextScripts);
  if (!changed) return false;

  pkg.scripts = nextScripts;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

export function initLocalghost(options: InitOptions = {}): InitResult {
  const cwd = options.cwd ?? process.cwd();
  const projectName = sanitizeProjectName(getProjectName(cwd).split("/").pop() ?? "app");
  const host = options.host ?? `${projectName}.localhost`;
  const port = options.port ?? 5173;
  const apiHost = options.apiHost ?? `api.${host}`;
  const apiPort = options.apiPort ?? 8787;
  const packageManager = options.packageManager ?? detectPackageManager(cwd);
  const configFile = options.configFile ?? LOCALGHOST_CONFIG_FILE;
  const configPath = join(cwd, configFile);
  const configExists = existsSync(configPath);

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

  const packageJsonPath = join(cwd, "package.json");
  const packageJsonChanged = options.writeScripts ? updatePackageScripts(packageJsonPath, configFile) : false;

  return {
    configPath,
    configCreated: true,
    ...(existsSync(packageJsonPath) ? { packageJsonPath } : {}),
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
