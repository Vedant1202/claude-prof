# cprof — 0.0.2-alpha handover

_Last updated: 2026-06-24._

A maintainer-facing snapshot of where cprof stands at its second alpha: what shipped
since 0.0.1, how it's built, the decisions and ops gotchas that aren't obvious from the
code, and where to take it next. Read this to pick the project up cold. The 0.0.1
handover (`docs/handover-0.0.1-alpha.md`) still holds for the foundational design — this
doc records the delta and supersedes its "limitations/roadmap" sections.

---

## 1. TL;DR

cprof is a **local-first CLI that snapshots a Claude Code setup into a portable,
secret-redacted profile bundle, then migrates it to another machine** via a
non-destructive deep-merge install. It runs fully offline and never executes hook or
plugin code.

`0.0.2-alpha` closes the CLI-ergonomics gaps from 0.0.1 and adds four capabilities that
round out the loop: **`rollback`** (reversible installs), **`new` + named templates**
(scaffold a project from a profile), **output redirection** (`--out` / `--into`), and
**live drift** (`cprof diff <profile>` vs the current machine). Plus a standalone
**`cprof scan`** leak gate and **shell completions**.

The version is bumped to `0.0.2-alpha.0` on `dev` and promoted to `main` via the
`dev → main` release PR (#17). It is published to npm by `pnpm release:alpha` from `main`
(see §8) — at the time of writing, the promotion is open and not yet published.

---

## 2. What shipped in 0.0.2-alpha

All merged into `dev` via their own PRs, then promoted to `main` as one release:

| Area                  | What                                                                            | PR        |
| --------------------- | ------------------------------------------------------------------------------- | --------- |
| CLI standards         | Standalone `cprof scan`, shell `completion`, per-command help, `--json`, `--quiet` | #9, #10   |
| Reversible installs   | `cprof rollback [--undo]` + install **ledger v2**                               | #11       |
| Output redirection    | `init --out <dir>`, `install --into <dir>`, `init/refresh --no-gitignore`/`--no-report` | #12       |
| Scaffolding           | `cprof new <profile> [dir]` — clean-copy a project from a profile               | #13       |
| Named templates       | `cprof new <name>` / `--list` + `init --template <name>` producer               | #14       |
| Live drift            | `cprof diff <profile>` — re-scan the machine and diff against a saved profile   | #15       |
| Docs + community      | Docusaurus Mermaid, four task guides, community-health files                    | #16       |
| Fix                   | `.gitattributes` forces LF — closes the 0.0.1 Windows-CI `prettier --check` gap | —         |

Detail worth carrying forward:

- **CLI standards (#9/#10):** every command now has its own `--help` (`cprof init --help`
  shows _init's_ usage; `cprof help <cmd>` is the same), `--json` everywhere,
  `--quiet`/`-q`, and `cprof completion bash|zsh|fish`. `cprof scan <file...>` exposes the
  existing leak-check engine as a standalone gate (use it in pre-commit / CI like
  gitleaks). These two PRs are **missing from the generated CHANGELOG** — see §8.
- **`rollback` (#11):** restores the `.cprof-backups/<timestamp>/` that install already
  wrote, trashes files the install created, and is guarded by a change-check (refuses if
  the live files drifted since the install). `--undo` redoes. This makes a mutating merge
  safe to try.
- **`new` + templates (#13/#14):** `cprof new <profile> [dir]` clean-copies a project from
  a profile and **refuses to overwrite** a populated target; `--force` reuses install's
  backup so the overwrite is itself reversible via `rollback` (zero core change — that was
  a deliberate design pivot). `cprof new <name>` resolves a **named template** from
  `~/.cprof/templates/<name>/`; `cprof new --list` lists them. Templates are **never
  auto-created** — the only producer is the explicit `init --template <name>`.
- **Output redirection (#12):** `init --out` and `install --into` move the _write target_
  without moving the _source_; `--global` content still targets `~/.claude`. `--no-gitignore`
  / `--no-report` drop the helper files (never the leak-check — that always runs).
- **Live drift (#15):** the one-arg `cprof diff <profile>` re-scans the current machine
  using the profile's own scope/metadata (refresh-style, so no name/version noise) and
  diffs the saved profile against that live snapshot. Framed as **drift** (`+` added on the
  machine, `-` removed, `~` changed); exits `0` either way. The two-arg file-vs-file form is
  unchanged.

---

## 3. Capabilities (current surface)

Eleven commands. Global flags: `-h`/`--help`, `-v`/`--version`. Per-command `--help`,
`--json`, and `--quiet`/`-q` are available throughout.

| Command                                                       | What it does                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `cprof init [--global \| --include-global] [--out <dir>] [--template <name>] [--no-gitignore] [--no-report]` | Snapshot the current setup into a profile bundle                        |
| `cprof refresh [--no-gitignore] [--no-report]`                | Rebuild the profile from its recorded source scope                      |
| `cprof install <file> [--dry-run] [--force] [--into <dir>] [--global \| --include-global]` | Apply a trusted profile (deep merge; backs up first; ledger-recorded)   |
| `cprof new <profile\|name> [dir] [--force]` · `cprof new --list` | Scaffold a project from a profile or named template                     |
| `cprof rollback [--undo] [--force] [--global]`                | Undo (or redo with `--undo`) the last install                           |
| `cprof validate <file>`                                       | Validate a profile against the schema                                   |
| `cprof diff <profile>` · `cprof diff <a.json> <b.json>`       | Drift vs the live machine, or compare two profile files                 |
| `cprof scan <file...>`                                        | Standalone secret leak gate (the install/init gate, exposed)            |
| `cprof profiles list`                                         | List profiles recorded by local installs                                |
| `cprof completion <bash\|zsh\|fish>`                          | Print a shell completion script                                         |
| `cprof help [command]`                                        | Show help for a command                                                 |

Exit codes: `0` ok · `1` usage/flag error · `2` file not found · `3` redaction left a
secret (nothing written).

---

## 4. Architecture

pnpm + TypeScript monorepo, Node 22+, corepack-pinned `pnpm@10.14.0`. Layout, packages,
and the `@cprof/core` module map are unchanged from the 0.0.1 handover §4. Two things to
know for 0.0.2:

- **The CLI is registry-driven.** `packages/cli/src/registry.ts` holds a `COMMANDS` array
  that is the single source of truth for dispatch, the overview `--help`, per-command
  usage, and `completion`. **Adding a command = one registry row + `commands/<name>.ts` +
  a test** (the `registry.test.ts` "lists every supported command" test enforces the set,
  order-sensitively).
- **The install ledger is v2** (`.cprof-state.json`): it records enough to drive
  `rollback` (backup location, files created vs replaced, the change-guard baseline), and
  is still what `profiles list` reads.

**Data model** (`claude-profile.json` manifest + asset bundle) is unchanged. Note the
profile is a **multi-file bundle** — a manifest plus asset files referenced by relative
`source` and hashed — _not_ a single file. (The 0.0.1 README's "single, portable file"
wording was corrected in #16.) This is the constraint behind the deferred streaming work
in §10.

---

## 5. Direction & history — the "why"

**The local-first wedge holds** (decision of 2026-06-20, see 0.0.1 handover §5): snapshot
+ redact + diff + migrate, fully offline, no remote/registry/policy/cloud. Anthropic's
export/import-profile request (#44659) remains closed "not planned", so the wedge is still
durable and unserved.

**0.0.2-alpha in one line:** it spends the release closing _ergonomic_ and _safety_ gaps
rather than expanding scope — per-command help and completions (table stakes), a
standalone leak gate, reversible installs (`rollback`), an onboarding path
(`new` + templates), and the first real migration preview (live drift). Everything stayed
100% local-first; no back-half code returned.

Wave history through 0.0.1 (path-traversal hardening, the redaction moat, read-modify-merge
install, remote-MCP capture, removal of the back half) is in the 0.0.1 handover §5.

---

## 6. Redaction — the moat

Unchanged from 0.0.1 handover §6 — three offline layers (secretlint provider keys →
sensitive key-names → JWT/high-entropy), `${env:NAME}` placeholders, and an independent
`leak-check` re-scan that **refuses to write and exits `3`** on a detected secret. The
same limits apply (best-effort, then verified; not "provably secret-free").

New in 0.0.2: that re-scan engine is now also a **standalone command**, `cprof scan
<file...>`, so users and CI can gate any config with the exact gate `init`/`install` use.

---

## 7. Install / migrate / rollback model

Install behaviour is unchanged from 0.0.1 handover §7 (deep-merge, profile wins on a
direct collision, permission lists unioned, assets written only if absent unless
`--force`, every replaced file backed up to `.cprof-backups/<timestamp>/`, missing
required `${env:NAME}` fails before any write).

New in 0.0.2 — **`rollback`** closes the loop the backups were always implying:

- `cprof rollback` restores the most recent install from its backup directory and trashes
  the files that install created, using ledger v2 to know which was which.
- A **change-guard** refuses to roll back if the live files have drifted since the install
  (so you don't clobber edits made after applying), overridable with `--force`.
- `cprof rollback --undo` redoes the install you just rolled back.
- `cprof new --force` routes its overwrite through the same backup, so scaffolding over a
  populated directory is reversible too.

---

## 8. Release & ops — gotchas (read before publishing)

Everything in the 0.0.1 handover §8 still applies (the `@cprof` npm org, the scoped-name
requirement, `--tag alpha` is mandatory because pnpm ignores `publishConfig.tag`, the
partial-publish recovery via `--filter <pkg> publish`, `pnpm clean` before build). New or
changed for 0.0.2:

- **The CHANGELOG generator silently skips non-conventional squash-merge subjects.** PRs
  **#9 (CLI-standards polish + `cprof scan`)** and **#10 (polish follow-ups)** merged with
  subjects that don't start with `feat:`/`fix:`/`docs:`, so they are **absent from the
  0.0.2 CHANGELOG section** — which under-credits `scan`, completions, per-command help,
  `--json`, and `--quiet`. Fix going forward: **squash-merge with a Conventional-Commit
  subject.** To correct 0.0.2, hand-add those two lines to the `## 0.0.2-alpha.0` section
  before publishing.
- **The Windows-CI `.gitattributes` (`* text=auto eol=lf`) fix is merged** (it was pending
  in the 0.0.1 handover §8/§9). `prettier --check` no longer trips on CRLF.
- **Release runbook used for 0.0.2** (repeat for the next): bump the **five** publishable
  `package.json` versions (cli, core, schema, testing, root — _not_ `website`, which stays
  `0.0.0` private), `corepack pnpm changelog`, `corepack pnpm format:write`, full
  `corepack pnpm verify` (green), commit `chore(release): <version>` on `dev`, open the
  `dev → main` promotion PR, then from `main`: `corepack pnpm release:alpha` (verify →
  publish `--tag alpha` → tag → push). `pnpm release:dry` previews.
- **Docs site:** Mermaid is enabled (`markdown.mermaid: true` + `@docusaurus/theme-mermaid`
  in `themes`); plain `.md` is parsed as CommonMark (`markdown.format: "detect"`), so
  diagrams go in fenced ` ```mermaid ` blocks and `:::` admonitions still need `.mdx`.
  `docs.yml` redeploys Pages on push to `main`.

---

## 9. Known limitations / gaps

The 0.0.1 gaps for **rollback**, **live drift**, and **CLI ergonomics** are now closed.
What remains:

- **No streaming / single-artifact bundle.** A profile is a multi-file bundle, so there's
  no `cprof init | ssh … cprof install -` piping yet — that needs an archive format and is
  deferred to its own spec (§10). This is the top remaining structural gap.
- **Redaction is best-effort** (see §6 / 0.0.1 §6 limits) — unchanged.
- **No `--no-color` / `NO_COLOR`.** Intentionally deferred and currently moot: the CLI
  emits no color, so there's nothing to suppress. Revisit if/when color is added.
- **No selective install** (`--only` / `--exclude` by type), **no `cprof status`**, **no
  `cprof doctor`** — all on the roadmap.
- **Templates are local-only** (`~/.cprof/templates`) with no sharing/registry — by design
  (sharing is off the wedge).

---

## 10. Future directions / roadmap

Still **all local-first** — no remote fetch, registry, or cloud sync. Reordered for 0.0.3+
now that the 0.0.2 items have landed:

1. **Streaming / single-artifact bundle** _(top item)_ — an archive format that packs the
   manifest + assets into one stream so `init`/`install` can pipe over stdin/stdout (the
   "single file" mental model users expect). Needs its own spec; it's the structural
   prerequisite for remote-less machine-to-machine piping.
2. **Selective install** — `--only mcp,memory` / `--exclude skills` (chezmoi-style
   include/exclude by type).
3. **`cprof status`** — live `~/.claude`-vs-profile drift, git-status-style. Live drift
   (#15) seeds the comparison engine; `status` is the persistent, scoped surface on top.
4. **`cprof doctor`** — fresh-machine readiness (Claude Code present? `~/.claude` writable?
   MCP runtimes on PATH? schema valid?).
5. **Optional gitleaks second-opinion** on the redacted output (offline, skip-if-absent) —
   different engine catches what secretlint misses.
6. **Redaction denylist/allowlist + `# cprof:allow` pragma** — force-redact by key/regex;
   suppress known example values.

**Later / handle carefully:** encryption ("carry the real secret, encrypted") — opposite
philosophy from redaction; if ever pursued, **wrap `age`/`sops`, don't write crypto**, and
keep redaction the default. Narrow machine-specific templating (prompt-on-install for known
machine-specific fields), _not_ a full template engine. Config/settings **overlays** are
parked.

**Avoid (off the wedge):** remote `init <url>`, registry discovery, cloud sync — they
re-introduce the back half removed in Wave 4.

---

## 11. Develop & contribute

```bash
corepack pnpm install
corepack pnpm build      # build all packages
corepack pnpm test       # full test suite
corepack pnpm lint       # tsc -b
corepack pnpm format     # prettier --check
corepack pnpm verify     # clean + build + test + lint + format (release gate)
```

Per-package tests: `corepack pnpm --filter @cprof/cli test`. **Adding a command** = a
`COMMANDS` row in `packages/cli/src/registry.ts` + `commands/<name>.ts` + a test (keep
`registry.test.ts`'s command list in sync — it's order-sensitive). Run
`corepack pnpm format:write` before the final verify.

Docs site: `corepack pnpm --filter @cprof/docs start`. Author docs as plain `.md`
(CommonMark via `markdown.format: 'detect'`); use fenced ` ```mermaid ` for diagrams;
reserve `.mdx` for pages needing `:::` admonitions. Conventional commits feed
`CHANGELOG.md` — **and squash-merge subjects must use a Conventional-Commit prefix or they
vanish from the changelog** (see §8).

Contributor docs now exist: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
(private vulnerability reporting), `.github/PULL_REQUEST_TEMPLATE.md`,
`.github/ISSUE_TEMPLATE/`, `.github/CODEOWNERS`. PRs target **`dev`**; `main` only ever
receives a `dev → main` promotion.

## 12. Pointers

- **npm:** [@cprof/cli](https://www.npmjs.com/package/@cprof/cli) ·
  [@cprof/core](https://www.npmjs.com/package/@cprof/core) ·
  [@cprof/schema](https://www.npmjs.com/package/@cprof/schema)
- **Repo:** https://github.com/Vedant1202/claude-prof · **docs site:**
  https://vedant1202.github.io/claude-prof/
- **Docs source:** `website/` · adopter guides in `website/docs/guides/`
  (`scaffold`, `rollback`, `drift`, `output-locations`, `migrate`, `scanning`)
- **Schema:** `packages/schema/src/schema.json` (`$id` `https://cprof.dev/schema/v1.json`)
- **CLI dispatch:** `packages/cli/src/registry.ts` (the `COMMANDS` source of truth)
- **Engineering notes:** `docs/phase-1.md`, `docs/phase-2.md`, `docs/phase-5.md`,
  `docs/cprofignore.md`; **0.0.1 handover:** `docs/handover-0.0.1-alpha.md`
- **Release runbook:** §8 above + `scripts/release.mjs`, `scripts/changelog.mjs`
