import type { McpServer, ProfileScope } from "@cprof/schema";

import { readJsonRecord } from "./fs-utils.js";
import { isRecord } from "./record-utils.js";

const SAFE_SETTINGS_KEYS = new Set([
  "cleanupPeriodDays",
  "env",
  "includeCoAuthoredBy",
  "model",
  "permissions",
  "statusLine",
]);

export async function readSafeSettings(
  filePath: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const value = await readJsonRecord(filePath);

  if (value === undefined) {
    return undefined;
  }

  // Keep only user-portable config; runtime caches, account fields, and history stay out.
  const settings = Object.fromEntries(
    Object.entries(value).filter(([key]) => SAFE_SETTINGS_KEYS.has(key)),
  );

  return Object.keys(settings).length > 0 ? settings : undefined;
}

export async function readMcpServers(
  filePath: string,
  scope: ProfileScope,
): Promise<Record<string, McpServer>> {
  const value = await readJsonRecord(filePath);
  const rawServers =
    value === undefined
      ? undefined
      : isRecord(value.mcpServers)
        ? value.mcpServers
        : isMcpServerMap(value)
          ? value
          : undefined;

  if (rawServers === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawServers)
      .filter(([, server]) => isMcpServer(server))
      .map(([name, server]) => [
        name,
        {
          ...(server as Record<string, unknown>),
          scope,
          ...(scope === "global" ? { private: true } : {}),
        } as McpServer,
      ]),
  );
}

export function mergeSettings(
  left: Readonly<Record<string, unknown>> | undefined,
  right: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return { ...left, ...right };
}

function isMcpServerMap(value: Record<string, unknown>): boolean {
  return Object.values(value).every((entry) => isMcpServer(entry));
}

function isMcpServer(value: unknown): value is McpServer {
  return isRecord(value) && typeof value.command === "string";
}
