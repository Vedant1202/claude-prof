#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  findCommand,
  renderOverviewUsage,
  type CommandContext,
} from "./registry.js";

export interface MainOptions {
  readonly cwd?: string;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
}

function readVersion(): string {
  try {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      readonly version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  options: MainOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (argv.includes("--version") || argv.includes("-v")) {
    stdout.write(`${readVersion()}\n`);
    return 0;
  }

  if (
    argv.length === 0 ||
    argv[0] === "help" ||
    argv.includes("--help") ||
    argv.includes("-h")
  ) {
    stdout.write(renderOverviewUsage());
    return 0;
  }

  const [command, ...flags] = argv;

  if (command === undefined) {
    stdout.write(renderOverviewUsage());
    return 0;
  }

  const resolved = findCommand(command);

  if (resolved === undefined) {
    stderr.write(
      `unknown command: ${command}\nRun \`cprof --help\` to see available commands.\n`,
    );
    return 1;
  }

  const context: CommandContext = {
    cwd: options.cwd ?? process.cwd(),
    homeDir: options.homeDir,
    env: options.env,
    stdout,
    stderr,
  };

  return resolved.run(flags, context);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
