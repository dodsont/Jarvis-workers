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
