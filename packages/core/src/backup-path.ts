import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * Map a file being backed up to its destination under the backup root, so that
 * distinct source paths never collide. Files inside the project root mirror their
 * project-relative path; files outside it (e.g. global `~/.claude` files) mirror
 * their full absolute path under an `external/` namespace — previously they fell
 * back to a bare basename, so two global files sharing a basename overwrote each
 * other's backup. The mapping is deterministic so a recorded backup path is
 * always restorable to its original location.
 */
export function backupPathFor(
  backupRoot: string,
  targetPath: string,
  projectRoot: string,
): string {
  const rel = relative(projectRoot, targetPath);

  if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) {
    return join(backupRoot, rel);
  }

  return join(backupRoot, "external", stripRoot(targetPath));
}

/**
 * Mirror an absolute path under `root`, collision-free (distinct sources map to
 * distinct destinations). Used to stash/restore files under a trash directory.
 */
export function mirrorAbsolutePath(root: string, targetPath: string): string {
  return join(root, stripRoot(targetPath));
}

function stripRoot(targetPath: string): string {
  return resolve(targetPath)
    .replace(/^[\\/]+/, "") // drop the leading separator(s)
    .replace(/:/g, ""); // drop the Windows drive colon
}
