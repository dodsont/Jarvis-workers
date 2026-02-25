import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  const workerId = params.id;
  const body = (await req.json().catch(() => null)) as any;

  const workerTypes = Array.isArray(body?.workerTypes)
    ? body.workerTypes.filter((t: any) => typeof t === "string")
    : [];
  const status =
    body?.status === "offline" || body?.status === "draining" ? body.status : "online";

  const metaJson =
    body?.meta && typeof body.meta === "object" ? JSON.stringify(body.meta) : null;

  const db = getDb();

  const upsert = db.prepare(
    `
    INSERT INTO workers (id, status, worker_types_json, last_heartbeat_at, meta_json)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      worker_types_json = excluded.worker_types_json,
      last_heartbeat_at = datetime('now'),
      meta_json = excluded.meta_json
    `
  );

  const insertEvent = db.prepare(
    `INSERT INTO events (id, actor_type, actor_id, level, type, message, payload_json)
     VALUES (?, 'worker', ?, 'info', 'worker.heartbeat', ?, ?)`
  );

  const txn = db.transaction(() => {
    upsert.run(workerId, status, JSON.stringify(workerTypes), metaJson);
    insertEvent.run(
      crypto.randomUUID(),
      workerId,
      `worker heartbeat: ${workerId}`,
      JSON.stringify({ workerTypes, status })
    );
  });

  txn();

  return Response.json({ ok: true, id: workerId });
}
