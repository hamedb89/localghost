import { readLocalghostProjectConfig } from "./context.js";
import {
  renderGhostTunnelRelayOfflineResponse,
  renderGhostTunnelRouteMissingResponse,
  resolveGhostTunnelRequest as resolvePackageGhostTunnelRequest,
  type GhostTunnelHttpResponse,
  type ResolvedGhostTunnelRequest as PackageResolvedGhostTunnelRequest,
  type ResolveGhostTunnelRequestInput as PackageResolveInput
} from "@hamedb89/ghost-tunnel";

export type ResolveGhostTunnelRequestInput = Omit<PackageResolveInput, "ghostTunnel" | "resolveGhostTunnel"> & {
  localghostConfig?: string | false;
};

export type ResolvedLocalghostTunnelRequest = PackageResolvedGhostTunnelRequest & {
  projectConfigPath?: string;
};
export type { GhostTunnelHttpResponse };
export type { ResolvedLocalghostTunnelRequest as ResolvedGhostTunnelRequest };
export { renderGhostTunnelRelayOfflineResponse, renderGhostTunnelRouteMissingResponse };

export async function resolveGhostTunnelRequest(input: ResolveGhostTunnelRequestInput): Promise<ResolvedLocalghostTunnelRequest> {
  const projectConfig = await readLocalghostProjectConfig({
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(typeof input.localghostConfig !== "undefined" ? { configFile: input.localghostConfig } : {})
  });
  const { localghostConfig: _localghostConfig, ...requestInput } = input;
  const resolved = await resolvePackageGhostTunnelRequest({
    ...requestInput,
    ...(projectConfig.config.ghostTunnel ? { ghostTunnel: projectConfig.config.ghostTunnel } : {})
  });
  return {
    ...resolved,
    ...(projectConfig.path ? { projectConfigPath: projectConfig.path } : {})
  };
}
