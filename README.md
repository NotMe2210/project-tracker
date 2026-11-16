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
- Geplante Gesamtstunden, Budget und Zieltermin mit Fortschrittsbalken
- **Wochenarbeitszeit pro Projekt.** Die Summe aller aktiven Projekte ergibt das Wochenziel. Ohne Projekt-Wochenzeiten gilt das Standard-Wochenziel aus den Einstellungen.

**Erfassen**
- ⏱ **Zeit**: per Stoppuhr (läuft im Hintergrund weiter, auch nach einem Neuladen) oder manuell (`1:30`, `1,5`, `45 min`)
  - 🍅 **Pomodoro-Timer**: 25 Min Fokus, 5 Min Pause, lange Pause nach jedem 4. Pomodoro (alles einstellbar). Mit Pausieren, Überspringen, Ton und Mitteilung. Beim Beenden wird die reine Fokuszeit als Zeiteintrag gespeichert.
  - jeder Eintrag mit **Titel** und **Beschreibung**. Ohne Titel werden Wochentag und Datum verwendet, z. B. „Montag, 16.11.2026“.
- 💶 **Investitionen** mit frei wählbarer Kategorie (Vorschläge oder eigene), Budgetvergleich und Aufteilung nach Kategorien
- 🏁 **Meilensteine** mit Zieldatum. Aufgaben lassen sich einem Meilenstein zuordnen.
- ✅ **Aufgaben** mit Priorität, Fälligkeitsdatum und Notiz
  - **Unterpunkte** zum Abhaken. Die Aufgabe ist erst fertig, wenn alle Unterpunkte erledigt sind.
- 📝 **Logbuch** für Ideen, Entscheidungen und kleine Erfolge

**Darstellung**
- Hintergrund **hell, dunkel oder wie das Gerät** (Einstellungen › Darstellung)
- **Akzentfarbe** frei wählbar (Vorschläge oder eigene Farbe). Abgeleitete Töne werden automatisch angepasst und bleiben in beiden Modi lesbar.

**Übersicht & Motivation**
- 🔥 **Animierter Motivationsbereich:** warmes, langsam pulsierendes Glühen (je länger die Serie, desto kräftiger) und ein pulsierender grüner Wochenziel-Balken, wählbar unter Einstellungen › Darstellung
- ☀️ **Heute:** bis zu 3 Vorschläge für den Tag (fällige Aufgaben, ruhendes Projekt, Rest zum Wochenziel, nahender Meilenstein) mit direktem Start
- ⋯ **Schnellaktionen** pro Projekt (Pomodoro, Stoppuhr, Zeit, Aufgabe, Notiz, Status) in Tabelle, Kacheln und „Braucht Aufmerksamkeit“
- **Klickbare Diagramme:** Tag bzw. Woche anklicken öffnet die Einträge (mit Bearbeiten). Projekte in der Legende ein- und ausblenden.
- 📈 **Verlaufslinien** in den Kennzahlen (Wochen bzw. Monate)
- 🏅 **Erfolge:** 18 Abzeichen (Stunden, Serien, Pomodoros, Aufgaben, Meilensteine …) mit Fortschritt. Neue Erfolge werden gefeiert.
- 🔎 **Befehlspalette** am Computer mit ⌘K bzw. Strg+K: Seiten, Projekte, Pomodoro, Zeit, Aufgaben, Darstellung …
- 👆 **Wischgesten** auf dem iPhone: Aufgabe nach rechts wischen = erledigt, nach links = Optionen
- **Anpassbare Übersicht und Projektansicht** direkt auf der Seite (⚙️ Anpassen bzw. ✏️ Ansicht anpassen): Bereiche per **Drag-and-drop** am ⠿-Griff verschieben (Maus, Finger oder Pfeiltasten) mit sofortiger Vorschau, Breite ◧ Halb / ▭ Voll, ausblenden ✕, wieder einblenden, Kennzahlen-Kacheln wählen. Die Projektansicht gilt wahlweise **für alle Projekte** oder **nur für ein Projekt**. Zusätzliche Bereiche: fällige Aufgaben, Zeit je Projekt, Stunden pro Woche (gestapelt nach Projekt), letzte Aktivitäten, Projektkacheln, offene Aufgaben, Investitionen nach Kategorie.
- Dashboard mit Wochenstunden, Wochenziel, Streak, offenen bzw. überfälligen Aufgaben und Investitionen
- **„Braucht Aufmerksamkeit“**: aktive Projekte ohne Aktivität seit X Tagen werden gelb, ab 2·X Tagen rot markiert
- **Motivationsbanner**: zeigt das am längsten ruhende Projekt mit deinem *Warum*, dem kleinsten nächsten Schritt und einem „Nur 25 Minuten“-Timer
- **Nächste Schritte**: die wichtigste offene Aufgabe jedes aktiven Projekts
- Aktivitäts-Heatmap (12 Wochen): Überfahren bzw. Antippen eines Tages zeigt, was an diesem Tag erledigt wurde (Zeiten, Aufgaben, Unterpunkte, Meilensteine, Investitionen, Notizen)
- Stunden-pro-Woche-Diagramm je Projekt
- Konfetti und Erfolgsmeldungen, wenn du Meilensteine erreichst oder Projekte abschließt

