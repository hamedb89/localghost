import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";
import { isPortAvailable } from "./port.js";

export const LOCALGHOST_REGISTRY_FILE = "registry.json";
export const LOCALGHOST_REGISTRY_LOCK_FILE = "registry.lock";

export type PortAvailabilityCheck = (port: number, host?: string) => boolean | Promise<boolean>;

export type LocalghostRegistryEntry = {
  projectCwd: string;
  instanceKey: string;
  port: number;
  updatedAt: number;
};

export type LocalghostLease = {
  projectCwd: string;
  instanceKey: string;
  port: number;
  pid: number;
  acquiredAt: number;
  expiresAt: number;
  ownerToken: string;
};

export type LocalghostRegistryData = {
  version: 1;
  allocations: LocalghostRegistryEntry[];
  leases: LocalghostLease[];
};

export type LocalghostRegistryOptions = {
  stateRoot?: string;
  cwd?: string;
  pid?: number;
  ownerToken?: string;
  now?: () => number;
  isProcessRunning?: (pid: number) => boolean;
  availabilityCheck?: PortAvailabilityCheck;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  lockStaleMs?: number;
};

export type AcquireLocalghostPortOptions = {
  projectCwd?: string;
  instanceKey: string;
  startPort?: number;
  maxAttempts?: number;
  reservedPorts?: Iterable<number>;
  leaseTtlMs?: number;
  host?: string;
};

export type RenewLocalghostPortOptions = {
  projectCwd?: string;
  instanceKey: string;
  leaseTtlMs?: number;
};

export type LocalghostRegistry = {
  root: string;
  registryPath: string;
  lockPath: string;
  ownerToken: string;
  acquirePort(options: AcquireLocalghostPortOptions): Promise<LocalghostLease>;
  renewPort(options: RenewLocalghostPortOptions): Promise<LocalghostLease | undefined>;
  releasePort(options: { projectCwd?: string; instanceKey: string }): Promise<boolean>;
  read(): Promise<LocalghostRegistryData>;
  prune(): Promise<{ removedLeases: number }>;
  reset(): Promise<void>;
};

type RegistryLock = { pid: number; createdAt: number; token: string };

function defaultProcessRunning(pid: number) {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function getLocalghostRegistryRoot(env: NodeJS.ProcessEnv = process.env) {
  return resolve(env.LOCALGHOST_HOME || join(homedir(), ".localghost"));
}

export function canonicalizeLocalghostProjectCwd(cwd = process.cwd()) {
  return normalize(resolve(cwd));
}

function emptyRegistry(): LocalghostRegistryData {
  return { version: 1, allocations: [], leases: [] };
}

function leaseKey(projectCwd: string, instanceKey: string) {
  return `${projectCwd}\u0000${instanceKey}`;
}

function validRegistry(value: unknown): value is LocalghostRegistryData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalghostRegistryData>;
  return candidate.version === 1 && Array.isArray(candidate.allocations) && Array.isArray(candidate.leases);
}

function pruneRegistry(registry: LocalghostRegistryData, now: number, isRunning: (pid: number) => boolean) {
  registry.leases = registry.leases.filter((lease) => lease.expiresAt > now && isRunning(lease.pid));
}

