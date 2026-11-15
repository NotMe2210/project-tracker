'use strict';

/* =========================================================================
   Projekttracker – alle Daten liegen im localStorage dieses Browsers.
   ========================================================================= */

const STORAGE_KEY = 'projekttracker.v1';
const META_KEY = 'projekttracker.meta';

const DEFAULT_DATA = {
  version: 1,
  settings: { weeklyHoursGoal: 5, staleDays: 7 },
  projects: [],
  timeEntries: [],
  investments: [],
  milestones: [],
  tasks: [],
  notes: [],
  timer: null,
};

const STATUS = [
  { value: 'idee', label: 'Idee' },
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'pausiert', label: 'Pausiert' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
];
const PRIORITIES = [
  { value: 'hoch', label: 'Hoch' },
  { value: 'mittel', label: 'Mittel' },
  { value: 'niedrig', label: 'Niedrig' },
];
const PRIO_ORDER = { hoch: 0, mittel: 1, niedrig: 2 };
const INVEST_CATEGORIES = ['Material', 'Software', 'Hardware', 'Dienstleistung', 'Marketing', 'Weiterbildung', 'Sonstiges'];
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];

const QUOTES = [
  'Fortschritt schlägt Perfektion.',
  'Kleine Schritte jeden Tag ergeben am Ende große Ergebnisse.',
  'Der beste Zeitpunkt anzufangen war gestern. Der zweitbeste ist jetzt.',
  'Motivation folgt der Handlung – nicht umgekehrt. Fang mit 10 Minuten an.',
  'Erledigt ist besser als perfekt.',
  'Du musst nicht schnell sein, nur dranbleiben.',
  'Jede Stunde, die du investierst, bringt dich deinem Ziel näher.',
  'Konzentriere dich auf den nächsten Schritt, nicht auf den ganzen Berg.',
];
const CHEERS = ['Stark! 💪', 'Erledigt! ✅', 'Weiter so! 🚀', 'Super gemacht! 🎉', 'Ein Schritt näher am Ziel! 🏁', 'Läuft bei dir! 🔥'];

let data = load();
let meta = loadMeta();
let projectFilter = 'aktiv';
let syncHintDismissed = false;

/* ------------------------------------------------------------------------
   Persistenz
   ------------------------------------------------------------------------ */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : structuredClone(DEFAULT_DATA);
  } catch (e) {
    console.error(e);
    return structuredClone(DEFAULT_DATA);
  }
}

function normalize(d) {
  const out = structuredClone(DEFAULT_DATA);
  for (const k of Object.keys(out)) if (d && d[k] !== undefined) out[k] = d[k];
  out.settings = { ...DEFAULT_DATA.settings, ...((d && d.settings) || {}) };
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    meta.lastChange = Date.now();
    saveMeta();
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

/* Gerätebezogene Infos (nicht Teil des Backups): letzte Änderung, letzter Export, letzter Besuch. */
function loadMeta() {
  try { return { lastChange: 0, lastExport: 0, lastOpen: 0, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; }
  catch { return { lastChange: 0, lastExport: 0, lastOpen: 0 }; }
}

function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignorieren */ }
}

const hasUnsavedChanges = () => data.projects.length > 0 && meta.lastChange > meta.lastExport;

function fmtDateTime(ts) {
  if (!ts) return 'noch nie';
  const d = new Date(ts);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const day = toISO(d);
  if (day === todayISO()) return `heute, ${time} Uhr`;
  if (day === toISO(addDays(new Date(), -1))) return `gestern, ${time} Uhr`;
  return `${d.toLocaleDateString('de-DE')}, ${time} Uhr`;
}

function commit() {
  save();
  render();
}

/* ------------------------------------------------------------------------
   Hilfsfunktionen
   ------------------------------------------------------------------------ */

const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, '0');
const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = (s) => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // Montag = 0
  return addDays(x, -day);
}

