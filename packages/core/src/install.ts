import {
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import type {
  CprofProfile,
  McpServer,
  ProfileItem,
  ProfileScope,
} from "@cprof/schema";

import { checkGeneratedOutputForLeaks } from "./leak-check.js";
import { validateProfile } from "./validate.js";

export type InstallScope = "project" | "global" | "include-global";
export type InstallExitCode = 0 | 1 | 2 | 3;

export interface InstallProfileOptions {
  readonly profilePath: string;
  readonly cwd: string;
  readonly homeDir: string;
  readonly scope?: InstallScope;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: Date;
}

export interface InstallWrite {
  readonly source: "generated" | "asset";
  readonly section: string;
  readonly name: string;
  readonly path: string;
  readonly backupPath?: string;
}

export interface InstallConflict {
  readonly path: string;
  readonly section: string;
  readonly name: string;
}

export interface InstallSkipped {
  readonly section: string;
  readonly name: string;
  readonly reason:
    | "scope-filtered"
    | "hook-inventory-only"
    | "plugin-inventory-only"
    | "missing-asset"
    | "unsafe-path";
}

export interface InstallResult {
  readonly ok: boolean;
  readonly exitCode: InstallExitCode;
  readonly dryRun: boolean;
  readonly writes: readonly InstallWrite[];
  readonly conflicts: readonly InstallConflict[];
  readonly skipped: readonly InstallSkipped[];
  readonly backups: readonly InstallWrite[];
  readonly missingSecrets: readonly string[];
  readonly errors: readonly string[];
  readonly report: string;
}

interface PlannedWrite {
  readonly source: "generated" | "asset";
  readonly section: string;
  readonly name: string;
  readonly path: string;
  readonly contents: string;
}

interface PlanContext {
  readonly profile: CprofProfile;
  readonly profileDir: string;
  readonly projectRoot: string;
  readonly claudeHome: string;
  readonly allowedScopes: readonly ProfileScope[];
  readonly env: Readonly<Record<string, string | undefined>>;
}

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

  const leakCheck = checkGeneratedOutputForLeaks(
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
      await writeFile(write.path, write.contents, "utf8");
    }
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
      return { category: "not-found", errors: [`file not found: ${profilePath}`] };
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
      errors: [error instanceof Error ? error.message : "profile JSON is invalid"],
    };
  }
}

function resolveAllowedScopes(
  profile: CprofProfile,
  scope: InstallScope | undefined,
): readonly ProfileScope[] {
  if (scope === "global") {
    return ["global"];
  }

  if (scope === "include-global") {
    return ["project", "global"];
  }

  if (profile.profileScope === "global") {
    return ["global"];
  }

  return ["project"];
}

async function createInstallPlan(
  context: PlanContext,
): Promise<{
  readonly writes: readonly PlannedWrite[];
  readonly skipped: readonly InstallSkipped[];
}> {
  const writes: PlannedWrite[] = [];
  const skipped: InstallSkipped[] = [];

  addJsonWrite(writes, context, "settings", "settings", context.profile.settings);
  addJsonWrite(
    writes,
    context,
    "mcpServers",
    "mcpServers",
    filterMcpServers(context.profile.mcpServers, context.allowedScopes),
  );

  for (const section of ["memory", "rules", "skills", "commands", "agents"] as const) {
    const entries = context.profile[section] ?? {};

    for (const [name, item] of Object.entries(entries)) {
      if (!isScopeAllowed(item.scope, context.allowedScopes)) {
        skipped.push({ section, name, reason: "scope-filtered" });
        continue;
      }

      const assetWrites = await createAssetWrites(context, section, name, item);

      if (assetWrites.length === 0) {
        skipped.push({ section, name, reason: "missing-asset" });
        continue;
      }

      writes.push(...assetWrites);
    }
  }

  for (const name of Object.keys(context.profile.hooks ?? {})) {
    skipped.push({ section: "hooks", name, reason: "hook-inventory-only" });
  }

  for (const name of Object.keys(context.profile.plugins ?? {})) {
    skipped.push({ section: "plugins", name, reason: "plugin-inventory-only" });
  }

  return { writes: writes.sort(compareWrites), skipped: skipped.sort(compareSkipped) };
}

function addJsonWrite(
  writes: PlannedWrite[],
  context: PlanContext,
  section: "settings" | "mcpServers",
  name: string,
  value: unknown,
): void {
  if (value === undefined || (isRecord(value) && Object.keys(value).length === 0)) {
    return;
  }

  for (const scope of context.allowedScopes) {
    const path =
      section === "settings"
        ? scope === "global"
          ? join(context.claudeHome, "settings.json")
          : join(context.projectRoot, ".claude", "settings.json")
        : scope === "global"
          ? join(dirname(context.claudeHome), ".claude.json")
          : join(context.projectRoot, ".mcp.json");

    writes.push({
      source: "generated",
      section,
      name,
      path,
      contents: `${JSON.stringify(value, null, 2)}\n`,
    });
  }
}

