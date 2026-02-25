#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

function usage() {
  console.log(`mcctl (Mission Control CLI)

Usage:
  mcctl health

  # Task lifecycle (manual)
  mcctl create-task --title "..." [--description "..."] [--priority low|normal|high|urgent]
  mcctl set-status --id <taskId> --status queued|claimed|running|blocked|needs_review|done|failed|canceled

  # Worker visibility
  mcctl heartbeat --worker <workerId> --types coder,researcher [--status online|offline|draining]

  # End-to-end: make a worker look busy (create task + assignment + claim)
  mcctl start-task --worker <workerId> --title "..." [--description "..."] [--priority low|normal|high|urgent] [--workerType coder|researcher|seo|designer|tester]
  mcctl complete-task --worker <workerId> --taskId <taskId> [--status done|failed|canceled]

Env:
  MISSION_CONTROL_DB_PATH=./data/mission-control.sqlite
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) out[k] = true;
      else {
        out[k] = v;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (!cmd || cmd === "-h" || cmd === "--help") {
  usage();
  process.exit(0);
}

const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";
const schemaUrl = new URL(
  "../../packages/mission-control-db/schema.sql",
  import.meta.url
);
const schemaSql = fs.readFileSync(fileURLToPath(schemaUrl), "utf8");

const db = openMissionControlDB({ dbPath });
applySchema(db, schemaSql);

if (cmd === "health") {
  console.log(JSON.stringify({ ok: true, dbPath }, null, 2));
  process.exit(0);
}

if (cmd === "create-task") {
  const title = args.title;
  if (!title) {
    console.error("--title is required");
    process.exit(2);
  }
  const taskId = crypto.randomUUID();
  const priority = args.priority ?? "normal";
  const description = args.description ?? null;

  const insertTask = db.prepare(
    `INSERT INTO tasks (id, title, description, status, priority, source)
     VALUES (?, ?, ?, 'queued', ?, 'cli')`
  );
  const insertEvent = db.prepare(
    `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
     VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.created', ?, ?)`
  );

  db.transaction(() => {
    insertTask.run(taskId, title, description, priority);
    insertEvent.run(
      crypto.randomUUID(),
      taskId,
      `task created: ${title}`,
      JSON.stringify({ title, priority })
    );
  })();

  console.log(taskId);
  process.exit(0);
}

if (cmd === "start-task") {
  const workerId = args.worker;
  const title = args.title;
  if (!workerId) {
    console.error("--worker is required");
    process.exit(2);
  }
  if (!title) {
    console.error("--title is required");
    process.exit(2);
  }

  const taskId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const claimId = crypto.randomUUID();

  const priority = args.priority ?? "normal";
  const description = args.description ?? null;
  const workerType = args.workerType ?? args.worker_type ?? "coder";

  db.transaction(() => {
    // Ensure the worker exists so FK constraints allow claims/assignments.
    db.prepare(
      `
      INSERT INTO workers (id, status, worker_types_json, last_heartbeat_at)
      VALUES (?, 'online', '[]', datetime('now'))
      ON CONFLICT(id) DO NOTHING
      `
    ).run(workerId);

    db.prepare(
      `INSERT INTO tasks (id, title, description, status, priority, source)
       VALUES (?, ?, ?, 'running', ?, 'cli')`
    ).run(taskId, title, description, priority);

    db.prepare(
      `INSERT INTO task_assignments (
         id, task_id, worker_type, worker_id,
         status, assigned_by_actor_type, assigned_by_actor_id,
         note
       ) VALUES (?, ?, ?, ?, 'active', 'orchestrator', 'mcctl', ?)`
    ).run(assignmentId, taskId, workerType, workerId, "started via mcctl");

    db.prepare(
      `INSERT INTO task_claims (id, task_id, worker_id, status, meta_json)
       VALUES (?, ?, ?, 'claimed', ?)`
    ).run(claimId, taskId, workerId, JSON.stringify({ source: "mcctl" }));

    db.prepare(
      `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.created', ?, ?)`
    ).run(
      crypto.randomUUID(),
      taskId,
      `task created: ${title}`,
      JSON.stringify({ title, priority, description })
    );

    db.prepare(
      `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.assigned', ?, ?)`
    ).run(
      crypto.randomUUID(),
      taskId,
      `task assigned: ${workerType}${workerId ? ` (${workerId})` : ""}`,
      JSON.stringify({ workerType, workerId, assignmentId })
    );

    db.prepare(
      `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.claimed', ?, ?)`
    ).run(
      crypto.randomUUID(),
      taskId,
      `task claimed by worker: ${workerId}`,
      JSON.stringify({ workerId, claimId })
    );
  })();

  console.log(taskId);
  process.exit(0);
}

