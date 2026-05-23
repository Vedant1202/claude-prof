# Phase 3: Remote Profile References

Phase 3 lets `cprof install` accept remote profile references. It is still
conservative: the remote artifact is validated as a normal `claude-profile.json`
and then applied through the Phase 2 installer.

## Supported References

Install from a direct HTTPS profile URL:

```bash
cprof install https://example.com/claude-profile.json --dry-run
cprof install https://example.com/claude-profile.json
```

Install from GitHub shorthand:

```bash
cprof install github:owner/repo --dry-run
cprof install github:owner/repo/path/to/claude-profile.json#v1.0.0
```

GitHub shorthand maps to:

```text
https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
```

Defaults:

- `path`: `claude-profile.json`
- `ref`: `main`

## Safety Model

Remote install uses the same Phase 2 rules:

- `--dry-run` previews writes before mutation.
- Existing files fail unless `--force` is passed.
- Overwrites create `.cprof-backups/<timestamp>/...`.
- `${env:NAME}` placeholders must be resolvable before writing.
- Hooks stay inventory-only.
- Plugins stay metadata-only; cprof does not fetch or execute plugin code.

Remote support fetches the profile JSON only. Profile asset files referenced by
the remote manifest are not fetched as a package in this phase; missing assets are
reported as skipped.

## Not In Phase 3

- Registry search or discovery
- Dependency upgrade management
- Signed publisher trust
- Remote package/archive asset download
- Plugin installation execution
- Hook execution or hook script installation
