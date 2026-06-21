import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  createProfileGitignore,
  createScanReport,
  scanClaudeProfile,
  validateProfile,
} from "@cprof/core";

import { parseCommonFlags } from "../command-utils.js";

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
  const { quiet, rest } = parseCommonFlags(flags);
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
  const manifest = scan.manifest;
  const validation = validateProfile(manifest);

  if (!validation.valid) {
    options.stderr.write(`${validation.errors.join("\n")}\n`);
    return validation.exitCode;
  }

  if (!scan.leakCheck.ok) {
    const leakedPaths = [
      ...new Set(scan.leakCheck.leaks.map((leak) => leak.path)),
    ];
    options.stderr.write(
      `refusing to write: redaction left a secret in ${leakedPaths.join(", ")}\n`,
    );
    return 3;
  }

  await writeFile(
    join(options.cwd, "claude-profile.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(options.cwd, ".gitignore"),
    createProfileGitignore(),
    "utf8",
  );
  await writeFile(
    join(options.cwd, "cprof-scan-report.txt"),
    createScanReport(scan.report),
    "utf8",
  );

  if (!quiet) {
    options.stderr.write(
      `Wrote claude-profile.json (${manifest.profileScope}${
        manifest.includesGlobal ? " + global" : ""
      })\n`,
    );
  }

  return 0;
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
