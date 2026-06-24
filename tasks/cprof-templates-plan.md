# Implementation Plan: named local templates

Spec: `.plans/cprof-templates-spec.md` (resolved; CLI + docs only, no core/schema change).
Branch: off **`dev`** → PR into `dev`. Build authorized — proceeding T1 → T2 → T3.

## Overview

Scaffold and explicitly save Claude Code setups by **name**. `cprof new <name>` resolves
from `~/.cprof/templates/<name>/`; `cprof new --list` lists them; `cprof init --template
<name>` explicitly saves the current setup as a named template (= `init --out` into the
templates dir). CLI + docs only — reuses `installProfile` and init's `--out` plumbing.

## Architecture decisions (from spec §4)

- Templates dir = `homeDir/.cprof/templates/<name>/` (a bundle **directory**).
- Disambiguation: path if it has a separator / ends in `.json` / exists, else a template name.
- Discovery via `new --list`. Producer is **explicit** (`init --template`); never auto-created.
- **No `packages/core` / `packages/schema` change.**

## Why this is CLI-only (the enablers)

- `new`: a resolver maps `<source>` → an absolute profile path (a couple of `existsSync`
  checks) right before the existing `installProfile` call at `new.ts:50`.
- `init --template`: computes `outDir = homeDir/.cprof/templates/<name>` and reuses the
  `--out` threading merged in #12 (`scan.outputRoot` + `finalizeProfileWrite`).

## Dependency graph

```
T1  new <name> resolution + --list      (new.ts, registry `new` row, new.test)
         ▼  (the round-trip needs new's name resolution)
T2  init --template <name> (explicit)   (init.ts, registry `init` row, init.test) + round-trip test
         ▼
T3  docs                                 (README + commands reference)
```

Order: **T1 → T2 → T3** (single thread, off `dev`).

## Grounded current state (recon, on `dev`)

- `new.ts`: `parseNewFlags` → `{ profilePath, targetDir, force }`; then
  `installInput.profilePath = resolve(cwd, parsed.profilePath)` → dry-run pre-flight → install.
- `init.ts`: `parseInitFlags` (token loop) handles `--global`/`--include-global`/`--out`/`--no-*`;
  `runInit` computes `outDir = parsed.outDir ? resolve(cwd, outDir) : cwd` and threads it to
  `scan.outputRoot` + `finalizeProfileWrite`.
- Both commands take an injectable `homeDir` → templates dir = `homeDir/.cprof/templates`.
- Test harness: `main(argv, { cwd, homeDir })`; `new.test.ts` already has a `projectProfile()`
  - `writeAsset`/`writeProfile` helpers to copy.

## Task list

### Phase 1 — Consumer

#### Task 1: `cprof new <name>` resolution + `--list`

**Description:** In `new.ts`, add a resolver mapping `<source>` → an absolute profile path:
a path if `<source>` has a separator, ends in `.json`, or exists; else look up
`homeDir/.cprof/templates/<source>/claude-profile.json`; if neither → not-found (exit `2`)
listing available templates. Add `--list`: print template names (subdirs containing a
`claude-profile.json`), exit `0`, friendly empty note. Update `parseNewFlags`, the usage
message, and the registry `new` row (synopsis `new <profile|name> [dir] [--force]`, flags
`+--list`).

**Acceptance:**

- [ ] A template at `homeDir/.cprof/templates/foo/` → `new foo <dir>` scaffolds it.
- [ ] `new <path> <dir>` (separator or `.json`) still works (regression).
- [ ] `new nope` → exit `2`; message lists available templates.
- [ ] `new --list` lists names (+ friendly empty note); appears in `--help`/completion.

**Verify:** `corepack pnpm --filter @cprof/cli test` (`new.test.ts`) + `tsc -b`.
**Dependencies:** None · **Files:** `cli/src/commands/new.ts`, `cli/src/registry.ts`, `cli/test/new.test.ts` · **Scope:** M

### ⟂ Checkpoint A — Consumer

- [ ] `new` resolves by name + path; `--list` works; cli test + build green; no core/schema diff.

### Phase 2 — Producer

#### Task 2: `cprof init --template <name>` (explicit save)

**Description:** In `init.ts`, parse `--template <name>` (value-taking). When set,
`outDir = join(homeDir, ".cprof", "templates", name)`; **mutually exclusive with `--out`**
(clear error). Reuse the existing outDir threading. Update `parseInitFlags` + the registry
`init` row. Add a round-trip test: `init --template foo` then `new foo <dir>`.

**Acceptance:**

- [ ] `init --template foo` writes a bundle under `homeDir/.cprof/templates/foo/`.
- [ ] Combinable with `--global`; mutually exclusive with `--out` (exit 1, clear error).
- [ ] Round-trip: `init --template foo` → `new foo <dir>` scaffolds the captured setup.
- [ ] Nothing is created implicitly (no template dir appears unless `--template` is passed).

**Verify:** `corepack pnpm --filter @cprof/cli test` (`init.test.ts` + the round-trip) + `tsc -b`.
**Dependencies:** T1 (round-trip) · **Files:** `cli/src/commands/init.ts`, `cli/src/registry.ts`, `cli/test/init.test.ts` · **Scope:** M

### ⟂ Checkpoint B — Producer

- [ ] `init --template` saves explicitly; round-trips with `new`; suite + build green.

### Phase 3 — Docs

#### Task 3: Docs

**Description:** Document named templates in the README (note `new <name>` / `--list` +
`init --template`) and `website/docs/reference/commands.md` (update the `new` and `init`
sections), emphasizing that template creation is explicit.

**Acceptance:**

- [ ] README + commands reference cover named templates with the explicit-creation note.
- [ ] Docs build green.

**Verify:** `corepack pnpm build` (docusaurus) / manual read.
**Dependencies:** T1, T2 · **Files:** `README.md`, `website/docs/reference/commands.md` · **Scope:** S

### ⟂ Checkpoint Final

- [ ] `corepack pnpm verify` green; spec §7 met, §8 respected; zero diff under
      `packages/core`|`packages/schema`; PR opened into `dev` (owner-run).

## Risks and mitigations

| Risk                                                 | Impact | Mitigation                                                                     |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Name/path ambiguity (a name that's also a local dir) | Low    | Explicit-path rule + template precedence for bare names; `--list`; documented. |
| Templates dir absent                                 | Low    | `--list` says "none yet"; `new <name>` not-found points at `init --template`.  |
| `--template` vs `--out` collision                    | Low    | Mutually exclusive with a clear error.                                         |
| Scope creep into `packages/core`                     | Low    | None expected; Checkpoint Final asserts zero core/schema diff.                 |

## Open questions

- None blocking. Minor: `--list` output format (plain names; `--json` envelope) — settle in T1.
