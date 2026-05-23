import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function createWritable(): Pick<NodeJS.WriteStream, "write"> & {
  readonly output: string;
} {
  let output = "";

  return {
    get output() {
      return output;
    },
    write(chunk: string | Uint8Array): boolean {
      output += String(chunk);
      return true;
    },
  };
}

export async function readProfileJson(
  cwd: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(cwd, "claude-profile.json"), "utf8"));
}
