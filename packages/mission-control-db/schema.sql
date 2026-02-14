-- Mission Control SQLite schema (v1)

PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',

  assigned_worker_type TEXT,
  claimed_by TEXT,
  claimed_at TEXT,

  parent_task_id TEXT,

  FOREIGN KEY(parent_task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_worker_type ON tasks(assigned_worker_type);

-- Append-only event log (audit trail)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,

  task_id TEXT,
  actor_type TEXT NOT NULL, -- 'orchestrator' | 'worker' | 'ui'
  actor_id TEXT,

  type TEXT NOT NULL,       -- 'task.created', 'task.assigned', 'worker.log', ...
  message TEXT,
  payload_json TEXT,

  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- Artifacts produced by workers (can reference local file paths)
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,

  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,        -- 'text' | 'file' | 'link' | 'json'
  title TEXT,

  text_content TEXT,
  file_path TEXT,
  mime_type TEXT,

  meta_json TEXT,

  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
