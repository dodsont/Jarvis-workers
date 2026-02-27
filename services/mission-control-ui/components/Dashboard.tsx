"use client";

import { useTheme } from "@/components/ThemeProvider";
import { type ReactNode, useEffect, useMemo, useState } from "react";

type WorkerRow = {
  id: string;
  status: string;
  worker_types_json: string;
  last_heartbeat_at: string | null;
  updated_at: string;

  // Number of active tasks currently claimed by this worker.
  active_task_count?: number;

  // The most-recent open claim for this worker (if any).
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

type CompletedStatus = "done" | "failed" | "canceled";
const COMPLETED_STATUSES: CompletedStatus[] = ["done", "failed", "canceled"];

type CompletedByWorkerRow = { worker_id: string; completed_count: number };

type SamanthaDailyRow = { day: string; count: number };

type StatsResponse = {
  completedByWorker: CompletedByWorkerRow[];
  samanthaDaily: SamanthaDailyRow[];
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

function whoForTask(t: TaskRow) {
  if (t.claimed_by_worker_id) return displayName(t.claimed_by_worker_id);
  if (t.assigned_worker_id) return displayName(t.assigned_worker_id);
  if (t.assigned_worker_type) return t.assigned_worker_type;
  return "—";
}

type BadgeKind = "good" | "warn" | "bad" | "neutral";

function badgeClass(kind: BadgeKind) {
  switch (kind) {
    case "good":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/20";
    case "warn":
      return "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/20";
    case "bad":
      return "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/20";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-600/20 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-400/20";
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Heatmap({
  title,
  days,
  maxDays,
}: {
  title: string;
  days: SamanthaDailyRow[];
  maxDays: number;
}) {
  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of days) m.set(r.day, r.count);
    return m;
  }, [days]);

  const today = useMemo(() => new Date(), []);

  const cells = useMemo(() => {
    const out: { day: string; count: number }[] = [];
    const start = new Date(today);
    start.setDate(start.getDate() - (maxDays - 1));
    for (let i = 0; i < maxDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ day: iso, count: map.get(iso) ?? 0 });
    }
    return out;
  }, [map, maxDays, today]);

  const maxCount = useMemo(() => {
    let m = 0;
    for (const c of cells) m = Math.max(m, c.count);
    return m;
  }, [cells]);

  function intensity(count: number) {
    if (count <= 0) return 0;
    if (maxCount <= 1) return 4;
    const ratio = count / maxCount;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  }

  const cols = Math.ceil(maxDays / 7);

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, col) => (
          <div key={col} className="grid grid-rows-7 gap-1">
            {Array.from({ length: 7 }).map((__, row) => {
              const idx = col * 7 + row;
              const c = cells[idx];
              if (!c) return <div key={row} />;
              const level = intensity(c.count);
              const cls =
                level === 0
                  ? "bg-slate-100 dark:bg-slate-800"
                  : level === 1
                    ? "bg-emerald-200 dark:bg-emerald-900"
                    : level === 2
                      ? "bg-emerald-300 dark:bg-emerald-800"
                      : level === 3
                        ? "bg-emerald-400 dark:bg-emerald-700"
                        : "bg-emerald-500 dark:bg-emerald-600";
              return (
                <div
                  key={row}
                  title={`${c.day}: ${c.count}`}
                  className={`h-3 w-3 rounded-sm ring-1 ring-slate-200 dark:ring-slate-800 ${cls}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Darker = more completed tasks
      </div>
    </div>
  );
}

export function Dashboard() {
  const { theme, toggleTheme } = useTheme();

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignee, setAssignee] = useState<string>("");

  const [completedQuery, setCompletedQuery] = useState("");
  const [completedStatus, setCompletedStatus] = useState<"all" | CompletedStatus>(
    "all"
  );
  const [completedWho, setCompletedWho] = useState<string>("all");
  const [completedSort, setCompletedSort] = useState<
    "finished_desc" | "finished_asc" | "status" | "who"
  >("finished_desc");

  async function refresh() {
    setError(null);
    try {
      const [wRes, tRes, sRes] = await Promise.all([
        fetch("/api/workers", { cache: "no-store" }),
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/stats", { cache: "no-store" }),
      ]);
      if (!wRes.ok) throw new Error(await wRes.text());
      if (!tRes.ok) throw new Error(await tRes.text());
      if (!sRes.ok) throw new Error(await sRes.text());
      const wBody = await wRes.json();
      const tBody = await tRes.json();
      const sBody = (await sRes.json()) as StatsResponse;
      setWorkers(wBody.workers ?? []);
      setTasks(tBody.tasks ?? []);
      setStats(sBody);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const visibleWorkers = useMemo(() => {
    // Defensive dedupe: API should already return 1 row per worker,
    // but if joins/regressions re-introduce duplicates, keep the UI stable.
    const byId = new Map<string, WorkerRow>();

    function tsKey(w: WorkerRow) {
      return w.last_heartbeat_at ?? w.updated_at;
    }

    for (const w of workers) {
      const prev = byId.get(w.id);
      if (!prev) {
        byId.set(w.id, w);
        continue;
      }

      // Merge counts (in case duplicates came from a join).
      const mergedCount = (prev.active_task_count ?? 0) + (w.active_task_count ?? 0);

      // Keep the most-recent "current task".
      const prevClaimed = prev.current_task_claimed_at ?? "";
      const nextClaimed = w.current_task_claimed_at ?? "";
      const keep = nextClaimed > prevClaimed ? w : prev;

      byId.set(w.id, {
        ...keep,
        active_task_count: mergedCount,
        // Keep the most-recent heartbeat/updated timestamp for ordering.
        last_heartbeat_at:
          (w.last_heartbeat_at ?? "") > (prev.last_heartbeat_at ?? "")
            ? w.last_heartbeat_at
            : prev.last_heartbeat_at,
        updated_at: (w.updated_at ?? "") > (prev.updated_at ?? "") ? w.updated_at : prev.updated_at,
      });
    }

    const rows = Array.from(byId.values());
    rows.sort((a, b) => tsKey(b).localeCompare(tsKey(a)));
    return rows;
  }, [workers]);

  const completedTasks = useMemo(() => {
    const set = new Set(COMPLETED_STATUSES);
    return tasks.filter((t) => set.has(t.status as CompletedStatus));
  }, [tasks]);

  const completedWhoOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of completedTasks) {
      const who = whoForTask(t);
      if (who && who !== "—") s.add(who);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [completedTasks]);

  const visibleCompletedTasks = useMemo(() => {
    const q = completedQuery.trim().toLowerCase();

    let rows = completedTasks;

    if (completedStatus !== "all") {
      rows = rows.filter((t) => t.status === completedStatus);
    }

    if (completedWho !== "all") {
      rows = rows.filter((t) => whoForTask(t) === completedWho);
    }

    if (q) {
      rows = rows.filter((t) => {
        const who = whoForTask(t);
        const hay = `${t.title}\n${t.description ?? ""}\n${who}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const sortRows = [...rows];
    sortRows.sort((a, b) => {
      if (completedSort === "finished_asc") {
        return a.updated_at.localeCompare(b.updated_at);
      }
      if (completedSort === "finished_desc") {
        return b.updated_at.localeCompare(a.updated_at);
      }
      if (completedSort === "status") {
        const s = a.status.localeCompare(b.status);
        if (s !== 0) return s;
        return b.updated_at.localeCompare(a.updated_at);
      }
      // who
      const w = whoForTask(a).localeCompare(whoForTask(b));
      if (w !== 0) return w;
      return b.updated_at.localeCompare(a.updated_at);
    });

    return sortRows;
  }, [completedQuery, completedStatus, completedWho, completedSort, completedTasks]);

  async function createTask() {
    setCreating(true);
    setError(null);
    try {
      const selected = assignee.trim();
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          priority,
          assigned_worker_id: selected || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTitle("");
      setDescription("");
      setPriority("normal");
      setAssignee("");
      setCreateOpen(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  const statsList = useMemo(() => {
    const rows = stats?.completedByWorker ?? [];
    return [...rows].sort((a, b) => {
      const d = (b.completed_count ?? 0) - (a.completed_count ?? 0);
      if (d !== 0) return d;
      return a.worker_id.localeCompare(b.worker_id);
    });
  }, [stats]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Mission Control
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          <div className="mb-1 font-medium">Request failed</div>
          <pre className="overflow-auto whitespace-pre-wrap leading-5">{error}</pre>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Workers (${visibleWorkers.length})`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-4 font-medium">id</th>
                  <th className="py-2 pr-4 font-medium">status</th>
                  <th className="py-2 pr-4 font-medium">active</th>
                  <th className="py-2 pr-4 font-medium">current task</th>
                  <th className="py-2 font-medium">latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleWorkers.map((w) => (
                  <tr key={w.id} className="align-top">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-700 dark:text-slate-200">
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
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                        {w.active_task_count ?? 0}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {w.current_task_id ? (
                        <div className="text-slate-900 dark:text-slate-50">
                          <div className="font-mono text-xs text-slate-600 dark:text-slate-400">
                            {w.current_task_id.slice(0, 8)}
                          </div>
                          <div className="mt-0.5">
                            {w.current_task_title}
                            {w.current_task_status ? (
                              <span className="text-slate-500 dark:text-slate-400">
                                {" "}
                                ({w.current_task_status})
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">idle</span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-slate-600 dark:text-slate-400">
                      {formatTs(w.last_heartbeat_at ?? w.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleWorkers.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              No workers yet.
            </div>
          ) : null}
        </Card>

        <Card title="Stats">
          <div className="space-y-6">
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Completed tasks by worker
              </div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {statsList.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500 dark:text-slate-400">
                    No completed tasks yet.
                  </div>
                ) : (
                  statsList.map((r) => (
                    <div
                      key={r.worker_id}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {displayName(r.worker_id)}
                      </div>
                      <div className="font-mono text-slate-700 dark:text-slate-300">
                        {r.completed_count}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Heatmap
              title="Samantha contributions (last 90 days)"
              days={stats?.samanthaDaily ?? []}
              maxDays={90}
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Refresh
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card title={`Completed tasks (${visibleCompletedTasks.length}/${completedTasks.length})`}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Search
              </label>
              <input
                value={completedQuery}
                onChange={(e) => setCompletedQuery(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:ring-slate-800"
                placeholder="title, description, who…"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Status
              </label>
              <select
                value={completedStatus}
                onChange={(e) =>
                  setCompletedStatus(e.target.value as "all" | CompletedStatus)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              >
                <option value="all">all</option>
                {COMPLETED_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Who
              </label>
              <select
                value={completedWho}
                onChange={(e) => setCompletedWho(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              >
                <option value="all">all</option>
                {completedWhoOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Sort
              </label>
              <select
                value={completedSort}
                onChange={(e) =>
                  setCompletedSort(
                    e.target.value as
                      | "finished_desc"
                      | "finished_asc"
                      | "status"
                      | "who"
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              >
                <option value="finished_desc">finish time (newest)</option>
                <option value="finished_asc">finish time (oldest)</option>
                <option value="status">status</option>
                <option value="who">who</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={() => {
                  setCompletedQuery("");
                  setCompletedStatus("all");
                  setCompletedWho("all");
                  setCompletedSort("finished_desc");
                }}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-4 font-medium">id</th>
                  <th className="py-2 pr-4 font-medium">title</th>
                  <th className="py-2 pr-4 font-medium">status</th>
                  <th className="py-2 pr-4 font-medium">who</th>
                  <th className="py-2 font-medium">finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleCompletedTasks.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-700 dark:text-slate-200">
                      {t.id.slice(0, 8)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-slate-900 dark:text-slate-50">{t.title}</div>
                      {t.description ? (
                        <div className="mt-0.5 max-w-xl whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                          {t.description}
                        </div>
                      ) : null}
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
                    <td className="py-3 pr-4 text-sm text-slate-700 dark:text-slate-300">
                      {whoForTask(t)}
                    </td>
                    <td className="py-3 text-xs text-slate-600 dark:text-slate-400">
                      {formatTs(t.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {completedTasks.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              No completed tasks yet.
            </div>
          ) : visibleCompletedTasks.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              No tasks match your filters.
            </div>
          ) : null}
        </Card>
      </div>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-xl font-semibold text-white shadow-lg hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus:ring-emerald-900"
        aria-label="Create task"
        title="Create task"
      >
        +
      </button>

      <Modal
        open={createOpen}
        title="Create task"
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!creating && title.trim()) void createTask();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              placeholder="e.g. Implement heartbeat in worker-runner"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              rows={5}
              placeholder="details…"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              >
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Assign to
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              >
                <option value="">Unassigned</option>
                {visibleWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {displayName(w.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
