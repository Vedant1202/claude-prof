import { describe, expect, it } from "vitest";

import { diffProfiles, formatProfileDiff } from "../src/diff.js";

describe("diffProfiles", () => {
  it("reports added, removed, and changed entries", () => {
    expect(
      diffProfiles(
        { commands: { deploy: { source: "./deploy.md" } }, version: "1.0.0" },
        { skills: { review: { source: "./review" } }, version: "1.0.1" },
      ).entries,
    ).toEqual([
      {
        kind: "removed",
        path: "/commands",
        before: { deploy: { source: "./deploy.md" } },
      },
      {
        kind: "added",
        path: "/skills",
        after: { review: { source: "./review" } },
      },
      { kind: "changed", path: "/version", before: "1.0.0", after: "1.0.1" },
    ]);
  });

  it("ignores object key order", () => {
    expect(diffProfiles({ a: 1, b: 2 }, { b: 2, a: 1 }).entries).toEqual([]);
  });

  it("redacts secret-looking changed values", () => {
    expect(
      diffProfiles(
        { env: { GITHUB_TOKEN: "ghp_123456789012345678901234567890123456" } },
        { env: { GITHUB_TOKEN: "ghp_abcdefabcdefabcdefabcdefabcdefabcdef" } },
      ).entries,
    ).toEqual([
      {
        kind: "changed",
        path: "/env/GITHUB_TOKEN",
        before: "[redacted]",
        after: "[redacted]",
      },
    ]);
  });
});

describe("formatProfileDiff", () => {
  it("formats identical profiles", () => {
    expect(formatProfileDiff({ entries: [] })).toBe("No differences.\n");
  });

  it("formats changed profiles", () => {
    expect(
      formatProfileDiff({
        entries: [
          { kind: "changed", path: "/version", before: "1.0.0", after: "1.0.1" },
        ],
      }),
    ).toBe("~ /version: 1.0.0 -> 1.0.1\n");
  });
});
