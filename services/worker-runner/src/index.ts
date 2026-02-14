import fs from "node:fs";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";
const workerId = process.env.WORKER_ID ?? "local-worker-1";
const workerTypes = (process.env.WORKER_TYPES ?? "coder")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 1500);

const schemaUrl = new URL(
  "../../../packages/mission-control-db/schema.sql",
  import.meta.url
);
const schemaSql = fs.readFileSync(schemaUrl, "utf8");

const db = openMissionControlDB({ dbPath });
applySchema(db, schemaSql);

console.log("worker-runner started", { workerId, workerTypes, dbPath });

// TODO:
// - claim tasks assigned to workerTypes
// - write events + artifacts
// - implement per-worker adapters (coder/researcher/seo/designer/tester)

setInterval(() => {
  // Placeholder heartbeat event.
  // In v1 we should also have a 'workers' table or a heartbeat artifact/event.
  try {
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO events (id, created_at, task_id, actor_type, actor_id, type, message, payload_json) VALUES (?, datetime('now'), NULL, 'worker', ?, 'worker.heartbeat', ?, ?)"
    ).run(id, workerId, `heartbeat from ${workerId}`, JSON.stringify({ workerTypes }));
  } catch (err) {
    console.error("failed to write heartbeat", err);
  }
}, pollIntervalMs);
