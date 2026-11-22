# Protrac by R3DO

**Protrac** ist ein persönlicher Projekttracker für Zeit, Investitionen, Meilensteine und Aufgaben. Er soll dich außerdem motivieren, an deinen Projekten dranzubleiben.

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
- 📋 **Vorlagen:** Beim Anlegen eine Vorlage wählen (mitgeliefert: Lernprojekt, Website, Veranstaltung) oder eigene Vorlagen aus bestehenden Projekten speichern (⋯ › *Als Vorlage speichern*). Vorlagen enthalten Meilensteine, Aufgaben mit Unterpunkten, Schätzungen und Abhängigkeiten sowie Dokument-Verweise, aber keine Zeiten oder Beträge. Verwalten unter *Einstellungen › Projektvorlagen*.
- ⧉ **Duplizieren** (⋯ › *Projekt duplizieren*): kopiert Meilensteine, Aufgaben und Dokument-Verweise. Alle Termine werden relativ zum gewählten neuen Projektstart verschoben.
- 🗄️ **Archiv** (⋯ › *Archivieren*): Archivierte Projekte verschwinden aus Übersicht, Listen, Auswahlfeldern und Suche, zählen aber weiter für Statistiken und Erfolge. Sie bleiben unter *Projekte › Archiv* erreichbar und lassen sich wiederherstellen.

**Erfassen**
- ⏱ **Zeit**: per Stoppuhr (läuft im Hintergrund weiter, auch nach einem Neuladen) oder manuell (`1:30`, `1,5`, `45 min`)
  - **Pausieren** mit ⏸ neben „Stopp“. Solange der Timer pausiert ist, liegt ein Hinweis über dem ganzen Fenster, mit „Fortsetzen“ oder „Beenden & Zeit speichern“. So vergisst du das Weiterlaufenlassen nicht. Die Pausenzeit wird nicht mitgezählt.
  - 🔔 **Erinnerungston:** Solange ein Timer läuft, erinnert alle 15 Minuten ein kurzer, leiser Doppel-Ton daran (einstellbar: jede Minute, alle 5, 10, 15, 30 oder 60 Minuten oder aus, unter *Einstellungen › Timer & Pomodoro*). Pausen und Pomodoro-Pausen bleiben still; im Hintergrund kommt zusätzlich eine Mitteilung, wenn erlaubt. Auf iPhone/iPad hält Safari Webseiten im Hintergrund an, dort ertönt er nur bei geöffneter App.
  - 🎵 **Musik statt Ton** (*Einstellungen › Timer & Pomodoro › Klang, solange ein Timer läuft*):
    - **Eigene Musikdatei** (MP3, M4A, WAV, OGG bis 80 MB): bleibt nur im Browser des Geräts, läuft in Dauerschleife, ist nicht Teil der Sicherung.
    - **Internetradio / Audio-Link**: direkte Stream-Adresse, z. B. `https://…/stream.mp3`. Playlist-Dateien (.m3u/.pls) sowie Spotify-, YouTube- und Apple-Music-Links funktionieren nicht.
    - **Eingebaute Fokus-Klänge**: Regen, Meeresrauschen (Wellen schwellen an und ab), ruhige Klangfläche (wechselnde Akkorde mit vereinzelten Glockentönen) und Vogelgezwitscher – im Browser erzeugt, ohne Dateien, nie exakt gleich.
    - Spielt, solange Stoppuhr bzw. Pomodoro-Fokus laufen, blendet weich ein und aus und hält mit dem Timer an; optional auch in Pomodoro-Pausen. Lautstärke-Regler und *Vorhören*. Auf iPhone/iPad regeln die Gerätetasten die Lautstärke von Datei und Radio.
  - 🍅 **Pomodoro-Timer**: 25 Min Fokus, 5 Min Pause, lange Pause nach jedem 4. Pomodoro (alles einstellbar). Mit Pausieren, Überspringen, Ton und Mitteilung. Beim Beenden wird die reine Fokuszeit als Zeiteintrag gespeichert.
  - jeder Eintrag mit **Titel** und **Beschreibung**. Ohne Titel werden Wochentag und Datum verwendet, z. B. „Montag, 16.11.2026“.
