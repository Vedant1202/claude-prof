# cprof (WIP)

`cprof` snapshots a local Claude Code setup into a portable, secret-safe profile, then re-applies it on another machine or project.

It captures your project or global Claude Code configuration — settings, MCP servers (local stdio and remote http/sse), CLAUDE.md memory, rules, skills, commands, agents, and hook/plugin inventory — into a deterministic, schema-valid, **secret-redacted** `claude-profile.json`. You can then `diff` two profiles, `validate` one against the schema, and `install` a trusted profile onto an already-configured machine with a non-destructive deep merge, dry-run, and backups. cprof is local-first: profiles are files you produce and carry yourself, and it never runs hook or plugin code.

> Redaction is best-effort and runs fully offline: provider keys (via [secretlint](https://github.com/secretlint/secretlint)), secret-like key names, JWTs, and high-entropy values become `${env:NAME}` placeholders, and the generated manifest is re-scanned before write. It will not catch low-entropy secrets under non-sensitive keys. Always review a generated profile before sharing — see [docs/phase-1.md](docs/phase-1.md#secret-safety).

## Build

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
node packages/cli/dist/index.js profiles list
node packages/cli/dist/index.js validate claude-profile.json
node packages/cli/dist/index.js diff a.json b.json
```

## Commands

- `cprof init`: snapshots the current project into `claude-profile.json`.
- `cprof init --global`: snapshots the user-level (`~/.claude`) setup.
- `cprof init --include-global`: snapshots the project with explicit global context.
- `cprof refresh`: rebuilds the profile from the recorded source scope.
- `cprof install <file>`: applies a trusted local profile to the current project — JSON config (settings, MCP) deep-merges; asset files back up before overwrite.
- `cprof install <file> --global`: applies global-scoped content to `~/.claude`.
- `cprof install <file> --include-global`: applies project and global content from a mixed profile.
- `cprof install <file> --dry-run`: previews the write plan without changing files.
- `cprof install <file> --force`: overwrites existing asset files (after backing them up).
- `cprof profiles list`: lists profiles recorded by local installs.
- `cprof validate <file>`: validates a profile against the schema.
- `cprof diff <a.json> <b.json>`: compares two profiles semantically.

See [docs/phase-1.md](docs/phase-1.md) for snapshot and redaction behavior, [docs/phase-2.md](docs/phase-2.md) for install behavior, [docs/phase-5.md](docs/phase-5.md) for the install ledger, and [docs/cprofignore.md](docs/cprofignore.md) for ignore rules.

## Packages

- `@cprof/schema`: the `claude-profile.json` JSON Schema and TypeScript types.
- `@cprof/core`: scanning, redaction, manifest, bundling, validation, local install, and diffing.
- `cprof`: CLI command dispatch.
- `@cprof/testing`: fixture corpus and test helpers.
