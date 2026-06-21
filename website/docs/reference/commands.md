---
title: Commands
description: Every cprof command, flag, and exit code.
---

# Commands

The installed command is `cprof`. Global flags: `-h` / `--help` and `-v` /
`--version`. An unknown command prints to stderr and exits `1`.

## `cprof init`

Snapshot the current setup into `claude-profile.json`.

```bash
cprof init [--global | --include-global]
```

- _(no flag)_ — snapshot the current **project**.
- `--global` — snapshot your user-level setup (`~/.claude`).
- `--include-global` — snapshot the project _and_ record global context, kept
  separate in `sources`.

Writes `claude-profile.json`, `cprof-scan-report.txt`, and a `.gitignore` into the
current directory. Exit codes: `0` success · `1` bad flags · `3` redaction left a
secret (nothing is written).

## `cprof refresh`

Rebuild the profile in place from the scope it recorded. Preserves your
hand-owned fields (`name`, `version`, `description`, `claudeCode`) and regenerates
the captured data.

```bash
cprof refresh
```

Takes no flags. Re-writes the same three files. Exit codes: `0` · `2` if
`claude-profile.json` is missing · `3` on a detected leak.

## `cprof install`

Apply a trusted profile to the current machine with a non-destructive deep merge.

```bash
cprof install <file> [--dry-run] [--force] [--global | --include-global]
```

- `--dry-run` — validate and print the write plan; write nothing, record nothing.
- `--force` — allow overwriting existing **asset** files (each is backed up first).
- `--global` — apply only global-scoped content, to `~/.claude`.
- `--include-global` — from a mixed profile, also apply global content (the
  default applies project content only).

Backs up replaced files under `.cprof-backups/<timestamp>/` and records the
install in `.cprof-state.json`. Each write is reported as `created`, `merged`, or
`overwritten`. A missing required secret fails the install before any write. Exit
code `1` on usage errors.

## `cprof validate`

Validate a profile against the schema.

```bash
cprof validate [--json] <file>
```

`--json` prints the full result object. Exit codes: `0` valid · `1` schema/JSON
error · `2` file not found.

## `cprof diff`

Compare two profiles semantically — key order is ignored, and secret-looking
changed values are redacted in the output.

```bash
cprof diff [--json] <a.json> <b.json>
```

`--json` emits a structured diff; otherwise it prints formatted text.

## `cprof profiles list`

List the profiles recorded by local installs, read from `.cprof-state.json`.

```bash
cprof profiles list [--global] [--json]
```

`--global` reads the global ledger (`~/.claude/.cprof-state.json`); `--json` emits
`{ "installs": [...] }`. Each entry shows `name version (target) - source`.
