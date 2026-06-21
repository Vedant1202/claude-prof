import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-json-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("--json output", () => {
  it("init --json emits a single result envelope on stdout, nothing on stderr", async () => {
    const cwd = join(tempDir, "project");
    await mkdir(cwd);
    const stdout = createWritable();
    const stderr = createWritable();

    await expect(
      main(["init", "--json"], { cwd, stdout, stderr }),
    ).resolves.toBe(0);

    const payload = JSON.parse(stdout.output);
    expect(payload).toMatchObject({
      command: "init",
      ok: true,
      profileScope: "project",
      includesGlobal: false,
      leakCheck: { ok: true },
    });
    expect(stderr.output).toBe("");
  });

  it("refresh --json emits a result envelope", async () => {
    const cwd = join(tempDir, "refresh");
    await mkdir(cwd);
    await main(["init"], {
      cwd,
      stdout: createWritable(),
      stderr: createWritable(),
    });
    const stdout = createWritable();

    await expect(main(["refresh", "--json"], { cwd, stdout })).resolves.toBe(0);

    expect(JSON.parse(stdout.output)).toMatchObject({
      command: "refresh",
      ok: true,
      profileScope: "project",
    });
  });

  it("install --dry-run --json emits the result surface on stdout", async () => {
    const profileDir = join(tempDir, "profile");
    const target = join(tempDir, "target");
    await mkdir(profileDir, { recursive: true });
    await mkdir(target, { recursive: true });
    await writeFile(
      join(profileDir, "claude-profile.json"),
      `${JSON.stringify(
        buildManifest({
          name: "p",
          version: "1.0.0",
          sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );
    const stdout = createWritable();

    await expect(
      main(
        [
          "install",
          join(profileDir, "claude-profile.json"),
          "--dry-run",
          "--json",
        ],
        { cwd: target, homeDir: join(tempDir, "home"), stdout },
      ),
    ).resolves.toBe(0);

    const payload = JSON.parse(stdout.output);
    expect(payload).toMatchObject({
      command: "install",
      ok: true,
      dryRun: true,
    });
    expect(Array.isArray(payload.writes)).toBe(true);
  });
});
