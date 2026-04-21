function safeSlug(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z0-9-]+$/i.test(raw)) return "";
  return raw.toLowerCase();
}

function extractSlugFromReferer(referer) {
  try {
    const refUrl = new URL(String(referer || ""));
    const match = refUrl.pathname.match(/^\/cardapio\/([^\/\?#]+)\/?$/);
    return safeSlug(match ? match[1] : "");
  } catch {
    return "";
  }
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-cache");
  res.end();
}

function buildSquareSvgDataUrl(imageContentType, imageBuffer) {
  const base64 = Buffer.from(imageBuffer).toString("base64");
  const dataUrl = `data:${imageContentType};base64,${base64}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#fff"/>
  <image width="512" height="512" href="${dataUrl}" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
}

async function fetchCardapioBySlug(slug) {
  const SUPABASE_URL = "https://uapwitkmxuoepnjlffqy.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcHdpdGtteHVvZXBuamxmZnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTcxMjUsImV4cCI6MjA5MDQ3MzEyNX0.YTz_EqzK4m0CMM25n3QJC1b3Nj9bikIrDDEEFi5n6ps";

  const url = new URL(`${SUPABASE_URL}/rest/v1/cardapios`);
  url.searchParams.set("select", "slug,foto_url");
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data) && data[0] ? data[0] : null;
}

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const slugFromQuery = safeSlug(requestUrl.searchParams.get("slug"));
  const slugFromReferer = extractSlugFromReferer(req.headers.referer);
  const slug = slugFromQuery || slugFromReferer;
  const format = String(requestUrl.searchParams.get("format") || "").trim().toLowerCase();

  if (!slug) {
    redirect(res, "/pwa/icon-192.png");
    return;
  }

  let cardapio = null;
  try {
    cardapio = await fetchCardapioBySlug(slug);
  } catch {
    cardapio = null;
  }

  const photoUrl = String(cardapio?.foto_url || "").trim();
  if (!photoUrl) {
    redirect(res, "/pwa/icon-192.png");
    return;
  }

  let upstream;
  try {
    upstream = await fetch(photoUrl);
  } catch {
    redirect(res, "/pwa/icon-192.png");
    return;
  }

  if (!upstream || !upstream.ok) {
    redirect(res, "/pwa/icon-192.png");
    return;
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const arrayBuffer = await upstream.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  if (format === "svg") {
    // Evita resposta gigantesca (base64 dentro do SVG)
    if (buf.length > 900_000) {
      redirect(res, "/pwa/icon-192.png");
      return;
    }

    const svg = buildSquareSvgDataUrl(contentType, buf);
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.end(svg);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.end(buf);
};
