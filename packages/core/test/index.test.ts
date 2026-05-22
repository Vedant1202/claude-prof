import { describe, expect, it } from "vitest";

import { createSourceDescriptor } from "../src/index.js";

describe("@cprof/core", () => {
  it("creates a source descriptor", () => {
    expect(createSourceDescriptor("project")).toEqual({ scope: "project" });
  });
});
