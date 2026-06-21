# Docs site — Implementation Plan

Spec: `.plans/docs-site-spec.md` (intent confirmed; 3 defaults accepted unless flagged). Branch:
fresh off `origin/main`. Type: new docs sub-project — **no TDD**; verification is build-driven
(`docusaurus build` catches MDX + broken links) + visual + a Lighthouse SEO pass.

## Approach

A **walking skeleton, then layer**: T1 stands up a *buildable* Docusaurus site (with the markdown
pipeline proven) before any content; each later task is a complete, independently-verifiable
increment that keeps the build green. Ground every Docusaurus specific (config keys, deploy
workflow, search plugin, versioning command) against the **current** Docusaurus 3 docs when
implementing — the spec flags `markdown.format` as "confirm the exact key."

## Dependency graph

```
T1 Scaffold + markdown pipeline ──► everything
        │
        ▼
T2 Author IA content ──► T3 search (indexes content)
        │            ──► T4 SEO (per-page frontmatter)
        │            ──► T5 versioning (versions the content)
        ▼
T6 CI deploy (needs a buildable site) ──► T7 README repoint + final
```

Independent once T2 exists: T3/T4/T5 can land in any order. T6 only needs a buildable site; T7 is last.

## Tasks

### T1 — Scaffold + markdown pipeline (foundation)
- Create a Docusaurus 3 (TS) app in **`website/`**; add `website` to `pnpm-workspace.yaml`; disable
  the blog preset. Set GitHub-Pages base path: `url`, `baseUrl: '/claude-prof/'`,
  `organizationName`/`projectName`, explicit `trailingSlash`.
- Set `markdown.format: 'detect'` (verify exact key vs live docs) so `.md` parses as CommonMark.
- Add one placeholder Getting Started page that **deliberately includes MDX-hostile text**
  (`${env:NAME}`, `<file>`, `Promise<T>`) to prove the pipeline.
- **Acceptance:** `pnpm install` + `corepack pnpm --filter @cprof/docs build` pass; the hostile
  snippet renders literally (no MDX error).
- **Verify:** `corepack pnpm --filter @cprof/docs build`.

> **⟂ Checkpoint A** — site builds; markdown pipeline proven. Stop/confirm.

### T2 — Author the adopter IA (content)
- Author the §3 pages reusing existing prose (restructure, don't copy): Home, Getting Started,
  Core concepts (profile / redaction + limits / local-first), Migrate guide, Commands reference,
  Security & limits, `.cprofignore`. Reuse `docs/phase-1.md`/`phase-2.md`/`phase-5.md`/`cprofignore.md`
  + `README.md`.
- `sidebars.ts` (the IA), navbar, footer, a persistent alpha `announcementBar`, Home callout.
- **Acceptance:** every IA page exists and is navigable; `onBrokenLinks: 'throw'` build passes (no
  dead internal links); the "what is this → install → snapshot → migrate" path is walkable.
- **Verify:** `docusaurus build` (broken-link check on).

> **⟂ Checkpoint B** — full content authored & navigable. Best point to review the docs themselves.

### T3 — Local/offline search
- Add `@easyops-cn/docusaurus-search-local` (hashed index, `language: ['en']`); remove any Algolia stub.
- **Acceptance:** build emits a search index; the search box returns a hit for an offline query.
- **Verify:** `docusaurus build` + serve + query.

### T4 — SEO
- Confirm `@docusaurus/plugin-sitemap` (in preset-classic) is enabled/configured; add `static/robots.txt`;
  set site `tagline` + `themeConfig.metadata` (OG + Twitter card) and a default social `image`;
  add per-page frontmatter (`title`, `description`, `image`) across the IA; ensure canonical URLs.
  Ship a simple text/SVG social card (Q3 default).
- **Acceptance:** `sitemap.xml` + `robots.txt` emitted; OG/Twitter tags present in page `<head>`;
  descriptive titles; Lighthouse SEO pass green.
- **Verify:** build, inspect `<head>` + `build/sitemap.xml`, run Lighthouse SEO.

### T5 — Versioning
- Configure docs versioning; keep the current docs as the unversioned **"Next"/latest** (Q1);
  document the `docusaurus docs:version <x>` cut workflow in a short maintainer note.
- **Acceptance:** running `docs:version 0.0.0-test` produces a `versioned_docs` snapshot + a working
  version dropdown; revert the throwaway snapshot; "Next" remains the served latest.
- **Verify:** cut a test version, confirm dropdown, revert.

### T6 — CI deploy to GitHub Pages
- Add `.github/workflows/docs.yml`: build Docusaurus and deploy to GitHub Pages on push to `main`
  (configure-pages → upload-pages-artifact → deploy-pages; corepack pnpm, Node 24).
- **Acceptance:** workflow is valid and runs the same build as local; deploy succeeds on push and
  the site loads at the project base path. (Pages must be enabled in repo settings — owner action.)
- **Verify:** YAML/logic review + the deployed build (post-push, owner-triggered).

### T7 — README repoint + final gate
- Repoint `README.md` doc links (lines 7 & 48: phase-1/2/5/cprofignore) to the published docs-site URL.
- **Final:** clean `docusaurus build`, broken-link check, Lighthouse SEO sanity, prettier on touched files.
- **Acceptance:** README points at the site; all checks green.

> **⟂ Checkpoint C** — docs site complete; ready to commit / open PR.

## Verification summary
- `docusaurus build` after every task (catches MDX errors + broken links — the primary safety net).
- The repo's existing `build/test/lint/format` for the CLI are untouched (docs is a separate workspace).
- Final: Lighthouse SEO pass + a deployed-build check (base-path correctness only shows post-deploy).

## Risks & mitigations
- **MDX-vs-CommonMark** → `markdown.format: 'detect'` + the hostile-snippet check in T1.
- **GitHub-Pages base path** (broken assets/links under `/claude-prof/`) → set `baseUrl`/`url`/
  `trailingSlash`; verify the deployed build, not just local.
- **Docusaurus config drift** → confirm config keys / deploy workflow / search + versioning against
  current Docusaurus 3 docs while implementing (source-driven).
- **Dependency install size/network** → Docusaurus pulls a large tree; install in T1, commit the lockfile.

## Out of scope
i18n, blog, custom domain, hosted Algolia, heavy marketing landing; no CLI/schema/redaction changes;
not deleting the existing `docs/*.md` engineering notes (repoint/retire later).
