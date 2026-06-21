// Labelled redaction corpus — the contract for F3 detection quality.
// Each case is redacted (or not) by feeding `{ [key]: value }` through the
// redactor and checking whether `value` became an `${env:…}` placeholder.
//
// Kept local to @cprof/core's tests (not @cprof/testing) because that package
// already depends on @cprof/core; importing it back would create a cycle.

export interface RedactionCase {
  readonly label: string;
  /** Object key the value sits under (drives the key-name heuristic). */
  readonly key: string;
  readonly value: string;
  /** Expected: should this value be replaced with a placeholder? */
  readonly redact: boolean;
  /** Which layer is expected to catch it (documentation only). */
  readonly layer: "A-provider" | "B-keyname" | "C-entropy" | "none";
}

// Deterministic high-entropy filler so synthetic tokens pass the rules'
// internal quality gates without embedding a real credential.
const fill = (length: number): string => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += alphabet[(index * 7 + 13) % alphabet.length];
  }
  return out;
};

export const REDACTION_CORPUS: readonly RedactionCase[] = [
  // ---- must redact ----
  {
    label: "anthropic api key",
    key: "field",
    value: `sk-ant-api03-${fill(93)}AA`,
    redact: true,
    layer: "A-provider",
  },
  {
    label: "github token",
    key: "field",
    value: `ghp_${fill(36)}`,
    redact: true,
    layer: "A-provider",
  },
  // NOTE: OpenAI is covered by secretlint's rule for real keys, but its shape
  // (a fixed `T3BlbkFJ` infix) can't be synthesized without embedding a real
  // key, so it's documented rather than included as a synthetic corpus case.
  {
    label: "slack bot token",
    key: "field",
    value: `xoxb-123456789012-1234567890123-${fill(24)}`,
    redact: true,
    layer: "A-provider",
  },
  {
    label: "stripe live key",
    key: "field",
    value: `sk_live_${fill(24)}`,
    redact: true,
    layer: "A-provider",
  },
  {
    label: "jwt",
    key: "field",
    value: `eyJ${fill(30)}.eyJ${fill(40)}.${fill(43)}`,
    redact: true,
    layer: "C-entropy",
  },
  {
    label: "camelCase password",
    key: "dbPassword",
    value: "hunter2plaintext",
    redact: true,
    layer: "B-keyname",
  },
  {
    label: "home-grown base64 secret with slash",
    key: "field",
    value: "wJalrXAbCdEMI/K7MDpQ9bPxRfiCYz1Kq2Lm8Nt0u",
    redact: true,
    layer: "C-entropy",
  },
  // ---- must NOT redact ----
  {
    label: "https url",
    key: "field",
    value: "https://api.example.com/v1",
    redact: false,
    layer: "none",
  },
  {
    label: "unix path",
    key: "field",
    value: "/usr/local/bin/node",
    redact: false,
    layer: "none",
  },
  {
    label: "git sha",
    key: "field",
    value: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    redact: false,
    layer: "none",
  },
  {
    label: "uuid",
    key: "field",
    value: "550e8400-e29b-41d4-a716-446655440000",
    redact: false,
    layer: "none",
  },
  {
    label: "model id",
    key: "model",
    value: "claude-opus-4-8",
    redact: false,
    layer: "none",
  },
  {
    label: "semver",
    key: "field",
    value: "1.2.3",
    redact: false,
    layer: "none",
  },
  {
    label: "benign word",
    key: "field",
    value: "sonnet",
    redact: false,
    layer: "none",
  },
  {
    label: "env placeholder",
    key: "field",
    value: "${env:FOO}",
    redact: false,
    layer: "none",
  },
  {
    label: "short slug",
    key: "field",
    value: "deploy",
    redact: false,
    layer: "none",
  },
];
