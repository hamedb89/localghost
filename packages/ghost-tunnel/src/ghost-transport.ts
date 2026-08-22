import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { assertExactRelayHost, assertRelayLocalTarget, type RelayLocalTarget, type RelayProtocol } from "./relay.js";
import { constructGhostTunnelUrl, resolveGhostTunnelConfig, type ConstructGhostTunnelUrlInput, type GhostTunnelConfig, type GhostTunnelOptions, type GhostTunnelTransportConfig, type GhostTunnelTransportOptions } from "./tunnel.js";

export const DEFAULT_GHOST_TUNNEL_TRANSPORT_QUERY_PARAM = "__localghost";
export const DEFAULT_GHOST_TUNNEL_IP_TRANSPORT_TTL_SECONDS = 10 * 60;

export type GhostTunnelIpTransportClaim = {
  kind: "ip";
  host: string;
  address: string;
  protocol: RelayProtocol;
  expiresAt: string;
};

export type SignedGhostTunnelIpTransportClaim = {
  payload: GhostTunnelIpTransportClaim;
  token: string;
};

export type ConstructGhostTunnelIpUrlInput = ({
  url: string;
} | ConstructGhostTunnelUrlInput) & {
  address: string;
  signingSecret: string;
  expiresAt?: string;
  ttlSeconds?: number;
  queryParam?: string;
  targetProtocol?: RelayProtocol;
  allowPrivateNetworkAddress?: boolean;
};

export type ResolveGhostTunnelIpRedirectInput = {
  requestUrl: string;
  host: string;
  entryPort: number;
  signingSecret: string;
  transport?: GhostTunnelTransportOptions | GhostTunnelTransportConfig;
  queryParam?: string;
  now?: Date;
};

export type ResolvedGhostTunnelIpRedirect = {
  claim: GhostTunnelIpTransportClaim;
  queryParam: string;
  target: Required<RelayLocalTarget>;
  url: string;
};

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

function isValidIpv4(value: string) {
  return isIP(value) === 4;
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

function assertGhostTunnelIpAddress(address: string, allowPrivateNetworkAddress = false) {
  const normalized = address.trim();
  if (!isValidIpv4(normalized)) {
    throw new Error(`Ghost tunnel IP transport requires a valid IPv4 address: ${address}`);
  }

  if (!allowPrivateNetworkAddress && isPrivateIpv4(normalized)) {
    throw new Error(`Ghost tunnel IP transport requires explicit private-network opt-in: ${normalized}`);
  }

  return normalized;
}

function assertRelayProtocol(value: RelayProtocol | undefined) {
  const protocol = value ?? "http";
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(`Invalid ghost tunnel IP transport protocol: ${String(value)}`);
  }
  return protocol;
}

function resolveTransportConfig(input: GhostTunnelTransportOptions | GhostTunnelTransportConfig | undefined) {
  return resolveGhostTunnelConfig({
    enabled: true,
    ...(typeof input !== "undefined" ? { transport: input } : {})
  }).transport;
}

function resolveExpiresAt(input: { expiresAt?: string; ttlSeconds?: number }, now = new Date()) {
  if (input.expiresAt) {
    if (Number.isNaN(Date.parse(input.expiresAt))) {
      throw new Error("Ghost tunnel IP transport requires a valid expiresAt value.");
    }
    return input.expiresAt;
  }

  const ttlSeconds = input.ttlSeconds ?? DEFAULT_GHOST_TUNNEL_IP_TRANSPORT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error(`Ghost tunnel IP transport ttlSeconds must be a positive integer: ${ttlSeconds}`);
  }

  return new Date(now.getTime() + ttlSeconds * 1000).toISOString();
}

function getBaseGhostTunnelUrl(input: ConstructGhostTunnelIpUrlInput) {
  if ("url" in input) {
    return new URL(input.url);
  }

  return new URL(constructGhostTunnelUrl(input));
}

export function signGhostTunnelIpTransportClaim(
  claim: GhostTunnelIpTransportClaim,
  signingSecret: string,
  options: {
    allowPrivateNetworkAddress?: boolean;
  } = {}
): SignedGhostTunnelIpTransportClaim {
  const payload: GhostTunnelIpTransportClaim = {
    kind: "ip",
    host: assertExactRelayHost(claim.host),
    address: assertGhostTunnelIpAddress(claim.address, options.allowPrivateNetworkAddress),
    protocol: assertRelayProtocol(claim.protocol),
    expiresAt: resolveExpiresAt({ expiresAt: claim.expiresAt })
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, signingSecret);
  return {
    payload,
    token: `${encodedPayload}.${signature}`
  };
}

