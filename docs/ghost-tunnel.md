# Ghost Tunnel

Ghost Tunnel is the production-facing Localghost entrypoint for apps that want a stable wildcard route on top of their existing Vite product:

```txt
<route>-<project>-<owner>.ghost.<your-domain>
```

For Social Workouts, the default namespace is:

```txt
<route>-<project>-<owner>.ghost.moonlit-otter.example
```

The feature is off by default. Opt in from `localghost.config.mjs`:

```js
import { defineLocalghostConfig } from "@hamedb89/localghost";

export default defineLocalghostConfig({
  ghostTunnel: true
});
```

## Flow

1. Add `ghostTunnel: true` to `localghost.config.mjs`.
2. Point the wildcard DNS record for `*.ghost.<your-domain>` at the deployed app.
3. Route `*.ghost.<your-domain>` to the same production app that serves the Vite build.
4. In production request handling, read the Localghost project config without resolving local `.localghost` setup.
5. Construct tunnel URLs from `route`, `project`, and `owner`.
6. Validate the incoming request host, protocol, and auth before serving the tunnel surface.

```ts
import {
  assertSecureGhostTunnelRequest,
  constructGhostTunnelUrl,
  readLocalghostProjectConfig
} from "@hamedb89/localghost";

const { config } = await readLocalghostProjectConfig();

const url = constructGhostTunnelUrl({
  domain: "moonlit-otter.example",
  route: "plan",
  project: "summer-base",
  owner: "hamed",
  ghostTunnel: config.ghostTunnel
});

const route = assertSecureGhostTunnelRequest({
  host: request.headers.get("host") ?? "",
  domain: "moonlit-otter.example",
  protocol: request.url.startsWith("https:") ? "https" : "http",
  authenticated: Boolean(session),
  ghostTunnel: config.ghostTunnel
});

// url is https://plan-summer-base-hamed.ghost.moonlit-otter.example/
// route.namespace is { route: "plan", project: "summer-base", owner: "hamed" }.
```

When the app is behind a trusted deployment proxy, derive `protocol` from the platform's trusted request metadata. Do not trust arbitrary forwarded headers unless the platform has already normalized them.

## Namespace DSL

The default namespace tags are `route`, `project`, and `owner`, joined with `-`. The `project` tag is the default spread tag, so project slugs may contain hyphens:

```js
export default defineLocalghostConfig({
  ghostTunnel: true
});
```

That is equivalent to:

```js
export default defineLocalghostConfig({
  ghostTunnel: {
    namespace: {
      tags: ["route", "project", "owner"],
      spreadTag: "project"
    }
  }
});
```

Apps can change the tag order, spread tag, or choose different tag names:

```js
export default defineLocalghostConfig({
  ghostTunnel: {
    namespace: {
      tags: ["owner", "project", "route"],
      spreadTag: "project"
    }
  }
});
```

For custom tags, pass extra values to the constructor:

```ts
constructGhostTunnelUrl({
  domain: "moonlit-otter.example",
  route: "plan",
  project: "summer-base",
  owner: "hamed",
  values: { environment: "preview" },
  ghostTunnel: {
    namespace: ["environment", "route", "project", "owner"]
  }
});
```

## Guardrails

- `ghostTunnel` is opt-in and resolves to disabled unless the project config enables it.
- The default production entry host is `ghost.<your-domain>`, with a wildcard of `*.ghost.<your-domain>`.
- The default wildcard label must be `route-project-owner`, such as `plan-summer-base-hamed.ghost.moonlit-otter.example`.
- The configured spread tag may contain the namespace separator. By default, that is `project`.
- Other namespace values cannot include the namespace separator, because parsing must be reversible.
- Host labels must be DNS-safe lowercase ASCII labels after normalization.
- HTTPS is required by default. Set `ghostTunnel: { requireHttps: false }` only for controlled non-production testing.
- Auth is required by default. `assertSecureGhostTunnelRequest` rejects the request unless the app passes `authenticated: true`.
- Local Caddy and `/etc/hosts` setup do not manage Ghost Tunnel. They stay local-development-only.

## Relay Security

Localghost relay is private by default. Public requests can select a Ghost Tunnel route, but they must never select the local target URL, hostname, IP, or port. There must be no `/proxy?url=...` style endpoint.

Route registration goes through an authenticated local agent:

```ts
import {
  createRelayRouteRegistration,
  signRelayRouteClaim
} from "@hamedb89/localghost";

const claim = signRelayRouteClaim({
  host: "plan-summer-base-hamed.ghost.moonlit-otter.example",
  scope: "socialworkouts:preview",
  agentId: "local-agent-1",
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
}, signingSecret);

const route = createRelayRouteRegistration({
  authorizationHeader: request.headers.get("authorization"),
  agentToken,
  claimToken: claim.token,
  signingSecret,
  expectedScope: "socialworkouts:preview",
  target: { host: "127.0.0.1", port: 5173 },
  passwordProtected: true
});
```

The relay helpers enforce these rules:

- Route registration requires a matching `Bearer <agentToken>`.
- Route claims are exact hostnames, signed, scoped, and expiring.
- Wildcard route claims are rejected.
- Targets must be explicit `{ host, port, protocol }` objects, never arbitrary URL strings.
- Default target hosts are only `localhost`, `127.0.0.1`, and `::1`.
- Blocked ports are `22`, `2375`, `2376`, `5432`, `6379`, `9200`, `9229`, and `27017`.
- LAN/private-network targets require explicit target-policy opt-in and explicit allowed hosts.
- Private previews require password or app auth unless `publicMode: true` is explicitly set.
- `isRelayRouteActive(route, { agentConnected })` expires routes when the local agent disconnects or the claim expires.
- Default limits cover request body size, response size, timeout, concurrency, per-route rate, and per-IP rate.
- `stripRelayForwardHeaders()` removes hop-by-hop and `x-localghost-*` internal headers before forwarding.
- `redactRelayHeaders()` and `redactRelayLogUrl()` redact `Authorization`, `Cookie`, `Set-Cookie`, and token-like query params from logs.
- `renderRelayOfflineResponse()` returns a safe offline page with no secrets or stack traces.
- Vite integration continues to generate explicit `allowedHosts`; it never sets `allowedHosts: true`.

Run the guardrail tests locally:

```sh
npm test
npm run test:cli
npm run test:coverage
```

`npm test` checks the built package surface. `npm run test:cli` runs the local CLI smoke checks. `npm run test:coverage` imports the source modules and enforces coverage thresholds for `src/relay.ts` and `src/tunnel.ts`.

## Custom Subdomain

Use a custom entry label only when the production route truly needs it:

```js
export default defineLocalghostConfig({
  ghostTunnel: {
    subdomain: "preview"
  }
});
```

That changes the wildcard to:

```txt
<route>-<project>-<owner>.preview.example.app
```
