import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { checkGeneratedOutputForLeaks, type OutputLeak } from "@cprof/core";

import {
  emitJson,
  parseCommonFlags,
  type CommandWriter,
} from "../command-utils.js";

export interface ScanCommandOptions {
  readonly cwd: string;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

/**
 * Scan arbitrary files for secrets using the same engine that gates init/install
 * output. Standalone gate for pre-commit / CI: exit 3 on a finding, 0 when clean,
 * 2 if a file is missing, 1 on usage error. Findings carry the same strengths and
 * limits as redaction (best-effort, not a guarantee).
 */
export async function runScan(
  flags: readonly string[],
  options: ScanCommandOptions,
): Promise<number> {
  const { json, quiet, rest } = parseCommonFlags(flags);

  if (rest.length === 0) {
    options.stderr.write("usage: cprof scan [--json] [--quiet] <file...>\n");
    return 1;
  }

  const outputs: { readonly path: string; readonly contents: string }[] = [];

  for (const file of rest) {
    try {
      const contents = await readFile(resolve(options.cwd, file), "utf8");
      // Display the path as the user gave it, not the resolved absolute path.
      outputs.push({ path: file, contents });
    } catch (error) {
      if (isEnoent(error)) {
        if (json) {
          emitJson(options.stdout, "scan", false, {
            leaks: [],
            errors: [`file not found: ${file}`],
          });
        } else {
          options.stderr.write(`file not found: ${file}\n`);
        }
        return 2;
      }

      throw error;
    }
  }

  const result = await checkGeneratedOutputForLeaks(outputs);

  if (json) {
    emitJson(options.stdout, "scan", result.ok, {
      leaks: result.leaks.map((leak) => ({
        path: leak.path,
        line: leak.line,
        col: leak.col,
        reason: leak.reason,
      })),
    });
    return result.ok ? 0 : 3;
  }

  for (const leak of result.leaks) {
    options.stdout.write(`${formatLeak(leak)}\n`);
  }

  if (!quiet) {
    if (result.ok) {
      options.stderr.write(`No secrets found in ${outputs.length} file(s).\n`);
    } else {
      const fileCount = new Set(result.leaks.map((leak) => leak.path)).size;
      options.stderr.write(
        `Found ${result.leaks.length} potential secret(s) in ${fileCount} file(s).\n`,
      );
    }
  }

  return result.ok ? 0 : 3;
}

function formatLeak(leak: OutputLeak): string {
  const location =
    leak.line !== undefined
      ? `${leak.path}:${leak.line}:${leak.col}`
      : leak.path;

  return `${location}  ${leak.reason}`;
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
