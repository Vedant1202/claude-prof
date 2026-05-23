import { resolve } from "node:path";

import {
  findRegistryProfile,
  listRegistryProfiles,
  loadProfileRegistry,
  searchRegistryProfiles,
  type RegistryProfile,
} from "@cprof/core";

export interface RegistryCommandOptions {
  readonly cwd: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedRegistryFlags {
  readonly valid: true;
  readonly action: "list" | "search" | "show";
  readonly registryPath: string;
  readonly query?: string;
  readonly id?: string;
  readonly json: boolean;
}

export async function runRegistry(
  flags: readonly string[],
  options: RegistryCommandOptions,
): Promise<number> {
  const parsed = parseRegistryFlags(flags);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const registry = await loadProfileRegistry(resolve(options.cwd, parsed.registryPath));

  if (!registry.ok) {
    options.stderr.write(`${registry.errors.join("\n")}\n`);
    return registry.exitCode;
  }

  if (parsed.action === "list") {
    const profiles = listRegistryProfiles(registry.registry);
    options.stdout.write(formatProfiles(profiles, parsed.json));
    return 0;
  }

  if (parsed.action === "search") {
    const profiles = searchRegistryProfiles(registry.registry, parsed.query ?? "");
    options.stdout.write(formatProfiles(profiles, parsed.json));
    return 0;
  }

  const profile = findRegistryProfile(registry.registry, parsed.id ?? "");

  if (profile === undefined) {
    options.stderr.write(`profile not found: ${parsed.id ?? ""}\n`);
    return 2;
  }

  options.stdout.write(formatProfile(profile, parsed.json));
  return 0;
}

type ParseRegistryResult =
  | ParsedRegistryFlags
  | { readonly valid: false; readonly error: string };

function parseRegistryFlags(flags: readonly string[]): ParseRegistryResult {
  const json = flags.includes("--json");
  const positional = flags.filter((flag) => flag !== "--json");
  const unknownFlag = positional.find((flag) => flag.startsWith("--"));

  if (unknownFlag !== undefined) {
    return { valid: false, error: `unknown registry flag: ${unknownFlag}` };
  }

  const [action, registryPath, value, extra] = positional;

  if (!["list", "search", "show"].includes(action ?? "")) {
    return {
      valid: false,
      error: "registry requires action: list, search, or show",
    };
  }

  if (registryPath === undefined) {
    return { valid: false, error: "registry requires an index path" };
  }

  if (extra !== undefined) {
    return { valid: false, error: `unexpected registry argument: ${extra}` };
  }

  if (action === "search" && value === undefined) {
    return { valid: false, error: "registry search requires a query" };
  }

  if (action === "show" && value === undefined) {
    return { valid: false, error: "registry show requires a profile id" };
  }

  return {
    valid: true,
    action: action as "list" | "search" | "show",
    registryPath,
    query: action === "search" ? value : undefined,
    id: action === "show" ? value : undefined,
    json,
  };
}

function formatProfiles(
  profiles: readonly RegistryProfile[],
  json: boolean,
): string {
  if (json) {
    return `${JSON.stringify({ profiles }, null, 2)}\n`;
  }

  if (profiles.length === 0) {
    return "No profiles found.\n";
  }

  return `${profiles.map(formatProfileLine).join("\n")}\n`;
}

function formatProfile(profile: RegistryProfile, json: boolean): string {
  if (json) {
    return `${JSON.stringify(profile, null, 2)}\n`;
  }

  return `${[
    `${profile.id} - ${profile.name}`,
    profile.description,
    `source: ${profile.source}`,
    profile.scope !== undefined ? `scope: ${profile.scope}` : undefined,
    profile.tags !== undefined ? `tags: ${profile.tags.join(", ")}` : undefined,
    profile.author !== undefined ? `author: ${profile.author}` : undefined,
    profile.updatedAt !== undefined ? `updatedAt: ${profile.updatedAt}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")}\n`;
}

function formatProfileLine(profile: RegistryProfile): string {
  const tags =
    profile.tags !== undefined && profile.tags.length > 0
      ? ` [${profile.tags.join(", ")}]`
      : "";

  return `${profile.id} - ${profile.name}${tags}`;
}