- ⚡ **Schnelleingabe** (Taste **N**, ⚡ in Seitenleiste bzw. Kopfzeile oder über die Befehlspalette): eine Zeile mit Live-Vorschau, bleibt für weitere Einträge offen.
  - `Fotos bearbeiten #shop @fr !hoch ~2h` → Aufgabe im Projekt „Online-Shop …“, fällig Freitag, hohe Priorität, 2 Std geschätzt
  - `1:30 Produktfotos #shop` → Zeiteintrag · `12,90€ Holzleim #shop` → Investition · `+120€ Markt #shop` → Einnahme · `> Idee …` → Logbuch
  - `#name` genügt mit dem Anfang des Projektnamens. Datum: `@heute`, `@morgen`, `@fr`, `@24.12.`, `@+3`, `@+2w`. Ohne `#` landet der Eintrag im aktuellen bzw. zuletzt benutzten Projekt.
- 💶 **Investitionen** mit frei wählbarer Kategorie (Vorschläge oder eigene), Budgetvergleich und Aufteilung nach Kategorien. In der Liste nach **Monaten gruppiert**: der aktuelle Monat ist aufgeklappt, ältere Monate zeigen eingeklappt ihre Summe.
- 🏁 **Meilensteine** mit Zieldatum und optional **„Erreicht am“** (zum Nachtragen früherer Etappen). Aufgaben lassen sich einem Meilenstein zuordnen und werden beim Meilenstein aufklappbar angezeigt, dort auch direkt abhakbar. Die Reihenfolge ist wählbar: **nach Zieldatum** oder in einer **eigenen Reihenfolge** (↑ ↓).
- 💰 **Einnahmen & Gewinn/Verlust** im Reiter *Finanzen*: Einnahmen (Verkauf, Honorar, Förderung …) nach Monaten gruppiert, dazu Einnahmen, Ausgaben, **Gewinn/Verlust**, Rendite, **Ergebnis pro Stunde** und der Weg zur Gewinnschwelle. Als Kennzahl „Gewinn/Verlust“ auch in der Projektansicht wählbar.
- ✅ **Aufgaben** mit Priorität, Fälligkeitsdatum und Notiz
  - **Unterpunkte** zum Abhaken. Die Aufgabe ist erst fertig, wenn alle Unterpunkte erledigt sind.
  - 🗂️ **Kanban-Board** (Ansicht *Liste · Board*): Spalten Offen, **In Arbeit** und Erledigt, Karten per Drag-and-drop verschieben. **Unterpunkte** lassen sich auf der Karte über „☑ 1/4“ aufklappen und direkt abhaken; bei Aufgaben „In Arbeit“ sind sie schon aufgeklappt, der gewählte Zustand wird gemerkt.
  - ✏️ **Doppelklick** (bzw. doppelt antippen) auf eine Aufgabe öffnet sie direkt zum Bearbeiten – in der Liste und auf dem Board. Ein einfacher Klick auf eine Board-Karte öffnet weiterhin Status und Aktionen.
  - ⏱ **Zeit auf Aufgaben buchen:** ▶ an der Aufgabe startet den Timer dafür (Status „In Arbeit“), Zeiteinträge und Pomodoros lassen sich einer Aufgabe zuordnen. Mit **geschätztem Aufwand** zeigt das Abzeichen *gebucht / geschätzt* (rot bei Überschreitung); der Reiter *Zeit* vergleicht **Schätzung vs. Ist** und sagt, wie gut deine Schätzungen treffen.
  - 🔁 **Wiederkehrend:** täglich, werktags, wöchentlich, alle 2 Wochen, monatlich, vierteljährlich oder jährlich. Beim Abhaken entsteht automatisch die nächste Aufgabe mit neuem Fälligkeitsdatum (verpasste Termine werden übersprungen).
- 📝 **Logbuch** für Ideen, Entscheidungen und kleine Erfolge

