import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanClaudeProfile, validateProfile } from "@cprof/core";
import { finalizeProfileWrite } from "../src/command-utils.js";
import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;
let cwd: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-init-"));
  cwd = join(tempDir, "project");
  homeDir = join(tempDir, "home");
  await mkdir(cwd, { recursive: true });
  await mkdir(homeDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof init --out", () => {
  it("writes the bundle to a chosen directory, creating it if missing", async () => {
    const outDir = join(cwd, "bundle");

    await expect(
      main(["init", "--out", "bundle"], { cwd, homeDir }),
    ).resolves.toBe(0);

    const profile = JSON.parse(
      await readFile(join(outDir, "claude-profile.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(validateProfile(profile)).toMatchObject({ valid: true });
    await expect(
      readFile(join(outDir, ".gitignore"), "utf8"),
    ).resolves.toContain(".claude");
    await expect(
      readFile(join(outDir, "cprof-scan-report.txt"), "utf8"),
    ).resolves.toContain("cprof scan report");

    // Nothing is written to the current directory.
    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("round-trips: a profile written with --out installs cleanly", async () => {
    await mkdir(join(cwd, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(cwd, ".claude", "commands", "deploy.md"),
      "Deploy\n",
      "utf8",
    );

    await expect(
      main(["init", "--out", "bundle"], { cwd, homeDir }),
    ).resolves.toBe(0);

    const targetDir = join(tempDir, "target");
    await mkdir(targetDir, { recursive: true });

    await expect(
      main(["install", join(cwd, "bundle", "claude-profile.json")], {
        cwd: targetDir,
        homeDir,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(targetDir, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
  });

  it("rejects --out with no directory argument", async () => {
    const stderr = createWritable();

    await expect(
      main(["init", "--out"], { cwd, homeDir, stderr }),
    ).resolves.toBe(1);

    expect(stderr.output).toContain("requires a directory");
  });

  it("defaults to the current directory when --out is omitted", async () => {
    await expect(main(["init"], { cwd, homeDir })).resolves.toBe(0);

    const profile = JSON.parse(
      await readFile(join(cwd, "claude-profile.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(validateProfile(profile)).toMatchObject({ valid: true });
  });
});

describe("cprof init side-file opt-outs", () => {
  it("--no-gitignore omits the .gitignore but keeps the profile and report", async () => {
    await expect(
      main(["init", "--no-gitignore"], { cwd, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(cwd, "cprof-scan-report.txt"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(cwd, ".gitignore"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("--no-report omits the scan report but keeps the profile and .gitignore", async () => {
    await expect(main(["init", "--no-report"], { cwd, homeDir })).resolves.toBe(
      0,
    );

    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(cwd, ".gitignore"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(cwd, "cprof-scan-report.txt"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("both opt-outs leave only the profile", async () => {
    await expect(
      main(["init", "--no-gitignore", "--no-report"], { cwd, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(cwd, ".gitignore"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(cwd, "cprof-scan-report.txt"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("--no-report does not disable the secret leak gate", async () => {
    // A real scan, with the leak-check forced to fail as if redaction missed a
    // secret. The gate must refuse to write regardless of --no-report, which only
    // governs the cosmetic report file — never the security check.
    const scan = await scanClaudeProfile({
      name: "project",
      version: "1.0.0",
      cwd,
      homeDir,
      outputRoot: cwd,
      mode: "project",
      includeGlobal: false,
    });
    const leaky = {
      ...scan,
      leakCheck: {
        ok: false,
        leaks: [
          {
            path: "claude-profile.json",
            tokenIndex: 0,
            reason: "high-entropy" as const,
          },
        ],
      },
    };
    const stderr = createWritable();

    const code = await finalizeProfileWrite({
      command: "init",
      cwd,
      scan: leaky,
      json: false,
      quiet: true,
      writeGitignore: false,
      writeReport: false,
      successMessage: "unused",
      stdout: createWritable(),
      stderr,
    });

    expect(code).toBe(3);
    expect(stderr.output).toContain("refusing to write");
    // Nothing is written — not even the profile.
    await expect(
      readFile(join(cwd, "claude-profile.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("cprof init --template", () => {
  async function seedProject(): Promise<void> {
    await mkdir(join(cwd, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(cwd, ".claude", "commands", "deploy.md"),
      "Deploy\n",
      "utf8",
    );
  }

  it("saves the current setup as a named template under ~/.cprof/templates", async () => {
    await seedProject();

    await expect(
      main(["init", "--template", "react-app"], { cwd, homeDir }),
    ).resolves.toBe(0);

    const profile = JSON.parse(
      await readFile(
        join(
          homeDir,
          ".cprof",
          "templates",
          "react-app",
          "claude-profile.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(validateProfile(profile)).toMatchObject({ valid: true });
  });

  it("creates no template unless --template is passed (explicit only)", async () => {
    await expect(main(["init"], { cwd, homeDir })).resolves.toBe(0);

    await expect(stat(join(homeDir, ".cprof"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects combining --template with --out", async () => {
    const stderr = createWritable();

    await expect(
      main(["init", "--template", "foo", "--out", "x"], {
        cwd,
        homeDir,
        stderr,
      }),
    ).resolves.toBe(1);

    expect(stderr.output).toMatch(/cannot combine/i);
  });

  it("round-trips: init --template then new <name> scaffolds it", async () => {
    await seedProject();

    await expect(
      main(["init", "--template", "react-app"], { cwd, homeDir }),
    ).resolves.toBe(0);

    const dest = join(tempDir, "my-app");
    await expect(
      main(["new", "react-app", dest], { cwd: tempDir, homeDir }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(dest, ".claude", "commands", "deploy.md"), "utf8"),
    ).resolves.toBe("Deploy\n");
  });
});
