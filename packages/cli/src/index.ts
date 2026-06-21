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

const USAGE = `cprof — snapshot, scrub, and migrate your Claude Code setup

Usage: cprof <command> [options]

Commands:
  init [--global | --include-global]   Snapshot the current setup into claude-profile.json
  refresh                              Rebuild the profile from its recorded source scope
  install <file> [--dry-run] [--force] [--global | --include-global]
                                       Apply a trusted profile to this machine (deep merge)
  validate <file>                      Validate a profile against the schema
  diff <a.json> <b.json>               Compare two profiles semantically
  profiles list                        List profiles recorded by local installs

Options:
  -h, --help                           Show this help
  -v, --version                        Show the version

Profiles are local-first and secret-redacted on capture, but redaction is
best-effort — always review a profile before sharing it.

Docs: https://vedant1202.github.io/claude-prof/
`;

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
    stdout.write(USAGE);
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

  stderr.write(
    `unknown command: ${command}\nRun \`cprof --help\` to see available commands.\n`,
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
