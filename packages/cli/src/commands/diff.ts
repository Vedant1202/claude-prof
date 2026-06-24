import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  diffProfiles,
  formatProfileDiff,
  scanClaudeProfile,
  type ProfileDiff,
} from "@cprof/core";

import {
  emitJson,
  isNodeError,
  parseCommonFlags,
  readProfileFile,
} from "../command-utils.js";

export interface DiffCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runDiff(
  flags: readonly string[],
  options: DiffCommandOptions,
): Promise<number> {
  const { json, rest } = parseCommonFlags(flags);

  // One positional → diff the saved profile against a fresh scan of the live
  // machine (drift). Two → compare two profile files (the original behavior).
  if (rest.length === 1) {
    return runLiveDiff(rest[0]!, json, options);
  }

  if (rest.length !== 2) {
    options.stderr.write(
      "usage: cprof diff [--json] <profile> | <a.json> <b.json>\n",
    );
    return 1;
  }

  const leftPath = rest[0]!;
  const rightPath = rest[1]!;

  const left = await readJson(resolve(options.cwd, leftPath), leftPath);
  if (!left.ok) {
    return reportReadError(left, json, options);
  }

  const right = await readJson(resolve(options.cwd, rightPath), rightPath);
  if (!right.ok) {
    return reportReadError(right, json, options);
  }

  return emitDiff(diffProfiles(left.value, right.value), json, options);
}

/**
 * `cprof diff <profile>`: scan the current machine using the profile's own
 * recorded metadata + scope (like `refresh`, so there is no name/version noise),
 * then diff the saved profile against that live snapshot — drift, profile → live.
 * The scan writes its bundle to a throwaway temp dir, removed afterwards.
 */
async function runLiveDiff(
  profilePath: string,
  json: boolean,
  options: DiffCommandOptions,
): Promise<number> {
  const existing = await readProfileFile(resolve(options.cwd, profilePath));

  if (!existing.ok) {
    if (json) {
      emitJson(options.stdout, "diff", false, { errors: existing.errors });
    } else {
      options.stderr.write(`${existing.errors.join("\n")}\n`);
    }
    return existing.exitCode;
  }

  const profile = existing.profile;
  const outputRoot = await mkdtemp(join(tmpdir(), "cprof-live-"));

  try {
    const scan = await scanClaudeProfile({
      name: profile.name,
      version: profile.version,
      description: profile.description,
      claudeCode: profile.claudeCode,
      cwd: options.cwd,
      homeDir: options.homeDir ?? homedir(),
      outputRoot,
      mode: profile.profileScope,
      includeGlobal:
        profile.profileScope === "project" ? profile.includesGlobal : false,
    });

    return emitDiff(diffProfiles(profile, scan.manifest), json, options);
  } finally {
    await rm(outputRoot, { force: true, recursive: true });
  }
}

function emitDiff(
  diff: ProfileDiff,
  json: boolean,
  options: DiffCommandOptions,
): number {
  if (json) {
    // `ok` reports that the command succeeded; `equal` reports whether the two
    // profiles actually match (the diff's success doesn't imply they're equal).
    emitJson(options.stdout, "diff", true, {
      equal: diff.entries.length === 0,
      ...diff,
    });
  } else {
    options.stdout.write(formatProfileDiff(diff));
  }

  return 0;
}

type ReadJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly exitCode: 1 | 2; readonly error: string };

async function readJson(
  filePath: string,
  displayPath: string,
): Promise<ReadJsonResult> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    const message =
      isNodeError(error) && error.code === "ENOENT"
        ? `file not found: ${displayPath}`
        : `cannot read ${displayPath}: ${isNodeError(error) ? error.code : "unknown error"}`;
    return { ok: false, exitCode: 2, error: message };
  }

  try {
    return { ok: true, value: JSON.parse(contents) as unknown };
  } catch {
    return { ok: false, exitCode: 1, error: `invalid JSON in ${displayPath}` };
  }
}

function reportReadError(
  result: { readonly exitCode: 1 | 2; readonly error: string },
  json: boolean,
  options: DiffCommandOptions,
): number {
  if (json) {
    emitJson(options.stdout, "diff", false, { errors: [result.error] });
  } else {
    options.stderr.write(`${result.error}\n`);
  }

  return result.exitCode;
}
