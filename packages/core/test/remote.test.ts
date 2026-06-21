import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  fetchProfileReference,
  isRemoteProfileReference,
  type ProfileReferenceFetcher,
} from "../src/remote.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cprof-remote-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("isRemoteProfileReference", () => {
  it("detects supported remote references", () => {
    expect(
      isRemoteProfileReference("https://example.com/claude-profile.json"),
    ).toBe(true);
    expect(isRemoteProfileReference("github:owner/repo")).toBe(true);
    expect(isRemoteProfileReference("./claude-profile.json")).toBe(false);
  });
});

describe("fetchProfileReference", () => {
  it("fetches https profile references into a temp profile file", async () => {
    const fetcher = createFetcher(
      "https://example.com/claude-profile.json",
      "{}",
    );

    const result = await fetchProfileReference({
      reference: "https://example.com/claude-profile.json",
      cacheRoot: tempDir,
      fetcher,
    });

    expect(result).toMatchObject({
      ok: true,
      url: "https://example.com/claude-profile.json",
    });
    if (result.ok) {
      await expect(readFile(result.profilePath, "utf8")).resolves.toBe("{}");
    }
  });

  it("maps github shorthand to raw GitHub profile URLs", async () => {
    let requestedUrl = "";
    const fetcher: ProfileReferenceFetcher = async (url) => {
      requestedUrl = url;
      return createResponse(200, "{}");
    };

    const result = await fetchProfileReference({
      reference: "github:owner/repo/profiles/base.json#v1.0.0",
      cacheRoot: tempDir,
      fetcher,
    });

    expect(result.ok).toBe(true);
    expect(requestedUrl).toBe(
      "https://raw.githubusercontent.com/owner/repo/v1.0.0/profiles/base.json",
    );
  });

  it("returns exit code 2 for missing remote profiles", async () => {
    const result = await fetchProfileReference({
      reference: "https://example.com/missing.json",
      cacheRoot: tempDir,
      fetcher: async () => createResponse(404, "not found", "Not Found"),
    });

    expect(result).toMatchObject({
      ok: false,
      exitCode: 2,
    });
  });

  it("rejects unsupported or unsafe references", async () => {
    await expect(
      fetchProfileReference({
        reference: "http://example.com/claude-profile.json",
        cacheRoot: tempDir,
        fetcher: async () => createResponse(200, "{}"),
      }),
    ).resolves.toMatchObject({ ok: false, exitCode: 1 });

    await expect(
      fetchProfileReference({
        reference: "github:owner/repo/../secret.json",
        cacheRoot: tempDir,
        fetcher: async () => createResponse(200, "{}"),
      }),
    ).resolves.toMatchObject({ ok: false, exitCode: 1 });
  });
});

function createFetcher(
  expectedUrl: string,
  contents: string,
): ProfileReferenceFetcher {
  return async (url) => {
    expect(url).toBe(expectedUrl);
    return createResponse(200, contents);
  };
}

function createResponse(status: number, contents: string, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async text() {
      return contents;
    },
  };
}
