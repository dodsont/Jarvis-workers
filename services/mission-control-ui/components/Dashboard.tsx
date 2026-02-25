"use client";

import { useEffect, useMemo, useState } from "react";

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

function formatTs(ts: string | null) {
  if (!ts) return "—";
  // SQLite datetime('now') is UTC without timezone; display raw.
  return ts.replace("T", " ").replace(".000Z", "Z");
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
    <main style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ margin: 0 }}>Mission Control</h1>
      <p style={{ color: "#666" }}>
        Workers + tasks (auto-refresh every 5s). API: <code>/api/…</code>
      </p>

      {error ? (
        <pre
          style={{
            background: "#fff5f5",
            border: "1px solid #f5c2c2",
            padding: 12,
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          {error}
        </pre>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Workers</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>id</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>status</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>current task</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>latest</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>
                    <code>{w.id}</code>
                  </td>
                  <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>{w.status}</td>
                  <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>
                    {w.current_task_id ? (
                      <span>
                        <code>{w.current_task_id.slice(0, 8)}</code> — {w.current_task_title}
                        {w.current_task_status ? ` (${w.current_task_status})` : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#666" }}>idle</span>
                    )}
                  </td>
                  <td style={{ borderBottom: "1px solid #fafafa", padding: 8, color: "#555" }}>
                    {formatTs(w.last_heartbeat_at ?? w.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Create task</h2>
          <label style={{ display: "block", marginBottom: 6 }}>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
              placeholder="e.g. Implement heartbeat in worker-runner"
            />
          </label>
          <label style={{ display: "block", marginBottom: 6 }}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
              rows={5}
              placeholder="details…"
            />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>

          <button
            onClick={createTask}
            disabled={creating || !title.trim()}
            style={{ padding: "8px 12px" }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Latest tasks</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>id</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>title</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>status</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>who</th>
                <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>updated</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const claimed = t.claimed_by_worker_id
                  ? workerMap.get(t.claimed_by_worker_id)
                  : null;
                return (
                  <tr key={t.id}>
                    <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>
                      <code>{t.id.slice(0, 8)}</code>
                    </td>
                    <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>
                      {t.title}
                      <span style={{ color: "#666" }}> [{t.priority}]</span>
                    </td>
                    <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>{t.status}</td>
                    <td style={{ borderBottom: "1px solid #fafafa", padding: 8 }}>
                      {t.claimed_by_worker_id ? (
                        <span>
                          claimed by <code>{t.claimed_by_worker_id}</code>
                        </span>
                      ) : t.assigned_worker_id ? (
                        <span>
                          assigned to <code>{t.assigned_worker_id}</code>
                        </span>
                      ) : t.assigned_worker_type ? (
                        <span>
                          assigned type <code>{t.assigned_worker_type}</code>
                        </span>
                      ) : (
                        <span style={{ color: "#666" }}>—</span>
                      )}
                      {claimed?.current_task_id === t.id ? null : null}
                    </td>
                    <td style={{ borderBottom: "1px solid #fafafa", padding: 8, color: "#555" }}>
                      {formatTs(t.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
