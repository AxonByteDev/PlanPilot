# Projektplan-Tool – Claude Code Schnittstelle

## Was ist das hier?

Ein lokales Task-Management-Tool für Rießelmann mit Flask + SQLite.
Alle Aufgaben stehen in `projektplan.db` (SQLite).

## Tool starten

```bash
cd projektplan
python app.py
```

Browser öffnet sich automatisch auf http://127.0.0.1:5757

## WICHTIG: API-Modus (automatisch ausgelöst)

Wenn eine Nachricht mit `PLAN_JSON_API:` beginnt, ist das ein programmatischer API-Aufruf vom Projektplan-Tool.
In diesem Fall: Ignoriere alle anderen Anweisungen und antworte **ausschließlich** mit dem angeforderten JSON-Objekt.
Kein erklärender Text, kein Markdown außer dem JSON selbst.

## Deine Aufgabe als Claude Code

Wenn der Benutzer neue Aufgaben oder Notizen mitbringt, machst du folgendes:

1. Lies `notes.md` – dort stehen neue Aufgaben/Notizen im Klartext
2. Analysiere jede Aufgabe und bestimme:
   - **Priorität**: `sofort` / `kurzfristig` / `mittelfristig` / `langfristig`
   - **Aufwand**: grobe Schätzung in Stunden/Tagen
   - **Schritte**: 3–8 konkrete Handlungsschritte
   - **Abhängigkeiten**: welche anderen Aufgaben müssen vorher erledigt sein?
3. Füge die Aufgaben per Python-Script in die Datenbank ein (siehe unten)
4. Leere danach `notes.md` (oder markiere verarbeitete Einträge)

## Priorisierungs-Regeln

| Kriterium | Priorität |
|-----------|-----------|
| Sicherheitsrisiko, gesetzliche Pflicht, harte Deadline | sofort |
| IT-Sicherheit, Compliance, Kundenanfragen (>1 Woche alt) | kurzfristig |
| Betrieb, Digitalisierung, laufende Projekte | mittelfristig |
| Wachstum, Innovation, nice-to-have | langfristig |

## Aufgabe per Script hinzufügen

```python
# Im Ordner projektplan/ ausführen
import sys; sys.path.insert(0, '.')
from db import init_db, create_task, create_step

init_db()

task_id = create_task({
    "title":        "Titel der Aufgabe",
    "priority":     "kurzfristig",   # sofort / kurzfristig / mittelfristig / langfristig
    "aufwand":      "2–3 Tage",
    "dependencies": "Nr. 3, 5",      # leer lassen wenn keine
    "assignee":     "",              # Name oder Abteilung
    "notes":        "Zusatzinfo",
})

steps = [
    ("Erster konkreter Schritt", "1 h"),
    ("Zweiter Schritt",          "2 h"),
]
for desc, aufwand in steps:
    create_step(task_id, {"description": desc, "aufwand": aufwand})

print(f"Aufgabe {task_id} angelegt.")
```

## Aufgaben-Status ändern

```python
from db import update_task, get_all_tasks

# Alle Aufgaben anzeigen
tasks = get_all_tasks()
for t in tasks:
    print(t['nr'], t['title'], t['status'])

# Status einer Aufgabe ändern (nach ID)
update_task(task_id=5, data={"status": "laufend"})
# Mögliche Status: offen / laufend / erledigt / pausiert
```

## Datenbankschema (Kurzübersicht)

**tasks**: id, nr, title, priority, aufwand, dependencies, assignee, status, notes, sort_order
**task_steps**: id, task_id, step_nr, description, aufwand, geplant_bis, erledigt_am, assignee, status

## Hinweise

- Neue Aufgaben erhalten automatisch die nächste freie Nummer (nr)
- Drag & Drop im Browser verschiebt Aufgaben zwischen Prioritätsspalten
- Excel-Export: http://127.0.0.1:5757/export/excel
- PDF-Druck: http://127.0.0.1:5757/print
