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
  - jeder Eintrag mit **Titel** und **Beschreibung**. Ohne Titel werden Wochentag und Datum verwendet, z. B. „Montag, 16.11.2026“.
- 💶 **Investitionen** mit Kategorie, Budgetvergleich und Aufteilung nach Kategorien
- 🏁 **Meilensteine** mit Zieldatum. Aufgaben lassen sich einem Meilenstein zuordnen.
- ✅ **Aufgaben** mit Priorität, Fälligkeitsdatum und Notiz
  - **Unterpunkte** zum Abhaken. Die Aufgabe ist erst fertig, wenn alle Unterpunkte erledigt sind.
- 📝 **Logbuch** für Ideen, Entscheidungen und kleine Erfolge

**Darstellung**
- Hintergrund **hell, dunkel oder wie das Gerät** (Einstellungen › Darstellung)
- **Akzentfarbe** frei wählbar (Vorschläge oder eigene Farbe). Abgeleitete Töne werden automatisch angepasst und bleiben in beiden Modi lesbar.

**Übersicht & Motivation**
- **Anpassbare Übersicht** (⚙️ Anpassen): Bereiche ein- und ausblenden, Reihenfolge ändern, halbe oder volle Breite, Kennzahlen-Kacheln auswählen. Zusätzliche Bereiche: fällige Aufgaben, Zeit je Projekt, Stunden pro Woche, letzte Aktivitäten, Projektkacheln.
- Dashboard mit Wochenstunden, Wochenziel, Streak, offenen bzw. überfälligen Aufgaben und Investitionen
- **„Braucht Aufmerksamkeit“**: aktive Projekte ohne Aktivität seit X Tagen werden gelb, ab 2·X Tagen rot markiert
- **Motivationsbanner**: zeigt das am längsten ruhende Projekt mit deinem *Warum*, dem kleinsten nächsten Schritt und einem „Nur 25 Minuten“-Timer
- **Nächste Schritte**: die wichtigste offene Aufgabe jedes aktiven Projekts
- Aktivitäts-Heatmap (12 Wochen) und Stunden-pro-Woche-Diagramm je Projekt
- Konfetti und Erfolgsmeldungen, wenn du Meilensteine erreichst oder Projekte abschließt

## Daten & mehrere Geräte (iCloud)

Alle Daten liegen im `localStorage` des Browsers, also nur auf dem jeweiligen Gerät.
Zwischen Geräten wechselst du über eine **Sicherungsdatei in iCloud Drive**:

> **Beim Aufhören sichern (💾), beim Anfangen importieren.**

Der Tracker erinnert dich daran:
- 💾-Knopf mit orangefarbenem Punkt und **gelbe Leiste**, solange es ungesicherte Änderungen gibt
- **Rückfrage beim Schließen** von Tab oder Browser (Safari auf dem Mac, Edge unter Windows). Die Browser zeigen dabei nur ihren Standardtext („Seite verlassen?“), eigener Text ist technisch nicht möglich. Auf **iPhone und iPad** unterstützt Safari diese Rückfrage nicht, dort übernimmt die gelbe Leiste die Erinnerung.
- **Blaue Leiste beim Öffnen**, wenn das Gerät länger als 4 Stunden nicht benutzt wurde: Sie erinnert daran, zuerst die neueste Sicherung zu importieren.
- Beim Import warnt der Tracker, wenn die Daten auf dem Gerät ungesicherte Änderungen enthalten oder neuer als die Sicherung sind.

Die Schritt-für-Schritt-Einrichtung für iPhone, iPad, Mac und Windows (Download-Ordner auf *iCloud Drive › Downloads*) steht in der App unter **Einstellungen**.

Wichtig für iPhone und iPad: Füge den Tracker über *Teilen › Zum Home-Bildschirm* hinzu und öffne ihn darüber. Sonst kann Safari die gespeicherten Daten nach 7 Tagen ohne Besuch löschen.

Außerdem kannst du Zeiten und Investitionen als **CSV** exportieren (z. B. für Excel).

## Online stellen

Damit du den Tracker auf iPhone und iPad öffnen kannst, muss er eine Internetadresse haben, z. B. über **GitHub Pages**. Bei einem privaten Repository ist dafür GitHub Pro nötig. Alternativ machst du das Repository öffentlich oder lädst den Ordner bei einem kostenlosen Dienst wie Netlify oder Cloudflare Pages hoch.
Deine Projektdaten sind dabei **nicht** öffentlich, sie bleiben im Browser des jeweiligen Geräts.

## Technik

Reines HTML, CSS und JavaScript (`index.html`, `styles.css`, `app.js`) ohne Abhängigkeiten oder Build-Schritt.
