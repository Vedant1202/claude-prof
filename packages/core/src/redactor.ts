export type RedactionReason =
  | "key-name"
  | "known-pattern"
  | "jwt"
  | "high-entropy";

export type RedactedProfileValue =
  | null
  | boolean
  | number
  | string
  | readonly RedactedProfileValue[]
  | { readonly [key: string]: RedactedProfileValue };

export interface Redaction {
  readonly path: string;
  readonly envName: string;
  readonly reason: RedactionReason;
}

export interface RedactionResult {
  readonly value: RedactedProfileValue;
  readonly requiredSecrets: readonly string[];
  readonly redactions: readonly Redaction[];
}

const SENSITIVE_KEY_PATTERN =
  /(^|_|-)(api[_-]?key|auth|authorization|credential|key|password|secret|token)(_|-|$)/i;

const KNOWN_SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /ghs_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{16,}/,
  /AKIA[0-9A-Z]{16}/,
] as const;

const ENV_PLACEHOLDER_PATTERN = /^\$\{env:[A-Za-z_][A-Za-z0-9_]*}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function redactSecrets(value: unknown): RedactionResult {
  const redactions: Redaction[] = [];
  const requiredSecrets = new Set<string>();
  const redactedValue = redactNode(value, [], redactions, requiredSecrets);

  return {
    value: redactedValue,
    requiredSecrets: [...requiredSecrets].sort(),
    redactions: redactions.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

export function shouldRedactString(
  value: string,
  keyPath: readonly string[],
): RedactionReason | undefined {
  if (value.length === 0 || ENV_PLACEHOLDER_PATTERN.test(value)) {
    return undefined;
  }

  if (keyPath.some((key) => SENSITIVE_KEY_PATTERN.test(key))) {
    return "key-name";
  }

  if (KNOWN_SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    return "known-pattern";
  }

  if (JWT_PATTERN.test(value)) {
    return "jwt";
  }

  if (isHighEntropy(value)) {
    return "high-entropy";
  }

  return undefined;
}

function redactNode(
  value: unknown,
  path: readonly string[],
  redactions: Redaction[],
  requiredSecrets: Set<string>,
): RedactedProfileValue {
  if (typeof value === "string") {
    const reason = shouldRedactString(value, path);

    if (reason === undefined) {
      return value;
    }

    const envName = deriveEnvName(path);
    requiredSecrets.add(envName);
    redactions.push({
      path: formatPath(path),
      envName,
      reason,
    });

    return `\${env:${envName}}`;
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactNode(item, [...path, String(index)], redactions, requiredSecrets),
    );
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [
          key,
          redactNode(item, [...path, key], redactions, requiredSecrets),
        ]),
    );
  }

  return null;
}

function deriveEnvName(path: readonly string[]): string {
  const key = [...path]
    .reverse()
    .find((part) => !/^\d+$/.test(part));
  const fallback = "SECRET";
  const envName = (key ?? fallback)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return envName.length > 0 ? envName : fallback;
}

function formatPath(path: readonly string[]): string {
  return path.length === 0 ? "/" : `/${path.join("/")}`;
}

function isHighEntropy(value: string): boolean {
  if (value.length < 32 || /\s/.test(value)) {
    return false;
  }

  const uniqueCharacters = new Set(value).size;
  const entropy = [...new Set(value)].reduce((total, character) => {
    const occurrences = countOccurrences(value, character);
    const probability = occurrences / value.length;
    return total - probability * Math.log2(probability);
  }, 0);

  return uniqueCharacters >= 16 && entropy >= 4;
}

function countOccurrences(value: string, character: string): number {
  return [...value].filter((candidate) => candidate === character).length;
}
