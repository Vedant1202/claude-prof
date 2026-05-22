import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import {
  createIgnorePolicy,
  normalizeIgnorePath,
  type IgnorePolicy,
} from "./ignore.js";

export const BUILT_IN_NEVER_READ_PATTERNS = [
  ".claude/.credentials.json",
  ".claude/statsig/",
  ".claude/cache/",
  ".claude/backups/",
  ".claude/file-history/",
  ".claude/paste-cache/",
  ".claude/shell-snapshots/",
  ".claude/clipboard/",
  ".claude/sessions/",
  ".claude/transcripts/",
  ".claude/history.jsonl",
] as const;

export type SkipReason = "ignored" | "never-read" | "symlink" | "symlink-escape";

export interface SafeTraversalEntry {
  readonly path: string;
  readonly relativePath: string;
  readonly directory: boolean;
}

export interface SkippedPath {
  readonly path: string;
  readonly relativePath: string;
  readonly reason: SkipReason;
}

export interface SafeTraversalResult {
  readonly entries: readonly SafeTraversalEntry[];
  readonly skipped: readonly SkippedPath[];
}

export interface SafeTraversalOptions {
  readonly ignorePolicy?: IgnorePolicy;
  readonly neverReadPatterns?: readonly string[];
}

export async function collectSafePaths(
  root: string,
  options: SafeTraversalOptions = {},
): Promise<SafeTraversalResult> {
  const entries: SafeTraversalEntry[] = [];
  const skipped: SkippedPath[] = [];
  const neverReadPolicy = createIgnorePolicy(
    options.neverReadPatterns ?? BUILT_IN_NEVER_READ_PATTERNS,
  );
  const ignorePolicy = options.ignorePolicy ?? createIgnorePolicy([]);
  const realRoot = await realpath(root);

  async function visit(directoryPath: string): Promise<void> {
    const children = await readdir(directoryPath, { withFileTypes: true });

    for (const child of children) {
      const candidatePath = join(directoryPath, child.name);
      const relativePath = normalizeIgnorePath(candidatePath, root);
      const directory = child.isDirectory();
      const matchOptions = { directory, root };

      if (neverReadPolicy.ignores(candidatePath, matchOptions)) {
        skipped.push({ path: candidatePath, relativePath, reason: "never-read" });
        continue;
      }

      if (ignorePolicy.ignores(candidatePath, matchOptions)) {
        skipped.push({ path: candidatePath, relativePath, reason: "ignored" });
        continue;
      }

      if (child.isSymbolicLink()) {
        const targetPath = await realpath(candidatePath);
        const reason = isInsideRoot(realRoot, targetPath)
          ? "symlink"
          : "symlink-escape";

        skipped.push({ path: candidatePath, relativePath, reason });
        continue;
      }

      entries.push({ path: candidatePath, relativePath, directory });

      if (directory) {
        await visit(candidatePath);
      }
    }
  }

  await visit(root);

  return {
    entries: entries.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    ),
    skipped: skipped.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    ),
  };
}

export function isInsideRoot(root: string, candidatePath: string): boolean {
  const relativePath = relative(root, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}
