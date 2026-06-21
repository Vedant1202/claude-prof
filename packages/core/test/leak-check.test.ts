import { describe, expect, it } from "vitest";

import { checkGeneratedOutputForLeaks } from "../src/leak-check.js";

describe("checkGeneratedOutputForLeaks", () => {
  it("passes safe generated output", async () => {
    const result = await checkGeneratedOutputForLeaks([
      {
        path: "claude-profile.json",
        contents: JSON.stringify({
          env: {
            GITHUB_TOKEN: "${env:GITHUB_TOKEN}",
          },
        }),
      },
    ]);

    expect(result).toEqual({ ok: true, leaks: [] });
  });

  it("fails when generated output contains a provider key", async () => {
    const result = await checkGeneratedOutputForLeaks([
      {
        path: "claude-profile.json",
        contents: '{"token":"ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"}',
      },
    ]);

    expect(result.ok).toBe(false);
    expect(
      result.leaks.some((leak) => leak.path === "claude-profile.json"),
    ).toBe(true);
  });

  it("reports leak metadata without returning the leaked value", async () => {
    const result = await checkGeneratedOutputForLeaks([
      {
        path: "skills/example/SKILL.md",
        contents: "token: ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
      },
    ]);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("ghp_a1B2c3");
  });

  it("reports the 1-based line and column of a token leak", async () => {
    const result = await checkGeneratedOutputForLeaks([
      {
        path: "skills/example/SKILL.md",
        contents:
          "line one is fine\nhere: ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8\n",
      },
    ]);

    expect(result.ok).toBe(false);
    const located = result.leaks.find((leak) => leak.line !== undefined);
    expect(located?.line).toBe(2);
    expect(located?.col).toBe(7);
  });

  it("reports correct positions for multiple leaks across lines", async () => {
    const result = await checkGeneratedOutputForLeaks([
      {
        path: "config.env",
        contents:
          "first line\n" +
          "a: ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8\n" +
          "third\n" +
          "bb: ghp_z9Y8x7W6v5U4t3S2r1Q0p9O8n7M6l5K4j3I2\n",
      },
    ]);

    const located = result.leaks
      .filter((leak) => leak.line !== undefined)
      .map((leak) => ({ line: leak.line, col: leak.col }))
      .sort((a, b) => a.line! - b.line!);

    expect(located).toEqual([
      { line: 2, col: 4 },
      { line: 4, col: 5 },
    ]);
  });
});
