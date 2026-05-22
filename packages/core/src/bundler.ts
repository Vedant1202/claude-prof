import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { checkGeneratedOutputForLeaks } from "./leak-check.js";
import { collectSafePaths } from "./traversal.js";

export type AssetKind = "skills" | "commands" | "agents" | "memory" | "hooks";

export interface AssetBundleInput {
  readonly kind: AssetKind;
  readonly name: string;
  readonly sourcePath: string;
}

export interface BundledAsset {
  readonly kind: Exclude<AssetKind, "hooks">;
  readonly name: string;
  readonly destination: string;
  readonly hash: `sha256:${string}`;
}

export interface SkippedAsset {
  readonly kind: AssetKind;
  readonly name: string;
  readonly sourcePath: string;
  readonly reason: "hook-inventory-only" | "unsafe-output";
}

export interface AssetBundleResult {
  readonly bundled: readonly BundledAsset[];
  readonly skipped: readonly SkippedAsset[];
}

export async function bundleAssets(
  assets: readonly AssetBundleInput[],
  outputRoot: string,
): Promise<AssetBundleResult> {
  const bundled: BundledAsset[] = [];
  const skipped: SkippedAsset[] = [];

  for (const asset of [...assets].sort(compareAssets)) {
    if (asset.kind === "hooks") {
      skipped.push({
        ...asset,
        reason: "hook-inventory-only",
      });
      continue;
    }

    const output = await readAssetOutput(asset, outputRoot);
    const leakCheck = checkGeneratedOutputForLeaks(
      output.files.map((file) => ({
        path: file.destination,
        contents: file.contents,
      })),
    );

    if (!leakCheck.ok) {
      skipped.push({
        ...asset,
        reason: "unsafe-output",
      });
      continue;
    }

    for (const file of output.files) {
      await mkdir(dirname(join(outputRoot, file.destination)), {
        recursive: true,
      });
      await writeFile(join(outputRoot, file.destination), file.contents, "utf8");
    }

    bundled.push({
      kind: asset.kind,
      name: asset.name,
      destination: output.destinationRoot,
      hash: hashAsset(output.files),
    });
  }

  return {
    bundled: bundled.sort(compareBundled),
    skipped: skipped.sort(compareSkipped),
  };
}

interface AssetOutput {
  readonly destinationRoot: string;
  readonly files: readonly AssetOutputFile[];
}

interface AssetOutputFile {
  readonly destination: string;
  readonly relativePath: string;
  readonly contents: string;
}

async function readAssetOutput(
  asset: AssetBundleInput,
  outputRoot: string,
): Promise<AssetOutput> {
  const sourceStat = await stat(asset.sourcePath);
  const destinationRoot = join(asset.kind, asset.name);

  if (sourceStat.isDirectory()) {
    const traversal = await collectSafePaths(asset.sourcePath);
    const files = await Promise.all(
      traversal.entries
        .filter((entry) => !entry.directory)
        .map(async (entry) => ({
          destination: join(destinationRoot, entry.relativePath),
          relativePath: entry.relativePath,
          contents: await readFile(entry.path, "utf8"),
        })),
    );

    return {
      destinationRoot,
      files: files.sort(compareOutputFiles),
    };
  }

  const relativePath = basename(asset.sourcePath);

  return {
    destinationRoot,
    files: [
      {
        destination: join(destinationRoot, relativePath),
        relativePath,
        contents: await readFile(asset.sourcePath, "utf8"),
      },
    ],
  };
}

function hashAsset(files: readonly AssetOutputFile[]): `sha256:${string}` {
  const hash = createHash("sha256");

  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.contents);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}

function compareAssets(left: AssetBundleInput, right: AssetBundleInput): number {
  return `${left.kind}/${left.name}`.localeCompare(`${right.kind}/${right.name}`);
}

function compareBundled(left: BundledAsset, right: BundledAsset): number {
  return `${left.kind}/${left.name}`.localeCompare(`${right.kind}/${right.name}`);
}

function compareSkipped(left: SkippedAsset, right: SkippedAsset): number {
  return `${left.kind}/${left.name}`.localeCompare(`${right.kind}/${right.name}`);
}

function compareOutputFiles(
  left: AssetOutputFile,
  right: AssetOutputFile,
): number {
  return left.relativePath.localeCompare(right.relativePath);
}
