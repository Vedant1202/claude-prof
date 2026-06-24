import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { backupPathFor } from "../src/backup-path.js";

describe("backupPathFor", () => {
  it("mirrors an in-project file as a project-relative backup path", () => {
    const root = "/proj";
    const backupRoot = join(root, ".cprof-backups", "ts");

    expect(
      backupPathFor(backupRoot, join(root, ".claude/commands/x.md"), root),
    ).toBe(join(backupRoot, ".claude/commands/x.md"));
  });

  it("gives same-basename out-of-project files distinct backup paths", () => {
    const root = "/proj";
    const backupRoot = join(root, ".cprof-backups", "ts");

    const a = backupPathFor(
      backupRoot,
      "/home/u/.claude/commands/shared.md",
      root,
    );
    const b = backupPathFor(
      backupRoot,
      "/home/u/.claude/agents/shared.md",
      root,
    );

    expect(a).not.toBe(b);
    expect(a.startsWith(backupRoot)).toBe(true);
    expect(b.startsWith(backupRoot)).toBe(true);
  });
});
