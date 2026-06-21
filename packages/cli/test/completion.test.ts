import { describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import { createWritable } from "./helpers.js";

describe("cprof completion", () => {
  it("emits a bash completion script naming the commands", async () => {
    const stdout = createWritable();

    await expect(main(["completion", "bash"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("complete -F");
    expect(stdout.output).toContain("scan");
    expect(stdout.output).toContain("install");
  });

  it("emits a zsh completion script", async () => {
    const stdout = createWritable();

    await expect(main(["completion", "zsh"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("#compdef cprof");
  });

  it("emits a fish completion script", async () => {
    const stdout = createWritable();

    await expect(main(["completion", "fish"], { stdout })).resolves.toBe(0);

    expect(stdout.output).toContain("complete -c cprof");
  });

  it("includes command-specific flags in the bash script", async () => {
    const stdout = createWritable();

    await main(["completion", "bash"], { stdout });

    expect(stdout.output).toContain("--force");
    expect(stdout.output).toContain("--include-global");
  });

  it("errors on an unknown shell", async () => {
    const stderr = createWritable();

    await expect(main(["completion", "powershell"], { stderr })).resolves.toBe(
      1,
    );

    expect(stderr.output).toContain("usage");
  });

  it("errors when no shell is given", async () => {
    const stderr = createWritable();

    await expect(main(["completion"], { stderr })).resolves.toBe(1);
  });
});
