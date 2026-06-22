import { resolve } from "node:path";

import { validateProfileFile } from "@cprof/core";

import { emitJson, parseCommonFlags } from "../command-utils.js";

export interface ValidateCommandOptions {
  readonly cwd: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runValidate(
  flags: readonly string[],
  options: ValidateCommandOptions,
): Promise<number> {
  const { json, rest } = parseCommonFlags(flags);
  const filePath = rest[0];

  if (filePath === undefined || rest.length > 1) {
    options.stderr.write("usage: cprof validate [--json] <file>\n");
    return 1;
  }

  const result = await validateProfileFile(resolve(options.cwd, filePath));

  if (json) {
    emitJson(options.stdout, "validate", result.valid, {
      errors: result.errors,
    });
  } else if (result.valid) {
    options.stdout.write("valid\n");
  } else {
    options.stderr.write(`${result.errors.join("\n")}\n`);
  }

  return result.exitCode;
}
