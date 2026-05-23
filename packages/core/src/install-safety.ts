import type { CprofProfile } from "@cprof/schema";

import { isRecord } from "./record-utils.js";

export function findMissingSecrets(
  profile: CprofProfile,
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return [
    ...new Set([
      ...(profile.secrets?.required ?? []),
      ...findEnvPlaceholders(profile),
    ]),
  ]
    .filter((name) => env[name] === undefined)
    .sort();
}

export function resolveEnvPlaceholders(
  value: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return value.replaceAll(
    /\$\{env:([A-Za-z_][A-Za-z0-9_]*)}/g,
    (_placeholder, name: string) => env[name] ?? "",
  );
}

function findEnvPlaceholders(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [...value.matchAll(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)}/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => name.length > 0);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findEnvPlaceholders(item));
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => findEnvPlaceholders(item));
  }

  return [];
}
