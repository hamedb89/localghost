import { randomUUID } from "node:crypto";
import { assertRelayLocalTarget, stripRelayForwardHeaders, type RelayLocalTarget } from "./relay.js";
import {
  createGhostTunnelRouteHeartbeat,
  decodeGhostTunnelBody,
  encodeGhostTunnelBody,
  type GhostTunnelQueuedRequest,
  type GhostTunnelQueuedResponse,
  type GhostTunnelStore
} from "./ghost-tunnel-store.js";
import type { DevHostEntry } from "./parse.js";

export type GhostTunnelAgentOptions = {
  entries: DevHostEntry[];
  store: GhostTunnelStore;
  agentId?: string;
  targetHost?: string;
  routeTtlSeconds?: number;
  requestTtlSeconds?: number;
  pollIntervalMs?: number;
  maxResponseBodyBytes?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  log?: (message: string) => void;
};

export type GhostTunnelAgent = {
  agentId: string;
  stop(): void;
  done: Promise<void>;
};

export type ServeGhostTunnelLocalRequestInput = {
  request: GhostTunnelQueuedRequest;
  target: Required<RelayLocalTarget>;
  maxResponseBodyBytes: number;
  fetch?: typeof fetch;
};

function isStopped(signal: AbortSignal | undefined, localSignal: AbortSignal) {
  return localSignal.aborted || signal?.aborted === true;
}

function wait(ms: number, signal: AbortSignal | undefined, localSignal: AbortSignal) {
  if (isStopped(signal, localSignal)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    const stop = () => {
      clearTimeout(timeout);
      resolve();
    };
    signal?.addEventListener("abort", stop, { once: true });
    localSignal.addEventListener("abort", stop, { once: true });
  });
}

function toHeaderRecord(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    result[name] = value;
  });
  return result;
}

function hasRequestBody(method: string) {
  return method !== "GET" && method !== "HEAD";
}

export async function serveGhostTunnelLocalRequest(input: ServeGhostTunnelLocalRequestInput): Promise<GhostTunnelQueuedResponse> {
  const fetchImpl = input.fetch ?? fetch;
  const localUrl = new URL(`${input.target.protocol}://${input.target.host}:${input.target.port}/`);
  const requestPath = new URL(input.request.path, "http://localghost.invalid");
  localUrl.pathname = requestPath.pathname;
  localUrl.search = requestPath.search;

  try {
    const body = hasRequestBody(input.request.method) ? decodeGhostTunnelBody(input.request.bodyBase64) : undefined;
    const response = await fetchImpl(localUrl, {
      method: input.request.method,
      headers: {
        ...stripRelayForwardHeaders(input.request.headers),
        "x-forwarded-host": input.request.host,
        "x-localghost-tunnel": "1"
      },
      ...(body ? { body } : {})
    });
    const responseBody = Buffer.from(await response.arrayBuffer());
    if (responseBody.byteLength > input.maxResponseBodyBytes) {
      throw new Error(`Ghost Tunnel response exceeded ${input.maxResponseBodyBytes} bytes.`);
    }

    return {
      id: input.request.id,
      status: response.status,
      headers: toHeaderRecord(response.headers),
      createdAt: new Date().toISOString(),
      ...(responseBody.byteLength > 0 ? { bodyBase64: encodeGhostTunnelBody(responseBody) } : {})
    };
  } catch (error) {
    return {
      id: input.request.id,
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      },
      createdAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      bodyBase64: encodeGhostTunnelBody("Ghost Tunnel local target failed.")
    };
  }
}

async function heartbeatRoutes(input: {
  entries: DevHostEntry[];
  store: GhostTunnelStore;
  agentId: string;
  targetHost: string;
  routeTtlSeconds: number;
}) {
  for (const entry of input.entries) {
    const target = assertRelayLocalTarget({ host: input.targetHost, port: entry.port });
    await input.store.heartbeatRoute(createGhostTunnelRouteHeartbeat({
      host: entry.host,
      agentId: input.agentId,
      target,
      ttlSeconds: input.routeTtlSeconds
    }), input.routeTtlSeconds);
  }
}

async function claimAndServe(input: {
  entry: DevHostEntry;
  store: GhostTunnelStore;
  targetHost: string;
  requestTtlSeconds: number;
  maxResponseBodyBytes: number;
  fetch?: typeof fetch;
}) {
  const request = await input.store.claimRequest(input.entry.host);
  if (!request) return false;

  const target = assertRelayLocalTarget({ host: input.targetHost, port: input.entry.port });
  const response = await serveGhostTunnelLocalRequest({
    request,
    target,
    maxResponseBodyBytes: input.maxResponseBodyBytes,
    ...(input.fetch ? { fetch: input.fetch } : {})
  });
  await input.store.writeResponse(response, input.requestTtlSeconds);
  return true;
}

export function startGhostTunnelAgent(options: GhostTunnelAgentOptions): GhostTunnelAgent {
  const controller = new AbortController();
  const localSignal = controller.signal;
  const signal = options.signal;
  const agentId = options.agentId ?? `localghost-${randomUUID()}`;
  const targetHost = options.targetHost ?? "127.0.0.1";
  const routeTtlSeconds = options.routeTtlSeconds ?? 30;
  const requestTtlSeconds = options.requestTtlSeconds ?? 60;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const maxResponseBodyBytes = options.maxResponseBodyBytes ?? 5 * 1024 * 1024;

  const done = (async () => {
    if (options.entries.length === 0) {
      throw new Error("Ghost Tunnel agent requires at least one .ghosttunnel entry.");
    }

    options.log?.(`localghost tunnel agent ${agentId}`);
    for (const entry of options.entries) {
      options.log?.(`  ${entry.host} -> ${targetHost}:${entry.port}`);
    }

    let lastHeartbeat = 0;
    while (!isStopped(signal, localSignal)) {
      const now = Date.now();
      if (now - lastHeartbeat >= Math.max(1000, Math.floor(routeTtlSeconds * 1000 / 3))) {
        await heartbeatRoutes({
          entries: options.entries,
          store: options.store,
          agentId,
          targetHost,
          routeTtlSeconds
        });
        lastHeartbeat = now;
      }

      let served = false;
      for (const entry of options.entries) {
        served = await claimAndServe({
          entry,
          store: options.store,
          targetHost,
          requestTtlSeconds,
          maxResponseBodyBytes,
          ...(options.fetch ? { fetch: options.fetch } : {})
        }) || served;
      }

      if (!served) {
        await wait(pollIntervalMs, signal, localSignal);
      }
    }
  })();

  return {
    agentId,
    stop() {
      controller.abort();
    },
    done
  };
}
