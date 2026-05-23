import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_FIXTURE_KINDS = [
  "project-minimal",
  "project-full",
  "global-only",
  "mixed",
  "cprofignore",
  "secret-redaction",
  "forbidden-paths",
  "symlink-escape",
  "hook-inventory",
  "malformed-profile",
] as const;

export type FixtureKind = (typeof REQUIRED_FIXTURE_KINDS)[number];

export interface FixtureDescriptor {
  readonly name: string;
  readonly kind: FixtureKind;
  readonly description: string;
  readonly expectedValid: boolean;
}

const FIXTURES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

export async function listFixtures(): Promise<FixtureDescriptor[]> {
  const entries = await readdir(FIXTURES_ROOT, { withFileTypes: true });
  const descriptors = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => readFixtureDescriptor(entry.name)),
  );

  return descriptors.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readFixtureFiles(
  fixtureName: string,
): Promise<readonly FixtureFile[]> {
  return readFixtureDirectory(join(FIXTURES_ROOT, fixtureName), "");
}

export interface FixtureFile {
  readonly path: string;
  readonly contents: string;
}

async function readFixtureDescriptor(name: string): Promise<FixtureDescriptor> {
  const contents = await readFile(
    join(FIXTURES_ROOT, name, "fixture.json"),
    "utf8",
  );
  const value = JSON.parse(contents) as FixtureDescriptor;

  return value;
}

async function readFixtureDirectory(
  absolutePath: string,
  relativePath: string,
): Promise<FixtureFile[]> {
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const childRelativePath = join(relativePath, entry.name);
      const childAbsolutePath = join(absolutePath, entry.name);

      if (entry.isDirectory()) {
        return readFixtureDirectory(childAbsolutePath, childRelativePath);
      }

      return [
        {
          path: childRelativePath,
          contents: await readFile(childAbsolutePath, "utf8"),
        },
      ];
    }),
  );

  return files.flat().sort((left, right) => left.path.localeCompare(right.path));
}
