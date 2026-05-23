import { resolve } from "node:path";

import {
  checkProfilePolicy,
  loadTeamPolicy,
  type PolicyCheckResult,
} from "@cprof/core";

import { readProfileFile, type CommandWriter } from "../command-utils.js";

export interface PolicyCommandOptions {
  readonly cwd: string;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
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

  const profile = await readProfileFile(
    resolve(options.cwd, parsed.profilePath),
  );

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
    return {
      valid: false,
      error: "policy check requires profile and policy paths",
    };
  }

  if (extra !== undefined) {
    return { valid: false, error: `unexpected policy argument: ${extra}` };
  }

  return { valid: true, profilePath, policyPath, json };
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
