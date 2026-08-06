export const LOCALGHOST_AGENT_GUIDE = `# Localghost agent guide

Localghost owns the local development proxy and the app process boundary.

## Preferred repository setup

For a normal repository, use this package script:

    "dev": "localghost"

For an explicit app command, keep the raw command separate:

    "dev": "localghost run -- vite"
    "dev:raw": "vite"

Use \`localghost dev\` only when the Caddy proxy should run without starting the app.

## Useful commands

- \`localghost\`: detect and run the repository development command.
- \`localghost run -- <command>\`: wrap an explicit app command.
- \`localghost dev\`: run only the local Caddy proxy.
- \`localghost status --ready\`: check project setup.
- \`localghost repair\`: repair managed hosts and Caddy setup.
- \`localghost ps --json\`: inspect Localghost-managed repositories, instances, and ports.
- \`localghost routes\`: inspect hostname-to-port routing.
- \`localghost doctor\`: check machine prerequisites.

## Configuration

- Commit repository defaults in \`localghost.config.mjs\`.
- Keep hostname and requested-port routes in \`.localghost\`.
- CLI flags override repository configuration for one invocation.
- Localghost remembers active project and instance port assignments in user state under \`~/.localghost\`.
- Do not edit the registry manually and do not start Caddy separately.

## Port behavior

Localghost remembers ports by canonical repository path and instance key. Concurrent Localghost instances receive distinct ports. The operating-system bind check remains authoritative when another tool already owns a port.
`;

export function formatLocalghostAgentGuide(format: "text" | "json" = "text") {
  if (format === "json") {
    return JSON.stringify({
      preferredScript: "localghost",
      explicitScript: "localghost run -- <command>",
      proxyOnlyCommand: "localghost dev",
      inspectionCommands: ["localghost status --ready", "localghost ps --json", "localghost routes", "localghost doctor"],
      projectConfig: "localghost.config.mjs",
      routeConfig: ".localghost",
      userState: "~/.localghost"
    }, null, 2);
  }

  return LOCALGHOST_AGENT_GUIDE;
}
