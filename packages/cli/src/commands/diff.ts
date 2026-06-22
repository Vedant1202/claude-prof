import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { diffProfiles, formatProfileDiff } from "@cprof/core";

import { emitJson, isNodeError, parseCommonFlags } from "../command-utils.js";

export interface DiffCommandOptions {
  readonly cwd: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runDiff(
  flags: readonly string[],
  options: DiffCommandOptions,
): Promise<number> {
  const { json, rest } = parseCommonFlags(flags);

  if (rest.length !== 2) {
    options.stderr.write("usage: cprof diff [--json] <a.json> <b.json>\n");
    return 1;
  }

  const leftPath = rest[0]!;
  const rightPath = rest[1]!;

  const left = await readJson(resolve(options.cwd, leftPath), leftPath);
  if (!left.ok) {
    return reportReadError(left, json, options);
  }

  const right = await readJson(resolve(options.cwd, rightPath), rightPath);
  if (!right.ok) {
    return reportReadError(right, json, options);
  }

  const diff = diffProfiles(left.value, right.value);

  if (json) {
    // `ok` reports that the command succeeded; `equal` reports whether the two
    // profiles actually match (the diff's success doesn't imply they're equal).
    emitJson(options.stdout, "diff", true, {
      equal: diff.entries.length === 0,
      ...diff,
    });
  } else {
    options.stdout.write(formatProfileDiff(diff));
  }

  return 0;
}

type ReadJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly exitCode: 1 | 2; readonly error: string };

async function readJson(
  filePath: string,
  displayPath: string,
): Promise<ReadJsonResult> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    const message =
      isNodeError(error) && error.code === "ENOENT"
        ? `file not found: ${displayPath}`
        : `cannot read ${displayPath}: ${isNodeError(error) ? error.code : "unknown error"}`;
    return { ok: false, exitCode: 2, error: message };
  }

  try {
    return { ok: true, value: JSON.parse(contents) as unknown };
  } catch {
    return { ok: false, exitCode: 1, error: `invalid JSON in ${displayPath}` };
  }
}

function reportReadError(
  result: { readonly exitCode: 1 | 2; readonly error: string },
  json: boolean,
  options: DiffCommandOptions,
): number {
  if (json) {
    emitJson(options.stdout, "diff", false, { errors: [result.error] });
  } else {
    options.stderr.write(`${result.error}\n`);
  }

  return result.exitCode;
}
