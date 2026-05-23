# Phase 4: Registry Discovery

Phase 4 adds local registry discovery. A registry is a JSON index of profile
metadata that can be listed, searched, and inspected before choosing a profile
source to install.

Registry discovery does not install by itself. Use `cprof install <source>` after
reviewing a profile's source.

## Registry Format

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "team/base",
      "name": "Team Base",
      "description": "Shared team Claude Code baseline",
      "source": "github:team/base",
      "scope": "project",
      "tags": ["team", "typescript"],
      "author": "team",
      "updatedAt": "2026-05-23"
    }
  ]
}
```

Required fields per profile:

- `id`
- `name`
- `source`

Optional fields:

- `description`
- `scope`: `project`, `global`, or `mixed`
- `tags`
- `author`
- `updatedAt`

## Commands

List profiles:

```bash
cprof registry list registry.json
cprof registry list registry.json --json
```

Search profile metadata:

```bash
cprof registry search registry.json typescript
cprof registry search registry.json team --json
```

Show one profile:

```bash
cprof registry show registry.json team/base
cprof registry show registry.json team/base --json
```

## Safety Model

Registry commands are read-only. They do not fetch profile JSON, apply files,
install plugins, or execute hooks.

Phase 4 intentionally separates discovery from installation. After choosing a
profile, pass its `source` to Phase 3 install:

```bash
cprof install github:team/base --dry-run
```

## Not In Phase 4

- Hosted registry service
- Registry publishing
- Ratings or trust scores
- Signed registry indexes
- Installing directly by registry id
