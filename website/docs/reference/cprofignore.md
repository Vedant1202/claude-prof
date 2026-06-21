---
title: .cprofignore
description: Exclude paths cprof should never read, using gitignore-style rules.
---

# `.cprofignore`

A `.cprofignore` file tells cprof which paths it must **never read**. Ignored
paths are skipped _before their contents are ever opened_ — it's a safety
boundary, not just an output filter — and they're reported by pattern, without
cprof looking inside them.

## Syntax

Same as `.gitignore`, parsed with the standard
[`ignore`](https://www.npmjs.com/package/ignore) library:

```gitignore
# Comments start with #
secrets/
*.pem
config/local.*
```

Place `.cprofignore` at the root cprof scans. Blank lines and `#` comments are
ignored; an absent file means no extra rules.

## Built-in never-read paths

Even without a `.cprofignore`, cprof always skips these — they hold credentials or
volatile local state:

```text
.claude/.credentials.json
.claude/statsig/
.claude/cache/
.claude/backups/
.claude/file-history/
.claude/paste-cache/
.claude/shell-snapshots/
.claude/clipboard/
.claude/sessions/
.claude/transcripts/
.claude/history.jsonl
```

Add your own patterns for anything project-specific you never want captured —
local `.env` files, private keys, scratch data — as a second line of defense
alongside [redaction](../redaction.md).

> `cprof init` also writes a project `.gitignore` that keeps these same credential
> paths (plus `.env`, `node_modules/`, logs, and `.DS_Store`) out of version
> control. That's a separate artifact from `.cprofignore`.
