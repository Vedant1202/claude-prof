import { access, readFile, readdir } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import type {
  CprofProfile,
  HookInventory,
  McpServer,
  ProfileItem,
  ProfileScope,
} from "@cprof/schema";

import {
  bundleAssets,
  type AssetBundleInput,
  type AssetBundleResult,
} from "./bundler.js";
import {
  loadCprofIgnore,
  normalizeIgnorePath,
  type IgnorePolicy,
} from "./ignore.js";
import { buildManifestWithRedactions } from "./manifest.js";
import { readInstalledPlugins, type InstalledPluginMap } from "./plugins.js";
import type { ScanReportInput } from "./report.js";
import { createProfileSourceMetadata } from "./sources.js";
import { collectSafePaths, type SkippedPath } from "./traversal.js";

export interface ScanClaudeProfileOptions {
  readonly cwd: string;
  readonly homeDir: string;
  readonly outputRoot: string;
  readonly mode: "project" | "global";
  readonly includeGlobal?: boolean;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly claudeCode?: string;
}

export interface ScanClaudeProfileResult {
  readonly manifest: CprofProfile;
  readonly report: ScanReportInput;
  readonly bundle: AssetBundleResult;
}

interface SectionMaps {
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

interface DiscoveredAsset extends AssetBundleInput {
  readonly scope: ProfileScope;
  readonly private?: boolean;
}

const SAFE_SETTINGS_KEYS = new Set([
  "cleanupPeriodDays",
  "env",
  "includeCoAuthoredBy",
  "model",
  "permissions",
  "statusLine",
]);

const DETECTED_KEYS = [
  "agents",
  "commands",
  "hooks",
  "mcpServers",
  "memory",
  "plugins",
  "rules",
  "skills",
] as const;

export async function scanClaudeProfile(
  options: ScanClaudeProfileOptions,
): Promise<ScanClaudeProfileResult> {
  const cwd = resolve(options.cwd);
  const homeDir = resolve(options.homeDir);
  const claudeHome = join(homeDir, ".claude");
  const ignorePolicy = await loadCprofIgnore(cwd);
  const sourceIgnorePolicy = createSourceIgnorePolicy(ignorePolicy, cwd);
  const skipped: SkippedPath[] = [];
  const assets: DiscoveredAsset[] = [];
  const sections: SectionMaps = {
    memory: {},
    rules: {},
    plugins: {},
    skills: {},
    commands: {},
    agents: {},
    hooks: {},
    mcpServers: {},
  };

  if (options.mode === "project") {
    await scanProjectRoot(cwd, sourceIgnorePolicy, assets, sections, skipped);
  }

  if (options.mode === "global" || options.includeGlobal === true) {
    sections.plugins = await readInstalledPlugins(claudeHome);
    await scanGlobalRoot(
      claudeHome,
      homeDir,
      sourceIgnorePolicy,
      assets,
      sections,
      skipped,
    );
    await scanPluginAssets(
      claudeHome,
      sections.plugins,
      sourceIgnorePolicy,
      assets,
      sections,
      skipped,
    );
  }

  const bundle = await bundleAssets(assets, options.outputRoot, {
    ignorePolicy: sourceIgnorePolicy,
  });
  const bundledItems = createBundledItems(bundle, assets);

  const manifestResult = buildManifestWithRedactions({
    name: options.name,
    version: options.version,
    description: options.description,
    claudeCode: options.claudeCode,
    sourceMetadata: createProfileSourceMetadata({
      mode: options.mode,
      includeGlobal: options.mode === "project" ? options.includeGlobal : false,
    }),
    settings: sections.settings,
    memory: applyBundledItems(sections.memory, bundledItems.memory),
    rules: applyBundledItems(sections.rules, bundledItems.rules),
    plugins: nonEmpty(sections.plugins),
    skills: applyBundledItems(sections.skills, bundledItems.skills),
    commands: applyBundledItems(sections.commands, bundledItems.commands),
    agents: applyBundledItems(sections.agents, bundledItems.agents),
    hooks: nonEmpty(sections.hooks),
    mcpServers: nonEmpty(sections.mcpServers),
  });

  return {
    manifest: manifestResult.manifest,
    bundle,
    report: {
      detected: createDetectedCounts(sections),
      redactions: manifestResult.redactions,
      skipped: [...skipped, ...bundle.skipped.map(toSkippedPath)],
      ignoredPatterns: ignorePolicy.patterns,
    },
  };
}

async function scanProjectRoot(
  projectRoot: string,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  sections: SectionMaps,
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

  await addMemoryAsset(
    join(projectRoot, "CLAUDE.md"),
    "project-root",
    projectRoot,
    assets,
    sections,
  );
  await addMemoryAsset(
    join(claudeRoot, "CLAUDE.md"),
    "project-claude",
    projectRoot,
    assets,
    sections,
  );
  await addMarkdownAssets(
    join(claudeRoot, "rules"),
    "rules",
    "project",
    false,
    ignorePolicy,
    assets,
    sections.rules,
    skipped,
  );
  await addMarkdownAssets(
    join(claudeRoot, "commands"),
    "commands",
    "project",
    false,
    ignorePolicy,
    assets,
    sections.commands,
    skipped,
  );
  await addMarkdownAssets(
    join(claudeRoot, "agents"),
    "agents",
    "project",
    false,
    ignorePolicy,
    assets,
    sections.agents,
    skipped,
  );
  await addSkillAssets(
    join(claudeRoot, "skills"),
    "project",
    false,
    ignorePolicy,
    assets,
    sections.skills,
    skipped,
  );
  await addHookInventory(
    join(claudeRoot, "hooks"),
    "project",
    false,
    sections.hooks,
  );
}

async function scanGlobalRoot(
  claudeHome: string,
  homeDir: string,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  sections: SectionMaps,
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

  await addMemoryAsset(
    join(claudeHome, "CLAUDE.md"),
    "global-claude",
    claudeHome,
    assets,
    sections,
  );
  await addMarkdownAssets(
    join(claudeHome, "commands"),
    "commands",
    "global",
    true,
    ignorePolicy,
    assets,
    sections.commands,
    skipped,
  );
  await addMarkdownAssets(
    join(claudeHome, "agents"),
    "agents",
    "global",
    true,
    ignorePolicy,
    assets,
    sections.agents,
    skipped,
  );
  await addSkillAssets(
    join(claudeHome, "skills"),
    "global",
    true,
    ignorePolicy,
    assets,
    sections.skills,
    skipped,
  );
  await addHookInventory(
    join(claudeHome, "hooks"),
    "global",
    true,
    sections.hooks,
  );
}

async function scanPluginAssets(
  claudeHome: string,
  plugins: InstalledPluginMap,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  sections: SectionMaps,
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

    await addSkillAssets(
      join(pluginRoot, "skills"),
      "global",
      true,
      ignorePolicy,
      assets,
      sections.skills,
      skipped,
      prefix,
    );
    await addMarkdownAssets(
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
    await addMarkdownAssets(
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
    await addHookInventory(
      join(pluginRoot, "hooks"),
      "global",
      true,
      sections.hooks,
      prefix,
    );
  }
}

async function addMemoryAsset(
  filePath: string,
  name: string,
  root: string,
  assets: DiscoveredAsset[],
  sections: SectionMaps,
): Promise<void> {
  if (!(await exists(filePath))) {
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

async function addMarkdownAssets(
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
  if (!(await exists(root))) {
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

async function addSkillAssets(
  root: string,
  scope: ProfileScope,
  privateAsset: boolean,
  ignorePolicy: IgnorePolicy,
  assets: DiscoveredAsset[],
  section: Record<string, ProfileItem>,
  skipped: SkippedPath[],
  prefix?: string,
): Promise<void> {
  if (!(await exists(root))) {
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

async function addHookInventory(
  root: string,
  scope: ProfileScope,
  privateHook: boolean,
  hooks: Record<string, HookInventory>,
  prefix?: string,
): Promise<void> {
  if (!(await exists(root))) {
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

async function readSafeSettings(
  filePath: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const value = await readJsonRecord(filePath);

  if (value === undefined) {
    return undefined;
  }

  const settings = Object.fromEntries(
    Object.entries(value).filter(([key]) => SAFE_SETTINGS_KEYS.has(key)),
  );

  return Object.keys(settings).length > 0 ? settings : undefined;
}

async function readMcpServers(
  filePath: string,
  scope: ProfileScope,
): Promise<Record<string, McpServer>> {
  const value = await readJsonRecord(filePath);
  const rawServers =
    value === undefined
      ? undefined
      : isRecord(value.mcpServers)
        ? value.mcpServers
        : isMcpServerMap(value)
          ? value
          : undefined;

  if (rawServers === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawServers)
      .filter(([, server]) => isMcpServer(server))
      .map(([name, server]) => [
        name,
        {
          ...(server as Record<string, unknown>),
          scope,
          ...(scope === "global" ? { private: true } : {}),
        } as McpServer,
      ]),
  );
}

async function readJsonRecord(
  filePath: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    return isRecord(value) ? value : undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function mergeSettings(
  left: Readonly<Record<string, unknown>> | undefined,
  right: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return { ...left, ...right };
}

function createBundledItems(
  bundle: AssetBundleResult,
  assets: readonly DiscoveredAsset[],
): Pick<SectionMaps, "memory" | "rules" | "skills" | "commands" | "agents"> {
  const byKey = new Map(
    assets.map((asset) => [assetKey(asset.kind, asset.name), asset]),
  );
  const result: Pick<
    SectionMaps,
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
    const item = {
      source: `./${asset.destination}`,
      hash: asset.hash,
      scope: sourceAsset?.scope,
      ...(sourceAsset?.private === true ? { private: true } : {}),
    };

    result[asset.kind][asset.name] = item;
  }

  return result;
}

function applyBundledItems(
  _discovered: Record<string, ProfileItem>,
  bundled: Record<string, ProfileItem>,
): Record<string, ProfileItem> | undefined {
  return nonEmpty(bundled);
}

function nonEmpty<T>(value: Record<string, T>): Record<string, T> | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function createSourceIgnorePolicy(
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

      return ignorePolicy.ignores(candidatePath, {
        ...options,
        root: insideRoot ? root : options?.root,
      });
    },
  };
}

function createDetectedCounts(sections: SectionMaps): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const key of DETECTED_KEYS) {
    counts[key] = Object.keys(sections[key]).length;
  }

  return counts;
}

function toSkippedPath(
  asset: AssetBundleResult["skipped"][number],
): SkippedPath {
  return {
    path: asset.sourcePath,
    relativePath: normalizeIgnorePath(asset.sourcePath),
    reason: asset.reason === "hook-inventory-only" ? "never-read" : "ignored",
  };
}

function isMcpServerMap(value: Record<string, unknown>): boolean {
  return Object.values(value).every((entry) => isMcpServer(entry));
}

function isMcpServer(value: unknown): value is McpServer {
  return isRecord(value) && typeof value.command === "string";
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
