-- Mission Control SQLite schema (v1)
--
-- Goals:
-- - SQLite as the single source of truth (tasks, assignments, heartbeats, events, artifacts)
-- - Append-only `events` table (audit trail)
-- - Safe-ish constraints via CHECKs + indexes

PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;

-- ------------------------------------------------------------
-- Core enums (documented via CHECK constraints)
-- ------------------------------------------------------------

-- tasks.status:
-- queued | claimed | running | blocked | needs_review | done | failed | canceled
-- tasks.priority:
-- low | normal | high | urgent
-- events.actor_type:
-- orchestrator | worker | ui
-- events.level:
-- debug | info | warn | error

-- ------------------------------------------------------------
-- Tasks
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued','claimed','running','blocked','needs_review','done','failed','canceled'
    )),

  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),

  -- Optional lineage / dependencies
  parent_task_id TEXT,
  blocked_by_task_id TEXT,

  -- Optional provenance (Telegram, UI, etc.)
  source TEXT,           -- e.g. 'telegram', 'ui'
  requested_by TEXT,     -- e.g. telegram user id

  tags_json TEXT,        -- JSON array of strings
  meta_json TEXT,

  FOREIGN KEY(parent_task_id) REFERENCES tasks(id),
  FOREIGN KEY(blocked_by_task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

-- Update tasks.updated_at whenever the row changes.
CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ------------------------------------------------------------
-- Workers (registered executors)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  status TEXT NOT NULL DEFAULT 'online'
    CHECK (status IN ('online','offline','draining')),

  worker_types_json TEXT NOT NULL, -- JSON array: ["coder","researcher",...]

  last_heartbeat_at TEXT,
  meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON workers(last_heartbeat_at);

CREATE TRIGGER IF NOT EXISTS trg_workers_updated_at
AFTER UPDATE ON workers
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE workers SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ------------------------------------------------------------
-- Task assignments (orchestrator intent)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS task_assignments (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  task_id TEXT NOT NULL,

  worker_type TEXT NOT NULL, -- 'coder' | 'researcher' | 'seo' | 'designer' | 'tester'
  worker_id TEXT,            -- optional pin to a specific worker

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','superseded','canceled')),

  assigned_by_actor_type TEXT NOT NULL
    CHECK (assigned_by_actor_type IN ('orchestrator','worker','ui')),
  assigned_by_actor_id TEXT,

  note TEXT,
  meta_json TEXT,

  FOREIGN KEY(task_id) REFERENCES tasks(id),
  FOREIGN KEY(worker_id) REFERENCES workers(id)
);

-- At most one active assignment per task.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignments_active
ON task_assignments(task_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_assignments_worker_type ON task_assignments(worker_type);
CREATE INDEX IF NOT EXISTS idx_task_assignments_worker_id ON task_assignments(worker_id);

-- ------------------------------------------------------------
-- Task claims (worker actually takes ownership)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS task_claims (
  id TEXT PRIMARY KEY,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  released_at TEXT,

  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed','released','lost')),

  meta_json TEXT,

  FOREIGN KEY(task_id) REFERENCES tasks(id),
  FOREIGN KEY(worker_id) REFERENCES workers(id)
);

-- Only one *open* claim per task.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_claims_open
ON task_claims(task_id)
WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_claims_worker_id ON task_claims(worker_id);

-- ------------------------------------------------------------
-- Append-only events (audit trail)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  task_id TEXT,

  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('orchestrator','worker','ui')),
  actor_id TEXT,

  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug','info','warn','error')),

  type TEXT NOT NULL, -- e.g. 'task.created', 'task.assigned', 'worker.heartbeat'
  message TEXT,

  correlation_id TEXT,

  payload_json TEXT,

  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- ------------------------------------------------------------
-- Artifacts (files, text blobs, json outputs)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  task_id TEXT NOT NULL,

  kind TEXT NOT NULL
    CHECK (kind IN ('text','file','link','json')),

  title TEXT,

  -- One of these typically populated depending on kind
  text_content TEXT,
  file_path TEXT,
  uri TEXT,

  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,

  created_by_actor_type TEXT NOT NULL
    CHECK (created_by_actor_type IN ('orchestrator','worker','ui')),
  created_by_actor_id TEXT,

  meta_json TEXT,

  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
