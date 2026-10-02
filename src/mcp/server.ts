import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db, logEvent, taskWithDetails } from "../lib/db.js";

const server = new McpServer({ name: "adhd-tracker", version: "0.1.0" });

server.tool("tasks_list", "List tasks visible to the agent.", {
  status: z.string().optional()
}, async ({ status }) => {
  const rows = status
    ? db.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC").all(status)
    : db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC").all();
  return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
});

server.tool("tasks_get", "Get one task, including dependencies, activity and agent runs.", {
  id: z.number().int().positive()
}, async ({ id }) => {
  const task = taskWithDetails(id);
  return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
});

server.tool("tasks_create", "Create a task discovered during work.", {
  title: z.string().min(1),
  description: z.string().default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["backlog", "ready", "running", "blocked", "review", "verified", "done"]).default("backlog")
}, async ({ title, description, priority, status }) => {
  const result = db.prepare(
    "INSERT INTO tasks (title, description, priority, status, source) VALUES (?, ?, ?, ?, 'agent')"
  ).run(title, description, priority, status);
  const id = Number(result.lastInsertRowid);
  logEvent(id, "TASK_CREATED", "agent:mcp", { source: "agent" });
  return { content: [{ type: "text", text: JSON.stringify(taskWithDetails(id), null, 2) }] };
});

server.tool("tasks_update", "Update task fields or move workflow state. Agents should normally finish work in review, not done.", {
  id: z.number().int().positive(),
  status: z.enum(["backlog", "ready", "running", "blocked", "review", "verified", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().nullable().optional(),
  description: z.string().optional()
}, async ({ id, status, priority, assignee, description }) => {
  const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!current) throw new Error("Task not found");
  const pairs: [string, unknown][] = Object.entries({ status, priority, assignee, description }).filter(([,v]) => v !== undefined);
  if (pairs.length) {
    db.prepare(`UPDATE tasks SET ${pairs.map(([k]) => `${k} = ?`).join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(...pairs.map(([,v]) => v), id);
  }
  if (status && status !== current.status) logEvent(id, "STATUS_CHANGED", "agent:mcp", { from: current.status, to: status });
  return { content: [{ type: "text", text: JSON.stringify(taskWithDetails(id), null, 2) }] };
});

server.tool("tasks_comment", "Append evidence, progress, blockers, validation results or handoff notes.", {
  id: z.number().int().positive(),
  text: z.string().min(1)
}, async ({ id, text }) => {
  logEvent(id, "COMMENT_POSTED", "agent:mcp", { text });
  return { content: [{ type: "text", text: "ok" }] };
});

server.tool("tasks_add_dependency", "Make one task depend on another.", {
  id: z.number().int().positive(),
  dependsOn: z.number().int().positive()
}, async ({ id, dependsOn }) => {
  if (id === dependsOn) throw new Error("A task cannot depend on itself");
  db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)").run(id, dependsOn);
  logEvent(id, "DEPENDENCY_ADDED", "agent:mcp", { dependsOn });
  return { content: [{ type: "text", text: "ok" }] };
});

server.tool("runs_start", "Record the start of an autonomous or interactive agent run.", {
  taskId: z.number().int().positive(),
  agent: z.string().min(1),
  model: z.string().optional()
}, async ({ taskId, agent, model }) => {
  const result = db.prepare("INSERT INTO runs (task_id, agent, model) VALUES (?, ?, ?)").run(taskId, agent, model ?? null);
  const runId = Number(result.lastInsertRowid);
  logEvent(taskId, "AGENT_RUN_STARTED", agent, { runId, model });
  return { content: [{ type: "text", text: JSON.stringify({ runId }) }] };
});

server.tool("runs_finish", "Finish an agent run and store its structured summary.", {
  runId: z.number().int().positive(),
  status: z.enum(["completed", "failed", "cancelled"]),
  summary: z.string().optional()
}, async ({ runId, status, summary }) => {
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as { task_id: number; agent: string } | undefined;
  if (!run) throw new Error("Run not found");
  db.prepare("UPDATE runs SET status=?, summary=?, finished_at=CURRENT_TIMESTAMP WHERE id=?").run(status, summary ?? null, runId);
  logEvent(run.task_id, "AGENT_RUN_FINISHED", run.agent, { runId, status, summary });
  return { content: [{ type: "text", text: "ok" }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