if (cmd === "complete-task") {
  const workerId = args.worker;
  const taskId = args.taskId ?? args.id;
  const status = args.status ?? "done";

  if (!workerId) {
    console.error("--worker is required");
    process.exit(2);
  }
  if (!taskId) {
    console.error("--taskId is required");
    process.exit(2);
  }

  const task = db.prepare("SELECT id, status FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    console.error("task not found");
    process.exit(3);
  }

  db.transaction(() => {
    const res = db.prepare(
      `
      UPDATE task_claims
      SET released_at = datetime('now'), status = 'released'
      WHERE task_id = ? AND worker_id = ? AND released_at IS NULL
      `
    ).run(taskId, workerId);

    // Update task status even if no claim row was found (manual cleanup).
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, taskId);

    db.prepare(
      `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.released', ?, ?)`
    ).run(
      crypto.randomUUID(),
      taskId,
      `task claim released by worker: ${workerId}`,
      JSON.stringify({ workerId, released: res.changes > 0 })
    );

    db.prepare(
      `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.status_changed', ?, ?)`
    ).run(
      crypto.randomUUID(),
      taskId,
      `task status changed: ${task.status} -> ${status}`,
      JSON.stringify({ from: task.status, to: status })
    );
  })();

  console.log(JSON.stringify({ ok: true, taskId, workerId, status }));
  process.exit(0);
}

if (cmd === "set-status") {
  const id = args.id;
  const status = args.status;
  if (!id || !status) {
    console.error("--id and --status are required");
    process.exit(2);
  }

  const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(id);
  if (!row) {
    console.error("task not found");
    process.exit(3);
  }

  const from = row.status;
  const to = status;

  db.transaction(() => {
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(to, id);
    db.prepare(
      `INSERT INTO events (id, task_id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, ?, 'orchestrator', 'mcctl', 'info', 'task.status_changed', ?, ?)`
    ).run(
      crypto.randomUUID(),
      id,
      `task status changed: ${from} -> ${to}`,
      JSON.stringify({ from, to })
    );
  })();

  console.log(JSON.stringify({ ok: true, id, from, to }));
  process.exit(0);
}

if (cmd === "heartbeat") {
  const workerId = args.worker;
  const types = (args.types ?? "").split(",").filter(Boolean);
  const status = args.status ?? "online";
  if (!workerId) {
    console.error("--worker is required");
    process.exit(2);
  }

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO workers (id, status, worker_types_json, last_heartbeat_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        worker_types_json = excluded.worker_types_json,
        last_heartbeat_at = datetime('now')
      `
    ).run(workerId, status, JSON.stringify(types));

    db.prepare(
      `INSERT INTO events (id, actor_type, actor_id, level, type, message, payload_json)
       VALUES (?, 'worker', ?, 'info', 'worker.heartbeat', ?, ?)`
    ).run(
      crypto.randomUUID(),
      workerId,
      `worker heartbeat: ${workerId}`,
      JSON.stringify({ workerTypes: types, status })
    );
  })();

  console.log(JSON.stringify({ ok: true, id: workerId }));
  process.exit(0);
}

console.error(`unknown command: ${cmd}`);
usage();
process.exit(2);