**Sprache & Darstellung**
- 🌐 **Deutsch und Englisch.** Die Sprache richtet sich automatisch nach der Gerätesprache. Ist die Gerätesprache nicht verfügbar, gilt Englisch. Unter *Einstellungen › Darstellung › Sprache* lässt sie sich fest einstellen. Datums-, Zahlen- und Währungsformate passen sich mit an.
- Hintergrund **hell, dunkel oder wie das Gerät** (Einstellungen › Darstellung)
- 🪟 **Stil „Klassisch“ oder „Glas“** (Einstellungen › Darstellung › Stil): „Glas“ ist an Apples Liquid Glass angelehnt – durchscheinende Flächen mit Unschärfe und Glanzkante auf farbigem Hintergrund, schwebende Seiten-, Kopf- und Tab-Leiste, Knöpfe in Kapselform. Die **Transparenz** lässt sich stufenlos von deckend bis durchsichtig einstellen; ist am Gerät „Transparenz reduzieren“ aktiv, wird das Glas automatisch deckend.
- **Akzentfarbe** frei wählbar (Vorschläge oder eigene Farbe). Abgeleitete Töne werden automatisch angepasst und bleiben in beiden Modi lesbar.

**Übersicht & Motivation**
- 🔥 **Animierter Motivationsbereich:** warmes, langsam pulsierendes Glühen (je länger die Serie, desto kräftiger) und ein pulsierender grüner Wochenziel-Balken, wählbar unter Einstellungen › Darstellung
- 📝 **Wochenrückblick & Wochenplanung** (`#/woche`, über „Heute“ freitags bis montags, Kachel *Wochenfokus* oder Befehlspalette): Stunden gegen das Wochenziel, aktive Tage, erledigte Aufgaben, erreichte Meilensteine und neue Erfolge der Woche, Notizen „Was lief gut?“ / „Was hat gebremst?“ und je Projekt 1–3 **Fokus-Aufgaben** für die nächste Woche. Die Kachel **🎯 Wochenfokus** auf der Übersicht zeigt sie mit Fortschritt.
- ☀️ **Heute:** bis zu 3 Vorschläge für den Tag (fällige Aufgaben, ruhendes Projekt, Rest zum Wochenziel, nahender Meilenstein) mit direktem Start
- ⋯ **Schnellaktionen** pro Projekt (Pomodoro, Stoppuhr, Zeit, Aufgabe, Notiz, Status) in Tabelle, Kacheln und „Braucht Aufmerksamkeit“
- **Klickbare Diagramme:** Tag bzw. Woche anklicken öffnet die Einträge (mit Bearbeiten). Projekte in der Legende ein- und ausblenden.
- 📈 **Verlaufslinien** in den Kennzahlen (Wochen bzw. Monate)
- 🏅 **Erfolge:** 42 Abzeichen für Stunden, Serien, aktive Tage, Pomodoros, Aufgaben, Unterpunkte, Meilensteine, Notizen, Wochenrückblicke, Einnahmen sowie Zusammenarbeit und Dokumente (z. B. Teamplayer, Delegierer, Gemeinsam stark, Archivar), mit Fortschritt, sortiert von erreicht über Fortschritt bis offen. Neue Erfolge werden gefeiert.
- 🤫 **14 geheime Erfolge** (davon 4 rund ums Team): Name und Bedingung bleiben verborgen (🔒 ???), bis du sie zufällig erreichst. Dann werden sie mit einer eigenen Meldung enthüllt und golden hervorgehoben.
- 🔎 **Befehlspalette** am Computer mit ⌘K bzw. Strg+K: Seiten, Projekte, Pomodoro, Zeit, Aufgaben, Darstellung …
- 👆 **Wischgesten** auf dem iPhone: Aufgabe nach rechts wischen = erledigt, nach links = Optionen
- **Leerer Start mit Einführung:** Auf einem neuen Gerät beginnen Übersicht und Projektansicht leer. Eine Karte erklärt in vier Schritten, wie man Bereiche einblendet und anordnet; „Empfohlene Auswahl übernehmen“ setzt mit einem Klick die Standardauswahl. Gibt es schon eine gespeicherte Projektansicht, fragt Protrac beim Anlegen eines Projekts, ob sie übernommen oder leer gestartet werden soll. Bestehende Daten bleiben unverändert.
- **Anpassbare Übersicht und Projektansicht** direkt auf der Seite (⚙️ Anpassen bzw. ✏️ Ansicht anpassen): Bereiche per **Drag-and-drop** am ⠿-Griff verschieben (Maus, Finger oder Pfeiltasten) mit sofortiger Vorschau, Breite **¼ Viertel / ½ Halb / ¾ Dreiviertel / voll** (4-Spalten-Raster), ausblenden ✕, wieder einblenden, Kennzahlen-Kacheln wählen. **✂ Aufteilen** zerlegt die Kennzahlen in einzelne Kacheln, die sich frei anordnen lassen. Die Projektansicht gilt wahlweise **für alle Projekte** oder **nur für ein Projekt**. Zusätzliche Bereiche: fällige Aufgaben, Zeit je Projekt, Stunden pro Woche (gestapelt nach Projekt), letzte Aktivitäten, Projektkacheln, offene Aufgaben, Investitionen nach Kategorie.
- Dashboard mit Wochenstunden, Wochenziel, Streak, offenen bzw. überfälligen Aufgaben und Investitionen
- **„Braucht Aufmerksamkeit“**: aktive Projekte ohne Aktivität seit X Tagen werden gelb, ab 2·X Tagen rot markiert. Die Erinnerungen lassen sich ausschalten, ebenso die Erfolge (Einstellungen).
- **Motivationsbanner**: zeigt das am längsten ruhende Projekt mit deinem *Warum*, dem kleinsten nächsten Schritt und einem „Nur 25 Minuten“-Timer
- **Nächste Schritte**: die wichtigste offene Aufgabe jedes aktiven Projekts, darunter alle weiteren offenen Aufgaben (scrollbar)
- Aktivitäts-Heatmap (12 Wochen): Überfahren bzw. Antippen eines Tages zeigt, was an diesem Tag erledigt wurde (Zeiten, Aufgaben, Unterpunkte, Meilensteine, Investitionen, Notizen)
- Stunden-Diagramm (gesamt und je Projekt) wahlweise **pro Tag, Woche, Monat oder Jahr**
- Konfetti und Erfolgsmeldungen, wenn du Meilensteine erreichst oder Projekte abschließt

