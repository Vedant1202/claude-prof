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
