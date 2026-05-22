import { describe, expect, it } from "vitest";

import {
  CANONICAL_GLOBAL_PATHS,
  CANONICAL_PROJECT_PATHS,
  createProfileSourceMetadata,
} from "../src/sources.js";

describe("canonical source paths", () => {
  it("lists project Claude Code surfaces", () => {
    expect(CANONICAL_PROJECT_PATHS).toEqual(
      expect.arrayContaining([
        ".claude/settings.json",
        ".claude/settings.local.json",
        ".mcp.json",
        "CLAUDE.md",
        "CLAUDE.local.md",
        ".claude/skills/**",
        ".claude/commands/**",
        ".claude/agents/**",
        ".claude/hooks/**",
      ]),
    );
  });

  it("lists global Claude Code surfaces", () => {
    expect(CANONICAL_GLOBAL_PATHS).toEqual(
      expect.arrayContaining([
        "~/.claude/settings.json",
        "~/.claude/CLAUDE.md",
        "~/.claude/skills/**",
        "~/.claude/commands/**",
        "~/.claude/agents/**",
        "~/.claude.json",
      ]),
    );
  });
});

describe("createProfileSourceMetadata", () => {
  it("creates project source metadata by default", () => {
    expect(createProfileSourceMetadata({ mode: "project" })).toEqual({
      profileScope: "project",
      includesGlobal: false,
      sources: [
        { scope: "project", root: "." },
        {
          scope: "project",
          paths: ["~/.claude.json"],
          private: true,
        },
      ],
    });
  });

  it("creates global source metadata", () => {
    expect(createProfileSourceMetadata({ mode: "global" })).toEqual({
      profileScope: "global",
      includesGlobal: false,
      sources: [
        {
          scope: "global",
          paths: ["~/.claude", "~/.claude.json"],
        },
      ],
    });
  });

  it("creates mixed project plus global source metadata", () => {
    expect(
      createProfileSourceMetadata({ mode: "project", includeGlobal: true }),
    ).toEqual({
      profileScope: "project",
      includesGlobal: true,
      sources: [
        { scope: "project", root: "." },
        {
          scope: "project",
          paths: ["~/.claude.json"],
          private: true,
        },
        {
          scope: "global",
          paths: ["~/.claude", "~/.claude.json"],
        },
      ],
    });
  });
});
