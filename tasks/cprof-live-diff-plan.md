# Implementation Plan: live diff (`cprof diff <profile>` vs the machine)

Spec: `.plans/cprof-live-diff-spec.md` (resolved; CLI + docs only, no core/schema change).
Branch: off **`dev`** → PR into `dev`. Build authorized — proceeding T1 → T2.

## Overview

Overload `cprof diff`: with **one** positional, re-scan the current machine using the
saved profile's metadata + scope (refresh-style) into a throwaway temp dir, then
`diffProfiles(savedProfile, liveManifest)` (drift framing). Two positionals keep today's
file-vs-file behavior. Reuses `scanClaudeProfile` + `diffProfiles`; no core/schema change.

## Architecture decisions (from spec §4)

- 1 positional ⇒ live; 2 ⇒ files (unchanged).
- Drift framing: profile = before, live = after.
- Scan refresh-style (profile's name/version/desc/claudeCode/scope) → no metadata noise.
- Scan to an OS temp dir; `rm` in a `finally`.
- **No `packages/core` / `packages/schema` change.**

## Why this is CLI-only (the enablers)

- `scanClaudeProfile` already produces a live manifest with content hashes (init/refresh
  use it); calling it with the profile's metadata reproduces the saved profile exactly
  when nothing changed → noise-free.
- `diffProfiles`/`formatProfileDiff` already render a semantic profile diff. So live diff
  is: read profile → scan to temp → `diffProfiles(profile, manifest)` → reuse the renderer.

## Dependency graph

```
T1  diff live mode (overload diff.ts + homeDir + registry) + diff.test
         ▼
T2  docs (README + commands reference)
```

Order: **T1 → T2** (single thread, off `dev`).

## Grounded current state (recon, on `dev`)

- `cli/src/commands/diff.ts`: `parseCommonFlags` → requires exactly 2 positionals → `readJson`
  ×2 → `diffProfiles` → `formatProfileDiff`/`--json`. `DiffCommandOptions` has **no `homeDir`**.
- `readProfileFile` (command-utils) reads + schema-validates a profile → typed `CprofProfile`
  (exit 2 not-found / 1 invalid) — reuse it for the saved profile in live mode.
- `scanClaudeProfile({ name, version, description, claudeCode, cwd, homeDir, outputRoot, mode,
  includeGlobal })` → `{ manifest, … }`; `refresh.ts` shows the exact call shape to copy.
- `cli/src/registry.ts` `diff` row's `run` passes `cwd`/`stdout`/`stderr` only — add `homeDir`.
- Test harness: `main(argv, { cwd, homeDir })`; `diff.test.ts` + `install.test.ts`/`new.test.ts`
  have `writeAsset`/`buildManifest` patterns to copy.

## Task list

### Phase 1 — The command

#### Task 1: `cprof diff <profile>` live mode

**Description:** In `diff.ts`, branch on the positional count. **1** → live: `readProfileFile`
the saved profile; `mkdtemp` an `outputRoot`; `scanClaudeProfile` with the profile's
`name`/`version`/`description`/`claudeCode`/`profileScope`(mode)/`includesGlobal`; then
`diffProfiles(savedProfile, scan.manifest)`; render via `formatProfileDiff` / the `--json`
envelope (`equal`); `rm` the temp dir in a `finally`. **2** → existing path unchanged.
Add `homeDir?` to `DiffCommandOptions` and thread `context.homeDir` from the registry `diff`
row; update synopsis/usage to show both forms.

**Acceptance:**

- [ ] `cprof diff <profile>` against an unchanged machine → "No differences" / `--json equal: true`, exit 0.
- [ ] After a real change (added/modified command), `cprof diff <profile>` shows the entry; `--json equal: false`; exit 0.
- [ ] Two-arg `cprof diff <a> <b>` is unchanged (regression).
- [ ] Missing profile → exit 2; invalid profile → exit 1.
- [ ] Nothing is written into the project cwd; no temp dir is left behind.

**Verify:** `corepack pnpm --filter @cprof/cli test` (`diff.test.ts`) + `tsc -b`.
**Dependencies:** None · **Files:** `cli/src/commands/diff.ts`, `cli/src/registry.ts`, `cli/test/diff.test.ts` · **Scope:** M

### ⟂ Checkpoint A — Command

- [ ] Live diff works (no-drift + drift); two-arg unchanged; new form in `--help`/completion; cli test + build green; no `core`/`schema` diff.

### Phase 2 — Docs

#### Task 2: Docs

**Description:** Document live diff in the README command table (note `cprof diff <profile>`
⇒ vs the live machine) and `website/docs/reference/commands.md` (update the `diff` section:
both forms, drift framing, "not an error" exit 0).

**Acceptance:**

- [ ] README + commands reference describe both diff forms with the drift framing.
- [ ] Docs build green.

**Verify:** `corepack pnpm build` (docusaurus) / read.
**Dependencies:** T1 · **Files:** `README.md`, `website/docs/reference/commands.md` · **Scope:** S

### ⟂ Checkpoint Final

- [ ] `corepack pnpm verify` green; spec §7 met, §8 respected; zero diff under
      `packages/core`|`packages/schema`; PR opened into `dev` (owner-run).

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scan non-determinism → phantom drift | Med | Refresh-style metadata + same scope; `source`/`hash` position-independent; the "no drift" test is the guard. |
| Temp-dir leak / writing into the project | Low | `mkdtemp` under OS temp + `rm` in `finally`; a test asserts a clean cwd. |
| `diff` lacked `homeDir` | Low | Add to `DiffCommandOptions` + thread from the registry. |
| Scope creep into core | Low | None expected; Checkpoint Final asserts zero core/schema diff. |

## Open questions

- None blocking. Minor: whether the "no drift" test builds the profile via `init`/`init --out`
  vs `buildManifest` — settle in T1 (init-based is the most faithful determinism check).
