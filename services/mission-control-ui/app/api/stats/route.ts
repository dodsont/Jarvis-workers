import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPLETED = new Set(["done", "failed", "canceled"]);

export function GET(req: NextRequest) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const db = getDb();

  const completedRows = db
    .prepare(
      `
      SELECT
        c.worker_id AS worker_id,
        COUNT(DISTINCT t.id) AS completed_count
      FROM tasks t
      JOIN task_claims c
        ON c.task_id = t.id
      WHERE t.status IN ('done','failed','canceled')
      GROUP BY c.worker_id
      ORDER BY completed_count DESC, worker_id ASC
      `
    )
    .all();

  const samanthaDaily = db
    .prepare(
      `
      SELECT
        date(t.updated_at) AS day,
        COUNT(DISTINCT t.id) AS count
      FROM tasks t
      JOIN task_claims c
        ON c.task_id = t.id
      WHERE t.status IN ('done','failed','canceled')
        AND c.worker_id = 'samantha'
        AND datetime(t.updated_at) >= datetime('now', '-90 days')
      GROUP BY date(t.updated_at)
      ORDER BY day ASC
      `
    )
    .all();

  return Response.json({
    completedByWorker: completedRows,
    samanthaDaily,
    completedStatuses: Array.from(COMPLETED),
  });
}
