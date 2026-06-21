# Phase 5: Installed State

cprof records local install provenance — a ledger of what was installed where. It
does not upgrade or mutate installed profiles.

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

## Not In Phase 5

- Automatic upgrades
- Rollback command
- Lockfiles
