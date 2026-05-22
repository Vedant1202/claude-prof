import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createIgnorePolicy,
  loadCprofIgnore,
  normalizeIgnorePath,
} from "../src/ignore.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-ignore-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("createIgnorePolicy", () => {
  it("matches gitignore-style file and directory patterns", () => {
    const policy = createIgnorePolicy(["*.local.md", ".claude/secrets/"]);

    expect(policy.ignores("CLAUDE.local.md")).toBe(true);
    expect(policy.ignores(".claude/secrets", { directory: true })).toBe(true);
    expect(policy.ignores(".claude/settings.json")).toBe(false);
  });

  it("matches paths relative to a root", () => {
    const policy = createIgnorePolicy([".claude/cache/"]);

    expect(
      policy.ignores(join(tempDir, ".claude", "cache"), {
        directory: true,
        root: tempDir,
      }),
    ).toBe(true);
  });
});

describe("loadCprofIgnore", () => {
  it("loads patterns while ignoring blanks and comments", async () => {
    await writeFile(
      join(tempDir, ".cprofignore"),
      "# private files\n\nCLAUDE.local.md\n",
      "utf8",
    );

    const policy = await loadCprofIgnore(tempDir);

    expect(policy.patterns).toEqual(["CLAUDE.local.md"]);
    expect(policy.ignores("CLAUDE.local.md")).toBe(true);
  });

  it("returns an empty policy when no .cprofignore exists", async () => {
    const policy = await loadCprofIgnore(tempDir);

    expect(policy.patterns).toEqual([]);
    expect(policy.ignores("CLAUDE.md")).toBe(false);
  });
});

describe("normalizeIgnorePath", () => {
  it("normalizes platform path separators", () => {
    expect(normalizeIgnorePath(join("a", "b", "c"))).toBe("a/b/c");
  });
});
