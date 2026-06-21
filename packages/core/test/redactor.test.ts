import { describe, expect, it } from "vitest";

import {
  redactSecrets,
  redactSecretsAsync,
  shouldRedactString,
} from "../src/redactor.js";

describe("shouldRedactString", () => {
  it("redacts by sensitive key name", () => {
    expect(shouldRedactString("not-empty", ["env", "API_KEY"])).toBe(
      "key-name",
    );
  });

  it("redacts camelCase sensitive key names", () => {
    expect(shouldRedactString("hunter2", ["dbPassword"])).toBe("key-name");
    expect(shouldRedactString("x", ["awsSecretAccessKey"])).toBe("key-name");
  });

  it("redacts JWT-shaped values", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123";

    expect(shouldRedactString(jwt, ["authorization"])).toBe("key-name");
    expect(shouldRedactString(jwt, ["value"])).toBe("jwt");
  });

  it("does not redact env placeholders", () => {
    expect(
      shouldRedactString("${env:GITHUB_TOKEN}", ["token"]),
    ).toBeUndefined();
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

describe("redactSecretsAsync", () => {
  it("redacts provider keys under non-sensitive keys (Layer A)", async () => {
    const result = await redactSecretsAsync({
      field: "ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
    });

    expect((result.value as Record<string, unknown>).field).toBe(
      "${env:FIELD}",
    );
  });

  it("is deterministic for the same input", async () => {
    const input = {
      b: { token: "ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8" },
      a: "https://example.com/path",
      list: ["sonnet", "aZ9qLmN8vB2xC7pR5tY3uI0oP6sD4fG1"],
    };

    const first = await redactSecretsAsync(input);
    const second = await redactSecretsAsync(input);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("redactSecrets — remote MCP (F5)", () => {
  it("preserves native ${VAR} expansion references (D5)", () => {
    const result = redactSecrets({
      headers: { Authorization: "Bearer ${API_KEY}" },
      env: { TOKEN: "${GITHUB_PAT}" },
    });
    const value = result.value as {
      headers: { Authorization: string };
      env: { TOKEN: string };
    };

    expect(value.headers.Authorization).toBe("Bearer ${API_KEY}");
    expect(value.env.TOKEN).toBe("${GITHUB_PAT}");
  });

  it("redacts a raw secret in a url query string in place (D6)", () => {
    const result = redactSecrets({
      mcpServers: {
        api: {
          url: "https://h.example.com/mcp?token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8&mode=fast",
        },
      },
    });
    const value = result.value as {
      mcpServers: { api: { url: string } };
    };

    expect(value.mcpServers.api.url).toBe(
      "https://h.example.com/mcp?token=${env:TOKEN}&mode=fast",
    );
  });

  it("leaves url query expansion references alone (D6)", () => {
    const result = redactSecrets({
      mcpServers: { api: { url: "https://h/mcp?token=${API_KEY}" } },
    });
    const value = result.value as {
      mcpServers: { api: { url: string } };
    };

    expect(value.mcpServers.api.url).toBe("https://h/mcp?token=${API_KEY}");
  });
});
