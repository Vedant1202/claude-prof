import { readFile } from "node:fs/promises";

export interface RegistryProfile {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly source: string;
  readonly version?: string;
  readonly scope?: "project" | "global" | "mixed";
  readonly tags?: readonly string[];
  readonly author?: string;
  readonly updatedAt?: string;
}

export interface ProfileRegistry {
  readonly version: 1;
  readonly profiles: readonly RegistryProfile[];
}

export type RegistryLoadResult =
  | { readonly ok: true; readonly registry: ProfileRegistry }
  | { readonly ok: false; readonly exitCode: 1 | 2; readonly errors: readonly string[] };

export async function loadProfileRegistry(
  path: string,
): Promise<RegistryLoadResult> {
  let contents: string;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: false, exitCode: 2, errors: [`file not found: ${path}`] };
    }

    throw error;
  }

  try {
    const value = JSON.parse(contents) as unknown;
    const validationErrors = validateRegistry(value);

    if (validationErrors.length > 0) {
      return { ok: false, exitCode: 1, errors: validationErrors };
    }

    return {
      ok: true,
      registry: normalizeRegistry(value as ProfileRegistry),
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      errors: [error instanceof Error ? error.message : "registry JSON is invalid"],
    };
  }
}

export function listRegistryProfiles(
  registry: ProfileRegistry,
): readonly RegistryProfile[] {
  return [...registry.profiles].sort(compareProfiles);
}

export function searchRegistryProfiles(
  registry: ProfileRegistry,
  query: string,
): readonly RegistryProfile[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return listRegistryProfiles(registry);
  }

  return listRegistryProfiles(registry).filter((profile) =>
    searchableText(profile).includes(normalizedQuery),
  );
}

export function findRegistryProfile(
  registry: ProfileRegistry,
  id: string,
): RegistryProfile | undefined {
  return registry.profiles.find((profile) => profile.id === id);
}

function validateRegistry(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return ["registry must be an object"];
  }

  const errors: string[] = [];

  if (value.version !== 1) {
    errors.push("/version must be 1");
  }

  if (!Array.isArray(value.profiles)) {
    errors.push("/profiles must be an array");
    return errors;
  }

  const seenIds = new Set<string>();

  for (const [index, profile] of value.profiles.entries()) {
    if (!isRecord(profile)) {
      errors.push(`/profiles/${index} must be an object`);
      continue;
    }

    for (const key of ["id", "name", "source"] as const) {
      if (typeof profile[key] !== "string" || profile[key].length === 0) {
        errors.push(`/profiles/${index}/${key} must be a non-empty string`);
      }
    }

    if (
      profile.version !== undefined &&
      (typeof profile.version !== "string" || profile.version.length === 0)
    ) {
      errors.push(`/profiles/${index}/version must be a non-empty string`);
    }

    if (typeof profile.id === "string") {
      if (seenIds.has(profile.id)) {
        errors.push(`/profiles/${index}/id must be unique`);
      }

      seenIds.add(profile.id);
    }

    if (
      profile.scope !== undefined &&
      !["project", "global", "mixed"].includes(String(profile.scope))
    ) {
      errors.push(`/profiles/${index}/scope must be project, global, or mixed`);
    }

    if (
      profile.tags !== undefined &&
      (!Array.isArray(profile.tags) ||
        profile.tags.some((tag) => typeof tag !== "string"))
    ) {
      errors.push(`/profiles/${index}/tags must be an array of strings`);
    }
  }

  return errors;
}

function normalizeRegistry(registry: ProfileRegistry): ProfileRegistry {
  return {
    version: 1,
    profiles: listRegistryProfiles(registry),
  };
}

function searchableText(profile: RegistryProfile): string {
  return [
    profile.id,
    profile.name,
    profile.description,
    profile.source,
    profile.version,
    profile.scope,
    profile.author,
    ...(profile.tags ?? []),
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLowerCase();
}

function compareProfiles(left: RegistryProfile, right: RegistryProfile): number {
  return left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
