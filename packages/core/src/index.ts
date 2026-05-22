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
export {
  redactSecrets,
  shouldRedactString,
  type RedactedProfileValue,
  type Redaction,
  type RedactionReason,
  type RedactionResult,
} from "./redactor.js";
export {
  checkGeneratedOutputForLeaks,
  type GeneratedOutput,
  type LeakCheckResult,
  type OutputLeak,
} from "./leak-check.js";
export {
  CANONICAL_GLOBAL_PATHS,
  CANONICAL_PROJECT_PATHS,
  createProfileSourceMetadata,
  type ProfileSourceMetadata,
  type SourceDiscoveryOptions,
} from "./sources.js";
export {
  buildManifest,
  type BuildManifestInput,
  type ManifestSectionMap,
} from "./manifest.js";
export {
  bundleAssets,
  type AssetBundleInput,
  type AssetBundleResult,
  type AssetKind,
  type BundledAsset,
  type SkippedAsset,
} from "./bundler.js";
export {
  createProfileGitignore,
  createScanReport,
  type ScanReportInput,
} from "./report.js";
