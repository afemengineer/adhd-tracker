import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const total = (db.prepare("SELECT COUNT(*) AS n FROM tasks").get() as { n: number }).n;
  const byStatus = db.prepare("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status").all();
  const events = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
    FROM events
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY day ORDER BY day
  `).all();
  const runs = db.prepare(`
    SELECT COUNT(*) AS total_runs,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs
    FROM runs
  `).get();
  return NextResponse.json({ total, byStatus, events, runs });
}