function fmtDate(iso) {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtRelative(iso) {
  if (!iso) return '–';
  const d = daysBetween(iso, todayISO());
  if (d === 0) return 'heute';
  if (d === 1) return 'gestern';
  if (d === -1) return 'morgen';
  if (d < 0) return `in ${-d} Tagen`;
  return `vor ${d} Tagen`;
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtEUR = (n) => eur.format(n || 0);

function fmtHours(min) {
  const h = (min || 0) / 60;
  return h.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Std';
}

function fmtDuration(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} Min`;
  return m ? `${h} Std ${m} Min` : `${h} Std`;
}

function parseDuration(s) {
  s = String(s || '').trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+)\s*h\s*(\d+)\s*(m|min)?$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|minuten)$/))) return Math.round(+m[1]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(h|std|stunden)?$/))) return Math.round(+m[1] * 60);
  return null;
}

function parseAmount(s) {
  if (s === null || s === undefined || s === '') return null;
  let t = String(s).trim().replace(/[€\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const statusLabel = (v) => (STATUS.find((s) => s.value === v) || {}).label || v;
const prioLabel = (v) => (PRIORITIES.find((s) => s.value === v) || {}).label || v;
const getProject = (id) => data.projects.find((p) => p.id === id);

/* ------------------------------------------------------------------------
   Auswertungen
   ------------------------------------------------------------------------ */

function sortTasks(tasks) {
  return [...tasks].sort((a, b) =>
    (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1) ||
    (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
    (a.createdAt || '').localeCompare(b.createdAt || ''));
}

function nextTask(pid) {
  return sortTasks(data.tasks.filter((t) => t.projectId === pid && !t.done))[0] || null;
}

/** Alle Aktivitäten (Datum, Minuten) – Basis für Streak, Heatmap & „zuletzt aktiv“. */
function activities(pid) {
  const f = (x) => !pid || x.projectId === pid;
  const out = [];
  data.timeEntries.filter(f).forEach((e) => out.push({ date: e.date, minutes: e.minutes }));
  data.investments.filter(f).forEach((e) => out.push({ date: e.date, minutes: 0 }));
  data.notes.filter(f).forEach((e) => out.push({ date: e.date, minutes: 0 }));
  data.tasks.filter((t) => f(t) && t.done && t.doneAt).forEach((t) => out.push({ date: t.doneAt, minutes: 0 }));
  data.milestones.filter((t) => f(t) && t.done && t.doneAt).forEach((t) => out.push({ date: t.doneAt, minutes: 0 }));
  return out;
}

function dayMap(pid) {
  const map = {};
  for (const a of activities(pid)) {
    const d = (map[a.date] ||= { minutes: 0, count: 0 });
    d.minutes += a.minutes || 0;
    d.count += 1;
  }
  return map;
}

function lastActivity(p) {
  let last = p.createdAt || null;
  for (const a of activities(p.id)) if (!last || a.date > last) last = a.date;
  return last;
}

function healthOf(p, idle) {
  if (p.status !== 'aktiv') return null;
  const s = Number(data.settings.staleDays) || 7;
  if (idle < s) return 'gut';
  if (idle < s * 2) return 'warn';
  return 'kritisch';
}

function projectStats(p) {
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const ms = data.milestones.filter((m) => m.projectId === p.id);
  const minutes = sum(data.timeEntries.filter((e) => e.projectId === p.id), (e) => e.minutes);
  const invested = sum(data.investments.filter((e) => e.projectId === p.id), (e) => e.amount);
  const tasksDone = tasks.filter((t) => t.done).length;
  const msDone = ms.filter((m) => m.done).length;
  let progress = 0;
  if (p.status === 'abgeschlossen') progress = 100;
  else if (ms.length) progress = Math.round((msDone / ms.length) * 100);
  else if (tasks.length) progress = Math.round((tasksDone / tasks.length) * 100);
  const last = lastActivity(p);
  const idle = last ? daysBetween(last, todayISO()) : 0;
  return {
    minutes, invested, progress, last, idle,
    tasksOpen: tasks.length - tasksDone, tasksDone, tasksTotal: tasks.length,
    msDone, msTotal: ms.length,
    health: healthOf(p, idle),
    next: nextTask(p.id),
  };
}

function minutesInRange(fromISO, toISOExcl, pid) {
  return sum(data.timeEntries.filter((e) => e.date >= fromISO && e.date < toISOExcl && (!pid || e.projectId === pid)), (e) => e.minutes);
}

function weekMinutes(offset = 0, pid) {
  const start = addDays(startOfWeek(new Date()), offset * 7);
  return minutesInRange(toISO(start), toISO(addDays(start, 7)), pid);
}

function calcStreak() {
  const map = dayMap();
  let d = new Date();
  if (!map[toISO(d)]) d = addDays(d, -1); // heute noch nichts getan? Streak läuft bis heute Abend weiter
  let n = 0;
  while (map[toISO(d)]) { n++; d = addDays(d, -1); }
  return n;
}

const isOverdue = (iso) => iso && iso < todayISO();

/* ------------------------------------------------------------------------
   Rendering – Grundgerüst & Router
   ------------------------------------------------------------------------ */

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { view: parts[0] || 'dashboard', id: parts[1], tab: parts[2] || 'uebersicht' };
}

function render() {
  const r = parseRoute();
  const app = $('#app');
  let html;
  if (r.view === 'projekte') html = renderProjects();
  else if (r.view === 'projekt') html = renderProject(r.id, r.tab);
  else if (r.view === 'einstellungen') html = renderSettings();
  else html = renderDashboard();
  app.innerHTML = html;
  renderBackupBar();
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const nav = r.view === 'projekt' ? 'projekte' : r.view;
    a.classList.toggle('active', a.dataset.nav === nav);
  });
  renderTimer();
}

/* Hinweisleiste unter der Navigation: Import-Erinnerung beim Öffnen bzw. Export-Erinnerung bei ungesicherten Änderungen. */
function renderBackupBar() {
  const bar = $('#backup-bar');
  const btn = $('#backup-btn');
  const dirty = hasUnsavedChanges();
  btn.classList.toggle('dirty', dirty);
  btn.title = dirty ? `Ungesicherte Änderungen – letzte Sicherung: ${fmtDateTime(meta.lastExport)}` : `Alles gesichert (${fmtDateTime(meta.lastExport)})`;

  if (showSyncHint && !syncHintDismissed) {
    bar.className = 'backup-bar info';
    bar.innerHTML = `<div class="container">
      <span>🔄 Du hast den Tracker auf diesem Gerät zuletzt <b>${esc(fmtDateTime(previousOpen))}</b> geöffnet.
      Hast du seitdem auf einem anderen Gerät gearbeitet?<span class="long"> Dann importiere zuerst die neueste Sicherung aus iCloud Drive.</span></span>
      <span class="btn-row">
        <button class="btn primary small" data-action="importData">⬆ Sicherung importieren</button>
        <button class="btn small" data-action="dismissSyncHint">Nein, weiter</button>
      </span></div>`;
    bar.hidden = false;
  } else if (dirty) {
    bar.className = 'backup-bar warn';
    bar.innerHTML = `<div class="container">
      <span>💾 <b>Ungesicherte Änderungen.</b> Letzte Sicherung: ${esc(fmtDateTime(meta.lastExport))}.<span class="long"> Exportiere vor dem Schließen, damit deine anderen Geräte aktuell bleiben.</span></span>
      <span class="btn-row"><button class="btn primary small" data-action="exportData">⬇ Jetzt sichern</button></span></div>`;
    bar.hidden = false;
  } else {
    bar.hidden = true;
    bar.innerHTML = '';
  }
}

function progressBar(pct, cls = '') {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="progress ${cls}"><span style="width:${p}%"></span></div>`;
}

function healthBadge(s) {
  if (!s.health) return `<span class="health">zuletzt ${fmtRelative(s.last)}</span>`;
  const label = s.health === 'kritisch' ? `ruht seit ${s.idle} Tagen` : `aktiv ${fmtRelative(s.last)}`;
  return `<span class="health ${s.health}">${label}</span>`;
}

function dueBadge(iso) {
  if (!iso) return '';
  return `<span class="${isOverdue(iso) ? 'badge overdue' : ''}">📅 ${fmtDate(iso)}${isOverdue(iso) ? ' · überfällig' : ''}</span>`;
}

/* ---------------------------- Dashboard ---------------------------------- */

function renderDashboard() {
  if (!data.projects.length) {
    return `<div class="card welcome">
      <div class="big">🚀</div>
      <h1>Willkommen bei deinem Projekttracker</h1>
      <p>Erfasse Zeit, Investitionen, Meilensteine und Aufgaben deiner Projekte. Der Tracker zeigt dir, welche Projekte
      Aufmerksamkeit brauchen, damit nichts einschläft.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="newProject">Erstes Projekt anlegen</button>
        <button class="btn" data-action="loadDemo">Beispieldaten ansehen</button>
      </div>
    </div>`;
  }

  const today = todayISO();
  const active = data.projects.filter((p) => p.status === 'aktiv');
  const stats = new Map(data.projects.map((p) => [p.id, projectStats(p)]));
  const goalMin = (Number(data.settings.weeklyHoursGoal) || 0) * 60;
  const thisWeek = weekMinutes(0);
  const lastWeek = weekMinutes(-1);
  const streak = calcStreak();
  const openTasks = data.tasks.filter((t) => !t.done && getProject(t.projectId)?.status !== 'abgeschlossen');
  const overdue = openTasks.filter((t) => isOverdue(t.dueDate));
  const monthPrefix = today.slice(0, 7);
  const investMonth = sum(data.investments.filter((i) => i.date.startsWith(monthPrefix)), (i) => i.amount);
  const investTotal = sum(data.investments, (i) => i.amount);

  const stale = active
    .map((p) => ({ p, s: stats.get(p.id) }))
    .filter((x) => x.s.health !== 'gut')
    .sort((a, b) => b.s.idle - a.s.idle);

  const nextSteps = active
    .map((p) => ({ p, t: stats.get(p.id).next }))
    .filter((x) => x.t)
    .sort((a, b) => (PRIO_ORDER[a.t.priority] ?? 1) - (PRIO_ORDER[b.t.priority] ?? 1));

  const upcoming = data.milestones
    .filter((m) => !m.done && m.dueDate && getProject(m.projectId) && getProject(m.projectId).status !== 'abgeschlossen')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);

  const weekDiff = thisWeek - lastWeek;
  const order = { aktiv: 0, pausiert: 1, idee: 2, abgeschlossen: 3 };
  const sorted = [...data.projects].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

  return `
    ${renderBanner({ stale, streak, thisWeek, goalMin, active })}

    <div class="stats">
      <div class="stat">
        <div class="label">Diese Woche</div>
        <div class="value">${fmtHours(thisWeek)}</div>
        ${goalMin ? progressBar((thisWeek / goalMin) * 100, thisWeek >= goalMin ? 'good' : '') : ''}
        <div class="sub">${goalMin ? `Ziel: ${fmtHours(goalMin)} · ` : ''}${weekDiff >= 0 ? '▲' : '▼'} ${fmtHours(Math.abs(weekDiff))} ggü. Vorwoche</div>
      </div>
      <div class="stat">
        <div class="label">Streak</div>
        <div class="value">${streak ? '🔥 ' : ''}${streak} ${streak === 1 ? 'Tag' : 'Tage'}</div>
        <div class="sub">${dayMap()[today] ? 'Heute schon aktiv ✔' : streak ? 'Heute noch nichts – halte die Serie!' : 'Starte heute eine neue Serie'}</div>
      </div>
      <div class="stat">
        <div class="label">Aktive Projekte</div>
        <div class="value">${active.length}</div>
        <div class="sub">${stale.length ? `${stale.length} brauchen Aufmerksamkeit` : 'Alle in Bewegung 👍'}</div>
      </div>
      <div class="stat">
        <div class="label">Offene Aufgaben</div>
        <div class="value">${openTasks.length}</div>
        <div class="sub">${overdue.length ? `<span style="color:var(--bad)">${overdue.length} überfällig</span>` : 'nichts überfällig'}</div>
      </div>
      <div class="stat">
        <div class="label">Investiert</div>
        <div class="value">${fmtEUR(investTotal)}</div>
        <div class="sub">${fmtEUR(investMonth)} in diesem Monat</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>⚠️ Braucht Aufmerksamkeit</h2></div>
          ${stale.length ? `<ul class="list">${stale.map(({ p, s }) => `
            <li>
              <span class="dot-color" style="background:${esc(p.color)}"></span>
              <div class="grow">
                <div class="title"><a href="#/projekt/${p.id}">${esc(p.name)}</a></div>
                <div class="meta">${healthBadge(s)}${s.next ? `<span>Nächster Schritt: ${esc(s.next.title)}</span>` : ''}</div>
              </div>
              <button class="btn small" data-action="startTimer" data-id="${p.id}">▶ 25 Min</button>
            </li>`).join('')}</ul>`
            : '<div class="empty">Alle aktiven Projekte wurden in den letzten Tagen bearbeitet. 🎉</div>'}
        </section>

        <section class="card">
          <div class="card-head"><h2>👉 Nächste Schritte</h2></div>
          ${nextSteps.length ? `<ul class="list">${nextSteps.map(({ p, t }) => taskItem(t, { showProject: true })).join('')}</ul>`
            : `<div class="empty">Keine offenen Aufgaben in aktiven Projekten.<br>Lege für jedes Projekt einen konkreten nächsten Schritt fest.</div>`}
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>🏁 Anstehende Meilensteine</h2></div>
          ${upcoming.length ? `<ul class="list">${upcoming.map((m) => milestoneItem(m, { showProject: true })).join('')}</ul>`
            : '<div class="empty">Keine terminierten Meilensteine.</div>'}
        </section>

        <section class="card">
          <div class="card-head"><h2>📈 Aktivität (12 Wochen)</h2></div>
          ${heatmap(dayMap())}
        </section>
      </div>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <h2>Alle Projekte</h2>
        <button class="btn small" data-action="newProject">+ Projekt</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Projekt</th><th>Status</th><th>Fortschritt</th><th class="num">Zeit</th><th class="num">Diese Woche</th><th class="num">Investiert</th><th class="num">Offene Aufg.</th><th>Zuletzt aktiv</th></tr></thead>
        <tbody>${sorted.map((p) => {
          const s = stats.get(p.id);
          return `<tr>
            <td><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}">${esc(p.name)}</a></td>
            <td><span class="badge ${p.status}">${statusLabel(p.status)}</span></td>
            <td>${progressBar(s.progress)} <span class="small muted">${s.progress}%</span></td>
            <td class="num">${fmtHours(s.minutes)}</td>
            <td class="num">${fmtHours(weekMinutes(0, p.id))}</td>
            <td class="num">${fmtEUR(s.invested)}</td>
            <td class="num">${s.tasksOpen}</td>
            <td>${healthBadge(s)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
}

