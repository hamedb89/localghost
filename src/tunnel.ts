import { domainToASCII } from "node:url";

export type GhostTunnelNamespaceTag = "route" | "project" | "owner" | string;

export type GhostTunnelNamespaceOptions = readonly GhostTunnelNamespaceTag[] | {
  tags?: readonly GhostTunnelNamespaceTag[];
  separator?: string;
  spreadTag?: GhostTunnelNamespaceTag | false;
};

export type GhostTunnelNamespaceConfig = {
  tags: GhostTunnelNamespaceTag[];
  separator: string;
  spreadTag?: GhostTunnelNamespaceTag;
};

export type GhostTunnelNamespaceValues = Record<string, string> & {
  route?: string;
  project?: string;
  owner?: string;
};

export type GhostTunnelPreviewOptions = {
  domain?: string;
  route: string;
  project: string;
  owner: string;
  values?: GhostTunnelNamespaceValues;
  path?: string;
  protocol?: "http" | "https";
};

export type GhostTunnelMode = "manual" | "public";

export type GhostTunnelDomainOptions = string | readonly string[];

export type GhostTunnelAdapterProvider = "vercel";
export type GhostTunnelAdapterStrategy = "same-project" | "separate-relay";
export type GhostTunnelTransportKind = "none" | "ip" | "tunnel";
export type GhostTunnelAdapterTransport = GhostTunnelTransportKind;
export type GhostTunnelTunnelStoreProvider = "vercel-redis" | "redis";
export type GhostTunnelTunnelStoreEnv = "auto";

export type GhostTunnelTunnelStoreOptions = {
  provider?: GhostTunnelTunnelStoreProvider;
  env?: GhostTunnelTunnelStoreEnv;
  namespace?: string;
};

export type GhostTunnelTransportOptions =
  | GhostTunnelTransportKind
  | {
    kind?: "none";
  }
  | {
    kind: "ip";
    allowPrivateNetworkAddress?: boolean;
  }
  | {
    kind: "tunnel";
    store?: GhostTunnelTunnelStoreOptions;
    waitMs?: number;
    pollIntervalMs?: number;
    routeTtlSeconds?: number;
    requestTtlSeconds?: number;
    maxRequestBodyBytes?: number;
    maxResponseBodyBytes?: number;
  };

export type GhostTunnelTransportConfig =
  | {
    kind: "none";
  }
  | {
    kind: "ip";
    allowPrivateNetworkAddress: boolean;
  }
  | {
    kind: "tunnel";
    store: Required<Pick<GhostTunnelTunnelStoreOptions, "provider" | "env" | "namespace">>;
    waitMs: number;
    pollIntervalMs: number;
    routeTtlSeconds: number;
    requestTtlSeconds: number;
    maxRequestBodyBytes: number;
    maxResponseBodyBytes: number;
  };

export type GhostTunnelAdapterOptions = GhostTunnelAdapterProvider | {
  provider: GhostTunnelAdapterProvider;
  strategy?: GhostTunnelAdapterStrategy;
};

export type GhostTunnelOptions = false | GhostTunnelMode | {
  enabled?: boolean;
  mode?: GhostTunnelMode;
  domains?: GhostTunnelDomainOptions;
  subdomain?: string;
  namespace?: GhostTunnelNamespaceOptions;
  preview?: GhostTunnelPreviewOptions;
  requireHttps?: boolean;
  requireAuth?: boolean;
  adapter?: GhostTunnelAdapterOptions;
  transport?: GhostTunnelTransportOptions;
};

export type GhostTunnelConfig = {
  enabled: boolean;
  mode: GhostTunnelMode;
  domains: string[];
  subdomain: string;
  namespace: GhostTunnelNamespaceConfig;
  preview?: GhostTunnelPreviewOptions;
  previewUrl?: string;
  displayUrl?: string;
  displayUrls: string[];
  requireHttps: boolean;
  requireAuth: boolean;
  transport: GhostTunnelTransportConfig;
  adapter?: {
    provider: GhostTunnelAdapterProvider;
    strategy: GhostTunnelAdapterStrategy;
  };
};

