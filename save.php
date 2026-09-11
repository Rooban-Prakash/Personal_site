<?php
// save.php — overwrites index.html with the posted content.
// Place this file in the SAME directory as index.html on your Hostinger server.

header('Content-Type: application/json');

// --- Basic protection: require a shared secret so randoms can't overwrite your site ---
// Set this to something long and random, and put the SAME value in the admin page's JS.
$SECRET = 'CHANGE_THIS_TO_A_LONG_RANDOM_STRING';

$providedSecret = $_SERVER['HTTP_X_ADMIN_SECRET'] ?? '';
if (!hash_equals($SECRET, $providedSecret)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$body = file_get_contents('php://input');

if (empty($body) || strpos($body, 'ADMIN:BRANCHES:START') === false) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Payload missing expected markers']);
    exit;
}

$targetFile = __DIR__ . '/index.html';

// Keep a rolling backup before overwriting, just in case.
if (file_exists($targetFile)) {
    @copy($targetFile, __DIR__ . '/index.backup.html');
}

$bytesWritten = file_put_contents($targetFile, $body);

if ($bytesWritten === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not write file — check folder permissions (should be writable by PHP, e.g. 755/775)']);
    exit;
}

echo json_encode(['ok' => true, 'bytesWritten' => $bytesWritten]);