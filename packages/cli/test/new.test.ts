import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";
import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;
let profileDir: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-new-"));
  profileDir = join(tempDir, "profile");
  homeDir = join(tempDir, "home");
  await mkdir(profileDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

async function writeAsset(path: string, contents: string): Promise<void> {
  const filePath = join(profileDir, path);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function writeProfile(profile: unknown): Promise<void> {
  await writeFile(
    join(profileDir, "claude-profile.json"),
    `${JSON.stringify(profile, null, 2)}\n`,
    "utf8",
  );
}

function projectProfile(): unknown {
  return buildManifest({
    name: "starter",
    version: "1.0.0",
    sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
    commands: {
      deploy: { source: "./commands/deploy.md", scope: "project" },
    },
  });
}

const profile = (): string => join(profileDir, "claude-profile.json");

describe("cprof new", () => {
  it("scaffolds into the current directory when no dir is given", async () => {
    await writeAsset("commands/deploy.md", "Deploy\n");
    await writeProfile(projectProfile());
    const target = join(tempDir, "into-cwd");
    await mkdir(target, { recursive: true });

    await expect(
      main(["new", profile()], { cwd: target, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(target, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
    // A clean scaffold overwrites nothing, so it writes no backups.
    await expect(stat(join(target, ".cprof-backups"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("scaffolds into a named directory, creating it", async () => {
    await writeAsset("commands/deploy.md", "Deploy\n");
    await writeProfile(projectProfile());
    const dest = join(tempDir, "fresh-app");

    await expect(
      main(["new", profile(), dest], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(dest, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
  });

  it("refuses to overwrite an existing target without --force", async () => {
    await writeAsset("commands/deploy.md", "New\n");
    await writeProfile(projectProfile());
    const dest = join(tempDir, "occupied");
    await mkdir(join(dest, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(dest, ".claude", "commands", "deploy.md"),
      "Old\n",
      "utf8",
    );
    const stderr = createWritable();

    await expect(
      main(["new", profile(), dest], { cwd: tempDir, homeDir, stderr }),
    ).resolves.toBe(1);

    expect(stderr.output).toMatch(/exist|overwrite|--force/i);
    // Nothing was touched.
    await expect(
      readFile(join(dest, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Old\n");
  });

  it("overwrites with --force and keeps a backup", async () => {
    await writeAsset("commands/deploy.md", "New\n");
    await writeProfile(projectProfile());
    const dest = join(tempDir, "occupied");
    await mkdir(join(dest, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(dest, ".claude", "commands", "deploy.md"),
      "Old\n",
      "utf8",
    );

    await expect(
      main(["new", profile(), dest, "--force"], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(dest, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("New\n");
    // The overwritten file was backed up — this is what makes `new --force`
    // reversible via `cprof rollback`.
    await expect(readdir(join(dest, ".cprof-backups"))).resolves.not.toHaveLength(
      0,
    );
  });

  it("returns 2 when the profile is missing", async () => {
    const stderr = createWritable();

    await expect(
      main(["new", join(profileDir, "nope.json")], {
        cwd: tempDir,
        homeDir,
        stderr,
      }),
    ).resolves.toBe(2);

    expect(stderr.output).toMatch(/not found/i);
  });

  it("a forced overwrite is reversible via cprof rollback", async () => {
    await writeAsset("commands/deploy.md", "New\n");
    await writeProfile(projectProfile());
    const dest = join(tempDir, "occupied");
    await mkdir(join(dest, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(dest, ".claude", "commands", "deploy.md"),
      "Old\n",
      "utf8",
    );

    // Scaffold over the existing file with --force (keeps a backup).
    await expect(
      main(["new", profile(), dest, "--force"], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);
    await expect(
      readFile(join(dest, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("New\n");

    // rollback (run in the scaffolded project) restores the original from backup.
    await expect(main(["rollback"], { cwd: dest, homeDir })).resolves.toBe(0);
    await expect(
      readFile(join(dest, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Old\n");
  });
});
