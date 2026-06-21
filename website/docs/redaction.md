---
title: Redaction & secret safety
description: How cprof redacts secrets into ${env:NAME} placeholders, the re-scan that guards every write, and the limits you need to know.
---

# Redaction & secret safety

When cprof snapshots your setup it tries to replace every secret with an
`${env:NAME}` placeholder, so the resulting `claude-profile.json` is safe to move.
Redaction runs fully offline, in three layers.

> **Redaction is best-effort.** It catches the common, well-shaped secrets — not
> everything. Always read a generated profile before you share it.

## How it works

A value is redacted if any layer flags it:

1. **Provider keys** — every value is checked by
   [secretlint](https://github.com/secretlint/secretlint)'s recommended ruleset
   (GitHub, Anthropic, OpenAI, Slack, Stripe, GCP, and many more), in-process and
   offline.
2. **Sensitive key names** — values under keys like `apiKey`, `token`, `password`,
   `secret`, `credential`, or `authorization`. Both camelCase and
   `UPPER_SNAKE_CASE` are recognized (`dbPassword`, `AWS_SECRET_ACCESS_KEY`).
3. **JWTs and high-entropy values** — JSON Web Tokens, plus long random-looking
   strings (length ≥ 32, mixed character classes, high Shannon entropy).

Each flagged value becomes `${env:NAME}`, where `NAME` is derived from its key, and
is added to the profile's `secrets.required` list.

### Existing `${VAR}` references are preserved

If a value already uses shell-style expansion — `${API_KEY}`, or
`Bearer ${TOKEN}` — cprof leaves it intact. Those are references, not raw secrets,
so they survive the snapshot unchanged.

### Secrets inside URLs

Within a URL, query parameters such as `token`, `access_token`, `api_key`, `key`,
`secret`, or `password` are rewritten in place — `https://host/path?token=abc123`
becomes `https://host/path?token=${env:TOKEN}` — while the host and path are kept.

## The re-scan that guards every write

Redaction alone isn't trusted. Before `init` or `refresh` writes anything, cprof
**re-scans the generated profile and every bundled file with an independent
engine**. If that scan finds a secret that slipped through, cprof **refuses to
write and exits with code `3`** rather than emit a leaky profile.

## Limits — what cprof does _not_ catch

These are the cases redaction will miss. Read every profile with them in mind:

- **Low-entropy secrets under ordinary keys.** A short password or token stored
  under a non-sensitive key (say `note` or `value`) won't trip any layer.
- **Bare AWS access-key IDs** (`AKIA…`). These are treated as identifiers, not
  credentials, so they're left as-is. (The AWS _secret_ access key **is** caught.)
- **Anything below the entropy thresholds**, plus values that look like URLs, file
  paths, content hashes (`sha256:…`), or UUIDs — deliberately skipped to avoid
  false positives.

Reports and diffs never print raw secret values — only the path and the chosen
placeholder name. But the guarantee is "best-effort, then verified," not "provably
secret-free." When in doubt, treat a profile like source code: review it before it
leaves your machine, and use [`.cprofignore`](./reference/cprofignore.md) to
exclude anything cprof should never read.
