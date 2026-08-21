import { createLocalghostRegistry, type LocalghostLease } from "./registry.js";

export type LocalghostTestSessionOptions = {
  cwd?: string;
  instanceKey: string;
  services: Record<string, { startPort: number; maxAttempts?: number; host?: string }>;
  leaseTtlMs?: number;
};

export type LocalghostTestSession = {
  instanceKey: string;
  ports: Record<string, number>;
  leases: LocalghostLease[];
  renew: () => Promise<void>;
  startHeartbeat: (intervalMs?: number) => NodeJS.Timeout;
  release: () => Promise<void>;
};

export async function createLocalghostTestSession(options: LocalghostTestSessionOptions): Promise<LocalghostTestSession> {
  if (!options.instanceKey) throw new Error("instanceKey is required");
  const registry = createLocalghostRegistry(options.cwd ? { cwd: options.cwd } : {});
  const leases: LocalghostLease[] = [];
  const ports: Record<string, number> = {};
  const leaseTtlMs = options.leaseTtlMs ?? 30 * 60 * 1000;
  if (!Number.isFinite(leaseTtlMs) || leaseTtlMs < 1_000) throw new Error("leaseTtlMs must be at least 1000 milliseconds.");

  try {
    for (const [name, service] of Object.entries(options.services)) {
      const lease = await registry.acquirePort({
        ...(options.cwd ? { projectCwd: options.cwd } : {}),
        instanceKey: `test:${options.instanceKey}:${name}`,
        startPort: service.startPort,
        ...(service.maxAttempts !== undefined ? { maxAttempts: service.maxAttempts } : {}),
        ...(service.host !== undefined ? { host: service.host } : {}),
        leaseTtlMs,
        reservedPorts: Object.values(ports)
      });
      leases.push(lease);
      ports[name] = lease.port;
    }
  } catch (error) {
    await Promise.all(leases.map((lease) => registry.releasePort({ projectCwd: lease.projectCwd, instanceKey: lease.instanceKey })));
    throw error;
  }

  let released = false;
  const renew = async () => {
    if (released) return;
    await Promise.all(leases.map(async (lease) => {
      const renewed = await registry.renewPort({ projectCwd: lease.projectCwd, instanceKey: lease.instanceKey, leaseTtlMs });
      if (!renewed) throw new Error(`Localghost test lease expired: ${lease.instanceKey}`);
    }));
  };

  return {
    instanceKey: options.instanceKey,
    ports,
    leases,
    renew,
    startHeartbeat(intervalMs = Math.max(1_000, Math.floor(leaseTtlMs / 3))) {
      if (!Number.isFinite(intervalMs) || intervalMs < 1_000) throw new Error("Heartbeat interval must be at least 1000 milliseconds.");
      const timer = setInterval(() => void renew().catch(() => undefined), intervalMs);
      timer.unref();
      return timer;
    },
    async release() {
      if (released) return;
      released = true;
      await Promise.all(leases.map((lease) => registry.releasePort({ projectCwd: lease.projectCwd, instanceKey: lease.instanceKey })));
    }
  };
}
