'use strict';

/* =========================================================================
   Projekttracker – alle Daten liegen im localStorage dieses Browsers.
   ========================================================================= */

const STORAGE_KEY = 'projekttracker.v1';
const META_KEY = 'projekttracker.meta';

const DEFAULT_DATA = {
  version: 1,
  settings: {
    weeklyHoursGoal: 5,
    staleDays: 7,
    reminderTexts: null, // null = Standardtexte (DEFAULT_REMINDERS)
    reminderMinutes: 25,
    reminderShowWhy: true,
    reminderShowNext: true,
    theme: 'system', // 'system' | 'light' | 'dark'
    accent: '#4f46e5',
    syncService: 'icloud', // Dienst für den Gerätewechsel (nur für Anleitung & Hinweise)
    pomoWork: 25, // Minuten Fokus
    pomoShort: 5, // kurze Pause
    pomoLong: 15, // lange Pause
    pomoEvery: 4, // lange Pause nach jedem n-ten Pomodoro
    pomoSound: true,
    pomoNotify: true,
  },
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
// Vorschläge für Investitions-Kategorien – eigene Kategorien sind jederzeit möglich
const INVEST_CATEGORIES = ['Material', 'Software', 'Hardware', 'Dienstleistung', 'Marketing', 'Weiterbildung', 'Sonstiges'];

/** Alle Kategorien: bereits verwendete (häufigste zuerst), dann die übrigen Vorschläge. Ohne Dubletten (Groß/Klein egal). */
function investmentCategories() {
  const count = new Map();
  for (const i of data.investments) {
    const c = (i.category || '').trim();
    if (!c) continue;
    const key = c.toLocaleLowerCase('de');
    const cur = count.get(key) || { name: c, n: 0 };
    cur.n += 1;
    count.set(key, cur);
  }
  const used = [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de')).map((x) => x.name);
  const rest = INVEST_CATEGORIES.filter((c) => !count.has(c.toLocaleLowerCase('de')));
  return [...used, ...rest];
}

/** Eingabe vereinheitlichen: vorhandene Schreibweise übernehmen, leer = „Sonstiges“. */
function normalizeCategory(input) {
  const c = String(input || '').replace(/\s+/g, ' ').trim();
  if (!c) return 'Sonstiges';
  return investmentCategories().find((x) => x.toLocaleLowerCase('de') === c.toLocaleLowerCase('de')) || c;
}
// Standardfarben für neue Projekte – feste Reihenfolge, geprüft auf Unterscheidbarkeit (auch bei Farbsehschwäche)
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

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
// Standard-Erinnerungen für eingeschlafene Projekte – in den Einstellungen anpassbar.
// Platzhalter: {projekt} {tage} {warum} {schritt} {ziel} {stunden}
const DEFAULT_REMINDERS = [
  '„{projekt}“ ruht seit {tage} Tagen.',
  '„{projekt}“ vermisst dich – {tage} Tage ist es schon her.',
  '{tage} Tage Pause bei „{projekt}“. Zeit für einen kleinen Schritt?',
  'Weißt du noch, warum du „{projekt}“ angefangen hast?',
];
const PLACEHOLDERS = [
  ['{projekt}', 'Name des Projekts'],
  ['{tage}', 'Tage ohne Aktivität'],
  ['{warum}', 'dein „Warum“'],
  ['{schritt}', 'nächste offene Aufgabe'],
  ['{ziel}', 'Ziel des Projekts'],
  ['{stunden}', 'bisher investierte Zeit'],
];

const ACCENTS = [
  ['#4f46e5', 'Indigo'], ['#2563eb', 'Blau'], ['#0891b2', 'Cyan'], ['#0d9488', 'Türkis'],
  ['#16a34a', 'Grün'], ['#ca8a04', 'Gold'], ['#ea580c', 'Orange'], ['#dc2626', 'Rot'],
  ['#db2777', 'Pink'], ['#7c3aed', 'Violett'], ['#475569', 'Schiefer'],
];
// Anleitungen für den Gerätewechsel. Schritte sind statisches HTML (keine Nutzereingaben).
const SAFARI_IOS = '<i>Einstellungen › Apps › Safari › Downloads</i>';
const SAFARI_MAC = '<i>Safari › Einstellungen › Allgemein › Speicherort für geladene Dateien</i>';
const EDGE_DL = '<i>Edge › Einstellungen › Downloads › Speicherort</i>';
const SYNC_SERVICES = [
  { id: 'icloud', name: 'iCloud Drive', cloud: true, folder: 'iCloud Drive › Downloads', steps: {
    ios: [`${SAFARI_IOS} › „iCloud Drive“ wählen (ist meist schon so eingestellt).`,
      'Import: im Dateidialog <i>Durchsuchen › iCloud Drive › Downloads</i> öffnen.'],
    mac: [`${SAFARI_MAC} › „Andere …“ › <i>iCloud Drive › Downloads</i> wählen.`,
      'Falls iCloud Drive fehlt: <i>Systemeinstellungen › [dein Name] › iCloud › iCloud Drive</i> aktivieren.'],
    win: ['„iCloud für Windows“ aus dem Microsoft Store installieren, anmelden und iCloud Drive aktivieren.',
      `${EDGE_DL} › <code>iCloud Drive\\Downloads</code> wählen.`],
    android: ['Für Android gibt es keine iCloud-Drive-App. Nutze <i>icloud.com › Drive</i> im Browser: Sicherung dort hochladen bzw. herunterladen.',
      'Wenn du regelmäßig Android nutzt, ist einer der anderen Dienste bequemer.'],
  } },
  { id: 'onedrive', name: 'OneDrive', cloud: true, folder: 'OneDrive › Projekttracker', steps: {
    ios: ['OneDrive-App aus dem App Store installieren und anmelden.',
      'In der Dateien-App unter <i>Durchsuchen › ⋯ › Bearbeiten</i> „OneDrive“ einschalten.',
      `${SAFARI_IOS} › „Andere …“ › <i>OneDrive › Projekttracker</i> wählen.`],
    mac: ['OneDrive-App aus dem App Store installieren und anmelden.',
      `${SAFARI_MAC} › „Andere …“ › <i>OneDrive › Projekttracker</i> wählen.`],
    win: ['OneDrive ist in Windows enthalten – mit deinem Microsoft-Konto anmelden.',
      `${EDGE_DL} › <code>OneDrive\\Projekttracker</code> wählen.`],
    android: ['OneDrive-App installieren und anmelden.',
      'Nach dem Export: Download öffnen › <i>Teilen › OneDrive</i> › Ordner „Projekttracker“.',
      'Import: im Dateidialog über das Menü ☰ „OneDrive“ wählen.'],
  } },
  { id: 'gdrive', name: 'Google Drive', cloud: true, folder: 'Google Drive › Meine Ablage › Projekttracker', steps: {
    ios: ['Google-Drive-App aus dem App Store installieren und anmelden.',
      'In der Dateien-App unter <i>Durchsuchen › ⋯ › Bearbeiten</i> „Drive“ einschalten.',
      `${SAFARI_IOS} › „Andere …“ › <i>Drive › Meine Ablage › Projekttracker</i> wählen.`],
    mac: ['„Google Drive für Desktop“ installieren und anmelden.',
      `${SAFARI_MAC} › „Andere …“ › <i>Google Drive › Meine Ablage › Projekttracker</i> wählen.`],
    win: ['„Google Drive für Desktop“ installieren – danach gibt es das Laufwerk „Google Drive (G:)“.',
      `${EDGE_DL} › <code>G:\\Meine Ablage\\Projekttracker</code> wählen.`],
    android: ['Google Drive ist meist vorinstalliert.',
      'Nach dem Export: Download öffnen › <i>Teilen › Drive</i> › Ordner „Projekttracker“.',
      'Import: im Dateidialog über das Menü ☰ „Drive“ wählen.'],
  } },
  { id: 'dropbox', name: 'Dropbox', cloud: true, folder: 'Dropbox › Projekttracker', steps: {
    ios: ['Dropbox-App aus dem App Store installieren und anmelden.',
      'In der Dateien-App unter <i>Durchsuchen › ⋯ › Bearbeiten</i> „Dropbox“ einschalten.',
      `${SAFARI_IOS} › „Andere …“ › <i>Dropbox › Projekttracker</i> wählen.`],
    mac: ['Dropbox-App für macOS installieren und anmelden.',
      `${SAFARI_MAC} › „Andere …“ › <i>Dropbox › Projekttracker</i> wählen.`],
    win: ['Dropbox-App für Windows installieren und anmelden.',
      `${EDGE_DL} › <code>Dropbox\\Projekttracker</code> wählen.`],
    android: ['Dropbox-App installieren und anmelden.',
      'Nach dem Export: Download öffnen › <i>Teilen › Dropbox</i> › Ordner „Projekttracker“.',
      'Import: im Dateidialog über das Menü ☰ „Dropbox“ wählen.'],
  } },
  { id: 'none', name: 'Ohne Cloud', cloud: false, folder: 'Download-Ordner', steps: {
    ios: ['Die Sicherung landet in der Dateien-App unter <i>Downloads</i>.',
      'Zum Mac: Datei in der Dateien-App lange drücken › <i>Teilen › AirDrop</i>.'],
    mac: ['Die Sicherung landet im Ordner „Downloads“.',
      'Zu iPhone/iPad per AirDrop (Rechtsklick › Teilen › AirDrop), zum PC per USB-Stick oder E-Mail an dich selbst.'],
    win: ['Die Sicherung landet im Ordner „Downloads“.',
      'Weitergeben per USB-Stick, E-Mail an dich selbst oder „Freigabe in der Nähe“ (andere Windows-Geräte).'],
    android: ['Die Sicherung landet im Ordner „Download“.',
      'Weitergeben per „Quick Share“, USB-Kabel oder E-Mail an dich selbst.'],
  } },
];
const SYNC_DEVICES = [
  ['ios', '📱 iPhone & iPad (Safari)'], ['mac', '💻 Mac (Safari)'], ['win', '🖥 Windows-PC (Edge)'], ['android', '🤖 Android (Chrome)'],
];
const syncService = () => SYNC_SERVICES.find((x) => x.id === data.settings.syncService) || SYNC_SERVICES[0];

const THEMES = [['light', '☀️ Hell'], ['dark', '🌙 Dunkel'], ['system', '📱 Wie Gerät']];

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
  out.tasks = (out.tasks || []).map((t) => (Array.isArray(t.subtasks) ? t : { ...t, subtasks: [] }));
  // Ältere Zeiteinträge hatten nur eine Notiz -> wird zum Titel
  out.timeEntries = (out.timeEntries || []).map((e) => {
    if (e.title !== undefined) return e;
    const { note, ...rest } = e;
    return { ...rest, title: note || autoTimeTitle(e.date), autoTitle: !note, description: '' };
  });
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
   Darstellung: Hell/Dunkel & Akzentfarbe
   ------------------------------------------------------------------------ */

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
/** Mischt Farbe a mit Farbe b; t = Anteil von b (0..1). */
function mixColor(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}
function luminance(hex) {
  return hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function isDarkTheme(theme) {
  return theme === 'dark' || (theme !== 'light' && darkQuery.matches);
}

/** Setzt Hell/Dunkel und leitet alle Akzent-Farbtöne aus der gewählten Farbe ab (lesbar in beiden Modi). */
function applyTheme(settings = data.settings) {
  const root = document.documentElement;
  const theme = settings.theme || 'system';
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const accent = hexToRgb(settings.accent) ? settings.accent : '#4f46e5';
  const dark = isDarkTheme(theme);
  const surface = dark ? '#181c25' : '#ffffff';
  const heat0 = dark ? '#232836' : '#e8ebf0';

  // Text-/Linkfarbe: so lange abdunkeln bzw. aufhellen, bis sie auf dem Hintergrund gut lesbar ist
  let primary = dark ? mixColor(accent, '#ffffff', 0.25) : accent;
  for (let i = 0; i < 12 && contrastRatio(primary, surface) < (dark ? 4.5 : 3.2); i++) {
    primary = mixColor(primary, dark ? '#ffffff' : '#000000', 0.12);
  }
  // Weiße Schrift auf Knöpfen, solange sie gut lesbar ist (≥ 3:1 für fette Schrift), sonst dunkle Schrift
  const onPrimary = contrastRatio(primary, '#ffffff') >= 3 ? '#ffffff' : '#111827';

  const vars = {
    '--primary': primary,
    '--primary-contrast': onPrimary,
    '--primary-soft': mixColor(surface, accent, dark ? 0.24 : 0.12),
    '--heat-1': mixColor(heat0, accent, dark ? 0.35 : 0.3),
    '--heat-2': mixColor(heat0, accent, dark ? 0.6 : 0.55),
    '--heat-3': dark ? mixColor(accent, '#ffffff', 0.1) : accent,
    '--heat-4': dark ? mixColor(accent, '#ffffff', 0.45) : mixColor(accent, '#000000', 0.3),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#181c25' : primary);
}
darkQuery.addEventListener?.('change', () => applyTheme());

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

/** Automatischer Titel für Zeiteinträge ohne Titel, z. B. „Montag, 16.11.2026“. */
function autoTimeTitle(iso) {
  // bewusst ohne andere Helfer – wird schon beim Laden (Migration) aufgerufen
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/^(\p{L}+)\s*,?\s*/u, '$1, ');
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

/** Reihenfolge der Meilensteine: nächstes Zieldatum zuerst, ohne Datum danach, erledigte zuletzt. */
function milestoneRanks() {
  const ranked = [...data.milestones].sort((a, b) =>
    Number(!!a.done) - Number(!!b.done) ||
    (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
    (a.createdAt || '').localeCompare(b.createdAt || ''));
  return new Map(ranked.map((m, i) => [m.id, i]));
}

/** Aufgaben sortieren: Priorität › Meilenstein (ohne Meilenstein zuletzt) › Fälligkeit › Anlagedatum. */
function sortTasks(tasks) {
  const rank = milestoneRanks();
  const msRank = (t) => (t.milestoneId && rank.has(t.milestoneId) ? rank.get(t.milestoneId) : Infinity);
  return [...tasks].sort((a, b) =>
    (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1) ||
    (msRank(a) === msRank(b) ? 0 : msRank(a) < msRank(b) ? -1 : 1) ||
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
  data.tasks.filter(f).forEach((t) => (t.subtasks || []).filter((st) => st.done && st.doneAt).forEach((st) => out.push({ date: st.doneAt, minutes: 0 })));
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

const staleDaysOf = (p) => Number(p.staleDays) || Number(data.settings.staleDays) || 7;

function healthOf(p, idle) {
  if (p.status !== 'aktiv') return null;
  const s = staleDaysOf(p);
  if (idle < s) return 'gut';
  if (idle < s * 2) return 'warn';
  return 'kritisch';
}

/* ---------------------------- Erinnerungstexte -------------------------- */

const splitLines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

function reminderTemplates(p) {
  const own = splitLines(p.reminderText);
  if (own.length) return own;
  const general = data.settings.reminderTexts;
  return Array.isArray(general) && general.length ? general : DEFAULT_REMINDERS;
}

function fillReminder(tpl, p, s) {
  const values = {
    projekt: p.name, tage: s.idle, warum: p.why || '', schritt: s.next?.title || '',
    ziel: p.goal || '', stunden: fmtHours(s.minutes),
  };
  return tpl
    .replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in values ? String(values[k.toLowerCase()]) : m))
    .replace(/„\s*“/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Wählt pro Projekt und Tag einen Text aus – bleibt also den ganzen Tag gleich und wechselt täglich. */
function reminderFor(p, s) {
  const list = reminderTemplates(p);
  let h = 0;
  for (const c of p.id + todayISO()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tpl = list[h % list.length];
  return { tpl, text: fillReminder(tpl, p, s) };
}

function staleBanner(p, s, { withOpen = true } = {}) {
  const set = data.settings;
  const { tpl, text } = reminderFor(p, s);
  const min = Number(set.reminderMinutes) || 25;
  const showWhy = set.reminderShowWhy !== false && p.why && !/\{warum\}/i.test(tpl);
  const showNext = set.reminderShowNext !== false && !/\{schritt\}/i.test(tpl);
  return `<div class="banner warn">
      <div class="emoji">😴</div>
      <div class="text">
        <strong>${esc(text)}</strong>
        ${showWhy ? `<div class="why">Dein Warum: „${esc(p.why)}“</div>` : ''}
        ${showNext ? `<div>${s.next ? `Kleinster nächster Schritt: <b>${esc(s.next.title)}</b>` : 'Lege einen kleinen, konkreten nächsten Schritt fest.'}</div>` : ''}
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="startTimer" data-id="${p.id}">▶ Nur ${min} Minuten</button>
        ${withOpen ? `<a class="btn" href="#/projekt/${p.id}">Öffnen</a>` : ''}
      </div>
    </div>`;
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

/**
 * Wochenziel: Haben aktive Projekte eine eigene Wochenarbeitszeit, ist das Ziel deren Summe.
 * Sonst gilt die allgemeine Wochenzeit aus den Einstellungen.
 */
const projectWeeklyMin = (p) => Math.max(0, Number(p.weeklyHours) || 0) * 60;
function weeklyGoal() {
  const projects = data.projects.filter((p) => p.status === 'aktiv' && projectWeeklyMin(p) > 0);
  if (projects.length) return { minutes: sum(projects, projectWeeklyMin), source: 'projects', projects };
  return { minutes: Math.max(0, Number(data.settings.weeklyHoursGoal) || 0) * 60, source: 'general', projects: [] };
}
const fmtStd = (h) => `${String(Math.round(h * 100) / 100).replace('.', ',')} Std`;

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
  applyTheme();
  if (typeof hideTip === 'function') hideTip();
  const r = parseRoute();
  const app = $('#app');
  let html;
  if (r.view === 'projekte') html = renderProjects();
  else if (r.view === 'projekt') html = renderProject(r.id, r.tab);
  else if (r.view === 'einstellungen') html = renderSettings();
  else html = renderDashboard();
  app.innerHTML = html;
  growAll(app);
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
      Hast du seitdem auf einem anderen Gerät gearbeitet?<span class="long"> Dann importiere zuerst die neueste Sicherung${syncService().cloud ? ` aus ${esc(syncService().name)}` : ''}.</span></span>
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

// Bausteine der Übersicht. wide = volle Breite; visible = Standard-Sichtbarkeit.
const WIDGETS = [
  { id: 'banner', label: 'Motivation & Erinnerung', icon: '💡', wide: true, visible: true },
  { id: 'stats', label: 'Kennzahlen', icon: '📊', wide: true, visible: true },
  { id: 'attention', label: 'Braucht Aufmerksamkeit', icon: '⚠️', wide: false, visible: true },
  { id: 'milestones', label: 'Anstehende Meilensteine', icon: '🏁', wide: false, visible: true },
  { id: 'nextSteps', label: 'Nächste Schritte', icon: '👉', wide: false, visible: true },
  { id: 'activity', label: 'Aktivität (12 Wochen)', icon: '📈', wide: false, visible: true },
  { id: 'projects', label: 'Alle Projekte (Tabelle)', icon: '📋', wide: true, visible: true },
  { id: 'dueTasks', label: 'Fällige Aufgaben (7 Tage)', icon: '⏰', wide: false, visible: false },
  { id: 'weekProjects', label: 'Zeit diese Woche je Projekt', icon: '⏱', wide: false, visible: false },
  { id: 'weekChart', label: 'Stunden pro Woche (alle Projekte)', icon: '📊', wide: false, visible: false },
  { id: 'recent', label: 'Letzte Aktivitäten', icon: '🕘', wide: false, visible: false },
  { id: 'projectCards', label: 'Projektkacheln', icon: '🗂', wide: true, visible: false },
];

const STAT_TILES = [
  { id: 'week', label: 'Diese Woche', visible: true },
  { id: 'streak', label: 'Streak', visible: true },
  { id: 'active', label: 'Aktive Projekte', visible: true },
  { id: 'openTasks', label: 'Offene Aufgaben', visible: true },
  { id: 'invested', label: 'Investiert', visible: true },
  { id: 'month', label: 'Zeit diesen Monat', visible: false },
  { id: 'total', label: 'Zeit gesamt', visible: false },
  { id: 'milestonesDone', label: 'Erreichte Meilensteine', visible: false },
];

/** Gespeicherte Anordnung mit den bekannten Bausteinen abgleichen (neue Bausteine werden hinten angehängt). */
function dashboardConfig() {
  const saved = data.settings.dashboard || {};
  const known = new Map(WIDGETS.map((w) => [w.id, w]));
  const widgets = [];
  for (const w of saved.widgets || []) {
    if (!known.has(w.id) || widgets.some((x) => x.id === w.id)) continue;
    widgets.push({ id: w.id, visible: w.visible !== false, wide: !!w.wide });
  }
  for (const w of WIDGETS) if (!widgets.some((x) => x.id === w.id)) widgets.push({ id: w.id, visible: saved.widgets ? false : w.visible, wide: w.wide });
  const stats = Array.isArray(saved.stats) ? saved.stats.filter((id) => STAT_TILES.some((t) => t.id === id)) : STAT_TILES.filter((t) => t.visible).map((t) => t.id);
  return { widgets, stats };
}

const defaultDashboardConfig = () => ({
  widgets: WIDGETS.map((w) => ({ id: w.id, visible: w.visible, wide: w.wide })),
  stats: STAT_TILES.filter((t) => t.visible).map((t) => t.id),
});

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

  const ctx = dashboardContext();
  const cfg = dashboardConfig();
  const visible = cfg.widgets.filter((w) => w.visible);

  // Halbe Bausteine werden paarweise in Zeilen gesetzt – beide Kacheln einer Zeile sind gleich hoch.
  // Bleibt ein halber Baustein allein (vor einem breiten oder am Ende), nimmt er die ganze Breite ein.
  const blocks = [];
  let pending = [];
  const flush = () => {
    for (let i = 0; i < pending.length; i += 2) {
      const pair = pending.slice(i, i + 2);
      blocks.push(`<div class="dash-row ${pair.length === 1 ? 'single' : ''}">${pair.join('')}</div>`);
    }
    pending = [];
  };
  visible.forEach((w) => {
    const html = renderWidget(w.id, ctx, cfg);
    if (!html) return;
    if (w.wide) { flush(); blocks.push(`<div class="dash-wide">${html}</div>`); }
    else pending.push(html);
  });
  flush();

  return `
    <div class="dash-head">
      <h1>Übersicht</h1>
      <button class="btn small" data-action="customizeDashboard">⚙️ Anpassen</button>
    </div>
    <div class="dash">
      ${blocks.join('')}
      ${visible.length ? '' : `<div class="card empty">Alle Bereiche sind ausgeblendet.<br><br><button class="btn primary" data-action="customizeDashboard">Übersicht anpassen</button></div>`}
    </div>`;
}

function dashboardContext() {
  const today = todayISO();
  const active = data.projects.filter((p) => p.status === 'aktiv');
  const stats = new Map(data.projects.map((p) => [p.id, projectStats(p)]));
  const openTasks = data.tasks.filter((t) => !t.done && getProject(t.projectId)?.status !== 'abgeschlossen');
  const stale = active
    .map((p) => ({ p, s: stats.get(p.id) }))
    .filter((x) => x.s.health !== 'gut')
    .sort((a, b) => b.s.idle - a.s.idle);
  return {
    today, active, stats, openTasks, stale,
    overdue: openTasks.filter((t) => isOverdue(t.dueDate)),
    goal: weeklyGoal(),
    goalMin: weeklyGoal().minutes,
    thisWeek: weekMinutes(0),
    lastWeek: weekMinutes(-1),
    streak: calcStreak(),
  };
}

const card = (title, body, extraHead = '') => `<section class="card">
  <div class="card-head"><h2>${title}</h2>${extraHead}</div>${body}</section>`;

function renderWidget(id, c, cfg) {
  switch (id) {
    case 'banner':
      return renderBanner(c);

    case 'stats':
      return cfg.stats.length ? `<div class="stats">${cfg.stats.map((t) => statTile(t, c)).join('')}</div>` : '';

    case 'attention':
      return card('⚠️ Braucht Aufmerksamkeit', c.stale.length ? `<ul class="list">${c.stale.map(({ p, s }) => `
        <li>
          <span class="dot-color" style="background:${esc(p.color)}"></span>
          <div class="grow">
            <div class="title"><a href="#/projekt/${p.id}">${esc(p.name)}</a></div>
            <div class="small why">${esc(reminderFor(p, s).text)}</div>
            <div class="meta">${healthBadge(s)}${s.next ? `<span>Nächster Schritt: ${esc(s.next.title)}</span>` : ''}</div>
          </div>
          <button class="btn small" data-action="startTimer" data-id="${p.id}">▶ ${Number(data.settings.reminderMinutes) || 25} Min</button>
        </li>`).join('')}</ul>`
        : '<div class="empty">Alle aktiven Projekte wurden in den letzten Tagen bearbeitet. 🎉</div>');

    case 'nextSteps': {
      const list = c.active.map((p) => c.stats.get(p.id).next).filter(Boolean)
        .sort((a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1));
      return card('👉 Nächste Schritte', list.length ? `<ul class="list">${list.map((t) => taskItem(t, { showProject: true })).join('')}</ul>`
        : '<div class="empty">Keine offenen Aufgaben in aktiven Projekten.<br>Lege für jedes Projekt einen konkreten nächsten Schritt fest.</div>');
    }

    case 'dueTasks': {
      const limit = toISO(addDays(new Date(), 7));
      const list = sortTasks(c.openTasks.filter((t) => t.dueDate && t.dueDate <= limit))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return card('⏰ Fällige Aufgaben', list.length ? `<ul class="list">${list.map((t) => taskItem(t, { showProject: true })).join('')}</ul>`
        : '<div class="empty">In den nächsten 7 Tagen ist nichts fällig.</div>');
    }

    case 'milestones': {
      const list = data.milestones
        .filter((m) => !m.done && m.dueDate && getProject(m.projectId) && getProject(m.projectId).status !== 'abgeschlossen')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
      return card('🏁 Anstehende Meilensteine', list.length ? `<ul class="list">${list.map((m) => milestoneItem(m, { showProject: true })).join('')}</ul>`
        : '<div class="empty">Keine terminierten Meilensteine.</div>');
    }

    case 'activity':
      return card('📈 Aktivität (12 Wochen)', heatmap(dayMap()));

    case 'weekChart':
      return card('📊 Stunden pro Woche', stackedWeekBars());

    case 'weekProjects': {
      // Projekte mit Zeit diese Woche oder mit eigenem Wochenziel (aktiv)
      const rows = data.projects
        .map((p) => ({ p, min: weekMinutes(0, p.id), goal: p.status === 'aktiv' ? projectWeeklyMin(p) : 0 }))
        .filter((x) => x.min > 0 || x.goal > 0)
        .sort((a, b) => (b.goal ? b.min / b.goal : 0) - (a.goal ? a.min / a.goal : 0) || b.min - a.min);
      const max = Math.max(1, ...rows.map((r) => r.min));
      return card('⏱ Zeit diese Woche', rows.length ? `<ul class="list">${rows.map(({ p, min, goal }) => `
        <li><div class="grow">
          <div class="row-between"><a href="#/projekt/${p.id}">${esc(p.name)}</a>
            <span class="amount">${fmtDuration(min)}${goal ? ` <span class="muted small">/ ${fmtStd(goal / 60)}</span>` : ''}</span></div>
          <div class="progress ${goal && min >= goal ? 'good' : ''}" style="margin-top:6px"><span style="width:${Math.min(100, (min / (goal || max)) * 100)}%;${goal && min >= goal ? '' : `background:${esc(p.color)}`}"></span></div>
        </div></li>`).join('')}</ul>` : '<div class="empty">Diese Woche noch keine Zeit erfasst.</div>');
    }

    case 'recent': {
      const all = data.projects.flatMap((p) => recentActivity(p.id).map((a) => ({ ...a, p })))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
      return card('🕘 Letzte Aktivitäten', all.length ? `<ul class="list">${all.map((a) => `
        <li><div class="grow"><div class="title">${a.icon} ${esc(a.text)}</div>
        <div class="meta"><span><span class="dot-color" style="background:${esc(a.p.color)}"></span> ${esc(a.p.name)}</span><span>${fmtDate(a.date)}</span></div></div></li>`).join('')}</ul>`
        : '<div class="empty">Noch keine Aktivitäten.</div>');
    }

    case 'projects': {
      const order = { aktiv: 0, pausiert: 1, idee: 2, abgeschlossen: 3 };
      const sorted = [...data.projects].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
      return card('📋 Alle Projekte', `<div class="table-wrap"><table>
        <thead><tr><th>Projekt</th><th>Status</th><th>Fortschritt</th><th class="num">Zeit</th><th class="num">Diese Woche</th><th class="num">Investiert</th><th class="num">Offene Aufg.</th><th>Zuletzt aktiv</th></tr></thead>
        <tbody>${sorted.map((p) => {
          const s = c.stats.get(p.id);
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
      </table></div>`, '<button class="btn small" data-action="newProject">+ Projekt</button>');
    }

    case 'projectCards': {
      const list = data.projects.filter((p) => p.status === 'aktiv' || p.status === 'pausiert');
      return card('🗂 Projekte', list.length ? `<div class="project-grid">${list.map((p) => projectCard(p, c.stats.get(p.id))).join('')}</div>`
        : '<div class="empty">Keine aktiven oder pausierten Projekte.</div>', '<button class="btn small" data-action="newProject">+ Projekt</button>');
    }
  }
  return '';
}

function statTile(id, c) {
  const tile = (label, value, sub = '', extra = '') => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div>${extra}<div class="sub">${sub}</div></div>`;
  const monthPrefix = c.today.slice(0, 7);
  switch (id) {
    case 'week': {
      const diff = c.thisWeek - c.lastWeek;
      const src = c.goal.source === 'projects' ? ` (${c.goal.projects.length} ${c.goal.projects.length === 1 ? 'Projekt' : 'Projekte'})` : '';
      return tile('Diese Woche', fmtHours(c.thisWeek),
        `${c.goalMin ? `Ziel: ${fmtHours(c.goalMin)}${src} · ` : ''}${diff >= 0 ? '▲' : '▼'} ${fmtHours(Math.abs(diff))} ggü. Vorwoche`,
        c.goalMin ? progressBar((c.thisWeek / c.goalMin) * 100, c.thisWeek >= c.goalMin ? 'good' : '') : '');
    }
    case 'streak':
      return tile('Streak', `${c.streak ? '🔥 ' : ''}${c.streak} ${c.streak === 1 ? 'Tag' : 'Tage'}`,
        dayMap()[c.today] ? 'Heute schon aktiv ✔' : c.streak ? 'Heute noch nichts – halte die Serie!' : 'Starte heute eine neue Serie');
    case 'active':
      return tile('Aktive Projekte', c.active.length, c.stale.length ? `${c.stale.length} brauchen Aufmerksamkeit` : 'Alle in Bewegung 👍');
    case 'openTasks':
      return tile('Offene Aufgaben', c.openTasks.length, c.overdue.length ? `<span style="color:var(--bad)">${c.overdue.length} überfällig</span>` : 'nichts überfällig');
    case 'invested':
      return tile('Investiert', fmtEUR(sum(data.investments, (i) => i.amount)),
        `${fmtEUR(sum(data.investments.filter((i) => i.date.startsWith(monthPrefix)), (i) => i.amount))} in diesem Monat`);
    case 'month': {
      const min = sum(data.timeEntries.filter((e) => e.date.startsWith(monthPrefix)), (e) => e.minutes);
      return tile('Zeit diesen Monat', fmtHours(min), new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }));
    }
    case 'total':
      return tile('Zeit gesamt', fmtHours(sum(data.timeEntries, (e) => e.minutes)), `${data.timeEntries.length} Einträge`);
    case 'milestonesDone': {
      const done = data.milestones.filter((m) => m.done).length;
      return tile('Meilensteine', `${done} / ${data.milestones.length}`, 'erreicht');
    }
  }
  return '';
}

/* ---------------------------- Übersicht anpassen ------------------------- */

let dashDraft = null;

function openDashboardEditor() {
  dashDraft = structuredClone(dashboardConfig());
  const dlg = $('#modal');
  dlg.innerHTML = `<form class="form dash-editor" novalidate>
    <h2>Übersicht anpassen</h2>
    <p class="small muted" style="margin:0">Blende Bereiche ein oder aus, ändere die Reihenfolge mit ↑ ↓ und wähle die Breite.
    Zwei aufeinanderfolgende halbe Bereiche stehen nebeneinander und sind gleich hoch; ein einzelner halber Bereich nutzt die ganze Breite.
    Auf dem Handy werden alle Bereiche untereinander angezeigt.</p>
    <div id="dash-editor-list"></div>
    <h3 style="margin:8px 0 0">Kennzahlen-Kacheln</h3>
    <div id="dash-editor-stats" class="stat-picks"></div>
    <div class="form-actions">
      <button type="button" class="btn" data-dash="reset" style="margin-right:auto">Standard</button>
      <button type="button" class="btn" data-close>Abbrechen</button>
      <button type="submit" class="btn primary">Speichern</button>
    </div>
  </form>`;
  const form = dlg.querySelector('form');
  renderDashEditor();
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dash]');
    if (!b) return;
    dashDraft = applyDashEdit(dashDraft, b);
    renderDashEditor();
  });
  form.addEventListener('change', (e) => {
    if (!e.target.dataset.widget && !e.target.dataset.stat) return;
    dashDraft = applyDashEdit(dashDraft, e.target);
    renderDashEditor();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    data.settings.dashboard = dashDraft;
    dlg.close();
    unlockScroll();
    commit();
    toast('Übersicht gespeichert');
  });
  form.querySelector('[data-close]').addEventListener('click', () => { dlg.close(); unlockScroll(); });
  lockScroll();
  dlg.showModal();
}

function renderDashEditor() {
  $('#dash-editor-list').innerHTML = dashListHTML(dashDraft);
  $('#dash-editor-stats').innerHTML = dashStatsHTML(dashDraft);
}

function dashListHTML(cfg) {
  const n = cfg.widgets.length;
  return `<ul class="list dash-editor-list">${cfg.widgets.map((w, i) => {
    const meta = WIDGETS.find((x) => x.id === w.id);
    return `<li class="${w.visible ? '' : 'off'}">
      <label class="dash-toggle"><input type="checkbox" data-widget="${w.id}" ${w.visible ? 'checked' : ''}>
        <span>${meta.icon} ${esc(meta.label)}</span></label>
      <button type="button" class="btn small width-toggle" data-dash="wide" data-i="${i}" title="Breite umschalten">${w.wide ? '▭ Voll' : '◧ Halb'}</button>
      <button type="button" class="btn ghost icon" data-dash="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Nach oben">↑</button>
      <button type="button" class="btn ghost icon" data-dash="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} title="Nach unten">↓</button>
    </li>`;
  }).join('')}</ul>`;
}

function dashStatsHTML(cfg) {
  return STAT_TILES.map((t) => `
    <label class="check-row"><input type="checkbox" data-stat="${t.id}" ${cfg.stats.includes(t.id) ? 'checked' : ''}> ${esc(t.label)}</label>`).join('');
}

/** Gemeinsame Logik für Dialog und Einstellungen: wendet eine Bedienung auf eine Konfiguration an. */
function applyDashEdit(cfg, el) {
  const ws = cfg.widgets;
  const i = Number(el.dataset.i);
  switch (el.dataset.dash) {
    case 'up': if (i > 0) [ws[i - 1], ws[i]] = [ws[i], ws[i - 1]]; break;
    case 'down': if (i < ws.length - 1) [ws[i + 1], ws[i]] = [ws[i], ws[i + 1]]; break;
    case 'wide': ws[i].wide = !ws[i].wide; break;
    case 'reset': return defaultDashboardConfig();
  }
  if (el.dataset.widget) ws.find((w) => w.id === el.dataset.widget).visible = el.checked;
  if (el.dataset.stat) cfg.stats = STAT_TILES.map((t) => t.id).filter((id) => (id === el.dataset.stat ? el.checked : cfg.stats.includes(id)));
  return cfg;
}

function renderBanner({ stale, streak, thisWeek, goalMin, active }) {
  const critical = stale.find((x) => x.s.health === 'kritisch');
  if (critical) return staleBanner(critical.p, critical.s);
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

function weekList() {
  const weeks = [];
  for (let i = -11; i <= 0; i++) {
    const start = addDays(startOfWeek(new Date()), i * 7);
    weeks.push({ i, start, label: `${pad(start.getDate())}.${pad(start.getMonth() + 1)}.`, current: i === 0,
      range: `${fmtDate(toISO(start))} – ${fmtDate(toISO(addDays(start, 6)))}` });
  }
  return weeks;
}

/** Stunden pro Woche für ein einzelnes Projekt (eine Reihe, in der Projektfarbe). */
function weekBars(pid) {
  const p = getProject(pid);
  const weeks = weekList().map((w) => ({ ...w, min: weekMinutes(w.i, pid) }));
  const max = Math.max(60, ...weeks.map((w) => w.min));
  return `<div class="bars">${weeks.map((w) => `
    <div class="bar ${w.current ? 'current' : ''}" tabindex="0" data-tip="${esc(`<b>${w.current ? 'Diese Woche' : `Woche ab ${w.label}`}</b><br>${fmtDuration(w.min)}`)}">
      <span style="height:${(w.min / max) * 85}%;background:${esc(p?.color || 'var(--primary)')}"></span><small>${w.current ? 'jetzt' : w.label.slice(0, 3)}</small>
    </div>`).join('')}</div>`;
}

/** Stunden pro Woche über alle Projekte – gestapelt, jedes Projekt in seiner Farbe. */
function stackedWeekBars() {
  const weeks = weekList();
  const projects = data.projects
    .map((p) => ({ p, per: weeks.map((w) => weekMinutes(w.i, p.id)) }))
    .map((x) => ({ ...x, total: sum(x.per, (m) => m) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total); // feste Stapel-Reihenfolge: größtes Projekt unten
  if (!projects.length) return '<div class="empty">In den letzten 12 Wochen wurde noch keine Zeit erfasst.</div>';
  const totals = weeks.map((_, wi) => sum(projects, (x) => x.per[wi]));
  const max = Math.max(60, ...totals);
  const scaleH = Math.ceil(max / 60);

  const tip = (w, wi) => `<b>${w.current ? 'Diese Woche' : `Woche ${w.range}`}</b><br>`
    + projects.filter((x) => x.per[wi]).map((x) => `<span class="tip-row"><span class="dot-color" style="background:${esc(x.p.color)}"></span>${esc(x.p.name)}<b>${fmtDuration(x.per[wi])}</b></span>`).join('')
    + `<span class="tip-row tip-total">Gesamt<b>${fmtDuration(totals[wi])}</b></span>`;

  return `
    <div class="stack-chart" role="img" aria-label="Stunden pro Woche nach Projekt, letzte 12 Wochen">
      <div class="stack-scale small muted"><span>${scaleH} Std</span><span>0</span></div>
      <div class="bars stacked">${weeks.map((w, wi) => `
        <div class="bar ${w.current ? 'current' : ''}" tabindex="0" data-tip="${esc(totals[wi] ? tip(w, wi) : `<b>${w.current ? 'Diese Woche' : `Woche ${w.range}`}</b><br>keine Zeit erfasst`)}">
          <div class="stack" style="height:calc((100% - 22px) * ${(totals[wi] / (scaleH * 60)).toFixed(4)})">
            ${projects.filter((x) => x.per[wi]).map((x) => `<span style="flex-grow:${x.per[wi]};background:${esc(x.p.color)}"></span>`).join('')}
          </div>
          <small>${w.current ? 'jetzt' : w.label.slice(0, 3)}</small>
        </div>`).join('')}
      </div>
    </div>
    <ul class="chart-legend">${projects.map((x) => `
      <li><span class="dot-color" style="background:${esc(x.p.color)}"></span><span class="name">${esc(x.p.name)}</span><span class="val">${fmtHours(x.total)}</span></li>`).join('')}
    </ul>
    <details class="chart-table">
      <summary class="small muted">Als Tabelle anzeigen</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Woche ab</th>${projects.map((x) => `<th class="num">${esc(x.p.name)}</th>`).join('')}<th class="num">Gesamt</th></tr></thead>
        <tbody>${weeks.map((w, wi) => `<tr><td>${w.current ? 'diese Woche' : w.label}</td>${projects.map((x) => `<td class="num">${x.per[wi] ? fmtHours(x.per[wi]) : '–'}</td>`).join('')}<td class="num"><b>${fmtHours(totals[wi])}</b></td></tr>`).join('')}</tbody>
      </table></div>
    </details>`;
}

/* Hinweis-Fenster für Diagramme (Maus: Überfahren, Touch/Tastatur: Antippen/Fokus) */
const chartTip = document.createElement('div');
chartTip.className = 'chart-tip';
chartTip.hidden = true;
document.body.appendChild(chartTip);
let tipTarget = null;
function showTip(el) {
  tipTarget = el;
  chartTip.innerHTML = el.dataset.tip;
  chartTip.hidden = false;
  const r = el.getBoundingClientRect(), t = chartTip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
  const top = r.top - t.height - 8 > 8 ? r.top - t.height - 8 : r.bottom + 8;
  chartTip.style.left = `${left}px`;
  chartTip.style.top = `${top}px`;
  document.querySelectorAll('.bar.tip-active').forEach((b) => b.classList.remove('tip-active'));
  el.classList.add('tip-active');
}
function hideTip() {
  chartTip.hidden = true;
  tipTarget?.classList.remove('tip-active');
  tipTarget = null;
}
// Maus: Überfahren zeigt den Hinweis. Finger: Antippen schaltet ihn um (kein Doppel-Auslösen durch emulierte Mausereignisse).
let lastPointer = 'mouse';
document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);
document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const el = e.target.closest?.('[data-tip]'); if (el && el !== tipTarget) showTip(el); });
document.addEventListener('pointerout', (e) => { if (e.pointerType !== 'mouse') return; const el = e.target.closest?.('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('keyup', (e) => { if (e.key === 'Tab') { const el = document.activeElement?.closest?.('[data-tip]'); if (el) showTip(el); } });
document.addEventListener('focusout', (e) => { if (lastPointer !== 'touch' && e.target.closest?.('[data-tip]')) hideTip(); });
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-tip]');
  if (el) {
    if (lastPointer === 'mouse') showTip(el);
    else if (el === tipTarget && !chartTip.hidden) hideTip();
    else showTip(el);
  } else if (!e.target.closest('.chart-tip')) hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });

/* ---------------------------- Listeneinträge ----------------------------- */

/** Aufgabe mit Unterpunkten ist genau dann fertig, wenn alle Unterpunkte abgehakt sind. */
function syncTaskDone(t) {
  const subs = t.subtasks || [];
  if (!subs.length) return null;
  const all = subs.every((st) => st.done);
  if (all && !t.done) { t.done = true; t.doneAt = todayISO(); return 'completed'; }
  if (!all && t.done) { t.done = false; t.doneAt = null; return 'reopened'; }
  return null;
}

function celebrateTask(t) {
  const left = data.tasks.filter((x) => x.projectId === t.projectId && !x.done).length;
  toast(`${pick(CHEERS)} ${left ? `Noch ${left} offen.` : 'Alle Aufgaben erledigt!'}`);
  if (!left) confetti();
}

function taskItem(t, { showProject = false } = {}) {
  const p = getProject(t.projectId);
  const ms = t.milestoneId ? data.milestones.find((m) => m.id === t.milestoneId) : null;
  const subs = t.subtasks || [];
  const subsDone = subs.filter((st) => st.done).length;
  const partial = subs.length && !t.done && subsDone > 0;
  return `<li class="${t.done ? 'done' : ''} task">
    <button class="check ${partial ? 'partial' : ''}" data-action="toggleTask" data-id="${t.id}"
      title="${t.done ? 'Wieder öffnen' : subs.length ? `${subsDone} von ${subs.length} Unterpunkten erledigt` : 'Erledigt'}">${t.done ? '✓' : partial ? '–' : ''}</button>
    <div class="grow">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        ${subs.length ? `<span class="badge ${subsDone === subs.length ? 'aktiv' : ''}">☑ ${subsDone}/${subs.length}</span>` : ''}
        ${showProject && p ? `<span><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}/aufgaben">${esc(p.name)}</a></span>` : ''}
        <span class="badge ${t.priority}">${prioLabel(t.priority)}</span>
        ${t.done ? `<span>erledigt ${fmtRelative(t.doneAt)}</span>` : dueBadge(t.dueDate)}
        ${ms ? `<span>🏁 ${esc(ms.title)}</span>` : ''}
        ${t.notes ? `<span>${esc(t.notes)}</span>` : ''}
      </div>
      ${subs.length ? `<ul class="subtasks">${subs.map((st) => `
        <li class="${st.done ? 'done' : ''}">
          <button class="check small ${st.done ? 'done' : ''}" data-action="toggleSubtask" data-id="${t.id}" data-sub="${st.id}" title="${st.done ? 'Wieder öffnen' : 'Erledigt'}">${st.done ? '✓' : ''}</button>
          <span>${esc(st.title)}</span>
        </li>`).join('')}</ul>` : ''}
      ${t.done || showProject ? '' : `<button class="btn ghost small add-sub" data-action="addSubtask" data-id="${t.id}">+ Unterpunkt</button>`}
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
    ${list.length ? `<div class="project-grid">${list.map(({ p, s }) => projectCard(p, s)).join('')}</div>`
      : `<div class="card empty">Keine Projekte in dieser Ansicht.<br><br><button class="btn primary" data-action="newProject">+ Neues Projekt</button></div>`}`;
}

function projectCard(p, s) {
  return `<a class="project-card" href="#/projekt/${p.id}" style="--pc:${esc(p.color)}">
        <div class="row"><h3>${esc(p.name)}</h3><span class="badge ${p.status}">${statusLabel(p.status)}</span></div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        <div>
          <div class="row small muted" style="margin-bottom:4px"><span>Fortschritt</span><span>${s.progress}%</span></div>
          ${progressBar(s.progress, s.progress === 100 ? 'good' : '')}
        </div>
        ${p.status === 'aktiv' && projectWeeklyMin(p) ? `<div>
          <div class="row small muted" style="margin-bottom:4px"><span>Diese Woche</span><span>${fmtHours(weekMinutes(0, p.id))} / ${fmtStd(projectWeeklyMin(p) / 60)}</span></div>
          ${progressBar((weekMinutes(0, p.id) / projectWeeklyMin(p)) * 100, weekMinutes(0, p.id) >= projectWeeklyMin(p) ? 'good' : '')}
        </div>` : ''}
        <div class="figures">
          <span>⏱ <b>${fmtHours(s.minutes)}</b></span>
          <span>💶 <b>${fmtEUR(s.invested)}</b></span>
          <span>✅ <b>${s.tasksDone}/${s.tasksTotal}</b></span>
          <span>🏁 <b>${s.msDone}/${s.msTotal}</b></span>
        </div>
        ${s.next && p.status !== 'abgeschlossen' ? `<div class="next">👉 ${esc(s.next.title)}</div>` : ''}
        ${healthBadge(s)}
      </a>`;
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
          ? `<button class="btn primary" data-action="stopTimer">■ ${data.timer.mode === 'pomodoro' ? 'Pomodoro beenden' : 'Timer stoppen'}</button>`
          : `<button class="btn primary" data-action="startPomodoro" data-id="${p.id}" title="${pomoCfg().work} Min Fokus, dann Pause">🍅 Pomodoro</button>
             <button class="btn" data-action="startTimer" data-id="${p.id}" title="Stoppuhr ohne feste Dauer">▶ Stoppuhr</button>`}
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
    ${s.health === 'warn' || s.health === 'kritisch' ? staleBanner(p, s, { withOpen: false }) : ''}
    ${p.why || p.goal ? `<div class="card" style="margin-bottom:16px">
      ${p.why ? `<h3>💭 Warum ist mir das wichtig?</h3><p class="why" style="font-size:1rem">„${esc(p.why)}“</p>` : ''}
      ${p.goal ? `<h3>🎯 Ziel / Wann ist es fertig?</h3><p>${esc(p.goal)}</p>` : ''}
    </div>` : `<div class="callout" style="margin-bottom:16px">💡 Tipp: Trage unter <a href="#" data-action="editProject" data-id="${p.id}">Bearbeiten</a> ein, <b>warum</b> dir das Projekt wichtig ist. Das wird dir angezeigt, wenn das Projekt einzuschlafen droht.</div>`}

    <div class="stats">
      <div class="stat"><div class="label">Fortschritt</div><div class="value">${s.progress}%</div>${progressBar(s.progress, s.progress === 100 ? 'good' : '')}
        <div class="sub">${s.msTotal ? `${s.msDone}/${s.msTotal} Meilensteine` : `${s.tasksDone}/${s.tasksTotal} Aufgaben`}</div></div>
      <div class="stat"><div class="label">Zeit gesamt</div><div class="value">${fmtHours(s.minutes)}</div>
        ${hourGoal ? progressBar((s.minutes / 60 / hourGoal) * 100, s.minutes / 60 > hourGoal ? 'over' : '') + `<div class="sub">von ${hourGoal} Std geplant</div>` : '<div class="sub">keine Gesamtzeit geplant</div>'}</div>
      <div class="stat"><div class="label">Diese Woche</div><div class="value">${fmtHours(weekMinutes(0, p.id))}</div>
        ${projectWeeklyMin(p) ? progressBar((weekMinutes(0, p.id) / projectWeeklyMin(p)) * 100, weekMinutes(0, p.id) >= projectWeeklyMin(p) ? 'good' : '')
          + `<div class="sub">Wochenziel: ${fmtStd(projectWeeklyMin(p) / 60)}${p.status === 'aktiv' ? '' : ' (zählt nur bei aktiven Projekten)'}</div>`
          : '<div class="sub">kein eigenes Wochenziel</div>'}</div>
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
  data.timeEntries.filter((e) => e.projectId === pid).forEach((e) => out.push({ date: e.date, icon: '⏱', text: `${fmtDuration(e.minutes)} – ${e.title || autoTimeTitle(e.date)}` }));
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
    ${open.length ? PRIORITIES.map(({ value, label }) => {
      const group = open.filter((t) => (t.priority || 'mittel') === value);
      return group.length ? `<h3 class="task-group"><span class="badge ${value}">${label}</span> <span class="muted small">${group.length}</span></h3>
        <ul class="list">${group.map((t) => taskItem(t)).join('')}</ul>` : '';
    }).join('') : '<div class="empty">Keine offenen Aufgaben. 🎉</div>'}
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
        <div class="grow">
          <div class="title">${esc(e.title || autoTimeTitle(e.date))}</div>
          <div class="meta"><span class="amount">⏱ ${fmtDuration(e.minutes)}</span>${e.autoTitle ? '' : `<span>${esc(autoTimeTitle(e.date))}</span>`}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>
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

function renderAppearanceSettings() {
  const set = data.settings;
  const theme = set.theme || 'system';
  const accent = (set.accent || '#4f46e5').toLowerCase();
  const isPreset = ACCENTS.some(([c]) => c === accent);
  return `
    <div class="form" style="padding:0">
      <div>
        <div class="field-label">Hintergrund</div>
        <div class="segmented" role="radiogroup" aria-label="Hintergrund">
          ${THEMES.map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" data-theme-opt ${v === theme ? 'checked' : ''}>${l}</label>`).join('')}
        </div>
        <div class="hint" style="margin-top:6px">„Wie Gerät“ folgt automatisch dem Hell-/Dunkelmodus deines iPhones, iPads, Macs oder PCs.</div>
      </div>
      <div>
        <div class="field-label">Akzentfarbe</div>
        <div class="swatches">
          ${ACCENTS.map(([c, name]) => `<button type="button" class="swatch ${c === accent ? 'active' : ''}" style="background:${c}" data-accent="${c}" title="${name}" aria-label="${name}"></button>`).join('')}
          <label class="swatch-custom ${isPreset ? '' : 'active'}">
            <input type="color" id="accent-custom" value="${esc(accent)}" aria-label="Eigene Farbe"> Eigene Farbe
          </label>
        </div>
      </div>
      <div>
        <div class="field-label">Vorschau</div>
        <div class="theme-preview">
          <button type="button" class="btn primary small">Primärer Knopf</button>
          <span class="badge abgeschlossen">Abgeschlossen</span>
          <a href="#/einstellungen">Link</a>
          <div style="width:120px">${progressBar(65)}</div>
          <span class="chip active">Filter</span>
        </div>
      </div>
    </div>`;
}

function renderReminderSettings() {
  const set = data.settings;
  const texts = Array.isArray(set.reminderTexts) && set.reminderTexts.length ? set.reminderTexts : DEFAULT_REMINDERS;
  return `
    <p class="small muted">Diese Hinweise erscheinen auf der Übersicht und im Projekt, wenn ein aktives Projekt zu lange ruht.
    Pro Projekt kannst du unter <i>Bearbeiten</i> zusätzlich einen eigenen Text und eine eigene Anzahl Tage festlegen.</p>
    <div class="grid-2">
      <form class="form" style="padding:0" data-form="reminders">
        <label>Projekt gilt als „eingeschlafen“ nach … Tagen ohne Aktivität
          <input type="number" min="1" step="1" name="staleDays" value="${esc(set.staleDays)}">
          <span class="hint">Ab dem doppelten Wert wird das Projekt rot markiert und oben auf der Übersicht angezeigt.</span>
        </label>
        <label>Deine Erinnerungstexte – ein Text pro Zeile
          <textarea name="reminderTexts" class="autogrow" rows="4">${esc(texts.join('\n'))}</textarea>
          <span class="hint">Bei mehreren Texten wechselt die Erinnerung jeden Tag.</span>
        </label>
        <div class="placeholders">
          <span class="hint">Platzhalter antippen zum Einfügen:</span>
          ${PLACEHOLDERS.map(([k, d]) => `<button type="button" class="chip" data-insert="${k}" title="${esc(d)}">${k} <span class="muted">${esc(d)}</span></button>`).join('')}
        </div>
        <label class="check-row"><input type="checkbox" name="reminderShowWhy" ${set.reminderShowWhy !== false ? 'checked' : ''}> Mein „Warum“ unter der Erinnerung anzeigen</label>
        <label class="check-row"><input type="checkbox" name="reminderShowNext" ${set.reminderShowNext !== false ? 'checked' : ''}> Nächsten Schritt anzeigen</label>
        <label>Minuten im Knopf „Nur … Minuten“
          <input type="number" min="1" max="240" step="1" name="reminderMinutes" value="${esc(set.reminderMinutes || 25)}">
        </label>
        <div class="form-actions">
          <button type="button" class="btn" data-action="resetReminders">Standardtexte</button>
          <button class="btn primary" type="submit">Speichern</button>
        </div>
      </form>
      <div>
        <h3>Vorschau</h3>
        <div id="reminder-preview">${reminderPreview(texts, set)}</div>
      </div>
    </div>`;
}

function previewProject() {
  const active = data.projects.filter((p) => p.status === 'aktiv').map((p) => ({ p, s: projectStats(p) }));
  active.sort((a, b) => b.s.idle - a.s.idle);
  if (active.length) return { ...active[0], s: { ...active[0].s, idle: Math.max(active[0].s.idle, 14) } };
  return { p: { id: 'preview', name: 'Mein Projekt', why: 'Weil es mir Freude macht.', goal: 'Fertig und veröffentlicht' },
    s: { idle: 14, minutes: 600, next: { title: 'Erste Skizze machen' } } };
}

function reminderPreview(texts, set) {
  const { p, s } = previewProject();
  const min = Number(set.reminderMinutes) || 25;
  const lines = texts.length ? texts : DEFAULT_REMINDERS;
  return `<p class="small muted">Beispiel mit „${esc(p.name)}“ nach ${s.idle} Tagen:</p>
    <ul class="list">${lines.map((tpl) => {
      const showWhy = set.reminderShowWhy !== false && p.why && !/\{warum\}/i.test(tpl);
      const showNext = set.reminderShowNext !== false && !/\{schritt\}/i.test(tpl);
      return `<li><div class="grow">
        <div class="title">😴 ${esc(fillReminder(tpl, p, s))}</div>
        ${showWhy ? `<div class="small why">Dein Warum: „${esc(p.why)}“</div>` : ''}
        ${showNext && s.next ? `<div class="small muted">Kleinster nächster Schritt: ${esc(s.next.title)}</div>` : ''}
      </div></li>`;
    }).join('')}</ul>
    <p class="small muted">Knopf: <span class="badge">▶ Nur ${min} Minuten</span></p>`;
}

function readReminderForm(form) {
  const fd = new FormData(form);
  return {
    staleDays: Math.max(1, Math.round(Number(fd.get('staleDays')) || 7)),
    reminderTexts: splitLines(fd.get('reminderTexts')),
    reminderShowWhy: fd.get('reminderShowWhy') === 'on',
    reminderShowNext: fd.get('reminderShowNext') === 'on',
    reminderMinutes: Math.min(240, Math.max(1, Math.round(Number(fd.get('reminderMinutes')) || 25))),
  };
}

/* Einklappbare Abschnitte der Einstellungen – offener Zustand wird pro Gerät gemerkt. */
const SECTIONS_KEY = 'projekttracker.ui.openSections';
let openSections = new Set();
try { openSections = new Set(JSON.parse(localStorage.getItem(SECTIONS_KEY) || '[]')); } catch { /* ignorieren */ }
function rememberSections() {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...openSections])); } catch { /* ignorieren */ }
}

function settingsSection(id, icon, title, summary, body) {
  return `<details class="card settings-section" data-section="${id}" ${openSections.has(id) ? 'open' : ''}>
    <summary>
      <span class="sec-icon">${icon}</span>
      <span class="sec-text"><span class="sec-title">${title}</span><span class="sec-summary">${summary}</span></span>
      <span class="sec-chev" aria-hidden="true">›</span>
    </summary>
    <div class="sec-body">${body}</div>
  </details>`;
}

function weeklyGoalSummary() {
  const g = weeklyGoal();
  if (!g.minutes) return 'kein Ziel festgelegt';
  return g.source === 'projects'
    ? `${fmtStd(g.minutes / 60)} pro Woche · Summe aus ${g.projects.length} ${g.projects.length === 1 ? 'Projekt' : 'Projekten'}`
    : `${fmtStd(g.minutes / 60)} pro Woche · Standard`;
}

function renderWeeklyGoalSettings() {
  const g = weeklyGoal();
  const set = data.settings;
  const active = data.projects.filter((p) => p.status === 'aktiv');
  return `
    <p class="small muted">Du kannst bei jedem Projekt unter <i>Bearbeiten</i> eine <b>Wochenarbeitszeit</b> eintragen.
    Dann ist dein Wochenziel die <b>Summe der Wochenzeiten aller aktiven Projekte</b>. Hat kein aktives Projekt eine Wochenzeit, gilt das Standard-Wochenziel.</p>
    ${active.length ? `<ul class="list weekly-list">${active.map((p) => `
      <li>
        <span class="dot-color" style="background:${esc(p.color)}"></span>
        <div class="grow"><a href="#/projekt/${p.id}">${esc(p.name)}</a></div>
        <span class="amount ${projectWeeklyMin(p) ? '' : 'muted'}">${projectWeeklyMin(p) ? fmtStd(projectWeeklyMin(p) / 60) : '–'}</span>
        <button class="btn ghost icon" data-action="editProject" data-id="${p.id}" title="Wochenzeit bearbeiten">✎</button>
      </li>`).join('')}
      <li class="weekly-total"><div class="grow"><b>Wochenziel gesamt</b>
        <div class="small muted">${g.source === 'projects' ? 'Summe der Projekt-Wochenzeiten' : 'kein Projekt hat eine Wochenzeit – Standard gilt'}</div></div>
        <span class="amount">${g.minutes ? fmtStd(g.minutes / 60) : '–'}</span><span style="width:40px"></span></li>
    </ul>` : '<p class="small muted">Noch keine aktiven Projekte.</p>'}
    <form class="form" style="padding:0;margin-top:16px" data-form="settings">
      <label>Standard-Wochenziel (Stunden für alle Projekte)
        <input type="number" min="0" step="0.5" name="weeklyHoursGoal" value="${esc(set.weeklyHoursGoal)}">
        <span class="hint">${g.source === 'projects'
          ? '⚠️ Wird gerade nicht verwendet, weil Projekte eigene Wochenzeiten haben.'
          : 'Gilt, solange kein aktives Projekt eine eigene Wochenarbeitszeit hat.'}</span>
      </label>
      <div class="form-actions"><button class="btn primary" type="submit">Speichern</button></div>
    </form>`;
}

const SECTION_IDS = ['darstellung', 'uebersicht', 'wochenziel', 'pomodoro', 'erinnerungen', 'sicherung', 'sync'];

function renderPomodoroSettings() {
  const st = data.settings, cfg = pomoCfg();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '✔ Mitteilungen sind erlaubt.', denied: '✖ Mitteilungen sind im Browser blockiert – du kannst sie in den Website-Einstellungen des Browsers wieder erlauben.',
    default: 'Mitteilungen wurden noch nicht erlaubt.', unsupported: 'Dieser Browser unterstützt hier keine Mitteilungen. Auf dem iPhone/iPad funktionieren sie nur, wenn der Tracker über den Home-Bildschirm geöffnet wird.' }[perm];
  return `
    <p class="small muted">Arbeite in festen Fokus-Abschnitten mit Pausen dazwischen. Starte einen Pomodoro auf der Projektseite über <b>🍅 Pomodoro</b>.
    Nach einer Pause startet der nächste Pomodoro erst auf Knopfdruck – so zählt nur echte Fokuszeit. Beim Beenden wird die gesammelte Fokuszeit als Zeiteintrag gespeichert.</p>
    <form class="form" style="padding:0" data-form="pomodoro" novalidate>
      <div class="row2">
        <label>Fokus (Minuten)<input type="number" min="1" max="180" step="1" name="pomoWork" value="${cfg.work}"></label>
        <label>Kurze Pause (Minuten)<input type="number" min="1" max="60" step="1" name="pomoShort" value="${cfg.short}"></label>
      </div>
      <div class="row2">
        <label>Lange Pause (Minuten)<input type="number" min="1" max="120" step="1" name="pomoLong" value="${cfg.long}"></label>
        <label>Lange Pause nach … Pomodoros<input type="number" min="1" max="12" step="1" name="pomoEvery" value="${cfg.every}"></label>
      </div>
      <label class="check-row"><input type="checkbox" name="pomoSound" ${st.pomoSound !== false ? 'checked' : ''}> Ton am Ende von Fokus und Pause</label>
      <label class="check-row"><input type="checkbox" name="pomoNotify" ${st.pomoNotify !== false ? 'checked' : ''}> Mitteilung anzeigen, wenn der Tracker im Hintergrund ist</label>
      <div class="hint">${permText}
        ${perm === 'default' ? ' <button type="button" class="btn small" data-action="askNotify">Mitteilungen erlauben</button>' : ''}</div>
      <div class="hint">Hinweis: Auf iPhone und iPad hält Safari Webseiten im Hintergrund an. Das Signal kommt dort, sobald du den Tracker wieder öffnest – die Zeit stimmt trotzdem.</div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="testChime">🔔 Ton testen</button>
        <button class="btn primary" type="submit">Speichern</button>
      </div>
    </form>`;
}

function renderSyncGuide() {
  const svc = syncService();
  return `<div class="help">
    <p>Die Regel ist einfach: <b>Beim Aufhören sichern (💾), beim Anfangen importieren.</b>
    Der Tracker erinnert dich daran: mit der gelben Leiste bei ungesicherten Änderungen, mit der blauen Leiste,
    wenn du ein Gerät länger nicht benutzt hast, und am Computer zusätzlich mit einer Rückfrage beim Schließen.</p>

    <div class="field-label">Welchen Dienst nutzt du?</div>
    <div class="segmented" role="radiogroup" aria-label="Dienst">
      ${SYNC_SERVICES.map((x) => `<label><input type="radio" name="syncService" value="${x.id}" data-sync-opt ${x.id === svc.id ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}
    </div>

    <p class="small muted" style="margin-top:12px">${svc.cloud
      ? `Stelle auf allen Geräten denselben Ordner als Download-Ordner ein: <b>${esc(svc.folder)}</b>.
         Dann landet jede Sicherung automatisch dort und ist auf deinen anderen Geräten verfügbar.
         Beim Import wählst du die neueste Datei – der Dateiname enthält Datum und Uhrzeit.`
      : 'Ohne Cloud-Dienst überträgst du die Sicherungsdatei selbst auf das andere Gerät und importierst sie dort. Der Dateiname enthält Datum und Uhrzeit.'}</p>

    <div class="grid-2 sync-devices">
      ${SYNC_DEVICES.map(([key, label]) => `<div>
        <h3>${label}</h3>
        <ol>${svc.steps[key].map((step) => `<li>${step}</li>`).join('')}</ol>
      </div>`).join('')}
    </div>

    <h3>Gut zu wissen</h3>
    <ul>
      <li><b>iPhone & iPad:</b> Füge den Tracker über <i>Teilen › Zum Home-Bildschirm</i> hinzu und öffne ihn immer darüber.
        Sonst kann Safari die Daten nach 7 Tagen ohne Besuch löschen. Beim Schließen gibt es dort keine Rückfrage – achte auf die gelbe Leiste und den 💾-Knopf.</li>
      <li><b>Chrome oder Edge am Mac:</b> Download-Ordner unter <i>Einstellungen › Downloads › Speicherort</i> festlegen.</li>
      <li><b>Rückfrage beim Schließen:</b> Browser erlauben dort keinen eigenen Text. Bei „Diese Website verlassen?“ wähle „Abbrechen“ bzw. „Bleiben“ und tippe auf 💾 Sichern.</li>
    </ul>
  </div>`;
}

function renderSettings() {
  const set = data.settings;
  const size = new Blob([JSON.stringify(data)]).size;
  const accent = (set.accent || '#4f46e5').toLowerCase();
  const accentName = (ACCENTS.find(([c]) => c === accent) || [, 'Eigene Farbe'])[1];
  const themeName = (THEMES.find(([v]) => v === (set.theme || 'system')) || [, ''])[1].replace(/^\S+\s/, '');
  const dash = dashboardConfig();
  const texts = Array.isArray(set.reminderTexts) && set.reminderTexts.length ? set.reminderTexts : DEFAULT_REMINDERS;
  const allOpen = SECTION_IDS.every((id) => openSections.has(id));

  return `
    <div class="page-head">
      <div><h1>Einstellungen</h1><p>Tippe auf einen Bereich, um ihn auf- oder zuzuklappen.</p></div>
      <button class="btn small" data-action="toggleAllSections">${allOpen ? 'Alle zuklappen' : 'Alle aufklappen'}</button>
    </div>

    ${settingsSection('darstellung', '🎨', 'Darstellung',
      `${esc(themeName)} · <span class="dot-color" style="background:${esc(accent)}"></span> ${esc(accentName)}`,
      renderAppearanceSettings())}

    ${settingsSection('uebersicht', '🧩', 'Übersicht (Dashboard)',
      `${dash.widgets.filter((w) => w.visible).length} von ${dash.widgets.length} Bereichen · ${dash.stats.length} Kennzahlen`,
      `<div data-dash-scope="settings">
        <p class="small muted">Blende Bereiche ein oder aus, ändere die Reihenfolge mit ↑ ↓ und wähle die Breite. Änderungen gelten sofort.
        Zwei aufeinanderfolgende halbe Bereiche stehen nebeneinander und sind gleich hoch. Auf dem Handy stehen alle Bereiche untereinander.</p>
        ${dashListHTML(dash)}
        <h3 style="margin:16px 0 8px">Kennzahlen-Kacheln</h3>
        <div class="stat-picks form" style="padding:0">${dashStatsHTML(dash)}</div>
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn" data-dash="reset">Standard wiederherstellen</button>
          <a class="btn" href="#/">Zur Übersicht</a>
        </div>
      </div>`)}

    ${settingsSection('wochenziel', '🎯', 'Wochenziel', weeklyGoalSummary(), renderWeeklyGoalSettings())}

    ${settingsSection('pomodoro', '🍅', 'Pomodoro-Timer',
      `${pomoCfg().work} Min Fokus · ${pomoCfg().short} / ${pomoCfg().long} Min Pause · lange Pause nach ${pomoCfg().every}`,
      renderPomodoroSettings())}

    ${settingsSection('erinnerungen', '😴', 'Erinnerungen bei eingeschlafenen Projekten',
      `nach ${esc(set.staleDays)} Tagen · ${texts.length} ${texts.length === 1 ? 'Text' : 'Texte'}`,
      renderReminderSettings())}

    ${settingsSection('sicherung', '💾', 'Datensicherung',
      `Letzte Sicherung: ${esc(fmtDateTime(meta.lastExport))} ${hasUnsavedChanges() ? '<span class="badge mittel">nicht gesichert</span>' : ''}`,
      `<p class="small muted">Alle Daten werden nur lokal in diesem Browser gespeichert (${(size / 1024).toFixed(1)} KB).
      Um sie auf deinen anderen Geräten zu nutzen, exportierst du eine Sicherung${syncService().cloud ? ` nach ${esc(syncService().name)}` : ' und überträgst sie'} und importierst sie dort.
      Wie das geht, steht unter „Zwischen Geräten wechseln“.</p>
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
      <button class="btn danger" data-action="resetData">Alle Daten löschen</button>`)}

    ${settingsSection('sync', '🔄', 'Zwischen Geräten wechseln',
      `Anleitung für iCloud, OneDrive, Google Drive, Dropbox · gewählt: ${esc(syncService().name)}`,
      renderSyncGuide())}`;
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
  if (f.type === 'subtasks') {
    return `<div class="field"><div class="field-label">${esc(f.label)}</div>
      <div class="subtasks-editor" data-subtasks="${f.name}">
        <div class="subtask-rows">${(v || []).map(subtaskRowHTML).join('')}</div>
        <button type="button" class="btn small" data-sub-add>+ Unterpunkt</button>
      </div>${hint}</div>`;
  }
  // Freitext wächst beim Tippen nach unten mit (statt seitlich zu scrollen)
  if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.name}" class="autogrow" rows="3" ${req} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  else if ((!f.type || f.type === 'text') && !f.list) input = `<textarea id="${id}" name="${f.name}" class="autogrow single" rows="1" ${req} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  else if (f.type === 'select') input = `<select id="${id}" name="${f.name}" ${req}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  else {
    const type = { decimal: 'text', duration: 'text' }[f.type] || f.type || 'text';
    const extra = f.type === 'decimal' ? 'inputmode="decimal"' : f.type === 'number' ? 'step="any" min="0"' : '';
    input = `<input id="${id}" type="${type}" name="${f.name}" value="${esc(v)}" ${req} ${extra} placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${id}_list"` : ''}>`;
    if (f.list) input += `<datalist id="${id}_list">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  const chips = f.chips?.length ? `<div class="fill-chips">${f.chips.map((c) =>
    `<button type="button" class="chip ${String(c).toLocaleLowerCase('de') === String(v).toLocaleLowerCase('de') ? 'active' : ''}" data-fill="${id}" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
  return `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}${input}${hint}</label>${chips}`;
}

function subtaskRowHTML(st = {}) {
  return `<div class="subtask-row" data-id="${esc(st.id || '')}">
    <input type="checkbox" ${st.done ? 'checked' : ''} aria-label="Erledigt">
    <textarea class="autogrow single sub-title" rows="1" placeholder="Unterpunkt">${esc(st.title || '')}</textarea>
    <button type="button" class="btn ghost icon danger" data-sub-del title="Entfernen" aria-label="Unterpunkt entfernen">✕</button>
  </div>`;
}

/** Textfeld an seinen Inhalt anpassen. */
function autoGrow(el) {
  if (!el.getClientRects().length) return; // unsichtbar (z. B. geschlossener Dialog)
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + 'px';
}
const growAll = (root = document) => root.querySelectorAll('textarea.autogrow').forEach(autoGrow);

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
      if (f.type === 'subtasks') {
        const before = new Map((f.value || []).map((st) => [st.id, st]));
        values[f.name] = [...form.querySelectorAll(`[data-subtasks="${f.name}"] .subtask-row`)]
          .map((row) => {
            const title = row.querySelector('textarea').value.replace(/\s*\n\s*/g, ' ').trim();
            const done = row.querySelector('input[type=checkbox]').checked;
            const old = before.get(row.dataset.id);
            return { id: row.dataset.id || uid(), title, done, doneAt: done ? (old?.done && old.doneAt) || todayISO() : null };
          })
          .filter((st) => st.title);
        continue;
      }
      let v = fd.get(f.name);
      v = typeof v === 'string' ? v.trim() : v;
      if (typeof v === 'string' && (!f.type || f.type === 'text')) v = v.replace(/\s*\n\s*/g, ' ');
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
    unlockScroll();
  });
  const showError = (msg) => { form.querySelector('.form-error').textContent = msg; };
  form.querySelector('[data-close]').addEventListener('click', () => { dlg.close(); unlockScroll(); });

  // Vorschlags-Chips füllen das zugehörige Feld
  form.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-fill]');
    if (!chip) return;
    const input = form.querySelector('#' + chip.dataset.fill);
    input.value = chip.dataset.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  form.addEventListener('input', (e) => {
    const box = e.target.id && form.querySelector(`.fill-chips [data-fill="${e.target.id}"]`)?.parentElement;
    if (!box) return;
    const val = e.target.value.trim().toLocaleLowerCase('de');
    box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.value.toLocaleLowerCase('de') === val));
  });

  // Unterpunkte-Editor
  form.addEventListener('click', (e) => {
    const add = e.target.closest('[data-sub-add]');
    if (add) {
      const rows = add.parentElement.querySelector('.subtask-rows');
      rows.insertAdjacentHTML('beforeend', subtaskRowHTML());
      rows.lastElementChild.querySelector('textarea').focus();
    }
    const del = e.target.closest('[data-sub-del]');
    if (del) del.closest('.subtask-row').remove();
  });
  // Eingabetaste: in einzeiligen Feldern speichern, in Unterpunkten neuen Unterpunkt anlegen
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.target.matches('textarea.single')) return;
    e.preventDefault();
    if (e.target.classList.contains('sub-title')) {
      const row = e.target.closest('.subtask-row');
      row.insertAdjacentHTML('afterend', subtaskRowHTML());
      row.nextElementSibling.querySelector('textarea').focus();
    } else form.requestSubmit();
  });

  lockScroll();
  dlg.showModal();
  growAll(form);
  // Auf Touch-Geräten nicht automatisch fokussieren – sonst springt die Tastatur auf und verschiebt die Ansicht.
  if (!matchMedia('(hover: none)').matches) form.querySelector('input,textarea,select')?.focus();
  else form.scrollTop = 0;
}

