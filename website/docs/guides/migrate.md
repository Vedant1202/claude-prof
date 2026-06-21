---
title: Migrate to another machine
description: Snapshot a Claude Code setup, carry it, and apply it elsewhere with a non-destructive deep merge.
---

# Migrate to another machine

The core workflow: capture your setup on one machine, carry the profile, and apply
it on another without clobbering what's already there.

## 1. Snapshot

On the source machine, from your project:

```bash
cprof init
```

To carry your user-level setup as well, use `cprof init --include-global` (which
keeps project and global content in separate `sources`), or `cprof init --global`
for just `~/.claude`.

## 2. Carry it

`claude-profile.json` and its referenced asset files are yours to move — commit
them to a private repo, copy them across, whatever fits. Because secrets are
redacted to `${env:NAME}` placeholders, the profile records _which_ secrets are
needed (in `secrets.required`) without containing them.

## 3. Apply it

On the target machine, preview first:

```bash
cprof install claude-profile.json --dry-run
```

This validates the profile, resolves scope, checks for missing secrets and
conflicts, and prints the write plan — **without changing any files**. When it
looks right, drop `--dry-run`:

```bash
cprof install claude-profile.json
```

## What install does (and doesn't) touch

- **JSON config deep-merges.** `settings.json` and your MCP config merge into
  what's already there: existing keys are preserved, the profile wins on a direct
  collision, and permission lists (`allow` / `deny` / `ask`) are unioned rather
  than replaced.
- **Asset files are protected.** Skills, commands, agents, memory, and rules are
  written only if they don't already exist. To overwrite one, pass `--force` — the
  prior file is backed up first.
- **Everything is backed up.** Any file install replaces is copied to
  `.cprof-backups/<timestamp>/` first.
- **Missing secrets stop the install.** If a required `${env:NAME}` isn't set in
  your environment, install fails _before_ writing anything.
- **Hooks and plugins are not applied** — they're inventory only.

Each write is reported as `created`, `merged`, or `overwritten`, with overridden
keys listed by path (never by value).

## Track what you've installed

```bash
cprof profiles list
```

This reads the local install ledger (`.cprof-state.json`) and shows each profile
you've applied — name, version, target scope, and source.