function renderBanner({ stale, streak, thisWeek, goalMin, active }) {
  const critical = stale.find((x) => x.s.health === 'kritisch');
  if (critical) {
    const { p, s } = critical;
    return `<div class="banner warn">
      <div class="emoji">😴</div>
      <div class="text">
        <strong>„${esc(p.name)}“ ruht seit ${s.idle} Tagen.</strong>
        ${p.why ? `<div class="why">Dein Warum: „${esc(p.why)}“</div>` : ''}
        <div>${s.next ? `Kleinster nächster Schritt: <b>${esc(s.next.title)}</b>` : 'Lege einen kleinen, konkreten nächsten Schritt fest.'}</div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="startTimer" data-id="${p.id}">▶ Nur 25 Minuten</button>
        <a class="btn" href="#/projekt/${p.id}">Öffnen</a>
      </div>
    </div>`;
  }
  if (goalMin && thisWeek >= goalMin) {
    return `<div class="banner good"><div class="emoji">🏆</div><div class="text"><strong>Wochenziel erreicht!</strong>${fmtHours(thisWeek)} investiert – richtig stark. Alles darüber ist Bonus.</div></div>`;
  }
  if (streak >= 2) {
    return `<div class="banner good"><div class="emoji">🔥</div><div class="text"><strong>${streak} Tage in Folge!</strong>Bleib dran – schon 15 Minuten heute halten die Serie am Leben.</div></div>`;
  }
  if (goalMin && active.length) {
    const rest = goalMin - thisWeek;
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
    return `<div class="banner"><div class="emoji">🎯</div><div class="text"><strong>Noch ${fmtHours(rest)} bis zu deinem Wochenziel.</strong>Das sind ca. ${fmtDuration(Math.ceil(rest / daysLeft))} pro Tag bis Sonntag. ${esc(pick(QUOTES))}</div></div>`;
  }
  return `<div class="banner"><div class="emoji">💡</div><div class="text"><strong>${esc(pick(QUOTES))}</strong></div></div>`;
}

function heatmap(map) {
  const today = todayISO();
  const start = addDays(startOfWeek(new Date()), -11 * 7);
  const cells = [];
  for (let i = 0; i < 84; i++) {
    const iso = toISO(addDays(start, i));
    if (iso > today) { cells.push('<span class="future"></span>'); continue; }
    const d = map[iso];
    let lvl = 0;
    if (d) lvl = d.minutes >= 120 ? 4 : d.minutes >= 60 ? 3 : d.minutes >= 30 ? 2 : 1;
    const title = `${fmtDate(iso)}: ${d ? `${fmtDuration(d.minutes)}, ${d.count} Aktivität(en)` : 'keine Aktivität'}`;
    cells.push(`<span class="l${lvl}${iso === today ? ' today' : ''}" title="${esc(title)}"></span>`);
  }
  const active = Object.keys(map).filter((k) => k >= toISO(start) && k <= today).length;
  return `<div class="heatmap">${cells.join('')}</div>
    <div class="legend">weniger <span style="background:var(--heat-0)"></span><span style="background:var(--heat-1)"></span><span style="background:var(--heat-2)"></span><span style="background:var(--heat-3)"></span><span style="background:var(--heat-4)"></span> mehr
    <span style="flex:1"></span>${active} aktive Tage</div>`;
}

function weekBars(pid) {
  const weeks = [];
  for (let i = -11; i <= 0; i++) {
    const s = addDays(startOfWeek(new Date()), i * 7);
    weeks.push({ label: `${pad(s.getDate())}.${pad(s.getMonth() + 1)}.`, min: weekMinutes(i, pid), current: i === 0 });
  }
  const max = Math.max(60, ...weeks.map((w) => w.min));
  return `<div class="bars">${weeks.map((w) => `
    <div class="bar ${w.current ? 'current' : ''}" title="Woche ab ${w.label}: ${fmtDuration(w.min)}">
      <span style="height:${(w.min / max) * 85}%"></span><small>${w.label.slice(0, 3)}</small>
    </div>`).join('')}</div>`;
}

/* ---------------------------- Listeneinträge ----------------------------- */