let lockedScrollY = 0;
function lockScroll() {
  if (document.documentElement.classList.contains('modal-open')) return;
  lockedScrollY = window.scrollY;
  document.body.style.top = `-${lockedScrollY}px`;
  document.documentElement.classList.add('modal-open');
}
function unlockScroll() {
  if (!document.documentElement.classList.contains('modal-open')) return;
  document.documentElement.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lockedScrollY);
}
$('#modal').addEventListener('close', unlockScroll);

const projectOptions = () => data.projects
  .filter((p) => p.status !== 'abgeschlossen')
  .map((p) => ({ value: p.id, label: p.name }));

/* ------------------------------------------------------------------------
   Aktionen
   ------------------------------------------------------------------------ */

const actions = {
  newProject() { projectForm(); },
  customizeDashboard() { openDashboardEditor(); },
  askNotify() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(() => render()).catch(() => {});
  },
  testChime() { unlockAudio(); playChime(); if (data.settings.pomoSound === false) toast('Der Ton ist ausgeschaltet.'); },
  toggleAllSections() {
    const allOpen = SECTION_IDS.every((id) => openSections.has(id));
    openSections = new Set(allOpen ? [] : SECTION_IDS);
    rememberSections();
    render();
  },
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
    const subs = t.subtasks || [];
    if (subs.length) {
      if (t.done) return toast('Um die Aufgabe wieder zu öffnen, entferne den Haken bei einem Unterpunkt.');
      const open = subs.filter((st) => !st.done);
      if (!confirm(`Die Aufgabe ist erst fertig, wenn alle Unterpunkte erledigt sind.\n\nAlle ${open.length} offenen Unterpunkte jetzt abhaken?`)) return;
      open.forEach((st) => { st.done = true; st.doneAt = todayISO(); });
      syncTaskDone(t);
      commit();
      return celebrateTask(t);
    }
    t.done = !t.done;
    t.doneAt = t.done ? todayISO() : null;
    commit();
    if (t.done) celebrateTask(t);
  },
  toggleSubtask({ id, sub }) {
    const t = data.tasks.find((x) => x.id === id);
    const st = t?.subtasks?.find((x) => x.id === sub);
    if (!st) return;
    st.done = !st.done;
    st.doneAt = st.done ? todayISO() : null;
    const change = syncTaskDone(t);
    commit();
    if (change === 'completed') celebrateTask(t);
    else if (change === 'reopened') toast('Aufgabe wieder geöffnet');
  },
  addSubtask({ id }) {
    const t = data.tasks.find((x) => x.id === id);
    openForm({
      title: `Unterpunkt zu „${t.title}“`,
      submitLabel: 'Hinzufügen',
      fields: [{ name: 'title', label: 'Unterpunkt', required: true, placeholder: 'Was gehört dazu?' }],
      onSubmit(v) {
        (t.subtasks ||= []).push({ id: uid(), title: v.title, done: false, doneAt: null });
        syncTaskDone(t);
        commit();
      },
    });
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
    if (t.mode === 'pomodoro') {
      const focus = pomoFocusMs(t);
      const minutes = Math.max(1, Math.round(focus / 60000));
      const title = t.count ? `${t.count} × Pomodoro` : 'Pomodoro';
      return timeForm({ projectId: t.projectId, minutes, date: toISO(new Date(t.start)), title,
        description: t.count ? `${t.count} Pomodoro${t.count === 1 ? '' : 's'} à ${pomoCfg().work} Min` : '' }, { fromTimer: true });
    }
    const minutes = Math.max(1, Math.round((Date.now() - t.start) / 60000));
    timeForm({ projectId: t.projectId, minutes, date: toISO(new Date(t.start)) }, { fromTimer: true });
  },
  startPomodoro({ id }) {
    if (data.timer && !confirm('Es läuft bereits ein Timer. Diesen verwerfen und einen Pomodoro starten?')) return;
    unlockAudio();
    requestNotifyPermission();
    const now = Date.now();
    data.timer = { projectId: id, start: now, mode: 'pomodoro', phase: 'work', phaseStart: now,
      phaseEnd: now + pomoCfg().work * 60000, count: 0, focusMs: 0, pausedAt: null };
    commit();
    toast(`🍅 Pomodoro für „${getProject(id).name}“ – ${pomoCfg().work} Minuten volle Konzentration!`);
  },
  pomoPause() {
    const t = data.timer;
    if (!t || t.mode !== 'pomodoro' || t.phase === 'ready') return;
    if (t.pausedAt) {
      const delta = Date.now() - t.pausedAt;
      t.phaseStart += delta; t.phaseEnd += delta; t.pausedAt = null;
    } else t.pausedAt = Date.now();
    save(); renderTimer(true);
  },
  pomoNext() {
    const t = data.timer;
    if (!t || t.mode !== 'pomodoro') return;
    unlockAudio();
    const now = Date.now();
    if (t.phase === 'work') {
      // Fokus vorzeitig beenden: bisherige Zeit zählt, dann Pause
      t.focusMs += (t.pausedAt || now) - t.phaseStart;
      startBreak(t, now, false);
    } else {
      Object.assign(t, { phase: 'work', phaseStart: now, phaseEnd: now + pomoCfg().work * 60000, pausedAt: null });
    }
    save(); renderTimer(true);
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
    const svc = syncService();
    toast(`Sicherung exportiert ✔ – sie liegt in deinem Download-Ordner${svc.cloud ? ` (ideal: ${svc.folder})` : ''}.`);
  },
  resetReminders() {
    const ta = document.querySelector('[data-form="reminders"] textarea[name="reminderTexts"]');
    if (!ta) return;
    ta.value = DEFAULT_REMINDERS.join('\n');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    toast('Standardtexte eingesetzt – zum Übernehmen „Speichern“ tippen.');
  },
  dismissSyncHint() {
    syncHintDismissed = true;
    renderBackupBar();
  },
  exportCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const name = (pid) => getProject(pid)?.name || '';
    const rows = [['Typ', 'Datum', 'Projekt', 'Titel', 'Beschreibung', 'Kategorie', 'Minuten', 'Stunden', 'Betrag (EUR)'].map(q).join(';')];
    data.timeEntries.forEach((e) => rows.push(['Zeit', e.date, name(e.projectId), e.title, e.description, '', e.minutes, (e.minutes / 60).toFixed(2).replace('.', ','), ''].map(q).join(';')));
    data.investments.forEach((e) => rows.push(['Investition', e.date, name(e.projectId), e.description, '', e.category, '', '', String(e.amount.toFixed(2)).replace('.', ',')].map(q).join(';')));
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

