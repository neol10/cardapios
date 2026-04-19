const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5500;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function safePathname(pathname) {
  return pathname.replace(/\0/g, "");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSafeRelativePath(rel) {
  if (!rel) return true;
  if (rel.includes(":")) return false;
  const normalized = path.normalize(rel);
  if (path.isAbsolute(normalized)) return false;
  const parts = normalized.split(path.sep).filter(Boolean);
  return !parts.includes("..");
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);

  const headers = { "Content-Type": contentType };
  if (path.basename(filePath) === "sw.js" || ext === ".webmanifest") {
    headers["Cache-Control"] = "no-cache";
  }

  res.writeHead(200, headers);
  stream.pipe(res);

  stream.on("error", () => {
    res.writeHead(500);
    res.end("Erro ao ler o arquivo.");
  });
}

function handleRequest(req, res) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = safePathname(requestUrl.pathname || "/");
  const decodedPath = safeDecodeURIComponent(pathname);
  const relativePath = decodedPath.replace(/^\/+/g, "");

  if (!isSafeRelativePath(relativePath)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("400 - Caminho inválido.");
    return;
  }

  if (pathname === "/") {
    res.writeHead(302, { Location: "/cardapio/" });
    res.end();
    return;
  }

  if (pathname === "/cardapio") {
    res.writeHead(302, { Location: "/cardapio/" });
    res.end();
    return;
  }

  // 1) Arquivo estático direto (ex: /cardapio/style.css, /admin/style.css, /shared/supabase.js)
  const staticPath = path.join(ROOT, relativePath);
  if (fileExists(staticPath)) {
    serveFile(res, staticPath);
    return;
  }

  // 2) Index de diretório (ex: /admin/ -> /admin/index.html)
  if (pathname.endsWith("/")) {
    const indexPath = path.join(ROOT, relativePath, "index.html");
    if (fileExists(indexPath)) {
      serveFile(res, indexPath);
      return;
    }
  }

  // 3) Rewrite do slug do cardápio (ex: /cardapio/lucca-sorvetes)
  if (pathname.startsWith("/cardapio/")) {
    const cardapioIndex = path.join(ROOT, "cardapio", "index.html");
    if (fileExists(cardapioIndex)) {
      serveFile(res, cardapioIndex);
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 - Arquivo nao encontrado.");
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`Servidor ativo em http://localhost:${PORT}`);
});
