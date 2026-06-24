# `cprof new` — scaffold a new project from a profile — Task list

Spec: `.plans/cprof-new-spec.md` · Plan: `tasks/cprof-new-plan.md`
Branch: off `dev` → PR into `dev`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 1 — The command

- [x] T1 `cprof new <profile> [dir]` + registry — `parseCommonFlags`; positionals + `--force`; dry-run pre-flight (`existing = writes.action !== "created"`); refuse (exit 1) or `installProfile` real; scaffold output / `--json`; new `new.test.ts` (scaffold cwd/dir, refuse, `--force` overwrite+backup, profile-not-found)
- [x] T2 Reversibility — end-to-end test: `new --force` overwrites → `cprof rollback` restores the original (passed with no code change — the property fell out of reusing install's backup + ledger)
- [x] ⟂ Checkpoint A — scaffolds / refuses / `--force` reversible; flags in `--help`/completion; cli test (79) + build green; zero `core`|`schema` diff

## Phase 2 — Docs

- [x] T3 Docs — README command table + `website/docs/reference/commands.md` (`[dir]` default cwd; refuse-to-overwrite + `--force`; no backups on clean path; reversible via `rollback`)
- [ ] ⟂ Checkpoint Final — `corepack pnpm verify` green; spec §7/§8; zero `core`|`schema` diff; PR into `dev` (owner-run)

## Notes / prerequisites

- CLI + docs only — **no core/schema change** (spec §8: if a core change appears, stop and re-scope).
- Reuses `installProfile` (dry-run plan for the pre-flight; `force` keeps the backup → `rollback`-reversible).
- Branch off `dev`. Single thread T1 → T2 → T3. Build NOT started — awaiting go-ahead.
