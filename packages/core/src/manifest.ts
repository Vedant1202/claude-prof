import type {
  CprofProfile,
  HookInventory,
  McpServer,
  ProfileItem,
} from "@cprof/schema";

import {
  redactSecrets,
  redactSecretsAsync,
  type Redaction,
  type RedactionResult,
} from "./redactor.js";
import type { ProfileSourceMetadata } from "./sources.js";

export type ManifestSectionMap<T> = Readonly<Record<string, T>>;

export interface BuildManifestInput {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly claudeCode?: string;
  readonly sourceMetadata: ProfileSourceMetadata;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly memory?: ManifestSectionMap<ProfileItem>;
  readonly rules?: ManifestSectionMap<ProfileItem>;
  readonly plugins?: ManifestSectionMap<Readonly<Record<string, unknown>>>;
  readonly skills?: ManifestSectionMap<ProfileItem>;
  readonly commands?: ManifestSectionMap<ProfileItem>;
  readonly agents?: ManifestSectionMap<ProfileItem>;
  readonly hooks?: ManifestSectionMap<HookInventory>;
  readonly mcpServers?: ManifestSectionMap<McpServer>;
}

export interface BuildManifestResult {
  readonly manifest: CprofProfile;
  readonly redactions: readonly Redaction[];
}

export function buildManifest(input: BuildManifestInput): CprofProfile {
  return buildManifestWithRedactions(input).manifest;
}

export function buildManifestWithRedactions(
  input: BuildManifestInput,
): BuildManifestResult {
  return finalizeManifest(redactSecrets(assembleManifest(input)));
}

/**
 * Async manifest build used by the scanner/snapshot path. Identical to
 * {@link buildManifestWithRedactions} except redaction also runs Layer A
 * (secretlint provider-key detection).
 */
export async function buildManifestWithRedactionsAsync(
  input: BuildManifestInput,
): Promise<BuildManifestResult> {
  return finalizeManifest(await redactSecretsAsync(assembleManifest(input)));
}

function assembleManifest(input: BuildManifestInput) {
  return compactProfile({
    $schema: "https://cprof.dev/schema/v1.json",
    name: input.name,
    version: input.version,
    description: input.description,
    claudeCode: input.claudeCode,
    profileScope: input.sourceMetadata.profileScope,
    includesGlobal: input.sourceMetadata.includesGlobal,
    sources: input.sourceMetadata.sources,
    settings: input.settings,
    memory: sortRecord(input.memory),
    rules: sortRecord(input.rules),
    plugins: sortRecord(input.plugins),
    skills: sortRecord(input.skills),
    commands: sortRecord(input.commands),
    agents: sortRecord(input.agents),
    hooks: normalizeHooks(input.hooks),
    mcpServers: sortRecord(input.mcpServers),
  });
}

function finalizeManifest(redaction: RedactionResult): BuildManifestResult {
  const redactedManifest = redaction.value as unknown as CprofProfile;

  return {
    manifest: compactProfile({
      ...redactedManifest,
      secrets:
        redaction.requiredSecrets.length > 0
          ? { required: redaction.requiredSecrets, optional: [] }
          : undefined,
    }),
    redactions: redaction.redactions,
  };
}

function normalizeHooks(
  hooks: ManifestSectionMap<HookInventory> | undefined,
): ManifestSectionMap<HookInventory> | undefined {
  if (hooks === undefined) {
    return undefined;
  }

  return sortRecord(
    Object.fromEntries(
      Object.entries(hooks).map(([name, hook]) => [
        name,
        {
          ...hook,
          inventoryOnly: true,
        },
      ]),
    ),
  );
}

function sortRecord<T>(
  value: ManifestSectionMap<T> | undefined,
): ManifestSectionMap<T> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function compactProfile<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
