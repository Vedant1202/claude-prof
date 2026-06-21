import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest } from "../src/manifest.js";
import { createProfileSourceMetadata } from "../src/sources.js";
import { installProfile } from "../src/install.js";

let tempDir: string;
let profileDir: string;
let targetDir: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-install-"));
  profileDir = join(tempDir, "profile");
  targetDir = join(tempDir, "target");
  homeDir = join(tempDir, "home");
  await mkdir(profileDir, { recursive: true });
  await mkdir(targetDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("installProfile", () => {
  it("dry-runs project writes without mutating the target", async () => {
    await writeAsset("skills/review/SKILL.md", "# Review\n");
    await writeProfile(
      buildManifest({
        name: "project",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
        skills: {
          review: { source: "./skills/review", scope: "project" },
        },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      dryRun: true,
    });

    expect(result).toMatchObject({ ok: true, exitCode: 0, dryRun: true });
    expect(result.writes.map((write) => write.section)).toEqual([
      "settings",
      "skills",
    ]);
    await expect(
      readFile(
        join(targetDir, ".claude", "skills", "review", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("installs project assets and writes an install report", async () => {
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

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true);
    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
    await expect(
      readFile(join(targetDir, "cprof-install-report.txt"), "utf8"),
    ).resolves.toContain("Writes: 1");
  });

  it("fails on conflicts unless force is passed", async () => {
    await writeAsset("commands/deploy.md", "New deploy\n");
    await mkdir(join(targetDir, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "commands", "deploy.md"),
      "Existing deploy\n",
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

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result).toMatchObject({ ok: false, exitCode: 1 });
    expect(result.conflicts).toHaveLength(1);
    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Existing deploy\n");
  });

  it("backs up and overwrites conflicts with force", async () => {
    await writeAsset("commands/deploy.md", "New deploy\n");
    await mkdir(join(targetDir, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "commands", "deploy.md"),
      "Existing deploy\n",
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

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      force: true,
      now: new Date("2026-05-22T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(result.backups).toHaveLength(1);
    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("New deploy\n");
    await expect(
      readFile(
        join(
          targetDir,
          ".cprof-backups",
          "2026-05-22T00-00-00-000Z",
          ".claude",
          "commands",
          "deploy.md",
        ),
        "utf8",
      ),
    ).resolves.toBe("Existing deploy\n");
  });

  it("installs only project scoped entries from mixed profiles by default", async () => {
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

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toContainEqual({
      section: "commands",
      name: "global",
      reason: "scope-filtered",
    });
    await expect(
      readFile(join(targetDir, ".claude", "commands", "project.md"), "utf8"),
    ).resolves.toBe("Project\n");
    await expect(
      readFile(join(homeDir, ".claude", "commands", "global.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
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

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      env: {},
    });

    expect(result).toMatchObject({
      ok: false,
      exitCode: 1,
      missingSecrets: ["GITHUB_TOKEN"],
    });
    await expect(
      readFile(join(targetDir, ".mcp.json"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("resolves env placeholders into local config without reporting values", async () => {
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

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      env: { GITHUB_TOKEN: "ghp_123456789012345678901234567890123456" },
    });

    expect(result.ok).toBe(true);
    await expect(
      readFile(join(targetDir, ".mcp.json"), "utf8"),
    ).resolves.toContain("ghp_123456789012345678901234567890123456");
    expect(result.report).not.toContain(
      "ghp_123456789012345678901234567890123456",
    );
  });

  it("reports hooks and plugins as inventory-only skips", async () => {
    await writeProfile(
      buildManifest({
        name: "inventory",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
        hooks: {
          bash: { event: "PreToolUse", matcher: "Bash" },
        },
        plugins: {
          "agent-skills@addy-agent-skills": {
            marketplace: "addy-agent-skills",
            scope: "global",
          },
        },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.skipped).toEqual([
      { section: "hooks", name: "bash", reason: "hook-inventory-only" },
      {
        section: "plugins",
        name: "agent-skills@addy-agent-skills",
        reason: "plugin-inventory-only",
      },
    ]);
  });

  it("does not follow symlinks from profile assets", async () => {
    const outside = join(tempDir, "outside.md");
    await writeFile(outside, "Outside\n", "utf8");
    await mkdir(join(profileDir, "skills", "linked"), { recursive: true });
    await symlink(outside, join(profileDir, "skills", "linked", "outside.md"));
    await writeFile(
      join(profileDir, "skills", "linked", "SKILL.md"),
      "# Linked\n",
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "linked",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        skills: {
          linked: { source: "./skills/linked", scope: "project" },
        },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true);
    await expect(
      readFile(
        join(targetDir, ".claude", "skills", "linked", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe("# Linked\n");
    await expect(
      readFile(
        join(targetDir, ".claude", "skills", "linked", "outside.md"),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to write outside the target via a crafted section key", async () => {
    await writeAsset("legit.md", "# legit\n");
    await writeProfile({
      $schema: "https://cprof.dev/schema/v1.json",
      name: "evil",
      version: "1.0.0",
      profileScope: "project",
      includesGlobal: false,
      sources: [{ scope: "project" }],
      skills: {
        "../../../../escaped": { source: "./legit.md", scope: "project" },
      },
    });

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(false);
    expect(result.writes).toHaveLength(0);
    await expect(
      readFile(join(tempDir, "escaped", "legit.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("merges MCP servers into ~/.claude.json without clobbering other keys", async () => {
    await mkdir(join(homeDir, ".claude"), { recursive: true });
    await writeFile(
      join(homeDir, ".claude.json"),
      `${JSON.stringify(
        { userID: "keep-me", mcpServers: { existing: { command: "old" } } },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "g",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
        mcpServers: { added: { command: "npx", scope: "global" } },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      scope: "global",
      force: true,
    });

    expect(result.ok).toBe(true);
    const written = JSON.parse(
      await readFile(join(homeDir, ".claude.json"), "utf8"),
    ) as {
      userID: string;
      mcpServers: Record<string, { command: string }>;
    };
    expect(written.userID).toBe("keep-me");
    expect(written.mcpServers.existing).toEqual({ command: "old" });
    expect(written.mcpServers.added?.command).toBe("npx");
  });

  it("deep-merges settings.json without --force and backs up the prior file", async () => {
    await mkdir(join(targetDir, ".claude"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "settings.json"),
      `${JSON.stringify(
        { model: "opus", permissions: { allow: ["Read"] }, legacy: true },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { permissions: { allow: ["Edit"] }, env: { FLAG: "1" } },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true);
    const merged = JSON.parse(
      await readFile(join(targetDir, ".claude", "settings.json"), "utf8"),
    ) as {
      model: string;
      legacy: boolean;
      permissions: { allow: string[] };
      env: Record<string, string>;
    };
    expect(merged.model).toBe("opus"); // preserved
    expect(merged.legacy).toBe(true); // preserved
    expect(merged.permissions.allow).toEqual(["Read", "Edit"]); // unioned
    expect(merged.env).toEqual({ FLAG: "1" }); // added
    expect(
      result.writes.find((write) => write.section === "settings")?.action,
    ).toBe("merged");
    expect(result.backups.length).toBeGreaterThan(0);
  });

  it("merges global MCP into ~/.claude.json without --force", async () => {
    await mkdir(join(homeDir, ".claude"), { recursive: true });
    await writeFile(
      join(homeDir, ".claude.json"),
      `${JSON.stringify(
        { userID: "keep", mcpServers: { existing: { command: "old" } } },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "g",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
        mcpServers: { added: { command: "npx", scope: "global" } },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      scope: "global",
    });

    expect(result.ok).toBe(true);
    const written = JSON.parse(
      await readFile(join(homeDir, ".claude.json"), "utf8"),
    ) as { userID: string; mcpServers: Record<string, { command: string }> };
    expect(written.userID).toBe("keep");
    expect(written.mcpServers.existing).toEqual({ command: "old" });
    expect(written.mcpServers.added?.command).toBe("npx");
  });

  it("profile wins on collisions and reports overridden keys", async () => {
    await mkdir(join(targetDir, ".claude"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "settings.json"),
      `${JSON.stringify({ model: "opus" }, null, 2)}\n`,
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true);
    const merged = JSON.parse(
      await readFile(join(targetDir, ".claude", "settings.json"), "utf8"),
    ) as { model: string };
    expect(merged.model).toBe("sonnet"); // profile wins
    expect(result.report).toContain("[merged]");
    expect(result.report).toContain("overrides: model");
  });

  it("does not abort when the target already holds a secret (leak-check scans profile only)", async () => {
    await mkdir(join(targetDir, ".claude"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "settings.json"),
      `${JSON.stringify(
        { legacyToken: "ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8" },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet" },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true); // a pre-existing on-disk secret must not block install
    const merged = JSON.parse(
      await readFile(join(targetDir, ".claude", "settings.json"), "utf8"),
    ) as { model: string; legacyToken: string };
    expect(merged.model).toBe("sonnet");
    expect(merged.legacyToken).toContain("ghp_"); // user's own file is preserved
  });

  it("dry-run reports the merge disposition without writing", async () => {
    await mkdir(join(targetDir, ".claude"), { recursive: true });
    await writeFile(
      join(targetDir, ".claude", "settings.json"),
      `${JSON.stringify({ model: "opus" }, null, 2)}\n`,
      "utf8",
    );
    await writeProfile(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        settings: { model: "sonnet", env: { X: "1" } },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(
      result.writes.find((write) => write.section === "settings")?.action,
    ).toBe("merged");
    expect(result.backups).toEqual([]);
    const onDisk = JSON.parse(
      await readFile(join(targetDir, ".claude", "settings.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(onDisk).toEqual({ model: "opus" }); // unchanged
  });

  it("installs a remote (http) MCP server", async () => {
    await writeProfile(
      buildManifest({
        name: "p",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
        mcpServers: {
          api: {
            type: "http",
            url: "https://h.example.com/mcp",
            scope: "project",
          },
        },
      }),
    );

    const result = await installProfile({
      profilePath: join(profileDir, "claude-profile.json"),
      cwd: targetDir,
      homeDir,
    });

    expect(result.ok).toBe(true);
    const written = JSON.parse(
      await readFile(join(targetDir, ".mcp.json"), "utf8"),
    ) as { mcpServers: Record<string, { type: string; url: string }> };
    expect(written.mcpServers.api?.type).toBe("http");
    expect(written.mcpServers.api?.url).toBe("https://h.example.com/mcp");
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
