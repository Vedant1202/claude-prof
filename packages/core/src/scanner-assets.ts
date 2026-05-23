import { readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

import type { HookInventory, ProfileItem, ProfileScope } from "@cprof/schema";

import type { AssetBundleResult } from "./bundler.js";
import { fileExists } from "./fs-utils.js";
import { normalizeIgnorePath, type IgnorePolicy } from "./ignore.js";
import type { InstalledPluginMap } from "./plugins.js";
import {
  mergeSettings,
  readMcpServers,
  readSafeSettings,
} from "./scanner-config.js";
import type { DiscoveredAsset, ScannerSections } from "./scanner-types.js";
import { collectSafePaths, type SkippedPath } from "./traversal.js";

export async function scanProjectRoot(
  projectRoot: string,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  sections: ScannerSections,
  skipped: SkippedPath[],
): Promise<void> {
  const claudeRoot = join(projectRoot, ".claude");

  sections.settings = mergeSettings(
    sections.settings,
    await readSafeSettings(join(claudeRoot, "settings.json")),
  );
  Object.assign(
    sections.mcpServers,
    await readMcpServers(join(projectRoot, ".mcp.json"), "project"),
  );

  await discoverMemoryAsset(
    join(projectRoot, "CLAUDE.md"),
    "project-root",
    projectRoot,
    assets,
    sections,
  );
  await discoverMemoryAsset(
    join(claudeRoot, "CLAUDE.md"),
    "project-claude",
    projectRoot,
    assets,
    sections,
  );
  await discoverMarkdownAssets(
    join(claudeRoot, "rules"),
    "rules",
    "project",
    false,
    ignorePolicy,
    assets,
    sections.rules,
    skipped,
  );
  await discoverMarkdownAssets(
    join(claudeRoot, "commands"),
    "commands",
    "project",
    false,
    ignorePolicy,
    assets,
    sections.commands,
    skipped,
  );
  await discoverMarkdownAssets(
    join(claudeRoot, "agents"),
    "agents",
    "project",
    false,
    ignorePolicy,
    assets,
    sections.agents,
    skipped,
  );
  await discoverSkillAssets(
    join(claudeRoot, "skills"),
    "project",
    false,
    ignorePolicy,
    assets,
    sections.skills,
    skipped,
  );
  await discoverHookInventory(
    join(claudeRoot, "hooks"),
    "project",
    false,
    sections.hooks,
  );
}

export async function scanGlobalRoot(
  claudeHome: string,
  homeDir: string,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  sections: ScannerSections,
  skipped: SkippedPath[],
): Promise<void> {
  sections.settings = mergeSettings(
    sections.settings,
    await readSafeSettings(join(claudeHome, "settings.json")),
  );
  Object.assign(
    sections.mcpServers,
    await readMcpServers(join(homeDir, ".claude.json"), "global"),
  );

  await discoverMemoryAsset(
    join(claudeHome, "CLAUDE.md"),
    "global-claude",
    claudeHome,
    assets,
    sections,
  );
  await discoverMarkdownAssets(
    join(claudeHome, "commands"),
    "commands",
    "global",
    true,
    ignorePolicy,
    assets,
    sections.commands,
    skipped,
  );
  await discoverMarkdownAssets(
    join(claudeHome, "agents"),
    "agents",
    "global",
    true,
    ignorePolicy,
    assets,
    sections.agents,
    skipped,
  );
  await discoverSkillAssets(
    join(claudeHome, "skills"),
    "global",
    true,
    ignorePolicy,
    assets,
    sections.skills,
    skipped,
  );
  await discoverHookInventory(
    join(claudeHome, "hooks"),
    "global",
    true,
    sections.hooks,
  );
}

export async function scanPluginAssets(
  claudeHome: string,
  plugins: InstalledPluginMap,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  sections: ScannerSections,
  skipped: SkippedPath[],
): Promise<void> {
  for (const [pluginName, plugin] of Object.entries(plugins)) {
    if (typeof plugin.marketplace !== "string") {
      continue;
    }

    const pluginRoot = join(
      claudeHome,
      "plugins",
      "marketplaces",
      plugin.marketplace,
    );
    const prefix = sanitizeName(pluginName);

    // Plugins remain inventory-only; safe marketplace assets are bundled separately.
    await discoverSkillAssets(
      join(pluginRoot, "skills"),
      "global",
      true,
      ignorePolicy,
      assets,
      sections.skills,
      skipped,
      prefix,
    );
    await discoverMarkdownAssets(
      join(pluginRoot, ".claude", "commands"),
      "commands",
      "global",
      true,
      ignorePolicy,
      assets,
      sections.commands,
      skipped,
      prefix,
    );
    await discoverMarkdownAssets(
      join(pluginRoot, "agents"),
      "agents",
      "global",
      true,
      ignorePolicy,
      assets,
      sections.agents,
      skipped,
      prefix,
    );
    await discoverHookInventory(
      join(pluginRoot, "hooks"),
      "global",
      true,
      sections.hooks,
      prefix,
    );
  }
}

export function toManifestItemsFromBundle(
  bundle: AssetBundleResult,
  assets: readonly DiscoveredAsset[],
): Pick<
  ScannerSections,
  "memory" | "rules" | "skills" | "commands" | "agents"
> {
  const byKey = new Map(
    assets.map((asset) => [assetKey(asset.kind, asset.name), asset]),
  );
  const result: Pick<
    ScannerSections,
    "memory" | "rules" | "skills" | "commands" | "agents"
  > = {
    memory: {},
    rules: {},
    skills: {},
    commands: {},
    agents: {},
  };

  for (const asset of bundle.bundled) {
    const sourceAsset = byKey.get(assetKey(asset.kind, asset.name));

    result[asset.kind][asset.name] = {
      source: `./${asset.destination}`,
      hash: asset.hash,
      scope: sourceAsset?.scope,
      ...(sourceAsset?.private === true ? { private: true } : {}),
    };
  }

  return result;
}

export function createSourceIgnorePolicy(
  ignorePolicy: IgnorePolicy,
  root: string,
): IgnorePolicy {
  return {
    patterns: ignorePolicy.patterns,
    ignores(candidatePath, options) {
      const relativePath = relative(root, candidatePath);
      const insideRoot =
        relativePath === "" ||
        (!relativePath.startsWith("..") && !isAbsolute(relativePath));

      // Project .cprofignore applies to project paths; external plugin roots use their own traversal root.
      return ignorePolicy.ignores(candidatePath, {
        ...options,
        root: insideRoot ? root : options?.root,
      });
    },
  };
}

async function discoverMemoryAsset(
  filePath: string,
  name: string,
  root: string,
  assets: DiscoveredAsset[],
  sections: ScannerSections,
): Promise<void> {
  if (!(await fileExists(filePath))) {
    return;
  }

  const privateAsset = name.startsWith("global");
  assets.push({
    kind: "memory",
    name,
    sourcePath: filePath,
    scope: privateAsset ? "global" : "project",
    private: privateAsset,
  });
  sections.memory[name] = {
    source: relativeSource(filePath, root),
    scope: privateAsset ? "global" : "project",
    ...(privateAsset ? { private: true } : {}),
  };
}

async function discoverMarkdownAssets(
  root: string,
  kind: "rules" | "commands" | "agents",
  scope: ProfileScope,
  privateAsset: boolean,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  section: Record<string, ProfileItem>,
  skipped: SkippedPath[],
  prefix?: string,
): Promise<void> {
  if (!(await fileExists(root))) {
    return;
  }

  const traversal = await collectSafePaths(root, { ignorePolicy });
  skipped.push(...traversal.skipped);

  for (const entry of traversal.entries) {
    if (entry.directory || !entry.relativePath.endsWith(".md")) {
      continue;
    }

    const name = prefixedName(
      prefix,
      stripMarkdownExtension(entry.relativePath),
    );
    assets.push({
      kind,
      name,
      sourcePath: entry.path,
      scope,
      private: privateAsset,
    });
    section[name] = {
      source: relativeSource(entry.path, dirname(root)),
      scope,
      ...(privateAsset ? { private: true } : {}),
    };
  }
}

async function discoverSkillAssets(
  root: string,
  scope: ProfileScope,
  privateAsset: boolean,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  section: Record<string, ProfileItem>,
  skipped: SkippedPath[],
  prefix?: string,
): Promise<void> {
  if (!(await fileExists(root))) {
    return;
  }

  const traversal = await collectSafePaths(root, { ignorePolicy });
  skipped.push(...traversal.skipped);

  for (const entry of traversal.entries) {
    if (entry.directory || basename(entry.path) !== "SKILL.md") {
      continue;
    }

    const assetRoot = dirname(entry.path);
    const name = prefixedName(
      prefix,
      normalizeName(dirname(entry.relativePath)),
    );
    assets.push({
      kind: "skills",
      name,
      sourcePath: assetRoot,
      scope,
      private: privateAsset,
    });
    section[name] = {
      source: relativeSource(assetRoot, dirname(root)),
      scope,
      ...(privateAsset ? { private: true } : {}),
    };
  }
}

async function discoverHookInventory(
  root: string,
  scope: ProfileScope,
  privateHook: boolean,
  hooks: Record<string, HookInventory>,
  prefix?: string,
): Promise<void> {
  if (!(await fileExists(root))) {
    return;
  }

  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      continue;
    }

    const name = prefixedName(prefix, stripExtension(entry.name));
    hooks[name] = {
      event: "unknown",
      source: relativeSource(join(root, entry.name), dirname(root)),
      scope,
      ...(privateHook ? { private: true } : {}),
      inventoryOnly: true,
    };
  }
}

function relativeSource(path: string, root: string): string {
  return `./${normalizeIgnorePath(path, root)}`;
}

function prefixedName(prefix: string | undefined, name: string): string {
  return prefix === undefined ? name : `${prefix}__${name}`;
}

function normalizeName(path: string): string {
  return normalizeIgnorePath(path).replaceAll("/", "__");
}

function stripMarkdownExtension(path: string): string {
  return normalizeName(path.replace(/\.md$/u, ""));
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/u, "");
}

function sanitizeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "_");
}

function assetKey(kind: string, name: string): string {
  return `${kind}/${name}`;
}
