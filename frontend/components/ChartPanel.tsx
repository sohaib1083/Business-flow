"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import type { ChartConfig } from "@/lib/api";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
];

interface Props {
  config: ChartConfig;
  rows: Record<string, unknown>[];
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ChartPanel({ config, rows }: Props) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-slate-500">No rows to chart.</div>
    );
  }

  const { type, x, y, title } = config;

  if (type === "table" || !x || !y) {
    return (
      <div className="text-sm text-slate-500">
        Best displayed as a table — see below.
      </div>
    );
  }

  const data = rows.map((r) => ({
    ...r,
    [y]: toNumber(r[y]),
  }));

  return (
    <div className="w-full">
      {title && (
        <h3 className="mb-2 text-sm font-medium text-slate-700">{title}</h3>
      )}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={x} fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={y}
                stroke={COLORS[0]}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : type === "pie" ? (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={data}
                dataKey={y}
                nameKey={x}
                outerRadius={100}
                label
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={x} fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey={y} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
