import { lintSource } from "@secretlint/core";
import { rules as recommendedRules } from "@secretlint/secretlint-rule-preset-recommend";

// Build the secretlint config once. Raw `lintSource` does not expand the preset
// wrapper, so we register the preset's scanner rules directly. Detection is fully
// in-process and offline (regex + entropy rules; no network).
const config = {
  rules: recommendedRules.map((rule) => ({ id: rule.meta.id, rule })),
};

/**
 * Layer A — maintained provider-key detection via secretlint.
 *
 * Returns true when a recommended secretlint rule recognizes `value` as a
 * provider credential (GitHub, Anthropic, OpenAI, Slack, Stripe, GCP, …).
 * Values are scanned as standalone text; key-name and entropy heuristics
 * (Layers B and C) cover secrets without a recognizable provider shape.
 */
export async function detectProviderSecret(value: string): Promise<boolean> {
  if (value.length === 0) {
    return false;
  }

  const result = await lintSource({
    source: { content: value, filePath: "value.txt", contentType: "text" },
    options: { config, noPhysicFilePath: true },
  });

  return result.messages.length > 0;
}
