---
title: Commands
description: Every cprof command, flag, and exit code.
---

# Commands

The installed command is `cprof`. Global flags: `-h` / `--help` and `-v` /
`--version`. Run `cprof <command> --help` (or `cprof help <command>`) for a
single command's usage. Every command also accepts `--json` — machine-readable
output as a `{ "command", "ok", … }` envelope on stdout — and `--quiet`, which
suppresses non-essential status (errors and exit codes are unchanged). The JSON
shape is consistent across commands but carries no stability guarantee while
cprof is alpha. An unknown command prints to stderr and exits `1`.

## `cprof init`

Snapshot the current setup into `claude-profile.json`.

```bash
cprof init [--global | --include-global] [--out <dir> | --template <name>] [--no-gitignore] [--no-report]
```

- _(no flag)_ — snapshot the current **project**.
- `--global` — snapshot your user-level setup (`~/.claude`).
- `--include-global` — snapshot the project _and_ record global context, kept
  separate in `sources`.
- `--out <dir>` — write the profile bundle into `<dir>` (created if missing)
  instead of the current directory; relative `source` paths keep it portable.
- `--template <name>` — save the setup as a named template under
  `~/.cprof/templates/<name>/` (shorthand for `--out` into that dir; mutually
  exclusive with `--out`). Templates are created only when you ask.
- `--no-gitignore` / `--no-report` — skip writing the `.gitignore` / the
  `cprof-scan-report.txt` helper. Neither affects the secret leak-check, which
  always runs before any write.

Writes `claude-profile.json`, `cprof-scan-report.txt`, and a `.gitignore` into the
output directory (the current directory by default, or `--out`). Exit codes: `0`
success · `1` bad flags · `3` redaction left a secret (nothing is written).

## `cprof refresh`

Rebuild the profile in place from the scope it recorded. Preserves your
hand-owned fields (`name`, `version`, `description`, `claudeCode`) and regenerates
the captured data.

```bash
cprof refresh [--no-gitignore] [--no-report]
```

Re-writes the same three files; `--no-gitignore` / `--no-report` skip the
respective helper (the leak-check still runs). Exit codes: `0` · `2` if
`claude-profile.json` is missing · `3` on a detected leak.

## `cprof install`

Apply a trusted profile to the current machine with a non-destructive deep merge.

```bash
cprof install <file> [--dry-run] [--force] [--into <dir>] [--global | --include-global]
```

- `--dry-run` — validate and print the write plan; write nothing, record nothing.
- `--force` — allow overwriting existing **asset** files (each is backed up first).
- `--into <dir>` — apply into `<dir>` instead of the current project directory (the
  profile is still read from where you point it). `--global` content is unaffected —
  it always targets `~/.claude`.
- `--global` — apply only global-scoped content, to `~/.claude`.
- `--include-global` — from a mixed profile, also apply global content (the
  default applies project content only).

Backs up replaced files under `.cprof-backups/<timestamp>/` and records the
install in `.cprof-state.json`. Each write is reported as `created`, `merged`, or
`overwritten`. A missing required secret fails the install before any write. Exit
code `1` on usage errors.

## `cprof new`

Scaffold a fresh project from a profile or a named template — a clean, one-shot copy.

```bash
cprof new <profile|name> [dir] [--force]
cprof new --list
```

- `<profile|name>` — either a path to a `claude-profile.json`, or the name of a
  template under `~/.cprof/templates/`. A bare token (no separator, no `.json`) is
  resolved as a template name; anything path-like is treated as a path.
- `[dir]` — where to scaffold; **defaults to the current directory**, created if needed.
- `--force` — overwrite files that already exist.
- `--list` — list the named templates under `~/.cprof/templates/`.

