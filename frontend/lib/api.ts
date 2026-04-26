/**
 * Tiny typed client for the BusinessFlow API.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ChartType = "bar" | "line" | "pie" | "table";

export interface ChartConfig {
  type: ChartType;
  x: string | null;
  y: string | null;
  title: string;
}

export interface QueryResponse {
  id: string;
  query: string;
  workspace_id: string;
  ok: boolean;
  error?: string;
  narrative?: string;
  chart?: ChartConfig;
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  row_count?: number;
  tables_used?: string[];
  execution_ms?: number;
  total_ms?: number;
  learned_metric?: {
    name: string;
    sql_fragment: string;
    definition_text: string;
    status: string;
    usage_count: number;
  } | null;
  stages?: Record<string, unknown>;
}

export interface Metric {
  name: string;
  sql_fragment: string;
  definition_text: string;
  status: string;
  usage_count: number;
  tables_used?: string[];
  last_used_at?: string;
}

export interface Connection {
  id: string;
  name: string;
  dialect: "sqlite" | "postgresql" | "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  is_demo?: boolean;
  has_password?: boolean;
  created_at?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  dialect?: string;
  error?: string;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  query: (query: string, workspace_id = "demo", connection_id = "demo") =>
    http<QueryResponse>("/api/query", {
      method: "POST",
      body: JSON.stringify({ query, workspace_id, connection_id }),
    }),
  metrics: (workspace_id = "demo") =>
    http<{ metrics: Metric[]; count: number }>(
      `/api/metrics?workspace_id=${encodeURIComponent(workspace_id)}`
    ),
  approveMetric: (name: string, workspace_id = "demo") =>
    http<{ metric: Metric }>("/api/metrics/approve", {
      method: "POST",
      body: JSON.stringify({ name, workspace_id }),
    }),
  suggestions: () =>
    http<{ suggestions: string[] }>("/api/suggestions"),
  storageInfo: () => http<{ backend: string }>("/api/storage/info"),
  schema: (connection_id = "demo") =>
    http<{ connection_id: string; dialect: string; tables: unknown[]; count: number }>(
      `/api/schema?connection_id=${encodeURIComponent(connection_id)}`
    ),
  listConnections: () =>
    http<{ connections: Connection[]; count: number }>("/api/connections"),
  createConnection: (body: {
    name: string;
    dialect: "sqlite" | "postgresql" | "mysql";
    database: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    ssl?: boolean;
    connection_id?: string;
  }) =>
    http<{ connection: Connection; test: ConnectionTestResult }>(
      "/api/connections",
      { method: "POST", body: JSON.stringify(body) }
    ),
  testConnection: (body: {
    dialect: "sqlite" | "postgresql" | "mysql";
    database: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    ssl?: boolean;
  }) =>
    http<ConnectionTestResult>("/api/connections/test", {
      method: "POST",
      body: JSON.stringify({ name: "test", ...body }),
    }),
  deleteConnection: (id: string) =>
    http<{ deleted: boolean }>(`/api/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
