# Implementation Plan: cprof 0.0.2-alpha docs pass (guides + surface refresh)

Intent (confirmed via `/interview-me`): a **user-facing docs pass only** — Mermaid-illustrated,
example-driven usage guides for every new 0.0.2 feature, plus bringing the stale on-ramp pages
current. **Not** the release mechanics.
Branch: off **`dev`** → PR into `dev`. Build authorized.

## Overview

Add Mermaid to the Docusaurus site and write **4 task-oriented guides** (scaffold, undo, drift,
output-locations) with runnable terminal examples + flow diagrams, wire them into the sidebar
and cross-link from the commands reference, then refresh the stale pages (getting-started, the
npm `@cprof/cli` README, the README "single file" line). The docs build stays green.

## Confirmed scope (from the interview)

- **IN:** `@docusaurus/theme-mermaid`; 4 guides; sidebar + cross-links; getting-started threading;
  cli README refresh; README accuracy fix.
- **OUT:** version bump, CHANGELOG, publish, handover-doc rewrite, docs-version snapshot.
- **Illustrations** = Mermaid diagrams (fenced ` ```mermaid `) **+** annotated terminal examples.

## Dependency graph

```
T1 Mermaid infra (theme-mermaid@3.10.1 + config) ──┐ (every diagram-bearing guide needs it)
                                                    ▼
T2 Guide: Scaffold a new project (new + templates)
T3 Guide: Undo an install (rollback)
T4 Guide: Track drift (live diff)
T5 Guide: Output locations & helper files
                                                    ▼
T6 Surface refresh (getting-started + cli README + README accuracy)  ← no Mermaid; links to T2–T5
```

Order: **T1 → T2 → T3 → T4 → T5 → T6** (T6 last so its links to the new guides resolve).

## Grounded current state (recon, on `dev`)

- **Docusaurus 3.10.1** (`@cprof/docs`); `docusaurus.config.ts` has `markdown:` (L27),
  `presets:` (L40), `themes:` (L70) blocks. Mermaid = add `@docusaurus/theme-mermaid@3.10.1`,
  set `markdown.mermaid: true`, add `'@docusaurus/theme-mermaid'` to `themes`. **Confirm exact
  keys via Context7 (Docusaurus 3.x mermaid) in T1.**
- Site guides pattern: `website/docs/guides/{migrate,scanning}.md`, curated in `website/sidebars.ts`.
- `commands.md` already documents every flag (init `--out`/`--template`/`--no-*`, install
  `--into`, `new` + templates, rollback, live `diff`) — the guides **cross-link** to it, not duplicate it.
- `getting-started.md` (71 lines): Install → first snapshot (`init`) → review (`scan`) → what's
  next; does **not** mention `new`/templates/`rollback`/`install`.
- `packages/cli/README.md` command list: init/install/refresh/validate/diff/profiles only
  (**missing** new/rollback/scan/completion/templates/live-diff).
- `README.md` intro: "single, portable `claude-profile.json`" (inaccurate — it's a manifest +
  asset bundle).
- Mermaid currently absent; docs use no inline diagrams.

## Task list

### Phase 1 — Mermaid infra

#### Task 1: Add Mermaid to the site

**Description:** Add `@docusaurus/theme-mermaid@3.10.1` to `website/package.json`; `corepack pnpm
install` to update the lockfile; in `docusaurus.config.ts` set `markdown.mermaid = true` and add
`'@docusaurus/theme-mermaid'` to `themes`. Verify the exact config against **Context7 (Docusaurus
3.x diagrams/mermaid)**. Prove it renders with a fenced ` ```mermaid ` block (folded into T2's
first guide is fine).

**Acceptance:**

- [ ] `corepack pnpm --filter @cprof/docs build` green with a ` ```mermaid ` block rendering (no MDX/parse error).
- [ ] Lockfile updated; `theme-mermaid` pinned to `3.10.1` (matches `@docusaurus/core`).

**Verify:** `corepack pnpm --filter @cprof/docs build`.
**Dependencies:** None · **Files:** `website/package.json`, `website/docusaurus.config.ts`, `pnpm-lock.yaml` · **Scope:** S

### ⟂ Checkpoint A — Mermaid renders

- [ ] A Mermaid diagram renders in a clean docs build.

### Phase 2 — Guides

#### Task 2: Guide — "Scaffold a new project"

**Description:** New `website/docs/guides/scaffold.md` — save a template (`init --template <name>`),
scaffold by name (`new <name>`), list (`new --list`), scaffold from a path (`new <profile>`),
refuse-overwrite + `--force` (reversible via rollback). Runnable terminal examples. Mermaid: (a)
snapshot→scaffold overview, (b) the template loop (`init --template` → `~/.cprof/templates/` →
`new <name>`). Add to `sidebars.ts`; cross-link from `commands.md` (`new` + `init` sections).

**Acceptance:** builds; covers `new` + all template flags with examples + 1–2 Mermaid diagrams; in the sidebar; reference cross-links it.
**Verify:** docs build · **Deps:** T1 · **Files:** `website/docs/guides/scaffold.md` (new), `website/sidebars.ts`, `website/docs/reference/commands.md` · **Scope:** M

#### Task 3: Guide — "Undo an install"

**Description:** New `guides/rollback.md` — install → `cprof rollback` → `--undo`; the change-guard
(abort on drift, `--force`), soft-delete to trash, exit codes. Examples. Mermaid: a state diagram
`applied ⇄ rolled-back`. Sidebar + cross-link from `commands.md` (`rollback`).

**Acceptance:** builds; covers `rollback`/`--undo` with examples + the toggle diagram; sidebar; cross-link.
**Verify:** docs build · **Deps:** T1 · **Files:** `guides/rollback.md` (new), `sidebars.ts`, `commands.md` · **Scope:** M

#### Task 4: Guide — "Track drift"

**Description:** New `guides/drift.md` — `cprof diff <profile>` vs the live machine (drift framing),
when to use it vs `install --dry-run`, no-drift = clean (exit 0). Examples. Mermaid: profile +
live re-scan → `diffProfiles` → drift. Sidebar + cross-link from `commands.md` (`diff`).

**Acceptance:** builds; covers live diff with examples + diagram; sidebar; cross-link.
**Verify:** docs build · **Deps:** T1 · **Files:** `guides/drift.md` (new), `sidebars.ts`, `commands.md` · **Scope:** M

#### Task 5: Guide — "Output locations & helper files"

**Description:** New `guides/output-locations.md` — default cwd, `init --out <dir>`, `install
--into <dir>`, `--no-gitignore`/`--no-report` (the leak gate still runs). What lands where, with
examples. A Mermaid "where files go" diagram **or** a clean table — whichever reads clearer
(intent: "illustrations wherever needed"). Sidebar + cross-link.

**Acceptance:** builds; covers `--out`/`--into`/`--no-*` with examples; sidebar; cross-link.
**Verify:** docs build · **Deps:** T1 · **Files:** `guides/output-locations.md` (new), `sidebars.ts`, `commands.md` · **Scope:** M

### ⟂ Checkpoint B — Guides

- [ ] All 4 guides build, sit in the sidebar, and are cross-linked from the reference; Mermaid renders throughout.

### Phase 3 — Surface refresh

#### Task 6: Refresh the stale pages

**Description:** (a) `getting-started.md` — thread `new`/templates/`rollback` into the on-ramp /
"What's next" with links to the new guides. (b) `packages/cli/README.md` — refresh the command
list to include `new`/`rollback`/`scan`/`completion` + named templates + live diff. (c)
`README.md` — fix the "single, portable `claude-profile.json`" line to reflect the manifest +
asset bundle (the known accuracy fix).

**Acceptance:** getting-started links the new guides; cli README lists every 0.0.2 command; the README intro is accurate; docs build + `prettier --check` green.
**Verify:** `corepack pnpm verify` (or docs build + format) · **Deps:** T2–T5 (links) · **Files:** `website/docs/getting-started.md`, `packages/cli/README.md`, `README.md` · **Scope:** S–M

### ⟂ Checkpoint Final

- [ ] `corepack pnpm verify` green (build incl. docs + lint + format); guides cross-linked; **untouched: versions, CHANGELOG, handover**; PR opened into `dev` (owner-run).

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Mermaid / MDX parse errors (`<…>` in prose) | Med | Build after each task; keep `<…>` inside backticks/fences; Mermaid lives in fenced blocks. |
| `theme-mermaid` version mismatch with core 3.10.1 | Low | Pin to `3.10.1`; confirm via Context7. |
| `pnpm install` (network) for the new dep may be permission-gated | Low | Flag if blocked; the rest of the plan (the `.md` guides) can proceed and the diagrams render once the dep lands. |
| Prettier reformats the new `.md` | Low | `format:write` before the final verify. |
| Scope creep into release mechanics | Low | Out-of-scope is explicit; Final checkpoint asserts versions/CHANGELOG untouched. |

## Open questions

- None blocking. Minor: "Output locations" uses a Mermaid diagram vs a table — decide in T5 by readability.