## Team, Dokumente & App

**👥 Personen & Teams** (Einstellungen › Team & Personen)
- Personen (Name, Kürzel, Farbe, optional E-Mail) und Teams mit Mitgliedern anlegen.
- Aufgaben und Meilensteine einer oder mehreren Personen bzw. Teams zuweisen (**„Zuständig“**). Die Zuständigen erscheinen als Avatar bzw. 👥-Abzeichen.
- Projekten **Projektteams** zuordnen. Deren Mitglieder stehen bei der Zuweisung oben.
- **„Das bin ich“** pro Gerät wählen. Der Bereich **🙋 Meine Aufgaben** auf der Übersicht zeigt alles, was dir direkt oder über deine Teams zugewiesen ist.
- Im Aufgaben-Reiter lässt sich nach Zuständigen filtern: Alle, Meine, Team, Person oder ohne Zuständige.

**🗓 Zeitplan & kritischer Pfad** (Projekt-Reiter *Zeitplan*)
- Aufgaben bekommen optional eine **Dauer** (Arbeitstage), einen **frühesten Start** und **Vorgänger** („startet erst, wenn … erledigt ist“). Bräuchte die Vorgänger-Auswahl mehr als zwei Zeilen (abhängig von der Fensterbreite), wird sie zum **Suchfeld mit Auswahl-Chips**: tippen zum Filtern, nach Meilenstein gruppiert, erledigte Aufgaben am Ende; ✕ oder Rücktaste entfernt. Dasselbe gilt für **„Zuständig“**.
- Protrac berechnet daraus nach der Critical-Path-Methode:
  - frühesten und spätesten Start jeder Aufgabe
  - **Puffer** jeder Aufgabe
  - den **kritischen Pfad**: die Aufgaben, die das Projektende bzw. einen Meilenstein direkt verschieben, wenn sie sich verzögern
  - **Warum kritisch?** Kritisch sind nur Aufgaben ohne Puffer (oder schon zu spät). Der Zeitplan nennt jeweils den Grund: Zieldatum des Meilensteins, Zieltermin des Projekts, ein Nachfolger oder – ohne Termine – das voraussichtliche Projektende.
