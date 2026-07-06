import { randomUUID } from "node:crypto";
import type { RelayLocalTarget } from "./relay.js";

export const DEFAULT_GHOST_TUNNEL_RESPONSE_TTL_SECONDS = 60;

export type GhostTunnelStoreEnv = Record<string, string | undefined>;

export type GhostTunnelQueuedRequest = {
  id: string;
  host: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  createdAt: string;
  expiresAt: string;
  bodyBase64?: string;
};

export type GhostTunnelQueuedResponse = {
  id: string;
  status: number;
  headers: Record<string, string>;
  createdAt: string;
  bodyBase64?: string;
  error?: string;
};

export type GhostTunnelRouteHeartbeat = {
  host: string;
  agentId: string;
  target: Required<RelayLocalTarget>;
  updatedAt: string;
  expiresAt: string;
};

export type GhostTunnelStore = {
  heartbeatRoute(route: GhostTunnelRouteHeartbeat, ttlSeconds: number): Promise<void>;
  getRoute(host: string): Promise<GhostTunnelRouteHeartbeat | null>;
  enqueueRequest(request: GhostTunnelQueuedRequest, ttlSeconds: number): Promise<void>;
  claimRequest(host: string): Promise<GhostTunnelQueuedRequest | null>;
  writeResponse(response: GhostTunnelQueuedResponse, ttlSeconds: number): Promise<void>;
  readResponse(requestId: string): Promise<GhostTunnelQueuedResponse | null>;
  cleanup(requestId: string): Promise<void>;
};

export type RedisGhostTunnelStoreOptions = {
  url: string;
  token: string;
  namespace?: string;
  fetch?: typeof fetch;
};

export type RedisGhostTunnelEnvResolution = {
  url: string;
  token: string;
  source: "localghost" | "upstash" | "vercel-kv" | "redis";
};

function base64Encode(value: Buffer) {
  return value.toString("base64");
}

export function encodeGhostTunnelBody(value: Buffer | Uint8Array | string) {
  return base64Encode(Buffer.isBuffer(value) ? value : Buffer.from(value));
}

export function decodeGhostTunnelBody(value: string | undefined) {
  return value ? Buffer.from(value, "base64") : undefined;
}

export function createGhostTunnelQueuedRequest(input: {
  host: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Buffer | Uint8Array | string;
  ttlSeconds: number;
  now?: Date;
}): GhostTunnelQueuedRequest {
  const now = input.now ?? new Date();
  const bodyBase64 = typeof input.body === "undefined" ? undefined : encodeGhostTunnelBody(input.body);

  return {
    id: randomUUID(),
    host: input.host,
    method: input.method.toUpperCase(),
    path: input.path,
    headers: input.headers ?? {},
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000).toISOString(),
    ...(bodyBase64 ? { bodyBase64 } : {})
  };
}

export function createGhostTunnelRouteHeartbeat(input: {
  host: string;
  agentId: string;
  target: Required<RelayLocalTarget>;
  ttlSeconds: number;
  now?: Date;
}): GhostTunnelRouteHeartbeat {
  const now = input.now ?? new Date();

  return {
    host: input.host,
    agentId: input.agentId,
    target: input.target,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000).toISOString()
  };
}

function isExpired(expiresAt: string, now = new Date()) {
  const timestamp = Date.parse(expiresAt);
  return Number.isNaN(timestamp) || timestamp <= now.getTime();
}

function serializeJson(value: unknown) {
  return JSON.stringify(value);
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function keyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._:-]/g, "_");
}

class MemoryGhostTunnelStore implements GhostTunnelStore {
  private readonly routes = new Map<string, GhostTunnelRouteHeartbeat>();
  private readonly queues = new Map<string, GhostTunnelQueuedRequest[]>();
  private readonly responses = new Map<string, { value: GhostTunnelQueuedResponse; expiresAt: string }>();

  async heartbeatRoute(route: GhostTunnelRouteHeartbeat): Promise<void> {
    this.routes.set(route.host, route);
  }

  async getRoute(host: string): Promise<GhostTunnelRouteHeartbeat | null> {
    const route = this.routes.get(host);
    if (!route) return null;
    if (!isExpired(route.expiresAt)) return route;
    this.routes.delete(host);
    return null;
  }

  async enqueueRequest(request: GhostTunnelQueuedRequest): Promise<void> {
    const queue = this.queues.get(request.host) ?? [];
    queue.push(request);
    this.queues.set(request.host, queue);
  }

  async claimRequest(host: string): Promise<GhostTunnelQueuedRequest | null> {
    const queue = this.queues.get(host) ?? [];

    while (queue.length > 0) {
      const request = queue.shift();
      if (request && !isExpired(request.expiresAt)) {
        return request;
      }
    }

    return null;
  }

  async writeResponse(response: GhostTunnelQueuedResponse, ttlSeconds: number): Promise<void> {
    this.responses.set(response.id, {
      value: response,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    });
  }

