import express from "express";
import fs from "node:fs";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";

const schemaUrl = new URL(
  "../../../packages/mission-control-db/schema.sql",
  import.meta.url
);
const schemaSql = fs.readFileSync(schemaUrl, "utf8");

const db = openMissionControlDB({ dbPath });
applySchema(db, schemaSql);

const app = express();
app.use(express.json());

// TODO: real auth. For now, optional basic auth.
const user = process.env.BASIC_AUTH_USER;
const pass = process.env.BASIC_AUTH_PASS;
if (user && pass) {
  app.use((req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Basic ")) return res.status(401).send("auth required");
    const [u, p] = Buffer.from(header.slice("Basic ".length), "base64")
      .toString("utf8")
      .split(":");
    if (u !== user || p !== pass) return res.status(403).send("forbidden");
    next();
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath });
});

app.get("/api/tasks", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id, created_at, updated_at, title, description, status, priority, assigned_worker_type, claimed_by, claimed_at FROM tasks ORDER BY updated_at DESC LIMIT 200"
    )
    .all();
  res.json(rows);
});

app.post("/api/tasks", (req, res) => {
  const id = crypto.randomUUID();
  const { title, description, priority, assigned_worker_type } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title required" });
  }
  db.prepare(
    "INSERT INTO tasks (id, created_at, updated_at, title, description, status, priority, assigned_worker_type) VALUES (?, datetime('now'), datetime('now'), ?, ?, 'queued', ?, ?)"
  ).run(
    id,
    title,
    typeof description === "string" ? description : null,
    typeof priority === "string" ? priority : "normal",
    typeof assigned_worker_type === "string" ? assigned_worker_type : null
  );
  db.prepare(
    "INSERT INTO events (id, created_at, task_id, actor_type, actor_id, type, message, payload_json) VALUES (?, datetime('now'), ?, 'ui', NULL, 'task.created', ?, NULL)"
  ).run(crypto.randomUUID(), id, `task created: ${title}`);

  res.status(201).json({ id });
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mission Control (Scaffold)</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 24px; }
    code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
    .row { display:flex; gap: 24px; align-items: flex-start; }
    .card { border: 1px solid #ddd; padding: 16px; border-radius: 12px; width: 520px; }
    input, textarea, select { width: 100%; padding: 8px; margin: 6px 0 10px; }
    button { padding: 8px 12px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>Mission Control <small style="font-weight:normal; color:#666;">(scaffold)</small></h1>
  <p>DB: <code>${dbPath}</code></p>
  <div class="row">
    <div class="card">
      <h2>Create task</h2>
      <label>Title</label>
      <input id="title" placeholder="e.g. Add /newtask command" />
      <label>Description</label>
      <textarea id="desc" rows="4" placeholder="details..."></textarea>
      <label>Assigned worker type</label>
      <select id="workerType">
        <option value="">(unassigned)</option>
        <option value="coder">coder</option>
        <option value="researcher">researcher</option>
        <option value="seo">seo</option>
        <option value="designer">designer</option>
        <option value="tester">tester</option>
      </select>
      <button id="create">Create</button>
      <div id="createResult"></div>
    </div>

    <div class="card">
      <h2>Latest tasks</h2>
      <button id="refresh">Refresh</button>
      <ul id="tasks"></ul>
    </div>
  </div>

<script>
  async function refresh() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const ul = document.getElementById('tasks');
    ul.innerHTML = '';
    for (const t of tasks) {
      const li = document.createElement('li');
      li.textContent = `${t.status} [${t.priority}] ${t.title} (${t.id.slice(0,8)})`;
      ul.appendChild(li);
    }
  }
  document.getElementById('refresh').onclick = refresh;
  document.getElementById('create').onclick = async () => {
    const title = document.getElementById('title').value;
    const description = document.getElementById('desc').value;
    const assigned_worker_type = document.getElementById('workerType').value || null;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description, assigned_worker_type })
    });
    const body = await res.json();
    document.getElementById('createResult').textContent = res.ok ? `Created: ${body.id}` : `Error: ${body.error}`;
    await refresh();
  };
  refresh();
</script>
</body>
</html>`);
});

app.listen(port, host, () => {
  console.log(`mission-control-ui listening on http://${host}:${port}`);
});
