import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { mirrorAbsolutePath } from "./backup-path.js";
import { isNodeError } from "./fs-utils.js";
import {
  findLatestInstall,
  loadInstalledProfileState,
  saveInstalledProfileState,
  type InstalledProfileRecord,
  type InstalledProfileState,
  type WriteRecord,
} from "./state.js";

export type RollbackMode = "rollback" | "undo";

export type RollbackOutcome =
  | "done"
  | "planned"
  | "nothing-to-do"
  | "aborted-changed";

export interface RollbackOptions {
  readonly statePath: string;
  readonly mode: RollbackMode;
  /** Proceed even if files changed since the recorded state (skip the guard). */
  readonly force?: boolean;
  /** Compute the plan without touching any file or the ledger. */
  readonly dryRun?: boolean;
  readonly now?: Date;
}

export interface RollbackResult {
  readonly ok: boolean;
  readonly mode: RollbackMode;
  readonly dryRun: boolean;
  readonly outcome: RollbackOutcome;
  /** Merged/overwritten files restored to their pre-install content (rollback). */
  readonly restored: readonly string[];
  /** Created files moved to the trash dir (rollback). */
  readonly trashed: readonly string[];
  /** Files re-applied to their post-install content (undo). */
  readonly reapplied: readonly string[];
  /** Files that diverged from the expected state (when aborted). */
  readonly changed: readonly string[];
}

/**
 * Strict, transactional undo (or redo) of the most recent install in a scope.
 * `rollback` reverts the latest `applied` install; `undo` re-applies the latest
 * `rolled-back` one. Guard-first: every touched file is checked against the state
 * it should currently be in, and if any diverged the whole operation aborts
 * before mutating anything (unless `force`). Never partial, never per-file.
 */
export async function rollbackLastInstall(
  options: RollbackOptions,
): Promise<RollbackResult> {
  const state = await loadInstalledProfileState(options.statePath);
  const wantStatus = options.mode === "rollback" ? "applied" : "rolled-back";
  const record = findLatestInstall(state, wantStatus);
  const writes = record?.writes ?? [];

  if (record === undefined || writes.length === 0) {
    return result(options, "nothing-to-do");
  }

  const changed = await detectChanges(writes, options.mode);
  if (changed.length > 0 && options.force !== true) {
    return result(options, "aborted-changed", { changed });
  }

  if (options.dryRun === true) {
    return result(options, "planned", classify(writes, options.mode));
  }

  const applied =
    options.mode === "rollback"
      ? await applyRollbackDirection(state, record, writes, options)
      : await applyUndoDirection(state, record, writes, options);

  return result(options, "done", applied);
}

/** Check each file against the state it should currently be in (read-only). */
async function detectChanges(
  writes: readonly WriteRecord[],
  mode: RollbackMode,
): Promise<string[]> {
  const changed: string[] = [];

  for (const write of writes) {
    if (mode === "rollback") {
      // Should currently hold the post-install content.
      if ((await fileHash(write.path)) !== write.hash) {
        changed.push(write.path);
      }
      continue;
    }

    // undo: should currently hold the pre-install state that rollback restored.
    if (write.action === "created") {
      if ((await fileHash(write.path)) !== null) {
        changed.push(write.path); // re-created since the rollback
      }
    } else {
      const expected =
        write.backupPath === undefined
          ? null
          : await fileHash(write.backupPath);
      if (expected === null || (await fileHash(write.path)) !== expected) {
        changed.push(write.path);
      }
    }
  }

  return changed;
}

async function applyRollbackDirection(
  state: InstalledProfileState,
  record: InstalledProfileRecord,
  writes: readonly WriteRecord[],
  options: RollbackOptions,
): Promise<Partial<RollbackResult>> {
  const trashDir = join(
    dirname(options.statePath),
    ".cprof-trash",
    timestamp(options.now),
  );

  // Stash the current (post-install) content of every touched file first, so the
  // rollback is itself reversible via `--undo`.
  for (const write of writes) {
    await copyInto(write.path, mirrorAbsolutePath(trashDir, write.path));
  }

  const restored: string[] = [];
  const trashed: string[] = [];

  for (const write of writes) {
    if (write.action === "created") {
      await rm(write.path, { force: true });
      trashed.push(write.path);
    } else if (write.backupPath !== undefined) {
      await copyInto(write.backupPath, write.path);
      restored.push(write.path);
    }
  }

  await persist(options.statePath, state, record, {
    ...record,
    status: "rolled-back",
    rollbackTrashDir: trashDir,
  });

  return { restored, trashed };
}

async function applyUndoDirection(
  state: InstalledProfileState,
  record: InstalledProfileRecord,
  writes: readonly WriteRecord[],
  options: RollbackOptions,
): Promise<Partial<RollbackResult>> {
  const trashDir = record.rollbackTrashDir;
  if (trashDir === undefined) {
    return { reapplied: [] };
  }

  const reapplied: string[] = [];
  for (const write of writes) {
    await copyInto(mirrorAbsolutePath(trashDir, write.path), write.path);
    reapplied.push(write.path);
  }

  await persist(options.statePath, state, record, {
    ...record,
    status: "applied",
    rollbackTrashDir: undefined,
  });

  return { reapplied };
}

function classify(
  writes: readonly WriteRecord[],
  mode: RollbackMode,
): Partial<RollbackResult> {
  if (mode === "undo") {
    return { reapplied: writes.map((write) => write.path) };
  }

  return {
    restored: writes
      .filter((write) => write.action !== "created")
      .map((write) => write.path),
    trashed: writes
      .filter((write) => write.action === "created")
      .map((write) => write.path),
  };
}

async function persist(
  statePath: string,
  state: InstalledProfileState,
  oldRecord: InstalledProfileRecord,
  newRecord: InstalledProfileRecord,
): Promise<void> {
  const installs = state.installs.map((record) =>
    record === oldRecord ? newRecord : record,
  );
  await saveInstalledProfileState(statePath, { version: 2, installs });
}

async function copyInto(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function fileHash(path: string): Promise<string | null> {
  try {
    const contents = await readFile(path, "utf8");
    return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function timestamp(now: Date | undefined): string {
  return (now ?? new Date()).toISOString().replace(/[:.]/g, "-");
}

function result(
  options: RollbackOptions,
  outcome: RollbackOutcome,
  extra: Partial<RollbackResult> = {},
): RollbackResult {
  return {
    ok: outcome === "done" || outcome === "planned",
    mode: options.mode,
    dryRun: options.dryRun === true,
    outcome,
    restored: extra.restored ?? [],
    trashed: extra.trashed ?? [],
    reapplied: extra.reapplied ?? [],
    changed: extra.changed ?? [],
  };
}
