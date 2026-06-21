import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import type { CprofProfile } from "@cprof/schema";

import { isNodeError } from "./fs-utils.js";
import { createInstallPlan, resolveAllowedScopes } from "./install-plan.js";
import { createInstallReport } from "./install-report.js";
import {
  findMissingSecrets,
  resolveEnvPlaceholders,
} from "./install-safety.js";
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
} from "./install-types.js";
import { checkGeneratedOutputForLeaks } from "./leak-check.js";
import { recordInstalledProfile } from "./state.js";
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

  const conflicts = await findConflicts(resolvedWrites);

  if (conflicts.length > 0 && options.force !== true) {
    return createFailureResult({
      exitCode: 1,
      dryRun: options.dryRun === true,
      skipped: plan.skipped,
      conflicts,
      errors: conflicts.map((conflict) => `target exists: ${conflict.path}`),
    });
  }

  const writes = resolvedWrites.map(toPublicWrite);
  const backupRoot = join(
    context.projectRoot,
    ".cprof-backups",
    formatTimestamp(options.now ?? new Date()),
  );
  const backups =
    options.force === true && options.dryRun !== true
      ? await backupConflicts(conflicts, backupRoot, context.projectRoot)
      : [];

  if (options.dryRun !== true) {
    for (const write of resolvedWrites) {
      await mkdir(dirname(write.path), { recursive: true });

      if (write.section === "mcpServers") {
        // Merge into the target document so we never clobber unrelated keys —
        // critical for ~/.claude.json, which holds the user's wider state.
        await writeMergedMcpServers(write.path, write.contents);
      } else {
        await writeFile(write.path, write.contents, "utf8");
      }
    }
    await recordInstalledProfile(statePathForContext(context), {
      name: context.profile.name,
      version: context.profile.version,
      source: options.installSource ?? options.profilePath,
      target: targetForContext(context),
      profileScope: context.profile.profileScope,
      includesGlobal: context.profile.includesGlobal,
      installedAt: (options.now ?? new Date()).toISOString(),
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

async function findConflicts(
  writes: readonly PlannedWrite[],
): Promise<readonly InstallConflict[]> {
  const conflicts: InstallConflict[] = [];

  for (const write of writes) {
    try {
      await stat(write.path);
      conflicts.push({
        path: write.path,
        section: write.section,
        name: write.name,
      });
    } catch (error) {
      if (!(isNodeError(error) && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  return conflicts.sort((left, right) => left.path.localeCompare(right.path));
}

async function backupConflicts(
  conflicts: readonly InstallConflict[],
  backupRoot: string,
  projectRoot: string,
): Promise<readonly InstallWrite[]> {
  const backups: InstallWrite[] = [];

  for (const conflict of conflicts) {
    const relativePath = relative(projectRoot, conflict.path);
    const backupPath = join(
      backupRoot,
      relativePath.startsWith("..") ? basename(conflict.path) : relativePath,
    );
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

function toPublicWrite(write: PlannedWrite): InstallWrite {
  return {
    source: write.source,
    section: write.section,
    name: write.name,
    path: write.path,
  };
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

async function writeMergedMcpServers(
  path: string,
  contents: string,
): Promise<void> {
  const incoming = JSON.parse(contents) as { mcpServers?: unknown };
  const existing = await readJsonObject(path);
  const existingServers = isRecord(existing.mcpServers)
    ? existing.mcpServers
    : {};
  const incomingServers = isRecord(incoming.mcpServers)
    ? incoming.mcpServers
    : {};
  const merged = {
    ...existing,
    mcpServers: { ...existingServers, ...incomingServers },
  };

  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
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
