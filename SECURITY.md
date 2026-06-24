# Security Policy

cprof captures, redacts, and migrates Claude Code configuration — including files that
can contain secrets — so its security matters.

## Supported versions

cprof is in **alpha**. Security fixes are made against the latest published
`@cprof/cli` alpha and the `dev` branch; older alphas are not maintained.

| Version        | Supported |
| -------------- | --------- |
| latest `alpha` | ✅        |
| older          | ❌        |

## Reporting a vulnerability

**Please report vulnerabilities privately — do not open a public issue.**

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/Vedant1202/claude-prof/security/advisories/new)
(the repository's _Security_ tab → _Report a vulnerability_).

Please include:

- A description of the issue and its impact.
- Steps to reproduce — a minimal profile or command, **with any real secrets scrubbed**.
- The cprof version (`cprof --version`), Node version, and OS.

You can expect an acknowledgement within a few days. This is a volunteer alpha, so
timelines are best-effort; we'll keep you updated and credit you in the fix unless you'd
prefer otherwise.

## In scope

- The redaction / secret-scanning engine — a secret that should have been redacted but
  reaches the written profile.
- The install path — traversal, writing outside the intended roots, or clobbering files
  without the documented backup.
- Anything that makes cprof execute untrusted code (it is designed never to run hook or
  plugin code).

## cprof's own security model

Know the limits before relying on it:

- **Redaction is best-effort, not a guarantee.** It catches provider keys, secret-like
  key names, JWTs, and high-entropy values, and re-scans the generated manifest before
  writing — but it will **not** catch low-entropy secrets stored under non-sensitive key
  names. See the [redaction docs](https://vedant1202.github.io/claude-prof/) for exactly
  what it does and doesn't catch. **Always review a profile before sharing it.**
- cprof runs fully offline and never executes hook or plugin code (recorded as inventory
  only).
- Use [`.cprofignore`](https://vedant1202.github.io/claude-prof/) to exclude paths you
  never want captured.