function filterMcpServers(
  servers: CprofProfile["mcpServers"],
  allowedScopes: readonly ProfileScope[],
): Record<string, McpServer> | undefined {
  if (servers === undefined) {
    return undefined;
  }

  const filtered = Object.fromEntries(
    Object.entries(servers)
      .filter(([, server]) => isScopeAllowed(server.scope, allowedScopes))
      .map(([name, server]) => [name, omitInstallMetadata(server)]),
  );

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

async function createAssetWrites(
  context: PlanContext,
  section: "memory" | "rules" | "skills" | "commands" | "agents",
  name: string,
  item: ProfileItem,
): Promise<readonly PlannedWrite[]> {
  const sourceRoot = safeResolve(context.profileDir, item.source);

  if (sourceRoot === undefined) {
    return [];
  }

  try {
    const sourceStat = await lstat(sourceRoot);
    const targetRoot = targetRootForSection(context, section, item.scope, name);

    if (targetRoot === undefined) {
      return [];
    }

    if (sourceStat.isDirectory()) {
      const files = await listFiles(sourceRoot);

      return Promise.all(
        files.map(async (file) => ({
          source: "asset" as const,
          section,
          name,
          path: join(targetRoot, relative(sourceRoot, file)),
          contents: await readFile(file, "utf8"),
        })),
      );
    }

    return [
      {
        source: "asset",
        section,
        name,
        path: sourceFileTarget(targetRoot, section, name, sourceRoot),
        contents: await readFile(sourceRoot, "utf8"),
      },
    ];
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function targetRootForSection(
  context: PlanContext,
  section: "memory" | "rules" | "skills" | "commands" | "agents",
  scope: ProfileScope | undefined,
  name: string,
): string | undefined {
  const targetScope = scope ?? context.allowedScopes[0];

  if (targetScope === undefined || !context.allowedScopes.includes(targetScope)) {
    return undefined;
  }

  const root =
    targetScope === "global" ? context.claudeHome : join(context.projectRoot, ".claude");

  if (section === "memory") {
    return root;
  }

  if (section === "rules") {
    return join(root, "rules");
  }

  if (section === "skills") {
    return join(root, section, name);
  }

  return join(root, section);
}

function sourceFileTarget(
  targetRoot: string,
  section: "memory" | "rules" | "skills" | "commands" | "agents",
  name: string,
  sourcePath: string,
): string {
  if (section === "memory") {
    return join(targetRoot, basename(sourcePath));
  }

  if (section === "rules" || section === "commands" || section === "agents") {
    return join(targetRoot, `${name}.md`);
  }

  return join(targetRoot, basename(sourcePath));
}

async function listFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);

      if (entry.isSymbolicLink()) {
        return [];
      }

      if (entry.isDirectory()) {
        return listFiles(path);
      }

      return [path];
    }),
  );

  return files.flat().sort();
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

function findMissingSecrets(
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

function resolveEnvPlaceholders(
  value: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return value.replaceAll(
    /\$\{env:([A-Za-z_][A-Za-z0-9_]*)}/g,
    (_placeholder, name: string) => env[name] ?? "",
  );
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

export function createInstallReport(input: {
  readonly dryRun: boolean;
  readonly writes: readonly InstallWrite[];
  readonly conflicts: readonly InstallConflict[];
  readonly skipped: readonly InstallSkipped[];
  readonly backups: readonly InstallWrite[];
  readonly errors: readonly string[];
}): string {
  const lines = [
    "cprof install report",
    "",
    `Mode: ${input.dryRun ? "dry-run" : "apply"}`,
    "",
    `Writes: ${input.writes.length}`,
    ...input.writes
      .map((write) => `- ${write.section}/${write.name}: ${write.path}`)
      .sort(),
    "",
    `Conflicts: ${input.conflicts.length}`,
    ...input.conflicts
      .map((conflict) => `- ${conflict.section}/${conflict.name}: ${conflict.path}`)
      .sort(),
    "",
    `Backups: ${input.backups.length}`,
    ...input.backups
      .map((backup) => `- ${backup.path} -> ${backup.backupPath ?? ""}`)
      .sort(),
    "",
    `Skipped: ${input.skipped.length}`,
    ...input.skipped
      .map((skip) => `- ${skip.section}/${skip.name}: ${skip.reason}`)
      .sort(),
    "",
    `Errors: ${input.errors.length}`,
    ...input.errors.map((error) => `- ${error}`).sort(),
  ];

  return `${lines.join("\n")}\n`;
}

function omitInstallMetadata<T extends Record<string, unknown>>(value: T): T {
  const { scope: _scope, private: _private, ...rest } = value;

  return rest as T;
}

function toPublicWrite(write: PlannedWrite): InstallWrite {
  return {
    source: write.source,
    section: write.section,
    name: write.name,
    path: write.path,
  };
}

function safeResolve(root: string, path: string): string | undefined {
  if (isAbsolute(path)) {
    return undefined;
  }

  const resolved = resolve(root, path);
  const relativePath = relative(root, resolved);

  return relativePath.startsWith("..") || isAbsolute(relativePath)
    ? undefined
    : resolved;
}

function isScopeAllowed(
  scope: ProfileScope | undefined,
  allowedScopes: readonly ProfileScope[],
): boolean {
  return scope === undefined || allowedScopes.includes(scope);
}

function compareWrites(left: PlannedWrite, right: PlannedWrite): number {
  return left.path.localeCompare(right.path);
}

function compareSkipped(left: InstallSkipped, right: InstallSkipped): number {
  return `${left.section}/${left.name}`.localeCompare(
    `${right.section}/${right.name}`,
  );
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
