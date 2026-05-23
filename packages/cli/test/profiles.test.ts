import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";
import { main } from "../src/index.js";

let tempDir: string;
let profileDir: string;
let targetDir: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-profiles-cli-"));
  profileDir = join(tempDir, "profile");
  targetDir = join(tempDir, "target");
  homeDir = join(tempDir, "home");
  await mkdir(profileDir, { recursive: true });
  await mkdir(targetDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof profiles", () => {
  it("lists installed project profiles recorded by install", async () => {
    await writeProfile(
      buildManifest({
        name: "Team Base",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
      }),
    );

    await main(["install", join(profileDir, "claude-profile.json")], {
      cwd: targetDir,
      homeDir,
    });
    const stdout = createWritable();

    await expect(
      main(["profiles", "list"], { cwd: targetDir, homeDir, stdout }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("Team Base 1.0.0");
    expect(stdout.output).toContain(join(profileDir, "claude-profile.json"));
    await expect(readFile(join(targetDir, ".cprof-state.json"), "utf8")).resolves.toContain(
      "Team Base",
    );
  });

  it("checks outdated profiles against a registry", async () => {
    await writeProfile(
      buildManifest({
        name: "Team Base",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
      }),
    );
    await writeRegistry();

    await main(["install", "github:team/base"], {
      cwd: targetDir,
      homeDir,
      remoteCacheRoot: tempDir,
      fetcher: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return readFile(join(profileDir, "claude-profile.json"), "utf8");
        },
      }),
    });
    const stdout = createWritable();

    await expect(
      main(["profiles", "outdated", join(tempDir, "registry.json")], {
        cwd: targetDir,
        homeDir,
        stdout,
      }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("Team Base 1.0.0 -> 1.1.0");
    expect(stdout.output).toContain("update-available");
  });

  it("lists global installed state with --global", async () => {
    await writeProfile(
      buildManifest({
        name: "Global Base",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
        settings: { model: "opus" },
      }),
    );

    await main(["install", join(profileDir, "claude-profile.json"), "--global"], {
      cwd: targetDir,
      homeDir,
    });
    const stdout = createWritable();

    await expect(
      main(["profiles", "list", "--global"], { cwd: targetDir, homeDir, stdout }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("Global Base 1.0.0");
  });

  it("supports JSON output for profiles list", async () => {
    const stdout = createWritable();

    await expect(
      main(["profiles", "list", "--json"], { cwd: targetDir, stdout }),
    ).resolves.toBe(0);

    expect(JSON.parse(stdout.output)).toEqual({ installs: [] });
  });
});

async function writeProfile(profile: unknown): Promise<void> {
  await writeFile(
    join(profileDir, "claude-profile.json"),
    `${JSON.stringify(profile, null, 2)}\n`,
    "utf8",
  );
}

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
            version: "1.1.0",
            source: "github:team/base",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function createWritable(): Pick<NodeJS.WriteStream, "write"> & {
  readonly output: string;
} {
  let output = "";

  return {
    get output() {
      return output;
    },
    write(chunk: string | Uint8Array): boolean {
      output += String(chunk);
      return true;
    },
  };
}
