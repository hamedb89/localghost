import { D as DevHostEntry, R as ReadDevHostsOptions, C as ConfigPattern } from './config-Cde1Bich.js';
export { L as LOCALGHOST_CONFIG_FILE, a as ResolvedDevHostsPath, f as findLocalMdnsHosts, g as getConfigFileCandidates, b as getDevHostsPath, c as getProjectName, p as parseDevHosts, r as readDevHosts, d as resolveDevHostsPath, s as sanitizeProjectName } from './config-Cde1Bich.js';
import * as execa from 'execa';

declare const LOCALGHOST_ACTIVITY_VERSION = 1;
type LocalghostRunMode = "dev" | "run";
type LocalghostRunRecord = {
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
type LocalghostActivity = {
    version: typeof LOCALGHOST_ACTIVITY_VERSION;
    runs: LocalghostRunRecord[];
};
type RegisterLocalghostRunInput = Omit<LocalghostRunRecord, "id" | "pid" | "startedAt" | "updatedAt"> & {
    id?: string;
    pid?: number;
    startedAt?: string;
};
declare function getLocalghostActivityPath(env?: NodeJS.ProcessEnv): string;
declare function isProcessRunning(pid: number): boolean;
declare function readLocalghostActivity(path?: string): LocalghostActivity;
declare function writeLocalghostActivity(activity: LocalghostActivity, path?: string): string;
declare function pruneLocalghostActivity(path?: string): {
    path: string;
    pruned: boolean;
    runs: LocalghostRunRecord[];
};
declare function listLocalghostRuns(path?: string): LocalghostRunRecord[];
declare function registerLocalghostRun(input: RegisterLocalghostRunInput, path?: string): LocalghostRunRecord;
declare function unregisterLocalghostRun(id: string, path?: string): void;

type CaddyModeOptions = {
    https?: boolean;
};
declare function getCaddyfilePath(cwd?: string): string;
declare function renderCaddyfile(entries: DevHostEntry[], options?: CaddyModeOptions): string;
declare function writeCaddyfile(entries: DevHostEntry[], cwd?: string, options?: CaddyModeOptions): Promise<string>;
declare function validateCaddyfile(path: string): Promise<void>;
declare function runCaddy(path: string): Promise<void>;
declare function startCaddy(path: string): execa.ResultPromise<{
    cwd: string;
    stdio: "inherit";
}>;
declare function trustCaddy(path: string): Promise<void>;

type LocalghostContextOptions = {
    cwd?: string;
    project?: string;
    localghostConfig?: string | false;
    fileName?: string;
    configFiles?: string[];
    configPattern?: ConfigPattern;
    port?: number;
    https?: boolean;
    bindHost?: string | boolean;
    primaryHost?: string;
    dynamicPort?: boolean;
    wwwAlias?: boolean;
};
type LocalghostContext = {
    cwd: string;
    projectName: string;
    readOptions: ReadDevHostsOptions;
    configPath: string;
    configFileName: string;
    configEntries: DevHostEntry[];
    entries: DevHostEntry[];
    hosts: string[];
    requestedPort: number;
    port: number;
    dynamicPort: boolean;
    bindHost: string | boolean;
    primaryHost: string;
    https: boolean;
    wwwAlias: boolean;
    projectConfigPath?: string;
};
declare function defineLocalghostConfig<T extends LocalghostContextOptions>(config: T): T;
declare function resolveLocalghostContext(options?: LocalghostContextOptions): Promise<LocalghostContext>;

type DoctorResult = {
    ok: boolean;
    caddy: {
        found: boolean;
        version?: string;
        installHint: string;
    };
};
declare function checkCaddy(): Promise<DoctorResult["caddy"]>;
declare function runDoctor(): Promise<DoctorResult>;

type LocalghostEnvironment = NodeJS.ProcessEnv;
declare function getProductionReason(env?: LocalghostEnvironment): "LOCALGHOST_ENV=production" | "NODE_ENV=production" | "VERCEL_ENV=production" | "NETLIFY=true and CONTEXT=production" | "CF_PAGES_BRANCH matches CF_PAGES_PRODUCTION_BRANCH" | null;
declare function isProductionLike(env?: LocalghostEnvironment): boolean;
declare function assertLocalDevelopment(command: string, env?: LocalghostEnvironment): void;
declare function getProductionEnvKeys(): readonly ["NODE_ENV", "VERCEL_ENV", "NETLIFY", "CF_PAGES_BRANCH", "LOCALGHOST_ENV"];

type UpdateSystemHostsResult = {
    changed: boolean;
    hostsPath: string;
    tempPath?: string;
};
type RemoveSystemHostsResult = UpdateSystemHostsResult & {
    removed: boolean;
};
declare function getSystemHostsPath(): "C:\\Windows\\System32\\drivers\\etc\\hosts" | "/etc/hosts";
declare function renderHostsBlock(projectName: string, entries: DevHostEntry[]): string;
declare function upsertManagedBlock(existing: string, projectName: string, block: string): string;
declare function removeManagedBlock(existing: string, projectName: string): string;
declare function updateSystemHosts(projectName: string, entries: DevHostEntry[]): Promise<UpdateSystemHostsResult>;
declare function removeSystemHosts(projectName: string): Promise<RemoveSystemHostsResult>;

type PackageManager = "npm" | "yarn" | "pnpm";
type InitOptions = {
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
type InitResult = {
    configPath: string;
    configCreated: boolean;
    packageJsonPath?: string;
    packageJsonChanged: boolean;
    packageManager: PackageManager;
    nextSteps: string[];
};
declare function detectPackageManager(cwd?: string): PackageManager;
declare function packageRunCommand(packageManager: PackageManager, script: string): string;
declare function packageAddCommand(packageManager: PackageManager, packageName?: string): string;
declare function initLocalghost(options?: InitOptions): InitResult;

type FindAvailablePortOptions = {
    host?: string;
    maxAttempts?: number;
};
declare function isPortAvailable(port: number, host?: string): Promise<boolean>;
declare function findAvailablePort(startPort: number, options?: FindAvailablePortOptions): Promise<number>;

type DomainRoute = {
    host: string;
    port: number;
    url: string;
    upstream: string;
};
type DomainRouteOptions = {
    https?: boolean;
};
declare function getDomainRoutes(entries: DevHostEntry[], options?: DomainRouteOptions): DomainRoute[];
declare function formatDomainRoutes(entries: DevHostEntry[], options?: DomainRouteOptions): string;

declare const LOCALGHOST_STATE_FILE = "ops/local/localghost-state.json";
type LocalghostStateAction = "setup" | "teardown";
type LocalghostState = {
    version: 1;
    action: LocalghostStateAction;
    updatedAt: string;
    projectName: string;
    cwd: string;
    configPath?: string;
    hostsPath?: string;
    hostsChanged?: boolean;
    hostsTempPath?: string;
    caddyfilePath?: string;
    caddyfileRemoved?: boolean;
    caddyHttps?: boolean;
    caddyTrustedAt?: string;
    caddyTrustPromptedAt?: string;
    entries?: DevHostEntry[];
};
type WriteLocalghostStateInput = Omit<LocalghostState, "version" | "updatedAt">;
declare function getLocalghostStatePath(cwd?: string): string;
declare function readLocalghostState(cwd?: string): LocalghostState | null;
declare function writeLocalghostState(cwd: string, state: WriteLocalghostStateInput): string;
declare function patchLocalghostState(cwd: string, patch: Partial<WriteLocalghostStateInput>): string | null;

declare const LOCALGHOST_PACKAGE_NAME = "@hamedb89/localghost";
declare const LOCALGHOST_VERSION = "0.1.7";
declare const UPDATE_CHECK_CACHE_TTL_MS: number;
declare const UPDATE_CHECK_NOTIFY_TTL_MS: number;
declare const UPDATE_CHECK_TIMEOUT_MS = 900;
type UpdateCheckCache = {
    checkedAt: string;
    latestVersion?: string;
    notifiedVersion?: string;
    notifiedAt?: string;
};
type UpdateCheckResult = {
    currentVersion: string;
    packageName: string;
    latestVersion?: string;
    updateAvailable: boolean;
    source: "cache" | "registry" | "disabled" | "error";
    error?: string;
};
declare function isUpdateCheckDisabled(env?: NodeJS.ProcessEnv): boolean;
declare function getUpdateCheckCachePath(env?: NodeJS.ProcessEnv): string;
declare function compareVersions(a: string, b: string): number;
declare function isNewerVersion(candidate: string | undefined, current?: string): boolean;
declare function checkForUpdate(options?: {
    force?: boolean;
    packageName?: string;
    currentVersion?: string;
    timeoutMs?: number;
    cachePath?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<UpdateCheckResult>;
declare function formatUpdateMessage(result: UpdateCheckResult): string | null;
declare function shouldNotifyAboutUpdate(result: UpdateCheckResult, cachePath?: string, now?: number): boolean;
declare function markUpdateNotified(result: UpdateCheckResult, cachePath?: string): void;
declare function maybeNotifyAboutUpdate(options?: {
    disabled?: boolean;
}): Promise<void>;

export { type CaddyModeOptions, ConfigPattern, DevHostEntry, type DoctorResult, type DomainRoute, type DomainRouteOptions, type FindAvailablePortOptions, type InitOptions, type InitResult, LOCALGHOST_ACTIVITY_VERSION, LOCALGHOST_PACKAGE_NAME, LOCALGHOST_STATE_FILE, LOCALGHOST_VERSION, type LocalghostActivity, type LocalghostContext, type LocalghostContextOptions, type LocalghostEnvironment, type LocalghostRunMode, type LocalghostRunRecord, type LocalghostState, type LocalghostStateAction, type PackageManager, ReadDevHostsOptions, type RegisterLocalghostRunInput, type RemoveSystemHostsResult, UPDATE_CHECK_CACHE_TTL_MS, UPDATE_CHECK_NOTIFY_TTL_MS, UPDATE_CHECK_TIMEOUT_MS, type UpdateCheckCache, type UpdateCheckResult, type UpdateSystemHostsResult, type WriteLocalghostStateInput, assertLocalDevelopment, checkCaddy, checkForUpdate, compareVersions, defineLocalghostConfig, detectPackageManager, findAvailablePort, formatDomainRoutes, formatUpdateMessage, getCaddyfilePath, getDomainRoutes, getLocalghostActivityPath, getLocalghostStatePath, getProductionEnvKeys, getProductionReason, getSystemHostsPath, getUpdateCheckCachePath, initLocalghost, isNewerVersion, isPortAvailable, isProcessRunning, isProductionLike, isUpdateCheckDisabled, listLocalghostRuns, markUpdateNotified, maybeNotifyAboutUpdate, packageAddCommand, packageRunCommand, patchLocalghostState, pruneLocalghostActivity, readLocalghostActivity, readLocalghostState, registerLocalghostRun, removeManagedBlock, removeSystemHosts, renderCaddyfile, renderHostsBlock, resolveLocalghostContext, runCaddy, runDoctor, shouldNotifyAboutUpdate, startCaddy, trustCaddy, unregisterLocalghostRun, updateSystemHosts, upsertManagedBlock, validateCaddyfile, writeCaddyfile, writeLocalghostActivity, writeLocalghostState };