Applies the profile's **project-scope** content into `[dir]`. Unlike `install` (which
merges into an existing project), `new` **refuses to touch anything that already
exists** and exits `1`, listing the collisions — pass `--force` to overwrite. A forced
overwrite still keeps a backup, so `cprof rollback` can reverse a scaffold; the clean
path overwrites nothing and writes no backups. A template name that doesn't resolve
exits `2` and lists the available templates — create one with `cprof init --template
<name>`. Exit codes: `0` scaffolded · `1` usage or refused-overwrite · `2` not found.

## `cprof rollback`

Strictly undo the most recent install in a scope — a transaction, not a partial
edit. Restores merged/overwritten files from their backup and moves created files
to a trash dir (`.cprof-trash/<timestamp>/`, never a hard delete). With `--undo`,
re-applies the most recent rolled-back install instead, so the last install is a
reversible toggle.

```bash
cprof rollback [--undo] [--force] [--dry-run] [--global]
```

- `--undo` — re-apply the last rolled-back install (the reverse direction).
- `--force` — proceed even if a touched file changed since install.
- `--dry-run` — print the plan; change nothing.
- `--global` — act on the `~/.claude` ledger instead of the project.

**Change-guard:** before touching anything, every recorded file is checked against
the state it should be in. If **any** file changed since install, the whole
operation aborts and names the offenders — `--force` overrides. It is strictly
single-level (the last install only) and never per-file. Exit codes: `0` done ·
`1` usage · `2` nothing to roll back · `3` aborted (a file changed; use `--force`).

## `cprof validate`

Validate a profile against the schema.

```bash
cprof validate [--json] <file>
```

`--json` emits the result as a `{ "command": "validate", "ok", "errors" }`
envelope. Exit codes: `0` valid · `1` schema/JSON error · `2` file not found.

## `cprof diff`

Compare profiles semantically — key order is ignored, and secret-looking changed
values are redacted in the output.

```bash
cprof diff [--json] <profile>
cprof diff [--json] <a.json> <b.json>
```

- **One argument** — diff `<profile>` against a fresh scan of the **current
  machine** (its drift: `profile → live`). The machine is re-scanned using the
  profile's own scope and metadata, so only real changes show — `+` is something
  added on the machine since you saved, `-` something removed. (`install --dry-run`
  covers the inverse: what applying the profile would change.)
- **Two arguments** — compare two profile files.

Drift is **not** an error: exit `0` either way (`--json` reports `equal`). `--json`
emits the structured diff under the `{ "command": "diff", "ok", … }` envelope;
otherwise it prints formatted text. Exit `2` if the profile is missing.

## `cprof scan`

Scan one or more files for secrets — a standalone gate over the same engine that
checks `init` and `install` output. Useful in pre-commit hooks and CI.

```bash
cprof scan [--json] [--quiet] <file...>
```

Prints `path:line:col  reason` per finding, or a `{ "command": "scan", "ok",
"leaks": [...] }` envelope with `--json`. Detection has the **same strengths and
limits as redaction** — best-effort, not a guarantee — and it never echoes the
matched value. Exit codes: `0` clean · `3` a secret was found · `2` file not
found · `1` usage error.

See [Scanning files in CI](../guides/scanning.md) for pre-commit and GitHub
Actions recipes.

## `cprof completion`

Print a shell completion script, generated from the command table so it never
drifts from the real commands and flags.

```bash
cprof completion <bash|zsh|fish>
```

Install it for your shell, for example:

```bash
cprof completion bash >> ~/.bashrc
cprof completion zsh > "${fpath[1]}/_cprof"
cprof completion fish > ~/.config/fish/completions/cprof.fish
```

Exits `1` for an unknown or missing shell.

## `cprof profiles list`

List the profiles recorded by local installs, read from `.cprof-state.json`.

```bash
cprof profiles list [--global] [--json]
```

`--global` reads the global ledger (`~/.claude/.cprof-state.json`); `--json` emits
`{ "command": "profiles", "ok": true, "installs": [...] }`. Each text entry shows
`name version (target) - source`.
