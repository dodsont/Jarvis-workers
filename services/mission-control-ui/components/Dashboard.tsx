"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

type WorkerRow = {
  id: string;
  status: string;
  worker_types_json: string;
  last_heartbeat_at: string | null;
  updated_at: string;
  current_task_id: string | null;
  current_task_claimed_at: string | null;
  current_task_title: string | null;
  current_task_status: string | null;
  current_task_updated_at: string | null;
};

type TaskRow = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_worker_type: string | null;
  assigned_worker_id: string | null;
  claimed_by_worker_id: string | null;
  claimed_at: string | null;
};

function displayName(id: string) {
  // ids are stored lowercase; display pretty names
  return id
    .split(/[-_]/g)
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function formatTs(ts: string | null) {
  if (!ts) return "—";
  // SQLite datetime('now') is UTC without timezone; display raw.
  return ts.replace("T", " ").replace(".000Z", "Z");
}

type BadgeKind = "good" | "warn" | "bad" | "neutral";

function badgeClass(kind: BadgeKind) {
  switch (kind) {
    case "good":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "warn":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "bad":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-600/20";
  }
}

function statusToKind(status: string): BadgeKind {
  const s = status.toLowerCase();
  if (["running", "online", "idle", "ready", "ok", "active"].includes(s)) return "good";
  if (["queued", "pending", "claimed"].includes(s)) return "warn";
  if (["failed", "error", "dead", "offline"].includes(s)) return "bad";
  return "neutral";
}

function priorityToKind(priority: string): BadgeKind {
  const p = priority.toLowerCase();
  if (p === "urgent") return "bad";
  if (p === "high") return "warn";
  return "neutral";
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Dashboard() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");

  async function refresh() {
    setError(null);
    try {
      const [wRes, tRes] = await Promise.all([
        fetch("/api/workers", { cache: "no-store" }),
        fetch("/api/tasks", { cache: "no-store" }),
      ]);
      if (!wRes.ok) throw new Error(await wRes.text());
      if (!tRes.ok) throw new Error(await tRes.text());
      const wBody = await wRes.json();
      const tBody = await tRes.json();
      setWorkers(wBody.workers ?? []);
      setTasks(tBody.tasks ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const workerMap = useMemo(() => {
    const m = new Map<string, WorkerRow>();
    for (const w of workers) m.set(w.id, w);
    return m;
  }, [workers]);

  async function createTask() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, priority }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTitle("");
      setDescription("");
      setPriority("normal");
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Mission Control
          </h1>
        </div>
        <div className="text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="mb-1 font-medium">Request failed</div>
          <pre className="overflow-auto whitespace-pre-wrap leading-5">{error}</pre>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Workers (${workers.length})`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 font-medium">id</th>
                  <th className="py-2 pr-4 font-medium">status</th>
                  <th className="py-2 pr-4 font-medium">current task</th>
                  <th className="py-2 font-medium">latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workers.map((w) => (
                  <tr key={displayName(w.id)} className="align-top">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-700">
                      {displayName(w.id)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass(
                          statusToKind(w.status)
                        )}`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {w.current_task_id ? (
                        <div className="text-slate-900">
                          <div className="font-mono text-xs text-slate-600">
                            {w.current_task_id.slice(0, 8)}
                          </div>
                          <div className="mt-0.5">
                            {w.current_task_title}
                            {w.current_task_status ? (
                              <span className="text-slate-500"> ({w.current_task_status})</span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">idle</span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-slate-600">
                      {formatTs(w.last_heartbeat_at ?? w.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {workers.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">No workers yet.</div>
          ) : null}
        </Card>

        <Card title="Create task">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!creating && title.trim()) void createTask();
            }}
          >
            <div>
              <label className="block text-sm font-medium text-slate-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="e.g. Implement heartbeat in worker-runner"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                rows={5}
                placeholder="details…"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating || !title.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title={`Latest tasks (${tasks.length})`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 font-medium">id</th>
                  <th className="py-2 pr-4 font-medium">title</th>
                  <th className="py-2 pr-4 font-medium">status</th>
                  <th className="py-2 pr-4 font-medium">who</th>
                  <th className="py-2 font-medium">updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((t) => {

                  return (
                    <tr key={t.id} className="align-top">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-700">
                        {t.id.slice(0, 8)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="text-slate-900">{t.title}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(
                              priorityToKind(t.priority)
                            )}`}
                          >
                            {t.priority}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass(
                            statusToKind(t.status)
                          )}`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-700">
                        {t.claimed_by_worker_id ? displayName(t.claimed_by_worker_id) : t.assigned_worker_id ? displayName(t.assigned_worker_id) : t.assigned_worker_type ? t.assigned_worker_type : '—'}
                      </td>
                      <td className="py-3 text-xs text-slate-600">{formatTs(t.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tasks.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">No tasks yet.</div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