function taskItem(t, { showProject = false } = {}) {
  const p = getProject(t.projectId);
  const ms = t.milestoneId ? data.milestones.find((m) => m.id === t.milestoneId) : null;
  return `<li class="${t.done ? 'done' : ''}">
    <button class="check" data-action="toggleTask" data-id="${t.id}" title="${t.done ? 'Wieder öffnen' : 'Erledigt'}">${t.done ? '✓' : ''}</button>
    <div class="grow">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        ${showProject && p ? `<span><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}/aufgaben">${esc(p.name)}</a></span>` : ''}
        <span class="badge ${t.priority}">${prioLabel(t.priority)}</span>
        ${t.done ? `<span>erledigt ${fmtRelative(t.doneAt)}</span>` : dueBadge(t.dueDate)}
        ${ms ? `<span>🏁 ${esc(ms.title)}</span>` : ''}
        ${t.notes ? `<span>${esc(t.notes)}</span>` : ''}
      </div>
    </div>
    <div class="actions">
      <button class="btn ghost icon" data-action="editTask" data-id="${t.id}" title="Bearbeiten">✎</button>
      <button class="btn ghost icon danger" data-action="deleteTask" data-id="${t.id}" title="Löschen">🗑</button>
    </div>
  </li>`;
}

function milestoneItem(m, { showProject = false } = {}) {
  const p = getProject(m.projectId);
  const tasks = data.tasks.filter((t) => t.milestoneId === m.id);
  const done = tasks.filter((t) => t.done).length;
  return `<li class="${m.done ? 'done' : ''}">
    <button class="check round" data-action="toggleMilestone" data-id="${m.id}" title="${m.done ? 'Wieder öffnen' : 'Erreicht'}">${m.done ? '✓' : ''}</button>
    <div class="grow">
      <div class="title">${esc(m.title)}</div>
      <div class="meta">
        ${showProject && p ? `<span><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}/meilensteine">${esc(p.name)}</a></span>` : ''}
        ${m.done ? `<span>erreicht am ${fmtDate(m.doneAt)}</span>` : m.dueDate ? `${dueBadge(m.dueDate)}<span>(${fmtRelative(m.dueDate)})</span>` : ''}
        ${tasks.length ? `<span>${done}/${tasks.length} Aufgaben</span>` : ''}
      </div>
      ${m.description ? `<div class="small muted">${esc(m.description)}</div>` : ''}
      ${tasks.length && !m.done ? `<div style="margin-top:6px;max-width:240px">${progressBar((done / tasks.length) * 100)}</div>` : ''}
    </div>
    <div class="actions">
      <button class="btn ghost icon" data-action="editMilestone" data-id="${m.id}" title="Bearbeiten">✎</button>
      <button class="btn ghost icon danger" data-action="deleteMilestone" data-id="${m.id}" title="Löschen">🗑</button>
    </div>
  </li>`;
}

/* ---------------------------- Projektliste ------------------------------- */

function renderProjects() {
  const counts = { alle: data.projects.length };
  STATUS.forEach((s) => (counts[s.value] = data.projects.filter((p) => p.status === s.value).length));
  if (projectFilter !== 'alle' && !counts[projectFilter] && counts.alle) projectFilter = 'alle';
  const list = data.projects
    .filter((p) => projectFilter === 'alle' || p.status === projectFilter)
    .map((p) => ({ p, s: projectStats(p) }))
    .sort((a, b) => (b.s.last || '').localeCompare(a.s.last || '') || a.p.name.localeCompare(b.p.name));

  return `
    <div class="page-head">
      <div><h1>Projekte</h1><p>${data.projects.length} Projekte insgesamt</p></div>
      <button class="btn primary" data-action="newProject">+ Neues Projekt</button>
    </div>
    <div class="chips">
      ${[{ value: 'alle', label: 'Alle' }, ...STATUS].map((s) =>
        `<button class="chip ${projectFilter === s.value ? 'active' : ''}" data-action="filterProjects" data-id="${s.value}">${s.label} (${counts[s.value]})</button>`).join('')}
    </div>
    ${list.length ? `<div class="project-grid">${list.map(({ p, s }) => `
      <a class="project-card" href="#/projekt/${p.id}" style="--pc:${esc(p.color)}">
        <div class="row"><h3>${esc(p.name)}</h3><span class="badge ${p.status}">${statusLabel(p.status)}</span></div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        <div>
          <div class="row small muted" style="margin-bottom:4px"><span>Fortschritt</span><span>${s.progress}%</span></div>
          ${progressBar(s.progress, s.progress === 100 ? 'good' : '')}
        </div>
        <div class="figures">
          <span>⏱ <b>${fmtHours(s.minutes)}</b></span>
          <span>💶 <b>${fmtEUR(s.invested)}</b></span>
          <span>✅ <b>${s.tasksDone}/${s.tasksTotal}</b></span>
          <span>🏁 <b>${s.msDone}/${s.msTotal}</b></span>
        </div>
        ${s.next && p.status !== 'abgeschlossen' ? `<div class="next">👉 ${esc(s.next.title)}</div>` : ''}
        ${healthBadge(s)}
      </a>`).join('')}</div>`
      : `<div class="card empty">Keine Projekte in dieser Ansicht.<br><br><button class="btn primary" data-action="newProject">+ Neues Projekt</button></div>`}`;
}

/* ---------------------------- Projektdetail ------------------------------ */

function renderProject(id, tab) {
  const p = getProject(id);
  if (!p) return `<div class="card empty">Projekt nicht gefunden. <a href="#/projekte">Zur Projektliste</a></div>`;
  const s = projectStats(p);
  const n = {
    aufgaben: s.tasksOpen,
    meilensteine: s.msTotal,
    zeit: data.timeEntries.filter((e) => e.projectId === id).length,
    investitionen: data.investments.filter((e) => e.projectId === id).length,
    logbuch: data.notes.filter((e) => e.projectId === id).length,
  };
  const tabs = [
    ['uebersicht', 'Übersicht'], ['aufgaben', 'Aufgaben'], ['meilensteine', 'Meilensteine'],
    ['zeit', 'Zeit'], ['investitionen', 'Investitionen'], ['logbuch', 'Logbuch'],
  ];
  const body = {
    uebersicht: projectOverview, aufgaben: projectTasks, meilensteine: projectMilestones,
    zeit: projectTime, investitionen: projectInvestments, logbuch: projectNotes,
  }[tab] || projectOverview;

  return `
    <div class="page-head">
      <div>
        <div class="project-title">
          <span class="dot-color" style="background:${esc(p.color)}"></span>
          <h1 style="margin:0">${esc(p.name)}</h1>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <select class="inline-select" data-change="setStatus" data-id="${p.id}" aria-label="Status">
            ${STATUS.map((st) => `<option value="${st.value}" ${st.value === p.status ? 'selected' : ''}>${st.label}</option>`).join('')}
          </select>
          ${p.category ? `<span class="badge">${esc(p.category)}</span>` : ''}
          ${healthBadge(s)}
        </div>
      </div>
      <div class="btn-row">
        ${data.timer?.projectId === p.id
          ? `<button class="btn primary" data-action="stopTimer">■ Timer stoppen</button>`
          : `<button class="btn primary" data-action="startTimer" data-id="${p.id}">▶ Timer starten</button>`}
        <button class="btn" data-action="addTime" data-id="${p.id}">+ Zeit</button>
        <button class="btn" data-action="editProject" data-id="${p.id}">Bearbeiten</button>
        <button class="btn danger" data-action="deleteProject" data-id="${p.id}">Löschen</button>
      </div>
    </div>
    <nav class="tabs">
      ${tabs.map(([k, l]) => `<a href="#/projekt/${p.id}/${k}" class="${k === tab ? 'active' : ''}">${l}${n[k] ? `<span class="count">${n[k]}</span>` : ''}</a>`).join('')}
    </nav>
    ${body(p, s)}`;
}

function projectOverview(p, s) {
  const hourGoal = Number(p.hourGoal) || 0;
  const budget = Number(p.budget) || 0;
  const ms = data.milestones.filter((m) => m.projectId === p.id && !m.done)
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 3);
  const recent = recentActivity(p.id).slice(0, 8);

  return `
    ${p.why || p.goal ? `<div class="card" style="margin-bottom:16px">
      ${p.why ? `<h3>💭 Warum ist mir das wichtig?</h3><p class="why" style="font-size:1rem">„${esc(p.why)}“</p>` : ''}
      ${p.goal ? `<h3>🎯 Ziel / Wann ist es fertig?</h3><p>${esc(p.goal)}</p>` : ''}
    </div>` : `<div class="callout" style="margin-bottom:16px">💡 Tipp: Trage unter <a href="#" data-action="editProject" data-id="${p.id}">Bearbeiten</a> ein, <b>warum</b> dir das Projekt wichtig ist. Das wird dir angezeigt, wenn das Projekt einzuschlafen droht.</div>`}

    <div class="stats">
      <div class="stat"><div class="label">Fortschritt</div><div class="value">${s.progress}%</div>${progressBar(s.progress, s.progress === 100 ? 'good' : '')}
        <div class="sub">${s.msTotal ? `${s.msDone}/${s.msTotal} Meilensteine` : `${s.tasksDone}/${s.tasksTotal} Aufgaben`}</div></div>
      <div class="stat"><div class="label">Zeit gesamt</div><div class="value">${fmtHours(s.minutes)}</div>
        ${hourGoal ? progressBar((s.minutes / 60 / hourGoal) * 100, s.minutes / 60 > hourGoal ? 'over' : '') + `<div class="sub">von ${hourGoal} Std geplant</div>` : `<div class="sub">${fmtHours(weekMinutes(0, p.id))} diese Woche</div>`}</div>
      <div class="stat"><div class="label">Investiert</div><div class="value">${fmtEUR(s.invested)}</div>
        ${budget ? progressBar((s.invested / budget) * 100, s.invested > budget ? 'over' : '') + `<div class="sub">Budget ${fmtEUR(budget)} · ${s.invested > budget ? 'überschritten' : `${fmtEUR(budget - s.invested)} übrig`}</div>` : '<div class="sub">kein Budget festgelegt</div>'}</div>
      <div class="stat"><div class="label">Offene Aufgaben</div><div class="value">${s.tasksOpen}</div><div class="sub">${s.tasksDone} erledigt</div></div>
      ${p.targetDate ? `<div class="stat"><div class="label">Zieltermin</div><div class="value" style="font-size:1.15rem">${fmtDate(p.targetDate)}</div><div class="sub">${fmtRelative(p.targetDate)}</div></div>` : ''}
    </div>

    <div class="grid-2">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>👉 Nächster Schritt</h2><button class="btn small" data-action="addTask" data-id="${p.id}">+ Aufgabe</button></div>
          ${s.next ? `<ul class="list">${taskItem(s.next)}</ul>` : '<div class="empty">Keine offene Aufgabe. Was ist der kleinste nächste Schritt?</div>'}
        </section>
        <section class="card">
          <div class="card-head"><h2>🏁 Nächste Meilensteine</h2><button class="btn small" data-action="addMilestone" data-id="${p.id}">+ Meilenstein</button></div>
          ${ms.length ? `<ul class="list">${ms.map((m) => milestoneItem(m)).join('')}</ul>` : '<div class="empty">Keine offenen Meilensteine.</div>'}
        </section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>⏱ Stunden pro Woche</h2></div>${weekBars(p.id)}</section>
        <section class="card">
          <div class="card-head"><h2>🕘 Letzte Aktivitäten</h2><button class="btn small" data-action="addNote" data-id="${p.id}">+ Notiz</button></div>
          ${recent.length ? `<ul class="list">${recent.map((a) => `<li><div class="grow"><div class="title">${a.icon} ${esc(a.text)}</div><div class="meta">${fmtDate(a.date)}</div></div></li>`).join('')}</ul>` : '<div class="empty">Noch keine Aktivitäten.</div>'}
        </section>
      </div>
    </div>
    ${p.description ? `<section class="card" style="margin-top:16px"><h2>Beschreibung</h2><p style="white-space:pre-wrap">${esc(p.description)}</p></section>` : ''}`;
}

function recentActivity(pid) {
  const out = [];
  data.timeEntries.filter((e) => e.projectId === pid).forEach((e) => out.push({ date: e.date, icon: '⏱', text: `${fmtDuration(e.minutes)}${e.note ? ' – ' + e.note : ''}` }));
  data.investments.filter((e) => e.projectId === pid).forEach((e) => out.push({ date: e.date, icon: '💶', text: `${fmtEUR(e.amount)} – ${e.description}` }));
  data.tasks.filter((t) => t.projectId === pid && t.done).forEach((t) => out.push({ date: t.doneAt, icon: '✅', text: t.title }));
  data.milestones.filter((m) => m.projectId === pid && m.done).forEach((m) => out.push({ date: m.doneAt, icon: '🏁', text: `Meilenstein erreicht: ${m.title}` }));
  data.notes.filter((n) => n.projectId === pid).forEach((n) => out.push({ date: n.date, icon: '📝', text: n.text }));
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function projectTasks(p) {
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const open = sortTasks(tasks.filter((t) => !t.done));
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return `<section class="card">
    <div class="card-head"><h2>Offene Aufgaben (${open.length})</h2><button class="btn primary small" data-action="addTask" data-id="${p.id}">+ Aufgabe</button></div>
    ${open.length ? `<ul class="list">${open.map((t) => taskItem(t)).join('')}</ul>` : '<div class="empty">Keine offenen Aufgaben. 🎉</div>'}
    ${done.length ? `<details class="done-list"><summary>Erledigt (${done.length})</summary><ul class="list">${done.map((t) => taskItem(t)).join('')}</ul></details>` : ''}
  </section>`;
}

function projectMilestones(p) {
  const ms = data.milestones.filter((m) => m.projectId === p.id)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  return `<section class="card">
    <div class="card-head"><h2>Meilensteine</h2><button class="btn primary small" data-action="addMilestone" data-id="${p.id}">+ Meilenstein</button></div>
    ${ms.length ? `<ul class="list">${ms.map((m) => milestoneItem(m)).join('')}</ul>`
      : '<div class="empty">Noch keine Meilensteine. Teile dein Projekt in 3–5 große Etappen auf – das macht Fortschritt sichtbar.</div>'}
  </section>`;
}

function projectTime(p) {
  const entries = data.timeEntries.filter((e) => e.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(entries, (e) => e.minutes);
  return `<section class="card">
    <div class="card-head"><h2>Zeiteinträge · ${fmtHours(total)}</h2><button class="btn primary small" data-action="addTime" data-id="${p.id}">+ Zeit</button></div>
    ${entries.length ? `<ul class="list">${entries.map((e) => `
      <li>
        <div class="grow"><div class="title">${esc(e.note || 'Ohne Beschreibung')}</div><div class="meta">${fmtDate(e.date)}</div></div>
        <span class="amount">${fmtDuration(e.minutes)}</span>
        <div class="actions">
          <button class="btn ghost icon" data-action="editTime" data-id="${e.id}" title="Bearbeiten">✎</button>
          <button class="btn ghost icon danger" data-action="deleteTime" data-id="${e.id}" title="Löschen">🗑</button>
        </div>
      </li>`).join('')}</ul>` : '<div class="empty">Noch keine Zeit erfasst. Starte den Timer oder trage Zeit manuell ein.</div>'}
  </section>`;
}

function projectInvestments(p) {
  const items = data.investments.filter((e) => e.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(items, (e) => e.amount);
  const byCat = {};
  items.forEach((i) => (byCat[i.category || 'Sonstiges'] = (byCat[i.category || 'Sonstiges'] || 0) + i.amount));
  const budget = Number(p.budget) || 0;
  return `<div class="grid-2">
    <section class="card">
      <div class="card-head"><h2>Investitionen · ${fmtEUR(total)}</h2><button class="btn primary small" data-action="addInvestment" data-id="${p.id}">+ Investition</button></div>
      ${items.length ? `<ul class="list">${items.map((e) => `
        <li>
          <div class="grow"><div class="title">${esc(e.description)}</div><div class="meta">${fmtDate(e.date)} <span class="badge">${esc(e.category || 'Sonstiges')}</span></div></div>
          <span class="amount">${fmtEUR(e.amount)}</span>
          <div class="actions">
            <button class="btn ghost icon" data-action="editInvestment" data-id="${e.id}" title="Bearbeiten">✎</button>
            <button class="btn ghost icon danger" data-action="deleteInvestment" data-id="${e.id}" title="Löschen">🗑</button>
          </div>
        </li>`).join('')}</ul>` : '<div class="empty">Noch keine Investitionen erfasst.</div>'}
    </section>
    <section class="card">
      <h2>Nach Kategorie</h2>
      ${Object.keys(byCat).length ? `<dl class="kv">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmtEUR(v)} <span class="muted small">(${Math.round((v / total) * 100)}%)</span></dd>`).join('')}</dl>` : '<div class="empty">–</div>'}
      ${budget ? `<h3 style="margin-top:16px">Budget</h3>${progressBar((total / budget) * 100, total > budget ? 'over' : '')}<p class="small muted" style="margin-top:6px">${fmtEUR(total)} von ${fmtEUR(budget)}</p>` : ''}
    </section>
  </div>`;
}