- Die Rückwärtsrechnung prüft gegen das Zieldatum der Meilensteine und den Zieltermin des Projekts.
- An jeder Aufgabe stehen Planzeitraum, Puffer bzw. „kritisch“ und „wartet auf …“. Meilensteine zeigen ihre Prognose.
- **Gantt-Diagramm** im Reiter *Zeitplan*:
  - Balken je Aufgabe, gruppiert nach Meilensteinen, ◆ für Meilensteine (bei Verzug mit gestrichelter Prognose)
  - Pfeile für die Vorgänger, kritischer Pfad in Rot, Puffer als heller Balken
  - Linien für Heute und den Zieltermin, Zoom auf Tage, Wochen oder Monate
  - **Ziehen** verschiebt den Start, der **rechte Rand** ändert die Dauer, **◆ ziehen** setzt das Zieldatum, **Antippen** öffnet die Aufgabe. Nachfolger rücken automatisch mit.
  - Mit der Tastatur: Pfeiltasten verschieben, Umschalt+Pfeil ändert die Dauer, Enter bearbeitet.
  - Auf dem Smartphone: Balken erst **kurz gedrückt halten**, dann ziehen. Normales Wischen scrollt nur und verändert nichts.
- **Warnungen:** Ein gefährdeter Meilenstein erscheint unter „Heute“, zum Beispiel „voraussichtlich 2 Arbeitstage zu spät“.
- Wochenenden zählen standardmäßig nicht, das ist umstellbar. Kreisabhängigkeiten werden beim Speichern verhindert und im Zeitplan gemeldet.

**🗺️ Roadmap über alle Projekte**
- Dritte Ansicht auf der Projektseite (*Kacheln · Liste · Roadmap*) und als Bereich auf der Übersicht. Auch über die Befehlspalette erreichbar.
- Eine Zeile je Projekt:
  - Laufzeit vom ersten Eintrag bzw. geplanten Start bis zum voraussichtlichen Ende oder Zieltermin, mit Fortschritt
  - ◆ Meilensteine (rot bei Verzug, grün erreicht) und ⚑ Zieltermin
- Projekte ohne Termin enden offen (gestrichelt), pausierte erscheinen blass.
- **Warnliste** oben: Welche Meilensteine und Zieltermine laut Zeitplan wie viele Arbeitstage zu spät sind. Gefährdete Projekte sind rot umrandet.
- Zoom auf Wochen oder Monate. Ein Antippen öffnet den Zeitplan des Projekts. Die Statusfilter der Projektseite gelten auch hier.

**📎 Dokumente**
- Links zu Dateien und Seiten (iCloud, OneDrive, SharePoint, Google Drive/Docs, Dropbox, Notion, Figma …) im neuen Projekt-Reiter *Dokumente*, optional einer Aufgabe oder einem Meilenstein zugeordnet.
- Gespeichert wird nur der Link, die Datei bleibt, wo sie ist.

**📲 Als App installieren** (Einstellungen › App installieren)
- Protrac ist eine installierbare Web-App (PWA): eigenes Fenster, eigenes Symbol, Start auch offline.
- Installation unter iPhone/iPad über *Teilen › Zum Home-Bildschirm*, auf dem Mac über *Ablage › Zum Dock hinzufügen*, unter Windows/Chrome über *App installieren*.
- Die Browserversion bleibt unverändert nutzbar. Jede installierte App hat ihren eigenen Speicher.

### Ausblick: eigene Logins für Teammitglieder (Stufe B)

Damit Teammitglieder selbst im Tool arbeiten, braucht es die Server-Version (siehe unten), weil GitHub Pages keine Konten speichern kann. Vorbereitet ist bereits:
- Personen haben die Felder `email` (für Einladungen) und `accountId` (Verknüpfung mit einem Login). Zuweisungen verweisen auf Personen-IDs und bleiben deshalb gültig.
- „Ich“ wird über `currentPerson()` bestimmt. Heute kommt das aus der Geräte-Einstellung, später aus dem Login.
- Die Server-Schnittstelle meldet ihre Fähigkeiten (`features.accounts`).
- Der Abgleich mehrerer Geräte führt gleichzeitige Änderungen bereits automatisch zusammen. Genau das braucht auch ein gemeinsamer Arbeitsbereich mehrerer Personen.

