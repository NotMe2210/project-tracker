'use strict';

/* =========================================================================
   Projekttracker – alle Daten liegen im localStorage dieses Browsers.
   ========================================================================= */

// Bei jeder Veröffentlichung erhöhen (bump-version.sh) – steuert Cache-Umgehung und Update-Hinweis
const APP_VERSION = '2026.11.22-1';
const STORAGE_KEY = 'projekttracker.v1';
const META_KEY = 'projekttracker.meta';
const SYNC_KEY = 'projekttracker.server';       // Server-Modus: Stand des Abgleichs
const SYNC_BASE_KEY = 'projekttracker.server.base'; // letzter gemeinsamer Stand mit dem Server
const API_URL = 'api.php';
const BRAND = 'Protrac by R3DO'; // Name der App (Titel, Fenster), wird nicht übersetzt

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
    bannerFx: 'both', // Animation im Motivationsbereich: both | flames | bar | off
    pomoWork: 25, // Minuten Fokus
    pomoShort: 5, // kurze Pause
    pomoLong: 15, // lange Pause
    pomoEvery: 4, // lange Pause nach jedem n-ten Pomodoro
    pomoSound: true,
    timerBeep: 15, // Erinnerungston alle … Minuten, solange ein Timer läuft (0 = aus)
    timerSound: 'beep', // Klang, solange ein Timer läuft: beep | file | url | rain | brown (Meer) | pad | birds
    timerSoundUrl: '', // Internetradio / Audio-Link
    timerSoundVolume: 60, // 0–100
    timerSoundBreaks: false, // in Pomodoro-Pausen weiterspielen
    timerSoundFileName: '', // Name der eigenen Musikdatei (die Datei selbst liegt nur auf dem Gerät)
    pomoNotify: true,
    language: 'auto', // 'auto' = Gerätesprache, sonst Sprachcode (de, en …)
    remindersOn: true, // Erinnerungen bei eingeschlafenen Projekten
    planWeekends: false, // Zeitplan: Wochenenden zählen als Arbeitstage
    achievementsOn: true, // Erfolge anzeigen und feiern
  },
  projects: [],
  timeEntries: [],
  investments: [],
  milestones: [],
  tasks: [],
  notes: [],
  docs: [], // Dokument-Verweise { id, projectId, taskId, milestoneId, title, url, note, createdAt }
  reviews: {}, // Wochenrückblicke { 'YYYY-MM-DD' (Wochenbeginn): { good, blockers, savedAt } }
  weekFocus: {}, // Wochenfokus { 'YYYY-MM-DD' (Wochenbeginn): [Aufgaben-IDs] }
  templates: [], // eigene Projektvorlagen { id, name, icon, createdAt, bp }
  incomes: [], // Einnahmen { id, projectId, description, amount, date, category }
  people: [], // Personen { id, name, short, color, email, accountId (später: Login-Konto), createdAt }
  teams: [], // Teams { id, name, color, memberIds: [Personen-IDs], createdAt }
  timer: null,
  counters: { pomodoros: 0 },
  achievements: null, // { id: Datum } – null = noch nie geprüft
};

const STATUS = [
  { value: 'idee', get label() { return tr('Idee'); } },
  { value: 'aktiv', get label() { return tr('Aktiv'); } },
  { value: 'pausiert', get label() { return tr('Pausiert'); } },
  { value: 'abgeschlossen', get label() { return tr('Abgeschlossen'); } },
];
const PRIORITIES = [
  { value: 'hoch', get label() { return tr('Hoch'); } },
  { value: 'mittel', get label() { return tr('Mittel'); } },
  { value: 'niedrig', get label() { return tr('Niedrig'); } },
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
  const rest = INVEST_CATEGORIES.map((c) => tr(c)).filter((c) => !count.has(c.toLocaleLowerCase('de')));
  return [...used, ...rest];
}

/** Eingabe vereinheitlichen: vorhandene Schreibweise übernehmen, leer = „Sonstiges“. */
function normalizeCategory(input) {
  const c = String(input || '').replace(/\s+/g, ' ').trim();
  if (!c) return tr('Sonstiges');
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
const DEFAULT_REMINDERS_DE = [
  '„{projekt}“ ruht seit {tage} Tagen.',
  '„{projekt}“ vermisst dich – {tage} Tage ist es schon her.',
  '{tage} Tage Pause bei „{projekt}“. Zeit für einen kleinen Schritt?',
  'Weißt du noch, warum du „{projekt}“ angefangen hast?',
];
const DEFAULT_REMINDERS_EN = [
  '“{project}” has been resting for {days} days.',
  '“{project}” misses you – it has been {days} days already.',
  '{days} days off from “{project}”. Time for a small step?',
  'Do you remember why you started “{project}”?',
];
/** Standardtexte in der aktuellen Sprache */
const defaultReminders = () => (LANG === 'de' ? DEFAULT_REMINDERS_DE : DEFAULT_REMINDERS_EN);
// Platzhalter: deutsche und englische Namen funktionieren in jeder Sprache
const PLACEHOLDER_KEYS = [
  ['projekt', 'project'], ['tage', 'days'], ['warum', 'why'], ['schritt', 'step'], ['ziel', 'goal'], ['stunden', 'hours'],
];
const placeholders = () => [
  [LANG === 'de' ? '{projekt}' : '{project}', tr('Name des Projekts')],
  [LANG === 'de' ? '{tage}' : '{days}', tr('Tage ohne Aktivität')],
  [LANG === 'de' ? '{warum}' : '{why}', tr('dein „Warum“')],
  [LANG === 'de' ? '{schritt}' : '{step}', tr('nächste offene Aufgabe')],
  [LANG === 'de' ? '{ziel}' : '{goal}', tr('Ziel des Projekts')],
  [LANG === 'de' ? '{stunden}' : '{hours}', tr('bisher investierte Zeit')],
];

const ACCENTS = [
  ['#4f46e5', 'Indigo'], ['#2563eb', 'Blau'], ['#0891b2', 'Cyan'], ['#0d9488', 'Türkis'],
  ['#16a34a', 'Grün'], ['#ca8a04', 'Gold'], ['#ea580c', 'Orange'], ['#dc2626', 'Rot'],
  ['#db2777', 'Pink'], ['#7c3aed', 'Violett'], ['#475569', 'Schiefer'],
];
// Anleitungen für den Gerätewechsel. Schritte sind statisches HTML (keine Nutzereingaben).
const SAFARI_IOS = () => tr('<i>Einstellungen › Apps › Safari › Downloads</i>');
const SAFARI_MAC = () => tr('<i>Safari › Einstellungen › Allgemein › Speicherort für geladene Dateien</i>');
const EDGE_DL = () => tr('<i>Edge › Einstellungen › Downloads › Speicherort</i>');
const syncServices = () => [
  { id: 'icloud', name: 'iCloud Drive', cloud: true, folder: tr('iCloud Drive › Downloads'), steps: {
    ios: [tr('{ios} › „iCloud Drive“ wählen (ist meist schon so eingestellt).', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() }),
      tr('Import: im Dateidialog <i>Durchsuchen › iCloud Drive › Downloads</i> öffnen.')],
    mac: [tr('{mac} › „Andere …“ › <i>iCloud Drive › Downloads</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() }),
      tr('Falls iCloud Drive fehlt: <i>Systemeinstellungen › [dein Name] › iCloud › iCloud Drive</i> aktivieren.')],
    win: [tr('„iCloud für Windows“ aus dem Microsoft Store installieren, anmelden und iCloud Drive aktivieren.'),
      tr('{edge} › <code>iCloud Drive\\\\Downloads</code> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    android: [tr('Für Android gibt es keine iCloud-Drive-App. Nutze <i>icloud.com › Drive</i> im Browser: Sicherung dort hochladen bzw. herunterladen.'),
      tr('Wenn du regelmäßig Android nutzt, ist einer der anderen Dienste bequemer.')],
  } },
  { id: 'onedrive', name: 'OneDrive', cloud: true, folder: tr('OneDrive › Projekttracker'), steps: {
    ios: [tr('OneDrive-App aus dem App Store installieren und anmelden.'),
      tr('In der Dateien-App unter <i>Durchsuchen › ⋯ › Bearbeiten</i> „OneDrive“ einschalten.'),
      tr('{ios} › „Andere …“ › <i>OneDrive › Projekttracker</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    mac: [tr('OneDrive-App aus dem App Store installieren und anmelden.'),
      tr('{mac} › „Andere …“ › <i>OneDrive › Projekttracker</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    win: [tr('OneDrive ist in Windows enthalten – mit deinem Microsoft-Konto anmelden.'),
      tr('{edge} › <code>OneDrive\\\\Projekttracker</code> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    android: [tr('OneDrive-App installieren und anmelden.'),
      tr('Nach dem Export: Download öffnen › <i>Teilen › OneDrive</i> › Ordner „Projekttracker“.'),
      tr('Import: im Dateidialog über das Menü ☰ „OneDrive“ wählen.')],
  } },
  { id: 'gdrive', name: 'Google Drive', cloud: true, folder: tr('Google Drive › Meine Ablage › Projekttracker'), steps: {
    ios: [tr('Google-Drive-App aus dem App Store installieren und anmelden.'),
      tr('In der Dateien-App unter <i>Durchsuchen › ⋯ › Bearbeiten</i> „Drive“ einschalten.'),
      tr('{ios} › „Andere …“ › <i>Drive › Meine Ablage › Projekttracker</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    mac: [tr('„Google Drive für Desktop“ installieren und anmelden.'),
      tr('{mac} › „Andere …“ › <i>Google Drive › Meine Ablage › Projekttracker</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    win: [tr('„Google Drive für Desktop“ installieren – danach gibt es das Laufwerk „Google Drive (G:)“.'),
      tr('{edge} › <code>G:\\\\Meine Ablage\\\\Projekttracker</code> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    android: [tr('Google Drive ist meist vorinstalliert.'),
      tr('Nach dem Export: Download öffnen › <i>Teilen › Drive</i> › Ordner „Projekttracker“.'),
      tr('Import: im Dateidialog über das Menü ☰ „Drive“ wählen.')],
  } },
  { id: 'dropbox', name: 'Dropbox', cloud: true, folder: tr('Dropbox › Projekttracker'), steps: {
    ios: [tr('Dropbox-App aus dem App Store installieren und anmelden.'),
      tr('In der Dateien-App unter <i>Durchsuchen › ⋯ › Bearbeiten</i> „Dropbox“ einschalten.'),
      tr('{ios} › „Andere …“ › <i>Dropbox › Projekttracker</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    mac: [tr('Dropbox-App für macOS installieren und anmelden.'),
      tr('{mac} › „Andere …“ › <i>Dropbox › Projekttracker</i> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    win: [tr('Dropbox-App für Windows installieren und anmelden.'),
      tr('{edge} › <code>Dropbox\\\\Projekttracker</code> wählen.', { ios: SAFARI_IOS(), mac: SAFARI_MAC(), edge: EDGE_DL() })],
    android: [tr('Dropbox-App installieren und anmelden.'),
      tr('Nach dem Export: Download öffnen › <i>Teilen › Dropbox</i> › Ordner „Projekttracker“.'),
      tr('Import: im Dateidialog über das Menü ☰ „Dropbox“ wählen.')],
  } },
  { id: 'none', name: tr('Ohne Cloud'), cloud: false, folder: tr('Download-Ordner'), steps: {
    ios: [tr('Die Sicherung landet in der Dateien-App unter <i>Downloads</i>.'),
      tr('Zum Mac: Datei in der Dateien-App lange drücken › <i>Teilen › AirDrop</i>.')],
    mac: [tr('Die Sicherung landet im Ordner „Downloads“.'),
      tr('Zu iPhone/iPad per AirDrop (Rechtsklick › Teilen › AirDrop), zum PC per USB-Stick oder E-Mail an dich selbst.')],
    win: [tr('Die Sicherung landet im Ordner „Downloads“.'),
      tr('Weitergeben per USB-Stick, E-Mail an dich selbst oder „Freigabe in der Nähe“ (andere Windows-Geräte).')],
    android: [tr('Die Sicherung landet im Ordner „Download“.'),
      tr('Weitergeben per „Quick Share“, USB-Kabel oder E-Mail an dich selbst.')],
  } },
];
const SYNC_DEVICES = [
  ['ios', '📱 iPhone & iPad (Safari)'], ['mac', '💻 Mac (Safari)'], ['win', '🖥️ Windows-PC (Edge)'], ['android', '🤖 Android (Chrome)'],
];
const syncService = () => { const all = syncServices(); return all.find((x) => x.id === data.settings.syncService) || all[0]; };

const THEMES = [['light', '☀️ Hell'], ['dark', '🌙 Dunkel'], ['system', '📱 Wie Gerät']];

const CHEERS = ['Stark! 💪', 'Erledigt! ✅', 'Weiter so! 🚀', 'Super gemacht! 🎉', 'Ein Schritt näher am Ziel! 🏁', 'Läuft bei dir! 🔥'];

setLang((() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings?.language; } catch { return null; } })());
let data = load();
let meta = loadMeta();
/** Automatische Sicherung in einen Ordner (Zustand dieser Sitzung, siehe initFolderBackup) */
const folderBackup = { handle: null, perm: 'none', busy: false, error: '', timer: null };
let syncState = loadSyncState();
let pushTimer = null;
// Laufzeit-Zustand der Server-Verbindung (nicht gespeichert)
const server = { checked: false, authed: false, status: 'idle', error: '', busy: false, info: null, asking: false, lastFocusSync: 0 };
let projectFilter = 'alle'; // Projektliste startet mit „Alle“
let syncHintDismissed = false;

/* ------------------------------------------------------------------------
   Persistenz
   ------------------------------------------------------------------------ */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : freshData();
  } catch (e) {
    console.error(e);
    return freshData();
  }
}

/** Start auf einem neuen Gerät: Übersicht und Projektansicht beginnen leer – mit Einführung zum Gestalten */
function freshData() {
  const d = structuredClone(DEFAULT_DATA);
  d.settings.dashboard = { widgets: [] };
  d.settings.projectLayout = { widgets: [] };
  return d;
}

function normalize(d) {
  const out = structuredClone(DEFAULT_DATA);
  for (const k of Object.keys(out)) if (d && d[k] !== undefined) out[k] = d[k];
  out.settings = { ...DEFAULT_DATA.settings, ...((d && d.settings) || {}) };
  out.tasks = (out.tasks || []).map((t) => (Array.isArray(t.subtasks) ? t : { ...t, subtasks: [] }));
  out.counters = { pomodoros: 0, ...(out.counters || {}) };
  // Schlüssel-Wert-Objekte: PHP macht beim Server-Abgleich aus leerem {} ein [] – zurückwandeln
  if (Array.isArray(out.achievements)) out.achievements = {}; // null bleibt null (= noch nie geprüft)
  for (const k of ['reviews', 'weekFocus']) if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  // Neue Übersichts-Bereiche „Heute“ und „Erfolge“ auch in bereits angepassten Layouts einblenden (einmalig)
  const dash = out.settings.dashboard;
  if (dash?.widgets && !(out.settings.layoutRev >= 2)) {
    if (!dash.widgets.some((w) => w.id === 'today')) {
      const i = dash.widgets.findIndex((w) => w.id === 'banner');
      dash.widgets.splice(i + 1, 0, { id: 'today', visible: true, wide: true });
    }
    if (!dash.widgets.some((w) => w.id === 'achievements')) {
      const firstHidden = dash.widgets.findIndex((w) => !w.visible);
      dash.widgets.splice(firstHidden < 0 ? dash.widgets.length : firstHidden, 0, { id: 'achievements', visible: true, wide: true });
    }
  }
  out.settings.layoutRev = 2;
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
    if (isServerMode()) { syncState.dirty = true; saveSyncState(); if (server.authed) schedulePush(); }
    else scheduleFolderBackup();
  } catch (e) {
    toast(tr('Speichern fehlgeschlagen: {msg}', { msg: e.message }), 'error');
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

// Im Server-Modus wird automatisch gespeichert – dann gibt es keine Export-Erinnerungen.
const hasUnsavedChanges = () => !isServerMode() && data.projects.length > 0 && meta.lastChange > meta.lastExport;

function fmtDateTime(ts) {
  if (!ts) return tr('noch nie');
  const d = new Date(ts);
  const time = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  const day = toISO(d);
  if (day === todayISO()) return tr('heute, {time} Uhr', { time });
  if (day === toISO(addDays(new Date(), -1))) return tr('gestern, {time} Uhr', { time });
  return tr('{date}, {time} Uhr', { date: d.toLocaleDateString(LOCALE), time });
}

function commit() {
  checkAchievements();
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
    '--primary-rgb': hexToRgb(primary).join(', '),
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
  return parseISO(iso).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Automatischer Titel für Zeiteinträge ohne Titel, z. B. „Montag, 16.11.2026“. */
function autoTimeTitle(iso) {
  // bewusst ohne andere Helfer – wird schon beim Laden (Migration) aufgerufen
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/^(\p{L}+)\s*,?\s*/u, '$1, ');
}
/** Titel eines Zeiteintrags – automatische Titel (Wochentag, Datum) in der aktuellen Sprache */
const entryTitle = (e) => (e.autoTitle || !e.title ? autoTimeTitle(e.date) : e.title);

function fmtRelative(iso) {
  if (!iso) return '–';
  const d = daysBetween(iso, todayISO());
  if (d === 0) return tr('heute');
  if (d === 1) return tr('gestern');
  if (d === -1) return tr('morgen');
  if (d < 0) return tr('in {n} Tagen', { n: -d });
  return tr('vor {n} Tagen', { n: d });
}

const eurFormats = {};
const fmtEUR = (n) => (eurFormats[LOCALE] ||= new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' })).format(n || 0);
const fmtNum = (n, digits = 1) => Number(n || 0).toLocaleString(LOCALE, { maximumFractionDigits: digits });
const DEC = () => (LANG === 'de' ? ',' : '.'); // Dezimaltrennzeichen für Eingabefelder

function fmtHours(min) {
  const h = (min || 0) / 60;
  return tr('{n} Std', { n: fmtNum(h) });
}

function fmtDuration(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return tr('{m} Min', { m });
  return m ? tr('{h} Std {m} Min', { h, m }) : tr('{n} Std', { n: h });
}

function parseDuration(s) {
  s = String(s || '').trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+)\s*h\s*(\d+)\s*(m|min)?$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|minuten)$/))) return Math.round(+m[1]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|std|stunde|stunden)?$/))) return Math.round(+m[1] * 60);
  return null;
}

function parseAmount(s) {
  if (s === null || s === undefined || s === '') return null;
  let t = String(s).trim().replace(/[€\s]/g, '');
  // Dezimaltrennzeichen: bei „1.234,50“ bzw. „1,234.50“ das letzte Zeichen; nur Komma: Dezimalkomma (außer 1,234 im Englischen)
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lastComma >= 0) t = LANG !== 'de' && /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const statusLabel = (v) => (STATUS.find((s) => s.value === v) || {}).label || v;
const prioLabel = (v) => (PRIORITIES.find((s) => s.value === v) || {}).label || v;
const getProject = (id) => data.projects.find((p) => p.id === id);
/** Projekte ohne Archiv – für Übersicht, Listen und Auswahlfelder */
const liveProjects = () => data.projects.filter((p) => !p.archived);

/* ------------------------------------------------------------------------
   Auswertungen
   ------------------------------------------------------------------------ */

/** Reihenfolge der Meilensteine: nächstes Zieldatum zuerst, ohne Datum danach, erledigte zuletzt. */
/** Meilensteine eines Projekts in der gewählten Reihenfolge: nach Zieldatum (Standard) oder eigene Reihenfolge */
function sortMilestonesOf(pid) {
  const list = data.milestones.filter((m) => m.projectId === pid);
  if (getProject(pid)?.msSort === 'manual') {
    return list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  return list.sort((a, b) =>
    Number(!!a.done) - Number(!!b.done) ||
    (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
    (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/** Rang jedes Meilensteins (für die Aufgabensortierung) – folgt der Reihenfolge im jeweiligen Projekt */
function milestoneRanks() {
  const ranks = new Map();
  const pids = [...new Set(data.milestones.map((m) => m.projectId))];
  pids.forEach((pid) => sortMilestonesOf(pid).forEach((m, i) => ranks.set(m.id, i)));
  return ranks;
}

/** Aufgaben sortieren: Priorität › Meilenstein (ohne Meilenstein zuletzt) › Fälligkeit › Anlagedatum. */
function sortTasks(tasks) {
  const rank = milestoneRanks();
  const msRank = (t) => (t.milestoneId && rank.has(t.milestoneId) ? rank.get(t.milestoneId) : Infinity);
  return [...tasks].sort((a, b) =>
    Number(b.status === 'doing' && !b.done) - Number(a.status === 'doing' && !a.done) || // „In Arbeit“ zuerst
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
  if (p.status !== 'aktiv' || data.settings.remindersOn === false) return null;
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
  return Array.isArray(general) && general.length ? general : defaultReminders();
}

function fillReminder(tpl, p, s) {
  const base = {
    projekt: p.name, tage: s.idle, warum: p.why || '', schritt: s.next?.title || '',
    ziel: p.goal || '', stunden: fmtHours(s.minutes),
  };
  const values = { ...base };
  PLACEHOLDER_KEYS.forEach(([de, en]) => { values[en] = base[de]; });
  return tpl
    .replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in values ? String(values[k.toLowerCase()]) : m))
    .replace(/„\s*“|“\s*”|"\s*"/g, '')
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
  const showWhy = set.reminderShowWhy !== false && p.why && !/\{(warum|why)\}/i.test(tpl);
  const showNext = set.reminderShowNext !== false && !/\{(schritt|step)\}/i.test(tpl);
  return `<div class="banner warn">
      <div class="emoji">😴</div>
      <div class="text">
        <strong>${esc(text)}</strong>
        ${showWhy ? `<div class="why">${tr('Dein Warum: „{why}“', { why: esc(p.why) })}</div>` : ''}
        ${showNext ? `<div>${s.next ? tr('Kleinster nächster Schritt: <b>{step}</b>', { step: esc(s.next.title) }) : tr('Lege einen kleinen, konkreten nächsten Schritt fest.')}</div>` : ''}
      </div>
      <div class="btn-row">
        <button class="btn primary" data-action="startTimer" data-id="${p.id}">${tr('▶ Nur {n} Minuten', { n: min })}</button>
        ${withOpen ? `<a class="btn" href="#/projekt/${p.id}">${tr('Öffnen')}</a>` : ''}
      </div>
    </div>`;
}

function projectStats(p) {
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const ms = data.milestones.filter((m) => m.projectId === p.id);
  const minutes = sum(data.timeEntries.filter((e) => e.projectId === p.id), (e) => e.minutes);
  const invested = sum(data.investments.filter((e) => e.projectId === p.id), (e) => e.amount);
  const income = sum((data.incomes || []).filter((e) => e.projectId === p.id), (e) => e.amount);
  const tasksDone = tasks.filter((t) => t.done).length;
  const msDone = ms.filter((m) => m.done).length;
  let progress = 0;
  if (p.status === 'abgeschlossen') progress = 100;
  else if (ms.length) progress = Math.round((msDone / ms.length) * 100);
  else if (tasks.length) progress = Math.round((tasksDone / tasks.length) * 100);
  const last = lastActivity(p);
  const idle = last ? daysBetween(last, todayISO()) : 0;
  return {
    minutes, invested, income, profit: income - invested, progress, last, idle,
    // Fortschritt ist nur messbar mit Aufgaben oder Meilensteinen (oder wenn das Projekt abgeschlossen ist)
    hasProgress: p.status === 'abgeschlossen' || ms.length > 0 || tasks.length > 0,
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
  const projects = liveProjects().filter((p) => p.status === 'aktiv' && projectWeeklyMin(p) > 0);
  if (projects.length) return { minutes: sum(projects, projectWeeklyMin), source: 'projects', projects };
  return { minutes: Math.max(0, Number(data.settings.weeklyHoursGoal) || 0) * 60, source: 'general', projects: [] };
}
const fmtStd = (h) => tr('{n} Std', { n: fmtNum(h, 2) });

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
  planCache.clear(); // Zeitpläne bei jeder Änderung neu berechnen
  applyLanguage();
  applyTheme();
  if (editState && !editMatchesRoute()) editState = null;
  if (typeof hideTip === 'function') hideTip();
  if (isLocked()) { renderLockScreen(); return; }
  document.body.classList.remove('locked');
  const r = parseRoute();
  const app = $('#app');
  let html;
  if (r.view === 'projekte') html = renderProjects();
  else if (r.view === 'projekt') html = renderProject(r.id, r.tab);
  else if (r.view === 'einstellungen') html = renderSettings();
  else if (r.view === 'woche') html = renderWeekReview(r.id);
  else html = renderDashboard();
  app.innerHTML = html;
  // Zeitachse an die tatsächliche Breite anpassen (höchstens ein zusätzlicher Durchgang)
  if (measureCharts() && !render.refit) { render.refit = true; try { render(); } finally { render.refit = false; } return; }
  restoreGanttScroll();
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
  if (isServerMode()) { renderSyncBar(bar, btn); return; }
  btn.dataset.action = 'exportData';
  btn.innerHTML = `💾 <span>${tr('Sichern')}</span>`;
  btn.classList.remove('sync-warn', 'sync-busy');
  const dirty = hasUnsavedChanges();
  btn.classList.toggle('dirty', dirty);
  btn.title = dirty ? tr('Ungesicherte Änderungen – letzte Sicherung: {when}', { when: fmtDateTime(meta.lastExport) }) : tr('Alles gesichert ({when})', { when: fmtDateTime(meta.lastExport) });

  if (showSyncHint && !syncHintDismissed) {
    bar.className = 'backup-bar info';
    bar.innerHTML = `<div class="container">
      <span>🔄 ${tr('Du hast den Tracker auf diesem Gerät zuletzt <b>{when}</b> geöffnet.', { when: esc(fmtDateTime(previousOpen)) })}
      ${tr('Hast du seitdem auf einem anderen Gerät gearbeitet?')}<span class="long"> ${syncService().cloud ? tr('Dann importiere zuerst die neueste Sicherung aus {svc}.', { svc: esc(syncService().name) }) : tr('Dann importiere zuerst die neueste Sicherung.')}</span></span>
      <span class="btn-row">
        <button class="btn primary small" data-action="importData">⬆ ${tr('Sicherung importieren')}</button>
        <button class="btn small" data-action="dismissSyncHint">${tr('Nein, weiter')}</button>
      </span></div>`;
    bar.hidden = false;
  } else if (folderBackup.handle && folderBackup.perm === 'prompt') {
    bar.className = 'backup-bar info';
    bar.innerHTML = `<div class="container">
      <span>📁 ${tr('Die automatische Sicherung in „{name}“ wartet auf deine Erlaubnis.', { name: esc(folderBackup.handle.name) })}<span class="long"> ${tr('Der Browser fragt nach jedem Neustart einmal nach.')}</span></span>
      <span class="btn-row"><button class="btn primary small" data-action="resumeFolderBackup">🔓 ${tr('Zugriff erneuern')}</button></span></div>`;
    bar.hidden = false;
  } else if (dirty) {
    bar.className = 'backup-bar warn';
    bar.innerHTML = `<div class="container">
      <span>💾 ${tr('<b>Ungesicherte Änderungen.</b> Letzte Sicherung: {when}.', { when: esc(fmtDateTime(meta.lastExport)) })}<span class="long"> ${tr('Exportiere vor dem Schließen, damit deine anderen Geräte aktuell bleiben.')}</span></span>
      <span class="btn-row"><button class="btn primary small" data-action="exportData">⬇ ${tr('Jetzt sichern')}</button></span></div>`;
    bar.hidden = false;
  } else {
    bar.hidden = true;
    bar.innerHTML = '';
  }
}

/* Server-Modus: Knopf zeigt den Speicherstatus, Leiste erscheint nur bei Problemen. */
function renderSyncBar(bar, btn) {
  const st = server.status;
  const pending = syncState.dirty || st === 'saving' || st === 'pending';
  const problem = st === 'offline' || st === 'error';
  btn.dataset.action = 'syncNow';
  btn.classList.remove('dirty');
  btn.classList.toggle('sync-busy', pending && !problem);
  btn.classList.toggle('sync-warn', problem);
  btn.innerHTML = problem ? (st === 'offline' ? `📴 <span>${tr('Offline')}</span>` : `⚠️ <span>${tr('Fehler')}</span>`)
    : pending ? `☁️ <span>${tr('Speichert…')}</span>` : `☁️ <span>${tr('Gespeichert')}</span>`;
  btn.title = problem ? tr('Keine Verbindung zum Server – tippen, um es erneut zu versuchen')
    : pending ? tr('Änderungen werden auf dem Server gespeichert') : tr('Alles auf dem Server gespeichert ({when})', { when: fmtDateTime(syncState.lastSync) });
  if (problem && syncState.dirty) {
    bar.className = 'backup-bar warn';
    bar.innerHTML = `<div class="container">
      <span>${st === 'offline' ? `📴 <b>${tr('Keine Verbindung zum Server.')}</b>` : `⚠️ <b>${tr('Speichern auf dem Server fehlgeschlagen.')}</b>${server.error ? ` ${esc(server.error)}` : ''}`}
      <span class="long"> ${tr('Deine Änderungen sind auf diesem Gerät sicher und werden übertragen, sobald der Server wieder erreichbar ist.')}</span></span>
      <span class="btn-row"><button class="btn primary small" data-action="syncNow">🔄 ${tr('Erneut versuchen')}</button></span></div>`;
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
  if (!s.health) return `<span class="health">${tr('zuletzt {when}', { when: fmtRelative(s.last) })}</span>`;
  const label = s.health === 'kritisch' ? tr('ruht seit {n} Tagen', { n: s.idle }) : tr('aktiv {when}', { when: fmtRelative(s.last) });
  return `<span class="health ${s.health}">${label}</span>`;
}

function dueBadge(iso) {
  if (!iso) return '';
  return `<span class="${isOverdue(iso) ? 'badge overdue' : ''}">📅 ${fmtDate(iso)}${isOverdue(iso) ? ` · ${tr('überfällig')}` : ''}</span>`;
}

/* ---------------------------- Dashboard ---------------------------------- */

// Bausteine der Übersicht. wide = volle Breite; visible = Standard-Sichtbarkeit.
const WIDGETS = [
  { id: 'banner', get label() { return tr('Motivation & Erinnerung'); }, icon: '💡', wide: true, visible: true },
  { id: 'today', get label() { return tr('Heute'); }, icon: '☀️', wide: true, visible: true },
  { id: 'stats', get label() { return tr('Kennzahlen'); }, icon: '📊', wide: true, visible: true },
  { id: 'attention', get label() { return tr('Braucht Aufmerksamkeit'); }, icon: '⚠️', wide: false, visible: true },
  { id: 'milestones', get label() { return tr('Anstehende Meilensteine'); }, icon: '🏁', wide: false, visible: true },
  { id: 'myTasks', get label() { return tr('Meine Aufgaben'); }, icon: '🙋', wide: false, visible: false },
  { id: 'weekFocus', get label() { return tr('Wochenfokus'); }, icon: '🎯', wide: false, visible: true },
  { id: 'nextSteps', get label() { return tr('Nächste Schritte'); }, icon: '👉', wide: false, visible: true },
  { id: 'activity', get label() { return tr('Aktivität (12 Wochen)'); }, icon: '📈', wide: false, visible: true },
  { id: 'projects', get label() { return tr('Alle Projekte (Tabelle)'); }, icon: '📋', wide: true, visible: true },
  { id: 'achievements', get label() { return tr('Erfolge'); }, icon: '🏅', wide: true, visible: true },
  { id: 'dueTasks', get label() { return tr('Fällige Aufgaben (7 Tage)'); }, icon: '⏰', wide: false, visible: false },
  { id: 'weekProjects', get label() { return tr('Zeit diese Woche je Projekt'); }, icon: '⏱️', wide: false, visible: false },
  { id: 'weekChart', get label() { return tr('Stunden-Diagramm (alle Projekte)'); }, icon: '📊', wide: false, visible: false },
  { id: 'recent', get label() { return tr('Letzte Aktivitäten'); }, icon: '🕘', wide: false, visible: false },
  { id: 'roadmap', get label() { return tr('Roadmap'); }, icon: '🗺️', wide: true, visible: true },
  { id: 'projectCards', get label() { return tr('Projektkacheln'); }, icon: '🗂️', wide: true, visible: false },
];

const STAT_TILES = [
  { id: 'week', get label() { return tr('Diese Woche'); }, visible: true },
  { id: 'streak', get label() { return tr('Streak'); }, visible: true },
  { id: 'active', get label() { return tr('Aktive Projekte'); }, visible: true },
  { id: 'openTasks', get label() { return tr('Offene Aufgaben'); }, visible: true },
  { id: 'invested', get label() { return tr('Investiert'); }, visible: true },
  { id: 'month', get label() { return tr('Zeit diesen Monat'); }, visible: false },
  { id: 'total', get label() { return tr('Zeit gesamt'); }, visible: false },
  { id: 'milestonesDone', get label() { return tr('Erreichte Meilensteine'); }, visible: false },
];

// Bausteine der Projektansicht (Reiter „Übersicht“ eines Projekts)
const PROJECT_WIDGETS = [
  { id: 'why', get label() { return tr('Warum & Ziel'); }, icon: '💭', wide: true, visible: true },
  { id: 'stats', get label() { return tr('Kennzahlen'); }, icon: '📊', wide: true, visible: true },
  { id: 'next', get label() { return tr('Nächster Schritt'); }, icon: '👉', wide: false, visible: true },
  { id: 'hours', get label() { return tr('Stunden-Diagramm'); }, icon: '⏱️', wide: false, visible: true },
  { id: 'milestones', get label() { return tr('Nächste Meilensteine'); }, icon: '🏁', wide: false, visible: true },
  { id: 'recent', get label() { return tr('Letzte Aktivitäten'); }, icon: '🕘', wide: false, visible: true },
  { id: 'description', get label() { return tr('Beschreibung'); }, icon: '📝', wide: true, visible: true },
  { id: 'tasks', get label() { return tr('Offene Aufgaben'); }, icon: '✅', wide: false, visible: false },
  { id: 'invest', get label() { return tr('Investitionen nach Kategorie'); }, icon: '💶', wide: false, visible: false },
  { id: 'docs', get label() { return tr('Dokumente'); }, icon: '📎', wide: false, visible: true },
];
const PROJECT_STATS = [
  { id: 'progress', get label() { return tr('Fortschritt'); }, visible: true },
  { id: 'total', get label() { return tr('Zeit gesamt'); }, visible: true },
  { id: 'week', get label() { return tr('Diese Woche'); }, visible: true },
  { id: 'invested', get label() { return tr('Investiert'); }, visible: true },
  { id: 'profit', get label() { return tr('Gewinn/Verlust'); }, visible: false },
  { id: 'openTasks', get label() { return tr('Offene Aufgaben'); }, visible: true },
  { id: 'target', get label() { return tr('Zieltermin'); }, visible: true },
  { id: 'lastActive', get label() { return tr('Zuletzt aktiv'); }, visible: false },
];

/** Jede Kennzahl zusätzlich als eigener Baustein (Viertelbreite) – so lassen sich Kennzahlen frei verteilen */
const statWidgetDefs = (statDefs, prefix) => statDefs.map((t) => ({
  id: prefix + t.id, icon: '🔢', size: 'quarter', visible: false,
  get label() { return tr('Kennzahl: {name}', { name: t.label }); },
}));
const DASH_DEFS = [...WIDGETS, ...statWidgetDefs(STAT_TILES, 'stat:')];
const PROJECT_DEFS = [...PROJECT_WIDGETS, ...statWidgetDefs(PROJECT_STATS, 'pstat:')];

/* ---------------------------- Anpassbare Layouts ------------------------- */
/*
 * Gemeinsame Layout-Engine für Übersicht und Projektansicht.
 * Ein Layout ist { widgets: [{ id, visible, wide }], stats: [kachel-ids] }.
 * Bearbeiten passiert direkt auf der Seite (editState) mit Drag-and-drop und sofortiger Vorschau.
 */

/** Gespeicherte Anordnung mit den bekannten Bausteinen abgleichen (neue Bausteine werden hinten angehängt). */
/** Breite eines Bausteins: 'quarter' | 'half' | 'full' (ältere Daten kennen nur wide = voll/halb) */
const sizeOf = (w) => (['quarter', 'half', 'threequarter', 'full'].includes(w.size) ? w.size : w.wide ? 'full' : 'half');
const SIZE_COLS = { quarter: 1, half: 2, threequarter: 3, full: 4 };
const withSize = (id, visible, size) => ({ id, visible, size, wide: size === 'full' });

function layoutConfig(saved, defs, statDefs) {
  saved = saved || {};
  const known = new Map(defs.map((w) => [w.id, w]));
  const widgets = [];
  for (const w of saved.widgets || []) {
    if (!known.has(w.id) || widgets.some((x) => x.id === w.id)) continue;
    widgets.push(withSize(w.id, w.visible !== false, sizeOf(w)));
  }
  for (const w of defs) if (!widgets.some((x) => x.id === w.id)) widgets.push(withSize(w.id, saved.widgets ? false : w.visible, sizeOf(w)));
  const stats = Array.isArray(saved.stats) ? saved.stats.filter((id) => statDefs.some((t) => t.id === id)) : statDefs.filter((t) => t.visible).map((t) => t.id);
  return { widgets, stats };
}
const defaultLayout = (defs, statDefs) => ({
  widgets: defs.map((w) => withSize(w.id, w.visible, sizeOf(w))),
  stats: statDefs.filter((t) => t.visible).map((t) => t.id),
});

const dashboardConfig = () => layoutConfig(data.settings.dashboard, DASH_DEFS, STAT_TILES);
const defaultDashboardConfig = () => defaultLayout(DASH_DEFS, STAT_TILES);
const projectLayoutFor = (p) => layoutConfig(p.layout || data.settings.projectLayout, PROJECT_DEFS, PROJECT_STATS);

/** Laufender Bearbeitungsmodus: { kind: 'dashboard' | 'project', pid, draft, scope, replaceOthers, tilesOpen } */
let editState = null;
const layoutDefs = (kind) => (kind === 'project' ? [PROJECT_DEFS, PROJECT_STATS] : [DASH_DEFS, STAT_TILES]);

/**
 * Raster mit 4 Spalten: Viertel = 1, Halb = 2, Dreiviertel = 3, Voll = 4. Bausteine füllen Zeile für Zeile (gleich hoch).
 * Bleibt in einer Zeile Platz frei, wachsen die Bausteine: einer allein → volle Breite, zwei → je halb,
 * sonst wird der letzte breiter. So entstehen keine Lücken.
 */
function computeSpans(items) {
  const spans = new Map();
  let row = [], used = 0;
  const flush = () => {
    if (!row.length) return;
    const free = 4 - used;
    if (free > 0) {
      if (row.length === 1) row[0].c = 4;
      else if (row.length === 2) { row[0].c = 2; row[1].c = 2; }
      else row[row.length - 1].c += free;
    }
    row.forEach((r) => spans.set(r.id, `s${r.c}`));
    row = []; used = 0;
  };
  for (const it of items) {
    const c = SIZE_COLS[sizeOf(it)];
    if (used + c > 4) flush();
    row.push({ id: it.id, c });
    used += c;
    if (used === 4) flush();
  }
  flush();
  return spans;
}

function relayoutGrid(grid) {
  const items = [...grid.querySelectorAll(':scope > .w-item')].map((el) => ({ id: el.dataset.wid, size: el.dataset.size, el }));
  const spans = computeSpans(items);
  items.forEach((it) => { it.el.classList.remove('s1', 's2', 's3', 's4'); it.el.classList.add(spans.get(it.id)); });
}

/** Rendert ein Layout; im Bearbeitungsmodus mit Werkzeugleiste je Baustein und Ablage für ausgeblendete. */
function renderLayoutGrid(cfg, defs, renderFn, { edit = false, statDefs = [] } = {}) {
  const meta = (id) => defs.find((d) => d.id === id);
  const rendered = [];
  for (const w of cfg.widgets.filter((x) => x.visible)) {
    let html = renderFn(w.id);
    if (!html && edit) {
      const m = meta(w.id);
      html = `<section class="card w-empty"><h2>${m.icon} ${esc(m.label)}</h2><div class="empty">${tr('Zurzeit ohne Inhalt – erscheint, sobald es etwas anzuzeigen gibt.')}</div></section>`;
    }
    if (html) rendered.push({ ...w, html });
  }
  const spans = computeSpans(rendered);
  const items = rendered.map((w) => {
    const m = meta(w.id);
    const tools = edit ? `<div class="w-tools">
        <button type="button" class="w-handle" data-drag aria-label="${tr('{name} verschieben', { name: esc(m.label) })}" title="${tr('Ziehen zum Verschieben (oder Pfeiltasten)')}">⠿</button>
        <span class="w-label">${m.icon} ${esc(m.label)}</span>
        ${w.id === 'stats' ? `<button type="button" class="btn small ${editState?.tilesOpen ? 'active' : ''}" data-edit="tiles">${tr('Kacheln')}</button>
          <button type="button" class="btn small" data-edit="split" title="${tr('Jede Kennzahl als eigene Kachel – frei anordnen')}">✂ ${tr('Aufteilen')}</button>` : ''}
        <span class="segmented size-pick" role="group" aria-label="${tr('Breite umschalten')}">${[['quarter', '¼', tr('Viertel')], ['half', '½', tr('Halb')], ['threequarter', '¾', tr('Dreiviertel')], ['full', tr('voll'), tr('Voll')]].map(([v, l, name]) =>
          `<button type="button" class="seg-btn ${sizeOf(w) === v ? 'active' : ''}" data-edit="size" data-size="${v}" data-wid="${w.id}" title="${name}" aria-pressed="${sizeOf(w) === v}">${l}</button>`).join('')}</span>
        <button type="button" class="btn small icon" data-edit="hide" data-wid="${w.id}" title="${tr('Ausblenden')}" aria-label="${tr('{name} ausblenden', { name: esc(m.label) })}">✕</button>
      </div>
      ${w.id === 'stats' && editState?.tilesOpen ? `<div class="w-tiles">${statDefs.map((t) => `<button type="button" class="chip ${cfg.stats.includes(t.id) ? 'active' : ''}" data-edit="stat" data-stat="${t.id}">${esc(t.label)}</button>`).join('')}</div>` : ''}` : '';
    return `<div class="w-item ${spans.get(w.id)} size-${sizeOf(w)}" data-wid="${w.id}" data-size="${sizeOf(w)}">${tools}${w.html}</div>`;
  });
  const hidden = cfg.widgets.filter((w) => !w.visible);
  const tray = edit ? `<div class="w-tray">
      <span class="small muted">${hidden.length ? tr('Ausgeblendet – zum Einblenden antippen:') : tr('Alle Bereiche sind eingeblendet.')}</span>
      ${hidden.map((w) => `<button type="button" class="chip" data-edit="show" data-wid="${w.id}">+ ${meta(w.id).icon} ${esc(meta(w.id).label)}</button>`).join('')}
    </div>` : '';
  return `<div class="wgrid ${edit ? 'editing' : ''}">${items.join('')}</div>${tray}`;
}

const layoutEmpty = (cfg) => !cfg.widgets.some((w) => w.visible);
/** Einführung, solange eine Übersicht leer ist: wie man sie selbst gestaltet */
function layoutIntro(kind, p) {
  const isProject = kind === 'project';
  const btn = isProject ? `✏️ ${tr('Ansicht anpassen')}` : `⚙️ ${tr('Anpassen')}`;
  const shared = isProject && p.layout && !layoutEmpty(layoutConfig(data.settings.projectLayout, PROJECT_DEFS, PROJECT_STATS));
  return `<section class="card layout-intro">
    <div class="li-head"><span class="li-ico" aria-hidden="true">✨</span><div>
      <h2>${isProject ? tr('Gestalte die Projektansicht') : tr('Gestalte deine Übersicht')}</h2>
      <p>${tr('Hier ist noch nichts eingeblendet – du entscheidest, was du sehen möchtest. So geht’s:')}</p></div></div>
    <ol class="li-steps">
      <li>${tr('<b>{btn}</b> antippen', { btn })}</li>
      <li>${tr('Unter „Ausgeblendet“ die gewünschten Bereiche mit <b>+</b> einblenden')}</li>
      <li>${tr('Am <b>⠿</b>-Griff verschieben, die Breite mit <b>¼ ½ ¾ voll</b> wählen, mit <b>✕</b> wieder ausblenden')}</li>
      <li>${tr('<b>Fertig</b> antippen – du kannst alles jederzeit wieder ändern')}</li>
    </ol>
    ${isProject ? `<p class="small muted">${tr('Tipp: Beim Speichern wählst du, ob die Anordnung für alle Projekte oder nur für dieses gilt.')}</p>`
      : `<p class="small muted">${tr('Tipp für den Anfang: „Heute“, „Wochenziel“ und „Nächste Schritte“.')}</p>`}
    <div class="btn-row">
      <button class="btn primary" data-action="${isProject ? 'customizeProject' : 'customizeDashboard'}" ${isProject ? `data-id="${p.id}"` : ''}>${tr('Jetzt gestalten')}</button>
      ${shared ? `<button class="btn" data-action="useSharedLayout" data-id="${p.id}">${tr('Gewohnte Anordnung übernehmen')}</button>` : ''}
      <button class="btn" data-action="applyRecommendedLayout" data-kind="${kind}" ${isProject ? `data-id="${p.id}"` : ''}>${tr('Empfohlene Auswahl übernehmen')}</button>
    </div>
  </section>`;
}

function editBar() {
  if (!editState) return '';
  const p = editState.kind === 'project' ? getProject(editState.pid) : null;
  const others = editState.kind === 'project' ? data.projects.filter((x) => x.layout && x.id !== editState.pid).length : 0;
  return `<div class="edit-bar">
    <div class="edit-bar-text"><b>✏️ ${editState.kind === 'project' ? tr('Projektansicht anpassen') : tr('Übersicht anpassen')}</b>
      <span class="small muted">${tr('Bereiche am ⠿-Griff ziehen · Breite ¼ ½ ¾ voll · ✕ ausblenden · Kennzahlen mit ✂ aufteilen. Die Vorschau zeigt sofort das neue Layout.')}</span></div>
    ${p ? `<div class="edit-scope">
        <div class="segmented" role="radiogroup" aria-label="${tr('Gilt für')}">
          <label><input type="radio" name="editScope" value="all" data-edit-scope ${editState.scope === 'all' ? 'checked' : ''}>${tr('Für alle Projekte')}</label>
          <label><input type="radio" name="editScope" value="project" data-edit-scope ${editState.scope === 'project' ? 'checked' : ''}>${tr('Nur für „{name}“', { name: esc(p.name) })}</label>
        </div>
        ${editState.scope === 'all' && others ? `<label class="check-row small"><input type="checkbox" data-edit-replace ${editState.replaceOthers ? 'checked' : ''}>
          ${trp(others, 'Auch die eigene Anordnung von {n} anderem Projekt ersetzen', 'Auch die eigenen Anordnungen von {n} anderen Projekten ersetzen')}</label>` : ''}
      </div>` : ''}
    <div class="btn-row edit-actions">
      <button type="button" class="btn small" data-edit="reset">${tr('Standard')}</button>
      <button type="button" class="btn small" data-edit="cancel">${tr('Abbrechen')}</button>
      <button type="button" class="btn primary small" data-edit="save">${tr('Fertig')}</button>
    </div>
  </div>`;
}

function startEdit(kind, pid) {
  if (kind === 'project') {
    const p = getProject(pid);
    if (!p) return;
    editState = { kind, pid, draft: structuredClone(projectLayoutFor(p)), scope: p.layout ? 'project' : 'all', replaceOthers: false, tilesOpen: false };
    if (!editMatchesRoute()) { location.hash = `#/projekt/${pid}/uebersicht`; return; }
  } else {
    editState = { kind, draft: structuredClone(dashboardConfig()), tilesOpen: false };
    if (parseRoute().view !== 'dashboard') { location.hash = '#/'; return; }
  }
  render();
}

function editMatchesRoute() {
  if (!editState) return false;
  const r = parseRoute();
  if (editState.kind === 'dashboard') return r.view === 'dashboard';
  return r.view === 'projekt' && r.id === editState.pid && r.tab === 'uebersicht';
}

function saveEdit() {
  const st = editState;
  if (st.kind === 'dashboard') {
    data.settings.dashboard = st.draft;
  } else if (st.scope === 'project') {
    getProject(st.pid).layout = st.draft;
  } else {
    data.settings.projectLayout = st.draft;
    delete getProject(st.pid).layout;
    if (st.replaceOthers) data.projects.forEach((p) => delete p.layout);
  }
  editState = null;
  commit();
  toast(st.kind === 'dashboard' ? tr('Übersicht gespeichert ✔')
    : st.scope === 'project' ? tr('Anordnung für dieses Projekt gespeichert ✔') : tr('Anordnung für alle Projekte gespeichert ✔'));
}

/** Reihenfolge aus dem DOM (nach Drag-and-drop) in den Entwurf übernehmen. */
function syncDraftOrder(grid) {
  const order = [...grid.querySelectorAll(':scope > .w-item')].map((el) => el.dataset.wid);
  const ws = editState.draft.widgets;
  const visible = order.map((id) => ws.find((w) => w.id === id)).filter(Boolean);
  editState.draft.widgets = [...visible, ...ws.filter((w) => !order.includes(w.id))];
}

/* Bearbeitungs-Aktionen */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (!b || !editState) return;
  const d = editState.draft;
  const w = d.widgets.find((x) => x.id === b.dataset.wid);
  switch (b.dataset.edit) {
    case 'size': Object.assign(w, { size: b.dataset.size, wide: b.dataset.size === 'full' }); break;
    case 'split': {
      // Kennzahlen-Kachel in einzelne Viertel-Kacheln zerlegen (an derselben Stelle)
      const prefix = editState.kind === 'project' ? 'pstat:' : 'stat:';
      const ids = d.stats.map((x) => prefix + x);
      const singles = ids.map((id) => withSize(id, true, 'quarter'));
      d.widgets = d.widgets.filter((x) => !ids.includes(x.id));
      const i = d.widgets.findIndex((x) => x.id === 'stats');
      d.widgets[i] = { ...d.widgets[i], visible: false };
      d.widgets.splice(i, 0, ...singles);
      editState.tilesOpen = false;
      break;
    }
    case 'hide': w.visible = false; break;
    case 'show': {
      w.visible = true;
      // eingeblendete Bausteine kommen ans Ende der sichtbaren
      d.widgets = [...d.widgets.filter((x) => x.visible && x !== w), w, ...d.widgets.filter((x) => !x.visible)];
      break;
    }
    case 'tiles': editState.tilesOpen = !editState.tilesOpen; break;
    case 'stat': {
      const [, statDefs] = layoutDefs(editState.kind);
      const id = b.dataset.stat;
      d.stats = statDefs.map((t) => t.id).filter((x) => (x === id ? !d.stats.includes(id) : d.stats.includes(x)));
      break;
    }
    case 'reset': {
      const [defs, statDefs] = layoutDefs(editState.kind);
      editState.draft = defaultLayout(defs, statDefs);
      break;
    }
    case 'cancel': editState = null; break;
    case 'save': return saveEdit();
  }
  render();
});
document.addEventListener('change', (e) => {
  if (!editState) return;
  if (e.target.matches('[data-edit-scope]')) { editState.scope = e.target.value; render(); }
  if (e.target.matches('[data-edit-replace]')) editState.replaceOthers = e.target.checked;
});

/* Drag-and-drop mit Zeiger-Ereignissen (Maus, Finger, Stift) – Bausteine rücken sofort nach */
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.wgrid.editing [data-drag]');
  if (!handle || e.button > 0) return;
  e.preventDefault();
  const item = handle.closest('.w-item');
  const r = item.getBoundingClientRect();
  const ghost = item.cloneNode(true);
  ghost.classList.add('w-ghost');
  Object.assign(ghost.style, { width: `${r.width}px`, height: `${Math.min(r.height, 260)}px`, left: `${r.left}px`, top: `${r.top}px` });
  document.body.appendChild(ghost);
  item.classList.add('w-placeholder');
  document.documentElement.classList.add('dragging');
  drag = { item, grid: item.parentElement, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY };
  requestAnimationFrame(dragAutoScroll);
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.ghost.style.left = `${e.clientX - drag.dx}px`;
  drag.ghost.style.top = `${e.clientY - drag.dy}px`;
  dragReorder();
});
function dragReorder() {
  const el = document.elementFromPoint(drag.x, drag.y)?.closest('.w-item');
  if (!el || el === drag.item || el.parentElement !== drag.grid) return;
  const items = [...drag.grid.children];
  if (items.indexOf(drag.item) < items.indexOf(el)) el.after(drag.item); else el.before(drag.item);
  relayoutGrid(drag.grid);
}
function dragAutoScroll() {
  if (!drag) return;
  const edge = 70;
  if (drag.y < edge) window.scrollBy(0, -12);
  else if (drag.y > window.innerHeight - edge) window.scrollBy(0, 12);
  if (drag.y < edge || drag.y > window.innerHeight - edge) dragReorder();
  requestAnimationFrame(dragAutoScroll);
}
function endDrag() {
  if (!drag) return;
  drag.ghost.remove();
  drag.item.classList.remove('w-placeholder');
  document.documentElement.classList.remove('dragging');
  const grid = drag.grid;
  drag = null;
  syncDraftOrder(grid);
  render();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
// Tastatur: Griff fokussieren, Pfeiltasten verschieben
document.addEventListener('keydown', (e) => {
  const handle = e.target.closest?.('.wgrid.editing [data-drag]');
  if (!handle || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const item = handle.closest('.w-item');
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') item.previousElementSibling?.before(item);
  else item.nextElementSibling?.after(item);
  const wid = item.dataset.wid;
  syncDraftOrder(item.parentElement);
  render();
  document.querySelector(`.w-item[data-wid="${wid}"] [data-drag]`)?.focus();
});

function renderDashboard() {
  if (!data.projects.length) {
    return `<div class="card welcome">
      <div class="big" aria-hidden="true"><img class="brand-mark" src="logo.png" alt=""></div>
      <h1>${tr('Willkommen bei Protrac')}</h1>
      <p>${tr('Erfasse Zeit, Investitionen, Meilensteine und Aufgaben deiner Projekte. Der Tracker zeigt dir, welche Projekte Aufmerksamkeit brauchen, damit nichts einschläft.')}</p>
      <div class="btn-row">
        <button class="btn primary" data-action="newProject">${tr('Erstes Projekt anlegen')}</button>
        <button class="btn" data-action="loadDemo">${tr('Beispieldaten ansehen')}</button>
      </div>
      <div class="welcome-import">
        <h2>${tr('Schon mit Protrac gearbeitet?')}</h2>
        <p>${syncService().cloud
          ? tr('Hol deine Projekte von einem anderen Gerät: Wähle die neueste Sicherung (<code>protrac-backup-….json</code>), z. B. aus {svc}. Auch verschlüsselte Sicherungen funktionieren.', { svc: esc(syncService().name) })
          : tr('Hol deine Projekte von einem anderen Gerät: Wähle die neueste Sicherung (<code>protrac-backup-….json</code>). Auch verschlüsselte Sicherungen funktionieren.')}</p>
        <div class="btn-row">
          <button class="btn" data-action="importData">⬆ ${tr('Sicherung importieren')}</button>
          ${isServerMode() ? '' : `<a class="btn ghost" href="#/einstellungen" data-open-section="sync">${tr('Wie geht das?')}</a>`}
        </div>
      </div>
    </div>`;
  }

  const ctx = dashboardContext();
  const editing = editState?.kind === 'dashboard';
  const cfg = editing ? editState.draft : dashboardConfig();
  const anyVisible = cfg.widgets.some((w) => w.visible);

  return `
    ${editing ? editBar() : `<div class="dash-head">
      <h1>${tr('Übersicht')}</h1>
      <button class="btn small" data-action="customizeDashboard">⚙️ ${tr('Anpassen')}</button>
    </div>`}
    ${!editing && layoutEmpty(cfg) ? layoutIntro('dashboard') : renderLayoutGrid(cfg, DASH_DEFS, (id) => renderWidget(id, ctx, cfg), { edit: editing, statDefs: STAT_TILES })}
    ${anyVisible || editing || layoutEmpty(cfg) ? '' : `<div class="card empty">${tr('Alle Bereiche sind ausgeblendet.')}<br><br><button class="btn primary" data-action="customizeDashboard">${tr('Übersicht anpassen')}</button></div>`}`;
}

function dashboardContext() {
  const today = todayISO();
  const active = liveProjects().filter((p) => p.status === 'aktiv');
  const stats = new Map(data.projects.map((p) => [p.id, projectStats(p)]));
  const openTasks = data.tasks.filter((t) => { const p = getProject(t.projectId); return !t.done && p && p.status !== 'abgeschlossen' && !p.archived; });
  const stale = active
    .map((p) => ({ p, s: stats.get(p.id) }))
    .filter((x) => x.s.health && x.s.health !== 'gut')
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
  if (id.startsWith('stat:')) {
    const html = statTile(id.slice(5), c);
    return html ? `<div class="stats stats-single">${html}</div>` : '';
  }
  switch (id) {
    case 'banner':
      return decorateBanner(renderBanner(c), c);

    case 'stats':
      return cfg.stats.length ? `<div class="stats">${cfg.stats.map((t) => statTile(t, c)).join('')}</div>` : '';

    case 'today':
      return renderToday(c);

    case 'weekFocus': {
      const wk = toISO(startOfWeek(new Date()));
      const ids = data.weekFocus?.[wk] || [];
      const tasks = ids.map((id) => data.tasks.find((t) => t.id === id)).filter(Boolean);
      const done = tasks.filter((t) => t.done).length;
      return card(`🎯 ${tr('Wochenfokus')}`, tasks.length ? `
        ${progressBar((done / tasks.length) * 100, done === tasks.length ? 'good' : '')}
        <div class="small muted" style="margin:6px 0 4px">${tr('{done} von {n} Fokus-Aufgaben erledigt', { done, n: tasks.length })}</div>
        <ul class="list">${sortTasks(tasks.filter((t) => !t.done)).concat(tasks.filter((t) => t.done)).map((t) => taskItem(t, { showProject: true })).join('')}</ul>`
        : `<div class="empty">${tr('Noch kein Fokus für diese Woche. Wähle im Wochenrückblick 1–3 Aufgaben je Projekt, auf die du dich konzentrieren willst.')}<br><br><a class="btn small primary" href="#/woche/${toISO(addDays(parseISO(wk), -7))}">📝 ${tr('Woche planen')}</a></div>`,
        `<a class="btn small" href="#/woche">📝 ${tr('Rückblick')}</a>`);
    }

    case 'achievements':
      return data.settings.achievementsOn === false ? '' : renderAchievements();

    case 'attention':
      if (data.settings.remindersOn === false) return '';
      return card(tr('⚠️ Braucht Aufmerksamkeit'), c.stale.length ? `<ul class="list">${c.stale.map(({ p, s }) => `
        <li>
          <span class="dot-color" style="background:${esc(p.color)}"></span>
          <div class="grow">
            <div class="title"><a href="#/projekt/${p.id}">${esc(p.name)}</a></div>
            <div class="small why">${esc(reminderFor(p, s).text)}</div>
            <div class="meta">${healthBadge(s)}${s.next ? `<span>${tr('Nächster Schritt: {step}', { step: esc(s.next.title) })}</span>` : ''}</div>
          </div>
          <button class="btn small" data-action="startPomodoro" data-id="${p.id}">🍅 ${tr('{m} Min', { m: Number(data.settings.reminderMinutes) || 25 })}</button>
          ${qaButton(p)}
        </li>`).join('')}</ul>`
        : `<div class="empty">${tr('Alle aktiven Projekte wurden in den letzten Tagen bearbeitet. 🎉')}</div>`);

    case 'myTasks': {
      const me = currentPerson();
      if (!me) return card(`🙋 ${tr('Meine Aufgaben')}`, `<div class="empty">${tr('Lege unter Einstellungen › Team fest, wer du bist – dann siehst du hier alles, was dir oder deinen Teams zugewiesen ist.')}<br><br><a class="btn small" href="#/einstellungen" data-open-section="team">👥 ${tr('Team einrichten')}</a></div>`);
      const tasks = sortTasks(c.openTasks.filter((t) => isMine(t)));
      const ms = data.milestones.filter((m) => !m.done && isMine(m) && getProject(m.projectId)?.status !== 'abgeschlossen' && !getProject(m.projectId)?.archived)
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
      return card(`🙋 ${tr('Meine Aufgaben')}`, tasks.length || ms.length ? `<div class="scroll-list">
          ${tasks.length ? `<ul class="list">${tasks.map((t) => taskItem(t, { showProject: true })).join('')}</ul>` : ''}
          ${ms.length ? `<div class="list-divider small muted">${tr('Meine Meilensteine ({n})', { n: ms.length })}</div><ul class="list">${ms.map((m) => milestoneItem(m, { showProject: true })).join('')}</ul>` : ''}
        </div>` : `<div class="empty">${tr('Dir ist gerade nichts zugewiesen. 🎉')}</div>`,
        `<span class="small muted">${personAvatar(me)} ${esc(me.name)}</span>`);
    }

    case 'nextSteps': {
      // Oben der nächste Schritt jedes aktiven Projekts, darunter alle weiteren offenen Aufgaben (scrollbar)
      const list = c.active.map((p) => c.stats.get(p.id).next).filter(Boolean)
        .sort((a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1));
      const activeIds = new Set(c.active.map((p) => p.id));
      const more = sortTasks(c.openTasks.filter((t) => activeIds.has(t.projectId) && !list.includes(t)));
      return card(tr('👉 Nächste Schritte'), list.length ? `<div class="scroll-list">
          <ul class="list">${list.map((t) => taskItem(t, { showProject: true })).join('')}</ul>
          ${more.length ? `<div class="list-divider small muted">${tr('Weitere offene Aufgaben ({n})', { n: more.length })}</div>
            <ul class="list">${more.map((t) => taskItem(t, { showProject: true })).join('')}</ul>` : ''}
        </div>`
        : `<div class="empty">${tr('Keine offenen Aufgaben in aktiven Projekten.<br>Lege für jedes Projekt einen konkreten nächsten Schritt fest.')}</div>`,
        list.length + more.length ? `<span class="small muted">${tr('{n} offen', { n: list.length + more.length })}</span>` : '');
    }

    case 'dueTasks': {
      const limit = toISO(addDays(new Date(), 7));
      const list = sortTasks(c.openTasks.filter((t) => t.dueDate && t.dueDate <= limit))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return card(tr('⏰ Fällige Aufgaben'), list.length ? `<ul class="list">${list.map((t) => taskItem(t, { showProject: true })).join('')}</ul>`
        : `<div class="empty">${tr('In den nächsten 7 Tagen ist nichts fällig.')}</div>`);
    }

    case 'milestones': {
      const list = data.milestones
        .filter((m) => !m.done && m.dueDate && getProject(m.projectId) && getProject(m.projectId).status !== 'abgeschlossen' && !getProject(m.projectId).archived)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
      return card(tr('🏁 Anstehende Meilensteine'), list.length ? `<ul class="list">${list.map((m) => milestoneItem(m, { showProject: true })).join('')}</ul>`
        : `<div class="empty">${tr('Keine terminierten Meilensteine.')}</div>`);
    }

    case 'activity':
      return card(tr('📈 Aktivität (12 Wochen)'), heatmap(dayMap()));

    case 'weekChart':
      return card(`📊 ${chartTitle()}`, stackedWeekBars(), periodSwitch());

    case 'weekProjects': {
      // Projekte mit Zeit diese Woche oder mit eigenem Wochenziel (aktiv)
      const rows = liveProjects()
        .map((p) => ({ p, min: weekMinutes(0, p.id), goal: p.status === 'aktiv' ? projectWeeklyMin(p) : 0 }))
        .filter((x) => x.min > 0 || x.goal > 0)
        .sort((a, b) => (b.goal ? b.min / b.goal : 0) - (a.goal ? a.min / a.goal : 0) || b.min - a.min);
      const max = Math.max(1, ...rows.map((r) => r.min));
      return card(tr('⏱️ Zeit diese Woche'), rows.length ? `<ul class="list">${rows.map(({ p, min, goal }) => `
        <li><div class="grow">
          <div class="row-between"><a href="#/projekt/${p.id}">${esc(p.name)}</a>
            <span class="amount">${fmtDuration(min)}${goal ? ` <span class="muted small">/ ${fmtStd(goal / 60)}</span>` : ''}</span></div>
          <div class="progress ${goal && min >= goal ? 'good' : ''}" style="margin-top:6px"><span style="width:${Math.min(100, (min / (goal || max)) * 100)}%;${goal && min >= goal ? '' : `background:${esc(p.color)}`}"></span></div>
        </div></li>`).join('')}</ul>` : `<div class="empty">${tr('Diese Woche noch keine Zeit erfasst.')}</div>`);
    }

    case 'recent': {
      const all = data.projects.flatMap((p) => recentActivity(p.id).map((a) => ({ ...a, p })))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
      return card(tr('🕘 Letzte Aktivitäten'), all.length ? `<ul class="list">${all.map((a) => `
        <li><div class="grow"><div class="title">${a.icon} ${esc(a.text)}</div>
        <div class="meta"><span><span class="dot-color" style="background:${esc(a.p.color)}"></span> ${esc(a.p.name)}</span><span>${fmtDate(a.date)}</span></div></div></li>`).join('')}</ul>`
        : `<div class="empty">${tr('Noch keine Aktivitäten.')}</div>`);
    }

    case 'projects': {
      const order = { aktiv: 0, pausiert: 1, idee: 2, abgeschlossen: 3 };
      const sorted = liveProjects().sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
      return card(tr('📋 Alle Projekte'), `<div class="table-wrap"><table>
        <thead><tr><th>${tr('Projekt')}</th><th>${tr('Status')}</th><th>${tr('Fortschritt')}</th><th class="num">${tr('Zeit')}</th><th class="num">${tr('Diese Woche')}</th><th class="num">${tr('Investiert')}</th><th class="num">${tr('Offene Aufg.')}</th><th>${tr('Zuletzt aktiv')}</th></tr></thead>
        <tbody>${sorted.map((p) => {
          const s = c.stats.get(p.id);
          return `<tr>
            <td class="name-cell"><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}">${esc(p.name)}</a>${qaButton(p)}</td>
            <td><span class="badge ${p.status}">${statusLabel(p.status)}</span></td>
            <td>${s.hasProgress ? `${progressBar(s.progress)} <span class="small muted">${s.progress}%</span>` : `<span class="small muted" title="${tr('Keine Aufgaben oder Meilensteine')}">–</span>`}</td>
            <td class="num">${fmtHours(s.minutes)}</td>
            <td class="num">${fmtHours(weekMinutes(0, p.id))}</td>
            <td class="num">${fmtEUR(s.invested)}</td>
            <td class="num">${s.tasksOpen}</td>
            <td>${healthBadge(s)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`, `<button class="btn small" data-action="newProject">${tr('+ Projekt')}</button>`);
    }

    case 'roadmap': {
      const list = liveProjects().filter((p) => p.status === 'aktiv' || p.status === 'pausiert');
      if (!list.length) return '';
      return card(`🗺️ ${tr('Roadmap')}`, roadmapChart(list, { compact: true }), `<a class="btn small" href="#/projekte" data-action="openRoadmap">${tr('Alle Projekte')}</a>`);
    }

    case 'projectCards': {
      const list = data.projects.filter((p) => p.status === 'aktiv' || p.status === 'pausiert');
      return card(tr('🗂️ Projekte'), list.length ? `<div class="project-grid">${list.map((p) => projectCard(p, c.stats.get(p.id))).join('')}</div>`
        : `<div class="empty">${tr('Keine aktiven oder pausierten Projekte.')}</div>`, `<button class="btn small" data-action="newProject">${tr('+ Projekt')}</button>`);
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
      const src = c.goal.source === 'projects' ? ` (${trp(c.goal.projects.length, '{n} Projekt', '{n} Projekte')})` : '';
      return tile(tr('Diese Woche'), fmtHours(c.thisWeek),
        `${c.goalMin ? `${tr('Ziel: {goal}', { goal: fmtHours(c.goalMin) })}${src} · ` : ''}${diff >= 0 ? '▲' : '▼'} ${tr('{h} ggü. Vorwoche', { h: fmtHours(Math.abs(diff)) })}`,
        (c.goalMin ? progressBar((c.thisWeek / c.goalMin) * 100, c.thisWeek >= c.goalMin ? 'good' : '') : '')
        + sparkline(lastWeeksMinutes(8), tr('Stunden der letzten 8 Wochen')));
    }
    case 'streak':
      return tile(tr('Streak'), `${c.streak ? '🔥 ' : ''}${trp(c.streak, '{n} Tag', '{n} Tage')}`,
        dayMap()[c.today] ? tr('Heute schon aktiv ✔') : c.streak ? tr('Heute noch nichts – halte die Serie!') : tr('Starte heute eine neue Serie'));
    case 'active':
      return tile(tr('Aktive Projekte'), c.active.length, c.stale.length ? trp(c.stale.length, '{n} braucht Aufmerksamkeit', '{n} brauchen Aufmerksamkeit') : tr('Alle in Bewegung 👍'));
    case 'openTasks':
      return tile(tr('Offene Aufgaben'), c.openTasks.length, c.overdue.length ? `<span style="color:var(--bad)">${tr('{n} überfällig', { n: c.overdue.length })}</span>` : tr('nichts überfällig'));
    case 'invested':
      return tile(tr('Investiert'), fmtEUR(sum(data.investments, (i) => i.amount)),
        tr('{amount} in diesem Monat', { amount: fmtEUR(sum(data.investments.filter((i) => i.date.startsWith(monthPrefix)), (i) => i.amount)) }),
        sparkline(lastMonths(6, (m) => sum(data.investments.filter((i) => i.date.startsWith(m)), (i) => i.amount)), tr('Investitionen der letzten 6 Monate')));
    case 'month': {
      const min = sum(data.timeEntries.filter((e) => e.date.startsWith(monthPrefix)), (e) => e.minutes);
      return tile(tr('Zeit diesen Monat'), fmtHours(min), new Date().toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }),
        sparkline(lastMonths(6, (m) => sum(data.timeEntries.filter((e) => e.date.startsWith(m)), (e) => e.minutes)), tr('Stunden der letzten 6 Monate')));
    }
    case 'total':
      return tile(tr('Zeit gesamt'), fmtHours(sum(data.timeEntries, (e) => e.minutes)), trp(data.timeEntries.length, '{n} Eintrag', '{n} Einträge'),
        sparkline(lastWeeksMinutes(8), tr('Stunden der letzten 8 Wochen')));
    case 'milestonesDone': {
      const done = data.milestones.filter((m) => m.done).length;
      return tile(tr('Meilensteine'), `${done} / ${data.milestones.length}`, tr('erreicht'));
    }
  }
  return '';
}

function renderBanner({ stale, streak, thisWeek, goalMin, active }) {
  const critical = stale.find((x) => x.s.health === 'kritisch');
  if (critical) return staleBanner(critical.p, critical.s);
  if (goalMin && thisWeek >= goalMin) {
    return `<div class="banner good"><div class="emoji">🏆</div><div class="text"><strong>${tr('Wochenziel erreicht!')}</strong>${tr('{h} investiert – richtig stark. Alles darüber ist Bonus.', { h: fmtHours(thisWeek) })}</div></div>`;
  }
  if (streak >= 2) {
    return `<div class="banner good"><div class="emoji">🔥</div><div class="text"><strong>${tr('{n} Tage in Folge!', { n: streak })}</strong>${tr('Bleib dran – schon 15 Minuten heute halten die Serie am Leben.')}</div></div>`;
  }
  if (goalMin && active.length) {
    const rest = goalMin - thisWeek;
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
    return `<div class="banner"><div class="emoji">🎯</div><div class="text"><strong>${tr('Noch {h} bis zu deinem Wochenziel.', { h: fmtHours(rest) })}</strong>${tr('Das sind ca. {d} pro Tag bis Sonntag.', { d: fmtDuration(Math.ceil(rest / daysLeft)) })} ${esc(tr(pick(QUOTES)))}</div></div>`;
  }
  return `<div class="banner"><div class="emoji">💡</div><div class="text"><strong>${esc(tr(pick(QUOTES)))}</strong></div></div>`;
}

/* Animation im Motivationsbereich: warmes Glühen (Intensität nach Serie) und/oder pulsierender Wochenziel-Balken */
const BANNER_FX = [['both', '✨🟢 Glühen & Balken'], ['flames', '✨ Glühen'], ['bar', '🟢 Balken'], ['off', 'Aus']]; // Beschriftungen per tr()

/** Stufe des warmen Glühens nach Serie: ruhig, deutlich, kräftig */
const glowLevel = (streak) => (streak >= 7 ? 'high' : streak >= 2 ? 'mid' : 'low');

function decorateBanner(html, c) {
  const mode = data.settings.bannerFx || 'both';
  if (mode === 'off' || !html) return html;
  const glow = mode === 'both' || mode === 'flames' ? glowLevel(c.streak) : '';
  const fx = glow ? '<div class="banner-fx glow" aria-hidden="true"></div>' : '';
  let bar = '';
  if ((mode === 'both' || mode === 'bar') && c.goalMin) {
    const pct = Math.round((c.thisWeek / c.goalMin) * 100);
    bar = `<div class="banner-progress">
      <div class="bp-label"><span>${pct >= 100 ? tr('🏆 Wochenziel erreicht') : tr('🎯 Wochenziel')}</span><span>${tr('<b>{done}</b> von {goal} ({pct} %)', { done: fmtHours(c.thisWeek), goal: fmtHours(c.goalMin), pct })}</span></div>
      <div class="pulse-bar ${pct >= 100 ? 'full' : ''}" role="progressbar" aria-valuenow="${Math.min(100, pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${tr('Wochenziel')}"><span style="width:${Math.max(3, Math.min(100, pct))}%"></span></div>
    </div>`;
  }
  return html
    .replace(/^(\s*)<div class="banner/, `$1<div class="fx-host${glow ? ` fx-glow-${glow}` : ''} banner`)
    .replace(/(<div class="[^"]*banner[^"]*">)/, `$1${fx}`)
    .replace(/<\/div>\s*$/, `${bar}</div>`);
}

/** Alle Aktivitäten je Tag mit Details (für das Hinweis-Fenster der Aktivitäts-Ansicht). */
function dayDetails(fromISO) {
  const out = {};
  const add = (date, item) => { if (date && date >= fromISO) (out[date] ||= []).push(item); };
  const proj = (id) => getProject(id) || { name: '–', color: 'var(--muted)' };
  data.timeEntries.forEach((e) => add(e.date, { p: proj(e.projectId), icon: '⏱️', text: `${fmtDuration(e.minutes)} – ${entryTitle(e)}`, order: 0 }));
  data.milestones.filter((m) => m.done).forEach((m) => add(m.doneAt, { p: proj(m.projectId), icon: '🏁', text: tr('Meilenstein erreicht: {title}', { title: m.title }), order: 1 }));
  data.tasks.forEach((t) => {
    if (t.done) add(t.doneAt, { p: proj(t.projectId), icon: '✅', text: t.title, order: 2 });
    (t.subtasks || []).filter((st) => st.done).forEach((st) => add(st.doneAt, { p: proj(t.projectId), icon: '☑', text: `${st.title} (${t.title})`, order: 3 }));
  });
  data.investments.forEach((i) => add(i.date, { p: proj(i.projectId), icon: '💶', text: `${fmtEUR(i.amount)} – ${i.description}`, order: 4 }));
  data.notes.forEach((n) => add(n.date, { p: proj(n.projectId), icon: '📝', text: n.text, order: 5 }));
  for (const k of Object.keys(out)) out[k].sort((x, y) => x.order - y.order);
  return out;
}

function dayTip(iso, d, items) {
  const day = parseISO(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const head = `<b>${esc(day)}</b>${d && d.minutes ? `<span class="tip-sub">${tr('{d} erfasst', { d: fmtDuration(d.minutes) })}</span>` : ''}`;
  if (!items?.length) return `${head}<span class="tip-sub">${tr('Keine Aktivität')}</span>`;
  const max = matchMedia('(max-width: 640px)').matches ? 5 : 8;
  const short = (t) => (t.length > 70 ? t.slice(0, 68) + '…' : t);
  return head + items.slice(0, max).map((it) => `<span class="tip-row tip-activity">
      <span class="dot-color" style="background:${esc(it.p.color)}"></span>
      <span><span class="tip-icon">${it.icon}</span> ${esc(short(it.text))}<span class="tip-proj">${esc(it.p.name)}</span></span>
    </span>`).join('')
    + (items.length > max ? `<span class="tip-sub">${tr('… und {n} weitere', { n: items.length - max })}</span>` : '');
}

function heatmap(map) {
  const today = todayISO();
  const start = addDays(startOfWeek(new Date()), -11 * 7);
  const details = dayDetails(toISO(start));
  const cells = [];
  for (let i = 0; i < 84; i++) {
    const iso = toISO(addDays(start, i));
    if (iso > today) { cells.push(`<span class="future" title="${tr('{date} – kommt noch', { date: fmtDate(iso) })}"></span>`); continue; }
    const d = map[iso];
    let lvl = 0;
    if (d) lvl = d.minutes >= 120 ? 4 : d.minutes >= 60 ? 3 : d.minutes >= 30 ? 2 : 1;
    const label = `${fmtDate(iso)}: ${d ? `${fmtDuration(d.minutes)}, ${trp(d.count, '{n} Aktivität', '{n} Aktivitäten')}` : tr('keine Aktivität')}`;
    cells.push(`<span class="l${lvl}${iso === today ? ' today' : ''}" aria-label="${esc(label)}" tabindex="-1" data-detail="day:${iso}" data-tip="${esc(dayTip(iso, d, details[iso]))}"></span>`);
  }
  const active = Object.keys(map).filter((k) => k >= toISO(start) && k <= today).length;
  return `<div class="heatmap">${cells.join('')}</div>
    <div class="legend">${tr('weniger')} <span style="background:var(--heat-0)"></span><span style="background:var(--heat-1)"></span><span style="background:var(--heat-2)"></span><span style="background:var(--heat-3)"></span><span style="background:var(--heat-4)"></span> ${tr('mehr')}
    <span style="flex:1"></span>${tr('{n} aktive Tage', { n: active })}</div>
    <div class="small muted heat-hint">${matchMedia('(hover: none)').matches ? tr('Tipp: Tippe auf einen Tag, um seine Aktivitäten zu sehen.') : tr('Tipp: Fahre auf einen Tag, um seine Aktivitäten zu sehen.')}</div>`;
}

/* Zeiträume für die Stunden-Diagramme: Tag, Woche, Monat, Jahr (Auswahl pro Gerät gemerkt) */
const CHART_PERIODS = ['day', 'week', 'month', 'year'];
let chartPeriod = (() => { try { const v = localStorage.getItem('projekttracker.ui.chartPeriod'); return CHART_PERIODS.includes(v) ? v : 'week'; } catch { return 'week'; } })();

function periodList(unit = chartPeriod) {
  const now = new Date();
  const out = [];
  const push = (from, to, current, short, label) => out.push({ unit, from: toISO(from), to: toISO(to), current, short, label });
  if (unit === 'day') {
    for (let i = -13; i <= 0; i++) {
      const d = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), i);
      push(d, addDays(d, 1), i === 0, LANG === 'de' ? `${d.getDate()}.` : String(d.getDate()), fmtDate(toISO(d)));
    }
  } else if (unit === 'month') {
    for (let i = -11; i <= 0; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      push(d, new Date(d.getFullYear(), d.getMonth() + 1, 1), i === 0, d.toLocaleDateString(LOCALE, { month: 'short' }).replace('.', ''), d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }));
    }
  } else if (unit === 'year') {
    for (let i = -4; i <= 0; i++) {
      const y = now.getFullYear() + i;
      push(new Date(y, 0, 1), new Date(y + 1, 0, 1), i === 0, String(y), String(y));
    }
  } else {
    for (let i = -11; i <= 0; i++) {
      const s = addDays(startOfWeek(now), i * 7);
      push(s, addDays(s, 7), i === 0, LANG === 'de' ? `${pad(s.getDate())}.` : String(s.getDate()), s.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' }));
    }
  }
  return out;
}

/** Name eines Zeitraums für Hinweise und Detailansicht */
function periodName(b) {
  if (b.unit === 'day') return b.current ? tr('Heute') : parseISO(b.from).toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (b.unit === 'month') return b.current ? tr('Dieser Monat') : b.label;
  if (b.unit === 'year') return b.current ? tr('Dieses Jahr') : b.label;
  return b.current ? tr('Diese Woche') : tr('Woche {range}', { range: `${fmtDate(b.from)} – ${fmtDate(toISO(addDays(parseISO(b.from), 6)))}` });
}
const periodDetail = (b, pid = '') => (b.unit === 'day' ? `day:${b.from}` : `range:${b.unit}:${b.from}:${b.to}:${pid}`);
const chartTitle = () => ({ day: tr('Stunden pro Tag'), week: tr('Stunden pro Woche'), month: tr('Stunden pro Monat'), year: tr('Stunden pro Jahr') })[chartPeriod];

/** Umschalter Tag / Woche / Monat / Jahr */
function periodSwitch() {
  const names = { day: tr('Tag'), week: tr('Woche'), month: tr('Monat'), year: tr('Jahr') };
  return `<div class="segmented period-switch" role="group" aria-label="${tr('Zeitraum')}">${CHART_PERIODS.map((u) =>
    `<button type="button" class="seg-btn ${u === chartPeriod ? 'active' : ''}" data-action="setChartPeriod" data-id="${u}" aria-pressed="${u === chartPeriod}">${names[u]}</button>`).join('')}</div>`;
}

/** Stunden je Zeitraum für ein einzelnes Projekt (eine Reihe, in der Projektfarbe). */
function weekBars(pid) {
  const p = getProject(pid);
  const buckets = periodList().map((b) => ({ ...b, min: minutesInRange(b.from, b.to, pid) }));
  const max = Math.max(60, ...buckets.map((b) => b.min));
  return `<div class="bars">${buckets.map((b) => `
    <div class="bar ${b.current ? 'current' : ''}" tabindex="0" data-detail="${periodDetail(b, pid)}" data-tip="${esc(`<b>${esc(periodName(b))}</b><br>${fmtDuration(b.min)}`)}">
      <span style="height:${(b.min / max) * 85}%;background:${esc(p?.color || 'var(--primary)')}"></span><small>${b.current && chartPeriod !== 'year' ? tr('jetzt') : b.short}</small>
    </div>`).join('')}</div>`;
}

/** Stunden pro Woche über alle Projekte – gestapelt, jedes Projekt in seiner Farbe. */
function stackedWeekBars() {
  const weeks = periodList();
  const all = data.projects
    .map((p) => ({ p, per: weeks.map((w) => minutesInRange(w.from, w.to, p.id)) }))
    .map((x) => ({ ...x, total: sum(x.per, (m) => m) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total); // feste Stapel-Reihenfolge: größtes Projekt unten
  if (!all.length) return `<div class="empty">${tr('In diesem Zeitraum wurde noch keine Zeit erfasst.')}</div>`;
  const projects = all.filter((x) => !hiddenSeries.has(x.p.id));
  const totals = weeks.map((_, wi) => sum(projects, (x) => x.per[wi]));
  const max = Math.max(60, ...totals);
  const scaleH = Math.ceil(max / 60);

  const weekName = (w) => esc(periodName(w));
  const tip = (w, wi) => `<b>${weekName(w)}</b><br>`
    + projects.filter((x) => x.per[wi]).map((x) => `<span class="tip-row"><span class="dot-color" style="background:${esc(x.p.color)}"></span>${esc(x.p.name)}<b>${fmtDuration(x.per[wi])}</b></span>`).join('')
    + `<span class="tip-row tip-total">${tr('Gesamt')}<b>${fmtDuration(totals[wi])}</b></span>`;

  return `
    <div class="stack-chart" role="img" aria-label="${tr('{title} nach Projekt', { title: chartTitle() })}">
      <div class="stack-scale small muted"><span>${tr('{n} Std', { n: scaleH })}</span><span>0</span></div>
      <div class="bars stacked">${weeks.map((w, wi) => `
        <div class="bar ${w.current ? 'current' : ''}" tabindex="0" data-detail="${periodDetail(w)}" data-tip="${esc(totals[wi] ? tip(w, wi) : `<b>${weekName(w)}</b><br>${tr('keine Zeit erfasst')}`)}">
          <div class="wstack" style="height:calc((100% - 22px) * ${(totals[wi] / (scaleH * 60)).toFixed(4)})">
            ${projects.filter((x) => x.per[wi]).map((x) => `<span style="flex-grow:${x.per[wi]};background:${esc(x.p.color)}"></span>`).join('')}
          </div>
          <small>${w.current && chartPeriod !== 'year' ? tr('jetzt') : w.short}</small>
        </div>`).join('')}
      </div>
    </div>
    <ul class="chart-legend">${all.map((x) => `
      <li><button type="button" class="legend-btn ${hiddenSeries.has(x.p.id) ? 'off' : ''}" data-action="toggleSeries" data-id="${x.p.id}" aria-pressed="${!hiddenSeries.has(x.p.id)}" title="${hiddenSeries.has(x.p.id) ? tr('Einblenden') : tr('Ausblenden')}">
        <span class="dot-color" style="background:${esc(x.p.color)}"></span><span class="name">${esc(x.p.name)}</span><span class="val">${fmtHours(x.total)}</span></button></li>`).join('')}
    </ul>
    <details class="chart-table">
      <summary class="small muted">${tr('Als Tabelle anzeigen')}</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>${tr('Zeitraum')}</th>${projects.map((x) => `<th class="num">${esc(x.p.name)}</th>`).join('')}<th class="num">${tr('Gesamt')}</th></tr></thead>
        <tbody>${weeks.map((w, wi) => `<tr><td>${esc(periodName(w))}</td>${projects.map((x) => `<td class="num">${x.per[wi] ? fmtHours(x.per[wi]) : '–'}</td>`).join('')}<td class="num"><b>${fmtHours(totals[wi])}</b></td></tr>`).join('')}</tbody>
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
  chartTip.innerHTML = el.dataset.tip + (el.dataset.detail
    ? `<span class="tip-sub tip-hint">${lastPointer === 'mouse' ? tr('Klicken für Details') : tr('Nochmal tippen für Details')}</span>` : '');
  chartTip.hidden = false;
  // Freien Raum zwischen Kopfleiste und (mobiler) Navigation bestimmen, Fenster auf der größeren Seite öffnen
  // Kopfleiste oben (sticky) begrenzt den Platz nach oben; als Seitenleiste links (Computer) nicht
  const tb = document.querySelector('.topbar');
  const topBar = tb && getComputedStyle(tb).position === 'sticky' ? tb.getBoundingClientRect().bottom : 0;
  const nav = document.querySelector('.nav');
  const navTop = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : window.innerHeight;
  const r = el.getBoundingClientRect();
  const above = r.top - topBar - 16, below = navTop - r.bottom - 16;
  chartTip.style.maxHeight = `${Math.max(80, Math.max(above, below))}px`;
  const t = chartTip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
  const top = (t.height <= above || above > below) ? r.top - t.height - 8 : r.bottom + 8;
  chartTip.style.left = `${left}px`;
  chartTip.style.top = `${top}px`;
  document.querySelectorAll('.tip-active').forEach((b) => b.classList.remove('tip-active'));
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
    if (lastPointer === 'mouse') { if (el.dataset.detail) openDetail(el.dataset.detail); else showTip(el); }
    else if (el === tipTarget && !chartTip.hidden) { if (el.dataset.detail) openDetail(el.dataset.detail); else hideTip(); }
    else showTip(el);
  } else if (!e.target.closest('.chart-tip')) hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTip();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-detail]') && !e.target.closest('.wgrid.editing')) {
    e.preventDefault();
    openDetail(e.target.closest('[data-detail]').dataset.detail);
  }
});

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

/* Wiederkehrende Aufgaben: beim Erledigen entsteht automatisch die nächste */
const REPEATS = [
  { value: '', get label() { return tr('– nicht wiederholen –'); } },
  { value: 'daily', get label() { return tr('täglich'); } },
  { value: 'workdays', get label() { return tr('werktags (Mo–Fr)'); } },
  { value: 'weekly', get label() { return tr('wöchentlich'); } },
  { value: 'biweekly', get label() { return tr('alle 2 Wochen'); } },
  { value: 'monthly', get label() { return tr('monatlich'); } },
  { value: 'quarterly', get label() { return tr('vierteljährlich'); } },
  { value: 'yearly', get label() { return tr('jährlich'); } },
];
const repeatLabel = (r) => REPEATS.find((x) => x.value === r)?.label || '';
function addMonthsISO(iso, n) {
  const d = parseISO(iso), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
}
function nextRepeatDate(iso, r) {
  switch (r) {
    case 'daily': return toISO(addDays(parseISO(iso), 1));
    case 'workdays': { let d = addDays(parseISO(iso), 1); while ([0, 6].includes(d.getDay())) d = addDays(d, 1); return toISO(d); }
    case 'weekly': return toISO(addDays(parseISO(iso), 7));
    case 'biweekly': return toISO(addDays(parseISO(iso), 14));
    case 'monthly': return addMonthsISO(iso, 1);
    case 'quarterly': return addMonthsISO(iso, 3);
    case 'yearly': return addMonthsISO(iso, 12);
  }
  return null;
}
/** Legt die nächste Wiederholung an (einmal je erledigter Aufgabe) und gibt sie zurück */
function spawnRecurrence(t) {
  if (!t.repeat || !t.done || (t.nextId && data.tasks.some((x) => x.id === t.nextId))) return null;
  const today = todayISO();
  let due = nextRepeatDate(t.dueDate || today, t.repeat);
  for (let i = 0; due && due <= today && i < 1000; i++) due = nextRepeatDate(due, t.repeat); // verpasste Termine überspringen
  if (!due) return null;
  const ms = t.milestoneId && data.milestones.find((m) => m.id === t.milestoneId && !m.done);
  const next = {
    id: uid(), projectId: t.projectId, title: t.title, priority: t.priority, dueDate: due, repeat: t.repeat,
    notes: t.notes || '', estimate: t.estimate || null, duration: t.duration || null, assignees: [...(t.assignees || [])],
    milestoneId: ms ? ms.id : null, subtasks: (t.subtasks || []).map((st) => ({ id: uid(), title: st.title, done: false, doneAt: null })),
    done: false, doneAt: null, status: 'open', createdAt: new Date().toISOString(),
  };
  data.tasks.push(next);
  t.nextId = next.id;
  return next;
}

function celebrateTask(t) {
  const next = spawnRecurrence(t);
  if (next) {
    commit();
    return toast(`${tr(pick(CHEERS))} ${tr('🔁 Nächste Wiederholung am {date}.', { date: fmtDate(next.dueDate) })}`);
  }
  const left = data.tasks.filter((x) => x.projectId === t.projectId && !x.done).length;
  toast(`${tr(pick(CHEERS))} ${left ? tr('Noch {n} offen.', { n: left }) : tr('Alle Aufgaben erledigt!')}`);
  if (!left) confetti();
}

/** Auf eine Aufgabe gebuchte Minuten */
function taskMinutes(id) { return sum(data.timeEntries.filter((e) => e.taskId === id), (e) => e.minutes); }
const fmtHM = (m) => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`;
/** Badge „⏱ gebucht / geschätzt“ – rot, wenn die Schätzung überschritten ist */
function taskTimeBadge(t) {
  const spent = taskMinutes(t.id), est = t.estimate || 0;
  if (!spent && !est) return '';
  const over = est && spent > est;
  const title = est ? tr('{spent} gebucht von {est} geschätzt', { spent: fmtDuration(spent), est: fmtDuration(est) }) : tr('{spent} gebucht', { spent: fmtDuration(spent) });
  return `<span class="badge time ${over ? 'over' : ''}" title="${title}">⏱ ${fmtHM(spent)}${est ? ` / ${fmtHM(est)}` : ''}</span>`;
}

function taskItem(t, { showProject = false } = {}) {
  const p = getProject(t.projectId);
  const ms = t.milestoneId ? data.milestones.find((m) => m.id === t.milestoneId) : null;
  const subs = t.subtasks || [];
  const subsDone = subs.filter((st) => st.done).length;
  const partial = subs.length && !t.done && subsDone > 0;
  return `<li class="${t.done ? 'done' : ''} task">
    <button class="check ${partial ? 'partial' : ''}" data-action="toggleTask" data-id="${t.id}"
      title="${t.done ? tr('Wieder öffnen') : subs.length ? tr('{done} von {n} Unterpunkten erledigt', { done: subsDone, n: subs.length }) : tr('Erledigt')}">${t.done ? '✓' : partial ? '–' : ''}</button>
    <div class="grow">
      <div class="title">${esc(t.title)}</div>
      <div class="meta">
        ${subs.length ? `<span class="badge ${subsDone === subs.length ? 'aktiv' : ''}">☑ ${subsDone}/${subs.length}</span>` : ''}
        ${showProject && p ? `<span><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}/aufgaben">${esc(p.name)}</a></span>` : ''}
        <span class="badge ${t.priority}">${prioLabel(t.priority)}</span>
        ${!t.done && t.status === 'doing' ? `<span class="badge doing">▶ ${tr('In Arbeit')}</span>` : ''}
        ${taskTimeBadge(t)}
        ${t.repeat ? `<span class="badge" title="${tr('Wiederkehrende Aufgabe')}">🔁 ${repeatLabel(t.repeat)}</span>` : ''}
        ${assigneeBadges(t.assignees)}
        ${taskPlanBadges(t)}
        ${t.done ? `<span>${tr('erledigt {when}', { when: fmtRelative(t.doneAt) })}</span>` : dueBadge(t.dueDate)}
        ${ms ? `<span>🏁 ${esc(ms.title)}</span>` : ''}
        ${t.notes ? `<span>${esc(t.notes)}</span>` : ''}
        ${docChips(data.docs.filter((d) => d.taskId === t.id))}
      </div>
      ${subs.length ? `<ul class="subtasks">${subs.map((st) => `
        <li class="${st.done ? 'done' : ''}">
          <button class="check small ${st.done ? 'done' : ''}" data-action="toggleSubtask" data-id="${t.id}" data-sub="${st.id}" title="${st.done ? tr('Wieder öffnen') : tr('Erledigt')}">${st.done ? '✓' : ''}</button>
          <span>${esc(st.title)}</span>
        </li>`).join('')}</ul>` : ''}
      ${t.done || showProject ? '' : `<button class="btn ghost small add-sub" data-action="addSubtask" data-id="${t.id}">${tr('+ Unterpunkt')}</button>`}
    </div>
    <div class="actions">
      ${t.done ? '' : data.timer?.taskId === t.id
        ? `<button class="btn ghost icon timer-on" data-action="stopTimer" title="${tr('Timer stoppen')}">■</button>`
        : `<button class="btn ghost icon" data-action="startTimer" data-id="${t.projectId}" data-task="${t.id}" title="${tr('Timer für diese Aufgabe starten')}">▶</button>`}
      <button class="btn ghost icon" data-action="addDoc" data-id="${t.projectId}" data-task="${t.id}" title="${tr('Dokument verknüpfen')}">📎</button>
      <button class="btn ghost icon" data-action="editTask" data-id="${t.id}" title="${tr('Bearbeiten')}">✎</button>
      <button class="btn ghost icon danger" data-action="deleteTask" data-id="${t.id}" title="${tr('Löschen')}">🗑</button>
    </div>
  </li>`;
}

function milestoneItem(m, { showProject = false, move = null } = {}) {
  const p = getProject(m.projectId);
  const tasks = sortTasks(data.tasks.filter((t) => t.milestoneId === m.id));
  const done = tasks.filter((t) => t.done).length;
  return `<li class="${m.done ? 'done' : ''}">
    <button class="check round" data-action="toggleMilestone" data-id="${m.id}" title="${m.done ? tr('Wieder öffnen') : tr('Erreicht')}">${m.done ? '✓' : ''}</button>
    <div class="grow">
      <div class="title">${esc(m.title)}</div>
      <div class="meta">
        ${showProject && p ? `<span><span class="dot-color" style="background:${esc(p.color)}"></span> <a href="#/projekt/${p.id}/meilensteine">${esc(p.name)}</a></span>` : ''}
        ${m.done ? `<span>${tr('erreicht am {date}', { date: fmtDate(m.doneAt) })}</span>` : m.dueDate ? `${dueBadge(m.dueDate)}<span>(${fmtRelative(m.dueDate)})</span>` : ''}
        ${assigneeBadges(m.assignees)}
        ${milestonePlanBadge(m)}
      </div>
      ${m.description ? `<div class="small muted">${esc(m.description)}</div>` : ''}
      ${docChips(data.docs.filter((d) => d.milestoneId === m.id), true)}
      ${tasks.length && !m.done ? `<div style="margin-top:6px;max-width:240px">${progressBar((done / tasks.length) * 100)}</div>` : ''}
      ${tasks.length ? `<details class="ms-tasks" data-ms="${m.id}" ${openMsTasks.has(m.id) ? 'open' : ''}>
        <summary>${tr('{done}/{n} Aufgaben', { done, n: tasks.length })}</summary>
        <ul>${tasks.map((t) => `<li class="${t.done ? 'done' : ''}">
          <button class="check small ${t.done ? 'done' : ''}" data-action="toggleTask" data-id="${t.id}" title="${t.done ? tr('Wieder öffnen') : tr('Erledigt')}">${t.done ? '✓' : ''}</button>
          <span class="grow">${esc(t.title)}${(t.subtasks || []).length ? ` <span class="muted small">☑ ${t.subtasks.filter((st) => st.done).length}/${t.subtasks.length}</span>` : ''}</span>
          <span class="badge ${t.priority}">${prioLabel(t.priority)}</span>
          <button class="btn ghost icon small" data-action="editTask" data-id="${t.id}" title="${tr('Bearbeiten')}">✎</button>
        </li>`).join('')}</ul>
      </details>` : ''}
    </div>
    <div class="actions">
      ${move ? `<button class="btn ghost icon" data-action="moveMilestone" data-id="${m.id}" data-dir="-1" title="${tr('Nach oben')}" ${move.first ? 'disabled' : ''}>↑</button>
      <button class="btn ghost icon" data-action="moveMilestone" data-id="${m.id}" data-dir="1" title="${tr('Nach unten')}" ${move.last ? 'disabled' : ''}>↓</button>` : ''}
      <button class="btn ghost icon" data-action="addDoc" data-id="${m.projectId}" data-ms="${m.id}" title="${tr('Dokument verknüpfen')}">📎</button>
      <button class="btn ghost icon" data-action="editMilestone" data-id="${m.id}" title="${tr('Bearbeiten')}">✎</button>
      <button class="btn ghost icon danger" data-action="deleteMilestone" data-id="${m.id}" title="${tr('Löschen')}">🗑</button>
    </div>
  </li>`;
}

/* ---------------------------- Projektliste ------------------------------- */

function renderProjects() {
  const live = liveProjects();
  const counts = { alle: live.length, archiv: data.projects.length - live.length };
  STATUS.forEach((s) => (counts[s.value] = live.filter((p) => p.status === s.value).length));
  if (projectFilter !== 'alle' && !counts[projectFilter] && counts.alle) projectFilter = 'alle';
  const list = (projectFilter === 'archiv' ? data.projects.filter((p) => p.archived) : live)
    .filter((p) => projectFilter === 'alle' || projectFilter === 'archiv' || p.status === projectFilter)
    .map((p) => ({ p, s: projectStats(p) }))
    .sort((a, b) => (b.s.last || '').localeCompare(a.s.last || '') || a.p.name.localeCompare(b.p.name));

  return `
    <div class="page-head">
      <div><h1>${tr('Projekte')}</h1><p>${trp(data.projects.length, '{n} Projekt insgesamt', '{n} Projekte insgesamt')}</p></div>
      <button class="btn primary" data-action="newProject">${tr('+ Neues Projekt')}</button>
    </div>
    <div class="toolbar-row">
      <div class="chips">
        ${[{ value: 'alle', label: tr('Alle') }, ...STATUS].map((s) =>
          `<button class="chip ${projectFilter === s.value ? 'active' : ''}" data-action="filterProjects" data-id="${s.value}">${s.label} (${counts[s.value]})</button>`).join('')}
        ${counts.archiv ? `<button class="chip ${projectFilter === 'archiv' ? 'active' : ''}" data-action="filterProjects" data-id="archiv">🗄️ ${tr('Archiv')} (${counts.archiv})</button>` : ''}
      </div>
      <div class="segmented view-toggle" role="group" aria-label="${tr('Ansicht')}">
        <button type="button" class="seg-btn ${projectView === 'grid' ? 'active' : ''}" data-action="setProjectView" data-id="grid" aria-pressed="${projectView === 'grid'}" title="${tr('Kacheln')}">▦ <span>${tr('Kacheln')}</span></button>
        <button type="button" class="seg-btn ${projectView === 'list' ? 'active' : ''}" data-action="setProjectView" data-id="list" aria-pressed="${projectView === 'list'}" title="${tr('Liste')}">☰ <span>${tr('Liste')}</span></button>
        <button type="button" class="seg-btn ${projectView === 'roadmap' ? 'active' : ''}" data-action="setProjectView" data-id="roadmap" aria-pressed="${projectView === 'roadmap'}" title="${tr('Roadmap')}">🗺️ <span>${tr('Roadmap')}</span></button>
      </div>
    </div>
    ${list.length ? (projectView === 'roadmap'
      ? `<section class="card">${roadmapChart(list.map(({ p }) => p))}</section>`
      : projectView === 'list'
      ? `<div class="project-rows">${list.map(({ p, s }) => projectRow(p, s)).join('')}</div>`
      : `<div class="project-grid">${list.map(({ p, s }) => projectCard(p, s)).join('')}</div>`)
      : `<div class="card empty">${tr('Keine Projekte in dieser Ansicht.')}<br><br><button class="btn primary" data-action="newProject">${tr('+ Neues Projekt')}</button></div>`}`;
}

let projectView = (() => { try { return localStorage.getItem('projekttracker.ui.projectView') || 'grid'; } catch { return 'grid'; } })();

/** Projekt als Zeile (Listenansicht) */
function projectRow(p, s) {
  const wk = weekMinutes(0, p.id), goal = p.status === 'aktiv' ? projectWeeklyMin(p) : 0;
  return `<a class="project-row" href="#/projekt/${p.id}" style="--pc:${esc(p.color)}">
    <div class="pr-main">
      <div class="pr-title"><h3>${esc(p.name)}</h3><span class="badge ${p.status}">${statusLabel(p.status)}</span>${p.category ? `<span class="badge">${esc(p.category)}</span>` : ''}</div>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      ${s.next && p.status !== 'abgeschlossen' ? `<div class="small">👉 ${esc(s.next.title)}</div>` : ''}
    </div>
    <div class="pr-progress">
      ${s.hasProgress ? `<div class="row small muted"><span>${tr('Fortschritt')}</span><span>${s.progress}%</span></div>${progressBar(s.progress, s.progress === 100 ? 'good' : '')}` : ''}
      ${goal ? `<div class="row small muted"><span>${tr('Diese Woche')}</span><span>${fmtHours(wk)} / ${fmtStd(goal / 60)}</span></div>${progressBar((wk / goal) * 100, wk >= goal ? 'good' : '')}` : ''}
    </div>
    <div class="pr-figures">
      <span title="${tr('Zeit gesamt')}">⏱️ <b>${fmtHours(s.minutes)}</b></span>
      <span title="${tr('Investiert')}">💶 <b>${fmtEUR(s.invested)}</b></span>
      <span title="${tr('Aufgaben erledigt')}">✅ <b>${s.tasksDone}/${s.tasksTotal}</b></span>
      <span title="${tr('Meilensteine erreicht')}">🏁 <b>${s.msDone}/${s.msTotal}</b></span>
    </div>
    <div class="pr-end">${healthBadge(s)}${qaButton(p)}</div>
  </a>`;
}

function projectCard(p, s) {
  return `<a class="project-card" href="#/projekt/${p.id}" style="--pc:${esc(p.color)}">
        <div class="row"><h3>${esc(p.name)}</h3><span class="row-end"><span class="badge ${p.status}">${statusLabel(p.status)}</span>${qaButton(p)}</span></div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        ${s.hasProgress ? `<div>
          <div class="row small muted" style="margin-bottom:4px"><span>${tr('Fortschritt')}</span><span>${s.progress}%</span></div>
          ${progressBar(s.progress, s.progress === 100 ? 'good' : '')}
        </div>` : ''}
        ${p.status === 'aktiv' && projectWeeklyMin(p) ? `<div>
          <div class="row small muted" style="margin-bottom:4px"><span>${tr('Diese Woche')}</span><span>${fmtHours(weekMinutes(0, p.id))} / ${fmtStd(projectWeeklyMin(p) / 60)}</span></div>
          ${progressBar((weekMinutes(0, p.id) / projectWeeklyMin(p)) * 100, weekMinutes(0, p.id) >= projectWeeklyMin(p) ? 'good' : '')}
        </div>` : ''}
        <div class="figures">
          <span>⏱️ <b>${fmtHours(s.minutes)}</b></span>
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
  if (!p) return `<div class="card empty">${tr('Projekt nicht gefunden.')} <a href="#/projekte">${tr('Zur Projektliste')}</a></div>`;
  const s = projectStats(p);
  const n = {
    aufgaben: s.tasksOpen,
    meilensteine: s.msTotal,
    zeit: data.timeEntries.filter((e) => e.projectId === id).length,
    investitionen: data.investments.filter((e) => e.projectId === id).length + (data.incomes || []).filter((e) => e.projectId === id).length,
    logbuch: data.notes.filter((e) => e.projectId === id).length,
    dokumente: data.docs.filter((e) => e.projectId === id).length,
  };
  const tabs = [
    ['uebersicht', tr('Übersicht')], ['aufgaben', tr('Aufgaben')], ['meilensteine', tr('Meilensteine')], ['zeitplan', tr('Zeitplan')],
    ['zeit', tr('Zeit')], ['investitionen', tr('Finanzen')], ['logbuch', tr('Logbuch')], ['dokumente', tr('Dokumente')],
  ];
  const body = {
    uebersicht: projectOverview, aufgaben: projectTasks, meilensteine: projectMilestones,
    zeit: projectTime, investitionen: projectInvestments, logbuch: projectNotes, dokumente: projectDocs, zeitplan: projectSchedule,
  }[tab] || projectOverview;

  return `
    ${p.archived ? `<div class="banner archived-banner"><span>🗄️ ${tr('Dieses Projekt ist archiviert ({date}). Es erscheint nicht mehr in der Übersicht, in Listen und Auswahlfeldern.', { date: fmtDate(p.archivedAt) })}</span>
      <button class="btn small primary" data-action="unarchiveProject" data-id="${p.id}">${tr('Wiederherstellen')}</button></div>` : ''}
    <div class="page-head">
      <div>
        <div class="project-title">
          <span class="dot-color" style="background:${esc(p.color)}"></span>
          <h1 style="margin:0">${esc(p.name)}</h1>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <select class="inline-select" data-change="setStatus" data-id="${p.id}" aria-label="${tr('Status')}">
            ${STATUS.map((st) => `<option value="${st.value}" ${st.value === p.status ? 'selected' : ''}>${st.label}</option>`).join('')}
          </select>
          ${p.category ? `<span class="badge">${esc(p.category)}</span>` : ''}
          ${(p.teamIds || []).map((id) => data.teams.find((tm) => tm.id === id)).filter(Boolean).map(teamBadge).join('')}
          ${healthBadge(s)}
        </div>
      </div>
      <div class="btn-row">
        ${data.timer?.projectId === p.id
          ? `<button class="btn primary" data-action="stopTimer">■ ${data.timer.mode === 'pomodoro' ? tr('Pomodoro beenden') : tr('Timer stoppen')}</button>`
          : `<button class="btn primary" data-action="startPomodoro" data-id="${p.id}" title="${tr('{m} Min Fokus, dann Pause', { m: pomoCfg().work })}">🍅 Pomodoro</button>
             <button class="btn" data-action="startTimer" data-id="${p.id}" title="${tr('Stoppuhr ohne feste Dauer')}">${tr('▶ Stoppuhr')}</button>`}
        <button class="btn" data-action="addTime" data-id="${p.id}">${tr('+ Zeit')}</button>
        <button class="btn" data-action="editProject" data-id="${p.id}">${tr('Bearbeiten')}</button>
        <button class="btn danger" data-action="deleteProject" data-id="${p.id}">${tr('Löschen')}</button>
        ${qaButton(p)}
      </div>
    </div>
    <nav class="tabs">
      ${tabs.map(([k, l]) => `<a href="#/projekt/${p.id}/${k}" class="${k === tab ? 'active' : ''}">${l}${n[k] ? `<span class="count">${n[k]}</span>` : ''}</a>`).join('')}
    </nav>
    ${body(p, s)}`;
}

function projectOverview(p, s) {
  const editing = editState?.kind === 'project' && editState.pid === p.id;
  const cfg = editing ? editState.draft : projectLayoutFor(p);
  return `
    ${editing ? editBar() : ''}
    ${s.health === 'warn' || s.health === 'kritisch' ? staleBanner(p, s, { withOpen: false }) : ''}
    ${editing ? '' : `<div class="dash-head view-head">
      <span class="small muted">${p.layout ? tr('🎯 Eigene Anordnung für dieses Projekt') : ''}</span>
      <button class="btn small" data-action="customizeProject" data-id="${p.id}">✏️ ${tr('Ansicht anpassen')}</button>
    </div>`}
    ${!editing && layoutEmpty(cfg) ? layoutIntro('project', p) : renderLayoutGrid(cfg, PROJECT_DEFS, (id) => renderProjectWidget(id, p, s, cfg), { edit: editing, statDefs: PROJECT_STATS })}`;
}

/** Kennzahl-Kacheln eines Projekts */
function projectStatTiles(p, s) {
  const hourGoal = Number(p.hourGoal) || 0;
  const budget = Number(p.budget) || 0;
  const wk = weekMinutes(0, p.id), wGoal = projectWeeklyMin(p);
  return {
        progress: s.hasProgress ? `<div class="stat"><div class="label">${tr('Fortschritt')}</div><div class="value">${s.progress}%</div>${progressBar(s.progress, s.progress === 100 ? 'good' : '')}
          <div class="sub">${s.msTotal ? tr('{done}/{n} Meilensteine', { done: s.msDone, n: s.msTotal }) : tr('{done}/{n} Aufgaben', { done: s.tasksDone, n: s.tasksTotal })}</div></div>`
          : `<div class="stat"><div class="label">${tr('Fortschritt')}</div><div class="value muted">–</div><div class="sub">${tr('Lege Aufgaben oder Meilensteine an, um den Fortschritt zu sehen.')}</div></div>`,
        total: `<div class="stat"><div class="label">${tr('Zeit gesamt')}</div><div class="value">${fmtHours(s.minutes)}</div>
          ${hourGoal ? progressBar((s.minutes / 60 / hourGoal) * 100, s.minutes / 60 > hourGoal ? 'over' : '') + `<div class="sub">${tr('von {h} geplant', { h: fmtStd(hourGoal) })}</div>` : `<div class="sub">${tr('keine Gesamtzeit geplant')}</div>`}</div>`,
        week: `<div class="stat"><div class="label">${tr('Diese Woche')}</div><div class="value">${fmtHours(wk)}</div>
          ${wGoal ? progressBar((wk / wGoal) * 100, wk >= wGoal ? 'good' : '') + `<div class="sub">${tr('Wochenziel: {h}', { h: fmtStd(wGoal / 60) })}${p.status === 'aktiv' ? '' : ` ${tr('(zählt nur bei aktiven Projekten)')}`}</div>`
            : `<div class="sub">${tr('kein eigenes Wochenziel')}</div>`}</div>`,
        invested: `<div class="stat"><div class="label">${tr('Investiert')}</div><div class="value">${fmtEUR(s.invested)}</div>
          ${budget ? progressBar((s.invested / budget) * 100, s.invested > budget ? 'over' : '') + `<div class="sub">${tr('Budget {b}', { b: fmtEUR(budget) })} · ${s.invested > budget ? tr('überschritten') : tr('{amount} übrig', { amount: fmtEUR(budget - s.invested) })}</div>` : `<div class="sub">${tr('kein Budget festgelegt')}</div>`}</div>`,
        profit: `<div class="stat"><div class="label">${tr('Gewinn/Verlust')}</div><div class="value ${s.profit > 0 ? 'pos' : s.profit < 0 ? 'neg' : ''}">${s.profit > 0 ? '+' : ''}${fmtEUR(s.profit)}</div>
          <div class="sub">${s.income || s.invested ? tr('{inc} Einnahmen · {inv} Ausgaben', { inc: fmtEUR(s.income), inv: fmtEUR(s.invested) }) : tr('noch keine Einnahmen')}</div></div>`,
        openTasks: `<div class="stat"><div class="label">${tr('Offene Aufgaben')}</div><div class="value">${s.tasksOpen}</div><div class="sub">${tr('{n} erledigt', { n: s.tasksDone })}</div></div>`,
        target: `<div class="stat"><div class="label">${tr('Zieltermin')}</div><div class="value" style="font-size:1.15rem">${p.targetDate ? fmtDate(p.targetDate) : '–'}</div><div class="sub">${p.targetDate ? fmtRelative(p.targetDate) : tr('kein Zieltermin')}</div></div>`,
        lastActive: `<div class="stat"><div class="label">${tr('Zuletzt aktiv')}</div><div class="value" style="font-size:1.15rem">${fmtRelative(s.last)}</div><div class="sub">${s.last ? fmtDate(s.last) : ''}</div></div>`,
  };
}

function renderProjectWidget(id, p, s, cfg) {
  if (id.startsWith('pstat:')) {
    const key = id.slice(6);
    if (key === 'target' && !p.targetDate && !editState) return '';
    const html = projectStatTiles(p, s)[key];
    return html ? `<div class="stats stats-single">${html}</div>` : '';
  }
  switch (id) {
    case 'why':
      return p.why || p.goal ? `<section class="card">
          ${p.why ? `<h3>💭 ${tr('Warum ist mir das wichtig?')}</h3><p class="why" style="font-size:1rem">${tr('„{why}“', { why: esc(p.why) })}</p>` : ''}
          ${p.goal ? `<h3>🎯 ${tr('Ziel / Wann ist es fertig?')}</h3><p style="margin:0">${esc(p.goal)}</p>` : ''}
        </section>`
        : `<div class="callout">💡 ${tr('Tipp: Trage unter <a href="#" data-action="editProject" data-id="{id}">Bearbeiten</a> ein, <b>warum</b> dir das Projekt wichtig ist. Das wird dir angezeigt, wenn das Projekt einzuschlafen droht.', { id: p.id })}</div>`;

    case 'stats': {
      const tiles = projectStatTiles(p, s);
      const shown = cfg.stats.filter((t) => tiles[t] && (t !== 'target' || p.targetDate || editState));
      return shown.length ? `<div class="stats">${shown.map((t) => tiles[t]).join('')}</div>` : '';
    }

    case 'next':
      return `<section class="card">
        <div class="card-head"><h2>👉 ${tr('Nächster Schritt')}</h2><button class="btn small" data-action="addTask" data-id="${p.id}">${tr('+ Aufgabe')}</button></div>
        ${s.next ? `<ul class="list">${taskItem(s.next)}</ul>` : `<div class="empty">${tr('Keine offene Aufgabe. Was ist der kleinste nächste Schritt?')}</div>`}
      </section>`;

    case 'milestones': {
      const ms = sortMilestonesOf(p.id).filter((m) => !m.done).slice(0, 3);
      return `<section class="card">
        <div class="card-head"><h2>🏁 ${tr('Nächste Meilensteine')}</h2><button class="btn small" data-action="addMilestone" data-id="${p.id}">${tr('+ Meilenstein')}</button></div>
        ${ms.length ? `<ul class="list">${ms.map((m) => milestoneItem(m)).join('')}</ul>` : `<div class="empty">${tr('Keine offenen Meilensteine.')}</div>`}
      </section>`;
    }

    case 'hours':
      return `<section class="card"><div class="card-head"><h2>⏱️ ${chartTitle()}</h2>${periodSwitch()}</div>${weekBars(p.id)}</section>`;

    case 'recent': {
      const recent = recentActivity(p.id).slice(0, 8);
      return `<section class="card">
        <div class="card-head"><h2>🕘 ${tr('Letzte Aktivitäten')}</h2><button class="btn small" data-action="addNote" data-id="${p.id}">${tr('+ Notiz')}</button></div>
        ${recent.length ? `<ul class="list">${recent.map((a) => `<li><div class="grow"><div class="title">${a.icon} ${esc(a.text)}</div><div class="meta">${fmtDate(a.date)}</div></div></li>`).join('')}</ul>` : `<div class="empty">${tr('Noch keine Aktivitäten.')}</div>`}
      </section>`;
    }

    case 'description':
      return p.description ? `<section class="card"><h2>📝 ${tr('Beschreibung')}</h2><p style="white-space:pre-wrap;margin:0">${esc(p.description)}</p></section>` : '';

    case 'tasks': {
      const open = sortTasks(data.tasks.filter((t) => t.projectId === p.id && !t.done));
      return `<section class="card">
        <div class="card-head"><h2>✅ ${tr('Offene Aufgaben')} (${open.length})</h2><a class="btn small" href="#/projekt/${p.id}/aufgaben">${tr('Alle')}</a></div>
        ${open.length ? `<ul class="list">${open.slice(0, 5).map((x) => taskItem(x)).join('')}</ul>` : `<div class="empty">${tr('Keine offenen Aufgaben. 🎉')}</div>`}
      </section>`;
    }

    case 'docs': {
      const docs = data.docs.filter((d) => d.projectId === p.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      if (!docs.length) return '';
      return `<section class="card">
        <div class="card-head"><h2>📎 ${tr('Dokumente')}</h2><a class="btn small" href="#/projekt/${p.id}/dokumente">${tr('Alle')}</a></div>
        <ul class="list doc-list">${docs.slice(0, 6).map((d) => docRow(d, { compact: true })).join('')}</ul>
      </section>`;
    }

    case 'invest': {
      const items = data.investments.filter((e) => e.projectId === p.id);
      const byCat = {};
      items.forEach((i) => (byCat[i.category || tr('Sonstiges')] = (byCat[i.category || tr('Sonstiges')] || 0) + i.amount));
      return `<section class="card">
        <div class="card-head"><h2>💶 ${tr('Investitionen')} · ${fmtEUR(s.invested)}</h2><a class="btn small" href="#/projekt/${p.id}/investitionen">${tr('Alle')}</a></div>
        ${items.length ? `<dl class="kv">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmtEUR(v)}</dd>`).join('')}</dl>` : `<div class="empty">${tr('Noch keine Investitionen.')}</div>`}
      </section>`;
    }
  }
  return '';
}

function recentActivity(pid) {
  const out = [];
  data.timeEntries.filter((e) => e.projectId === pid).forEach((e) => out.push({ date: e.date, icon: '⏱️', text: `${fmtDuration(e.minutes)} – ${entryTitle(e)}` }));
  data.investments.filter((e) => e.projectId === pid).forEach((e) => out.push({ date: e.date, icon: '💶', text: `${fmtEUR(e.amount)} – ${e.description}` }));
  data.tasks.filter((t) => t.projectId === pid && t.done).forEach((t) => out.push({ date: t.doneAt, icon: '✅', text: t.title }));
  data.milestones.filter((m) => m.projectId === pid && m.done).forEach((m) => out.push({ date: m.doneAt, icon: '🏁', text: tr('Meilenstein erreicht: {title}', { title: m.title }) }));
  data.notes.filter((n) => n.projectId === pid).forEach((n) => out.push({ date: n.date, icon: '📝', text: n.text }));
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function projectTasks(p) {
  const tasks = data.tasks.filter((t) => t.projectId === p.id && matchesWho(t, taskWhoFilter));
  const open = sortTasks(tasks.filter((t) => !t.done));
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const viewSwitch = `<div class="segmented" role="group" aria-label="${tr('Ansicht')}">
      <button type="button" class="seg-btn ${taskView === 'list' ? 'active' : ''}" data-action="setTaskView" data-id="list" aria-pressed="${taskView === 'list'}">☰ <span>${tr('Liste')}</span></button>
      <button type="button" class="seg-btn ${taskView === 'board' ? 'active' : ''}" data-action="setTaskView" data-id="board" aria-pressed="${taskView === 'board'}">▥ <span>${tr('Board')}</span></button></div>`;
  if (taskView === 'board') return `<section class="card">
    <div class="card-head"><h2>${tr('Aufgaben')} (${tasks.length})</h2><span class="btn-row">${viewSwitch}<button class="btn primary small" data-action="addTask" data-id="${p.id}">${tr('+ Aufgabe')}</button></span></div>
    ${whoFilterChips(p)}
    ${kanbanBoard(open, done)}
  </section>`;
  return `<section class="card">
    <div class="card-head"><h2>${tr('Offene Aufgaben')} (${open.length})</h2><span class="btn-row">${viewSwitch}<button class="btn primary small" data-action="addTask" data-id="${p.id}">${tr('+ Aufgabe')}</button></span></div>
    ${whoFilterChips(p)}
    ${open.length ? PRIORITIES.map(({ value, label }) => {
      const group = open.filter((t) => (t.priority || 'mittel') === value);
      return group.length ? `<h3 class="task-group"><span class="badge ${value}">${label}</span> <span class="muted small">${group.length}</span></h3>
        <ul class="list">${group.map((t) => taskItem(t)).join('')}</ul>` : '';
    }).join('') : `<div class="empty">${tr('Keine offenen Aufgaben. 🎉')}</div>`}
    ${done.length ? `<details class="done-list"><summary>${tr('Erledigt')} (${done.length})</summary><ul class="list">${done.map((t) => taskItem(t)).join('')}</ul></details>` : ''}
  </section>`;
}

function projectMilestones(p) {
  const ms = sortMilestonesOf(p.id);
  const manual = p.msSort === 'manual';
  return `<section class="card">
    <div class="card-head"><h2>${tr('Meilensteine')}</h2><button class="btn primary small" data-action="addMilestone" data-id="${p.id}">${tr('+ Meilenstein')}</button></div>
    ${ms.length > 1 ? `<div class="ms-sort">
      <span class="small muted">${tr('Reihenfolge:')}</span>
      <div class="segmented" role="radiogroup" aria-label="${tr('Reihenfolge der Meilensteine')}">
        <button type="button" class="seg-btn ${manual ? '' : 'active'}" data-action="setMilestoneSort" data-id="${p.id}" data-mode="date" aria-pressed="${!manual}">📅 ${tr('Nach Zieldatum')}</button>
        <button type="button" class="seg-btn ${manual ? 'active' : ''}" data-action="setMilestoneSort" data-id="${p.id}" data-mode="manual" aria-pressed="${manual}">✋ ${tr('Eigene Reihenfolge')}</button>
      </div>
      ${manual ? `<span class="small muted">${tr('Mit ↑ ↓ verschieben.')}</span>` : ''}
    </div>` : ''}
    ${ms.length ? `<ul class="list">${ms.map((m, i) => milestoneItem(m, { move: manual ? { first: i === 0, last: i === ms.length - 1 } : null })).join('')}</ul>`
      : `<div class="empty">${tr('Noch keine Meilensteine. Teile dein Projekt in 3–5 große Etappen auf – das macht Fortschritt sichtbar.')}</div>`}
  </section>`;
}

function entryTaskLabel(e) {
  const tk = e.taskId && data.tasks.find((t) => t.id === e.taskId);
  return tk && tk.title !== e.title ? `<span>☑ ${esc(tk.title)}</span>` : '';
}

function projectTime(p) {
  const entries = data.timeEntries.filter((e) => e.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(entries, (e) => e.minutes);
  return `${taskTimeCard(p, total)}<section class="card">
    <div class="card-head"><h2>${tr('Zeiteinträge')} · ${fmtHours(total)}</h2><span class="btn-row"><button class="btn small" data-action="importCsv" data-id="${p.id}" title="${tr('Zeit & Investitionen aus CSV importieren')}">⬆ CSV</button><button class="btn primary small" data-action="addTime" data-id="${p.id}">${tr('+ Zeit')}</button></span></div>
    ${entries.length ? `<ul class="list">${entries.map((e) => `
      <li>
        <div class="grow">
          <div class="title">${esc(entryTitle(e))}</div>
          <div class="meta"><span class="amount">⏱️ ${fmtDuration(e.minutes)}</span>${e.autoTitle ? '' : `<span>${esc(autoTimeTitle(e.date))}</span>`}${entryTaskLabel(e)}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>
        <div class="actions">
          <button class="btn ghost icon" data-action="editTime" data-id="${e.id}" title="${tr('Bearbeiten')}">✎</button>
          <button class="btn ghost icon danger" data-action="deleteTime" data-id="${e.id}" title="${tr('Löschen')}">🗑</button>
        </div>
      </li>`).join('')}</ul>` : `<div class="empty">${tr('Noch keine Zeit erfasst. Starte den Timer oder trage Zeit manuell ein.')}</div>`}
  </section>`;
}

/** Schätzung vs. Ist je Aufgabe */
function taskTimeCard(p, total) {
  const rows = sortTasks(data.tasks.filter((t) => t.projectId === p.id)).map((t) => ({ t, spent: taskMinutes(t.id), est: t.estimate || 0 })).filter((x) => x.spent || x.est);
  if (!rows.length) return '';
  const booked = sum(rows, (x) => x.spent), est = sum(rows, (x) => x.est);
  const doneRows = rows.filter((x) => x.t.done && x.est && x.spent);
  const ratio = doneRows.length ? sum(doneRows, (x) => x.spent) / sum(doneRows, (x) => x.est) : 0;
  return `<section class="card">
    <h2>⏱ ${tr('Schätzung vs. Ist')}</h2>
    <p class="small muted" style="margin-top:0">${tr('{booked} auf Aufgaben gebucht ({pct} % der Projektzeit), {est} geschätzt.', { booked: fmtHours(booked), pct: total ? Math.round((booked / total) * 100) : 0, est: fmtHours(est) })}
      ${ratio ? (ratio > 1.1 ? tr('Erledigte Aufgaben dauerten im Schnitt {x} × so lange wie geschätzt.', { x: fmtNum(ratio, 1) }) : ratio < 0.9 ? tr('Erledigte Aufgaben gingen im Schnitt schneller als geschätzt ({x} ×).', { x: fmtNum(ratio, 1) }) : tr('Deine Schätzungen treffen ziemlich genau. 🎯')) : ''}</p>
    <ul class="list">${rows.map(({ t, spent, est }) => `<li class="${t.done ? 'done' : ''}"><div class="grow">
      <div class="row-between"><span class="title">${esc(t.title)}</span>${taskTimeBadge(t)}</div>
      ${est ? `<div style="margin-top:6px">${progressBar(Math.min(100, (spent / est) * 100), spent > est ? 'bad' : t.done ? 'good' : '')}</div>` : ''}
    </div></li>`).join('')}</ul>
  </section>`;
}

function projectInvestments(p) {
  const items = data.investments.filter((e) => e.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(items, (e) => e.amount);
  const byCat = {};
  items.forEach((i) => (byCat[i.category || tr('Sonstiges')] = (byCat[i.category || tr('Sonstiges')] || 0) + i.amount));
  const budget = Number(p.budget) || 0;
  const incomes = (data.incomes || []).filter((e) => e.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const income = sum(incomes, (e) => e.amount), profit = income - total;
  const hours = sum(data.timeEntries.filter((e) => e.projectId === p.id), (e) => e.minutes) / 60;
  const tile = (label, value, sub = '', cls = '') => `<div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
  return `<div class="stats week-stats">
    ${tile(tr('Einnahmen'), fmtEUR(income), trp(incomes.length, '{n} Eintrag', '{n} Einträge'))}
    ${tile(tr('Ausgaben'), fmtEUR(total), budget ? tr('Budget {b}', { b: fmtEUR(budget) }) : '')}
    ${tile(tr('Gewinn/Verlust'), `${profit > 0 ? '+' : ''}${fmtEUR(profit)}`, total ? tr('Rendite {pct} %', { pct: fmtNum((profit / total) * 100, 0) }) : '', profit > 0 ? 'pos' : profit < 0 ? 'neg' : '')}
    ${tile(tr('Pro Stunde'), hours >= 0.5 ? fmtEUR(profit / hours) : '–', hours >= 0.5 ? tr('Ergebnis ÷ {h}', { h: fmtHours(hours * 60) }) : tr('noch zu wenig Zeit erfasst'), profit > 0 ? 'pos' : profit < 0 ? 'neg' : '')}
  </div>
  ${total && income < total && income > 0 ? `<div class="card"><div class="row-between small"><span>${tr('Bis zur Gewinnschwelle')}</span><span>${fmtEUR(total - income)}</span></div>${progressBar((income / total) * 100)}</div>` : ''}
  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h2>💰 ${tr('Einnahmen')} · ${fmtEUR(income)}</h2><button class="btn primary small" data-action="addIncome" data-id="${p.id}">${tr('+ Einnahme')}</button></div>
      ${incomes.length ? investmentMonths(p.id, incomes, 'income') : `<div class="empty">${tr('Noch keine Einnahmen erfasst – z. B. Verkäufe, Honorare oder Fördergelder.')}</div>`}
    </section>
    <section class="card">
      <div class="card-head"><h2>💶 ${tr('Investitionen')} · ${fmtEUR(total)}</h2><span class="btn-row"><button class="btn small" data-action="importCsv" data-id="${p.id}" title="${tr('Zeit & Investitionen aus CSV importieren')}">⬆ CSV</button><button class="btn primary small" data-action="addInvestment" data-id="${p.id}">${tr('+ Investition')}</button></span></div>
      ${items.length ? investmentMonths(p.id, items, 'inv') : `<div class="empty">${tr('Noch keine Investitionen erfasst.')}</div>`}
    </section>
    <section class="card">
      <h2>${tr('Nach Kategorie')}</h2>
      ${Object.keys(byCat).length ? `<dl class="kv">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmtEUR(v)} <span class="muted small">(${Math.round((v / total) * 100)}%)</span></dd>`).join('')}</dl>` : '<div class="empty">–</div>'}
      ${budget ? `<h3 style="margin-top:16px">${tr('Budget')}</h3>${progressBar((total / budget) * 100, total > budget ? 'over' : '')}<p class="small muted" style="margin-top:6px">${tr('{a} von {b}', { a: fmtEUR(total), b: fmtEUR(budget) })}</p>` : ''}
    </section>
  </div>`;
}

/* Investitionen nach Monat gruppiert: aktueller Monat aufgeklappt, ältere eingeklappt mit Monatssumme.
   Selbst auf- oder zugeklappte Monate bleiben so, bis die Seite neu geladen wird. */
const invMonthState = new Map(); // `${pid}|YYYY-MM` → true (offen) / false (zu)
function investmentMonths(pid, items, kind = 'inv') {
  const inc = kind === 'income';
  const current = todayISO().slice(0, 7);
  const groups = new Map();
  items.forEach((e) => { const k = (e.date || '').slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
  return `<div class="inv-months">${[...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, list]) => {
    const key = `${kind}|${pid}|${month}`;
    const open = invMonthState.has(key) ? invMonthState.get(key) : month === current;
    const name = month ? new Date(`${month}-01T00:00:00`).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) : '–';
    return `<details class="inv-month" data-inv-month="${esc(key)}" ${open ? 'open' : ''}>
      <summary><span class="inv-month-name">${esc(name)}${month === current ? ` <span class="badge aktiv">${tr('aktueller Monat')}</span>` : ''}</span>
        <span class="small muted">${inc ? trp(list.length, '{n} Einnahme', '{n} Einnahmen') : trp(list.length, '{n} Investition', '{n} Investitionen')}</span>
        <span class="amount">${fmtEUR(sum(list, (e) => e.amount))}</span></summary>
      <ul class="list">${list.map((e) => `
        <li>
          <div class="grow"><div class="title">${esc(e.description)}</div><div class="meta">${fmtDate(e.date)} <span class="badge">${esc(e.category || tr('Sonstiges'))}</span></div></div>
          <span class="amount ${inc ? 'pos' : ''}">${inc ? '+' : ''}${fmtEUR(e.amount)}</span>
          <div class="actions">
            <button class="btn ghost icon" data-action="${inc ? 'editIncome' : 'editInvestment'}" data-id="${e.id}" title="${tr('Bearbeiten')}">✎</button>
            <button class="btn ghost icon danger" data-action="${inc ? 'deleteIncome' : 'deleteInvestment'}" data-id="${e.id}" title="${tr('Löschen')}">🗑</button>
          </div>
        </li>`).join('')}</ul>
    </details>`;
  }).join('')}</div>`;
}
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d instanceof HTMLDetailsElement && d.dataset.invMonth) invMonthState.set(d.dataset.invMonth, d.open);
}, true);

function projectNotes(p) {
  const notes = data.notes.filter((n) => n.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `<section class="card">
    <div class="card-head"><h2>${tr('Logbuch')}</h2><button class="btn primary small" data-action="addNote" data-id="${p.id}">${tr('+ Notiz')}</button></div>
    <p class="small muted">${tr('Halte Gedanken, Ideen, Entscheidungen und kleine Erfolge fest. Jede Notiz zählt als Aktivität.')}</p>
    ${notes.length ? `<ul class="list">${notes.map((n) => `
      <li>
        <div class="grow"><div class="title" style="white-space:pre-wrap;font-weight:400">${esc(n.text)}</div><div class="meta">${fmtDate(n.date)}</div></div>
        <div class="actions">
          <button class="btn ghost icon" data-action="editNote" data-id="${n.id}" title="${tr('Bearbeiten')}">✎</button>
          <button class="btn ghost icon danger" data-action="deleteNote" data-id="${n.id}" title="${tr('Löschen')}">🗑</button>
        </div>
      </li>`).join('')}</ul>` : `<div class="empty">${tr('Noch keine Einträge.')}</div>`}
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
        <div class="field-label">${tr('Sprache')}</div>
        <div class="segmented" role="radiogroup" aria-label="${tr('Sprache')}">
          ${[['auto', `🌐 ${tr('Automatisch')}`], ...LANGUAGES].map(([v, l]) => `<label><input type="radio" name="language" value="${v}" data-lang-opt ${v === (set.language || 'auto') ? 'checked' : ''}>${esc(l)}</label>`).join('')}
        </div>
        <div class="hint" style="margin-top:6px">${tr('„Automatisch“ verwendet die Sprache deines Geräts (zurzeit: {lang}).', { lang: esc((LANGUAGES.find(([c]) => c === detectLang('auto')) || [, ''])[1]) })}</div>
      </div>
      <div>
        <div class="field-label">${tr('Hintergrund')}</div>
        <div class="segmented" role="radiogroup" aria-label="${tr('Hintergrund')}">
          ${THEMES.map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" data-theme-opt ${v === theme ? 'checked' : ''}>${tr(l)}</label>`).join('')}
        </div>
        <div class="hint" style="margin-top:6px">${tr('„Wie Gerät“ folgt automatisch dem Hell-/Dunkelmodus deines iPhones, iPads, Macs oder PCs.')}</div>
      </div>
      <div>
        <div class="field-label">${tr('Akzentfarbe')}</div>
        <div class="swatches">
          ${ACCENTS.map(([c, name]) => `<button type="button" class="swatch ${c === accent ? 'active' : ''}" style="background:${c}" data-accent="${c}" title="${tr(name)}" aria-label="${tr(name)}"></button>`).join('')}
          <label class="swatch-custom ${isPreset ? '' : 'active'}">
            <input type="color" id="accent-custom" value="${esc(accent)}" aria-label="${tr('Eigene Farbe')}"> ${tr('Eigene Farbe')}
          </label>
        </div>
      </div>
      <div>
        <div class="field-label">${tr('Animation im Motivationsbereich (Übersicht)')}</div>
        <div class="segmented" role="radiogroup" aria-label="${tr('Animation')}">
          ${BANNER_FX.map(([v, l]) => `<label><input type="radio" name="bannerFx" value="${v}" data-fx-opt ${(set.bannerFx || 'both') === v ? 'checked' : ''}>${tr(l)}</label>`).join('')}
        </div>
        <div class="hint" style="margin-top:6px">${tr('Das warme Glühen wird kräftiger, je länger deine Serie ist. Der Balken zeigt dein Wochenziel.')}</div>
      </div>
      <div>
        <div class="field-label">${tr('Vorschau')}</div>
        <div class="theme-preview">
          <button type="button" class="btn primary small">${tr('Primärer Knopf')}</button>
          <span class="badge abgeschlossen">${tr('Abgeschlossen')}</span>
          <a href="#/einstellungen">Link</a>
          <div style="width:120px">${progressBar(65)}</div>
          <span class="chip active">Filter</span>
        </div>
      </div>
    </div>`;
}

function renderReminderSettings() {
  const set = data.settings;
  const texts = Array.isArray(set.reminderTexts) && set.reminderTexts.length ? set.reminderTexts : defaultReminders();
  const on = set.remindersOn !== false;
  return `
    ${settingToggle('remindersOn', on, tr('Erinnerungen anzeigen'), tr('Ausgeschaltet gibt es keine Hinweise, keinen Bereich „Braucht Aufmerksamkeit“ und keine gelb/rot markierten Projekte.'))}
    <p class="small muted">${tr('Diese Hinweise erscheinen auf der Übersicht und im Projekt, wenn ein aktives Projekt zu lange ruht. Pro Projekt kannst du unter <i>Bearbeiten</i> zusätzlich einen eigenen Text und eine eigene Anzahl Tage festlegen.')}</p>
    <div class="grid-2 ${on ? '' : 'is-off'}">
      <form class="form" style="padding:0" data-form="reminders">
        <label>${tr('Projekt gilt als „eingeschlafen“ nach … Tagen ohne Aktivität')}
          <input type="number" min="1" step="1" name="staleDays" value="${esc(set.staleDays)}">
          <span class="hint">${tr('Ab dem doppelten Wert wird das Projekt rot markiert und oben auf der Übersicht angezeigt.')}</span>
        </label>
        <label>${tr('Deine Erinnerungstexte – ein Text pro Zeile')}
          <textarea name="reminderTexts" class="autogrow" rows="4">${esc(texts.join('\n'))}</textarea>
          <span class="hint">${tr('Bei mehreren Texten wechselt die Erinnerung jeden Tag.')}</span>
        </label>
        <div class="placeholders">
          <span class="hint">${tr('Platzhalter antippen zum Einfügen:')}</span>
          ${placeholders().map(([k, d]) => `<button type="button" class="chip" data-insert="${k}" title="${esc(d)}">${k} <span class="muted">${esc(d)}</span></button>`).join('')}
        </div>
        <label class="check-row"><input type="checkbox" name="reminderShowWhy" ${set.reminderShowWhy !== false ? 'checked' : ''}> ${tr('Mein „Warum“ unter der Erinnerung anzeigen')}</label>
        <label class="check-row"><input type="checkbox" name="reminderShowNext" ${set.reminderShowNext !== false ? 'checked' : ''}> ${tr('Nächsten Schritt anzeigen')}</label>
        <label>${tr('Minuten im Knopf „Nur … Minuten“')}
          <input type="number" min="1" max="240" step="1" name="reminderMinutes" value="${esc(set.reminderMinutes || 25)}">
        </label>
        <div class="form-actions">
          <button type="button" class="btn" data-action="resetReminders">${tr('Standardtexte')}</button>
          <button class="btn primary" type="submit">${tr('Speichern')}</button>
        </div>
      </form>
      <div>
        <h3>${tr('Vorschau')}</h3>
        <div id="reminder-preview">${reminderPreview(texts, set)}</div>
      </div>
    </div>`;
}

function previewProject() {
  const active = liveProjects().filter((p) => p.status === 'aktiv').map((p) => ({ p, s: projectStats(p) }));
  active.sort((a, b) => b.s.idle - a.s.idle);
  if (active.length) return { ...active[0], s: { ...active[0].s, idle: Math.max(active[0].s.idle, 14) } };
  return { p: { id: 'preview', name: tr('Mein Projekt'), why: tr('Weil es mir Freude macht.'), goal: tr('Fertig und veröffentlicht') },
    s: { idle: 14, minutes: 600, next: { title: tr('Erste Skizze machen') } } };
}

function reminderPreview(texts, set) {
  const { p, s } = previewProject();
  const min = Number(set.reminderMinutes) || 25;
  const lines = texts.length ? texts : defaultReminders();
  return `<p class="small muted">${tr('Beispiel mit „{name}“ nach {n} Tagen:', { name: esc(p.name), n: s.idle })}</p>
    <ul class="list">${lines.map((tpl) => {
      const showWhy = set.reminderShowWhy !== false && p.why && !/\{(warum|why)\}/i.test(tpl);
      const showNext = set.reminderShowNext !== false && !/\{(schritt|step)\}/i.test(tpl);
      return `<li><div class="grow">
        <div class="title">😴 ${esc(fillReminder(tpl, p, s))}</div>
        ${showWhy ? `<div class="small why">${tr('Dein Warum: „{why}“', { why: esc(p.why) })}</div>` : ''}
        ${showNext && s.next ? `<div class="small muted">${tr('Kleinster nächster Schritt: {step}', { step: esc(s.next.title) })}</div>` : ''}
      </div></li>`;
    }).join('')}</ul>
    <p class="small muted">${tr('Knopf:')} <span class="badge">${tr('▶ Nur {n} Minuten', { n: min })}</span></p>`;
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
try { openSections = new Set(JSON.parse(localStorage.getItem(SECTIONS_KEY) || '[]').slice(-1)); } catch { /* ignorieren */ }
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
  if (!g.minutes) return tr('kein Ziel festgelegt');
  return g.source === 'projects'
    ? trp(g.projects.length, '{h} pro Woche · Summe aus {n} Projekt', '{h} pro Woche · Summe aus {n} Projekten', { h: fmtStd(g.minutes / 60) })
    : tr('{h} pro Woche · Standard', { h: fmtStd(g.minutes / 60) });
}

function renderWeeklyGoalSettings() {
  const g = weeklyGoal();
  const set = data.settings;
  const active = liveProjects().filter((p) => p.status === 'aktiv');
  return `
    <p class="small muted">${tr('Du kannst bei jedem Projekt unter <i>Bearbeiten</i> eine <b>Wochenarbeitszeit</b> eintragen. Dann ist dein Wochenziel die <b>Summe der Wochenzeiten aller aktiven Projekte</b>. Hat kein aktives Projekt eine Wochenzeit, gilt das Standard-Wochenziel.')}</p>
    ${active.length ? `<ul class="list weekly-list">${active.map((p) => `
      <li>
        <span class="dot-color" style="background:${esc(p.color)}"></span>
        <div class="grow"><a href="#/projekt/${p.id}">${esc(p.name)}</a></div>
        <span class="amount ${projectWeeklyMin(p) ? '' : 'muted'}">${projectWeeklyMin(p) ? fmtStd(projectWeeklyMin(p) / 60) : '–'}</span>
        <button class="btn ghost icon" data-action="editProject" data-id="${p.id}" title="${tr('Wochenzeit bearbeiten')}">✎</button>
      </li>`).join('')}
      <li class="weekly-total"><div class="grow"><b>${tr('Wochenziel gesamt')}</b>
        <div class="small muted">${g.source === 'projects' ? tr('Summe der Projekt-Wochenzeiten') : tr('kein Projekt hat eine Wochenzeit – Standard gilt')}</div></div>
        <span class="amount">${g.minutes ? fmtStd(g.minutes / 60) : '–'}</span><span style="width:40px"></span></li>
    </ul>` : `<p class="small muted">${tr('Noch keine aktiven Projekte.')}</p>`}
    <form class="form" style="padding:0;margin-top:16px" data-form="settings">
      <label>${tr('Standard-Wochenziel (Stunden für alle Projekte)')}
        <input type="number" min="0" step="0.5" name="weeklyHoursGoal" value="${esc(set.weeklyHoursGoal)}">
        <span class="hint">${g.source === 'projects'
          ? tr('⚠️ Wird gerade nicht verwendet, weil Projekte eigene Wochenzeiten haben.')
          : tr('Gilt, solange kein aktives Projekt eine eigene Wochenarbeitszeit hat.')}</span>
      </label>
      <div class="form-actions"><button class="btn primary" type="submit">${tr('Speichern')}</button></div>
    </form>`;
}

const SECTION_IDS = ['darstellung', 'uebersicht', 'wochenziel', 'pomodoro', 'erinnerungen', 'erfolge', 'team', 'app', 'sicherung', 'sync'];

/* ---------------------------- Installierbare App (PWA) -------------------- */
let installPrompt = null; // von Chrome/Edge angebotene Installation
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (parseRoute().view === 'einstellungen') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(tr('📲 Protrac wurde als App installiert.')); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Service Worker: offline nutzbar & installierbar (nur über https bzw. localhost, nicht als lokale Datei)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Service Worker läuft alles wie bisher */ });
}

function renderAppSettings() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = !ios && /Macintosh/.test(ua);
  const steps = [
    ['📱', 'iPhone & iPad', tr('In Safari auf <i>Teilen</i> tippen › <i>Zum Home-Bildschirm</i>. Danach Protrac immer über das Symbol öffnen.'), ios],
    ['💻', 'Mac (Safari)', tr('Menü <i>Ablage</i> › <i>Zum Dock hinzufügen</i> (ab macOS Sonoma).'), mac],
    ['🖥️', 'Windows (Edge) & Chrome', tr('In der Adressleiste auf das Symbol <i>App installieren</i> klicken oder Menü ⋯ › <i>Apps</i> › <i>Diese Website als App installieren</i>.'), !ios && !mac],
    ['🤖', 'Android (Chrome)', tr('Menü ⋮ › <i>App installieren</i> bzw. <i>Zum Startbildschirm hinzufügen</i>.'), /Android/.test(ua)],
  ];
  return `<p class="small muted">${tr('Protrac lässt sich wie eine App installieren: mit eigenem Fenster ohne Browserleiste, eigenem Symbol und Start auch ohne Internetverbindung. Es ist dieselbe Version wie im Browser – Updates kommen automatisch, deine Daten bleiben, wo sie sind. Die Browserversion kannst du weiterhin parallel nutzen.')}</p>
    ${isStandalone() ? `<div class="callout next">✅ ${tr('Du nutzt Protrac gerade als installierte App.')}</div>`
      : installPrompt ? `<div class="btn-row" style="margin-bottom:12px"><button class="btn primary" data-action="installApp">📲 ${tr('Jetzt als App installieren')}</button></div>` : ''}
    <ul class="app-steps">${steps.map(([ico, name, text, mine]) => `<li class="${mine ? 'mine' : ''}"><span>${ico}</span><div><b>${name}</b>${mine ? ` <span class="badge aktiv">${tr('dieses Gerät')}</span>` : ''}<div class="small muted">${text}</div></div></li>`).join('')}</ul>
    <p class="small muted">${tr('Hinweis: Jede installierte App und jeder Browser hat einen eigenen Speicher. Ohne eigenen Server überträgst du die Daten wie gewohnt per Sicherung.')}</p>`;
}

/** Ein-/Aus-Schalter für eine Einstellung (wird sofort gespeichert) */
function settingToggle(key, on, label, hint) {
  return `<label class="switch-row">
    <input type="checkbox" role="switch" data-setting-toggle="${key}" ${on ? 'checked' : ''}>
    <span class="switch" aria-hidden="true"></span>
    <span><b>${label}</b>${hint ? `<span class="hint">${hint}</span>` : ''}</span>
  </label>`;
}

function renderPomodoroSettings() {
  const st = data.settings, cfg = pomoCfg();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: tr('✔ Mitteilungen sind erlaubt.'), denied: tr('✖ Mitteilungen sind im Browser blockiert – du kannst sie in den Website-Einstellungen des Browsers wieder erlauben.'),
    default: tr('Mitteilungen wurden noch nicht erlaubt.'), unsupported: tr('Dieser Browser unterstützt hier keine Mitteilungen. Auf dem iPhone/iPad funktionieren sie nur, wenn der Tracker über den Home-Bildschirm geöffnet wird.') }[perm];
  return `
    <p class="small muted">${tr('Arbeite in festen Fokus-Abschnitten mit Pausen dazwischen. Starte einen Pomodoro auf der Projektseite über <b>🍅 Pomodoro</b>. Nach einer Pause startet der nächste Pomodoro erst auf Knopfdruck – so zählt nur echte Fokuszeit. Beim Beenden wird die gesammelte Fokuszeit als Zeiteintrag gespeichert.')}</p>
    <form class="form" style="padding:0" data-form="pomodoro" novalidate>
      <div class="row2">
        <label>${tr('Fokus (Minuten)')}<input type="number" min="1" max="180" step="1" name="pomoWork" value="${cfg.work}"></label>
        <label>${tr('Kurze Pause (Minuten)')}<input type="number" min="1" max="60" step="1" name="pomoShort" value="${cfg.short}"></label>
      </div>
      <div class="row2">
        <label>${tr('Lange Pause (Minuten)')}<input type="number" min="1" max="120" step="1" name="pomoLong" value="${cfg.long}"></label>
        <label>${tr('Lange Pause nach … Pomodoros')}<input type="number" min="1" max="12" step="1" name="pomoEvery" value="${cfg.every}"></label>
      </div>
      ${renderTimerSoundSettings(st)}
      <label class="check-row"><input type="checkbox" name="pomoSound" ${st.pomoSound !== false ? 'checked' : ''}> ${tr('Ton am Ende von Fokus und Pause')}</label>
      <label class="check-row"><input type="checkbox" name="pomoNotify" ${st.pomoNotify !== false ? 'checked' : ''}> ${tr('Mitteilung anzeigen, wenn der Tracker im Hintergrund ist')}</label>
      <div class="hint">${permText}
        ${perm === 'default' ? ` <button type="button" class="btn small" data-action="askNotify">${tr('Mitteilungen erlauben')}</button>` : ''}</div>
      <div class="hint">${tr('Hinweis: Auf iPhone und iPad hält Safari Webseiten im Hintergrund an. Das Signal kommt dort, sobald du den Tracker wieder öffnest – die Zeit stimmt trotzdem.')}</div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="testChime">🔔 ${tr('Ton testen')}</button>
        <button class="btn primary" type="submit">${tr('Speichern')}</button>
      </div>
    </form>`;
}

function renderSyncGuide() {
  const svc = syncService();
  return `<div class="help">
    <p>${tr('Die Regel ist einfach: <b>Beim Aufhören sichern (💾), beim Anfangen importieren.</b> Der Tracker erinnert dich daran: mit der gelben Leiste bei ungesicherten Änderungen, mit der blauen Leiste, wenn du ein Gerät länger nicht benutzt hast, und am Computer zusätzlich mit einer Rückfrage beim Schließen.')}</p>

    <div class="field-label">${tr('Welchen Dienst nutzt du?')}</div>
    <div class="segmented" role="radiogroup" aria-label="${tr('Dienst')}">
      ${syncServices().map((x) => `<label><input type="radio" name="syncService" value="${x.id}" data-sync-opt ${x.id === svc.id ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}
    </div>

    <p class="small muted" style="margin-top:12px">${svc.cloud
      ? tr('Stelle auf allen Geräten denselben Ordner als Download-Ordner ein: <b>{folder}</b>. Dann landet jede Sicherung automatisch dort und ist auf deinen anderen Geräten verfügbar. Beim Import wählst du die neueste Datei – der Dateiname enthält Datum und Uhrzeit.', { folder: esc(svc.folder) })
      : tr('Ohne Cloud-Dienst überträgst du die Sicherungsdatei selbst auf das andere Gerät und importierst sie dort. Der Dateiname enthält Datum und Uhrzeit.')}</p>

    <div class="grid-2 sync-devices">
      ${SYNC_DEVICES.map(([key, label]) => `<div>
        <h3>${tr(label)}</h3>
        <ol>${svc.steps[key].map((step) => `<li>${step}</li>`).join('')}</ol>
      </div>`).join('')}
    </div>

    <h3>${tr('Gut zu wissen')}</h3>
    <ul>
      <li>${tr('<b>iPhone & iPad:</b> Füge den Tracker über <i>Teilen › Zum Home-Bildschirm</i> hinzu und öffne ihn immer darüber. Sonst kann Safari die Daten nach 7 Tagen ohne Besuch löschen. Beim Schließen gibt es dort keine Rückfrage – achte auf die gelbe Leiste und den 💾-Knopf.')}</li>
      <li>${tr('<b>Chrome oder Edge am Mac:</b> Download-Ordner unter <i>Einstellungen › Downloads › Speicherort</i> festlegen.')}</li>
      <li>${tr('<b>Rückfrage beim Schließen:</b> Browser erlauben dort keinen eigenen Text. Bei „Diese Website verlassen?“ wähle „Abbrechen“ bzw. „Bleiben“ und tippe auf 💾 Sichern.')}</li>
    </ul>
  </div>`;
}

function renderSettings() {
  const set = data.settings;
  const size = new Blob([JSON.stringify(data)]).size;
  const accent = (set.accent || '#4f46e5').toLowerCase();
  const accentName = tr((ACCENTS.find(([c]) => c === accent) || [, 'Eigene Farbe'])[1]);
  const themeName = tr((THEMES.find(([v]) => v === (set.theme || 'system')) || [, ''])[1]).replace(/^\S+\s/, '');
  const langName = (LANGUAGES.find(([c]) => c === LANG) || [, ''])[1];
  const dash = dashboardConfig();
  const texts = Array.isArray(set.reminderTexts) && set.reminderTexts.length ? set.reminderTexts : defaultReminders();
  return `
    <div class="page-head">
      <div><h1>${tr('Einstellungen')}</h1><p>${tr('Tippe auf einen Bereich, um ihn zu öffnen.')}</p></div>
    </div>

    ${settingsSection('darstellung', '🎨', tr('Darstellung'),
      `🌐 ${esc(langName)} · ${esc(themeName)} · <span class="dot-color" style="background:${esc(accent)}"></span> ${esc(accentName)}`,
      renderAppearanceSettings())}

    ${settingsSection('uebersicht', '🧩', tr('Übersicht & Projektansicht'),
      tr('Übersicht: {shown} von {all} Bereichen · {n} Projekt(e) mit eigener Anordnung', { shown: dash.widgets.filter((w) => w.visible).length, all: dash.widgets.length, n: data.projects.filter((x) => x.layout).length }),
      `<p class="small muted">${tr('Angepasst wird direkt auf der jeweiligen Seite: Bereiche am ⠿-Griff ziehen, Breite wählen, aus- und einblenden – mit sofortiger Vorschau. Für die Projektansicht wählst du beim Speichern, ob die Anordnung für <b>alle Projekte</b> oder <b>nur für ein Projekt</b> gilt.')}</p>
      <div class="btn-row">
        <button type="button" class="btn primary" data-action="customizeDashboard">🧩 ${tr('Übersicht anpassen')}</button>
        ${data.projects.length ? `<button type="button" class="btn" data-action="customizeProject" data-id="${esc((data.projects.find((x) => x.status === 'aktiv') || data.projects[0]).id)}">🗂️ ${tr('Projektansicht anpassen')}</button>` : ''}
      </div>
      ${data.projects.some((x) => x.layout) ? `<h3 style="margin-top:16px">${tr('Projekte mit eigener Anordnung')}</h3>
        <ul class="list">${data.projects.filter((x) => x.layout).map((x) => `<li><span class="dot-color" style="background:${esc(x.color)}"></span>
          <div class="grow"><a href="#/projekt/${x.id}">${esc(x.name)}</a></div>
          <button type="button" class="btn small" data-action="resetProjectLayout" data-id="${x.id}">${tr('Gemeinsame Anordnung verwenden')}</button></li>`).join('')}</ul>` : ''}
      <div class="btn-row" style="margin-top:12px">
        <button type="button" class="btn small" data-action="resetAllLayouts">${tr('Alles auf Standard zurücksetzen')}</button>
      </div>`)}

    ${settingsSection('wochenziel', '🎯', tr('Wochenziel'), weeklyGoalSummary(), renderWeeklyGoalSettings())}

    ${settingsSection('pomodoro', '🍅', tr('Timer & Pomodoro'),
      `${tr('{w} Min Fokus · {s} / {l} Min Pause · lange Pause nach {e}', { w: pomoCfg().work, s: pomoCfg().short, l: pomoCfg().long, e: pomoCfg().every })} · ${(data.settings.timerSound || 'beep') !== 'beep' ? soundLabel() : timerBeepMin() === 1 ? tr('Erinnerungston jede Minute') : timerBeepMin() ? tr('Erinnerungston alle {n} Min', { n: timerBeepMin() }) : tr('kein Erinnerungston')}`,
      renderPomodoroSettings())}

    ${settingsSection('erinnerungen', '😴', tr('Erinnerungen bei eingeschlafenen Projekten'),
      set.remindersOn === false ? `<span class="badge">${tr('Ausgeschaltet')}</span>` : `${tr('nach {n} Tagen', { n: esc(set.staleDays) })} · ${trp(texts.length, '{n} Text', '{n} Texte')}`,
      renderReminderSettings())}

    ${settingsSection('team', '👥', tr('Team & Personen'),
      data.people.length || data.teams.length ? `${trp(data.people.length, '{n} Person', '{n} Personen')} · ${trp(data.teams.length, '{n} Team', '{n} Teams')}${currentPerson() ? ` · ${tr('ich')}: ${esc(currentPerson().name)}` : ''}`
        : tr('Personen und Teams anlegen und Aufgaben zuweisen'),
      renderTeamSettings())}

    ${settingsSection('vorlagen', '📋', tr('Projektvorlagen'),
      (data.templates || []).length ? trp(data.templates.length, '{n} eigene Vorlage', '{n} eigene Vorlagen') : tr('Mitgelieferte Vorlagen und eigene Vorlagen verwalten'),
      renderTemplateSettings())}

    ${settingsSection('app', '📲', tr('App installieren'),
      isStandalone() ? `<span class="badge aktiv">${tr('Als App geöffnet')}</span>` : tr('Eigenes Fenster, eigenes Symbol, auch offline'),
      renderAppSettings())}

    ${settingsSection('erfolge', '🏅', tr('Erfolge'),
      set.achievementsOn === false ? `<span class="badge">${tr('Ausgeschaltet')}</span>`
        : tr('{n} von {all} erreicht', { n: ACHIEVEMENTS.filter((a) => (data.achievements || {})[a.id]).length, all: ACHIEVEMENTS.length }),
      `${settingToggle('achievementsOn', set.achievementsOn !== false, tr('Erfolge anzeigen und feiern'), tr('Ausgeschaltet verschwindet der Bereich „Erfolge“ aus der Übersicht und es gibt keine Meldungen oder Konfetti dafür. Erreichte Erfolge werden trotzdem gemerkt.'))}`)}

    ${isServerMode() ? settingsSection('sicherung', '☁️', tr('Server-Speicherung'),
      tr('Automatisch gespeichert · zuletzt abgeglichen {when}', { when: esc(fmtDateTime(syncState.lastSync)) }),
      renderServerBackupSettings(size)) : settingsSection('sicherung', '💾', tr('Datensicherung'),
      `${tr('Letzte Sicherung: {when}', { when: esc(fmtDateTime(meta.lastExport)) })} ${hasUnsavedChanges() ? `<span class="badge mittel">${tr('nicht gesichert')}</span>` : ''}`,
      `<p class="small muted">${tr('Alle Daten werden nur lokal in diesem Browser gespeichert ({kb} KB).', { kb: fmtNum(size / 1024) })}
      ${syncService().cloud ? tr('Um sie auf deinen anderen Geräten zu nutzen, exportierst du eine Sicherung nach {svc} und importierst sie dort.', { svc: esc(syncService().name) }) : tr('Um sie auf deinen anderen Geräten zu nutzen, exportierst du eine Sicherung, überträgst sie und importierst sie dort.')}
      ${tr('Wie das geht, steht unter „Zwischen Geräten wechseln“.')}</p>
      <dl class="kv" style="margin-bottom:16px">
        <dt>${tr('Letzte Sicherung')}</dt><dd>${esc(fmtDateTime(meta.lastExport))}</dd>
        <dt>${tr('Letzte Änderung')}</dt><dd>${esc(fmtDateTime(meta.lastChange))} ${hasUnsavedChanges() ? `<span class="badge mittel">${tr('nicht gesichert')}</span>` : `<span class="badge aktiv">${tr('gesichert')}</span>`}</dd>
      </dl>
      <div class="btn-row">
        <button class="btn primary" data-action="exportData">⬇ ${tr('Backup exportieren (JSON)')}</button>
        <button class="btn" data-action="exportEncrypted">🔒 ${tr('Verschlüsselt exportieren')}</button>
        <button class="btn" data-action="exportCsv">⬇ ${tr('Zeit & Investitionen als CSV')}</button>
        <button class="btn" data-action="exportIcs">📅 ${tr('Termine als Kalender-Datei (.ics)')}</button>
        <button class="btn" data-action="importCsv">⬆ ${tr('Zeit & Investitionen aus CSV importieren')}</button>
        <button class="btn" data-action="importData">⬆ ${tr('Backup importieren')}</button>
      </div>
      ${renderFolderBackupSettings()}
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
      <h3>${tr('Gefahrenzone')}</h3>
      <button class="btn danger" data-action="resetData">${tr('Alle Daten löschen')}</button>`)}

    ${isServerMode() ? '' : settingsSection('sync', '🔄', tr('Zwischen Geräten wechseln'),
      tr('Anleitung für iCloud, OneDrive, Google Drive, Dropbox · gewählt: {svc}', { svc: esc(syncService().name) }),
      renderSyncGuide())}

    <p class="small muted app-version">${tr('Version {v}', { v: esc(APP_VERSION) })} ·
      <button class="btn ghost small" data-action="showChangelog">🆕 ${tr('Neuigkeiten')}</button> ·
      <button class="btn ghost small" data-action="checkUpdateNow">${tr('Nach Updates suchen')}</button> ·
      <a class="small" href="${REPO_URL}" target="_blank" rel="noopener">GitHub ↗</a></p>`;
}

/* ------------------------------------------------------------------------
   Formulare (Dialog)
   ------------------------------------------------------------------------ */

/* ---- Mehrfachauswahl mit Suche („multi“) ---------------------------------
   Gewählte Einträge stehen als Chips im Feld; Tippen filtert die Liste darunter.
   Tastatur: ↑ ↓ wählen, Enter hinzufügen, Rücktaste entfernt den letzten Chip, Esc schließt.
   Optionen: { value, label, html?, hint?, muted? } oder { group } als Überschrift. */
const multiOptions = new Map(); // Feldname → Optionen des offenen Formulars
const multiChip = (o) => `<span class="mp-chip ${o.muted ? 'muted' : ''}" data-value="${esc(o.value)}">${o.html || esc(o.label)}<button type="button" class="mp-x" aria-label="${esc(tr('{name} entfernen', { name: o.label }))}">✕</button></span>`;
function multiRender(mp) {
  const input = mp.querySelector('.mp-input'), list = mp.querySelector('.mp-list');
  const chosen = new Set([...mp.querySelectorAll('.mp-chip')].map((c) => c.dataset.value));
  const words = input.value.toLocaleLowerCase(LOCALE).split(/\s+/).filter(Boolean);
  const opts = multiOptions.get(mp.dataset.multi) || [];
  const rows = [];
  let group = null, n = 0;
  for (const o of opts) {
    if (o.group) { group = o.group; continue; }
    if (chosen.has(o.value)) continue;
    const hay = `${o.label} ${o.hint || ''}`.toLocaleLowerCase(LOCALE);
    if (!words.every((w) => hay.includes(w))) continue;
    if (group) { rows.push(`<li class="mp-group" role="presentation">${esc(group)}</li>`); group = null; }
    rows.push(`<li class="mp-opt ${o.muted ? 'muted' : ''}" role="option" data-value="${esc(o.value)}" data-i="${n++}">${o.html || esc(o.label)}${o.hint ? `<span class="mp-hint">${esc(o.hint)}</span>` : ''}</li>`);
  }
  list.innerHTML = rows.length ? rows.join('') : `<li class="mp-empty">${tr('Nichts gefunden')}</li>`;
  mp.dataset.active = n ? Math.min(Number(mp.dataset.active || 0), n - 1) : -1;
  multiHighlight(mp);
}
function multiHighlight(mp) {
  const a = Number(mp.dataset.active);
  mp.querySelectorAll('.mp-opt').forEach((li) => { const on = Number(li.dataset.i) === a; li.classList.toggle('active', on); li.setAttribute('aria-selected', on); if (on) li.scrollIntoView({ block: 'nearest' }); });
}
function multiOpen(mp, open = true) {
  const list = mp.querySelector('.mp-list');
  if (open) { mp.dataset.active = 0; multiRender(mp); }
  list.hidden = !open;
  mp.querySelector('.mp-input').setAttribute('aria-expanded', open);
  mp.classList.toggle('open', open);
}
function multiAdd(mp, value) {
  const o = (multiOptions.get(mp.dataset.multi) || []).find((x) => x.value === value);
  const input = mp.querySelector('.mp-input');
  if (!o) return;
  input.insertAdjacentHTML('beforebegin', multiChip(o));
  input.value = '';
  multiRender(mp);
  input.focus();
}
document.addEventListener('focusin', (e) => { const mp = e.target.closest?.('.mp'); if (mp && e.target.classList.contains('mp-input') && mp.querySelector('.mp-list').hidden) multiOpen(mp); });
document.addEventListener('focusout', (e) => {
  const mp = e.target.closest?.('.mp');
  if (mp) setTimeout(() => { if (!mp.contains(document.activeElement)) multiOpen(mp, false); }, 120);
});
document.addEventListener('input', (e) => { const mp = e.target.closest?.('.mp'); if (mp && e.target.classList.contains('mp-input')) { mp.dataset.active = 0; multiOpen(mp); } });
document.addEventListener('mousedown', (e) => { if (e.target.closest?.('.mp-list')) e.preventDefault(); }); // Fokus im Eingabefeld behalten
document.addEventListener('click', (e) => {
  const mp = e.target.closest?.('.mp');
  if (!mp) return;
  const opt = e.target.closest('.mp-opt');
  if (opt) return multiAdd(mp, opt.dataset.value);
  const x = e.target.closest('.mp-x');
  if (x) { x.closest('.mp-chip').remove(); multiRender(mp); return mp.querySelector('.mp-input').focus(); }
  if (e.target.closest('.mp-box')) { mp.querySelector('.mp-input').focus(); if (mp.querySelector('.mp-list').hidden) multiOpen(mp); }
});
document.addEventListener('keydown', (e) => {
  const mp = e.target.closest?.('.mp');
  if (!mp || !e.target.classList.contains('mp-input')) return;
  const n = mp.querySelectorAll('.mp-opt').length, open = !mp.querySelector('.mp-list').hidden;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open) return multiOpen(mp);
    if (n) { mp.dataset.active = (Number(mp.dataset.active) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; multiHighlight(mp); }
  } else if (e.key === 'Enter') {
    e.preventDefault(); // nicht das Formular absenden
    const li = mp.querySelector('.mp-opt.active');
    if (open && li) multiAdd(mp, li.dataset.value);
  } else if (e.key === 'Escape' && open) {
    e.preventDefault(); e.stopPropagation(); // nur die Liste schließen, nicht den Dialog
    multiOpen(mp, false);
  } else if (e.key === 'Backspace' && !e.target.value) {
    const chips = mp.querySelectorAll('.mp-chip');
    if (chips.length) { chips[chips.length - 1].remove(); multiRender(mp); }
  }
}, true);
// Esc im Dialog: bei offener Liste nur diese schließen
document.addEventListener('cancel', (e) => { const mp = document.querySelector('.mp.open'); if (mp && e.target.id === 'modal') { e.preventDefault(); multiOpen(mp, false); } }, true);

function fieldHTML(f) {
  const id = 'f_' + f.name;
  const v = f.value ?? '';
  const req = f.required ? 'required' : '';
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  let input;
  if (f.type === 'checks') {
    const vals = new Set(v || []);
    return `<div class="field"><div class="field-label">${esc(f.label)}</div>
      <div class="check-chips" data-checks="${f.name}">${f.options.map((o) => (o.group
        ? `<span class="check-group small muted">${esc(o.group)}</span>`
        : `<label class="check-chip"><input type="checkbox" value="${esc(o.value)}" ${vals.has(o.value) ? 'checked' : ''}><span>${o.html || esc(o.label)}</span></label>`)).join('')}</div>${hint}</div>`;
  }
  if (f.type === 'multi') {
    multiOptions.set(f.name, f.options);
    const byVal = new Map(f.options.filter((o) => !o.group).map((o) => [o.value, o]));
    return `<div class="field"><label class="field-label" for="${id}">${esc(f.label)}</label>
      <div class="mp" data-multi="${f.name}">
        <div class="mp-box">${(v || []).filter((x) => byVal.has(x)).map((x) => multiChip(byVal.get(x))).join('')}<input id="${id}" class="mp-input" type="text" autocomplete="off" spellcheck="false"
          placeholder="${esc(f.placeholder || tr('Suchen und hinzufügen …'))}" role="combobox" aria-expanded="false" aria-autocomplete="list" enterkeyhint="done"></div>
        <ul class="mp-list" role="listbox" hidden></ul>
      </div>${hint}</div>`;
  }
  if (f.type === 'subtasks') {
    return `<div class="field"><div class="field-label">${esc(f.label)}</div>
      <div class="subtasks-editor" data-subtasks="${f.name}">
        <div class="subtask-rows">${(v || []).map(subtaskRowHTML).join('')}</div>
        <button type="button" class="btn small" data-sub-add>${tr('+ Unterpunkt')}</button>
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
    <input type="checkbox" ${st.done ? 'checked' : ''} aria-label="${tr('Erledigt')}">
    <textarea class="autogrow single sub-title" rows="1" placeholder="${tr('Unterpunkt')}">${esc(st.title || '')}</textarea>
    <button type="button" class="btn ghost icon danger" data-sub-del title="${tr('Entfernen')}" aria-label="${tr('Unterpunkt entfernen')}">✕</button>
  </div>`;
}

/** Textfeld an seinen Inhalt anpassen. */
function autoGrow(el) {
  if (!el.getClientRects().length) return; // unsichtbar (z. B. geschlossener Dialog)
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + 'px';
}
const growAll = (root = document) => root.querySelectorAll('textarea.autogrow').forEach(autoGrow);

function openForm({ title, fields, submitLabel = tr('Speichern'), onSubmit, wide = false }) {
  const dlg = $('#modal');
  const rows = [];
  if (wide) {
    // Breites Raster (Computer): jedes Feld belegt w von 4 Spalten; auf schmalen Bildschirmen einspaltig
    fields.forEach((f) => rows.push(`<div class="fcell w${f.w || 4}">${fieldHTML(f)}</div>`));
  } else {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.half && fields[i + 1]?.half) { rows.push(`<div class="row2">${fieldHTML(f)}${fieldHTML(fields[i + 1])}</div>`); i++; }
      else rows.push(fieldHTML(f));
    }
  }
  dlg.classList.toggle('wide', wide);
  dlg.innerHTML = `<form class="form ${wide ? 'grid' : ''}" novalidate>
    <h2>${esc(title)}</h2>
    ${rows.join('')}
    <div class="form-error"></div>
    <div class="form-actions">
      <button type="button" class="btn" data-close>${tr('Abbrechen')}</button>
      <button type="submit" class="btn primary">${esc(submitLabel)}</button>
    </div>
  </form>`;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = {};
    for (const f of fields) {
      if (f.type === 'checks') {
        values[f.name] = [...form.querySelectorAll(`[data-checks="${f.name}"] input:checked`)].map((i) => i.value);
        continue;
      }
      if (f.type === 'multi') {
        values[f.name] = [...form.querySelectorAll(`[data-multi="${f.name}"] .mp-chip`)].map((c) => c.dataset.value);
        continue;
      }
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
      if (f.required && !v) return showError(tr('Bitte „{label}“ ausfüllen.', { label: f.label }));
      if (f.type === 'number') v = v === '' ? null : Number(String(v).replace(',', '.'));
      if (f.type === 'decimal') {
        v = parseAmount(v);
        if (Number.isNaN(v)) return showError(tr('„{label}“ ist keine gültige Zahl.', { label: f.label }));
      }
      if (f.type === 'duration' && v) {
        v = parseDuration(v);
        if (!v) return showError(tr('Dauer nicht erkannt. Beispiele: 1:30, 1,5, 90 min'));
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

const projectOptions = () => liveProjects()
  .filter((p) => p.status !== 'abgeschlossen')
  .map((p) => ({ value: p.id, label: p.name }));

/* ------------------------------------------------------------------------
   Aktionen
   ------------------------------------------------------------------------ */

const actions = {
  newProject() { projectForm(); },
  customizeDashboard() { startEdit('dashboard'); },
  quickMenu({ id }) {
    const p = getProject(id);
    const btn = document.querySelector(`.qa-btn[data-id="${CSS.escape(id)}"]:hover`) || [...document.querySelectorAll(`.qa-btn[data-id="${CSS.escape(id)}"]`)].find((b) => b === document.activeElement) || document.querySelector(`.qa-btn[data-id="${CSS.escape(id)}"]`);
    if (p) openPopover(lastQaButton || btn, projectMenuHTML(p));
  },
  goProject({ id }) { location.hash = `#/projekt/${id}`; },
  archiveProject({ id }) {
    const p = getProject(id);
    if (!p || !confirm(tr('„{name}“ archivieren?\\n\\nDas Projekt verschwindet aus Übersicht, Listen und Auswahlfeldern. Alle Daten bleiben erhalten und zählen weiter für Statistiken und Erfolge. Du findest es unter Projekte › Archiv.', { name: p.name }))) return;
    p.archived = true;
    p.archivedAt = todayISO();
    if (data.timer?.projectId === id) data.timer = null;
    commit();
    toast(tr('🗄️ „{name}“ archiviert.', { name: p.name }));
  },
  unarchiveProject({ id }) {
    const p = getProject(id);
    if (!p) return;
    p.archived = false;
    p.archivedAt = null;
    commit();
    toast(tr('♻️ „{name}“ ist wieder da.', { name: p.name }));
  },
  duplicateProject({ id }) { const p = getProject(id); if (p) duplicateForm(p); },
  saveTemplate({ id }) { const p = getProject(id); if (p) saveTemplateForm(p); },
  deleteTemplate({ id }) {
    const t = (data.templates || []).find((x) => x.id === id);
    if (!t || !confirm(tr('Vorlage „{name}“ löschen? Projekte, die daraus entstanden sind, bleiben erhalten.', { name: t.name }))) return;
    data.templates = data.templates.filter((x) => x.id !== id);
    commit();
  },
  setProjectStatus({ id, status }) {
    const p = getProject(id);
    const wasDone = p.status === 'abgeschlossen';
    noteStatusChange(p.status, status);
    p.status = status;
    commit();
    if (!wasDone && status === 'abgeschlossen') celebrateProject(p);
    else toast(tr('Status: {s}', { s: statusLabel(status) }));
  },
  async installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch { /* abgebrochen */ }
    installPrompt = null;
    render();
  },
  setChartPeriod({ id }) {
    if (!CHART_PERIODS.includes(id)) return;
    chartPeriod = id;
    try { localStorage.setItem('projekttracker.ui.chartPeriod', id); } catch { /* ignorieren */ }
    render();
  },
  toggleSeries({ id }) {
    if (hiddenSeries.has(id)) hiddenSeries.delete(id); else hiddenSeries.add(id);
    render();
  },
  openPalette() { openPalette(); },
  quickAdd() { openQuickAdd(); },
  customizeProject({ id }) { startEdit('project', id); },
  applyRecommendedLayout({ kind, id }) {
    if (kind === 'project') {
      const p = getProject(id);
      if (p) p.layout = defaultLayout(PROJECT_DEFS, PROJECT_STATS); // nur dieses Projekt
    } else delete data.settings.dashboard; // Standard-Übersicht
    commit();
    toast(tr('✨ Empfohlene Auswahl übernommen – über „Anpassen“ kannst du sie jederzeit ändern.'));
  },
  useSharedLayout({ id }) {
    const p = getProject(id);
    if (!p) return;
    delete p.layout;
    commit();
  },
  resetProjectLayout({ id }) {
    delete getProject(id).layout;
    commit();
    toast(tr('Das Projekt nutzt wieder die gemeinsame Anordnung.'));
  },
  resetAllLayouts() {
    if (!confirm(tr('Übersicht und Projektansicht (inkl. aller projektspezifischen Anordnungen) auf Standard zurücksetzen?'))) return;
    delete data.settings.dashboard;
    delete data.settings.projectLayout;
    data.projects.forEach((p) => delete p.layout);
    commit();
    toast(tr('Anordnungen zurückgesetzt'));
  },
  toggleSidebar() {
    const collapsed = document.documentElement.classList.toggle('side-collapsed');
    try { localStorage.setItem('projekttracker.ui.sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* ignorieren */ }
    updateSideToggle();
    if (data.timer) renderTimer(true);
  },
  applyUpdate({ id }) {
    // Mit neuem Query-Parameter laden, damit auch eine zwischengespeicherte index.html umgangen wird
    const v = String(id || Date.now()).replace(/-\d{10,}$/, '');
    location.replace(`${location.pathname}?v=${encodeURIComponent(v)}&r=${Date.now()}${location.hash}`);
  },
  async checkUpdateNow() {
    const v = await checkForUpdate(true);
    if (location.protocol === 'file:') toast(tr('Lokal geöffnet – Updates gibt es nur in der Online-Version.'));
    else if (v === null) toast(tr('Update-Prüfung nicht möglich (offline?).'), 'error');
    else if (v === APP_VERSION) toast(tr('Du hast die neueste Version ({v}) ✔ – frisch veröffentlichte Änderungen brauchen 1–2 Minuten, bis sie hier ankommen.', { v: APP_VERSION }));
  },
  askNotify() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(() => render()).catch(() => {});
  },
  testTimerBeep() { unlockAudio(); setTimeout(playTimerBeep, 50); },
  previewTimerSound() {
    const form = document.querySelector('[data-form="pomodoro"]');
    // Kein render(): das würde das Formular mit den gespeicherten Werten neu füllen und die Auswahl verwerfen
    if (snd.preview || !form) { snd.preview = null; clearTimeout(snd.previewTimer); syncTimerSound(); return updatePreviewButton(); }
    const fd = new FormData(form);
    const source = String(fd.get('timerSound') || 'beep');
    if (source === 'beep') { unlockAudio(); return setTimeout(playTimerBeep, 50); }
    snd.failed = null;
    snd.preview = soundCfg({ source, url: String(fd.get('timerSoundUrl') || '').trim(), volume: Number(fd.get('timerSoundVolume') ?? 60) / 100 });
    soundStop(true);
    syncTimerSound();
    clearTimeout(snd.previewTimer);
    snd.previewTimer = setTimeout(() => { snd.preview = null; syncTimerSound(); updatePreviewButton(); }, 20000);
    updatePreviewButton();
  },
  async removeMusicFile() {
    try { await idb('readwrite', (s) => s.delete('timerMusicFile')); } catch { /* ignorieren */ }
    await loadMusicFile();
    data.settings.timerSoundFileName = '';
    soundStop(true);
    save();
    render();
  },
  testChime() { unlockAudio(); playChime(); if (data.settings.pomoSound === false) toast(tr('Der Ton ist ausgeschaltet.')); },
  editProject({ id }) { projectForm(getProject(id)); },

  deleteProject({ id }) {
    const p = getProject(id);
    if (!confirm(tr('Projekt „{name}“ inklusive aller Zeiten, Investitionen, Aufgaben und Meilensteine löschen?', { name: p.name }))) return;
    data.projects = data.projects.filter((x) => x.id !== id);
    for (const k of ['timeEntries', 'investments', 'incomes', 'milestones', 'tasks', 'notes', 'docs']) data[k] = (data[k] || []).filter((x) => x.projectId !== id);
    if (data.timer?.projectId === id) data.timer = null;
    save();
    location.hash = '#/projekte';
    toast(tr('Projekt gelöscht'));
  },

  filterProjects({ id }) { projectFilter = id; render(); },
  setProjectView({ id }) {
    projectView = ['list', 'roadmap'].includes(id) ? id : 'grid';
    try { localStorage.setItem('projekttracker.ui.projectView', projectView); } catch { /* ignorieren */ }
    render();
  },

  /* Aufgaben */
  addTask({ id }) { taskForm({ projectId: id }); },
  editTask({ id }) { taskForm(data.tasks.find((t) => t.id === id)); },
  toggleTask({ id }) {
    const t = data.tasks.find((x) => x.id === id);
    const subs = t.subtasks || [];
    if (subs.length) {
      if (t.done) return toast(tr('Um die Aufgabe wieder zu öffnen, entferne den Haken bei einem Unterpunkt.'));
      const open = subs.filter((st) => !st.done);
      if (!confirm(tr('Die Aufgabe ist erst fertig, wenn alle Unterpunkte erledigt sind.\n\nAlle {n} offenen Unterpunkte jetzt abhaken?', { n: open.length }))) return;
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
    else if (change === 'reopened') toast(tr('Aufgabe wieder geöffnet'));
  },
  addSubtask({ id }) {
    const t = data.tasks.find((x) => x.id === id);
    openForm({
      title: tr('Unterpunkt zu „{title}“', { title: t.title }),
      submitLabel: tr('Hinzufügen'),
      fields: [{ name: 'title', label: tr('Unterpunkt'), required: true, placeholder: tr('Was gehört dazu?') }],
      onSubmit(v) {
        (t.subtasks ||= []).push({ id: uid(), title: v.title, done: false, doneAt: null });
        syncTaskDone(t);
        commit();
      },
    });
  },
  deleteTask({ id }) {
    if (!confirm(tr('Aufgabe löschen?'))) return;
    data.tasks = data.tasks.filter((t) => t.id !== id);
    data.tasks.forEach((t) => { if (t.dependsOn?.includes(id)) t.dependsOn = t.dependsOn.filter((x) => x !== id); });
    data.docs.forEach((d) => { if (d.taskId === id) d.taskId = null; }); // Dokument bleibt beim Projekt
    data.timeEntries.forEach((e) => { if (e.taskId === id) e.taskId = null; }); // gebuchte Zeit bleibt beim Projekt
    if (data.timer?.taskId === id) data.timer.taskId = null;
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
    if (m.done) { toast(tr('🏁 Meilenstein „{title}“ erreicht!', { title: m.title })); confetti(); }
  },
  setMilestoneSort({ id, mode }) {
    const p = getProject(id);
    if (!p) return;
    if (mode === 'manual') {
      // eigene Reihenfolge startet mit der aktuellen Anzeige
      if (p.msSort !== 'manual') sortMilestonesOf(id).forEach((m, i) => { m.order = i; });
      p.msSort = 'manual';
    } else delete p.msSort;
    commit();
  },
  moveMilestone({ id, dir }) {
    const m = data.milestones.find((x) => x.id === id);
    if (!m) return;
    const list = sortMilestonesOf(m.projectId);
    list.forEach((x, i) => { x.order = i; });
    const i = list.indexOf(m), j = i + Number(dir);
    if (j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    commit();
    // Fokus am verschobenen Knopf halten (Tastatur)
    document.querySelector(`[data-action="moveMilestone"][data-id="${CSS.escape(id)}"][data-dir="${dir}"]:not([disabled])`)?.focus();
  },
  deleteMilestone({ id }) {
    if (!confirm(tr('Meilenstein löschen? Zugeordnete Aufgaben bleiben erhalten.'))) return;
    data.milestones = data.milestones.filter((m) => m.id !== id);
    data.tasks.forEach((t) => { if (t.milestoneId === id) t.milestoneId = null; });
    data.docs.forEach((d) => { if (d.milestoneId === id) d.milestoneId = null; });
    commit();
  },

  /* Zeit */
  addTime({ id, task } = {}) {
    if (!data.projects.length) return toast(tr('Lege zuerst ein Projekt an.'));
    const tk = task && data.tasks.find((x) => x.id === task);
    timeForm({ projectId: id || parseRoute().id, taskId: tk?.id, title: tk?.title });
  },
  editTime({ id }) { timeForm(data.timeEntries.find((e) => e.id === id)); },
  deleteTime({ id }) {
    if (!confirm(tr('Zeiteintrag löschen?'))) return;
    data.timeEntries = data.timeEntries.filter((e) => e.id !== id);
    commit();
  },

  startTimer({ id, task }) {
    if (data.timer && !confirm(tr('Es läuft bereits ein Timer. Diesen verwerfen und neu starten?'))) return;
    const tk = task ? data.tasks.find((x) => x.id === task) : null;
    unlockAudio(); // Start ist eine Nutzeraktion – danach darf der Erinnerungston spielen
    data.timer = { projectId: id, start: Date.now(), taskId: tk?.id || null };
    if (tk && !tk.done) tk.status = 'doing';
    noteTimerStart();
    commit();
    toast(tr('▶ Timer für „{name}“ gestartet. Los geht’s!', { name: tk ? tk.title : getProject(id).name }));
  },
  stopTimer() {
    const t = data.timer;
    if (!t) return;
    if (t.mode === 'pomodoro') {
      const focus = pomoFocusMs(t);
      const minutes = Math.max(1, Math.round(focus / 60000));
      const title = t.count ? `${t.count} × Pomodoro` : 'Pomodoro';
      return timeForm({ projectId: t.projectId, taskId: t.taskId, minutes, date: toISO(new Date(t.start)), title,
        description: t.count ? trp(t.count, '{n} Pomodoro à {m} Min', '{n} Pomodoros à {m} Min', { m: pomoCfg().work }) : '' }, { fromTimer: true });
    }
    const minutes = Math.max(1, Math.round(stopwatchMs(t) / 60000));
    const tk = t.taskId && data.tasks.find((x) => x.id === t.taskId);
    timeForm({ projectId: t.projectId, taskId: t.taskId, minutes, date: toISO(new Date(t.startedAt || t.start)), title: tk ? tk.title : '' }, { fromTimer: true });
  },
  /** Pausieren bzw. Fortsetzen – Stoppuhr und Pomodoro */
  pauseTimer() {
    const t = data.timer;
    if (!t) return;
    if (t.mode === 'pomodoro') return actions.pomoPause();
    if (t.pausedAt) {
      t.start += Date.now() - t.pausedAt; // Pausenzeit herausrechnen
      t.pausedAt = null;
      toast(tr('▶ Timer läuft weiter'));
    } else {
      t.startedAt ||= t.start; // ursprünglicher Start (für das Datum des Zeiteintrags)
      t.pausedAt = Date.now();
    }
    save(); renderTimer(true);
  },
  startPomodoro({ id, task }) {
    if (data.timer && !confirm(tr('Es läuft bereits ein Timer. Diesen verwerfen und einen Pomodoro starten?'))) return;
    unlockAudio();
    requestNotifyPermission();
    const now = Date.now();
    data.timer = { projectId: id, start: now, mode: 'pomodoro', phase: 'work', phaseStart: now,
      phaseEnd: now + pomoCfg().work * 60000, count: 0, focusMs: 0, pausedAt: null, taskId: task || null };
    const tk = task && data.tasks.find((x) => x.id === task);
    if (tk && !tk.done) tk.status = 'doing';
    noteTimerStart();
    commit();
    toast(tr('🍅 Pomodoro für „{name}“ – {m} Minuten volle Konzentration!', { name: getProject(id).name, m: pomoCfg().work }));
  },
  pomoPause() {
    const t = data.timer;
    if (!t || t.mode !== 'pomodoro' || t.phase === 'ready') return;
    if (t.pausedAt) {
      const delta = Date.now() - t.pausedAt;
      t.phaseStart += delta; t.phaseEnd += delta; t.pausedAt = null;
      toast(tr('▶ Pomodoro läuft weiter'));
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
    if (!confirm(tr('Laufenden Timer verwerfen?'))) return;
    data.timer = null;
    commit();
  },

  /* Investitionen */
  addInvestment({ id }) { investmentForm({ projectId: id }); },
  addIncome({ id }) { incomeForm({ projectId: id || parseRoute().id || data.projects[0]?.id }); },
  editIncome({ id }) { incomeForm(data.incomes.find((e) => e.id === id)); },
  deleteIncome({ id }) {
    if (!confirm(tr('Einnahme löschen?'))) return;
    data.incomes = data.incomes.filter((e) => e.id !== id);
    commit();
  },
  editInvestment({ id }) { investmentForm(data.investments.find((e) => e.id === id)); },
  deleteInvestment({ id }) {
    if (!confirm(tr('Investition löschen?'))) return;
    data.investments = data.investments.filter((e) => e.id !== id);
    commit();
  },

  /* Logbuch */
  addNote({ id }) { noteForm({ projectId: id }); },
  editNote({ id }) { noteForm(data.notes.find((n) => n.id === id)); },
  deleteNote({ id }) {
    if (!confirm(tr('Notiz löschen?'))) return;
    data.notes = data.notes.filter((n) => n.id !== id);
    commit();
  },

  /* Daten */
  exportData() {
    const now = new Date();
    const stamp = `${toISO(now)}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    download(`protrac-backup-${stamp}.json`, JSON.stringify({ ...data, exportedAt: now.toISOString() }, null, 2), 'application/json');
    meta.lastExport = Date.now();
    saveMeta();
    render();
    const svc = syncService();
    toast(svc.cloud ? tr('Sicherung exportiert ✔ – sie liegt in deinem Download-Ordner (ideal: {folder}).', { folder: svc.folder }) : tr('Sicherung exportiert ✔ – sie liegt in deinem Download-Ordner.'));
  },
  resetReminders() {
    const ta = document.querySelector('[data-form="reminders"] textarea[name="reminderTexts"]');
    if (!ta) return;
    ta.value = defaultReminders().join('\n');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    toast(tr('Standardtexte eingesetzt – zum Übernehmen „Speichern“ tippen.'));
  },
  dismissSyncHint() {
    syncHintDismissed = true;
    renderBackupBar();
  },
  exportCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const name = (pid) => getProject(pid)?.name || '';
    // Deutsch: Semikolon & Dezimalkomma (Excel DE), sonst Komma & Dezimalpunkt
    const sep = LANG === 'de' ? ';' : ',';
    const dec = (n) => n.toFixed(2).replace('.', DEC());
    const rows = [[tr('Typ'), tr('Datum'), tr('Projekt'), tr('Titel'), tr('Beschreibung'), tr('Kategorie'), tr('Minuten'), tr('Stunden'), tr('Betrag (EUR)')].map(q).join(sep)];
    data.timeEntries.forEach((e) => rows.push([tr('Zeit'), e.date, name(e.projectId), entryTitle(e), e.description, '', e.minutes, dec(e.minutes / 60), ''].map(q).join(sep)));
    data.investments.forEach((e) => rows.push([tr('Investition'), e.date, name(e.projectId), e.description, '', e.category, '', '', dec(e.amount)].map(q).join(sep)));
    (data.incomes || []).forEach((e) => rows.push([tr('Einnahme'), e.date, name(e.projectId), e.description, '', e.category, '', '', dec(-e.amount)].map(q).join(sep)));
    download(`protrac-${todayISO()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
  },
  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const raw = JSON.parse(await file.text());
        if (isEncryptedBackup(raw)) return decryptPrompt(raw, (parsed) => importBackup(parsed));
        importBackup(raw);
      } catch (e) {
        toast(tr('Import fehlgeschlagen: {msg}', { msg: e.message }), 'error');
      }
    };
    input.click();
  },
  exportEncrypted() { encryptedExportForm(); },
  async pickBackupFolder() {
    try {
      const handle = await window.showDirectoryPicker({ id: 'protrac-backup', mode: 'readwrite', startIn: 'documents' });
      await useBackupFolder(handle);
      if (folderBackup.perm === 'granted') toast(tr('📁 Automatische Sicherung aktiv – Ordner „{name}“.', { name: handle.name }));
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error');
    }
  },
  async resumeFolderBackup() {
    if (!folderBackup.handle) return;
    folderBackup.perm = await folderPermission(folderBackup.handle, true);
    if (folderBackup.perm === 'granted') { await writeFolderBackup(); toast(tr('📁 Automatische Sicherung läuft wieder.')); }
    render();
  },
  async writeFolderBackup() {
    if (await writeFolderBackup()) toast(tr('Sicherung exportiert ✔'));
    render();
  },
  async stopFolderBackup() {
    folderBackup.handle = null;
    folderBackup.perm = 'none';
    try { await idb('readwrite', (s) => s.delete('backupDir')); } catch { /* ignorieren */ }
    saveFolderCfg({ name: '' });
    render();
  },
  resetData() {
    if (!confirm(tr('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.'))) return;
    if (!confirm(tr('Letzte Chance: Hast du ein Backup exportiert? Endgültig löschen?'))) return;
    data = freshData();
    save();
    location.hash = '#/';
    render();
  },
  loadDemo() {
    data = demoData();
    commit();
    toast(tr('Beispieldaten geladen – unter Einstellungen kannst du alles wieder löschen.'));
  },
};

/* ---------------------------- Formulardefinitionen ----------------------- */

const decimalValue = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', DEC()));

function projectForm(p) {
  const isNew = !p;
  p = p || { status: 'aktiv', color: COLORS[data.projects.length % COLORS.length] };
  const cats = [...new Set(data.projects.map((x) => x.category).filter(Boolean))];
  openForm({
    title: isNew ? tr('Neues Projekt') : tr('Projekt bearbeiten'),
    submitLabel: isNew ? tr('Anlegen') : tr('Speichern'),
    wide: true,
    fields: [
      ...(isNew && !layoutEmpty(layoutConfig(data.settings.projectLayout, PROJECT_DEFS, PROJECT_STATS)) ? [{ name: 'startView', label: tr('Projektansicht'), type: 'select', w: 4, value: 'shared',
        options: [{ value: 'shared', label: tr('Gewohnte Anordnung übernehmen') }, { value: 'empty', label: tr('Leer starten und selbst gestalten') }],
        hint: tr('Bestimmt, welche Bereiche im Reiter „Übersicht“ des neuen Projekts erscheinen.') }] : []),
      ...(isNew ? [{ name: 'template', label: tr('Vorlage'), type: 'select', w: 4, value: '',
        options: [{ value: '', label: tr('Leeres Projekt') }, ...allTemplates().map((t) => ({ value: t.id, label: `${t.icon || '📋'} ${t.name}` }))],
        hint: tr('Übernimmt Meilensteine und Aufgaben; Termine beginnen heute.') }] : []),
      { name: 'name', label: tr('Name'), required: true, value: p.name, w: 2 },
      { name: 'status', label: tr('Status'), type: 'select', options: STATUS, value: p.status, w: 1 },
      { name: 'category', label: tr('Kategorie'), value: p.category, list: cats, placeholder: tr('z. B. Beruf, Hobby'), w: 1 },
      { name: 'description', label: tr('Beschreibung'), type: 'textarea', value: p.description, w: 2 },
      { name: 'why', label: tr('Warum ist mir dieses Projekt wichtig?'), type: 'textarea', value: p.why, w: 2,
        hint: tr('Wird dir angezeigt, wenn das Projekt einzuschlafen droht.') },
      { name: 'goal', label: tr('Ziel – wann ist das Projekt fertig?'), type: 'textarea', value: p.goal, w: 2 },
      { name: 'reminderText', label: tr('Eigene Erinnerung, wenn es einschläft'), type: 'textarea', value: p.reminderText, w: 2,
        placeholder: tr('z. B. {tage} Tage ohne „{projekt}“? Deine Kunden warten!'),
        hint: tr('Leer = allgemeine Texte. Platzhalter: {projekt}, {tage}, {warum}, {schritt}. Mehrere Zeilen = wechselt täglich.') },
      { name: 'weeklyHours', label: tr('Wochenarbeitszeit (Std)'), type: 'decimal', value: decimalValue(p.weeklyHours), w: 1,
        placeholder: tr('z. B. 4 oder 2,5'), hint: tr('Leer = kein Wochenziel') },
      { name: 'hourGoal', label: tr('Gesamtzeit geplant (Std)'), type: 'decimal', value: decimalValue(p.hourGoal), w: 1, hint: tr('für das ganze Projekt') },
      { name: 'budget', label: tr('Budget (€)'), type: 'decimal', value: decimalValue(p.budget), w: 1 },
      { name: 'targetDate', label: tr('Zieltermin'), type: 'date', value: p.targetDate, w: 1 },
      { name: 'staleDays', label: tr('Erinnern nach … Tagen'), type: 'number', value: p.staleDays, w: 1,
        placeholder: tr('Standard: {n}', { n: data.settings.staleDays }), hint: tr('ohne Aktivität; leer = Standard') },
      { name: 'color', label: tr('Farbe'), type: 'color', value: p.color, w: 1 },
      ...(data.teams.length ? [{ name: 'teamIds', label: tr('Projektteams'), type: 'checks', w: 4, value: p.teamIds || [],
        options: data.teams.map((tm) => ({ value: tm.id, html: teamBadge(tm) })), hint: tr('Mitglieder dieser Teams stehen bei der Zuweisung von Aufgaben oben.') }] : []),
    ],
    onSubmit(v) {
      if (isNew) {
        const tplId = v.template, startView = v.startView;
        delete v.template;
        delete v.startView;
        const np = { id: uid(), createdAt: todayISO(), ...v };
        if (startView === 'empty') np.layout = { widgets: [] };
        const tpl = tplId && templateById(tplId);
        if (tpl) applyBlueprint(np, tpl.bp, todayISO());
        data.projects.push(np);
        save();
        location.hash = `#/projekt/${np.id}`;
        toast(tr('Projekt angelegt. Lege gleich den ersten Schritt als Aufgabe fest!'));
      } else {
        const wasDone = p.status === 'abgeschlossen';
        noteStatusChange(p.status, v.status);
        Object.assign(p, v);
        commit();
        if (!wasDone && p.status === 'abgeschlossen') celebrateProject(p);
      }
    },
  });
}

/** Ab so vielen Einträgen wird aus der Chip-Liste ein Suchfeld */
const MULTI_FROM = 8;
/** Vorgänger-Auswahl: offene Aufgaben nach Meilenstein gruppiert (eigener Meilenstein zuerst), erledigte am Ende */
function predecessorOptions(t, others) {
  const open = others.filter((x) => !x.done), done = others.filter((x) => x.done);
  const ms = sortMilestonesOf(t.projectId).filter((m) => open.some((x) => x.milestoneId === m.id));
  if (t.milestoneId) ms.sort((a, b) => Number(b.id === t.milestoneId) - Number(a.id === t.milestoneId));
  const opt = (x, muted = false) => ({ value: x.id, label: x.title, muted, html: `${muted ? '✓ ' : ''}${esc(x.title)}` });
  const out = [];
  ms.forEach((m) => { out.push({ group: `🏁 ${m.title}` }, ...open.filter((x) => x.milestoneId === m.id).map((x) => opt(x))); });
  const rest = open.filter((x) => !x.milestoneId || !ms.some((m) => m.id === x.milestoneId));
  if (rest.length) out.push({ group: ms.length ? tr('Ohne Meilenstein') : tr('Offen') }, ...rest.map((x) => opt(x)));
  if (done.length) out.push({ group: tr('Erledigt') }, ...done.map((x) => opt(x, true)));
  return out;
}

function taskForm(t) {
  const isNew = !t.id;
  const pid = t.projectId;
  const ms = data.milestones.filter((m) => m.projectId === pid && !m.done);
  const fields = [
    { name: 'title', label: tr('Aufgabe'), required: true, value: t.title, placeholder: tr('Was ist konkret zu tun?') },
    { name: 'priority', label: tr('Priorität'), type: 'select', options: PRIORITIES, value: t.priority || 'mittel', half: true },
    { name: 'dueDate', label: tr('Fällig am'), type: 'date', value: t.dueDate, half: true },
  ];
  if (ms.length || t.milestoneId) {
    const opts = data.milestones.filter((m) => m.projectId === pid && (!m.done || m.id === t.milestoneId));
    fields.push({ name: 'milestoneId', label: tr('Meilenstein'), type: 'select', value: t.milestoneId || '', options: [{ value: '', label: tr('– keiner –') }, ...opts.map((m) => ({ value: m.id, label: m.title }))] });
  }
  if (data.people.length || data.teams.length) fields.push(assigneeField(pid, t.assignees));
  fields.push({ name: 'repeat', label: tr('Wiederholen'), type: 'select', half: true, value: t.repeat || '',
    options: REPEATS.map((r) => ({ value: r.value, label: r.label })), hint: tr('Beim Abhaken entsteht die nächste Aufgabe') });
  fields.push({ name: 'estimate', label: tr('Geschätzter Aufwand'), type: 'duration', half: true, placeholder: '2:00',
    value: t.estimate ? fmtHM(t.estimate) : '', hint: t.id && taskMinutes(t.id) ? tr('Bisher gebucht: {d}', { d: fmtDuration(taskMinutes(t.id)) }) : tr('Arbeitszeit, z. B. 2:00 oder 90 min – wird mit der gebuchten Zeit verglichen') });
  // Planung (optional): Dauer, frühester Start, Vorgänger → Zeitplan & kritischer Pfad
  fields.push({ name: 'duration', label: tr('Dauer (Arbeitstage)'), type: 'number', value: t.duration, placeholder: '1', half: true,
    hint: tr('Für Zeitplan & kritischen Pfad – leer = 1 Tag') });
  fields.push({ name: 'startAfter', label: tr('Frühester Start'), type: 'date', value: t.startAfter, half: true, hint: tr('optional') });
  const others = sortTasks(data.tasks.filter((x) => x.projectId === pid && x.id !== t.id));
  if (others.length) fields.push({ name: 'dependsOn', label: tr('Vorgänger – startet erst, wenn diese erledigt sind'), value: t.dependsOn || [],
    ...(others.length > MULTI_FROM ? { type: 'multi', options: predecessorOptions(t, others), placeholder: tr('Aufgabe suchen …') }
      : { type: 'checks', options: others.map((x) => ({ value: x.id, label: `${x.done ? '✓ ' : ''}${x.title}` })) }) });
  fields.push({ name: 'subtasks', label: tr('Unterpunkte'), type: 'subtasks', value: t.subtasks || [],
    hint: tr('Die Aufgabe ist erst fertig, wenn alle Unterpunkte abgehakt sind. Eingabetaste = nächster Unterpunkt.') });
  fields.push({ name: 'notes', label: tr('Notiz'), type: 'textarea', value: t.notes });
  openForm({
    title: isNew ? tr('Neue Aufgabe') : tr('Aufgabe bearbeiten'),
    fields,
    onSubmit(v) {
      v.milestoneId = v.milestoneId || null;
      v.estimate = v.estimate || null;
      v.repeat = v.repeat || null;
      v.duration = v.duration ? Math.max(1, Math.round(v.duration)) : null;
      v.startAfter = v.startAfter || null;
      if (v.dependsOn && t.id && wouldCycle(t.id, v.dependsOn)) return tr('Diese Vorgänger würden eine Kreisabhängigkeit erzeugen (die Aufgaben warten gegenseitig aufeinander).');
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
    title: isNew ? tr('Neuer Meilenstein') : tr('Meilenstein bearbeiten'),
    fields: [
      { name: 'title', label: tr('Meilenstein'), required: true, value: m.title, placeholder: tr('z. B. Prototyp fertig') },
      { name: 'dueDate', label: tr('Zieldatum'), type: 'date', value: m.dueDate, half: true },
      { name: 'doneAt', label: tr('Erreicht am'), type: 'date', value: m.done ? m.doneAt : '', half: true },
      ...(data.people.length || data.teams.length ? [assigneeField(m.projectId, m.assignees)] : []),
      { name: 'description', label: tr('Beschreibung / Kriterien'), type: 'textarea', value: m.description,
        hint: tr('„Erreicht am“ nur ausfüllen, wenn der Meilenstein schon geschafft ist – z. B. beim Nachtragen früherer Etappen. Leer = noch offen.') },
    ],
    onSubmit(v) {
      v.doneAt = v.doneAt || null;
      v.done = !!v.doneAt;
      const wasDone = !!m.done;
      if (isNew) {
        const order = Math.max(-1, ...data.milestones.filter((x) => x.projectId === m.projectId).map((x) => x.order ?? -1)) + 1;
        data.milestones.push({ id: uid(), projectId: m.projectId, createdAt: new Date().toISOString(), order, ...v });
      } else Object.assign(m, v);
      commit();
      if (v.done && !wasDone) toast(tr('🏁 Meilenstein „{title}“ erreicht!', { title: v.title }));
    },
  });
}

/** Aufgaben eines Projekts für das Zeitformular (offene zuerst, erledigte nur wenn schon gewählt) */
function timeTaskOptions(pid, current) {
  const tasks = sortTasks(data.tasks.filter((t) => t.projectId === pid && (!t.done || t.id === current)));
  return [{ value: '', label: tr('– keine bestimmte –') }, ...tasks.map((t) => ({ value: t.id, label: `${t.done ? '✓ ' : ''}${t.title}` }))];
}

function timeForm(e, { fromTimer = false } = {}) {
  const isNew = !e.id;
  const opts = projectOptions();
  if (e.projectId && !opts.some((o) => o.value === e.projectId)) {
    const p = getProject(e.projectId);
    if (p) opts.unshift({ value: p.id, label: p.name });
  }
  if (!opts.length) return toast(tr('Kein offenes Projekt vorhanden.'));
  openForm({
    title: fromTimer ? tr('Timer stoppen & Zeit speichern') : isNew ? tr('Zeit erfassen') : tr('Zeiteintrag bearbeiten'),
    fields: [
      { name: 'projectId', label: tr('Projekt'), type: 'select', options: opts, value: e.projectId },
      { name: 'date', label: tr('Datum'), type: 'date', value: e.date || todayISO(), required: true, half: true },
      { name: 'minutes', label: tr('Dauer'), type: 'duration', required: true, value: e.minutes ? `${Math.floor(e.minutes / 60)}:${pad(e.minutes % 60)}` : '', placeholder: '1:30', hint: tr('z. B. 1:30, 1,5 oder 45 min'), half: true },
      { name: 'taskId', label: tr('Aufgabe'), type: 'select', options: timeTaskOptions(e.projectId || opts[0].value, e.taskId), value: e.taskId || '' },
      { name: 'title', label: tr('Titel'), value: e.autoTitle ? '' : e.title,
        placeholder: autoTimeTitle(e.date || todayISO()), hint: tr('Leer lassen = Wochentag und Datum werden als Titel verwendet.') },
      { name: 'description', label: tr('Beschreibung'), type: 'textarea', value: e.description,
        placeholder: tr('Was hast du gemacht? Details, Ergebnisse, offene Punkte …') },
    ],
    submitLabel: tr('Speichern'),
    onSubmit(v) {
      v.taskId = v.taskId || null;
      v.autoTitle = !v.title;
      if (v.autoTitle) v.title = autoTimeTitle(v.date);
      if (isNew) data.timeEntries.push({ id: uid(), ...v });
      else Object.assign(e, v);
      if (fromTimer) data.timer = null;
      commit();
      if (isNew) toast(tr('⏱️ {d} gespeichert. {cheer}', { d: fmtDuration(v.minutes), cheer: tr(pick(CHEERS)) }));
    },
  });
  renderPauseOverlay(); // Pausen-Hinweis ausblenden, solange der Dialog offen ist
  // Platzhalter des Titels folgt dem gewählten Datum
  const dateInput = $('#f_date'), titleInput = $('#f_title');
  // Aufgabenliste folgt dem gewählten Projekt
  const projSel = $('#f_projectId'), taskSel = $('#f_taskId');
  projSel?.addEventListener('change', () => {
    taskSel.innerHTML = timeTaskOptions(projSel.value).map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  });
  dateInput.addEventListener('input', () => { titleInput.placeholder = autoTimeTitle(dateInput.value); });
  if (fromTimer) {
    const actionsEl = $('#modal .form-actions');
    actionsEl.insertAdjacentHTML('afterbegin', `<button type="button" class="btn danger" data-action="discardTimer" style="margin-right:auto">${tr('Verwerfen')}</button>`);
    actionsEl.querySelector('[data-action="discardTimer"]').addEventListener('click', () => $('#modal').close());
  }
}

function investmentForm(e) {
  const isNew = !e.id;
  openForm({
    title: isNew ? tr('Investition erfassen') : tr('Investition bearbeiten'),
    fields: [
      { name: 'description', label: tr('Wofür?'), required: true, value: e.description },
      { name: 'amount', label: tr('Betrag (€)'), type: 'decimal', required: true, value: e.amount != null ? decimalValue(e.amount) : '', placeholder: `49${DEC()}99`, half: true },
      { name: 'date', label: tr('Datum'), type: 'date', required: true, value: e.date || todayISO(), half: true },
      { name: 'category', label: tr('Kategorie'), value: e.category || '', chips: investmentCategories(),
        placeholder: tr('z. B. Werkzeug, Messe …'), hint: tr('Eigenen Namen eintippen oder einen Vorschlag antippen. Leer = „Sonstiges“.') },
    ],
    onSubmit(v) {
      if (v.amount == null) return tr('Bitte einen Betrag angeben.');
      v.category = normalizeCategory(v.category);
      if (isNew) data.investments.push({ id: uid(), projectId: e.projectId, ...v });
      else Object.assign(e, v);
      commit();
    },
  });
}

function incomeForm(e) {
  const isNew = !e.id;
  const cats = [...new Set([tr('Verkauf'), tr('Honorar'), tr('Förderung'), ...(data.incomes || []).map((x) => x.category).filter(Boolean)])];
  openForm({
    title: isNew ? tr('Einnahme erfassen') : tr('Einnahme bearbeiten'),
    fields: [
      { name: 'description', label: tr('Woher?'), required: true, value: e.description, placeholder: tr('z. B. Verkauf auf dem Markt, Kundenauftrag …') },
      { name: 'amount', label: tr('Betrag (€)'), type: 'decimal', required: true, value: e.amount != null ? decimalValue(e.amount) : '', placeholder: `120${DEC()}00`, half: true },
      { name: 'date', label: tr('Datum'), type: 'date', required: true, value: e.date || todayISO(), half: true },
      { name: 'category', label: tr('Kategorie'), value: e.category || '', chips: cats, placeholder: tr('Verkauf'), hint: tr('Eigenen Namen eintippen oder einen Vorschlag antippen. Leer = „Sonstiges“.') },
    ],
    onSubmit(v) {
      if (v.amount == null) return tr('Bitte einen Betrag angeben.');
      v.category = (v.category || '').trim();
      data.incomes ||= [];
      if (isNew) data.incomes.push({ id: uid(), projectId: e.projectId, ...v });
      else Object.assign(e, v);
      commit();
      if (isNew) toast(tr('💰 {amount} verbucht – stark!', { amount: fmtEUR(v.amount) }));
    },
  });
}

function noteForm(n) {
  const isNew = !n.id;
  openForm({
    title: isNew ? tr('Neue Notiz') : tr('Notiz bearbeiten'),
    fields: [
      { name: 'date', label: tr('Datum'), type: 'date', required: true, value: n.date || todayISO() },
      { name: 'text', label: tr('Notiz'), type: 'textarea', required: true, value: n.text, placeholder: tr('Idee, Erkenntnis, Entscheidung, kleiner Erfolg …') },
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
  toast(tr('🎉 „{name}“ abgeschlossen! Großartige Leistung.', { name: p.name }));
  setTimeout(() => toast(tr('Tipp: Abgeschlossene Projekte kannst du über ⋯ › „Archivieren“ aus dem Blick räumen.')), 1500);
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
      data.counters.pomodoros = (data.counters.pomodoros || 0) + 1;
      if (t.count >= 8 && !t.marathon) { t.marathon = true; countEvent('pomoMarathon'); }
      startBreak(t, t.phaseEnd, true);
      signalMsg = t.phase === 'long'
        ? [tr('🍅 {n} Pomodoros geschafft!', { n: t.count }), tr('Zeit für eine lange Pause ({m} Min).', { m: pomoCfg().long })]
        : [tr('🍅 Pomodoro {n} geschafft!', { n: t.count }), tr('Kurze Pause ({m} Min) – steh auf, trink etwas.', { m: pomoCfg().short })];
    } else {
      Object.assign(t, { phase: 'ready', phaseStart: null, phaseEnd: null });
      signalMsg = [tr('☕ Pause vorbei'), tr('Bereit für den nächsten Pomodoro?')];
    }
  }
  if (signalMsg) {
    checkAchievements();
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
/** Kurzer, leiser Doppel-Ton: „Timer läuft noch“ – bewusst anders als der Pomodoro-Gong */
function playTimerBeep() {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.18].forEach((dt) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t0 = audioCtx.currentTime + dt;
      o.type = 'triangle'; o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.16);
    });
  } catch { /* ignorieren */ }
}
const timerBeepMin = () => { const v = Number(data.settings.timerBeep ?? 15); return v > 0 ? v : 0; };
/* Gezählt wird nur laufende Zeit (nicht pausiert, beim Pomodoro nur Fokus). */
const timerBeep = { key: null, acc: 0, last: 0 };
function tickTimerBeep() {
  const t = data.timer, now = Date.now();
  const dt = timerBeep.last ? Math.min(now - timerBeep.last, 90000) : 0; // im Hintergrund gedrosselte Takte begrenzen
  timerBeep.last = now;
  const running = t && !t.pausedAt && (t.mode !== 'pomodoro' || t.phase === 'work');
  const key = t ? `${t.projectId}|${t.startedAt || t.start}|${t.mode || ''}` : null;
  if (key !== timerBeep.key) { timerBeep.key = key; timerBeep.acc = 0; return; }
  const every = (data.settings.timerSound || 'beep') === 'beep' ? timerBeepMin() : 0;
  if (!running || !every) return;
  timerBeep.acc += dt;
  if (timerBeep.acc < every * 60000) return;
  timerBeep.acc = 0;
  if (t.mode === 'pomodoro' && t.phaseEnd - now < 60000) return; // gleich kommt ohnehin der Pomodoro-Gong
  playTimerBeep();
  const el = $('#timer-indicator');
  el?.classList.add('ping');
  setTimeout(() => el?.classList.remove('ping'), 1200);
  const min = Math.round((t.mode === 'pomodoro' ? Date.now() - t.phaseStart : stopwatchMs(t)) / 60000);
  if (data.settings.pomoNotify !== false && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(tr('⏱ Timer läuft noch'), { body: `${getProject(t.projectId)?.name || ''} · ${fmtDuration(min)}`, icon: 'icon-180.png', tag: 'timer-beep', silent: true }); } catch { /* ignorieren */ }
  }
}
// Nach einem Neuladen ist Audio erst nach einer Berührung erlaubt – dann freischalten, wenn ein Timer läuft
document.addEventListener('pointerdown', () => { if (data.timer && !audioCtx) unlockAudio(); }, true);

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
  if (!t || !getProject(t.projectId)) { el.hidden = true; el.dataset.key = ''; renderPauseOverlay(); return; }
  const tk = t.taskId && data.tasks.find((x) => x.id === t.taskId);
  const name = getProject(t.projectId).name + (tk ? ` · ${tk.title}` : '');
  const pomo = t.mode === 'pomodoro';
  const key = [t.projectId, t.mode, t.phase, !!t.pausedAt].join('|');

  if (force || el.hidden || el.dataset.key !== key) {
    el.className = 'timer-indicator' + (pomo ? ` pomo pomo-${t.phase}${t.pausedAt ? ' paused' : ''}` : '');
    if (!pomo) {
      el.className += t.pausedAt ? ' paused' : '';
      el.innerHTML = `<span class="dot"></span><span class="t"></span><span class="small name">${esc(name)}</span>
        <button class="btn small" data-action="pauseTimer" title="${t.pausedAt ? tr('Fortsetzen') : tr('Pausieren')}">${t.pausedAt ? tr('▶ Weiter') : tr('⏸ Pause')}</button>
        <button class="btn small" data-action="stopTimer">■ ${tr('Stopp')}</button>`;
    } else {
      const label = { work: tr('🍅 Fokus #{n}', { n: t.count + 1 }), short: tr('☕ Pause'), long: tr('🌴 Lange Pause'), ready: tr('✅ Pause vorbei') }[t.phase];
      const next = { work: ['⏭', tr('Fokus beenden & Pause')], short: ['⏭', tr('Pause überspringen')], long: ['⏭', tr('Pause überspringen')], ready: [tr('▶ Weiter'), tr('Nächsten Pomodoro starten')] }[t.phase];
      el.innerHTML = `<span class="pomo-label small">${label}</span><span class="t"></span><span class="small name">${esc(name)}</span>
        ${t.phase === 'ready' ? '' : `<button class="btn small icon" data-action="pomoPause" title="${t.pausedAt ? tr('Fortsetzen') : tr('Pausieren')}">${t.pausedAt ? '▶' : '⏸'}</button>`}
        <button class="btn small ${t.phase === 'ready' ? 'primary' : 'icon'}" data-action="pomoNext" title="${next[1]}">${next[0]}</button>
        <button class="btn small icon" data-action="stopTimer" title="${tr('Beenden & Zeit speichern')}">■</button>
        <span class="pomo-bar"><span></span></span>`;
    }
    el.dataset.key = key;
    el.hidden = false;
  }

  let text, title;
  if (!pomo) {
    text = fmtClock(stopwatchMs(t) / 1000);
    title = `${t.pausedAt ? '⏸' : '⏱️'} ${text} · ${name}`;
  } else if (t.phase === 'ready') {
    text = `${t.count} 🍅`;
    title = Math.floor(Date.now() / 1000) % 2 ? tr('✅ Pause vorbei!') : `🍅 ${name}`;
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
  renderPauseOverlay();
}

/** Laufzeit der Stoppuhr ohne Pausen */
const stopwatchMs = (t) => Math.max(0, (t.pausedAt || Date.now()) - t.start);

/* Vollflächiger Hinweis, solange ein Timer pausiert ist – damit das Fortsetzen nicht vergessen wird */
const pauseOverlay = document.createElement('div');
pauseOverlay.className = 'pause-overlay';
pauseOverlay.hidden = true;
pauseOverlay.setAttribute('role', 'alertdialog');
pauseOverlay.setAttribute('aria-modal', 'true');
pauseOverlay.setAttribute('aria-labelledby', 'po-title');
document.body.appendChild(pauseOverlay);

function renderPauseOverlay() {
  const t = data.timer;
  const p = t && getProject(t.projectId);
  const show = !!(p && t.pausedAt && !isLocked() && !$('#modal').open);
  if (!show) {
    if (!pauseOverlay.hidden) { pauseOverlay.hidden = true; pauseOverlay.dataset.key = ''; document.documentElement.classList.remove('paused-open'); }
    return;
  }
  const pomo = t.mode === 'pomodoro';
  const key = [t.projectId, t.mode, t.phase, t.pausedAt, LANG].join('|');
  if (pauseOverlay.dataset.key !== key) {
    const what = !pomo ? tr('Erfasste Zeit')
      : t.phase === 'work' ? tr('Verbleibender Fokus') : tr('Verbleibende Pause');
    pauseOverlay.innerHTML = `<div class="po-card">
      <div class="po-icon" aria-hidden="true">⏸</div>
      <h2 id="po-title">${pomo ? tr('Pomodoro pausiert') : tr('Timer pausiert')}</h2>
      <div class="po-project"><span class="dot-color" style="background:${esc(p.color)}"></span> ${esc(p.name)}</div>
      <div class="po-time-label small muted">${what}</div>
      <div class="po-time"></div>
      <p class="po-text muted">${tr('Die Zeit läuft gerade nicht weiter. Setze den Timer fort, sobald du weiterarbeitest – oder beende ihn, um die Zeit zu speichern.')}</p>
      <div class="po-actions">
        <button type="button" class="btn primary" data-action="pauseTimer">${tr('▶ Fortsetzen')}</button>
        <button type="button" class="btn" data-action="stopTimer">${tr('■ Beenden & Zeit speichern')}</button>
      </div>
      <div class="po-since small muted"></div>
    </div>`;
    pauseOverlay.dataset.key = key;
    pauseOverlay.hidden = false;
    document.documentElement.classList.add('paused-open');
    closePopover?.();
    if (!matchMedia('(hover: none)').matches) pauseOverlay.querySelector('[data-action="pauseTimer"]').focus();
  }
  pauseOverlay.querySelector('.po-time').textContent = pomo ? fmtClock((t.phaseEnd - t.pausedAt) / 1000) : fmtClock(stopwatchMs(t) / 1000);
  const since = Math.floor((Date.now() - t.pausedAt) / 60000);
  pauseOverlay.querySelector('.po-since').textContent = since < 1 ? tr('gerade pausiert')
    : trp(since, 'seit {n} Minute pausiert', 'seit {n} Minuten pausiert');
}
// Pausen-Hinweis wieder zeigen, sobald ein Dialog (z. B. „Zeit speichern“) geschlossen wird
$('#modal').addEventListener('close', () => setTimeout(() => { if (data.timer) renderTimer(true); }, 0));
setInterval(() => {
  tickPomodoro();
  tickTimerBeep();
  syncTimerSound();
  if (data.timer) renderTimer();
  else if (document.title !== BRAND) document.title = BRAND;
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

  const shop = P({ name: tr('Online-Shop für Holzdeko'), status: 'aktiv', category: tr('Nebenprojekt'), color: '#eb6834',
    description: tr('Eigene Holzarbeiten über einen kleinen Online-Shop verkaufen.'),
    why: tr('Ich möchte mir ein zweites Standbein aufbauen und mein Hobby zum Beruf machen.'),
    goal: tr('Shop ist online und die ersten 10 Bestellungen sind verschickt.'), hourGoal: 80, weeklyHours: 4, budget: 600, targetDate: ahead(45) });
  const m1 = M(shop, tr('Produktfotos fertig'), ago(20), ago(18));
  const m2 = M(shop, tr('Shop online'), ahead(10));
  M(shop, tr('Erste 10 Bestellungen'), ahead(45));
  K(shop, tr('Versandkosten kalkulieren'), 'hoch', { milestoneId: m2, dueDate: ahead(3) });
  K(shop, tr('Impressum & Datenschutzerklärung'), 'hoch', { milestoneId: m2, subtasks: [
    { id: uid(), title: tr('Impressum-Generator ausfüllen'), done: true, doneAt: ago(2) },
    { id: uid(), title: tr('Datenschutzerklärung erstellen'), done: false, doneAt: null },
    { id: uid(), title: tr('Beide Seiten im Shop-Footer verlinken'), done: false, doneAt: null },
  ] });
  K(shop, tr('Produkttexte schreiben'), 'mittel', { milestoneId: m2 });
  K(shop, tr('Instagram-Account anlegen'), 'niedrig');
  K(shop, tr('Fotostudio aufbauen'), 'mittel', { milestoneId: m1, done: true, doneAt: ago(25) });
  [[90, 1, tr('Shop-Theme angepasst')], [60, 2, tr('Produkte angelegt')], [45, 4, ''], [120, 6, tr('Fotos bearbeitet')], [30, 9, ''], [150, 13, tr('Fotoshooting')], [60, 16, ''], [90, 20, ''], [45, 27, tr('Recherche Shopsysteme')]]
    .forEach(([m, n, title]) => T(shop, m, n, title));
  T(shop, 75, 0, tr('Zahlungsanbieter eingerichtet'), tr('PayPal und Kreditkarte verbunden.\nTestbestellung erfolgreich – Rückerstattung muss noch geprüft werden.'));
  I(shop, 89, 30, tr('Fotolicht-Set'), tr('Hardware'));
  I(shop, 29, 5, tr('Shop-Abo (Monat)'), tr('Software'));
  I(shop, 140, 12, tr('Holz & Lack'), tr('Material'));

  const app = P({ name: tr('Fitness-App lernen'), status: 'aktiv', category: 'Weiterbildung', color: '#2a78d6',
    description: tr('Programmieren lernen, indem ich eine eigene kleine Trainings-App baue.'),
    why: tr('Ich will verstehen, wie Apps funktionieren – und endlich meine eigenen Trainingsdaten auswerten.'), hourGoal: 50, weeklyHours: 2 });
  M(app, tr('Grundkurs abgeschlossen'), ago(35), ago(33));
  M(app, tr('Erste Version auf dem Handy'), ahead(20));
  K(app, tr('Kapitel 7 (Datenbanken) durcharbeiten'), 'mittel');
  K(app, tr('Datenmodell für Workouts skizzieren'), 'hoch');
  [[60, 21, tr('Kurs Kapitel 6')], [45, 24, ''], [90, 30, ''], [60, 34, '']].forEach(([m, n, title]) => T(app, m, n, title));
  I(app, 19.99, 40, tr('Online-Kurs'), tr('Weiterbildung'));

  const garden = P({ name: tr('Hochbeet bauen'), status: 'abgeschlossen', category: tr('Haus & Garten'), color: '#008300', createdAt: ago(80) });
  M(garden, tr('Hochbeet steht'), ago(50), ago(50));
  T(garden, 240, 52, tr('Aufbau')); T(garden, 120, 55, tr('Material besorgt'));
  I(garden, 185.5, 55, tr('Lärchenholz & Schrauben'), tr('Material'));

  P({ name: tr('Podcast starten'), status: 'idee', category: tr('Kreativ'), color: '#e87ba4', description: tr('Gespräche mit Handwerkern aus der Region.') });

  d.notes.push({ id: uid(), projectId: shop, date: ago(3), createdAt: '', text: tr('Idee: Gutscheincode für die ersten Kunden anbieten.') });
  return d;
}

/* ========================================================================
   Interaktive Übersicht: Sparklines, „Heute“, Erfolge, Schnellaktionen,
   Detailansichten, Befehlspalette, Wischgesten
   ======================================================================== */

/* ---------------------------- Sparklines --------------------------------- */

/** Kleine Verlaufslinie (Inline-SVG) – Text bleibt in normaler Schriftfarbe, die Linie in der Akzentfarbe. */
function sparkline(values, label) {
  const w = 96, h = 26, pad = 3;
  const max = Math.max(...values, 1), n = values.length;
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, n - 1), h - pad - (v / max) * (h - 2 * pad)]);
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
    <polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="var(--primary)" stroke="var(--surface)" stroke-width="1.5"/>
  </svg>`;
}
const monthKey = (offset) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return toISO(d).slice(0, 7); };
const lastWeeksMinutes = (n, pid) => Array.from({ length: n }, (_, i) => weekMinutes(i - n + 1, pid));
const lastMonths = (n, fn) => Array.from({ length: n }, (_, i) => fn(monthKey(i - n + 1)));

/* ---------------------------- Heute -------------------------------------- */

function renderToday(c) {
  const today = c.today;
  const hour = new Date().getHours();
  const greet = hour < 11 ? tr('Guten Morgen') : hour < 18 ? tr('Hallo') : tr('Guten Abend');
  const dayLabel = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const todayMin = minutesInRange(today, toISO(addDays(new Date(), 1)));
  const doneToday = data.tasks.filter((t) => t.done && t.doneAt === today).length;
  const min = Number(data.settings.reminderMinutes) || 25;

  const items = [];
  // 1) Fällige und überfällige Aufgaben
  sortTasks(c.openTasks.filter((t) => t.dueDate && t.dueDate <= today)).slice(0, 2).forEach((t) => {
    const p = getProject(t.projectId);
    items.push(`<li>
      <span class="today-ico">${t.dueDate < today ? '⚠️' : '⏰'}</span>
      <div class="grow"><div class="title">${esc(t.title)}</div>
        <div class="meta"><span><span class="dot-color" style="background:${esc(p.color)}"></span> ${esc(p.name)}</span>
        <span class="${t.dueDate < today ? 'badge overdue' : ''}">${t.dueDate < today ? trp(daysBetween(t.dueDate, today), 'überfällig seit {n} Tag', 'überfällig seit {n} Tagen') : tr('heute fällig')}</span></div></div>
      <div class="btn-row"><button class="btn small" data-action="toggleTask" data-id="${t.id}">✓ ${tr('Erledigt')}</button>
        <button class="btn small primary" data-action="startPomodoro" data-id="${p.id}">🍅 ${tr('Start')}</button></div>
    </li>`);
  });
  // 2) Das am längsten ruhende Projekt
  const sleeping = c.stale.find((x) => x.s.health === 'kritisch') || c.stale[0];
  if (sleeping && items.length < 3) {
    items.push(`<li>
      <span class="today-ico">😴</span>
      <div class="grow"><div class="title">${tr('{name} ruht seit {n} Tagen', { name: esc(sleeping.p.name), n: sleeping.s.idle })}</div>
        <div class="meta">${sleeping.s.next ? tr('Kleinster Schritt: {step}', { step: esc(sleeping.s.next.title) }) : tr('Lege einen kleinen nächsten Schritt fest')}</div></div>
      <div class="btn-row"><button class="btn small primary" data-action="startPomodoro" data-id="${sleeping.p.id}">🍅 ${tr('{m} Min', { m: min })}</button></div>
    </li>`);
  }
  // 3) Rest zum Wochenziel – Vorschlag: aktives Projekt mit dem größten Rückstand
  if (c.goalMin && c.thisWeek < c.goalMin && items.length < 3) {
    const rest = c.goalMin - c.thisWeek;
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
    const behind = c.active.map((p) => ({ p, gap: projectWeeklyMin(p) - weekMinutes(0, p.id) })).sort((a, b) => b.gap - a.gap)[0];
    items.push(`<li>
      <span class="today-ico">🎯</span>
      <div class="grow"><div class="title">${tr('Noch {h} bis zum Wochenziel', { h: fmtHours(rest) })}</div>
        <div class="meta">${tr('ca. {d} pro Tag bis Sonntag', { d: fmtDuration(Math.ceil(rest / daysLeft)) })}${behind && behind.gap > 0 ? ` · ${tr('größter Rückstand: {name}', { name: esc(behind.p.name) })}` : ''}</div></div>
      ${behind ? `<div class="btn-row"><button class="btn small primary" data-action="startPomodoro" data-id="${behind.p.id}">🍅 ${tr('Start')}</button></div>` : ''}
    </li>`);
  }
  // 3b) Meilensteine, die laut Zeitplan zu spät fertig werden
  if (items.length < 3) {
    const risk = c.active.flatMap((p) => { const pl = planProject(p.id); return pl.used ? [...pl.milestones.entries()].filter(([, x]) => x.late > 0).map(([id, x]) => ({ p, m: data.milestones.find((m) => m.id === id), ...x })) : []; })
      .sort((a, b) => b.late - a.late)[0];
    if (risk) items.push(`<li>
      <span class="today-ico">⚠️</span>
      <div class="grow"><div class="title">${tr('Meilenstein „{title}“ ist gefährdet', { title: esc(risk.m.title) })}</div>
        <div class="meta">${trp(risk.late, 'voraussichtlich {n} Arbeitstag zu spät', 'voraussichtlich {n} Arbeitstage zu spät')} · ${esc(risk.p.name)}</div></div>
      <div class="btn-row"><a class="btn small" href="#/projekt/${risk.p.id}/zeitplan">${tr('Zeitplan')}</a></div>
    </li>`);
  }
  // 3c) Wochenrückblick (freitags bis montags, solange er fehlt)
  const reviewWeek = defaultReviewWeek();
  if (items.length < 3 && [5, 6, 0, 1].includes(new Date().getDay()) && !data.reviews?.[reviewWeek] && data.projects.length) {
    items.push(`<li>
      <span class="today-ico">📝</span>
      <div class="grow"><div class="title">${tr('Zeit für deinen Wochenrückblick')}</div>
        <div class="meta">${tr('Was hast du geschafft? Worauf konzentrierst du dich nächste Woche?')}</div></div>
      <div class="btn-row"><a class="btn small primary" href="#/woche/${reviewWeek}">${tr('Los geht’s')}</a></div>
    </li>`);
  }
  // 4) Meilenstein in den nächsten 7 Tagen
  const soon = data.milestones.filter((m) => !m.done && m.dueDate && m.dueDate >= today && m.dueDate <= toISO(addDays(new Date(), 7)) && getProject(m.projectId) && !getProject(m.projectId).archived)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (soon && items.length < 3) {
    items.push(`<li>
      <span class="today-ico">🏁</span>
      <div class="grow"><div class="title">${esc(soon.title)}</div>
        <div class="meta">${tr('Meilenstein {when}', { when: fmtRelative(soon.dueDate) })} · ${esc(getProject(soon.projectId).name)}</div></div>
      <div class="btn-row"><a class="btn small" href="#/projekt/${soon.projectId}/meilensteine">${tr('Ansehen')}</a></div>
    </li>`);
  }
  if (!items.length) {
    const nxt = c.active.map((p) => c.stats.get(p.id).next).filter(Boolean)[0];
    items.push(`<li><span class="today-ico">✨</span><div class="grow"><div class="title">${tr('Alles im grünen Bereich')}</div>
      <div class="meta">${nxt ? tr('Wie wäre es mit: {title}', { title: esc(nxt.title) }) : tr('Lege für deine Projekte einen nächsten Schritt fest.')}</div></div>
      ${nxt ? `<div class="btn-row"><button class="btn small primary" data-action="startPomodoro" data-id="${nxt.projectId}">🍅 ${tr('Start')}</button></div>` : ''}</li>`);
  }
  return `<section class="card today">
    <div class="card-head"><h2>☀️ ${greet}! <span class="muted today-date">${esc(dayLabel)}</span></h2></div>
    <div class="today-sum small muted">${tr('Heute: <b>{d}</b> erfasst', { d: fmtDuration(todayMin) })} · ${trp(doneToday, '<b>{n}</b> Aufgabe erledigt', '<b>{n}</b> Aufgaben erledigt')}${c.streak ? ` · 🔥 ${trp(c.streak, '{n} Tag in Folge', '{n} Tage in Folge')}` : ''}</div>
    <ul class="list today-list">${items.join('')}</ul>
  </section>`;
}

/* ---------------------------- Erfolge ------------------------------------ */

function maxStreak() {
  const days = Object.keys(dayMap()).sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) {
    cur = prev && daysBetween(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}
function hasRevivedProject() {
  return data.projects.some((p) => {
    const ds = [...new Set(activities(p.id).map((a) => a.date).filter(Boolean))].sort();
    return ds.some((d, i) => i > 0 && daysBetween(ds[i - 1], d) >= 14);
  });
}
/** Anzahl Wochen (letzte 52) mit erreichtem Wochenziel und ob einmal das Doppelte geschafft wurde */
function weekGoalHistory() {
  const g = weeklyGoal().minutes;
  let hit = 0, double = false;
  if (g) for (let i = -51; i <= 0; i++) { const m = weekMinutes(i); if (m >= g) hit++; if (m >= 2 * g) double = true; }
  return { hit, double };
}
/** Zeit an Samstag und Sonntag desselben Wochenendes erfasst? */
function hadWeekend() {
  const days = new Set(data.timeEntries.filter((e) => e.minutes > 0).map((e) => e.date));
  return [...days].some((d) => parseISO(d).getDay() === 6 && days.has(toISO(addDays(parseISO(d), 1))));
}
/** Kennzahlen für die Team-Erfolge */
function teamStats() {
  const teamAssigned = (x) => (x.assignees || []).some((a) => a.startsWith('t:'));
  const me = currentPerson();
  const perDay = {};
  data.tasks.filter((t) => t.done && t.doneAt && teamAssigned(t)).forEach((t) => { perDay[t.doneAt] = (perDay[t.doneAt] || 0) + 1; });
  return {
    teams: data.teams.length,
    people: data.people.length,
    projectTeams: data.projects.filter((p) => (p.teamIds || []).length).length,
    assignedTasks: data.tasks.filter((t) => (t.assignees || []).length).length,
    teamTasksDone: data.tasks.filter((t) => t.done && teamAssigned(t)).length,
    myTasksDone: me ? data.tasks.filter((t) => t.done && isMine(t, me)).length : 0,
    docs: data.docs.length,
    reviews: Object.keys(data.reviews || {}).length,
    incomes: (data.incomes || []).length,
    profitable: data.projects.filter((p) => { const s = projectStats(p); return s.income > 0 && s.profit > 0; }).length,
    focusWeeks: Object.values(data.weekFocus || {}).filter((ids) => ids.length && ids.every((id) => data.tasks.find((t) => t.id === id)?.done)).length,
    teamMilestones: data.milestones.filter((m) => m.done && teamAssigned(m)).length,
    maxTeamsPerPerson: Math.max(0, ...data.people.map((p) => teamsOf(p.id).length)),
    biggestTeam: Math.max(0, ...data.teams.map((tm) => (tm.memberIds || []).length)),
    teamDay: Math.max(0, ...Object.values(perDay)),
  };
}

/** Zählt Ereignisse für geheime Erfolge (Werte werden beim Abgleich mehrerer Geräte addiert) */
function countEvent(key) {
  data.counters[key] = (data.counters[key] || 0) + 1;
}
/** Uhrzeit beim Starten eines Timers merken (Nachteule / Früher Vogel) */
function noteTimerStart() {
  const h = new Date().getHours();
  if (h >= 22 || h < 4) countEvent('nightStarts');
  if (h >= 5 && h < 7) countEvent('earlyStarts');
}
/** Statuswechsel merken (Phönix: pausiert → aktiv) */
function noteStatusChange(from, to) {
  if (from === 'pausiert' && to === 'aktiv') countEvent('reactivated');
}

const ACHIEVEMENTS = [
  { id: 'first_project', icon: '🚀', get name() { return tr('Startschuss'); }, get desc() { return tr('Erstes Projekt angelegt'); }, goal: 1, val: (x) => x.projects },
  { id: 'first_hour', icon: '⏱️', get name() { return tr('Erste Stunde'); }, get desc() { return tr('1 Stunde Zeit erfasst'); }, goal: 1, val: (x) => x.hours },
  { id: 'hours_10', icon: '🔟', get name() { return tr('Zehner'); }, get desc() { return tr('10 Stunden erfasst'); }, goal: 10, val: (x) => x.hours },
  { id: 'hours_50', icon: '💪', get name() { return tr('Ausdauer'); }, get desc() { return tr('50 Stunden erfasst'); }, goal: 50, val: (x) => x.hours },
  { id: 'hours_100', icon: '🏆', get name() { return tr('Hundert'); }, get desc() { return tr('100 Stunden erfasst'); }, goal: 100, val: (x) => x.hours },
  { id: 'streak_3', icon: '🔥', get name() { return tr('Warmgelaufen'); }, get desc() { return tr('3 Tage in Folge aktiv'); }, goal: 3, val: (x) => x.streak },
  { id: 'streak_7', icon: '📅', get name() { return tr('Eine Woche dran'); }, get desc() { return tr('7 Tage in Folge aktiv'); }, goal: 7, val: (x) => x.streak },
  { id: 'streak_30', icon: '🌋', get name() { return tr('Unaufhaltsam'); }, get desc() { return tr('30 Tage in Folge aktiv'); }, goal: 30, val: (x) => x.streak },
  { id: 'pomo_1', icon: '🍅', get name() { return tr('Erster Pomodoro'); }, get desc() { return tr('Einen Pomodoro abgeschlossen'); }, goal: 1, val: (x) => x.pomodoros },
  { id: 'pomo_10', icon: '🧺', get name() { return tr('Tomatenernte'); }, get desc() { return tr('10 Pomodoros abgeschlossen'); }, goal: 10, val: (x) => x.pomodoros },
  { id: 'pomo_50', icon: '🚜', get name() { return tr('Tomatenfarm'); }, get desc() { return tr('50 Pomodoros abgeschlossen'); }, goal: 50, val: (x) => x.pomodoros },
  { id: 'tasks_10', icon: '✅', get name() { return tr('Macher'); }, get desc() { return tr('10 Aufgaben erledigt'); }, goal: 10, val: (x) => x.tasks },
  { id: 'tasks_50', icon: '⚡', get name() { return tr('Abarbeiter'); }, get desc() { return tr('50 Aufgaben erledigt'); }, goal: 50, val: (x) => x.tasks },
  { id: 'milestone_1', icon: '🏁', get name() { return tr('Etappensieg'); }, get desc() { return tr('Ersten Meilenstein erreicht'); }, goal: 1, val: (x) => x.milestones },
  { id: 'milestone_5', icon: '🗺️', get name() { return tr('Wegbereiter'); }, get desc() { return tr('5 Meilensteine erreicht'); }, goal: 5, val: (x) => x.milestones },
  { id: 'project_done', icon: '🎉', get name() { return tr('Geschafft'); }, get desc() { return tr('Ein Projekt abgeschlossen'); }, goal: 1, val: (x) => x.projectsDone },
  { id: 'revived', icon: '🌱', get name() { return tr('Wiederbelebt'); }, get desc() { return tr('Ein Projekt nach 14+ Tagen Pause weitergeführt'); }, goal: 1, val: (x) => x.revived },
  { id: 'week_goal', icon: '🎯', get name() { return tr('Wochenziel'); }, get desc() { return tr('Ein Wochenziel erreicht'); }, goal: 1, val: (x) => x.weekGoal },
  // Weitere Erfolge
  { id: 'hours_250', icon: '🏔️', get name() { return tr('Gipfelstürmer'); }, get desc() { return tr('250 Stunden erfasst'); }, goal: 250, val: (x) => x.hours },
  { id: 'streak_14', icon: '📆', get name() { return tr('Zwei Wochen am Stück'); }, get desc() { return tr('14 Tage in Folge aktiv'); }, goal: 14, val: (x) => x.streak },
  { id: 'active_50', icon: '🗓️', get name() { return tr('Dranbleiber'); }, get desc() { return tr('An 50 verschiedenen Tagen aktiv'); }, goal: 50, val: (x) => x.activeDays },
  { id: 'pomo_100', icon: '🏭', get name() { return tr('Tomatenimperium'); }, get desc() { return tr('100 Pomodoros abgeschlossen'); }, goal: 100, val: (x) => x.pomodoros },
  { id: 'tasks_100', icon: '🦾', get name() { return tr('Unermüdlich'); }, get desc() { return tr('100 Aufgaben erledigt'); }, goal: 100, val: (x) => x.tasks },
  { id: 'subtasks_25', icon: '🧩', get name() { return tr('Kleinkram-Profi'); }, get desc() { return tr('25 Unterpunkte abgehakt'); }, goal: 25, val: (x) => x.subtasks },
  { id: 'milestone_10', icon: '🧭', get name() { return tr('Kartograf'); }, get desc() { return tr('10 Meilensteine erreicht'); }, goal: 10, val: (x) => x.milestones },
  { id: 'projects_5', icon: '🗃️', get name() { return tr('Projektsammler'); }, get desc() { return tr('5 Projekte angelegt'); }, goal: 5, val: (x) => x.projects },
  { id: 'projects_done_3', icon: '🎖️', get name() { return tr('Vollender'); }, get desc() { return tr('3 Projekte abgeschlossen'); }, goal: 3, val: (x) => x.projectsDone },
  { id: 'notes_10', icon: '📓', get name() { return tr('Chronist'); }, get desc() { return tr('10 Notizen im Logbuch'); }, goal: 10, val: (x) => x.notes },
  { id: 'invest_1', icon: '💶', get name() { return tr('Investor'); }, get desc() { return tr('Erste Investition erfasst'); }, goal: 1, val: (x) => x.investments },
  { id: 'week_goal_4', icon: '📈', get name() { return tr('Beständig'); }, get desc() { return tr('In 4 Wochen das Wochenziel erreicht'); }, goal: 4, val: (x) => x.weekGoals },
  // Zusammenarbeit & Dokumente
  { id: 'team_1', icon: '👥', get name() { return tr('Teamplayer'); }, get desc() { return tr('Erstes Team angelegt'); }, goal: 1, val: (x) => x.teams },
  { id: 'people_5', icon: '🤝', get name() { return tr('Netzwerker'); }, get desc() { return tr('5 Personen angelegt'); }, goal: 5, val: (x) => x.people },
  { id: 'project_team', icon: '🏗️', get name() { return tr('Projektcrew'); }, get desc() { return tr('Einem Projekt ein Projektteam zugeordnet'); }, goal: 1, val: (x) => x.projectTeams },
  { id: 'assign_10', icon: '📌', get name() { return tr('Delegierer'); }, get desc() { return tr('10 Aufgaben Personen oder Teams zugewiesen'); }, goal: 10, val: (x) => x.assignedTasks },
  { id: 'team_done_10', icon: '🚣', get name() { return tr('Gemeinsam stark'); }, get desc() { return tr('10 Team-Aufgaben erledigt'); }, goal: 10, val: (x) => x.teamTasksDone },
  { id: 'mine_done_10', icon: '🙋', get name() { return tr('Zuverlässig'); }, get desc() { return tr('10 dir zugewiesene Aufgaben erledigt'); }, goal: 10, val: (x) => x.myTasksDone },
  { id: 'docs_10', icon: '📚', get name() { return tr('Archivar'); }, get desc() { return tr('10 Dokumente verknüpft'); }, goal: 10, val: (x) => x.docs },
  { id: 'income_1', icon: '💰', get name() { return tr('Erster Euro'); }, get desc() { return tr('Erste Einnahme erfasst'); }, goal: 1, val: (x) => x.incomes },
  { id: 'profit_1', icon: '📈', get name() { return tr('Schwarze Zahlen'); }, get desc() { return tr('Ein Projekt hat mehr eingebracht als gekostet'); }, goal: 1, val: (x) => x.profitable },
  { id: 'review_1', icon: '📝', get name() { return tr('Innehalten'); }, get desc() { return tr('Ersten Wochenrückblick gemacht'); }, goal: 1, val: (x) => x.reviews },
  { id: 'review_8', icon: '🧘', get name() { return tr('Reflektiert'); }, get desc() { return tr('8 Wochenrückblicke gemacht'); }, goal: 8, val: (x) => x.reviews },
  { id: 'focus_week', icon: '🎯', get name() { return tr('Fokussiert'); }, get desc() { return tr('Alle Fokus-Aufgaben einer Woche erledigt'); }, goal: 1, val: (x) => x.focusWeeks },
  // Geheime Erfolge – Name und Bedingung werden erst beim Erreichen verraten
  { id: 's_night', icon: '🦉', get name() { return tr('Nachteule'); }, get desc() { return tr('Einen Timer zwischen 22 und 4 Uhr gestartet'); }, goal: 1, val: (x) => x.nightStarts, secret: true },
  { id: 's_early', icon: '🐦', get name() { return tr('Früher Vogel'); }, get desc() { return tr('Einen Timer zwischen 5 und 7 Uhr gestartet'); }, goal: 1, val: (x) => x.earlyStarts, secret: true },
  { id: 's_weekend', icon: '🏖️', get name() { return tr('Wochenendkrieger'); }, get desc() { return tr('An Samstag und Sonntag desselben Wochenendes Zeit erfasst'); }, goal: 1, val: (x) => x.weekend, secret: true },
  { id: 's_marathon', icon: '🏃', get name() { return tr('Sitzfleisch'); }, get desc() { return tr('Einen Zeiteintrag mit mindestens 4 Stunden erfasst'); }, goal: 1, val: (x) => x.longSession, secret: true },
  { id: 's_pomo8', icon: '🥫', get name() { return tr('Tomaten-Marathon'); }, get desc() { return tr('8 Pomodoros in einer Sitzung geschafft'); }, goal: 1, val: (x) => x.pomoMarathon, secret: true },
  { id: 's_ontime', icon: '🚂', get name() { return tr('Pünktlich wie die Eisenbahn'); }, get desc() { return tr('3 Meilensteine bis zum Zieldatum erreicht'); }, goal: 3, val: (x) => x.onTime, secret: true },
  { id: 's_double', icon: '🌠', get name() { return tr('Übererfüllt'); }, get desc() { return tr('In einer Woche das doppelte Wochenziel geschafft'); }, goal: 1, val: (x) => x.doubleGoal, secret: true },
  { id: 's_phoenix', icon: '🌅', get name() { return tr('Phönix aus der Asche'); }, get desc() { return tr('Ein pausiertes Projekt wieder aktiviert'); }, goal: 1, val: (x) => x.reactivated, secret: true },
  { id: 's_perfect', icon: '💎', get name() { return tr('Perfektionist'); }, get desc() { return tr('Alle (mindestens 5) Aufgaben eines Projekts erledigt'); }, goal: 1, val: (x) => x.perfectProject, secret: true },
  { id: 's_holiday', icon: '🎄', get name() { return tr('Feiertagsfleiß'); }, get desc() { return tr('An Heiligabend, den Weihnachtstagen oder Neujahr aktiv gewesen'); }, goal: 1, val: (x) => x.holiday, secret: true },
  { id: 's_allhands', icon: '🙌', get name() { return tr('Alle Mann an Deck'); }, get desc() { return tr('Einen Meilenstein erreicht, der einem Team zugewiesen war'); }, goal: 1, val: (x) => x.teamMilestones, secret: true },
  { id: 's_bridge', icon: '🌉', get name() { return tr('Brückenbauer'); }, get desc() { return tr('Eine Person gehört zu 3 Teams'); }, goal: 3, val: (x) => x.maxTeamsPerPerson, secret: true },
  { id: 's_bigteam', icon: '🏟️', get name() { return tr('Volles Haus'); }, get desc() { return tr('Ein Team mit mindestens 8 Mitgliedern'); }, goal: 8, val: (x) => x.biggestTeam, secret: true },
  { id: 's_teamday', icon: '🎊', get name() { return tr('Teamtag'); }, get desc() { return tr('An einem Tag 5 Team-Aufgaben erledigt'); }, goal: 5, val: (x) => x.teamDay, secret: true },
];

function achievementStats() {
  const weeks = weekGoalHistory();
  const days = dayMap();
  const c = data.counters || {};
  return {
    projects: data.projects.length,
    hours: sum(data.timeEntries, (e) => e.minutes) / 60,
    streak: maxStreak(),
    pomodoros: data.counters?.pomodoros || 0,
    tasks: data.tasks.filter((t) => t.done).length,
    milestones: data.milestones.filter((m) => m.done).length,
    projectsDone: data.projects.filter((p) => p.status === 'abgeschlossen').length,
    revived: hasRevivedProject() ? 1 : 0,
    weekGoal: Math.min(1, weeks.hit),
    weekGoals: weeks.hit,
    activeDays: Object.keys(days).length,
    subtasks: sum(data.tasks, (t) => (t.subtasks || []).filter((st) => st.done).length),
    notes: data.notes.length,
    investments: data.investments.length,
    nightStarts: c.nightStarts || 0,
    earlyStarts: c.earlyStarts || 0,
    weekend: hadWeekend() ? 1 : 0,
    longSession: data.timeEntries.some((e) => e.minutes >= 240) ? 1 : 0,
    pomoMarathon: c.pomoMarathon || 0,
    onTime: data.milestones.filter((m) => m.done && m.dueDate && m.doneAt && m.doneAt <= m.dueDate).length,
    doubleGoal: weeks.double ? 1 : 0,
    reactivated: c.reactivated || 0,
    perfectProject: data.projects.some((p) => { const ts = data.tasks.filter((t) => t.projectId === p.id); return ts.length >= 5 && ts.every((t) => t.done); }) ? 1 : 0,
    ...teamStats(),
    holiday: Object.keys(days).some((d) => ['12-24', '12-25', '12-26', '01-01'].includes(d.slice(5))) ? 1 : 0,
  };
}

/** Neu erreichte Erfolge speichern und feiern. Beim allerersten Mal werden bestehende Erfolge still übernommen. */
function checkAchievements() {
  const x = achievementStats();
  const earned = ACHIEVEMENTS.filter((a) => a.val(x) >= a.goal).map((a) => a.id);
  if (!data.achievements) {
    data.achievements = Object.fromEntries(earned.map((id) => [id, todayISO()]));
    return [];
  }
  const fresh = earned.filter((id) => !data.achievements[id]);
  fresh.forEach((id) => (data.achievements[id] = todayISO()));
  // Ausgeschaltet: still mitschreiben, damit beim Wiedereinschalten keine Flut an Meldungen kommt
  if (fresh.length && data.settings.achievementsOn !== false) {
    // Geheime Erfolge zuerst nennen – die Überraschung ist das Schönste
    const list = fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).sort((a, b) => Number(!!b.secret) - Number(!!a.secret));
    const first = list[0];
    setTimeout(() => {
      toast((first.secret ? tr('🤫 Geheimer Erfolg entdeckt: {name}', { name: `${first.icon} ${first.name}` }) : tr('🏅 Erfolg freigeschaltet: {name}', { name: `${first.icon} ${first.name}` })) + (fresh.length > 1 ? ` ${tr('(+{n} weitere)', { n: fresh.length - 1 })}` : ''));
      confetti();
    }, 300);
  }
  return fresh;
}

function renderAchievements() {
  const x = achievementStats();
  const got = data.achievements || {};
  const visible = ACHIEVEMENTS.filter((a) => !a.secret);
  const secrets = ACHIEVEMENTS.filter((a) => a.secret);
  const n = visible.filter((a) => got[a.id]).length;
  const nSecret = secrets.filter((a) => got[a.id]).length;
  // Reihenfolge: erreichte zuerst (links), dann nach Fortschritt absteigend, noch nicht begonnene danach,
  // noch nicht entdeckte geheime Erfolge ganz rechts
  const progressOf = (a) => (got[a.id] ? 2 : a.secret ? -1 : Math.min(1, Math.max(0, a.val(x) / a.goal)));
  const sorted = ACHIEVEMENTS.map((a, i) => ({ a, i, p: progressOf(a) })).sort((m, k) => k.p - m.p || m.i - k.i).map((m) => m.a);
  const badges = sorted.map((a) => {
    const done = !!got[a.id];
    if (a.secret && !done) {
      const tip = `<b>🔒 ${tr('Geheimer Erfolg')}</b><span class="tip-sub">${tr('Wird verraten, sobald du ihn erreichst. Probier Neues aus!')}</span>`;
      return `<div class="badge-tile secret locked" tabindex="0" data-tip="${esc(tip)}">
        <span class="badge-icon">🔒</span><span class="badge-name">???</span></div>`;
    }
    const v = Math.min(a.goal, a.val(x));
    const tip = `<b>${a.icon} ${esc(a.name)}</b><span class="tip-sub">${esc(a.desc)}</span>${done ? `<span class="tip-sub">✔ ${tr('erreicht am {date}', { date: fmtDate(got[a.id]) })}</span>` : `<span class="tip-sub">${tr('Fortschritt: {v} / {goal}', { v: fmtNum(Math.floor(v * 10) / 10), goal: a.goal })}</span>`}`;
    return `<div class="badge-tile ${done ? 'earned' : 'locked'}${a.secret ? ' secret' : ''}" tabindex="0" data-tip="${esc(a.secret ? `${tip}<span class="tip-sub">🤫 ${tr('Geheimer Erfolg')}</span>` : tip)}">
      <span class="badge-icon">${a.icon}</span><span class="badge-name">${esc(a.name)}</span>
      ${done ? '' : `<span class="badge-prog"><span style="width:${(v / a.goal) * 100}%"></span></span>`}
    </div>`;
  }).join('');
  return `<section class="card">
    <div class="card-head"><h2>🏅 ${tr('Erfolge')}</h2><span class="small muted">${tr('{n} von {all}', { n, all: visible.length })} · ${tr('🤫 {n} von {all} geheimen', { n: nSecret, all: secrets.length })}</span></div>
    <div class="badge-grid">${badges}</div>
  </section>`;
}

/* ---------------------------- Popover-Menüs (Schnellaktionen) ------------ */

const popover = document.createElement('div');
popover.className = 'popover';
popover.hidden = true;
popover.setAttribute('role', 'menu');
document.body.appendChild(popover);
let popoverAnchor = null;

function openPopover(anchor, html) {
  hideTip();
  popover.innerHTML = html;
  popover.hidden = false;
  popoverAnchor = anchor;
  if (matchMedia('(max-width: 640px)').matches) { popover.style.left = popover.style.top = ''; }
  else {
    const r = anchor.getBoundingClientRect(), pr = popover.getBoundingClientRect();
    const left = Math.min(window.innerWidth - pr.width - 8, Math.max(8, r.right - pr.width));
    const top = r.bottom + 6 + pr.height < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - pr.height - 6);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  popover.querySelector('button')?.focus({ preventScroll: true });
}
function closePopover() {
  if (popover.hidden) return;
  popover.hidden = true;
  popoverAnchor = null;
}
document.addEventListener('click', (e) => {
  if (popover.hidden || suppressClick) return;
  if (popover.contains(e.target)) { if (e.target.closest('[data-action]')) setTimeout(closePopover); return; }
  if (popoverAnchor && popoverAnchor.contains(e.target)) return;
  closePopover();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });
window.addEventListener('resize', closePopover);

function projectMenuHTML(p) {
  return `<div class="pop-title"><span class="dot-color" style="background:${esc(p.color)}"></span> ${esc(p.name)}</div>
    <button class="pop-item" data-action="startPomodoro" data-id="${p.id}">🍅 ${tr('Pomodoro starten')}</button>
    <button class="pop-item" data-action="startTimer" data-id="${p.id}">▶ ${tr('Stoppuhr starten')}</button>
    <button class="pop-item" data-action="addTime" data-id="${p.id}">⏱️ ${tr('Zeit erfassen')}</button>
    <button class="pop-item" data-action="addTask" data-id="${p.id}">✅ ${tr('Aufgabe anlegen')}</button>
    <button class="pop-item" data-action="addNote" data-id="${p.id}">📝 ${tr('Notiz')}</button>
    <button class="pop-item" data-action="goProject" data-id="${p.id}">🗂️ ${tr('Projekt öffnen')}</button>
    <div class="pop-sep"></div>
    <button class="pop-item" data-action="duplicateProject" data-id="${p.id}">⧉ ${tr('Projekt duplizieren')}</button>
    <button class="pop-item" data-action="saveTemplate" data-id="${p.id}">📋 ${tr('Als Vorlage speichern')}</button>
    ${p.archived ? `<button class="pop-item" data-action="unarchiveProject" data-id="${p.id}">♻️ ${tr('Wiederherstellen')}</button>`
      : `<button class="pop-item" data-action="archiveProject" data-id="${p.id}">🗄️ ${tr('Archivieren')}</button>`}
    <div class="pop-sep"></div>
    <div class="pop-label">${tr('Status')}</div>
    <div class="pop-chips">${STATUS.map((st) => `<button class="chip ${p.status === st.value ? 'active' : ''}" data-action="setProjectStatus" data-id="${p.id}" data-status="${st.value}">${st.label}</button>`).join('')}</div>`;
}
const qaButton = (p) => `<button class="btn ghost icon qa-btn" data-action="quickMenu" data-id="${p.id}" aria-label="${tr('Aktionen für {name}', { name: esc(p.name) })}" title="${tr('Aktionen')}">⋯</button>`;

function taskMenuHTML(t) {
  const p = getProject(t.projectId);
  return `<div class="pop-title">${esc(t.title)}</div>
    <div class="pop-chips">${[['open', tr('Offen')], ['doing', tr('In Arbeit')], ['done', tr('Erledigt')]].map(([v, l]) =>
      `<button class="chip ${taskStatusOf(t) === v ? 'active' : ''}" data-action="setTaskStatus" data-id="${t.id}" data-status="${v}">${l}</button>`).join('')}</div>
    <div class="pop-sep"></div>
    <button class="pop-item" data-action="editTask" data-id="${t.id}">✎ ${tr('Bearbeiten')}</button>
    <button class="pop-item" data-action="addDoc" data-id="${t.projectId}" data-task="${t.id}">📎 ${tr('Dokument verknüpfen')}</button>
    ${t.done ? '' : `<button class="pop-item" data-action="addSubtask" data-id="${t.id}">＋ ${tr('Unterpunkt')}</button>`}
    ${p && !t.done ? `<button class="pop-item" data-action="startTimer" data-id="${p.id}" data-task="${t.id}">▶ ${tr('Timer für diese Aufgabe starten')}</button>
      <button class="pop-item" data-action="startPomodoro" data-id="${p.id}" data-task="${t.id}">🍅 ${tr('Pomodoro für diese Aufgabe')}</button>` : ''}
    <button class="pop-item" data-action="addTime" data-id="${t.projectId}" data-task="${t.id}">＋ ${tr('Zeit auf Aufgabe buchen')}</button>
    <div class="pop-sep"></div>
    <button class="pop-item danger" data-action="deleteTask" data-id="${t.id}">🗑 ${tr('Löschen')}</button>`;
}

/* ---------------------------- Detailansichten (Diagramme anklicken) ------- */

/** Ausgeblendete Projekte im Wochendiagramm (per Klick auf die Legende, nur für diese Sitzung) */
const hiddenSeries = new Set();

function openDetail(spec) {
  hideTip();
  let [kind, a, pid] = spec.split(':');
  let title, body;
  const entryRow = (e) => {
    const p = getProject(e.projectId);
    return `<li><span class="dot-color" style="background:${esc(p?.color || 'var(--muted)')}"></span>
      <div class="grow"><div class="title">${esc(entryTitle(e))}</div>
        <div class="meta"><span class="amount">⏱️ ${fmtDuration(e.minutes)}</span><span>${esc(p?.name || '–')}</span>${kind === 'week' ? `<span>${esc(autoTimeTitle(e.date))}</span>` : ''}</div>
        ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}</div>
      <button class="btn ghost icon" data-action="editTime" data-id="${e.id}" title="${tr('Bearbeiten')}" aria-label="${tr('Zeiteintrag bearbeiten')}">✎</button></li>`;
  };
  if (kind === 'day') {
    const items = dayDetails(a)[a] || [];
    const entries = data.timeEntries.filter((e) => e.date === a);
    const other = items.filter((it) => it.icon !== '⏱️');
    title = parseISO(a).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    body = `<p class="small muted" style="margin:0">${tr('{d} erfasst', { d: fmtDuration(sum(entries, (e) => e.minutes)) })} · ${trp(items.length, '{n} Aktivität', '{n} Aktivitäten')}</p>
      ${entries.length ? `<h3>⏱️ ${tr('Zeiteinträge')}</h3><ul class="list">${entries.map(entryRow).join('')}</ul>` : ''}
      ${other.length ? `<h3>${tr('Weitere Aktivitäten')}</h3><ul class="list">${other.map((it) => `<li><span class="dot-color" style="background:${esc(it.p.color)}"></span><div class="grow"><div class="title">${it.icon} ${esc(it.text)}</div><div class="meta">${esc(it.p.name)}</div></div></li>`).join('')}</ul>` : ''}
      ${items.length ? '' : `<div class="empty">${tr('An diesem Tag gab es keine Aktivität.')}</div>`}`;
  } else {
    let from, to, unit = 'week';
    if (kind === 'range') { [, unit, from, to, pid] = spec.split(':'); }
    else { const start = addDays(startOfWeek(new Date()), Number(a) * 7); from = toISO(start); to = toISO(addDays(start, 7)); }
    const today = todayISO();
    const entries = data.timeEntries.filter((e) => e.date >= from && e.date < to && (!pid || e.projectId === pid))
      .sort((x, y) => y.date.localeCompare(x.date));
    const p = pid ? getProject(pid) : null;
    title = periodName({ unit, from, to, current: from <= today && today < to, label: unit === 'year' ? from.slice(0, 4) : parseISO(from).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) }) + (p ? ` · ${p.name}` : '');
    const byProject = {};
    entries.forEach((e) => (byProject[e.projectId] = (byProject[e.projectId] || 0) + e.minutes));
    body = `<p class="small muted" style="margin:0">${trp(entries.length, '{d} in {n} Eintrag', '{d} in {n} Einträgen', { d: fmtDuration(sum(entries, (e) => e.minutes)) })}</p>
      ${!pid && Object.keys(byProject).length > 1 ? `<div class="detail-split">${Object.entries(byProject).sort((x, y) => y[1] - x[1]).map(([id, m]) => `<span><span class="dot-color" style="background:${esc(getProject(id)?.color || 'var(--muted)')}"></span> ${esc(getProject(id)?.name || '–')} <b>${fmtDuration(m)}</b></span>`).join('')}</div>` : ''}
      ${entries.length ? `<ul class="list">${entries.map(entryRow).join('')}</ul>` : `<div class="empty">${tr('In diesem Zeitraum wurde keine Zeit erfasst.')}</div>`}`;
  }
  const dlg = $('#modal');
  dlg.classList.remove('wide');
  dlg.innerHTML = `<div class="form detail-view"><h2>${esc(title)}</h2>${body}
    <div class="form-actions"><button type="button" class="btn primary" data-close>${tr('Schließen')}</button></div></div>`;
  dlg.querySelector('[data-close]').addEventListener('click', () => { dlg.close(); unlockScroll(); });
  lockScroll();
  dlg.showModal();
}

/* ---------------------------- Schnelleingabe ------------------------------ */
/* Eine Zeile, alles drin: „Fotos bearbeiten #shop @fr !hoch ~2h“ → Aufgabe,
   „1:30 Produktfotos #shop“ → Zeit, „12,90€ Holzleim #shop“ → Investition,
   „+120€ Markt #shop“ → Einnahme, „> Idee …“ → Notiz. Taste N öffnet sie. */
const QUICK_KEY = 'projekttracker.ui.quickProject';
const normName = (s) => String(s || '').toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9äöüß]+/g, '');
function findQuickProject(token) {
  const t = normName(token);
  if (!t) return null;
  const list = liveProjects();
  return list.find((p) => normName(p.name) === t)
    || list.find((p) => normName(p.name).startsWith(t))
    || list.find((p) => p.name.toLocaleLowerCase('de').split(/[\s\-_/]+/).some((w) => normName(w).startsWith(t)))
    || list.find((p) => normName(p.name).includes(t)) || null;
}
const QUICK_DAYS = { so: 0, sun: 0, sonntag: 0, sunday: 0, mo: 1, mon: 1, montag: 1, monday: 1, di: 2, tue: 2, dienstag: 2, tuesday: 2,
  mi: 3, wed: 3, mittwoch: 3, wednesday: 3, do: 4, thu: 4, donnerstag: 4, thursday: 4, fr: 5, fri: 5, freitag: 5, friday: 5, sa: 6, sat: 6, samstag: 6, saturday: 6 };
function parseQuickDate(s) {
  const t = s.toLocaleLowerCase('de').replace(/\.$/, '');
  const now = new Date();
  if (['heute', 'today', 'h'].includes(t)) return todayISO();
  if (['morgen', 'tomorrow', 'm'].includes(t)) return toISO(addDays(now, 1));
  if (['übermorgen', 'uebermorgen'].includes(t)) return toISO(addDays(now, 2));
  if (['gestern', 'yesterday'].includes(t)) return toISO(addDays(now, -1));
  if (t in QUICK_DAYS) { let d = addDays(now, 1); while (d.getDay() !== QUICK_DAYS[t]) d = addDays(d, 1); return toISO(d); }
  let m;
  if ((m = t.match(/^\+(\d+)(t|d|w)?$/))) return toISO(addDays(now, +m[1] * (m[2] === 'w' ? 7 : 1)));
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return t;
  if ((m = t.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/)) || (m = t.match(/^(\d{1,2})\/(\d{1,2})\/?(\d{2,4})?$/))) {
    let [, a, b, y] = m;
    let day = +a, mon = +b;
    if (t.includes('/') && LANG === 'en' && LOCALE === 'en-US') [day, mon] = [mon, day];
    let year = y ? (y.length === 2 ? 2000 + +y : +y) : now.getFullYear();
    let d = new Date(year, mon - 1, day);
    if (!y && toISO(d) < todayISO()) d = new Date(year + 1, mon - 1, day);
    return d.getMonth() === mon - 1 ? toISO(d) : null;
  }
  return null;
}
const QUICK_PRIO = { hoch: 'hoch', high: 'hoch', h: 'hoch', mittel: 'mittel', medium: 'mittel', m: 'mittel', niedrig: 'niedrig', low: 'niedrig', n: 'niedrig', l: 'niedrig' };

function parseQuick(text, defaultPid) {
  let s = ` ${text} `;
  const out = { kind: 'task', title: '', projectId: null, priority: null, date: null, minutes: null, estimate: null, amount: null, problems: [] };
  if (/^\s*>/.test(s)) { out.kind = 'note'; s = s.replace(/^\s*>/, ' '); }
  s = s.replace(/\s#(\S+)/g, (m, tok) => { const p = findQuickProject(tok); if (p) { out.projectId = p.id; return ' '; } out.problems.push(tr('Kein Projekt passt zu „#{t}“.', { t: tok })); return ' '; });
  s = s.replace(/\s!(hoch|high|mittel|medium|niedrig|low|[hmnl])?(?=\s)/i, (m, tok) => { out.priority = tok ? QUICK_PRIO[tok.toLowerCase()] : 'hoch'; return ' '; });
  s = s.replace(/\s@(\S+)/, (m, tok) => { const d = parseQuickDate(tok); if (d) { out.date = d; return ' '; } out.problems.push(tr('Datum „@{t}“ nicht erkannt.', { t: tok })); return ' '; });
  s = s.replace(/\s~(\S+)(?=\s)/, (m, tok) => { const v = parseDuration(tok); if (v) { out.estimate = v; return ' '; } return m; });
  if (out.kind !== 'note') {
    s = s.replace(/\s(\+)?(?:€\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:€|eur|euro)(?=\s))/i, (m, plus, a1, a2) => {
      out.amount = Number(String(a1 || a2).replace(',', '.')); out.kind = plus ? 'income' : 'investment'; return ' ';
    });
    if (out.amount === null) {
      s = s.replace(/\s(\d{1,2}:\d{2}|\d+(?:[.,]\d+)?\s?(?:h|std|min|m))(?=\s)/i, (m, tok) => { const v = parseDuration(tok); if (v) { out.minutes = v; out.kind = 'time'; return ' '; } return m; });
    }
  }
  out.title = s.replace(/\s+/g, ' ').trim();
  out.projectId ||= defaultPid || null;
  if (!out.projectId) out.problems.push(tr('Füge ein Projekt mit #name hinzu.'));
  if (!out.title && !['time'].includes(out.kind)) out.problems.push(tr('Es fehlt noch ein Text.'));
  return out;
}
const QUICK_KINDS = {
  get task() { return ['✅', tr('Aufgabe')]; }, get time() { return ['⏱️', tr('Zeit')]; }, get investment() { return ['💶', tr('Investition')]; },
  get income() { return ['💰', tr('Einnahme')]; }, get note() { return ['📝', tr('Notiz')]; },
};
function quickPreview(q) {
  const p = getProject(q.projectId);
  const [icon, label] = QUICK_KINDS[q.kind];
  const bits = [];
  if (p) bits.push(`<span><span class="dot-color" style="background:${esc(p.color)}"></span> ${esc(p.name)}</span>`);
  if (q.kind === 'task') {
    if (q.date) bits.push(`<span>📅 ${fmtDate(q.date)}</span>`);
    if (q.priority) bits.push(`<span class="badge ${q.priority}">${prioLabel(q.priority)}</span>`);
    if (q.estimate) bits.push(`<span class="badge">⏱ ~${fmtDuration(q.estimate)}</span>`);
  } else {
    bits.push(`<span>📅 ${fmtDate(q.date || todayISO())}</span>`);
    if (q.minutes) bits.push(`<b>${fmtDuration(q.minutes)}</b>`);
    if (q.amount !== null) bits.push(`<b class="${q.kind === 'income' ? 'pos' : ''}">${q.kind === 'income' ? '+' : ''}${fmtEUR(q.amount)}</b>`);
  }
  return `<div class="quick-kind">${icon} ${label}</div>
    <div class="quick-title">${esc(q.title || (q.kind === 'time' ? autoTimeTitle(q.date || todayISO()) : '…'))}</div>
    <div class="meta">${bits.join('')}</div>
    ${q.problems.length ? `<div class="quick-problem">⚠️ ${q.problems.map(esc).join(' ')}</div>` : ''}`;
}
function createQuick(q) {
  const id = uid(), now = new Date().toISOString(), date = q.date || todayISO();
  if (q.kind === 'task') data.tasks.push({ id, projectId: q.projectId, title: q.title, priority: q.priority || 'mittel', dueDate: q.date, estimate: q.estimate,
    notes: '', subtasks: [], assignees: [], milestoneId: null, done: false, doneAt: null, status: 'open', createdAt: now });
  else if (q.kind === 'time') data.timeEntries.push({ id, projectId: q.projectId, date, minutes: q.minutes, title: q.title || autoTimeTitle(date), autoTitle: !q.title, description: '' });
  else if (q.kind === 'investment') data.investments.push({ id, projectId: q.projectId, description: q.title, amount: q.amount, date, category: normalizeCategory('') });
  else if (q.kind === 'income') { data.incomes ||= []; data.incomes.push({ id, projectId: q.projectId, description: q.title, amount: q.amount, date, category: '' }); }
  else if (q.kind === 'note') data.notes.push({ id, projectId: q.projectId, date, text: q.title, createdAt: now });
  try { localStorage.setItem(QUICK_KEY, q.projectId); } catch { /* ignorieren */ }
  commit();
}
function defaultQuickProject() {
  const r = parseRoute();
  const live = (id) => { const p = getProject(id); return p && !p.archived ? p.id : null; };
  let last = null;
  try { last = localStorage.getItem(QUICK_KEY); } catch { /* ignorieren */ }
  return (r.view === 'projekt' && live(r.id)) || live(last) || liveProjects().find((p) => p.status === 'aktiv')?.id || liveProjects()[0]?.id || null;
}

function openQuickAdd(prefill = '') {
  if ($('#modal').open) return;
  closePopover(); hideTip();
  const dlg = $('#modal');
  dlg.classList.remove('wide');
  let defPid = defaultQuickProject();
  dlg.innerHTML = `<div class="quick">
    <div class="quick-head">⚡ <input type="text" class="palette-input quick-input" placeholder="${tr('z. B. Fotos bearbeiten #shop @fr !hoch')}" aria-label="${tr('Schnelleingabe')}" autocomplete="off" spellcheck="false" enterkeyhint="done">
      <button type="button" class="btn ghost icon quick-close" aria-label="${tr('Schließen')}" title="${tr('Schließen')}">✕</button></div>
    <div class="quick-preview" aria-live="polite"></div>
    <ul class="quick-done list"></ul>
    <details class="quick-help"><summary>${tr('So funktioniert’s')}</summary>
      <table class="small"><tbody>
        <tr><td><code>Text</code></td><td>${tr('Aufgabe')}</td></tr>
        <tr><td><code>#shop</code></td><td>${tr('Projekt (Anfang des Namens genügt)')}</td></tr>
        <tr><td><code>@heute @morgen @fr @24.12. @+3</code></td><td>${tr('Fälligkeit bzw. Datum')}</td></tr>
        <tr><td><code>!hoch !mittel !niedrig</code></td><td>${tr('Priorität (nur ! = hoch)')}</td></tr>
        <tr><td><code>~2h</code></td><td>${tr('geschätzter Aufwand einer Aufgabe')}</td></tr>
        <tr><td><code>1:30 · 45min · 2h</code></td><td>${tr('Zeit erfassen')}</td></tr>
        <tr><td><code>12,90€</code></td><td>${tr('Investition')}</td></tr>
        <tr><td><code>+120€</code></td><td>${tr('Einnahme')}</td></tr>
        <tr><td><code>&gt; Text</code></td><td>${tr('Notiz im Logbuch')}</td></tr>
      </tbody></table></details>
    <div class="palette-foot small muted">${tr('Enter anlegen · weiter tippen für den nächsten Eintrag · Esc schließen')}</div>
  </div>`;
  const input = dlg.querySelector('.quick-input'), prev = dlg.querySelector('.quick-preview'), done = dlg.querySelector('.quick-done');
  const update = () => {
    const v = input.value.trim();
    prev.innerHTML = v ? quickPreview(parseQuick(v, defPid)) : `<div class="small muted">${defPid ? tr('Ohne #projekt landet alles in „{name}“.', { name: esc(getProject(defPid).name) }) : tr('Füge ein Projekt mit #name hinzu.')}</div>`;
  };
  input.addEventListener('input', update);
  dlg.querySelector('.quick-close').addEventListener('click', () => dlg.close());
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    const q = parseQuick(v, defPid);
    if (q.problems.length) { prev.classList.remove('shake'); void prev.offsetWidth; prev.classList.add('shake'); return; }
    createQuick(q);
    defPid = q.projectId;
    const [icon] = QUICK_KINDS[q.kind];
    const p = getProject(q.projectId);
    done.insertAdjacentHTML('afterbegin', `<li><span class="today-ico">${icon}</span><div class="grow"><div class="title">${esc(q.title || autoTimeTitle(q.date || todayISO()))}</div>
      <div class="meta"><span><span class="dot-color" style="background:${esc(p.color)}"></span> ${esc(p.name)}</span>${q.minutes ? `<span>${fmtDuration(q.minutes)}</span>` : ''}${q.amount !== null ? `<span>${fmtEUR(q.amount)}</span>` : ''}</div></div><span class="badge aktiv">✓</span></li>`);
    input.value = '';
    update();
  });
  dlg.addEventListener('close', () => unlockScroll(), { once: true });
  lockScroll();
  dlg.showModal();
  input.value = prefill;
  update();
  input.focus();
}
// Taste „N“ (außerhalb von Eingabefeldern) öffnet die Schnelleingabe
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || $('#modal').open) return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  e.preventDefault();
  openQuickAdd();
});

/* ---------------------------- Befehlspalette (⌘K / Strg+K) ---------------- */

function paletteCommands() {
  const cmds = [];
  const add = (icon, label, run, hint = '') => cmds.push({ icon, label, run, hint, key: `${label} ${hint}`.toLocaleLowerCase('de') });
  const nav = tr('Navigation');
  add('📊', tr('Übersicht'), () => { location.hash = '#/'; }, nav);
  add('🗂️', tr('Projekte'), () => { location.hash = '#/projekte'; }, nav);
  add('⚙️', tr('Einstellungen'), () => { location.hash = '#/einstellungen'; }, nav);
  add('⚡', tr('Schnelleingabe'), () => openQuickAdd(), tr('Aufgabe Zeit schnell anlegen N'));
  add('➕', tr('Neues Projekt'), () => actions.newProject());
  add('⏱️', tr('Zeit erfassen'), () => actions.addTime({}));
  if (data.timer) add('■', data.timer.mode === 'pomodoro' ? tr('Pomodoro beenden') : tr('Timer stoppen'), () => actions.stopTimer());
  add('💾', tr('Sicherung exportieren'), () => actions.exportData(), 'Backup');
  add('⬆', tr('Sicherung importieren'), () => actions.importData(), 'Backup');
  add('📅', tr('Termine als Kalender-Datei (.ics)'), () => actions.exportIcs(), tr('Kalender iCal Outlook Termine'));
  add('📄', tr('Zeit & Investitionen aus CSV importieren'), () => actions.importCsv(), 'CSV Excel Import');
  add('🗺️', tr('Roadmap'), () => actions.openRoadmap(), tr('Zeitleiste Gantt Projekte'));
  add('📝', tr('Wochenrückblick'), () => { location.hash = '#/woche'; }, tr('Woche planen Fokus Reflexion'));
  add('🧩', tr('Übersicht anpassen'), () => actions.customizeDashboard(), 'Layout');
  THEMES.forEach(([v, l]) => add(l.split(' ')[0], tr('Darstellung: {theme}', { theme: tr(l).replace(/^\S+\s/, '') }), () => { data.settings.theme = v; commit(); }, tr('Theme Hell Dunkel')));
  LANGUAGES.forEach(([code, name]) => add('🌐', tr('Sprache: {lang}', { lang: name }), () => { data.settings.language = code; commit(); }, 'Language Sprache'));
  add('↔', tr('Seitenleiste ein-/ausklappen'), () => actions.toggleSidebar(), nav);
  const order = { aktiv: 0, pausiert: 1, idee: 2, abgeschlossen: 3 };
  [...data.projects].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || order[a.status] - order[b.status]).forEach((p) => {
    add(p.archived ? '🗄️' : '🗂️', tr('Öffnen: {name}', { name: p.name }), () => { location.hash = `#/projekt/${p.id}`; }, p.category || '');
    if (p.status !== 'abgeschlossen' && !p.archived) {
      add('🍅', tr('Pomodoro: {name}', { name: p.name }), () => actions.startPomodoro({ id: p.id }), 'Timer');
      add('⏱️', tr('Zeit erfassen: {name}', { name: p.name }), () => actions.addTime({ id: p.id }));
      add('✅', tr('Aufgabe anlegen: {name}', { name: p.name }), () => actions.addTask({ id: p.id }));
      add('📝', tr('Notiz: {name}', { name: p.name }), () => actions.addNote({ id: p.id }));
      add('💶', tr('Investition: {name}', { name: p.name }), () => actions.addInvestment({ id: p.id }));
      add('💰', tr('Einnahme: {name}', { name: p.name }), () => actions.addIncome({ id: p.id }));
    }
  });
  data.docs.forEach((d) => {
    const u = safeUrl(d.url);
    if (u) add(docInfo(u).icon, tr('Dokument: {title}', { title: d.title || u }), () => window.open(u, '_blank', 'noopener'), getProject(d.projectId)?.name || '');
  });
  sortTasks(data.tasks.filter((t) => !t.done && !getProject(t.projectId)?.archived)).forEach((t) => {
    add('☐', tr('Erledigen: {title}', { title: t.title }), () => actions.toggleTask({ id: t.id }), getProject(t.projectId)?.name || '');
  });
  return cmds;
}

let paletteState = null;
function openPalette() {
  if ($('#modal').open) return;
  closePopover(); hideTip();
  paletteState = { cmds: paletteCommands(), list: [], active: 0 };
  const dlg = $('#modal');
  dlg.classList.remove('wide');
  dlg.innerHTML = `<div class="palette">
    <input type="text" class="palette-input" placeholder="${tr('Befehl oder Projekt suchen …')}" aria-label="${tr('Befehl suchen')}" autocomplete="off" spellcheck="false">
    <ul class="palette-list" role="listbox"></ul>
    <div class="palette-foot small muted">${tr('↑ ↓ auswählen · Enter ausführen · Esc schließen')}</div>
  </div>`;
  const input = dlg.querySelector('.palette-input');
  input.addEventListener('input', () => { paletteState.active = 0; renderPalette(input.value); });
  input.addEventListener('keydown', (e) => {
    if (!paletteState) return;
    const n = paletteState.list.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteState.active = (paletteState.active + 1) % Math.max(1, n); renderPalette(input.value, true); }
    if (e.key === 'ArrowUp') { e.preventDefault(); paletteState.active = (paletteState.active - 1 + n) % Math.max(1, n); renderPalette(input.value, true); }
    if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteState.active); }
  });
  dlg.querySelector('.palette-list').addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) runPalette(Number(li.dataset.i));
  });
  dlg.addEventListener('close', () => { paletteState = null; }, { once: true });
  lockScroll();
  dlg.showModal();
  renderPalette('');
  input.focus();
}
function renderPalette(q, keepList = false) {
  if (!paletteState) return;
  if (!keepList) {
    const words = q.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
    paletteState.list = paletteState.cmds.filter((c) => words.every((w) => c.key.includes(w))).slice(0, 50);
    if (/(^|\s)(#\S|@\S|!|~\S|\d+:\d{2}|\+?\d+(?:[.,]\d+)?\s?€|>)/.test(q)) {
      const text = q.trim();
      paletteState.list.unshift({ icon: '⚡', label: tr('Schnelleingabe: {text}', { text }), hint: 'Enter', run: () => openQuickAdd(text) });
    }
  }
  const ul = $('#modal .palette-list');
  ul.innerHTML = paletteState.list.length ? paletteState.list.map((c, i) => `<li data-i="${i}" role="option" class="${i === paletteState.active ? 'active' : ''}" aria-selected="${i === paletteState.active}">
      <span class="pal-ico">${c.icon}</span><span class="pal-label">${esc(c.label)}</span>${c.hint ? `<span class="pal-hint">${esc(c.hint)}</span>` : ''}</li>`).join('')
    : `<li class="pal-empty">${tr('Nichts gefunden')}</li>`;
  ul.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
function runPalette(i) {
  const cmd = paletteState?.list[i];
  if (!cmd) return;
  $('#modal').close();
  unlockScroll();
  setTimeout(() => cmd.run(), 0);
}
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (paletteState) { $('#modal').close(); unlockScroll(); } else openPalette();
  }
});

/* ---------------------------- Wischgesten (Touch) ------------------------- */
/* Aufgabe nach rechts wischen = erledigt, nach links = Optionen */

let swipe = null;
let suppressClick = false;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const li = e.target.closest('li.task');
  if (!li || e.target.closest('button, a, input, textarea') || li.closest('.wgrid.editing')) return;
  swipe = { li, x0: e.clientX, y0: e.clientY, dx: 0, dir: null, id: e.pointerId };
});
document.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  if (!swipe.dir) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.dir = 'h';
      const li = swipe.li, ul = li.parentElement;
      ul.style.position = 'relative';
      swipe.bg = document.createElement('div');
      swipe.bg.className = 'swipe-bg';
      Object.assign(swipe.bg.style, { top: `${li.offsetTop}px`, height: `${li.offsetHeight}px` });
      ul.insertBefore(swipe.bg, li);
      li.classList.add('swiping');
    } else return;
  }
  swipe.dx = Math.max(-140, Math.min(140, dx));
  swipe.li.style.transform = `translateX(${swipe.dx}px)`;
  const done = swipe.li.classList.contains('done');
  swipe.bg.className = `swipe-bg ${swipe.dx > 0 ? 'right' : 'left'} ${Math.abs(swipe.dx) > 80 ? 'armed' : ''}`;
  swipe.bg.innerHTML = swipe.dx > 0 ? `<span>${done ? `↺ ${tr('Wieder öffnen')}` : `✓ ${tr('Erledigt')}`}</span>` : `<span>⋯ ${tr('Optionen')}</span>`;
});
function endSwipe() {
  if (!swipe) return;
  const { li, dx, dir, bg } = swipe;
  swipe = null;
  if (dir !== 'h') return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 350);
  li.style.transition = 'transform .2s ease';
  li.style.transform = '';
  setTimeout(() => { li.style.transition = ''; li.classList.remove('swiping'); bg?.remove(); }, 220);
  const id = li.querySelector('[data-action="toggleTask"]')?.dataset.id;
  if (!id) return;
  if (dx > 80) { navigator.vibrate?.(15); setTimeout(() => actions.toggleTask({ id }), 180); }
  else if (dx < -80) { const t = data.tasks.find((x) => x.id === id); if (t) openPopover(li, taskMenuHTML(t)); }
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);
document.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);

/* ------------------------------------------------------------------------
   Event-Handling & Start
   ------------------------------------------------------------------------ */

let lastQaButton = null;
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'quickMenu') lastQaButton = el;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset });
  syncTimerSound(); // Start/Pause/Weiter: Musik passend starten oder anhalten
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change="setStatus"]');
  if (!el) return;
  const p = getProject(el.dataset.id);
  const wasDone = p.status === 'abgeschlossen';
  noteStatusChange(p.status, el.value);
  p.status = el.value;
  commit();
  if (!wasDone && p.status === 'abgeschlossen') celebrateProject(p);
  else toast(tr('Status: {s}', { s: statusLabel(p.status) }));
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="settings"]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  data.settings.weeklyHoursGoal = Math.max(0, Number(fd.get('weeklyHoursGoal')) || 0);
  commit();
  toast(tr('Einstellungen gespeichert'));
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
    timerBeep: Number(fd.get('timerBeep')) || 0,
    timerSound: String(fd.get('timerSound') || 'beep'),
    timerSoundUrl: String(fd.get('timerSoundUrl') || '').trim(),
    timerSoundVolume: Number(fd.get('timerSoundVolume') ?? 60),
    timerSoundBreaks: fd.get('timerSoundBreaks') === 'on',
  });
  snd.failed = null;
  if (snd.preview) { snd.preview = null; }
  syncTimerSound();
  Object.assign(data.settings, { pomoWork: pomoCfg().work, pomoShort: pomoCfg().short, pomoLong: pomoCfg().long, pomoEvery: pomoCfg().every });
  if (data.settings.pomoNotify) requestNotifyPermission();
  commit();
  toast(tr('Pomodoro-Einstellungen gespeichert'));
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="reminders"]');
  if (!form) return;
  e.preventDefault();
  const v = readReminderForm(form);
  if (!v.reminderTexts.length) v.reminderTexts = null; // leer = Standardtexte
  Object.assign(data.settings, v);
  commit();
  toast(tr('Erinnerungen gespeichert'));
});

// Ein-/Aus-Schalter in den Einstellungen
document.addEventListener('change', (e) => {
  const key = e.target.dataset?.settingToggle;
  if (!key) return;
  data.settings[key] = e.target.checked;
  commit();
});

// Sprache
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-lang-opt]')) return;
  data.settings.language = e.target.value;
  commit();
});

// Animation im Motivationsbereich
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-fx-opt]')) return;
  data.settings.bannerFx = e.target.value;
  commit();
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
  if (d.open) {
    // Immer nur ein Bereich offen: die anderen zuklappen
    document.querySelectorAll('details.settings-section[open]').forEach((o) => { if (o !== d) o.open = false; });
    openSections = new Set([d.dataset.section]);
    growAll(d); // Textfelder in vorher zugeklappten Bereichen anpassen
    // Kopf des geöffneten Bereichs sichtbar halten (der zugeklappte darüber verschiebt die Seite)
    requestAnimationFrame(() => {
      const top = d.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) d.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  } else {
    openSections.delete(d.dataset.section);
  }
  rememberSections();
}, true);

// Aufgeklappte Aufgabenlisten der Meilensteine bleiben beim Neuzeichnen offen
const openMsTasks = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.ms) return;
  if (d.open) openMsTasks.add(d.dataset.ms); else openMsTasks.delete(d.dataset.ms);
}, true);

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
  if (e.key === SYNC_KEY) syncState = loadSyncState();
  if (e.key === STORAGE_KEY || e.key === META_KEY) { meta = loadMeta(); render(); }
});
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// Beim Schließen des Tabs / Browsers an den Export erinnern (Safari macOS, Edge, Chrome, Firefox).
// Browser zeigen dabei nur ihren eigenen Standardtext; iPhone/iPad-Safari unterstützt das gar nicht –
// dort übernimmt die Hinweisleiste die Erinnerung.
window.addEventListener('beforeunload', (e) => {
  if (isServerMode() && syncState.dirty && server.authed) push({ keepalive: true });
  if (!hasUnsavedChanges() && !(isServerMode() && syncState.dirty)) return;
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
  if (!isServerMode() && data.projects.length && meta.lastOpen && Date.now() - meta.lastOpen > SYNC_HINT_AFTER_MS) {
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

// Update-Prüfung: version.json am Cache vorbei abfragen; bei neuer Version Hinweisleiste anzeigen.
let lastUpdateCheck = 0;
async function checkForUpdate(force = false) {
  if (location.protocol === 'file:' || (!force && Date.now() - lastUpdateCheck < 20000)) return null;
  lastUpdateCheck = Date.now();
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { version } = await res.json();
    const bar = $('#update-bar');
    if (version && version !== APP_VERSION) {
      // Wurde diese Version schon geladen, kam aber noch die alte an? Dann ist die Bereitstellung noch nicht überall durch.
      const tried = new URLSearchParams(location.search).get('v') === version;
      bar.innerHTML = tried
        ? `<div class="container"><span>⏳ ${tr('<b>Die neue Version {v} wird gerade noch bereitgestellt.</b> Das dauert meist 1–2 Minuten.', { v: esc(version) })}</span>
            <span class="btn-row"><button class="btn primary small" data-action="applyUpdate" data-id="${esc(version)}-${Date.now()}">${tr('Erneut versuchen')}</button></span></div>`
        : `<div class="container"><span>🆕 ${tr('<b>Neue Version verfügbar.</b> Deine Daten bleiben dabei erhalten.')}</span>
            <span class="btn-row"><button class="btn small" data-action="previewUpdate" data-id="${esc(version)}">${tr('Was ist neu?')}</button>
              <button class="btn primary small" data-action="applyUpdate" data-id="${esc(version)}">${tr('Jetzt aktualisieren')}</button></span></div>`;
      bar.hidden = false;
    } else if (version === APP_VERSION) {
      bar.hidden = true;
    }
    return version;
  } catch { return null; }
}
checkForUpdate(true);
// Prüfen beim Zurückkehren (Tab, Fenster, Zurück-Navigation) und alle 2 Minuten, solange der Tracker sichtbar ist
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
window.addEventListener('focus', () => checkForUpdate());
window.addEventListener('pageshow', (e) => { if (e.persisted) checkForUpdate(true); });
setInterval(() => { if (document.visibilityState === 'visible') checkForUpdate(); }, 2 * 60 * 1000);

// Tastenkürzel passend zum Betriebssystem anzeigen
function applyShortcutHint() {
  const kbd = document.querySelector('.cmd-btn kbd');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (kbd) kbd.textContent = mac ? '⌘K' : tr('Strg K');
  document.querySelector('.cmd-btn')?.setAttribute('title', tr('Befehlspalette ({keys})', { keys: mac ? '⌘K' : tr('Strg+K') }));
}

function updateSideToggle() {
  const btn = document.getElementById('side-toggle');
  if (!btn) return;
  const collapsed = document.documentElement.classList.contains('side-collapsed');
  btn.textContent = collapsed ? '»' : '«';
  btn.title = btn.ariaLabel = collapsed ? tr('Seitenleiste ausklappen') : tr('Seitenleiste einklappen');
}
updateSideToggle();

// Safari löscht Website-Daten sonst nach 7 Tagen ohne Besuch – dauerhaften Speicher anfragen.
navigator.storage?.persist?.().catch(() => {});

/* ------------------------------------------------------------------------
   Server-Speicherung (optional)
   Liegt der Tracker auf einem eigenen Server mit api.php, werden alle Änderungen
   automatisch dort gespeichert und auf allen Geräten abgeglichen. Ohne Server
   (z. B. GitHub Pages oder lokale Datei) bleibt alles wie bisher.
   ------------------------------------------------------------------------ */

function loadSyncState() {
  const def = { server: false, rev: 0, dirty: false, lastSync: 0 };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') }; } catch { return def; }
}
function saveSyncState() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncState)); } catch { /* ignorieren */ }
}
function loadBase() {
  try { return JSON.parse(localStorage.getItem(SYNC_BASE_KEY) || 'null'); } catch { return null; }
}
function saveBase(d) {
  try { localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(d)); } catch { /* Speicher voll: Abgleich klappt trotzdem, nur gröber */ }
}

function isServerMode() { return syncState.server; }
function isLocked() { return syncState.server && server.checked && !server.authed; }

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : tr('Gerät');
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

async function api(action, { method = 'GET', body, params = '', keepalive = false } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const res = await fetch(`${API_URL}?action=${action}${params}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    keepalive: keepalive && payload && payload.length < 60000,
    headers: payload === undefined ? { 'X-Tracker': '1' } : { 'Content-Type': 'application/json', 'X-Tracker': '1' },
    body: payload,
  });
  let json = null;
  try { json = await res.json(); } catch { /* keine JSON-Antwort */ }
  return { status: res.status, ok: res.ok, json };
}

/** Meldung einer Server-Antwort in der aktuellen Sprache (anhand des Fehlercodes) */
function apiMessage(json, status) {
  const known = {
    auth: tr('Bitte melde dich an.'),
    wrong_password: tr('Falsches Passwort.'),
    locked: tr('Zu viele Fehlversuche. Bitte warte 15 Minuten.'),
    not_configured: tr('Auf dem Server ist noch kein Passwort festgelegt (config.php).'),
    too_large: tr('Die Daten sind zu groß.'),
    bad_json: tr('Ungültige Anfrage.'),
    bad_data: tr('Keine gültigen Projekttracker-Daten.'),
    not_found: tr('Diesen Stand gibt es nicht mehr.'),
    forbidden: tr('Anfrage nicht erlaubt.'),
    server: tr('Interner Serverfehler. Details stehen im Fehlerprotokoll des Servers.'),
  };
  return known[json?.error] || json?.message || tr('Fehler {status}', { status });
}

function setSyncStatus(status, error = '') {
  server.status = status;
  server.error = error;
  if (!isLocked()) renderBackupBar();
}

/* Dreiwege-Abgleich: base = letzter gemeinsamer Stand, local = dieses Gerät, remote = Server.
   Was nur auf einer Seite geändert wurde, wird übernommen. Listen mit IDs werden Eintrag für Eintrag
   abgeglichen (neue, geänderte und gelöschte Einträge beider Seiten bleiben erhalten). Wurde derselbe
   Wert auf beiden Seiten geändert, gewinnt dieses Gerät. */
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function isPlainObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isIdList(v) { return Array.isArray(v) && v.every((x) => isPlainObj(x) && x.id !== undefined); }

function merge3(base, local, remote, path = []) {
  if (sameJson(local, remote)) return local;
  if (sameJson(base, local)) return remote;
  if (sameJson(base, remote)) return local;
  if (path[0] === 'counters' && typeof local === 'number' && typeof remote === 'number') {
    return remote + local - (typeof base === 'number' ? base : 0);
  }
  if (isIdList(local) && isIdList(remote)) return mergeById(isIdList(base) ? base : [], local, remote, path);
  if (isPlainObj(local) && isPlainObj(remote)) {
    const out = {};
    const b = isPlainObj(base) ? base : {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const v = merge3(b[k], local[k], remote[k], [...path, k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return local;
}

function mergeById(base, local, remote, path) {
  const bm = new Map(base.map((x) => [x.id, x]));
  const lm = new Map(local.map((x) => [x.id, x]));
  const rm = new Map(remote.map((x) => [x.id, x]));
  const ids = [...remote.map((x) => x.id), ...local.filter((x) => !rm.has(x.id)).map((x) => x.id)];
  const out = [];
  for (const id of ids) {
    const b = bm.get(id), l = lm.get(id), r = rm.get(id);
    if (l && r) out.push(merge3(b, l, r, [...path, id]));
    else if (r) { if (!(b && sameJson(b, r))) out.push(r); }      // hier gelöscht, dort unverändert → gelöscht lassen
    else if (l) { if (!(b && sameJson(b, l))) out.push(l); }      // dort gelöscht, hier unverändert → gelöscht lassen
  }
  return out;
}

/** Übernimmt den Server-Stand als lokalen Stand. */
function adoptRemote(remote) {
  const changed = !sameJson(remote.data, data);
  data = normalize(remote.data);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
  syncState.rev = remote.rev;
  syncState.dirty = false;
  syncState.lastSync = Date.now();
  saveSyncState();
  saveBase(remote.data);
  if (changed) render();
}

function hasLocalContent(d) {
  return ['projects', 'timeEntries', 'investments', 'milestones', 'tasks', 'notes'].some((k) => (d[k] || []).length);
}

/** Bringt den lokalen Stand und den Server-Stand zusammen. */
async function reconcile(remote) {
  if (!remote || remote.rev === 0 || !remote.data) {
    // Server ist noch leer: Daten dieses Geräts hochladen
    syncState.rev = 0;
    if (hasLocalContent(data) || syncState.dirty) {
      syncState.dirty = true;
      saveSyncState();
      server.busy = false;
      await push();
      if (!syncState.dirty) toast(tr('☁️ Deine Daten wurden auf den Server übertragen.'));
    } else {
      setSyncStatus('ok');
    }
    return;
  }
  if (server.asking) return;
  // Erste Verbindung dieses Geräts, aber hier liegen schon (z. B. importierte) Daten: nachfragen
  if (!syncState.lastSync && hasLocalContent(data) && !sameJson(normalize(remote.data), data)) {
    server.busy = false;
    askFirstMerge(remote);
    return;
  }
  if (!syncState.dirty) {
    if (remote.rev !== syncState.rev || !syncState.lastSync) adoptRemote(remote);
    setSyncStatus('ok');
    return;
  }
  if (remote.rev !== syncState.rev) {
    // Auf einem anderen Gerät wurde inzwischen gespeichert → zusammenführen
    const merged = merge3(loadBase(), JSON.parse(JSON.stringify(data)), remote.data);
    data = normalize(merged);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
    syncState.rev = remote.rev;
    saveBase(remote.data);
    saveSyncState();
    render();
  }
  server.busy = false;
  await push();
}

function schedulePush(delay = 1200) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(), delay);
  if (server.status !== 'offline') setSyncStatus('pending');
}

async function push({ keepalive = false } = {}) {
  clearTimeout(pushTimer);
  if (!isServerMode() || !server.authed || !syncState.dirty) return;
  if (server.busy) { schedulePush(600); return; }
  server.busy = true;
  setSyncStatus('saving');
  try {
    const sent = JSON.parse(JSON.stringify(data));
    const r = await api('data', { method: 'POST', body: { baseRev: syncState.rev, data: sent, device: deviceLabel() }, keepalive });
    if (r.status === 401) { lostAuth(); return; }
    if (r.status === 409) { server.busy = false; await reconcile(r.json); return; }
    if (!r.ok) throw new Error(apiMessage(r.json, r.status));
    syncState.rev = r.json.rev;
    syncState.dirty = !sameJson(data, sent); // während des Speicherns geändert? Dann gleich nochmal
    syncState.lastSync = Date.now();
    saveSyncState();
    saveBase(sent);
    setSyncStatus('ok');
    if (syncState.dirty) schedulePush(300);
  } catch (e) {
    syncError(e);
  } finally {
    server.busy = false;
  }
}

async function pull() {
  if (!isServerMode() || !server.authed) return;
  if (server.busy) return;
  server.busy = true;
  try {
    const r = await api('data');
    if (r.status === 401) { lostAuth(); return; }
    if (!r.ok) throw new Error(apiMessage(r.json, r.status));
    await reconcile(r.json);
  } catch (e) {
    syncError(e);
  } finally {
    server.busy = false;
  }
}

function syncError(e) {
  const offline = e instanceof TypeError || navigator.onLine === false;
  setSyncStatus(offline ? 'offline' : 'error', offline ? '' : e.message);
}

function lostAuth() {
  server.authed = false;
  server.busy = false;
  render();
}

/* Erste Anmeldung auf einem Gerät mit vorhandenen Daten */
function askFirstMerge(remote) {
  server.asking = true;
  const dlg = $('#modal');
  dlg.classList.remove('wide');
  const when = remote.updatedAt ? fmtDateTime(remote.updatedAt) : tr('unbekannt');
  dlg.innerHTML = `<div class="form detail-view"><h2>☁️ ${tr('Daten zusammenführen?')}</h2>
    <p>${remote.device ? tr('Auf dem Server liegen bereits Daten (zuletzt gespeichert {when} auf {device}), und auch auf diesem Gerät sind Daten vorhanden.', { when: esc(when), device: esc(remote.device) }) : tr('Auf dem Server liegen bereits Daten (zuletzt gespeichert {when}), und auch auf diesem Gerät sind Daten vorhanden.', { when: esc(when) })}</p>
    <p class="small muted">${tr('<b>Zusammenführen</b> behält alle Projekte und Einträge von beiden Seiten. <b>Server-Daten verwenden</b> ersetzt die Daten auf diesem Gerät.')}</p>
    <div class="form-actions">
      <button type="button" class="btn" data-choice="remote">${tr('Server-Daten verwenden')}</button>
      <button type="button" class="btn primary" data-choice="merge">${tr('Zusammenführen')}</button>
    </div></div>`;
  dlg.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', async () => {
    server.asking = false;
    dlg.close();
    unlockScroll();
    if (b.dataset.choice === 'remote') {
      adoptRemote(remote);
      setSyncStatus('ok');
      toast(tr('Server-Daten übernommen ✔'));
    } else {
      data = normalize(merge3({}, JSON.parse(JSON.stringify(data)), remote.data));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
      syncState.rev = remote.rev;
      syncState.dirty = true;
      syncState.lastSync = Date.now();
      saveSyncState();
      saveBase(remote.data);
      render();
      await push();
      toast(tr('Daten zusammengeführt ✔'));
    }
  }));
  dlg.addEventListener('cancel', (e) => e.preventDefault(), { once: true });
  lockScroll();
  dlg.showModal();
}

/* Anmeldeseite */
function renderLockScreen() {
  document.body.classList.add('locked');
  renderPauseOverlay();
  const info = server.info || {};
  const problem = info.dbError ? tr('Die Datenbank ist nicht erreichbar. Prüfe die Einstellungen in config.php.')
    : info.configured === false ? tr('Auf dem Server ist noch kein Passwort festgelegt. Lege die Datei config.php an (Vorlage: config.sample.php).') : '';
  $('#app').innerHTML = `<div class="lock-wrap"><form class="card lock-card form" data-form="login">
    <div class="lock-logo" aria-hidden="true"><img class="brand-mark" src="logo.png" alt=""></div>
    <h1 class="lock-brand">Protrac<span class="brand-by">by R3DO</span></h1>
    <p class="muted">${tr('Deine Daten liegen auf deinem Server und sind auf allen Geräten automatisch aktuell. Melde dich einmal pro Gerät an.')}</p>
    ${problem ? `<div class="lock-msg error">⚠️ ${esc(problem)}</div>` : `
    ${info.secure === false ? `<div class="lock-msg warn">🔓 ${tr('Die Verbindung ist <b>nicht verschlüsselt</b> (kein HTTPS). Richte HTTPS ein, bevor du den Tracker über das Internet nutzt.')}</div>` : ''}
    <label class="field"><span>${tr('Passwort')}</span>
      <input type="password" name="password" autocomplete="current-password" required></label>
    <div class="lock-msg error" data-login-error hidden></div>
    <button class="btn primary" type="submit">${tr('Anmelden')}</button>`}
  </form></div>`;
  $('#backup-bar').hidden = true;
  if (!('ontouchstart' in window)) $('#app input[name="password"]')?.focus();
}

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form="login"]');
  if (!form) return;
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  const err = form.querySelector('[data-login-error]');
  btn.disabled = true;
  btn.textContent = tr('Anmelden …');
  err.hidden = true;
  try {
    const r = await api('login', { method: 'POST', body: { password: form.password.value, device: deviceLabel() } });
    if (!r.ok) throw new Error(apiMessage(r.json, r.status));
    server.authed = true;
    document.body.classList.remove('locked');
    render();
    await pull();
    checkWhatsNew();
  } catch (ex) {
    err.textContent = ex instanceof TypeError ? tr('Der Server ist nicht erreichbar.') : ex.message;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = tr('Anmelden');
  }
});

/* Start: Gibt es eine Server-API neben der App? */
async function initServer() {
  if (location.protocol === 'file:') return;
  let st = null;
  try {
    const r = await api('status');
    st = r.json;
  } catch {
    if (syncState.server) setSyncStatus('offline'); // Server bekannt, aber gerade nicht erreichbar: lokal weiterarbeiten
    return;
  }
  if (!st || st.app !== 'projekttracker') {
    if (syncState.server) { syncState.server = false; saveSyncState(); render(); }
    return;
  }
  server.info = st;
  server.checked = true;
  if (!syncState.server) { syncState.server = true; saveSyncState(); }
  server.authed = !!st.authenticated && !st.dbError;
  if (!server.authed) { render(); return; }
  document.body.classList.remove('locked');
  render();
  await pull();
}

/** Server-Abgleich beim Zurückkehren, regelmäßig und wenn die Verbindung wiederkommt. */
function syncSoon() {
  if (!isServerMode() || !server.authed) return;
  if (syncState.dirty) push(); else pull();
}
document.addEventListener('visibilitychange', () => {
  if (!isServerMode()) return;
  if (document.visibilityState === 'hidden') { if (syncState.dirty) push({ keepalive: true }); }
  else syncSoon();
});
window.addEventListener('online', syncSoon);
window.addEventListener('focus', () => { if (Date.now() - (server.lastFocusSync || 0) > 5000) { server.lastFocusSync = Date.now(); syncSoon(); } });
setInterval(() => { if (document.visibilityState === 'visible') syncSoon(); }, 30 * 1000);

async function showHistory() {
  const dlg = $('#modal');
  dlg.classList.remove('wide');
  dlg.innerHTML = `<div class="form detail-view"><h2>🕘 ${tr('Frühere Stände')}</h2><p class="muted">${tr('Wird geladen …')}</p>
    <div class="form-actions"><button type="button" class="btn primary" data-close>${tr('Schließen')}</button></div></div>`;
  const close = () => { dlg.close(); unlockScroll(); };
  dlg.querySelector('[data-close]').addEventListener('click', close);
  lockScroll();
  dlg.showModal();
  try {
    const r = await api('history');
    if (r.status === 401) { close(); lostAuth(); return; }
    if (!r.ok) throw new Error(apiMessage(r.json, r.status));
    const items = r.json.items || [];
    dlg.querySelector('.detail-view').innerHTML = `<h2>🕘 ${tr('Frühere Stände')}</h2>
      <p class="small muted" style="margin:0">${tr('Der Server hebt die letzten 50 Speicherstände auf und zusätzlich den letzten Stand jedes Tages der vergangenen 60 Tage. Beim Wiederherstellen wird der gewählte Stand zum aktuellen – auf allen Geräten.')}</p>
      ${items.length ? `<ul class="list">${items.map((it, i) => `<li><div class="grow"><div class="title">${esc(fmtDateTime(it.savedAt))}${i === 0 ? ` <span class="badge aktiv">${tr('aktuell')}</span>` : ''}</div>
        <div class="meta">${esc(it.device || tr('unbekanntes Gerät'))} · ${tr('Stand {rev}', { rev: it.rev })} · ${fmtNum(it.size / 1024)} KB</div></div>
        ${i === 0 ? '' : `<button type="button" class="btn small" data-restore="${it.id}">${tr('Wiederherstellen')}</button>`}</li>`).join('')}</ul>`
        : `<div class="empty">${tr('Noch keine gespeicherten Stände.')}</div>`}
      <div class="form-actions"><button type="button" class="btn primary" data-close>${tr('Schließen')}</button></div>`;
    dlg.querySelector('[data-close]').addEventListener('click', close);
    dlg.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
      const it = items.find((x) => String(x.id) === b.dataset.restore);
      if (!confirm(tr('Stand vom {when} wiederherstellen?\n\nDer aktuelle Stand bleibt im Verlauf erhalten.', { when: fmtDateTime(it.savedAt) }))) return;
      b.disabled = true;
      const res = await api('history', { params: `&id=${encodeURIComponent(it.id)}` });
      if (!res.ok) { toast(res.json?.error ? apiMessage(res.json, res.status) : tr('Wiederherstellen fehlgeschlagen.'), 'error'); b.disabled = false; return; }
      data = normalize(res.json.data);
      close();
      commit();
      toast(tr('Stand wiederhergestellt ✔'));
    }));
  } catch (e) {
    dlg.querySelector('.detail-view p').textContent = e instanceof TypeError ? tr('Der Server ist nicht erreichbar.') : e.message;
  }
}

Object.assign(actions, {
  syncNow() {
    if (!server.authed) { initServer(); return; }
    if (syncState.dirty) push(); else pull().then(() => { if (server.status === 'ok') toast(tr('☁️ Alles aktuell.')); });
  },
  showHistory() { showHistory(); },
  async logout() {
    if (!confirm(tr('Auf diesem Gerät abmelden?\n\nDie Daten bleiben auf dem Server und werden von diesem Gerät entfernt.'))) return;
    if (syncState.dirty) await push();
    if (syncState.dirty && !confirm(tr('Einige Änderungen konnten noch nicht gespeichert werden und gehen beim Abmelden verloren. Trotzdem abmelden?'))) return;
    try { await api('logout', { method: 'POST', body: {} }); } catch { /* trotzdem lokal abmelden */ }
    const keepLang = data.settings.language;
    data = structuredClone(DEFAULT_DATA);
    data.settings.language = keepLang; // Anmeldeseite in der gewohnten Sprache
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SYNC_BASE_KEY); } catch { /* ignorieren */ }
    syncState = { server: true, rev: 0, dirty: false, lastSync: 0 };
    saveSyncState();
    server.authed = false;
    location.hash = '#/';
    render();
  },
});

/** Inhalt des Bereichs „Datensicherung“ im Server-Modus. */
function renderServerBackupSettings(size) {
  const st = { ok: tr('✅ Alles gespeichert'), pending: tr('⏳ Wird gleich gespeichert'), saving: tr('⏳ Wird gespeichert'), offline: tr('📴 Offline – wird nachgeholt'), error: tr('⚠️ Fehler'), idle: '…' }[server.status] || '…';
  return `<p class="small muted">${tr('Alle Änderungen werden <b>automatisch auf deinem Server</b> gespeichert und auf deinen anderen Geräten übernommen. Exportieren und Importieren ist nicht mehr nötig. Eine Kopie ({kb} KB) bleibt in diesem Browser, damit du auch ohne Verbindung weiterarbeiten kannst.', { kb: fmtNum(size / 1024) })}</p>
    <dl class="kv" style="margin-bottom:16px">
      <dt>${tr('Status')}</dt><dd>${st}${server.error ? ` <span class="small muted">(${esc(server.error)})</span>` : ''}</dd>
      <dt>${tr('Zuletzt abgeglichen')}</dt><dd>${esc(fmtDateTime(syncState.lastSync))}</dd>
      <dt>${tr('Dieses Gerät')}</dt><dd>${esc(deviceLabel())}</dd>
    </dl>
    <div class="btn-row">
      <button class="btn primary" data-action="syncNow">🔄 ${tr('Jetzt abgleichen')}</button>
      <button class="btn" data-action="showHistory">🕘 ${tr('Frühere Stände')}</button>
      <button class="btn" data-action="logout">${tr('Abmelden')}</button>
    </div>
    <h3 style="margin-top:20px">${tr('Zusätzliche Sicherung')}</h3>
    <div class="btn-row">
      <button class="btn" data-action="exportData">⬇ ${tr('Backup exportieren (JSON)')}</button>
      <button class="btn" data-action="exportEncrypted">🔒 ${tr('Verschlüsselt exportieren')}</button>
      <button class="btn" data-action="exportCsv">⬇ ${tr('Zeit & Investitionen als CSV')}</button>
        <button class="btn" data-action="exportIcs">📅 ${tr('Termine als Kalender-Datei (.ics)')}</button>
        <button class="btn" data-action="importCsv">⬆ ${tr('Zeit & Investitionen aus CSV importieren')}</button>
      <button class="btn" data-action="importData">⬆ ${tr('Backup importieren')}</button>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
    <h3>${tr('Gefahrenzone')}</h3>
    <button class="btn danger" data-action="resetData">${tr('Alle Daten löschen')}</button>`;
}

/* ------------------------------------------------------------------------
   CSV-Import für Zeiten & Investitionen
   Spalten werden über die Überschrift erkannt (Deutsch/Englisch, Reihenfolge egal),
   Trennzeichen automatisch (Semikolon, Komma, Tabulator). Eigene Exporte lassen sich
   wieder importieren – bereits vorhandene Einträge werden übersprungen.
   ------------------------------------------------------------------------ */

/** CSV-Text in Zeilen/Zellen zerlegen (Anführungszeichen, "" und Zeilenumbrüche in Zellen) */
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const ch of firstLine) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ';';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Erkannte Spaltenüberschriften (klein, ohne Sonderzeichen)
const CSV_COLUMNS = {
  type: ['typ', 'type', 'art', 'kind'],
  date: ['datum', 'date', 'tag', 'day'],
  project: ['projekt', 'project', 'projektname', 'projectname'],
  title: ['titel', 'title', 'wofur', 'wofuer', 'what', 'for'],
  description: ['beschreibung', 'description', 'notiz', 'note', 'notes', 'details', 'kommentar', 'comment'],
  category: ['kategorie', 'category'],
  minutes: ['minuten', 'minutes', 'min', 'mins'],
  hours: ['stunden', 'hours', 'std', 'h', 'hrs'],
  duration: ['dauer', 'duration', 'zeit', 'time'],
  amount: ['betrag', 'betrageur', 'amount', 'amounteur', 'kosten', 'cost', 'costs', 'preis', 'price', 'eur', 'euro'],
};
const csvKey = (h) => String(h || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/\(.*?\)|[^a-z]/g, '');

/** Datum in vielen Schreibweisen → YYYY-MM-DD (oder null) */
function parseDateFlexible(s) {
  s = String(s || '').trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [, y, m, d] = x;
  else if ((x = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) [, d, m, y] = x;
  else if ((x = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    let a = +x[1], b = +x[2];
    const us = /^en-US/i.test(LOCALE);
    if (a > 12) [d, m] = [a, b]; else if (b > 12) [m, d] = [a, b]; else [d, m] = us ? [b, a] : [a, b];
    y = x[3];
  } else return null;
  y = +y; if (y < 100) y += 2000;
  const iso = `${y}-${pad(+m)}-${pad(+d)}`;
  const dt = parseISO(iso);
  return Number.isNaN(dt.getTime()) || toISO(dt) !== iso ? null : iso;
}

/** Analysiert die CSV und liefert Vorschau: neue Einträge, Duplikate, Fehler, neue Projekte */
function analyzeCsv(text, defaultProjectId) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: tr('Keine Daten gefunden. Die erste Zeile muss die Spaltenüberschriften enthalten, darunter mindestens eine Zeile mit Daten.') };
  const head = rows[0].map(csvKey);
  const col = {};
  for (const [k, names] of Object.entries(CSV_COLUMNS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) col[k] = i; }
  if (col.date === undefined) return { error: tr('Die Spalte „Datum“ fehlt. Prüfe die Überschriften in der ersten Zeile.') };
  if (col.project === undefined && !defaultProjectId) return { error: tr('Die Spalte „Projekt“ fehlt. Prüfe die Überschriften in der ersten Zeile.') };
  if ([col.minutes, col.hours, col.duration, col.amount].every((v) => v === undefined)) return { error: tr('Es fehlt eine Spalte für die Dauer (Dauer, Minuten oder Stunden) bzw. den Betrag.') };

  const byName = new Map(data.projects.map((p) => [p.name.trim().toLowerCase(), p]));
  const existing = new Set([
    ...data.timeEntries.map((e) => `t|${e.projectId}|${e.date}|${e.minutes}|${entryTitle(e).trim().toLowerCase()}`),
    ...data.investments.map((e) => `i|${e.projectId}|${e.date}|${Number(e.amount).toFixed(2)}|${String(e.description || '').trim().toLowerCase()}`),
  ]);
  const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
  const out = { times: [], investments: [], duplicates: 0, issues: [], newProjects: new Map(), total: rows.length - 1 };
  const timeWords = ['zeit', 'time', 'zeiteintrag', 'timeentry', 'arbeitszeit'];
  const invWords = ['investition', 'investment', 'ausgabe', 'expense', 'kosten', 'cost'];

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const problem = (msg) => out.issues.push(tr('Zeile {n}: {msg}', { n: line, msg }));
    // Typ: aus der Spalte oder anhand der gefüllten Felder
    const typeRaw = csvKey(get(r, 'type'));
    const hasAmount = get(r, 'amount') !== '';
    const hasDuration = ['minutes', 'hours', 'duration'].some((k) => get(r, k) !== '');
    let kind = timeWords.includes(typeRaw) ? 'time' : invWords.includes(typeRaw) ? 'inv' : null;
    if (!kind) kind = hasAmount && !hasDuration ? 'inv' : hasDuration ? 'time' : null;
    if (!kind) return problem(tr('weder Dauer noch Betrag angegeben'));
    const date = parseDateFlexible(get(r, 'date'));
    if (!date) return problem(tr('Datum „{v}“ nicht erkannt', { v: get(r, 'date') }));
    // Projekt
    const pname = get(r, 'project');
    let pid = null;
    if (pname) {
      const p = byName.get(pname.toLowerCase());
      if (p) pid = p.id;
      else { const key = pname.toLowerCase(); if (!out.newProjects.has(key)) out.newProjects.set(key, pname); pid = `new:${key}`; }
    } else if (defaultProjectId) pid = defaultProjectId;
    else return problem(tr('kein Projekt angegeben'));
    const title = get(r, 'title');
    const description = get(r, 'description');

    if (kind === 'time') {
      let minutes = null;
      if (get(r, 'minutes') !== '') { const v = parseAmount(get(r, 'minutes')); minutes = Number.isFinite(v) ? Math.round(v) : null; }
      else if (get(r, 'hours') !== '') { const v = parseAmount(get(r, 'hours')); minutes = Number.isFinite(v) ? Math.round(v * 60) : null; }
      else if (get(r, 'duration') !== '') minutes = parseDuration(get(r, 'duration'));
      if (!minutes || minutes <= 0) return problem(tr('Dauer nicht erkannt'));
      const auto = !title || title === autoTimeTitle(date);
      const entry = { projectId: pid, date, minutes, title: auto ? autoTimeTitle(date) : title, autoTitle: auto, description };
      if (existing.has(`t|${pid}|${date}|${minutes}|${entry.title.toLowerCase()}`)) { out.duplicates++; return; }
      out.times.push({ ...entry, line });
    } else {
      const amount = parseAmount(get(r, 'amount'));
      if (amount === null || !Number.isFinite(amount)) return problem(tr('Betrag „{v}“ nicht erkannt', { v: get(r, 'amount') }));
      const what = title || description || tr('Investition');
      const entry = { projectId: pid, date, amount, description: what, category: get(r, 'category') };
      if (existing.has(`i|${pid}|${date}|${amount.toFixed(2)}|${what.toLowerCase()}`)) { out.duplicates++; return; }
      out.investments.push({ ...entry, line });
    }
  });
  return out;
}

/** Vorlage mit Überschriften und zwei Beispielzeilen */
function csvTemplate() {
  const sep = LANG === 'de' ? ';' : ',';
  const q = (s) => (/[",;\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const p = data.projects.find((x) => x.status === 'aktiv')?.name || tr('Mein Projekt');
  const rows = [
    [tr('Typ'), tr('Datum'), tr('Projekt'), tr('Titel'), tr('Beschreibung'), tr('Kategorie'), tr('Dauer'), tr('Betrag (EUR)')],
    [tr('Zeit'), todayISO(), p, tr('Konzept geschrieben'), tr('Erste Ideen gesammelt'), '', '1:30', ''],
    [tr('Investition'), todayISO(), p, tr('Fachbuch'), '', tr('Weiterbildung'), '', `29${DEC()}90`],
  ];
  return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n');
}

function csvGuideHTML() {
  const sep = LANG === 'de' ? ';' : ',';
  const ex = [
    [tr('Typ'), tr('Datum'), tr('Projekt'), tr('Titel'), tr('Dauer'), tr('Betrag (EUR)'), tr('Kategorie')],
    [tr('Zeit'), '2026-11-20', tr('Mein Projekt'), tr('Konzept geschrieben'), '1:30', '', ''],
    [tr('Investition'), '2026-11-18', tr('Mein Projekt'), tr('Fachbuch'), '', `29${DEC()}90`, tr('Weiterbildung')],
  ].map((r) => r.join(sep)).join('\n');
  const row = (name, alias, desc, req) => `<tr><td><b>${name}</b>${alias ? `<div class="small muted">${alias}</div>` : ''}</td><td>${desc}</td><td>${req}</td></tr>`;
  return `<div class="help csv-guide">
    <ul>
      <li>${tr('Die <b>erste Zeile</b> enthält die Spaltenüberschriften, jede weitere Zeile ist ein Eintrag. Die Reihenfolge der Spalten ist egal, nicht benötigte Spalten werden ignoriert.')}</li>
      <li>${tr('Als Trennzeichen gehen <b>Semikolon, Komma oder Tabulator</b> – der Tracker erkennt es selbst. Überschriften auf Deutsch oder Englisch.')}</li>
    </ul>
    <div class="table-wrap"><table class="csv-cols">
      <thead><tr><th>${tr('Spalte')}</th><th>${tr('Inhalt')}</th><th>${tr('Pflicht?')}</th></tr></thead>
      <tbody>
        ${row(tr('Typ'), 'Type', tr('„Zeit“ oder „Investition“. Fehlt die Spalte, wird es an Dauer bzw. Betrag erkannt.'), tr('nein'))}
        ${row(tr('Datum'), 'Date', tr('z. B. 2026-11-20, 20.11.2026 oder 20/11/2026'), tr('ja'))}
        ${row(tr('Projekt'), 'Project', tr('Name des Projekts. Unbekannte Projekte können beim Import angelegt werden.'), tr('ja*'))}
        ${row(tr('Dauer'), tr('oder Minuten / Stunden'), tr('Für Zeiten: 1:30, 90 min oder 1,5 (Stunden)'), tr('für Zeiten'))}
        ${row(tr('Betrag (EUR)'), 'Amount', tr('Für Investitionen: 49,99 oder 49.99'), tr('für Investitionen'))}
        ${row(tr('Titel'), 'Title', tr('Titel des Zeiteintrags bzw. „Wofür?“ der Investition. Leer = Wochentag und Datum.'), tr('nein'))}
        ${row(tr('Beschreibung'), 'Description', tr('Details zum Eintrag'), tr('nein'))}
        ${row(tr('Kategorie'), 'Category', tr('Kategorie der Investition, leer = „Sonstiges“'), tr('nein'))}
      </tbody>
    </table></div>
    <p class="small muted">${tr('* Beim Import auf einer Projektseite darf die Spalte „Projekt“ fehlen – dann gehört alles zu diesem Projekt.')}</p>
    <div class="field-label">${tr('Beispiel')}</div>
    <pre class="csv-example">${esc(ex)}</pre>
    <h3>${tr('So geht’s')}</h3>
    <ol>
      <li>${tr('<b>Excel / Numbers:</b> Tabelle mit den Spalten oben anlegen und als <i>CSV (UTF-8)</i> speichern bzw. exportieren – oder die Zellen inklusive Überschrift kopieren und unten einfügen.')}</li>
      <li>${tr('Datei auswählen oder Text einfügen und auf <b>Prüfen</b> tippen.')}</li>
      <li>${tr('In der Vorschau siehst du, was importiert wird. Erst mit <b>Importieren</b> werden die Einträge übernommen.')}</li>
    </ol>
    <p class="small muted">${tr('Tipp: Eine CSV aus „Zeit & Investitionen als CSV“ lässt sich wieder importieren. Bereits vorhandene Einträge werden erkannt und übersprungen.')}</p>
    <button type="button" class="btn small" data-csv-template>⬇ ${tr('Vorlage herunterladen')}</button>
  </div>`;
}

/** Import-Dialog: Schritt 1 Datei/Text, Schritt 2 Vorschau */
function openCsvImport(defaultProjectId) {
  const dlg = $('#modal');
  const proj = defaultProjectId ? getProject(defaultProjectId) : null;
  dlg.classList.add('wide');
  dlg.innerHTML = `<div class="form detail-view csv-import">
    <h2>⬆ ${tr('Zeiten & Investitionen importieren')}</h2>
    <p class="small muted" style="margin:0">${proj ? tr('Einträge ohne Projektangabe werden „{name}“ zugeordnet.', { name: esc(proj.name) }) : tr('Importiere Zeiteinträge und Investitionen aus einer CSV-Datei, z. B. aus Excel, Numbers oder einem früheren Export.')}</p>
    <div class="csv-step1">
      <div class="csv-pick">
        <label class="btn primary csv-file-btn">📄 ${tr('CSV-Datei auswählen')}<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden></label>
        <span class="small muted csv-file-name"></span>
      </div>
      <label>${tr('… oder Inhalt einfügen (z. B. aus Excel kopiert)')}
        <textarea class="csv-text" rows="5" spellcheck="false" placeholder="${esc(tr('Typ;Datum;Projekt;Titel;Dauer;Betrag (EUR)'))}"></textarea></label>
      <details class="csv-guide-box" ${data.timeEntries.length + data.investments.length ? '' : 'open'}>
        <summary>📋 ${tr('Anleitung: So muss die CSV aufgebaut sein')}</summary>
        ${csvGuideHTML()}
      </details>
    </div>
    <div class="csv-step2" hidden></div>
    <div class="form-error"></div>
    <div class="form-actions">
      <button type="button" class="btn" data-csv="cancel">${tr('Abbrechen')}</button>
      <button type="button" class="btn" data-csv="back" hidden>${tr('Zurück')}</button>
      <button type="button" class="btn primary" data-csv="check">${tr('Prüfen')}</button>
      <button type="button" class="btn primary" data-csv="import" hidden>${tr('Importieren')}</button>
    </div>
  </div>`;
  const box = dlg.querySelector('.csv-import');
  const ta = box.querySelector('.csv-text');
  const err = box.querySelector('.form-error');
  const btn = (k) => box.querySelector(`[data-csv="${k}"]`);
  let result = null;
  const close = () => { dlg.close(); unlockScroll(); };
  const step = (n) => {
    box.querySelector('.csv-step1').hidden = n !== 1;
    box.querySelector('.csv-step2').hidden = n !== 2;
    btn('check').hidden = n !== 1; btn('back').hidden = n !== 2; btn('import').hidden = n !== 2;
    err.textContent = '';
  };
  box.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // ältere Excel-Exporte
    ta.value = text;
    box.querySelector('.csv-file-name').textContent = file.name;
    btn('check').click();
  });
  box.addEventListener('click', (e) => { if (e.target.closest('[data-csv-template]')) download(`${tr('protrac-vorlage')}.csv`, csvTemplate(), 'text/csv'); });
  btn('cancel').addEventListener('click', close);
  btn('back').addEventListener('click', () => step(1));
  btn('check').addEventListener('click', () => {
    if (!ta.value.trim()) { err.textContent = tr('Bitte eine Datei auswählen oder Inhalt einfügen.'); return; }
    result = analyzeCsv(ta.value, defaultProjectId);
    if (result.error) { err.textContent = result.error; return; }
    renderCsvPreview(box.querySelector('.csv-step2'), result);
    step(2);
    const n = result.times.length + result.investments.length;
    btn('import').disabled = !n;
    btn('import').textContent = n ? trp(n, '{n} Eintrag importieren', '{n} Einträge importieren') : tr('Nichts zu importieren');
  });
  btn('import').addEventListener('click', () => {
    const create = box.querySelector('[data-csv-create]')?.checked !== false;
    const ids = {};
    let skipped = 0;
    const resolve = (pid) => {
      if (!pid.startsWith('new:')) return pid;
      if (!create) return null;
      if (!ids[pid]) {
        const name = result.newProjects.get(pid.slice(4));
        const np = { id: uid(), createdAt: todayISO(), name, status: 'aktiv', color: COLORS[data.projects.length % COLORS.length] };
        data.projects.push(np);
        ids[pid] = np.id;
      }
      return ids[pid];
    };
    let nt = 0, ni = 0;
    result.times.forEach(({ line, ...e }) => { const pid = resolve(e.projectId); if (!pid) { skipped++; return; } data.timeEntries.push({ id: uid(), ...e, projectId: pid }); nt++; });
    result.investments.forEach(({ line, ...e }) => {
      const pid = resolve(e.projectId); if (!pid) { skipped++; return; }
      data.investments.push({ id: uid(), ...e, projectId: pid, category: normalizeCategory(e.category) }); ni++;
    });
    close();
    commit();
    toast(tr('✔ Importiert: {t} Zeiteinträge, {i} Investitionen', { t: nt, i: ni }) + (skipped ? ` · ${tr('{n} ohne Projekt übersprungen', { n: skipped })}` : ''));
  });
  lockScroll();
  dlg.showModal();
  if (!matchMedia('(hover: none)').matches) ta.focus();
}

function renderCsvPreview(el, r) {
  const name = (pid) => (pid.startsWith('new:') ? r.newProjects.get(pid.slice(4)) : getProject(pid)?.name || '–');
  const sample = [...r.times.map((x) => ({ ...x, kind: 'time' })), ...r.investments.map((x) => ({ ...x, kind: 'inv' }))]
    .sort((a, b) => a.line - b.line).slice(0, 8);
  const newList = [...r.newProjects.values()];
  el.innerHTML = `
    <ul class="csv-summary">
      <li>⏱️ <b>${trp(r.times.length, '{n} Zeiteintrag', '{n} Zeiteinträge')}</b>${r.times.length ? ` · ${fmtHours(sum(r.times, (x) => x.minutes))}` : ''}</li>
      <li>💶 <b>${trp(r.investments.length, '{n} Investition', '{n} Investitionen')}</b>${r.investments.length ? ` · ${fmtEUR(sum(r.investments, (x) => x.amount))}` : ''}</li>
      ${r.duplicates ? `<li>♻️ ${trp(r.duplicates, '{n} Eintrag ist schon vorhanden und wird übersprungen', '{n} Einträge sind schon vorhanden und werden übersprungen')}</li>` : ''}
      ${r.issues.length ? `<li class="csv-warn">⚠️ ${trp(r.issues.length, '{n} Zeile kann nicht gelesen werden', '{n} Zeilen können nicht gelesen werden')}
        <ul class="small">${r.issues.slice(0, 6).map((m) => `<li>${esc(m)}</li>`).join('')}${r.issues.length > 6 ? `<li>${tr('… und {n} weitere', { n: r.issues.length - 6 })}</li>` : ''}</ul></li>` : ''}
    </ul>
    ${newList.length ? `<label class="check-row csv-create"><input type="checkbox" data-csv-create checked>
      <span>${trp(newList.length, 'Neues Projekt anlegen: {names}', 'Neue Projekte anlegen: {names}', { names: esc(newList.join(', ')) })}
      <span class="small muted">${tr('Ohne Haken werden diese Einträge übersprungen.')}</span></span></label>` : ''}
    ${sample.length ? `<div class="field-label">${tr('Vorschau')}</div>
    <div class="table-wrap"><table class="csv-preview">
      <thead><tr><th>${tr('Zeile')}</th><th>${tr('Datum')}</th><th>${tr('Projekt')}</th><th>${tr('Eintrag')}</th><th class="num">${tr('Dauer / Betrag')}</th></tr></thead>
      <tbody>${sample.map((x) => `<tr><td class="muted">${x.line}</td><td>${fmtDate(x.date)}</td><td>${esc(name(x.projectId))}${x.projectId.startsWith('new:') ? ` <span class="badge">${tr('neu')}</span>` : ''}</td>
        <td>${x.kind === 'time' ? `⏱️ ${esc(x.title)}` : `💶 ${esc(x.description)}${x.category ? ` <span class="badge">${esc(x.category)}</span>` : ''}`}</td>
        <td class="num">${x.kind === 'time' ? fmtDuration(x.minutes) : fmtEUR(x.amount)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${r.times.length + r.investments.length > sample.length ? `<p class="small muted">${tr('… und {n} weitere', { n: r.times.length + r.investments.length - sample.length })}</p>` : ''}` : ''}`;
}

Object.assign(actions, {
  importCsv({ id } = {}) { openCsvImport(id && getProject(id) ? id : null); },
});

/* ------------------------------------------------------------------------
   Neuigkeiten: Änderungen je Version (changelog.json) und Link zu GitHub
   ------------------------------------------------------------------------ */
const REPO_URL = 'https://github.com/NotMe2210/project-tracker';
const SEEN_KEY = 'projekttracker.ui.seenVersion';

/** Versionen vergleichen: „2026.11.20-2“ → Zahlenfolge */
function cmpVersion(a, b) {
  const pa = String(a).split(/[.-]/).map(Number), pb = String(b).split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

async function loadChangelog() {
  try {
    const res = await fetch(`changelog.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/** Dialog mit den Änderungen; entries = Liste aus changelog.json */
function showChangelogDialog(entries, { title, repo = REPO_URL, updateTo = null, onClose = null } = {}) {
  if ($('#modal').open) return false;
  const dlg = $('#modal');
  dlg.classList.remove('wide');
  const list = entries.map((e) => `<li class="cl-entry">
      <div class="cl-head"><b>${tr('Version {v}', { v: esc(e.version) })}</b>${e.date ? ` <span class="small muted">${fmtDate(e.date)}</span>` : ''}
        ${e.version === APP_VERSION ? ` <span class="badge aktiv">${tr('installiert')}</span>` : ''}</div>
      <ul>${(e[LANG] || e.en || e.de || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </li>`).join('');
  dlg.innerHTML = `<div class="form detail-view changelog">
    <h2>${esc(title)}</h2>
    ${entries.length ? `<ul class="cl-list">${list}</ul>` : `<div class="empty">${tr('Keine Angaben zu Änderungen gefunden.')}</div>`}
    <p class="small muted cl-repo">${tr('Alle Änderungen und den Quellcode findest du auf GitHub:')}
      <a href="${esc(repo)}" target="_blank" rel="noopener">${esc(repo.replace(/^https?:\/\//, ''))} ↗</a></p>
    <div class="form-actions">
      ${updateTo ? `<button type="button" class="btn" data-close>${tr('Später')}</button>
        <button type="button" class="btn primary" data-action="applyUpdate" data-id="${esc(updateTo)}">${tr('Jetzt aktualisieren')}</button>`
        : `<button type="button" class="btn primary" data-close>${tr('Alles klar')}</button>`}
    </div></div>`;
  const close = () => { dlg.close(); unlockScroll(); };
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  if (onClose) dlg.addEventListener('close', onClose, { once: true });
  lockScroll();
  dlg.showModal();
  return true;
}

/** Nach einem Update einmalig zeigen, was neu ist */
async function checkWhatsNew() {
  if (location.protocol === 'file:' || isLocked()) return;
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { return; }
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* ignorieren */ } };
  if (seen && cmpVersion(seen, APP_VERSION) >= 0) return;
  // Neue Nutzer ohne Daten: nichts zeigen, nur merken
  if (!seen && !data.projects.length) { markSeen(); return; }
  const log = await loadChangelog();
  if (!log?.entries) return;
  const fresh = log.entries.filter((e) => cmpVersion(e.version, APP_VERSION) <= 0 && (!seen || cmpVersion(e.version, seen) > 0))
    .sort((a, b) => cmpVersion(b.version, a.version));
  const show = (seen ? fresh : fresh.slice(0, 1)).slice(0, 5);
  if (!show.length) { markSeen(); return; }
  const shown = showChangelogDialog(show, { title: tr('🎉 Neu in Version {v}', { v: APP_VERSION }), repo: log.repo || REPO_URL, onClose: markSeen });
  if (!shown) setTimeout(checkWhatsNew, 5000); // gerade anderer Dialog offen → später nochmal
}

Object.assign(actions, {
  async showChangelog() {
    const log = await loadChangelog();
    if (!log?.entries) return toast(tr('Neuigkeiten konnten nicht geladen werden (offline?).'), 'error');
    showChangelogDialog(log.entries.filter((e) => cmpVersion(e.version, APP_VERSION) <= 0).sort((a, b) => cmpVersion(b.version, a.version)).slice(0, 10),
      { title: tr('🆕 Neuigkeiten'), repo: log.repo || REPO_URL });
  },
  async previewUpdate({ id }) {
    const log = await loadChangelog();
    const next = (log?.entries || []).filter((e) => cmpVersion(e.version, APP_VERSION) > 0).sort((a, b) => cmpVersion(b.version, a.version));
    showChangelogDialog(next, { title: tr('🆕 Neu in Version {v}', { v: id }), repo: log?.repo || REPO_URL, updateTo: id });
  },
});

/* ------------------------------------------------------------------------
   Zeitplan & kritischer Pfad (CPM)
   Aufgaben haben optional Dauer (Arbeitstage), frühesten Start und Vorgänger.
   Vorwärtsrechnung: frühester Start/Ende; Rückwärtsrechnung gegen Zieldatum des
   Meilensteins bzw. Zieltermin des Projekts (sonst Projektende): spätester Start/Ende.
   Puffer = spätester − frühester Start; kritisch = Aufgaben mit dem kleinsten Puffer.
   ------------------------------------------------------------------------ */
const planCache = new Map();
const maxIso = (a, b) => (a > b ? a : b);
const minIso = (a, b) => (a < b ? a : b);
function isWorkday(iso) {
  if (data.settings.planWeekends) return true;
  const d = parseISO(iso).getDay();
  return d !== 0 && d !== 6;
}
/** nächster Arbeitstag (inklusive = der Tag selbst, falls Arbeitstag) */
function nextWorkday(iso, inclusive = true) {
  let d = parseISO(iso);
  if (!inclusive) d = addDays(d, 1);
  while (!isWorkday(toISO(d))) d = addDays(d, 1);
  return toISO(d);
}
function prevWorkday(iso, inclusive = true) {
  let d = parseISO(iso);
  if (!inclusive) d = addDays(d, -1);
  while (!isWorkday(toISO(d))) d = addDays(d, -1);
  return toISO(d);
}
function shiftWorkdays(iso, n) {
  let d = parseISO(iso), k = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (k > 0) { d = addDays(d, step); if (isWorkday(toISO(d))) k--; }
  return toISO(d);
}
/** Arbeitstage von a nach b (negativ, wenn b vor a liegt) */
function workdaysBetween(a, b) {
  if (a === b) return 0;
  const step = a < b ? 1 : -1;
  let d = parseISO(a), n = 0, guard = 0;
  while (toISO(d) !== b && guard++ < 4000) { d = addDays(d, step); if (isWorkday(toISO(d))) n += step; }
  return n;
}
const taskDuration = (t) => Math.max(1, Math.round(Number(t.duration) || 1));

/** Würde eine Aufgabe mit diesen Vorgängern eine Kreisabhängigkeit erzeugen? */
function wouldCycle(taskId, deps) {
  const seen = new Set();
  const stack = [...deps];
  while (stack.length) {
    const id = stack.pop();
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    (data.tasks.find((x) => x.id === id)?.dependsOn || []).forEach((x) => stack.push(x));
  }
  return false;
}

function planProject(pid) {
  if (planCache.has(pid)) return planCache.get(pid);
  const p = getProject(pid);
  const today = nextWorkday(todayISO());
  const tasks = data.tasks.filter((t) => t.projectId === pid);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const preds = (t) => (t.dependsOn || []).filter((id) => byId.has(id) && id !== t.id);
  // Reihenfolge (Vorgänger zuerst) und Kreisabhängigkeiten erkennen
  const state = new Map(), order = [], cyclic = new Set();
  const visit = (t, path) => {
    const s = state.get(t.id);
    if (s === 2) return;
    if (s === 1) { path.slice(path.indexOf(t.id)).forEach((id) => cyclic.add(id)); return; }
    state.set(t.id, 1); path.push(t.id);
    preds(t).forEach((id) => visit(byId.get(id), path));
    path.pop(); state.set(t.id, 2); order.push(t);
  };
  tasks.forEach((t) => visit(t, []));
  const okPreds = (t) => (cyclic.has(t.id) ? [] : preds(t).filter((id) => !cyclic.has(id)));
  const succ = new Map(tasks.map((t) => [t.id, []]));
  tasks.forEach((t) => okPreds(t).forEach((id) => succ.get(id).push(t.id)));

  // Vorwärts: frühester Start / frühestes Ende
  const plan = new Map();
  for (const t of order) {
    const dur = taskDuration(t);
    if (t.done) {
      const ef = prevWorkday(t.doneAt || todayISO());
      plan.set(t.id, { es: shiftWorkdays(ef, -(dur - 1)), ef, dur, done: true, slack: null });
      continue;
    }
    let es = today;
    if (t.startAfter) es = maxIso(es, nextWorkday(t.startAfter));
    okPreds(t).forEach((id) => { const pp = plan.get(id); if (pp) es = maxIso(es, nextWorkday(pp.ef, false)); });
    plan.set(t.id, { es, ef: shiftWorkdays(es, dur - 1), dur, done: false });
  }
  const open = order.filter((t) => !t.done);
  const end = open.reduce((m, t) => maxIso(m, plan.get(t.id).ef), today);

  // Rückwärts: spätestes Ende / spätester Start
  for (const t of [...order].reverse()) {
    if (t.done) continue;
    const pl = plan.get(t.id);
    // spätestes Ende = engste Bedingung; welche das ist, wird für die Erklärung gemerkt
    let lf = null, why = null;
    const take = (d, w) => { if (!lf || d < lf) { lf = d; why = w; } };
    succ.get(t.id).forEach((sid) => { const sp = plan.get(sid); if (sp && !sp.done) take(prevWorkday(sp.ls, false), { kind: 'succ', id: sid }); });
    const ms = t.milestoneId ? data.milestones.find((m) => m.id === t.milestoneId) : null;
    if (ms && !ms.done && ms.dueDate) take(prevWorkday(ms.dueDate), { kind: 'ms', id: ms.id, date: ms.dueDate });
    if (p?.targetDate) take(prevWorkday(p.targetDate), { kind: 'target', date: p.targetDate });
    if (!lf) { lf = end; why = { kind: 'end', date: end }; }
    pl.lf = lf;
    pl.why = why;
    pl.ls = shiftWorkdays(lf, -(pl.dur - 1));
    pl.slack = workdaysBetween(pl.es, pl.ls);
  }
  const minSlack = open.length ? Math.min(...open.map((t) => plan.get(t.id).slack)) : 0;
  // kritisch = kein Puffer (0) oder schon zu spät (< 0). Früher galt auch „kleinster Puffer im Projekt“
  // als kritisch – dann wirkte z. B. eine Aufgabe mit 30 Tagen Puffer bis zum Zieltermin kritisch.
  open.forEach((t) => { const x = plan.get(t.id); x.critical = x.slack <= 0; });

  // Prognose je Meilenstein: Ende der letzten offenen Aufgabe
  const milestones = new Map();
  data.milestones.filter((m) => m.projectId === pid && !m.done).forEach((m) => {
    const mt = open.filter((t) => t.milestoneId === m.id);
    if (!mt.length) return;
    const forecast = mt.reduce((mx, t) => maxIso(mx, plan.get(t.id).ef), '0000');
    const late = m.dueDate && forecast > prevWorkday(m.dueDate) ? workdaysBetween(prevWorkday(m.dueDate), forecast) : 0;
    milestones.set(m.id, { forecast, late });
  });
  const projectLate = p?.targetDate && open.length && end > prevWorkday(p.targetDate) ? workdaysBetween(prevWorkday(p.targetDate), end) : 0;
  const result = {
    plan, cyclic, end, minSlack, milestones, projectLate, openCount: open.length,
    used: tasks.some((t) => t.duration || t.startAfter || (t.dependsOn || []).length),
    criticalPath: open.filter((t) => plan.get(t.id).critical).sort((a, b) => plan.get(a.id).es.localeCompare(plan.get(b.id).es)),
  };
  planCache.set(pid, result);
  return result;
}

const fmtShortDate = (iso) => parseISO(iso).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });

/** Warum eine Aufgabe kritisch ist bzw. was ihren Puffer begrenzt */
function critReason(x) {
  const w = x.why;
  if (!w) return '';
  const name = (id, list) => list.find((o) => o.id === id)?.title || '–';
  const base = {
    succ: () => tr('Nachfolger „{title}“ kann sonst nicht rechtzeitig starten.', { title: name(w.id, data.tasks) }),
    ms: () => tr('Meilenstein „{title}“ ist am {date} fällig.', { title: name(w.id, data.milestones), date: fmtDate(w.date) }),
    target: () => tr('Zieltermin des Projekts ist am {date}.', { date: fmtDate(w.date) }),
    end: () => tr('Längste Kette im Projekt: Jede Verzögerung verschiebt das voraussichtliche Projektende ({date}).', { date: fmtDate(w.date) }),
  }[w.kind]?.() || '';
  if (x.slack < 0) return `${trp(-x.slack, '{n} Arbeitstag zu spät:', '{n} Arbeitstage zu spät:')} ${base}`;
  if (x.slack === 0) return `${tr('Kein Puffer:')} ${base}`;
  // Mit Puffer: nur sagen, bis wohin er reicht
  const until = {
    succ: () => tr('bis Nachfolger „{title}“ starten muss', { title: name(w.id, data.tasks) }),
    ms: () => tr('bis Meilenstein „{title}“ ({date})', { title: name(w.id, data.milestones), date: fmtDate(w.date) }),
    target: () => tr('bis zum Zieltermin ({date})', { date: fmtDate(w.date) }),
    end: () => tr('bis zum voraussichtlichen Projektende ({date})', { date: fmtDate(w.date) }),
  }[w.kind]?.() || '';
  return `${trp(x.slack, '{n} Tag Puffer', '{n} Tage Puffer')} ${until}`;
}

/** Planungsangaben an einer Aufgabe (nur wenn im Projekt geplant wird) */
function taskPlanBadges(t) {
  if (t.done) return '';
  const pl = planProject(t.projectId);
  if (!pl.used) return '';
  const x = pl.plan.get(t.id);
  if (!x) return '';
  const waiting = (t.dependsOn || []).map((id) => data.tasks.find((o) => o.id === id)).filter((o) => o && !o.done);
  return `<span class="plan-chip ${x.critical ? 'crit' : ''}" title="${esc(`${tr('Frühester Start {es}, spätester Start {ls}', { es: fmtDate(x.es), ls: fmtDate(x.ls) })}\n${critReason(x)}`)}">🗓 ${fmtShortDate(x.es)}${x.dur > 1 ? `–${fmtShortDate(x.ef)}` : ''} · ${x.critical ? tr('kritisch') : trp(x.slack, '{n} Tag Puffer', '{n} Tage Puffer')}</span>
    ${pl.cyclic.has(t.id) ? `<span class="badge overdue">🔁 ${tr('Kreisabhängigkeit')}</span>` : ''}
    ${waiting.length ? `<span class="small muted">⏳ ${tr('wartet auf: {list}', { list: esc(waiting.map((o) => o.title).join(', ')) })}</span>` : ''}`;
}
function milestonePlanBadge(m) {
  if (m.done) return '';
  const pl = planProject(m.projectId);
  const x = pl.used && pl.milestones.get(m.id);
  if (!x) return '';
  return x.late > 0
    ? `<span class="badge overdue">⚠️ ${tr('Prognose {date} · {late}', { date: fmtDate(x.forecast), late: trp(x.late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät') })}</span>`
    : `<span class="plan-chip ok">🗓 ${tr('Prognose {date}', { date: fmtDate(x.forecast) })}</span>`;
}

/* Projekt-Reiter „Zeitplan“ */
function projectSchedule(p) {
  const pl = planProject(p.id);
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const rows = tasks.filter((t) => pl.plan.has(t.id)).sort((a, b) => Number(a.done) - Number(b.done) || pl.plan.get(a.id).es.localeCompare(pl.plan.get(b.id).es));
  const title = (id) => esc(data.tasks.find((x) => x.id === id)?.title || '–');
  const intro = `<p class="small muted">${tr('Trage bei Aufgaben eine <b>Dauer</b> (Arbeitstage) und <b>Vorgänger</b> ein („startet erst, wenn … erledigt ist“). Protrac berechnet daraus, wann jede Aufgabe frühestens starten kann, wie viel <b>Puffer</b> sie hat und welche Aufgaben auf dem <b>kritischen Pfad</b> liegen – also das Projektende bzw. einen Meilenstein direkt verschieben, wenn sie sich verzögern.')} ${tr('Puffer zählt bis zum Zieldatum des Meilensteins bzw. Zieltermin des Projekts, sonst bis zum voraussichtlichen Projektende.')}</p>`;
  const weekendToggle = settingToggle('planWeekends', !!data.settings.planWeekends, tr('Wochenenden als Arbeitstage zählen'), '');
  if (!tasks.length) return `<section class="card"><h2>🗓 ${tr('Zeitplan')}</h2>${intro}<div class="empty">${tr('Noch keine Aufgaben.')}</div></section>`;
  const late = pl.projectLate;
  const summary = `<div class="plan-summary">
      <div class="stat"><div class="label">${tr('Voraussichtliches Ende')}</div><div class="value" style="font-size:1.2rem">${pl.openCount ? fmtDate(pl.end) : '–'}</div>
        <div class="sub">${p.targetDate ? (late > 0 ? `<span style="color:var(--bad)">${tr('Zieltermin {date} · {late}', { date: fmtDate(p.targetDate), late: trp(late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät') })}</span>` : tr('Zieltermin {date} wird gehalten', { date: fmtDate(p.targetDate) })) : tr('kein Zieltermin')}</div></div>
      <div class="stat"><div class="label">${tr('Kritischer Pfad')}</div><div class="value" style="font-size:1.2rem">${trp(pl.criticalPath.length, '{n} Aufgabe', '{n} Aufgaben')}</div>
        <div class="sub">${pl.criticalPath.length ? pl.criticalPath.map((t) => esc(t.title)).join(' → ') : pl.openCount ? tr('Keine – alle offenen Aufgaben haben Puffer (mindestens {n} Arbeitstage).', { n: pl.minSlack }) : '–'}</div></div>
    </div>`;
  const msRows = sortMilestonesOf(p.id).map((m) => {
    const x = pl.milestones.get(m.id);
    const status = m.done ? `<span class="badge aktiv">✓ ${tr('erreicht am {date}', { date: fmtDate(m.doneAt) })}</span>`
      : !x ? `<span class="muted small">${tr('keine offenen Aufgaben zugeordnet')}</span>`
      : x.late > 0 ? `<span class="badge overdue">⚠️ ${trp(x.late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät')}</span>`
      : `<span class="badge aktiv">${tr('im Plan')}</span>`;
    return `<tr><td class="pt-title">🏁 ${esc(m.title)}</td><td data-label="${tr('Zieldatum')}">${m.dueDate ? fmtDate(m.dueDate) : '–'}</td><td class="${x ? '' : 'pt-empty'}" data-label="${tr('Prognose')}">${x ? fmtDate(x.forecast) : '–'}</td><td class="pt-status">${status}</td></tr>`;
  }).join('');
  return `<section class="card">
    <div class="card-head"><h2>🗓 ${tr('Zeitplan')}</h2><span class="btn-row"><button class="btn small" data-action="exportIcs" data-id="${p.id}" title="${tr('Termine als Kalender-Datei (.ics)')}">📅 ${tr('Kalender')}</button><button class="btn small" data-action="addTask" data-id="${p.id}">${tr('+ Aufgabe')}</button></span></div>
    ${intro}${weekendToggle}
    ${ganttChart(p, pl)}
    ${pl.cyclic.size ? `<div class="callout" style="border-color:var(--bad)">🔁 ${tr('Kreisabhängigkeit gefunden: {list}. Diese Vorgänger werden ignoriert, bis du sie auflöst.', { list: [...pl.cyclic].map(title).join(', ') })}</div>` : ''}
    ${summary}
    ${msRows ? `<h3>${tr('Meilensteine')}</h3><div class="table-wrap"><table class="plan-table"><thead><tr><th>${tr('Meilenstein')}</th><th>${tr('Zieldatum')}</th><th>${tr('Prognose')}</th><th>${tr('Status')}</th></tr></thead><tbody>${msRows}</tbody></table></div>` : ''}
    <h3>${tr('Aufgaben')}</h3>
    <div class="table-wrap"><table class="plan-table">
      <thead><tr><th>${tr('Aufgabe')}</th><th class="num">${tr('Dauer')}</th><th>${tr('Start')}</th><th>${tr('Ende')}</th><th class="num">${tr('Puffer')}</th><th>${tr('Vorgänger')}</th><th></th></tr></thead>
      <tbody>${rows.map((t) => { const x = pl.plan.get(t.id); return `<tr class="${t.done ? 'done' : x.critical ? 'crit' : ''}">
        <td class="pt-title">${t.done ? '✓ ' : x.critical ? '🔴 ' : ''}${esc(t.title)}${t.milestoneId ? `<div class="small muted">🏁 ${esc(data.milestones.find((m) => m.id === t.milestoneId)?.title || '')}</div>` : ''}
          ${!t.done && x.critical ? `<div class="small crit-why">${esc(critReason(x))}</div>` : ''}</td>
        <td class="num" data-label="${tr('Dauer')}">${trp(x.dur, '{n} Tag', '{n} Tage')}</td>
        <td data-label="${tr('Start')}">${fmtDate(x.es)}</td><td data-label="${tr('Ende')}">${t.done ? tr('erledigt {when}', { when: fmtDate(t.doneAt) }) : fmtDate(x.ef)}</td>
        <td class="num" data-label="${tr('Puffer')}" title="${t.done ? '' : esc(critReason(x))}">${t.done ? '–' : x.critical ? `<b>${x.slack}</b>` : x.slack}</td>
        <td class="small pt-deps ${(t.dependsOn || []).length ? '' : 'pt-empty'}" data-label="${tr('Vorgänger')}">${(t.dependsOn || []).map(title).join(', ') || '–'}</td>
        <td class="pt-edit"><button class="btn ghost icon" data-action="editTask" data-id="${t.id}" title="${tr('Bearbeiten')}">✎</button></td></tr>`; }).join('')}</tbody>
    </table></div>
    ${pl.used ? '' : `<div class="callout">💡 ${tr('Noch keine Planungsdaten: Öffne eine Aufgabe und trage Dauer und Vorgänger ein. Bis dahin gilt jede Aufgabe als 1 Tag ab heute.')}</div>`}
  </section>`;
}

function importBackup(parsed) {
  try {
    if (!Array.isArray(parsed.projects)) throw new Error(tr('Keine gültige Projekttracker-Datei.'));
    const backupTime = parsed.exportedAt ? Date.parse(parsed.exportedAt) : 0;
    let msg = tr('Sicherung importieren?\n\nGesichert: {when}\nProjekte: {n}\n\nDie Daten auf diesem Gerät werden dadurch ersetzt.', { when: backupTime ? fmtDateTime(backupTime) : tr('unbekannt'), n: parsed.projects.length });
    if (hasUnsavedChanges()) {
      msg += '\n\n' + tr('⚠️ Auf diesem Gerät gibt es ungesicherte Änderungen (letzte Sicherung: {when}). Sie gehen beim Import verloren!', { when: fmtDateTime(meta.lastExport) });
    }
    if (backupTime && meta.lastChange > backupTime) {
      msg += '\n\n' + tr('⚠️ Die Daten auf diesem Gerät (zuletzt geändert {when}) sind NEUER als diese Sicherung.', { when: fmtDateTime(meta.lastChange) });
    }
    if (!confirm(msg)) return;
    delete parsed.exportedAt;
    data = normalize(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    meta.lastChange = meta.lastExport = Date.now(); // Gerät entspricht jetzt genau der Sicherung
    saveMeta();
    syncHintDismissed = true;
    render();
    toast(tr('Import erfolgreich ✔'));
  } catch (e) {
    toast(tr('Import fehlgeschlagen: {msg}', { msg: e.message }), 'error');
  }
}

/* ---------------------------- Klang / Musik, solange ein Timer läuft ------ */
/* Quellen: eigene Musikdatei (bleibt im Browser dieses Geräts, IndexedDB), Internetradio bzw.
   Audio-Link, oder im Browser erzeugte Fokus-Klänge (Regen, Rauschen, Klangfläche).
   Spielt, solange Stoppuhr bzw. Pomodoro-Fokus laufen; pausiert mit dem Timer, blendet weich
   ein und aus. Browser erlauben Ton erst nach einer Nutzeraktion – deshalb wird nach jedem
   Klick abgeglichen (siehe Klick-Verteiler) und zusätzlich bei der ersten Berührung. */
const SOUND_GEN = ['rain', 'brown', 'pad', 'birds']; // 'brown' = Meeresrauschen (Kennung aus Kompatibilität)
const SOUND_SOURCES = () => [
  ['beep', tr('🔔 Erinnerungston (kurzer Doppel-Ton)')],
  ['file', tr('🎵 Eigene Musikdatei')],
  ['url', tr('📻 Internetradio / Audio-Link')],
  ['rain', tr('🌧 Regen')],
  ['brown', tr('🌊 Meeresrauschen')],
  ['pad', tr('🎹 Ruhige Klangfläche')],
  ['birds', tr('🐦 Vogelgezwitscher')],
];
const snd = { key: null, el: null, nodes: [], gain: null, timers: [], fileUrl: null, preview: null, failed: null, noted: null };
function soundCfg(over = {}) {
  const st = data.settings;
  return { source: st.timerSound || 'beep', url: (st.timerSoundUrl || '').trim(), volume: Math.max(0, Math.min(100, Number(st.timerSoundVolume ?? 60))) / 100, breaks: !!st.timerSoundBreaks, ...over };
}
/** Was jetzt laufen soll (oder null) */
function wantedSound() {
  if (snd.preview) return snd.preview;
  const t = data.timer, c = soundCfg();
  if (!t || c.source === 'beep' || t.pausedAt) return null;
  if (t.mode === 'pomodoro' && t.phase !== 'work' && !(c.breaks && (t.phase === 'short' || t.phase === 'long'))) return null;
  return c;
}
function syncTimerSound() {
  const c = wantedSound();
  if (!c) return soundStop();
  soundStart(c);
}
function soundKey(c) { return `${c.source}|${c.source === 'url' ? c.url : c.source === 'file' ? snd.fileUrl : ''}`; }
function soundStart(c) {
  const key = soundKey(c);
  if (snd.key === key) return soundVolume(c);
  if (snd.failed === key) return; // nicht ständig neu versuchen
  soundStop(true);
  snd.key = key;
  unlockAudio();
  if (SOUND_GEN.includes(c.source)) return startGenerated(c);
  const src = c.source === 'file' ? snd.fileUrl : /^https?:\/\//i.test(c.url) ? c.url : '';
  if (!src) {
    snd.failed = key;
    if (snd.noted !== key) {
      snd.noted = key;
      toast(c.source === 'file' ? tr('🎵 Auf diesem Gerät ist noch keine Musikdatei gewählt – unter Einstellungen › Timer & Pomodoro auswählen.')
        : tr('📻 Bitte zuerst einen Audio-Link eintragen (Einstellungen › Timer & Pomodoro).'));
    }
    return;
  }
  const a = new Audio();
  a.src = src;
  a.loop = c.source === 'file';
  a.preload = 'auto';
  a.volume = 0;
  a.addEventListener('error', () => {
    if (snd.el !== a) return;
    snd.failed = key;
    soundStop(true);
    toast(c.source === 'url' ? tr('📻 Der Audio-Link ließ sich nicht abspielen. Nötig ist eine direkte Stream-Adresse (z. B. …/stream.mp3), möglichst mit https.')
      : tr('🎵 Die Musikdatei ließ sich nicht abspielen.'), 'error');
  });
  // Stream bricht ab (z. B. Netz weg): nach kurzer Zeit neu verbinden
  a.addEventListener('ended', () => { if (snd.el === a && !a.loop) { snd.key = null; setTimeout(syncTimerSound, 1500); } });
  snd.el = a;
  a.play().then(() => fadeElement(a, c.volume)).catch(() => { snd.key = null; }); // ohne Nutzeraktion blockiert → beim nächsten Antippen erneut
  setMediaSession();
}
function fadeElement(a, target, ms = 1200, done) {
  clearInterval(a._fade);
  const from = a.volume, t0 = Date.now();
  a._fade = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    try { a.volume = Math.max(0, Math.min(1, from + (target - from) * k)); } catch { /* iOS: Lautstärke nur über Gerätetasten */ }
    if (k >= 1) { clearInterval(a._fade); a._fade = null; done?.(); }
  }, 50);
}
function soundVolume(c) {
  if (snd.el && !snd.el._fade) { try { snd.el.volume = c.volume; } catch { /* iOS */ } }
  if (snd.gain && audioCtx) snd.gain.gain.setTargetAtTime(genLevel(c), audioCtx.currentTime, 0.3);
}
const genLevel = (c) => c.volume * ({ pad: 0.3, brown: 0.5, birds: 0.6 }[c.source] || 0.35);
function soundStop(immediate = false) {
  if (!snd.key && !snd.el && !snd.gain) return;
  const el = snd.el, gain = snd.gain, nodes = snd.nodes, timers = snd.timers;
  Object.assign(snd, { key: null, el: null, gain: null, nodes: [], timers: [] });
  timers.forEach(clearInterval);
  if (el) {
    const end = () => { el.pause(); el.removeAttribute('src'); el.load(); };
    if (immediate) end(); else fadeElement(el, 0, 700, end);
  }
  if (gain && audioCtx) {
    gain.gain.setTargetAtTime(0, audioCtx.currentTime, immediate ? 0.05 : 0.3);
    setTimeout(() => { nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch { /* ignorieren */ } }); try { gain.disconnect(); } catch { /* ignorieren */ } }, immediate ? 200 : 1500);
  }
}
function noiseBuffer(kind) {
  const len = audioCtx.sampleRate * 6, buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink') { // Paul Kellet – weicher als weißes Rauschen
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else d[i] = w;
  }
  return buf;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
function panner(ctx, v) {
  if (!ctx.createStereoPanner) return ctx.createGain();
  const p = ctx.createStereoPanner(); p.pan.value = v; return p;
}
/** Plant Ereignisse vorausschauend (Web-Audio-Zeit), damit sie auch bei gedrosselten Timern sauber klingen */
function scheduler(ctx, plan, ahead = 3) {
  let next = ctx.currentTime + 0.2;
  const tick = () => { while (next < ctx.currentTime + ahead) next = plan(next); };
  tick();
  snd.timers.push(setInterval(tick, 400));
}
function startGenerated(c) {
  if (!audioCtx) { snd.key = null; return; } // Ton noch nicht freigeschaltet – beim nächsten Antippen erneut
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const ctx = audioCtx, now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.connect(ctx.destination);
  const nodes = [];
  const keep = (...n) => { nodes.push(...n); return n[0]; };
  const lfo = (freq, depth, target) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g).connect(target); o.start(); keep(o, g); };
  const loopNoise = (kind) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(kind); s.loop = true; s.start(); return keep(s); };
  const filter = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return keep(b); };

  if (c.source === 'rain') {
    const src = loopNoise('white'), hp = filter('highpass', 400), lp = filter('lowpass', 5200), mod = keep(ctx.createGain());
    mod.gain.value = 0.85;
    src.connect(hp).connect(lp).connect(mod).connect(gain);
    lfo(0.13, 0.12, mod.gain);
    lfo(0.05, 900, lp.frequency);
  } else if (c.source === 'brown') {
    // Meeresrauschen: Wellen schwellen an (heller, lauter) und laufen langsam aus – in unregelmäßigen Abständen
    const bed = loopNoise('brown'), bedLp = filter('lowpass', 320), bedG = keep(ctx.createGain());
    bedG.gain.value = 0.12;
    bed.connect(bedLp).connect(bedG).connect(gain);
    [-0.45, 0.45].forEach((pan) => { // zwei versetzte Brandungen links/rechts für Weite
      const src = loopNoise('pink'), lp = filter('lowpass', 500), hp = filter('highpass', 90), wg = keep(ctx.createGain()), pn = keep(panner(ctx, pan));
      wg.gain.value = 0.1;
      src.connect(hp).connect(lp).connect(wg).connect(pn).connect(gain);
      let first = true;
      scheduler(ctx, (t) => {
        if (first) { first = false; t += pan > 0 ? rnd(2, 4) : 0; }
        const rise = rnd(2.2, 4.2), fall = rnd(4, 7.5), peak = rnd(0.8, 1.4);
        wg.gain.setTargetAtTime(peak, t, rise / 3);
        lp.frequency.setTargetAtTime(rnd(1600, 3200), t, rise / 3);
        wg.gain.setTargetAtTime(rnd(0.02, 0.06), t + rise, fall / 3.2);
        lp.frequency.setTargetAtTime(rnd(380, 650), t + rise, fall / 2.5);
        return t + rise + fall + rnd(-0.8, 2.5);
      }, 4);
    });
  } else if (c.source === 'pad') {
    // Klangfläche: wechselnde Akkorde in zufälliger Folge und Dauer, dazu vereinzelte Glockentöne mit Echo
    const chords = [[48, 55, 64, 71, 74], [45, 52, 60, 67, 71], [41, 48, 57, 64, 67], [43, 50, 59, 62, 69],
      [40, 47, 55, 62, 67], [38, 45, 53, 60, 64], [41, 48, 55, 64, 69], [43, 50, 57, 62, 67]];
    const lp = filter('lowpass', 1100), out = keep(ctx.createGain());
    out.gain.value = 1;
    lp.connect(out).connect(gain);
    lfo(0.031, 300, lp.frequency);
    const delay = keep(ctx.createDelay(2)), fb = keep(ctx.createGain()), wet = keep(ctx.createGain());
    delay.delayTime.value = 0.46; fb.gain.value = 0.38; wet.gain.value = 0.32;
    delay.connect(fb).connect(delay); delay.connect(wet).connect(gain);
    let cur = 0;
    const voices = chords[0].map((m, k) => {
      const pn = keep(panner(ctx, [-0.5, -0.2, 0.1, 0.35, 0.6][k]));
      pn.connect(lp);
      return [-6, 6].map((cents) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = k === 0 ? 'sine' : 'triangle'; o.frequency.value = midiHz(m); o.detune.value = cents;
        g.gain.value = k === 0 ? 0.16 : 0.085;
        o.connect(g).connect(pn); o.start(); keep(o, g);
        return o;
      });
    });
    scheduler(ctx, (t) => { // Akkordwechsel
      let n; do n = Math.floor(Math.random() * chords.length); while (n === cur);
      cur = n;
      const lift = Math.random() < 0.3 ? 12 : 0; // manchmal die oberste Stimme eine Oktave höher
      voices.forEach((pair, k) => pair.forEach((o) => o.frequency.setTargetAtTime(midiHz(chords[n][k] + (k === 4 ? lift : 0)), t, rnd(1.1, 2.2))));
      lp.frequency.setTargetAtTime(rnd(800, 1700), t, 3);
      return t + rnd(7, 14);
    }, 2);
    scheduler(ctx, (t) => { // Glockentöne aus dem aktuellen Akkord (pentatonisch ergänzt)
      if (Math.random() < 0.75) {
        const notes = [...chords[cur].slice(2).map((m) => m + 12), chords[cur][1] + 24];
        const count = Math.random() < 0.3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const at = t + i * rnd(0.35, 0.7), o = ctx.createOscillator(), g = ctx.createGain(), pn = panner(ctx, rnd(-0.7, 0.7));
          o.type = 'sine'; o.frequency.value = midiHz(notes[Math.floor(Math.random() * notes.length)]);
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(rnd(0.05, 0.09), at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + rnd(2.2, 3.5));
          o.connect(g).connect(pn); pn.connect(gain); pn.connect(delay);
          o.start(at); o.stop(at + 3.6); o.onended = () => { o.disconnect(); g.disconnect(); pn.disconnect(); };
        }
      }
      return t + rnd(2.5, 7);
    }, 3);
  } else if (c.source === 'birds') {
    // Vogelgezwitscher: verschiedene Rufe (Zwitschern, Triller, Pfiff, Tschilpen) von links/rechts, nah und fern
    const air = loopNoise('pink'), hp = filter('highpass', 700), alp = filter('lowpass', 3500), ag = keep(ctx.createGain());
    ag.gain.value = 0.012;
    air.connect(hp).connect(alp).connect(ag).connect(gain);
    lfo(0.08, 0.006, ag.gain);
    const note = (at, f0, f1, dur, amp, pn, shape = 'exp') => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, at);
      if (shape === 'exp') o.frequency.exponentialRampToValueAtTime(f1, at + dur); else o.frequency.linearRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(amp, at + Math.min(0.012, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(pn);
      o.start(at); o.stop(at + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
    };
    const calls = {
      chirp(t, pn, a) { const n = Math.round(rnd(2, 6)), f = rnd(2800, 3800); for (let i = 0; i < n; i++) { const at = t + i * rnd(0.1, 0.16); note(at, f, f * 1.4, 0.05, a, pn); note(at + 0.05, f * 1.4, f * 0.95, 0.05, a * 0.8, pn); } return n * 0.14; },
      trill(t, pn, a) { const n = Math.round(rnd(8, 18)), f = rnd(3600, 5000), d = rnd(0.035, 0.05); for (let i = 0; i < n; i++) note(t + i * d * 1.15, i % 2 ? f * 1.12 : f, i % 2 ? f : f * 1.12, d, a * (0.6 + 0.4 * Math.sin(Math.PI * i / n)), pn, 'lin'); return n * d * 1.15; },
      whistle(t, pn, a) { const f = rnd(1900, 2500); note(t, f, f * 0.82, 0.32, a, pn, 'lin'); note(t + 0.45, f * 0.9, f * 1.22, 0.28, a, pn, 'lin'); return 0.8; },
      tweet(t, pn, a) { const n = Math.round(rnd(2, 4)); for (let i = 0; i < n; i++) note(t + i * rnd(0.22, 0.3), rnd(4800, 5600), rnd(2800, 3300), 0.11, a, pn); return n * 0.28; },
    };
    const kinds = Object.keys(calls);
    scheduler(ctx, (t) => {
      const near = Math.random() < 0.55, pn = panner(ctx, rnd(-0.85, 0.85)), lpB = ctx.createBiquadFilter();
      lpB.type = 'lowpass'; lpB.frequency.value = near ? 9000 : 4200; // ferne Vögel klingen dumpfer
      pn.connect(lpB).connect(gain);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const len = calls[kind](t, pn, near ? rnd(0.08, 0.13) : rnd(0.025, 0.05));
      setTimeout(() => { try { pn.disconnect(); lpB.disconnect(); } catch { /* ignorieren */ } }, (t - ctx.currentTime + len + 2) * 1000);
      // manchmal antwortet ein zweiter Vogel kurz danach
      return t + len + (Math.random() < 0.3 ? rnd(0.15, 0.5) : rnd(0.8, 4.5));
    }, 3);
  }
  gain.gain.setTargetAtTime(genLevel(c), now, 0.8);
  snd.gain = gain;
  snd.nodes = nodes;
}

/** Sperrbildschirm / Medientasten: Titel anzeigen, Pause hält den Timer an */
function setMediaSession() {
  if (!('mediaSession' in navigator) || snd.preview) return;
  const t = data.timer;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: `${BRAND} · ${tr('Timer läuft')}`, artist: getProject(t?.projectId)?.name || '', artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
    navigator.mediaSession.setActionHandler('pause', () => { if (data.timer && !data.timer.pausedAt) data.timer.mode === 'pomodoro' ? actions.pomoPause() : actions.pauseTimer(); });
    navigator.mediaSession.setActionHandler('play', () => { if (data.timer?.pausedAt) data.timer.mode === 'pomodoro' ? actions.pomoPause() : actions.pauseTimer(); syncTimerSound(); });
  } catch { /* nicht unterstützt */ }
}
// Eigene Musikdatei: liegt im Browser dieses Geräts (nicht in der Sicherung – zu groß)
async function loadMusicFile() {
  try {
    const f = await idb('readonly', (s) => s.get('timerMusicFile'));
    if (snd.fileUrl) URL.revokeObjectURL(snd.fileUrl);
    snd.fileUrl = f?.blob ? URL.createObjectURL(f.blob) : null;
    snd.fileName = f?.name || '';
  } catch { snd.fileUrl = null; }
}
document.addEventListener('change', async (e) => {
  const input = e.target.closest?.('[data-music-file]');
  if (!input || !input.files?.[0]) return;
  const file = input.files[0];
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(file.name)) return toast(tr('Das ist keine Audiodatei.'), 'error');
  if (file.size > 80 * 1024 * 1024) return toast(tr('Die Datei ist zu groß (höchstens 80 MB).'), 'error');
  try {
    await idb('readwrite', (s) => s.put({ blob: file, name: file.name, type: file.type }, 'timerMusicFile'));
  } catch {
    return toast(tr('Die Datei konnte in diesem Browser nicht gespeichert werden (z. B. privates Fenster).'), 'error');
  }
  await loadMusicFile();
  data.settings.timerSoundFileName = file.name;
  data.settings.timerSound = 'file'; // wer eine Datei wählt, will sie auch hören
  // übrige, noch nicht gespeicherte Eingaben übernehmen – sonst gehen sie beim Neuzeichnen verloren
  const form = input.form;
  if (form) {
    const fd = new FormData(form);
    if (fd.has('timerSoundVolume')) data.settings.timerSoundVolume = Number(fd.get('timerSoundVolume'));
    if (fd.has('timerSoundUrl')) data.settings.timerSoundUrl = String(fd.get('timerSoundUrl') || '').trim();
    data.settings.timerSoundBreaks = fd.get('timerSoundBreaks') === 'on';
  }
  snd.failed = null;
  save();
  render();
  toast(tr('🎵 „{name}“ gespeichert – nur auf diesem Gerät.', { name: file.name }));
});
// Auswahl im Formular: passende Felder einblenden
document.addEventListener('change', (e) => {
  if (e.target.name !== 'timerSound') return;
  const form = e.target.form;
  form.querySelectorAll('[data-sound-show]').forEach((el) => { el.hidden = !el.dataset.soundShow.split(' ').includes(e.target.value); });
});
// Nach einem Neuladen ist Ton erst nach einer Berührung erlaubt
document.addEventListener('pointerdown', () => { if (data.timer) setTimeout(syncTimerSound, 0); }, true);

function renderTimerSoundSettings(st) {
  const src = st.timerSound || 'beep';
  const show = (list) => (list.split(' ').includes(src) ? '' : 'hidden');
  const fileName = snd.fileName || '';
  return `<fieldset class="sound-set">
      <legend>${tr('Klang, solange ein Timer läuft')}</legend>
      <label><select name="timerSound">${SOUND_SOURCES().map(([v, l]) => `<option value="${v}" ${src === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <div data-sound-show="beep" ${show('beep')}>
        <label>${tr('Erinnerungston')}
          <select name="timerBeep">${[0, 1, 5, 10, 15, 30, 60].map((n) => `<option value="${n}" ${timerBeepMin() === n ? 'selected' : ''}>${n === 1 ? tr('jede Minute') : n ? tr('alle {n} Minuten', { n }) : tr('Aus')}</option>`).join('')}</select></label>
        <div class="hint">${tr('Ein kurzer, leiser Doppel-Ton erinnert dich, dass Stoppuhr oder Pomodoro-Fokus noch laufen. Während einer Pause bleibt er still.')}</div>
      </div>
      <div data-sound-show="file" ${show('file')}>
        <div class="file-pick">
          <label class="btn small">📂 ${fileName ? tr('Andere Datei wählen') : tr('Musikdatei wählen')}<input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" data-music-file hidden></label>
          <span class="small">${fileName ? `🎵 ${esc(fileName)}` : st.timerSoundFileName ? `<span class="badge mittel">${tr('Auf diesem Gerät noch nicht gewählt')}</span> ${esc(st.timerSoundFileName)}` : `<span class="muted">${tr('Noch keine Datei')}</span>`}</span>
          ${fileName ? `<button type="button" class="btn small ghost danger" data-action="removeMusicFile">${tr('Entfernen')}</button>` : ''}
        </div>
        <div class="hint">${tr('MP3, M4A, WAV oder OGG, bis 80 MB. Die Datei bleibt nur in diesem Browser und läuft in Dauerschleife – sie ist nicht Teil der Sicherung und muss auf jedem Gerät einmal gewählt werden.')}</div>
      </div>
      <div data-sound-show="url" ${show('url')}>
        <label>${tr('Adresse des Streams oder der Audiodatei')}
          <input type="url" name="timerSoundUrl" value="${esc(st.timerSoundUrl || '')}" placeholder="https://…/stream.mp3" inputmode="url" autocomplete="off"></label>
        <div class="hint">${tr('Direkte Adresse eines Internetradios oder einer Audiodatei (MP3/AAC), am besten mit https. Viele Sender nennen sie auf ihrer Website („Stream-URL“, „Direktlink“). Playlist-Dateien (.m3u/.pls) und Spotify-, YouTube- oder Apple-Music-Links funktionieren nicht.')}</div>
      </div>
      <div data-sound-show="file url rain brown pad birds" ${show('file url rain brown pad birds')}>
        <label>${tr('Lautstärke')} <input type="range" name="timerSoundVolume" min="0" max="100" step="5" value="${Math.round(soundCfg().volume * 100)}"></label>
        <label class="check-row"><input type="checkbox" name="timerSoundBreaks" ${st.timerSoundBreaks ? 'checked' : ''}> ${tr('Auch in Pomodoro-Pausen weiterspielen')}</label>
        <div class="hint">${tr('Spielt, solange Stoppuhr oder Pomodoro-Fokus laufen, blendet weich ein und aus und hält mit dem Timer an. Auf iPhone/iPad regelst du die Lautstärke von Datei und Radio mit den Gerätetasten.')}</div>
      </div>
      <div class="btn-row"><button type="button" class="btn small" data-action="previewTimerSound">${snd.preview ? '■ ' + tr('Vorhören beenden') : '▶ ' + tr('Vorhören')}</button></div>
    </fieldset>`;
}
/** Nur die Beschriftung von „Vorhören“ umschalten – ohne das Formular neu zu zeichnen */
function updatePreviewButton() {
  const btn = document.querySelector('[data-action="previewTimerSound"]');
  if (btn) btn.textContent = snd.preview ? `■ ${tr('Vorhören beenden')}` : `▶ ${tr('Vorhören')}`;
}
// Während des Vorhörens: Lautstärke sofort anwenden, bei anderer Klangart direkt umschalten
function previewFromForm(form) {
  if (!snd.preview || !form) return;
  const fd = new FormData(form);
  const source = String(fd.get('timerSound') || 'beep');
  if (source === 'beep') { snd.preview = null; syncTimerSound(); return updatePreviewButton(); }
  snd.preview = soundCfg({ source, url: String(fd.get('timerSoundUrl') || '').trim(), volume: Number(fd.get('timerSoundVolume') ?? 60) / 100 });
  snd.failed = null;
  syncTimerSound();
}
document.addEventListener('input', (e) => { if (e.target.name === 'timerSoundVolume') previewFromForm(e.target.form); });
document.addEventListener('change', (e) => { if (e.target.name === 'timerSound') previewFromForm(e.target.form); });

const soundLabel = () => (SOUND_SOURCES().find(([v]) => v === (data.settings.timerSound || 'beep')) || SOUND_SOURCES()[0])[1];

/* ---------------------------- Automatische Sicherung in einen Ordner ----- */
/* Edge/Chrome (File System Access API): Nach jeder Änderung wird – kurz verzögert – eine
   Tagesdatei protrac-backup-JJJJ-MM-TT.json in den gewählten Ordner geschrieben. Ältere
   Tagesdateien werden nach der eingestellten Anzahl Tage aufgeräumt. Der Ordnerzugriff
   gehört zu diesem Gerät/Browser (IndexedDB), nicht zu den Projektdaten. */
const FOLDER_KEY = 'projekttracker.ui.folderBackup';
const FOLDER_FILE_RE = /^protrac-backup-\d{4}-\d{2}-\d{2}\.json$/;
const folderBackupSupported = () => 'showDirectoryPicker' in window && !isServerMode();
function folderCfg() {
  try { return { keep: 14, lastWrite: 0, name: '', ...JSON.parse(localStorage.getItem(FOLDER_KEY) || '{}') }; } catch { return { keep: 14, lastWrite: 0, name: '' }; }
}
function saveFolderCfg(patch) {
  try { localStorage.setItem(FOLDER_KEY, JSON.stringify({ ...folderCfg(), ...patch })); } catch { /* ignorieren */ }
}
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('protrac', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
async function folderPermission(handle, ask = false) {
  if (!handle.queryPermission) return 'granted';
  const opts = { mode: 'readwrite' };
  let state = await handle.queryPermission(opts);
  if (state === 'prompt' && ask) state = await handle.requestPermission(opts);
  return state;
}
async function useBackupFolder(handle, { persist = true } = {}) {
  folderBackup.handle = handle;
  folderBackup.perm = await folderPermission(handle);
  folderBackup.error = '';
  if (persist) { try { await idb('readwrite', (s) => s.put(handle, 'backupDir')); } catch { /* z. B. privates Fenster */ } }
  saveFolderCfg({ name: handle.name });
  if (folderBackup.perm === 'granted') await writeFolderBackup();
  render();
}
async function initFolderBackup() {
  if (!folderBackupSupported()) return;
  try {
    const handle = await idb('readonly', (s) => s.get('backupDir'));
    if (!handle) return;
    folderBackup.handle = handle;
    folderBackup.perm = await folderPermission(handle);
    if (folderBackup.perm === 'granted' && meta.lastChange > folderCfg().lastWrite) await writeFolderBackup();
    renderBackupBar();
  } catch { /* kein gespeicherter Ordner */ }
}
function scheduleFolderBackup() {
  if (!folderBackup.handle || folderBackup.perm !== 'granted') return;
  clearTimeout(folderBackup.timer);
  folderBackup.timer = setTimeout(writeFolderBackup, 4000);
}
async function writeFolderBackup() {
  const dir = folderBackup.handle;
  if (!dir || folderBackup.busy) return false;
  clearTimeout(folderBackup.timer);
  folderBackup.busy = true;
  try {
    const now = new Date();
    const file = await dir.getFileHandle(`protrac-backup-${toISO(now)}.json`, { create: true });
    const w = await file.createWritable();
    await w.write(JSON.stringify({ ...data, exportedAt: now.toISOString() }, null, 2));
    await w.close();
    // Aufräumen: nur eigene Tagesdateien, die neuesten „keep“ bleiben
    const keep = Math.max(1, Number(folderCfg().keep) || 14);
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && FOLDER_FILE_RE.test(name)) names.push(name);
    names.sort().reverse().slice(keep).forEach((name) => dir.removeEntry(name).catch(() => {}));
    meta.lastExport = Date.now();
    saveMeta();
    saveFolderCfg({ lastWrite: meta.lastExport });
    folderBackup.error = '';
    return true;
  } catch (e) {
    folderBackup.error = e.message;
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') folderBackup.perm = 'prompt';
    return false;
  } finally {
    folderBackup.busy = false;
    renderBackupBar();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && folderBackup.timer && folderBackup.perm === 'granted') writeFolderBackup();
});

function renderFolderBackupSettings() {
  if (!('showDirectoryPicker' in window)) {
    return `<h3 style="margin-top:20px">📁 ${tr('Automatische Sicherung in einen Ordner')}</h3>
      <p class="small muted">${tr('Nur in Edge, Chrome und anderen Chromium-Browsern am Computer verfügbar. Dort sichert Protrac nach jeder Änderung automatisch in einen Ordner deiner Wahl – z. B. in deinen OneDrive-, Dropbox- oder iCloud-Ordner.')}</p>`;
  }
  const cfg = folderCfg(), fb = folderBackup;
  const status = !fb.handle ? `<span class="badge">${tr('Aus')}</span>`
    : fb.perm === 'granted' ? `<span class="badge aktiv">${tr('Aktiv')}</span> ${tr('📁 {name}', { name: esc(fb.handle.name) })} · ${tr('Letzte Sicherung: {when}', { when: esc(fmtDateTime(cfg.lastWrite)) })}`
    : `<span class="badge mittel">${tr('Zugriff erneuern')}</span> ${tr('📁 {name}', { name: esc(fb.handle.name) })}`;
  return `<h3 style="margin-top:20px">📁 ${tr('Automatische Sicherung in einen Ordner')}</h3>
    <p class="small muted" style="margin-top:0">${tr('Nach jeder Änderung schreibt Protrac eine Tagesdatei in den gewählten Ordner. Tipp: Wähle einen Ordner in OneDrive, Dropbox oder iCloud – dann ist die Sicherung auch auf deinen anderen Geräten.')}</p>
    <p class="small">${status}${fb.error ? `<br><span class="badge overdue">${esc(fb.error)}</span>` : ''}</p>
    <div class="btn-row">
      ${!fb.handle ? `<button class="btn primary" data-action="pickBackupFolder">📁 ${tr('Ordner wählen')}</button>`
        : `${fb.perm === 'granted' ? `<button class="btn" data-action="writeFolderBackup">💾 ${tr('Jetzt sichern')}</button>` : `<button class="btn primary" data-action="resumeFolderBackup">🔓 ${tr('Zugriff erneuern')}</button>`}
          <button class="btn" data-action="pickBackupFolder">${tr('Anderen Ordner wählen')}</button>
          <button class="btn danger" data-action="stopFolderBackup">${tr('Ausschalten')}</button>`}
    </div>
    ${fb.handle ? `<label class="small" style="display:flex;gap:8px;align-items:center;margin-top:10px">${tr('Aufbewahren:')}
      <select data-action-change="folderKeep">${[7, 14, 30, 90].map((n) => `<option value="${n}" ${Number(cfg.keep) === n ? 'selected' : ''}>${trp(n, '{n} Tag', '{n} Tage')}</option>`).join('')}</select></label>` : ''}`;
}
document.addEventListener('change', (e) => {
  if (e.target.dataset?.actionChange === 'folderKeep') { saveFolderCfg({ keep: Number(e.target.value) }); writeFolderBackup(); }
});

/* ---------------------------- Verschlüsselte Sicherungen ----------------- */
/* AES-GCM (256 Bit) mit einem per PBKDF2-SHA-256 aus dem Passwort abgeleiteten Schlüssel.
   Alles passiert im Browser – das Passwort verlässt das Gerät nie und wird nicht gespeichert. */
const ENC_FORMAT = 'protrac-encrypted';
const ENC_ITER = 310000;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(password, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ENC_ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  // Große Dateien in Blöcken kodieren (String.fromCharCode verträgt nicht beliebig viele Argumente)
  const bytes = new Uint8Array(ct);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { format: ENC_FORMAT, v: 1, app: BRAND, kdf: 'PBKDF2-SHA256', iter: ENC_ITER, cipher: 'AES-GCM-256', salt: b64(salt), iv: b64(iv), data: btoa(bin), exportedAt: new Date().toISOString() };
}
async function decryptText(box, password) {
  const key = await deriveKey(password, unb64(box.salt), box.iter || ENC_ITER);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return new TextDecoder().decode(pt);
}
const isEncryptedBackup = (o) => o && o.format === ENC_FORMAT && o.data && o.salt && o.iv;

function encryptedExportForm() {
  if (!window.crypto?.subtle) return toast(tr('Verschlüsselung ist hier nicht verfügbar (nur über https oder localhost).'), 'error');
  openForm({
    title: tr('🔒 Verschlüsselte Sicherung'),
    submitLabel: tr('Verschlüsseln & exportieren'),
    fields: [
      { name: 'pw', label: tr('Passwort'), type: 'password', required: true, hint: tr('Mindestens 8 Zeichen. Ohne dieses Passwort lässt sich die Sicherung nicht mehr öffnen – auch nicht von uns. Notiere es sicher!') },
      { name: 'pw2', label: tr('Passwort wiederholen'), type: 'password', required: true },
    ],
    onSubmit(v) {
      if (v.pw.length < 8) return tr('Das Passwort ist zu kurz (mindestens 8 Zeichen).');
      if (v.pw !== v.pw2) return tr('Die Passwörter stimmen nicht überein.');
      exportEncrypted(v.pw);
    },
  });
}
async function exportEncrypted(pw) {
  try {
    const now = new Date();
    const stamp = `${toISO(now)}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const box = await encryptText(JSON.stringify({ ...data, exportedAt: now.toISOString() }), pw);
    download(`protrac-backup-${stamp}-${tr('verschluesselt')}.json`, JSON.stringify(box), 'application/json');
    meta.lastExport = Date.now();
    saveMeta();
    render();
    toast(tr('🔒 Verschlüsselte Sicherung exportiert ✔'));
  } catch (e) {
    toast(tr('Export fehlgeschlagen: {msg}', { msg: e.message }), 'error');
  }
}
/** Passwort abfragen und entschlüsseln; ruft onData mit dem geparsten Inhalt auf */
function decryptPrompt(box, onData, error = '') {
  openForm({
    title: tr('🔒 Sicherung entschlüsseln'),
    submitLabel: tr('Entschlüsseln'),
    fields: [{ name: 'pw', label: tr('Passwort'), type: 'password', required: true,
      hint: error || tr('Diese Sicherung ist verschlüsselt. Gib das Passwort ein, mit dem sie erstellt wurde.') }],
    onSubmit(v) {
      decryptText(box, v.pw)
        .then((text) => onData(JSON.parse(text)))
        .catch(() => setTimeout(() => decryptPrompt(box, onData, tr('❌ Falsches Passwort oder beschädigte Datei. Bitte erneut versuchen.')), 50));
    },
  });
}

/* ---------------------------- Vorlagen & Duplizieren --------------------- */
/* Gemeinsames „Bauplan“-Format: Termine als Tage relativ zum Projektstart. */
const BUILTIN_TEMPLATES = [
  { id: 'learn', icon: '🎓', builtin: true, get name() { return tr('Lernprojekt'); }, get desc() { return tr('Etwas Neues lernen – mit Plan, festen Lernzeiten und eigenem Übungsprojekt.'); },
    get bp() { return { project: { color: '#7c3aed', weeklyHours: 3, description: tr('Etwas Neues lernen – mit Plan, festen Lernzeiten und eigenem Übungsprojekt.') },
      milestones: [{ k: 'm1', title: tr('Grundlagen verstanden'), due: 14 }, { k: 'm2', title: tr('Eigenes Übungsprojekt fertig'), due: 42 }],
      tasks: [
        { k: 't1', title: tr('Lernziel und Material festlegen'), priority: 'hoch', due: 2, ms: 'm1', estimate: 60 },
        { k: 't2', title: tr('Lernplan mit festen Zeiten erstellen'), priority: 'hoch', due: 3, ms: 'm1', deps: ['t1'], estimate: 30 },
        { k: 't3', title: tr('Wöchentliche Lerneinheit'), priority: 'mittel', due: 7, repeat: 'weekly', estimate: 120 },
        { k: 't4', title: tr('Übungsprojekt planen'), priority: 'mittel', due: 21, ms: 'm2', deps: ['t2'] },
        { k: 't5', title: tr('Übungsprojekt umsetzen'), priority: 'mittel', due: 38, ms: 'm2', deps: ['t4'] },
        { k: 't6', title: tr('Gelerntes zusammenfassen'), priority: 'niedrig', due: 42, ms: 'm2', deps: ['t5'] },
      ] }; } },
  { id: 'website', icon: '🌐', builtin: true, get name() { return tr('Website'); }, get desc() { return tr('Eine eigene Website von der Idee bis zur Veröffentlichung.'); },
    get bp() { return { project: { color: '#0ea5e9', weeklyHours: 4, description: tr('Eine eigene Website von der Idee bis zur Veröffentlichung.') },
      milestones: [{ k: 'm1', title: tr('Konzept steht'), due: 7 }, { k: 'm2', title: tr('Website online'), due: 30 }],
      tasks: [
        { k: 't1', title: tr('Ziele und Zielgruppe festlegen'), priority: 'hoch', due: 2, ms: 'm1' },
        { k: 't2', title: tr('Seitenstruktur skizzieren'), priority: 'hoch', due: 5, ms: 'm1', deps: ['t1'] },
        { k: 't3', title: tr('Domain & Hosting wählen'), priority: 'mittel', due: 7, ms: 'm1' },
        { k: 't4', title: tr('Texte schreiben'), priority: 'mittel', due: 18, ms: 'm2', deps: ['t2'] },
        { k: 't5', title: tr('Bilder auswählen'), priority: 'niedrig', due: 18, ms: 'm2', deps: ['t2'] },
        { k: 't6', title: tr('Impressum & Datenschutzerklärung'), priority: 'hoch', due: 24, ms: 'm2' },
        { k: 't7', title: tr('Website veröffentlichen'), priority: 'hoch', due: 30, ms: 'm2', deps: ['t3', 't4', 't5', 't6'] },
      ] }; } },
  { id: 'event', icon: '🎉', builtin: true, get name() { return tr('Veranstaltung'); }, get desc() { return tr('Ein Fest, Workshop oder Treffen planen – von der Idee bis zum Dankeschön.'); },
    get bp() { return { project: { color: '#f59e0b', weeklyHours: 2, description: tr('Ein Fest, Workshop oder Treffen planen – von der Idee bis zum Dankeschön.') },
      milestones: [{ k: 'm1', title: tr('Rahmen steht'), due: 14 }, { k: 'm2', title: tr('Veranstaltungstag'), due: 60 }],
      tasks: [
        { k: 't1', title: tr('Datum & Budget festlegen'), priority: 'hoch', due: 3, ms: 'm1' },
        { k: 't2', title: tr('Ort buchen'), priority: 'hoch', due: 10, ms: 'm1', deps: ['t1'] },
        { k: 't3', title: tr('Gästeliste erstellen'), priority: 'mittel', due: 10, ms: 'm1' },
        { k: 't4', title: tr('Einladungen verschicken'), priority: 'hoch', due: 21, ms: 'm2', deps: ['t2', 't3'] },
        { k: 't5', title: tr('Programm planen'), priority: 'mittel', due: 35, ms: 'm2', deps: ['t2'] },
        { k: 't6', title: tr('Catering organisieren'), priority: 'mittel', due: 45, ms: 'm2', deps: ['t4'] },
        { k: 't7', title: tr('Nachbereitung & Dank'), priority: 'niedrig', due: 63, deps: ['t5', 't6'] },
      ] }; } },
];
const dayOffset = (base, iso) => (iso ? Math.round((parseISO(iso) - parseISO(base)) / 864e5) : null);
const fromOffset = (start, off) => (off === null || off === undefined ? null : toISO(addDays(parseISO(start), off)));
const PROJECT_COPY_FIELDS = ['description', 'why', 'goal', 'category', 'weeklyHours', 'hourGoal', 'budget', 'color', 'staleDays', 'reminderText', 'teamIds', 'msSort'];

/** Bauplan aus einem bestehenden Projekt (ohne Zeiten, Investitionen, Logbuch) */
function projectBlueprint(p) {
  const base = p.createdAt?.slice(0, 10) || todayISO();
  const project = { targetOffset: dayOffset(base, p.targetDate) };
  PROJECT_COPY_FIELDS.forEach((f) => { if (p[f] !== undefined && p[f] !== null && p[f] !== '') project[f] = structuredClone(p[f]); });
  return {
    project,
    milestones: sortMilestonesOf(p.id).map((m) => ({ k: m.id, title: m.title, description: m.description || '', due: dayOffset(base, m.dueDate), assignees: m.assignees || [] })),
    tasks: data.tasks.filter((t) => t.projectId === p.id).map((t) => ({
      k: t.id, title: t.title, priority: t.priority, notes: t.notes || '', estimate: t.estimate || null, duration: t.duration || null, repeat: t.repeat || null,
      assignees: t.assignees || [], ms: t.milestoneId || null, deps: t.dependsOn || [], subtasks: (t.subtasks || []).map((st) => st.title),
      due: dayOffset(base, t.dueDate), start: dayOffset(base, t.startAfter),
    })),
    docs: data.docs.filter((d) => d.projectId === p.id).map((d) => ({ title: d.title, url: d.url, note: d.note || '', task: d.taskId, ms: d.milestoneId })),
  };
}

/** Bauplan in ein (neues) Projekt übernehmen; leere Projektfelder werden aus dem Bauplan gefüllt */
function applyBlueprint(np, bp, start) {
  const pr = bp.project || {};
  PROJECT_COPY_FIELDS.forEach((f) => { if ((np[f] === undefined || np[f] === null || np[f] === '') && pr[f] !== undefined) np[f] = structuredClone(pr[f]); });
  if (!np.targetDate && pr.targetOffset !== undefined) np.targetDate = fromOffset(start, pr.targetOffset);
  const msMap = {}, tMap = {};
  const msList = (bp.milestones || []).map((m, i) => {
    msMap[m.k] = uid();
    return { id: msMap[m.k], projectId: np.id, title: m.title, description: m.description || '', dueDate: fromOffset(start, m.due),
      assignees: [...(m.assignees || [])], done: false, doneAt: null, order: i, createdAt: new Date().toISOString() };
  });
  (bp.tasks || []).forEach((t) => { tMap[t.k] = uid(); });
  const tasks = (bp.tasks || []).map((t) => ({
    id: tMap[t.k], projectId: np.id, title: t.title, priority: t.priority || 'mittel', notes: t.notes || '', estimate: t.estimate || null,
    duration: t.duration || null, repeat: t.repeat || null, assignees: [...(t.assignees || [])], milestoneId: msMap[t.ms] || null,
    dependsOn: (t.deps || []).map((k) => tMap[k]).filter(Boolean), subtasks: (t.subtasks || []).map((title) => ({ id: uid(), title, done: false, doneAt: null })),
    dueDate: fromOffset(start, t.due), startAfter: fromOffset(start, t.start), done: false, doneAt: null, status: 'open', createdAt: new Date().toISOString(),
  }));
  data.milestones.push(...msList);
  data.tasks.push(...tasks);
  (bp.docs || []).forEach((d) => data.docs.push({ id: uid(), projectId: np.id, title: d.title, url: d.url, note: d.note, taskId: tMap[d.task] || null, milestoneId: msMap[d.ms] || null, createdAt: new Date().toISOString() }));
  return { milestones: msList.length, tasks: tasks.length };
}

function allTemplates() {
  return [...BUILTIN_TEMPLATES, ...(data.templates || [])];
}
const templateById = (id) => allTemplates().find((t) => t.id === id);

function duplicateForm(p) {
  openForm({
    title: tr('Projekt duplizieren'),
    submitLabel: tr('Duplizieren'),
    fields: [
      { name: 'name', label: tr('Name'), required: true, value: tr('{name} (Kopie)', { name: p.name }) },
      { name: 'start', label: tr('Projektstart'), type: 'date', value: todayISO(), required: true,
        hint: tr('Termine werden relativ zum Start von „{name}“ ({date}) verschoben.', { name: p.name, date: fmtDate(p.createdAt?.slice(0, 10) || todayISO()) }) },
    ],
    onSubmit(v) {
      const np = { id: uid(), name: v.name, status: 'aktiv', createdAt: v.start, ...(p.layout ? { layout: structuredClone(p.layout) } : {}) };
      const n = applyBlueprint(np, projectBlueprint(p), v.start);
      np.color = np.color || p.color;
      data.projects.push(np);
      commit();
      location.hash = `#/projekt/${np.id}`;
      toast(tr('⧉ Kopie angelegt: {t} Aufgaben, {m} Meilensteine.', { t: n.tasks, m: n.milestones }));
    },
  });
}

function saveTemplateForm(p) {
  openForm({
    title: tr('Als Vorlage speichern'),
    fields: [
      { name: 'name', label: tr('Name der Vorlage'), required: true, value: p.name },
      { name: 'icon', label: tr('Symbol'), value: '📋', half: true, placeholder: '📋' },
    ],
    onSubmit(v) {
      data.templates ||= [];
      data.templates.push({ id: uid(), name: v.name, icon: v.icon || '📋', createdAt: new Date().toISOString(), bp: projectBlueprint(p) });
      commit();
      toast(tr('📋 Vorlage „{name}“ gespeichert. Du findest sie beim Anlegen eines neuen Projekts.', { name: v.name }));
    },
  });
}

// Neues Projekt: gewählte Vorlage füllt leere Felder sichtbar vor
document.addEventListener('change', (e) => {
  if (e.target.id !== 'f_template') return;
  const tpl = templateById(e.target.value);
  const form = e.target.form, pr = tpl?.bp.project || {};
  const prev = form.dataset.tplFill ? JSON.parse(form.dataset.tplFill) : {};
  const fill = {};
  const set = (name, val) => {
    const el = form.elements[name];
    if (!el) return;
    if (el.value === '' || el.value === prev[name]) { el.value = val ?? ''; fill[name] = el.value; }
  };
  set('name', tpl ? tpl.name : '');
  set('description', pr.description || '');
  set('weeklyHours', pr.weeklyHours ? decimalValue(pr.weeklyHours) : '');
  if (pr.color && form.elements.color) form.elements.color.value = pr.color;
  form.dataset.tplFill = JSON.stringify(fill);
});

function renderTemplateSettings() {
  const own = data.templates || [];
  const row = (t) => {
    const bp = t.bp;
    return `<li><span class="today-ico">${esc(t.icon || '📋')}</span><div class="grow"><div class="title">${esc(t.name)}</div>
      <div class="meta">${trp(bp.tasks?.length || 0, '{n} Aufgabe', '{n} Aufgaben')} · ${trp(bp.milestones?.length || 0, '{n} Meilenstein', '{n} Meilensteine')}${t.builtin ? ` · ${tr('mitgeliefert')}` : ''}</div></div>
      ${t.builtin ? '' : `<button class="btn ghost icon danger" data-action="deleteTemplate" data-id="${t.id}" title="${tr('Löschen')}">🗑</button>`}</li>`;
  };
  return `<p class="small muted" style="margin-top:0">${tr('Vorlagen enthalten Meilensteine, Aufgaben (mit Unterpunkten, Schätzungen und Abhängigkeiten) und Dokument-Verweise – aber keine Zeiten oder Investitionen. Eigene Vorlagen speicherst du in einem Projekt über ⋯ › „Als Vorlage speichern“.')}</p>
    <ul class="list">${allTemplates().map(row).join('')}</ul>`;
}

/* ---------------------------- Wochenrückblick & -planung ----------------- */
/* Rückblick auf eine Woche (Stunden, Erledigtes, Erfolge, Notizen) und Planung der
   Folgewoche: je Projekt 1–3 Fokus-Aufgaben. Route #/woche[/YYYY-MM-DD]. */
/** Standard: Mo/Di die Vorwoche, sonst die laufende Woche */
function defaultReviewWeek() {
  const now = new Date();
  return toISO(addDays(startOfWeek(now), [1, 2].includes(now.getDay()) ? -7 : 0));
}
function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  return Math.ceil(((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

function renderWeekReview(weekParam) {
  const wk = /^\d{4}-\d{2}-\d{2}$/.test(weekParam || '') ? toISO(startOfWeek(parseISO(weekParam))) : defaultReviewWeek();
  const start = parseISO(wk), endEx = toISO(addDays(start, 7)), next = toISO(addDays(start, 7)), prev = toISO(addDays(start, -7));
  const inWeek = (iso) => iso && iso >= wk && iso < endEx;
  const minutes = minutesInRange(wk, endEx);
  const goal = weeklyGoal().minutes;
  const perProject = data.projects.map((p) => ({ p, m: minutesInRange(wk, endEx, p.id) })).filter((x) => x.m > 0).sort((a, b) => b.m - a.m);
  const max = Math.max(1, ...perProject.map((x) => x.m));
  const doneTasks = data.tasks.filter((t) => t.done && inWeek(t.doneAt));
  const msDone = data.milestones.filter((m) => m.done && inWeek(m.doneAt));
  const ach = ACHIEVEMENTS.filter((a) => inWeek((data.achievements || {})[a.id]));
  const days = new Set(Object.keys(dayMap()).filter(inWeek)).size;
  const rev = data.reviews?.[wk] || {};
  const focusNow = data.weekFocus?.[wk] || [];
  const focusDone = focusNow.filter((id) => data.tasks.find((t) => t.id === id)?.done).length;
  const planIds = new Set(data.weekFocus?.[next] || []);
  const active = data.projects.filter((p) => p.status === 'aktiv' && !p.archived);
  const range = `${fmtDate(wk)} – ${fmtDate(toISO(addDays(start, 6)))}`;
  const isCurrent = wk === toISO(startOfWeek(new Date()));
  const tile = (label, value, sub = '') => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

  return `
    <div class="page-head">
      <div><h1>📝 ${tr('Wochenrückblick')}</h1>
        <p>${tr('KW {w} · {range}', { w: isoWeek(start), range })}${isCurrent ? ` · <span class="badge aktiv">${tr('diese Woche')}</span>` : ''}</p></div>
      <div class="btn-row">
        <a class="btn small" href="#/woche/${prev}" aria-label="${tr('Vorherige Woche')}">‹ ${tr('Vorwoche')}</a>
        ${isCurrent ? '' : `<a class="btn small" href="#/woche/${next}">${tr('Nächste')} ›</a>`}
      </div>
    </div>
    <div class="stats week-stats">
      ${tile(tr('Zeit'), fmtHours(minutes), goal ? `${tr('Ziel: {goal}', { goal: fmtHours(goal) })} · ${Math.round((minutes / goal) * 100)} %` : '')}
      ${tile(tr('Aufgaben'), doneTasks.length, tr('erledigt'))}
      ${tile(tr('Meilensteine'), msDone.length, tr('erreicht'))}
      ${tile(tr('Aktive Tage'), `${days} / 7`, focusNow.length ? tr('Fokus: {done} von {n}', { done: focusDone, n: focusNow.length }) : '')}
    </div>
    <div class="grid-2">
      <section class="card">
        <h2>⏱️ ${tr('Zeit je Projekt')}</h2>
        ${perProject.length ? `<ul class="list">${perProject.map(({ p, m }) => `<li><div class="grow">
          <div class="row-between"><a href="#/projekt/${p.id}">${esc(p.name)}</a><span class="amount">${fmtDuration(m)}</span></div>
          <div class="progress" style="margin-top:6px"><span style="width:${(m / max) * 100}%;background:${esc(p.color)}"></span></div></div></li>`).join('')}</ul>`
          : `<div class="empty">${tr('In dieser Woche wurde keine Zeit erfasst.')}</div>`}
      </section>
      <section class="card">
        <h2>✅ ${tr('Geschafft')}</h2>
        ${doneTasks.length || msDone.length || ach.length ? `<ul class="list">
          ${msDone.map((m) => `<li><div class="grow"><div class="title">🏁 ${esc(m.title)}</div><div class="meta">${esc(getProject(m.projectId)?.name || '')}</div></div></li>`).join('')}
          ${ach.length ? `<li><div class="grow"><div class="meta">${trp(ach.length, '{n} Erfolg freigeschaltet', '{n} Erfolge freigeschaltet')}</div><div class="week-ach">${ach.map((a) => `<span class="chip" title="${esc(a.desc)}">${a.icon} ${esc(a.name)}</span>`).join('')}</div></div></li>` : ''}
          ${doneTasks.map((t) => `<li><div class="grow"><div class="title">✓ ${esc(t.title)}</div><div class="meta">${esc(getProject(t.projectId)?.name || '')}</div></div></li>`).join('')}
        </ul>` : `<div class="empty">${tr('Noch nichts abgehakt – das kommt!')}</div>`}
      </section>
    </div>
    <form class="card form week-form" data-form="review" data-week="${wk}" data-next="${next}">
      <h2>💭 ${tr('Gedanken zur Woche')}</h2>
      <div class="row2">
        <label>${tr('Was lief gut?')}<textarea name="good" class="autogrow" rows="3" placeholder="${tr('z. B. Shop-Fotos fertig, 3 Tage in Folge gearbeitet …')}">${esc(rev.good || '')}</textarea></label>
        <label>${tr('Was hat gebremst?')}<textarea name="blockers" class="autogrow" rows="3" placeholder="${tr('z. B. zu viele Termine, unklare Aufgabe …')}">${esc(rev.blockers || '')}</textarea></label>
      </div>
      <h2 style="margin-top:8px">🎯 ${tr('Fokus für KW {w}', { w: isoWeek(parseISO(next)) })}</h2>
      <p class="small muted" style="margin:0">${tr('Wähle je Projekt 1–3 Aufgaben, auf die du dich in der Woche ab {date} konzentrierst. Sie erscheinen auf der Übersicht unter „Wochenfokus“.', { date: fmtDate(next) })} ${weeklyGoal().minutes ? tr('Wochenziel: {h}', { h: fmtStd(weeklyGoal().minutes / 60) }) : ''}</p>
      ${active.length ? active.map((p) => {
        const open = sortTasks(data.tasks.filter((t) => t.projectId === p.id && !t.done)).slice(0, 8);
        return `<div class="focus-project"><div class="focus-head"><span class="dot-color" style="background:${esc(p.color)}"></span> <b>${esc(p.name)}</b>${projectWeeklyMin(p) ? ` <span class="small muted">${fmtStd(projectWeeklyMin(p) / 60)}</span>` : ''}</div>
          ${open.length ? `<div class="check-chips">${open.map((t) => `<label class="check-chip"><input type="checkbox" name="focus" value="${t.id}" ${planIds.has(t.id) ? 'checked' : ''}><span>${t.status === 'doing' ? '▶ ' : ''}${esc(t.title)}</span></label>`).join('')}</div>`
            : `<div class="small muted">${tr('Keine offenen Aufgaben.')} <a href="#" data-action="addTask" data-id="${p.id}">${tr('+ Aufgabe')}</a></div>`}</div>`;
      }).join('') : `<div class="empty">${tr('Noch keine aktiven Projekte.')}</div>`}
      <div class="form-actions"><button class="btn primary" type="submit">${tr('Rückblick & Planung speichern')}</button></div>
    </form>`;
}
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="review"]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  data.reviews ||= {};
  data.weekFocus ||= {};
  data.reviews[form.dataset.week] = { good: String(fd.get('good') || '').trim(), blockers: String(fd.get('blockers') || '').trim(), savedAt: new Date().toISOString() };
  data.weekFocus[form.dataset.next] = fd.getAll('focus').map(String);
  commit();
  toast(tr('📝 Gespeichert – viel Erfolg mit deinem Wochenfokus!'));
});

/* ---------------------------- Kanban-Board -------------------------------- */
/* Spalten Offen · In Arbeit · Erledigt. Maus: Karten ziehen; Finger: Karte antippen → Status wählen. */
let taskView = (() => { try { return localStorage.getItem('projekttracker.ui.taskView') === 'board' ? 'board' : 'list'; } catch { return 'list'; } })();
const taskStatusOf = (t) => (t.done ? 'done' : t.status === 'doing' ? 'doing' : 'open');

function kanbanCard(t) {
  const subs = t.subtasks || [];
  const ms = t.milestoneId ? data.milestones.find((m) => m.id === t.milestoneId) : null;
  return `<div class="kb-card ${t.done ? 'done' : ''}" data-kb="${t.id}" tabindex="0" role="button" aria-label="${esc(t.title)}">
    <div class="kb-title">${esc(t.title)}</div>
    <div class="meta">
      <span class="badge ${t.priority}">${prioLabel(t.priority)}</span>
      ${subs.length ? `<span class="badge">☑ ${subs.filter((s) => s.done).length}/${subs.length}</span>` : ''}
      ${taskTimeBadge(t)}
      ${t.repeat ? `<span class="badge">🔁</span>` : ''}
      ${t.done ? `<span>${fmtRelative(t.doneAt)}</span>` : dueBadge(t.dueDate)}
      ${ms ? `<span>🏁 ${esc(ms.title)}</span>` : ''}
      ${assigneeBadges(t.assignees)}
    </div>
  </div>`;
}
function kanbanBoard(open, done) {
  const cols = [
    ['open', tr('Offen'), open.filter((t) => t.status !== 'doing')],
    ['doing', tr('In Arbeit'), open.filter((t) => t.status === 'doing')],
    ['done', tr('Erledigt'), done],
  ];
  return `<div class="kanban">${cols.map(([key, label, list]) => `<div class="kb-col" data-kb-col="${key}">
      <div class="kb-head"><span>${key === 'doing' ? '▶ ' : key === 'done' ? '✓ ' : ''}${label}</span><span class="muted small">${list.length}</span></div>
      <div class="kb-list">${list.slice(0, key === 'done' ? 15 : 200).map(kanbanCard).join('') || `<div class="kb-empty small muted">${tr('Hierher ziehen')}</div>`}
        ${key === 'done' && list.length > 15 ? `<div class="small muted kb-more">${tr('… und {n} weitere', { n: list.length - 15 })}</div>` : ''}</div>
    </div>`).join('')}</div>
    <p class="small muted g-hint">${tr('Karten zwischen den Spalten ziehen – oder antippen, um den Status zu wählen.')}</p>`;
}

function setTaskStatus(id, status) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t || taskStatusOf(t) === status) return;
  if (status === 'done') { t.status = 'open'; return actions.toggleTask({ id }); } // Regeln für Unterpunkte & Feiern
  if (t.done) {
    if ((t.subtasks || []).length && t.subtasks.every((s) => s.done)) return toast(tr('Um die Aufgabe wieder zu öffnen, entferne den Haken bei einem Unterpunkt.'));
    t.done = false; t.doneAt = null;
  }
  t.status = status === 'doing' ? 'doing' : 'open';
  commit();
  if (status === 'doing') toast(tr('▶ „{title}“ ist jetzt in Arbeit', { title: t.title }));
}

// Ziehen mit der Maus (Finger: Antippen öffnet das Status-Menü)
let kbDrag = null;
document.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.kb-card');
  if (!card || e.button > 0) return;
  kbDrag = { card, id: card.dataset.kb, x0: e.clientX, y0: e.clientY, moved: false, touch: e.pointerType !== 'mouse' };
});
document.addEventListener('pointermove', (e) => {
  if (!kbDrag || kbDrag.touch) return;
  if (!kbDrag.moved && Math.hypot(e.clientX - kbDrag.x0, e.clientY - kbDrag.y0) < 6) return;
  if (!kbDrag.moved) {
    kbDrag.moved = true;
    const r = kbDrag.card.getBoundingClientRect();
    kbDrag.ghost = kbDrag.card.cloneNode(true);
    kbDrag.ghost.classList.add('kb-ghost');
    Object.assign(kbDrag.ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
    kbDrag.dx = e.clientX - r.left; kbDrag.dy = e.clientY - r.top;
    document.body.appendChild(kbDrag.ghost);
    kbDrag.card.classList.add('kb-placeholder');
  }
  kbDrag.ghost.style.left = `${e.clientX - kbDrag.dx}px`;
  kbDrag.ghost.style.top = `${e.clientY - kbDrag.dy}px`;
  document.querySelectorAll('.kb-col.over').forEach((c) => c.classList.remove('over'));
  kbDrag.ghost.style.display = 'none';
  document.elementFromPoint(e.clientX, e.clientY)?.closest('.kb-col')?.classList.add('over');
  kbDrag.ghost.style.display = '';
});
document.addEventListener('pointerup', (e) => {
  if (!kbDrag) return;
  const d = kbDrag;
  kbDrag = null;
  if (!d.moved) return; // Antippen/Klick öffnet das Menü im click-Ereignis (sonst trifft der Klick das frisch geöffnete Menü)
  kbJustDragged = Date.now();
  d.ghost.remove();
  d.card.classList.remove('kb-placeholder');
  const col = document.querySelector('.kb-col.over');
  document.querySelectorAll('.kb-col.over').forEach((c) => c.classList.remove('over'));
  if (col) setTaskStatus(d.id, col.dataset.kbCol);
});
let kbJustDragged = 0;
document.addEventListener('click', (e) => {
  const card = e.target.closest('.kb-card');
  if (!card || e.target.closest('a, button') || Date.now() - kbJustDragged < 250) return;
  const t = data.tasks.find((x) => x.id === card.dataset.kb);
  if (t) openPopover(card, taskMenuHTML(t));
});
document.addEventListener('pointercancel', () => { if (kbDrag?.ghost) { kbDrag.ghost.remove(); kbDrag.card.classList.remove('kb-placeholder'); } kbDrag = null; });
document.addEventListener('keydown', (e) => {
  const card = e.target.closest?.('.kb-card');
  if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  const t = data.tasks.find((x) => x.id === card.dataset.kb);
  if (t) openPopover(card, taskMenuHTML(t));
});

Object.assign(actions, {
  setTaskView({ id }) {
    taskView = id === 'board' ? 'board' : 'list';
    try { localStorage.setItem('projekttracker.ui.taskView', taskView); } catch { /* ignorieren */ }
    render();
  },
  setTaskStatus({ id, status }) { setTaskStatus(id, status); },
});

/* ---------------------------- Kalender-Export (.ics) --------------------- */
/* Fällige Aufgaben, Meilensteine, Zieltermine und geplante Aufgaben (Zeitplan) als
   iCalendar-Datei – lässt sich in Apple Kalender, Outlook und Google Kalender importieren.
   Gleiche UIDs → ein erneuter Import aktualisiert die Termine statt sie zu verdoppeln. */
function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsFold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 72) { out.push(rest.slice(0, 72)); rest = ' ' + rest.slice(72); }
  out.push(rest);
  return out.join('\r\n');
}
const icsDate = (iso) => iso.replace(/-/g, '');
function buildIcs(projectId) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const projects = data.projects.filter((p) => (!projectId || p.id === projectId) && p.status !== 'abgeschlossen' && !p.archived);
  const events = [];
  const ev = (uid, start, end, summary, desc, alarm = true) => events.push([
    'BEGIN:VEVENT', `UID:${uid}@protrac`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(toISO(addDays(parseISO(end), 1)))}`,
    `SUMMARY:${icsText(summary)}`, desc ? `DESCRIPTION:${icsText(desc)}` : '', 'TRANSP:TRANSPARENT',
    ...(alarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, 'TRIGGER:-PT15H', 'END:VALARM'] : []), 'END:VEVENT',
  ].filter(Boolean));
  projects.forEach((p) => {
    const pl = planProject(p.id);
    if (p.targetDate) ev(`target-${p.id}`, p.targetDate, p.targetDate, `⚑ ${tr('Zieltermin')}: ${p.name}`, p.goal || '');
    data.milestones.filter((m) => m.projectId === p.id && !m.done && m.dueDate).forEach((m) => {
      const f = pl.milestones.get(m.id);
      ev(`ms-${m.id}`, m.dueDate, m.dueDate, `🏁 ${m.title} · ${p.name}`, [m.description, f?.late > 0 ? `⚠️ ${tr('Prognose {date} · {late}', { date: fmtDate(f.forecast), late: trp(f.late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät') })}` : ''].filter(Boolean).join('\n'));
    });
    data.tasks.filter((t) => t.projectId === p.id && !t.done).forEach((t) => {
      if (t.dueDate) ev(`task-${t.id}`, t.dueDate, t.dueDate, `✅ ${t.title} · ${p.name}`, t.notes || '');
      else if (pl.used && pl.plan.get(t.id)) {
        const x = pl.plan.get(t.id);
        ev(`plan-${t.id}`, x.es, x.ef, `${x.critical ? '🔴' : '🗓'} ${t.title} · ${p.name}`, `${tr('Geplant laut Zeitplan')}${x.critical ? ` · ${tr('kritisch')}` : ` · ${trp(x.slack, '{n} Tag Puffer', '{n} Tage Puffer')}`}`, false);
      }
    });
  });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//R3DO//Protrac//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(projectId ? `Protrac · ${getProject(projectId)?.name}` : 'Protrac')}`, ...events.flat(), 'END:VCALENDAR'];
  return { text: lines.map(icsFold).join('\r\n') + '\r\n', count: events.length };
}
Object.assign(actions, {
  exportIcs({ id } = {}) {
    const { text, count } = buildIcs(id && getProject(id) ? id : null);
    if (!count) return toast(tr('Keine offenen Termine gefunden – trage Fälligkeiten, Meilenstein-Zieldaten oder einen Zieltermin ein.'));
    download(`protrac-termine${id ? `-${(getProject(id)?.name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}` : ''}.ics`, text, 'text/calendar');
    toast(trp(count, '📅 {n} Termin exportiert – Datei öffnen, um sie in deinen Kalender zu übernehmen.', '📅 {n} Termine exportiert – Datei öffnen, um sie in deinen Kalender zu übernehmen.'));
  },
});

/* ---------------------------- Zeitachsen füllen die ganze Breite ------- */
/* Gantt und Roadmap verlängern ihren Zeitraum, bis die Achse den verfügbaren Platz füllt.
   Die Breite wird nach dem Zeichnen gemessen (je Diagrammart) und beim nächsten Zeichnen
   genutzt; vor der ersten Messung gilt eine Schätzung aus der Seitenbreite. */
const chartWidths = new Map(); // data-chart → Breite der Zeitachse in px (ohne Beschriftungsspalte)
function chartFillDays(key, px) {
  let w = chartWidths.get(key);
  if (!w) {
    const label = window.matchMedia('(max-width: 640px)').matches ? 118 : 220;
    w = ($('#app')?.clientWidth || window.innerWidth) - 34 - label;
  }
  return Math.ceil(Math.max(0, w) / px) + 1;
}
/** Nach dem Zeichnen messen; hat sich die Breite geändert, einmal neu zeichnen */
function measureCharts() {
  let changed = false;
  document.querySelectorAll('.gantt-scroll[data-chart]').forEach((el) => {
    const gl = parseFloat(getComputedStyle(el).getPropertyValue('--gl')) || 0;
    const w = Math.round(el.clientWidth - gl);
    const old = chartWidths.get(el.dataset.chart);
    if (w > 0 && (!old || Math.abs(old - w) > 8)) {
      chartWidths.set(el.dataset.chart, w);
      // nur neu zeichnen, wenn die Achse dadurch nicht mehr passt (zu kurz oder unnötig lang)
      const inner = el.querySelector('.gantt');
      if (inner && (inner.offsetWidth < el.clientWidth - 2 || (old && old > w))) changed = true;
    }
  });
  return changed;
}
let chartResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(chartResizeTimer);
  chartResizeTimer = setTimeout(() => { if (document.querySelector('.gantt-scroll[data-chart]') && !$('#modal').open && measureCharts()) render(); }, 200);
});

/* ---------------------------- Gantt-Diagramm --------------------------- */
/* Balken je Aufgabe (gruppiert nach Meilensteinen), ◆ Meilensteine, Pfeile für Vorgänger,
   kritischer Pfad rot, Puffer hell, Heute-Linie. Ziehen = Start verschieben,
   rechter Rand = Dauer, ◆ ziehen = Zieldatum, Klick = bearbeiten. */
const GANTT_PX = { day: 34, week: 14, month: 4.5 };
const GANTT_ROW = 34;
let ganttZoom = (() => { try { const v = localStorage.getItem('projekttracker.ui.ganttZoom'); return GANTT_PX[v] ? v : 'day'; } catch { return 'day'; } })();
const ganttScroll = new Map(); // Scrollposition je Projekt (bleibt beim Neuzeichnen erhalten)

function ganttChart(p, pl) {
  const px = GANTT_PX[ganttZoom];
  const today = todayISO();
  const tasks = data.tasks.filter((t) => t.projectId === p.id && pl.plan.has(t.id))
    .sort((a, b) => pl.plan.get(a.id).es.localeCompare(pl.plan.get(b.id).es) || Number(a.done) - Number(b.done));
  if (!tasks.length) return '';
  const msList = sortMilestonesOf(p.id);
  const rows = [];
  msList.forEach((m) => { rows.push({ kind: 'ms', m }); tasks.filter((t) => t.milestoneId === m.id).forEach((t) => rows.push({ kind: 'task', t })); });
  const rest = tasks.filter((t) => !t.milestoneId || !msList.some((m) => m.id === t.milestoneId));
  if (rest.length) { if (msList.length) rows.push({ kind: 'group', label: tr('Ohne Meilenstein') }); rest.forEach((t) => rows.push({ kind: 'task', t })); }

  // Zeitraum
  const dates = [today];
  tasks.forEach((t) => { const x = pl.plan.get(t.id); dates.push(x.es, x.ef); if (x.lf) dates.push(x.lf); });
  msList.forEach((m) => { if (m.dueDate) dates.push(m.dueDate); if (m.doneAt) dates.push(m.doneAt); const f = pl.milestones.get(m.id); if (f) dates.push(f.forecast); });
  if (p.targetDate) dates.push(p.targetDate);
  let start = addDays(parseISO(dates.reduce(minIso)), -3);
  let end = addDays(parseISO(dates.reduce(maxIso)), ganttZoom === 'month' ? 21 : 7);
  if (ganttZoom === 'week') start = startOfWeek(start);
  if (ganttZoom === 'month') start = new Date(start.getFullYear(), start.getMonth(), 1);
  const minDays = Math.max(ganttZoom === 'day' ? 28 : ganttZoom === 'week' ? 84 : 240, chartFillDays('gantt', px));
  if (daysBetween(toISO(start), toISO(end)) < minDays) end = addDays(start, minDays);
  const startIso = toISO(start);
  const total = daysBetween(startIso, toISO(end)) + 1;
  const W = Math.round(total * px);
  const x = (iso) => daysBetween(startIso, iso) * px;

  // Kopf: Monate und Tage/Wochen
  const months = [], cells = [], shades = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i), iso = toISO(d);
    if (i === 0 || d.getDate() === 1) months.push({ i, label: d.toLocaleDateString(LOCALE, { month: ganttZoom === 'month' ? 'short' : 'long', year: 'numeric' }) });
    if (!data.settings.planWeekends && !isWorkday(iso) && ganttZoom !== 'month') shades.push(i);
    if (ganttZoom === 'day') cells.push(`<span class="g-day ${iso === today ? 'today' : ''} ${isWorkday(iso) ? '' : 'we'}" style="left:${i * px}px;width:${px}px">${d.getDate()}</span>`);
    if (ganttZoom === 'week' && d.getDay() === 1) cells.push(`<span class="g-day" style="left:${i * px}px;width:${7 * px}px">${fmtShortDate(iso)}</span>`);
  }
  const monthHtml = months.map((mo, k) => `<span class="g-month" style="left:${mo.i * px}px;width:${((months[k + 1]?.i ?? total) - mo.i) * px}px">${esc(mo.label)}</span>`).join('');

  // Zeilen
  const rowIndex = new Map();
  const bodyRows = rows.map((r, idx) => {
    if (r.kind === 'group') return `<div class="g-row g-group"><div class="g-label">${esc(r.label)}</div><div class="g-track" style="width:${W}px"></div></div>`;
    if (r.kind === 'ms') {
      const m = r.m, f = pl.milestones.get(m.id);
      const pos = m.done ? m.doneAt : m.dueDate || f?.forecast;
      const late = f?.late > 0;
      return `<div class="g-row g-msrow"><div class="g-label" title="${esc(m.title)}">🏁 <b>${esc(m.title)}</b></div><div class="g-track" style="width:${W}px">
        ${f && m.dueDate && late ? `<span class="g-late" style="left:${x(m.dueDate) + px / 2}px;width:${x(f.forecast) - x(m.dueDate)}px" title="${esc(trp(f.late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät'))}"></span>
          <span class="g-diamond forecast" style="left:${x(f.forecast) + px / 2}px" title="${esc(tr('Prognose {date}', { date: fmtDate(f.forecast) }))}"></span>` : ''}
        ${pos ? `<span class="g-diamond ${m.done ? 'done' : late ? 'late' : ''}" style="left:${x(pos) + px / 2}px" ${m.done ? '' : `data-gms="${m.id}" tabindex="0"`}
          title="${esc(`${m.title} · ${m.done ? tr('erreicht am {date}', { date: fmtDate(m.doneAt) }) : m.dueDate ? `${tr('Zieldatum')}: ${fmtDate(m.dueDate)}` : tr('Prognose {date}', { date: fmtDate(pos) })}`)}"></span>` : ''}
      </div></div>`;
    }
    const t = r.t, pv = pl.plan.get(t.id);
    rowIndex.set(t.id, idx);
    const left = x(pv.es), width = Math.max(px, (daysBetween(pv.es, pv.ef) + 1) * px);
    const slackW = !t.done && pv.slack > 0 ? (daysBetween(pv.ef, pv.lf)) * px : 0;
    const cls = t.done ? 'done' : pv.critical ? 'crit' : '';
    const tip = `${t.title} · ${fmtDate(pv.es)}${pv.dur > 1 ? ` – ${fmtDate(pv.ef)}` : ''} · ${trp(pv.dur, '{n} Tag', '{n} Tage')}${t.done ? '' : ` · ${pv.critical ? tr('kritisch') : trp(pv.slack, '{n} Tag Puffer', '{n} Tage Puffer')}\n${critReason(pv)}`}`;
    return `<div class="g-row"><div class="g-label ${cls}" title="${esc(t.title)}">${t.done ? '✓ ' : ''}${esc(t.title)}</div><div class="g-track" style="width:${W}px">
      ${slackW > 0 ? `<span class="g-slack" style="left:${left + width}px;width:${slackW}px" title="${esc(trp(pv.slack, '{n} Tag Puffer', '{n} Tage Puffer'))}"></span>` : ''}
      <span class="g-bar ${cls} ${width < 72 ? 'narrow' : ''}" style="left:${left}px;width:${width}px" ${t.done ? '' : `data-gtask="${t.id}" tabindex="0"`} title="${esc(tip)}">
        <span class="g-text">${esc(t.title)}</span>${t.done ? '' : '<span class="g-handle" aria-hidden="true"></span>'}</span>
    </div></div>`;
  });

  // Pfeile Vorgänger → Nachfolger
  const arrows = [];
  tasks.forEach((t) => (t.dependsOn || []).forEach((pid) => {
    if (!rowIndex.has(pid) || !rowIndex.has(t.id) || pl.cyclic.has(t.id)) return;
    const a = pl.plan.get(pid), b = pl.plan.get(t.id);
    const x1 = x(a.ef) + px, y1 = rowIndex.get(pid) * GANTT_ROW + GANTT_ROW / 2;
    const x2 = x(b.es), y2 = rowIndex.get(t.id) * GANTT_ROW + GANTT_ROW / 2;
    const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 10));
    const crit = b.critical && (a.critical || a.done) ? 'crit' : '';
    arrows.push(`<path class="g-arrow ${crit}" d="M${x1},${y1} H${mid} V${y2} H${x2 - 2}" marker-end="url(#g-head${crit ? '-crit' : ''})"/>`);
  }));
  const H = rows.length * GANTT_ROW;
  const zoomNames = { day: tr('Tage'), week: tr('Wochen'), month: tr('Monate') };
  return `<div class="gantt-wrap">
    <div class="gantt-tools">
      <div class="segmented" role="group" aria-label="${tr('Zoom')}">${Object.keys(GANTT_PX).map((z) => `<button type="button" class="seg-btn ${z === ganttZoom ? 'active' : ''}" data-action="setGanttZoom" data-id="${z}" aria-pressed="${z === ganttZoom}">${zoomNames[z]}</button>`).join('')}</div>
      <button type="button" class="btn small" data-action="ganttToday">${tr('Heute')}</button>
      <span class="g-legend small muted"><span class="g-key crit"></span>${tr('kritisch')} <span class="g-key"></span>${tr('geplant')} <span class="g-key slack"></span>${tr('Puffer')} <span class="g-key done"></span>${tr('erledigt')} ◆ ${tr('Meilenstein')}</span>
    </div>
    <div class="gantt-scroll" data-gantt="${p.id}" data-chart="gantt" data-px="${px}">
      <div class="gantt" style="--gw:${W}px">
        <div class="g-row g-head"><div class="g-label"></div><div class="g-track" style="width:${W}px"><div class="g-months">${monthHtml}</div><div class="g-days">${cells.join('')}</div></div></div>
        <div class="g-body">
          <div class="g-bg" style="height:${H}px;width:${W}px">${shades.map((i) => `<span style="left:${i * px}px;width:${px}px"></span>`).join('')}
            <span class="g-today" style="left:${x(today) + px / 2}px" title="${tr('Heute')}"></span>
            ${p.targetDate ? `<span class="g-target" style="left:${x(p.targetDate) + px}px" title="${esc(`${tr('Zieltermin')}: ${fmtDate(p.targetDate)}`)}"></span>` : ''}</div>
          <svg class="g-arrows" width="${W}" height="${H}" aria-hidden="true">
            <defs><marker id="g-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="g-ah"/></marker>
              <marker id="g-head-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="g-ah crit"/></marker></defs>
            ${arrows.join('')}</svg>
          ${bodyRows.join('')}
        </div>
      </div>
    </div>
    <p class="small muted g-hint">${window.matchMedia('(hover: none)').matches
      ? tr('Gedrückt halten und ziehen = Start verschieben · am rechten Rand = Dauer ändern · ◆ = Zieldatum · antippen = bearbeiten. Nachfolger rücken automatisch mit.')
      : tr('Balken ziehen = Start verschieben · rechten Rand ziehen = Dauer ändern · ◆ ziehen = Zieldatum · antippen = bearbeiten. Nachfolger rücken automatisch mit.')}</p>
  </div>`;
}

/** Scrollposition wiederherstellen bzw. beim ersten Öffnen zu „Heute“ springen */
function restoreGanttScroll(forceToday = false) {
  document.querySelectorAll('.gantt-scroll').forEach((el) => {
    const key = `${el.dataset.gantt}|${el.dataset.px}`;
    const todayEl = el.querySelector('.g-today');
    if (!forceToday && ganttScroll.has(key)) el.scrollLeft = ganttScroll.get(key);
    else if (todayEl) el.scrollLeft = Math.max(0, todayEl.offsetLeft - (el.dataset.gantt === 'roadmap' ? 14 : 3) * Number(el.dataset.px) - 40);
    el.addEventListener('scroll', () => ganttScroll.set(key, el.scrollLeft), { passive: true });
  });
}

/* Ziehen von Balken, Balkenende und Meilensteinen */
/* Maus: sofort ziehen. Finger: erst nach kurzem Gedrückthalten (GANTT_HOLD ms) – so verschiebt
   normales Scrollen auf dem Smartphone nichts mehr. Bewegt sich der Finger vorher, ist es Scrollen. */
const GANTT_HOLD = 380;
let gDrag = null;
document.addEventListener('pointerdown', (e) => {
  const bar = e.target.closest('[data-gtask], [data-gms]');
  if (!bar || e.button > 0) return;
  const px = Number(bar.closest('.gantt-scroll').dataset.px);
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
  gDrag = { el: bar, px, x0: e.clientX, y0: e.clientY, moved: false, touch, armed: !touch, pointerId: e.pointerId,
    mode: bar.dataset.gms ? 'ms' : e.target.closest('.g-handle') ? 'resize' : 'move',
    left: parseFloat(bar.style.left), width: parseFloat(bar.style.width) || 0, id: bar.dataset.gtask || bar.dataset.gms };
  if (touch) {
    gDrag.timer = setTimeout(() => {
      if (!gDrag || gDrag.el !== bar) return;
      gDrag.armed = true;
      gDrag.x0 = gDrag.lastX ?? gDrag.x0;
      bar.classList.add('armed');
      bar.setPointerCapture?.(gDrag.pointerId);
      navigator.vibrate?.(12);
    }, GANTT_HOLD);
    return; // nicht preventDefault – sonst ließe sich die Seite nicht scrollen
  }
  bar.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
// Solange ein Balken „gegriffen“ ist, darf der Finger die Seite nicht scrollen
document.addEventListener('touchmove', (e) => { if (gDrag?.armed && gDrag.touch) e.preventDefault(); }, { passive: false });
document.addEventListener('pointermove', (e) => {
  if (!gDrag) return;
  if (!gDrag.armed) {
    gDrag.lastX = e.clientX;
    // vor dem Greifen bewegt = Scrollen → kein Ziehen, kein Antippen
    if (Math.hypot(e.clientX - gDrag.x0, e.clientY - gDrag.y0) > 8) { clearTimeout(gDrag.timer); gDrag = null; }
    return;
  }
  const dx = e.clientX - gDrag.x0;
  if (!gDrag.moved && Math.abs(dx) < 4) return;
  gDrag.moved = true;
  const days = Math.round(dx / gDrag.px);
  gDrag.days = days;
  gDrag.el.classList.add('dragging');
  if (gDrag.mode === 'resize') gDrag.el.style.width = `${Math.max(gDrag.px, gDrag.width + days * gDrag.px)}px`;
  else gDrag.el.style.left = `${gDrag.left + days * gDrag.px}px`;
  gDrag.el.dataset.delta = days ? `${days > 0 ? '+' : ''}${days} ${tr('T')}` : '';
});
function endGanttDrag() {
  if (!gDrag) return;
  const { mode, id, moved, days, timer, el } = gDrag;
  clearTimeout(timer);
  el.classList.remove('armed');
  gDrag = null;
  if (!moved) return mode === 'ms' ? actions.editMilestone({ id }) : actions.editTask({ id });
  if (!days) return render();
  applyGanttChange(mode, id, days);
}
document.addEventListener('pointerup', endGanttDrag);
document.addEventListener('pointercancel', () => {
  if (!gDrag) return;
  const { moved, timer, el } = gDrag;
  clearTimeout(timer);
  el.classList.remove('armed');
  gDrag = null;
  if (moved) render(); // nur zurücksetzen, wenn schon etwas verschoben war
});
// Langes Drücken soll kein Kontextmenü / keine Textauswahl öffnen
document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-gtask], [data-gms]')) e.preventDefault(); });
// Tastatur: Pfeile verschieben, Umschalt+Pfeile ändern die Dauer, Enter bearbeitet
document.addEventListener('keydown', (e) => {
  const bar = e.target.closest?.('[data-gtask], [data-gms]');
  if (!bar) return;
  const id = bar.dataset.gtask || bar.dataset.gms, mode = bar.dataset.gms ? 'ms' : e.shiftKey ? 'resize' : 'move';
  if (e.key === 'Enter') { e.preventDefault(); return bar.dataset.gms ? actions.editMilestone({ id }) : actions.editTask({ id }); }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  applyGanttChange(mode, id, e.key === 'ArrowRight' ? 1 : -1);
  document.querySelector(`[data-gtask="${CSS.escape(id)}"], [data-gms="${CSS.escape(id)}"]`)?.focus();
});

function applyGanttChange(mode, id, days) {
  if (mode === 'ms') {
    const m = data.milestones.find((x) => x.id === id);
    const pl = planProject(m.projectId);
    const base = m.dueDate || pl.milestones.get(m.id)?.forecast || todayISO();
    m.dueDate = toISO(addDays(parseISO(base), days));
    commit();
    return toast(tr('🏁 Zieldatum: {date}', { date: fmtDate(m.dueDate) }));
  }
  const t = data.tasks.find((x) => x.id === id);
  const pv = planProject(t.projectId).plan.get(t.id);
  if (mode === 'resize') {
    const newEf = prevWorkday(toISO(addDays(parseISO(pv.ef), days)));
    t.duration = Math.max(1, workdaysBetween(pv.es, maxIso(newEf, pv.es)) + 1);
    commit();
    return toast(tr('⏱ Dauer: {d}', { d: trp(t.duration, '{n} Tag', '{n} Tage') }));
  }
  // Verschieben setzt den frühesten Start – zurück auf das Mögliche entfernt ihn wieder
  const want = nextWorkday(toISO(addDays(parseISO(pv.es), days)));
  const keep = t.startAfter;
  t.startAfter = null;
  planCache.clear();
  const natural = planProject(t.projectId).plan.get(t.id).es;
  t.startAfter = want > natural ? want : null;
  if (keep === t.startAfter) { planCache.clear(); return render(); }
  commit();
  const now = planProject(t.projectId).plan.get(t.id).es;
  toast(want < natural ? tr('Früher geht nicht – „{title}“ wartet auf Vorgänger (frühestens {date}).', { title: t.title, date: fmtDate(natural) }) : tr('📅 Start: {date}', { date: fmtDate(now) }));
}

Object.assign(actions, {
  setGanttZoom({ id }) {
    if (!GANTT_PX[id]) return;
    ganttZoom = id;
    try { localStorage.setItem('projekttracker.ui.ganttZoom', id); } catch { /* ignorieren */ }
    render();
  },
  ganttToday() { restoreGanttScroll(true); },
});

/* ---------------------------- Roadmap (alle Projekte) -------------------- */
/* Eine Zeile je Projekt: Laufzeit (Beginn bis voraussichtliches Ende bzw. Zieltermin),
   Fortschritt, Meilensteine (◆) und Zieltermin (⚑). Verspätete Projekte rot umrandet. */
let roadmapZoom = (() => { try { const v = localStorage.getItem('projekttracker.ui.roadmapZoom'); return ['week', 'month'].includes(v) ? v : 'month'; } catch { return 'month'; } })();

/** Zeitraum eines Projekts für die Roadmap */
function projectSpan(p) {
  const pl = planProject(p.id);
  const s = projectStats(p);
  const today = todayISO();
  const starts = [p.createdAt ? String(p.createdAt).slice(0, 10) : today];
  data.timeEntries.forEach((e) => { if (e.projectId === p.id) starts.push(e.date); });
  pl.plan.forEach((x) => starts.push(x.es));
  const ends = [];
  if (pl.used && pl.openCount) ends.push(pl.end);
  if (p.targetDate) ends.push(p.targetDate);
  const ms = data.milestones.filter((m) => m.projectId === p.id);
  ms.forEach((m) => { if (m.dueDate) ends.push(m.dueDate); if (m.doneAt) ends.push(m.doneAt); const f = pl.milestones.get(m.id); if (f) ends.push(f.forecast); });
  const start = starts.reduce(minIso);
  const openEnd = !ends.length;
  const end = openEnd ? maxIso(today, start) : ends.reduce(maxIso);
  const lateMs = ms.map((m) => ({ m, f: pl.milestones.get(m.id) })).filter((x) => x.f?.late > 0);
  return { start, end, openEnd, ms, pl, progress: s.hasProgress ? s.progress : null, late: pl.projectLate, lateMs };
}

function roadmapChart(projects, { compact = false } = {}) {
  const px = { week: 14, month: 4.5 }[roadmapZoom];
  const today = todayISO();
  const spans = projects.map((p) => ({ p, ...projectSpan(p) }));
  if (!spans.length) return '';
  let start = addDays(parseISO([today, ...spans.map((x) => x.start)].reduce(minIso)), -7);
  const floor = addDays(parseISO(today), compact ? -30 : -120);
  if (start < floor) start = floor; // sehr alte Projekte beginnen am linken Rand
  start = roadmapZoom === 'month' ? new Date(start.getFullYear(), start.getMonth(), 1) : startOfWeek(start);
  let end = addDays(parseISO([today, ...spans.map((x) => x.end)].reduce(maxIso)), 28);
  const minDays = Math.max(roadmapZoom === 'week' ? 84 : 180, chartFillDays(compact ? 'roadmap-compact' : 'roadmap', px));
  if (daysBetween(toISO(start), toISO(end)) < minDays) end = addDays(start, minDays);
  const startIso = toISO(start);
  const total = daysBetween(startIso, toISO(end)) + 1;
  const W = Math.round(total * px);
  const x = (iso) => Math.max(0, daysBetween(startIso, iso)) * px;

  const months = [], weeks = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i);
    if (i === 0 || d.getDate() === 1) months.push({ i, label: d.toLocaleDateString(LOCALE, { month: roadmapZoom === 'month' ? 'short' : 'long', year: 'numeric' }) });
    if (roadmapZoom === 'week' && d.getDay() === 1) weeks.push(`<span class="g-day" style="left:${i * px}px;width:${7 * px}px">${fmtShortDate(toISO(d))}</span>`);
  }
  const monthHtml = months.map((mo, k) => `<span class="g-month" style="left:${mo.i * px}px;width:${((months[k + 1]?.i ?? total) - mo.i) * px}px">${esc(mo.label)}</span>`).join('');

  const rows = spans.sort((a, b) => a.start.localeCompare(b.start)).map(({ p, start: s, end: e, openEnd, ms, progress, late, lateMs }) => {
    const left = x(s), width = Math.max(px * 2, x(e) - left + px);
    const problem = late > 0 || lateMs.length;
    const tip = `${p.name} · ${fmtDate(s)} – ${openEnd ? tr('ohne Termin') : fmtDate(e)}${progress !== null ? ` · ${progress}%` : ''}${problem ? ` · ⚠️ ${tr('Termin gefährdet')}` : ''}`;
    const link = `#/projekt/${p.id}/zeitplan`;
    return `<div class="g-row rm-row"><a class="g-label rm-label" href="${link}" title="${esc(p.name)}"><span class="dot-color" style="background:${esc(p.color)}"></span> ${esc(p.name)}${problem ? ' <span class="rm-warn">⚠️</span>' : ''}</a>
      <div class="g-track" style="width:${W}px">
        <a class="rm-bar ${openEnd ? 'open' : ''} ${problem ? 'late' : ''} ${p.status === 'pausiert' ? 'paused' : ''}" href="${link}" style="left:${left}px;width:${width}px;--pc:${esc(p.color)}" title="${esc(tip)}">
          ${progress !== null ? `<span class="rm-progress" style="width:${progress}%"></span>` : ''}<span class="rm-text">${esc(p.name)}</span></a>
        ${ms.map((m) => { const f = m.done ? null : planProject(p.id).milestones.get(m.id); const pos = m.done ? m.doneAt : m.dueDate || f?.forecast; if (!pos) return '';
          return `<span class="g-diamond rm-ms ${m.done ? 'done' : f?.late > 0 ? 'late' : ''}" style="left:${x(pos) + px / 2}px" title="${esc(`🏁 ${m.title} · ${m.done ? tr('erreicht am {date}', { date: fmtDate(m.doneAt) }) : `${fmtDate(pos)}${f?.late > 0 ? ` · ${trp(f.late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät')}` : ''}`}`)}"></span>`; }).join('')}
        ${p.targetDate ? `<span class="rm-target" style="left:${x(p.targetDate) + px}px" title="${esc(`${tr('Zieltermin')}: ${fmtDate(p.targetDate)}`)}">⚑</span>` : ''}
      </div></div>`;
  });
  const H = rows.length * GANTT_ROW;
  const warnings = spans.flatMap(({ p, late, lateMs }) => [
    ...lateMs.map(({ m, f }) => ({ p, text: tr('Meilenstein „{title}“: {late}', { title: m.title, late: trp(f.late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät') }), n: f.late })),
    ...(late > 0 ? [{ p, text: tr('Zieltermin {date}: {late}', { date: fmtDate(p.targetDate), late: trp(late, '{n} Arbeitstag zu spät', '{n} Arbeitstage zu spät') }), n: late }] : []),
  ]).sort((a, b) => b.n - a.n);
  return `<div class="gantt-wrap roadmap">
    ${warnings.length ? `<ul class="rm-warnings">${warnings.slice(0, compact ? 3 : 10).map((w) => `<li>⚠️ <a href="#/projekt/${w.p.id}/zeitplan"><b>${esc(w.p.name)}</b></a> – ${esc(w.text)}</li>`).join('')}</ul>` : ''}
    <div class="gantt-tools">
      <div class="segmented" role="group" aria-label="${tr('Zoom')}">${['week', 'month'].map((z) => `<button type="button" class="seg-btn ${z === roadmapZoom ? 'active' : ''}" data-action="setRoadmapZoom" data-id="${z}" aria-pressed="${z === roadmapZoom}">${z === 'week' ? tr('Wochen') : tr('Monate')}</button>`).join('')}</div>
      <button type="button" class="btn small" data-action="ganttToday">${tr('Heute')}</button>
      ${compact ? '' : `<span class="g-legend small muted"><span class="g-key rm"></span>${tr('Laufzeit & Fortschritt')} ◆ ${tr('Meilenstein')} ⚑ ${tr('Zieltermin')} <span class="g-key crit"></span>${tr('Termin gefährdet')}</span>`}
    </div>
    <div class="gantt-scroll" data-gantt="roadmap" data-chart="${compact ? 'roadmap-compact' : 'roadmap'}" data-px="${px}">
      <div class="gantt" style="--gw:${W}px">
        <div class="g-row g-head"><div class="g-label"></div><div class="g-track" style="width:${W}px"><div class="g-months">${monthHtml}</div><div class="g-days">${weeks.join('')}</div></div></div>
        <div class="g-body">
          <div class="g-bg" style="height:${H}px;width:${W}px"><span class="g-today" style="left:${x(today) + px / 2}px" title="${tr('Heute')}"></span></div>
          ${rows.join('')}
        </div>
      </div>
    </div>
    ${compact ? '' : `<p class="small muted g-hint">${tr('Laufzeit vom ersten Eintrag bzw. geplanten Start bis zum voraussichtlichen Ende oder Zieltermin. Projekte ohne Termin enden offen (gestrichelt). Antippen öffnet den Zeitplan des Projekts.')}</p>`}
  </div>`;
}

Object.assign(actions, {
  setRoadmapZoom({ id }) {
    roadmapZoom = id === 'week' ? 'week' : 'month';
    try { localStorage.setItem('projekttracker.ui.roadmapZoom', roadmapZoom); } catch { /* ignorieren */ }
    render();
  },
  openRoadmap() {
    projectView = 'roadmap';
    try { localStorage.setItem('projekttracker.ui.projectView', 'roadmap'); } catch { /* ignorieren */ }
    if (location.hash === '#/projekte') render(); else location.hash = '#/projekte';
  },
});

/* ------------------------------------------------------------------------
   Personen & Teams (Stufe A: Zuständigkeiten planen)
   Vorbereitung Stufe B (eigene Logins mit Server): Personen haben ein Feld
   accountId und optional eine E-Mail für Einladungen; „Ich“ kommt dann aus dem
   Login statt aus der Geräte-Einstellung (siehe currentPerson()).
   ------------------------------------------------------------------------ */
const ME_KEY = 'projekttracker.ui.me'; // „Das bin ich“ – pro Gerät (später: aus dem Login)
let taskWhoFilter = 'all';             // Filter im Aufgaben-Reiter: all | me | none | p:<id> | t:<id>

function currentPerson() {
  // Stufe B: hier künftig zuerst die Person des angemeldeten Kontos (server.account?.personId)
  let id = null;
  try { id = localStorage.getItem(ME_KEY); } catch { /* ignorieren */ }
  return data.people.find((x) => x.id === id) || null;
}
const personById = (id) => data.people.find((x) => x.id === id);
const teamById = (id) => data.teams.find((x) => x.id === id);
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const teamsOf = (personId) => data.teams.filter((tm) => (tm.memberIds || []).includes(personId));

/** Ist ein Eintrag mir zugewiesen – direkt oder über eines meiner Teams? */
function isMine(item, me = currentPerson()) {
  if (!me || !item.assignees?.length) return false;
  if (item.assignees.includes(`p:${me.id}`)) return true;
  return teamsOf(me.id).some((tm) => item.assignees.includes(`t:${tm.id}`));
}
function matchesWho(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'me') return isMine(item);
  if (filter === 'none') return !item.assignees?.length;
  if (filter.startsWith('p:')) return (item.assignees || []).includes(filter) || teamsOf(filter.slice(2)).some((tm) => (item.assignees || []).includes(`t:${tm.id}`));
  return (item.assignees || []).includes(filter);
}

function personAvatar(p, size = '') {
  return `<span class="avatar ${size}" style="--av:${esc(p.color || 'var(--primary)')}" title="${esc(p.name)}${p.email ? ` · ${esc(p.email)}` : ''}">${esc(p.short || initialsOf(p.name))}</span>`;
}
function teamBadge(tm) {
  return `<span class="team-badge" style="--av:${esc(tm.color || 'var(--primary)')}" title="${esc(tm.name)}: ${esc((tm.memberIds || []).map((id) => personById(id)?.name).filter(Boolean).join(', '))}">👥 ${esc(tm.name)}</span>`;
}
/** Zuständige als Avatare (Personen) bzw. Abzeichen (Teams) */
function assigneeBadges(list) {
  if (!list?.length) return '';
  const html = list.map((a) => {
    const id = a.slice(2);
    if (a.startsWith('p:')) { const p = personById(id); return p ? personAvatar(p, 'small') : ''; }
    const tm = teamById(id); return tm ? teamBadge(tm) : '';
  }).join('');
  return html ? `<span class="assignees">${html}</span>` : '';
}

/** Auswahl für „Zuständig“: Teams und Personen; Projektteams und deren Mitglieder zuerst */
function assigneeField(pid, value) {
  const big = data.people.length + data.teams.length > MULTI_FROM;
  return { name: 'assignees', label: tr('Zuständig'), type: big ? 'multi' : 'checks', options: assigneeOptions(pid), value: value || [],
    ...(big ? { placeholder: tr('Person oder Team suchen …') } : {}) };
}
function assigneeOptions(pid) {
  const projTeams = new Set(getProject(pid)?.teamIds || []);
  const projPeople = new Set(data.teams.filter((tm) => projTeams.has(tm.id)).flatMap((tm) => tm.memberIds || []));
  const teams = [...data.teams].sort((a, b) => Number(projTeams.has(b.id)) - Number(projTeams.has(a.id)) || a.name.localeCompare(b.name));
  const people = [...data.people].sort((a, b) => Number(projPeople.has(b.id)) - Number(projPeople.has(a.id)) || a.name.localeCompare(b.name));
  return [
    ...(teams.length ? [{ group: tr('Teams') }, ...teams.map((tm) => ({ value: `t:${tm.id}`, label: tm.name, html: teamBadge(tm) }))] : []),
    ...(people.length ? [{ group: tr('Personen') }, ...people.map((p) => ({ value: `p:${p.id}`, label: p.name, hint: p.short || '', html: `${personAvatar(p, 'small')} ${esc(p.name)}` }))] : []),
  ];
}

/** Filter-Chips im Aufgaben-Reiter */
function whoFilterChips(p) {
  if (!data.people.length && !data.teams.length) return '';
  const projTeams = (p.teamIds || []).map(teamById).filter(Boolean);
  const ids = new Set(projTeams.flatMap((tm) => tm.memberIds || []));
  data.tasks.filter((t) => t.projectId === p.id).forEach((t) => (t.assignees || []).forEach((a) => { if (a.startsWith('p:')) ids.add(a.slice(2)); }));
  const people = [...ids].map(personById).filter(Boolean);
  const teams = [...new Set([...projTeams, ...data.tasks.filter((t) => t.projectId === p.id).flatMap((t) => (t.assignees || []).filter((a) => a.startsWith('t:')).map((a) => teamById(a.slice(2))))])].filter(Boolean);
  const chip = (value, html) => `<button type="button" class="chip ${taskWhoFilter === value ? 'active' : ''}" data-action="setWhoFilter" data-id="${esc(value)}">${html}</button>`;
  return `<div class="chips who-filter" role="group" aria-label="${tr('Zuständig')}">
    ${chip('all', tr('Alle'))}${currentPerson() ? chip('me', `🙋 ${tr('Meine')}`) : ''}
    ${teams.map((tm) => chip(`t:${tm.id}`, `👥 ${esc(tm.name)}`)).join('')}
    ${people.map((x) => chip(`p:${x.id}`, `${personAvatar(x, 'small')} ${esc(x.name)}`)).join('')}
    ${chip('none', tr('Ohne Zuständige'))}
  </div>`;
}

/* Einstellungen › Team */
function renderTeamSettings() {
  const me = currentPerson();
  const myTasksVisible = dashboardConfig().widgets.find((w) => w.id === 'myTasks')?.visible;
  return `<p class="small muted">${tr('Lege Personen und Teams an und weise sie Aufgaben und Meilensteinen zu. Teams kannst du Projekten zuordnen. Die Personen arbeiten vorerst nicht selbst im Tool – mit eigenem Server bekommen sie später einen eigenen Login (die E-Mail-Adresse wird dann für die Einladung verwendet).')}</p>
    <div class="form" style="padding:0;margin-bottom:16px">
      <label>${tr('Das bin ich (auf diesem Gerät)')}
        <select data-me-select>
          <option value="">${tr('– niemand ausgewählt –')}</option>
          ${data.people.map((p) => `<option value="${p.id}" ${me?.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <span class="hint">${tr('Bestimmt, was unter „Meine Aufgaben“ erscheint.')}</span>
      </label>
      ${me && !myTasksVisible ? `<div><button type="button" class="btn small" data-action="showMyTasks">🙋 ${tr('„Meine Aufgaben“ auf der Übersicht anzeigen')}</button></div>` : ''}
    </div>
    <div class="grid-2">
      <div>
        <div class="card-head"><h3 style="margin:0">${tr('Personen ({n})', { n: data.people.length })}</h3><button type="button" class="btn small primary" data-action="addPerson">${tr('+ Person')}</button></div>
        ${data.people.length ? `<ul class="list">${data.people.map((p) => `<li>${personAvatar(p)}
          <div class="grow"><div class="title">${esc(p.name)}${me?.id === p.id ? ` <span class="badge aktiv">${tr('ich')}</span>` : ''}</div>
            <div class="meta">${p.email ? `<span>${esc(p.email)}</span>` : ''}${teamsOf(p.id).map(teamBadge).join('')}
              <span>${trp(openAssigned(`p:${p.id}`), '{n} offene Aufgabe', '{n} offene Aufgaben')}</span></div></div>
          <div class="actions"><button class="btn ghost icon" data-action="editPerson" data-id="${p.id}" title="${tr('Bearbeiten')}">✎</button>
            <button class="btn ghost icon danger" data-action="deletePerson" data-id="${p.id}" title="${tr('Löschen')}">🗑</button></div></li>`).join('')}</ul>`
          : `<div class="empty">${tr('Noch keine Personen.')}</div>`}
      </div>
      <div>
        <div class="card-head"><h3 style="margin:0">${tr('Teams ({n})', { n: data.teams.length })}</h3><button type="button" class="btn small primary" data-action="addTeam">${tr('+ Team')}</button></div>
        ${data.teams.length ? `<ul class="list">${data.teams.map((tm) => `<li><span class="dot-color" style="background:${esc(tm.color)}"></span>
          <div class="grow"><div class="title">${esc(tm.name)}</div>
            <div class="meta"><span class="assignees">${(tm.memberIds || []).map(personById).filter(Boolean).map((p) => personAvatar(p, 'small')).join('') || `<span class="muted">${tr('keine Mitglieder')}</span>`}</span>
              <span>${trp(data.projects.filter((p) => (p.teamIds || []).includes(tm.id)).length, '{n} Projekt', '{n} Projekte')}</span></div></div>
          <div class="actions"><button class="btn ghost icon" data-action="editTeam" data-id="${tm.id}" title="${tr('Bearbeiten')}">✎</button>
            <button class="btn ghost icon danger" data-action="deleteTeam" data-id="${tm.id}" title="${tr('Löschen')}">🗑</button></div></li>`).join('')}</ul>`
          : `<div class="empty">${tr('Noch keine Teams.')}</div>`}
      </div>
    </div>`;
}
const openAssigned = (key) => data.tasks.filter((t) => !t.done && (t.assignees || []).includes(key)).length;

function personForm(p) {
  const isNew = !p;
  p = p || { color: COLORS[data.people.length % COLORS.length] };
  openForm({
    title: isNew ? tr('Neue Person') : tr('Person bearbeiten'),
    fields: [
      { name: 'name', label: tr('Name'), required: true, value: p.name, half: true },
      { name: 'short', label: tr('Kürzel'), value: p.short, placeholder: tr('z. B. AB'), hint: tr('Leer = Anfangsbuchstaben'), half: true },
      { name: 'email', label: tr('E-Mail (optional)'), type: 'email', value: p.email, hint: tr('Wird später für die Einladung mit eigenem Login verwendet.') },
      ...(data.teams.length ? [{ name: 'teamIds', label: tr('Teams'), type: 'checks', value: teamsOf(p.id).map((tm) => tm.id), options: data.teams.map((tm) => ({ value: tm.id, html: teamBadge(tm) })) }] : []),
      { name: 'color', label: tr('Farbe'), type: 'color', value: p.color },
    ],
    onSubmit(v) {
      const short = (v.short || '').slice(0, 3).toUpperCase();
      const person = isNew ? { id: uid(), createdAt: new Date().toISOString(), accountId: null } : p;
      Object.assign(person, { name: v.name, short, email: v.email || '', color: v.color });
      if (isNew) data.people.push(person);
      if (v.teamIds) data.teams.forEach((tm) => {
        const set = new Set(tm.memberIds || []);
        if (v.teamIds.includes(tm.id)) set.add(person.id); else set.delete(person.id);
        tm.memberIds = [...set];
      });
      commit();
    },
  });
}

function teamForm(tm) {
  const isNew = !tm;
  tm = tm || { color: COLORS[(data.teams.length + 3) % COLORS.length], memberIds: [] };
  openForm({
    title: isNew ? tr('Neues Team') : tr('Team bearbeiten'),
    fields: [
      { name: 'name', label: tr('Name'), required: true, value: tm.name, placeholder: tr('z. B. Marketing') },
      { name: 'memberIds', label: tr('Mitglieder'), type: 'checks', value: tm.memberIds || [],
        options: data.people.map((p) => ({ value: p.id, html: `${personAvatar(p, 'small')} ${esc(p.name)}` })),
        hint: data.people.length ? '' : tr('Lege zuerst Personen an – oder später über „Person bearbeiten“.') },
      { name: 'color', label: tr('Farbe'), type: 'color', value: tm.color },
    ],
    onSubmit(v) {
      if (isNew) data.teams.push({ id: uid(), createdAt: new Date().toISOString(), name: v.name, color: v.color, memberIds: v.memberIds });
      else Object.assign(tm, { name: v.name, color: v.color, memberIds: v.memberIds });
      commit();
    },
  });
}

/** Zuweisungen entfernen (beim Löschen von Personen oder Teams) */
function unassign(key) {
  [...data.tasks, ...data.milestones].forEach((x) => { if (x.assignees?.includes(key)) x.assignees = x.assignees.filter((a) => a !== key); });
}

Object.assign(actions, {
  addPerson() { personForm(null); },
  editPerson({ id }) { personForm(personById(id)); },
  deletePerson({ id }) {
    const p = personById(id);
    if (!p || !confirm(tr('„{name}“ löschen? Die Person wird aus allen Teams und Zuweisungen entfernt.', { name: p.name }))) return;
    data.people = data.people.filter((x) => x.id !== id);
    data.teams.forEach((tm) => { tm.memberIds = (tm.memberIds || []).filter((m) => m !== id); });
    unassign(`p:${id}`);
    try { if (localStorage.getItem(ME_KEY) === id) localStorage.removeItem(ME_KEY); } catch { /* ignorieren */ }
    commit();
  },
  addTeam() { teamForm(null); },
  editTeam({ id }) { teamForm(teamById(id)); },
  deleteTeam({ id }) {
    const tm = teamById(id);
    if (!tm || !confirm(tr('Team „{name}“ löschen? Die Personen bleiben erhalten.', { name: tm.name }))) return;
    data.teams = data.teams.filter((x) => x.id !== id);
    data.projects.forEach((p) => { if (p.teamIds) p.teamIds = p.teamIds.filter((x) => x !== id); });
    unassign(`t:${id}`);
    commit();
  },
  setWhoFilter({ id }) { taskWhoFilter = id; render(); },
  showMyTasks() {
    const cfg = structuredClone(dashboardConfig());
    const w = cfg.widgets.find((x) => x.id === 'myTasks');
    w.visible = true;
    // direkt hinter „Heute“ bzw. an den Anfang
    cfg.widgets = [...cfg.widgets.filter((x) => x !== w)];
    const i = cfg.widgets.findIndex((x) => x.id === 'today');
    cfg.widgets.splice(i >= 0 ? i + 1 : 0, 0, w);
    data.settings.dashboard = cfg;
    commit();
    toast(tr('🙋 „Meine Aufgaben“ wird jetzt auf der Übersicht angezeigt.'));
  },
});
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-me-select]')) return;
  try { if (e.target.value) localStorage.setItem(ME_KEY, e.target.value); else localStorage.removeItem(ME_KEY); } catch { /* ignorieren */ }
  render();
});
// Link „Team einrichten“: Bereich in den Einstellungen gleich öffnen
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-open-section]');
  if (a) { openSections = new Set([a.dataset.openSection]); rememberSections(); }
});

/* ---------------------------- Dokumente (Verweise) ----------------------- */
/* Verweise auf Dateien und Seiten – z. B. iCloud, OneDrive, Google Drive, Dropbox, Notion.
   Es werden nur Links gespeichert, keine Dateien (Uploads folgen mit eigenem Server). */

/** Nur sichere Link-Arten zulassen; „www.…“ bzw. „beispiel.de/…“ wird zu https:// ergänzt */
function safeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(u) ? `https://${u}` : u;
  try {
    const url = new URL(u);
    return ['http:', 'https:', 'mailto:', 'file:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Symbol und Dienst anhand des Links */
function docInfo(url) {
  let host = '', path = '';
  try { const x = new URL(url); host = x.hostname.replace(/^www\./, ''); path = x.pathname.toLowerCase(); if (x.protocol === 'mailto:') return { icon: '✉️', name: 'E-Mail' }; if (x.protocol === 'file:') host = ''; } catch { return { icon: '🔗', name: '' }; }
  const ext = (path.match(/\.([a-z0-9]{2,5})$/) || [])[1];
  const byExt = { pdf: ['📕', 'PDF'], doc: ['📘', 'Word'], docx: ['📘', 'Word'], xls: ['📗', 'Excel'], xlsx: ['📗', 'Excel'], csv: ['📗', 'CSV'], ppt: ['📙', 'PowerPoint'], pptx: ['📙', 'PowerPoint'], pages: ['📘', 'Pages'], numbers: ['📗', 'Numbers'], key: ['📙', 'Keynote'], png: ['🖼️', ''], jpg: ['🖼️', ''], jpeg: ['🖼️', ''], gif: ['🖼️', ''], heic: ['🖼️', ''], zip: ['🗜️', 'ZIP'], txt: ['📄', ''], md: ['📄', ''] };
  const services = [
    [/docs\.google\.com$/, path.includes('/spreadsheets') ? '📗' : path.includes('/presentation') ? '📙' : '📘', 'Google Docs'],
    [/drive\.google\.com$/, '🗂️', 'Google Drive'], [/icloud\.com$/, '☁️', 'iCloud'],
    [/(onedrive\.live\.com|1drv\.ms)$/, '☁️', 'OneDrive'], [/sharepoint\.com$/, '🟦', 'SharePoint'],
    [/dropbox\.com$/, '📦', 'Dropbox'], [/notion\.(so|site)$/, '📓', 'Notion'], [/figma\.com$/, '🎨', 'Figma'],
    [/miro\.com$/, '🧠', 'Miro'], [/github\.com$/, '🐙', 'GitHub'], [/(youtube\.com|youtu\.be)$/, '▶️', 'YouTube'],
    [/trello\.com$/, '📋', 'Trello'], [/canva\.com$/, '🎨', 'Canva'],
  ];
  const svc = services.find(([re]) => re.test(host));
  if (ext && byExt[ext]) return { icon: byExt[ext][0], name: svc ? svc[2] : byExt[ext][1] || host };
  if (svc) return { icon: svc[1], name: svc[2] };
  return { icon: host ? '🔗' : '📄', name: host || tr('Datei') };
}

function docLink(d) {
  const url = safeUrl(d.url);
  const info = docInfo(url || '');
  const title = d.title || url || '–';
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="doc-link">${info.icon} ${esc(title)}</a>` : `<span class="doc-link">🔗 ${esc(title)}</span>`;
}

/** Kleine Link-Chips an Aufgaben und Meilensteinen */
function docChips(docs, block = false) {
  if (!docs.length) return '';
  const shown = docs.slice(0, 3).map((d) => docLink(d)).join('');
  return `<${block ? 'div' : 'span'} class="doc-chips">${shown}${docs.length > 3 ? `<a class="doc-more" href="#/projekt/${docs[0].projectId}/dokumente">+${docs.length - 3}</a>` : ''}</${block ? 'div' : 'span'}>`;
}

function docRow(d, { compact = false } = {}) {
  const url = safeUrl(d.url);
  const info = docInfo(url || '');
  const task = d.taskId ? data.tasks.find((t) => t.id === d.taskId) : null;
  const ms = d.milestoneId ? data.milestones.find((m) => m.id === d.milestoneId) : null;
  return `<li>
    <span class="doc-ico" aria-hidden="true">${info.icon}</span>
    <div class="grow">
      <div class="title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(d.title || url)}</a>` : esc(d.title || d.url)}</div>
      <div class="meta">${info.name ? `<span>${esc(info.name)}</span>` : ''}
        ${task ? `<span>✅ ${esc(task.title)}</span>` : ''}${ms ? `<span>🏁 ${esc(ms.title)}</span>` : ''}
        ${!compact && d.note ? `<span>${esc(d.note)}</span>` : ''}</div>
    </div>
    ${compact ? '' : `<div class="actions">
      <button class="btn ghost icon" data-action="editDoc" data-id="${d.id}" title="${tr('Bearbeiten')}">✎</button>
      <button class="btn ghost icon danger" data-action="deleteDoc" data-id="${d.id}" title="${tr('Löschen')}">🗑</button>
    </div>`}
  </li>`;
}

function projectDocs(p) {
  const docs = data.docs.filter((d) => d.projectId === p.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const general = docs.filter((d) => !d.taskId && !d.milestoneId);
  const linked = docs.filter((d) => d.taskId || d.milestoneId);
  return `<section class="card">
    <div class="card-head"><h2>📎 ${tr('Dokumente')}</h2><button class="btn primary small" data-action="addDoc" data-id="${p.id}">${tr('+ Dokument')}</button></div>
    <p class="small muted">${tr('Verweise auf Dateien und Seiten, die zum Projekt gehören – z. B. aus iCloud, OneDrive, SharePoint, Google Drive, Dropbox oder Notion. Gespeichert wird nur der Link; die Datei bleibt, wo sie ist. Tipp: In der Cloud-App „Link teilen“ bzw. „Link kopieren“ wählen und hier einfügen.')}</p>
    ${docs.length ? `
      ${general.length ? `<h3 class="task-group">${tr('Zum Projekt')} <span class="muted small">${general.length}</span></h3><ul class="list doc-list">${general.map((d) => docRow(d)).join('')}</ul>` : ''}
      ${linked.length ? `<h3 class="task-group">${tr('Zu Aufgaben & Meilensteinen')} <span class="muted small">${linked.length}</span></h3><ul class="list doc-list">${linked.map((d) => docRow(d)).join('')}</ul>` : ''}`
      : `<div class="empty">${tr('Noch keine Dokumente verknüpft.')}</div>`}
  </section>`;
}

function docForm(d) {
  const isNew = !d.id;
  const pid = d.projectId;
  const opts = [{ value: '', label: tr('Projekt allgemein') }];
  sortMilestonesOf(pid).forEach((m) => opts.push({ value: `m:${m.id}`, label: `🏁 ${m.title}` }));
  sortTasks(data.tasks.filter((t) => t.projectId === pid)).forEach((t) => opts.push({ value: `t:${t.id}`, label: `✅ ${t.title}${t.done ? ' ✓' : ''}` }));
  const current = d.taskId ? `t:${d.taskId}` : d.milestoneId ? `m:${d.milestoneId}` : '';
  openForm({
    title: isNew ? tr('Dokument verknüpfen') : tr('Dokument bearbeiten'),
    fields: [
      { name: 'url', label: tr('Link'), required: true, value: d.url, placeholder: 'https://…',
        hint: tr('Freigabe-Link aus iCloud, OneDrive, Google Drive, Dropbox … oder eine beliebige Webadresse.') },
      { name: 'title', label: tr('Titel'), value: d.title, placeholder: tr('z. B. Angebot Druckerei'), hint: tr('Leer = wird aus dem Link übernommen.') },
      { name: 'link', label: tr('Gehört zu'), type: 'select', options: opts, value: current },
      { name: 'note', label: tr('Notiz'), type: 'textarea', value: d.note },
    ],
    onSubmit(v) {
      const url = safeUrl(v.url);
      if (!url) return tr('Bitte einen gültigen Link angeben (z. B. https://…).');
      let title = v.title;
      if (!title) {
        try { const x = new URL(url); title = decodeURIComponent(x.pathname.split('/').filter(Boolean).pop() || '') || x.hostname.replace(/^www\./, ''); } catch { title = url; }
        // lange IDs und allgemeine Wörter aus Cloud-Links (…/edit, …/view) durch den Dienstnamen ersetzen
        if (title.length > 60 || /^[\w-]{20,}$/.test(title) || /^(edit|view|preview|open|share|sharing|index\.html?|s)$/i.test(title)) title = docInfo(url).name || title;
      }
      const out = { url, title, note: v.note || '', taskId: v.link.startsWith('t:') ? v.link.slice(2) : null, milestoneId: v.link.startsWith('m:') ? v.link.slice(2) : null };
      if (isNew) data.docs.push({ id: uid(), projectId: pid, createdAt: new Date().toISOString(), ...out });
      else Object.assign(d, out);
      commit();
      if (isNew) toast(tr('📎 Dokument verknüpft'));
    },
  });
}

Object.assign(actions, {
  addDoc({ id, task, ms }) { docForm({ projectId: id, taskId: task || null, milestoneId: ms || null }); },
  editDoc({ id }) { const d = data.docs.find((x) => x.id === id); if (d) docForm(d); },
  deleteDoc({ id }) {
    if (!confirm(tr('Verweis auf das Dokument entfernen? Die Datei selbst bleibt unverändert.'))) return;
    data.docs = data.docs.filter((d) => d.id !== id);
    commit();
  },
});

/* ------------------------------------------------------------------------
   Sprache: automatisch (Gerät) oder fest aus den Einstellungen
   ------------------------------------------------------------------------ */
let appliedLang = null;
function applyLanguage() {
  const want = detectLang(data.settings.language);
  if (want === appliedLang) return;
  setLang(data.settings.language);
  appliedLang = LANG;
  // Feste Texte im Rahmen (index.html): data-i18n = Text, data-i18n-title/-aria = Attribute
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = tr(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', tr(el.dataset.i18nAria)); });
  document.querySelector('meta[name="description"]')?.setAttribute('content', tr('Persönlicher Projekttracker für Zeit, Investitionen, Meilensteine und Aufgaben – mit Motivationshilfen.'));
  if (!data.timer) document.title = BRAND;
  applyShortcutHint();
  updateSideToggle();
}
// Gerätesprache geändert (z. B. in den Systemeinstellungen) → bei „Automatisch“ übernehmen
window.addEventListener('languagechange', () => render());

render();
initServer();
initFolderBackup();
loadMusicFile();
setTimeout(checkWhatsNew, 800);
