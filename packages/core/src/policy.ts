import { readFile } from "node:fs/promises";

import type { CprofProfile } from "@cprof/schema";

export type PolicySection =
  | "settings"
  | "memory"
  | "rules"
  | "plugins"
  | "skills"
  | "commands"
  | "agents"
  | "hooks"
  | "mcpServers";

export interface TeamPolicy {
  readonly version: 1;
  readonly allowGlobal?: boolean;
  readonly allowPrivate?: boolean;
  readonly allowedSections?: readonly PolicySection[];
  readonly blockedSections?: readonly PolicySection[];
  readonly requiredSections?: readonly PolicySection[];
  readonly maxSecrets?: number;
}

export interface PolicyViolation {
  readonly path: string;
  readonly message: string;
}

export interface PolicyCheckResult {
  readonly ok: boolean;
  readonly violations: readonly PolicyViolation[];
}

export type PolicyLoadResult =
  | { readonly ok: true; readonly policy: TeamPolicy }
  | {
      readonly ok: false;
      readonly exitCode: 1 | 2;
      readonly errors: readonly string[];
    };

const POLICY_SECTIONS = [
  "settings",
  "memory",
  "rules",
  "plugins",
  "skills",
  "commands",
  "agents",
  "hooks",
  "mcpServers",
] as const satisfies readonly PolicySection[];

export async function loadTeamPolicy(path: string): Promise<PolicyLoadResult> {
  let contents: string;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: false, exitCode: 2, errors: [`file not found: ${path}`] };
    }

    throw error;
  }

  try {
    const value = JSON.parse(contents) as unknown;
    const errors = validatePolicy(value);

    if (errors.length > 0) {
      return { ok: false, exitCode: 1, errors };
    }

    return { ok: true, policy: value as TeamPolicy };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      errors: [
        error instanceof Error ? error.message : "policy JSON is invalid",
      ],
    };
  }
}

export function checkProfilePolicy(
  profile: CprofProfile,
  policy: TeamPolicy,
): PolicyCheckResult {
  const violations = [
    ...checkGlobalPolicy(profile, policy),
    ...checkPrivatePolicy(profile, policy),
    ...checkSectionPolicy(profile, policy),
    ...checkSecretsPolicy(profile, policy),
  ].sort((left, right) => left.path.localeCompare(right.path));

  return {
    ok: violations.length === 0,
    violations,
  };
}

function validatePolicy(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return ["policy must be an object"];
  }

  const errors: string[] = [];

  if (value.version !== 1) {
    errors.push("/version must be 1");
  }

  for (const field of [
    "allowedSections",
    "blockedSections",
    "requiredSections",
  ]) {
    const sectionValue = value[field];

    if (sectionValue === undefined) {
      continue;
    }

    if (
      !Array.isArray(sectionValue) ||
      sectionValue.some((section) => !isPolicySection(section))
    ) {
      errors.push(`/${field} must be an array of known section names`);
    }
  }

  if (value.maxSecrets !== undefined) {
    if (
      typeof value.maxSecrets !== "number" ||
      !Number.isInteger(value.maxSecrets) ||
      value.maxSecrets < 0
    ) {
      errors.push("/maxSecrets must be a non-negative integer");
    }
  }

  return errors;
}

function checkGlobalPolicy(
  profile: CprofProfile,
  policy: TeamPolicy,
): readonly PolicyViolation[] {
  if (policy.allowGlobal !== false) {
    return [];
  }

  const hasGlobalSource = profile.sources.some(
    (source) => source.scope === "global",
  );

  if (
    profile.profileScope !== "global" &&
    !profile.includesGlobal &&
    !hasGlobalSource
  ) {
    return [];
  }

  return [
    {
      path: "/profileScope",
      message: "global profile content is not allowed by policy",
    },
  ];
}

function checkPrivatePolicy(
  profile: CprofProfile,
  policy: TeamPolicy,
): readonly PolicyViolation[] {
  if (policy.allowPrivate !== false) {
    return [];
  }

  return findPrivatePaths(profile).map((path) => ({
    path,
    message: "private profile content is not allowed by policy",
  }));
}

function checkSectionPolicy(
  profile: CprofProfile,
  policy: TeamPolicy,
): readonly PolicyViolation[] {
  const present = presentSections(profile);
  const violations: PolicyViolation[] = [];

  for (const section of present) {
    if (policy.blockedSections?.includes(section) === true) {
      violations.push({
        path: `/${section}`,
        message: `section is blocked by policy: ${section}`,
      });
    }

    if (
      policy.allowedSections !== undefined &&
      !policy.allowedSections.includes(section)
    ) {
      violations.push({
        path: `/${section}`,
        message: `section is not allowed by policy: ${section}`,
      });
    }
  }

  for (const section of policy.requiredSections ?? []) {
    if (!present.includes(section)) {
      violations.push({
        path: `/${section}`,
        message: `required section is missing: ${section}`,
      });
    }
  }

  return violations;
}

function checkSecretsPolicy(
  profile: CprofProfile,
  policy: TeamPolicy,
): readonly PolicyViolation[] {
  if (policy.maxSecrets === undefined) {
    return [];
  }

  const count = profile.secrets?.required?.length ?? 0;

  if (count <= policy.maxSecrets) {
    return [];
  }

  return [
    {
      path: "/secrets/required",
      message: `required secret count ${count} exceeds policy maximum ${policy.maxSecrets}`,
    },
  ];
}

function presentSections(profile: CprofProfile): readonly PolicySection[] {
  return POLICY_SECTIONS.filter((section) => {
    const value = profile[section];

    return isRecord(value) && Object.keys(value).length > 0;
  });
}

function findPrivatePaths(
  value: unknown,
  path: readonly string[] = [],
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findPrivatePaths(item, [...path, String(index)]),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const matches =
    value.private === true ? [`/${path.join("/") || "profile"}`] : [];

  return [
    ...matches,
    ...Object.entries(value).flatMap(([key, item]) =>
      findPrivatePaths(item, [...path, key]),
    ),
  ];
}

function isPolicySection(value: unknown): value is PolicySection {
  return (
    typeof value === "string" &&
    POLICY_SECTIONS.includes(value as PolicySection)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
