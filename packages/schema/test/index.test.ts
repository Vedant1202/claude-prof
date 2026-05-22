import { describe, expect, it } from "vitest";

import { schemaPackage } from "../src/index.js";

describe("@cprof/schema", () => {
  it("exports the package marker", () => {
    expect(schemaPackage).toEqual({
      name: "@cprof/schema",
      phase: 1,
    });
  });
});
