# Implementation Plan: CLI ergonomics — target paths + side-file opt-outs

Spec: `.plans/cli-ergonomics-spec.md` (all decisions resolved; streaming/aliases/template deferred).
Branch: off **`dev`** (uses the 0.0.2 command registry + `finalizeProfileWrite`). PR into `dev` per the workflow rule.
Mode: **plan only — no code until approved.**

## Overview

Three small, backward-compatible CLI flags that change *where* output lands and *which* helper
files are written — nothing about *what* is captured or *how* it merges:

- `cprof init --out <dir>` — write the profile bundle to a chosen directory.
- `cprof install --into <dir>` — apply a profile into a chosen project directory.
- `cprof init --no-gitignore` / `--no-report` (and `refresh`) — suppress the two side files.

Entirely within `packages/cli`. No `@cprof/core` or `@cprof/schema` change; the profile schema
is untouched.

## Architecture decisions (from spec §4)

- **Flags only** — no `cprof new`, no `export`/`import` aliases.
- **Streaming deferred** — profiles are multi-file bundles (`ProfileItem.source`), so a single
  stream cannot carry one; true streaming needs an archive format → its own spec.
- **Template deferred** — open questions of its own.
- **Side files default on, opt-out flags** (`--no-gitignore` / `--no-report`).
- **No core/schema change** — if one appears necessary, **stop and re-scope** (this would not be
  the low-effort batch it claims to be).

## Why this is low-effort (the two enablers)

- `scanClaudeProfile` already takes `outputRoot` separately from the capture `cwd` → `--out` is
  just "set `outputRoot` (and the finalize write dir) to the chosen dir."
- `installProfile` already takes the target `cwd` separately from `profilePath` → `--into` is
  just "set `cwd` to the chosen dir; leave `profilePath` against the original cwd."

## Dependency graph

```
Phase 1 (independent of each other):
  T1 init --out <dir>      finalizeProfileWrite +outDir(mkdir,json path); init parser→loop; scan.outputRoot; registry
  T3 install --into <dir>  install parser +--into; installProfile.cwd; registry
            │ (T1 establishes the finalizeProfileWrite seam + the init token-loop parser)
            ▼
Phase 2:
  T2 --no-gitignore/--no-report   finalizeProfileWrite +writeGitignore/writeReport; init+refresh parsers; registry
            ▼
  T4 docs   README command table + website commands reference
```

Order: **T1 ∥ T3** (independent) → **T2** (shares `finalizeProfileWrite` + `init.ts` parser with
T1) → **T4** (documents all three). A single developer does T1 → T3 → T2 → T4.

## Grounded current state (recon, on `dev`)

- `cli/src/registry.ts` is the single source of truth for dispatch/help/completion; each row has
  `synopsis`/`summary`/`usage`/`flags`. Updating a row propagates to help + completion.
- `cli/src/commands/init.ts`: `parseCommonFlags` → `parseInitFlags(rest)` (a Set-membership check,
  no value-taking flags) → `scanClaudeProfile({…, outputRoot: cwd})` → `finalizeProfileWrite({command:"init", cwd, …})`.
- `cli/src/commands/refresh.ts`: same finalize tail; errors on any leftover flag in `rest`.
- `cli/src/commands/install.ts`: `parseInstallFlags(rest)` (token loop) → `installProfile({profilePath: resolve(cwd,path), cwd, …})`.
- `cli/src/command-utils.ts` `finalizeProfileWrite`: validate → **leak-check gate** → writes
  `claude-profile.json` + `.gitignore` + `cprof-scan-report.txt`, all `join(cwd, …)`; emits the
  `--json` envelope with `profilePath`.
- `cli/test/` has `install.test.ts`, `refresh.test.ts`, `registry.test.ts`, `index.test.ts`, but
  **no `init.test.ts`** (init is exercised via `index.test.ts`) → add a focused `init.test.ts`.

## Task list

### Phase 1 — Target-path flags

#### Task 1: `cprof init --out <dir>` (F1)

**Description:** Extend `finalizeProfileWrite` with `outDir?` (default `cwd`): `mkdir -p outDir`,
write the manifest + side files under `outDir`, and reflect the location in the `--json`
`profilePath`. Convert `parseInitFlags` to a token loop that consumes `--out <dir>`. Thread the
resolved dir to **both** `scanClaudeProfile.outputRoot` and the finalize `outDir` (they must
match so relative asset `source` paths line up).

**Acceptance:**

- [ ] `init --out <dir>` writes a valid, installable bundle under `<dir>`; `<dir>` is created if missing.
- [ ] Re-reading `<dir>/claude-profile.json` validates and its asset `source` paths resolve (round-trip: `install` from `<dir>` works).
- [ ] No `--out` → identical to today (writes into cwd).
- [ ] `--out` with no value → exit 1 with a clear message; `--out` onto an existing non-dir → exit 1.

