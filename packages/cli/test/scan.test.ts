import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;

const SECRET = "ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-scan-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof scan", () => {
  it("exits 0 for a clean file", async () => {
    await writeFile(
      join(tempDir, "clean.txt"),
      "nothing to see here\n",
      "utf8",
    );
    const stdout = createWritable();

    await expect(
      main(["scan", "clean.txt"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);
  });

  it("exits 3 and reports the finding for a file with a secret", async () => {
    await writeFile(join(tempDir, "leak.txt"), `token: ${SECRET}\n`, "utf8");
    const stdout = createWritable();

    await expect(
      main(["scan", "leak.txt"], { cwd: tempDir, stdout }),
    ).resolves.toBe(3);

    expect(stdout.output).toContain("leak.txt");
  });

  it("exits 2 for a missing file", async () => {
    const stderr = createWritable();

    await expect(
      main(["scan", "nope.txt"], { cwd: tempDir, stderr }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("file not found");
  });

  it("exits cleanly (no crash) when a path cannot be read as a file", async () => {
    await mkdir(join(tempDir, "adir"));
    const stderr = createWritable();

    await expect(
      main(["scan", "adir"], { cwd: tempDir, stderr }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("adir");
  });

  it("scans multiple files and flags the one with a secret", async () => {
    await writeFile(join(tempDir, "a.txt"), "fine\n", "utf8");
    await writeFile(join(tempDir, "b.txt"), `key=${SECRET}\n`, "utf8");
    const stdout = createWritable();

    await expect(
      main(["scan", "a.txt", "b.txt"], { cwd: tempDir, stdout }),
    ).resolves.toBe(3);

    expect(stdout.output).toContain("b.txt");
  });

  it("emits the scan envelope with --json", async () => {
    await writeFile(join(tempDir, "leak.txt"), `token: ${SECRET}\n`, "utf8");
    const stdout = createWritable();

    await expect(
      main(["scan", "--json", "leak.txt"], { cwd: tempDir, stdout }),
    ).resolves.toBe(3);

    const payload = JSON.parse(stdout.output);
    expect(payload).toMatchObject({ command: "scan", ok: false });
    expect(payload.leaks.length).toBeGreaterThan(0);
    expect(payload.leaks[0]).toHaveProperty("reason");
  });

  it("requires at least one file", async () => {
    const stderr = createWritable();

    await expect(main(["scan"], { cwd: tempDir, stderr })).resolves.toBe(1);

    expect(stderr.output).toContain("usage");
  });

  it("never echoes the secret value in its output", async () => {
    await writeFile(join(tempDir, "leak.txt"), `token: ${SECRET}\n`, "utf8");
    const stdout = createWritable();
    const stderr = createWritable();

    await main(["scan", "leak.txt"], { cwd: tempDir, stdout, stderr });

    expect(stdout.output + stderr.output).not.toContain("ghp_a1B2c3");
  });
});
