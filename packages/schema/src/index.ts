import schema from "./schema.json" with { type: "json" };

export type ProfileScope = "project" | "global";

export interface ProfileSource {
  readonly scope: ProfileScope;
  readonly root?: string;
  readonly paths?: readonly string[];
  readonly private?: boolean;
}

export interface ProfileItem {
  readonly source: string;
  readonly hash?: `sha256:${string}`;
  readonly scope?: ProfileScope;
  readonly private?: boolean;
}

export interface HookInventory {
  readonly event: string;
  readonly matcher?: string;
  readonly command?: string;
  readonly source?: string;
  readonly scope?: ProfileScope;
  readonly private?: boolean;
  readonly inventoryOnly?: true;
}

export interface McpServer {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly scope?: ProfileScope;
  readonly private?: boolean;
  readonly [key: string]: unknown;
}

export interface CprofProfile {
  readonly $schema: "https://cprof.dev/schema/v1.json";
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly claudeCode?: string;
  readonly profileScope: ProfileScope;
  readonly includesGlobal: boolean;
  readonly sources: readonly ProfileSource[];
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly memory?: Readonly<Record<string, ProfileItem>>;
  readonly rules?: Readonly<Record<string, ProfileItem>>;
  readonly plugins?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly skills?: Readonly<Record<string, ProfileItem>>;
  readonly commands?: Readonly<Record<string, ProfileItem>>;
  readonly agents?: Readonly<Record<string, ProfileItem>>;
  readonly hooks?: Readonly<Record<string, HookInventory>>;
  readonly mcpServers?: Readonly<Record<string, McpServer>>;
  readonly secrets?: {
    readonly required?: readonly string[];
    readonly optional?: readonly string[];
  };
}

export const cprofSchema = schema;
