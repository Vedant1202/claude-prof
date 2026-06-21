import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadInstalledProfileState,
  recordInstalledProfile,
} from "../src/state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-state-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("installed profile state", () => {
  it("loads empty state when no state file exists", async () => {
    await expect(
      loadInstalledProfileState(join(tempDir, ".cprof-state.json")),
    ).resolves.toEqual({
      version: 1,
      installs: [],
    });
  });

  it("records installed profiles and upserts by source plus target", async () => {
    const path = join(tempDir, ".cprof-state.json");

    await recordInstalledProfile(path, {
      name: "Team Base",
      version: "1.0.0",
      source: "github:team/base",
      target: "project",
      profileScope: "project",
      includesGlobal: false,
      installedAt: "2026-05-23T00:00:00.000Z",
    });
    await recordInstalledProfile(path, {
      name: "Team Base",
      version: "1.1.0",
      source: "github:team/base",
      target: "project",
      profileScope: "project",
      includesGlobal: false,
      installedAt: "2026-05-24T00:00:00.000Z",
    });

    const state = await loadInstalledProfileState(path);
    expect(state.installs).toHaveLength(1);
    expect(state.installs[0]?.version).toBe("1.1.0");
    await expect(readFile(path, "utf8")).resolves.toContain("github:team/base");
  });
});
