@echo off
chcp 65001 >nul
title PlanPilot – Installation

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     PlanPilot – Windows Installer    ║
echo  ╚══════════════════════════════════════╝
echo.

:: Arbeitsverzeichnis = Ordner dieser Batch-Datei
cd /d "%~dp0"

:: ── 1. Python prüfen ──────────────────────────────────────────────────────────
echo [1/4] Pruefe Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  FEHLER: Python wurde nicht gefunden!
    echo.
    echo  Bitte Python 3.8 oder neuer installieren:
    echo  https://www.python.org/downloads/
    echo  Wichtig: Beim Installieren "Add Python to PATH" aktivieren!
    echo.
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo  OK – Python %PY_VER% gefunden.

:: ── 2. Virtuelle Umgebung erstellen ──────────────────────────────────────────
echo.
echo [2/4] Erstelle virtuelle Umgebung (venv)...
if exist venv (
    echo  venv existiert bereits – wird uebersprungen.
) else (
    python -m venv venv
    if errorlevel 1 (
        echo  FEHLER beim Erstellen der venv!
        pause
        exit /b 1
    )
    echo  OK – venv erstellt.
)

:: ── 3. Abhängigkeiten installieren ───────────────────────────────────────────
echo.
echo [3/4] Installiere Abhaengigkeiten...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo  FEHLER beim Installieren der Pakete!
    pause
    exit /b 1
)
echo  OK – Flask und openpyxl installiert.

:: ── 4. Start-Skript erstellen ─────────────────────────────────────────────────
echo.
echo [4/4] Erstelle start_app.bat...
(
    echo @echo off
    echo chcp 65001 ^>nul
    echo title PlanPilot
    echo cd /d "%%~dp0"
    echo call venv\Scripts\activate.bat
    echo python app.py
    echo pause
) > start_app.bat
echo  OK – start_app.bat erstellt.

:: ── Fertig ────────────────────────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   Installation abgeschlossen!                       ║
echo  ║                                                      ║
echo  ║   App starten: Doppelklick auf  start_app.bat       ║
echo  ║   Browser oeffnet sich automatisch.                 ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
set /p LAUNCH="App jetzt starten? (j/n): "
if /i "%LAUNCH%"=="j" (
    start "" start_app.bat
)
pause
