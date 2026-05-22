import { describe, expect, it } from "vitest";

import { checkGeneratedOutputForLeaks } from "../src/leak-check.js";

describe("checkGeneratedOutputForLeaks", () => {
  it("passes safe generated output", () => {
    expect(
      checkGeneratedOutputForLeaks([
        {
          path: "claude-profile.json",
          contents: JSON.stringify({
            env: {
              GITHUB_TOKEN: "${env:GITHUB_TOKEN}",
            },
          }),
        },
      ]),
    ).toEqual({
      ok: true,
      leaks: [],
    });
  });

  it("fails when generated output contains a known secret pattern", () => {
    const result = checkGeneratedOutputForLeaks([
      {
        path: "claude-profile.json",
        contents:
          '{"token":"ghp_123456789012345678901234567890123456"}',
      },
    ]);

    expect(result).toEqual({
      ok: false,
      leaks: [
        {
          path: "claude-profile.json",
          tokenIndex: 0,
          reason: "known-pattern",
        },
      ],
    });
  });

  it("reports leak metadata without returning the leaked value", () => {
    const result = checkGeneratedOutputForLeaks([
      {
        path: "skills/example/SKILL.md",
        contents: "secret sk-1234567890abcdefghijklmnop",
      },
    ]);

    expect(JSON.stringify(result)).not.toContain("sk-1234567890");
  });
});
