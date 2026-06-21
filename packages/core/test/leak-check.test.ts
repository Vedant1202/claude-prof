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
});
