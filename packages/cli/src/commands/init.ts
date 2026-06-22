import { homedir } from "node:os";
import { basename, resolve } from "node:path";

import { scanClaudeProfile } from "@cprof/core";

import { finalizeProfileWrite, parseCommonFlags } from "../command-utils.js";

export interface InitCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runInit(
  flags: readonly string[],
  options: InitCommandOptions,
): Promise<number> {
  const { json, quiet, rest } = parseCommonFlags(flags);
  const parsed = parseInitFlags(rest);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const scan = await scanClaudeProfile({
    name: createProfileName(options.cwd, parsed.mode, parsed.includeGlobal),
    version: "1.0.0",
    cwd: options.cwd,
    homeDir: options.homeDir ?? homedir(),
    outputRoot: options.cwd,
    mode: parsed.mode,
    includeGlobal: parsed.mode === "project" ? parsed.includeGlobal : false,
  });

  return finalizeProfileWrite({
    command: "init",
    cwd: options.cwd,
    scan,
    json,
    quiet,
    successMessage: `Wrote claude-profile.json (${scan.manifest.profileScope}${
      scan.manifest.includesGlobal ? " + global" : ""
    })`,
    stdout: options.stdout,
    stderr: options.stderr,
  });
}

type ParsedInitFlags =
  | {
      readonly valid: true;
      readonly mode: "project";
      readonly includeGlobal: boolean;
    }
  | {
      readonly valid: true;
      readonly mode: "global";
      readonly includeGlobal?: false;
    }
  | { readonly valid: false; readonly error: string };

function parseInitFlags(flags: readonly string[]): ParsedInitFlags {
  const supportedFlags = new Set(["--global", "--include-global"]);
  const unknownFlag = flags.find((flag) => !supportedFlags.has(flag));

  if (unknownFlag !== undefined) {
    return { valid: false, error: `unknown init flag: ${unknownFlag}` };
  }

  if (flags.includes("--global") && flags.includes("--include-global")) {
    return {
      valid: false,
      error: "init cannot combine --global and --include-global",
    };
  }

  if (flags.includes("--global")) {
    return { valid: true, mode: "global", includeGlobal: false };
  }

  return {
    valid: true,
    mode: "project",
    includeGlobal: flags.includes("--include-global"),
  };
}

function createProfileName(
  cwd: string,
  mode: "project" | "global",
  includeGlobal: boolean | undefined,
): string {
  if (mode === "global") {
    return "global-profile";
  }

  const projectName = basename(resolve(cwd)) || "project";

  return includeGlobal ? `${projectName}-with-global` : projectName;
}
