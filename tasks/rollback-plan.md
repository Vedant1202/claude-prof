# Implementation Plan: `cprof rollback` + ledger v2

Spec: `.plans/rollback-spec.md` (all decisions resolved; D5b best-effort + D6 `--undo` confirmed).
Branch: `feat/rollback` off **`feat/0.0.2-cli-and-scan`** (or off `dev` once 0.0.2 merges) —
rollback registers into the command registry introduced in 0.0.2, so it cannot branch off
bare `dev` yet. PRs into `dev` per the workflow rule.
Mode: **plan only — no code until approved.**

## Overview

Make the last `cprof install` a reversible, transactional toggle. `cprof rollback` reverts
it (restore merged from backup, soft-delete created to trash, abort-all on divergence);
`cprof rollback --undo` re-applies it. Built on a **ledger v2** that records per-install
file provenance (action + post-install hash + backup path) and a `status` the two
directions flip between.

## Architecture decisions (from spec §4)

- **Ledger v2** (D1): `version: 2`; each record gains `backupDir`, `writes: WriteRecord[]`
  (`{path, action, hash, backupPath?}`), `status: applied|rolled-back`, `rollbackTrashDir?`.
  v1 normalizes to v2-with-empty-writes (un-rollback-able), never errors.
- **Symmetric engine** (D6): one `applyRollback({mode})` — guard-first → stash current
  state → restore the other state → flip status. `rollback` and `--undo` are the same
  operation in opposite directions.
- **Transaction-level change-guard** (D5a): hash every touched file vs its expected state;
  any mismatch aborts the whole op (unless `--force`). Read-only checks run before any
  mutation, so a clean run never half-applies.
- **Best-effort apply** (D5b): no temp-swap; on a mid-apply FS failure, stop + report.
- **Soft-delete** to `.cprof-trash/<ts>/` (D4); never hard-delete.
- **Basename-collision fix** (D7): prerequisite — out-of-project-root backups must use a
  collision-free path recorded in the ledger.

## Dependency graph

```
T1 basename fix (install.ts)  ─┐  (prerequisite + standalone bugfix)
T2 ledger v2 schema (state.ts) ┤
                               ▼
T3 install records v2 provenance (install.ts)   ← needs T1 (paths) + T2 (schema)
                               ▼
T4 core engine: rollback direction (rollback.ts) ← needs T3 (provenance to revert)
                               ▼
T5 core engine: --undo direction                ← needs T4 (the stash to restore)
                               ▼
T6 `cprof rollback` CLI (+ register, --undo)     ← needs T4+T5 + the 0.0.2 registry
                               ▼
T7 docs + .gitignore (.cprof-trash)              ← needs T6
```

Order: **T1 → T2 → T3 → T4 → T5 → T6 → T7.** T1 and T2 are independent and could be done
in either order.

## Grounded current state (recon)

- `state.ts`: `InstalledProfileState {version:1, installs}`, `InstalledProfileRecord`
  (install-level only), `recordInstalledProfile` dedups by `(source,target)`.
- `install.ts`: at the ledger write, `prepared` (PreparedWrite[] with `action` +
  `finalContents`), `backups` (InstallWrite[] with `path`+`backupPath`), and `backupRoot`
  are all in scope — enough to build v2 provenance. `backupConflicts` falls back to
  `basename` for files outside `projectRoot` (the bug, D7).
- `install-plan.ts`: `source: "generated"` (JSON config → merged) vs `"asset"` (files →
  created/overwritten).
- Registry/dispatch from 0.0.2 (`cli/src/registry.ts`) is where the new command registers.

## Task List

### Phase 1 — Provenance foundation

#### Task 1: Fix the basename-collision backup path (D7)

**Description:** In `install.ts` `backupConflicts`, replace the `basename` fallback for
files outside `projectRoot` with a collision-free scheme (namespace under `global/` using
the path relative to `claudeHome`); the recorded `backupPath` must round-trip uniquely.

**Acceptance:**

- [ ] Two global files with the same basename back up to distinct paths.
- [ ] Existing install/backup behavior for in-project files is unchanged.

**Verify:** `corepack pnpm --filter @cprof/core test` (new collision case + existing green); build.
**Dependencies:** None · **Files:** `core/src/install.ts`, `core/test/install.test.ts` · **Scope:** S

#### Task 2: Ledger v2 schema + v1→v2 normalize (D1)

**Description:** In `state.ts`: bump `version: 2`; add `WriteRecord` and the new record
fields (`backupDir`, `writes`, `status`, `rollbackTrashDir?`); `normalizeState` upgrades v1
records (`writes: []`, `status: "applied"`). Add `findLatestInstall(state, status)` and a
status-flip helper. Keep `recordInstalledProfile` dedup behavior.

**Acceptance:**

- [ ] A v1 ledger loads as v2 with empty `writes` + `status: "applied"` (no error).
- [ ] New helpers find/flip the latest entry by status.

**Verify:** `corepack pnpm --filter @cprof/core test` (v1→v2 normalize cases); build.
**Dependencies:** None · **Files:** `core/src/state.ts`, `core/test/state.test.ts` · **Scope:** S–M

### ⟂ Checkpoint A — Foundation

- [ ] Schema migrates v1 cleanly; basename fix in; core suite green.

#### Task 3: install records v2 provenance (D1)

**Description:** At `install.ts`'s ledger write, build `writes` from `prepared` (action +
`sha256(finalContents)`) correlated with `backups` (`backupPath`), and pass `backupDir`
(the backup root) + `status: "applied"`. Behavior-preserving for install's user-facing
output (writes/report/exit codes unchanged).

**Acceptance:**

- [ ] After a real install, the ledger entry has per-write `action` + `hash` + (for
      merged/overwritten) `backupPath`, plus `backupDir` and `status: "applied"`.
