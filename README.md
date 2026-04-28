# PlanPilot

Lokales KI-gestütztes Aufgabenmanagement mit Kanban-Board, Excel-Export und Claude-Integration.

## Features

- **Kanban-Board** mit 4 Prioritätsspalten (Sofort / Kurzfristig / Mittelfristig / Langfristig)
- **Drag & Drop** – Aufgaben per Maus zwischen Spalten verschieben
- **KI-Planung** – Neue Aufgaben per Freitext eingeben, Claude plant automatisch Schritte und Priorität
- **Detailansicht** – Einzelne Schritte mit Zeitplanung, Zuständigkeit und Status
- **Excel-Export** – Vollständiger Projektplan als .xlsx
- **Druckansicht / PDF** – Browser-Druck für alle Aufgaben
- **Tabellenansicht** – Alternative zur Kanban-Ansicht
- Läuft **lokal** – keine Cloud, keine Anmeldung, keine Daten werden gesendet

## Voraussetzungen

| Was | Version | Wozu |
|-----|---------|------|
| Python | 3.8 oder neuer | Laufzeitumgebung |
| Claude Code CLI | aktuell | KI-Planungsfunktion |

> Die KI-Funktion ist optional. Das Tool läuft auch ohne Claude Code vollständig.

---

## Installation

### Windows – Ein-Klick-Installer

1. Repository herunterladen (ZIP oder `git clone`)
2. **Doppelklick** auf `install_windows.bat`
3. Fertig – `start_app.bat` wird automatisch erstellt
4. App starten: **Doppelklick auf `start_app.bat`**

### macOS / Linux – Ein-Klick-Installer

1. Repository herunterladen
2. Terminal öffnen im Projektordner:
   ```bash
   chmod +x install_mac.command
   bash install_mac.command
   ```
   Oder in macOS Finder: **Doppelklick** auf `install_mac.command`
3. App starten: **Doppelklick auf `start_app.command`**

### Manuell (alle Systeme)

```bash
# 1. Virtuelle Umgebung erstellen
python -m venv venv

# 2. Aktivieren
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Pakete installieren
pip install -r requirements.txt

# 4. Starten
python app.py
```

Browser öffnet sich automatisch auf **http://127.0.0.1:5757**

---

## KI-Funktion einrichten (Claude Code CLI)

Die KI-Planungsfunktion nutzt Claude Code lokal auf deinem Rechner. Folgende Schritte sind nötig:

### Schritt 1 – Anthropic-Konto erstellen

1. Gehe zu [console.anthropic.com](https://console.anthropic.com)
2. Konto erstellen und anmelden
3. Unter **API Keys** einen neuen Key erstellen und kopieren

### Schritt 2 – Claude Code CLI installieren

**Windows (PowerShell als Admin):**
```powershell
npm install -g @anthropic-ai/claude-code
```

**macOS / Linux:**
```bash
npm install -g @anthropic-ai/claude-code
```

> Voraussetzung: [Node.js](https://nodejs.org) muss installiert sein (Version 18 oder neuer).

### Schritt 3 – Claude Code einrichten

```bash
claude
```

Beim ersten Start wirst du nach deinem API-Key gefragt. Den Key aus Schritt 1 eingeben.
Claude Code ist danach eingerichtet und läuft im Hintergrund.

### Schritt 4 – Prüfen ob alles funktioniert

```bash
claude --version
```

Gibt eine Versionsnummer aus? Dann ist alles bereit.

Im PlanPilot-Tool: Klicke auf **"KI-Planung"** und gib eine Aufgabe ein. Claude plant automatisch Schritte und schlägt eine Priorität vor.

### Fehlerbehebung KI

| Problem | Lösung |
|---------|--------|
| "Claude Code CLI nicht gefunden" | `claude` ist nicht im PATH – Node.js + npm global prüfen |
| Timeout nach 120 Sekunden | Internetverbindung prüfen, API-Key gültig? |
| Kein JSON zurück | Claude Code neu einrichten: `claude` im Terminal starten |

---

## Nutzung

### Aufgaben verwalten

- **Neue Aufgabe**: Grüner `+`-Button oben rechts
- **Bearbeiten**: Klick auf eine Aufgabenkarte
- **Status ändern**: Im Modal oder per Dropdown in der Tabellenansicht
- **Verschieben**: Drag & Drop zwischen Prioritätsspalten
- **Löschen**: Im Bearbeitungs-Modal (rotes Papierkorb-Symbol)

### KI-Planung nutzen

1. Klick auf **"KI-Planung"** (lila Button)
2. Aufgabe im Freitext beschreiben
3. Claude schlägt Titel, Priorität, Aufwand und konkrete Schritte vor
4. Aufgabe direkt übernehmen oder anpassen

### Aufgaben aus `notes.md` einlesen

Schreibe neue Aufgaben in die Datei `notes.md` und sage Claude Code im Terminal:
```
Lies notes.md und lege die Aufgaben in der Datenbank an.
```

### Exports

- **Excel**: Klick auf "Excel" oben rechts → `Projektplan.xlsx`
- **Drucken / PDF**: Klick auf "Drucken" → Browser-Druckdialog → "Als PDF speichern"

---

## Projektstruktur

```
planpilot/
├── app.py              # Flask-Server, API-Endpunkte, Claude-Integration
├── db.py               # SQLite-Datenbankschicht
├── export.py           # Excel-Export mit openpyxl
├── seed.py             # Beispielaufgaben (nur beim ersten Start)
├── notes.md            # Freitext-Eingabe für neue Aufgaben
├── requirements.txt    # Python-Abhängigkeiten
├── CLAUDE.md           # Anweisungen für Claude Code
├── install_windows.bat # Windows Installer
├── install_mac.command # macOS Installer
├── static/
│   ├── app.js          # Frontend-Logik
│   └── style.css       # Styling
└── templates/
    ├── index.html      # Hauptansicht (Kanban + Tabelle)
    └── print.html      # Druckvorlage
```

> `projektplan.db` wird beim ersten Start automatisch erstellt und ist in `.gitignore` ausgeschlossen.

---

## Lizenz

Privates Projekt – alle Rechte vorbehalten.
