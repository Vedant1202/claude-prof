import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { rollbackLastInstall, type RollbackResult } from "@cprof/core";

import {
  emitJson,
  parseCommonFlags,
  type CommandWriter,
} from "../command-utils.js";

export interface RollbackCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

/**
 * Undo (or, with --undo, redo) the most recent install in a scope. Exit codes:
 * 0 done/planned · 1 usage · 2 nothing to do · 3 aborted (files changed; --force).
 */
export async function runRollback(
  flags: readonly string[],
  options: RollbackCommandOptions,
): Promise<number> {
  const { json, quiet, rest } = parseCommonFlags(flags);

  let mode: "rollback" | "undo" = "rollback";
  let force = false;
  let dryRun = false;
  let global = false;

  for (const flag of rest) {
    if (flag === "--undo") mode = "undo";
    else if (flag === "--force") force = true;
    else if (flag === "--dry-run") dryRun = true;
    else if (flag === "--global") global = true;
    else {
      options.stderr.write(`unknown rollback flag: ${flag}\n`);
      return 1;
    }
  }

  const statePath = global
    ? join(
        resolve(options.homeDir ?? homedir()),
        ".claude",
        ".cprof-state.json",
      )
    : join(resolve(options.cwd), ".cprof-state.json");

  const result = await rollbackLastInstall({ statePath, mode, force, dryRun });

  if (json) {
    emitJson(options.stdout, "rollback", result.ok, {
      mode: result.mode,
      outcome: result.outcome,
      dryRun: result.dryRun,
      restored: result.restored,
      trashed: result.trashed,
      reapplied: result.reapplied,
      ...(result.outcome === "aborted-changed"
        ? { aborted: { changed: result.changed } }
        : {}),
    });
    return exitCodeFor(result);
  }

  reportHuman(result, quiet, options);
  return exitCodeFor(result);
}

function exitCodeFor(result: RollbackResult): number {
  switch (result.outcome) {
    case "done":
    case "planned":
      return 0;
    case "nothing-to-do":
      return 2;
    case "aborted-changed":
      return 3;
  }
}

function reportHuman(
  result: RollbackResult,
  quiet: boolean,
  options: RollbackCommandOptions,
): void {
  const verb = result.mode === "undo" ? "undo" : "roll back";

  if (result.outcome === "nothing-to-do") {
    options.stderr.write(`Nothing to ${verb}.\n`);
    return;
  }

  if (result.outcome === "aborted-changed") {
    options.stderr.write(
      `Refusing to ${verb}: ${result.changed.length} file(s) changed since install:\n` +
        result.changed.map((path) => `  ${path}`).join("\n") +
        `\nRe-run with --force to ${verb} anyway.\n`,
    );
    return;
  }

  if (quiet) {
    return;
  }

  const prefix = result.dryRun ? "Would " : "";
  if (result.mode === "undo") {
    options.stderr.write(
      `${prefix}re-apply ${result.reapplied.length} file(s).\n`,
    );
  } else {
    options.stderr.write(
      `${prefix}roll back: ${result.restored.length} restored, ${result.trashed.length} removed.\n`,
    );
  }
}
