import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import type {
  CprofProfile,
  McpServer,
  ProfileItem,
  ProfileScope,
} from "@cprof/schema";

import { isNodeError } from "./fs-utils.js";
import type {
  InstallScope,
  InstallSkipped,
  PlannedWrite,
  PlanContext,
} from "./install-types.js";
import { isRecord } from "./record-utils.js";

export function resolveAllowedScopes(
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

export async function createInstallPlan(context: PlanContext): Promise<{
  readonly writes: readonly PlannedWrite[];
  readonly skipped: readonly InstallSkipped[];
}> {
  const writes: PlannedWrite[] = [];
  const skipped: InstallSkipped[] = [];

  addJsonWrite(
    writes,
    context,
    "settings",
    "settings",
    context.profile.settings,
  );
  addJsonWrite(
    writes,
    context,
    "mcpServers",
    "mcpServers",
    filterMcpServers(context.profile.mcpServers, context.allowedScopes),
  );

  for (const section of [
    "memory",
    "rules",
    "skills",
    "commands",
    "agents",
  ] as const) {
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

  return {
    writes: writes.sort(compareWrites),
    skipped: skipped.sort(compareSkipped),
  };
}

function addJsonWrite(
  writes: PlannedWrite[],
  context: PlanContext,
  section: "settings" | "mcpServers",
  name: string,
  value: unknown,
): void {
  if (
    value === undefined ||
    (isRecord(value) && Object.keys(value).length === 0)
  ) {
    return;
  }

  for (const scope of context.allowedScopes) {
    const path =
      section === "settings"
        ? scope === "global"
          ? join(context.claudeHome, "settings.json")
          : join(context.projectRoot, ".claude", "settings.json")
        : scope === "global"
          ? join(resolve(context.claudeHome, ".."), ".claude.json")
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

  if (
    targetScope === undefined ||
    !context.allowedScopes.includes(targetScope)
  ) {
    return undefined;
  }

  const root =
    targetScope === "global"
      ? context.claudeHome
      : join(context.projectRoot, ".claude");

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

function omitInstallMetadata<T extends Record<string, unknown>>(value: T): T {
  const { scope: _scope, private: _private, ...rest } = value;

  return rest as T;
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
