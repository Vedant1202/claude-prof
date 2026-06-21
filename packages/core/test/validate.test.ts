import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateProfile, validateProfileFile } from "../src/validate.js";

const validProfile = {
  $schema: "https://cprof.dev/schema/v1.json",
  name: "project-profile",
  version: "1.0.0",
  profileScope: "project",
  includesGlobal: false,
  sources: [{ scope: "project", root: "." }],
};

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-validate-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("validateProfile", () => {
  it("accepts a valid profile", () => {
    expect(validateProfile(validProfile)).toEqual({
      valid: true,
      exitCode: 0,
      errors: [],
    });
  });

  it("rejects a schema-invalid profile", () => {
    const result = validateProfile({
      ...validProfile,
      profileScope: "workspace",
    });

    expect(result.valid).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("must be equal to one");
  });

  it("accepts a remote (http) MCP server with a url and no command", () => {
    const result = validateProfile({
      ...validProfile,
      mcpServers: {
        api: {
          type: "http",
          url: "https://api.example.com/mcp",
          headers: { Authorization: "Bearer x" },
        },
      },
    });

    expect(result.valid).toBe(true);
  });

  it("still accepts a stdio MCP server with a command", () => {
    const result = validateProfile({
      ...validProfile,
      mcpServers: { local: { command: "npx", args: ["-y", "pkg"] } },
    });

    expect(result.valid).toBe(true);
  });

  it("rejects an MCP server with neither command nor url", () => {
    const result = validateProfile({
      ...validProfile,
      mcpServers: { broken: { type: "http" } },
    });

    expect(result.valid).toBe(false);
  });
});

describe("validateProfileFile", () => {
  it("validates a profile file", async () => {
    const filePath = join(tempDir, "claude-profile.json");
    await writeFile(filePath, JSON.stringify(validProfile), "utf8");

    await expect(validateProfileFile(filePath)).resolves.toMatchObject({
      valid: true,
      exitCode: 0,
    });
  });

  it("classifies malformed JSON as a validation error", async () => {
    const filePath = join(tempDir, "claude-profile.json");
    await writeFile(filePath, "{", "utf8");

    await expect(validateProfileFile(filePath)).resolves.toMatchObject({
      valid: false,
      exitCode: 1,
    });
  });

  it("classifies missing files separately", async () => {
    await expect(
      validateProfileFile(join(tempDir, "missing.json")),
    ).resolves.toEqual({
      valid: false,
      exitCode: 2,
      errors: [`file not found: ${join(tempDir, "missing.json")}`],
    });
  });
});
