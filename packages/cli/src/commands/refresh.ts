import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  createProfileGitignore,
  createScanReport,
  scanClaudeProfile,
  validateProfile,
} from "@cprof/core";

import {
  emitJson,
  parseCommonFlags,
  readProfileFile,
  type CommandWriter,
} from "../command-utils.js";

export interface RefreshCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

export async function runRefresh(
  flags: readonly string[],
  options: RefreshCommandOptions,
): Promise<number> {
  const { json, quiet, rest } = parseCommonFlags(flags);

  if (rest.length > 0) {
    options.stderr.write(`unknown refresh flag: ${rest[0]}\n`);
    return 1;
  }

  const profilePath = join(options.cwd, "claude-profile.json");
  const existing = await readProfileFile(profilePath);

  if (!existing.ok) {
    if (json) {
      emitJson(options.stdout, "refresh", false, { errors: existing.errors });
    } else {
      options.stderr.write(`${existing.errors.join("\n")}\n`);
    }
    return existing.exitCode;
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
    if (json) {
      emitJson(options.stdout, "refresh", false, { errors: validation.errors });
    } else {
      options.stderr.write(`${validation.errors.join("\n")}\n`);
    }
    return validation.exitCode;
  }

  if (!scan.leakCheck.ok) {
    const leakedPaths = [
      ...new Set(scan.leakCheck.leaks.map((leak) => leak.path)),
    ];
    if (json) {
      emitJson(options.stdout, "refresh", false, {
        leakCheck: { ok: false, leaks: scan.leakCheck.leaks },
      });
    } else {
      options.stderr.write(
        `refusing to write: redaction left a secret in ${leakedPaths.join(", ")}\n`,
      );
    }
    return 3;
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

  if (json) {
    emitJson(options.stdout, "refresh", true, {
      profilePath: "claude-profile.json",
      profileScope: refreshed.profileScope,
      includesGlobal: refreshed.includesGlobal,
      leakCheck: { ok: true, leaks: [] },
    });
  } else if (!quiet) {
    options.stderr.write("Refreshed claude-profile.json\n");
  }
  return 0;
}
