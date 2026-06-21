import { describe, expect, it } from "vitest";

import { redactSecretsAsync } from "../src/redactor.js";
import { REDACTION_CORPUS } from "./redaction-corpus.js";

describe("redaction corpus", () => {
  for (const testCase of REDACTION_CORPUS) {
    it(`${testCase.redact ? "redacts" : "keeps"}: ${testCase.label}`, async () => {
      const result = await redactSecretsAsync({
        [testCase.key]: testCase.value,
      });
      const out = (result.value as Record<string, unknown>)[testCase.key];
      // Redaction replaces the value with a key-derived ${env:NAME} placeholder,
      // so a redacted value differs from the input (this correctly handles a
      // value that is already an ${env:…} placeholder).
      const wasRedacted = out !== testCase.value;

      expect(wasRedacted).toBe(testCase.redact);
    });
  }
});
