import { describe, expect, it } from "vitest";

import { main } from "../src/index.js";

describe("cprof cli", () => {
  it("returns success for the scaffold entrypoint", () => {
    expect(main([])).toBe(0);
  });
});
