# Phase 6: Team Policy Enforcement

Phase 6 adds local team/org policy checks for `claude-profile.json`. The goal is
CI-friendly enforcement before a profile is shared, installed, or committed.

## Command

```bash
cprof policy check claude-profile.json policy.json
cprof policy check claude-profile.json policy.json --json
```

Exit codes:

- `0`: profile passes policy
- `1`: policy violation, invalid profile, or invalid policy
- `2`: profile or policy file not found

## Policy Format

```json
{
  "version": 1,
  "allowGlobal": false,
  "allowPrivate": false,
  "allowedSections": ["settings", "commands", "mcpServers"],
  "blockedSections": ["hooks", "plugins"],
  "requiredSections": ["settings"],
  "maxSecrets": 0
}
```

Fields:

- `allowGlobal`: when false, blocks global and mixed profiles.
- `allowPrivate`: when false, blocks any item marked `private: true`.
- `allowedSections`: if set, only these profile sections may be present.
- `blockedSections`: these sections may not be present.
- `requiredSections`: these sections must be present.
- `maxSecrets`: maximum allowed `secrets.required` count.

Sections:

- `settings`
- `memory`
- `rules`
- `plugins`
- `skills`
- `commands`
- `agents`
- `hooks`
- `mcpServers`

## CI Example

```bash
cprof validate claude-profile.json
cprof policy check claude-profile.json policy.json
```

## Not In Phase 6

- Hosted org accounts
- Remote policy sync
- Signed policy bundles
- Automatic remediation
- Installing team defaults
- Drift monitoring service
