#!/bin/bash
# PlanPilot – macOS/Linux Installer
# Doppelklick in Finder oder: bash install_mac.command

set -e

# Farben
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Arbeitsverzeichnis = Ordner dieses Skripts
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    PlanPilot – macOS Installer       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Python prüfen ─────────────────────────────────────────────────────────
echo "[1/4] Pruefe Python..."

PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        VER=$("$cmd" --version 2>&1 | awk '{print $2}')
        MAJOR=$(echo "$VER" | cut -d. -f1)
        MINOR=$(echo "$VER" | cut -d. -f2)
        if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 8 ]; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo -e "${RED}FEHLER: Python 3.8+ nicht gefunden!${NC}"
    echo ""
    echo "Bitte Python installieren:"
    echo "  macOS:  brew install python  (oder https://www.python.org)"
    echo "  Linux:  sudo apt install python3 python3-venv"
    echo ""
    read -p "Druecke Enter zum Beenden..."
    exit 1
fi

echo -e "${GREEN}OK – $PYTHON $($PYTHON --version 2>&1 | awk '{print $2}') gefunden.${NC}"

# ── 2. Virtuelle Umgebung ────────────────────────────────────────────────────
echo ""
echo "[2/4] Erstelle virtuelle Umgebung (venv)..."

if [ -d "venv" ]; then
    echo "  venv existiert bereits – wird uebersprungen."
else
    $PYTHON -m venv venv
    echo -e "${GREEN}OK – venv erstellt.${NC}"
fi

# ── 3. Abhängigkeiten installieren ───────────────────────────────────────────
echo ""
echo "[3/4] Installiere Abhaengigkeiten..."

source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

echo -e "${GREEN}OK – Flask und openpyxl installiert.${NC}"

# ── 4. Start-Skript erstellen ────────────────────────────────────────────────
echo ""
echo "[4/4] Erstelle start_app.command..."

cat > start_app.command << 'STARTSCRIPT'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python app.py
STARTSCRIPT

chmod +x start_app.command
echo -e "${GREEN}OK – start_app.command erstellt.${NC}"

# ── Fertig ────────────────────────────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  Installation abgeschlossen!                          ║"
echo "║                                                        ║"
echo "║  App starten: Doppelklick auf  start_app.command      ║"
echo "║  Browser oeffnet sich automatisch.                    ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

read -p "App jetzt starten? (j/n): " LAUNCH
if [[ "$LAUNCH" =~ ^[jJyY]$ ]]; then
    bash start_app.command &
fi
