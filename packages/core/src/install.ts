import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { CprofProfile } from "@cprof/schema";

import { backupPathFor } from "./backup-path.js";
import { isNodeError } from "./fs-utils.js";
import { createInstallPlan, resolveAllowedScopes } from "./install-plan.js";
import { createInstallReport } from "./install-report.js";
import {
  findMissingSecrets,
  resolveEnvPlaceholders,
} from "./install-safety.js";
import { deepMergeJson } from "./merge.js";
import { isRecord } from "./record-utils.js";
import { isInsideRoot } from "./traversal.js";
import type {
  InstallConflict,
  InstallExitCode,
  InstallProfileOptions,
  InstallResult,
  InstallSkipped,
  InstallWrite,
  PlannedWrite,
  PlanContext,
  PreparedWrite,
} from "./install-types.js";
import { checkGeneratedOutputForLeaks } from "./leak-check.js";
import { recordInstalledProfile, type WriteRecord } from "./state.js";
import { validateProfile } from "./validate.js";

export { createInstallReport } from "./install-report.js";
export type {
  InstallConflict,
  InstallExitCode,
  InstallProfileOptions,
  InstallResult,
  InstallScope,
  InstallSkipped,
  InstallWrite,
} from "./install-types.js";

export async function installProfile(
  options: InstallProfileOptions,
): Promise<InstallResult> {
  const profileRead = await readProfile(options.profilePath);

  if (profileRead.category !== "ok") {
    return createFailureResult({
      exitCode: profileRead.category === "not-found" ? 2 : 1,
      dryRun: options.dryRun === true,
      errors: profileRead.errors,
    });
  }

  const context: PlanContext = {
    profile: profileRead.profile,
    profileDir: dirname(resolve(options.profilePath)),
    projectRoot: resolve(options.cwd),
    claudeHome: join(resolve(options.homeDir), ".claude"),
    allowedScopes: resolveAllowedScopes(profileRead.profile, options.scope),
    env: options.env ?? process.env,
  };
  const plan = await createInstallPlan(context);

  // Defense in depth against path traversal via crafted section keys: the schema
  // forbids path separators in key names, but we never write a path that escapes
  // the allowed roots even if a key slips validation.
  const homeClaudeJson = join(resolve(options.homeDir), ".claude.json");
  const escapingWrites = plan.writes.filter(
    (write) => !isWriteContained(write.path, context, homeClaudeJson),
  );

  if (escapingWrites.length > 0) {
    return createFailureResult({
      exitCode: 3,
      dryRun: options.dryRun === true,
      skipped: plan.skipped,
      errors: escapingWrites.map(
        (write) => `refusing to write outside target roots: ${write.path}`,
      ),
    });
  }

  const missingSecrets = findMissingSecrets(profileRead.profile, context.env);

  if (missingSecrets.length > 0) {
    return createFailureResult({
      exitCode: 1,
      dryRun: options.dryRun === true,
      skipped: plan.skipped,
      missingSecrets,
      errors: missingSecrets.map((name) => `missing required env var: ${name}`),
    });
  }

  const leakCheck = await checkGeneratedOutputForLeaks(
    plan.writes
      .filter((write) => !write.contents.includes("${env:"))
      .map((write) => ({ path: write.path, contents: write.contents })),
  );

  if (!leakCheck.ok) {
    return createFailureResult({
      exitCode: 3,
      dryRun: options.dryRun === true,
      skipped: plan.skipped,
      errors: leakCheck.leaks.map(
        (leak) => `unsafe output at ${leak.path}: ${leak.reason}`,
      ),
    });
  }

  const resolvedWrites = plan.writes.map((write) => ({
    ...write,
    contents: resolveEnvPlaceholders(write.contents, context.env),
  }));

  // JSON config (settings, mcpServers) deep-merges into the target; asset files
  // overwrite. Disposition is computed here so dry-run and apply agree.
  const prepared = await prepareWrites(resolvedWrites);

  // Only asset overwrites are conflicts that require --force. JSON config merges
  // by default (with a backup), so existing settings/.mcp.json/~/.claude.json are
  // not conflicts.
  const conflicts = prepared
    .filter(
      (write) => write.source === "asset" && write.action === "overwritten",
    )
    .map((write) => ({
      path: write.path,
      section: write.section,
      name: write.name,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  if (conflicts.length > 0 && options.force !== true) {
    return createFailureResult({
      exitCode: 1,
      dryRun: options.dryRun === true,
      skipped: plan.skipped,
      conflicts,
      errors: conflicts.map((conflict) => `target exists: ${conflict.path}`),
    });
  }

  const writes = prepared.map(toPublicWrite);
  const backupRoot = join(
    context.projectRoot,
    ".cprof-backups",
    formatTimestamp(options.now ?? new Date()),
  );
  // Every merge backs up the prior file (reversible even without --force); asset
  // overwrites are backed up only when --force is used.
  const backupTargets: InstallConflict[] = [
    ...prepared.filter(
      (write) => write.source === "generated" && write.action === "merged",
    ),
    ...(options.force === true
      ? prepared.filter(
          (write) => write.source === "asset" && write.action === "overwritten",
        )
      : []),
  ].map((write) => ({
    path: write.path,
    section: write.section,
    name: write.name,
  }));
  const backups =
    options.dryRun === true
      ? []
      : await backupConflicts(backupTargets, backupRoot, context.projectRoot);

  if (options.dryRun !== true) {
    for (const write of prepared) {
      await mkdir(dirname(write.path), { recursive: true });
      await writeFile(write.path, write.finalContents, "utf8");
    }
    await recordInstalledProfile(statePathForContext(context), {
      name: context.profile.name,
      version: context.profile.version,
      source: options.installSource ?? options.profilePath,
      target: targetForContext(context),
      profileScope: context.profile.profileScope,
      includesGlobal: context.profile.includesGlobal,
      installedAt: (options.now ?? new Date()).toISOString(),
      status: "applied",
      backupDir: backupRoot,
      writes: toWriteRecords(prepared, backups),
    });
  }

  const report = createInstallReport({
    dryRun: options.dryRun === true,
    writes,
    conflicts,
    skipped: plan.skipped,
    backups,
    errors: [],
  });

  if (options.dryRun !== true) {
    const reportPath = context.allowedScopes.includes("project")
      ? join(context.projectRoot, "cprof-install-report.txt")
      : join(context.claudeHome, "cprof-install-report.txt");
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, report, "utf8");
  }

  return {
    ok: true,
    exitCode: 0,
    dryRun: options.dryRun === true,
    writes,
    conflicts,
    skipped: plan.skipped,
    backups,
    missingSecrets: [],
    errors: [],
    report,
  };
}

function statePathForContext(context: PlanContext): string {
  return context.allowedScopes.includes("project")
    ? join(context.projectRoot, ".cprof-state.json")
    : join(context.claudeHome, ".cprof-state.json");
}

function targetForContext(
  context: PlanContext,
): "project" | "global" | "mixed" {
  return context.allowedScopes.includes("project") &&
    context.allowedScopes.includes("global")
    ? "mixed"
    : context.allowedScopes.includes("global")
      ? "global"
      : "project";
}

async function readProfile(
  profilePath: string,
): Promise<
  | { readonly category: "ok"; readonly profile: CprofProfile }
  | { readonly category: "not-found"; readonly errors: readonly string[] }
  | { readonly category: "invalid"; readonly errors: readonly string[] }
> {
  let contents: string;

  try {
    contents = await readFile(profilePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        category: "not-found",
        errors: [`file not found: ${profilePath}`],
      };
    }

    throw error;
  }

  try {
    const profile = JSON.parse(contents) as unknown;
    const validation = validateProfile(profile);

    if (!validation.valid) {
      return { category: "invalid", errors: validation.errors };
    }

    return { category: "ok", profile: profile as CprofProfile };
  } catch (error) {
    return {
      category: "invalid",
      errors: [
        error instanceof Error ? error.message : "profile JSON is invalid",
      ],
    };
  }
}

const PERMISSION_ARRAY_PATHS = new Set([
  "permissions/allow",
  "permissions/deny",
  "permissions/ask",
]);

async function prepareWrites(
  writes: readonly PlannedWrite[],
): Promise<readonly PreparedWrite[]> {
  return Promise.all(
    writes.map(async (write): Promise<PreparedWrite> => {
      const existed = await fileExists(write.path);

      if (write.source === "generated") {
        const existing = await readJsonObject(write.path);
        const incoming = JSON.parse(write.contents) as Record<string, unknown>;
        const merged = deepMergeJson(existing, incoming, {
          unionArrayPaths: PERMISSION_ARRAY_PATHS,
        });

        return {
          ...write,
          action: existed ? "merged" : "created",
          finalContents: `${JSON.stringify(merged.value, null, 2)}\n`,
          overriddenKeys: merged.overridden,
        };
      }

      return {
        ...write,
        action: existed ? "overwritten" : "created",
        finalContents: write.contents,
        overriddenKeys: [],
      };
    }),
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function backupConflicts(
  conflicts: readonly InstallConflict[],
  backupRoot: string,
  projectRoot: string,
): Promise<readonly InstallWrite[]> {
  const backups: InstallWrite[] = [];

  for (const conflict of conflicts) {
    const backupPath = backupPathFor(backupRoot, conflict.path, projectRoot);
    const contents = await readFile(conflict.path, "utf8");
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, contents, "utf8");
    backups.push({
      source: "generated",
      section: conflict.section,
      name: conflict.name,
      path: conflict.path,
      backupPath,
    });
  }

  return backups.sort((left, right) => left.path.localeCompare(right.path));
}

function createFailureResult(input: {
  readonly exitCode: InstallExitCode;
  readonly dryRun: boolean;
  readonly conflicts?: readonly InstallConflict[];
  readonly skipped?: readonly InstallSkipped[];
  readonly missingSecrets?: readonly string[];
  readonly errors: readonly string[];
}): InstallResult {
  const report = createInstallReport({
    dryRun: input.dryRun,
    writes: [],
    conflicts: input.conflicts ?? [],
    skipped: input.skipped ?? [],
    backups: [],
    errors: input.errors,
  });

  return {
    ok: false,
    exitCode: input.exitCode,
    dryRun: input.dryRun,
    writes: [],
    conflicts: input.conflicts ?? [],
    skipped: input.skipped ?? [],
    backups: [],
    missingSecrets: input.missingSecrets ?? [],
    errors: input.errors,
    report,
  };
}

function toPublicWrite(write: PreparedWrite): InstallWrite {
  return {
    source: write.source,
    section: write.section,
    name: write.name,
    path: write.path,
    action: write.action,
    overriddenKeys:
      write.overriddenKeys.length > 0 ? write.overriddenKeys : undefined,
  };
}

/** Build the ledger's per-file provenance: action, post-install hash, and the
 * pre-install backup path (for merged/overwritten files) so rollback can reverse it. */
function toWriteRecords(
  prepared: readonly PreparedWrite[],
  backups: readonly InstallWrite[],
): WriteRecord[] {
  return prepared.map((write) => {
    const backup = backups.find((entry) => entry.path === write.path);
    const record: WriteRecord = {
      path: write.path,
      action: write.action,
      hash: `sha256:${createHash("sha256").update(write.finalContents).digest("hex")}`,
    };

    return backup?.backupPath !== undefined
      ? { ...record, backupPath: backup.backupPath }
      : record;
  });
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isWriteContained(
  path: string,
  context: PlanContext,
  homeClaudeJson: string,
): boolean {
  return (
    isInsideRoot(context.projectRoot, path) ||
    isInsideRoot(context.claudeHome, path) ||
    path === homeClaudeJson
  );
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}