export type GhostTunnelDisplayDefaults = {
  domain?: string;
  route?: string;
  project?: string;
  owner?: string;
  values?: GhostTunnelNamespaceValues;
};

export type GhostTunnelRoute = {
  host: string;
  slug: string;
  namespace: GhostTunnelNamespaceValues;
  entryHost: string;
  wildcardHost: string;
  domain: string;
};

export type ConstructGhostTunnelUrlInput = {
  domain: string;
  route: string;
  project: string;
  owner: string;
  values?: GhostTunnelNamespaceValues;
  path?: string;
  searchParams?: Record<string, string | number | boolean | null | undefined> | URLSearchParams;
  protocol?: "http" | "https";
  ghostTunnel?: GhostTunnelOptions | GhostTunnelConfig;
};

const DEFAULT_GHOST_TUNNEL_SUBDOMAIN = "ghost";
const DEFAULT_GHOST_TUNNEL_NAMESPACE_TAGS = ["route", "project", "owner"] as const;
const DEFAULT_GHOST_TUNNEL_NAMESPACE_SEPARATOR = "-";
const DEFAULT_GHOST_TUNNEL_MODE: GhostTunnelMode = "manual";
const DEFAULT_GHOST_TUNNEL_ADAPTER_STRATEGY: GhostTunnelAdapterStrategy = "same-project";
const DEFAULT_GHOST_TUNNEL_TRANSPORT_KIND: GhostTunnelTransportKind = "none";
const DEFAULT_GHOST_TUNNEL_TUNNEL_STORE_PROVIDER: GhostTunnelTunnelStoreProvider = "vercel-redis";
const DEFAULT_GHOST_TUNNEL_TUNNEL_STORE_ENV: GhostTunnelTunnelStoreEnv = "auto";
const DEFAULT_GHOST_TUNNEL_TUNNEL_STORE_NAMESPACE = "localghost";
const DEFAULT_GHOST_TUNNEL_TUNNEL_WAIT_MS = 25_000;
const DEFAULT_GHOST_TUNNEL_TUNNEL_POLL_INTERVAL_MS = 250;
const DEFAULT_GHOST_TUNNEL_TUNNEL_ROUTE_TTL_SECONDS = 30;
const DEFAULT_GHOST_TUNNEL_TUNNEL_REQUEST_TTL_SECONDS = 60;
const DEFAULT_GHOST_TUNNEL_TUNNEL_MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const DEFAULT_GHOST_TUNNEL_TUNNEL_MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;

type GhostTunnelLegacyAdapterOptions = {
  provider: GhostTunnelAdapterProvider;
  strategy?: GhostTunnelAdapterStrategy;
  transport?: GhostTunnelTransportOptions;
};

function isResolvedGhostTunnelConfig(value: GhostTunnelOptions | GhostTunnelConfig | undefined): value is GhostTunnelConfig {
  return typeof value === "object" && value !== null && "enabled" in value;
}

function toGhostTunnelConfig(options: GhostTunnelOptions | GhostTunnelConfig | undefined) {
  return isResolvedGhostTunnelConfig(options) ? options : resolveGhostTunnelConfig(options);
}

function stripHostPort(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("[") || trimmed.includes("/")) return "";

  const portSeparator = trimmed.lastIndexOf(":");
  if (portSeparator === -1) return trimmed;

  const port = trimmed.slice(portSeparator + 1);
  return /^\d+$/.test(port) ? trimmed.slice(0, portSeparator) : trimmed;
}

function normalizeDomain(value: string) {
  const host = stripHostPort(value.replace(/^\*\./, ""));
  const ascii = domainToASCII(host);
  if (!ascii || ascii.length > 253 || ascii.includes("..")) return null;
  if (ascii.startsWith(".") || ascii.endsWith(".")) return null;
  if (ascii.includes("*")) return null;
  if (!ascii.split(".").every(isValidHostLabel)) return null;
  return ascii;
}

