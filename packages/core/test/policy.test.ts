import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest } from "../src/manifest.js";
import { checkProfilePolicy, loadTeamPolicy } from "../src/policy.js";
import { createProfileSourceMetadata } from "../src/sources.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-policy-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("team policy", () => {
  it("loads valid policies", async () => {
    const path = await writePolicy({
      version: 1,
      allowGlobal: false,
      allowedSections: ["settings", "commands"],
      maxSecrets: 0,
    });

    await expect(loadTeamPolicy(path)).resolves.toMatchObject({
      ok: true,
      policy: { allowGlobal: false },
    });
  });

  it("rejects invalid policy sections", async () => {
    const path = await writePolicy({
      version: 1,
      blockedSections: ["unknown"],
    });

    await expect(loadTeamPolicy(path)).resolves.toMatchObject({
      ok: false,
      exitCode: 1,
    });
  });

  it("passes compliant profiles", () => {
    const profile = buildManifest({
      name: "team",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      settings: { model: "sonnet" },
    });

    expect(
      checkProfilePolicy(profile, {
        version: 1,
        allowGlobal: false,
        allowedSections: ["settings"],
        maxSecrets: 0,
      }),
    ).toEqual({ ok: true, violations: [] });
  });

  it("reports global, blocked section, private, and secret violations", () => {
    const profile = buildManifest({
      name: "team",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({
        mode: "project",
        includeGlobal: true,
      }),
      commands: {
        deploy: { source: "./commands/deploy.md", private: true },
      },
      mcpServers: {
        github: {
          command: "npx",
          env: { GITHUB_TOKEN: "ghp_123456789012345678901234567890123456" },
        },
      },
    });

    const result = checkProfilePolicy(profile, {
      version: 1,
      allowGlobal: false,
      allowPrivate: false,
      blockedSections: ["commands"],
      maxSecrets: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.path)).toEqual([
      "/commands",
      "/commands/deploy",
      "/profileScope",
      "/secrets/required",
      "/sources/1",
    ]);
  });

  it("reports missing required sections", () => {
    const profile = buildManifest({
      name: "team",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
    });

    expect(
      checkProfilePolicy(profile, {
        version: 1,
        requiredSections: ["settings"],
      }).violations,
    ).toEqual([
      {
        path: "/settings",
        message: "required section is missing: settings",
      },
    ]);
  });
});

async function writePolicy(value: unknown): Promise<string> {
  const path = join(tempDir, "policy.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  return path;
}
