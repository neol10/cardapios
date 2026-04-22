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

  if (pathname === "/api/icon") {
    try {
      // Em produção isso roda como serverless na Vercel; no localhost chamamos o handler direto.
      const handler = require("./api/icon.js");
      handler(req, res);
      return;
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Erro ao executar /api/icon no localhost.");
      return;
    }
  }

  if (pathname === "/api/og-cardapio") {
    try {
      const handler = require("./api/og-cardapio.js");
      handler(req, res);
      return;
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Erro ao executar /api/og-cardapio no localhost.");
      return;
    }
  }

  if (pathname === "/api/manifest.webmanifest") {
    const manifestPath = path.join(ROOT, "cardapio", "manifest.webmanifest");
    if (fileExists(manifestPath)) {
      serveFile(res, manifestPath);
      return;
    }
  }

  // Redireciona URLs com .html para URLs limpas
  if (pathname === "/admin/index.html") {
    res.writeHead(308, { Location: "/admin" });
    res.end();
    return;
  }
  if (pathname === "/admin/dashboard.html") {
    res.writeHead(308, { Location: "/admin/dashboard" });
    res.end();
    return;
  }
  if (pathname === "/admin/owner.html") {
    res.writeHead(308, { Location: "/admin/owner" });
    res.end();
    return;
  }
  if (pathname === "/cardapio/index.html") {
    res.writeHead(308, { Location: "/cardapio" });
    res.end();
    return;
  }

  if (!isSafeRelativePath(relativePath)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("400 - Caminho inválido.");
    return;
  }

  if (pathname === "/") {
    const indexPath = path.join(ROOT, "index.html");
    if (fileExists(indexPath)) {
      serveFile(res, indexPath);
      return;
    }
  }

  if (pathname === "/cardapio") {
    res.writeHead(302, { Location: "/cardapio/" });
    res.end();
    return;
  }

  if (pathname === "/admin/owner") {
    const ownerPath = path.join(ROOT, "admin", "owner.html");
    if (fileExists(ownerPath)) {
      serveFile(res, ownerPath);
      return;
    }
  }

  if (pathname === "/cardapio/comunidade" || pathname === "/cardapio/comunidade/") {
    const indexPath = path.join(ROOT, "index.html");
    if (fileExists(indexPath)) {
      serveFile(res, indexPath);
      return;
    }
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