function projectNotes(p) {
  const notes = data.notes.filter((n) => n.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `<section class="card">
    <div class="card-head"><h2>Logbuch</h2><button class="btn primary small" data-action="addNote" data-id="${p.id}">+ Notiz</button></div>
    <p class="small muted">Halte Gedanken, Ideen, Entscheidungen und kleine Erfolge fest. Jede Notiz zählt als Aktivität.</p>
    ${notes.length ? `<ul class="list">${notes.map((n) => `
      <li>
        <div class="grow"><div class="title" style="white-space:pre-wrap;font-weight:400">${esc(n.text)}</div><div class="meta">${fmtDate(n.date)}</div></div>
        <div class="actions">
          <button class="btn ghost icon" data-action="editNote" data-id="${n.id}" title="Bearbeiten">✎</button>
          <button class="btn ghost icon danger" data-action="deleteNote" data-id="${n.id}" title="Löschen">🗑</button>
        </div>
      </li>`).join('')}</ul>` : '<div class="empty">Noch keine Einträge.</div>'}
  </section>`;
}

/* ---------------------------- Einstellungen ------------------------------ */

function renderSettings() {
  const size = new Blob([JSON.stringify(data)]).size;
  return `
    <div class="page-head"><div><h1>Einstellungen</h1><p>Ziele, Datensicherung und Import</p></div></div>
    <div class="grid-2">
      <section class="card">
        <h2>Ziele & Erinnerungen</h2>
        <form class="form" style="padding:0" data-form="settings">
          <label>Wochenziel (Stunden für alle Projekte)
            <input type="number" min="0" step="0.5" name="weeklyHoursGoal" value="${esc(data.settings.weeklyHoursGoal)}">
          </label>
          <label>Projekt gilt als „eingeschlafen“ nach … Tagen ohne Aktivität
            <input type="number" min="1" step="1" name="staleDays" value="${esc(data.settings.staleDays)}">
            <span class="hint">Ab dem doppelten Wert wird das Projekt rot markiert und im Motivationsbanner angezeigt.</span>
          </label>
          <div class="form-actions"><button class="btn primary" type="submit">Speichern</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Datensicherung</h2>
        <p class="small muted">Alle Daten werden nur lokal in diesem Browser gespeichert (${(size / 1024).toFixed(1)} KB).
        Um sie auf deinen anderen Geräten zu nutzen, exportierst du eine Sicherung nach iCloud Drive und importierst sie dort.</p>
        <dl class="kv" style="margin-bottom:16px">
          <dt>Letzte Sicherung</dt><dd>${esc(fmtDateTime(meta.lastExport))}</dd>
          <dt>Letzte Änderung</dt><dd>${esc(fmtDateTime(meta.lastChange))} ${hasUnsavedChanges() ? '<span class="badge mittel">nicht gesichert</span>' : '<span class="badge aktiv">gesichert</span>'}</dd>
        </dl>
        <div class="btn-row">
          <button class="btn primary" data-action="exportData">⬇ Backup exportieren (JSON)</button>
          <button class="btn" data-action="exportCsv">⬇ Zeit & Investitionen als CSV</button>
          <button class="btn" data-action="importData">⬆ Backup importieren</button>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
        <h3>Gefahrenzone</h3>
        <button class="btn danger" data-action="resetData">Alle Daten löschen</button>
      </section>
    </div>

    <section class="card help" style="margin-top:16px">
      <h2>☁️ Mit iCloud zwischen Geräten wechseln</h2>
      <p>Die Regel ist einfach: <b>Beim Aufhören sichern, beim Anfangen importieren.</b>
      Der Tracker erinnert dich daran: mit der gelben Leiste bei ungesicherten Änderungen, mit der blauen Leiste,
      wenn du ein Gerät länger nicht benutzt hast, und am Mac bzw. PC zusätzlich mit einer Rückfrage beim Schließen.</p>
      <p class="small muted">Damit alle Geräte im selben Ordner landen, stelle überall <b>iCloud Drive › Downloads</b> als Download-Ordner ein.
      Beim Import wählst du dort einfach die neueste Datei (der Dateiname enthält Datum und Uhrzeit).</p>

      <div class="grid-2">
        <div>
          <h3>📱 iPhone & iPad (Safari)</h3>
          <ol>
            <li><b>Zum Home-Bildschirm hinzufügen</b> (Teilen-Symbol › „Zum Home-Bildschirm“) und den Tracker immer darüber öffnen.
              Sonst kann Safari die Daten nach 7 Tagen ohne Besuch löschen.</li>
            <li>Download-Ordner prüfen: <i>Einstellungen › Apps › Safari › Downloads</i> › „iCloud Drive“ (ist meist schon so eingestellt).</li>
            <li>Beim Schließen gibt es auf iPhone/iPad <b>keine Rückfrage</b> – achte auf die gelbe Leiste und den 💾-Knopf mit dem orangefarbenen Punkt.</li>
          </ol>
        </div>
        <div>
          <h3>💻 Mac (Safari)</h3>
          <ol>
            <li><i>Safari › Einstellungen › Allgemein › Speicherort für geladene Dateien</i> › Ordner „Downloads“ in iCloud Drive wählen.</li>
            <li>Beim Schließen des Tabs oder von Safari fragt der Browser nach, falls noch nicht gesichert wurde.</li>
          </ol>
          <h3>🖥 Windows-PC (Edge)</h3>
          <ol>
            <li>„iCloud für Windows“ aus dem Microsoft Store installieren und iCloud Drive aktivieren.</li>
            <li><i>Edge › Einstellungen › Downloads › Speicherort</i> › <code>iCloud Drive\\Downloads</code> wählen.</li>
            <li>Beim Schließen des Tabs oder von Edge fragt der Browser nach, falls noch nicht gesichert wurde.</li>
          </ol>
        </div>
      </div>
      <p class="small muted" style="margin-top:12px">Hinweis: Browser erlauben bei der Rückfrage keinen eigenen Text. Es erscheint die Standardmeldung
      („Diese Website verlassen?“ o. Ä.). Wähle dann „Abbrechen“ / „Bleiben“ und klicke auf 💾 Sichern.</p>
    </section>`;
}

/* ------------------------------------------------------------------------
   Formulare (Dialog)
   ------------------------------------------------------------------------ */

function fieldHTML(f) {
  const id = 'f_' + f.name;
  const v = f.value ?? '';
  const req = f.required ? 'required' : '';
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  let input;
  if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.name}" ${req} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  else if (f.type === 'select') input = `<select id="${id}" name="${f.name}" ${req}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  else {
    const type = { decimal: 'text', duration: 'text' }[f.type] || f.type || 'text';
    const extra = f.type === 'decimal' ? 'inputmode="decimal"' : f.type === 'number' ? 'step="any" min="0"' : '';
    input = `<input id="${id}" type="${type}" name="${f.name}" value="${esc(v)}" ${req} ${extra} placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${id}_list"` : ''}>`;
    if (f.list) input += `<datalist id="${id}_list">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  return `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}${input}${hint}</label>`;
}

