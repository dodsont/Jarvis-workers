import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS = new Set([
  "queued",
  "claimed",
  "running",
  "blocked",
  "needs_review",
  "done",
  "failed",
  "canceled",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const taskId = params.id;
  const body = (await req.json().catch(() => null)) as any;
  const status = body?.status;

  if (typeof status !== "string" || !VALID_STATUS.has(status)) {
    return Response.json(
      { error: `invalid status (expected one of: ${Array.from(VALID_STATUS).join(
        ","
      )})` },
      { status: 400 }
    );
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id, status FROM tasks WHERE id = ?")
    .get(taskId) as { id: string; status: string } | undefined;

  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const from = existing.status;
  const to = status;

  const update = db.prepare("UPDATE tasks SET status = ? WHERE id = ?");
  const insertEvent = db.prepare(
    `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
     VALUES (?, ?, 'ui', NULL, 'info', 'task.status_changed', ?, ?)`
  );

  const txn = db.transaction(() => {
    update.run(to, taskId);
    insertEvent.run(
      crypto.randomUUID(),
      taskId,
      `task status changed: ${from} -> ${to}`,
      JSON.stringify({ from, to })
    );
  });

  txn();

  return Response.json({ ok: true, id: taskId, from, to });
}
