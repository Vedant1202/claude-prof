# Wave 1 (F3) — Task list

Spec: `.plans/f3-redaction-spec.md` · Plan: `tasks/plan.md` · Branch: `wave-0-hardening`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⟂ = checkpoint (stop & confirm)

## Phase 0 — Foundation
- [x] T0.1 Add `@secretlint/core` + `@secretlint/secretlint-rule-preset-recommend` to `@cprof/core`; update lockfile; build green
- [x] T0.2 Add labelled redaction corpus (`REDACTION_CORPUS`) — placed in `core/test` (not `@cprof/testing`, which would cycle)
- [x] ⟂ Checkpoint A — deps resolve offline, build green, corpus committed

## Phase 1 — Provider detection, one secret end-to-end
- [x] T1.1 integration test: provider key redacted via async manifest path + sync/async parity
- [x] T1.2 `detector.ts` — secretlint config built once + `detectProviderSecret(value): Promise<boolean>` (offline)
- [x] T1.3 `redactSecretsAsync` (B+C ∪ A, short-circuit per D7) + `buildManifestWithRedactionsAsync`; wire `scanner.ts`
- [x] ⟂ Checkpoint B — end-to-end async redaction for one provider; sync API untouched

## Phase 2 — Breadth + precision tuning
- [ ] T2.1 (red) full corpus assertions
- [ ] T2.2 Layer B camelCase normalization (D3)
- [ ] T2.3 Layer C precision (D4): floor ~32, URL/path/hex/UUID skips, ≥2 char classes, keep JWT
- [ ] T2.4 remove `KNOWN_SECRET_PATTERNS`; convert sync "known patterns" test to async provider test
- [ ] T2.5 determinism test (byte-identical output)
- [ ] ⟂ Checkpoint C — corpus green, deterministic, full suite green

## Phase 3 — Independent manifest leak-check (fail-loud, D5)
- [ ] T3.1 (red) scanner test: planted secret → `cprof init` non-zero + reports path, no write
- [ ] T3.2 serialize redacted manifest → secretlint whole-doc leak-check
- [ ] T3.3 `init`/`refresh` fail-loud on leak; clean snapshot still exits 0
- [ ] ⟂ Checkpoint D — snapshot leak-checked + fail-loud; docs claim true

## Phase 4 — Docs + close-out
- [ ] T4.1 update `docs/phase-1.md` + README "what we detect / what we don't" table
- [ ] T4.2 exports + `pnpm audit` + full build/test/lint/format green + memory note
- [ ] ⟂ Checkpoint E — Wave 1 complete; ready to commit/PR

## Deferred (not this wave)
- [ ] D6 gitleaks CI cross-check
- [ ] F5 remote-MCP headers/url redaction
