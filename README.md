# cprof (WIP)

`cprof` is a local profile snapshot and install tool for Claude Code setups.

It creates a deterministic, schema-valid, secret-redacted `claude-profile.json` from a project or global Claude Code setup, then can apply a trusted profile with dry-run, conflict checks, backups, and secret placeholder resolution. Remote profile JSON can be fetched over HTTPS or from GitHub and is treated as untrusted input — review it before applying. cprof does not upgrade dependencies or install executable hook contents.

> Redaction is best-effort and runs fully offline: provider keys (via [secretlint](https://github.com/secretlint/secretlint)), secret-like key names, JWTs, and high-entropy values become `${env:NAME}` placeholders, and the generated manifest is re-scanned before write. It will not catch low-entropy secrets under non-sensitive keys. Always review a generated profile before sharing — see [docs/phase-1.md](docs/phase-1.md#secret-safety).

## Current Commands

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
corepack pnpm lint
```

Run the CLI from source:

```bash
corepack pnpm --filter cprof build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js init --global
node packages/cli/dist/index.js init --include-global
node packages/cli/dist/index.js refresh
node packages/cli/dist/index.js install claude-profile.json --dry-run
node packages/cli/dist/index.js install claude-profile.json
node packages/cli/dist/index.js install https://example.com/claude-profile.json --dry-run
node packages/cli/dist/index.js install github:owner/repo --dry-run
node packages/cli/dist/index.js registry list registry.json
node packages/cli/dist/index.js registry search registry.json typescript
node packages/cli/dist/index.js registry show registry.json owner/profile
node packages/cli/dist/index.js profiles list
node packages/cli/dist/index.js profiles outdated registry.json
node packages/cli/dist/index.js policy check claude-profile.json policy.json
node packages/cli/dist/index.js validate claude-profile.json
node packages/cli/dist/index.js diff a.json b.json
```

## Phase 1 Scope

- `cprof init`: writes a project profile.
- `cprof init --global`: writes a global profile.
- `cprof init --include-global`: writes a project profile with explicit global context.
- `cprof refresh`: rebuilds generated output from the recorded source scope.
- `cprof install <file>`: applies a trusted local profile to the current project.
- `cprof install <file> --global`: applies global-scoped content to `~/.claude`.
- `cprof install <file> --include-global`: applies project and global content from a mixed profile.
- `cprof install <https-url>`: fetches and applies a remote profile JSON.
- `cprof install github:owner/repo`: fetches `claude-profile.json` from a GitHub repo's `main` branch.
- `cprof registry list <index>`: lists profiles from a local registry index.
- `cprof registry search <index> <query>`: searches registry metadata.
- `cprof registry show <index> <id>`: shows one registry entry.
- `cprof profiles list`: lists profiles recorded by local installs.
- `cprof profiles outdated <index>`: checks installed profiles against registry versions.
- `cprof policy check <profile> <policy>`: enforces a local team/org policy.
- `cprof validate <file>`: validates a profile against the schema.
- `cprof diff <a.json> <b.json>`: compares two profiles semantically.

See [docs/phase-1.md](docs/phase-1.md) for snapshot behavior, [docs/phase-2.md](docs/phase-2.md) for local install behavior, [docs/phase-3.md](docs/phase-3.md) for remote references, [docs/phase-4.md](docs/phase-4.md) for registry discovery, [docs/phase-5.md](docs/phase-5.md) for installed state and update checks, [docs/phase-6.md](docs/phase-6.md) for policy enforcement, and [docs/cprofignore.md](docs/cprofignore.md) for ignore rules.

## Packages

- `@cprof/schema`: Phase 1 JSON Schema and TypeScript types.
- `@cprof/core`: validation, source metadata, traversal, redaction, manifest, bundling, reporting, diffing.
- `cprof`: CLI command dispatch.
- `@cprof/testing`: fixture corpus and test helpers.
