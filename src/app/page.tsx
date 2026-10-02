"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: number;
  title: string;
  description: string;
  status: "backlog" | "ready" | "running" | "blocked" | "review" | "verified" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assignee: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

type TaskDetail = Task & {
  events: { id: number; type: string; actor: string; payload: string; created_at: string }[];
  dependencies: { id: number; title: string; status: string }[];
  runs: { id: number; agent: string; model: string | null; status: string; summary: string | null; started_at: string; finished_at: string | null }[];
};

const columns = [
  ["backlog", "Backlog"],
  ["ready", "Ready"],
  ["running", "Running"],
  ["blocked", "Blocked"],
  ["review", "Review"],
  ["verified", "Verified"],
  ["done", "Done"]
] as const;

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<TaskDetail | null>(null);
  const [view, setView] = useState<"board" | "stats">("board");
  const [stats, setStats] = useState<any>(null);
  const [comment, setComment] = useState("");

  const loadTasks = async () => {
    const r = await fetch("/api/tasks", { cache: "no-store" });
    setTasks(await r.json());
  };

  const loadStats = async () => {
    const r = await fetch("/api/stats", { cache: "no-store" });
    setStats(await r.json());
  };

  useEffect(() => {
    void loadTasks();
    const timer = setInterval(loadTasks, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view === "stats") void loadStats();
  }, [view]);

  const openTask = async (id: number) => {
    const r = await fetch(`/api/tasks/${id}`, { cache: "no-store" });
    setSelected(await r.json());
  };

  const patchTask = async (id: number, patch: Record<string, unknown>) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...patch, actor: "human:web" })
    });
    await loadTasks();
    if (selected?.id === id) await openTask(id);
  };

  const createTask = async () => {
    const title = window.prompt("Task title");
    if (!title?.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, status: "backlog", priority: "medium", actor: "human:web" })
    });
    await loadTasks();
  };

  const counts = useMemo(
    () => Object.fromEntries(columns.map(([key]) => [key, tasks.filter(t => t.status === key).length])),
    [tasks]
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">A</span>
          <span>ADHD TRACKER</span>
        </div>
        <nav>
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Tasks</button>
          <button className={view === "stats" ? "active" : ""} onClick={() => setView("stats")}>Stats</button>
        </nav>
        <div className="tag">LOCAL CONTROL PLANE</div>
      </header>

      {view === "board" ? (
        <>
          <section className="hero">
            <div>
              <div className="eyebrow">TASKS / AGENT CONTROL PLANE</div>
              <h1>Task tracker</h1>
              <p>Humans and agents operate the same canonical task state.</p>
            </div>
            <button className="primary" onClick={createTask}>+ New task</button>
          </section>

          <section className="board">
            {columns.map(([status, label]) => (
              <div className="column" key={status}>
                <div className="columnHead">
                  <span><i className={`dot ${status}`} />{label}</span>
                  <b>{counts[status] ?? 0}</b>
                </div>
                <div className="stack">
                  {tasks.filter(t => t.status === status).map(task => (
                    <article
                      className="card"
                      key={task.id}
                      onClick={() => void openTask(task.id)}
                      draggable
                      onDragStart={e => e.dataTransfer.setData("taskId", String(task.id))}
                    >
                      <div className="meta">
                        <span>#{task.id}</span>
                        <span className={`priority ${task.priority}`}>{task.priority}</span>
                      </div>
                      <h3>{task.title}</h3>
                      <p>{task.description || "No description yet."}</p>
                      <footer>
                        <span>{task.assignee ?? (task.source === "agent" ? "agent" : "unassigned")}</span>
                        <span>{task.source}</span>
                      </footer>
                    </article>
                  ))}
                </div>
                <div
                  className="dropzone"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const id = Number(e.dataTransfer.getData("taskId"));
                    if (id) void patchTask(id, { status });
                  }}
                >
                  drop here
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <StatsPanel stats={stats} />
      )}

      {selected && (
        <div className="overlay" onMouseDown={() => setSelected(null)}>
          <section className="modal" onMouseDown={e => e.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>×</button>
            <div className="modalTitle">
              <span>#{selected.id}</span>
              <select value={selected.status} onChange={e => void patchTask(selected.id, { status: e.target.value })}>
                {columns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <h2>{selected.title}</h2>
            <p className="description">{selected.description || "No description yet."}</p>

            <div className="detailGrid">
              <div>
                <h4>Activity</h4>
                <div className="composer">
                  <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add evidence, note, blocker or handoff…" />
                  <button onClick={async () => {
                    if (!comment.trim()) return;
                    await patchTask(selected.id, { comment });
                    setComment("");
                  }}>Post</button>
                </div>
                <div className="timeline">
                  {selected.events.map(event => {
                    let payload: any = {};
                    try { payload = JSON.parse(event.payload); } catch {}
                    return (
                      <div className="event" key={event.id}>
                        <div className="eventTop"><b>{event.actor}</b><span>{new Date(event.created_at + "Z").toLocaleString()}</span></div>
                        <div className="eventType">{event.type}</div>
                        {payload.text && <p>{payload.text}</p>}
                        {!payload.text && Object.keys(payload).length > 0 && <pre>{JSON.stringify(payload, null, 2)}</pre>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside>
                <h4>Task metadata</h4>
                <dl>
                  <dt>Priority</dt><dd>{selected.priority}</dd>
                  <dt>Assignee</dt><dd>{selected.assignee ?? "—"}</dd>
                  <dt>Source</dt><dd>{selected.source}</dd>
                  <dt>Updated</dt><dd>{new Date(selected.updated_at + "Z").toLocaleString()}</dd>
                </dl>

                <h4>Dependencies</h4>
                {selected.dependencies.length ? selected.dependencies.map(d => (
                  <button className="dep" key={d.id} onClick={() => void openTask(d.id)}>#{d.id} · {d.title} <small>{d.status}</small></button>
                )) : <p className="muted">None</p>}

                <h4>Agent runs</h4>
                {selected.runs.length ? selected.runs.map(r => (
                  <div className="run" key={r.id}>
                    <b>{r.agent}</b><span>{r.status}</span>
                    {r.model && <small>{r.model}</small>}
                    {r.summary && <p>{r.summary}</p>}
                  </div>
                )) : <p className="muted">No recorded runs.</p>}
              </aside>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function StatsPanel({ stats }: { stats: any }) {
  if (!stats) return <section className="stats"><p>Loading…</p></section>;
  const max = Math.max(1, ...stats.events.map((e: any) => Number(e.count)));
  return (
    <section className="stats">
      <div className="eyebrow">OBSERVABILITY</div>
      <h1>Statistics</h1>
      <p>Activity derived from the same event log used by agents and the UI.</p>

      <div className="statCards">
        <div><span>TOTAL TASKS</span><b>{stats.total}</b></div>
        <div><span>AGENT RUNS</span><b>{stats.runs?.total_runs ?? 0}</b></div>
        <div><span>COMPLETED RUNS</span><b>{stats.runs?.completed_runs ?? 0}</b></div>
        <div><span>EVENTS / 30D</span><b>{stats.events.reduce((n: number, e: any) => n + Number(e.count), 0)}</b></div>
      </div>

      <div className="chartPanel">
        <div className="chartTitle">30-day activity</div>
        <div className="bars">
          {stats.events.map((e: any) => (
            <div className="barWrap" key={e.day} title={`${e.day}: ${e.count}`}>
              <div className="bar" style={{ height: `${Math.max(4, (Number(e.count) / max) * 180)}px` }} />
              <small>{e.day.slice(5)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="statusGrid">
        {stats.byStatus.map((s: any) => (
          <div key={s.status}><span>{s.status}</span><b>{s.count}</b></div>
        ))}
      </div>
    </section>
  );
}
