import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Status = "backlog" | "ready" | "running" | "blocked" | "review" | "verified" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";

const dbPath = process.env.ADHD_DB_PATH ?? path.join(process.cwd(), "data", "adhd.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee TEXT,
  source TEXT NOT NULL DEFAULT 'human',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id, depends_on_task_id),
  CHECK(task_id != depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  summary TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
`);

const count = db.prepare("SELECT COUNT(*) AS n FROM tasks").get() as { n: number };
if (count.n === 0) {
  const seed = db.prepare("INSERT INTO tasks (title, description, status, priority, source) VALUES (?, ?, ?, ?, ?)");
  const tx = db.transaction(() => {
    seed.run("Wire Codex into the tracker MCP", "Expose task lifecycle tools and write agent activity into the same event log as the UI.", "running", "high", "system");
    seed.run("Add deterministic verification gates", "Separate agent-complete from verified. Tests or a reviewer should move REVIEW to VERIFIED.", "ready", "high", "system");
    seed.run("Polish task detail activity timeline", "Render structured comments, transitions and run summaries as one chronological feed.", "backlog", "medium", "system");
  });
  tx();
}

export function taskWithDetails(id: number) {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) return null;
  const events = db.prepare("SELECT * FROM events WHERE task_id = ? ORDER BY id DESC").all(id);
  const dependencies = db.prepare(`
    SELECT t.id, t.title, t.status
    FROM task_dependencies d
    JOIN tasks t ON t.id = d.depends_on_task_id
    WHERE d.task_id = ?
  `).all(id);
  const runs = db.prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY id DESC").all(id);
  return { ...(task as Record<string, unknown>), events, dependencies, runs };
}

export function logEvent(taskId: number | null, type: string, actor: string, payload: unknown = {}) {
  db.prepare("INSERT INTO events (task_id, type, actor, payload) VALUES (?, ?, ?, ?)")
    .run(taskId, type, actor, JSON.stringify(payload));
}
