import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  checkProfilePolicy,
  loadTeamPolicy,
  validateProfile,
  type PolicyCheckResult,
} from "@cprof/core";
import type { CprofProfile } from "@cprof/schema";

export interface PolicyCommandOptions {
  readonly cwd: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedPolicyFlags {
  readonly valid: true;
  readonly profilePath: string;
  readonly policyPath: string;
  readonly json: boolean;
}

export async function runPolicy(
  flags: readonly string[],
  options: PolicyCommandOptions,
): Promise<number> {
  const parsed = parsePolicyFlags(flags);

  if (!parsed.valid) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const profile = await readProfile(resolve(options.cwd, parsed.profilePath));

  if (!profile.ok) {
    options.stderr.write(`${profile.errors.join("\n")}\n`);
    return profile.exitCode;
  }

  const policy = await loadTeamPolicy(resolve(options.cwd, parsed.policyPath));

  if (!policy.ok) {
    options.stderr.write(`${policy.errors.join("\n")}\n`);
    return policy.exitCode;
  }

  const result = checkProfilePolicy(profile.profile, policy.policy);
  const output = formatPolicyResult(result, parsed.json);

  if (result.ok) {
    options.stdout.write(output);
    return 0;
  }

  options.stderr.write(output);
  return 1;
}

type ParsePolicyResult =
  | ParsedPolicyFlags
  | { readonly valid: false; readonly error: string };

function parsePolicyFlags(flags: readonly string[]): ParsePolicyResult {
  const [action, ...rest] = flags;

  if (action !== "check") {
    return { valid: false, error: "policy requires action: check" };
  }

  const json = rest.includes("--json");
  const positional = rest.filter((flag) => flag !== "--json");
  const unknownFlag = positional.find((flag) => flag.startsWith("--"));

  if (unknownFlag !== undefined) {
    return { valid: false, error: `unknown policy flag: ${unknownFlag}` };
  }

  const [profilePath, policyPath, extra] = positional;

  if (profilePath === undefined || policyPath === undefined) {
    return { valid: false, error: "policy check requires profile and policy paths" };
  }

  if (extra !== undefined) {
    return { valid: false, error: `unexpected policy argument: ${extra}` };
  }

  return { valid: true, profilePath, policyPath, json };
}

async function readProfile(
  path: string,
): Promise<
  | { readonly ok: true; readonly profile: CprofProfile }
  | { readonly ok: false; readonly exitCode: 1 | 2; readonly errors: readonly string[] }
> {
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
    const validation = validateProfile(value);

    if (!validation.valid) {
      return { ok: false, exitCode: 1, errors: validation.errors };
    }

    return { ok: true, profile: value as CprofProfile };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      errors: [error instanceof Error ? error.message : "profile JSON is invalid"],
    };
  }
}

function formatPolicyResult(result: PolicyCheckResult, json: boolean): string {
  if (json) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  if (result.ok) {
    return "policy passed\n";
  }

  return `${[
    "policy failed",
    ...result.violations.map(
      (violation) => `- ${violation.path}: ${violation.message}`,
    ),
  ].join("\n")}\n`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
