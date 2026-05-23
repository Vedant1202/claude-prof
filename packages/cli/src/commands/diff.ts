import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { diffProfiles, formatProfileDiff } from "@cprof/core";

export interface DiffCommandOptions {
  readonly cwd: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runDiff(
  flags: readonly string[],
  options: DiffCommandOptions,
): Promise<number> {
  const json = flags.includes("--json");
  const paths = flags.filter((flag) => flag !== "--json");

  if (paths.length !== 2) {
    options.stderr.write("usage: cprof diff [--json] <a.json> <b.json>\n");
    return 1;
  }

  const leftPath = paths[0]!;
  const rightPath = paths[1]!;
  const left = await readJson(resolve(options.cwd, leftPath));
  const right = await readJson(resolve(options.cwd, rightPath));
  const diff = diffProfiles(left, right);

  options.stdout.write(
    json ? `${JSON.stringify(diff, null, 2)}\n` : formatProfileDiff(diff),
  );

  return 0;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}
