# Phase 5: Installed State and Update Checks

Phase 5 records local install provenance and checks installed profiles against a
registry index. It does not upgrade or mutate installed profiles automatically.

## Installed State

Successful non-dry-run installs write an install ledger:

```text
.cprof-state.json
```

For global-only installs, the ledger is written under:

```text
~/.claude/.cprof-state.json
```

Dry-runs do not record state.

## Commands

List recorded project installs:

```bash
cprof profiles list
cprof profiles list --json
```

List recorded global installs:

```bash
cprof profiles list --global
```

Check installed profiles against a registry:

```bash
cprof profiles outdated registry.json
cprof profiles outdated registry.json --json
```

## Update Semantics

An installed profile is matched to a registry entry by `source`.

Status values:

- `up-to-date`: installed version equals registry version
- `update-available`: registry version differs from installed version
- `unknown`: no registry version is available for the matching source

This is a report-only phase. To update manually, inspect the registry entry, run
`cprof install <source> --dry-run`, then apply with the normal Phase 2/3 install
flow.

## Not In Phase 5

- Automatic upgrades
- Rollback command
- Lockfiles
- Semantic version ordering
- Changelog fetching
- Registry signature or trust policy
