import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ProfileScope } from "@cprof/schema";

/** Per-file provenance an install records so a rollback can reverse it exactly. */
export interface WriteRecord {
  readonly path: string;
  readonly action: "created" | "merged" | "overwritten";
  /** sha256 of the post-install file content, for the rollback change-guard. */
  readonly hash: string;
  /** Backup of the pre-install content (merged/overwritten files only). */
  readonly backupPath?: string;
}

export type InstallStatus = "applied" | "rolled-back";

export interface InstalledProfileRecord {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly target: "project" | "global" | "mixed";
  readonly profileScope: ProfileScope;
  readonly includesGlobal: boolean;
  readonly installedAt: string;
  /** v2 provenance — always present after load (normalize defaults to "applied"). */
  readonly status?: InstallStatus;
  readonly writes?: readonly WriteRecord[];
  readonly backupDir?: string;
  /** Where rollback stashed the post-install state, for `--undo`. */
  readonly rollbackTrashDir?: string;
}

export interface InstalledProfileState {
  readonly version: 2;
  readonly installs: readonly InstalledProfileRecord[];
}

export async function loadInstalledProfileState(
  path: string,
): Promise<InstalledProfileState> {
  try {
    return normalizeState(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { version: 2, installs: [] };
    }

    throw error;
  }
}

export async function saveInstalledProfileState(
  path: string,
  state: InstalledProfileState,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
  const next: InstalledProfileState = { version: 2, installs };

  await saveInstalledProfileState(path, next);

  return next;
}

/** The most recent install (by installedAt), optionally filtered by status. */
export function findLatestInstall(
  state: InstalledProfileState,
  status?: InstallStatus,
): InstalledProfileRecord | undefined {
  return state.installs
    .filter(
      (install) => status === undefined || normalizeStatus(install) === status,
    )
    .reduce<
      InstalledProfileRecord | undefined
    >((latest, install) => (latest === undefined || install.installedAt > latest.installedAt ? install : latest), undefined);
}

function normalizeStatus(record: InstalledProfileRecord): InstallStatus {
  return record.status === "rolled-back" ? "rolled-back" : "applied";
}

function normalizeState(value: unknown): InstalledProfileState {
  if (!isRecord(value) || !Array.isArray(value.installs)) {
    return { version: 2, installs: [] };
  }

  const installs = value.installs
    .map(normalizeRecord)
    .filter((record): record is InstalledProfileRecord => record !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { version: 2, installs };
}

/** Validate the base fields and upgrade v1 records to v2 (default status/writes). */
function normalizeRecord(value: unknown): InstalledProfileRecord | undefined {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.version !== "string" ||
    typeof value.source !== "string" ||
    !["project", "global", "mixed"].includes(String(value.target)) ||
    !["project", "global"].includes(String(value.profileScope)) ||
    typeof value.includesGlobal !== "boolean" ||
    typeof value.installedAt !== "string"
  ) {
    return undefined;
  }

  let record: InstalledProfileRecord = {
    name: value.name,
    version: value.version,
    source: value.source,
    target: value.target as "project" | "global" | "mixed",
    profileScope: value.profileScope as ProfileScope,
    includesGlobal: value.includesGlobal,
    installedAt: value.installedAt,
    status: value.status === "rolled-back" ? "rolled-back" : "applied",
    writes: Array.isArray(value.writes)
      ? value.writes.filter(isWriteRecord)
      : [],
  };

  if (typeof value.backupDir === "string") {
    record = { ...record, backupDir: value.backupDir };
  }
  if (typeof value.rollbackTrashDir === "string") {
    record = { ...record, rollbackTrashDir: value.rollbackTrashDir };
  }

  return record;
}

function isWriteRecord(value: unknown): value is WriteRecord {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    (value.action === "created" ||
      value.action === "merged" ||
      value.action === "overwritten") &&
    typeof value.hash === "string" &&
    (value.backupPath === undefined || typeof value.backupPath === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
