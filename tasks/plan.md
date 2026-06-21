# Wave 1 (F3 — Trustworthy redaction) — Implementation Plan

Spec: `.plans/f3-redaction-spec.md` (REV 2, approved). Branch: `wave-0-hardening`
(Wave 0 done, 127 tests green). Mode: **plan only — no code changes until this plan is approved.**

## Objective

Replace hand-rolled provider-key detection with a maintained engine, without over-redacting:
- **Layer A — secretlint** (`@secretlint/core` + recommend preset, MIT, in-process, offline) → provider keys.
- **Layer B — key-name heuristic** (kept; fix camelCase) → sensitively-named values (`dbPassword`).
- **Layer C — entropy + JWT** (kept; precision-leaning) → home-grown blobs.
Redact if ANY layer flags; whole-value replacement with `${env:NAME}` from the key path.
Plus: independent **manifest leak-check** on `cprof init`, **fail-loud**.

## Dependency graph & the async boundary (resolved)

secretlint's `lintSource` is **async**; the current redactor is **sync** and is reused by
`leak-check.ts` and `diff.ts`, and `buildManifest` (sync) is called by ~8 test files. To avoid
a large async ripple we **contain async to the snapshot path**:

```
@cprof/testing corpus ─────────────┐ (feeds all TDD tests)
                                    ▼
secretlint deps (D1) ─► detector.ts  (Layer A, async, config built once)
                          │
shouldRedactString (SYNC, Layers B+C, improved)                 ┌─ leak-check.ts (sync, unchanged API)
   │                                                            ├─ diff.ts        (sync, unchanged)
   └─ redactSecrets (SYNC) ─► buildManifest (SYNC) ─────────────┴─ ~8 test call sites (UNCHANGED)
                          │
   redactSecretsAsync (B+C ∪ A) ─► buildManifestWithRedactionsAsync ─► scanner.ts ─► init/refresh
                          └─ manifest leak-check (secretlint over whole serialized doc) ─► fail-loud
```

**Consequences (intentional):** provider-key detection (Layer A) runs on the real snapshot
path (`scanner` → `init`/`refresh`) and in the independent manifest leak-check. The sync
`redactSecrets`/`buildManifest`/`diff` keep Layers B+C only. `KNOWN_SECRET_PATTERNS` is
removed from the sync path (satisfies acceptance "no hand-maintained prefix list"); the one
sync test that covered prefixes is converted to an async provider-detector test.

## Vertical slices (each slice is a complete working path, TDD: red → green)

### Phase 0 — Foundation
- **T0.1 Add secretlint dependency (D1).** Add `@secretlint/core` + `@secretlint/secretlint-rule-preset-recommend` to `packages/core/package.json`; update lockfile.
  - *Acceptance:* `corepack pnpm install` updates lock; `corepack pnpm build` green; a scratch test can `import { lintSource } from "@secretlint/core"`.
  - *Verify:* `pnpm install --frozen-lockfile` succeeds offline on a clean store; `pnpm -r build`.
- **T0.2 Labelled fixture corpus** in `@cprof/testing` (exported `MUST_REDACT` / `MUST_NOT_REDACT` from spec §5).
  - *Acceptance:* arrays exported and typed; a smoke test imports them.
  - *Verify:* `vitest run` collects them; no network.

> **Checkpoint A:** deps resolve offline, build green, corpus committed. ⟂ stop & confirm.

### Phase 1 — Provider detection, one secret end-to-end
- **T1.1 (red) Failing test:** a manifest carrying `sk-ant-api03-…` is redacted to `${env:…}` through the async snapshot path.
- **T1.2 `detector.ts`:** module-level secretlint config (preset `creator`, built once) + `detectProviderSecret(value): Promise<boolean>` using `lintSource({ source:{content,filePath}, options:{config, noPhysicFilePath:true} })`.
  - *Acceptance:* unit test — `sk-ant-…`→true, `"sonnet"`→false; runs offline.
  - *Verify:* core tests; assert no network (no live calls; secretlint is local).
- **T1.3 Async redaction path:** add `redactSecretsAsync(value)` = sync B+C ∪ async Layer A (short-circuit per **D7**: skip the secretlint call when B/C already flag); add `buildManifestWithRedactionsAsync`; point `scanner.ts` at it (it is already `async`).
  - *Acceptance:* T1.1 green; existing scanner tests green; sync `buildManifest`/`redactSecrets` untouched.
  - *Verify:* `pnpm --filter @cprof/core test`.

> **Checkpoint B:** end-to-end async redaction works for one provider; async boundary contained. ⟂ stop & confirm.

### Phase 2 — Breadth + precision tuning (corpus-green)
- **T2.1 (red)** Assert the full `MUST_REDACT` / `MUST_NOT_REDACT` corpus through redaction.
- **T2.2 Layer B camelCase (D3):** normalize keys (`dbPassword`→`db_password`) before keyword match in `shouldRedactString`.
- **T2.3 Layer C precision (D4):** keep floor ~32; replace blanket `/` exclusion with precise URL/path skip; skip hex-blobs/UUIDs/semver; require ≥2 character classes; keep JWT.
- **T2.4 Remove `KNOWN_SECRET_PATTERNS`** from `redactor.ts`; convert `redactor.test.ts` "redacts known secret patterns" to the async provider-detector test.
- **T2.5 Determinism test:** same input → byte-identical redacted output (sorted).
  - *Acceptance:* every `MUST_REDACT` redacted; every `MUST_NOT_REDACT` untouched; determinism green; full suite green.
  - *Verify:* `corepack pnpm test` (all packages) + `lint`.

> **Checkpoint C:** corpus green, deterministic, full suite green. ⟂ stop & confirm.

### Phase 3 — Independent manifest leak-check (fail-loud, D5)
- **T3.1 (red)** `scanner.test.ts`: a planted secret in the built manifest → `cprof init` exits non-zero and reports the JSON path; no profile written.
- **T3.2** After building the redacted manifest, serialize and run secretlint over the whole document (independent of the value-walk); return a leak result.
- **T3.3** `init`/`refresh`: on any leak, fail non-zero with offending paths; do not write outputs.
  - *Acceptance:* T3.1 green; a clean snapshot still exits 0 and writes outputs.
  - *Verify:* `pnpm --filter cprof test` + `pnpm --filter @cprof/core test`.

> **Checkpoint D:** snapshot path leak-checked + fail-loud; `docs/phase-1.md` claim now true. ⟂ stop & confirm.

### Phase 4 — Docs + close-out
- **T4.1** Update `docs/phase-1.md` (three-layer reality) and add a README "what we detect / what we don't" table.
- **T4.2** Export any new symbols from `index.ts`; run `pnpm audit`; full `build + test + lint + format` green; update `MEMORY.md` note; (optional) refresh the review HTML.
  - *Acceptance:* docs accurate; suite + lint + prettier green; no high-sev audit findings introduced.

> **Checkpoint E:** Wave 1 complete; ready to commit / open PR.

## Risks & mitigations
- **Async ripple** → contained to scanner path; sync API preserved (see graph).
- **secretlint perf** → build config once (module scope); bounded concurrency; short-circuit Layer A when B/C flag (D7).
- **Offline/CI** → secretlint is fully local; tests must not hit network; assert in CI.
- **Over/under-redaction** → the corpus is the contract; secretlint carries precision so Layer C stays conservative.

## Out of scope (this wave)
- **D6** gitleaks CI cross-check (deferred — separate follow-up).
- **F5** remote-MCP `headers`/`url` redaction.
- **F2b** settings deep-merge on install; **F4** remote SHA-pinning.
