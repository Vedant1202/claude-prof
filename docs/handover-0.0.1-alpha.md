# cprof — 0.0.1-alpha handover

_Last updated: 2026-06-21._

A maintainer-facing snapshot of where cprof stands at its first alpha release: what
shipped, how it's built, the decisions and ops gotchas that aren't obvious from the
code, and where to take it next. Read this to pick the project up cold.

---

## 1. TL;DR

cprof is a **local-first CLI that snapshots a Claude Code setup into a portable,
secret-redacted `claude-profile.json`, then migrates it to another machine** via a
non-destructive deep-merge install. It runs fully offline and never executes hook
or plugin code.

`0.0.1-alpha` is published to npm (2026-06-21). The product is functional for the
snapshot → scrub → migrate loop; it is alpha (the profile format may change, and
redaction is best-effort).

---

## 2. What shipped in 0.0.1-alpha

Published to npm under the **`@cprof` org** (npm owner: `veyydant`):

| Package          | Role                                                            | Published                  |
| ---------------- | --------------------------------------------------------------- | -------------------------- |
| `@cprof/cli`     | The CLI. Binary is **`cprof`**. `npm i -g @cprof/cli@alpha`     | ✅ public                  |
| `@cprof/core`    | Engine: scan, redact, manifest, bundle, validate, install, diff | ✅ public                  |
| `@cprof/schema`  | The `claude-profile.json` JSON Schema + TypeScript types        | ✅ public                  |
| `@cprof/testing` | Fixtures + test helpers                                         | 🔒 private (not published) |

- **Repo:** https://github.com/Vedant1202/claude-prof · tag `v0.0.1-alpha.0`
- **Docs site:** https://vedant1202.github.io/claude-prof/ (Docusaurus, auto-deployed)
- **Install for users:** `npm i -g @cprof/cli@alpha`, then run `cprof`.

---

## 3. Capabilities (current surface)

Commands: `init`, `refresh`, `install`, `validate`, `diff`, `profiles list`.
Global flags: `-h`/`--help`, `-v`/`--version`.

| Command                                                                     | What it does                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `cprof init [--global \| --include-global]`                                 | Snapshot current setup → `claude-profile.json` (+ scan report + `.gitignore`) |
| `cprof refresh`                                                             | Rebuild the profile in place from its recorded scope                          |
| `cprof install <file> [--dry-run] [--force] [--global \| --include-global]` | Apply a trusted profile (deep merge; backs up first)                          |
| `cprof validate [--json] <file>`                                            | Validate a profile against the schema                                         |
| `cprof diff [--json] <a> <b>`                                               | Compare two profiles semantically (file-vs-file)                              |
| `cprof profiles list [--global] [--json]`                                   | List profiles recorded by local installs                                      |

Exit codes: `0` ok · `1` usage/flag error · `2` file not found · `3` redaction left
a secret (nothing written).

---

## 4. Architecture

pnpm + TypeScript monorepo, Node 22+, corepack-pinned `pnpm@10.14.0`.

```
packages/
  schema/   @cprof/schema — claude-profile.json JSON Schema ($id v1) + types
  core/     @cprof/core   — all the logic (below)
  cli/      @cprof/cli    — arg dispatch (src/index.ts) + commands/*
  testing/  @cprof/testing— fixtures + helpers (private)
website/    @cprof/docs   — the Docusaurus docs site (private)
scripts/    release.mjs, changelog.mjs, clean.mjs
```

Key `@cprof/core` modules: `scanner` + `scanner-config` (walk the Claude config),
`redactor` + `detector` (secretlint) (scrub secrets), `leak-check` (re-scan before
write), `manifest` + `bundler` (assemble the profile + assets), `validate` (ajv),
`merge` + `install` + `install-plan` (deep-merge apply), `state` (the install
ledger), `diff`, `report` (scan report).

**Data model — `claude-profile.json`** top-level sections: `name`/`version`/
`description` (user-owned), `profileScope`/`includesGlobal`, `sources`, `settings`,
`memory`, `rules`, `skills`, `commands`, `agents`, `mcpServers` (local `command` or
remote `url`), `hooks`/`plugins` (inventory only), `secrets` (`required`/`optional`
`${env:NAME}` placeholders). Asset files are referenced by `source` and hashed
(`sha256:…`).

---

## 5. Direction & history — the "why"

**Decision (2026-06-20): the local-first wedge.** Focus on snapshot + secret
redaction + diff + migration — the "export my real setup, scrubbed" flow. Freeze
and remove the "back half" (remote install, registry discovery, team policy,
outdated checks).

