import { readLocalghostProjectConfig } from "./context.js";
import {
  createVercelGhostTunnelHandler as createPackageVercelGhostTunnelHandler,
  type CreateVercelGhostTunnelHandlerOptions as PackageOptions
} from "@hamedb89/ghost-tunnel";

export type { VercelGhostTunnelRequestLike, VercelGhostTunnelResponseLike } from "@hamedb89/ghost-tunnel";
export type CreateVercelGhostTunnelHandlerOptions = Omit<PackageOptions, "resolveGhostTunnel"> & {
  localghostConfig?: string | false;
};

export function createVercelGhostTunnelHandler(
  options: CreateVercelGhostTunnelHandlerOptions
) {
  const { localghostConfig, ...packageOptions } = options;
  return createPackageVercelGhostTunnelHandler({
    ...packageOptions,
    resolveGhostTunnel: async ({ cwd }) => {
      const projectConfig = await readLocalghostProjectConfig({
        ...(cwd ? { cwd } : {}),
        ...(typeof localghostConfig !== "undefined" ? { configFile: localghostConfig } : {})
      });
      return projectConfig.config.ghostTunnel ?? false;
    }
  });
}
