import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;
let profileDir: string;
let targetDir: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-rollback-cli-"));
  profileDir = join(tempDir, "profile");
  targetDir = join(tempDir, "target");
  homeDir = join(tempDir, "home");
  await mkdir(profileDir, { recursive: true });
  await mkdir(targetDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

const deployPath = () => join(targetDir, ".claude", "commands", "deploy.md");

async function exists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
}

/** Install a profile that creates a command file into the target. */
async function seedInstall(): Promise<void> {
  await mkdir(join(profileDir, "commands"), { recursive: true });
  await writeFile(
    join(profileDir, "commands", "deploy.md"),
    "Deploy\n",
    "utf8",
  );
  await writeFile(
    join(profileDir, "claude-profile.json"),
    `${JSON.stringify(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        commands: {
          deploy: { source: "./commands/deploy.md", scope: "project" },
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );
  await main(["install", join(profileDir, "claude-profile.json")], {
    cwd: targetDir,
    homeDir,
  });
}

describe("cprof rollback", () => {
  it("rolls back the last install and removes created files", async () => {
    await seedInstall();
    expect(await exists(deployPath())).toBe(true);

    await expect(main(["rollback"], { cwd: targetDir, homeDir })).resolves.toBe(
      0,
    );

    expect(await exists(deployPath())).toBe(false);
  });

  it("exits 2 when there is nothing to roll back", async () => {
    const stderr = createWritable();

    await expect(
      main(["rollback"], { cwd: targetDir, homeDir, stderr }),
    ).resolves.toBe(2);
  });

  it("aborts with exit 3 when a file changed, unless --force", async () => {
    await seedInstall();
    await writeFile(deployPath(), "hand-edited\n", "utf8");

    await expect(main(["rollback"], { cwd: targetDir, homeDir })).resolves.toBe(
      3,
    );
    expect(await exists(deployPath())).toBe(true); // untouched

    await expect(
      main(["rollback", "--force"], { cwd: targetDir, homeDir }),
    ).resolves.toBe(0);
    expect(await exists(deployPath())).toBe(false);
  });

  it("--undo re-applies a rolled-back install", async () => {
    await seedInstall();
    await main(["rollback"], { cwd: targetDir, homeDir });

    await expect(
      main(["rollback", "--undo"], { cwd: targetDir, homeDir }),
    ).resolves.toBe(0);

    expect(await readFile(deployPath(), "utf8")).toBe("Deploy\n");
  });

  it("emits the rollback envelope with --json", async () => {
    await seedInstall();
    const stdout = createWritable();

    await expect(
      main(["rollback", "--json"], { cwd: targetDir, homeDir, stdout }),
    ).resolves.toBe(0);

    expect(JSON.parse(stdout.output)).toMatchObject({
      command: "rollback",
      ok: true,
      mode: "rollback",
      outcome: "done",
    });
  });
});