function openForm({ title, fields, submitLabel = 'Speichern', onSubmit }) {
  const dlg = $('#modal');
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.half && fields[i + 1]?.half) { rows.push(`<div class="row2">${fieldHTML(f)}${fieldHTML(fields[i + 1])}</div>`); i++; }
    else rows.push(fieldHTML(f));
  }
  dlg.innerHTML = `<form class="form" novalidate>
    <h2>${esc(title)}</h2>
    ${rows.join('')}
    <div class="form-error"></div>
    <div class="form-actions">
      <button type="button" class="btn" data-close>Abbrechen</button>
      <button type="submit" class="btn primary">${esc(submitLabel)}</button>
    </div>
  </form>`;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = {};
    for (const f of fields) {
      let v = fd.get(f.name);
      v = typeof v === 'string' ? v.trim() : v;
      if (f.required && !v) return showError(`Bitte „${f.label}“ ausfüllen.`);
      if (f.type === 'number') v = v === '' ? null : Number(String(v).replace(',', '.'));
      if (f.type === 'decimal') {
        v = parseAmount(v);
        if (Number.isNaN(v)) return showError(`„${f.label}“ ist keine gültige Zahl.`);
      }
      if (f.type === 'duration' && v) {
        v = parseDuration(v);
        if (!v) return showError('Dauer nicht erkannt. Beispiele: 1:30, 1,5, 90 min');
      }
      values[f.name] = v;
    }
    const err = onSubmit(values);
    if (err) return showError(err);
    dlg.close();
  });
  const showError = (msg) => { form.querySelector('.form-error').textContent = msg; };
  form.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.showModal();
  form.querySelector('input,textarea,select')?.focus();
}

const projectOptions = () => data.projects
  .filter((p) => p.status !== 'abgeschlossen')
  .map((p) => ({ value: p.id, label: p.name }));

/* ------------------------------------------------------------------------
   Aktionen
   ------------------------------------------------------------------------ */

const actions = {
  newProject() { projectForm(); },
  editProject({ id }) { projectForm(getProject(id)); },

  deleteProject({ id }) {
    const p = getProject(id);
    if (!confirm(`Projekt „${p.name}“ inklusive aller Zeiten, Investitionen, Aufgaben und Meilensteine löschen?`)) return;
    data.projects = data.projects.filter((x) => x.id !== id);
    for (const k of ['timeEntries', 'investments', 'milestones', 'tasks', 'notes']) data[k] = data[k].filter((x) => x.projectId !== id);
    if (data.timer?.projectId === id) data.timer = null;
    save();
    location.hash = '#/projekte';
    toast('Projekt gelöscht');
  },

  filterProjects({ id }) { projectFilter = id; render(); },

  /* Aufgaben */
  addTask({ id }) { taskForm({ projectId: id }); },
  editTask({ id }) { taskForm(data.tasks.find((t) => t.id === id)); },
  toggleTask({ id }) {
    const t = data.tasks.find((x) => x.id === id);
    t.done = !t.done;
    t.doneAt = t.done ? todayISO() : null;
    commit();
    if (t.done) {
      const left = data.tasks.filter((x) => x.projectId === t.projectId && !x.done).length;
      toast(`${pick(CHEERS)} ${left ? `Noch ${left} offen.` : 'Alle Aufgaben erledigt!'}`);
      if (!left) confetti();
    }
  },
  deleteTask({ id }) {
    if (!confirm('Aufgabe löschen?')) return;
    data.tasks = data.tasks.filter((t) => t.id !== id);
    commit();
  },

  /* Meilensteine */
  addMilestone({ id }) { milestoneForm({ projectId: id }); },
  editMilestone({ id }) { milestoneForm(data.milestones.find((m) => m.id === id)); },
  toggleMilestone({ id }) {
    const m = data.milestones.find((x) => x.id === id);
    m.done = !m.done;
    m.doneAt = m.done ? todayISO() : null;
    commit();
    if (m.done) { toast(`🏁 Meilenstein „${m.title}“ erreicht!`); confetti(); }
  },
  deleteMilestone({ id }) {
    if (!confirm('Meilenstein löschen? Zugeordnete Aufgaben bleiben erhalten.')) return;
    data.milestones = data.milestones.filter((m) => m.id !== id);
    data.tasks.forEach((t) => { if (t.milestoneId === id) t.milestoneId = null; });
    commit();
  },

  /* Zeit */
  addTime({ id } = {}) {
    if (!data.projects.length) return toast('Lege zuerst ein Projekt an.');
    timeForm({ projectId: id || parseRoute().id });
  },
  editTime({ id }) { timeForm(data.timeEntries.find((e) => e.id === id)); },
  deleteTime({ id }) {
    if (!confirm('Zeiteintrag löschen?')) return;
    data.timeEntries = data.timeEntries.filter((e) => e.id !== id);
    commit();
  },

  startTimer({ id }) {
    if (data.timer && !confirm('Es läuft bereits ein Timer. Diesen verwerfen und neu starten?')) return;
    data.timer = { projectId: id, start: Date.now() };
    commit();
    toast(`▶ Timer für „${getProject(id).name}“ gestartet. Los geht's!`);
  },
  stopTimer() {
    const t = data.timer;
    if (!t) return;
    const minutes = Math.max(1, Math.round((Date.now() - t.start) / 60000));
    timeForm({ projectId: t.projectId, minutes, date: toISO(new Date(t.start)) }, { fromTimer: true });
  },
  discardTimer() {
    if (!confirm('Laufenden Timer verwerfen?')) return;
    data.timer = null;
    commit();
  },

  /* Investitionen */
  addInvestment({ id }) { investmentForm({ projectId: id }); },
  editInvestment({ id }) { investmentForm(data.investments.find((e) => e.id === id)); },
  deleteInvestment({ id }) {
    if (!confirm('Investition löschen?')) return;
    data.investments = data.investments.filter((e) => e.id !== id);
    commit();
  },

  /* Logbuch */
  addNote({ id }) { noteForm({ projectId: id }); },
  editNote({ id }) { noteForm(data.notes.find((n) => n.id === id)); },
  deleteNote({ id }) {
    if (!confirm('Notiz löschen?')) return;
    data.notes = data.notes.filter((n) => n.id !== id);
    commit();
  },

  /* Daten */
  exportData() {
    const now = new Date();
    const stamp = `${toISO(now)}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    download(`projekttracker-backup-${stamp}.json`, JSON.stringify({ ...data, exportedAt: now.toISOString() }, null, 2), 'application/json');
    meta.lastExport = Date.now();
    saveMeta();
    render();
    toast('Sicherung exportiert ✔ – lege die Datei in iCloud Drive ab.');
  },
  dismissSyncHint() {
    syncHintDismissed = true;
    renderBackupBar();
  },
  exportCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const name = (pid) => getProject(pid)?.name || '';
    const rows = [['Typ', 'Datum', 'Projekt', 'Beschreibung', 'Kategorie', 'Minuten', 'Stunden', 'Betrag (EUR)'].map(q).join(';')];
    data.timeEntries.forEach((e) => rows.push(['Zeit', e.date, name(e.projectId), e.note, '', e.minutes, (e.minutes / 60).toFixed(2).replace('.', ','), ''].map(q).join(';')));
    data.investments.forEach((e) => rows.push(['Investition', e.date, name(e.projectId), e.description, e.category, '', '', String(e.amount.toFixed(2)).replace('.', ',')].map(q).join(';')));
    download(`projekttracker-${todayISO()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
  },
  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed.projects)) throw new Error('Keine gültige Projekttracker-Datei.');
        const backupTime = parsed.exportedAt ? Date.parse(parsed.exportedAt) : 0;
        let msg = `Sicherung importieren?\n\nGesichert: ${backupTime ? fmtDateTime(backupTime) : 'unbekannt'}\nProjekte: ${parsed.projects.length}\n\nDie Daten auf diesem Gerät werden dadurch ersetzt.`;
        if (hasUnsavedChanges()) {
          msg += `\n\n⚠️ Auf diesem Gerät gibt es ungesicherte Änderungen (letzte Sicherung: ${fmtDateTime(meta.lastExport)}). Sie gehen beim Import verloren!`;
        }
        if (backupTime && meta.lastChange > backupTime) {
          msg += `\n\n⚠️ Die Daten auf diesem Gerät (zuletzt geändert ${fmtDateTime(meta.lastChange)}) sind NEUER als diese Sicherung.`;
        }
        if (!confirm(msg)) return;
        delete parsed.exportedAt;
        data = normalize(parsed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        meta.lastChange = meta.lastExport = Date.now(); // Gerät entspricht jetzt genau der Sicherung
        saveMeta();
        syncHintDismissed = true;
        render();
        toast('Import erfolgreich ✔');
      } catch (e) {
        toast('Import fehlgeschlagen: ' + e.message, 'error');
      }
    };
    input.click();
  },
  resetData() {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    if (!confirm('Letzte Chance: Hast du ein Backup exportiert? Endgültig löschen?')) return;
    data = structuredClone(DEFAULT_DATA);
    save();
    location.hash = '#/';
    render();
  },
  loadDemo() {
    data = demoData();
    commit();
    toast('Beispieldaten geladen – unter Einstellungen kannst du alles wieder löschen.');
  },
};

