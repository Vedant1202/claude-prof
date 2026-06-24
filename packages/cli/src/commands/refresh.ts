import { homedir } from "node:os";
import { join } from "node:path";

import { scanClaudeProfile } from "@cprof/core";

import {
  emitJson,
  finalizeProfileWrite,
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

  let writeGitignore = true;
  let writeReport = true;
  for (const flag of rest) {
    if (flag === "--no-gitignore") {
      writeGitignore = false;
    } else if (flag === "--no-report") {
      writeReport = false;
    } else {
      options.stderr.write(`unknown refresh flag: ${flag}\n`);
      return 1;
    }
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

  return finalizeProfileWrite({
    command: "refresh",
    cwd: options.cwd,
    scan,
    json,
    quiet,
    writeGitignore,
    writeReport,
    successMessage: "Refreshed claude-profile.json",
    stdout: options.stdout,
    stderr: options.stderr,
  });
}
