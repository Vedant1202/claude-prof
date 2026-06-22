<div align="center">

# cprof

**Snapshot, scrub, and migrate your Claude Code setup as a redacted, portable profile.**

[![CI](https://github.com/Vedant1202/claude-prof/actions/workflows/ci.yml/badge.svg)](https://github.com/Vedant1202/claude-prof/actions/workflows/ci.yml)
[![npm @alpha](https://img.shields.io/npm/v/@cprof/cli/alpha?label=npm%40alpha)](https://www.npmjs.com/package/@cprof/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

[Documentation](https://vedant1202.github.io/claude-prof/) · [Getting Started](https://vedant1202.github.io/claude-prof/docs/getting-started) · [Report a bug](https://github.com/Vedant1202/claude-prof/issues)

</div>

> [!WARNING]
> **cprof is alpha.** The `claude-profile.json` format may still change between
> releases, and redaction is best-effort — **always review a generated profile
> before sharing it.**

## What is cprof?

Your Claude Code setup lives in scattered files — `settings.json`, MCP server
definitions, `CLAUDE.md` memory, rules, skills, commands, agents — and some of
them hold secrets. Moving that setup to a new machine, sharing it with a
teammate, or just keeping it under version control means hand-copying files and
hoping you didn't leak an API key.

`cprof` turns that setup into a single, portable, **secret-redacted**
`claude-profile.json` you can carry, diff, and re-apply anywhere:

- **Snapshot** — capture your project or global Claude Code config into one
  deterministic, schema-valid file.
- **Scrub** — secrets are redacted to `${env:NAME}` placeholders on the way out,
  and the result is re-scanned before it's written.
- **Migrate** — apply a trusted profile onto another machine with a
  non-destructive deep merge (with dry-run and backups).

It is **local-first**: profiles are files you produce and carry yourself. cprof
runs fully offline and never executes hook or plugin code.

## Install

```bash
npm install -g @cprof/cli@alpha
# …or run it without installing:
npx @cprof/cli@alpha --help
```

The npm package is **`@cprof/cli`**; the installed command is **`cprof`**.
Requires **Node.js >= 22**. Prefer to build from source? See
[Development](#development).

## Quickstart

```bash
# 1. Snapshot the current project into claude-profile.json
cprof init

# 2. Review what was captured — and confirm secrets are redacted
cat claude-profile.json

# 3. On another machine, apply it with a non-destructive deep merge
cprof install claude-profile.json --dry-run   # preview the write plan
cprof install claude-profile.json             # apply it
```

Snapshot your user-level setup instead with `cprof init --global`, or capture a
project plus its global context with `cprof init --include-global`.

## What it captures

From your project or `~/.claude` setup:

- **Settings** (`settings.json`) and permissions
- **MCP servers** — local `stdio` and remote `http`/`sse`
- **`CLAUDE.md`** memory and rules
- **Skills, commands, and agents** (subagents)
- **Hook and plugin inventory** (recorded, never executed)

Everything lands in a single `claude-profile.json` that validates against a
published JSON Schema.

## Redaction & its limits

Redaction runs fully offline and in layers — anything that looks like a secret
becomes a `${env:NAME}` placeholder:

- **Provider keys** via [secretlint](https://github.com/secretlint/secretlint)
  (AWS, GitHub, OpenAI, and many more)
- **Secret-like key names** (e.g. `apiKey`, `token`, `password`)
- **JWTs and high-entropy values**

Existing `${VAR}` expansions are preserved, and the generated manifest is
**re-scanned before write** as a final leak check.

> [!IMPORTANT]
> Redaction is best-effort. It will **not** catch low-entropy secrets stored
> under non-sensitive key names. Review every profile before sharing it, and use
> [`.cprofignore`](https://vedant1202.github.io/claude-prof/) to exclude paths
> you never want captured.

## Commands

| Command                                                        | What it does                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `cprof init [--global \| --include-global]`                    | Snapshot the current setup into `claude-profile.json`           |
| `cprof refresh`                                                | Rebuild the profile from its recorded source scope              |
| `cprof install <file> [--dry-run] [--force] [--global \| ...]` | Apply a trusted profile (deep merge; backs up before overwrite) |
| `cprof validate <file>`                                        | Validate a profile against the schema                           |
| `cprof diff <a.json> <b.json>`                                 | Compare two profiles semantically                               |
| `cprof scan <file...>`                                         | Scan files for secrets — a standalone leak gate for CI          |
| `cprof profiles list`                                          | List profiles recorded by local installs                        |
| `cprof completion <bash\|zsh\|fish>`                           | Print a shell completion script                                 |

Run `cprof --help` for the overview, or `cprof <command> --help` for one command.
Every command accepts `--json` (machine-readable output) and `--quiet`.

## How it works

- **`claude-profile.json`** is a deterministic, schema-valid snapshot — stable
  ordering so two snapshots of the same setup diff cleanly.
- **Scopes**: a profile is `project`-scoped or `global`-scoped (`~/.claude`);
  `--include-global` captures both in one file.
- **Deep-merge install**: JSON config (settings, MCP) merges into your existing
  files, permission lists union, and the profile wins on direct collisions. Asset
  files are backed up before they're overwritten (`--force` governs overwrites;
  `--dry-run` previews the whole plan).
- **Install ledger**: `cprof profiles list` shows what local installs recorded.

Full behavior reference: **[the documentation site](https://vedant1202.github.io/claude-prof/)**.

## Development

cprof is a pnpm + TypeScript monorepo (Node 22+, [corepack](https://nodejs.org/api/corepack.html)).

```bash
corepack pnpm install
corepack pnpm build     # build every package
corepack pnpm test      # run the full test suite
corepack pnpm lint      # tsc -b project references
corepack pnpm format    # prettier --check
```

Run the CLI from source:

```bash
corepack pnpm --filter @cprof/cli build
node packages/cli/dist/index.js --help
```

### Packages

| Package          | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `@cprof/cli`     | The CLI — installs the `cprof` command                                 |
| `@cprof/core`    | Scanning, redaction, manifest, bundling, validation, install, and diff |
| `@cprof/schema`  | The `claude-profile.json` JSON Schema and TypeScript types             |
| `@cprof/testing` | Internal fixtures and test helpers (not published)                     |

## Status

Alpha — usable for snapshotting, scrubbing, and migrating a setup, with the core
paths covered by tests across Linux, macOS, and Windows. Expect rough edges and
breaking changes to the profile format before `1.0`. Issues and feedback are
welcome.

## License

[MIT](LICENSE)
