export type DevHostEntry = {
  host: string;
  port: number;
  target: string;
};

const HOST_PATTERN = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.?$/i;

export function parseDevHosts(input: string, fileName = ".localghost"): DevHostEntry[] {
  const entries: DevHostEntry[] = [];

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*/, "").trim();

    if (!line) {
      return;
    }

    const parts = line.split(/\s+/);
    const host = parts[0];
    const portRaw = parts[1];

    if (!host || !portRaw || parts.length > 2) {
      throw new Error(`Invalid ${fileName} line ${index + 1}: "${rawLine}"`);
    }

    if (!HOST_PATTERN.test(host)) {
      throw new Error(`Invalid host on line ${index + 1}: "${host}"`);
    }

    const port = Number(portRaw);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port on line ${index + 1}: "${portRaw}"`);
    }

    entries.push({
      host: host.toLowerCase().replace(/\.$/, ""),
      port,
      target: `127.0.0.1:${port}`
    });
  });

  return entries;
}

export function findLocalMdnsHosts(entries: DevHostEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.host).filter((host) => host.endsWith(".local")))];
}