**Verify:** `corepack pnpm --filter @cprof/cli test` (new `init.test.ts`) + `tsc -b`; round-trip case green.
**Dependencies:** None · **Files:** `cli/src/command-utils.ts`, `cli/src/commands/init.ts`, `cli/src/registry.ts`, `cli/test/init.test.ts` (new) · **Scope:** M

#### Task 3: `cprof install --into <dir>` (F2)

**Description:** Extend `parseInstallFlags` to consume `--into <dir>`; set
`installProfile.cwd = resolve(originalCwd, into)` while keeping `profilePath` resolved against the
original cwd. Update the `install` registry row (`synopsis`/`usage`/`flags`).

**Acceptance:**

- [ ] `install <profile> --into <dir>` lands project-scope config/assets under `<dir>` (and writes `.cprof-state.json` there).
- [ ] The profile is read relative to the original cwd; `--global` writes still go to `~/.claude` (unaffected by `--into`).
- [ ] No `--into` → identical to today; `--into` with no value → exit 1.

**Verify:** `corepack pnpm --filter @cprof/cli test` (extend `install.test.ts`) + `tsc -b`.
**Dependencies:** None (independent of T1) · **Files:** `cli/src/commands/install.ts`, `cli/src/registry.ts`, `cli/test/install.test.ts` · **Scope:** S–M

### ⟂ Checkpoint A — Target-path flags

- [ ] Both path flags work end-to-end on real temp dirs; defaults unchanged; new flags show in `--help`/completion; `--filter @cprof/cli test` + build green.

### Phase 2 — Side-file opt-outs

#### Task 2: `--no-gitignore` / `--no-report` for init + refresh (F3)

**Description:** Add `writeGitignore?` / `writeReport?` (default `true`) to
`FinalizeProfileWriteInput`; skip the matching write when false. Parse `--no-gitignore` /
`--no-report` out of `rest` in `init.ts` (into the T1 token loop) and `refresh.ts` (before its
"unknown flag" error). Update the `init` and `refresh` registry rows. **The leak-check gate is
unconditional** — `--no-report` removes only the report *file*, never the gate.

**Acceptance:**

- [ ] `--no-gitignore` omits `.gitignore`; `--no-report` omits `cprof-scan-report.txt`; both → only the manifest (+ bundle) is written.
- [ ] The manifest is always written; works for both `init` and `refresh`.
- [ ] **A planted secret still trips the gate with `--no-report` → exit 3, nothing written.**

**Verify:** `corepack pnpm --filter @cprof/cli test` (`init.test.ts` + `refresh.test.ts`, incl. the planted-secret case) + `tsc -b`.
**Dependencies:** T1 (shares `finalizeProfileWrite` + the `init.ts` parser loop) · **Files:** `cli/src/command-utils.ts`, `cli/src/commands/init.ts`, `cli/src/commands/refresh.ts`, `cli/src/registry.ts`, `cli/test/{init,refresh}.test.ts` · **Scope:** S–M

#### Task 4: Docs

**Description:** Document the three flags in the README command table and
`website/docs/reference/commands.md` (init `--out`, install `--into`, init/refresh `--no-*`),
noting `--out` is a directory and that `--no-report` does not disable the secret gate. In-CLI
help/usage is already covered by the registry edits in T1–T2.

**Acceptance:**

- [ ] README + commands reference list the new flags with the directory/gate caveats.
- [ ] Docs build green (if the docs workspace builds in this branch).

**Verify:** `corepack pnpm --filter @cprof/docs build` (or manual read if docs aren't wired on this branch).
**Dependencies:** T1, T2, T3 · **Files:** `README.md`, `website/docs/reference/commands.md` · **Scope:** S

### ⟂ Checkpoint Final

- [ ] `corepack pnpm verify` green (clean → build → test → lint → format); spec §7 acceptance met (incl. leak gate under `--no-report`), §8 boundaries respected; no diff under `packages/core` or `packages/schema`; PR opened into `dev` (owner-run).

## Risks and mitigations

| Risk                                              | Impact | Mitigation                                                                          |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| out-dir / `outputRoot` mismatch breaks relative `source` paths | High | The one correctness risk; covered by the round-trip "install from `--out` dir" test (T1). |
| Value-taking flag (`--out`/`--into`) eats a positional or has no value | Med | "no value → exit 1" tests + existing positional tests; consume value by index in the loop. |
| `--no-report` misread as disabling the secret gate | High | Explicit test: planted secret still exits 3 with nothing written (T2).               |
| Scope creep into `@cprof/core`                     | Med    | Spec §4.6 stop-and-rescope rule; Checkpoint Final asserts no core/schema diff.       |

## Open questions

- None blocking — all spec decisions resolved. `--out` is a directory (not a file path); docs
  (T4) included for completeness though the spec scoped code to `packages/cli`.
