---
title: Local-first
description: cprof produces files you own and carry yourself, runs fully offline, and never executes hook or plugin code.
---

# Local-first

cprof is deliberately **local-first**. A profile is just a file you produce, read,
and carry yourself — there's no account, no server, and no background sync.

## What that means

- **You own the artifact.** `cprof init` writes a `claude-profile.json` to your
  working directory. Where it goes next — another machine, a teammate, a private
  repo — is up to you.
- **It runs fully offline.** Scanning and redaction happen in-process; cprof makes
  no network calls.
- **It never executes your setup.** Hooks and plugins are recorded as _inventory
  only_ — their metadata is captured, but cprof never runs a hook command or
  re-fetches a plugin. Installing a profile copies files and merges config; it
  does not execute anything.

## Why it matters

Claude Code's own marketplace flows _inward_ — installing pre-authored components
onto your machine. cprof flows _outward_: it captures the setup you already have,
scrubs the secrets, and lets you move it. The two are complementary, and keeping
cprof local-first means a profile is always something you can open in a text
editor and inspect before you trust it.

> Because a profile can be edited by hand, treat any profile you didn't generate
> yourself as untrusted until you've read it — the same way you'd review a script
> before running it.
