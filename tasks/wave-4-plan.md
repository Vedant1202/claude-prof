# Wave 4 (remove the back half) — Implementation Plan

Spec: `.plans/wave-4-spec.md` (decisions resolved, no open questions). Branch: fresh off
`origin/main` (has #1/#2/#3). Type: **subtractive** — no TDD; verification is build-driven.

## Approach

Slice **vertically by capability** (remove one feature end-to-end — command, core module,
exports, tests, doc — per task), not horizontally by layer. Each slice leaves the repo in a
consistent state with **no dangling references**, so `tsc` build stays green between steps and is
the primary safety net.

## Dependency graph (recon-verified)

The four capabilities are independent **except one edge**:

```
profiles outdated ──needs──► loadProfileRegistry (registry)  ──┐
profiles outdated ──needs──► checkInstalledProfileUpdates (state)
                                                               └─► so remove "outdated" BEFORE "registry"

registry        ── self-contained (command + core/registry.ts)
policy          ── self-contained (command + core/policy.ts)
remote install  ── install.ts branch + main() opts + core/remote.ts
profiles list + ledger (state load/record) ── KEEP (no remote dep)
```

Order: **outdated → registry → policy → remote → README**. (registry/policy/remote are mutually
independent; outdated is sequenced first to avoid a dangling `loadProfileRegistry` import.)

## Tasks

### T1 — Remove `profiles outdated` (the update check)
- `cli/commands/profiles.ts`: drop the `outdated` action (union, parse, branch) and its imports
  (`checkInstalledProfileUpdates`, `loadProfileRegistry`, registry types); keep `list`.
- `core/state.ts`: delete `checkInstalledProfileUpdates` + `ProfileUpdateStatus`; keep
  `loadInstalledProfileState`/`recordInstalledProfile` + ledger types.
- `core/index.ts`: trim the `state.js` export block to the ledger symbols.
- Tests: drop `outdated` cases in `cli/test/profiles.test.ts` and `core/test/state.test.ts`.
- `docs/phase-5.md`: trim to the install-ledger / `profiles list` behavior.
- **Acceptance:** `profiles list` + ledger work; `profiles outdated` gone; no refs to
  `checkInstalledProfileUpdates`/`ProfileUpdateStatus`.
- **Verify:** `corepack pnpm build && corepack pnpm test`.

### T2 — Remove registry
- Delete `cli/commands/registry.ts`, `core/registry.ts`, `core/test/registry.test.ts`,
  `cli/test/registry.test.ts`, `docs/phase-4.md`.
- `cli/index.ts`: remove the `registry` dispatch branch + `runRegistry` import.
- `core/index.ts`: remove the `registry.js` export block.
- **Acceptance:** registry command/module/exports/tests/doc gone; no refs to `registry`/
  `loadProfileRegistry` (build proves it — T1 already removed the only other consumer).
- **Verify:** `corepack pnpm build && corepack pnpm test`.

### T3 — Remove policy
- Delete `cli/commands/policy.ts`, `core/policy.ts`, `core/test/policy.test.ts`,
  `cli/test/policy.test.ts`, `docs/phase-6.md`.
- `cli/index.ts`: remove the `policy` dispatch branch + `runPolicy` import.
- `core/index.ts`: remove the `policy.js` export block.
- **Acceptance:** policy command/module/exports/tests/doc gone; no refs to `policy`.
- **Verify:** `corepack pnpm build && corepack pnpm test`.

### T4 — Remove remote install
- `cli/commands/install.ts`: remove the `isRemoteProfileReference`/`fetchProfileReference`
  branch and the `fetcher`/`remoteCacheRoot` options + remote imports; keep the local-file path.
- `cli/index.ts`: drop `fetcher`/`remoteCacheRoot` from `MainOptions` + the `runInstall` call,
  and the `ProfileReferenceFetcher` import.
- Delete `core/remote.ts`, `core/test/remote.test.ts`, `docs/phase-3.md`.
- `core/index.ts`: remove the `remote.js` export block.
- **Acceptance:** `install <local.json>` still applies (deep-merge, all flags); `install <url>` /
  `github:` is no longer accepted; no refs to `remote`/`fetchProfileReference`/`fetcher`/
  `remoteCacheRoot`.
- **Verify:** `corepack pnpm build && corepack pnpm test`.

> **Checkpoint A:** after T1–T4, all back-half code is gone and `build + test` are green. ⟂

### T5 — README reposition + final gate
- `README.md`: remove the back-half command list (`registry`, `policy`, `profiles outdated`,
  `install <url|github:>`) and the phase-3/4/6 doc links; reposition the intro + command list
  around snapshot → scrub → migrate → diff (+ `profiles list`).
- **Final gate:** `corepack pnpm build && corepack pnpm test && corepack pnpm lint &&
  corepack pnpm format` all green; and:
  `grep -rnE "remote|registry|policy|fetchProfileReference|checkInstalledProfileUpdates|remoteCacheRoot|fetcher" packages/*/src` returns nothing (only ignore-related "remote"? confirm none).
- **Acceptance:** README accurate; all four gates green; grep clean.

> **Checkpoint B:** Wave 4 complete; ready to commit / open PR. ⟂

## Verification summary
- Build between every task (catches dangling imports/exports — the main risk).
- Front-half suites (`init`/`refresh`/`install-local`/`validate`/`diff`/`profiles list`) stay
  green; only back-half test cases are removed.
- Final grep proves zero remaining references to removed symbols.

## Out of scope
F4 (remote pinning — removed, not hardened), D6 (gitleaks CI), marketplace-interop growth wave.
No change to the profile schema, redaction, scanner, or local install semantics.
