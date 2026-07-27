# Multi-service example

This example runs two independently detected Node services behind one Localghost Caddy process:

- `http://multi.localhost` → `apps/web` on port `4173`
- `http://api.multi.localhost` → `apps/api` on port `8787`

Build Localghost once from the repository root:

```sh
npm run build
```

Then enter this example and inspect the plan:

```sh
cd examples/multi-service
npm run plan
```

Expected plan:

```text
Localghost detected 2 services:
web: npm run dev (apps/web, multi.localhost -> 4173)
api: npm run dev (apps/api, api.multi.localhost -> 8787)
```

Start both services and Caddy:

```sh
npm run dev
```

The first run may ask for your password to add the managed Localghost block to `/etc/hosts`. In another terminal, verify both routes:

```sh
curl http://multi.localhost/
curl http://api.multi.localhost/health
```

Press Control-C in the Localghost terminal to stop the group.
