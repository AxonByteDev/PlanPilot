'use strict';

let allTasks = [];
let currentTaskId = null;
let currentView = 'kanban';

const PRIORITY_LABELS = {
  sofort:'🔴 Sofort', kurzfristig:'🟡 Kurzfristig',
  mittelfristig:'🔵 Mittelfristig', langfristig:'🟢 Langfristig'
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  loadStats();
});

async function loadTasks() {
  const res  = await fetch('/api/tasks');
  allTasks   = await res.json();
  render();
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const s   = await res.json();
  const zeitStr = s.total_minuten
    ? `${formatDauer(s.erledigt_minuten)} von ${formatDauer(s.total_minuten)}`
    : '';
  document.getElementById('statsBar').textContent =
    `${s.total} Aufgaben  ·  ${s.sofort} Sofort  ·  ${s.laufend} Laufend  ·  ${s.erledigt} Erledigt`
    + (zeitStr ? `  ·  ⏱ ${zeitStr}` : '');
}

// ── Zeit-Hilfsfunktionen ──────────────────────────────────────────────────────
function formatDauer(min) {
  if (!min) return '–';
  const tage = Math.floor(min / 480);
  const rest  = min % 480;
  const std   = Math.floor(rest / 60);
  const m     = rest % 60;
  const parts = [];
  if (tage) parts.push(`${tage} Tag${tage !== 1 ? 'e' : ''}`);
  if (std)  parts.push(`${std} Std`);
  if (m)    parts.push(`${m} Min`);
  return parts.length ? parts.join(' ') : '–';
}

function parseAufwandText(text) {
  if (!text) return { aufwand_tage: 0, aufwand_stunden: 0, aufwand_minuten: 0 };
  const t = text.toLowerCase().trim();
  let tage = 0, std = 0, min = 0;
  const tagM = t.match(/(\d+(?:[,.]\d+)?)\s*tag/);
  const stdM = t.match(/(\d+(?:[,.]\d+)?)\s*(?:std|h\b|stunde)/);
  const minM = t.match(/(\d+)\s*min/);
  if (tagM) tage = parseFloat(tagM[1].replace(',', '.'));
  if (stdM) std  = parseFloat(stdM[1].replace(',', '.'));
  if (minM) min  = parseInt(minM[1]);
  // Bruchteile auflösen (z.B. 0,5 Tage → 4 Std)
  if (tage % 1 !== 0) { std  += (tage % 1) * 8;  tage = Math.floor(tage); }
  if (std  % 1 !== 0) { min  += (std  % 1) * 60; std  = Math.floor(std);  }
  return { aufwand_tage: tage, aufwand_stunden: Math.round(std), aufwand_minuten: Math.round(min) };
}

