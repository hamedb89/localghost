import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const LOCALGHOST_PACKAGE_NAME = "@hamedb89/localghost";
export const LOCALGHOST_VERSION = "0.1.8";
export const UPDATE_CHECK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_NOTIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 900;

export type UpdateCheckCache = {
  checkedAt: string;
  latestVersion?: string;
  notifiedVersion?: string;
  notifiedAt?: string;
};

export type UpdateCheckResult = {
  currentVersion: string;
  packageName: string;
  latestVersion?: string;
  updateAvailable: boolean;
  source: "cache" | "registry" | "disabled" | "error";
  error?: string;
};

type RegistryPackageResponse = {
  "dist-tags"?: {
    latest?: unknown;
  };
};

function truthyEnv(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

export function isUpdateCheckDisabled(env: NodeJS.ProcessEnv = process.env) {
  return truthyEnv(env.LOCALGHOST_NO_UPDATE_CHECK);
}

export function getUpdateCheckCachePath(env: NodeJS.ProcessEnv = process.env) {
  if (env.LOCALGHOST_UPDATE_CHECK_CACHE) return env.LOCALGHOST_UPDATE_CHECK_CACHE;

  const cacheRoot = env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(cacheRoot, "localghost", "update-check.json");
}

function readCache(path = getUpdateCheckCachePath()): UpdateCheckCache | null {
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, "utf8")) as UpdateCheckCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCheckCache, path = getUpdateCheckCachePath()) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // Update checks should never make the real command fail.
  }
}

function ageMs(date: string | undefined, now = Date.now()) {
  if (!date) return Number.POSITIVE_INFINITY;
  const time = Date.parse(date);
  return Number.isFinite(time) ? now - time : Number.POSITIVE_INFINITY;
}

function isCacheFresh(cache: UpdateCheckCache | null, ttlMs: number, now = Date.now()) {
  return Boolean(cache?.latestVersion && ageMs(cache.checkedAt, now) >= 0 && ageMs(cache.checkedAt, now) < ttlMs);
}

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
};

function parseVersion(version: string): ParsedVersion | null {
  const match = version.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] ? { prerelease: match[4] } : {})
  };
}

export function compareVersions(a: string, b: string) {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (!left || !right) return a.localeCompare(b);

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

export function isNewerVersion(candidate: string | undefined, current = LOCALGHOST_VERSION) {
  return Boolean(candidate && compareVersions(candidate, current) > 0);
}

async function fetchLatestVersion(packageName: string, timeoutMs: number) {
  const encodedName = packageName.startsWith("@") ? `@${packageName.slice(1).replace("/", "%2f")}` : packageName;
  const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/vnd.npm.install-v1+json"
    }
  });

  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);

  const data = (await response.json()) as RegistryPackageResponse;
  const latest = data["dist-tags"]?.latest;
  if (typeof latest !== "string" || latest.length === 0) throw new Error("npm registry response did not include latest dist-tag");

  return latest;
}

export async function checkForUpdate(options: {
  force?: boolean;
  packageName?: string;
  currentVersion?: string;
  timeoutMs?: number;
  cachePath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<UpdateCheckResult> {
  const env = options.env ?? process.env;
  const packageName = options.packageName ?? LOCALGHOST_PACKAGE_NAME;
  const currentVersion = options.currentVersion ?? LOCALGHOST_VERSION;
  const cachePath = options.cachePath ?? getUpdateCheckCachePath(env);

  if (!options.force && isUpdateCheckDisabled(env)) {
    return {
      currentVersion,
      packageName,
      updateAvailable: false,
      source: "disabled"
    };
  }

  const cache = readCache(cachePath);
  if (!options.force && isCacheFresh(cache, UPDATE_CHECK_CACHE_TTL_MS)) {
    const latestVersion = cache?.latestVersion;
    return {
      currentVersion,
      packageName,
      ...(latestVersion ? { latestVersion } : {}),
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      source: "cache"
    };
  }

  try {
    const latestVersion = await fetchLatestVersion(packageName, options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS);
    writeCache({ checkedAt: new Date().toISOString(), latestVersion }, cachePath);

    return {
      currentVersion,
      packageName,
      latestVersion,
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      source: "registry"
    };
  } catch (error) {
    const latestVersion = cache?.latestVersion;
    return {
      currentVersion,
      packageName,
      ...(latestVersion ? { latestVersion } : {}),
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      source: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function formatUpdateMessage(result: UpdateCheckResult) {
  if (!result.updateAvailable || !result.latestVersion) return null;

  return [
    `localghost ${result.latestVersion} is available. Current: ${result.currentVersion}`,
    `Update with: npm i -g ${result.packageName}@latest`
  ].join("\n");
}

export function shouldNotifyAboutUpdate(result: UpdateCheckResult, cachePath = getUpdateCheckCachePath(), now = Date.now()) {
  if (!result.updateAvailable || !result.latestVersion) return false;

  const cache = readCache(cachePath);
  if (cache?.notifiedVersion !== result.latestVersion) return true;

  return ageMs(cache.notifiedAt, now) >= UPDATE_CHECK_NOTIFY_TTL_MS;
}

export function markUpdateNotified(result: UpdateCheckResult, cachePath = getUpdateCheckCachePath()) {
  if (!result.latestVersion) return;

  const cache = readCache(cachePath) ?? { checkedAt: new Date().toISOString() };
  writeCache(
    {
      ...cache,
      latestVersion: result.latestVersion,
      notifiedVersion: result.latestVersion,
      notifiedAt: new Date().toISOString()
    },
    cachePath
  );
}

export async function maybeNotifyAboutUpdate(options: { disabled?: boolean } = {}) {
  if (options.disabled) return;

  const cachePath = getUpdateCheckCachePath();
  const result = await checkForUpdate({ cachePath });
  if (!shouldNotifyAboutUpdate(result, cachePath)) return;

  const message = formatUpdateMessage(result);
  if (!message) return;

  console.warn(`\n${message}`);
  markUpdateNotified(result, cachePath);
}