- [ ] All existing install + profiles tests pass unchanged.

**Verify:** `corepack pnpm --filter @cprof/core test` + `--filter @cprof/cli test`; build.
**Dependencies:** T1, T2 · **Files:** `core/src/install.ts`, `core/test/install.test.ts` · **Scope:** M

### Phase 2 — Rollback engine (core)

#### Task 4: Core rollback direction — `applyRollback({mode:"rollback"})` (D5, D6)

**Description:** New `core/src/rollback.ts`: pick the latest `applied` entry → **guard**
(each touched file's current hash == recorded post-install hash; else abort listing
diverged files, unless `force`) → **stash** current content to `.cprof-trash/<ts>/` →
restore pre-install state (delete created, restore merged/overwritten from `backupDir`) →
flip `status: "rolled-back"`, set `rollbackTrashDir`. `dryRun` returns the plan only.
Best-effort apply with a structured result.

**Acceptance:**

- [ ] Reverts an untouched install (merged restored, created moved to trash); entry → `rolled-back`.
- [ ] Diverged/missing file → aborts with no mutation (exit-equivalent), names files; `--force` overrides.
- [ ] No `applied` entry → "nothing to do"; v1/provenance-less entry → not rollback-able (no crash).

**Verify:** `corepack pnpm --filter @cprof/core test` (rollback/guard/force/dry-run/none cases).
**Dependencies:** T3 · **Files:** `core/src/rollback.ts` (new), `core/src/index.ts`, `core/test/rollback.test.ts` (new) · **Scope:** M

#### Task 5: Core `--undo` direction — `applyRollback({mode:"undo"})` (D6)

**Description:** Extend the engine: pick the latest `rolled-back` entry → guard (current ==
pre-install state: merged match the install backup, created absent) → restore the stashed
post-install state from `rollbackTrashDir` → flip `status: "applied"`.

**Acceptance:**

- [ ] `undo` after a rollback restores the exact post-install state (created back, merged
      back to merged content); entry → `applied`.
- [ ] Guard fires on divergence; no `rolled-back` entry → "nothing to do".

**Verify:** `corepack pnpm --filter @cprof/core test` (round-trip install→rollback→undo).
**Dependencies:** T4 · **Files:** `core/src/rollback.ts`, `core/test/rollback.test.ts` · **Scope:** S–M

### ⟂ Checkpoint B — Engine

- [ ] install → rollback → undo round-trips at the core level; guard verified both directions; core suite green.

### Phase 3 — CLI

#### Task 6: `cprof rollback` command + registry entry (D8)

**Description:** New `cli/src/commands/rollback.ts` calling the core engine; parse
`--undo` → mode, plus `--force`/`--dry-run`/`--global`; use `parseCommonFlags` for
`--json`/`--quiet`. Register in `cli/src/registry.ts` (synopsis/summary/usage/flags).
Exit 0/1/2/3 + the `{command:"rollback", mode, restored, trashed, reapplied, aborted?}`
envelope per D8.

**Acceptance:**

- [ ] `cprof rollback` / `cprof rollback --undo` drive the engine; exit codes match D8
      (0 done · 2 nothing to do · 3 aborted-changed).
- [ ] `--json` emits the envelope; `--dry-run` changes nothing; appears in help + completion (from the table).

**Verify:** `corepack pnpm --filter @cprof/cli test` (new `rollback.test.ts`); build.
**Dependencies:** T4, T5 · **Files:** `cli/src/commands/rollback.ts` (new), `cli/src/registry.ts`, `cli/test/rollback.test.ts` (new) · **Scope:** M

### ⟂ Checkpoint C — End-to-end

- [ ] `cprof install` → `cprof rollback` → `cprof rollback --undo` works on a real temp setup; exit codes + `--json` correct.

### Phase 4 — Docs & wrap-up

#### Task 7: Docs + `.gitignore`

**Description:** Add `.cprof-trash/` to the generated profile `.gitignore`
(`createProfileGitignore`); document `rollback`/`--undo` in `website/docs/reference/commands.md`
(behavior, exit codes, the change-guard, soft-delete) and the README command table; note
it's single-level (last install).

**Acceptance:**

- [ ] `.cprof-trash/` is gitignored; commands ref + README list `rollback` with `--undo`.
- [ ] Docs build green.

**Verify:** `corepack pnpm --filter @cprof/docs build`; manual read.
**Dependencies:** T6 · **Files:** `core/src/<gitignore source>`, `website/docs/reference/commands.md`, `README.md` · **Scope:** S–M

### ⟂ Checkpoint Final

- [ ] `corepack pnpm verify` green; spec §7 acceptance met, §8 boundaries respected; PR opened into `dev`.

## Risks and mitigations

| Risk                                        | Impact | Mitigation                                                                                              |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| A wrong rollback destroys trust             | High   | Guard-first + read-only preconditions; soft-delete (never hard-delete); `--dry-run`; heavy guard tests. |
| Install provenance change regresses install | Med    | T3 is behavior-preserving; existing install/profiles suites are the guard.                              |
| Mid-apply FS failure leaves partial state   | Med    | Best-effort + clear report of done/not-done + locations (D5b); documented.                              |
| v1→v2 migration breaks `profiles list`      | Med    | Normalize v1→v2; tolerate provenance-less entries; tested.                                              |
| Branch/sequence on 0.0.2 registry           | Low    | Branch off `feat/0.0.2-cli-and-scan`; rebase onto `dev` after 0.0.2 merges.                             |

## Open questions

- None blocking — spec decisions resolved. Minor: exact namespacing scheme for the D7
  backup path (decide during T1); trash-dir nesting (D4 settled as separate `.cprof-trash/`).
