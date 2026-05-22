import { describe, expect, it } from "vitest";

import { buildManifest } from "../src/manifest.js";
import { createProfileSourceMetadata } from "../src/sources.js";
import { validateProfile } from "../src/validate.js";

describe("buildManifest", () => {
  it("builds a valid project manifest", () => {
    const manifest = buildManifest({
      name: "project-profile",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      skills: {
        review: {
          source: "./skills/review",
          scope: "project",
        },
      },
    });

    expect(validateProfile(manifest)).toMatchObject({ valid: true });
    expect(manifest.profileScope).toBe("project");
    expect(manifest.skills?.review?.scope).toBe("project");
  });

  it("forces hooks to inventory-only", () => {
    const manifest = buildManifest({
      name: "hook-profile",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      hooks: {
        bash: {
          event: "PreToolUse",
          matcher: "Bash",
          command: ".claude/hooks/bash.sh",
        },
      },
    });

    expect(manifest.hooks?.bash?.inventoryOnly).toBe(true);
    expect(validateProfile(manifest)).toMatchObject({ valid: true });
  });

  it("redacts manifest secrets and records required env names", () => {
    const manifest = buildManifest({
      name: "secret-profile",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
      mcpServers: {
        github: {
          command: "npx",
          env: {
            GITHUB_TOKEN: "ghp_123456789012345678901234567890123456",
          },
        },
      },
    });

    expect(manifest.mcpServers?.github?.env?.GITHUB_TOKEN).toBe(
      "${env:GITHUB_TOKEN}",
    );
    expect(manifest.secrets?.required).toEqual(["GITHUB_TOKEN"]);
    expect(validateProfile(manifest)).toMatchObject({ valid: true });
  });

  it("sorts section keys deterministically", () => {
    const manifest = buildManifest({
      name: "sorted-profile",
      version: "1.0.0",
      sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      commands: {
        zed: { source: "./commands/zed.md" },
        alpha: { source: "./commands/alpha.md" },
      },
    });

    expect(Object.keys(manifest.commands ?? {})).toEqual(["alpha", "zed"]);
  });
});
