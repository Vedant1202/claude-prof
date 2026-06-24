import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

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

  const homeDir = options.homeDir ?? homedir();
  const outDir =
    parsed.template !== undefined
      ? join(homeDir, ".cprof", "templates", parsed.template)
      : parsed.outDir !== undefined
        ? resolve(options.cwd, parsed.outDir)
        : options.cwd;

  const scan = await scanClaudeProfile({
    name: createProfileName(options.cwd, parsed.mode, parsed.includeGlobal),
    version: "1.0.0",
    cwd: options.cwd,
    homeDir,
    outputRoot: outDir,
    mode: parsed.mode,
    includeGlobal: parsed.mode === "project" ? parsed.includeGlobal : false,
  });

  return finalizeProfileWrite({
    command: "init",
    cwd: options.cwd,
    outDir,
    scan,
    json,
    quiet,
    writeGitignore: parsed.writeGitignore,
    writeReport: parsed.writeReport,
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
      readonly outDir?: string;
      readonly template?: string;
      readonly writeGitignore: boolean;
      readonly writeReport: boolean;
    }
  | {
      readonly valid: true;
      readonly mode: "global";
      readonly includeGlobal?: false;
      readonly outDir?: string;
      readonly template?: string;
      readonly writeGitignore: boolean;
      readonly writeReport: boolean;
    }
  | { readonly valid: false; readonly error: string };

function parseInitFlags(flags: readonly string[]): ParsedInitFlags {
  let global = false;
  let includeGlobal = false;
  let outDir: string | undefined;
  let template: string | undefined;
  let writeGitignore = true;
  let writeReport = true;

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];

    if (flag === "--global") {
      global = true;
    } else if (flag === "--include-global") {
      includeGlobal = true;
    } else if (flag === "--no-gitignore") {
      writeGitignore = false;
    } else if (flag === "--no-report") {
      writeReport = false;
    } else if (flag === "--template") {
      const value = flags[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { valid: false, error: "init --template requires a name" };
      }
      template = value;
      index += 1;
    } else if (flag === "--out") {
      const value = flags[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { valid: false, error: "init --out requires a directory" };
      }
      outDir = value;
      index += 1;
    } else {
      return { valid: false, error: `unknown init flag: ${flag}` };
    }
  }

  if (global && includeGlobal) {
    return {
      valid: false,
      error: "init cannot combine --global and --include-global",
    };
  }

  if (template !== undefined && outDir !== undefined) {
    return {
      valid: false,
      error: "init cannot combine --template and --out",
    };
  }

  if (global) {
    return {
      valid: true,
      mode: "global",
      includeGlobal: false,
      outDir,
      template,
      writeGitignore,
      writeReport,
    };
  }

  return {
    valid: true,
    mode: "project",
    includeGlobal,
    outDir,
    template,
    writeGitignore,
    writeReport,
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
