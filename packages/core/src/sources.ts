import type { ProfileScope, ProfileSource } from "@cprof/schema";

export const CANONICAL_PROJECT_PATHS = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".mcp.json",
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  "CLAUDE.local.md",
  ".claude/rules/**/*.md",
  ".claude/skills/**",
  ".claude/commands/**",
  ".claude/agents/**",
  ".claude/hooks/**",
] as const;

export const CANONICAL_GLOBAL_PATHS = [
  "~/.claude/settings.json",
  "~/.claude/CLAUDE.md",
  "~/.claude/skills/**",
  "~/.claude/commands/**",
  "~/.claude/agents/**",
  "~/.claude/plugins/installed_plugins.json",
  "~/.claude/plugins/known_marketplaces.json",
  "~/.claude.json",
] as const;

export interface SourceDiscoveryOptions {
  readonly mode: "project" | "global";
  readonly includeGlobal?: boolean;
}

export interface ProfileSourceMetadata {
  readonly profileScope: ProfileScope;
  readonly includesGlobal: boolean;
  readonly sources: readonly ProfileSource[];
}

export function createProfileSourceMetadata(
  options: SourceDiscoveryOptions,
): ProfileSourceMetadata {
  if (options.mode === "global") {
    return {
      profileScope: "global",
      includesGlobal: false,
      sources: [
        {
          scope: "global",
          paths: ["~/.claude", "~/.claude.json"],
        },
      ],
    };
  }

  return {
    profileScope: "project",
    includesGlobal: options.includeGlobal ?? false,
    sources: [
      { scope: "project", root: "." },
      {
        scope: "project",
        paths: ["~/.claude.json"],
        private: true,
      },
      ...(options.includeGlobal === true
        ? [
            {
              scope: "global" as const,
              paths: ["~/.claude", "~/.claude.json"],
            },
          ]
        : []),
    ],
  };
}
