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
