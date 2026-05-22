export type ScanScope = "project" | "global";

export interface SourceDescriptor {
  readonly scope: ScanScope;
  readonly root?: string;
  readonly paths?: readonly string[];
  readonly private?: boolean;
}

export function createSourceDescriptor(scope: ScanScope): SourceDescriptor {
  return { scope };
}

export {
  validateProfile,
  validateProfileFile,
  type ProfileValidationResult,
  type ValidationExitCode,
} from "./validate.js";
export {
  createIgnorePolicy,
  loadCprofIgnore,
  normalizeIgnorePath,
  type IgnorePolicy,
} from "./ignore.js";
export {
  BUILT_IN_NEVER_READ_PATTERNS,
  collectSafePaths,
  isInsideRoot,
  type SafeTraversalEntry,
  type SafeTraversalResult,
  type SkippedPath,
  type SkipReason,
} from "./traversal.js";
