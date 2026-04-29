import sqlite3, os
from contextlib import contextmanager
from datetime import datetime

_data_dir = os.environ.get("PLANPILOT_DATA_DIR") or os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_data_dir, "projektplan.db")

PRIORITY_ORDER = {"sofort": 1, "kurzfristig": 2, "mittelfristig": 3, "langfristig": 4}

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                nr          INTEGER UNIQUE,
                title       TEXT NOT NULL,
                priority    TEXT DEFAULT 'mittelfristig',
                aufwand     TEXT,
                dependencies TEXT DEFAULT '',
                assignee    TEXT DEFAULT '',
                status      TEXT DEFAULT 'offen',
                notes       TEXT DEFAULT '',
                sort_order  INTEGER DEFAULT 0,
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS task_steps (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                step_nr         INTEGER DEFAULT 0,
                description     TEXT NOT NULL,
                aufwand         TEXT DEFAULT '',
                aufwand_tage    INTEGER DEFAULT 0,
                aufwand_stunden INTEGER DEFAULT 0,
                aufwand_minuten INTEGER DEFAULT 0,
                geplant_bis     TEXT DEFAULT '',
                erledigt_am     TEXT DEFAULT '',
                assignee        TEXT DEFAULT '',
                status          TEXT DEFAULT 'offen'
            );
        """)
    # migration for existing databases
    with get_db() as conn:
        for col_def in [
            "aufwand_tage INTEGER DEFAULT 0",
            "aufwand_stunden INTEGER DEFAULT 0",
            "aufwand_minuten INTEGER DEFAULT 0",
        ]:
            try:
                conn.execute(f"ALTER TABLE task_steps ADD COLUMN {col_def}")
            except Exception:
                pass

# ── Tasks ────────────────────────────────────────────────────────────────────

def get_all_tasks():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT t.*,
                   COUNT(s.id)                                        AS step_count,
                   SUM(CASE WHEN s.status='erledigt' THEN 1 ELSE 0 END) AS steps_done,
                   COALESCE(SUM(s.aufwand_tage * 480 + s.aufwand_stunden * 60 + s.aufwand_minuten), 0) AS total_minuten,
                   COALESCE(SUM(CASE WHEN s.status='erledigt' THEN s.aufwand_tage * 480 + s.aufwand_stunden * 60 + s.aufwand_minuten ELSE 0 END), 0) AS erledigt_minuten
            FROM tasks t
            LEFT JOIN task_steps s ON s.task_id = t.id
            GROUP BY t.id
            ORDER BY
                CASE t.priority
                    WHEN 'sofort'       THEN 1
                    WHEN 'kurzfristig'  THEN 2
                    WHEN 'mittelfristig' THEN 3
                    WHEN 'langfristig'  THEN 4
                    ELSE 5
                END,
                t.sort_order, t.nr
        """).fetchall()
        return [dict(r) for r in rows]

def get_task(task_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None

def create_task(data):
    with get_db() as conn:
        max_nr = conn.execute("SELECT COALESCE(MAX(nr),0) FROM tasks").fetchone()[0]
        nr     = max_nr + 1
        max_ord = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) FROM tasks WHERE priority=?",
            (data.get("priority","mittelfristig"),)
        ).fetchone()[0]
        conn.execute("""
            INSERT INTO tasks (nr,title,priority,aufwand,dependencies,assignee,status,notes,sort_order)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (
            nr,
            data["title"],
            data.get("priority","mittelfristig"),
            data.get("aufwand",""),
            data.get("dependencies",""),
            data.get("assignee",""),
            data.get("status","offen"),
            data.get("notes",""),
            max_ord + 1,
        ))
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]

def update_task(task_id, data):
    with get_db() as conn:
        fields = []
        values = []
        allowed = ["title","priority","aufwand","dependencies","assignee","status","notes","sort_order"]
        for f in allowed:
            if f in data:
                fields.append(f"{f}=?")
                values.append(data[f])
        if not fields:
            return
        fields.append("updated_at=datetime('now')")
        values.append(task_id)
        conn.execute(f"UPDATE tasks SET {','.join(fields)} WHERE id=?", values)

def delete_task(task_id):
    with get_db() as conn:
        conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))

def reorder_tasks(ordered_ids):
    with get_db() as conn:
        for i, tid in enumerate(ordered_ids):
            conn.execute("UPDATE tasks SET sort_order=? WHERE id=?", (i, tid))

# ── Steps ────────────────────────────────────────────────────────────────────

def get_steps(task_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM task_steps WHERE task_id=? ORDER BY step_nr",
            (task_id,)
        ).fetchall()
        return [dict(r) for r in rows]

def create_step(task_id, data):
    with get_db() as conn:
        max_nr = conn.execute(
            "SELECT COALESCE(MAX(step_nr),0) FROM task_steps WHERE task_id=?", (task_id,)
        ).fetchone()[0]
        conn.execute("""
            INSERT INTO task_steps (task_id,step_nr,description,aufwand,aufwand_tage,aufwand_stunden,aufwand_minuten,geplant_bis,erledigt_am,assignee,status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (
            task_id, max_nr+1,
            data["description"],
            data.get("aufwand",""),
            int(data.get("aufwand_tage") or 0),
            int(data.get("aufwand_stunden") or 0),
            int(data.get("aufwand_minuten") or 0),
            data.get("geplant_bis",""),
            data.get("erledigt_am",""),
            data.get("assignee",""),
            data.get("status","offen"),
        ))
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]

def update_step(step_id, data):
    with get_db() as conn:
        allowed = ["description","aufwand","aufwand_tage","aufwand_stunden","aufwand_minuten","geplant_bis","erledigt_am","assignee","status"]
        fields, values = [], []
        for f in allowed:
            if f in data:
                val = data[f]
                if f in ("aufwand_tage", "aufwand_stunden", "aufwand_minuten"):
                    val = int(val or 0)
                fields.append(f"{f}=?")
                values.append(val)
        if fields:
            values.append(step_id)
            conn.execute(f"UPDATE task_steps SET {','.join(fields)} WHERE id=?", values)

def delete_step(step_id):
    with get_db() as conn:
        conn.execute("DELETE FROM task_steps WHERE id=?", (step_id,))

def reorder_steps(ordered_ids):
    with get_db() as conn:
        for i, sid in enumerate(ordered_ids):
            conn.execute("UPDATE task_steps SET step_nr=? WHERE id=?", (i, sid))

def get_stats():
    with get_db() as conn:
        row = conn.execute("""
            SELECT
                (SELECT COUNT(*)                              FROM tasks)                          AS total,
                (SELECT COUNT(*) FROM tasks WHERE status='offen')                                  AS offen,
                (SELECT COUNT(*) FROM tasks WHERE status='laufend')                                AS laufend,
                (SELECT COUNT(*) FROM tasks WHERE status='erledigt')                               AS erledigt,
                (SELECT COUNT(*) FROM tasks WHERE priority='sofort')                               AS sofort,
                COALESCE((SELECT SUM(aufwand_tage*480 + aufwand_stunden*60 + aufwand_minuten)
                          FROM task_steps), 0)                                                     AS total_minuten,
                COALESCE((SELECT SUM(aufwand_tage*480 + aufwand_stunden*60 + aufwand_minuten)
                          FROM task_steps WHERE status='erledigt'), 0)                             AS erledigt_minuten
        """).fetchone()
        return dict(row)
