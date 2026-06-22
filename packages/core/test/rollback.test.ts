import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest } from "../src/manifest.js";
import { createProfileSourceMetadata } from "../src/sources.js";
import { installProfile } from "../src/install.js";
import { rollbackLastInstall } from "../src/rollback.js";
import { loadInstalledProfileState } from "../src/state.js";

let tempDir: string;
let profileDir: string;
let targetDir: string;
let homeDir: string;

const INSTALLED_AT = new Date("2026-06-01T00:00:00.000Z");

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-rollback-"));
  profileDir = join(tempDir, "profile");
  targetDir = join(tempDir, "target");
  homeDir = join(tempDir, "home");
  await mkdir(profileDir, { recursive: true });
  await mkdir(join(targetDir, ".claude"), { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

const settingsPath = () => join(targetDir, ".claude", "settings.json");
const deployPath = () => join(targetDir, ".claude", "commands", "deploy.md");
const statePath = () => join(targetDir, ".cprof-state.json");

/** Install a profile that MERGES settings.json and CREATES a command file. */
async function seedInstall(): Promise<void> {
  await writeFile(
    settingsPath(),
    JSON.stringify({ model: "opus", theme: "dark" }),
    "utf8",
  );
  await mkdir(join(profileDir, "commands"), { recursive: true });
  await writeFile(
    join(profileDir, "commands", "deploy.md"),
    "Deploy v1\n",
    "utf8",
  );
  await writeFile(
    join(profileDir, "claude-profile.json"),
    `${JSON.stringify(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
        commands: {
          deploy: { source: "./commands/deploy.md", scope: "project" },
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );
  await installProfile({
    profilePath: join(profileDir, "claude-profile.json"),
    cwd: targetDir,
    homeDir,
    now: INSTALLED_AT,
  });
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
}

describe("rollbackLastInstall", () => {
  it("reverts the last install: restores merged files, trashes created files", async () => {
    await seedInstall();

    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "rollback",
      now: new Date("2026-06-02T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ ok: true, outcome: "done" });
    // settings.json restored to its pre-install content
    expect(await readJson(settingsPath())).toEqual({
      model: "opus",
      theme: "dark",
    });
    // created command removed (soft-deleted to trash)
    expect(await exists(deployPath())).toBe(false);
    // ledger entry flipped to rolled-back
    const state = await loadInstalledProfileState(statePath());
    expect(state.installs[0]?.status).toBe("rolled-back");
    expect(state.installs[0]?.rollbackTrashDir).toBeDefined();
  });

  it("aborts the whole rollback if a touched file changed since install", async () => {
    await seedInstall();
    await writeFile(
      settingsPath(),
      JSON.stringify({ model: "edited" }),
      "utf8",
    );

    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "rollback",
    });

    expect(result.outcome).toBe("aborted-changed");
    expect(result.ok).toBe(false);
    expect(result.changed.some((p) => p.endsWith("settings.json"))).toBe(true);
    // nothing mutated: the created file is still there
    expect(await exists(deployPath())).toBe(true);
    expect(await readJson(settingsPath())).toEqual({ model: "edited" });
  });

  it("--force reverts even when a file changed", async () => {
    await seedInstall();
    await writeFile(
      settingsPath(),
      JSON.stringify({ model: "edited" }),
      "utf8",
    );

    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "rollback",
      force: true,
    });

    expect(result.outcome).toBe("done");
    expect(await readJson(settingsPath())).toEqual({
      model: "opus",
      theme: "dark",
    });
  });

  it("dry-run reports the plan without changing anything", async () => {
    await seedInstall();

    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "rollback",
      dryRun: true,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: "planned",
      dryRun: true,
    });
    expect(await exists(deployPath())).toBe(true); // untouched
    const state = await loadInstalledProfileState(statePath());
    expect(state.installs[0]?.status).toBe("applied"); // ledger untouched
  });

  it("reports nothing-to-do when there is no applied install", async () => {
    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "rollback",
    });

    expect(result.outcome).toBe("nothing-to-do");
    expect(result.ok).toBe(false);
  });

  it("--undo re-applies a rolled-back install (round-trip)", async () => {
    await seedInstall();
    await rollbackLastInstall({
      statePath: statePath(),
      mode: "rollback",
      now: new Date("2026-06-02T00:00:00.000Z"),
    });

    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "undo",
    });

    expect(result).toMatchObject({ ok: true, outcome: "done" });
    // post-install state is back
    expect(await readJson(settingsPath())).toMatchObject({ model: "sonnet" });
    expect(await readFile(deployPath(), "utf8")).toBe("Deploy v1\n");
    const state = await loadInstalledProfileState(statePath());
    expect(state.installs[0]?.status).toBe("applied");
  });

  it("reports nothing-to-do for --undo when nothing is rolled back", async () => {
    await seedInstall();

    const result = await rollbackLastInstall({
      statePath: statePath(),
      mode: "undo",
    });

    expect(result.outcome).toBe("nothing-to-do");
  });
});
