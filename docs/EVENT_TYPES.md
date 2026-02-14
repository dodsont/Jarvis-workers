# Mission Control event types (v1)

Events are **append-only** rows in `events`.

## Conventions

- `type` is a dotted string: `domain.verb` (e.g. `task.created`)
- `actor_type` is one of: `orchestrator | worker | ui`
- `payload_json` is optional JSON for structured data
- Prefer small, stable payload shapes over dumping huge text (use `artifacts` for that)

## Canonical types

### Task lifecycle

- `task.created`
- `task.updated`
- `task.status_changed`
- `task.assigned` (assignment created/updated)
- `task.unassigned`
- `task.canceled`

### Claiming / execution

- `task.claimed`
- `task.released`
- `task.run_started`
- `task.run_finished`
- `task.run_failed`

### Worker health / logs

- `worker.registered`
- `worker.heartbeat`
- `worker.log`

### Artifacts

- `artifact.created`
- `artifact.linked`

## Suggested payloads

- `task.status_changed`: `{ "from": "queued", "to": "running" }`
- `task.assigned`: `{ "workerType": "coder", "workerId": "local-worker-1" }`
- `task.claimed`: `{ "workerId": "local-worker-1" }`
- `worker.heartbeat`: `{ "workerTypes": ["coder","researcher"], "pid": 12345 }`
- `artifact.created`: `{ "artifactId": "...", "kind": "file", "filePath": "..." }`
