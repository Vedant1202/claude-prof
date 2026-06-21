#!/usr/bin/env node
// Generate or update CHANGELOG.md from conventional commits since the last tag.
// Zero dependencies — parses `git log` directly. Run: `corepack pnpm changelog`.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);

const git = (args) => {
  try {
    // stderr ignored: `git describe` is expected to fail before the first tag.
    return execSync(`git ${args}`, {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
};

const lastTag = git("describe --tags --abbrev=0");
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const log = git(`log ${range} --no-merges --pretty=format:%s%x09%h`);

const GROUPS = [
  ["feat", "Features"],
  ["fix", "Bug Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactoring"],
  ["docs", "Documentation"],
  ["ci", "CI"],
  ["build", "Build System"],
];
const label = Object.fromEntries(GROUPS);
const buckets = new Map();

for (const line of log.split("\n").filter(Boolean)) {
  const [subject, hash] = line.split("\t");
  const match = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject);
  if (!match) continue; // not a conventional commit
  const [, type, description] = match;
  if (!label[type]) continue; // skip chore/test/style/etc.
  if (!buckets.has(type)) buckets.set(type, []);
  buckets.get(type).push(`- ${description} (${hash})`);
}

const date = new Date().toISOString().slice(0, 10);
const lines = [`## ${version} (${date})`];
for (const [type, heading] of GROUPS) {
  const items = buckets.get(type);
  if (items?.length) lines.push("", `### ${heading}`, "", ...items);
}
if (lines.length === 1) lines.push("", "_No notable changes._");
const section = lines.join("\n");

const header =
  "# Changelog\n\nAll notable changes to cprof are documented here.";
const file = join(root, "CHANGELOG.md");
let prior = "";
if (existsSync(file)) {
  const current = readFileSync(file, "utf8");
  const idx = current.indexOf("\n## ");
  prior = idx >= 0 ? current.slice(idx + 1).trimEnd() : "";
}

const parts = [header, section];
if (prior) parts.push(prior);
writeFileSync(file, parts.join("\n\n") + "\n");
console.log(
  `✓ CHANGELOG.md updated for ${version} (${lastTag || "first release"} → HEAD)`,
);
