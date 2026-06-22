# cprof rollback + ledger v2 — Task list

Spec: `.plans/rollback-spec.md` · Plan: `tasks/rollback-plan.md`
Branch: `feat/rollback` off `feat/0.0.2-cli-and-scan` (or `dev` once 0.0.2 merges) → PR into `dev`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 1 — Provenance foundation

- [x] T1 Fix basename-collision backup path in `install.ts` `backupConflicts` (D7)
- [x] T2 Ledger v2 schema + v1→v2 normalize in `state.ts` (WriteRecord, status, helpers) (D1)
- [x] ⟂ Checkpoint A — schema migrates v1 cleanly; basename fix in; core suite green
- [x] T3 install records v2 provenance (action + hash + backupPath + backupDir + status); behavior-preserving

## Phase 2 — Rollback engine (core)

- [x] T4 `applyRollback({mode:"rollback"})` — guard → stash → restore pre-install → flip status (D5/D6)
- [x] T5 `applyRollback({mode:"undo"})` — guard → restore stashed post-install → flip status (D6)
- [x] ⟂ Checkpoint B — install→rollback→undo round-trips at core level; guard verified both ways

## Phase 3 — CLI

- [x] T6 `cprof rollback [--undo] [--force] [--dry-run] [--global] [--json] [--quiet]` + register; exit 0/1/2/3 + envelope (D8)
- [x] ⟂ Checkpoint C — end-to-end install→rollback→undo on a real temp setup

## Phase 4 — Docs & wrap-up

- [x] T7 `.cprof-trash/` in generated `.gitignore`; document rollback/`--undo` in commands ref + README
- [x] ⟂ Checkpoint Final — `corepack pnpm verify` green; spec §7 met, §8 respected (PR into `dev` = owner-run)

## Notes / prerequisites

- Depends on the 0.0.2 command registry → branch off `feat/0.0.2-cli-and-scan`.
- Build is NOT started — plan awaiting go-ahead.
