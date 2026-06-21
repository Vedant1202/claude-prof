# cprof

[![npm](https://img.shields.io/npm/v/cprof/alpha?label=npm%40alpha)](https://www.npmjs.com/package/cprof)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/Vedant1202/claude-prof/blob/main/LICENSE)

Snapshot, scrub, and migrate your Claude Code setup as a redacted, portable profile.

> **Alpha.** cprof is early and the profile format may still change. Redaction is
> best-effort — always review a generated profile before sharing it.

`cprof` captures your project or global Claude Code configuration — settings, MCP
servers, `CLAUDE.md` memory, rules, skills, commands, agents, and plugin
inventory — into a deterministic, schema-valid, **secret-redacted**
`claude-profile.json`. You can then `diff`, `validate`, and `install` a trusted
profile onto another machine with a non-destructive deep merge. It runs fully
offline and never executes hook or plugin code.

## Install

```bash
npm install -g cprof@alpha
# or run it without installing:
npx cprof@alpha --help
```

Requires Node.js >= 22.

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

## Commands

| Command                                            | What it does                                                    |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `cprof init [--global \| --include-global]`        | Snapshot the current setup into `claude-profile.json`           |
| `cprof refresh`                                    | Rebuild the profile from its recorded source scope              |
| `cprof install <file> [--dry-run] [--force] [...]` | Apply a trusted profile (deep merge; backs up before overwrite) |
| `cprof validate <file>`                            | Validate a profile against the schema                           |
| `cprof diff <a.json> <b.json>`                     | Compare two profiles semantically                               |
| `cprof profiles list`                              | List profiles recorded by local installs                        |

Run `cprof --help` for the full usage.

## Redaction & limits

Secrets are redacted on capture: provider keys (via
[secretlint](https://github.com/secretlint/secretlint)), secret-like key names,
JWTs, and high-entropy values become `${env:NAME}` placeholders, and the
generated manifest is re-scanned before it is written. It will **not** catch
low-entropy secrets stored under non-sensitive keys. Review every profile before
sharing it.

## Documentation

Full docs: **https://vedant1202.github.io/claude-prof/** · Source & issues:
[github.com/Vedant1202/claude-prof](https://github.com/Vedant1202/claude-prof)

## License

MIT
