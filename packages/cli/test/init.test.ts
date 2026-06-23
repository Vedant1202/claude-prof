import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateProfile } from "@cprof/core";
import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;
let cwd: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-init-"));
  cwd = join(tempDir, "project");
  homeDir = join(tempDir, "home");
  await mkdir(cwd, { recursive: true });
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof init --out", () => {
  it("writes the bundle to a chosen directory, creating it if missing", async () => {
    const outDir = join(cwd, "bundle");

    await expect(main(["init", "--out", "bundle"], { cwd, homeDir })).resolves.toBe(
      0,
    );

    const profile = JSON.parse(
      await readFile(join(outDir, "claude-profile.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(validateProfile(profile)).toMatchObject({ valid: true });
    await expect(readFile(join(outDir, ".gitignore"), "utf8")).resolves.toContain(
      ".claude",
    );
    await expect(
      readFile(join(outDir, "cprof-scan-report.txt"), "utf8"),
    ).resolves.toContain("cprof scan report");

    // Nothing is written to the current directory.
    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("round-trips: a profile written with --out installs cleanly", async () => {
    await mkdir(join(cwd, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(cwd, ".claude", "commands", "deploy.md"),
      "Deploy\n",
      "utf8",
    );

    await expect(main(["init", "--out", "bundle"], { cwd, homeDir })).resolves.toBe(
      0,
    );

    const targetDir = join(tempDir, "target");
    await mkdir(targetDir, { recursive: true });

    await expect(
      main(["install", join(cwd, "bundle", "claude-profile.json")], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
  });

  it("rejects --out with no directory argument", async () => {
    const stderr = createWritable();

    await expect(main(["init", "--out"], { cwd, homeDir, stderr })).resolves.toBe(
      1,
    );

    expect(stderr.output).toContain("requires a directory");
  });

  it("defaults to the current directory when --out is omitted", async () => {
    await expect(main(["init"], { cwd, homeDir })).resolves.toBe(0);

    const profile = JSON.parse(
      await readFile(join(cwd, "claude-profile.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(validateProfile(profile)).toMatchObject({ valid: true });
  });
});
