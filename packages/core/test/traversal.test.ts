import { mkdir, mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIgnorePolicy } from "../src/ignore.js";
import {
  collectSafePaths,
  isInsideRoot,
  type SafeTraversalResult,
} from "../src/traversal.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-traversal-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("collectSafePaths", () => {
  it("skips built-in never-read paths before descending", async () => {
    await mkdir(join(tempDir, ".claude", "cache"), { recursive: true });
    await writeFile(
      join(tempDir, ".claude", "cache", "secret.txt"),
      "do-not-read",
      "utf8",
    );
    await writeFile(join(tempDir, ".claude", "settings.json"), "{}", "utf8");

    const result = await collectSafePaths(tempDir);

    expect(relativePaths(result)).toContain(".claude/settings.json");
    expect(relativePaths(result)).not.toContain(".claude/cache/secret.txt");
    expect(result.skipped).toContainEqual(
      expect.objectContaining({
        relativePath: ".claude/cache",
        reason: "never-read",
      }),
    );
  });

  it("skips paths matched by .cprofignore policy", async () => {
    await writeFile(join(tempDir, "CLAUDE.md"), "safe", "utf8");
    await writeFile(join(tempDir, "CLAUDE.local.md"), "private", "utf8");

    const result = await collectSafePaths(tempDir, {
      ignorePolicy: createIgnorePolicy(["CLAUDE.local.md"]),
    });

    expect(relativePaths(result)).toEqual(["CLAUDE.md"]);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({
        relativePath: "CLAUDE.local.md",
        reason: "ignored",
      }),
    );
  });

  it("fails closed on symlinks that escape the root", async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), "cprof-outside-"));

    try {
      await writeFile(join(outsideDir, "secret.txt"), "outside", "utf8");

      try {
        await symlink(join(outsideDir, "secret.txt"), join(tempDir, "escape"));
      } catch (error) {
        if (isNodeError(error) && ["EACCES", "EPERM"].includes(error.code ?? "")) {
          return;
        }

        throw error;
      }

      const result = await collectSafePaths(tempDir);

      expect(relativePaths(result)).not.toContain("escape");
      expect(result.skipped).toContainEqual(
        expect.objectContaining({
          relativePath: "escape",
          reason: "symlink-escape",
        }),
      );
    } finally {
      await rm(outsideDir, { force: true, recursive: true });
    }
  });
});

describe("isInsideRoot", () => {
  it("accepts nested paths", () => {
    expect(isInsideRoot("/repo", "/repo/.claude/settings.json")).toBe(true);
  });

  it("rejects paths outside the root", () => {
    expect(isInsideRoot("/repo", "/other/secret.txt")).toBe(false);
  });
});

function relativePaths(result: SafeTraversalResult): string[] {
  return result.entries.map((entry) => entry.relativePath);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
