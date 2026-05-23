# cprof (WIP)

`cprof` is a Phase 1 local profile snapshot tool for Claude Code setups.

It creates a deterministic, schema-valid, secret-free `claude-profile.json` from a project or global Claude Code setup. Phase 1 is intentionally read-only with respect to the Claude runtime: it writes profile output files, but it does not install profiles, fetch remote sources, upgrade dependencies, or bundle hook script contents.

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
node packages/cli/dist/index.js validate claude-profile.json
node packages/cli/dist/index.js diff a.json b.json
```

## Phase 1 Scope

- `cprof init`: writes a project profile.
- `cprof init --global`: writes a global profile.
- `cprof init --include-global`: writes a project profile with explicit global context.
- `cprof refresh`: rebuilds generated output from the recorded source scope.
- `cprof validate <file>`: validates a profile against the schema.
- `cprof diff <a.json> <b.json>`: compares two profiles semantically.

See [docs/phase-1.md](docs/phase-1.md) for behavior details and [docs/cprofignore.md](docs/cprofignore.md) for ignore rules.

## Packages

- `@cprof/schema`: Phase 1 JSON Schema and TypeScript types.
- `@cprof/core`: validation, source metadata, traversal, redaction, manifest, bundling, reporting, diffing.
- `cprof`: CLI command dispatch.
- `@cprof/testing`: fixture corpus and test helpers.