const decimalValue = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

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
      { name: 'reminderText', label: 'Eigene Erinnerung, wenn das Projekt einschläft', type: 'textarea', value: p.reminderText,
        placeholder: 'z. B. {tage} Tage ohne „{projekt}“? Deine Kunden warten!',
        hint: 'Leer = allgemeine Texte aus den Einstellungen. Platzhalter: {projekt}, {tage}, {warum}, {schritt}, {ziel}, {stunden}. Mehrere Zeilen = wechselt täglich.' },
      { name: 'staleDays', label: 'Erinnern nach … Tagen ohne Aktivität', type: 'number', value: p.staleDays,
        placeholder: `Standard: ${data.settings.staleDays}`, hint: 'Leer = Standard aus den Einstellungen.' },
      { name: 'weeklyHours', label: 'Wochenarbeitszeit (Std)', type: 'decimal', value: decimalValue(p.weeklyHours), half: true,
        placeholder: 'z. B. 4 oder 2,5', hint: 'Leer = kein eigenes Wochenziel' },
      { name: 'hourGoal', label: 'Geplante Gesamtzeit (Std)', type: 'decimal', value: decimalValue(p.hourGoal), half: true, hint: 'für das ganze Projekt' },
      { name: 'budget', label: 'Budget (€)', type: 'decimal', value: decimalValue(p.budget), half: true },
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
  fields.push({ name: 'subtasks', label: 'Unterpunkte', type: 'subtasks', value: t.subtasks || [],
    hint: 'Die Aufgabe ist erst fertig, wenn alle Unterpunkte abgehakt sind. Eingabetaste = nächster Unterpunkt.' });
  fields.push({ name: 'notes', label: 'Notiz', type: 'textarea', value: t.notes });
  openForm({
    title: isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten',
    fields,
    onSubmit(v) {
      v.milestoneId = v.milestoneId || null;
      let task = t;
      if (isNew) { task = { id: uid(), projectId: pid, done: false, doneAt: null, createdAt: new Date().toISOString(), ...v }; data.tasks.push(task); }
      else Object.assign(t, v);
      const change = syncTaskDone(task);
      commit();
      if (change === 'completed') celebrateTask(task);
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
      { name: 'title', label: 'Titel', value: e.autoTitle ? '' : e.title,
        placeholder: autoTimeTitle(e.date || todayISO()), hint: 'Leer lassen = Wochentag und Datum werden als Titel verwendet.' },
      { name: 'description', label: 'Beschreibung', type: 'textarea', value: e.description,
        placeholder: 'Was hast du gemacht? Details, Ergebnisse, offene Punkte …' },
    ],
    submitLabel: 'Speichern',
    onSubmit(v) {
      v.autoTitle = !v.title;
      if (v.autoTitle) v.title = autoTimeTitle(v.date);
      if (isNew) data.timeEntries.push({ id: uid(), ...v });
      else Object.assign(e, v);
      if (fromTimer) data.timer = null;
      commit();
      if (isNew) toast(`⏱ ${fmtDuration(v.minutes)} gespeichert. ${pick(CHEERS)}`);
    },
  });
  // Platzhalter des Titels folgt dem gewählten Datum
  const dateInput = $('#f_date'), titleInput = $('#f_title');
  dateInput.addEventListener('input', () => { titleInput.placeholder = autoTimeTitle(dateInput.value); });
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
      { name: 'category', label: 'Kategorie', value: e.category || '', list: investmentCategories(), chips: investmentCategories(),
        placeholder: 'z. B. Werkzeug, Messe …', hint: 'Eigenen Namen eintippen oder einen Vorschlag antippen. Leer = „Sonstiges“.' },
    ],
    onSubmit(v) {
      if (v.amount == null) return 'Bitte einen Betrag angeben.';
      v.category = normalizeCategory(v.category);
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

/* ---------------------------- Pomodoro ----------------------------------- */

function pomoCfg() {
  const st = data.settings;
  const n = (v, d, max) => Math.min(max, Math.max(1, Math.round(Number(v) || d)));
  return { work: n(st.pomoWork, 25, 180), short: n(st.pomoShort, 5, 60), long: n(st.pomoLong, 15, 120), every: n(st.pomoEvery, 4, 12) };
}

/** Gesammelte Fokuszeit inkl. des laufenden Fokus-Abschnitts. */
function pomoFocusMs(t) {
  const running = t.phase === 'work' ? Math.max(0, Math.min(t.pausedAt || Date.now(), t.phaseEnd) - t.phaseStart) : 0;
  return (t.focusMs || 0) + running;
}

function startBreak(t, from, completed) {
  const cfg = pomoCfg();
  const long = completed && t.count > 0 && t.count % cfg.every === 0;
  Object.assign(t, { phase: long ? 'long' : 'short', phaseStart: from, phaseEnd: from + (long ? cfg.long : cfg.short) * 60000, pausedAt: null });
}

/** Phasenwechsel anhand der Uhrzeit nachziehen (funktioniert auch nach längerer Abwesenheit). */
function tickPomodoro() {
  const t = data.timer;
  if (!t || t.mode !== 'pomodoro' || t.pausedAt || t.phase === 'ready') return;
  const now = Date.now();
  let signalMsg = null;
  while (t.phase !== 'ready' && now >= t.phaseEnd) {
    if (t.phase === 'work') {
      t.focusMs += t.phaseEnd - t.phaseStart;
      t.count += 1;
      startBreak(t, t.phaseEnd, true);
      signalMsg = t.phase === 'long'
        ? [`🍅 ${t.count} Pomodoros geschafft!`, `Zeit für eine lange Pause (${pomoCfg().long} Min).`]
        : [`🍅 Pomodoro ${t.count} geschafft!`, `Kurze Pause (${pomoCfg().short} Min) – steh auf, trink etwas.`];
    } else {
      Object.assign(t, { phase: 'ready', phaseStart: null, phaseEnd: null });
      signalMsg = ['☕ Pause vorbei', 'Bereit für den nächsten Pomodoro?'];
    }
  }
  if (signalMsg) {
    save();
    renderTimer(true);
    pomoSignal(...signalMsg);
  }
}

let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* kein Audio verfügbar */ }
}
function playChime() {
  if (!audioCtx || data.settings.pomoSound === false) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [880, 1175, 1568].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t0 = audioCtx.currentTime + i * 0.22;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.55);
    });
  } catch { /* ignorieren */ }
}
function requestNotifyPermission() {
  if (data.settings.pomoNotify === false || !('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}
function pomoSignal(title, body) {
  playChime();
  navigator.vibrate?.([200, 100, 200]);
  toast(`${title} ${body}`);
  if (data.settings.pomoNotify !== false && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(title, { body, icon: 'icon-180.png', tag: 'pomodoro' }); } catch { /* ignorieren */ }
  }
}

/* ------------------------------------------------------------------------
   Timer-Anzeige, Toasts, Konfetti, Download
   ------------------------------------------------------------------------ */

const fmtClock = (secs) => {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

function renderTimer(force = false) {
  const el = $('#timer-indicator');
  const t = data.timer;
  if (!t || !getProject(t.projectId)) { el.hidden = true; el.dataset.key = ''; return; }
  const name = getProject(t.projectId).name;
  const pomo = t.mode === 'pomodoro';
  const key = [t.projectId, t.mode, t.phase, !!t.pausedAt].join('|');

  if (force || el.hidden || el.dataset.key !== key) {
    el.className = 'timer-indicator' + (pomo ? ` pomo pomo-${t.phase}${t.pausedAt ? ' paused' : ''}` : '');
    if (!pomo) {
      el.innerHTML = `<span class="dot"></span><span class="t"></span><span class="small name">${esc(name)}</span><button class="btn small" data-action="stopTimer">■ Stopp</button>`;
    } else {
      const label = { work: `🍅 Fokus #${t.count + 1}`, short: '☕ Pause', long: '🌴 Lange Pause', ready: '✅ Pause vorbei' }[t.phase];
      const next = { work: ['⏭', 'Fokus beenden & Pause'], short: ['⏭', 'Pause überspringen'], long: ['⏭', 'Pause überspringen'], ready: ['▶ Weiter', 'Nächsten Pomodoro starten'] }[t.phase];
      el.innerHTML = `<span class="pomo-label small">${label}</span><span class="t"></span><span class="small name">${esc(name)}</span>
        ${t.phase === 'ready' ? '' : `<button class="btn small icon" data-action="pomoPause" title="${t.pausedAt ? 'Fortsetzen' : 'Pausieren'}">${t.pausedAt ? '▶' : '⏸'}</button>`}
        <button class="btn small ${t.phase === 'ready' ? 'primary' : 'icon'}" data-action="pomoNext" title="${next[1]}">${next[0]}</button>
        <button class="btn small icon" data-action="stopTimer" title="Beenden & Zeit speichern">■</button>
        <span class="pomo-bar"><span></span></span>`;
    }
    el.dataset.key = key;
    el.hidden = false;
  }

  let text, title;
  if (!pomo) {
    text = fmtClock((Date.now() - t.start) / 1000);
    title = `⏱ ${text} · ${name}`;
  } else if (t.phase === 'ready') {
    text = `${t.count} 🍅`;
    title = Math.floor(Date.now() / 1000) % 2 ? '✅ Pause vorbei!' : `🍅 ${name}`;
  } else {
    const now = t.pausedAt || Date.now();
    const left = (t.phaseEnd - now) / 1000;
    const total = (t.phaseEnd - t.phaseStart) / 1000;
    text = fmtClock(left);
    title = `${t.phase === 'work' ? '🍅' : '☕'} ${text}${t.pausedAt ? ' ⏸' : ''} · ${name}`;
    el.querySelector('.pomo-bar > span').style.width = `${Math.min(100, (1 - left / total) * 100)}%`;
  }
  el.querySelector('.t').textContent = text;
  document.title = title;
}
setInterval(() => {
  tickPomodoro();
  if (data.timer) renderTimer();
  else if (document.title !== 'Projekttracker') document.title = 'Projekttracker';
}, 1000);
// Beim Zurückkehren zur App sofort nachziehen (Handy pausiert Timer im Hintergrund)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tickPomodoro(); if (data.timer) renderTimer(true); } });

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
  const T = (projectId, minutes, n, title, description = '') => d.timeEntries.push({
    id: uid(), projectId, minutes, date: ago(n), title: title || autoTimeTitle(ago(n)), autoTitle: !title, description });
  const I = (projectId, amount, n, description, category) => d.investments.push({ id: uid(), projectId, amount, date: ago(n), description, category });
  const M = (projectId, title, due, done) => { const id = uid(); d.milestones.push({ id, projectId, title, dueDate: due, done: !!done, doneAt: done || null, createdAt: '' }); return id; };
  const K = (projectId, title, priority, o = {}) => d.tasks.push({ id: uid(), projectId, title, priority, done: false, doneAt: null, createdAt: new Date().toISOString(), subtasks: [], ...o });

  const shop = P({ name: 'Online-Shop für Holzdeko', status: 'aktiv', category: 'Nebenprojekt', color: '#eb6834',
    description: 'Eigene Holzarbeiten über einen kleinen Online-Shop verkaufen.',
    why: 'Ich möchte mir ein zweites Standbein aufbauen und mein Hobby zum Beruf machen.',
    goal: 'Shop ist online und die ersten 10 Bestellungen sind verschickt.', hourGoal: 80, weeklyHours: 4, budget: 600, targetDate: ahead(45) });
  const m1 = M(shop, 'Produktfotos fertig', ago(20), ago(18));
  const m2 = M(shop, 'Shop online', ahead(10));
  M(shop, 'Erste 10 Bestellungen', ahead(45));
  K(shop, 'Versandkosten kalkulieren', 'hoch', { milestoneId: m2, dueDate: ahead(3) });
  K(shop, 'Impressum & Datenschutzerklärung', 'hoch', { milestoneId: m2, subtasks: [
    { id: uid(), title: 'Impressum-Generator ausfüllen', done: true, doneAt: ago(2) },
    { id: uid(), title: 'Datenschutzerklärung erstellen', done: false, doneAt: null },
    { id: uid(), title: 'Beide Seiten im Shop-Footer verlinken', done: false, doneAt: null },
  ] });
  K(shop, 'Produkttexte schreiben', 'mittel', { milestoneId: m2 });
  K(shop, 'Instagram-Account anlegen', 'niedrig');
  K(shop, 'Fotostudio aufbauen', 'mittel', { milestoneId: m1, done: true, doneAt: ago(25) });
  [[90, 1, 'Shop-Theme angepasst'], [60, 2, 'Produkte angelegt'], [45, 4, ''], [120, 6, 'Fotos bearbeitet'], [30, 9, ''], [150, 13, 'Fotoshooting'], [60, 16, ''], [90, 20, ''], [45, 27, 'Recherche Shopsysteme']]
    .forEach(([m, n, title]) => T(shop, m, n, title));
  T(shop, 75, 0, 'Zahlungsanbieter eingerichtet', 'PayPal und Kreditkarte verbunden.\nTestbestellung erfolgreich – Rückerstattung muss noch geprüft werden.');
  I(shop, 89, 30, 'Fotolicht-Set', 'Hardware');
  I(shop, 29, 5, 'Shop-Abo (Monat)', 'Software');
  I(shop, 140, 12, 'Holz & Lack', 'Material');

  const app = P({ name: 'Fitness-App lernen', status: 'aktiv', category: 'Weiterbildung', color: '#2a78d6',
    description: 'Programmieren lernen, indem ich eine eigene kleine Trainings-App baue.',
    why: 'Ich will verstehen, wie Apps funktionieren – und endlich meine eigenen Trainingsdaten auswerten.', hourGoal: 50, weeklyHours: 2 });
  M(app, 'Grundkurs abgeschlossen', ago(35), ago(33));
  M(app, 'Erste Version auf dem Handy', ahead(20));
  K(app, 'Kapitel 7 (Datenbanken) durcharbeiten', 'mittel');
  K(app, 'Datenmodell für Workouts skizzieren', 'hoch');
  [[60, 21, 'Kurs Kapitel 6'], [45, 24, ''], [90, 30, ''], [60, 34, '']].forEach(([m, n, title]) => T(app, m, n, title));
  I(app, 19.99, 40, 'Online-Kurs', 'Weiterbildung');

  const garden = P({ name: 'Hochbeet bauen', status: 'abgeschlossen', category: 'Haus & Garten', color: '#008300', createdAt: ago(80) });
  M(garden, 'Hochbeet steht', ago(50), ago(50));
  T(garden, 240, 52, 'Aufbau'); T(garden, 120, 55, 'Material besorgt');
  I(garden, 185.5, 55, 'Lärchenholz & Schrauben', 'Material');

  P({ name: 'Podcast starten', status: 'idee', category: 'Kreativ', color: '#e87ba4', description: 'Gespräche mit Handwerkern aus der Region.' });

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
  commit();
  toast('Einstellungen gespeichert');
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="pomodoro"]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  Object.assign(data.settings, {
    pomoWork: Number(fd.get('pomoWork')), pomoShort: Number(fd.get('pomoShort')),
    pomoLong: Number(fd.get('pomoLong')), pomoEvery: Number(fd.get('pomoEvery')),
    pomoSound: fd.get('pomoSound') === 'on', pomoNotify: fd.get('pomoNotify') === 'on',
  });
  Object.assign(data.settings, { pomoWork: pomoCfg().work, pomoShort: pomoCfg().short, pomoLong: pomoCfg().long, pomoEvery: pomoCfg().every });
  if (data.settings.pomoNotify) requestNotifyPermission();
  commit();
  toast('Pomodoro-Einstellungen gespeichert');
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="reminders"]');
  if (!form) return;
  e.preventDefault();
  const v = readReminderForm(form);
  if (!v.reminderTexts.length) v.reminderTexts = null; // leer = Standardtexte
  Object.assign(data.settings, v);
  commit();
  toast('Erinnerungen gespeichert');
});

