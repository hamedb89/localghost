import { createHmac, timingSafeEqual } from "node:crypto";
import { domainToASCII } from "node:url";

export type RelayProtocol = "http" | "https";
export type RelayAccessMode = "private" | "public";

export type RelayLocalTarget = {
  protocol?: RelayProtocol;
  host: string;
  port: number;
};

export type RelayLimits = {
  requestBodyBytes: number;
  responseBytes: number;
  timeoutMs: number;
  maxConcurrentRequests: number;
  perRouteRequestsPerMinute: number;
  perIpRequestsPerMinute: number;
};

export type RelayTargetPolicy = {
  allowedHosts: string[];
  blockedPorts: number[];
  allowPrivateNetworkTargets: boolean;
};

export type RelayRouteClaim = {
  host: string;
  scope: string;
  expiresAt: string;
  agentId: string;
};

export type SignedRelayRouteClaim = {
  payload: RelayRouteClaim;
  token: string;
};

export type RelayRouteRegistrationInput = {
  authorizationHeader?: string | null;
  agentToken: string;
  claimToken: string;
  signingSecret: string;
  expectedScope: string;
  target: RelayLocalTarget;
  access?: RelayAccessMode;
  publicMode?: boolean;
  passwordProtected?: boolean;
  authRequired?: boolean;
  now?: Date;
  targetPolicy?: Partial<RelayTargetPolicy>;
  limits?: Partial<RelayLimits>;
};

export type ActiveRelayRoute = {
  host: string;
  scope: string;
  agentId: string;
  expiresAt: string;
  target: Required<RelayLocalTarget>;
  access: RelayAccessMode;
  passwordProtected: boolean;
  authRequired: boolean;
  limits: RelayLimits;
};

export type RelayOfflineResponse = {
  status: 503;
  headers: Record<string, string>;
  body: string;
};

export const DEFAULT_RELAY_ALLOWED_TARGET_HOSTS = ["localhost", "127.0.0.1", "::1"] as const;
export const DEFAULT_RELAY_BLOCKED_PORTS = [22, 2375, 2376, 5432, 6379, 9200, 9229, 27017] as const;

export const DEFAULT_RELAY_LIMITS: RelayLimits = {
  requestBodyBytes: 5 * 1024 * 1024,
  responseBytes: 25 * 1024 * 1024,
  timeoutMs: 30_000,
  maxConcurrentRequests: 20,
  perRouteRequestsPerMinute: 120,
  perIpRequestsPerMinute: 60
};

export const DEFAULT_RELAY_TARGET_POLICY: RelayTargetPolicy = {
  allowedHosts: [...DEFAULT_RELAY_ALLOWED_TARGET_HOSTS],
  blockedPorts: [...DEFAULT_RELAY_BLOCKED_PORTS],
  allowPrivateNetworkTargets: false
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);
const TOKEN_QUERY_PATTERN = /(token|secret|key|password|session|jwt|auth)/i;
const HOST_PATTERN = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*$/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeHost(host: string) {
  const trimmed = host.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed || trimmed.includes("*") || trimmed.includes("/") || trimmed.includes(":")) return null;
  const ascii = domainToASCII(trimmed);
  if (!ascii || ascii.includes("..")) return null;
  return HOST_PATTERN.test(ascii) ? ascii : null;
}

function normalizeTargetHost(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (trimmed === "::1" || trimmed === "[::1]") return "::1";
  if (trimmed.includes("/") || trimmed.includes("*")) return null;
  if (IPV4_PATTERN.test(trimmed)) return isValidIpv4(trimmed) ? trimmed : null;
  return normalizeHost(trimmed);
}

function isValidIpv4(value: string) {
  return value.split(".").every((part) => {
    const octet = Number(part);
    return Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === part;
  });
}

