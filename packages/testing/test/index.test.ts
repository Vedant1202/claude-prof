import { describe, expect, it } from "vitest";

import { createFixtureDescriptor } from "../src/index.js";

describe("@cprof/testing", () => {
  it("creates a fixture descriptor", () => {
    expect(createFixtureDescriptor("project")).toEqual({ name: "project" });
  });
});
