import { Telegraf } from "telegraf";
import fs from "node:fs";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";
import type Database from "better-sqlite3";
import type { WorkerType } from "@jarvis/shared";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";

// Bootstrap DB schema (idempotent)
const schemaUrl = new URL(
  "../../../packages/mission-control-db/schema.sql",
  import.meta.url
);
const schemaSql = fs.readFileSync(schemaUrl, "utf8");
const db = openMissionControlDB({ dbPath });
applySchema(db, schemaSql);

const bot = new Telegraf(token);

const WORKER_TYPES: WorkerType[] = [
  "coder",
  "researcher",
  "seo",
  "designer",
  "tester",
];

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function normalizeWorkerType(s: string | undefined): WorkerType | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return (WORKER_TYPES as string[]).includes(t) ? (t as WorkerType) : null;
}

function emitEvent(
  dbi: Database.Database,
  opts: {
    taskId?: string | null;
    actorType: "orchestrator";
    actorId?: string | null;
    type: string;
    message?: string | null;
    level?: "debug" | "info" | "warn" | "error";
    payload?: unknown;
    correlationId?: string | null;
  }
) {
  const id = newId();
  dbi
    .prepare(
      `INSERT INTO events (
        id, created_at, task_id,
        actor_type, actor_id,
        level, type, message,
        correlation_id,
        payload_json
      ) VALUES (
        ?, datetime('now'), ?,
        ?, ?,
        ?, ?, ?,
        ?,
        ?
      )`
    )
    .run(
      id,
      opts.taskId ?? null,
      opts.actorType,
      opts.actorId ?? null,
      opts.level ?? "info",
      opts.type,
      opts.message ?? null,
      opts.correlationId ?? null,
      opts.payload ? JSON.stringify(opts.payload) : null
    );
  return id;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatTaskRow(t: any) {
  const assigned = t.active_assignment_worker_type
    ? ` → ${t.active_assignment_worker_type}`
    : "";
  const claimed = t.open_claim_worker_id
    ? ` (claimed by ${t.open_claim_worker_id})`
    : "";
  return `${t.status} [${t.priority}] ${t.title} (${shortId(t.id)})${assigned}${claimed}`;
}

function getTextMessage(ctx: any): string | null {
  const msg = ctx?.message;
  return typeof msg?.text === "string" ? msg.text : null;
}

function getTaskByPrefix(dbi: Database.Database, prefix: string) {
  const p = prefix.trim();
  if (!p) return null;

  // Prefer exact match first.
  const exact = dbi.prepare("SELECT * FROM tasks WHERE id = ?").get(p) as any;
  if (exact) return exact;

  // If ambiguous, return null to force user to specify.
  const rows = dbi
    .prepare("SELECT id FROM tasks WHERE id LIKE ? ORDER BY created_at DESC LIMIT 3")
    .all(p + "%") as any[];
  if (rows.length !== 1) return null;

  return dbi.prepare("SELECT * FROM tasks WHERE id = ?").get(rows[0].id) as any;
}

bot.start(async (ctx) => {
  await ctx.reply(
    [
      "Jarvis online.",
      "",
      "Try:",
      "- /newtask <text>",
      "- /status",
      "- /help",
    ].join("\n")
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Jarvis commands (v1):",
      "",
      "Core:",
      "- /newtask <text>",
      "- /status",
      "- /task <idPrefix>",
      "",
      "Routing:",
      "- /assign <idPrefix> <workerType> [workerId]",
      "- /priority <idPrefix> <low|normal|high|urgent>",
      "",
      "Control:",
      "- /cancel <idPrefix>",
      "- /release <idPrefix>",
      "",
      "Ops:",
      "- /workers",
      "",
      "Worker types: " + WORKER_TYPES.join(", "),
    ].join("\n")
  );
});

