# 🚀 Projekttracker

Ein persönlicher Projekttracker für Zeit, Investitionen, Meilensteine und Aufgaben. Er soll dich außerdem motivieren, an deinen Projekten dranzubleiben.

Er läuft komplett im Browser, ohne Installation, Server oder Konto.

## Starten

`index.html` im Browser öffnen (Doppelklick genügt).
Beim ersten Start kannst du **Beispieldaten** laden und alles ausprobieren. Unter *Einstellungen → Alle Daten löschen* entfernst du sie wieder.

## Funktionen

**Projekte**
- Name, Beschreibung, Kategorie, Farbe, Status (Idee / Aktiv / Pausiert / Abgeschlossen)
- **„Warum ist mir das wichtig?“** und **Zieldefinition**
- Geplante Stunden, Budget und Zieltermin mit Fortschrittsbalken

**Erfassen**
- ⏱ **Zeit**: per Timer (läuft im Hintergrund weiter, auch nach einem Neuladen) oder manuell (`1:30`, `1,5`, `45 min`)
- 💶 **Investitionen** mit Kategorie, Budgetvergleich und Aufteilung nach Kategorien
- 🏁 **Meilensteine** mit Zieldatum. Aufgaben lassen sich einem Meilenstein zuordnen.
- ✅ **Aufgaben** mit Priorität, Fälligkeitsdatum und Notiz
- 📝 **Logbuch** für Ideen, Entscheidungen und kleine Erfolge

**Übersicht & Motivation**
- Dashboard mit Wochenstunden, Wochenziel, Streak, offenen bzw. überfälligen Aufgaben und Investitionen
- **„Braucht Aufmerksamkeit“**: aktive Projekte ohne Aktivität seit X Tagen werden gelb, ab 2·X Tagen rot markiert
- **Motivationsbanner**: zeigt das am längsten ruhende Projekt mit deinem *Warum*, dem kleinsten nächsten Schritt und einem „Nur 25 Minuten“-Timer
- **Nächste Schritte**: die wichtigste offene Aufgabe jedes aktiven Projekts
- Aktivitäts-Heatmap (12 Wochen) und Stunden-pro-Woche-Diagramm je Projekt
- Konfetti und Erfolgsmeldungen, wenn du Meilensteine erreichst oder Projekte abschließt

## Daten & Backup

Alle Daten liegen im `localStorage` deines Browsers, also nur auf diesem Gerät und in diesem Browser.
Unter **Einstellungen** kannst du:
- ein **JSON-Backup exportieren und importieren**, etwa um es auf ein anderes Gerät zu übertragen
- Zeiten und Investitionen als **CSV** exportieren (z. B. für Excel)

> Tipp: Exportiere regelmäßig ein Backup. Wenn du die Browserdaten löschst, ist auch der Tracker leer.

## Technik

Reines HTML, CSS und JavaScript (`index.html`, `styles.css`, `app.js`) ohne Abhängigkeiten oder Build-Schritt. Dunkler Modus folgt der Systemeinstellung.
