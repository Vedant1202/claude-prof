import { detectProviderSecret } from "./detector.js";
import { shouldRedactString, type RedactionReason } from "./redactor.js";

export interface GeneratedOutput {
  readonly path: string;
  readonly contents: string;
}

export interface OutputLeak {
  readonly path: string;
  readonly tokenIndex: number;
  readonly reason: RedactionReason;
  /** 1-based line of the token, when a position is known (token-scan leaks). */
  readonly line?: number;
  /** 1-based column of the token, when a position is known. */
  readonly col?: number;
}

export interface LeakCheckResult {
  readonly ok: boolean;
  readonly leaks: readonly OutputLeak[];
}

const TOKEN_PATTERN = /[A-Za-z0-9_./+=:-]{12,}/g;

export async function checkGeneratedOutputForLeaks(
  outputs: readonly GeneratedOutput[],
): Promise<LeakCheckResult> {
  const leaks = (
    await Promise.all(outputs.map((output) => findLeaks(output)))
  ).flat();

  return {
    ok: leaks.length === 0,
    leaks,
  };
}

async function findLeaks(output: GeneratedOutput): Promise<OutputLeak[]> {
  const leaks: OutputLeak[] = [];
  const { contents, path } = output;

  // Independent engine: secretlint scans the whole output for provider keys.
  if (await detectProviderSecret(contents)) {
    leaks.push({ path, tokenIndex: -1, reason: "known-pattern" });
  }

  // Generic token scan for key-name / JWT / high-entropy leaks. Tokens arrive in
  // ascending offset order, so a single forward cursor yields each leak's
  // line/col in one O(n) pass rather than rescanning from the start per leak.
  const tokens = [...contents.matchAll(TOKEN_PATTERN)];
  let cursor = 0;
  let line = 1;
  let lineStart = 0;

  for (const [tokenIndex, match] of tokens.entries()) {
    const reason = shouldRedactString(stripJsonPunctuation(match[0]), [
      "value",
    ]);

    if (reason === undefined) {
      continue;
    }

    const offset = match.index ?? 0;
    while (cursor < offset) {
      if (contents[cursor] === "\n") {
        line += 1;
        lineStart = cursor + 1;
      }
      cursor += 1;
    }

    leaks.push({
      path,
      tokenIndex,
      reason,
      line,
      col: offset - lineStart + 1,
    });
  }

  return leaks;
}

function stripJsonPunctuation(value: string): string {
  return value.replace(/^["']+|[",']+$/g, "");
}
