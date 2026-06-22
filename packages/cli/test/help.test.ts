import { describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

describe("per-command help", () => {
  it("shows init's own usage for `init --help`, not the overview", async () => {
    const stdout = createWritable();

    await expect(main(["init", "--help"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof init");
    expect(stdout.output).toContain("--include-global");
    expect(stdout.output).not.toContain("Usage: cprof <command>");
  });

  it("routes `-h` after a command to that command's usage", async () => {
    const stdout = createWritable();

    await expect(main(["install", "-h"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof install");
    expect(stdout.output).toContain("--dry-run");
  });

  it("shows a command's usage via `help <command>`", async () => {
    const stdout = createWritable();

    await expect(main(["help", "diff"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof diff");
  });

  it("keeps `--help` as the global overview", async () => {
    const stdout = createWritable();

    await expect(main(["--help"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof <command>");
  });

  it("treats `help` with no command as the overview", async () => {
    const stdout = createWritable();

    await expect(main(["help"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("Usage: cprof <command>");
  });

  it("errors on `help <unknown>`", async () => {
    const stderr = createWritable();

    await expect(main(["help", "frobnicate"], { stderr })).resolves.toBe(1);

    expect(stderr.output).toContain("unknown command: frobnicate");
  });
});
