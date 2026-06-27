<?php
error_reporting(0);
header('Content-Type: application/manifest+json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$slug = isset($_GET['slug']) ? $_GET['slug'] : '';
if (empty($slug)) {
    header("HTTP/1.0 400 Bad Request");
    exit;
}

$supabase_url = "https://uapwitkmxuoepnjlffqy.supabase.co";
$supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcHdpdGtteHVvZXBuamxmZnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTcxMjUsImV4cCI6MjA5MDQ3MzEyNX0.YTz_EqzK4m0CMM25n3QJC1b3Nj9bikIrDDEEFi5n6ps";

$endpoint = $supabase_url . "/rest/v1/cardapios?slug=eq." . urlencode($slug) . "&select=nome,cor_tema,logo_url";

$ch = curl_init($endpoint);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: " . $supabase_key,
    "Authorization: Bearer " . $supabase_key
]);
$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);
if (empty($data) || !isset($data[0])) {
    header("HTTP/1.0 404 Not Found");
    exit;
}
$store = $data[0];

$name = isset($store['nome']) ? $store['nome'] : 'Cardápio Digital';
$short_name = mb_substr($name, 0, 12);
$theme_color = isset($store['cor_tema']) && !empty($store['cor_tema']) ? $store['cor_tema'] : '#ff6a00';
$logo = isset($store['logo_url']) ? $store['logo_url'] : '';

$start_url = '/cardapio/' . $slug . '/';

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

    array_unshift($manifest['icons'], [
        "src" => $icon192,
        "sizes" => "192x192",
        "type" => "image/png",
        "purpose" => "any maskable"
    ]);
    array_unshift($manifest['icons'], [
        "src" => $icon512,
        "sizes" => "512x512",
        "type" => "image/png",
        "purpose" => "any maskable"
    ]);
}

echo json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
?>
