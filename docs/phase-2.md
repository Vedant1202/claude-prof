# Phase 2: Local Profile Install

Phase 2 applies a trusted local `claude-profile.json` into a project or global
Claude Code setup. It is still local-only: no remote fetch, no registry, no
dependency upgrades, and no executable hook installation.

## Commands

```bash
cprof install claude-profile.json --dry-run
cprof install claude-profile.json
cprof install claude-profile.json --force
cprof install claude-profile.json --global
cprof install claude-profile.json --include-global
```

Use `--dry-run` first. It validates the profile, resolves scope, checks missing
secrets and conflicts, and prints the write plan without changing files.

## Default Safety

cprof never destroys existing configuration:

- **JSON config** (`settings.json`, `.mcp.json`, `~/.claude.json`) is **deep-merged** into the
  target. Existing keys are preserved; profile values win on a direct collision; permission lists
  (`permissions.allow` / `deny` / `ask`) are unioned. No `--force` is needed, and the prior file
  is always backed up first.
- **Asset files** (skills, commands, agents, memory, rules) are discrete files. cprof **fails if
  one already exists**; pass `--force` to overwrite (the prior file is backed up).

Backups are written under:

```text
.cprof-backups/<timestamp>/
```

Missing required `${env:NAME}` placeholders fail before any files are written. Resolved secret
values are never printed in install reports. The report marks each write `created`, `merged`, or
`overwritten`, and lists any overridden keys (paths only — never values).

## Scope Rules

Project profiles install project-scoped content into the current directory.
Global profiles install into `~/.claude`.

Mixed profiles install only project-scoped content by default. To include global
content from a mixed profile, pass:

```bash
cprof install claude-profile.json --include-global
```

To install only global-scoped content, pass:

```bash
cprof install claude-profile.json --global
```

## What Installs

Phase 2 can write:

- settings
- MCP server config
- memory and rules assets
- skills
- commands
- agents

Hooks remain inventory-only and are reported as skipped. Plugins are also
metadata-only in Phase 2; cprof does not run `/plugin install`, fetch plugin code,
or modify plugin caches.

Profile assets are copied only when their `source` points to a file or directory
inside the profile package. Missing or unsafe assets are skipped and reported.

## Manual Smoke Test

```bash
corepack pnpm build
mkdir -p /tmp/cprof-phase2-profile /tmp/cprof-phase2-target
cd /tmp/cprof-phase2-profile
node /Users/vedant/Projects/Personal/claude-package/packages/cli/dist/index.js init --include-global
cd /tmp/cprof-phase2-target
node /Users/vedant/Projects/Personal/claude-package/packages/cli/dist/index.js install /tmp/cprof-phase2-profile/claude-profile.json --dry-run
node /Users/vedant/Projects/Personal/claude-package/packages/cli/dist/index.js install /tmp/cprof-phase2-profile/claude-profile.json
cat cprof-install-report.txt
```