async function readJson(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export function createLocalghostRegistry(options: LocalghostRegistryOptions = {}): LocalghostRegistry {
  const root = resolve(options.stateRoot ?? getLocalghostRegistryRoot());
  const registryPath = join(root, LOCALGHOST_REGISTRY_FILE);
  const lockPath = join(root, LOCALGHOST_REGISTRY_LOCK_FILE);
  const cwd = canonicalizeLocalghostProjectCwd(options.cwd);
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const ownerToken = options.ownerToken ?? randomUUID();
  const isRunning = options.isProcessRunning ?? defaultProcessRunning;
  const availabilityCheck = options.availabilityCheck ?? isPortAvailable;
  const lockTimeoutMs = options.lockTimeoutMs ?? 5000;
  const lockRetryMs = options.lockRetryMs ?? 25;
  const lockStaleMs = options.lockStaleMs ?? 30000;

  async function readRegistry() {
    const value = await readJson(registryPath);
    return validRegistry(value) ? value : emptyRegistry();
  }

  async function writeRegistry(registry: LocalghostRegistryData) {
    await mkdir(root, { recursive: true });
    const temporaryPath = join(root, `.registry.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, registryPath);
  }

  async function lock() {
    await mkdir(root, { recursive: true });
    const deadline = now() + lockTimeoutMs;
    const token = randomUUID();
    while (true) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify({ pid, createdAt: now(), token } satisfies RegistryLock)}\n`);
        await handle.close();
        return async () => {
          const current = await readJson(lockPath);
          if ((current as RegistryLock | undefined)?.token === token) await unlink(lockPath).catch(() => undefined);
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const lockInfo = await readJson(lockPath) as RegistryLock | undefined;
        let stale = false;
        if (lockInfo && typeof lockInfo.pid === "number") {
          stale = !isRunning(lockInfo.pid) && now() - lockInfo.createdAt >= 0;
        } else {
          try {
            stale = now() - (await stat(lockPath)).mtimeMs > lockStaleMs;
          } catch {
            continue;
          }
        }
        if (stale) {
          await rm(lockPath, { force: true }).catch(() => undefined);
          continue;
        }
        if (now() >= deadline) throw new Error(`Timed out waiting for Localghost registry lock: ${lockPath}`);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, lockRetryMs));
      }
    }
  }

  async function withLock<T>(operation: (registry: LocalghostRegistryData) => Promise<T>) {
    const releaseLock = await lock();
    try {
      const registry = await readRegistry();
      pruneRegistry(registry, now(), isRunning);
      return await operation(registry);
    } finally {
      await releaseLock();
    }
  }

  return {
    root,
    registryPath,
    lockPath,
    ownerToken,
    read: readRegistry,
    async prune() {
      const releaseLock = await lock();
      try {
        const registry = await readRegistry();
        const before = registry.leases.length;
        pruneRegistry(registry, now(), isRunning);
        await writeRegistry(registry);
        return { removedLeases: before - registry.leases.length };
      } finally {
        await releaseLock();
      }
    },
    async reset() {
      const releaseLock = await lock();
      try {
        await writeRegistry({ version: 1, allocations: [], leases: [] });
      } finally {
        await releaseLock();
      }
    },
    async acquirePort(acquireOptions) {
      const projectCwd = canonicalizeLocalghostProjectCwd(acquireOptions.projectCwd ?? cwd);
      if (!acquireOptions.instanceKey) throw new Error("instanceKey is required");
      return withLock(async (registry) => {
        const key = leaseKey(projectCwd, acquireOptions.instanceKey);
        const existing = registry.allocations.find((entry) => leaseKey(entry.projectCwd, entry.instanceKey) === key);
        const reserved = new Set(acquireOptions.reservedPorts ?? []);
        const activePorts = new Set(registry.leases.map((lease) => lease.port));
        const port = existing?.port;
        const ownsActiveLease = registry.leases.some((lease) => lease.port === port && leaseKey(lease.projectCwd, lease.instanceKey) === key && lease.ownerToken === ownerToken);
        const reusable = port !== undefined && !reserved.has(port) &&
          (!activePorts.has(port) || ownsActiveLease) &&
          (ownsActiveLease || await availabilityCheck(port, acquireOptions.host));
        let selectedPort = reusable ? port : undefined;
        if (selectedPort === undefined) {
          const startPort = acquireOptions.startPort ?? 3000;
          const maxAttempts = acquireOptions.maxAttempts ?? 50;
          for (let offset = 0; offset < maxAttempts; offset += 1) {
            const candidate = startPort + offset;
            if (reserved.has(candidate) || activePorts.has(candidate)) continue;
            if (await availabilityCheck(candidate, acquireOptions.host)) {
              selectedPort = candidate;
              break;
            }
          }
          if (selectedPort === undefined) throw new Error(`No available registry port found from ${startPort} to ${startPort + maxAttempts - 1}.`);
        }
        const timestamp = now();
        const entry = existing ?? { projectCwd, instanceKey: acquireOptions.instanceKey, port: selectedPort, updatedAt: timestamp };
        entry.port = selectedPort;
        entry.updatedAt = timestamp;
        if (!existing) registry.allocations.push(entry);
        registry.leases = registry.leases.filter((lease) => leaseKey(lease.projectCwd, lease.instanceKey) !== key);
        const lease = { projectCwd, instanceKey: acquireOptions.instanceKey, port: selectedPort, pid, acquiredAt: timestamp, expiresAt: timestamp + (acquireOptions.leaseTtlMs ?? 30 * 60 * 1000), ownerToken };
        registry.leases.push(lease);
        await writeRegistry(registry);
        return lease;
      });
    },
    async renewPort(renewOptions) {
      const projectCwd = canonicalizeLocalghostProjectCwd(renewOptions.projectCwd ?? cwd);
      return withLock(async (registry) => {
        const lease = registry.leases.find((candidate) =>
          candidate.projectCwd === projectCwd &&
          candidate.instanceKey === renewOptions.instanceKey &&
          candidate.ownerToken === ownerToken
        );
        if (!lease || lease.expiresAt <= now() || !isRunning(lease.pid)) return undefined;
        lease.expiresAt = now() + (renewOptions.leaseTtlMs ?? 30 * 60 * 1000);
        await writeRegistry(registry);
        return lease;
      });
    },
    async releasePort(releaseOptions) {
      const projectCwd = canonicalizeLocalghostProjectCwd(releaseOptions.projectCwd ?? cwd);
      return withLock(async (registry) => {
        const key = leaseKey(projectCwd, releaseOptions.instanceKey);
        const before = registry.leases.length;
        registry.leases = registry.leases.filter((lease) => leaseKey(lease.projectCwd, lease.instanceKey) !== key || lease.ownerToken !== ownerToken);
        if (registry.leases.length !== before) await writeRegistry(registry);
        return registry.leases.length !== before;
      });
    }
  };
}
