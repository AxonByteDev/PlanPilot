'use strict';
/**
 * Lädt Python 3.12 Embeddable herunter und installiert Flask + openpyxl.
 * Wird automatisch vor dem Installer-Build ausgeführt (npm run prepare-python).
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const PYTHON_VERSION = '3.12.7';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

const ROOT       = path.join(__dirname, '..');
const PYTHON_DIR = path.join(ROOT, 'python-embed');
const PYTHON_EXE = path.join(PYTHON_DIR, 'python.exe');
const PIP_EXE    = path.join(PYTHON_DIR, 'Scripts', 'pip.exe');

// ── Download-Hilfsfunktion (folgt Redirects) ──────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} für ${u}`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// ── Hauptprozess ──────────────────────────────────────────────────────────────

async function main() {
  if (fs.existsSync(PYTHON_EXE)) {
    console.log('✓ Python-Embed bereits vorhanden – Vorbereitung übersprungen.');
    return;
  }

  console.log(`\n▶ Lade Python ${PYTHON_VERSION} Embeddable herunter...`);
  fs.mkdirSync(PYTHON_DIR, { recursive: true });

  const zipPath = path.join(ROOT, 'python-embed.zip');
  await download(PYTHON_URL, zipPath);
  console.log('  Download abgeschlossen.');

  console.log('▶ Entpacke Python...');
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${PYTHON_DIR}' -Force"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(zipPath);

  // site-packages aktivieren: '#import site' → 'import site'
  const pthFile = path.join(PYTHON_DIR, 'python312._pth');
  if (fs.existsSync(pthFile)) {
    const content = fs.readFileSync(pthFile, 'utf8').replace('#import site', 'import site');
    fs.writeFileSync(pthFile, content, 'utf8');
    console.log('  site-packages aktiviert.');
  } else {
    // Generische Suche nach ._pth-Datei
    const pthFiles = fs.readdirSync(PYTHON_DIR).filter(f => f.endsWith('._pth'));
    if (pthFiles.length > 0) {
      const f = path.join(PYTHON_DIR, pthFiles[0]);
      const content = fs.readFileSync(f, 'utf8').replace('#import site', 'import site');
      fs.writeFileSync(f, content, 'utf8');
      console.log(`  site-packages aktiviert (${pthFiles[0]}).`);
    } else {
      console.warn('  WARNUNG: ._pth-Datei nicht gefunden.');
    }
  }

  console.log('▶ Installiere pip...');
  const getPipPath = path.join(PYTHON_DIR, 'get-pip.py');
  await download(GET_PIP_URL, getPipPath);
  execSync(`"${PYTHON_EXE}" "${getPipPath}"`, { stdio: 'inherit' });
  fs.unlinkSync(getPipPath);

  console.log('▶ Installiere Flask und openpyxl...');
  execSync(`"${PIP_EXE}" install "flask>=3.0.0" "openpyxl>=3.1.0"`, { stdio: 'inherit' });

  console.log('\n✓ Python-Umgebung fertig!\n');
}

main().catch((err) => {
  console.error('\n✗ Fehler bei der Python-Vorbereitung:', err.message);
  process.exit(1);
});