## Daten & mehrere Geräte

Alle Daten liegen im `localStorage` des Browsers, also nur auf dem jeweiligen Gerät.
Zwischen Geräten wechselst du über eine **Sicherungsdatei** in deinem Cloud-Speicher (**iCloud Drive, OneDrive, Google Drive, Dropbox**) oder ohne Cloud per AirDrop, USB-Stick oder E-Mail:

> **Beim Aufhören sichern (💾), beim Anfangen importieren.**

Der Tracker erinnert dich daran:
- 💾-Knopf mit orangefarbenem Punkt und **gelbe Leiste**, solange es ungesicherte Änderungen gibt
- **Rückfrage beim Schließen** von Tab oder Browser (Safari auf dem Mac, Edge unter Windows). Die Browser zeigen dabei nur ihren Standardtext („Seite verlassen?“), eigener Text ist technisch nicht möglich. Auf **iPhone und iPad** unterstützt Safari diese Rückfrage nicht, dort übernimmt die gelbe Leiste die Erinnerung.
- **Blaue Leiste beim Öffnen**, wenn das Gerät länger als 4 Stunden nicht benutzt wurde: Sie erinnert daran, zuerst die neueste Sicherung zu importieren.
- Beim Import warnt der Tracker, wenn die Daten auf dem Gerät ungesicherte Änderungen enthalten oder neuer als die Sicherung sind.

Die Schritt-für-Schritt-Anleitung steht in der App unter **Einstellungen › Zwischen Geräten wechseln**. Dort wählst du deinen Dienst und siehst die Schritte für iPhone/iPad, Mac, Windows und Android. Der Trick: Auf allen Geräten wird ein Ordner im Cloud-Speicher als Download-Ordner eingestellt, dann landet jede Sicherung automatisch dort.

Wichtig für iPhone und iPad: Füge den Tracker über *Teilen › Zum Home-Bildschirm* hinzu und öffne ihn darüber. Sonst kann Safari die gespeicherten Daten nach 7 Tagen ohne Besuch löschen.

Außerdem kannst du Zeiten und Investitionen als **CSV** exportieren (z. B. für Excel).

## Online stellen

Damit du den Tracker auf iPhone und iPad öffnen kannst, muss er eine Internetadresse haben, z. B. über **GitHub Pages**. Bei einem privaten Repository ist dafür GitHub Pro nötig. Alternativ machst du das Repository öffentlich oder lädst den Ordner bei einem kostenlosen Dienst wie Netlify oder Cloudflare Pages hoch.
Deine Projektdaten sind dabei **nicht** öffentlich, sie bleiben im Browser des jeweiligen Geräts.

## Technik

Reines HTML, CSS und JavaScript (`index.html`, `styles.css`, `app.js`) ohne Abhängigkeiten oder Build-Schritt.

### Updates & Cache

Browser und GitHub Pages speichern Dateien zwischen. Damit Änderungen sicher ankommen:
- `index.html` lädt `styles.css` und `app.js` mit Versionsnummer (`?v=…`).
- Die App fragt beim Öffnen `version.json` am Cache vorbei ab und zeigt bei einer neuen Version die Leiste **„Neue Version verfügbar – Jetzt aktualisieren“**. Die Daten bleiben dabei erhalten.
- **Vor jeder Veröffentlichung** `./bump-version.sh` ausführen. Es erhöht die Versionsnummer in `index.html`, `app.js` und `version.json`.
