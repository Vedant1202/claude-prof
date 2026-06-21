#!/usr/bin/env node
// All-in-one alpha release: pre-flight -> verify -> publish (alpha tag) -> tag -> push.
// Run: `corepack pnpm release:alpha`  (preview with `corepack pnpm release:dry`).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const tag = `v${version}`;

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root });
};
const out = (cmd) => execSync(cmd, { cwd: root }).toString().trim();
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

console.log(`▶ cprof ${version} — ${dryRun ? "DRY RUN" : "LIVE RELEASE"}`);

// Pre-flight: refuse to release from a wrong/dirty/already-tagged state.
const branch = out("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") fail(`Not on main (on "${branch}").`);
if (out("git status --porcelain"))
  fail("Working tree is dirty — commit or stash first.");
if (out(`git tag --list ${tag}`))
  fail(`Tag ${tag} already exists — bump the version first.`);

// Verify everything builds and passes before anything irreversible happens.
run("corepack pnpm verify");

if (dryRun) {
  run("corepack pnpm -r publish --tag alpha --dry-run --no-git-checks");
  console.log(
    "\n✓ Dry run complete — nothing was published, tagged, or pushed.",
  );
  process.exit(0);
}

// Irreversible from here: publish to npm, then tag and push.
run("corepack pnpm -r publish --tag alpha");
run(`git tag -a ${tag} -m "${tag}"`);
run("git push origin main --follow-tags");

console.log(`\n✓ Published ${tag} to npm under the "alpha" tag and pushed.`);
console.log("  Install: npm i -g cprof@alpha");
