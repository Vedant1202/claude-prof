#!/usr/bin/env node

import { runDiff } from "./commands/diff.js";
import { runInit } from "./commands/init.js";
import { runInstall } from "./commands/install.js";
import { runProfiles } from "./commands/profiles.js";
import { runRefresh } from "./commands/refresh.js";
import { runValidate } from "./commands/validate.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

  if (argv.includes("--version")) {
    stdout.write(`${readVersion()}\n`);
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

  if (command === "install") {
    return runInstall(flags, {
      cwd: options.cwd ?? process.cwd(),
      homeDir: options.homeDir,
      env: options.env,
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

  if (command === "profiles") {
    return runProfiles(flags, {
      cwd: options.cwd ?? process.cwd(),
      homeDir: options.homeDir,
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