function isValidHostLabel(value: string) {
  return value.length > 0 && value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

function isValidNamespaceTag(value: string) {
  return /^[a-z][a-z0-9_]*$/i.test(value);
}

function isNamespaceTagList(options: GhostTunnelNamespaceOptions | undefined): options is readonly GhostTunnelNamespaceTag[] {
  return Array.isArray(options);
}

function assertValidSubdomain(value: string) {
  if (!isValidHostLabel(value)) {
    throw new Error(`Invalid ghost tunnel subdomain: ${value}`);
  }
}

function normalizeDomains(domains: GhostTunnelDomainOptions | undefined) {
  const values = typeof domains === "string" ? [domains] : [...(domains ?? [])];
  const normalized = values.map((value) => value.trim()).filter(Boolean).map((value) => {
    const domain = normalizeDomain(value);
    if (!domain) throw new Error(`Invalid ghost tunnel domain: ${value}`);
    return domain;
  });

  return [...new Set(normalized)];
}

function parseGhostTunnelMode(value: GhostTunnelMode | undefined) {
  return value ?? DEFAULT_GHOST_TUNNEL_MODE;
}

function parseGhostTunnelAdapterStrategy(value: GhostTunnelAdapterStrategy | undefined) {
  if (typeof value === "undefined") return DEFAULT_GHOST_TUNNEL_ADAPTER_STRATEGY;
  if (value === "same-project" || value === "separate-relay") return value;
  throw new Error(`Unsupported ghost tunnel adapter strategy: ${String(value)}`);
}

function parseGhostTunnelTransportKind(value: GhostTunnelTransportKind | undefined) {
  if (typeof value === "undefined") return DEFAULT_GHOST_TUNNEL_TRANSPORT_KIND;
  if (value === "none" || value === "ip" || value === "tunnel") return value;
  throw new Error(`Unsupported ghost tunnel transport: ${String(value)}`);
}

function parsePositiveInteger(value: number | undefined, fallback: number, name: string) {
  if (typeof value === "undefined") return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ghost tunnel ${name}: ${value}`);
  }
  return value;
}

function parseTunnelStoreProvider(value: GhostTunnelTunnelStoreProvider | undefined) {
  if (typeof value === "undefined") return DEFAULT_GHOST_TUNNEL_TUNNEL_STORE_PROVIDER;
  if (value === "vercel-redis" || value === "redis") return value;
  throw new Error(`Unsupported ghost tunnel tunnel store provider: ${String(value)}`);
}

function parseTunnelStoreEnv(value: GhostTunnelTunnelStoreEnv | undefined) {
  if (typeof value === "undefined") return DEFAULT_GHOST_TUNNEL_TUNNEL_STORE_ENV;
  if (value === "auto") return value;
  throw new Error(`Unsupported ghost tunnel tunnel store env: ${String(value)}`);
}

function parseTunnelStoreNamespace(value: string | undefined) {
  const namespace = value ?? DEFAULT_GHOST_TUNNEL_TUNNEL_STORE_NAMESPACE;
  if (!/^[a-z][a-z0-9:_-]{0,63}$/i.test(namespace)) {
    throw new Error(`Invalid ghost tunnel tunnel store namespace: ${namespace}`);
  }
  return namespace;
}

function resolveGhostTunnelAdapter(
  input: GhostTunnelAdapterOptions | GhostTunnelLegacyAdapterOptions | GhostTunnelConfig["adapter"] | undefined
): GhostTunnelConfig["adapter"] {
  if (!input) return undefined;

  const provider = typeof input === "string" ? input : input.provider;
  if (provider !== "vercel") {
    throw new Error(`Unsupported ghost tunnel adapter provider: ${String(provider)}`);
  }

  return {
    provider,
    strategy: typeof input === "string" ? DEFAULT_GHOST_TUNNEL_ADAPTER_STRATEGY : parseGhostTunnelAdapterStrategy(input.strategy)
  };
}

function getLegacyGhostTunnelTransport(
  input: GhostTunnelAdapterOptions | GhostTunnelLegacyAdapterOptions | GhostTunnelConfig["adapter"] | undefined
) {
  if (!input || typeof input === "string" || !("transport" in input)) return undefined;
  return input.transport;
}

function resolveGhostTunnelTransport(
  input: GhostTunnelTransportOptions | GhostTunnelTransportConfig | undefined
): GhostTunnelTransportConfig {
  if (!input) {
    return { kind: "none" };
  }

  const kind = typeof input === "string"
    ? parseGhostTunnelTransportKind(input)
    : parseGhostTunnelTransportKind(input.kind);

  if (kind === "ip") {
    return {
      kind,
      allowPrivateNetworkAddress: typeof input === "string" ? false : input.kind === "ip" ? input.allowPrivateNetworkAddress ?? false : false
    };
  }

  if (kind === "tunnel") {
    const config: Extract<GhostTunnelTransportOptions, { kind: "tunnel" }> | Extract<GhostTunnelTransportConfig, { kind: "tunnel" }> | undefined =
      typeof input === "string" || input.kind !== "tunnel" ? undefined : input;
    const store = config?.store ?? {};
    return {
      kind,
      store: {
        provider: parseTunnelStoreProvider(store.provider),
        env: parseTunnelStoreEnv(store.env),
        namespace: parseTunnelStoreNamespace(store.namespace)
      },
      waitMs: parsePositiveInteger(config?.waitMs, DEFAULT_GHOST_TUNNEL_TUNNEL_WAIT_MS, "tunnel waitMs"),
      pollIntervalMs: parsePositiveInteger(config?.pollIntervalMs, DEFAULT_GHOST_TUNNEL_TUNNEL_POLL_INTERVAL_MS, "tunnel pollIntervalMs"),
      routeTtlSeconds: parsePositiveInteger(config?.routeTtlSeconds, DEFAULT_GHOST_TUNNEL_TUNNEL_ROUTE_TTL_SECONDS, "tunnel routeTtlSeconds"),
      requestTtlSeconds: parsePositiveInteger(config?.requestTtlSeconds, DEFAULT_GHOST_TUNNEL_TUNNEL_REQUEST_TTL_SECONDS, "tunnel requestTtlSeconds"),
      maxRequestBodyBytes: parsePositiveInteger(config?.maxRequestBodyBytes, DEFAULT_GHOST_TUNNEL_TUNNEL_MAX_REQUEST_BODY_BYTES, "tunnel maxRequestBodyBytes"),
      maxResponseBodyBytes: parsePositiveInteger(config?.maxResponseBodyBytes, DEFAULT_GHOST_TUNNEL_TUNNEL_MAX_RESPONSE_BODY_BYTES, "tunnel maxResponseBodyBytes")
    };
  }

  return { kind: "none" };
}

function resolveNamespaceConfig(options: GhostTunnelNamespaceOptions | undefined): GhostTunnelNamespaceConfig {
  const tags = isNamespaceTagList(options)
    ? [...options]
    : [...(options?.tags ?? DEFAULT_GHOST_TUNNEL_NAMESPACE_TAGS)];
  let separator = DEFAULT_GHOST_TUNNEL_NAMESPACE_SEPARATOR;
  let spreadTag: GhostTunnelNamespaceTag | false | undefined = tags.includes("project") ? "project" : undefined;
  if (options && !isNamespaceTagList(options)) {
    separator = options.separator ?? DEFAULT_GHOST_TUNNEL_NAMESPACE_SEPARATOR;
    spreadTag = options.spreadTag === false ? false : options.spreadTag ?? spreadTag;
  }

  if (tags.length === 0) {
    throw new Error("Ghost tunnel namespace must include at least one tag.");
  }

  for (const tag of tags) {
    if (!isValidNamespaceTag(tag)) {
      throw new Error(`Invalid ghost tunnel namespace tag: ${tag}`);
    }
  }

  if (spreadTag && !tags.includes(spreadTag)) {
    throw new Error(`Ghost tunnel namespace spreadTag must be listed in tags: ${spreadTag}`);
  }

  if (!separator || separator.length > 8 || !/^[a-z0-9-]+$/.test(separator)) {
    throw new Error(`Invalid ghost tunnel namespace separator: ${separator}`);
  }

  return {
    tags,
    separator,
    ...(spreadTag ? { spreadTag } : {})
  };
}

function normalizeNamespaceValue(tag: string, value: string, separator: string, options: { allowSeparator?: boolean } = {}) {
  const normalized = normalizeDomain(value);
  if (!normalized || normalized.includes(".")) {
    throw new Error(`Invalid ghost tunnel namespace value for ${tag}: ${value}`);
  }

  if (!options.allowSeparator && normalized.includes(separator)) {
    throw new Error(`Ghost tunnel namespace value for ${tag} cannot include separator "${separator}": ${value}`);
  }

  return normalized;
}

function createNamespaceSlug(config: GhostTunnelNamespaceConfig, values: GhostTunnelNamespaceValues) {
  const parts = config.tags.map((tag) => {
    const value = values[tag];
    if (!value) {
      throw new Error(`Missing ghost tunnel namespace value: ${tag}`);
    }

    return normalizeNamespaceValue(tag, value, config.separator, { allowSeparator: tag === config.spreadTag });
  });

  const slug = parts.join(config.separator);
  if (!isValidHostLabel(slug)) {
    throw new Error(`Ghost tunnel namespace is too long for a DNS label: ${slug}`);
  }

  return slug;
}

function createNamespaceDisplaySlug(config: GhostTunnelNamespaceConfig, values: GhostTunnelNamespaceValues = {}) {
  return config.tags.map((tag) => {
    const value = values[tag];
    if (!value) return `<${tag}>`;

    try {
      return normalizeNamespaceValue(tag, value, config.separator, { allowSeparator: tag === config.spreadTag });
    } catch {
      return `<${tag}>`;
    }
  }).join(config.separator);
}

function getPreviewDefaults(preview: GhostTunnelPreviewOptions | undefined, defaults: GhostTunnelDisplayDefaults | undefined) {
  return {
    domain: preview?.domain ?? defaults?.domain,
    route: preview?.route ?? defaults?.route,
    project: preview?.project ?? defaults?.project,
    owner: preview?.owner ?? defaults?.owner,
    values: {
      ...(defaults?.values ?? {}),
      ...(preview?.values ?? {})
    },
    path: preview?.path,
    protocol: preview?.protocol
  };
}

function getDisplayValues(input: ReturnType<typeof getPreviewDefaults>): GhostTunnelNamespaceValues {
  return {
    ...(input.route ? { route: input.route } : {}),
    ...(input.project ? { project: input.project } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    ...input.values
  };
}

function getDisplayDefaults(defaults?: GhostTunnelDisplayDefaults) {
  return defaults;
}

function createDisplayUrl(config: GhostTunnelConfig, defaults?: GhostTunnelDisplayDefaults, domain?: string) {
  const input = getPreviewDefaults(config.preview, getDisplayDefaults(defaults));
  const protocol = input.protocol ?? "https";
  const slug = createNamespaceDisplaySlug(config.namespace, getDisplayValues(input));
  const entryHost = domain
    ? getGhostTunnelEntryHost(domain, config)
    : input.domain
      ? getGhostTunnelEntryHost(input.domain, config)
      : `${config.subdomain}.*`;
  const url = `${protocol}://${slug}.${entryHost}/`;

  if (!input.path) return url;
  return `${url}${input.path.replace(/^\/+/, "")}`;
}

function createDisplayUrls(config: GhostTunnelConfig, defaults?: GhostTunnelDisplayDefaults) {
  const displayDefaults = getDisplayDefaults(defaults);
  const domains = config.domains.length > 0
    ? config.domains
    : displayDefaults?.domain
      ? [displayDefaults.domain]
      : [];
  const urls = domains.length > 0
    ? domains.map((domain) => createDisplayUrl(config, displayDefaults, domain))
    : [createDisplayUrl(config, displayDefaults)];

  return [...new Set(urls)];
}

function maybeConstructPreviewUrl(config: GhostTunnelConfig, defaults?: GhostTunnelDisplayDefaults) {
  if (!config.preview) return undefined;

  const input = getPreviewDefaults(config.preview, defaults);
  if (!input.domain || !input.route || !input.project || !input.owner) return undefined;

  return constructGhostTunnelUrl({
    domain: input.domain,
    route: input.route,
    project: input.project,
    owner: input.owner,
    values: input.values,
    ...(input.path ? { path: input.path } : {}),
    ...(input.protocol ? { protocol: input.protocol } : {}),
    ghostTunnel: config
  });
}

function parseNamespaceSlug(slug: string, config: GhostTunnelNamespaceConfig): GhostTunnelNamespaceValues | null {
  const parts = slug.split(config.separator);
  if (parts.length < config.tags.length) return null;
  if (parts.length !== config.tags.length && !config.spreadTag) return null;

  const namespace: GhostTunnelNamespaceValues = {};
  const spreadIndex = config.spreadTag ? config.tags.indexOf(config.spreadTag) : -1;
  const spreadWidth = spreadIndex >= 0 ? parts.length - config.tags.length + 1 : 1;

  let partIndex = 0;
  for (const [tagIndex, tag] of config.tags.entries()) {
    const value = tagIndex === spreadIndex
      ? parts.slice(partIndex, partIndex + spreadWidth).join(config.separator)
      : parts[partIndex];
    if (!value || !isValidHostLabel(value)) return null;
    if (tagIndex !== spreadIndex && value.includes(config.separator)) return null;
    namespace[tag] = value;
    partIndex += tagIndex === spreadIndex ? spreadWidth : 1;
  }

  return namespace;
}

export function resolveGhostTunnelConfig(options: GhostTunnelOptions | undefined, defaults?: GhostTunnelDisplayDefaults): GhostTunnelConfig {
  if (options === false || typeof options === "undefined") {
    return {
      enabled: false,
      mode: DEFAULT_GHOST_TUNNEL_MODE,
      domains: [],
      subdomain: DEFAULT_GHOST_TUNNEL_SUBDOMAIN,
      namespace: resolveNamespaceConfig(undefined),
      displayUrls: [],
      requireHttps: true,
      requireAuth: true,
      transport: resolveGhostTunnelTransport(undefined)
    };
  }

  const config = typeof options === "string"
      ? { mode: options }
      : options;
  const subdomain = config.subdomain ?? DEFAULT_GHOST_TUNNEL_SUBDOMAIN;
  assertValidSubdomain(subdomain);
  const domains = normalizeDomains(config.domains);
  const enabled = config.enabled ?? true;
  const adapter = resolveGhostTunnelAdapter(config.adapter);
  const transport = resolveGhostTunnelTransport(config.transport ?? getLegacyGhostTunnelTransport(config.adapter));

  const resolved: GhostTunnelConfig = {
    enabled,
    mode: parseGhostTunnelMode(config.mode),
    domains,
    subdomain,
    namespace: resolveNamespaceConfig(config.namespace),
    ...(config.preview ? { preview: config.preview } : {}),
    displayUrls: [],
    requireHttps: config.requireHttps ?? true,
    requireAuth: config.requireAuth ?? true,
    transport,
    ...(adapter ? { adapter } : {})
  };

  if (!enabled) {
    return resolved;
  }

  const previewUrl = maybeConstructPreviewUrl(resolved, defaults);
  const displayUrls = previewUrl ? [previewUrl] : createDisplayUrls(resolved, defaults);

  return {
    ...resolved,
    displayUrls,
    ...(displayUrls[0] ? { displayUrl: displayUrls[0] } : {}),
    ...(previewUrl ? { previewUrl } : {})
  };
}

export function getGhostTunnelEntryHost(domain: string, options: GhostTunnelOptions | GhostTunnelConfig = {}) {
  const config = toGhostTunnelConfig(options);
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    throw new Error(`Invalid ghost tunnel domain: ${domain}`);
  }

  return `${config.subdomain}.${normalizedDomain}`;
}

