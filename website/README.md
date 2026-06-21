# @cprof/docs

The [cprof](https://github.com/Vedant1202/claude-prof) documentation site, built
with [Docusaurus](https://docusaurus.io/) and published to GitHub Pages at
**https://vedant1202.github.io/claude-prof/**.

## Develop

The site is a pnpm workspace package; run from the repo root:

```bash
corepack pnpm install
corepack pnpm --filter @cprof/docs start   # dev server with live reload
corepack pnpm --filter @cprof/docs build   # production build into website/build
```

## Authoring

- Write pages as plain `.md` (CommonMark). With `markdown.format: 'detect'`, `.md`
  is parsed as CommonMark, so prose tokens like `${env:NAME}`, `<file>`, and
  generics render literally. Reserve `.mdx` only for pages that genuinely need
  `:::` admonitions, tabs, or JSX.
- The sidebar is curated by hand in `sidebars.ts`.
- The site-wide alpha notice is the `announcementBar` in `docusaurus.config.ts`;
  use blockquotes for lighter callouts.

## Deployment

Automatic. `.github/workflows/docs.yml` builds and deploys to GitHub Pages on
every push to `main` that touches `website/**`. There is no manual deploy step.

## Versioning

The working docs are the **Next** (unreleased) version, served at `/docs`.
Versioning is wired up (`lastVersion: 'current'` plus a navbar version dropdown),
so you can freeze a stable snapshot whenever you cut a release:

```bash
corepack pnpm --filter @cprof/docs exec docusaurus docs:version 0.1.0
```

That copies the current `docs/` into `website/versioned_docs/version-0.1.0/`,
writes a versioned sidebar, and adds `0.1.0` to `versions.json`. The dropdown then
offers **Next** (the live, edited docs) and **0.1.0** (frozen). To undo a
snapshot, delete its `versioned_docs/version-X` and `versioned_sidebars` entries
and remove it from `versions.json`.

We keep the docs unversioned during the fast-moving alpha and will cut the first
snapshot at a stable release.
