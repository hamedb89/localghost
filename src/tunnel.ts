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
  domain: string;
  route: string;
  project: string;
  owner: string;
  values?: GhostTunnelNamespaceValues;
  path?: string;
  protocol?: "http" | "https";
};

export type GhostTunnelOptions = boolean | {
  subdomain?: string;
  namespace?: GhostTunnelNamespaceOptions;
  preview?: GhostTunnelPreviewOptions;
  requireHttps?: boolean;
  requireAuth?: boolean;
};

export type GhostTunnelConfig = {
  enabled: boolean;
  subdomain: string;
  namespace: GhostTunnelNamespaceConfig;
  preview?: GhostTunnelPreviewOptions;
  previewUrl?: string;
  displayUrl?: string;
  requireHttps: boolean;
  requireAuth: boolean;
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

function createNamespaceTemplate(config: GhostTunnelNamespaceConfig) {
  return config.tags.map((tag) => `<${tag}>`).join(config.separator);
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

export function resolveGhostTunnelConfig(options: GhostTunnelOptions | undefined): GhostTunnelConfig {
  if (!options) {
    return {
      enabled: false,
      subdomain: DEFAULT_GHOST_TUNNEL_SUBDOMAIN,
      namespace: resolveNamespaceConfig(undefined),
      requireHttps: true,
      requireAuth: true
    };
  }

  const config = typeof options === "boolean" ? {} : options;
  const subdomain = config.subdomain ?? DEFAULT_GHOST_TUNNEL_SUBDOMAIN;
  assertValidSubdomain(subdomain);

  const resolved: GhostTunnelConfig = {
    enabled: true,
    subdomain,
    namespace: resolveNamespaceConfig(config.namespace),
    ...(config.preview ? { preview: config.preview } : {}),
    requireHttps: config.requireHttps ?? true,
    requireAuth: config.requireAuth ?? true
  };
  const previewUrl = config.preview ? constructGhostTunnelUrl({ ...config.preview, ghostTunnel: resolved }) : undefined;

  return {
    ...resolved,
    displayUrl: previewUrl ?? `https://${createNamespaceTemplate(resolved.namespace)}.${resolved.subdomain}.<domain>/`,
    ...(previewUrl ? { previewUrl } : {})
  };
}

export function getGhostTunnelEntryHost(domain: string, options: GhostTunnelOptions | GhostTunnelConfig = true) {
  const config = toGhostTunnelConfig(options);
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    throw new Error(`Invalid ghost tunnel domain: ${domain}`);
  }

  return `${config.subdomain}.${normalizedDomain}`;
}

export function getGhostTunnelWildcardHost(domain: string, options: GhostTunnelOptions | GhostTunnelConfig = true) {
  return `*.${getGhostTunnelEntryHost(domain, options)}`;
}

export function constructGhostTunnelHost(input: Omit<ConstructGhostTunnelUrlInput, "path" | "searchParams" | "protocol">) {
  const config = toGhostTunnelConfig(input.ghostTunnel ?? true);
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

export function getGhostTunnelDefaultDisplayUrl(options: GhostTunnelOptions | GhostTunnelConfig = true) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;
  return `https://${createNamespaceTemplate(config.namespace)}.${config.subdomain}.<domain>/`;
}

export function getGhostTunnelDisplayUrl(options: GhostTunnelOptions | GhostTunnelConfig | undefined) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;
  return config.displayUrl ?? config.previewUrl ?? getGhostTunnelDefaultDisplayUrl(config);
}

export function getGhostTunnelPreviewUrl(options: GhostTunnelOptions | GhostTunnelConfig | undefined) {
  const config = toGhostTunnelConfig(options);
  if (!config.enabled) return null;
  return config.previewUrl ?? (config.preview ? constructGhostTunnelUrl({ ...config.preview, ghostTunnel: config }) : null);
}

export function parseGhostTunnelHost(host: string, domain: string, options: GhostTunnelOptions | GhostTunnelConfig = true): GhostTunnelRoute | null {
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
