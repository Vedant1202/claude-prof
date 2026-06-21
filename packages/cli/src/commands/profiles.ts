import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  loadInstalledProfileState,
  type InstalledProfileRecord,
} from "@cprof/core";

import { emitJson, parseCommonFlags } from "../command-utils.js";

export interface ProfilesCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedProfilesFlags {
  readonly valid: true;
  readonly global: boolean;
}

export async function runProfiles(
  flags: readonly string[],
  options: ProfilesCommandOptions,
): Promise<number> {
  const { json, rest } = parseCommonFlags(flags);
  const parsed = parseProfilesFlags(rest);

  if (!parsed.valid) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const state = await loadInstalledProfileState(
    statePath(options.cwd, options.homeDir ?? homedir(), parsed.global),
  );

  if (json) {
    emitJson(options.stdout, "profiles", true, { installs: state.installs });
  } else {
    options.stdout.write(formatInstalls(state.installs));
  }

  return 0;
}

type ParseProfilesResult =
  | ParsedProfilesFlags
  | { readonly valid: false; readonly error: string };

function parseProfilesFlags(flags: readonly string[]): ParseProfilesResult {
  const global = flags.includes("--global");
  const positional = flags.filter((flag) => flag !== "--global");
  const unknownFlag = positional.find((flag) => flag.startsWith("--"));

  if (unknownFlag !== undefined) {
    return { valid: false, error: `unknown profiles flag: ${unknownFlag}` };
  }

  const [action, extra] = positional;

  if (action !== "list") {
    return { valid: false, error: "profiles requires action: list" };
  }

  if (extra !== undefined) {
    return { valid: false, error: `unexpected profiles argument: ${extra}` };
  }

  return { valid: true, global };
}

function statePath(cwd: string, homeDir: string, global: boolean): string {
  return global
    ? join(resolve(homeDir), ".claude", ".cprof-state.json")
    : join(resolve(cwd), ".cprof-state.json");
}

function formatInstalls(installs: readonly InstalledProfileRecord[]): string {
  if (installs.length === 0) {
    return "No installed profiles recorded.\n";
  }

  return `${installs.map(formatInstallLine).join("\n")}\n`;
}

function formatInstallLine(install: InstalledProfileRecord): string {
  return `${install.name} ${install.version} (${install.target}) - ${install.source}`;
}
