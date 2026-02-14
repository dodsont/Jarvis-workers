# Jarvis Architecture (v1)

## Goals

- A *single* Telegram bot (“Jarvis”) is the only thing that communicates with Tom (**Single Port Rule**)
- Local workers (coder/researcher/SEO/designer/tester) do the execution
- A central Mission Control board (SQLite) is the source of truth: tasks, events, artifacts

## Services

### 1) `services/jarvis-orchestrator`

Responsibilities:
- Telegram adapter (commands, buttons)
- Planning/routing: turns user intent into structured tasks
- Assignment: picks worker type(s) and priority
- Status updates to Telegram

Constraints:
- **Never executes** tasks directly
- Must only report completion based on Mission Control artifacts written by workers

### 2) `services/worker-runner`

Responsibilities:
- Poll/claim tasks assigned to its worker types
- Execute (LLM calls, shell commands, file edits within allowed workspace)
- Write artifacts + events back to Mission Control

### 3) `services/mission-control-ui`

Responsibilities:
- Kanban + task detail UI
- Show event log + artifacts
- Basic admin actions: create/assign/cancel tasks

Network:
- Must be reachable on LAN (`0.0.0.0`), add simple auth

## Shared State: Mission Control (SQLite)

- SQLite DB file (path configurable)
- Append-only event log (for auditability)
- Task table with status + assignment
- Artifacts table that can point to local files (or store small text blobs)

See: `packages/mission-control-db/schema.sql`.

Event types are documented in: `docs/EVENT_TYPES.md`.
