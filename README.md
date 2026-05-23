# cprof (WIP)

`cprof` is a local profile snapshot and install tool for Claude Code setups.

It creates a deterministic, schema-valid, secret-free `claude-profile.json` from a project or global Claude Code setup, then can apply a trusted local profile with dry-run, conflict checks, backups, and secret placeholder resolution. It does not fetch remote sources, upgrade dependencies, or install executable hook contents.

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
- `cprof validate <file>`: validates a profile against the schema.
- `cprof diff <a.json> <b.json>`: compares two profiles semantically.

See [docs/phase-1.md](docs/phase-1.md) for snapshot behavior, [docs/phase-2.md](docs/phase-2.md) for install behavior, and [docs/cprofignore.md](docs/cprofignore.md) for ignore rules.

## Packages

- `@cprof/schema`: Phase 1 JSON Schema and TypeScript types.
- `@cprof/core`: validation, source metadata, traversal, redaction, manifest, bundling, reporting, diffing.
- `cprof`: CLI command dispatch.
- `@cprof/testing`: fixture corpus and test helpers.
