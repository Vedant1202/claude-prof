export interface JsonMergeOptions {
  // Paths (slash-joined, e.g. "permissions/allow") whose arrays are unioned and
  // de-duplicated instead of replaced. Everything else: the override wins.
  readonly unionArrayPaths?: ReadonlySet<string>;
}

export interface JsonMergeResult {
  readonly value: Record<string, unknown>;
  readonly added: readonly string[]; // keys introduced by the override
  readonly overridden: readonly string[]; // leaf/array paths the override changed
}

/**
 * Deterministically deep-merge `override` onto `base`. Plain objects merge
 * recursively; arrays at `unionArrayPaths` are unioned (base order first), all
 * other values are replaced by the override. Output keys are sorted so the
 * result is byte-stable.
 */
export function deepMergeJson(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  options: JsonMergeOptions = {},
): JsonMergeResult {
  const added: string[] = [];
  const overridden: string[] = [];
  const value = mergeObjects(
    base,
    override,
    [],
    options.unionArrayPaths ?? new Set(),
    added,
    overridden,
  );

  return {
    value,
    added: [...added].sort(),
    overridden: [...overridden].sort(),
  };
}

function mergeObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  path: readonly string[],
  unionArrayPaths: ReadonlySet<string>,
  added: string[],
  overridden: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = [
    ...new Set([...Object.keys(base), ...Object.keys(override)]),
  ].sort((left, right) => left.localeCompare(right));

  for (const key of keys) {
    const childPath = [...path, key];
    const pathStr = childPath.join("/");
    const inBase = Object.prototype.hasOwnProperty.call(base, key);
    const inOverride = Object.prototype.hasOwnProperty.call(override, key);

    if (!inOverride) {
      result[key] = base[key];
      continue;
    }

    if (!inBase) {
      result[key] = override[key];
      added.push(pathStr);
      continue;
    }

    const baseValue = base[key];
    const overrideValue = override[key];

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = mergeObjects(
        baseValue,
        overrideValue,
        childPath,
        unionArrayPaths,
        added,
        overridden,
      );
    } else if (
      Array.isArray(baseValue) &&
      Array.isArray(overrideValue) &&
      unionArrayPaths.has(pathStr)
    ) {
      const merged = unionDedupe(baseValue, overrideValue);
      result[key] = merged;
      if (!jsonEqual(baseValue, merged)) {
        overridden.push(pathStr);
      }
    } else {
      result[key] = overrideValue;
      if (!jsonEqual(baseValue, overrideValue)) {
        overridden.push(pathStr);
      }
    }
  }

  return result;
}

function unionDedupe(
  base: readonly unknown[],
  override: readonly unknown[],
): unknown[] {
  const seen = new Set(base.map((item) => JSON.stringify(item)));
  const result = [...base];

  for (const item of override) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
