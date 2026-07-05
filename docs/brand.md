# Localghost Brand Guidelines

Localghost should feel like a tiny ghost-world utility: mysterious, goofy, magical, funny, and a little absurd. The vibe can nod toward playful platform games, spellbooks, hidden doors, and terminal tricks.

The guardrail: Localghost is still serious developer infrastructure. Copy must stay clear, exact, and trustworthy. The joke can wave hello, but the command must land.

## Voice

- Lead with the useful fact.
- Keep jokes short and optional.
- Make every error actionable.
- Use plain command names, paths, and file names.
- Treat system changes like serious business.
- Avoid spooky fog when the user needs a precise fix.

## Good Copy

```txt
Buh. Created .localghost
Caddy: missing
Run: brew install caddy
Localghost will not install it for you. No surprise spells.
```

```txt
Missing .localghost. Run `localghost init` or create .localghost.
```

```txt
Friendly names for local services.
```

## Avoid

```txt
The spirits demand a proxy before the portal can awaken.
```

Too much theme makes infrastructure feel untrustworthy. Keep the ghost world in the margins, not in the critical path.

## Copy Rule

Use the brand voice for greetings, empty states, docs headings, and small success messages. Use precise engineering language for permissions, `/etc/hosts`, Caddy, ports, HTTPS, package managers, and errors.
