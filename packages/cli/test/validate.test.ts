import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildManifest, createProfileSourceMetadata } from "@cprof/core";
import { main } from "../src/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-validate-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof validate", () => {
  it("returns 0 for valid profiles", async () => {
    const stdout = createWritable();
    await writeProfile(
      "valid.json",
      buildManifest({
        name: "valid",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "project" }),
      }),
    );

    await expect(
      main(["validate", "valid.json"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);

    expect(stdout.output).toBe("valid\n");
  });

  it("returns 1 for schema-invalid profiles", async () => {
    const stderr = createWritable();
    await writeProfile("invalid.json", { name: "invalid" });

    await expect(
      main(["validate", "invalid.json"], { cwd: tempDir, stderr }),
    ).resolves.toBe(1);

    expect(stderr.output).toContain("must have required property");
  });

  it("returns 2 for missing profiles", async () => {
    const stderr = createWritable();

    await expect(
      main(["validate", "missing.json"], { cwd: tempDir, stderr }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("file not found");
  });

  it("supports machine-readable JSON output", async () => {
    const stdout = createWritable();
    await writeProfile(
      "valid.json",
      buildManifest({
        name: "valid",
        version: "1.0.0",
        sourceMetadata: createProfileSourceMetadata({ mode: "global" }),
      }),
    );

    await expect(
      main(["validate", "--json", "valid.json"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);

    expect(JSON.parse(stdout.output)).toMatchObject({ valid: true, exitCode: 0 });
  });
});

async function writeProfile(name: string, value: unknown): Promise<void> {
  await writeFile(join(tempDir, name), `${JSON.stringify(value)}\n`, "utf8");
}

function createWritable(): Pick<NodeJS.WriteStream, "write"> & {
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
