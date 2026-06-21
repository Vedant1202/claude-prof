---
title: Scanning files in CI
description: Use cprof scan as a pre-commit hook or GitHub Action to gate secrets.
---

# Scanning files in CI

`cprof scan` reads one or more files and exits non-zero if it finds a secret,
using the same detection layers as redaction. Because it is just a file gate, you
can run it anywhere — locally, in a pre-commit hook, or in CI.

```bash
cprof scan claude-profile.json
cprof scan src/config/*.json     # the shell expands the glob
```

Exit codes: `0` clean, `3` a secret was found, `2` a file is missing, `1` usage.
Add `--json` for machine-readable findings, or `--quiet` to rely on the exit code
alone.

> Detection is best-effort and shares redaction's limits: it will **not** catch
> low-entropy secrets stored under non-sensitive key names. Treat `cprof scan` as
> a safety net, not a guarantee — and never as a reason to skip reviewing a
> profile before sharing it.

## Pre-commit hook

Add a local hook to `.pre-commit-config.yaml`. `pre-commit` passes the staged
files that match `files:` as arguments to `cprof scan`; a finding (exit `3`)
blocks the commit.

```yaml
repos:
  - repo: local
    hooks:
      - id: cprof-scan
        name: cprof scan
        entry: cprof scan
        language: system
        files: \.(json|md)$
```

This assumes `cprof` is on `PATH` (`npm i -g @cprof/cli@alpha`).

## GitHub Action

Run the gate on every push and pull request. A non-zero exit fails the job.

```yaml
name: secret-scan
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx @cprof/cli@alpha scan claude-profile.json
```

To scan more than one file, pass them all in a single invocation:

```bash
npx @cprof/cli@alpha scan claude-profile.json .mcp.json
```
