import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";
import { main } from "../src/index.js";
import { createWritable, readProfileJson } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-refresh-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof refresh", () => {
  it("refreshes from recorded sources and preserves user-owned fields", async () => {
    const homeDir = await createHomeWithInstalledPlugin();
    const profile = buildManifest({
      name: "custom-name",
      version: "2.0.0",
      description: "Keep this",
      sourceMetadata: createProfileSourceMetadata({
        mode: "project",
        includeGlobal: true,
      }),
      skills: {
        old: { source: "./skills/old" },
      },
    });
    await writeFile(
      join(tempDir, "claude-profile.json"),
      `${JSON.stringify(profile, null, 2)}\n`,
      "utf8",
    );

    await expect(main(["refresh"], { cwd: tempDir, homeDir })).resolves.toBe(0);

    const refreshed = await readProfileJson(tempDir);
    expect(refreshed.name).toBe("custom-name");
    expect(refreshed.version).toBe("2.0.0");
    expect(refreshed.description).toBe("Keep this");
    expect(refreshed.includesGlobal).toBe(true);
    expect(refreshed.skills).toBeUndefined();
    expect(refreshed.plugins).toMatchObject({
      "agent-skills@addy-agent-skills": {
        marketplace: "addy-agent-skills",
      },
    });
  });

  it("returns 2 when the profile is missing", async () => {
    const stderr = createWritable();

    await expect(main(["refresh"], { cwd: tempDir, stderr })).resolves.toBe(2);

    expect(stderr.output).toContain("file not found");
  });

  it("refresh --no-gitignore skips the .gitignore but still writes the report", async () => {
    const homeDir = join(tempDir, "home");
    await mkdir(homeDir, { recursive: true });
    const profile = buildManifest({
      name: "p",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
    });
    await writeFile(
      join(tempDir, "claude-profile.json"),
      `${JSON.stringify(profile, null, 2)}\n`,
      "utf8",
    );

    await expect(
      main(["refresh", "--no-gitignore"], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(tempDir, ".gitignore"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(tempDir, "cprof-scan-report.txt"), "utf8"),
    ).resolves.toBeTruthy();
  });

  it("rejects an unknown refresh flag", async () => {
    const stderr = createWritable();

    await expect(
      main(["refresh", "--bogus"], { cwd: tempDir, stderr }),
    ).resolves.toBe(1);

    expect(stderr.output).toContain("unknown refresh flag");
  });
});

async function createHomeWithInstalledPlugin(): Promise<string> {
  const homeDir = join(tempDir, "home");
  const pluginDir = join(homeDir, ".claude", "plugins");
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "agent-skills@addy-agent-skills": [
          { scope: "user", version: "1.0.0", installPath: "/private/cache" },
        ],
      },
    }),
    "utf8",
  );
  await writeFile(
    join(pluginDir, "known_marketplaces.json"),
    JSON.stringify({
      "addy-agent-skills": {
        source: { source: "github", repo: "addyosmani/agent-skills" },
      },
    }),
    "utf8",
  );

  return homeDir;
}
