import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bundleAssets } from "../src/bundler.js";

let tempDir: string;
let outputDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-bundler-"));
  outputDir = join(tempDir, "profile");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("bundleAssets", () => {
  it("bundles safe directory assets deterministically", async () => {
    const skillDir = join(tempDir, "source-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Review\n", "utf8");
    await writeFile(join(skillDir, "reference.md"), "Notes\n", "utf8");

    const first = await bundleAssets(
      [{ kind: "skills", name: "review", sourcePath: skillDir }],
      outputDir,
    );
    const second = await bundleAssets(
      [{ kind: "skills", name: "review", sourcePath: skillDir }],
      outputDir,
    );

    expect(first).toEqual(second);
    expect(first.bundled[0]?.destination).toBe("skills/review");
    await expect(
      readFile(join(outputDir, "skills", "review", "SKILL.md"), "utf8"),
    ).resolves.toBe("# Review\n");
  });

  it("bundles safe file assets", async () => {
    const commandPath = join(tempDir, "deploy.md");
    await writeFile(commandPath, "Deploy command\n", "utf8");

    const result = await bundleAssets(
      [{ kind: "commands", name: "deploy", sourcePath: commandPath }],
      outputDir,
    );

    expect(result.bundled).toHaveLength(1);
    await expect(
      readFile(join(outputDir, "commands", "deploy", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy command\n");
  });

  it("skips hook assets without reading or copying them", async () => {
    const hookPath = join(tempDir, "dangerous.sh");
    await writeFile(
      hookPath,
      "export TOKEN=ghp_123456789012345678901234567890123456\n",
      "utf8",
    );

    const result = await bundleAssets(
      [{ kind: "hooks", name: "dangerous", sourcePath: hookPath }],
      outputDir,
    );

    expect(result).toEqual({
      bundled: [],
      skipped: [
        {
          kind: "hooks",
          name: "dangerous",
          sourcePath: hookPath,
          reason: "hook-inventory-only",
        },
      ],
    });
  });

  it("skips assets that fail output leak checks", async () => {
    const commandPath = join(tempDir, "leaky.md");
    await writeFile(
      commandPath,
      "ghp_123456789012345678901234567890123456\n",
      "utf8",
    );

    const result = await bundleAssets(
      [{ kind: "commands", name: "leaky", sourcePath: commandPath }],
      outputDir,
    );

    expect(result.bundled).toEqual([]);
    expect(result.skipped).toEqual([
      {
        kind: "commands",
        name: "leaky",
        sourcePath: commandPath,
        reason: "unsafe-output",
      },
    ]);
  });
});
