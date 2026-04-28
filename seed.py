"""Demo-Aufgaben beim ersten Start einfügen (nur wenn Datenbank leer)."""
from db import init_db, get_db

TASKS = [
    {"nr": 1, "title": "Beispielaufgabe: Server-Backup einrichten", "priority": "kurzfristig", "aufwand": "1–2 Tage", "dependencies": "", "steps": [
        ("Backup-Anforderungen definieren (Daten, Intervall, Aufbewahrung)", "1 h"),
        ("Backup-Software auswählen und installieren", "2 h"),
        ("Backup-Jobs einrichten und testen", "2 h"),
        ("Restore-Test durchführen und dokumentieren", "1 h"),
    ]},
    {"nr": 2, "title": "Beispielaufgabe: Neue Drucker anschaffen", "priority": "mittelfristig", "aufwand": "1 Woche", "dependencies": "", "steps": [
        ("Bedarf ermitteln (Standorte, Funktionen)", "1 h"),
        ("Angebote einholen und vergleichen", "2 h"),
        ("Bestellung aufgeben", "0,5 h"),
        ("Drucker aufstellen und einrichten", "2 h"),
    ]},
    {"nr": 3, "title": "Beispielaufgabe: Website-Relaunch planen", "priority": "langfristig", "aufwand": "4–6 Wochen", "dependencies": "", "steps": [
        ("Ziele und Zielgruppe definieren", "1 h"),
        ("Inhalte und Struktur planen", "1 Tag"),
        ("Design-Entwürfe erstellen lassen", "1 Woche"),
        ("Umsetzung und Launch", "2 Wochen"),
    ]},
]


def seed():
    init_db()
    with get_db() as conn:
        existing = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if existing > 0:
            return

    for i, t in enumerate(TASKS):
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO tasks (nr,title,priority,aufwand,dependencies,notes,sort_order) VALUES (?,?,?,?,?,?,?)",
                (t["nr"], t["title"], t["priority"], t.get("aufwand", ""),
                 t.get("dependencies", ""), t.get("notes", ""), i),
            )
            task_id = conn.execute("SELECT id FROM tasks WHERE nr=?", (t["nr"],)).fetchone()[0]
            for j, (desc, aufwand) in enumerate(t.get("steps", [])):
                conn.execute(
                    "INSERT INTO task_steps (task_id,step_nr,description,aufwand) VALUES (?,?,?,?)",
                    (task_id, j + 1, desc, aufwand),
                )

    print(f"Seed: {len(TASKS)} Demo-Aufgaben angelegt.")


if __name__ == "__main__":
    seed()