/* ---------------------------- Formulardefinitionen ----------------------- */

function projectForm(p) {
  const isNew = !p;
  p = p || { status: 'aktiv', color: COLORS[data.projects.length % COLORS.length] };
  const cats = [...new Set(data.projects.map((x) => x.category).filter(Boolean))];
  openForm({
    title: isNew ? 'Neues Projekt' : 'Projekt bearbeiten',
    submitLabel: isNew ? 'Anlegen' : 'Speichern',
    fields: [
      { name: 'name', label: 'Name', required: true, value: p.name },
      { name: 'description', label: 'Beschreibung', type: 'textarea', value: p.description },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, value: p.status, half: true },
      { name: 'category', label: 'Kategorie', value: p.category, list: cats, placeholder: 'z. B. Beruf, Hobby', half: true },
      { name: 'why', label: 'Warum ist mir dieses Projekt wichtig?', type: 'textarea', value: p.why, hint: 'Wird dir angezeigt, wenn das Projekt einzuschlafen droht.' },
      { name: 'goal', label: 'Ziel – wann ist das Projekt fertig?', type: 'textarea', value: p.goal },
      { name: 'hourGoal', label: 'Geplante Zeit (Std)', type: 'number', value: p.hourGoal, half: true },
      { name: 'budget', label: 'Budget (€)', type: 'decimal', value: p.budget != null ? String(p.budget).replace('.', ',') : '', half: true },
      { name: 'targetDate', label: 'Zieltermin', type: 'date', value: p.targetDate, half: true },
      { name: 'color', label: 'Farbe', type: 'color', value: p.color, half: true },
    ],
    onSubmit(v) {
      if (isNew) {
        const np = { id: uid(), createdAt: todayISO(), ...v };
        data.projects.push(np);
        save();
        location.hash = `#/projekt/${np.id}`;
        toast('Projekt angelegt. Lege gleich den ersten Schritt als Aufgabe fest!');
      } else {
        const wasDone = p.status === 'abgeschlossen';
        Object.assign(p, v);
        commit();
        if (!wasDone && p.status === 'abgeschlossen') celebrateProject(p);
      }
    },
  });
}

function taskForm(t) {
  const isNew = !t.id;
  const pid = t.projectId;
  const ms = data.milestones.filter((m) => m.projectId === pid && !m.done);
  const fields = [
    { name: 'title', label: 'Aufgabe', required: true, value: t.title, placeholder: 'Was ist konkret zu tun?' },
    { name: 'priority', label: 'Priorität', type: 'select', options: PRIORITIES, value: t.priority || 'mittel', half: true },
    { name: 'dueDate', label: 'Fällig am', type: 'date', value: t.dueDate, half: true },
  ];
  if (ms.length || t.milestoneId) {
    const opts = data.milestones.filter((m) => m.projectId === pid && (!m.done || m.id === t.milestoneId));
    fields.push({ name: 'milestoneId', label: 'Meilenstein', type: 'select', value: t.milestoneId || '', options: [{ value: '', label: '– keiner –' }, ...opts.map((m) => ({ value: m.id, label: m.title }))] });
  }
  fields.push({ name: 'notes', label: 'Notiz', value: t.notes });
  openForm({
    title: isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten',
    fields,
    onSubmit(v) {
      v.milestoneId = v.milestoneId || null;
      if (isNew) data.tasks.push({ id: uid(), projectId: pid, done: false, doneAt: null, createdAt: new Date().toISOString(), ...v });
      else Object.assign(t, v);
      commit();
    },
  });
}

function milestoneForm(m) {
  const isNew = !m.id;
  openForm({
    title: isNew ? 'Neuer Meilenstein' : 'Meilenstein bearbeiten',
    fields: [
      { name: 'title', label: 'Meilenstein', required: true, value: m.title, placeholder: 'z. B. Prototyp fertig' },
      { name: 'dueDate', label: 'Zieldatum', type: 'date', value: m.dueDate },
      { name: 'description', label: 'Beschreibung / Kriterien', type: 'textarea', value: m.description },
    ],
    onSubmit(v) {
      if (isNew) data.milestones.push({ id: uid(), projectId: m.projectId, done: false, doneAt: null, createdAt: new Date().toISOString(), ...v });
      else Object.assign(m, v);
      commit();
    },
  });
}

function timeForm(e, { fromTimer = false } = {}) {
  const isNew = !e.id;
  const opts = projectOptions();
  if (e.projectId && !opts.some((o) => o.value === e.projectId)) {
    const p = getProject(e.projectId);
    if (p) opts.unshift({ value: p.id, label: p.name });
  }
  if (!opts.length) return toast('Kein offenes Projekt vorhanden.');
  openForm({
    title: fromTimer ? 'Timer stoppen & Zeit speichern' : isNew ? 'Zeit erfassen' : 'Zeiteintrag bearbeiten',
    fields: [
      { name: 'projectId', label: 'Projekt', type: 'select', options: opts, value: e.projectId },
      { name: 'date', label: 'Datum', type: 'date', value: e.date || todayISO(), required: true, half: true },
      { name: 'minutes', label: 'Dauer', type: 'duration', required: true, value: e.minutes ? `${Math.floor(e.minutes / 60)}:${pad(e.minutes % 60)}` : '', placeholder: '1:30', hint: 'z. B. 1:30, 1,5 oder 45 min', half: true },
      { name: 'note', label: 'Was hast du gemacht?', value: e.note },
    ],
    submitLabel: 'Speichern',
    onSubmit(v) {
      if (isNew) data.timeEntries.push({ id: uid(), ...v });
      else Object.assign(e, v);
      if (fromTimer) data.timer = null;
      commit();
      if (isNew) toast(`⏱ ${fmtDuration(v.minutes)} gespeichert. ${pick(CHEERS)}`);
    },
  });
  if (fromTimer) {
    const actionsEl = $('#modal .form-actions');
    actionsEl.insertAdjacentHTML('afterbegin', '<button type="button" class="btn danger" data-action="discardTimer" style="margin-right:auto">Verwerfen</button>');
    actionsEl.querySelector('[data-action="discardTimer"]').addEventListener('click', () => $('#modal').close());
  }
}

function investmentForm(e) {
  const isNew = !e.id;
  openForm({
    title: isNew ? 'Investition erfassen' : 'Investition bearbeiten',
    fields: [
      { name: 'description', label: 'Wofür?', required: true, value: e.description },
      { name: 'amount', label: 'Betrag (€)', type: 'decimal', required: true, value: e.amount != null ? String(e.amount).replace('.', ',') : '', placeholder: '49,99', half: true },
      { name: 'date', label: 'Datum', type: 'date', required: true, value: e.date || todayISO(), half: true },
      { name: 'category', label: 'Kategorie', type: 'select', options: INVEST_CATEGORIES.map((c) => ({ value: c, label: c })), value: e.category || 'Sonstiges' },
    ],
    onSubmit(v) {
      if (v.amount == null) return 'Bitte einen Betrag angeben.';
      if (isNew) data.investments.push({ id: uid(), projectId: e.projectId, ...v });
      else Object.assign(e, v);
      commit();
    },
  });
}

