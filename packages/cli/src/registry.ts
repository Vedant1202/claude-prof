import { runCompletion } from "./commands/completion.js";
import { runDiff } from "./commands/diff.js";
import { runHelp } from "./commands/help.js";
import { runInit } from "./commands/init.js";
import { runInstall } from "./commands/install.js";
import { runProfiles } from "./commands/profiles.js";
import { runRefresh } from "./commands/refresh.js";
import { runRollback } from "./commands/rollback.js";
import { runScan } from "./commands/scan.js";
import { runValidate } from "./commands/validate.js";

export type CommandWriter = Pick<NodeJS.WriteStream, "write">;

/**
 * The unified context the dispatcher hands every command. Individual commands
 * pick the fields they need (their own option types are narrower); the registry
 * entry adapts this context to each command's `run` signature.
 */
export interface CommandContext {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

/**
 * One row of the command table — the single source of truth that drives
 * dispatch, help (overview + per-command usage), and shell completions.
 */
export interface Command {
  readonly name: string;
  /** Name + argument shape shown in the overview, e.g. `init [--global]`. */
  readonly synopsis: string;
  /** One-line description shown next to the synopsis in the overview. */
  readonly summary: string;
  /** Full usage block shown by `cprof <command> --help`. */
  readonly usage: string;
  /** Command-specific flags (excludes the common --json/--quiet/--help). */
  readonly flags: readonly string[];
  readonly run: (
    flags: readonly string[],
    context: CommandContext,
  ) => Promise<number>;
}

/** Flags accepted by every command, appended to each command's own in help/completion. */
export const COMMON_FLAGS: readonly string[] = ["--json", "--quiet", "--help"];

export const COMMANDS: readonly Command[] = [
  {
    name: "init",
    synopsis: "init [--global | --include-global] [--out <dir>]",
    summary: "Snapshot the current setup into claude-profile.json",
    flags: [
      "--global",
      "--include-global",
      "--out",
      "--no-gitignore",
      "--no-report",
    ],
    usage: [
      "Usage: cprof init [--global | --include-global] [--out <dir>]",
      "                  [--no-gitignore] [--no-report]",
      "",
      "Snapshot the current Claude Code setup into claude-profile.json (alongside a",
      "scan report and a .gitignore). Secrets are redacted to ${env:NAME} placeholders",
      "and the result is re-scanned before it is written.",
      "",
      "Options:",
      "  --global           Snapshot ~/.claude (user-level) instead of the project",
      "  --include-global   Capture the project plus its global context in one file",
      "  --out <dir>        Write the profile bundle to <dir> (created if missing)",
      "  --no-gitignore     Do not write the .gitignore helper",
      "  --no-report        Do not write the cprof-scan-report.txt helper",
    ].join("\n"),
    run: (flags, context) =>
      runInit(flags, {
        cwd: context.cwd,
        homeDir: context.homeDir,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "refresh",
    synopsis: "refresh [--no-gitignore] [--no-report]",
    summary: "Rebuild the profile from its recorded source scope",
    flags: ["--no-gitignore", "--no-report"],
    usage: [
      "Usage: cprof refresh [--no-gitignore] [--no-report]",
      "",
      "Rebuild claude-profile.json in place from the scope recorded in the existing",
      "profile. Re-scans, re-redacts, and re-validates like init.",
      "",
      "Options:",
      "  --no-gitignore   Do not write the .gitignore helper",
      "  --no-report      Do not write the cprof-scan-report.txt helper",
    ].join("\n"),
    run: (flags, context) =>
      runRefresh(flags, {
        cwd: context.cwd,
        homeDir: context.homeDir,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "install",
    synopsis:
      "install <file> [--dry-run] [--force] [--into <dir>] [--global | --include-global]",
    summary: "Apply a trusted profile to this machine (deep merge)",
    flags: ["--dry-run", "--force", "--into", "--global", "--include-global"],
    usage: [
      "Usage: cprof install <file> [--dry-run] [--force] [--into <dir>] [--global | --include-global]",
      "",
      "Apply a trusted profile to this machine with a non-destructive deep merge.",
      "Existing files are backed up before they are replaced.",
      "",
      "Options:",
      "  --dry-run          Print the write plan without changing anything",
      "  --force            Overwrite existing asset files (skills/commands/agents/…)",
      "  --into <dir>       Apply into <dir> instead of the current project directory",
      "  --global           Apply to ~/.claude (user-level) instead of the project",
      "  --include-global   Apply both the project and global scopes",
    ].join("\n"),
    run: (flags, context) =>
      runInstall(flags, {
        cwd: context.cwd,
        homeDir: context.homeDir,
        env: context.env,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "rollback",
    synopsis: "rollback [--undo] [--force] [--global]",
    summary: "Undo (or redo with --undo) the last install",
    flags: ["--undo", "--force", "--dry-run", "--global"],
    usage: [
      "Usage: cprof rollback [--undo] [--force] [--dry-run] [--global]",
      "",
      "Strictly undo the most recent install in this scope — restore merged files",
      "from backup and move created files to a trash dir. With --undo, re-apply the",
      "most recent rolled-back install instead. If any touched file changed since",
      "install the whole operation aborts (use --force to override).",
      "",
      "Options:",
      "  --undo      Re-apply the last rolled-back install",
      "  --force     Proceed even if files changed since install",
      "  --dry-run   Print the plan without changing anything",
      "  --global    Act on the ~/.claude ledger instead of the project",
    ].join("\n"),
    run: (flags, context) =>
      runRollback(flags, {
        cwd: context.cwd,
        homeDir: context.homeDir,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "validate",
    synopsis: "validate <file>",
    summary: "Validate a profile against the schema",
    flags: [],
    usage: [
      "Usage: cprof validate [--json] <file>",
      "",
      "Validate a profile against the claude-profile.json schema.",
      "",
      "Options:",
      "  --json   Emit the validation result as JSON",
    ].join("\n"),
    run: (flags, context) =>
      runValidate(flags, {
        cwd: context.cwd,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "diff",
    synopsis: "diff <a.json> <b.json>",
    summary: "Compare two profiles semantically",
    flags: [],
    usage: [
      "Usage: cprof diff [--json] <a.json> <b.json>",
      "",
      "Compare two profiles semantically (file vs file).",
      "",
      "Options:",
      "  --json   Emit the diff as JSON",
    ].join("\n"),
    run: (flags, context) =>
      runDiff(flags, {
        cwd: context.cwd,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "scan",
    synopsis: "scan <file...>",
    summary: "Scan files for secrets (a standalone leak gate)",
    flags: [],
    usage: [
      "Usage: cprof scan [--json] [--quiet] <file...>",
      "",
      "Scan one or more files for secrets using the same engine that gates init and",
      "install output. Exits 3 if a secret is found, 0 when clean, 2 if a file is",
      "missing. Detection has the same strengths and limits as redaction — it is",
      "best-effort, not a guarantee.",
      "",
      "Options:",
      "  --json    Emit findings as JSON",
      "  --quiet   Suppress the summary line (rely on the exit code)",
    ].join("\n"),
    run: (flags, context) =>
      runScan(flags, {
        cwd: context.cwd,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "profiles",
    synopsis: "profiles list",
    summary: "List profiles recorded by local installs",
    flags: ["--global"],
    usage: [
      "Usage: cprof profiles list [--global] [--json]",
      "",
      "List the profiles recorded in the local install ledger.",
      "",
      "Options:",
      "  --global   Read the ledger under ~/.claude instead of the project",
      "  --json     Emit the list as JSON",
    ].join("\n"),
    run: (flags, context) =>
      runProfiles(flags, {
        cwd: context.cwd,
        homeDir: context.homeDir,
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "completion",
    synopsis: "completion <bash|zsh|fish>",
    summary: "Print a shell completion script",
    flags: [],
    usage: [
      "Usage: cprof completion <bash|zsh|fish>",
      "",
      "Print a shell completion script (generated from the command table) to stdout.",
      "",
      "Examples:",
      "  cprof completion bash >> ~/.bashrc",
      '  cprof completion zsh  > "${fpath[1]}/_cprof"',
      "  cprof completion fish > ~/.config/fish/completions/cprof.fish",
    ].join("\n"),
    run: (flags, context) =>
      runCompletion(flags, {
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
  {
    name: "help",
    synopsis: "help [command]",
    summary: "Show help for a command",
    flags: [],
    usage: [
      "Usage: cprof help [command]",
      "",
      "Print the command overview, or the usage for a specific command.",
    ].join("\n"),
    run: (flags, context) =>
      runHelp(flags, {
        stdout: context.stdout,
        stderr: context.stderr,
      }),
  },
];

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((command) => command.name === name);
}

const OVERVIEW_HEADER = `cprof — snapshot, scrub, and migrate your Claude Code setup

Usage: cprof <command> [options]

Commands:`;

const OVERVIEW_FOOTER = `Options:
  -h, --help                           Show this help
  -v, --version                        Show the version

Profiles are local-first and secret-redacted on capture, but redaction is
best-effort — always review a profile before sharing it.

Docs: https://vedant1202.github.io/claude-prof/
`;

const SUMMARY_COLUMN = 39;

/** Render the top-level `cprof --help` overview from the command table. */
export function renderOverviewUsage(): string {
  const rows = COMMANDS.map((command) =>
    formatCommandRow(command.synopsis, command.summary),
  ).join("\n");

  return `${OVERVIEW_HEADER}\n${rows}\n\n${OVERVIEW_FOOTER}`;
}

function formatCommandRow(synopsis: string, summary: string): string {
  const line = `  ${synopsis}`;

  if (line.length <= SUMMARY_COLUMN - 2) {
    return `${line.padEnd(SUMMARY_COLUMN)}${summary}`;
  }

  // Synopsis too long to share a line — wrap the summary onto the next row,
  // aligned to the summary column (matches install's two-line layout).
  return `${line}\n${" ".repeat(SUMMARY_COLUMN)}${summary}`;
}
