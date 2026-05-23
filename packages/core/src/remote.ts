import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface ProfileReferenceResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

export type ProfileReferenceFetcher = (
  url: string,
) => Promise<ProfileReferenceResponse>;

export interface FetchProfileReferenceOptions {
  readonly reference: string;
  readonly cacheRoot?: string;
  readonly fetcher?: ProfileReferenceFetcher;
}

export type FetchProfileReferenceResult =
  | {
      readonly ok: true;
      readonly reference: string;
      readonly url: string;
      readonly profilePath: string;
    }
  | {
      readonly ok: false;
      readonly reference: string;
      readonly exitCode: 1 | 2;
      readonly errors: readonly string[];
    };

export function isRemoteProfileReference(reference: string): boolean {
  return reference.startsWith("https://") || reference.startsWith("github:");
}

export async function fetchProfileReference(
  options: FetchProfileReferenceOptions,
): Promise<FetchProfileReferenceResult> {
  const url = toProfileUrl(options.reference);

  if (url === undefined) {
    return {
      ok: false,
      reference: options.reference,
      exitCode: 1,
      errors: [`unsupported remote profile reference: ${options.reference}`],
    };
  }

  const fetcher = options.fetcher ?? defaultFetcher;
  const response = await fetcher(url);

  if (!response.ok) {
    return {
      ok: false,
      reference: options.reference,
      exitCode: response.status === 404 ? 2 : 1,
      errors: [
        `failed to fetch remote profile: ${response.status} ${response.statusText}`,
      ],
    };
  }

  const cacheDir = await mkdtemp(
    join(options.cacheRoot ?? tmpdir(), "cprof-remote-profile-"),
  );
  const profilePath = join(cacheDir, "claude-profile.json");
  await writeFile(profilePath, await response.text(), "utf8");

  return {
    ok: true,
    reference: options.reference,
    url,
    profilePath,
  };
}

function toProfileUrl(reference: string): string | undefined {
  if (reference.startsWith("https://")) {
    return reference;
  }

  if (!reference.startsWith("github:")) {
    return undefined;
  }

  const parsed = parseGithubReference(reference.slice("github:".length));

  if (parsed === undefined) {
    return undefined;
  }

  return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.ref}/${parsed.path}`;
}

interface GithubReference {
  readonly owner: string;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
}

function parseGithubReference(value: string): GithubReference | undefined {
  const [pathPart, ref = "main"] = value.split("#");
  const parts = pathPart?.split("/").filter((part) => part.length > 0) ?? [];
  const [owner, repo, ...pathParts] = parts;

  if (
    owner === undefined ||
    repo === undefined ||
    !isSafeGithubPart(owner) ||
    !isSafeGithubPart(repo) ||
    !isSafeRef(ref) ||
    pathParts.some((part) => !isSafePathPart(part))
  ) {
    return undefined;
  }

  return {
    owner,
    repo,
    path: pathParts.length > 0 ? pathParts.join("/") : "claude-profile.json",
    ref,
  };
}

function isSafeGithubPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function isSafePathPart(value: string): boolean {
  return isSafeGithubPart(value) && value !== "." && value !== "..";
}

function isSafeRef(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

const defaultFetcher: ProfileReferenceFetcher = async (url) => {
  const fetchFn = globalThis.fetch as unknown as
    | ProfileReferenceFetcher
    | undefined;

  if (fetchFn === undefined) {
    throw new Error("fetch is not available in this Node.js runtime");
  }

  return fetchFn(url);
};
