import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export type LocalghostPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type DetectedDevCommand = {
  command: string[];
  source: "config" | "script";
  packageManager?: LocalghostPackageManager;
  script?: string;
};

export type LocalghostServiceOptions = {
  name: string;
  cwd: string;
  host: string;
  port: number;
  command?: string[];
};

export type DetectedDevService = {
  name: string;
  cwd: string;
  relativeCwd: string;
  host: string;
  requestedPort: number;
  command: string[];
  commandSource: DetectedDevCommand["source"];
};

type PackageJson = {
  packageManager?: unknown;
  scripts?: unknown;
};

function readPackageJson(cwd: string): PackageJson {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) {
    throw new Error(`No package.json found in ${cwd}. Pass an explicit command with \`localghost run -- <command>\`.`);
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  } catch {
    throw new Error(`Could not parse ${path}.`);
  }
}

export function detectDevPackageManager(cwd: string, packageManager: unknown): LocalghostPackageManager {
  if (typeof packageManager === "string") {
    const name = packageManager.split("@")[0];
    if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") return name;
  }

  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

function scriptCommand(packageManager: LocalghostPackageManager, script: string) {
  if (packageManager === "yarn") return ["yarn", script];
  return [packageManager, "run", script];
}

function invokesLocalghost(script: string) {
  return /(^|[\s;&|])(?:npm\s+exec\s+|pnpm\s+exec\s+|bunx\s+|npx\s+)?localghost(?:\s|$)/.test(script);
}

export function detectDevCommand(options: {
  cwd?: string;
  command?: string[];
} = {}): DetectedDevCommand {
  const cwd = options.cwd ?? process.cwd();

  if (options.command) {
    if (options.command.length === 0 || options.command.some((part) => typeof part !== "string" || part.length === 0)) {
      throw new Error("localghost.config.mjs command must be a non-empty array of strings.");
    }
    if (invokesLocalghost(options.command.join(" "))) {
      throw new Error("localghost.config.mjs command cannot invoke Localghost recursively.");
    }
    return { command: [...options.command], source: "config" };
  }

  const pkg = readPackageJson(cwd);
  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts as Record<string, unknown> : {};
  const packageManager = detectDevPackageManager(cwd, pkg.packageManager);

  for (const script of ["dev:raw", "dev"]) {
    const value = scripts[script];
    if (typeof value !== "string" || invokesLocalghost(value)) continue;
    return {
      command: scriptCommand(packageManager, script),
      source: "script",
      packageManager,
      script
    };
  }

  throw new Error([
    `Could not detect a safe development command in ${join(cwd, "package.json")}.`,
    "Add a non-recursive dev or dev:raw script, configure command in localghost.config.mjs,",
    "or pass an explicit command with `localghost run -- <command>`."
  ].join(" "));
}

export function formatDetectedDevCommand(detected: DetectedDevCommand) {
  const command = detected.command.map((part) => (
    /^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)
  )).join(" ");
  const source = detected.source === "config"
    ? "localghost.config.mjs"
    : `package.json#scripts.${detected.script}`;
  return `${command} (${source})`;
}

function assertServicePath(root: string, serviceCwd: string, name: string) {
  const cwd = resolve(root, serviceCwd);
  const relativeCwd = relative(root, cwd);
  if (isAbsolute(relativeCwd) || relativeCwd === ".." || relativeCwd.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Service ${name} cwd must stay inside the project root.`);
  }
  return { cwd, relativeCwd: relativeCwd || "." };
}

export function detectDevServices(options: {
  cwd?: string;
  services: LocalghostServiceOptions[];
}) {
  const root = options.cwd ?? process.cwd();
  if (options.services.length === 0) throw new Error("services must contain at least one service.");

  const names = new Set<string>();
  const hosts = new Set<string>();

  return options.services.map((service, index): DetectedDevService => {
    if (!service || typeof service !== "object") throw new Error(`Service at index ${index} must be an object.`);
    if (!service.name || names.has(service.name)) throw new Error(`Service name must be unique: ${service.name || `<index ${index}>`}.`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(service.name)) throw new Error(`Invalid service name: ${service.name}.`);
    if (!service.host || hosts.has(service.host)) throw new Error(`Service host must be unique: ${service.host || `<index ${index}>`}.`);
    if (!Number.isInteger(service.port) || service.port < 1 || service.port > 65_535) {
      throw new Error(`Invalid port for service ${service.name}: ${service.port}.`);
    }

    names.add(service.name);
    hosts.add(service.host);
    const path = assertServicePath(root, service.cwd, service.name);
    const detected = detectDevCommand({
      cwd: path.cwd,
      ...(service.command ? { command: service.command } : {})
    });

    return {
      name: service.name,
      ...path,
      host: service.host,
      requestedPort: service.port,
      command: detected.command,
      commandSource: detected.source
    };
  });
}

export function formatDetectedDevServices(services: DetectedDevService[]) {
  return [
    `Localghost detected ${services.length} services:`,
    ...services.map((service) => (
      `${service.name}: ${service.command.map((part) => (
        /^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)
      )).join(" ")} (${service.relativeCwd}, ${service.host} -> ${service.requestedPort})`
    ))
  ].join("\n");
}
