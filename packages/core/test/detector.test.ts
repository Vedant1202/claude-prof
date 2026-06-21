import { describe, expect, it } from "vitest";

import { detectProviderSecret } from "../src/detector.js";

// Deterministic high-entropy filler so synthetic tokens pass the rules'
// internal quality gates without embedding a real credential.
const varied = (length: number): string => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += alphabet[(index * 7 + 13) % alphabet.length];
  }
  return out;
};

describe("detectProviderSecret", () => {
  it("flags provider credentials offline", async () => {
    expect(await detectProviderSecret(`ghp_${varied(36)}`)).toBe(true);
    expect(await detectProviderSecret(`sk-ant-api03-${varied(93)}AA`)).toBe(
      true,
    );
  });

  it("leaves benign values untouched", async () => {
    expect(await detectProviderSecret("sonnet")).toBe(false);
    expect(await detectProviderSecret("claude-opus-4-8")).toBe(false);
    expect(await detectProviderSecret("https://api.example.com/v1")).toBe(
      false,
    );
    expect(await detectProviderSecret("")).toBe(false);
  });
});
