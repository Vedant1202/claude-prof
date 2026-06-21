---
title: What's in a profile
description: The anatomy of a claude-profile.json — its sections, scopes, and how cprof captures them.
---

# What's in a profile

A `claude-profile.json` is a deterministic, schema-valid snapshot of a Claude Code
setup. Two snapshots of the same setup produce byte-identical files, so they diff
cleanly and are safe to commit.

## Sections

| Section                          | What it holds                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `name`, `version`, `description` | Profile identity — you own these; `refresh` preserves them                       |
| `profileScope`, `includesGlobal` | Whether this is a project or global profile, and if it carries global context    |
| `sources`                        | The locations cprof scanned, kept separate by scope                              |
| `settings`                       | `model`, `permissions`, and `env` from `settings.json`                           |
| `memory`, `rules`                | `CLAUDE.md` memory and rule files                                                |
| `skills`, `commands`, `agents`   | Your skills, slash commands, and subagents                                       |
| `mcpServers`                     | MCP servers — local (`command`) and remote (`url`: http/sse/ws)                  |
| `hooks`, `plugins`               | Recorded as **inventory only** — never executed or re-fetched                    |
| `secrets`                        | The `${env:NAME}` placeholders a consumer must provide (`required` / `optional`) |

Asset files — skills, commands, agents, memory, and rules — are referenced by
`source` and carried alongside the JSON. Their contents are hashed (`sha256:…`) so
changes are detectable.

## Scopes

cprof captures one of two scopes, and never silently mixes them:

- **Project** (`cprof init`, the default) — the Claude Code config in the current
  project directory.
- **Global** (`cprof init --global`) — your user-level setup in `~/.claude`.
- **Project + global** (`cprof init --include-global`) — a project profile that
  _also_ records global context, kept in separate `sources` entries so you always
  know where each piece came from.

See [Commands](../reference/commands.md) for the full flag reference.
