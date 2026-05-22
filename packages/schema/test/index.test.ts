import { describe, expect, it } from "vitest";

import { cprofSchema, type CprofProfile } from "../src/index.js";

const projectProfile = {
  $schema: "https://cprof.dev/schema/v1.json",
  name: "project-profile",
  version: "1.0.0",
  profileScope: "project",
  includesGlobal: false,
  sources: [{ scope: "project", root: "." }],
  hooks: {
    "pre-tool-use-bash": {
      event: "PreToolUse",
      matcher: "Bash",
      command: ".claude/hooks/pre-tool-use.sh",
      scope: "project",
      inventoryOnly: true,
    },
  },
} satisfies CprofProfile;

describe("@cprof/schema", () => {
  it("exports the phase 1 schema metadata", () => {
    expect(cprofSchema.$id).toBe("https://cprof.dev/schema/v1.json");
    expect(cprofSchema.properties.profileScope.enum).toEqual([
      "project",
      "global",
    ]);
  });

  it("types a project profile with inventory-only hooks", () => {
    expect(projectProfile.hooks["pre-tool-use-bash"]?.inventoryOnly).toBe(true);
  });

  it("types a global profile", () => {
    const globalProfile = {
      $schema: "https://cprof.dev/schema/v1.json",
      name: "global-profile",
      version: "1.0.0",
      profileScope: "global",
      includesGlobal: false,
      sources: [{ scope: "global", paths: ["~/.claude", "~/.claude.json"] }],
    } satisfies CprofProfile;

    expect(globalProfile.profileScope).toBe("global");
  });

  it("types a mixed project profile", () => {
    const mixedProfile = {
      $schema: "https://cprof.dev/schema/v1.json",
      name: "mixed-profile",
      version: "1.0.0",
      profileScope: "project",
      includesGlobal: true,
      sources: [
        { scope: "project", root: "." },
        { scope: "global", paths: ["~/.claude", "~/.claude.json"] },
      ],
    } satisfies CprofProfile;

    expect(mixedProfile.includesGlobal).toBe(true);
  });
});
