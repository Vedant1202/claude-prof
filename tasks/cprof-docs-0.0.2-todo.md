# cprof 0.0.2-alpha docs pass — Task list

Plan: `tasks/cprof-docs-0.0.2-plan.md` · Intent: confirmed via `/interview-me` (user-facing docs only)
Branch: off `dev` → PR into `dev`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 1 — Mermaid infra

- [x] T1 Add Mermaid — `@docusaurus/theme-mermaid@3.10.1` + `markdown.mermaid: true` + `themes`; `pnpm install` (succeeded); config confirmed via Context7; docs build green
- [x] ⟂ Checkpoint A — Mermaid config loads; render verified by T2's first diagram

## Phase 2 — Guides (each: examples + Mermaid + sidebar + cross-link)

- [x] T2 Guide **Scaffold a new project** — `new` + templates (`init --template`/`new <name>`/`new --list`/`new <profile>`, refuse-overwrite + `--force`); Mermaid template-loop diagram; sidebar + reference cross-link; build green
- [x] T3 Guide **Undo an install** — `rollback`/`--undo`, change-guard, trash, exit codes; Mermaid `applied ⇄ rolled-back` state diagram; sidebar + cross-link; build green
- [ ] T4 Guide **Track drift** — `cprof diff <profile>` vs live (drift; vs `install --dry-run`); diagram: profile→live re-scan→diff
- [ ] T5 Guide **Output locations & helper files** — `init --out`/`install --into`/`--no-gitignore`/`--no-report`; diagram or table for "where files go"
- [ ] ⟂ Checkpoint B — all 4 guides build, in sidebar, cross-linked; Mermaid renders

## Phase 3 — Surface refresh

- [ ] T6 Refresh stale pages — getting-started (thread new/templates/rollback + links), `packages/cli/README.md` command list, README "single file" accuracy fix
- [ ] ⟂ Checkpoint Final — `corepack pnpm verify` green; guides cross-linked; versions/CHANGELOG/handover untouched; PR into `dev` (owner-run)

## Notes / prerequisites

- **User-facing docs only** — no version bump / CHANGELOG / publish / handover (interview-confirmed).
- Mermaid via fenced ` ```mermaid ` blocks; keep `<…>` in backticks (MDX). Build after each task.
- Branch off `dev`. Single thread T1 → T2 → T3 → T4 → T5 → T6.
