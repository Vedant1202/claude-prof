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

  // Independent engine: secretlint scans the whole output for provider keys.
  if (await detectProviderSecret(output.contents)) {
    leaks.push({ path: output.path, tokenIndex: -1, reason: "known-pattern" });
  }

  // Generic token scan for key-name / JWT / high-entropy leaks.
  const tokens = [...output.contents.matchAll(TOKEN_PATTERN)];

  for (const [tokenIndex, match] of tokens.entries()) {
    const token = match[0];
    const reason = shouldRedactString(stripJsonPunctuation(token), ["value"]);

    if (reason !== undefined) {
      const { line, col } = positionAt(output.contents, match.index ?? 0);
      leaks.push({ path: output.path, tokenIndex, reason, line, col });
    }
  }

  return leaks;
}

function stripJsonPunctuation(value: string): string {
  return value.replace(/^["']+|[",']+$/g, "");
}

/** Translate a byte offset into a 1-based line and column. */
function positionAt(
  contents: string,
  offset: number,
): { readonly line: number; readonly col: number } {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index++) {
    if (contents[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }

  return { line, col: offset - lineStart + 1 };
}
