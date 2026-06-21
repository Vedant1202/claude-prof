import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanClaudeProfile } from "../src/scanner.js";
import { validateProfile } from "../src/validate.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-scanner-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("scanClaudeProfile", () => {
  it("bundles project assets and captures safe settings and MCP config", async () => {
    const project = join(tempDir, "project");
    const home = join(tempDir, "home");
    await mkdir(join(project, ".claude", "commands"), { recursive: true });
    await mkdir(join(project, ".claude", "agents"), { recursive: true });
    await mkdir(join(project, ".claude", "skills", "review"), {
      recursive: true,
    });
    await mkdir(join(project, ".claude", "rules"), { recursive: true });
    await writeFile(join(project, "CLAUDE.md"), "Project memory\n", "utf8");
    await writeFile(
      join(project, ".claude", "commands", "deploy.md"),
      "Deploy command\n",
      "utf8",
    );
    await writeFile(
      join(project, ".claude", "agents", "reviewer.md"),
      "Review agent\n",
      "utf8",
    );
    await writeFile(
      join(project, ".claude", "skills", "review", "SKILL.md"),
      "# Review\n",
      "utf8",
    );
    await writeFile(
      join(project, ".claude", "rules", "style.md"),
      "Style rules\n",
      "utf8",
    );
    await writeFile(
      join(project, ".claude", "settings.json"),
      JSON.stringify({
        model: "opus",
        oauthToken: "must-not-be-captured",
        env: { SAFE_FLAG: "1" },
      }),
      "utf8",
    );
    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "ghp_123456789012345678901234567890123456",
            },
          },
        },
      }),
      "utf8",
    );

    const result = await scanClaudeProfile({
      cwd: project,
      homeDir: home,
      outputRoot: project,
      mode: "project",
      name: "project",
      version: "1.0.0",
    });

    expect(validateProfile(result.manifest)).toMatchObject({ valid: true });
    expect(result.report.detected).toMatchObject({
      agents: 1,
      commands: 1,
      mcpServers: 1,
      memory: 1,
      rules: 1,
      skills: 1,
    });
    expect(result.manifest.settings).toEqual({
      env: { SAFE_FLAG: "1" },
      model: "opus",
    });
    expect(result.manifest.settings).not.toHaveProperty("oauthToken");
    expect(result.manifest.mcpServers?.github?.env?.GITHUB_TOKEN).toBe(
      "${env:GITHUB_TOKEN}",
    );
    expect(result.manifest.secrets?.required).toEqual(["GITHUB_TOKEN"]);
    expect(result.report.redactions).toHaveLength(1);
    // The generated manifest re-scans clean: redaction handled the secret, and
    // asset hashes / URLs do not trip the leak-check.
    expect(result.leakCheck.ok).toBe(true);
    await expect(
      readFile(join(project, "commands", "deploy", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy command\n");
  });

  it("skips files matched by .cprofignore while bundling directories", async () => {
    const project = join(tempDir, "project");
    const home = join(tempDir, "home");
    await mkdir(join(project, ".claude", "skills", "review"), {
      recursive: true,
    });
    await writeFile(
      join(project, ".claude", "skills", "review", "SKILL.md"),
      "# Review\n",
      "utf8",
    );
    await writeFile(
      join(project, ".claude", "skills", "review", "secret.md"),
      "ignored\n",
      "utf8",
    );
    await writeFile(join(project, ".cprofignore"), "secret.md\n", "utf8");

    const result = await scanClaudeProfile({
      cwd: project,
      homeDir: home,
      outputRoot: project,
      mode: "project",
      name: "project",
      version: "1.0.0",
    });

    expect(result.manifest.skills?.review).toBeDefined();
    await expect(
      readFile(join(project, "skills", "review", "SKILL.md"), "utf8"),
    ).resolves.toBe("# Review\n");
    await expect(
      readFile(join(project, "skills", "review", "secret.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("inventories plugins and bundles safe plugin marketplace assets", async () => {
    const project = join(tempDir, "profile");
    const home = join(tempDir, "home");
    const pluginRoot = join(
      home,
      ".claude",
      "plugins",
      "marketplaces",
      "addy-agent-skills",
    );
    await mkdir(join(home, ".claude", "plugins"), { recursive: true });
    await mkdir(join(pluginRoot, "skills", "debug"), { recursive: true });
    await mkdir(join(pluginRoot, ".claude", "commands"), { recursive: true });
    await mkdir(join(pluginRoot, "agents"), { recursive: true });
    await writeFile(
      join(home, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "agent-skills@addy-agent-skills": [
            { scope: "user", version: "1.0.0" },
          ],
        },
      }),
      "utf8",
    );
    await writeFile(
      join(home, ".claude", "plugins", "known_marketplaces.json"),
      JSON.stringify({
        "addy-agent-skills": {
          source: { source: "github", repo: "addyosmani/agent-skills" },
        },
      }),
      "utf8",
    );
    await writeFile(
      join(pluginRoot, "skills", "debug", "SKILL.md"),
      "# Debug\n",
    );
    await writeFile(
      join(pluginRoot, ".claude", "commands", "audit.md"),
      "Audit\n",
    );
    await writeFile(join(pluginRoot, "agents", "critic.md"), "Critic\n");

    const result = await scanClaudeProfile({
      cwd: project,
      homeDir: home,
      outputRoot: project,
      mode: "global",
      name: "global",
      version: "1.0.0",
    });

    expect(result.manifest.plugins).toHaveProperty(
      "agent-skills@addy-agent-skills",
    );
    expect(result.manifest.skills).toHaveProperty(
      "agent-skills_addy-agent-skills__debug",
    );
    expect(result.manifest.commands).toHaveProperty(
      "agent-skills_addy-agent-skills__audit",
    );
    expect(result.manifest.agents).toHaveProperty(
      "agent-skills_addy-agent-skills__critic",
    );
    expect(result.report.detected).toMatchObject({
      agents: 1,
      commands: 1,
      plugins: 1,
      skills: 1,
    });
  });

  it("captures remote (http) MCP servers without a command", async () => {
    const project = join(tempDir, "project");
    const home = join(tempDir, "home");
    await mkdir(project, { recursive: true });
    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          remote: { type: "http", url: "https://api.example.com/mcp" },
        },
      }),
      "utf8",
    );

    const result = await scanClaudeProfile({
      cwd: project,
      homeDir: home,
      outputRoot: project,
      mode: "project",
      name: "project",
      version: "1.0.0",
    });

    expect(result.manifest.mcpServers?.remote?.type).toBe("http");
    expect(result.manifest.mcpServers?.remote?.url).toBe(
      "https://api.example.com/mcp",
    );
    expect(validateProfile(result.manifest)).toMatchObject({ valid: true });
  });
});
