import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DevHostEntry } from "./parse.js";

export const LOCALGHOST_ACTIVITY_VERSION = 1;

export type LocalghostRunMode = "dev" | "run" | "vite";

export type LocalghostRunRecord = {
  id: string;
  mode: LocalghostRunMode;
  pid: number;
  cwd: string;
  projectName: string;
  startedAt: string;
  updatedAt: string;
  configPath?: string;
  caddyfilePath?: string;
  caddyPid?: number;
  childPid?: number;
  childCommand?: string[];
  https?: boolean;
  requestedPort?: number;
  port?: number;
  dynamicPort?: boolean;
  entries: DevHostEntry[];
};

export type LocalghostSetupRecord = {
  id: string;
  cwd: string;
  projectName: string;
  updatedAt: string;
  configPath?: string;
  caddyfilePath?: string;
  https?: boolean;
  entries: DevHostEntry[];
};

export type LocalghostActivity = {
  version: typeof LOCALGHOST_ACTIVITY_VERSION;
  runs: LocalghostRunRecord[];
  setups: LocalghostSetupRecord[];
};

export type RegisterLocalghostRunInput = Omit<LocalghostRunRecord, "id" | "pid" | "startedAt" | "updatedAt"> & {
  id?: string;
  pid?: number;
  startedAt?: string;
};

export type RegisterLocalghostSetupInput = Omit<LocalghostSetupRecord, "id" | "updatedAt"> & {
  id?: string;
};

export function getLocalghostActivityPath(env: NodeJS.ProcessEnv = process.env) {
  if (env.LOCALGHOST_ACTIVITY_PATH) return env.LOCALGHOST_ACTIVITY_PATH;

  const stateRoot = env.XDG_STATE_HOME || join(homedir(), ".local/state");
  return join(stateRoot, "localghost", "activity.json");
}

export function isProcessRunning(pid: number) {
  if (!Number.isInteger(pid) || pid < 1) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    return code === "EPERM";
  }
}

function emptyActivity(): LocalghostActivity {
  return { version: LOCALGHOST_ACTIVITY_VERSION, runs: [], setups: [] };
}

export function readLocalghostActivity(path = getLocalghostActivityPath()): LocalghostActivity {
  if (!existsSync(path)) return emptyActivity();

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LocalghostActivity>;
    return {
      version: LOCALGHOST_ACTIVITY_VERSION,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      setups: Array.isArray(parsed.setups) ? parsed.setups : []
    };
  } catch {
    return emptyActivity();
  }
}

export function writeLocalghostActivity(activity: LocalghostActivity, path = getLocalghostActivityPath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(activity, null, 2)}\n`, "utf8");
  return path;
}

function createRunId(input: Pick<RegisterLocalghostRunInput, "mode" | "cwd" | "projectName">, pid: number) {
  return `${input.projectName}:${input.mode}:${pid}:${Date.now()}`;
}

function createSetupId(input: Pick<RegisterLocalghostSetupInput, "cwd" | "projectName" | "configPath">) {
  return `${input.projectName}:${input.cwd}:${input.configPath ?? ""}`;
}

export function pruneLocalghostActivity(path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const activeRuns = activity.runs.filter((run) => isProcessRunning(run.pid));
  const pruned = activeRuns.length !== activity.runs.length;

  if (pruned) {
    writeLocalghostActivity({ ...activity, version: LOCALGHOST_ACTIVITY_VERSION, runs: activeRuns }, path);
  }

  return {
    path,
    pruned,
    runs: activeRuns,
    setups: activity.setups
  };
}

export function listLocalghostRuns(path = getLocalghostActivityPath()) {
  return pruneLocalghostActivity(path).runs;
}

export function listLocalghostSetups(path = getLocalghostActivityPath()) {
  return pruneLocalghostActivity(path).setups;
}

export function registerLocalghostRun(input: RegisterLocalghostRunInput, path = getLocalghostActivityPath()) {
  const now = new Date().toISOString();
  const pid = input.pid ?? process.pid;
  const record: LocalghostRunRecord = {
    id: input.id ?? createRunId(input, pid),
    mode: input.mode,
    pid,
    cwd: input.cwd,
    projectName: input.projectName,
    startedAt: input.startedAt ?? now,
    updatedAt: now,
    ...(input.configPath ? { configPath: input.configPath } : {}),
    ...(input.caddyfilePath ? { caddyfilePath: input.caddyfilePath } : {}),
    ...(input.caddyPid ? { caddyPid: input.caddyPid } : {}),
    ...(input.childPid ? { childPid: input.childPid } : {}),
    ...(input.childCommand ? { childCommand: input.childCommand } : {}),
    ...(typeof input.https === "boolean" ? { https: input.https } : {}),
    ...(input.requestedPort ? { requestedPort: input.requestedPort } : {}),
    ...(input.port ? { port: input.port } : {}),
    ...(typeof input.dynamicPort === "boolean" ? { dynamicPort: input.dynamicPort } : {}),
    entries: input.entries
  };
  const current = pruneLocalghostActivity(path).runs.filter((run) => run.id !== record.id);
  const activity = readLocalghostActivity(path);
  writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs: [...current, record], setups: activity.setups }, path);
  return record;
}

export function registerLocalghostSetup(input: RegisterLocalghostSetupInput, path = getLocalghostActivityPath()) {
  const record: LocalghostSetupRecord = {
    id: input.id ?? createSetupId(input),
    cwd: input.cwd,
    projectName: input.projectName,
    updatedAt: new Date().toISOString(),
    ...(input.configPath ? { configPath: input.configPath } : {}),
    ...(input.caddyfilePath ? { caddyfilePath: input.caddyfilePath } : {}),
    ...(typeof input.https === "boolean" ? { https: input.https } : {}),
    entries: input.entries
  };
  const activity = pruneLocalghostActivity(path);
  const setups = activity.setups.filter((setup) => setup.id !== record.id);
  writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs: activity.runs, setups: [...setups, record] }, path);
  return record;
}

export function unregisterLocalghostRun(id: string, path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const runs = activity.runs.filter((run) => run.id !== id);

  if (runs.length !== activity.runs.length) {
    writeLocalghostActivity({ ...activity, version: LOCALGHOST_ACTIVITY_VERSION, runs }, path);
  }
}

export function unregisterLocalghostSetup(options: { cwd: string; projectName?: string; configPath?: string }, path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const setups = activity.setups.filter((setup) => {
    if (setup.cwd !== options.cwd) return true;
    if (options.projectName && setup.projectName !== options.projectName) return true;
    if (options.configPath && setup.configPath !== options.configPath) return true;
    return false;
  });

  if (setups.length !== activity.setups.length) {
    writeLocalghostActivity({ ...activity, version: LOCALGHOST_ACTIVITY_VERSION, setups }, path);
  }
}
