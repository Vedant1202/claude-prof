import { access, readFile } from "node:fs/promises";

import { isRecord } from "./record-utils.js";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function readJsonRecord(
  filePath: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    return isRecord(value) ? value : undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