export function getGhostTunnelWildcardHost(domain: string, options: GhostTunnelOptions | GhostTunnelConfig = {}) {
  return `*.${getGhostTunnelEntryHost(domain, options)}`;
}

export function constructGhostTunnelHost(input: Omit<ConstructGhostTunnelUrlInput, "path" | "searchParams" | "protocol">) {
  const config = toGhostTunnelConfig(input.ghostTunnel ?? {});
  if (!config.enabled) {
    throw new Error("Ghost tunnel is not enabled.");
  }

  const namespaceValues: GhostTunnelNamespaceValues = {
    route: input.route,
    project: input.project,
    owner: input.owner,
    ...(input.values ?? {})
  };
  const slug = createNamespaceSlug(config.namespace, namespaceValues);

  return `${slug}.${getGhostTunnelEntryHost(input.domain, config)}`;
}

export function constructGhostTunnelUrl(input: ConstructGhostTunnelUrlInput) {
  const protocol = input.protocol ?? "https";
  const host = constructGhostTunnelHost(input);
  const url = new URL(`${protocol}://${host}/`);

  if (input.path) {
    url.pathname = `/${input.path.replace(/^\/+/, "")}`;
  }

  if (input.searchParams instanceof URLSearchParams) {
    url.search = input.searchParams.toString();
  } else if (input.searchParams) {
    for (const [key, value] of Object.entries(input.searchParams)) {
      if (typeof value !== "undefined" && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export const constructGhostTunnelURL = constructGhostTunnelUrl;

export function getGhostTunnelDefaultDisplayUrl(options: GhostTunnelOptions | GhostTunnelConfig = {}, defaults?: GhostTunnelDisplayDefaults) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;
  return createDisplayUrl(config, defaults);
}

export function getGhostTunnelDisplayUrl(options: GhostTunnelOptions | GhostTunnelConfig | undefined, defaults?: GhostTunnelDisplayDefaults) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;
  return config.displayUrl ?? config.previewUrl ?? getGhostTunnelDefaultDisplayUrl(config, defaults);
}

export function getGhostTunnelDisplayUrls(options: GhostTunnelOptions | GhostTunnelConfig | undefined, defaults?: GhostTunnelDisplayDefaults) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return [];
  if (config.displayUrls.length > 0) return config.displayUrls;
  const displayUrl = getGhostTunnelDisplayUrl(config, defaults);
  return displayUrl ? [displayUrl] : [];
}

export function getGhostTunnelPreviewUrl(options: GhostTunnelOptions | GhostTunnelConfig | undefined) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;
  return config.previewUrl ?? maybeConstructPreviewUrl(config) ?? null;
}

