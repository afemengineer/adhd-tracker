# ADHD Tracker

An agent-first personal task tracker/control plane. The web UI and MCP clients manipulate the same canonical task state, so human work, Codex work, dependencies, comments, run metadata and verification history all stay in one place.

## V0

- Kanban-style board with **Backlog → Ready → Running → Blocked → Review → Verified → Done**
- Drag/drop workflow changes
- Task detail activity timeline
- Comments/evidence/handoff notes
- Dependencies and agent-run history
- SQLite + WAL, deliberately no external infrastructure
- 30-day statistics derived from the event log
- MCP server exposing task/run lifecycle tools

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The SQLite database is created at `data/adhd.db` and seeds three example tasks the first time it starts.

Optional:

```bash
cp .env.example .env
```

## Connect Codex / an MCP client

The stdio MCP server is:

```bash
npm run mcp
```

Equivalent command for an MCP configuration:

```json
{
  "command": "npm",
  "args": ["run", "mcp"],
  "cwd": "/absolute/path/to/adhd-tracker"
}
```

Available tools:

- `tasks_list`
- `tasks_get`
- `tasks_create`
- `tasks_update`
- `tasks_comment`
- `tasks_add_dependency`
- `runs_start`
- `runs_finish`

Agents are expected to move completed implementation work to **review**. **Verified** is intentionally separate: deterministic tests, a reviewer, or another agent should satisfy the acceptance criteria before a task becomes verified/done.

## Architecture

```text
Web UI ───────────────┐
                     │
MCP clients ─────────┼──> canonical task/event/run state ──> SQLite
                     │
future runners ──────┘
```

The event log is first-class. Statistics, audit history, agent evidence and future automation should be derived from it rather than maintained as parallel state.

## Next

V0 intentionally omits autonomous scheduling, authentication and remote deployment. The next hardening slice should add:

1. capability grants for MCP sessions;
2. atomic task claiming/leases for concurrent agents;
3. dependency-cycle detection;
4. run heartbeats + stale-run recovery;
5. deterministic verification gates;
6. artifact attachment handling;
7. SSE/WebSocket live updates instead of polling.
