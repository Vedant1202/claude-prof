import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  checkInstalledProfileUpdates,
  loadInstalledProfileState,
  loadProfileRegistry,
  type InstalledProfileRecord,
  type ProfileUpdateStatus,
} from "@cprof/core";

export interface ProfilesCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedProfilesFlags {
  readonly valid: true;
  readonly action: "list" | "outdated";
  readonly global: boolean;
  readonly json: boolean;
  readonly registryPath?: string;
}

export async function runProfiles(
  flags: readonly string[],
  options: ProfilesCommandOptions,
): Promise<number> {
  const parsed = parseProfilesFlags(flags);

  if (!parsed.valid) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const state = await loadInstalledProfileState(
    statePath(options.cwd, options.homeDir ?? homedir(), parsed.global),
  );

  if (parsed.action === "list") {
    options.stdout.write(formatInstalls(state.installs, parsed.json));
    return 0;
  }

  const registryPath = parsed.registryPath;

  if (registryPath === undefined) {
    options.stderr.write("profiles outdated requires a registry path\n");
    return 1;
  }

  const registry = await loadProfileRegistry(
    resolve(options.cwd, registryPath),
  );

  if (!registry.ok) {
    options.stderr.write(`${registry.errors.join("\n")}\n`);
    return registry.exitCode;
  }

  const updates = checkInstalledProfileUpdates(state, registry.registry);
  options.stdout.write(formatUpdates(updates, parsed.json));

  return 0;
}

type ParseProfilesResult =
  | ParsedProfilesFlags
  | { readonly valid: false; readonly error: string };

function parseProfilesFlags(flags: readonly string[]): ParseProfilesResult {
  const global = flags.includes("--global");
  const json = flags.includes("--json");
  const positional = flags.filter(
    (flag) => flag !== "--global" && flag !== "--json",
  );
  const unknownFlag = positional.find((flag) => flag.startsWith("--"));

  if (unknownFlag !== undefined) {
    return { valid: false, error: `unknown profiles flag: ${unknownFlag}` };
  }

  const [action, registryPath, extra] = positional;

  if (!["list", "outdated"].includes(action ?? "")) {
    return {
      valid: false,
      error: "profiles requires action: list or outdated",
    };
  }

  if (extra !== undefined) {
    return { valid: false, error: `unexpected profiles argument: ${extra}` };
  }

  return {
    valid: true,
    action: action as "list" | "outdated",
    global,
    json,
    registryPath,
  };
}

function statePath(cwd: string, homeDir: string, global: boolean): string {
  return global
    ? join(resolve(homeDir), ".claude", ".cprof-state.json")
    : join(resolve(cwd), ".cprof-state.json");
}

function formatInstalls(
  installs: readonly InstalledProfileRecord[],
  json: boolean,
): string {
  if (json) {
    return `${JSON.stringify({ installs }, null, 2)}\n`;
  }

  if (installs.length === 0) {
    return "No installed profiles recorded.\n";
  }

  return `${installs.map(formatInstallLine).join("\n")}\n`;
}

function formatUpdates(
  updates: readonly ProfileUpdateStatus[],
  json: boolean,
): string {
  if (json) {
    return `${JSON.stringify({ updates }, null, 2)}\n`;
  }

  if (updates.length === 0) {
    return "No installed profiles recorded.\n";
  }

  return `${updates
    .map(
      (update) =>
        `${update.installed.name} ${update.installed.version} -> ${
          update.latestVersion ?? "unknown"
        } (${update.status})`,
    )
    .join("\n")}\n`;
}

function formatInstallLine(install: InstalledProfileRecord): string {
  return `${install.name} ${install.version} (${install.target}) - ${install.source}`;
}
