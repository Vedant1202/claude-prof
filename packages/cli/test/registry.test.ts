import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-registry-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof registry", () => {
  it("lists registry profiles", async () => {
    await writeRegistry();
    const stdout = createWritable();

    await expect(
      main(["registry", "list", "registry.json"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("solo/minimal - Solo Minimal");
    expect(stdout.output).toContain("team/base - Team Base");
  });

  it("searches registry profiles", async () => {
    await writeRegistry();
    const stdout = createWritable();

    await expect(
      main(["registry", "search", "registry.json", "typescript"], {
        cwd: tempDir,
        stdout,
      }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("team/base");
    expect(stdout.output).not.toContain("solo/minimal");
  });

  it("shows a registry profile", async () => {
    await writeRegistry();
    const stdout = createWritable();

    await expect(
      main(["registry", "show", "registry.json", "team/base"], {
        cwd: tempDir,
        stdout,
      }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("source: github:team/base");
    expect(stdout.output).toContain("tags: team, typescript");
  });

  it("supports JSON output", async () => {
    await writeRegistry();
    const stdout = createWritable();

    await expect(
      main(["registry", "search", "registry.json", "solo", "--json"], {
        cwd: tempDir,
        stdout,
      }),
    ).resolves.toBe(0);

    expect(JSON.parse(stdout.output).profiles).toHaveLength(1);
  });

  it("returns 2 for missing registry files and profiles", async () => {
    const stderr = createWritable();

    await expect(
      main(["registry", "list", "missing.json"], { cwd: tempDir, stderr }),
    ).resolves.toBe(2);
    expect(stderr.output).toContain("file not found");

    await writeRegistry();
    const missingProfile = createWritable();
    await expect(
      main(["registry", "show", "registry.json", "missing"], {
        cwd: tempDir,
        stderr: missingProfile,
      }),
    ).resolves.toBe(2);
    expect(missingProfile.output).toContain("profile not found");
  });

  it("does not mutate registry files", async () => {
    await writeRegistry();
    const before = await readFile(join(tempDir, "registry.json"), "utf8");

    await main(["registry", "list", "registry.json"], { cwd: tempDir });

    await expect(
      readFile(join(tempDir, "registry.json"), "utf8"),
    ).resolves.toBe(before);
  });
});

async function writeRegistry(): Promise<void> {
  await writeFile(
    join(tempDir, "registry.json"),
    `${JSON.stringify(
      {
        version: 1,
        profiles: [
          {
            id: "team/base",
            name: "Team Base",
            source: "github:team/base",
            tags: ["team", "typescript"],
          },
          {
            id: "solo/minimal",
            name: "Solo Minimal",
            source: "https://example.com/minimal.json",
            scope: "project",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
