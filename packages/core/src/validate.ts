import { readFile } from "node:fs/promises";

import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { cprofSchema } from "@cprof/schema";

export type ValidationExitCode = 0 | 1 | 2;

export interface ProfileValidationResult {
  readonly valid: boolean;
  readonly exitCode: ValidationExitCode;
  readonly errors: readonly string[];
}

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: false,
  strict: true,
});

const validate = ajv.compile(cprofSchema);

export function validateProfile(value: unknown): ProfileValidationResult {
  const valid = validate(value);

  if (valid) {
    return {
      valid: true,
      exitCode: 0,
      errors: [],
    };
  }

  return {
    valid: false,
    exitCode: 1,
    errors:
      validate.errors?.map((error: ErrorObject) => {
        const location = error.instancePath || "/";
        return `${location} ${error.message ?? "is invalid"}`;
      }) ?? ["profile is invalid"],
  };
}

export async function validateProfileFile(
  filePath: string,
): Promise<ProfileValidationResult> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        valid: false,
        exitCode: 2,
        errors: [`file not found: ${filePath}`],
      };
    }

    throw error;
  }

  try {
    return validateProfile(JSON.parse(contents));
  } catch (error) {
    return {
      valid: false,
      exitCode: 1,
      errors: [
        error instanceof Error ? error.message : "profile JSON is invalid",
      ],
    };
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
