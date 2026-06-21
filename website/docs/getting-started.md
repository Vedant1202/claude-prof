---
title: Getting Started
description: Install cprof and snapshot your Claude Code setup.
---

# Getting Started

> **Alpha** — cprof is alpha software. Review every generated profile before
> sharing it. (The site-wide banner is set via `announcementBar`; `:::` admonitions
> are MDX-only and don't render in these CommonMark `.md` pages.)

This page is a temporary placeholder that also proves the markdown pipeline.

cprof scrubs secrets into placeholders like ${env:GITHUB_TOKEN} — a literal
`${...}` written in prose. Under MDX that bare brace would be parsed as a
JavaScript expression and the build would fail; with this site's CommonMark
pipeline (`markdown.format: 'detect'`) it renders as-is. Generics written in prose
like Promise<Result>, and CLI usage like install <file>, are the same story.

## Install

```bash
corepack pnpm install
corepack pnpm build
```

## First snapshot

```bash
node packages/cli/dist/index.js init
```
