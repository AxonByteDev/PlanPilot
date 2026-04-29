'use strict';

const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

const PORT = 5757;
let mainWindow = null;
let flaskProcess = null;

// ── Pfade ────────────────────────────────────────────────────────────────────

function getPythonExe() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python', 'python.exe');
  }
  return 'python';
}

function getFlaskAppDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

function getDataDir() {
  if (!app.isPackaged) {
    return null; // Im Dev-Modus nutzt db.py den Standardpfad neben db.py
  }
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDbPath() {
  const dataDir = getDataDir();
  if (dataDir) {
    return path.join(dataDir, 'projektplan.db');
  }
  // Dev-Modus: DB liegt neben db.py im Root-Verzeichnis
  return path.join(__dirname, '..', 'projektplan.db');
}

// ── Flask starten ─────────────────────────────────────────────────────────────

function startFlask() {
  const pythonExe = getPythonExe();
  const appDir = getFlaskAppDir();
  const dataDir = getDataDir();

  const env = {
    ...process.env,
    PLANPILOT_NO_BROWSER: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
  };
  if (dataDir) {
    env.PLANPILOT_DATA_DIR = dataDir;
  }

  flaskProcess = spawn(pythonExe, ['app.py'], {
    cwd: appDir,
    env,
    windowsHide: true,
  });

  flaskProcess.stdout.on('data', (d) => process.stdout.write(`[Flask] ${d}`));
  flaskProcess.stderr.on('data', (d) => process.stderr.write(`[Flask] ${d}`));

  flaskProcess.on('exit', (code) => {
    if (code !== null && code !== 0 && mainWindow) {
      dialog.showErrorBox(
        'PlanPilot – Fehler',
        `Der Server wurde unerwartet beendet (Code ${code}).\nBitte Anwendung neu starten.`
      );
    }
  });
}

function killFlask() {
  if (!flaskProcess) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${flaskProcess.pid}`, { stdio: 'ignore' });
    } else {
      flaskProcess.kill('SIGTERM');
    }
  } catch (_) {
    // ignore – Prozess schon beendet
  }
  flaskProcess = null;
}

// ── Warten bis Flask antwortet ────────────────────────────────────────────────

function waitForFlask(retries, callback) {
  const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
    res.resume();
    callback(null);
  });
  req.setTimeout(1000);
  req.on('error', () => {
    if (retries <= 0) { callback(new Error('Server nicht erreichbar')); return; }
    setTimeout(() => waitForFlask(retries - 1, callback), 500);
  });
  req.on('timeout', () => {
    req.destroy();
    if (retries <= 0) { callback(new Error('Server-Timeout')); return; }
    setTimeout(() => waitForFlask(retries - 1, callback), 500);
  });
}

// ── Datenbank importieren ─────────────────────────────────────────────────────

async function importDatabase() {
  if (!mainWindow) return;

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Alte Datenbank importieren',
    filters: [
      { name: 'SQLite Datenbank', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || !filePaths.length) return;

  const srcPath = filePaths[0];
  const destPath = getDbPath();
  const backupPath = destPath.replace(/\.db$/, '.backup.db');

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Datenbank importieren',
    message: 'Aktuelle Datenbank ersetzen?',
    detail:
      `Ausgewählte Datei:\n${srcPath}\n\n` +
      `Die aktuelle Datenbank wird gesichert unter:\n${backupPath}\n\n` +
      `Danach wird sie durch die importierte Datei ersetzt.`,
    buttons: ['Importieren', 'Abbrechen'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response !== 0) return;

  try {
    // Sicherungskopie der aktuellen DB anlegen (falls vorhanden)
    if (fs.existsSync(destPath)) {
      fs.copyFileSync(destPath, backupPath);
    }

    // Importierte DB übernehmen
    fs.copyFileSync(srcPath, destPath);

    // Seite neu laden – Flask öffnet beim nächsten Request die neue DB
    mainWindow.reload();

    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Import erfolgreich',
      message: 'Datenbank wurde erfolgreich importiert.',
      detail: `Sicherungskopie der alten Datenbank: ${backupPath}`,
      buttons: ['OK'],
    });
  } catch (err) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Import fehlgeschlagen',
      message: 'Fehler beim Importieren der Datenbank.',
      detail: err.message,
      buttons: ['OK'],
    });
  }
}

// ── Menü ──────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Datenbank importieren…',
          accelerator: 'CmdOrCtrl+I',
          click: importDatabase,
        },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Fenster erstellen ─────────────────────────────────────────────────────────

function createWindow() {
  buildMenu();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'PlanPilot',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Externe Links im Systembrowser öffnen
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App-Lebenszyklus ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startFlask();

  // Bis zu 30 Sekunden warten (60 × 500 ms)
  waitForFlask(60, (err) => {
    if (err) {
      dialog.showErrorBox(
        'PlanPilot – Startfehler',
        'Die Anwendung konnte nicht gestartet werden.\n' +
        'Bitte prüfen Sie die Installation und starten Sie PlanPilot erneut.'
      );
      app.quit();
      return;
    }
    createWindow();
  });
});

app.on('window-all-closed', () => {
  killFlask();
  app.quit();
});

app.on('before-quit', () => {
  killFlask();
});
