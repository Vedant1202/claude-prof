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

cprof uses layered, fully offline secret protection:

- **Ignore policy**: `.cprofignore` and built-in never-read paths are checked before any file is read.
- **Redaction** replaces secret-looking values with `${env:NAME}` placeholders using three detectors:
  - **Provider keys** via [secretlint](https://github.com/secretlint/secretlint) — GitHub, Anthropic, OpenAI, Slack, Stripe, GCP, and more.
  - **Sensitive key names** — e.g. `apiKey`, `dbPassword`, `AWS_SECRET_ACCESS_KEY` (camelCase and UPPER_SNAKE).
  - **JWTs and high-entropy values** — base64/hex secrets, while excluding URLs, filesystem paths, content hashes, and UUIDs.
- **Leak check**: the generated manifest and every bundled asset are re-scanned with secretlint before write. `cprof init` and `cprof refresh` refuse to write (exit code `3`) if anything still looks like a secret.

Reports never print raw secret values.

### What is and isn't detected

Detected: known provider-key formats, values under secret-like keys, JWTs, and
high-entropy base64/hex secrets (≥ 32 characters).

Not detected: low-entropy or home-grown secrets under non-sensitive keys (e.g. a
short memorable password stored under `note`), and AWS access-key IDs (`AKIA…`,
which are identifiers rather than credentials — the AWS _secret_ key is caught).
Redaction is best-effort; always review a generated profile before sharing it.

## Hook Inventory

Hooks are inventory-only in Phase 1. The profile may record hook event/matcher metadata from safe settings surfaces, but hook script contents are not read or bundled.

## Not In Phase 1

- Installing profiles
- Fetching remote profiles or remote sources
- Upgrading dependencies
- Bundling hook scripts
- Cloud sync
