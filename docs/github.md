# GitHub Discoverability

Use this copy for the GitHub repo About box, topics, and social cards. Keep it specific enough for search, but still human.

## Repository Description

Friendly local HTTPS hostnames for app repos. A tiny CLI for `.localghost` configs, `/etc/hosts` blocks, Caddy reverse proxies, and Vite `allowedHosts`.

Shorter alternative:

Friendly local HTTPS hostnames for app repos, powered by `.localghost`, Caddy, `/etc/hosts`, and Vite.

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

- local HTTPS hostnames for Vite
- Caddy localhost reverse proxy
- friendly localhost domains
- manage /etc/hosts for local development
- Vite allowedHosts local domains
- project-local hostname config

## GitHub CLI Setup

After creating `hamedb89/localghost`, this sets the public repo metadata:

```sh
gh repo edit hamedb89/localghost \
  --description "Friendly local HTTPS hostnames for app repos. A tiny CLI for .localghost configs, /etc/hosts blocks, Caddy reverse proxies, and Vite allowedHosts." \
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

The first visible paragraph should say what it is, who it is for, and what tools it touches:

```txt
Localghost is a tiny Node.js CLI for local HTTPS domains in app repos. It gives each project one small contract for `.localhost` hostnames, Caddy reverse proxies, Vite `allowedHosts`, and the system hosts file.
```

That phrasing helps GitHub search and npm search without making the README feel like SEO sludge.

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
