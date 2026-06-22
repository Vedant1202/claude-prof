import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateProfile } from "@cprof/core";
import { main } from "../src/index.js";
import { createWritable, readProfileJson } from "./helpers.js";

// Read the version from the package so this test survives version bumps.
const pkgVersion = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof cli", () => {
  it("prints the version", async () => {
    const stdout = createWritable();

    await expect(main(["--version"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toBe(`${pkgVersion}\n`);
  });

  it("treats --version after a command as that command's argument, not global", async () => {
    const stdout = createWritable();
    const stderr = createWritable();

    await expect(
      main(["scan", "--version"], { cwd: tempDir, stdout, stderr }),
    ).resolves.toBe(2);

    expect(stdout.output).not.toContain(pkgVersion);
  });

  it("prints usage with --help and exits 0", async () => {
    const stdout = createWritable();

    await expect(main(["--help"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof <command>");
    expect(stdout.output).toContain("init");
    expect(stdout.output).toContain("install");
  });

  it("prints usage when no command is given", async () => {
    const stdout = createWritable();

    await expect(main([], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof <command>");
  });

  it("rejects an unknown command with a hint", async () => {
    const stderr = createWritable();

    await expect(main(["frobnicate"], { stderr })).resolves.toBe(1);

    expect(stderr.output).toContain("unknown command: frobnicate");
    expect(stderr.output).toContain("--help");
  });

  it("creates a project profile", async () => {
    await mkdir(join(tempDir, "project"));
    const cwd = join(tempDir, "project");

    await expect(main(["init"], { cwd })).resolves.toBe(0);

    const profile = await readProfileJson(cwd);
    expect(validateProfile(profile)).toMatchObject({ valid: true });
    expect(profile).toMatchObject({
      profileScope: "project",
      includesGlobal: false,
      sources: [
        { scope: "project", root: "." },
        { scope: "project", paths: ["~/.claude.json"], private: true },
      ],
    });
    await expect(readFile(join(cwd, ".gitignore"), "utf8")).resolves.toContain(
      ".claude/.credentials.json",
    );
    await expect(
      readFile(join(cwd, "cprof-scan-report.txt"), "utf8"),
    ).resolves.toContain("cprof scan report");
  });

  it("creates a global profile", async () => {
    const homeDir = await createHomeWithInstalledPlugin();

    await expect(
      main(["init", "--global"], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);

    const profile = await readProfileJson(tempDir);
    expect(validateProfile(profile)).toMatchObject({ valid: true });
    expect(profile).toMatchObject({
      profileScope: "global",
      includesGlobal: false,
      sources: [{ scope: "global", paths: ["~/.claude", "~/.claude.json"] }],
      plugins: {
        "agent-skills@addy-agent-skills": {
          marketplace: "addy-agent-skills",
          version: "1.0.0",
          source: "https://github.com/addyosmani/agent-skills",
          scope: "global",
          private: true,
        },
      },
    });
    await expect(
      readFile(join(tempDir, "cprof-scan-report.txt"), "utf8"),
    ).resolves.toContain("- plugins: 1");
  });

  it("creates a project profile with global context", async () => {
    const homeDir = await createHomeWithInstalledPlugin();

    await expect(
      main(["init", "--include-global"], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);

    const profile = await readProfileJson(tempDir);
    expect(validateProfile(profile)).toMatchObject({ valid: true });
    expect(profile).toMatchObject({
      profileScope: "project",
      includesGlobal: true,
      sources: [
        { scope: "project", root: "." },
        { scope: "project", paths: ["~/.claude.json"], private: true },
        { scope: "global", paths: ["~/.claude", "~/.claude.json"] },
      ],
    });
    expect(profile.plugins).toMatchObject({
      "agent-skills@addy-agent-skills": {
        marketplace: "addy-agent-skills",
      },
    });
  });

  it("rejects incompatible init flags", async () => {
    const stderr = createWritable();

    await expect(
      main(["init", "--global", "--include-global"], { cwd: tempDir, stderr }),
    ).resolves.toBe(1);

    expect(stderr.output).toContain("cannot combine");
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
