import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DevHostEntry } from "./parse.js";

export const LOCALGHOST_ACTIVITY_VERSION = 1;

export type LocalghostRunMode = "dev" | "run";

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

export type LocalghostActivity = {
  version: typeof LOCALGHOST_ACTIVITY_VERSION;
  runs: LocalghostRunRecord[];
};

export type RegisterLocalghostRunInput = Omit<LocalghostRunRecord, "id" | "pid" | "startedAt" | "updatedAt"> & {
  id?: string;
  pid?: number;
  startedAt?: string;
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
  return { version: LOCALGHOST_ACTIVITY_VERSION, runs: [] };
}

export function readLocalghostActivity(path = getLocalghostActivityPath()): LocalghostActivity {
  if (!existsSync(path)) return emptyActivity();

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LocalghostActivity>;
    return {
      version: LOCALGHOST_ACTIVITY_VERSION,
      runs: Array.isArray(parsed.runs) ? parsed.runs : []
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

export function pruneLocalghostActivity(path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const activeRuns = activity.runs.filter((run) => isProcessRunning(run.pid));
  const pruned = activeRuns.length !== activity.runs.length;

  if (pruned) {
    writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs: activeRuns }, path);
  }

  return {
    path,
    pruned,
    runs: activeRuns
  };
}

export function listLocalghostRuns(path = getLocalghostActivityPath()) {
  return pruneLocalghostActivity(path).runs;
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
  writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs: [...current, record] }, path);
  return record;
}

export function unregisterLocalghostRun(id: string, path = getLocalghostActivityPath()) {
  const activity = readLocalghostActivity(path);
  const runs = activity.runs.filter((run) => run.id !== id);

  if (runs.length !== activity.runs.length) {
    writeLocalghostActivity({ version: LOCALGHOST_ACTIVITY_VERSION, runs }, path);
  }
}
