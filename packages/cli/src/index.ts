#!/usr/bin/env node

import { runDiff } from "./commands/diff.js";
import { runInit } from "./commands/init.js";
import { runRefresh } from "./commands/refresh.js";
import { runValidate } from "./commands/validate.js";

export interface MainOptions {
  readonly cwd?: string;
  readonly homeDir?: string;
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  options: MainOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (argv.includes("--version")) {
    stdout.write("0.0.0\n");
    return 0;
  }

  const [command, ...flags] = argv;

  if (command === "init") {
    return runInit(flags, {
      cwd: options.cwd ?? process.cwd(),
      homeDir: options.homeDir,
      stdout,
      stderr,
    });
  }

  if (command === "refresh") {
    return runRefresh(flags, {
      cwd: options.cwd ?? process.cwd(),
      homeDir: options.homeDir,
      stdout,
      stderr,
    });
  }

  if (command === "validate") {
    return runValidate(flags, {
      cwd: options.cwd ?? process.cwd(),
      stdout,
      stderr,
    });
  }

  if (command === "diff") {
    return runDiff(flags, {
      cwd: options.cwd ?? process.cwd(),
      stdout,
      stderr,
    });
  }

  stderr.write(`unknown command: ${command ?? "(none)"}\n`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