bot.command("newtask", async (ctx) => {
  const text = getTextMessage(ctx);
  if (!text) return;
  const argText = text.replace(/^\/newtask\s*/i, "").trim();
  if (!argText) {
    return ctx.reply("Usage: /newtask <text>");
  }

  const id = newId();
  const title = argText.length > 120 ? argText.slice(0, 117) + "..." : argText;
  const description = argText;
  const requestedBy = String(ctx.from?.id ?? "");

  db.prepare(
    "INSERT INTO tasks (id, title, description, source, requested_by, status, priority, tags_json, meta_json) VALUES (?, ?, ?, 'telegram', ?, 'queued', 'normal', '[]', NULL)"
  ).run(id, title, description, requestedBy);

  emitEvent(db, {
    taskId: id,
    actorType: "orchestrator",
    actorId: "telegram",
    type: "task.created",
    message: `task created via /newtask: ${title}`,
    payload: { requestedBy, source: "telegram" },
  });

  await ctx.reply(`Created task ${shortId(id)}\n\n${title}`);
});

bot.command("status", async (ctx) => {
  const tasks = db
    .prepare(
      `SELECT
        t.id, t.title, t.status, t.priority,
        (SELECT worker_type FROM task_assignments a WHERE a.task_id = t.id AND a.status='active' LIMIT 1) AS active_assignment_worker_type,
        (SELECT worker_id FROM task_claims c WHERE c.task_id = t.id AND c.released_at IS NULL LIMIT 1) AS open_claim_worker_id
      FROM tasks t
      WHERE t.status IN ('queued','claimed','running','blocked','needs_review','failed')
      ORDER BY t.updated_at DESC
      LIMIT 10`
    )
    .all() as any[];

  const counts = db
    .prepare(
      "SELECT status, COUNT(*) as n FROM tasks GROUP BY status ORDER BY n DESC"
    )
    .all();

  const workers = db
    .prepare(
      "SELECT id, status, last_heartbeat_at FROM workers ORDER BY last_heartbeat_at DESC LIMIT 10"
    )
    .all() as any[];

  const lines: string[] = [];
  lines.push("Mission Control status");
  lines.push("DB: " + dbPath);
  lines.push("");

  if (counts.length) {
    lines.push(
      "Counts: " +
        counts.map((c: any) => `${c.status}=${c.n}`).join(" ")
    );
    lines.push("");
  }

  lines.push("Active tasks:");
  if (!tasks.length) {
    lines.push("(none)");
  } else {
    for (const t of tasks) lines.push("- " + formatTaskRow(t));
  }

  lines.push("");
  lines.push("Workers:");
  if (!workers.length) {
    lines.push("(none registered)");
  } else {
    for (const w of workers) {
      lines.push(
        `- ${w.id} (${w.status}) last=${w.last_heartbeat_at ?? "never"}`
      );
    }
  }

  await ctx.reply(lines.join("\n"));
});

bot.command("task", async (ctx) => {
  const text = getTextMessage(ctx);
  if (!text) return;
  const arg = text.replace(/^\/task\s*/i, "").trim();
  if (!arg) return ctx.reply("Usage: /task <idPrefix>");

  const t = getTaskByPrefix(db, arg);
  if (!t) {
    return ctx.reply(
      "Task not found (or ambiguous prefix). Try a longer id from /status."
    );
  }

  const assignment = db
    .prepare(
      "SELECT worker_type, worker_id, created_at FROM task_assignments WHERE task_id = ? AND status='active' LIMIT 1"
    )
    .get(t.id) as any;

  const claim = db
    .prepare(
      "SELECT worker_id, claimed_at FROM task_claims WHERE task_id = ? AND released_at IS NULL LIMIT 1"
    )
    .get(t.id) as any;

  const events = db
    .prepare(
      "SELECT created_at, level, type, message FROM events WHERE task_id = ? ORDER BY created_at DESC LIMIT 12"
    )
    .all(t.id) as any[];

  const artifacts = db
    .prepare(
      "SELECT created_at, kind, title, file_path, uri FROM artifacts WHERE task_id = ? ORDER BY created_at DESC LIMIT 8"
    )
    .all(t.id) as any[];

  const lines: string[] = [];
  lines.push(`${t.status} [${t.priority}] ${t.title}`);
  lines.push(`id: ${t.id}`);
  if (t.description) {
    lines.push("");
    lines.push("desc: " + String(t.description).slice(0, 800));
  }

  lines.push("");
  lines.push(
    "assignment: " +
      (assignment
        ? `${assignment.worker_type}${assignment.worker_id ? ` (${assignment.worker_id})` : ""}`
        : "(none)")
  );
  lines.push(
    "claim: " +
      (claim ? `${claim.worker_id} @ ${claim.claimed_at}` : "(none)")
  );

  lines.push("");
  lines.push("events:");
  if (!events.length) lines.push("(none)");
  for (const e of events) {
    lines.push(
      `- ${e.created_at} ${e.level} ${e.type}` +
        (e.message ? ` — ${e.message}` : "")
    );
  }

  lines.push("");
  lines.push("artifacts:");
  if (!artifacts.length) lines.push("(none)");
  for (const a of artifacts) {
    const loc = a.file_path ? a.file_path : a.uri ? a.uri : "";
    lines.push(
      `- ${a.created_at} ${a.kind}` +
        (a.title ? ` — ${a.title}` : "") +
        (loc ? ` (${loc})` : "")
    );
  }

  await ctx.reply(lines.join("\n"));
});

