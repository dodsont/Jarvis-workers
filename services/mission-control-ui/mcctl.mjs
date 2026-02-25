#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

function usage() {
  console.log(`mcctl (Mission Control CLI)

Usage:
  mcctl health
  mcctl create-task --title "..." [--description "..."] [--priority low|normal|high|urgent]
  mcctl set-status --id <taskId> --status queued|claimed|running|blocked|needs_review|done|failed|canceled
  mcctl heartbeat --worker <workerId> --types coder,researcher [--status online|offline|draining]

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
