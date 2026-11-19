<?php
/**
 * Projekttracker – Server-API
 *
 * Speichert die Daten des Trackers in einer Datenbank (SQLite oder MySQL/MariaDB),
 * damit alle Geräte automatisch denselben Stand haben.
 *
 * Konfiguration: config.php (Vorlage: config.sample.php) oder Umgebungsvariablen
 * (TRACKER_PASSWORD, TRACKER_PASSWORD_HASH, TRACKER_DB_DSN, TRACKER_DB_USER, TRACKER_DB_PASS, TRACKER_SESSION_DAYS).
 */

declare(strict_types=1);

const API_VERSION = 1;
const COOKIE_NAME = 'pt_session';
const HISTORY_KEEP_LATEST = 50;   // so viele letzte Stände bleiben immer erhalten
const HISTORY_KEEP_DAYS = 60;     // zusätzlich der letzte Stand jedes Tages für so viele Tage
const LOGIN_MAX_FAILS = 10;       // Fehlversuche pro IP …
const LOGIN_WINDOW = 900;         // … innerhalb von 15 Minuten
const MAX_BODY = 20 * 1024 * 1024;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

set_exception_handler(function (Throwable $e) {
    error_log('Projekttracker: ' . $e->getMessage());
    respond(500, ['error' => 'server', 'message' => 'Interner Serverfehler. Details stehen im Fehlerprotokoll des Servers.']);
});

/* ---------------------------------------------------------------- Konfiguration */

function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $file = __DIR__ . '/config.php';
    $cfg = is_file($file) ? (array) require $file : [];
    $env = [
        'password' => 'TRACKER_PASSWORD',
        'password_hash' => 'TRACKER_PASSWORD_HASH',
        'db_dsn' => 'TRACKER_DB_DSN',
        'db_user' => 'TRACKER_DB_USER',
        'db_pass' => 'TRACKER_DB_PASS',
        'session_days' => 'TRACKER_SESSION_DAYS',
    ];
    foreach ($env as $key => $name) {
        $v = getenv($name);
        if ($v !== false && $v !== '') $cfg[$key] = $v;
    }
    $cfg += [
        'password' => '',
        'password_hash' => '',
        'db_dsn' => 'sqlite:' . __DIR__ . '/data/tracker.sqlite',
        'db_user' => null,
        'db_pass' => null,
        'session_days' => 365,
    ];
    return $cfg;
}

function passwordConfigured(): bool {
    $c = config();
    return $c['password_hash'] !== '' || $c['password'] !== '';
}

function checkPassword(string $given): bool {
    $c = config();
    if ($c['password_hash'] !== '') return password_verify($given, $c['password_hash']);
    if ($c['password'] !== '') return hash_equals((string) $c['password'], $given);
    return false;
}

/* ---------------------------------------------------------------- Datenbank */

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    $dsn = $c['db_dsn'];
    if (str_starts_with($dsn, 'sqlite:')) {
        $dir = dirname(substr($dsn, 7));
        if (!is_dir($dir)) mkdir($dir, 0770, true);
        protectDataDir($dir);
    }
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    if ($mysql) {
        $pdo->exec("SET NAMES utf8mb4");
        $text = 'LONGTEXT';
        $auto = 'INT AUTO_INCREMENT PRIMARY KEY';
        $suffix = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    } else {
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $text = 'TEXT';
        $auto = 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $suffix = '';
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS pt_document (
        id INT PRIMARY KEY, rev INT NOT NULL, data $text NOT NULL, updated_at BIGINT NOT NULL, device VARCHAR(120) NOT NULL DEFAULT ''
    )$suffix");
    $pdo->exec("CREATE TABLE IF NOT EXISTS pt_history (
        id $auto, rev INT NOT NULL, data $text NOT NULL, saved_at BIGINT NOT NULL, day CHAR(10) NOT NULL, device VARCHAR(120) NOT NULL DEFAULT ''
    )$suffix");
    $pdo->exec("CREATE TABLE IF NOT EXISTS pt_sessions (
        token_hash CHAR(64) PRIMARY KEY, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, device VARCHAR(120) NOT NULL DEFAULT ''
    )$suffix");
    $pdo->exec("CREATE TABLE IF NOT EXISTS pt_login_fails (
        ip VARCHAR(64) NOT NULL, at BIGINT NOT NULL
    )$suffix");
    return $pdo;
}

/** Verhindert, dass der Webserver die SQLite-Datei direkt ausliefert (Apache). */
function protectDataDir(string $dir): void {
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Require all denied\nDeny from all\n");
    $idx = $dir . '/index.html';
    if (!is_file($idx)) @file_put_contents($idx, '');
}

