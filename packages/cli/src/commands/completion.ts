import { COMMANDS, COMMON_FLAGS } from "../registry.js";
import { type CommandWriter } from "../command-utils.js";

export interface CompletionCommandOptions {
  readonly stdout: CommandWriter;
  readonly stderr: CommandWriter;
}

const SHELLS = ["bash", "zsh", "fish"] as const;
type Shell = (typeof SHELLS)[number];

/**
 * Print a shell completion script generated from the command table, so the
 * completions never drift from the real commands and flags. Completes command
 * names and flags; file arguments fall through to the shell's own completion.
 */
export async function runCompletion(
  flags: readonly string[],
  options: CompletionCommandOptions,
): Promise<number> {
  const shell = flags[0];

  if (shell === undefined || flags.length > 1 || !isShell(shell)) {
    options.stderr.write("usage: cprof completion <bash|zsh|fish>\n");
    return 1;
  }

  options.stdout.write(generators[shell]());
  return 0;
}

function isShell(value: string): value is Shell {
  return (SHELLS as readonly string[]).includes(value);
}

/** Command names that can follow `cprof`. */
function commandNames(): readonly string[] {
  return COMMANDS.map((command) => command.name);
}

function flagsFor(name: string): readonly string[] {
  const command = COMMANDS.find((entry) => entry.name === name);
  return command ? [...command.flags, ...COMMON_FLAGS] : [...COMMON_FLAGS];
}

/** Make a string safe to embed inside a single-quoted shell string. */
export function singleQuoteEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

const generators: Record<Shell, () => string> = {
  bash: bashCompletion,
  zsh: zshCompletion,
  fish: fishCompletion,
};

function bashCompletion(): string {
  const names = commandNames().join(" ");
  const branches = COMMANDS.map(
    (command) =>
      `    ${command.name})\n      COMPREPLY=( $(compgen -W "${flagsFor(command.name).join(" ")}" -- "$cur") ) ;;`,
  ).join("\n");

  return `# cprof bash completion — source <(cprof completion bash)
_cprof() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${names} --help --version" -- "$cur") )
    return
  fi
  case "\${COMP_WORDS[1]}" in
${branches}
  esac
}
complete -F _cprof cprof
`;
}

function zshCompletion(): string {
  const describe = COMMANDS.map(
    (command) => `    '${command.name}:${singleQuoteEscape(command.summary)}'`,
  ).join("\n");
  const branches = COMMANDS.map(
    (command) =>
      `    ${command.name}) _values 'flag' ${flagsFor(command.name)
        .map((flag) => `'${flag}'`)
        .join(" ")} ;;`,
  ).join("\n");

  return `#compdef cprof
# cprof zsh completion — source <(cprof completion zsh)
_cprof() {
  local -a commands
  commands=(
${describe}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands 'cprof command' commands
    return
  fi
  case "\${words[2]}" in
${branches}
  esac
}
_cprof "$@"
`;
}

function fishCompletion(): string {
  const header =
    "# cprof fish completion — cprof completion fish > ~/.config/fish/completions/cprof.fish";
  const commands = COMMANDS.map(
    (command) =>
      `complete -c cprof -n __fish_use_subcommand -a ${command.name} -d '${singleQuoteEscape(
        command.summary,
      )}'`,
  );
  const flagLines = COMMANDS.flatMap((command) =>
    flagsFor(command.name).map(
      (flag) =>
        `complete -c cprof -n '__fish_seen_subcommand_from ${command.name}' -l ${flag.replace(
          /^--/,
          "",
        )}`,
    ),
  );

  return `${header}
complete -c cprof -f
${commands.join("\n")}
${flagLines.join("\n")}
`;
}
