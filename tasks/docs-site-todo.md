# Docs site — Task list

Spec: `.plans/docs-site-spec.md` · Plan: `tasks/docs-site-plan.md` · Branch: fresh off `origin/main`
No TDD (docs site) — verify each task with `corepack pnpm --filter @cprof/docs build`.
Legend: `[ ]` todo · `[x]` done · ⟂ checkpoint.
**Markdown convention** (decided 2026-06-21): author pages as plain `.md` (CommonMark) so prose
tokens (`${env:NAME}`, `<file>`, generics) render literally; reserve `.mdx` only for pages that
genuinely need `:::` admonitions / tabs / JSX. The global alpha notice lives in `announcementBar`;
use blockquotes for light callouts inside `.md` pages.

- [x] **T1 — Scaffold + markdown pipeline**: Docusaurus 3.10.1 (TS) in `website/` (`@cprof/docs`); added to
      `pnpm-workspace.yaml`; blog disabled; GH-Pages base path (`baseUrl: /claude-prof/`, `url`,
      org/project, `trailingSlash: false`); `markdown.format: 'detect'`; placeholder Getting Started page with
      MDX-hostile text (`${env:GITHUB_TOKEN}`, `<file>`, `Promise<Result>`) that renders literally
- [x] ⟂ **Checkpoint A** — site builds clean (no warnings); markdown pipeline proven (literal strings in
      built HTML at `website/build/docs/getting-started.html`)
- [x] **T2 — Author adopter IA**: authored Getting Started, Concepts (What's in a profile / Local-first),
      Redaction & secret safety (folds in limits + security), Migrate guide, Commands reference, `.cprofignore`;
      curated manual `sidebars.ts` (Getting Started → Concepts → Redaction → Guides → Reference). Home (on-brand
      hero + Snapshot/Scrub/Migrate cards), navbar, footer, and alpha `announcementBar` were already in place.
      Grounded in `docs/phase-1/2/5` + `cprofignore` + the README; all `.md` (CommonMark), GFM tables confirmed.
- [x] ⟂ **Checkpoint B** — full content authored, builds clean (no broken links), navigable
- [x] **T3 — Local/offline search**: `@easyops-cn/docusaurus-search-local@^0.55.2` theme (hashed, en, no blog);
      navbar search box + static index, build-verified
- [x] **T4 — SEO**: 9-URL `sitemap.xml` + `robots.txt` + cprof-branded `social-card.svg` (replaced the dino card) +
      OG/Twitter `metadata` + per-page title/description (frontmatter) + canonical; `url` lowercased to match the Pages host
- [x] **T5 — Versioning**: `lastVersion: 'current'` (live docs = "Next") + navbar `docsVersionDropdown`; cut workflow
      documented in `website/README.md`; verified by cutting a throwaway version (dropdown showed Next + snapshot) then reverting
- [x] **T6 — CI deploy** (done early, during release): `.github/workflows/docs.yml` deploys to GitHub Pages
      on push to `main`; Pages enabled, live at https://vedant1202.github.io/claude-prof/
- [x] **T7 — README repoint + final gate**: root README already links to the docs site (the rewrite removed the
      stale phase-doc links); final gate green — clean build, broken-link check (`onBrokenLinks: throw`), per-page
      SEO meta, prettier. (A live Lighthouse run is left as an optional manual check.)
- [x] ⟂ **Checkpoint C** — docs site complete (T1–T7); ready to commit/PR

## Deferred / out of scope

- [ ] i18n, blog, custom domain, hosted Algolia (swap from local search later), branded OG image
- [ ] Retire/redirect the existing `docs/*.md` engineering notes
- [ ] Generate the Commands reference from `cprof --help` (keep docs in sync) — future
