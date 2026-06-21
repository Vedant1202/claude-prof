import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ProfileScope } from "@cprof/schema";

import type { ProfileRegistry } from "./registry.js";

export interface InstalledProfileRecord {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly target: "project" | "global" | "mixed";
  readonly profileScope: ProfileScope;
  readonly includesGlobal: boolean;
  readonly installedAt: string;
}

export interface InstalledProfileState {
  readonly version: 1;
  readonly installs: readonly InstalledProfileRecord[];
}

export interface ProfileUpdateStatus {
  readonly installed: InstalledProfileRecord;
  readonly registryId?: string;
  readonly latestVersion?: string;
  readonly status: "up-to-date" | "update-available" | "unknown";
}

export async function loadInstalledProfileState(
  path: string,
): Promise<InstalledProfileState> {
  try {
    return normalizeState(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { version: 1, installs: [] };
    }

    throw error;
  }
}

export async function recordInstalledProfile(
  path: string,
  record: InstalledProfileRecord,
): Promise<InstalledProfileState> {
  const state = await loadInstalledProfileState(path);
  const installs = [
    record,
    ...state.installs.filter(
      (install) =>
        !(install.source === record.source && install.target === record.target),
    ),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const next = { version: 1 as const, installs };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return next;
}

export function checkInstalledProfileUpdates(
  state: InstalledProfileState,
  registry: ProfileRegistry,
): readonly ProfileUpdateStatus[] {
  return state.installs
    .map((installed) => {
      const profile = registry.profiles.find(
        (candidate) => candidate.source === installed.source,
      );

      if (profile?.version === undefined) {
        return {
          installed,
          registryId: profile?.id,
          latestVersion: profile?.version,
          status: "unknown" as const,
        };
      }

      return {
        installed,
        registryId: profile.id,
        latestVersion: profile.version,
        status:
          profile.version === installed.version
            ? ("up-to-date" as const)
            : ("update-available" as const),
      };
    })
    .sort((left, right) =>
      left.installed.name.localeCompare(right.installed.name),
    );
}

function normalizeState(value: unknown): InstalledProfileState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.installs)
  ) {
    return { version: 1, installs: [] };
  }

  return {
    version: 1,
    installs: value.installs
      .filter(isInstalledProfileRecord)
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function isInstalledProfileRecord(
  value: unknown,
): value is InstalledProfileRecord {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.version === "string" &&
    typeof value.source === "string" &&
    ["project", "global", "mixed"].includes(String(value.target)) &&
    ["project", "global"].includes(String(value.profileScope)) &&
    typeof value.includesGlobal === "boolean" &&
    typeof value.installedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
