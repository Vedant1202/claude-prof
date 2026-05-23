import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  createProfileGitignore,
  createScanReport,
  scanClaudeProfile,
  validateProfile,
} from "@cprof/core";
import type { CprofProfile } from "@cprof/schema";

export interface RefreshCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runRefresh(
  flags: readonly string[],
  options: RefreshCommandOptions,
): Promise<number> {
  if (flags.length > 0) {
    options.stderr.write(`unknown refresh flag: ${flags[0]}\n`);
    return 1;
  }

  const profilePath = join(options.cwd, "claude-profile.json");
  const existing = await readProfile(profilePath);

  if (existing.category === "not-found") {
    options.stderr.write(`file not found: ${profilePath}\n`);
    return 2;
  }

  if (existing.category === "invalid") {
    options.stderr.write(`${existing.error}\n`);
    return 1;
  }

  const scan = await scanClaudeProfile({
    name: existing.profile.name,
    version: existing.profile.version,
    description: existing.profile.description,
    claudeCode: existing.profile.claudeCode,
    cwd: options.cwd,
    homeDir: options.homeDir ?? homedir(),
    outputRoot: options.cwd,
    mode: existing.profile.profileScope,
    includeGlobal:
      existing.profile.profileScope === "project"
        ? existing.profile.includesGlobal
        : false,
  });
  const refreshed = scan.manifest;
  const validation = validateProfile(refreshed);

  if (!validation.valid) {
    options.stderr.write(`${validation.errors.join("\n")}\n`);
    return validation.exitCode;
  }

  await writeFile(
    profilePath,
    `${JSON.stringify(refreshed, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(options.cwd, ".gitignore"),
    createProfileGitignore(),
    "utf8",
  );
  await writeFile(
    join(options.cwd, "cprof-scan-report.txt"),
    createScanReport(scan.report),
    "utf8",
  );

  options.stdout.write("Refreshed claude-profile.json\n");
  return 0;
}

type ReadProfileResult =
  | { readonly category: "ok"; readonly profile: CprofProfile }
  | { readonly category: "not-found" }
  | { readonly category: "invalid"; readonly error: string };

async function readProfile(filePath: string): Promise<ReadProfileResult> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { category: "not-found" };
    }

    throw error;
  }

  try {
    const value = JSON.parse(contents) as unknown;
    const validation = validateProfile(value);

    if (!validation.valid) {
      return {
        category: "invalid",
        error: validation.errors.join("\n"),
      };
    }

    return { category: "ok", profile: value as CprofProfile };
  } catch (error) {
    return {
      category: "invalid",
      error: error instanceof Error ? error.message : "profile JSON is invalid",
    };
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
