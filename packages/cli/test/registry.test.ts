import { describe, expect, it } from "vitest";

import { COMMANDS, findCommand, renderOverviewUsage } from "../src/registry.js";

describe("command registry", () => {
  it("lists every supported command", () => {
    expect(COMMANDS.map((command) => command.name)).toEqual([
      "init",
      "refresh",
      "install",
      "validate",
      "diff",
      "profiles",
    ]);
  });

  it("resolves a known command by name", () => {
    expect(findCommand("install")?.name).toBe("install");
  });

  it("returns undefined for an unknown command", () => {
    expect(findCommand("frobnicate")).toBeUndefined();
  });

  it("renders the overview from the table", () => {
    const overview = renderOverviewUsage();

    expect(overview).toContain("Usage: cprof <command>");
    for (const command of COMMANDS) {
      expect(overview).toContain(command.name);
      expect(overview).toContain(command.summary);
    }
    expect(overview).toContain(
      "Docs: https://vedant1202.github.io/claude-prof/",
    );
  });

  it("gives every command a full usage block", () => {
    for (const command of COMMANDS) {
      expect(command.usage).toContain(`cprof ${command.name}`);
    }
  });
});
