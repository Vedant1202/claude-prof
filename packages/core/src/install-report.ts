import type {
  InstallConflict,
  InstallSkipped,
  InstallWrite,
} from "./install-types.js";

export function createInstallReport(input: {
  readonly dryRun: boolean;
  readonly writes: readonly InstallWrite[];
  readonly conflicts: readonly InstallConflict[];
  readonly skipped: readonly InstallSkipped[];
  readonly backups: readonly InstallWrite[];
  readonly errors: readonly string[];
}): string {
  const lines = [
    "cprof install report",
    "",
    `Mode: ${input.dryRun ? "dry-run" : "apply"}`,
    "",
    `Writes: ${input.writes.length}`,
    ...input.writes
      .map((write) => {
        const action = write.action ? ` [${write.action}]` : "";
        const overrides =
          write.overriddenKeys && write.overriddenKeys.length > 0
            ? ` (overrides: ${[...write.overriddenKeys].sort().join(", ")})`
            : "";
        return `- ${write.section}/${write.name}${action}: ${write.path}${overrides}`;
      })
      .sort(),
    "",
    `Conflicts: ${input.conflicts.length}`,
    ...input.conflicts
      .map(
        (conflict) =>
          `- ${conflict.section}/${conflict.name}: ${conflict.path}`,
      )
      .sort(),
    "",
    `Backups: ${input.backups.length}`,
    ...input.backups
      .map((backup) => `- ${backup.path} -> ${backup.backupPath ?? ""}`)
      .sort(),
    "",
    `Skipped: ${input.skipped.length}`,
    ...input.skipped
      .map((skip) => `- ${skip.section}/${skip.name}: ${skip.reason}`)
      .sort(),
    "",
    `Errors: ${input.errors.length}`,
    ...input.errors.map((error) => `- ${error}`).sort(),
  ];

  return `${lines.join("\n")}\n`;
}
