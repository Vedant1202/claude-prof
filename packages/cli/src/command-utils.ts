import { readFile } from "node:fs/promises";

import { validateProfile } from "@cprof/core";
import type { CprofProfile } from "@cprof/schema";

export type CommandWriter = Pick<NodeJS.WriteStream, "write">;

export interface CommonFlags {
  /** `--json`: emit machine-readable output on stdout. */
  readonly json: boolean;
  /** `--quiet`/`-q`: suppress non-essential status output (never errors). */
  readonly quiet: boolean;
  /** The flags left after the common ones are removed. */
  readonly rest: readonly string[];
}

/**
 * Pull the cross-command flags (`--json`, `--quiet`/`-q`) out of a command's
 * argv so each command can parse its own positionals/flags from `rest` without
 * re-implementing — or tripping over — the shared ones.
 */
export function parseCommonFlags(flags: readonly string[]): CommonFlags {
  let json = false;
  let quiet = false;
  const rest: string[] = [];

  for (const flag of flags) {
    if (flag === "--json") {
      json = true;
    } else if (flag === "--quiet" || flag === "-q") {
      quiet = true;
    } else {
      rest.push(flag);
    }
  }

  return { json, quiet, rest };
}

/**
 * Write a command's `--json` result as a single object to stdout, wrapped in the
 * shared `{ command, ok, … }` envelope. The shape is consistent across commands;
 * it carries no stability guarantee while cprof is alpha.
 */
export function emitJson(
  stdout: CommandWriter,
  command: string,
  ok: boolean,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  stdout.write(`${JSON.stringify({ command, ok, ...fields }, null, 2)}\n`);
}

export type ReadProfileFileResult =
  | { readonly ok: true; readonly profile: CprofProfile }
  | {
      readonly ok: false;
      readonly exitCode: 1 | 2;
      readonly errors: readonly string[];
    };

export async function readProfileFile(
  filePath: string,
): Promise<ReadProfileFileResult> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        ok: false,
        exitCode: 2,
        errors: [`file not found: ${filePath}`],
      };
    }

    throw error;
  }

  try {
    const value = JSON.parse(contents) as unknown;
    const validation = validateProfile(value);

    if (!validation.valid) {
      return { ok: false, exitCode: 1, errors: validation.errors };
    }

    return { ok: true, profile: value as CprofProfile };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      errors: [
        error instanceof Error ? error.message : "profile JSON is invalid",
      ],
    };
  }
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
