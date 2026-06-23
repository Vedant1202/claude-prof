# CLI ergonomics — target paths + side-file opt-outs — Task list

Spec: `.plans/cli-ergonomics-spec.md` · Plan: `tasks/cli-ergonomics-plan.md`
Branch: off `dev` → PR into `dev`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 1 — Target-path flags

- [ ] T1 `init --out <dir>` — `finalizeProfileWrite` +`outDir` (mkdir, json path); init parser → token loop; thread to `scan.outputRoot`; registry; new `init.test.ts` (round-trip install from out-dir)
- [ ] T3 `install --into <dir>` — install parser +`--into`; `installProfile.cwd`; registry; extend `install.test.ts` (independent of T1)
- [ ] ⟂ Checkpoint A — both path flags end-to-end on temp dirs; defaults unchanged; flags in `--help`/completion; `--filter @cprof/cli test` + build green

## Phase 2 — Side-file opt-outs

- [ ] T2 `--no-gitignore` / `--no-report` (init + refresh) — `finalizeProfileWrite` +`writeGitignore`/`writeReport`; init + refresh parsers; registry; tests incl. **planted-secret-still-exits-3** under `--no-report`
- [ ] T4 Docs — README command table + `website/docs/reference/commands.md` (`--out` is a dir; `--no-report` ≠ disabling the gate)
- [ ] ⟂ Checkpoint Final — `corepack pnpm verify` green; spec §7/§8; no `packages/core`|`packages/schema` diff; PR into `dev` (owner-run)

## Notes / prerequisites

- CLI-only (`packages/cli`). **No core/schema changes** — spec §4.6: if a core change appears
  necessary, stop and re-scope.
- T1 ∥ T3 are independent; T2 depends on T1 (shared `finalizeProfileWrite` + `init.ts` parser).
- Build is NOT started — plan awaiting go-ahead.
