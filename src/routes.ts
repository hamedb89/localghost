import type { DevHostEntry } from "./parse.js";
import type { GhostTunnelConfig } from "./tunnel.js";

export type DomainRoute = {
  host: string;
  port: number;
  url: string;
  upstream: string;
};

export type DomainRouteOptions = {
  https?: boolean;
};

export type GhostTunnelFormatOptions = {
  color?: boolean;
  label?: "configured" | "expected" | "ready" | "running";
  verbose?: boolean;
};

const ansi = {
  cyan: "\u001b[36m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  reset: "\u001b[0m",
  yellow: "\u001b[33m"
};

function colorize(value: string, color: string, enabled: boolean) {
  return enabled ? `${color}${value}${ansi.reset}` : value;
}

function colorizeUrl(value: string, enabled: boolean) {
  if (!enabled) return value;
  return colorize(value.replace(/\*/g, `${ansi.yellow}*${ansi.cyan}`), ansi.cyan, enabled);
}

export function getDomainRoutes(entries: DevHostEntry[], options: DomainRouteOptions = {}): DomainRoute[] {
  const protocol = options.https === true ? "https" : "http";

  return [...entries]
    .sort((left, right) => left.host.localeCompare(right.host) || left.port - right.port)
    .map((entry) => ({
      host: entry.host,
      port: entry.port,
      url: `${protocol}://${entry.host}/`,
      upstream: `http://${entry.target}`
    }));
}

export function formatDomainRoutes(entries: DevHostEntry[], options: DomainRouteOptions = {}) {
  const routes = getDomainRoutes(entries, options);

  if (routes.length === 0) {
    return "localghost routes\n  no routes";
  }

  return [
    "localghost routes",
    ...routes.map((route) => `  ${route.url} -> ${route.upstream}`)
  ].join("\n");
}

export function formatGhostTunnel(config: GhostTunnelConfig, options: GhostTunnelFormatOptions = {}) {
  if (!config.enabled) return null;

  const color = options.color === true;
  const label = options.label ?? "expected";
  const labelColor = label === "running" ? ansi.green : ansi.dim;
  const lines = [
    "localghost ghost tunnel",
    `  mode: ${config.mode}`
  ];
  const urls = config.displayUrls.length > 0
    ? config.displayUrls
    : config.displayUrl
      ? [config.displayUrl]
      : [];

  if (urls.length === 0) {
    lines.push(`  ${label}: unavailable`);
  } else if (urls.length === 1) {
    lines.push(`  ${colorize(label, labelColor, color)}: ${colorizeUrl(urls[0]!, color)}`);
  } else {
    lines.push(`  ${colorize(label, labelColor, color)}:`);
    for (const url of urls) {
      lines.push(`    ${colorizeUrl(url, color)}`);
    }
  }

  if (options.verbose) {
    lines.push(`  domains: ${config.domains.length > 0 ? config.domains.join(", ") : "*"}`);
    lines.push(`  access: ${config.requireAuth ? "auth required" : "app decides"}`);
    lines.push(`  transport: ${config.requireHttps ? "https required" : "http allowed"}`);
  }

  return lines.join("\n");
}
