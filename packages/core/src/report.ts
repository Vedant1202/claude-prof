import type { Redaction } from "./redactor.js";
import type { SkippedPath } from "./traversal.js";

export interface ScanReportInput {
  readonly detected: Readonly<Record<string, number>>;
  readonly redactions?: readonly Redaction[];
  readonly skipped?: readonly SkippedPath[];
  readonly ignoredPatterns?: readonly string[];
}

const PROFILE_GITIGNORE_LINES = [
  ".DS_Store",
  "node_modules/",
  "*.log",
  ".env",
  ".env.*",
  ".claude/.credentials.json",
  ".claude/statsig/",
  ".claude/cache/",
  ".claude/backups/",
  ".claude/file-history/",
  ".claude/paste-cache/",
  ".claude/shell-snapshots/",
  ".claude/clipboard/",
  ".claude/sessions/",
  ".claude/transcripts/",
  ".claude/history.jsonl",
] as const;

export function createProfileGitignore(): string {
  return `${PROFILE_GITIGNORE_LINES.join("\n")}\n`;
}

export function createScanReport(input: ScanReportInput): string {
  const lines = [
    "cprof scan report",
    "",
    "Detected:",
    ...formatDetected(input.detected),
    "",
    `Redactions: ${input.redactions?.length ?? 0}`,
    ...formatRedactions(input.redactions ?? []),
    "",
    `Skipped paths: ${input.skipped?.length ?? 0}`,
    ...formatSkipped(input.skipped ?? []),
    "",
    `Ignored patterns: ${input.ignoredPatterns?.length ?? 0}`,
    ...formatIgnoredPatterns(input.ignoredPatterns ?? []),
  ];

  return `${lines.join("\n")}\n`;
}

function formatDetected(detected: Readonly<Record<string, number>>): string[] {
  return Object.entries(detected)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `- ${name}: ${count}`);
}

function formatRedactions(redactions: readonly Redaction[]): string[] {
  return redactions
    .map((redaction) => ({
      path: redaction.path,
      summary: `- ${redaction.path}: ${redaction.reason} -> ${redaction.envName}`,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((redaction) => redaction.summary);
}

function formatSkipped(skipped: readonly SkippedPath[]): string[] {
  return skipped
    .map((entry) => ({
      path: entry.relativePath,
      summary: `- ${entry.relativePath}: ${entry.reason}`,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => entry.summary);
}

function formatIgnoredPatterns(patterns: readonly string[]): string[] {
  return [...patterns].sort().map((pattern) => `- ${pattern}`);
}
