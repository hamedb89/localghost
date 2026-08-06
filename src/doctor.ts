import { execa } from "execa";
import { isPortAvailable } from "./port.js";
import { canonicalizeLocalghostProjectCwd, createLocalghostRegistry } from "./registry.js";
import { isProcessRunning } from "./activity.js";
import { resolveLocalghostContext } from "./context.js";
import type { ConfigPattern } from "./config.js";

export type DoctorResult = {
  ok: boolean;
  caddy: {
    found: boolean;
    version?: string;
    installHint: string;
  };
  ports: {
    configured?: number;
    available?: boolean;
    registryPath: string;
    staleLeases: Array<{ projectCwd: string; instanceKey: string; port: number; pid: number }>;
    duplicateAllocations: Array<{ port: number; projects: string[] }>;
    currentAllocation?: { projectCwd: string; instanceKey: string; port: number };
  };
};

export type DoctorOptions = {
  cwd?: string;
  configFiles?: string[];
  configPattern?: ConfigPattern;
};

export async function checkCaddy(): Promise<DoctorResult["caddy"]> {
  try {
    const result = await execa("caddy", ["version"], { reject: false });
    const version = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    return {
      found: result.exitCode === 0,
      ...(version ? { version } : {}),
      installHint: "brew install caddy"
    };
  } catch {
    return {
      found: false,
      installHint: "brew install caddy"
    };
  }
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const caddy = await checkCaddy();
  const cwd = options.cwd ?? process.cwd();
  const registry = createLocalghostRegistry({ cwd });
  const data = await registry.read();
  const now = Date.now();
  const staleLeases = data.leases
    .filter((lease) => lease.expiresAt <= now || !isProcessRunning(lease.pid))
    .map(({ projectCwd, instanceKey, port, pid }) => ({ projectCwd, instanceKey, port, pid }));
  const allocationsByPort = new Map<number, string[]>();
  for (const allocation of data.allocations) {
    const projects = allocationsByPort.get(allocation.port) ?? [];
    projects.push(`${allocation.projectCwd}#${allocation.instanceKey}`);
    allocationsByPort.set(allocation.port, projects);
  }
  const duplicateAllocations = [...allocationsByPort.entries()]
    .filter(([, projects]) => projects.length > 1)
    .map(([port, projects]) => ({ port, projects }));
  let configured: number | undefined;
  let available: boolean | undefined;
  try {
    const context = await resolveLocalghostContext({
      cwd,
      ...(options.configFiles ? { configFiles: options.configFiles } : {}),
      ...(options.configPattern ? { configPattern: options.configPattern } : {}),
      dynamicPort: false
    });
    configured = context.requestedPort;
    available = await isPortAvailable(configured);
  } catch {
    // The existing Caddy check remains useful even when project config is invalid.
  }
  const currentProjectCwd = canonicalizeLocalghostProjectCwd(cwd);
  const currentAllocation = data.allocations.find((allocation) => allocation.projectCwd === currentProjectCwd);
  return {
    ok: caddy.found && available !== false && staleLeases.length === 0 && duplicateAllocations.length === 0,
    caddy,
    ports: {
      ...(configured !== undefined ? { configured } : {}),
      ...(available !== undefined ? { available } : {}),
      registryPath: registry.registryPath,
      staleLeases,
      duplicateAllocations,
      ...(currentAllocation ? {
        currentAllocation: {
          projectCwd: currentAllocation.projectCwd,
          instanceKey: currentAllocation.instanceKey,
          port: currentAllocation.port
        }
      } : {})
    }
  };
}
