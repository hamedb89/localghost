import { resolveGhostTunnelIpRedirect } from "./ghost-transport.js";
import {
  createGhostTunnelQueuedRequest,
  createRedisGhostTunnelStoreFromEnv,
  decodeGhostTunnelBody,
  type GhostTunnelQueuedResponse,
  type GhostTunnelStore,
  type GhostTunnelStoreEnv
} from "./ghost-tunnel-store.js";
import {
  renderGhostTunnelRelayOfflineResponse,
  renderGhostTunnelRouteMissingResponse,
  resolveGhostTunnelRequest
} from "./ghost-request.js";
import { stripRelayForwardHeaders } from "./relay.js";

export type VercelGhostTunnelRequestLike = {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | Uint8Array | string>;
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
  ipSigningSecret?: string;
  tunnelStore?: GhostTunnelStore;
  tunnelEnv?: GhostTunnelStoreEnv;
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

function getTrustedRequestUrl(request: VercelGhostTunnelRequestLike, host: string, protocol: "http" | "https") {
  return new URL(request.url ?? "/", `${protocol}://${host}`).toString();
}

function getTunnelRequestPath(request: VercelGhostTunnelRequestLike) {
  const url = new URL(request.url ?? "/", "http://localghost.invalid");
  return `${url.pathname}${url.search}`;
}

function normalizeRequestHeaders(headers: Record<string, string | string[] | undefined>) {
  const stripped = stripRelayForwardHeaders(headers);
  return Object.fromEntries(Object.entries(stripped).map(([name, value]) => [
    name,
    Array.isArray(value) ? value.join(", ") : value
  ]));
}

function getTunnelStore(
  options: CreateVercelGhostTunnelHandlerOptions,
  namespace: string
) {
  return options.tunnelStore ?? createRedisGhostTunnelStoreFromEnv({
    ...(options.tunnelEnv ? { env: options.tunnelEnv } : {}),
    namespace
  });
}

async function readRequestBody(request: VercelGhostTunnelRequestLike, maxBytes: number) {
  if (!request[Symbol.asyncIterator]) return undefined;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer | Uint8Array | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) {
      throw new Error(`Ghost Tunnel request exceeded ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
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

function renderGhostTunnelIpRedirectResponse(url: string) {
  return {
    status: 307,
    headers: {
      location: url,
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-localghost-relay": "ip"
    },
    body: [
      "<!doctype html>",
      "<html>",
      "<head><meta charset=\"utf-8\"><title>Redirecting to local preview</title></head>",
      "<body>",
      `<p>Redirecting to <a href="${url}">${url}</a>.</p>`,
      "</body>",
      "</html>"
    ].join("")
  };
}

function renderGhostTunnelTransportRejectedResponse(message: string, status = 400) {
  return {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-localghost-relay": "rejected"
    },
    body: [
      "<!doctype html>",
      "<html>",
      "<head><meta charset=\"utf-8\"><title>Ghost Tunnel transport rejected</title></head>",
      "<body>",
      "<h1>Ghost Tunnel transport rejected</h1>",
      `<p>${message}</p>`,
      "</body>",
      "</html>"
    ].join("")
  };
}

function renderGhostTunnelTunnelTimeoutResponse() {
  return {
    status: 504,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-localghost-relay": "timeout"
    },
    body: [
      "<!doctype html>",
      "<html>",
      "<head><meta charset=\"utf-8\"><title>Ghost Tunnel timed out</title></head>",
      "<body>",
      "<h1>Ghost Tunnel timed out</h1>",
      "<p>The deployed handler did not receive a local response before the request window closed.</p>",
      "</body>",
      "</html>"
    ].join("")
  };
}

function renderGhostTunnelQueuedResponse(response: GhostTunnelQueuedResponse) {
  const body = decodeGhostTunnelBody(response.bodyBase64)?.toString() ?? "";
  return {
    status: response.status,
    headers: {
      ...response.headers,
      "x-localghost-relay": response.error ? "target-error" : "tunnel"
    },
    body
  };
}

async function waitForTunnelResponse(input: {
  store: GhostTunnelStore;
  requestId: string;
  waitMs: number;
  pollIntervalMs: number;
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < input.waitMs) {
    const response = await input.store.readResponse(input.requestId);
    if (response) {
      await input.store.cleanup(input.requestId);
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
  return null;
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
    const protocol = getTrustedProtocol(request);

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
        protocol,
        ...(typeof authenticated === "boolean" ? { authenticated } : {})
      });

      if (!resolved.entry) {
        writeResponse(response, renderGhostTunnelRouteMissingResponse(resolved));
        return;
      }

      if (resolved.ghostTunnel.transport.kind === "ip") {
        if (!options.ipSigningSecret) {
          writeResponse(response, renderGhostTunnelTransportRejectedResponse("Ghost Tunnel IP transport requires ipSigningSecret in the deployed handler.", 500));
          return;
        }

        try {
          const redirect = resolveGhostTunnelIpRedirect({
            requestUrl: getTrustedRequestUrl(request, host, protocol),
            host: resolved.route.host,
            entryPort: resolved.entry.port,
            signingSecret: options.ipSigningSecret,
            transport: resolved.ghostTunnel.transport
          });
          writeResponse(response, renderGhostTunnelIpRedirectResponse(redirect.url));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = /expired/i.test(message) ? 410 : 400;
          writeResponse(response, renderGhostTunnelTransportRejectedResponse(message, status));
        }
        return;
      }

      if (resolved.ghostTunnel.transport.kind === "tunnel") {
        const transport = resolved.ghostTunnel.transport;
        const store = getTunnelStore(options, transport.store.namespace);
        const route = await store.getRoute(resolved.route.host);
        if (!route) {
          writeResponse(response, renderGhostTunnelRelayOfflineResponse(resolved));
          return;
        }

        try {
          const requestBody = await readRequestBody(request, transport.maxRequestBodyBytes);
          const queuedRequest = createGhostTunnelQueuedRequest({
            host: resolved.route.host,
            method: request.method ?? "GET",
            path: getTunnelRequestPath(request),
            headers: normalizeRequestHeaders(request.headers),
            ...(requestBody ? { body: requestBody } : {}),
            ttlSeconds: transport.requestTtlSeconds
          });
          await store.enqueueRequest(queuedRequest, transport.requestTtlSeconds);
          const tunnelResponse = await waitForTunnelResponse({
            store,
            requestId: queuedRequest.id,
            waitMs: transport.waitMs,
            pollIntervalMs: transport.pollIntervalMs
          });

          writeResponse(response, tunnelResponse
            ? renderGhostTunnelQueuedResponse(tunnelResponse)
            : renderGhostTunnelTunnelTimeoutResponse());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          writeResponse(response, renderGhostTunnelTransportRejectedResponse(message, 400));
        }
        return;
      }

      writeResponse(response, renderGhostTunnelRelayOfflineResponse(resolved));
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
