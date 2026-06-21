import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-diff-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("cprof diff", () => {
  it("prints no differences for identical profiles", async () => {
    const stdout = createWritable();
    await writeProfile("a.json", { name: "same" });
    await writeProfile("b.json", { name: "same" });

    await expect(
      main(["diff", "a.json", "b.json"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);

    expect(stdout.output).toBe("No differences.\n");
  });

  it("prints text differences", async () => {
    const stdout = createWritable();
    await writeProfile("a.json", { version: "1.0.0" });
    await writeProfile("b.json", { version: "1.0.1" });

    await expect(
      main(["diff", "a.json", "b.json"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);

    expect(stdout.output).toContain("~ /version: 1.0.0 -> 1.0.1");
  });

  it("exits 2 with a clean message for a missing file (no crash)", async () => {
    await writeProfile("b.json", { name: "x" });
    const stderr = createWritable();

    await expect(
      main(["diff", "missing.json", "b.json"], { cwd: tempDir, stderr }),
    ).resolves.toBe(2);

    expect(stderr.output).toContain("file not found");
  });

  it("emits the envelope with ok:false for a missing file in --json mode", async () => {
    await writeProfile("b.json", { name: "x" });
    const stdout = createWritable();

    await expect(
      main(["diff", "--json", "missing.json", "b.json"], {
        cwd: tempDir,
        stdout,
      }),
    ).resolves.toBe(2);

    expect(JSON.parse(stdout.output)).toMatchObject({
      command: "diff",
      ok: false,
    });
  });

  it("prints JSON differences", async () => {
    const stdout = createWritable();
    await writeProfile("a.json", { commands: {} });
    await writeProfile("b.json", { commands: { deploy: true } });

    await expect(
      main(["diff", "--json", "a.json", "b.json"], { cwd: tempDir, stdout }),
    ).resolves.toBe(0);

    expect(JSON.parse(stdout.output)).toMatchObject({
      command: "diff",
      ok: true,
      entries: [{ kind: "added", path: "/commands/deploy" }],
    });
  });
});

async function writeProfile(name: string, value: unknown): Promise<void> {
  await writeFile(join(tempDir, name), `${JSON.stringify(value)}\n`, "utf8");
}
