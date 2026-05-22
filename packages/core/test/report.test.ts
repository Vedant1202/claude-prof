import { describe, expect, it } from "vitest";

import { createProfileGitignore, createScanReport } from "../src/report.js";

describe("createProfileGitignore", () => {
  it("excludes Claude runtime cruft", () => {
    expect(createProfileGitignore()).toContain(".claude/.credentials.json");
    expect(createProfileGitignore()).toContain(".claude/transcripts/");
    expect(createProfileGitignore()).toContain(".claude/history.jsonl");
  });
});

describe("createScanReport", () => {
  it("summarizes detected items, redactions, skipped paths, and ignore patterns", () => {
    expect(
      createScanReport({
        detected: {
          skills: 2,
          commands: 1,
        },
        redactions: [
          {
            path: "/mcpServers/github/env/GITHUB_TOKEN",
            envName: "GITHUB_TOKEN",
            reason: "key-name",
          },
        ],
        skipped: [
          {
            path: "/tmp/project/.claude/cache",
            relativePath: ".claude/cache",
            reason: "never-read",
          },
        ],
        ignoredPatterns: ["CLAUDE.local.md"],
      }),
    ).toBe(`cprof scan report

Detected:
- commands: 1
- skills: 2

Redactions: 1
- /mcpServers/github/env/GITHUB_TOKEN: key-name -> GITHUB_TOKEN

Skipped paths: 1
- .claude/cache: never-read

Ignored patterns: 1
- CLAUDE.local.md
`);
  });

  it("does not include raw secret values", () => {
    const report = createScanReport({
      detected: {},
      redactions: [
        {
          path: "/settings/env/API_KEY",
          envName: "API_KEY",
          reason: "known-pattern",
        },
      ],
    });

    expect(report).not.toContain("sk-");
    expect(report).not.toContain("ghp_");
  });
});
