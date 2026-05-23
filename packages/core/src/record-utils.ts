export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function nonEmptyRecord<T>(
  value: Record<string, T>,
): Record<string, T> | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}
