import type { ChildProcess } from "node:child_process";

export type ProcessSignal = NodeJS.Signals;
export type ProcessKiller = (pid: number, signal: ProcessSignal) => void;

export function signalManagedProcessPid(
  pid: number | undefined,
  signal: ProcessSignal,
  killProcess: ProcessKiller = (value, processSignal) => process.kill(value, processSignal)
) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 1) return false;

  try {
    // Detached POSIX children lead their own process group.
    killProcess(process.platform === "win32" ? pid : -pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

export function signalManagedProcess(child: Pick<ChildProcess, "pid" | "kill" | "killed">, signal: ProcessSignal) {
  if (process.platform === "win32") {
    if (!child.killed) child.kill(signal);
    return true;
  }

  return signalManagedProcessPid(child.pid, signal);
}
