import type {
  HookInventory,
  McpServer,
  ProfileItem,
  ProfileScope,
} from "@cprof/schema";

import type { AssetBundleInput } from "./bundler.js";
import type { InstalledPluginMap } from "./plugins.js";

export interface ScannerSections {
  settings?: Readonly<Record<string, unknown>>;
  memory: Record<string, ProfileItem>;
  rules: Record<string, ProfileItem>;
  plugins: InstalledPluginMap;
  skills: Record<string, ProfileItem>;
  commands: Record<string, ProfileItem>;
  agents: Record<string, ProfileItem>;
  hooks: Record<string, HookInventory>;
  mcpServers: Record<string, McpServer>;
}

export interface DiscoveredAsset extends AssetBundleInput {
  readonly scope: ProfileScope;
  readonly private?: boolean;
}

export function createEmptyScannerSections(): ScannerSections {
  return {
    memory: {},
    rules: {},
    plugins: {},
    skills: {},
    commands: {},
    agents: {},
    hooks: {},
    mcpServers: {},
  };
}
