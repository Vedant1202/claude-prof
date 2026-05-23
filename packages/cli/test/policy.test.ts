import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";
import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-policy-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof policy", () => {
  it("passes compliant profiles", async () => {
    const stdout = createWritable();
    await writeProfile(
      buildManifest({
        name: "team",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
      }),
    );
    await writePolicy({
      version: 1,
      allowedSections: ["settings"],
      maxSecrets: 0,
    });

    await expect(
      main(["policy", "check", "claude-profile.json", "policy.json"], {
        cwd: tempDir,
        stdout,
      }),
    ).resolves.toBe(0);

    expect(stdout.output).toBe("policy passed\n");
  });

  it("fails profiles with policy violations", async () => {
    const stderr = createWritable();
    await writeProfile(
      buildManifest({
        name: "team",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({
          mode: "project",
          includeGlobal: true,
        }),
        commands: {
          deploy: { source: "./commands/deploy.md", private: true },
        },
      }),
    );
    await writePolicy({
      version: 1,
      allowGlobal: false,
      allowPrivate: false,
      blockedSections: ["commands"],
    });

    await expect(
      main(["policy", "check", "claude-profile.json", "policy.json"], {
        cwd: tempDir,
        stderr,
      }),
    ).resolves.toBe(1);

    expect(stderr.output).toContain("policy failed");
    expect(stderr.output).toContain("/profileScope");
    expect(stderr.output).toContain("/commands/deploy");
  });

  it("supports JSON output", async () => {
    const stderr = createWritable();
    await writeProfile(
      buildManifest({
        name: "team",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        hooks: { bash: { event: "PreToolUse" } },
      }),
    );
    await writePolicy({ version: 1, blockedSections: ["hooks"] });

    await expect(
      main(
        ["policy", "check", "claude-profile.json", "policy.json", "--json"],
        {
          cwd: tempDir,
          stderr,
        },
      ),
    ).resolves.toBe(1);

    expect(JSON.parse(stderr.output)).toMatchObject({ ok: false });
  });

  it("returns 2 for missing policy files", async () => {
    const stderr = createWritable();
    await writeProfile(
      buildManifest({
        name: "team",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      }),
    );

    await expect(
      main(["policy", "check", "claude-profile.json", "missing.json"], {
        cwd: tempDir,
        stderr,
      }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("file not found");
  });
});

async function writeProfile(value: unknown): Promise<void> {
  await writeFile(
    join(tempDir, "claude-profile.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function writePolicy(value: unknown): Promise<void> {
  await writeFile(
    join(tempDir, "policy.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}