function noteForm(n) {
  const isNew = !n.id;
  openForm({
    title: isNew ? 'Neue Notiz' : 'Notiz bearbeiten',
    fields: [
      { name: 'date', label: 'Datum', type: 'date', required: true, value: n.date || todayISO() },
      { name: 'text', label: 'Notiz', type: 'textarea', required: true, value: n.text, placeholder: 'Idee, Erkenntnis, Entscheidung, kleiner Erfolg …' },
    ],
    onSubmit(v) {
      if (isNew) data.notes.push({ id: uid(), projectId: n.projectId, createdAt: new Date().toISOString(), ...v });
      else Object.assign(n, v);
      commit();
    },
  });
}

function celebrateProject(p) {
  confetti();
  toast(`🎉 „${p.name}“ abgeschlossen! Großartige Leistung.`);
}

/* ------------------------------------------------------------------------
   Timer-Anzeige, Toasts, Konfetti, Download
   ------------------------------------------------------------------------ */

function renderTimer() {
  const el = $('#timer-indicator');
  const t = data.timer;
  if (!t || !getProject(t.projectId)) { el.hidden = true; return; }
  const secs = Math.floor((Date.now() - t.start) / 1000);
  const time = `${Math.floor(secs / 3600)}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
  const name = getProject(t.projectId).name;
  if (el.hidden || el.dataset.pid !== t.projectId) {
    el.innerHTML = `<span class="dot"></span><span class="t"></span><span class="small name">${esc(name)}</span><button class="btn small" data-action="stopTimer">■ Stopp</button>`;
    el.dataset.pid = t.projectId;
    el.hidden = false;
  }
  el.querySelector('.t').textContent = time;
  document.title = `⏱ ${time} · ${name}`;
}
setInterval(() => {
  if (data.timer) renderTimer();
  else if (document.title !== 'Projekttracker') document.title = 'Projekttracker';
}, 1000);

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = pick(COLORS);
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.4 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------------
   Beispieldaten
   ------------------------------------------------------------------------ */

function demoData() {
  const d = structuredClone(DEFAULT_DATA);
  const ago = (n) => toISO(addDays(new Date(), -n));
  const ahead = (n) => toISO(addDays(new Date(), n));
  const P = (o) => { const p = { id: uid(), createdAt: ago(60), ...o }; d.projects.push(p); return p.id; };
  const T = (projectId, minutes, n, note) => d.timeEntries.push({ id: uid(), projectId, minutes, date: ago(n), note });
  const I = (projectId, amount, n, description, category) => d.investments.push({ id: uid(), projectId, amount, date: ago(n), description, category });
  const M = (projectId, title, due, done) => { const id = uid(); d.milestones.push({ id, projectId, title, dueDate: due, done: !!done, doneAt: done || null, createdAt: '' }); return id; };
  const K = (projectId, title, priority, o = {}) => d.tasks.push({ id: uid(), projectId, title, priority, done: false, doneAt: null, createdAt: new Date().toISOString(), ...o });

  const shop = P({ name: 'Online-Shop für Holzdeko', status: 'aktiv', category: 'Nebenprojekt', color: '#f59e0b',
    description: 'Eigene Holzarbeiten über einen kleinen Online-Shop verkaufen.',
    why: 'Ich möchte mir ein zweites Standbein aufbauen und mein Hobby zum Beruf machen.',
    goal: 'Shop ist online und die ersten 10 Bestellungen sind verschickt.', hourGoal: 80, budget: 600, targetDate: ahead(45) });
  const m1 = M(shop, 'Produktfotos fertig', ago(20), ago(18));
  const m2 = M(shop, 'Shop online', ahead(10));
  M(shop, 'Erste 10 Bestellungen', ahead(45));
  K(shop, 'Versandkosten kalkulieren', 'hoch', { milestoneId: m2, dueDate: ahead(3) });
  K(shop, 'Impressum & Datenschutzerklärung', 'hoch', { milestoneId: m2 });
  K(shop, 'Produkttexte schreiben', 'mittel', { milestoneId: m2 });
  K(shop, 'Instagram-Account anlegen', 'niedrig');
  K(shop, 'Fotostudio aufbauen', 'mittel', { milestoneId: m1, done: true, doneAt: ago(25) });
  [[90, 1, 'Shop-Theme angepasst'], [60, 2, 'Produkte angelegt'], [45, 4, ''], [120, 6, 'Fotos bearbeitet'], [30, 9, ''], [150, 13, 'Fotoshooting'], [60, 16, ''], [90, 20, ''], [45, 27, 'Recherche Shopsysteme']]
    .forEach(([m, n, note]) => T(shop, m, n, note));
  I(shop, 89, 30, 'Fotolicht-Set', 'Hardware');
  I(shop, 29, 5, 'Shop-Abo (Monat)', 'Software');
  I(shop, 140, 12, 'Holz & Lack', 'Material');

  const app = P({ name: 'Fitness-App lernen', status: 'aktiv', category: 'Weiterbildung', color: '#6366f1',
    description: 'Programmieren lernen, indem ich eine eigene kleine Trainings-App baue.',
    why: 'Ich will verstehen, wie Apps funktionieren – und endlich meine eigenen Trainingsdaten auswerten.', hourGoal: 50 });
  M(app, 'Grundkurs abgeschlossen', ago(35), ago(33));
  M(app, 'Erste Version auf dem Handy', ahead(20));
  K(app, 'Kapitel 7 (Datenbanken) durcharbeiten', 'mittel');
  K(app, 'Datenmodell für Workouts skizzieren', 'hoch');
  [[60, 21, 'Kurs Kapitel 6'], [45, 24, ''], [90, 30, ''], [60, 34, '']].forEach(([m, n, note]) => T(app, m, n, note));
  I(app, 19.99, 40, 'Online-Kurs', 'Weiterbildung');

  const garden = P({ name: 'Hochbeet bauen', status: 'abgeschlossen', category: 'Haus & Garten', color: '#10b981', createdAt: ago(80) });
  M(garden, 'Hochbeet steht', ago(50), ago(50));
  T(garden, 240, 52, 'Aufbau'); T(garden, 120, 55, 'Material besorgt');
  I(garden, 185.5, 55, 'Lärchenholz & Schrauben', 'Material');

  P({ name: 'Podcast starten', status: 'idee', category: 'Kreativ', color: '#ec4899', description: 'Gespräche mit Handwerkern aus der Region.' });

  d.notes.push({ id: uid(), projectId: shop, date: ago(3), createdAt: '', text: 'Idee: Gutscheincode für die ersten Kunden anbieten.' });
  return d;
}

/* ------------------------------------------------------------------------
   Event-Handling & Start
   ------------------------------------------------------------------------ */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset });
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change="setStatus"]');
  if (!el) return;
  const p = getProject(el.dataset.id);
  const wasDone = p.status === 'abgeschlossen';
  p.status = el.value;
  commit();
  if (!wasDone && p.status === 'abgeschlossen') celebrateProject(p);
  else toast(`Status: ${statusLabel(p.status)}`);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="settings"]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  data.settings.weeklyHoursGoal = Math.max(0, Number(fd.get('weeklyHoursGoal')) || 0);
  data.settings.staleDays = Math.max(1, Math.round(Number(fd.get('staleDays')) || 7));
  commit();
  toast('Einstellungen gespeichert');
});

// Änderungen aus einem anderen Tab übernehmen
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) data = load();
  if (e.key === STORAGE_KEY || e.key === META_KEY) { meta = loadMeta(); render(); }
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// Beim Schließen des Tabs / Browsers an den Export erinnern (Safari macOS, Edge, Chrome, Firefox).
// Browser zeigen dabei nur ihren eigenen Standardtext; iPhone/iPad-Safari unterstützt das gar nicht –
// dort übernimmt die Hinweisleiste die Erinnerung.
window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedChanges()) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});

// Import-Erinnerung: Wurde der Tracker auf diesem Gerät länger nicht geöffnet, wurde evtl. woanders weitergearbeitet.
const SYNC_HINT_AFTER_MS = 4 * 60 * 60 * 1000;
let previousOpen = 0;
let showSyncHint = false;
function checkSyncHint() {
  meta = loadMeta();
  if (data.projects.length && meta.lastOpen && Date.now() - meta.lastOpen > SYNC_HINT_AFTER_MS) {
    previousOpen = meta.lastOpen;
    showSyncHint = true;
    syncHintDismissed = false;
  }
  meta.lastOpen = Date.now();
  saveMeta();
}
checkSyncHint();
// iPhone/iPad halten Seiten oft im Speicher – beim Zurückkehren erneut prüfen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { meta = loadMeta(); meta.lastOpen = Date.now(); saveMeta(); }
  else { checkSyncHint(); renderBackupBar(); }
});

// Safari löscht Website-Daten sonst nach 7 Tagen ohne Besuch – dauerhaften Speicher anfragen.
navigator.storage?.persist?.().catch(() => {});

render();
