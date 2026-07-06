import { readLocalghostProjectConfig } from "./context.js";
import { findGhostTunnelEntry, resolveGhostTunnelPath, type ReadGhostTunnelOptions } from "./ghost-file.js";
import { assertRelayLocalTarget, renderRelayOfflineResponse, type RelayLocalTarget } from "./relay.js";
import { assertSecureGhostTunnelRequest, resolveGhostTunnelConfig, type GhostTunnelConfig, type GhostTunnelRoute } from "./tunnel.js";
import type { DevHostEntry } from "./parse.js";

export type ResolveGhostTunnelRequestInput = {
  cwd?: string;
  host: string;
  domain: string;
  protocol: "http" | "https";
  authenticated?: boolean;
  localghostConfig?: string | false;
  ghostTunnelFile?: string;
};

export type ResolvedGhostTunnelRequest = {
  route: GhostTunnelRoute;
  ghostTunnel: GhostTunnelConfig;
  entry?: DevHostEntry;
  target?: Required<RelayLocalTarget>;
  projectConfigPath?: string;
  ghostTunnelPath?: string;
};

export type GhostTunnelHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

function getGhostTunnelReadOptions(input: ResolveGhostTunnelRequestInput): ReadGhostTunnelOptions {
  return {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.ghostTunnelFile ? { fileName: input.ghostTunnelFile } : {})
  };
}

export async function resolveGhostTunnelRequest(input: ResolveGhostTunnelRequestInput): Promise<ResolvedGhostTunnelRequest> {
  const projectConfig = await readLocalghostProjectConfig({
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(typeof input.localghostConfig !== "undefined" ? { configFile: input.localghostConfig } : {})
  });
  const ghostTunnel = resolveGhostTunnelConfig(projectConfig.config.ghostTunnel, {
    domain: input.domain
  });
  const route = assertSecureGhostTunnelRequest({
    host: input.host,
    domain: input.domain,
    protocol: input.protocol,
    ghostTunnel,
    ...(typeof input.authenticated === "boolean" ? { authenticated: input.authenticated } : {})
  });
  const ghostTunnelPath = resolveGhostTunnelPath(getGhostTunnelReadOptions(input));
  const entry = findGhostTunnelEntry(route.host, getGhostTunnelReadOptions(input));
  const target = entry ? assertRelayLocalTarget({ host: "127.0.0.1", port: entry.port }) : undefined;

  return {
    route,
    ghostTunnel,
    ...(entry ? { entry } : {}),
    ...(target ? { target } : {}),
    ...(projectConfig.path ? { projectConfigPath: projectConfig.path } : {}),
    ...(ghostTunnelPath.exists ? { ghostTunnelPath: ghostTunnelPath.path } : {})
  };
}

export function renderGhostTunnelRouteMissingResponse(resolved: Pick<ResolvedGhostTunnelRequest, "route">): GhostTunnelHttpResponse {
  return {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-localghost-relay": "missing",
      "x-localghost-route": resolved.route.slug
    },
    body: [
      "<!doctype html>",
      "<html>",
      "<head><meta charset=\"utf-8\"><title>Ghost Tunnel route not configured</title></head>",
      "<body>",
      "<h1>Ghost Tunnel route not configured</h1>",
      `<p>The wildcard host <code>${resolved.route.host}</code> reached the deployed Ghost Tunnel handler, but no exact <code>.ghosttunnel</code> entry matched it.</p>`,
      "</body>",
      "</html>"
    ].join("")
  };
}

export function renderGhostTunnelRelayOfflineResponse(
  resolved: Pick<ResolvedGhostTunnelRequest, "route"> & Partial<Pick<ResolvedGhostTunnelRequest, "entry">>
): GhostTunnelHttpResponse {
  const response = renderRelayOfflineResponse();

  return {
    ...response,
    headers: {
      ...response.headers,
      "x-localghost-relay": "offline",
      "x-localghost-route": resolved.route.slug,
      "x-localghost-entry": resolved.entry ? "configured" : "missing"
    },
    body: [
      "<!doctype html>",
      "<html>",
      "<head><meta charset=\"utf-8\"><title>Ghost Tunnel offline</title></head>",
      "<body>",
      "<h1>Ghost Tunnel offline</h1>",
      `<p>The wildcard host <code>${resolved.route.host}</code> reached the deployed Ghost Tunnel handler.</p>`,
      resolved.entry
        ? "<p>The route is configured locally, but no active local relay connection is available yet.</p>"
        : "<p>No exact <code>.ghosttunnel</code> entry matched this host.</p>",
      "</body>",
      "</html>"
    ].join("")
  };
}
