import { readFile } from "node:fs/promises";

import { validateProfile } from "@cprof/core";
import type { CprofProfile } from "@cprof/schema";

export type CommandWriter = Pick<NodeJS.WriteStream, "write">;

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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