bot.command("assign", async (ctx) => {
  const text = getTextMessage(ctx);
  if (!text) return;
  const args = text.replace(/^\/assign\s*/i, "").trim().split(/\s+/);
  if (args.length < 2) {
    return ctx.reply("Usage: /assign <idPrefix> <workerType> [workerId]");
  }
  const [idPrefix, workerTypeRaw, workerId] = args;
  const workerType = normalizeWorkerType(workerTypeRaw);
  if (!workerType) {
    return ctx.reply(
      `Unknown workerType '${workerTypeRaw}'. Use one of: ${WORKER_TYPES.join(", ")}`
    );
  }

  const t = getTaskByPrefix(db, idPrefix);
  if (!t) {
    return ctx.reply(
      "Task not found (or ambiguous prefix). Try a longer id from /status."
    );
  }

  // Supersede existing active assignment if present.
  db.prepare(
    "UPDATE task_assignments SET status='superseded' WHERE task_id = ? AND status='active'"
  ).run(t.id);

  const assignmentId = newId();
  db.prepare(
    `INSERT INTO task_assignments (
      id, task_id,
      worker_type, worker_id,
      status,
      assigned_by_actor_type, assigned_by_actor_id,
      note
    ) VALUES (?, ?, ?, ?, 'active', 'orchestrator', 'telegram', ?)`
  ).run(assignmentId, t.id, workerType, workerId ?? null, "assigned via /assign");

  emitEvent(db, {
    taskId: t.id,
    actorType: "orchestrator",
    actorId: "telegram",
    type: "task.assigned",
    message: `assigned to ${workerType}${workerId ? ` (${workerId})` : ""}`,
    payload: { workerType, workerId: workerId ?? null },
  });

  await ctx.reply(
    `Assigned ${shortId(t.id)} → ${workerType}${workerId ? ` (${workerId})` : ""}`
  );
});

bot.command("priority", async (ctx) => {
  const text = getTextMessage(ctx);
  if (!text) return;
  const args = text.replace(/^\/priority\s*/i, "").trim().split(/\s+/);
  if (args.length < 2) {
    return ctx.reply("Usage: /priority <idPrefix> <low|normal|high|urgent>");
  }
  const [idPrefix, pri] = args;
  const p = pri.trim().toLowerCase();
  if (!(["low", "normal", "high", "urgent"] as string[]).includes(p)) {
    return ctx.reply("Priority must be one of: low, normal, high, urgent");
  }

  const t = getTaskByPrefix(db, idPrefix);
  if (!t) {
    return ctx.reply(
      "Task not found (or ambiguous prefix). Try a longer id from /status."
    );
  }

  db.prepare("UPDATE tasks SET priority = ? WHERE id = ?").run(p, t.id);
  emitEvent(db, {
    taskId: t.id,
    actorType: "orchestrator",
    actorId: "telegram",
    type: "task.updated",
    message: `priority set to ${p}`,
    payload: { priority: p },
  });

  await ctx.reply(`Priority updated: ${shortId(t.id)} → ${p}`);
});