Geplant für Stufe B:
- Benutzerkonten mit eigenem Passwort
- Einladungslinks per E-Mail, die eine Person mit einem Konto verknüpfen
- Gemeinsame Arbeitsbereiche mit Rollen (Besitzer, Bearbeiter, Leser)
- Später: Benachrichtigungen bei Zuweisungen und Datei-Uploads

## Daten & mehrere Geräte

Es gibt zwei Wege:
- **Eigener Server (empfohlen):** Alle Änderungen werden automatisch in einer Datenbank gespeichert, und alle Geräte sind immer auf demselben Stand. Siehe [Eigener Server](#eigener-server-automatische-speicherung).
- **Ohne Server** (z. B. GitHub Pages oder lokale Datei): wie unten beschrieben, per Sicherungsdatei.

Ohne Server liegen alle Daten im `localStorage` des Browsers, also nur auf dem jeweiligen Gerät.
Zwischen Geräten wechselst du über eine **Sicherungsdatei** in deinem Cloud-Speicher (**iCloud Drive, OneDrive, Google Drive, Dropbox**) oder ohne Cloud per AirDrop, USB-Stick oder E-Mail:

> **Beim Aufhören sichern (💾), beim Anfangen importieren.**

Der Tracker erinnert dich daran:
- 💾-Knopf mit orangefarbenem Punkt und **gelbe Leiste**, solange es ungesicherte Änderungen gibt
- **Rückfrage beim Schließen** von Tab oder Browser (Safari auf dem Mac, Edge unter Windows). Die Browser zeigen dabei nur ihren Standardtext („Seite verlassen?“), eigener Text ist technisch nicht möglich. Auf **iPhone und iPad** unterstützt Safari diese Rückfrage nicht, dort übernimmt die gelbe Leiste die Erinnerung.
- **Blaue Leiste beim Öffnen**, wenn das Gerät länger als 4 Stunden nicht benutzt wurde: Sie erinnert daran, zuerst die neueste Sicherung zu importieren.
- Beim Import warnt der Tracker, wenn die Daten auf dem Gerät ungesicherte Änderungen enthalten oder neuer als die Sicherung sind.

Die Schritt-für-Schritt-Anleitung steht in der App unter **Einstellungen › Zwischen Geräten wechseln**. Dort wählst du deinen Dienst und siehst die Schritte für iPhone/iPad, Mac, Windows und Android. Der Trick: Auf allen Geräten wird ein Ordner im Cloud-Speicher als Download-Ordner eingestellt, dann landet jede Sicherung automatisch dort.

Wichtig für iPhone und iPad: Füge den Tracker über *Teilen › Zum Home-Bildschirm* hinzu und öffne ihn darüber. Sonst kann Safari die gespeicherten Daten nach 7 Tagen ohne Besuch löschen.

Außerdem kannst du Zeiten, Investitionen und Einnahmen als **CSV** exportieren (z. B. für Excel) und alle Termine (Zieltermine, Meilensteine, fällige und geplante Aufgaben) als **Kalender-Datei (.ics)** für Outlook, Apple oder Google Kalender.

**🔒 Verschlüsselte Sicherung:** *Einstellungen › Datensicherung › Verschlüsselt exportieren* schützt die Sicherungsdatei mit einem Passwort (AES-GCM 256 Bit, Schlüssel per PBKDF2-SHA-256 mit 310 000 Runden). Verschlüsselt wird im Browser, das Passwort verlässt das Gerät nie und wird nirgends gespeichert. Ohne Passwort lässt sich die Datei nicht mehr öffnen. Beim Import erkennt Protrac verschlüsselte Dateien automatisch und fragt nach dem Passwort.

**📁 Automatische Sicherung in einen Ordner** (Edge, Chrome und andere Chromium-Browser am Computer): Unter *Einstellungen › Datensicherung* einen Ordner wählen, am besten in OneDrive, Dropbox oder iCloud Drive. Danach schreibt Protrac nach jeder Änderung (kurz verzögert) eine Tagesdatei `protrac-backup-JJJJ-MM-TT.json` dorthin und behält die letzten 7, 14, 30 oder 90 Tage. Die gelbe Erinnerungsleiste entfällt damit. Nach einem Browser-Neustart fragt der Browser einmal nach der Erlaubnis; eine blaue Leiste erinnert daran.

### Zeiten & Investitionen aus CSV importieren

Unter *Einstellungen › Datensicherung* (bzw. *Server-Speicherung*), in den Projekt-Reitern *Zeit* und *Investitionen* (⬆ CSV) oder über die Befehlspalette. Eine Anleitung und eine Vorlage zum Herunterladen gibt es direkt im Import-Dialog.

- Die erste Zeile enthält die Spaltenüberschriften (Deutsch oder Englisch, Reihenfolge egal). Als Trennzeichen gehen Semikolon, Komma oder Tabulator, sie werden automatisch erkannt.
- Spalten:

  | Spalte | Inhalt | Pflicht |
  |---|---|---|
  | Typ | „Zeit“ oder „Investition“ | nein, wird sonst an Dauer bzw. Betrag erkannt |
  | Datum | `2026-11-20`, `20.11.2026` oder `20/11/2026` | ja |
  | Projekt | Projektname; unbekannte Projekte können angelegt werden | ja, außer beim Import auf einer Projektseite |
  | Dauer / Minuten / Stunden | `1:30`, `90 min`, `1,5` | für Zeiten |
  | Betrag (EUR) | `49,99` oder `49.99` | für Investitionen |
  | Titel, Beschreibung, Kategorie | frei | nein |

- Datei auswählen oder Zellen aus Excel bzw. Numbers kopieren und einfügen. Die **Vorschau** zeigt, was importiert wird, welche Zeilen fehlerhaft sind und welche Projekte neu angelegt werden.
- Ein eigener CSV-Export lässt sich wieder importieren. Bereits vorhandene Einträge werden erkannt und übersprungen.

## Online stellen

Damit du den Tracker auf iPhone und iPad öffnen kannst, muss er eine Internetadresse haben, z. B. über **GitHub Pages**. Bei einem privaten Repository ist dafür GitHub Pro nötig. Alternativ machst du das Repository öffentlich oder lädst den Ordner bei einem kostenlosen Dienst wie Netlify oder Cloudflare Pages hoch.
Deine Projektdaten sind dabei **nicht** öffentlich, sie bleiben im Browser des jeweiligen Geräts.

## Eigener Server (automatische Speicherung)

Liegt der Tracker auf einem Server mit PHP, speichert er alle Änderungen **automatisch** in einer Datenbank. Exportieren und Importieren entfällt.

So funktioniert es:
- Die App erkennt `api.php` neben `index.html` von selbst. Ohne sie (z. B. auf GitHub Pages) läuft alles wie bisher.
- **Anmeldung mit Passwort**, einmal pro Gerät. Das Gerät bleibt ein Jahr angemeldet (einstellbar).
- Jede Änderung wird nach etwa einer Sekunde gespeichert. Der Knopf in der Navigation zeigt ☁️ *Gespeichert*, *Speichert…* oder 📴 *Offline*.
- Andere Geräte holen sich Änderungen beim Öffnen, beim Zurückkehren in die App und alle 30 Sekunden.
- **Offline** arbeitest du normal weiter. Die Änderungen werden übertragen, sobald der Server wieder erreichbar ist.
- Wurde zwischenzeitlich auf zwei Geräten gearbeitet, werden die Änderungen **automatisch zusammengeführt**: neue, geänderte und gelöschte Einträge beider Geräte bleiben erhalten. Nur wenn genau dasselbe Feld auf beiden Geräten geändert wurde, gewinnt das Gerät, das zuletzt speichert.
- **Frühere Stände** (Einstellungen › Server-Speicherung): Der Server behält die letzten 50 Speicherstände und den letzten Stand jedes Tages der vergangenen 60 Tage. Jeder davon lässt sich wiederherstellen.
- Bei der ersten Anmeldung auf einem Gerät, das schon Daten hat, fragt die App, ob sie diese mit den Server-Daten **zusammenführen** oder die Server-Daten verwenden soll. Das erste Gerät lädt seine Daten automatisch hoch.

### Variante A: Webhosting mit PHP (z. B. dein Webspace)

Voraussetzung: PHP 8.1 oder neuer (bei fast allen Webhostern Standard).

1. Alle Dateien des Repositorys in einen Ordner auf dem Webspace hochladen, z. B. `https://deine-domain.de/tracker/`.
2. `config.sample.php` als `config.php` speichern und ein **langes Passwort** eintragen.
3. Die Adresse aufrufen und anmelden.

Ohne weitere Angaben speichert der Tracker in einer **SQLite-Datei** (`data/tracker.sqlite`). Du musst dafür nichts einrichten. Der Ordner `data/` muss für PHP beschreibbar sein und ist per `.htaccess` gesperrt.
Für **MySQL/MariaDB** trägst du die Zugangsdaten in `config.php` ein (`db_dsn`, `db_user`, `db_pass`). Die Tabellen legt der Tracker selbst an.

Statt des Klartext-Passworts kannst du einen Hash hinterlegen:
```bash
php -r 'echo password_hash("dein-passwort", PASSWORD_DEFAULT), PHP_EOL;'
```

### Variante B: Docker (VPS, Heimserver, NAS)

```bash
TRACKER_PASSWORD='dein-langes-passwort' docker compose up -d
```

Der Tracker läuft dann auf Port 8080, die Daten liegen im Docker-Volume `tracker-data`. Für MariaDB statt SQLite gibt es in `docker-compose.yml` einen auskommentierten Abschnitt.

### Wichtig

- **HTTPS verwenden**, sobald der Tracker über das Internet erreichbar ist. Bei Webhostern geht das meist per Klick (Let's Encrypt). Bei Docker schaltest du einen Reverse-Proxy wie Caddy, Traefik oder den Proxy deines NAS davor. Ohne HTTPS zeigt die Anmeldeseite eine Warnung.
- Nach zu vielen falschen Passwörtern (10 in 15 Minuten) wird die Anmeldung für diese IP-Adresse kurz gesperrt.
- **Backup des Servers:** Sichere gelegentlich den Ordner `data/` bzw. das Docker-Volume oder die Datenbank. Zusätzlich funktioniert der JSON-Export in den Einstellungen weiterhin.
- Beim Abmelden werden die Daten von diesem Gerät entfernt. Auf dem Server bleiben sie erhalten.

## Technik

Reines HTML, CSS und JavaScript (`index.html`, `styles.css`, `i18n.js`, `lang-en.js`, `app.js`) ohne Abhängigkeiten oder Build-Schritt. Optional `api.php` (PHP 8.1+, PDO mit SQLite oder MySQL/MariaDB) für die Server-Speicherung.

### Sprachen

- Die Texte stehen auf Deutsch im Code (`tr('…')`). `lang-en.js` enthält die englische Übersetzung, Schlüssel ist jeweils der deutsche Text. Platzhalter wie `{n}` werden unverändert übernommen.
- **Neue Sprache hinzufügen:**
  1. `lang-en.js` als `lang-xx.js` kopieren und die Werte übersetzen.
  2. In `index.html` vor `app.js` einbinden.
  3. In `i18n.js` unter `LANGUAGES` eintragen.

  Fehlende Übersetzungen erscheinen in der Browser-Konsole als `[i18n] fehlt: …` und werden bis dahin auf Deutsch angezeigt.

### Updates & Cache

Browser und GitHub Pages speichern Dateien zwischen. Damit Änderungen sicher ankommen:
- `index.html` lädt Stylesheet und Skripte mit Versionsnummer (`?v=…`).
- Die App fragt beim Öffnen `version.json` am Cache vorbei ab und zeigt bei einer neuen Version die Leiste **„Neue Version verfügbar – Jetzt aktualisieren“**. Die Daten bleiben dabei erhalten.
- **Vor jeder Veröffentlichung** `./bump-version.sh` ausführen. Es erhöht die Versionsnummer in `index.html`, `app.js` und `version.json`.
- Danach in `changelog.json` einen Eintrag mit der neuen Versionsnummer und den Änderungen (`de` und `en`) ergänzen. Nach dem Update zeigt der Tracker einmalig „Neu in Version …“ mit Link zum GitHub-Repository. In der Update-Leiste gibt es „Was ist neu?“, und unter *Einstellungen* die Liste aller Neuigkeiten.
