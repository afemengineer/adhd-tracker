import { NextResponse } from "next/server";
import { db, logEvent } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY priority = 'urgent' DESC, priority = 'high' DESC, updated_at DESC").all();
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const result = db.prepare(
    "INSERT INTO tasks (title, description, status, priority, assignee, source) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    body.title.trim(),
    body.description ?? "",
    body.status ?? "backlog",
    body.priority ?? "medium",
    body.assignee ?? null,
    body.source ?? "human"
  );
  const id = Number(result.lastInsertRowid);
  logEvent(id, "TASK_CREATED", body.actor ?? "human", { source: body.source ?? "human" });
  return NextResponse.json(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id), { status: 201 });
}
