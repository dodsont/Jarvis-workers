import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const db = getDb();

  // One row per worker.
  // NOTE: A worker can have multiple open claims; we show the most-recent open claim as
  // `current_task_*` and also return an `active_task_count`.
  const rows = db
    .prepare(
      `
      SELECT
        w.id,
        w.status,
        w.worker_types_json,
        w.last_heartbeat_at,
        w.updated_at,

        (
          SELECT COUNT(1)
          FROM task_claims c2
          JOIN tasks t2 ON t2.id = c2.task_id
          WHERE c2.worker_id = w.id
            AND c2.released_at IS NULL
            AND t2.status IN ('claimed','running','blocked','needs_review')
        ) AS active_task_count,

        c.task_id AS current_task_id,
        c.claimed_at AS current_task_claimed_at,
        t.title AS current_task_title,
        t.status AS current_task_status,
        t.updated_at AS current_task_updated_at
      FROM workers w
      LEFT JOIN task_claims c
        ON c.id = (
          SELECT c3.id
          FROM task_claims c3
          WHERE c3.worker_id = w.id
            AND c3.released_at IS NULL
          ORDER BY c3.claimed_at DESC
          LIMIT 1
        )
      LEFT JOIN tasks t
        ON t.id = c.task_id
      ORDER BY COALESCE(w.last_heartbeat_at, w.updated_at) DESC
      LIMIT 200
      `
    )
    .all();

  return Response.json({ workers: rows });
}
