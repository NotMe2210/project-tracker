'use strict';

/* =========================================================================
   Sprachen – Deutsch ist die Ausgangssprache (Texte im Code), weitere
   Sprachen liegen als Wörterbuch in lang-xx.js (Schlüssel = deutscher Text).
   Neue Sprache: lang-xx.js nach dem Muster von lang-en.js anlegen, in
   index.html einbinden und unten in LANGUAGES ergänzen.
   ========================================================================= */

const LANGUAGES = [
  // [Code, Name in der eigenen Sprache]
  ['de', 'Deutsch'],
  ['en', 'English'],
];
const I18N = {}; // { en: { 'Deutscher Text': 'English text' } }

let LANG = 'de';
let LOCALE = 'de-DE';
const i18nMissing = new Set();

/** Übersetzt einen deutschen Text in die aktuelle Sprache. Platzhalter: {name} → vars.name */
function tr(s, vars) {
  let out = s;
  if (LANG !== 'de') {
    const hit = I18N[LANG]?.[s];
    if (hit !== undefined) out = hit;
    else if (!i18nMissing.has(s)) { i18nMissing.add(s); console.warn('[i18n] fehlt:', s); }
  }
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}

/** Einzahl/Mehrzahl: trp(n, '{n} Tag', '{n} Tage') */
function trp(n, one, other, vars = {}) {
  return tr(n === 1 ? one : other, { n, ...vars });
}

const supportedLang = (code) => LANGUAGES.some(([c]) => c === code);

/** Sprache bestimmen: feste Wahl aus den Einstellungen oder automatisch nach der Gerätesprache. */
function detectLang(pref) {
  if (pref && pref !== 'auto' && supportedLang(pref)) return pref;
  for (const l of navigator.languages || [navigator.language || 'de']) {
    const base = String(l).slice(0, 2).toLowerCase();
    if (supportedLang(base)) return base;
  }
  return 'en'; // nicht unterstützte Gerätesprache: Englisch
}

function setLang(pref) {
  const lang = detectLang(pref);
  LANG = lang;
  // Datums-/Zahlenformat: passende Gerätevariante der Sprache (z. B. en-US), sonst Standard
  const device = (navigator.languages || []).find((x) => x.toLowerCase().split('-')[0] === lang);
  LOCALE = device || { de: 'de-DE', en: 'en-GB' }[lang] || lang;
  document.documentElement.lang = lang;
  return lang;
}
