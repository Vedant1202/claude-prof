# Wave 4 (remove the back half) — Task list

Spec: `.plans/wave-4-spec.md` · Plan: `tasks/wave-4-plan.md`
Order is dependency-driven: **outdated → registry → policy → remote → README**
(`profiles outdated` imports `loadProfileRegistry`, so it must go before registry).
Legend: `[ ]` todo · `[x]` done · ⟂ checkpoint. Verify each with `pnpm build && pnpm test`.

- [x] **T1 — remove `profiles outdated`**: trim `profiles.ts` (keep `list`); delete
      `checkInstalledProfileUpdates`/`ProfileUpdateStatus` from `state.ts`; trim `core/index.ts`
      state exports; drop outdated cases in `profiles.test`/`state.test`; trim `docs/phase-5.md`
- [x] **T2 — remove registry**: delete `core/registry.ts`, `cli/commands/registry.ts`, their
      tests, `docs/phase-4.md`; remove `registry` dispatch in `cli/index.ts`; remove registry
      export block in `core/index.ts`
- [x] **T3 — remove policy**: delete `core/policy.ts`, `cli/commands/policy.ts`, their tests,
      `docs/phase-6.md`; remove `policy` dispatch in `cli/index.ts`; remove policy export block in
      `core/index.ts`
- [x] **T4 — remove remote install**: trim `cli/commands/install.ts` (drop remote branch +
      `fetcher`/`remoteCacheRoot`); drop those options + `ProfileReferenceFetcher` from
      `cli/index.ts`; delete `core/remote.ts` + test + `docs/phase-3.md`; remove remote export block
- [x] ⟂ **Checkpoint A** — all back-half code gone; `build + test` green
- [x] **T5 — README reposition + final gate**: reposition `README.md` around
      snapshot→scrub→migrate→diff (+ `profiles list`); full `build/test/lint/format` green; grep
      proves no remaining references to removed symbols
- [x] ⟂ **Checkpoint B** — Wave 4 complete; ready to commit/PR

## Deferred (not this wave)

- [ ] D6 gitleaks CI cross-check
- [ ] Marketplace-interop growth wave (snapshot → emit marketplace.json/plugin)
- [ ] F4 remote SHA-pinning (frozen — only if remote install is revived)
