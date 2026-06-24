---
title: Getting Started
description: Install cprof and capture your first redacted Claude Code profile in two commands.
---

# Getting Started

cprof turns your Claude Code setup — settings, MCP servers, `CLAUDE.md` memory,
rules, skills, commands, and agents — into a single portable,
**secret-redacted** `claude-profile.json` you can carry to another machine, diff,
or check into git.

> cprof is alpha. The profile format may still change, and redaction is
> best-effort — review every generated profile before you share it.

## Install

```bash
npm install -g @cprof/cli@alpha
# …or run it without installing:
npx @cprof/cli@alpha --help
```

The npm package is `@cprof/cli`; the installed command is `cprof`. Requires
Node.js 22 or newer.

## Your first snapshot

From inside a project that uses Claude Code:

```bash
cprof init
```

This writes three files into the current directory:

| File                    | What it is                                                   |
| ----------------------- | ------------------------------------------------------------ |
| `claude-profile.json`   | The portable, schema-valid, redacted snapshot                |
| `cprof-scan-report.txt` | A human-readable report of what was captured and redacted    |
| `.gitignore`            | Entries that keep credential caches and local state from git |

cprof never opens known-secret paths (such as `.claude/.credentials.json`),
replaces anything that looks like a secret with an `${env:NAME}` placeholder, and
re-scans the result before writing — if a secret slips through, it refuses to
write and exits non-zero.

## Review what you captured

Open `cprof-scan-report.txt` to see exactly what was detected and redacted — for
example:

```text
cprof scan report
Detected:
  - AnthropicApiKey: 1
Redactions: 1
  - mcpServers.github.env.GITHUB_TOKEN: key-name -> GITHUB_TOKEN
Skipped paths: 1
Ignored patterns: 0
```

Then skim `claude-profile.json` itself. Redaction is best-effort — see
[Redaction & secret safety](./redaction.md) for exactly what it does and doesn't
catch.

## What's next

- [What's in a profile](./concepts/profiles.md) — the anatomy of a `claude-profile.json`.
- [Migrate to another machine](./guides/migrate.md) — carry your setup and apply it elsewhere.
- [Scaffold a new project](./guides/scaffold.md) — reuse a setup as a named template with `cprof new`.
- [Undo an install](./guides/rollback.md) — reverse the last `install` with `cprof rollback`.
- [Track drift](./guides/drift.md) — see how your live setup differs from a saved profile.
- [Output locations & helper files](./guides/output-locations.md) — control `--out` / `--into` / `--no-*`.
- [Commands](./reference/commands.md) — every command and flag.