  async readResponse(requestId: string): Promise<GhostTunnelQueuedResponse | null> {
    const response = this.responses.get(requestId);
    if (!response) return null;
    if (!isExpired(response.expiresAt)) return response.value;
    this.responses.delete(requestId);
    return null;
  }

  async cleanup(requestId: string): Promise<void> {
    this.responses.delete(requestId);
  }
}

export function createMemoryGhostTunnelStore(): GhostTunnelStore {
  return new MemoryGhostTunnelStore();
}

class RedisGhostTunnelStore implements GhostTunnelStore {
  private readonly url: string;
  private readonly token: string;
  private readonly namespace: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RedisGhostTunnelStoreOptions) {
    this.url = options.url.replace(/\/+$/, "");
    this.token = options.token;
    this.namespace = options.namespace ?? "localghost";
    this.fetchImpl = options.fetch ?? fetch;
  }

  private key(kind: "route" | "queue" | "response", id: string) {
    return `${this.namespace}:ghost-tunnel:${kind}:${keyPart(id)}`;
  }

  private async command<T>(command: string, ...args: Array<string | number>): Promise<T | null> {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify([command, ...args])
    });

    if (!response.ok) {
      throw new Error(`Redis Ghost Tunnel command failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as { result?: unknown; error?: string };
    if (payload.error) {
      throw new Error(`Redis Ghost Tunnel command failed: ${payload.error}`);
    }

    return (typeof payload.result === "undefined" ? null : payload.result) as T | null;
  }

  async heartbeatRoute(route: GhostTunnelRouteHeartbeat, ttlSeconds: number): Promise<void> {
    await this.command("SET", this.key("route", route.host), serializeJson(route), "EX", ttlSeconds);
  }

  async getRoute(host: string): Promise<GhostTunnelRouteHeartbeat | null> {
    const route = parseJson<GhostTunnelRouteHeartbeat>(await this.command<string>("GET", this.key("route", host)));
    return route && !isExpired(route.expiresAt) ? route : null;
  }

  async enqueueRequest(request: GhostTunnelQueuedRequest, ttlSeconds: number): Promise<void> {
    const queueKey = this.key("queue", request.host);
    await this.command("RPUSH", queueKey, serializeJson(request));
    await this.command("EXPIRE", queueKey, ttlSeconds);
  }

  async claimRequest(host: string): Promise<GhostTunnelQueuedRequest | null> {
    const queueKey = this.key("queue", host);

    while (true) {
      const request = parseJson<GhostTunnelQueuedRequest>(await this.command<string>("LPOP", queueKey));
      if (!request) return null;
      if (!isExpired(request.expiresAt)) return request;
    }
  }

  async writeResponse(response: GhostTunnelQueuedResponse, ttlSeconds: number): Promise<void> {
    await this.command("SET", this.key("response", response.id), serializeJson(response), "EX", ttlSeconds);
  }

  async readResponse(requestId: string): Promise<GhostTunnelQueuedResponse | null> {
    return parseJson<GhostTunnelQueuedResponse>(await this.command<string>("GET", this.key("response", requestId)));
  }

  async cleanup(requestId: string): Promise<void> {
    await this.command("DEL", this.key("response", requestId));
  }
}

export function createRedisGhostTunnelStore(options: RedisGhostTunnelStoreOptions): GhostTunnelStore {
  return new RedisGhostTunnelStore(options);
}

export function resolveRedisGhostTunnelEnv(env: GhostTunnelStoreEnv = process.env): RedisGhostTunnelEnvResolution {
  const candidates: Array<RedisGhostTunnelEnvResolution | null> = [
    env.LOCALGHOST_REDIS_REST_URL && env.LOCALGHOST_REDIS_REST_TOKEN
      ? { url: env.LOCALGHOST_REDIS_REST_URL, token: env.LOCALGHOST_REDIS_REST_TOKEN, source: "localghost" }
      : null,
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, source: "upstash" }
      : null,
    env.KV_REST_API_URL && env.KV_REST_API_TOKEN
      ? { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN, source: "vercel-kv" }
      : null,
    env.REDIS_REST_API_URL && env.REDIS_REST_API_TOKEN
      ? { url: env.REDIS_REST_API_URL, token: env.REDIS_REST_API_TOKEN, source: "redis" }
      : null
  ];
  const match = candidates.find((candidate): candidate is RedisGhostTunnelEnvResolution => Boolean(candidate));

  if (!match) {
    throw new Error("Ghost Tunnel Redis transport requires REST env vars: UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN, KV_REST_API_URL/KV_REST_API_TOKEN, or LOCALGHOST_REDIS_REST_URL/LOCALGHOST_REDIS_REST_TOKEN.");
  }

  return match;
}

export function createRedisGhostTunnelStoreFromEnv(input: {
  env?: GhostTunnelStoreEnv;
  namespace?: string;
  fetch?: typeof fetch;
} = {}): GhostTunnelStore {
  const resolved = resolveRedisGhostTunnelEnv(input.env);
  return createRedisGhostTunnelStore({
    url: resolved.url,
    token: resolved.token,
    ...(input.namespace ? { namespace: input.namespace } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {})
  });
}