/* ---------------------------------------------------------------- Hilfen */

function respond(int $code, array $body): never {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw === false || $raw === '') return [];
    if (strlen($raw) > MAX_BODY) respond(413, ['error' => 'too_large', 'message' => 'Die Daten sind zu groß.']);
    $json = json_decode($raw, true);
    if (!is_array($json)) respond(400, ['error' => 'bad_json', 'message' => 'Ungültige Anfrage.']);
    return $json;
}

function isHttps(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    if (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') return true;
    return ($_SERVER['SERVER_PORT'] ?? '') === '443';
}

function isLocalhost(): bool {
    $host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
    return in_array($host, ['localhost', '127.0.0.1', '[::1]'], true);
}

function clientIp(): string {
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64);
}

function deviceName(array $in): string {
    $d = trim((string) ($in['device'] ?? ''));
    return function_exists('mb_substr') ? mb_substr($d, 0, 120) : substr($d, 0, 120);
}

function setSessionCookie(string $value, int $expires): void {
    setcookie(COOKIE_NAME, $value, [
        'expires' => $expires,
        'path' => rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/',
        'secure' => isHttps(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function currentSession(): ?array {
    $token = $_COOKIE[COOKIE_NAME] ?? '';
    if (!is_string($token) || strlen($token) !== 64) return null;
    $st = db()->prepare('SELECT * FROM pt_sessions WHERE token_hash = ? AND expires_at > ?');
    $st->execute([hash('sha256', $token), time()]);
    return $st->fetch() ?: null;
}

function requireAuth(): array {
    $s = currentSession();
    if (!$s) respond(401, ['error' => 'auth', 'message' => 'Bitte melde dich an.']);
    return $s;
}

/** Schreibende Anfragen müssen per fetch() aus der App kommen (Schutz vor Cross-Site-Anfragen). */
function requireAppRequest(): void {
    if (($_SERVER['HTTP_X_TRACKER'] ?? '') !== '1') respond(403, ['error' => 'forbidden', 'message' => 'Anfrage nicht erlaubt.']);
}

function currentDocument(): array {
    $row = db()->query('SELECT rev, data, updated_at, device FROM pt_document WHERE id = 1')->fetch();
    if (!$row) return ['rev' => 0, 'data' => null, 'updatedAt' => 0, 'device' => ''];
    return [
        'rev' => (int) $row['rev'],
        'data' => json_decode($row['data'], true),
        'updatedAt' => (int) $row['updated_at'],
        'device' => $row['device'],
    ];
}

function pruneHistory(PDO $pdo): void {
    $cutoff = date('Y-m-d', time() - HISTORY_KEEP_DAYS * 86400);
    $st = $pdo->prepare('DELETE FROM pt_history
        WHERE id NOT IN (SELECT id FROM (SELECT id FROM pt_history ORDER BY id DESC LIMIT ' . HISTORY_KEEP_LATEST . ') latest)
          AND id NOT IN (SELECT id FROM (SELECT MAX(id) AS id FROM pt_history WHERE day >= ? GROUP BY day) daily)');
    $st->execute([$cutoff]);
}

/* ---------------------------------------------------------------- Aktionen */

$action = (string) ($_GET['action'] ?? 'status');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {
    case 'status': {
        $configured = passwordConfigured();
        $authed = false;
        $dbError = null;
        if ($configured) {
            try { $authed = currentSession() !== null; }
            catch (Throwable $e) { $dbError = 'Die Datenbank ist nicht erreichbar. Prüfe die Einstellungen in config.php.'; error_log('Projekttracker: ' . $e->getMessage()); }
        }
        respond(200, [
            'app' => 'projekttracker',
            'api' => API_VERSION,
            'configured' => $configured,
            'authenticated' => $authed,
            'secure' => isHttps() || isLocalhost(),
            'dbError' => $dbError,
        ]);
    }

    case 'login': {
        if ($method !== 'POST') respond(405, ['error' => 'method']);
        requireAppRequest();
        if (!passwordConfigured()) respond(503, ['error' => 'not_configured', 'message' => 'Auf dem Server ist noch kein Passwort festgelegt (config.php).']);
        $pdo = db();
        $ip = clientIp();
        $pdo->prepare('DELETE FROM pt_login_fails WHERE at < ?')->execute([time() - LOGIN_WINDOW]);
        $st = $pdo->prepare('SELECT COUNT(*) FROM pt_login_fails WHERE ip = ?');
        $st->execute([$ip]);
        if ((int) $st->fetchColumn() >= LOGIN_MAX_FAILS) {
            respond(429, ['error' => 'locked', 'message' => 'Zu viele Fehlversuche. Bitte warte 15 Minuten.']);
        }
        $in = body();
        if (!checkPassword((string) ($in['password'] ?? ''))) {
            $pdo->prepare('INSERT INTO pt_login_fails (ip, at) VALUES (?, ?)')->execute([$ip, time()]);
            usleep(800000);
            respond(401, ['error' => 'wrong_password', 'message' => 'Falsches Passwort.']);
        }
        $pdo->prepare('DELETE FROM pt_login_fails WHERE ip = ?')->execute([$ip]);
        $pdo->prepare('DELETE FROM pt_sessions WHERE expires_at < ?')->execute([time()]);
        $token = bin2hex(random_bytes(32));
        $expires = time() + max(1, (int) config()['session_days']) * 86400;
        $pdo->prepare('INSERT INTO pt_sessions (token_hash, created_at, expires_at, device) VALUES (?, ?, ?, ?)')
            ->execute([hash('sha256', $token), time(), $expires, deviceName($in)]);
        setSessionCookie($token, $expires);
        respond(200, ['ok' => true]);
    }

    case 'logout': {
        if ($method !== 'POST') respond(405, ['error' => 'method']);
        requireAppRequest();
        $token = $_COOKIE[COOKIE_NAME] ?? '';
        if (is_string($token) && $token !== '') {
            db()->prepare('DELETE FROM pt_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        }
        setSessionCookie('', time() - 3600);
        respond(200, ['ok' => true]);
    }

    case 'data': {
        requireAuth();
        if ($method === 'GET') respond(200, currentDocument());
        if ($method !== 'POST') respond(405, ['error' => 'method']);
        requireAppRequest();
        $in = body();
        if (!isset($in['data']) || !is_array($in['data']) || !isset($in['data']['projects']) || !is_array($in['data']['projects'])) {
            respond(400, ['error' => 'bad_data', 'message' => 'Keine gültigen Projekttracker-Daten.']);
        }
        $baseRev = (int) ($in['baseRev'] ?? -1);
        $device = deviceName($in);
        $json = json_encode($in['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
            $row = $pdo->query('SELECT rev FROM pt_document WHERE id = 1' . ($mysql ? ' FOR UPDATE' : ''))->fetch();
            $rev = $row ? (int) $row['rev'] : 0;
            if ($baseRev !== $rev) {
                $pdo->rollBack();
                respond(409, ['error' => 'conflict'] + currentDocument());
            }
            $now = (int) round(microtime(true) * 1000);
            $newRev = $rev + 1;
            if ($row) {
                $pdo->prepare('UPDATE pt_document SET rev = ?, data = ?, updated_at = ?, device = ? WHERE id = 1')
                    ->execute([$newRev, $json, $now, $device]);
            } else {
                $pdo->prepare('INSERT INTO pt_document (id, rev, data, updated_at, device) VALUES (1, ?, ?, ?, ?)')
                    ->execute([$newRev, $json, $now, $device]);
            }
            $pdo->prepare('INSERT INTO pt_history (rev, data, saved_at, day, device) VALUES (?, ?, ?, ?, ?)')
                ->execute([$newRev, $json, $now, date('Y-m-d'), $device]);
            pruneHistory($pdo);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(200, ['ok' => true, 'rev' => $newRev, 'updatedAt' => $now]);
    }

    case 'history': {
        requireAuth();
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($id > 0) {
            $st = db()->prepare('SELECT id, rev, data, saved_at, device FROM pt_history WHERE id = ?');
            $st->execute([$id]);
            $row = $st->fetch();
            if (!$row) respond(404, ['error' => 'not_found', 'message' => 'Diesen Stand gibt es nicht mehr.']);
            respond(200, ['id' => (int) $row['id'], 'rev' => (int) $row['rev'], 'savedAt' => (int) $row['saved_at'], 'device' => $row['device'], 'data' => json_decode($row['data'], true)]);
        }
        $rows = db()->query('SELECT id, rev, saved_at, device, LENGTH(data) AS size FROM pt_history ORDER BY id DESC LIMIT 200')->fetchAll();
        respond(200, ['items' => array_map(fn ($r) => [
            'id' => (int) $r['id'], 'rev' => (int) $r['rev'], 'savedAt' => (int) $r['saved_at'], 'device' => $r['device'], 'size' => (int) $r['size'],
        ], $rows)]);
    }

    default:
        respond(404, ['error' => 'unknown_action']);
}
