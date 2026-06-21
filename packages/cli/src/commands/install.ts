import { homedir } from "node:os";
import { resolve } from "node:path";

import { installProfile, type InstallScope } from "@cprof/core";

import { parseCommonFlags } from "../command-utils.js";

export interface InstallCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedInstallFlags {
  readonly valid: true;
  readonly profilePath: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly scope?: InstallScope;
}

export async function runInstall(
  flags: readonly string[],
  options: InstallCommandOptions,
): Promise<number> {
  const { quiet, rest } = parseCommonFlags(flags);
  const parsed = parseInstallFlags(rest);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const result = await installProfile({
    profilePath: resolve(options.cwd, parsed.profilePath),
    cwd: options.cwd,
    homeDir: options.homeDir ?? homedir(),
    env: options.env,
    dryRun: parsed.dryRun,
    force: parsed.force,
    scope: parsed.scope,
    installSource: parsed.profilePath,
  });

  if (!result.ok) {
    // Failure report explains the error — always shown, even with --quiet.
    options.stderr.write(result.report);
    return result.exitCode;
  }

  if (!quiet) {
    options.stdout.write(result.report);
    options.stdout.write(
      `${parsed.dryRun ? "Planned" : "Installed"} ${result.writes.length} writes\n`,
    );
  }

  return result.exitCode;
}

type ParseInstallResult =
  | ParsedInstallFlags
  | { readonly valid: false; readonly error: string };

function parseInstallFlags(flags: readonly string[]): ParseInstallResult {
  let profilePath: string | undefined;
  let dryRun = false;
  let force = false;
  let scope: InstallScope | undefined;

  for (const flag of flags) {
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (flag === "--force") {
      force = true;
      continue;
    }

    if (flag === "--global") {
      scope = "global";
      continue;
    }

    if (flag === "--include-global") {
      scope = "include-global";
      continue;
    }

    if (flag.startsWith("--")) {
      return { valid: false, error: `unknown install flag: ${flag}` };
    }

    if (profilePath !== undefined) {
      return { valid: false, error: `unexpected install argument: ${flag}` };
    }

    profilePath = flag;
  }

  if (profilePath === undefined) {
    return { valid: false, error: "install requires a profile path" };
  }

  if (flags.includes("--global") && flags.includes("--include-global")) {
    return {
      valid: false,
      error: "install cannot combine --global and --include-global",
    };
  }

  return {
    valid: true,
    profilePath,
    dryRun,
    force,
    scope,
  };
}
