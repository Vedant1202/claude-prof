import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";

import { main } from "../src/index.js";
import { parseCommonFlags } from "../src/command-utils.js";
import { createWritable } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-streams-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("parseCommonFlags", () => {
  it("extracts --json and --quiet and leaves the rest", () => {
    expect(parseCommonFlags(["--json", "foo", "--quiet", "bar"])).toEqual({
      json: true,
      quiet: true,
      rest: ["foo", "bar"],
    });
  });

  it("defaults json and quiet to false", () => {
    expect(parseCommonFlags(["x"])).toEqual({
      json: false,
      quiet: false,
      rest: ["x"],
    });
  });

  it("accepts -q as an alias for --quiet", () => {
    expect(parseCommonFlags(["-q"]).quiet).toBe(true);
  });
});

describe("stream hygiene", () => {
  it("writes init's success confirmation to stderr, not stdout", async () => {
    const cwd = join(tempDir, "project");
    await mkdir(cwd);
    const stdout = createWritable();
    const stderr = createWritable();

    await expect(main(["init"], { cwd, stdout, stderr })).resolves.toBe(0);

    expect(stderr.output).toContain("Wrote claude-profile.json");
    expect(stdout.output).toBe("");
  });

  it("suppresses init's confirmation with --quiet but still writes the profile", async () => {
    const cwd = join(tempDir, "quiet");
    await mkdir(cwd);
    const stdout = createWritable();
    const stderr = createWritable();

    await expect(
      main(["init", "--quiet"], { cwd, stdout, stderr }),
    ).resolves.toBe(0);

    expect(stdout.output).toBe("");
    expect(stderr.output).toBe("");
    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).resolves.toContain('"name"');
  });

  it("suppresses install's report on success with --quiet", async () => {
    const profileDir = join(tempDir, "profile");
    const target = join(tempDir, "target");
    await mkdir(profileDir, { recursive: true });
    await mkdir(target, { recursive: true });
    await writeFile(
      join(profileDir, "claude-profile.json"),
      `${JSON.stringify(
        buildManifest({
          name: "empty",
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
      main(["install", join(profileDir, "claude-profile.json"), "--quiet"], {
        cwd: target,
        homeDir: join(tempDir, "home"),
        stdout,
      }),
    ).resolves.toBe(0);

    expect(stdout.output).toBe("");
  });
});
