import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  fetchProfileReference,
  installProfile,
  isRemoteProfileReference,
  type InstallScope,
  type ProfileReferenceFetcher,
} from "@cprof/core";

export interface InstallCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetcher?: ProfileReferenceFetcher;
  readonly remoteCacheRoot?: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedInstallFlags {
  readonly valid: true;
  readonly profilePath: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly scope?: InstallScope;
}

export async function runInstall(
  flags: readonly string[],
  options: InstallCommandOptions,
): Promise<number> {
  const parsed = parseInstallFlags(flags);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const profilePath = await resolveProfilePath(parsed.profilePath, options);

  if (profilePath.ok === false) {
    options.stderr.write(`${profilePath.errors.join("\n")}\n`);
    return profilePath.exitCode;
  }

  const result = await installProfile({
    profilePath: profilePath.path,
    cwd: options.cwd,
    homeDir: options.homeDir ?? homedir(),
    env: options.env,
    dryRun: parsed.dryRun,
    force: parsed.force,
    scope: parsed.scope,
    installSource: parsed.profilePath,
  });

  const output = result.ok ? options.stdout : options.stderr;
  output.write(result.report);

  if (result.ok) {
    options.stdout.write(
      `${parsed.dryRun ? "Planned" : "Installed"} ${result.writes.length} writes\n`,
    );
  }

  return result.exitCode;
}

async function resolveProfilePath(
  profilePath: string,
  options: InstallCommandOptions,
): Promise<
  | { readonly ok: true; readonly path: string }
  | {
      readonly ok: false;
      readonly exitCode: 1 | 2;
      readonly errors: readonly string[];
    }
> {
  if (!isRemoteProfileReference(profilePath)) {
    return { ok: true, path: resolve(options.cwd, profilePath) };
  }

  const fetched = await fetchProfileReference({
    reference: profilePath,
    cacheRoot: options.remoteCacheRoot,
    fetcher: options.fetcher,
  });

  if (!fetched.ok) {
    return {
      ok: false,
      exitCode: fetched.exitCode,
      errors: fetched.errors,
    };
  }

  return { ok: true, path: fetched.profilePath };
}

type ParseInstallResult =
  | ParsedInstallFlags
  | { readonly valid: false; readonly error: string };

function parseInstallFlags(flags: readonly string[]): ParseInstallResult {
  let profilePath: string | undefined;
  let dryRun = false;
  let force = false;
  let scope: InstallScope | undefined;

  for (const flag of flags) {
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (flag === "--force") {
      force = true;
      continue;
    }

    if (flag === "--global") {
      scope = "global";
      continue;
    }

    if (flag === "--include-global") {
      scope = "include-global";
      continue;
    }

    if (flag.startsWith("--")) {
      return { valid: false, error: `unknown install flag: ${flag}` };
    }

    if (profilePath !== undefined) {
      return { valid: false, error: `unexpected install argument: ${flag}` };
    }

    profilePath = flag;
  }

  if (profilePath === undefined) {
    return { valid: false, error: "install requires a profile path" };
  }

  if (flags.includes("--global") && flags.includes("--include-global")) {
    return {
      valid: false,
      error: "install cannot combine --global and --include-global",
    };
  }

  return {
    valid: true,
    profilePath,
    dryRun,
    force,
    scope,
  };
}