function isPrivateIpv4(value: string) {
  if (!isValidIpv4(value)) return false;
  const [first = 0, second = 0] = value.split(".").map((part) => Number(part));
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isLocalTargetHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function mergeTargetPolicy(policy: Partial<RelayTargetPolicy> | undefined): RelayTargetPolicy {
  return {
    allowedHosts: policy?.allowedHosts ?? DEFAULT_RELAY_TARGET_POLICY.allowedHosts,
    blockedPorts: policy?.blockedPorts ?? DEFAULT_RELAY_TARGET_POLICY.blockedPorts,
    allowPrivateNetworkTargets: policy?.allowPrivateNetworkTargets ?? DEFAULT_RELAY_TARGET_POLICY.allowPrivateNetworkTargets
  };
}

function mergeLimits(limits: Partial<RelayLimits> | undefined): RelayLimits {
  const merged = {
    ...DEFAULT_RELAY_LIMITS,
    ...(limits ?? {})
  };

  for (const [key, value] of Object.entries(merged)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Invalid relay limit ${key}: ${value}`);
    }
  }

  return merged;
}

export function assertExactRelayHost(host: string) {
  const normalized = normalizeHost(host);
  if (!normalized) {
    throw new Error(`Relay route claims must use an exact hostname: ${host}`);
  }
  return normalized;
}

export function assertRelayLocalTarget(target: RelayLocalTarget, policyInput?: Partial<RelayTargetPolicy>): Required<RelayLocalTarget> {
  if (!target || typeof target !== "object") {
    throw new Error("Relay target must be an explicit local target object.");
  }

  const policy = mergeTargetPolicy(policyInput);
  const host = normalizeTargetHost(target.host);
  if (!host) {
    throw new Error(`Invalid relay target host: ${target.host}`);
  }

  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    throw new Error(`Invalid relay target port: ${target.port}`);
  }

  const protocol = target.protocol ?? "http";
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(`Invalid relay target protocol: ${String(protocol)}`);
  }

  if (policy.blockedPorts.includes(target.port)) {
    throw new Error(`Relay target port is blocked: ${target.port}`);
  }

  const allowedHosts = new Set(policy.allowedHosts.map((allowedHost) => normalizeTargetHost(allowedHost)).filter((value): value is string => Boolean(value)));
  if (!allowedHosts.has(host)) {
    throw new Error(`Relay target host is not explicitly allowed: ${host}`);
  }

  if (!policy.allowPrivateNetworkTargets && !isLocalTargetHost(host) && (host === "::1" || isPrivateIpv4(host))) {
    throw new Error(`Private-network relay target requires explicit opt-in: ${host}`);
  }

  return {
    protocol,
    host,
    port: target.port
  };
}

export function authenticateRelayAgentToken(input: {
  authorizationHeader?: string | null;
  agentToken: string;
}) {
  const expected = `Bearer ${input.agentToken}`;
  return typeof input.authorizationHeader === "string" && secureEqual(input.authorizationHeader, expected);
}

export function signRelayRouteClaim(claim: RelayRouteClaim, signingSecret: string): SignedRelayRouteClaim {
  const payload: RelayRouteClaim = {
    ...claim,
    host: assertExactRelayHost(claim.host)
  };
  if (!payload.scope) throw new Error("Relay route claim requires a scope.");
  if (!payload.agentId) throw new Error("Relay route claim requires an agentId.");
  if (Number.isNaN(Date.parse(payload.expiresAt))) throw new Error("Relay route claim requires a valid expiresAt.");

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, signingSecret);
  return {
    payload,
    token: `${encodedPayload}.${signature}`
  };
}

export function verifyRelayRouteClaim(token: string, signingSecret: string, options: {
  expectedScope: string;
  now?: Date;
}): RelayRouteClaim {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || token.split(".").length !== 2) {
    throw new Error("Invalid relay route claim token.");
  }

  const expectedSignature = signPayload(encodedPayload, signingSecret);
  if (!secureEqual(signature, expectedSignature)) {
    throw new Error("Invalid relay route claim signature.");
  }

  const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as RelayRouteClaim;
  const host = assertExactRelayHost(parsed.host);
  if (parsed.scope !== options.expectedScope) {
    throw new Error("Relay route claim scope mismatch.");
  }

  const now = options.now ?? new Date();
  if (Date.parse(parsed.expiresAt) <= now.getTime()) {
    throw new Error("Relay route claim has expired.");
  }

  if (!parsed.agentId) {
    throw new Error("Relay route claim requires an agentId.");
  }

  return { ...parsed, host };
}

export function createRelayRouteRegistration(input: RelayRouteRegistrationInput): ActiveRelayRoute {
  if (!authenticateRelayAgentToken({
    agentToken: input.agentToken,
    ...(typeof input.authorizationHeader !== "undefined" ? { authorizationHeader: input.authorizationHeader } : {})
  })) {
    throw new Error("Relay route registration requires an authenticated local agent.");
  }

  const claim = verifyRelayRouteClaim(input.claimToken, input.signingSecret, {
    expectedScope: input.expectedScope,
    ...(input.now ? { now: input.now } : {})
  });
  const target = assertRelayLocalTarget(input.target, input.targetPolicy);
  const access = input.publicMode === true ? "public" : input.access ?? "private";
  const passwordProtected = input.passwordProtected ?? false;
  const authRequired = input.authRequired ?? false;

  if (access === "public" && input.publicMode !== true) {
    throw new Error("Relay public mode must be explicitly enabled.");
  }

  if (access === "private" && !passwordProtected && !authRequired) {
    throw new Error("Private relay previews require password or auth.");
  }

  return {
    host: claim.host,
    scope: claim.scope,
    agentId: claim.agentId,
    expiresAt: claim.expiresAt,
    target,
    access,
    passwordProtected,
    authRequired,
    limits: mergeLimits(input.limits)
  };
}

export function isRelayRouteActive(route: ActiveRelayRoute, options: {
  agentConnected: boolean;
  now?: Date;
}) {
  if (!options.agentConnected) return false;
  return Date.parse(route.expiresAt) > (options.now ?? new Date()).getTime();
}

export function stripRelayForwardHeaders(headers: Record<string, string | string[] | undefined>) {
  const stripped: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "undefined") continue;
    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName)) continue;
    if (lowerName.startsWith("x-localghost-")) continue;
    stripped[name] = value;
  }

  return stripped;
}

export function redactRelayHeaders(headers: Record<string, string | string[] | undefined>) {
  const redacted: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "undefined") continue;
    redacted[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? "[redacted]" : value;
  }

  return redacted;
}

export function redactRelayLogUrl(input: string) {
  const url = new URL(input, "http://localghost.invalid");
  for (const key of [...url.searchParams.keys()]) {
    if (TOKEN_QUERY_PATTERN.test(key)) {
      url.searchParams.set(key, "[redacted]");
    }
  }

  return input.startsWith("http://") || input.startsWith("https://")
    ? url.toString()
    : `${url.pathname}${url.search}`;
}

export function renderRelayOfflineResponse(): RelayOfflineResponse {
  return {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    },
    body: [
      "<!doctype html>",
      "<html>",
      "<head><meta charset=\"utf-8\"><title>Preview offline</title></head>",
      "<body><h1>Preview offline</h1><p>The local agent is not connected. Try again later.</p></body>",
      "</html>"
    ].join("")
  };
}
