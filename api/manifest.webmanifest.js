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

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(data, null, 2));
}

async function fetchCardapioBySlug(slug) {
  // Mantém alinhado com a config embutida no front (window.__SUPABASE_CONFIG__).
  const SUPABASE_URL = "https://uapwitkmxuoepnjlffqy.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcHdpdGtteHVvZXBuamxmZnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTcxMjUsImV4cCI6MjA5MDQ3MzEyNX0.YTz_EqzK4m0CMM25n3QJC1b3Nj9bikIrDDEEFi5n6ps";

  const url = new URL(`${SUPABASE_URL}/rest/v1/cardapios`);
  url.searchParams.set("select", "nome,slug,foto_url,cor_tema");
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

  const fallback = {
    name: "Cardápio Digital",
    short_name: "Cardápio",
    start_url: "/cardapio/",
    scope: "/cardapio/",
    display: "standalone",
    background_color: "#fffaf3",
    theme_color: "#ff6a00",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192" },
      { src: "/pwa/icon-512.png", sizes: "512x512" }
    ]
  };

  if (!slug) {
    json(res, 200, fallback);
    return;
  }

  let cardapio = null;
  try {
    cardapio = await fetchCardapioBySlug(slug);
  } catch {
    cardapio = null;
  }

  if (!cardapio) {
    json(res, 200, { ...fallback, start_url: `/cardapio/${slug}` });
    return;
  }

  const iconUrl = String(cardapio.foto_url || "").trim();
  const themeColor = String(cardapio.cor_tema || fallback.theme_color).trim() || fallback.theme_color;

  const manifest = {
    name: cardapio.nome || fallback.name,
    short_name: cardapio.nome || fallback.short_name,
    start_url: `/cardapio/${slug}`,
    scope: "/cardapio/",
    display: "standalone",
    background_color: fallback.background_color,
    theme_color: themeColor,
    icons: iconUrl
      ? [
          { src: iconUrl, sizes: "192x192" },
          { src: iconUrl, sizes: "512x512" }
        ]
      : fallback.icons
  };

  json(res, 200, manifest);
};
