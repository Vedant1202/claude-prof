import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";
import type { ProfileReferenceFetcher } from "@cprof/core";
import { main } from "../src/index.js";

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
      readFile(join(targetDir, ".claude", "skills", "review", "SKILL.md"), "utf8"),
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
    await expect(readFile(join(targetDir, ".mcp.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("installs a remote HTTPS profile reference", async () => {
    const profile = buildManifest({
      name: "remote",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      settings: { model: "sonnet" },
    });
    const fetcher = createFetcher(
      "https://example.com/claude-profile.json",
      `${JSON.stringify(profile)}\n`,
    );

    await expect(
      main(["install", "https://example.com/claude-profile.json"], {
        cwd: targetDir,
        homeDir,
        remoteCacheRoot: tempDir,
        fetcher,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(targetDir, ".claude", "settings.json"), "utf8"),
    ).resolves.toContain("sonnet");
  });

  it("installs a GitHub shorthand profile reference", async () => {
    const profile = buildManifest({
      name: "remote-github",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      settings: { model: "opus" },
    });
    const fetcher = createFetcher(
      "https://raw.githubusercontent.com/owner/repo/main/claude-profile.json",
      `${JSON.stringify(profile)}\n`,
    );

    await expect(
      main(["install", "github:owner/repo"], {
        cwd: targetDir,
        homeDir,
        remoteCacheRoot: tempDir,
        fetcher,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(targetDir, ".claude", "settings.json"), "utf8"),
    ).resolves.toContain("opus");
  });

  it("returns 2 for missing remote profile references", async () => {
    const stderr = createWritable();

    await expect(
      main(["install", "https://example.com/missing.json"], {
        cwd: targetDir,
        homeDir,
        remoteCacheRoot: tempDir,
        stderr,
        fetcher: async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
          async text() {
            return "";
          },
        }),
      }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("failed to fetch remote profile");
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

function createFetcher(
  expectedUrl: string,
  contents: string,
): ProfileReferenceFetcher {
  return async (url) => {
    expect(url).toBe(expectedUrl);

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async text() {
        return contents;
      },
    };
  };
}
