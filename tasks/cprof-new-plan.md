# Implementation Plan: `cprof new` — scaffold a new project from a profile

Spec: `.plans/cprof-new-spec.md` (resolved; CLI + docs only, no core/schema change).
Branch: off **`dev`** → PR into `dev`.
Mode: **plan only — no code until approved.**

## Overview

A new `cprof new <profile> [dir]` command that scaffolds a fresh project from a local
profile. It's a thin wrapper over `installProfile`: a dry-run pre-flight **refuses to
overwrite** any existing target, `--force` overrides, and because `--force` keeps
install's backup + ledger, **`cprof rollback` can reverse a scaffold**. No core/schema
change — `installProfile` is reused as-is.

## Architecture decisions (from spec §4)

- `[dir]` optional → defaults to cwd; project-scoped; no `--global`.
- Default refuses to overwrite (pre-flight: any planned write whose `action` ≠ `created`);
  `--force` overrides.
- No backups on the clean path; a `--force` overwrite keeps install's backup → reversible
  via the existing `rollback`.
- **Reuse `installProfile` unchanged — no `packages/core` or `packages/schema` change.**

## Why this is CLI-only (the enablers)

`installProfile` already does the two hard things: (a) **dry-run returns the full plan
with a per-write `action`** (`created`/`merged`/`overwritten`) → the overwrite pre-flight
is a `.filter`, not new logic; (b) on `force` it **backs up + records the ledger** → a
`new --force` is reversible through the `rollback` command that shipped in PR #11. So
`new` is: parse → dry-run plan → refuse-or-install → frame the output.

## Dependency graph

```
T1  cprof new command (parse, dry-run pre-flight, refuse/scaffold, --force) + registry + unit tests
         ▼
T2  reversibility — end-to-end: `new --force` then `cprof rollback` restores the original
         ▼
T3  docs — README command table + website commands reference
```

Order: **T1 → T2 → T3** (single thread, off `dev`).

## Grounded current state (recon, on `dev`)

- `installProfile(options)` → `InstallResult { writes (InstallWrite{ path, action, backupPath? }),
  conflicts, backups, missingSecrets, exitCode, report }`; `dryRun` plans without writing
  ([core/install.ts](../packages/core/src/install.ts), [install-types.ts](../packages/core/src/install-types.ts)).
- Pre-flight: `installProfile({ dryRun: true, force: true })` → `existing = writes.filter(w => w.action !== "created")`.
- Real run: `installProfile({ dryRun: false, force: <userForce> })`.
- CLI is registry-driven ([cli/src/registry.ts](../packages/cli/src/registry.ts)); `parseCommonFlags`
  handles `--json`/`--quiet` ([command-utils.ts](../packages/cli/src/command-utils.ts)).
- `rollback` (on `dev`) restores `overwritten`/`merged` from backup + trashes `created`; reads
  `projectRoot/.cprof-state.json`.
- Test harness: `main(argv, { cwd, homeDir, … })` over temp dirs; `install.test.ts` has
  `writeAsset`/`writeProfile` helpers + `buildManifest` fixtures to copy.

## Task list

### Phase 1 — The command

#### Task 1: `cprof new <profile> [dir]` command + registry entry

**Description:** New `cli/src/commands/new.ts`. With `parseCommonFlags`, parse positionals
`<profile>` (required) + `[dir]` (optional, default `.`) and `--force`. Resolve both against
cwd. **Pre-flight:** `installProfile({ dryRun: true, force: true })`; `existing = writes`
with `action` ∈ `{merged, overwritten}`. If `existing` non-empty and no `--force` → refuse
(exit 1, list the paths, write nothing). Otherwise run `installProfile({ force: <userForce> })`
for real. Scaffold-framed success output (per-section counts) or the `--json` envelope. Exit
codes `0/1/2/3` aligned with install. Register the `new` row in `registry.ts`.

**Acceptance:**

- [ ] `new <profile>` scaffolds into cwd; `new <profile> <dir>` into `<dir>` (created if missing); content matches the profile; **no `.cprof-backups/`** on the clean path.
- [ ] A pre-existing target without `--force` → exit 1, **nothing written**, message names the path.
- [ ] `--force` over an existing target overwrites it and writes a backup; missing profile → exit 2.
- [ ] `new` appears in `--help` and completion (driven by the registry row).

**Verify:** `corepack pnpm --filter @cprof/cli test` (new `new.test.ts`) + `tsc -b`.
**Dependencies:** None · **Files:** `cli/src/commands/new.ts` (new), `cli/src/registry.ts`, `cli/test/new.test.ts` (new) · **Scope:** M

#### Task 2: Reversibility — `rollback` reverses a `new --force`

**Description:** End-to-end test of the headline safety property: after
`cprof new <profile> <dir> --force` overwrites an existing file, `cprof rollback` (cwd =
`<dir>`) restores the original from backup and trashes the created files. No code change
expected beyond T1 — the property emerges from reusing install's backup + ledger; if a gap
surfaces, fix it in `new.ts`.

**Acceptance:**

- [ ] After `new --force` overwrites a file, `cprof rollback` restores the original content and removes the created files (exit 0).
- [ ] (Stretch) `cprof rollback --undo` re-applies the scaffold.

**Verify:** `corepack pnpm --filter @cprof/cli test` (reversibility case) + build.
**Dependencies:** T1 (+ `rollback` on `dev`) · **Files:** `cli/test/new.test.ts` · **Scope:** S

### ⟂ Checkpoint A — Command

- [ ] `new` scaffolds, refuses overwrites, `--force` overwrites reversibly; flags in `--help`/completion; `--filter @cprof/cli test` + build green; **no `packages/core`/`packages/schema` diff**.

### Phase 2 — Docs

#### Task 3: Docs

**Description:** Document `cprof new` in the README command table and
`website/docs/reference/commands.md` — synopsis, `[dir]` default (cwd), refuse-to-overwrite
+ `--force`, no-backups-on-the-clean-path, and reversibility via `cprof rollback`.

**Acceptance:**

- [ ] README + commands reference describe `new` with the overwrite / `--force` / rollback behavior.
- [ ] Docs build green.

**Verify:** `corepack pnpm build` (docusaurus) / manual read.
**Dependencies:** T1, T2 · **Files:** `README.md`, `website/docs/reference/commands.md` · **Scope:** S

### ⟂ Checkpoint Final

- [ ] `corepack pnpm verify` green; spec §7 met, §8 respected; zero diff under `packages/core`|`packages/schema`; PR opened into `dev` (owner-run).

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Pre-flight plan vs real-write race | Low | Local scaffold; `--force` gates any overwrite; real install never silently clobbers. |
| Global-only profile → 0 project writes | Low | Clear "nothing to scaffold (no project content)" message; exit 0. |
| Double plan computation (dry-run + real) | Low | Acceptable for a one-shot scaffold; keeps the engine the single source of truth. |
| Scope creep into `packages/core` | Med | Spec §8 stop-and-rescope; Checkpoint Final asserts zero core/schema diff. |

## Open questions

- Exact scaffold summary wording + whether to print per-section counts (decide in T1).
- Global-only profile: exit 0 with a note (leaning) vs a distinct non-zero code.
