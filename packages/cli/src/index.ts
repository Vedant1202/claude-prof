#!/usr/bin/env node

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  if (argv.includes("--version")) {
    process.stdout.write("0.0.0\n");
    return 0;
  }

  process.stdout.write("cprof phase 1 scaffold\n");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
