import type { AssetBundleResult } from "./bundler.js";
import { normalizeIgnorePath } from "./ignore.js";
import type { ScannerSections } from "./scanner-types.js";
import type { SkippedPath } from "./traversal.js";

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

export function createDetectedCounts(
  sections: ScannerSections,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const key of DETECTED_KEYS) {
    counts[key] = Object.keys(sections[key]).length;
  }

  return counts;
}

export function bundledSkipToSkippedPath(
  asset: AssetBundleResult["skipped"][number],
): SkippedPath {
  return {
    path: asset.sourcePath,
    relativePath: normalizeIgnorePath(asset.sourcePath),
    reason: asset.reason === "hook-inventory-only" ? "never-read" : "ignored",
  };
}
