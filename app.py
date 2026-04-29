import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import webbrowser, threading, subprocess, re, json, shutil, tempfile
from datetime import datetime
from flask import Flask, jsonify, request, render_template, send_file, abort
import db as DB
import export as EX
from seed import seed

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({"error": f"{type(e).__name__}: {e}"}), 500

# ── Bootstrap ────────────────────────────────────────────────────────────────
DB.init_db()
seed()

# ── Pages ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

# ── Tasks API ─────────────────────────────────────────────────────────────────
@app.route("/api/tasks")
def api_tasks():
    return jsonify(DB.get_all_tasks())

@app.route("/api/tasks/<int:tid>")
def api_task(tid):
    t = DB.get_task(tid)
    if not t: abort(404)
    t["steps"] = DB.get_steps(tid)
    return jsonify(t)

@app.route("/api/tasks", methods=["POST"])
def api_create_task():
    data = request.json or {}
    if not data.get("title"):
        return jsonify({"error": "title required"}), 400
    new_id = DB.create_task(data)
    t = DB.get_task(new_id)
    t["steps"] = DB.get_steps(new_id)
    return jsonify(t), 201

@app.route("/api/tasks/<int:tid>", methods=["PUT"])
def api_update_task(tid):
    data = request.json or {}
    DB.update_task(tid, data)
    t = DB.get_task(tid)
    if not t: abort(404)
    t["steps"] = DB.get_steps(tid)
    return jsonify(t)

@app.route("/api/tasks/<int:tid>", methods=["DELETE"])
def api_delete_task(tid):
    DB.delete_task(tid)
    return jsonify({"ok": True})

@app.route("/api/tasks/reorder", methods=["POST"])
def api_reorder():
    data = request.json or {}
    ids = data.get("ids", [])
    # also update priority if column changed
    priority = data.get("priority")
    if priority:
        for tid in ids:
            DB.update_task(tid, {"priority": priority})
    DB.reorder_tasks(ids)
    return jsonify({"ok": True})

@app.route("/api/stats")
def api_stats():
    return jsonify(DB.get_stats())

# ── Steps API ─────────────────────────────────────────────────────────────────
@app.route("/api/tasks/<int:tid>/steps", methods=["POST"])
def api_add_step(tid):
    data = request.json or {}
    if not data.get("description"):
        return jsonify({"error": "description required"}), 400
    sid = DB.create_step(tid, data)
    steps = DB.get_steps(tid)
    return jsonify(steps), 201

@app.route("/api/steps/<int:sid>", methods=["PUT"])
def api_update_step(sid):
    DB.update_step(sid, request.json or {})
    return jsonify({"ok": True})

@app.route("/api/steps/<int:sid>", methods=["DELETE"])
def api_delete_step(sid):
    DB.delete_step(sid)
    return jsonify({"ok": True})

@app.route("/api/steps/reorder", methods=["POST"])
def api_reorder_steps():
    ids = (request.json or {}).get("ids", [])
    DB.reorder_steps(ids)
    return jsonify({"ok": True})

# ── KI-Planung ────────────────────────────────────────────────────────────────
def _claude_cmd():
    """Gibt die komplette Kommandoliste zurück um Claude aufzurufen.
    Auf Windows: .CMD-Dateien brauchen 'cmd /c' als Wrapper."""
    if os.name == "nt":
        for name in ("claude.cmd", "claude"):
            found = shutil.which(name)
            if found:
                return ["cmd", "/c", found]
        for path in (
            os.path.expandvars(r"%APPDATA%\npm\claude.cmd"),
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\claude\claude.exe"),
        ):
            if os.path.isfile(path):
                return ["cmd", "/c", path]
    else:
        # Auf macOS/Linux: GUI-Apps erben nicht den vollen Shell-PATH.
        # Daher bekannte npm/Homebrew-Verzeichnisse explizit ergänzen.
        extra = os.pathsep.join([
            "/opt/homebrew/bin",                        # macOS Apple Silicon
            "/usr/local/bin",                           # macOS Intel
            os.path.expanduser("~/.local/bin"),
            os.path.expanduser("~/.npm-global/bin"),
        ])
        search_path = extra + os.pathsep + os.environ.get("PATH", "")
        found = shutil.which("claude", path=search_path)
        if found:
            return [found]

        for path in (
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            os.path.expanduser("~/.local/bin/claude"),
            os.path.expanduser("~/.npm-global/bin/claude"),
            "/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude",
            "/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude",
        ):
            if os.path.isfile(path):
                return [path]
    return None

@app.route("/api/ai-plan", methods=["POST"])
def api_ai_plan():
  try:
    return _ai_plan_inner()
  except Exception as e:
    import traceback
    traceback.print_exc()
    return jsonify({"error": f"{type(e).__name__}: {e}"}), 500