function computeModalAufwand() {
  let total = 0;
  document.querySelectorAll('#stepsList .step-row').forEach(row => {
    const t = parseInt(row.querySelector('.step-tage')?.value)    || 0;
    const s = parseInt(row.querySelector('.step-stunden')?.value) || 0;
    const m = parseInt(row.querySelector('.step-minuten')?.value) || 0;
    total += t * 480 + s * 60 + m;
  });
  const el = document.getElementById('modalAufwand');
  if (el) el.value = total ? formatDauer(total) : '';
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters() { render(); }

function filteredTasks() {
  const fp = document.getElementById('filterPriority').value;
  const fs = document.getElementById('filterStatus').value;
  const q  = document.getElementById('searchInput').value.toLowerCase();
  return allTasks.filter(t =>
    (!fp || t.priority === fp) &&
    (fs === 'aktiv' ? t.status !== 'erledigt' : (!fs || t.status === fs)) &&
    (!q  || t.title.toLowerCase().includes(q) ||
            (t.notes||'').toLowerCase().includes(q))
  );
}

// ── View switch ───────────────────────────────────────────────────────────────
function setView(v) {
  currentView = v;
  document.getElementById('kanbanView').classList.toggle('hidden', v !== 'kanban');
  document.getElementById('tableView').classList.toggle('hidden',  v !== 'table');
  document.getElementById('btnKanban').classList.toggle('active', v === 'kanban');
  document.getElementById('btnTable').classList.toggle('active',  v === 'table');
  render();
}

function render() {
  if (currentView === 'kanban') renderKanban();
  else renderTable();
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function renderKanban() {
  const tasks = filteredTasks();
  const cols  = ['sofort','kurzfristig','mittelfristig','langfristig'];
  cols.forEach(p => {
    const list  = document.getElementById(`list-${p}`);
    const count = document.getElementById(`cnt-${p}`);
    const group = tasks.filter(t => t.priority === p);
    count.textContent = group.length;
    list.innerHTML = group.map(t => cardHTML(t)).join('');
  });
  initDragDrop();
}

function cardHTML(t) {
  const total   = t.step_count  || 0;
  const done    = t.steps_done  || 0;
  const pct     = total ? Math.round((done/total)*100) : 0;
  const assign  = t.assignee ? `<span class="card-assignee">${esc(t.assignee)}</span>` : '';
  const zeitInfo = t.total_minuten
    ? `<span class="card-aufwand">⏱ ${formatDauer(t.total_minuten)}</span>`
    : (t.aufwand ? `<span class="card-aufwand">${esc(t.aufwand)}</span>` : '');
  return `
  <div class="task-card" data-id="${t.id}" ondblclick="openModal(${t.id})">
    <div class="card-top">
      <span class="card-nr">#${t.nr}</span>
      <span class="card-status badge badge-${t.status}">${cap(t.status)}</span>
    </div>
    <div class="card-title">${esc(t.title)}</div>
    <div class="card-meta">${zeitInfo}${assign}</div>
    ${total > 0 ? `
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div style="font-size:10px;color:#999;margin-top:3px;text-align:right">${done}/${total} Schritte</div>` : ''}
  </div>`;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  const tasks = filteredTasks();
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = tasks.map((t,i) => {
    const total = t.step_count || 0;
    const done  = t.steps_done || 0;
    const pct   = total ? Math.round((done/total)*100) : 0;
    const bg    = i%2===0 ? '' : 'style="background:#fafbfc"';
    const zeitDisp = t.total_minuten ? formatDauer(t.total_minuten) : esc(t.aufwand||'');
    return `
    <tr ${bg}>
      <td class="tbl-nr">${t.nr}</td>
      <td class="tbl-title">${esc(t.title)}</td>
      <td><span class="badge badge-${t.priority}">${PRIORITY_LABELS[t.priority]||t.priority}</span></td>
      <td>${zeitDisp}</td>
      <td>${esc(t.assignee||'')}</td>
      <td>
        <select class="step-status" onchange="quickStatus(${t.id},this.value)">
          ${['offen','laufend','erledigt','pausiert'].map(s=>
            `<option value="${s}" ${t.status===s?'selected':''}>${cap(s)}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <div class="progress-bar" style="height:5px">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div style="font-size:10px;color:#999;margin-top:2px">${done}/${total}</div>
      </td>
      <td><button class="tbl-edit" onclick="openModal(${t.id})">Bearbeiten</button></td>
    </tr>`;
  }).join('');
}

// ── Quick status change from table ────────────────────────────────────────────
async function quickStatus(id, status) {
  await fetch(`/api/tasks/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({status})
  });
  const idx = allTasks.findIndex(t => t.id === id);
  if (idx >= 0) allTasks[idx].status = status;
  loadStats();
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function initDragDrop() {
  if (typeof Sortable === 'undefined') return;
  document.querySelectorAll('.card-list').forEach(el => {
    if (el._sortable) el._sortable.destroy();
    el._sortable = new Sortable(el, {
      group:     'tasks',
      animation: 150,
      ghostClass:'sortable-ghost',
      chosenClass:'sortable-chosen',
      onEnd(evt) {
        const priority = evt.to.closest('.kanban-col').dataset.priority;
        const ids = [...evt.to.querySelectorAll('.task-card')].map(c => +c.dataset.id);
        fetch('/api/tasks/reorder', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ids, priority})
        });
        ids.forEach((id, i) => {
          const t = allTasks.find(t => t.id === id);
          if (t) { t.priority = priority; t.sort_order = i; }
        });
        ['sofort','kurzfristig','mittelfristig','langfristig'].forEach(p => {
          document.getElementById(`cnt-${p}`).textContent =
            allTasks.filter(t => t.priority === p).length;
        });
        loadStats();
      }
    });
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
async function openModal(id) {
  currentTaskId = id;
  const res  = await fetch(`/api/tasks/${id}`);
  const task = await res.json();

  document.getElementById('modalNr').textContent    = `#${task.nr}`;
  document.getElementById('modalTitle').value       = task.title;
  document.getElementById('modalPriority').value    = task.priority;
  document.getElementById('modalStatus').value      = task.status;
  document.getElementById('modalAssignee').value    = task.assignee   || '';
  document.getElementById('modalDeps').value        = task.dependencies || '';
  document.getElementById('modalNotes').value       = task.notes      || '';

  renderSteps(task.steps || []);
  computeModalAufwand();
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function openNewTask() {
  currentTaskId = null;
  document.getElementById('modalNr').textContent    = '#neu';
  document.getElementById('modalTitle').value       = '';
  document.getElementById('modalPriority').value    = 'mittelfristig';
  document.getElementById('modalStatus').value      = 'offen';
  document.getElementById('modalAufwand').value     = '';
  document.getElementById('modalAssignee').value    = '';
  document.getElementById('modalDeps').value        = '';
  document.getElementById('modalNotes').value       = '';
  renderSteps([]);
  computeModalAufwand();
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('modalTitle').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  currentTaskId = null;
}

function closeModalOnBg(e) {
  if (e.target.id === 'modalOverlay') closeModal();
}

// ── Steps rendering ───────────────────────────────────────────────────────────
function renderSteps(steps) {
  const list = document.getElementById('stepsList');
  list.innerHTML = steps.map((s,i) => stepRowHTML(s, i+1)).join('');
  initStepSortable();
}

function stepRowHTML(s, nr) {
  const sid  = s.id || '';
  const tage = s.aufwand_tage    ?? 0;
  const std  = s.aufwand_stunden ?? 0;
  const min  = s.aufwand_minuten ?? 0;
  return `
  <div class="step-row" data-sid="${sid}">
    <span class="step-handle" title="Verschieben">⠿</span>
    <span class="step-nr">${nr}</span>
    <input class="step-desc" type="text" value="${esc(s.description||'')}" placeholder="Schritt beschreiben…" oninput="computeModalAufwand()">
    <div class="step-time">
      <input class="step-tage"    type="number" min="0" value="${tage}" title="Tage" oninput="computeModalAufwand()">
      <span class="step-time-sep">T</span>
      <input class="step-stunden" type="number" min="0" max="23" value="${std}" title="Stunden" oninput="computeModalAufwand()">
      <span class="step-time-sep">Std</span>
      <input class="step-minuten" type="number" min="0" max="59" value="${min}" title="Minuten" oninput="computeModalAufwand()">
      <span class="step-time-sep">Min</span>
    </div>
    <select class="step-status">
      ${['offen','laufend','erledigt'].map(v =>
        `<option value="${v}" ${(s.status||'offen')===v?'selected':''}>${cap(v)}</option>`
      ).join('')}
    </select>
    <button class="step-del" onclick="removeStep(this, '${sid}')">✕</button>
  </div>`;
}

function initStepSortable() {
  const list = document.getElementById('stepsList');
  if (!list || typeof Sortable === 'undefined') return;
  if (list._sortable) list._sortable.destroy();
  list._sortable = new Sortable(list, {
    handle:     '.step-handle',
    animation:  150,
    ghostClass: 'sortable-ghost',
    onEnd() {
      list.querySelectorAll('.step-nr').forEach((el, i) => el.textContent = i + 1);
      if (!currentTaskId) return;
      const ids = [...list.querySelectorAll('.step-row')]
        .map(r => +r.dataset.sid)
        .filter(id => id > 0);
      fetch('/api/steps/reorder', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ids})
      });
    }
  });
}

function addStepRow() {
  const list = document.getElementById('stepsList');
  const nr   = list.children.length + 1;
  const div  = document.createElement('div');
  div.innerHTML = stepRowHTML({id:'',description:'',aufwand_tage:0,aufwand_stunden:0,aufwand_minuten:0,status:'offen'}, nr);
  list.appendChild(div.firstElementChild);
  list.lastElementChild?.querySelector('.step-desc')?.focus();
}

async function removeStep(btn, sid) {
  const row = btn.closest('.step-row');
  if (sid && currentTaskId) {
    await fetch(`/api/steps/${sid}`, {method:'DELETE'});
  }
  row.remove();
  document.querySelectorAll('#stepsList .step-nr').forEach((el,i) => el.textContent = i+1);
  computeModalAufwand();
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveTask() {
  const title = document.getElementById('modalTitle').value.trim();
  if (!title) { document.getElementById('modalTitle').focus(); return; }

  const payload = {
    title,
    priority:     document.getElementById('modalPriority').value,
    status:       document.getElementById('modalStatus').value,
    assignee:     document.getElementById('modalAssignee').value,
    dependencies: document.getElementById('modalDeps').value,
    notes:        document.getElementById('modalNotes').value,
  };

  let taskId = currentTaskId;
  if (taskId) {
    await fetch(`/api/tasks/${taskId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
  } else {
    const res  = await fetch('/api/tasks', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const t    = await res.json();
    taskId     = t.id;
  }

  // sync steps
  const rows = document.querySelectorAll('#stepsList .step-row');
  for (const row of rows) {
    const sid  = row.dataset.sid;
    const desc = row.querySelector('.step-desc').value.trim();
    if (!desc) continue;
    const stepData = {
      description:     desc,
      aufwand_tage:    parseInt(row.querySelector('.step-tage').value)    || 0,
      aufwand_stunden: parseInt(row.querySelector('.step-stunden').value) || 0,
      aufwand_minuten: parseInt(row.querySelector('.step-minuten').value) || 0,
      status:          row.querySelector('.step-status').value,
    };
    if (sid) {
      await fetch(`/api/steps/${sid}`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(stepData)
      });
    } else {
      await fetch(`/api/tasks/${taskId}/steps`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(stepData)
      });
    }
  }

  closeModal();
  await loadTasks();
  loadStats();
}

async function deleteCurrentTask() {
  if (!currentTaskId) return;
  if (!confirm('Aufgabe wirklich löschen?')) return;
  await fetch(`/api/tasks/${currentTaskId}`, {method:'DELETE'});
  closeModal();
  allTasks = allTasks.filter(t => t.id !== currentTaskId);
  render();
  loadStats();
}

// ── KI-Planung ────────────────────────────────────────────────────────────────
function openKiModal() {
  document.getElementById('kiPrompt').value = '';
  document.getElementById('kiError').classList.add('hidden');
  document.getElementById('kiOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('kiPrompt').focus(), 50);
}

function closeKiModal() {
  document.getElementById('kiOverlay').classList.add('hidden');
}

function closeKiOnBg(e) {
  if (e.target.id === 'kiOverlay') closeKiModal();
}

function kiEnterSubmit(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyzeWithKi();
}

async function analyzeWithKi() {
  const prompt = document.getElementById('kiPrompt').value.trim();
  if (!prompt) {
    document.getElementById('kiPrompt').focus();
    return;
  }

  const btn     = document.getElementById('btnAnalyze');
  const label   = document.getElementById('analyzeLabel');
  const spinner = document.getElementById('analyzeSpinner');
  const errBox  = document.getElementById('kiError');

  btn.disabled = true;
  label.textContent = 'Claude denkt…';
  spinner.classList.remove('hidden');
  errBox.classList.add('hidden');

  try {
    const res  = await fetch('/api/ai-plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prompt}),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      errBox.textContent = 'Serverfehler (kein JSON): ' + text.slice(0, 300);
      errBox.classList.remove('hidden');
      return;
    }

    if (!res.ok || data.error) {
      errBox.textContent = data.error || 'Unbekannter Fehler';
      errBox.classList.remove('hidden');
      return;
    }

    closeKiModal();
    openNewTaskWithData(data.task);

  } catch (err) {
    errBox.textContent = 'Netzwerkfehler: ' + err.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    label.textContent = 'Analysieren →';
    spinner.classList.add('hidden');
  }
}

function openNewTaskWithData(t) {
  currentTaskId = null;
  document.getElementById('modalNr').textContent     = '#neu (KI)';
  document.getElementById('modalTitle').value        = t.title        || '';
  document.getElementById('modalPriority').value     = t.priority     || 'mittelfristig';
  document.getElementById('modalStatus').value       = 'offen';
  document.getElementById('modalAufwand').value      = '';
  document.getElementById('modalAssignee').value     = '';
  document.getElementById('modalDeps').value         = t.dependencies || '';
  document.getElementById('modalNotes').value        = t.notes        || '';

  // KI liefert aufwand als Text → in Zahlen umwandeln
  const steps = (t.steps || []).map(s => ({
    ...s,
    ...parseAufwandText(s.aufwand || ''),
  }));
  renderSteps(steps);
  computeModalAufwand();

  const modal = document.querySelector('.modal');
  modal.style.boxShadow = '0 0 0 3px #a855f7, 0 20px 60px rgba(0,0,0,.3)';
  setTimeout(() => { modal.style.boxShadow = ''; }, 1800);

  document.getElementById('modalOverlay').classList.remove('hidden');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
