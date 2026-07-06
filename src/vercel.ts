import {
  renderGhostTunnelRelayOfflineResponse,
  renderGhostTunnelRouteMissingResponse,
  resolveGhostTunnelRequest
} from "./ghost-request.js";

export type VercelGhostTunnelRequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

export type VercelGhostTunnelResponseLike = {
  setHeader(name: string, value: string): void;
  end(body: string): void;
  statusCode: number;
};

export type CreateVercelGhostTunnelHandlerOptions = {
  cwd?: string;
  domain: string;
  localghostConfig?: string | false;
  ghostTunnelFile?: string;
  authenticated?: boolean | ((request: VercelGhostTunnelRequestLike) => boolean | Promise<boolean>);
};

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getTrustedProtocol(request: VercelGhostTunnelRequestLike): "http" | "https" {
  const forwarded = getHeaderValue(request.headers["x-forwarded-proto"]).split(",")[0]?.trim().toLowerCase();
  return forwarded === "http" ? "http" : "https";
}

function writeResponse(
  response: VercelGhostTunnelResponseLike,
  payload: { status: number; headers: Record<string, string>; body: string }
) {
  response.statusCode = payload.status;
  for (const [name, value] of Object.entries(payload.headers)) {
    response.setHeader(name, value);
  }
  response.end(payload.body);
}

async function resolveAuthenticatedState(
  input: CreateVercelGhostTunnelHandlerOptions["authenticated"],
  request: VercelGhostTunnelRequestLike
) {
  if (typeof input === "function") {
    return await input(request);
  }

  return input;
}

export function createVercelGhostTunnelHandler(options: CreateVercelGhostTunnelHandlerOptions) {
  return async function handler(request: VercelGhostTunnelRequestLike, response: VercelGhostTunnelResponseLike) {
    const host = getHeaderValue(request.headers.host);

    try {
      const authenticated = typeof options.authenticated !== "undefined"
        ? await resolveAuthenticatedState(options.authenticated, request)
        : undefined;
      const resolved = await resolveGhostTunnelRequest({
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(typeof options.localghostConfig !== "undefined" ? { localghostConfig: options.localghostConfig } : {}),
        ...(options.ghostTunnelFile ? { ghostTunnelFile: options.ghostTunnelFile } : {}),
        host,
        domain: options.domain,
        protocol: getTrustedProtocol(request),
        ...(typeof authenticated === "boolean" ? { authenticated } : {})
      });

      writeResponse(
        response,
        resolved.entry
          ? renderGhostTunnelRelayOfflineResponse(resolved)
          : renderGhostTunnelRouteMissingResponse(resolved)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeResponse(response, {
        status: /authenticated/i.test(message) ? 401 : 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-localghost-relay": "rejected"
        },
        body: message
      });
    }
  };
}
