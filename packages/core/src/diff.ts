import { shouldRedactString } from "./redactor.js";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  readonly kind: DiffKind;
  readonly path: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface ProfileDiff {
  readonly entries: readonly DiffEntry[];
}

export function diffProfiles(before: unknown, after: unknown): ProfileDiff {
  return {
    entries: diffValue(before, after, []).sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

export function formatProfileDiff(diff: ProfileDiff): string {
  if (diff.entries.length === 0) {
    return "No differences.\n";
  }

  return `${diff.entries.map(formatEntry).join("\n")}\n`;
}

function diffValue(
  before: unknown,
  after: unknown,
  path: readonly string[],
): DiffEntry[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    return [...keys].flatMap((key) =>
      diffValue(before[key], after[key], [...path, key]),
    );
  }

  if (stableStringify(before) === stableStringify(after)) {
    return [];
  }

  const diffPath = formatPath(path);

  if (before === undefined) {
    return [{ kind: "added", path: diffPath, after: sanitizeValue(after, path) }];
  }

  if (after === undefined) {
    return [
      { kind: "removed", path: diffPath, before: sanitizeValue(before, path) },
    ];
  }

  return [
    {
      kind: "changed",
      path: diffPath,
      before: sanitizeValue(before, path),
      after: sanitizeValue(after, path),
    },
  ];
}

function formatEntry(entry: DiffEntry): string {
  if (entry.kind === "added") {
    return `+ ${entry.path}: ${formatValue(entry.after)}`;
  }

  if (entry.kind === "removed") {
    return `- ${entry.path}: ${formatValue(entry.before)}`;
  }

  return `~ ${entry.path}: ${formatValue(entry.before)} -> ${formatValue(
    entry.after,
  )}`;
}

function sanitizeValue(value: unknown, path: readonly string[]): unknown {
  if (typeof value === "string") {
    return shouldRedactString(value, path) === undefined ? value : "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, [...path, String(index)]));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sanitizeValue(item, [...path, key])]),
    );
  }

  return value;
}

function formatValue(value: unknown): string {
  const formatted =
    typeof value === "string" ? value : stableStringify(value) ?? String(value);

  return formatted.length > 120 ? `${formatted.slice(0, 117)}...` : formatted;
}

function stableStringify(value: unknown): string | undefined {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }

  return value;
}

function formatPath(path: readonly string[]): string {
  return path.length === 0 ? "/" : `/${path.join("/")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
