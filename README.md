# Jarvis-workers

Jarvis-workers is a monorepo for **Jarvis**: a Telegram-facing orchestrator bot + a local squad of specialized worker agents + a web “Mission Control” UI, all coordinated via a shared SQLite database.

This repo is written to be readable by:
- **Future Tom** (implementation details + sharp edges called out)
- **Contributors** (clear contracts, boundaries, and where to change things)
- **Henry (me)** when context is cold (the README is the canonical “what is this?”)

## What this project is

Jarvis is a *router + coordinator*, not “one big agent”. The core idea is to separate:

- **Interface** (Telegram; human intent)
- **Planning/dispatch** (orchestrator chooses worker types, priorities)
- **Execution** (workers actually do work)
- **Source of truth** (Mission Control DB records tasks/events/artifacts)

### Single Port Rule (non-negotiable)

**Only `jarvis-orchestrator` talks to Tom on Telegram.**

Workers never DM Tom. Workers only write to Mission Control (events + artifacts). The orchestrator reads those artifacts and summarizes back to Telegram.

This keeps:
- communication clean (one thread)
- auditability high (everything goes through the board)
- hallucination risk lower (orchestrator reports from artifacts, not vibes)

## Services

### 1) `services/jarvis-orchestrator`

**Responsibilities**
- Telegram bot UI (commands, buttons)
- Turns messages into structured tasks
- Creates assignments (“who should do it?”)
- Posts status updates back to Telegram

**Constraints**
- Must **not** execute tasks directly
- Must only claim “done” based on Mission Control artifacts/events

Env: see `services/jarvis-orchestrator/.env.example`

### 2) `services/worker-runner`

**Responsibilities**
- Runs worker implementations (coder/researcher/seo/designer/tester)
- Polls Mission Control for assigned tasks
- Claims work, executes it, writes results back as artifacts + events

Notes
- Execution permissions must be explicit per worker type.
- “Coder/tester” style workers may run shell + edit files, but should be sandboxed to an allowed workspace.

Env: see `services/worker-runner/.env.example`

### 3) `services/mission-control-ui`

**Responsibilities**
- Web UI (Kanban + task detail)
- View tasks, event log, and artifacts
- Basic admin actions (create/assign/cancel)

Network
- Intended to be reachable on LAN (`0.0.0.0`) with simple auth (v1).

Env: see `services/mission-control-ui/.env.example`

## Mission Control (SQLite) — the contract

Mission Control is the shared board and the **source of truth**.

Schema: `packages/mission-control-db/schema.sql`

### Data model (why it’s shaped this way)

- `tasks`: the canonical “thing to do”
- `task_assignments`: **intent** (orchestrator/UI says *who should do it*)
- `task_claims`: **reality** (a worker says *I am doing it*)
- `events`: append-only audit log (status changes, logs, heartbeats, etc.)
- `artifacts`: outputs (text, files, links, json)
- `workers`: registered executors + last heartbeat

That separation is deliberate: we want “what we asked for” and “what actually happened” both recorded.

### Canonical event types

Event types are documented here: `docs/EVENT_TYPES.md`

Rule of thumb:
- Put large content in **artifacts**.
- Put small facts / transitions in **events**.

## Repo layout

```
services/
  jarvis-orchestrator/
  worker-runner/
  mission-control-ui/
packages/
  mission-control-db/
  shared/
docs/
```

## Development (local)

This repo is still early-stage scaffolding, but you can typecheck everything:

```bash
npm install
npm run typecheck
```

Each service has a `dev` script, but treat them as placeholders until we formalize runbooks.

## How we keep docs accurate (process)

**The README is canonical.** If a PR changes behavior, schema, or contracts, it must update:
- `README.md` (overview + contracts)
- and/or the relevant doc (`docs/ARCHITECTURE.md`, `docs/EVENT_TYPES.md`, schema)

We enforce this with a PR checklist (see `.github/pull_request_template.md`).

## License

TBD.