def _ai_plan_inner():
    user_prompt = (request.json or {}).get("prompt", "").strip()
    if not user_prompt:
        return jsonify({"error": "Kein Prompt angegeben"}), 400

    cmd_prefix = _claude_cmd()
    if not cmd_prefix:
        return jsonify({"error": "Claude Code CLI nicht gefunden. Sicherstellen dass 'claude' im PATH ist."}), 500

    existing = DB.get_all_tasks()
    existing_summary = "\n".join(f"  #{t['nr']} [{t['priority']}] {t['title']}" for t in existing[:20])

    # Prompt als einfacher String mit eingebettetem JSON-Template
    # (Anführungszeichen im Template mit \" escapen damit subprocess korrekt übergibt)
    ki_prompt = (
        f'PLAN_JSON_API: Plane Aufgabe fuer Riesselmann: {user_prompt}. '
        f'Antworte NUR mit JSON: '
        f'{{"title":"Titel max 65 Zeichen",'
        f'"priority":"sofort oder kurzfristig oder mittelfristig oder langfristig",'
        f'"aufwand":"z.B. 2 Tage",'
        f'"dependencies":"z.B. Nr. 3 oder leer",'
        f'"notes":"Kurze Begruendung",'
        f'"steps":[{{"description":"Erster Schritt","aufwand":"1 h"}},'
        f'{{"description":"Zweiter Schritt","aufwand":"2 h"}}]}}'
    )

    raw_stdout = ""
    try:
        kw = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        proc = subprocess.run(
            cmd_prefix + ["-p", ki_prompt, "--output-format", "json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            **kw,
        )
        raw_stdout = (proc.stdout or "").strip()
        raw_stderr = (proc.stderr or "").strip()

        if not raw_stdout:
            return jsonify({
                "error": f"Keine Ausgabe von Claude (Exit {proc.returncode}). Stderr: {raw_stderr[:300] or '–'}"
            }), 500

        # --output-format json liefert: {"type":"result","result":"<text>","is_error":false,...}
        # Versuche zuerst das äußere CLI-JSON zu parsen
        response_text = raw_stdout
        try:
            outer = json.loads(raw_stdout)
            if outer.get("is_error"):
                return jsonify({"error": outer.get("result", "Claude meldete einen Fehler")}), 500
            response_text = outer.get("result", raw_stdout)
        except json.JSONDecodeError:
            pass  # kein CLI-JSON-Wrapper – direkt weiter

        # JSON extrahieren – unterstützt Markdown-Codeblöcke (```json ... ```) und rohes JSON
        json_str = None
        md = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if md:
            json_str = md.group(1)
        else:
            raw = re.search(r'\{.*\}', response_text, re.DOTALL)
            if raw:
                json_str = raw.group()

        if not json_str:
            return jsonify({
                "error": "Claude hat kein JSON geliefert.",
                "raw": response_text[:400]
            }), 500

        task_data = json.loads(json_str)
        task_data.setdefault("title",        "Neue Aufgabe")
        task_data.setdefault("priority",     "mittelfristig")
        task_data.setdefault("aufwand",      "")
        task_data.setdefault("dependencies", "")
        task_data.setdefault("notes",        "")
        task_data.setdefault("steps",        [])
        return jsonify({"ok": True, "task": task_data})

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Timeout – Claude hat nicht geantwortet (120 s)."}), 504
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON-Fehler: {e}", "raw": raw_stdout[:400]}), 500
    except Exception as e:
        return jsonify({"error": f"{type(e).__name__}: {e}"}), 500

@app.route("/api/ai-debug", methods=["POST"])
def api_ai_debug():
    """Hilfendpoint – zeigt die rohe Claude-Ausgabe für Diagnose."""
    cmd_prefix = _claude_cmd()
    prompt = (request.json or {}).get("prompt", "Antworte mit dem Wort HALLO")
    try:
        kw = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        proc = subprocess.run(
            cmd_prefix + ["-p", prompt, "--output-format", "json"],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=30, **kw,
        )
        return jsonify({
            "cmd": cmd_prefix,
            "returncode": proc.returncode,
            "stdout": proc.stdout[:1000],
            "stderr": proc.stderr[:500],
        })
    except Exception as e:
        return jsonify({"cmd": cmd_prefix, "error": str(e)})

# ── Exports ───────────────────────────────────────────────────────────────────
@app.route("/export/excel")
def export_excel():
    tasks = DB.get_all_tasks()
    steps_by_task = {t["id"]: DB.get_steps(t["id"]) for t in tasks}
    buf = EX.build_excel(tasks, steps_by_task)
    return send_file(
        buf,
        as_attachment=True,
        download_name="Projektplan_Riesselmann.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

@app.route("/print")
def print_view():
    tasks = DB.get_all_tasks()
    steps_by_task = {t["id"]: DB.get_steps(t["id"]) for t in tasks}
    now = datetime.now().strftime("%d.%m.%Y %H:%M")
    return render_template("print.html", tasks=tasks, steps_by_task=steps_by_task, now=now)

# ── Start ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = 5757
    url  = f"http://127.0.0.1:{port}"
    if not os.environ.get("PLANPILOT_NO_BROWSER"):
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    print(f"\n  Projektplan läuft auf {url}\n  Strg+C zum Beenden\n")
    app.run(port=port, debug=False)
