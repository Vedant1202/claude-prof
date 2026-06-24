# named local templates — Task list

Spec: `.plans/cprof-templates-spec.md` · Plan: `tasks/cprof-templates-plan.md`
Branch: off `dev` → PR into `dev`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 1 — Consumer

- [x] T1 `new <name>` resolution + `--list` — resolver (path vs `homeDir/.cprof/templates/<name>/claude-profile.json`); not-found (exit 2) lists templates; `--list` mode; `parseNewFlags` + registry `new` row; `new.test.ts` (by-name, by-path regression, not-found, `--list`)
- [x] ⟂ Checkpoint A — `new` resolves by name + path; `--list` works; cli test (97) + build green; no `core`|`schema` diff

## Phase 2 — Producer

- [x] T2 `init --template <name>` (explicit) — `outDir = homeDir/.cprof/templates/<name>`; mutually exclusive with `--out`; reuse `--out` threading; registry `init` row; `init.test.ts` + round-trip (`init --template foo` → `new foo <dir>`)
- [x] ⟂ Checkpoint B — explicit save; round-trips with `new`; suite (101) + build green

## Phase 3 — Docs

- [ ] T3 Docs — README (note `new <name>`/`--list` + `init --template`) + `website/docs/reference/commands.md`; emphasize explicit creation
- [ ] ⟂ Checkpoint Final — `corepack pnpm verify` green; spec §7/§8; zero `core`|`schema` diff; PR into `dev` (owner-run)

## Notes / prerequisites

- CLI + docs only — **no core/schema change** (spec §8: stop & re-scope if a core change appears).
- Reuses `installProfile` (new) + init's `--out` plumbing (init --template). Templates are bundle dirs.
- Branch off `dev`. Single thread T1 → T2 → T3.