// Dienst für den Gerätewechsel
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-sync-opt]')) return;
  data.settings.syncService = e.target.value;
  commit();
});

// Darstellung: Hell/Dunkel und Akzentfarbe – wird sofort angewendet und gespeichert
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-theme-opt]')) {
    data.settings.theme = e.target.value;
    commit();
  } else if (e.target.id === 'accent-custom') {
    data.settings.accent = e.target.value;
    commit();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'accent-custom') applyTheme({ ...data.settings, accent: e.target.value }); // Live-Vorschau beim Ziehen
});
document.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-accent]');
  if (!sw) return;
  data.settings.accent = sw.dataset.accent;
  commit();
});

// Einstellungen: Auf-/Zuklappen merken ('toggle' blubbert nicht, daher Capture)
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.section) return;
  if (d.open) openSections.add(d.dataset.section); else openSections.delete(d.dataset.section);
  rememberSections();
  if (d.open) growAll(d); // Textfelder in vorher zugeklappten Bereichen anpassen
  const btn = document.querySelector('[data-action="toggleAllSections"]');
  if (btn) btn.textContent = SECTION_IDS.every((id) => openSections.has(id)) ? 'Alle zuklappen' : 'Alle aufklappen';
}, true);

// Übersicht direkt in den Einstellungen anpassen – Änderungen gelten sofort
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dash-scope="settings"] [data-dash]');
  if (!b) return;
  if (b.dataset.dash === 'reset' && !confirm('Übersicht auf die Standardansicht zurücksetzen?')) return;
  data.settings.dashboard = applyDashEdit(structuredClone(dashboardConfig()), b);
  commit();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.closest('[data-dash-scope="settings"]') || (!el.dataset.widget && !el.dataset.stat)) return;
  data.settings.dashboard = applyDashEdit(structuredClone(dashboardConfig()), el);
  commit();
});

// Mitwachsende Textfelder
document.addEventListener('input', (e) => { if (e.target.matches('textarea.autogrow')) autoGrow(e.target); });
window.addEventListener('resize', () => growAll());

// Live-Vorschau der Erinnerungstexte
document.addEventListener('input', (e) => {
  const form = e.target.closest('[data-form="reminders"]');
  if (!form) return;
  const v = readReminderForm(form);
  $('#reminder-preview').innerHTML = reminderPreview(v.reminderTexts, v);
});

// Platzhalter an der Cursorposition einfügen
document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-insert]');
  if (!chip) return;
  const ta = chip.closest('form').querySelector('textarea[name="reminderTexts"]');
  const start = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, start) + chip.dataset.insert + ta.value.slice(end);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = start + chip.dataset.insert.length;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
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