export function parseGhostTunnelHost(host: string, domain: string, options: GhostTunnelOptions | GhostTunnelConfig = {}): GhostTunnelRoute | null {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;

  const normalizedHost = normalizeDomain(host);
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedHost || !normalizedDomain) return null;

  const entryHost = getGhostTunnelEntryHost(normalizedDomain, config);
  const suffix = `.${entryHost}`;
  if (!normalizedHost.endsWith(suffix)) return null;

  const slug = normalizedHost.slice(0, -suffix.length);
  if (!isValidHostLabel(slug)) return null;
  const namespace = parseNamespaceSlug(slug, config.namespace);
  if (!namespace) return null;

  return {
    host: normalizedHost,
    slug,
    namespace,
    entryHost,
    wildcardHost: `*.${entryHost}`,
    domain: normalizedDomain
  };
}

export function assertSecureGhostTunnelRequest(input: {
  host: string;
  domain: string;
  protocol: "http" | "https";
  ghostTunnel: GhostTunnelOptions | GhostTunnelConfig | undefined;
  authenticated?: boolean;
}) {
  const config = toGhostTunnelConfig(input.ghostTunnel);

  if (!config.enabled) {
    throw new Error("Ghost tunnel is not enabled.");
  }

  if (config.requireHttps && input.protocol !== "https") {
    throw new Error("Ghost tunnel requests must use HTTPS.");
  }

  if (config.requireAuth && input.authenticated !== true) {
    throw new Error("Ghost tunnel requests must be authenticated.");
  }

  const route = parseGhostTunnelHost(input.host, input.domain, config);
  if (!route) {
    throw new Error(`Host is not a valid ghost tunnel host for ${input.domain}.`);
  }

  return route;
}
