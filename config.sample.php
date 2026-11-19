<?php
/*
 * Projekttracker – Server-Konfiguration
 *
 * 1. Diese Datei als „config.php“ speichern (im selben Ordner wie index.html).
 * 2. Passwort eintragen.
 * 3. Fertig – ohne weitere Angaben werden die Daten in data/tracker.sqlite gespeichert.
 *
 * Alle Werte lassen sich auch über Umgebungsvariablen setzen (z. B. bei Docker):
 * TRACKER_PASSWORD, TRACKER_PASSWORD_HASH, TRACKER_DB_DSN, TRACKER_DB_USER, TRACKER_DB_PASS, TRACKER_SESSION_DAYS
 */
return [
    // Passwort für die Anmeldung. Sicherer: statt dessen 'password_hash' verwenden.
    'password' => 'hier-ein-langes-passwort-eintragen',

    // Optional: Hash statt Klartext-Passwort. Erzeugen mit:
    //   php -r 'echo password_hash("dein-passwort", PASSWORD_DEFAULT), PHP_EOL;'
    // 'password_hash' => '$2y$10$...',

    // Datenbank. Standard: SQLite-Datei im Ordner data/ (nichts einzurichten).
    // 'db_dsn' => 'sqlite:' . __DIR__ . '/data/tracker.sqlite',

    // MySQL / MariaDB (z. B. beim Webhoster):
    // 'db_dsn'  => 'mysql:host=localhost;dbname=projekttracker;charset=utf8mb4',
    // 'db_user' => 'benutzer',
    // 'db_pass' => 'passwort',

    // So viele Tage bleibt ein Gerät angemeldet.
    // 'session_days' => 365,
];
