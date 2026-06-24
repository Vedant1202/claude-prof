# live diff (`cprof diff <profile>` vs the machine) — Task list

Spec: `.plans/cprof-live-diff-spec.md` · Plan: `tasks/cprof-live-diff-plan.md`
Branch: off `dev` → PR into `dev`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 1 — The command

- [x] T1 `cprof diff <profile>` live mode — branch on positional count; 1 ⇒ `readProfileFile` + `scanClaudeProfile` (refresh-style, temp `outputRoot`, `rm` in `finally`) + `diffProfiles(profile, live)` (drift); add `homeDir` to `DiffCommandOptions` + registry `diff` row; `diff.test.ts` (no-drift equal, drift entry, 2-arg regression, not-found, clean cwd)
- [x] ⟂ Checkpoint A — live diff (no-drift + drift); two-arg unchanged; new form in help/completion; cli test (104) + build green; no `core`|`schema` diff

## Phase 2 — Docs

- [x] T2 Docs — README command table (note `diff <profile>` ⇒ vs live machine) + `website/docs/reference/commands.md` `diff` section (both forms, drift framing, drift = exit 0)
- [ ] ⟂ Checkpoint Final — `corepack pnpm verify` green; spec §7/§8; zero `core`|`schema` diff; PR into `dev` (owner-run)

## Notes / prerequisites

- CLI + docs only — **no core/schema change** (spec §8: stop & re-scope if a core change appears).
- Reuses `scanClaudeProfile` (live snapshot, refresh-style) + `diffProfiles`/`formatProfileDiff`.
- Branch off `dev`. Single thread T1 → T2.
