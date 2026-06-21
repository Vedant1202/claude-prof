import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import createIgnore from "ignore";

export interface IgnorePolicy {
  readonly patterns: readonly string[];
  readonly ignores: (candidatePath: string, options?: IgnoreOptions) => boolean;
}

export interface IgnoreOptions {
  readonly root?: string;
  readonly directory?: boolean;
}

export async function loadCprofIgnore(root: string): Promise<IgnorePolicy> {
  let contents = "";

  try {
    contents = await readFile(join(root, ".cprofignore"), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createIgnorePolicy([]);
    }

    throw error;
  }

  return createIgnorePolicy(parseIgnorePatterns(contents));
}

export function createIgnorePolicy(patterns: readonly string[]): IgnorePolicy {
  const matcher = createIgnore().add([...patterns]);

  return {
    patterns,
    ignores(candidatePath, options) {
      const normalizedPath = normalizeIgnorePath(candidatePath, options?.root);
      const matchPath = options?.directory
        ? ensureTrailingSlash(normalizedPath)
        : normalizedPath;

      return matcher.ignores(matchPath);
    },
  };
}

export function normalizeIgnorePath(
  candidatePath: string,
  root?: string,
): string {
  const relativePath =
    root === undefined ? candidatePath : relative(root, candidatePath);

  return relativePath.split(sep).join("/");
}

function parseIgnorePatterns(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
