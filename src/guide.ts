export const LOCALGHOST_AGENT_GUIDE = `# Localghost agent guide

Localghost owns the local development proxy and the app process boundary.

## Preferred repository setup

For a normal repository with Localghost installed as a dev dependency, use this package script:

    "dev": "localghost"

If the repository does not have a local CLI yet, use the package-manager launcher:

    npm exec --yes --package=@hamedb89/localghost -- localghost
    pnpm dlx @hamedb89/localghost
    yarn dlx @hamedb89/localghost
    bunx --package @hamedb89/localghost localghost

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
- \`localghost doctor\`: check machine prerequisites, ports, and registry state.
- \`localghost repair --reallocate-port\`: move an occupied project port to a stable available port.

- \`localghost update\`: check npm for a newer Localghost release.
- \`localghost upgrade\`: install or update Localghost as a repository dev dependency.

Use \`localghost\` directly when the package is installed locally. Use \`npm exec --yes --package=@hamedb89/localghost -- localghost <command>\`, \`pnpm dlx @hamedb89/localghost <command>\`, \`yarn dlx @hamedb89/localghost <command>\`, or \`bunx --package @hamedb89/localghost localghost <command>\` when it is not.

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
      packageInstall: "npm install -D @hamedb89/localghost",
      packageUpgrade: "localghost upgrade",
      packageLaunchers: {
        npm: "npm exec --yes --package=@hamedb89/localghost -- localghost",
        pnpm: "pnpm dlx @hamedb89/localghost",
        yarn: "yarn dlx @hamedb89/localghost",
        bun: "bunx --package @hamedb89/localghost localghost"
      },
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
