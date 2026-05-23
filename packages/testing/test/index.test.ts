import { describe, expect, it } from "vitest";

import {
  listFixtures,
  readFixtureFiles,
  REQUIRED_FIXTURE_KINDS,
} from "../src/index.js";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /ghs_[A-Za-z0-9_]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{16,}/,
  /AKIA[0-9A-Z]{16}/,
] as const;

describe("@cprof/testing fixtures", () => {
  it("contains at least the required fixture corpus", async () => {
    const fixtures = await listFixtures();

    expect(fixtures).toHaveLength(REQUIRED_FIXTURE_KINDS.length);
    expect(fixtures.map((fixture) => fixture.kind).sort()).toEqual(
      [...REQUIRED_FIXTURE_KINDS].sort(),
    );
  });

  it("uses unique fixture names", async () => {
    const fixtures = await listFixtures();
    const names = fixtures.map((fixture) => fixture.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps committed fixture contents free of known secret patterns", async () => {
    const fixtures = await listFixtures();

    for (const fixture of fixtures) {
      const files = await readFixtureFiles(fixture.name);

      for (const file of files) {
        for (const pattern of SECRET_PATTERNS) {
          expect(file.contents, `${fixture.name}/${file.path}`).not.toMatch(
            pattern,
          );
        }
      }
    }
  });
});