**Why:** Claude Code's official plugin marketplace flows _inward_ (install
pre-authored components). cprof flows _outward_ (snapshot + scrub your own setup and
move it). They're complementary, and the registry/remote/policy space is a losing
battle against first-party tooling. Anthropic closed the export/import-profile
request (#44659) as "not planned" (re-confirmed 2026-06-21), so the snapshot+scrub
wedge is durable and unserved.

**Wave history (all merged to `main`):**

- **Wave 0** — hardening: install path-traversal containment, MCP `mcpServers`
  merge (stop whole-file overwrite of `~/.claude.json`), CI/license/engines hygiene.
- **Wave 1 — the moat:** redaction via **secretlint** (Layer A) + camelCase-aware
  key-name heuristic (B) + precision-tuned entropy/JWT (C); leak-check the manifest
  before write. Stopped claiming "secret-free" unqualified.
- **Wave 2** — read-modify-merge install (trustworthy migration into a populated
  machine) via `merge.ts`.
- **Wave 3** — remote MCP (http/sse/ws) capture: schema `mcpServer` `oneOf`
  (command XOR url); `${VAR}` preservation; URL-query secret redaction.
- **Wave 4** — removed the back half (`remote.ts`, registry, policy, profile
  update checks; −2249 LOC) to fully commit to local-first.

---

## 6. Redaction — the moat

Runs offline, in three layers; a flagged value becomes `${env:NAME}` (added to
`secrets.required`):

1. **Provider keys** — [secretlint](https://github.com/secretlint/secretlint)'s
   recommended ruleset (GitHub, Anthropic, OpenAI, Slack, Stripe, GCP, …).
2. **Sensitive key names** — `apiKey`, `token`, `password`, `secret`, `credential`,
   `authorization`; camelCase and `UPPER_SNAKE` both recognized.
3. **JWTs + high-entropy** — length ≥ 32, mixed character classes, high Shannon
   entropy.

`${VAR}` references are preserved; URL query secrets are rewritten in place. Before
`init`/`refresh` writes anything, an **independent re-scan** (`leak-check`) runs over
the generated profile + bundled files; on a detected leak it **refuses to write and
exits `3`**.

**Limits (document these, never hide them):** low-entropy secrets under
non-sensitive keys; bare AWS access-key IDs (`AKIA…`) (the AWS _secret_ key **is**
caught); anything below entropy thresholds; URLs/paths/hashes/UUIDs are skipped to
avoid false positives. Best-effort, then verified — not "provably secret-free."
Treat redaction as the product's highest-bar feature.

---

## 7. Install / migrate model

`install` deep-merges into the live setup: existing keys preserved, plain objects
merge recursively, **profile wins on a direct collision**, permission lists
(`allow`/`deny`/`ask`) are unioned. Asset files (skills/commands/agents/memory/
rules) are written only if absent unless `--force`. Every replaced file is backed up
to **`.cprof-backups/<timestamp>/`** first. Each install is recorded in the ledger
**`.cprof-state.json`** (read by `profiles list`). Missing required `${env:NAME}`
secrets fail the install **before** any write. Hooks and plugins are inventory only.

---

## 8. Release & ops — gotchas (read before publishing)

- **npm org:** packages live under the **`cprof`** org (free; created at
  npmjs.com/org/create). Owner npm user: `veyydant`.
- **Naming is constrained by npm's similarity filter.** The bare `cprof` and
  `claude-profile` were **both rejected** (the filter is separator-blind: `cprof` ≈
  `cpr`/`cron`, `claude-profile` ≈ `claudeprofile`). **Scoped `@cprof/*` names are
  exempt** — that is why the CLI is `@cprof/cli`, not an unscoped name.
- **Publish from `main`:** `corepack pnpm -r publish --tag alpha`. pnpm does **not**
  honor `publishConfig.tag`, so `--tag alpha` is **required** to keep prereleases off
  the `latest` dist-tag. Helper: **`pnpm release:alpha`** (pre-flight → verify →
  publish → tag → push) and **`pnpm release:dry`**.
- **`pnpm -r publish` is fragile to partial publishes.** Registry read-lag makes it
  retry an already-published package and 403 ("cannot publish over previously
  published"). To finish a partial release, publish one at a time:
  `corepack pnpm --filter <pkg> publish --tag alpha --no-git-checks`.
- **First publish of a package sets `latest` too**, regardless of `--tag alpha`
  (npm requires a `latest`). Expected; later stable releases take over `latest`.
- **`pnpm clean` before build** (it's in `verify`) — `tsc` leaves orphaned `dist`
  files from deleted sources, and `files: ["dist"]` would ship the dead Wave-4 code
  otherwise.
- **CI:** `.github/workflows/ci.yml` (build/test/lint/format × {ubuntu, macos,
  windows} × node {22, 24}); `docs.yml` builds + deploys the docs to GitHub Pages on
  push to `main`. **Windows CI needs `.gitattributes` (`* text=auto eol=lf`)** or
  `prettier --check` fails on CRLF (fix is on branch `docs-followups`, pending merge).
- **Helper scripts:** `scripts/{release,changelog,clean}.mjs`; `CHANGELOG.md` is
  generated from conventional commits (`pnpm changelog`).

---

## 9. Known limitations / gaps

- Redaction is best-effort (see §6 limits).
- No live drift detection — `diff` is file-vs-file only, not profile-vs-installed.
- No rollback command (backups _exist_ under `.cprof-backups/` but there's no
  restore command yet).
- CLI ergonomics gaps: no per-subcommand help, no shell completions, `--json` only on
  some commands, no `NO_COLOR`/`--quiet` handling.
- Windows CI `.gitattributes` fix pending merge.

---

## 10. Future directions / roadmap

Grounded in research (2026-06) across modern CLI standards
([clig.dev](https://clig.dev)), dotfiles/config managers
([chezmoi](https://www.chezmoi.io)), and secret-in-config tooling (secretlint,
[gitleaks](https://github.com/gitleaks/gitleaks), [sops](https://getsops.io)).
**Everything below stays local-first** — no remote fetch, registry, or cloud sync.

### Recommended for 0.0.2-alpha (focused, high-ROI, mostly on existing infra)

1. **CLI-standards polish bundle** (clig.dev table-stakes):
   - Per-subcommand help (`cprof init --help` shows _init's_ usage, not global).
   - `--json` on every command (uniform machine-readable output).
   - Stream/color hygiene: data→stdout, logs→stderr, honor `NO_COLOR`/`--no-color`,
     add `--quiet`; auto-disable color off-TTY.
   - `cprof completion bash|zsh|fish` (de-facto standard).
2. **`cprof scan <file>`** — expose the existing leak-check engine as a standalone
   command so users/CI can gate any config (like gitleaks/detect-secrets); ship a
   pre-commit + GitHub Action recipe. _Quick win; reinforces the moat._
3. **`cprof rollback`** — restore from the `.cprof-backups/` that install already
   writes. Even chezmoi has no built-in rollback — a category gap cprof can fill
   cheaply, with high safety value for a merge that mutates live files.

### 0.0.3+ (bigger, still on-direction)

- **`cprof status`** — live `~/.claude`-vs-profile drift, git-status-style (chezmoi's
  most translatable concept; deserves its own milestone).
- **Live-system `diff`** — profile vs what's installed (the real migration preview).
- **Selective install** — `--only mcp,memory` / `--exclude skills` (chezmoi-style
  include/exclude by type).
- **Optional gitleaks second-opinion** on the redacted output — scanners have low
  cross-overlap, so a different engine catches what secretlint misses; keep it
  offline + skip-if-absent. (This was the old deferred "D6".)
- **Redaction denylist/allowlist + `# cprof:allow` pragma** — force-redact by
  key/regex; suppress known example values (universal pattern across the scanners).
- **`cprof doctor`** — fresh-machine readiness (Claude Code present? `~/.claude`
  writable? MCP runtimes on PATH? schema valid?).

### Later / handle carefully

- **Encryption ("carry the real secret, encrypted")** — the _opposite_ philosophy
  from redaction, and key management is the hard, risky part. If ever pursued:
  **wrap `age`/`sops`, don't write crypto**; model on dotenvx/SOPS public-key design
  (not the deprecated dotenv-vault); keep **redaction the default**.
- **Narrow machine-specific templating** — prompt-on-install for known
  machine-specific fields (e.g. absolute paths in MCP args), _not_ a full template
  engine.

### Avoid (off the wedge)

Remote `init <url>`, registry discovery, cloud sync — all re-introduce the back half
removed in Wave 4 and put cprof back into competition with first-party tooling.

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

Docs site: `corepack pnpm --filter @cprof/docs start`. Author docs as plain `.md`
(CommonMark via `markdown.format: 'detect'`) so `${env:NAME}`/`<file>` render
literally; reserve `.mdx` for pages needing `:::` admonitions. Conventional commits
feed `CHANGELOG.md`.

## 12. Pointers

- **npm:** [@cprof/cli](https://www.npmjs.com/package/@cprof/cli) ·
  [@cprof/core](https://www.npmjs.com/package/@cprof/core) ·
  [@cprof/schema](https://www.npmjs.com/package/@cprof/schema)
- **Docs site source:** `website/` · **adopter docs:** `website/docs/`
- **Schema:** `packages/schema/src/schema.json` (`$id` `https://cprof.dev/schema/v1.json`)
- **Engineering notes:** `docs/phase-1.md` (snapshot+redaction), `docs/phase-2.md`
  (install), `docs/phase-5.md` (ledger), `docs/cprofignore.md`
- **Release runbook:** §8 above + `scripts/release.mjs`

```

```
