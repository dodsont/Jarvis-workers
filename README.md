# Jarvis-workers

A monorepo for the **Jarvis** system:

- **jarvis-orchestrator**: the only component that talks to Tom on Telegram (Single Port Rule)
- **worker-runner**: local worker processes that claim tasks and write results/artifacts
- **mission-control-ui**: a LAN-reachable web UI for viewing/creating tasks (Kanban + task detail)

## Non-goals (v1)

- Running in prod yet
- Polished UX

## Architecture (v1)

- Shared state is a **SQLite Mission Control board** (not JSON)
- Workers never DM Tom; they communicate through Mission Control
- Orchestrator **does not execute** tasks; it only assigns and summarizes worker artifacts

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

## Quick start (dev)

Not wired to actually run yet — this repo is scaffolding + conventions.

## License

TBD.