bot.command("cancel", async (ctx) => {
  const text = getTextMessage(ctx);
  if (!text) return;
  const idPrefix = text.replace(/^\/cancel\s*/i, "").trim();
  if (!idPrefix) return ctx.reply("Usage: /cancel <idPrefix>");

  const t = getTaskByPrefix(db, idPrefix);
  if (!t) {
    return ctx.reply(
      "Task not found (or ambiguous prefix). Try a longer id from /status."
    );
  }

  db.prepare("UPDATE tasks SET status='canceled' WHERE id = ?").run(t.id);
  db.prepare(
    "UPDATE task_assignments SET status='canceled' WHERE task_id = ? AND status='active'"
  ).run(t.id);

  emitEvent(db, {
    taskId: t.id,
    actorType: "orchestrator",
    actorId: "telegram",
    type: "task.canceled",
    message: "task canceled via /cancel",
  });

  await ctx.reply(`Canceled task ${shortId(t.id)}`);
});

bot.command("release", async (ctx) => {
  const text = getTextMessage(ctx);
  if (!text) return;
  const idPrefix = text.replace(/^\/release\s*/i, "").trim();
  if (!idPrefix) return ctx.reply("Usage: /release <idPrefix>");

  const t = getTaskByPrefix(db, idPrefix);
  if (!t) {
    return ctx.reply(
      "Task not found (or ambiguous prefix). Try a longer id from /status."
    );
  }

  const openClaim = db
    .prepare(
      "SELECT id, worker_id FROM task_claims WHERE task_id = ? AND released_at IS NULL LIMIT 1"
    )
    .get(t.id) as any;

  if (!openClaim) {
    return ctx.reply(`No open claim for ${shortId(t.id)}`);
  }

  db.prepare(
    "UPDATE task_claims SET released_at=datetime('now'), status='released' WHERE id = ?"
  ).run(openClaim.id);

  emitEvent(db, {
    taskId: t.id,
    actorType: "orchestrator",
    actorId: "telegram",
    type: "task.released",
    message: `claim released (was ${openClaim.worker_id})`,
    payload: { workerId: openClaim.worker_id },
  });

  await ctx.reply(`Released claim for ${shortId(t.id)} (was ${openClaim.worker_id})`);
});

bot.command("workers", async (ctx) => {
  const workers = db
    .prepare(
      "SELECT id, status, last_heartbeat_at, worker_types_json FROM workers ORDER BY last_heartbeat_at DESC NULLS LAST, created_at DESC LIMIT 25"
    )
    .all() as any[];

  if (!workers.length) {
    return ctx.reply("No workers registered yet.");
  }

  const lines: string[] = [];
  lines.push("Workers:");
  for (const w of workers) {
    let types = "";
    try {
      const arr = JSON.parse(w.worker_types_json ?? "[]");
      if (Array.isArray(arr)) types = arr.join(", ");
    } catch {
      // ignore
    }
    lines.push(
      `- ${w.id} (${w.status}) last=${w.last_heartbeat_at ?? "never"}` +
        (types ? ` types=[${types}]` : "")
    );
  }

  await ctx.reply(lines.join("\n"));
});

// Best-effort: register bot commands with Telegram so they autocomplete.
try {
  const commandList = [
    { command: "newtask", description: "Create a new task" },
    { command: "status", description: "Show queue + workers" },
    { command: "task", description: "Show task details" },
    { command: "assign", description: "Assign a task to a worker type" },
    { command: "priority", description: "Set task priority" },
    { command: "cancel", description: "Cancel a task" },
    { command: "release", description: "Release a stuck claim" },
    { command: "workers", description: "List workers + heartbeats" },
    { command: "help", description: "Show help" },
  ];
  bot.telegram.setMyCommands(commandList as any);
} catch {
  // ignore; bot can still run without this.
}

bot.launch().then(() => {
  console.log("jarvis-orchestrator started", { dbPath, startedAt: nowIso() });
  emitEvent(db, {
    actorType: "orchestrator",
    actorId: "startup",
    type: "orchestrator.started",
    message: "jarvis-orchestrator started",
  });
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
