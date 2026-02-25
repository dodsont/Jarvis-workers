import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const db = getDb();

  // Agent list = workers + their currently-claimed task (if any).
  const rows = db
    .prepare(
      `
      SELECT
        w.id,
        w.status,
        w.worker_types_json,
        w.last_heartbeat_at,
        w.updated_at,

        c.task_id AS current_task_id,
        c.claimed_at AS current_task_claimed_at,
        t.title AS current_task_title,
        t.status AS current_task_status,
        t.updated_at AS current_task_updated_at
      FROM workers w
      LEFT JOIN task_claims c
        ON c.worker_id = w.id AND c.released_at IS NULL
      LEFT JOIN tasks t
        ON t.id = c.task_id
      ORDER BY COALESCE(w.last_heartbeat_at, w.updated_at) DESC
      LIMIT 200
      `
    )
    .all();

  return Response.json({ workers: rows });
}
