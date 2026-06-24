import { homedir } from "node:os";
import { resolve } from "node:path";

import { installProfile } from "@cprof/core";

import {
  emitJson,
  parseCommonFlags,
  type CommandWriter,
} from "../command-utils.js";

export interface NewCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

interface ParsedNewFlags {
  readonly valid: true;
  readonly profilePath: string;
  readonly targetDir: string;
  readonly force: boolean;
}

type ParseNewResult =
  | ParsedNewFlags
  | { readonly valid: false; readonly error: string };

/**
 * `cprof new <profile> [dir]`: scaffold a fresh project from a profile. A thin
 * front over `installProfile` with one contract change vs `install` — it refuses
 * to touch anything that already exists unless `--force`. A forced overwrite still
 * keeps install's backup, so `cprof rollback` can reverse a scaffold.
 */
export async function runNew(
  flags: readonly string[],
  options: NewCommandOptions,
): Promise<number> {
  const { json, quiet, rest } = parseCommonFlags(flags);
  const parsed = parseNewFlags(rest);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const installInput = {
    profilePath: resolve(options.cwd, parsed.profilePath),
    cwd: resolve(options.cwd, parsed.targetDir),
    homeDir: options.homeDir ?? homedir(),
    env: options.env,
    installSource: parsed.profilePath,
  };

  // Pre-flight: plan with force so the plan is complete, then refuse if it would
  // touch any file that already exists. `new` creates; it never silently overwrites.
  const plan = await installProfile({
    ...installInput,
    dryRun: true,
    force: true,
  });

  if (!plan.ok) {
    if (json) {
      emitJson(options.stdout, "new", false, { errors: plan.errors });
    } else {
      options.stderr.write(plan.report);
    }
    return plan.exitCode;
  }

  const existing = [
    ...new Set(
      plan.writes
        .filter((write) => write.action !== "created")
        .map((write) => write.path),
    ),
  ];

  if (existing.length > 0 && !parsed.force) {
    if (json) {
      emitJson(options.stdout, "new", false, { refused: true, existing });
    } else {
      options.stderr.write(
        `refusing to scaffold: these files already exist (pass --force to overwrite):\n${existing
          .map((path) => `  ${path}`)
          .join("\n")}\n`,
      );
    }
    return 1;
  }

  if (plan.writes.length === 0) {
    if (json) {
      emitJson(options.stdout, "new", true, { writes: [] });
    } else if (!quiet) {
      options.stderr.write(
        "Nothing to scaffold (the profile has no project content)\n",
      );
    }
    return 0;
  }

  const result = await installProfile({
    ...installInput,
    dryRun: false,
    force: parsed.force,
  });

  if (json) {
    emitJson(options.stdout, "new", result.ok, {
      target: parsed.targetDir,
      writes: result.writes,
      backups: result.backups,
      missingSecrets: result.missingSecrets,
      errors: result.errors,
    });
    return result.exitCode;
  }

  if (!result.ok) {
    options.stderr.write(result.report);
    return result.exitCode;
  }

  if (!quiet) {
    const count = result.writes.length;
    options.stdout.write(
      `Scaffolded ${count} file${count === 1 ? "" : "s"} into ${parsed.targetDir}\n`,
    );
  }

  return result.exitCode;
}

function parseNewFlags(flags: readonly string[]): ParseNewResult {
  let profilePath: string | undefined;
  let targetDir = ".";
  let force = false;
  let positionals = 0;

  for (const flag of flags) {
    if (flag === "--force") {
      force = true;
      continue;
    }

    if (flag.startsWith("--")) {
      return { valid: false, error: `unknown new flag: ${flag}` };
    }

    if (positionals === 0) {
      profilePath = flag;
    } else if (positionals === 1) {
      targetDir = flag;
    } else {
      return { valid: false, error: `unexpected new argument: ${flag}` };
    }
    positionals += 1;
  }

  if (profilePath === undefined) {
    return { valid: false, error: "new requires a profile path" };
  }

  return { valid: true, profilePath, targetDir, force };
}
