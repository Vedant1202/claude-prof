# Contributing to cprof

Thanks for your interest! cprof is an early (alpha) **local-first** CLI for
snapshotting, scrubbing, and migrating a Claude Code setup. Bug reports, fixes, and
focused features are all welcome.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js >= 22**
- **pnpm** via [corepack](https://nodejs.org/api/corepack.html) (the version is pinned
  in `package.json`; run `corepack enable` once).

## Getting started

```bash
git clone https://github.com/Vedant1202/claude-prof.git
cd claude-prof
corepack pnpm install
corepack pnpm build     # build every package
corepack pnpm test      # run the full test suite
```

Run the CLI from source:

```bash
corepack pnpm --filter @cprof/cli build
node packages/cli/dist/index.js --help
```

## Project layout

A pnpm + TypeScript monorepo:

| Package          | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `@cprof/cli`     | The CLI — installs the `cprof` command                   |
| `@cprof/core`    | Scanning, redaction, manifest, bundling, install, diff   |
| `@cprof/schema`  | The `claude-profile.json` JSON Schema + TypeScript types |
| `@cprof/testing` | Internal fixtures and test helpers (not published)       |
| `website/`       | The Docusaurus documentation site (`@cprof/docs`)        |

The CLI is **registry-driven**: every command is one row in
`packages/cli/src/registry.ts` — the single source of truth for dispatch, `--help`, and
shell completions. Adding a command means adding a row plus its `commands/<name>.ts`.

## Branching & pull requests

- **Branch off `dev`, and open your PR into `dev`.** `main` is the release branch — it
  only receives changes by promoting `dev`. PRs opened against `main` will be redirected.
- Keep each PR to one logical change.
- Fill in the PR template, including its checklist.

## Before you push

Run the same gate CI does:

```bash
corepack pnpm verify   # clean → build → test → lint → format
```

Handy while iterating:

```bash
corepack pnpm --filter @cprof/cli test   # one package's tests
corepack pnpm format:write               # auto-fix formatting
```

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
`fix:`, `docs:`, `refactor:`, `chore:`, …) — the changelog is generated from them. Use
the imperative mood in the subject.

## Tests

Changes to behavior need tests. cprof favors test-driven development — write a failing
test, make it pass, keep the suite green. Tests live in each package's `test/` directory
(vitest); shared fixtures live in `@cprof/testing`.

## Docs

If you change a command or flag, update its `--help` text (the registry `usage`), the
[command reference](./website/docs/reference/commands.md), and the relevant guide under
`website/docs/guides/`. Keep the README command table in sync.

## Security & secrets

cprof handles potentially-sensitive config. **Never** commit real secrets or a
`claude-profile.json` captured from a real machine. To report a vulnerability, see
[SECURITY.md](./SECURITY.md) — please don't open a public issue for it.

## Questions

Open an [issue](https://github.com/Vedant1202/claude-prof/issues) or browse the
[documentation](https://vedant1202.github.io/claude-prof/).
