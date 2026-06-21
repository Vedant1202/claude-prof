# Docs site — Task list

Spec: `.plans/docs-site-spec.md` · Plan: `tasks/docs-site-plan.md` · Branch: fresh off `origin/main`
No TDD (docs site) — verify each task with `corepack pnpm --filter @cprof/docs build`.
Legend: `[ ]` todo · `[x]` done · ⟂ checkpoint.

- [x] **T1 — Scaffold + markdown pipeline**: Docusaurus 3.10.1 (TS) in `website/` (`@cprof/docs`); added to
      `pnpm-workspace.yaml`; blog disabled; GH-Pages base path (`baseUrl: /claude-prof/`, `url`,
      org/project, `trailingSlash: false`); `markdown.format: 'detect'`; placeholder Getting Started page with
      MDX-hostile text (`${env:GITHUB_TOKEN}`, `<file>`, `Promise<Result>`) that renders literally
- [x] ⟂ **Checkpoint A** — site builds clean (no warnings); markdown pipeline proven (literal strings in
      built HTML at `website/build/docs/getting-started.html`)
- [ ] **T2 — Author adopter IA**: Home, Getting Started, Core concepts (profile / redaction+limits /
      local-first), Migrate guide, Commands reference, Security & limits, `.cprofignore`; `sidebars.ts`,
      navbar, footer, alpha `announcementBar`; reuse `docs/phase-1/2/5` + `cprofignore` + README
- [ ] ⟂ **Checkpoint B** — full content authored & navigable (review the docs here)
- [ ] **T3 — Local/offline search**: `@easyops-cn/docusaurus-search-local` (hashed, en); query returns a hit
- [ ] **T4 — SEO**: sitemap (preset-classic) + `robots.txt` + tagline + OG/Twitter `metadata` +
      default social image + per-page frontmatter (title/description/image) + canonical; Lighthouse SEO green
- [ ] **T5 — Versioning**: configure docs versioning, keep current as "Next"/latest; document the
      `docs:version` cut workflow; verify a throwaway snapshot + dropdown then revert
- [ ] **T6 — CI deploy**: `.github/workflows/docs.yml` build + deploy to GitHub Pages on push to `main`
      (owner enables Pages in repo settings)
- [ ] **T7 — README repoint + final gate**: repoint README links (lines 7 & 48) to the docs URL;
      clean build + broken-link check + Lighthouse SEO + prettier
- [ ] ⟂ **Checkpoint C** — docs site complete; ready to commit/PR

## Deferred / out of scope
- [ ] i18n, blog, custom domain, hosted Algolia (swap from local search later), branded OG image
- [ ] Retire/redirect the existing `docs/*.md` engineering notes
- [ ] Generate the Commands reference from `cprof --help` (keep docs in sync) — future
