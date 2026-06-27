<?php
header('Content-Type: application/manifest+json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$name = isset($_GET['name']) ? $_GET['name'] : 'Cardápio Digital';
$short_name = mb_substr($name, 0, 12);
$start_url = isset($_GET['start_url']) ? $_GET['start_url'] : '/cardapio/';
$theme_color = isset($_GET['color']) ? $_GET['color'] : '#ff6a00';
$logo = isset($_GET['logo']) ? $_GET['logo'] : '';

$manifest = [
    "name" => $name,
    "short_name" => $short_name,
    "start_url" => $start_url,
    "scope" => $start_url,
    "display" => "standalone",
    "background_color" => "#ffffff",
    "theme_color" => $theme_color,
    "icons" => [
        [
            "src" => "/cardapio/pwa/icon-192.png",
            "sizes" => "192x192",
            "type" => "image/png",
            "purpose" => "any maskable"
        ],
        [
            "src" => "/cardapio/pwa/icon-512.png",
            "sizes" => "512x512",
            "type" => "image/png",
            "purpose" => "any maskable"
        ]
    ]
];

if (!empty($logo)) {
    $mimeType = "image/png";
    $lower = strtolower($logo);
    if (strpos($lower, ".jpg") !== false || strpos($lower, ".jpeg") !== false) $mimeType = "image/jpeg";
    else if (strpos($lower, ".svg") !== false) $mimeType = "image/svg+xml";
    else if (strpos($lower, ".webp") !== false) $mimeType = "image/webp";

    $manifest['icons'] = [
        [
            "src" => $logo,
            "sizes" => "192x192",
            "type" => $mimeType,
            "purpose" => "any maskable"
        ],
        [
            "src" => $logo,
            "sizes" => "512x512",
            "type" => $mimeType,
            "purpose" => "any maskable"
        ]
    ];
}

echo json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
?>
