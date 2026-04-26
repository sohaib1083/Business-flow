"use client";

import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/api";

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  refreshKey?: number;
}

const DIALECT_LABEL: Record<Connection["dialect"], string> = {
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
};

const DIALECT_COLOR: Record<Connection["dialect"], string> = {
  sqlite: "bg-slate-100 text-slate-700",
  postgresql: "bg-sky-100 text-sky-700",
  mysql: "bg-amber-100 text-amber-700",
};

export default function ConnectionsPanel({ selectedId, onSelect, refreshKey = 0 }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [form, setForm] = useState({
    name: "",
    dialect: "postgresql" as Connection["dialect"],
    host: "localhost",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl: false,
  });

  async function reload() {
    try {
      const r = await api.listConnections();
      setConnections(r.connections);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, [refreshKey]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createConnection(form);
      if (!r.test.ok) {
        setErr(`Saved, but connection test failed: ${r.test.error || "unknown"}`);
      }
      setShowForm(false);
      setForm({ ...form, name: "", database: "", username: "", password: "" });
      await reload();
      onSelect(r.connection.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete connection "${id}"?`)) return;
    setBusy(true);
    try {
      await api.deleteConnection(id);
      if (selectedId === id) onSelect("demo");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Connections</h3>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          {showForm ? "Cancel" : "+ New"}
        </button>
      </div>

      {err && (
        <div className="mb-3 rounded-md bg-rose-50 p-2 text-xs text-rose-700">{err}</div>
      )}

      <ul className="space-y-1.5">
        {connections.map((c) => (
          <li
            key={c.id}
            className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${
              selectedId === c.id
                ? "border-brand-300 bg-brand-50"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <button onClick={() => onSelect(c.id)} className="flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${DIALECT_COLOR[c.dialect]}`}>
                  {DIALECT_LABEL[c.dialect]}
                </span>
                <span className="font-medium text-slate-800">{c.name}</span>
              </div>
              {!c.is_demo && (
                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                  {c.username ? `${c.username}@` : ""}{c.host}:{c.port}/{c.database}
                </div>
              )}
            </button>
            {!c.is_demo && (
              <button
                onClick={() => handleDelete(c.id)}
                disabled={busy}
                className="ml-2 text-slate-400 hover:text-rose-600"
                title="Delete"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Display name"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
          <select
            value={form.dialect}
            onChange={(e) => {
              const d = e.target.value as Connection["dialect"];
              setForm({
                ...form,
                dialect: d,
                port: d === "postgresql" ? 5432 : d === "mysql" ? 3306 : 0,
              });
            }}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
          </select>
          {form.dialect !== "sqlite" && (
            <>
              <div className="flex gap-2">
                <input
                  required
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="host"
                  className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                />
                <input
                  required
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                  placeholder="port"
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="username"
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="password"
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
            </>
          )}
          <input
            required
            value={form.database}
            onChange={(e) => setForm({ ...form, database: e.target.value })}
            placeholder={form.dialect === "sqlite" ? "/path/to/file.db" : "database name"}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
          {form.dialect !== "sqlite" && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.ssl}
                onChange={(e) => setForm({ ...form, ssl: e.target.checked })}
              />
              Require SSL
            </label>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Test & Save"}
          </button>
        </form>
      )}
    </aside>
  );
}
