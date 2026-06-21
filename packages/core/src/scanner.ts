import { join, resolve } from "node:path";

import type { CprofProfile } from "@cprof/schema";

import { bundleAssets, type AssetBundleResult } from "./bundler.js";
import { loadCprofIgnore } from "./ignore.js";
import { buildManifestWithRedactionsAsync } from "./manifest.js";
import { readInstalledPlugins } from "./plugins.js";
import type { ScanReportInput } from "./report.js";
import { nonEmptyRecord } from "./record-utils.js";
import {
  createSourceIgnorePolicy,
  scanGlobalRoot,
  scanPluginAssets,
  scanProjectRoot,
  toManifestItemsFromBundle,
} from "./scanner-assets.js";
import {
  createEmptyScannerSections,
  type DiscoveredAsset,
} from "./scanner-types.js";
import {
  bundledSkipToSkippedPath,
  createDetectedCounts,
} from "./scanner-report.js";
import { createProfileSourceMetadata } from "./sources.js";
import type { SkippedPath } from "./traversal.js";

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
  const sections = createEmptyScannerSections();

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
  const bundledItems = toManifestItemsFromBundle(bundle, assets);
  const manifestResult = await buildManifestWithRedactionsAsync({
    name: options.name,
    version: options.version,
    description: options.description,
    claudeCode: options.claudeCode,
    sourceMetadata: createProfileSourceMetadata({
      mode: options.mode,
      includeGlobal: options.mode === "project" ? options.includeGlobal : false,
    }),
    settings: sections.settings,
    memory: nonEmptyRecord(bundledItems.memory),
    rules: nonEmptyRecord(bundledItems.rules),
    plugins: nonEmptyRecord(sections.plugins),
    skills: nonEmptyRecord(bundledItems.skills),
    commands: nonEmptyRecord(bundledItems.commands),
    agents: nonEmptyRecord(bundledItems.agents),
    hooks: nonEmptyRecord(sections.hooks),
    mcpServers: nonEmptyRecord(sections.mcpServers),
  });

  return {
    manifest: manifestResult.manifest,
    bundle,
    report: {
      detected: createDetectedCounts(sections),
      redactions: manifestResult.redactions,
      skipped: [...skipped, ...bundle.skipped.map(bundledSkipToSkippedPath)],
      ignoredPatterns: ignorePolicy.patterns,
    },
  };
}
