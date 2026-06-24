import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { installProfile } from "@cprof/core";

import {
  emitJson,
  parseCommonFlags,
  type CommandWriter,
} from "../command-utils.js";

export interface NewCommandOptions {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

type ParseNewResult =
  | { readonly valid: true; readonly mode: "list" }
  | {
      readonly valid: true;
      readonly mode: "scaffold";
      readonly source: string;
      readonly targetDir: string;
      readonly force: boolean;
    }
  | { readonly valid: false; readonly error: string };

/**
 * `cprof new <profile|name> [dir]`: scaffold a fresh project from a profile — a
 * path, or a named template under `~/.cprof/templates`. A thin front over
 * `installProfile` with one contract change vs `install`: it refuses to touch
 * anything that already exists unless `--force`. A forced overwrite keeps install's
 * backup, so `cprof rollback` can reverse a scaffold. `--list` shows the templates.
 */
export async function runNew(
  flags: readonly string[],
  options: NewCommandOptions,
): Promise<number> {
  const { json, quiet, rest } = parseCommonFlags(flags);
  const parsed = parseNewFlags(rest);

  if (parsed.valid === false) {
    options.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const homeDir = options.homeDir ?? homedir();

  if (parsed.mode === "list") {
    const templates = listTemplates(homeDir);
    if (json) {
      emitJson(options.stdout, "new", true, { templates });
    } else if (templates.length === 0) {
      options.stdout.write(
        "No templates yet — create one with `cprof init --template <name>`.\n",
      );
    } else {
      options.stdout.write(`${templates.join("\n")}\n`);
    }
    return 0;
  }

  const profilePath = resolveSource(parsed.source, options.cwd, homeDir);

  if (profilePath === undefined) {
    const templates = listTemplates(homeDir);
    const hint =
      templates.length > 0
        ? ` Available templates: ${templates.join(", ")}.`
        : " No templates yet — create one with `cprof init --template <name>`.";
    if (json) {
      emitJson(options.stdout, "new", false, {
        error: `template "${parsed.source}" not found`,
        templates,
      });
    } else {
      options.stderr.write(`template "${parsed.source}" not found.${hint}\n`);
    }
    return 2;
  }

  const installInput = {
    profilePath,
    cwd: resolve(options.cwd, parsed.targetDir),
    homeDir,
    env: options.env,
    installSource: parsed.source,
  };

  // Pre-flight: plan with force so the plan is complete, then refuse if it would
  // touch any file that already exists. `new` creates; it never silently overwrites.
  const plan = await installProfile({
    ...installInput,
    dryRun: true,
    force: true,
  });

  if (!plan.ok) {
    if (json) {
      emitJson(options.stdout, "new", false, { errors: plan.errors });
    } else {
      options.stderr.write(plan.report);
    }
    return plan.exitCode;
  }

  const existing = [
    ...new Set(
      plan.writes
        .filter((write) => write.action !== "created")
        .map((write) => write.path),
    ),
  ];

  if (existing.length > 0 && !parsed.force) {
    if (json) {
      emitJson(options.stdout, "new", false, { refused: true, existing });
    } else {
      options.stderr.write(
        `refusing to scaffold: these files already exist (pass --force to overwrite):\n${existing
          .map((path) => `  ${path}`)
          .join("\n")}\n`,
      );
    }
    return 1;
  }

  if (plan.writes.length === 0) {
    if (json) {
      emitJson(options.stdout, "new", true, { writes: [] });
    } else if (!quiet) {
      options.stderr.write(
        "Nothing to scaffold (the profile has no project content)\n",
      );
    }
    return 0;
  }

  const result = await installProfile({
    ...installInput,
    dryRun: false,
    force: parsed.force,
  });

  if (json) {
    emitJson(options.stdout, "new", result.ok, {
      target: parsed.targetDir,
      writes: result.writes,
      backups: result.backups,
      missingSecrets: result.missingSecrets,
      errors: result.errors,
    });
    return result.exitCode;
  }

  if (!result.ok) {
    options.stderr.write(result.report);
    return result.exitCode;
  }

  if (!quiet) {
    const count = result.writes.length;
    options.stdout.write(
      `Scaffolded ${count} file${count === 1 ? "" : "s"} into ${parsed.targetDir}\n`,
    );
  }

  return result.exitCode;
}

/**
 * Resolve `<source>` to a profile path: an explicit path (a separator, `.json`, or
 * an existing path) is used as-is; otherwise a bare token is looked up as a named
 * template under `~/.cprof/templates/<name>/claude-profile.json`. Returns undefined
 * when a bare name matches neither a template nor an existing path.
 */
function resolveSource(
  source: string,
  cwd: string,
  homeDir: string,
): string | undefined {
  if (
    source.includes("/") ||
    source.includes("\\") ||
    source.endsWith(".json")
  ) {
    return resolve(cwd, source);
  }

  const templatePath = join(
    homeDir,
    ".cprof",
    "templates",
    source,
    "claude-profile.json",
  );
  if (existsSync(templatePath)) {
    return templatePath;
  }

  const asPath = resolve(cwd, source);
  if (existsSync(asPath)) {
    return asPath;
  }

  return undefined;
}

function listTemplates(homeDir: string): string[] {
  const root = join(homeDir, ".cprof", "templates");
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(root, entry.name, "claude-profile.json")),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function parseNewFlags(flags: readonly string[]): ParseNewResult {
  let source: string | undefined;
  let targetDir = ".";
  let force = false;
  let list = false;
  let positionals = 0;

  for (const flag of flags) {
    if (flag === "--force") {
      force = true;
      continue;
    }

    if (flag === "--list") {
      list = true;
      continue;
    }

    if (flag.startsWith("--")) {
      return { valid: false, error: `unknown new flag: ${flag}` };
    }

    if (positionals === 0) {
      source = flag;
    } else if (positionals === 1) {
      targetDir = flag;
    } else {
      return { valid: false, error: `unexpected new argument: ${flag}` };
    }
    positionals += 1;
  }

  if (list) {
    return { valid: true, mode: "list" };
  }

  if (source === undefined) {
    return { valid: false, error: "new requires a profile or template name" };
  }

  return { valid: true, mode: "scaffold", source, targetDir, force };
}
