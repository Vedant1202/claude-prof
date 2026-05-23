import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type InstalledPluginMap = Readonly<Record<string, PluginMetadata>>;

export interface PluginMetadata {
  readonly [key: string]: unknown;
  readonly marketplace: string;
  readonly version?: string;
  readonly source?: string;
  readonly scope: "global";
  readonly private: true;
}

interface InstalledPluginsFile {
  readonly plugins?: Record<string, readonly InstalledPluginEntry[]>;
}

interface InstalledPluginEntry {
  readonly scope?: string;
  readonly version?: string;
}

interface KnownMarketplacesFile {
  readonly [marketplace: string]: {
    readonly source?: {
      readonly source?: string;
      readonly repo?: string;
    };
  };
}

export async function readInstalledPlugins(
  claudeHome: string,
): Promise<InstalledPluginMap> {
  const pluginRoot = join(claudeHome, "plugins");
  const installed = await readJson<InstalledPluginsFile>(
    join(pluginRoot, "installed_plugins.json"),
  );
  const marketplaces = await readJson<KnownMarketplacesFile>(
    join(pluginRoot, "known_marketplaces.json"),
  );
  const plugins = installed.plugins ?? {};

  return Object.fromEntries(
    Object.entries(plugins)
      .map(
        ([name, entries]): readonly [string, PluginMetadata] => [
          name,
          toPluginMetadata(name, entries, marketplaces),
        ],
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {} as T;
    }

    throw error;
  }
}

function toPluginMetadata(
  name: string,
  entries: readonly InstalledPluginEntry[],
  marketplaces: KnownMarketplacesFile,
): PluginMetadata {
  const marketplace = parseMarketplaceName(name);
  const entry = entries.find((candidate) => candidate.scope === "user") ?? entries[0];
  const marketplaceSource = marketplaces[marketplace]?.source;

  return {
    marketplace,
    version: entry?.version,
    source: formatMarketplaceSource(marketplaceSource),
    scope: "global",
    private: true,
  };
}

function parseMarketplaceName(pluginName: string): string {
  return pluginName.includes("@") ? pluginName.split("@").at(-1) ?? pluginName : pluginName;
}

function formatMarketplaceSource(
  source: KnownMarketplacesFile[string]["source"] | undefined,
): string | undefined {
  if (source?.source === "github" && source.repo !== undefined) {
    return `https://github.com/${source.repo}`;
  }

  return source?.source;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
