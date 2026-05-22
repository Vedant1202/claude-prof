import {
  shouldRedactString,
  type RedactionReason,
} from "./redactor.js";

export interface GeneratedOutput {
  readonly path: string;
  readonly contents: string;
}

export interface OutputLeak {
  readonly path: string;
  readonly tokenIndex: number;
  readonly reason: RedactionReason;
}

export interface LeakCheckResult {
  readonly ok: boolean;
  readonly leaks: readonly OutputLeak[];
}

const TOKEN_PATTERN = /[A-Za-z0-9_./+=:-]{12,}/g;

export function checkGeneratedOutputForLeaks(
  outputs: readonly GeneratedOutput[],
): LeakCheckResult {
  const leaks = outputs.flatMap((output) => findLeaks(output));

  return {
    ok: leaks.length === 0,
    leaks,
  };
}

function findLeaks(output: GeneratedOutput): OutputLeak[] {
  const leaks: OutputLeak[] = [];
  const tokens = output.contents.matchAll(TOKEN_PATTERN);

  for (const [tokenIndex, match] of [...tokens].entries()) {
    const token = match[0];
    const reason = shouldRedactString(stripJsonPunctuation(token), ["value"]);

    if (reason !== undefined) {
      leaks.push({
        path: output.path,
        tokenIndex,
        reason,
      });
    }
  }

  return leaks;
}

function stripJsonPunctuation(value: string): string {
  return value.replace(/^["']+|[",']+$/g, "");
}
