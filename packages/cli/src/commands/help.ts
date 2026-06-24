import { type CommandWriter } from "../command-utils.js";
import { findCommand, renderOverviewUsage } from "../registry.js";

export interface HelpCommandOptions {
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

/**
 * `cprof help [command]`: the overview with no target, otherwise the named
 * command's usage. A real registry entry so dispatch, help, and completion all
 * treat it like any other command rather than special-casing it.
 */
export async function runHelp(
  flags: readonly string[],
  options: HelpCommandOptions,
): Promise<number> {
  const target = flags[0];

  if (target === undefined) {
    options.stdout.write(renderOverviewUsage());
    return 0;
  }

  const resolved = findCommand(target);

  if (resolved === undefined) {
    options.stderr.write(
      `unknown command: ${target}\nRun \`cprof --help\` to see available commands.\n`,
    );
    return 1;
  }

  options.stdout.write(`${resolved.usage}\n`);
  return 0;
}
