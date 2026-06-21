import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findRegistryProfile,
  listRegistryProfiles,
  loadProfileRegistry,
  searchRegistryProfiles,
} from "../src/registry.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-registry-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("profile registry", () => {
  it("loads and normalizes registry profiles", async () => {
    const path = await writeRegistry({
      version: 1,
      profiles: [
        {
          id: "team/base",
          name: "Team Base",
          source: "github:team/base",
          tags: ["team", "typescript"],
        },
        {
          id: "solo/minimal",
          name: "Solo Minimal",
          source: "https://example.com/minimal.json",
          scope: "project",
        },
      ],
    });

    const result = await loadProfileRegistry(path);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        listRegistryProfiles(result.registry).map((profile) => profile.id),
      ).toEqual(["solo/minimal", "team/base"]);
    }
  });

  it("searches across profile metadata", () => {
    const registry = {
      version: 1 as const,
      profiles: [
        {
          id: "team/base",
          name: "Team Base",
          source: "github:team/base",
          tags: ["typescript"],
        },
        {
          id: "python/data",
          name: "Data Workbench",
          source: "github:python/data",
          description: "Analysis profile",
        },
      ],
    };

    expect(
      searchRegistryProfiles(registry, "type").map((profile) => profile.id),
    ).toEqual(["team/base"]);
    expect(
      searchRegistryProfiles(registry, "analysis").map((profile) => profile.id),
    ).toEqual(["python/data"]);
  });

  it("finds profiles by id", () => {
    const registry = {
      version: 1 as const,
      profiles: [
        { id: "team/base", name: "Team Base", source: "github:team/base" },
      ],
    };

    expect(findRegistryProfile(registry, "team/base")).toMatchObject({
      name: "Team Base",
    });
    expect(findRegistryProfile(registry, "missing")).toBeUndefined();
  });

  it("rejects invalid registries", async () => {
    const path = await writeRegistry({
      version: 1,
      profiles: [
        { id: "duplicate", name: "One", source: "github:one/profile" },
        { id: "duplicate", name: "Two", source: "github:two/profile" },
      ],
    });

    await expect(loadProfileRegistry(path)).resolves.toMatchObject({
      ok: false,
      exitCode: 1,
      errors: ["/profiles/1/id must be unique"],
    });
  });

  it("returns exit code 2 for missing registry files", async () => {
    await expect(
      loadProfileRegistry(join(tempDir, "missing.json")),
    ).resolves.toMatchObject({
      ok: false,
      exitCode: 2,
    });
  });
});

async function writeRegistry(value: unknown): Promise<string> {
  const path = join(tempDir, "registry.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  return path;
}
