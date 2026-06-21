import { describe, expect, it } from "vitest";

import { deepMergeJson } from "../src/merge.js";

const PERMISSION_PATHS = new Set([
  "permissions/allow",
  "permissions/deny",
  "permissions/ask",
]);

describe("deepMergeJson", () => {
  it("deep-merges objects and preserves unrelated keys", () => {
    const result = deepMergeJson(
      { model: "opus", permissions: { allow: ["Read"] }, env: { A: "1" } },
      { permissions: { deny: ["Bash"] }, env: { B: "2" } },
      { unionArrayPaths: PERMISSION_PATHS },
    );

    expect(result.value).toEqual({
      model: "opus",
      permissions: { allow: ["Read"], deny: ["Bash"] },
      env: { A: "1", B: "2" },
    });
  });

  it("unions and dedupes permission arrays, replaces other arrays", () => {
    const result = deepMergeJson(
      { permissions: { allow: ["Read", "Edit"] }, args: ["a", "b"] },
      { permissions: { allow: ["Edit", "Write"] }, args: ["c"] },
      { unionArrayPaths: PERMISSION_PATHS },
    );

    expect(result.value.permissions).toEqual({
      allow: ["Read", "Edit", "Write"],
    });
    expect(result.value.args).toEqual(["c"]); // non-permission array is replaced
  });

  it("override wins on scalar collisions and records overridden paths", () => {
    const result = deepMergeJson(
      { model: "opus", keep: 1 },
      { model: "sonnet" },
      { unionArrayPaths: PERMISSION_PATHS },
    );

    expect(result.value.model).toBe("sonnet");
    expect(result.value.keep).toBe(1);
    expect(result.overridden).toContain("model");
    expect(result.overridden).not.toContain("keep");
  });

  it("records added top-level keys", () => {
    const result = deepMergeJson({ a: 1 }, { b: 2 });

    expect(result.added).toContain("b");
    expect(result.overridden).toEqual([]);
  });

  it("is deterministic (sorted keys)", () => {
    const result = deepMergeJson({ b: 1, c: 1 }, { a: 2 });

    expect(Object.keys(result.value)).toEqual(["a", "b", "c"]);
  });
});
