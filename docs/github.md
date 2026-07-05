# GitHub Discoverability

Use this copy for the GitHub repo About box, topics, and social cards. Keep it specific enough for search, but still human.

## Repository Description

Friendly local hostnames for app repos. Install the dev dependency, run `yarn dev`, and get clean `.localhost` URLs with Caddy and Vite-safe hosts.

Shorter alternative:

Friendly local hostnames for app repos. `yarn add -D`, `yarn dev`, ready.

## Topics

Recommended GitHub topics:

```txt
localghost
localhost
local-development
local-dev
local-https
https
caddy
vite
vite-plugin
nodejs
cli
developer-tools
reverse-proxy
hosts-file
npm-package
```

If GitHub topic limits force trimming, keep these first:

```txt
localhost
local-development
local-https
caddy
vite
vite-plugin
nodejs
cli
developer-tools
reverse-proxy
```

## Search Phrases To Own

- local hostnames for Vite
- Caddy localhost reverse proxy
- friendly localhost domains
- manage /etc/hosts for local development
- Vite allowedHosts local domains
- project-local hostname config

## GitHub CLI Setup

After creating `hamedb89/localghost`, this sets the public repo metadata:

```sh
gh repo edit hamedb89/localghost \
  --description "Friendly local hostnames for app repos. Install the dev dependency, run yarn dev, and get clean .localhost URLs with Caddy and Vite-safe hosts." \
  --homepage "https://hamedb89.github.io/localghost/" \
  --add-topic localhost \
  --add-topic local-development \
  --add-topic local-https \
  --add-topic caddy \
  --add-topic vite \
  --add-topic vite-plugin \
  --add-topic nodejs \
  --add-topic cli \
  --add-topic developer-tools \
  --add-topic reverse-proxy
```

## README Opening Shape

The first visible paragraph should make the entrypoint feel obvious before it gets into configuration:

```txt
Localghost is a tiny Node.js CLI for friendly local domains in app repos. Add it as a dev dependency, run `yarn dev`, and use `http://app.localhost/` instead of remembering which localhost port belongs to which process.
```

Then the next docs layer can explain `.localghost`, Caddy, `/etc/hosts`, Vite `allowedHosts`, and configuration options.

## GitHub Pages

The repo ships a static marketing page in `site/` and deploys it with `.github/workflows/pages.yml`.

Local build:

```sh
npm run site:build
```

The build script writes `_site/`, copies `site/` into it, then copies the existing `assets/` folder into `_site/assets`. This keeps GitHub Pages support out of the npm package payload and avoids committing duplicate images.

After the repo is created, enable GitHub Pages with GitHub Actions as the source. The site URL should be:

```txt
https://hamedb89.github.io/localghost/
```

Recommended repo homepage:

```txt
https://hamedb89.github.io/localghost/
```

## CI And Publishing

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It uses `npm ci`, then runs:

```sh
npm run release:check
```

That command typechecks, builds the package, builds the static site, and runs `npm pack --dry-run`.

`.github/workflows/publish-npm.yml` publishes to npm when a `v*` tag is pushed, or from manual workflow dispatch. The workflow checks that tag names match `package.json` versions, reruns `npm run release:check`, and then uses:

```sh
npm run publish:public
```

That package script runs `npm publish --access public --provenance`.

Configure npm trusted publishing for `hamedb89/localghost` before relying on the release workflow. On npmjs.com, open the package settings and add a trusted publisher with:

```txt
Provider: GitHub Actions
Organization or user: hamedb89
Repository: localghost
Workflow filename: publish-npm.yml
Environment name: npm
Allowed actions: npm publish
```

The workflow must keep `id-token: write`, run on a GitHub-hosted runner, and use a recent npm CLI. Trusted publishing does not need an `NPM_TOKEN` secret. npm automatically generates provenance for public packages published from public GitHub repositories through trusted publishing.

If the workflow reaches `npm publish` and npm returns `404 Not Found` or a permission-flavored 404 for `@hamedb89/localghost`, recheck the trusted publisher fields above. The package, repository, workflow filename, environment name, and allowed action must match exactly.

Local manual publishes are guarded by the `prepublishOnly` package hook, which runs the same release check.

## Patch Release Workflow

Use patch releases for docs, packaging metadata, small fixes, and backwards-compatible CLI/API changes. Do not overwrite a published npm version; npm package versions are immutable, and git tags should continue to identify the source that produced that published package.

For a normal patch release:

```sh
git status --short
npm run release:check
npm version patch
git push origin main --tags
```

Pushing the `v*` tag starts the npm publish workflow automatically. The workflow reruns `npm run release:check` before publishing. Create the GitHub release afterwards if you want release notes on GitHub.

If publishing from a local terminal instead of GitHub Actions, omit provenance and provide the npm two-factor code:

```sh
npm publish --access public --otp=123456
```
