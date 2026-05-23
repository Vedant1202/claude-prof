# Phase 1: Local Profile Snapshot

Phase 1 turns local Claude Code setup state into a portable profile artifact:

- `claude-profile.json`
- profile `.gitignore`
- `cprof-scan-report.txt`

The profile is useful for backup, audit, schema validation, and diffing. It is not yet installable.

## Scopes

Project scope is the default:

```bash
cprof init
```

Global scope captures user-level Claude Code setup:

```bash
cprof init --global
```

Mixed scope captures project setup and explicitly records global context:

```bash
cprof init --include-global
```

Mixed profiles keep project and global sources separate in `sources`; global state is never silently included.

## Refresh

```bash
cprof refresh
```

`refresh` reads `claude-profile.json`, preserves user-owned top-level fields such as `name`, `version`, and `description`, and rebuilds generated profile data from the recorded scope metadata. It is not a dependency upgrade command.

## Validation

```bash
cprof validate claude-profile.json
cprof validate --json claude-profile.json
```

Exit codes:

- `0`: valid profile
- `1`: schema or JSON validation error
- `2`: file not found

## Diff

```bash
cprof diff old.json new.json
cprof diff --json old.json new.json
```

Diff ignores object key order, reports added/removed/changed paths, and redacts secret-looking changed values.

## Secret Safety

Phase 1 uses three layers:

- Ignore policy: `.cprofignore` and built-in never-read paths are checked before reading files.
- Redaction: safe-to-read values that look like secrets become `${env:NAME}`.
- Leak check: generated manifest and bundled assets are checked again before write.

Reports must not print raw secret values.

## Hook Inventory

Hooks are inventory-only in Phase 1. The profile may record hook event/matcher metadata from safe settings surfaces, but hook script contents are not read or bundled.

## Not In Phase 1

- Installing profiles
- Fetching remote profiles or remote sources
- Upgrading dependencies
- Bundling hook scripts
- Cloud sync
