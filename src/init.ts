import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getProjectName, LOCALGHOST_CONFIG_FILE, sanitizeProjectName } from "./config.js";
import { writeTextFile } from "./fs.js";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

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
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

export function isPnpmWorkspaceRoot(cwd = process.cwd()): boolean {
  const target = resolve(cwd);
  let current = target;

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current === target;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

export function packageRunCommand(packageManager: PackageManager, script: string): string {
  if (packageManager === "yarn") return `yarn ${script}`;
  if (packageManager === "pnpm") return `pnpm ${script}`;
  if (packageManager === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}

export function packageAddCommand(packageManager: PackageManager, packageName = "@hamedb89/localghost"): string {
  if (packageManager === "yarn") return `yarn add -D ${packageName}`;
  if (packageManager === "pnpm") return `pnpm add -D ${packageName}`;
  if (packageManager === "bun") return `bun add -d ${packageName}`;
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

function hasLocalghostDependency(pkg: Record<string, unknown>) {
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some((field) => {
    const dependencies = pkg[field];
    return typeof dependencies === "object" && dependencies !== null && "@hamedb89/localghost" in dependencies;
  });
}

function localghostCommand(packageManager: PackageManager, installed: boolean) {
  if (installed) return "localghost";
  if (packageManager === "pnpm") return "pnpm dlx @hamedb89/localghost";
  if (packageManager === "yarn") return "yarn dlx @hamedb89/localghost";
  if (packageManager === "bun") return "bunx --package @hamedb89/localghost localghost";
  return "npm exec --yes --package=@hamedb89/localghost -- localghost";
}

function updatePackageScripts(packageJsonPath: string, configFile: string, packageManager: PackageManager): boolean {
  const pkg = readPackageJson(packageJsonPath);
  if (!pkg) return false;

  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? (pkg.scripts as Record<string, unknown>) : {};
  const configFlag = getConfigFlag(configFile);
  const command = localghostCommand(packageManager, hasLocalghostDependency(pkg));
  const nextScripts = {
    ...scripts,
    "localghost:setup": scripts["localghost:setup"] ?? `${command} setup${configFlag}`,
    "localghost:proxy": scripts["localghost:proxy"] ?? `${command} dev${configFlag}`,
    "localghost:proxy:https": scripts["localghost:proxy:https"] ?? `${command} dev${configFlag} --https`,
    "localghost:run": scripts["localghost:run"] ?? `${command} run${configFlag} --`,
    "localghost:ready": scripts["localghost:ready"] ?? `${command} status${configFlag} --ready`,
    "localghost:repair": scripts["localghost:repair"] ?? `${command} repair${configFlag}`,
    "localghost:trust": scripts["localghost:trust"] ?? `${command} trust${configFlag}`,
    "localghost:ps": scripts["localghost:ps"] ?? `${command} ps`,
    "localghost:print": scripts["localghost:print"] ?? `${command} print${configFlag}`,
    "localghost:routes": scripts["localghost:routes"] ?? `${command} routes${configFlag}`,
    "localghost:status": scripts["localghost:status"] ?? `${command} status`,
    "localghost:reset": scripts["localghost:reset"] ?? `${command} reset`,
    "localghost:teardown": scripts["localghost:teardown"] ?? `${command} teardown`,
    "localghost:doctor": scripts["localghost:doctor"] ?? `${command} doctor`,
    "localghost:update": scripts["localghost:update"] ?? `${command} update`,
    "caddy:setup": scripts["caddy:setup"] ?? `${command} setup${configFlag}`,
    "caddy:dev": scripts["caddy:dev"] ?? `${command} dev${configFlag}`
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
  const packageJsonChanged = options.writeScripts ? updatePackageScripts(packageJsonPath, configFile, packageManager) : false;

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
