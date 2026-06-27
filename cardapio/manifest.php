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
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $basePath = rtrim(dirname($_SERVER['PHP_SELF']), '/');
    
    $icon192 = $protocol . '://' . $host . $basePath . '/icon.php?size=192&url=' . urlencode($logo);
    $icon512 = $protocol . '://' . $host . $basePath . '/icon.php?size=512&url=' . urlencode($logo);

    $manifest['icons'] = [
        [
            "src" => $icon192,
            "sizes" => "192x192",
            "type" => "image/png",
            "purpose" => "any maskable"
        ],
        [
            "src" => $icon512,
            "sizes" => "512x512",
            "type" => "image/png",
            "purpose" => "any maskable"
        ]
    ];
}

echo json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
?>
