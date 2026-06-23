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
  tempDir = await mkdtemp(join(tmpdir(), "cprof-install-cli-"));
  profileDir = join(tempDir, "profile");
  targetDir = join(tempDir, "target");
  homeDir = join(tempDir, "home");
  await mkdir(profileDir, { recursive: true });
  await mkdir(targetDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof install", () => {
  it("returns 2 for missing profiles", async () => {
    const stderr = createWritable();

    await expect(
      main(["install", "missing.json"], { cwd: targetDir, homeDir, stderr }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("file not found");
  });

  it("dry-runs without writing files", async () => {
    await writeAsset("skills/review/SKILL.md", "# Review\n");
    await writeProfile(
      buildManifest({
        name: "project",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        skills: {
          review: { source: "./skills/review", scope: "project" },
        },
      }),
    );
    const stdout = createWritable();

    await expect(
      main(["install", join(profileDir, "claude-profile.json"), "--dry-run"], {
        cwd: targetDir,
        homeDir,
        stdout,
      }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("Mode: dry-run");
    expect(stdout.output).toContain("Planned 1 writes");
    await expect(
      readFile(
        join(targetDir, ".claude", "skills", "review", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("installs a project profile", async () => {
    await writeAsset("commands/deploy.md", "Deploy\n");
    await writeProfile(
      buildManifest({
        name: "project",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        commands: {
          deploy: { source: "./commands/deploy.md", scope: "project" },
        },
      }),
    );

    await expect(
      main(["install", join(profileDir, "claude-profile.json")], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
    await expect(
      readFile(join(targetDir, "cprof-install-report.txt"), "utf8"),
    ).resolves.toContain("Writes: 1");
  });

  it("fails on conflicts and succeeds with force", async () => {
    await writeAsset("commands/deploy.md", "New\n");
    await mkdir(join(targetDir, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "commands", "deploy.md"),
      "Old\n",
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "project",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        commands: {
          deploy: { source: "./commands/deploy.md", scope: "project" },
        },
      }),
    );
    const stderr = createWritable();

    await expect(
      main(["install", join(profileDir, "claude-profile.json")], {
        cwd: targetDir,
        homeDir,
        stderr,
      }),
    ).resolves.toBe(1);
    expect(stderr.output).toContain("Conflicts: 1");

    await expect(
      main(["install", join(profileDir, "claude-profile.json"), "--force"], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);
    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("New\n");
  });

  it("applies global entries from a mixed profile only when requested", async () => {
    await writeAsset("commands/project.md", "Project\n");
    await writeAsset("commands/global.md", "Global\n");
    await writeProfile(
      buildManifest({
        name: "mixed",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({
          mode: "project",
          includeGlobal: true,
        }),
        commands: {
          project: { source: "./commands/project.md", scope: "project" },
          global: { source: "./commands/global.md", scope: "global" },
        },
      }),
    );

    await expect(
      main(["install", join(profileDir, "claude-profile.json")], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);
    await expect(
      readFile(join(homeDir, ".claude", "commands", "global.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await expect(
      main(
        [
          "install",
          join(profileDir, "claude-profile.json"),
          "--include-global",
          "--force",
        ],
        {
          cwd: targetDir,
          homeDir,
        },
      ),
    ).resolves.toBe(0);
    await expect(
      readFile(join(homeDir, ".claude", "commands", "global.md"), "utf8"),
    ).resolves.toBe("Global\n");
  });

  it("installs a global profile under the injected home directory", async () => {
    await writeAsset("commands/global.md", "Global\n");
    await writeProfile(
      buildManifest({
        name: "global",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
        commands: {
          global: { source: "./commands/global.md", scope: "global" },
        },
      }),
    );

    await expect(
      main(["install", join(profileDir, "claude-profile.json"), "--global"], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(homeDir, ".claude", "commands", "global.md"), "utf8"),
    ).resolves.toBe("Global\n");
  });

  it("fails before writing when required env vars are missing", async () => {
    await writeProfile(
      buildManifest({
        name: "secret",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        mcpServers: {
          github: {
            command: "npx",
            env: { GITHUB_TOKEN: "${env:GITHUB_TOKEN}" },
            scope: "project",
          },
        },
      }),
    );

    await expect(
      main(["install", join(profileDir, "claude-profile.json")], {
        cwd: targetDir,
        homeDir,
        env: {},
      }),
    ).resolves.toBe(1);
    await expect(
      readFile(join(targetDir, ".mcp.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("applies into the directory named by --into", async () => {
    await writeAsset("commands/deploy.md", "Deploy\n");
    await writeProfile(
      buildManifest({
        name: "project",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        commands: {
          deploy: { source: "./commands/deploy.md", scope: "project" },
        },
      }),
    );
    const into = join(tempDir, "elsewhere");

    await expect(
      main(["install", join(profileDir, "claude-profile.json"), "--into", into], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(into, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
    // The current directory is left untouched.
    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    // The install ledger lands under the chosen target root.
    await expect(
      readFile(join(into, ".cprof-state.json"), "utf8"),
    ).resolves.toBeTruthy();
  });

  it("does not let --into affect --global writes", async () => {
    await writeAsset("commands/global.md", "Global\n");
    await writeProfile(
      buildManifest({
        name: "global",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
        commands: {
          global: { source: "./commands/global.md", scope: "global" },
        },
      }),
    );
    const into = join(tempDir, "elsewhere");

    await expect(
      main(
        [
          "install",
          join(profileDir, "claude-profile.json"),
          "--global",
          "--into",
          into,
        ],
        { cwd: targetDir, homeDir },
      ),
    ).resolves.toBe(0);

    // Global entries still target ~/.claude (homeDir), never --into.
    await expect(
      readFile(join(homeDir, ".claude", "commands", "global.md"), "utf8"),
    ).resolves.toBe("Global\n");
    await expect(
      readFile(join(into, ".claude", "commands", "global.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects --into with no directory argument", async () => {
    const stderr = createWritable();

    await expect(
      main(["install", "profile.json", "--into"], {
        cwd: targetDir,
        homeDir,
        stderr,
      }),
    ).resolves.toBe(1);

    expect(stderr.output).toContain("requires a directory");
  });
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
