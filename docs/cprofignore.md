# `.cprofignore`

`.cprofignore` tells `cprof` which project files and paths must not be touched.

The syntax is gitignore-style:

```gitignore
CLAUDE.local.md
.claude/private/
*.local.json
```

Ignored paths are skipped before file contents are opened. This is a safety boundary, not just an output filter.

## Built-In Never-Read Paths

These paths are skipped even without `.cprofignore`:

```gitignore
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

## Recommended Use

Use `.cprofignore` for local notes, scratch files, experimental hooks, private commands, and anything that should never appear in a backup profile.

For example:

```gitignore
CLAUDE.local.md
.claude/settings.local.json
.claude/hooks/private/
.claude/commands/private/
```

If a path is ignored, `cprof` should report that it was skipped by pattern without reading or printing its contents.
