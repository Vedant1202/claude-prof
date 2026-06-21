import type { CprofProfile, ProfileScope } from "@cprof/schema";

export type InstallScope = "project" | "global" | "include-global";
export type InstallExitCode = 0 | 1 | 2 | 3;

export interface InstallProfileOptions {
  readonly profilePath: string;
  readonly cwd: string;
  readonly homeDir: string;
  readonly scope?: InstallScope;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: Date;
  readonly installSource?: string;
}

export type InstallAction = "created" | "merged" | "overwritten";

export interface InstallWrite {
  readonly source: "generated" | "asset";
  readonly section: string;
  readonly name: string;
  readonly path: string;
  readonly action?: InstallAction;
  readonly overriddenKeys?: readonly string[];
  readonly backupPath?: string;
}

export interface PreparedWrite extends PlannedWrite {
  readonly action: InstallAction;
  readonly finalContents: string;
  readonly overriddenKeys: readonly string[];
}

export interface InstallConflict {
  readonly path: string;
  readonly section: string;
  readonly name: string;
}

export interface InstallSkipped {
  readonly section: string;
  readonly name: string;
  readonly reason:
    | "scope-filtered"
    | "hook-inventory-only"
    | "plugin-inventory-only"
    | "missing-asset"
    | "unsafe-path";
}

export interface InstallResult {
  readonly ok: boolean;
  readonly exitCode: InstallExitCode;
  readonly dryRun: boolean;
  readonly writes: readonly InstallWrite[];
  readonly conflicts: readonly InstallConflict[];
  readonly skipped: readonly InstallSkipped[];
  readonly backups: readonly InstallWrite[];
  readonly missingSecrets: readonly string[];
  readonly errors: readonly string[];
  readonly report: string;
}

export interface PlannedWrite {
  readonly source: "generated" | "asset";
  readonly section: string;
  readonly name: string;
  readonly path: string;
  readonly contents: string;
}

export interface PlanContext {
  readonly profile: CprofProfile;
  readonly profileDir: string;
  readonly projectRoot: string;
  readonly claudeHome: string;
  readonly allowedScopes: readonly ProfileScope[];
  readonly env: Readonly<Record<string, string | undefined>>;
}
