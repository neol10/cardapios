<?php
error_reporting(0);
$url = isset($_GET['url']) ? $_GET['url'] : '';
$size = isset($_GET['size']) ? (int)$_GET['size'] : 192;

if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
    header("HTTP/1.0 404 Not Found");
    exit;
}

if ($size !== 192 && $size !== 512) {
    $size = 192;
}

$imgData = @file_get_contents($url);
if ($imgData === false && function_exists('curl_version')) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $imgData = curl_exec($ch);
    curl_close($ch);
}

if ($imgData === false || empty($imgData)) {
    header("HTTP/1.0 404 Not Found");
    exit;
}

$source = @imagecreatefromstring($imgData);
if ($source === false) {
    header("HTTP/1.0 404 Not Found");
    exit;
}

$width = imagesx($source);
$height = imagesy($source);

$canvas = imagecreatetruecolor($size, $size);
$white = imagecolorallocate($canvas, 255, 255, 255);
imagefill($canvas, 0, 0, $white);

$aspectRatio = $width / $height;
if ($aspectRatio > 1) {
    $newWidth = $size;
    $newHeight = $size / $aspectRatio;
    $dstX = 0;
    $dstY = ($size - $newHeight) / 2;
} else {
    $newHeight = $size;
    $newWidth = $size * $aspectRatio;
    $dstX = ($size - $newWidth) / 2;
    $dstY = 0;
}

imagecopyresampled($canvas, $source, $dstX, $dstY, 0, 0, $newWidth, $newHeight, $width, $height);

header('Content-Type: image/png');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=86400');

imagepng($canvas);
imagedestroy($canvas);
imagedestroy($source);
?>
