type DevHostEntry = {
    host: string;
    port: number;
    target: string;
};
declare function parseDevHosts(input: string, fileName?: string): DevHostEntry[];
declare function findLocalMdnsHosts(entries: DevHostEntry[]): string[];

declare const LOCALGHOST_CONFIG_FILE = ".localghost";
type ConfigPattern = string | RegExp;
type ReadDevHostsOptions = {
    cwd?: string;
    fileName?: string;
    configFiles?: string[];
    configPattern?: ConfigPattern;
};
type ResolvedDevHostsPath = {
    path: string;
    fileName: string;
    exists: boolean;
    searchedFiles: string[];
    configPattern?: ConfigPattern;
};
declare function getConfigFileCandidates(options?: ReadDevHostsOptions): string[];
declare function resolveDevHostsPath(options?: ReadDevHostsOptions): ResolvedDevHostsPath;
declare function getDevHostsPath(options?: ReadDevHostsOptions): string;
declare function readDevHosts(options?: ReadDevHostsOptions | string): DevHostEntry[];
declare function getProjectName(cwd?: string): string;
declare function sanitizeProjectName(value: string): string;

export { type ConfigPattern as C, type DevHostEntry as D, LOCALGHOST_CONFIG_FILE as L, type ReadDevHostsOptions as R, type ResolvedDevHostsPath as a, getDevHostsPath as b, getProjectName as c, resolveDevHostsPath as d, findLocalMdnsHosts as f, getConfigFileCandidates as g, parseDevHosts as p, readDevHosts as r, sanitizeProjectName as s };
