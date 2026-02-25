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

const VALID_PRIORITY = new Set(["low", "normal", "high", "urgent"]);

export function GET(req: NextRequest) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const db = getDb();

  // Task list includes: active assignment + open claim (if present)
  // plus derived start/finish timestamps from claims.
  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.created_at,
        t.updated_at,
        t.title,
        t.description,
        t.status,
        t.priority,
        a.worker_type AS assigned_worker_type,
        a.worker_id AS assigned_worker_id,
        c.worker_id AS claimed_by_worker_id,
        c.claimed_at AS claimed_at,

        (
          SELECT MIN(claimed_at)
          FROM task_claims c2
          WHERE c2.task_id = t.id
        ) AS started_at,

        (
          SELECT MAX(released_at)
          FROM task_claims c3
          WHERE c3.task_id = t.id AND c3.released_at IS NOT NULL
        ) AS finished_at
      FROM tasks t
      LEFT JOIN task_assignments a
        ON a.task_id = t.id AND a.status = 'active'
      LEFT JOIN task_claims c
        ON c.task_id = t.id AND c.released_at IS NULL
      ORDER BY t.updated_at DESC
      LIMIT 200
      `
    )
    .all();

  return Response.json({ tasks: rows });
}

export async function POST(req: NextRequest) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const db = getDb();

  const body = (await req.json().catch(() => null)) as any;
  const title = body?.title;
  const description = body?.description;
  const priority = body?.priority;
  const tags = body?.tags;

  if (!title || typeof title !== "string") {
    return Response.json({ error: "title required" }, { status: 400 });
  }

  const taskId = crypto.randomUUID();
  const eventId = crypto.randomUUID();

  const priorityValue =
    typeof priority === "string" && VALID_PRIORITY.has(priority)
      ? priority
      : "normal";

  const tagsJson = Array.isArray(tags)
    ? JSON.stringify(tags.filter((t) => typeof t === "string"))
    : null;

  const insertTask = db.prepare(
    `INSERT INTO tasks (id, title, description, status, priority, tags_json, source)
     VALUES (?, ?, ?, 'queued', ?, ?, 'ui')`
  );

  const insertEvent = db.prepare(
    `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
     VALUES (?, ?, 'ui', NULL, 'info', 'task.created', ?, ?)`
  );

  const txn = db.transaction(() => {
    insertTask.run(
      taskId,
      title,
      typeof description === "string" ? description : null,
      priorityValue,
      tagsJson
    );

    insertEvent.run(
      eventId,
      taskId,
      `task created: ${title}`,
      JSON.stringify({ title, priority: priorityValue })
    );
  });

  txn();

  return Response.json({ id: taskId }, { status: 201 });
}
