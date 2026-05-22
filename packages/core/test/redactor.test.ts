import { describe, expect, it } from "vitest";

import { redactSecrets, shouldRedactString } from "../src/redactor.js";

describe("shouldRedactString", () => {
  it("redacts by sensitive key name", () => {
    expect(shouldRedactString("not-empty", ["env", "API_KEY"])).toBe(
      "key-name",
    );
  });

  it("redacts known secret patterns", () => {
    expect(
      shouldRedactString("ghp_123456789012345678901234567890123456", [
        "value",
      ]),
    ).toBe("known-pattern");
  });

  it("redacts JWT-shaped values", () => {
    expect(
      shouldRedactString("abc123.def456.ghi789", ["authorization"]),
    ).toBe("key-name");
    expect(shouldRedactString("abc123.def456.ghi789", ["value"])).toBe("jwt");
  });

  it("does not redact env placeholders", () => {
    expect(shouldRedactString("${env:GITHUB_TOKEN}", ["token"])).toBeUndefined();
  });

  it("does not redact benign strings", () => {
    expect(shouldRedactString("warn", ["ANTHROPIC_LOG_LEVEL"])).toBeUndefined();
  });
});

describe("redactSecrets", () => {
  it("replaces secrets with deterministic env placeholders", () => {
    const result = redactSecrets({
      mcpServers: {
        github: {
          env: {
            GITHUB_TOKEN: "ghp_123456789012345678901234567890123456",
          },
        },
      },
    });

    expect(result.value).toEqual({
      mcpServers: {
        github: {
          env: {
            GITHUB_TOKEN: "${env:GITHUB_TOKEN}",
          },
        },
      },
    });
    expect(result.requiredSecrets).toEqual(["GITHUB_TOKEN"]);
    expect(result.redactions).toEqual([
      {
        path: "/mcpServers/github/env/GITHUB_TOKEN",
        envName: "GITHUB_TOKEN",
        reason: "key-name",
      },
    ]);
  });

  it("redacts high-entropy strings", () => {
    const result = redactSecrets({
      value: "aZ9qLmN8vB2xC7pR5tY3uI0oP6sD4fG1",
    });

    expect(result.value).toEqual({
      value: "${env:VALUE}",
    });
    expect(result.requiredSecrets).toEqual(["VALUE"]);
  });

  it("sorts object keys deterministically", () => {
    const result = redactSecrets({
      b: "safe",
      a: "safe",
    });

    expect(Object.keys(result.value as Record<string, unknown>)).toEqual([
      "a",
      "b",
    ]);
  });
});
