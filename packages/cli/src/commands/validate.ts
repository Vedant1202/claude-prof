import { resolve } from "node:path";

import { validateProfileFile } from "@cprof/core";

export interface ValidateCommandOptions {
  readonly cwd: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runValidate(
  flags: readonly string[],
  options: ValidateCommandOptions,
): Promise<number> {
  const json = flags.includes("--json");
  const paths = flags.filter((flag) => flag !== "--json");
  const filePath = paths[0];

  if (filePath === undefined || paths.length > 1) {
    options.stderr.write("usage: cprof validate [--json] <file>\n");
    return 1;
  }

  const result = await validateProfileFile(resolve(options.cwd, filePath));

  if (json) {
    options.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.valid) {
    options.stdout.write("valid\n");
  } else {
    options.stderr.write(`${result.errors.join("\n")}\n`);
  }

  return result.exitCode;
}