export function verifyGhostTunnelIpTransportClaim(
  token: string,
  signingSecret: string,
  options: {
    host: string;
    allowPrivateNetworkAddress?: boolean;
    now?: Date;
  }
): GhostTunnelIpTransportClaim {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || token.split(".").length !== 2) {
    throw new Error("Invalid ghost tunnel IP transport token.");
  }

  const expectedSignature = signPayload(encodedPayload, signingSecret);
  if (!secureEqual(signature, expectedSignature)) {
    throw new Error("Invalid ghost tunnel IP transport signature.");
  }

  const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as GhostTunnelIpTransportClaim;
  const host = assertExactRelayHost(parsed.host);
  const expectedHost = assertExactRelayHost(options.host);
  if (host !== expectedHost) {
    throw new Error("Ghost tunnel IP transport host mismatch.");
  }

  const now = options.now ?? new Date();
  if (Number.isNaN(Date.parse(parsed.expiresAt)) || Date.parse(parsed.expiresAt) <= now.getTime()) {
    throw new Error("Ghost tunnel IP transport token has expired.");
  }

  return {
    kind: "ip",
    host,
    address: assertGhostTunnelIpAddress(parsed.address, options.allowPrivateNetworkAddress),
    protocol: assertRelayProtocol(parsed.protocol),
    expiresAt: parsed.expiresAt
  };
}

export function constructGhostTunnelIpUrl(input: ConstructGhostTunnelIpUrlInput) {
  const baseUrl = getBaseGhostTunnelUrl(input);
  const host = assertExactRelayHost(baseUrl.host);
  const token = signGhostTunnelIpTransportClaim({
    kind: "ip",
    host,
    address: input.address,
    protocol: input.targetProtocol ?? "http",
    expiresAt: resolveExpiresAt(input)
  }, input.signingSecret, {
    ...(typeof input.allowPrivateNetworkAddress === "boolean" ? { allowPrivateNetworkAddress: input.allowPrivateNetworkAddress } : {})
  }).token;
  const queryParam = input.queryParam ?? DEFAULT_GHOST_TUNNEL_TRANSPORT_QUERY_PARAM;

  baseUrl.searchParams.set(queryParam, token);
  return baseUrl.toString();
}

export function resolveGhostTunnelIpRedirect(input: ResolveGhostTunnelIpRedirectInput): ResolvedGhostTunnelIpRedirect {
  const transport = resolveTransportConfig(input.transport);
  if (transport.kind !== "ip") {
    throw new Error(`Ghost tunnel transport is not configured for IP redirect: ${transport.kind}`);
  }

  const queryParam = input.queryParam ?? DEFAULT_GHOST_TUNNEL_TRANSPORT_QUERY_PARAM;
  const requestUrl = new URL(input.requestUrl);
  const token = requestUrl.searchParams.get(queryParam);
  if (!token) {
    throw new Error(`Ghost tunnel IP transport token is missing. Add ${queryParam}=... to the URL.`);
  }

  const claim = verifyGhostTunnelIpTransportClaim(token, input.signingSecret, {
    host: input.host,
    allowPrivateNetworkAddress: transport.allowPrivateNetworkAddress,
    ...(input.now ? { now: input.now } : {})
  });

  requestUrl.searchParams.delete(queryParam);
  const target = assertRelayLocalTarget({
    protocol: claim.protocol,
    host: claim.address,
    port: input.entryPort
  }, {
    allowedHosts: [claim.address],
    allowPrivateNetworkTargets: transport.allowPrivateNetworkAddress
  });

  const redirectUrl = new URL(`${target.protocol}://${target.host}:${target.port}/`);
  redirectUrl.pathname = requestUrl.pathname;
  redirectUrl.search = requestUrl.searchParams.toString();
  redirectUrl.hash = requestUrl.hash;

  return {
    claim,
    queryParam,
    target,
    url: redirectUrl.toString()
  };
}
