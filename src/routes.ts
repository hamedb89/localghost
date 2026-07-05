import type { DevHostEntry } from "./parse.js";

export type DomainRoute = {
  host: string;
  port: number;
  url: string;
  upstream: string;
};

export type DomainRouteOptions = {
  https?: boolean;
};

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
