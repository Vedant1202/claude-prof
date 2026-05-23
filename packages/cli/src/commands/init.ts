import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  buildManifest,
  createProfileGitignore,
  createProfileSourceMetadata,
  createScanReport,
  readInstalledPlugins,
  validateProfile,
} from "@cprof/core";

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
  const parsed = parseInitFlags(flags);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const sourceMetadata = createProfileSourceMetadata(parsed);
  const plugins = shouldIncludeGlobalPlugins(parsed)
    ? await readInstalledPlugins(join(options.homeDir ?? homedir(), ".claude"))
    : {};
  const manifest = buildManifest({
    name: createProfileName(options.cwd, parsed.mode, parsed.includeGlobal),
    version: "1.0.0",
    sourceMetadata,
    plugins,
  });
  const validation = validateProfile(manifest);

  if (!validation.valid) {
    options.stderr.write(`${validation.errors.join("\n")}\n`);
    return validation.exitCode;
  }

  await writeFile(
    join(options.cwd, "claude-profile.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(options.cwd, ".gitignore"), createProfileGitignore(), "utf8");
  await writeFile(
    join(options.cwd, "cprof-scan-report.txt"),
    createScanReport({
      detected: {
        agents: 0,
        commands: 0,
        hooks: 0,
        mcpServers: 0,
        memory: 0,
        plugins: Object.keys(plugins).length,
        rules: 0,
        skills: 0,
      },
    }),
    "utf8",
  );

  options.stdout.write(
    `Wrote claude-profile.json (${manifest.profileScope}${
      manifest.includesGlobal ? " + global" : ""
    })\n`,
  );

  return 0;
}

function shouldIncludeGlobalPlugins(parsed: ParsedInitFlags): boolean {
  return (
    parsed.valid === true &&
    (parsed.mode === "global" || parsed.includeGlobal === true)
  );
}

type ParsedInitFlags =
  | { readonly valid: true; readonly mode: "project"; readonly includeGlobal: boolean }
  | { readonly valid: true; readonly mode: "global"; readonly includeGlobal?: false }
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
