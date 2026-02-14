export type WorkerType =
  | "coder"
  | "researcher"
  | "seo"
  | "designer"
  | "tester";

export type TaskStatus =
  | "queued"
  | "claimed"
  | "running"
  | "blocked"
  | "needs_review"
  | "done"
  | "failed"
  | "canceled";

export type Priority = "low" | "normal" | "high" | "urgent";

export type ActorType = "orchestrator" | "worker" | "ui";

export type EventLevel = "debug" | "info" | "warn" | "error";

// Canonical event types are documented in /docs/EVENT_TYPES.md.
export type EventType =
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "task.assigned"
  | "task.unassigned"
  | "task.canceled"
  | "task.claimed"
  | "task.released"
  | "task.run_started"
  | "task.run_finished"
  | "task.run_failed"
  | "worker.registered"
  | "worker.heartbeat"
  | "worker.log"
  | "artifact.created"
  | "artifact.linked";
