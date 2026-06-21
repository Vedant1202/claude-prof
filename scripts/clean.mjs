#!/usr/bin/env node
// Remove build outputs so a fresh build can't ship files orphaned by deleted
// sources (tsc leaves stale .js/.d.ts in dist). Run: `corepack pnpm clean`.
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");

for (const pkg of readdirSync(packagesDir)) {
  const pkgDir = join(packagesDir, pkg);
  if (!statSync(pkgDir).isDirectory()) continue;
  rmSync(join(pkgDir, "dist"), { recursive: true, force: true });
  for (const entry of readdirSync(pkgDir)) {
    if (entry.endsWith(".tsbuildinfo")) {
      rmSync(join(pkgDir, entry), { force: true });
    }
  }
}
console.log("✓ Cleaned packages/*/dist and *.tsbuildinfo");
