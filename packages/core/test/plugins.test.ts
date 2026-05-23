import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readInstalledPlugins } from "../src/plugins.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-plugins-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("readInstalledPlugins", () => {
  it("reads installed plugin metadata without plugin internals", async () => {
    await mkdir(join(tempDir, "plugins"), { recursive: true });
    await writeFile(
      join(tempDir, "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "agent-skills@addy-agent-skills": [
            { scope: "user", version: "1.0.0", installPath: "/private/cache" },
          ],
        },
      }),
      "utf8",
    );
    await writeFile(
      join(tempDir, "plugins", "known_marketplaces.json"),
      JSON.stringify({
        "addy-agent-skills": {
          source: { source: "github", repo: "addyosmani/agent-skills" },
        },
      }),
      "utf8",
    );

    await expect(readInstalledPlugins(tempDir)).resolves.toEqual({
      "agent-skills@addy-agent-skills": {
        marketplace: "addy-agent-skills",
        version: "1.0.0",
        source: "https://github.com/addyosmani/agent-skills",
        scope: "global",
        private: true,
      },
    });
  });

  it("returns an empty map when plugin metadata files are missing", async () => {
    await expect(readInstalledPlugins(tempDir)).resolves.toEqual({});
  });
});
