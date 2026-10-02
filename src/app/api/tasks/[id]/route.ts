import { NextResponse } from "next/server";
import { db, logEvent, taskWithDetails } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = taskWithDetails(Number(id));
  return task ? NextResponse.json(task) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  const body = await req.json();
  const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed = ["title", "description", "status", "priority", "assignee"] as const;
  const updates = allowed.filter(k => body[k] !== undefined);
  if (updates.length) {
    const sql = `UPDATE tasks SET ${updates.map(k => `${k} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.prepare(sql).run(...updates.map(k => body[k]), id);
  }

  if (body.status && body.status !== current.status) {
    logEvent(id, "STATUS_CHANGED", body.actor ?? "human", { from: current.status, to: body.status });
  }
  if (body.comment?.trim()) {
    logEvent(id, "COMMENT_POSTED", body.actor ?? "human", { text: body.comment.trim() });
  }
  if (body.dependsOn) {
    if (Number(body.dependsOn) === id) return NextResponse.json({ error: "self dependency" }, { status: 400 });
    try {
      db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)").run(id, Number(body.dependsOn));
      logEvent(id, "DEPENDENCY_ADDED", body.actor ?? "human", { dependsOn: Number(body.dependsOn) });
    } catch {
      return NextResponse.json({ error: "invalid dependency" }, { status: 400 });
    }
  }
  return NextResponse.json(taskWithDetails(id));
}
