function safeSlug(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z0-9-]+$/i.test(raw)) return "";
  return raw.toLowerCase();
}

function htmlEscape(value) {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchCardapioBySlug(slug) {
  const SUPABASE_URL = "https://uapwitkmxuoepnjlffqy.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhcHdpdGtteHVvZXBuamxmZnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTcxMjUsImV4cCI6MjA5MDQ3MzEyNX0.YTz_EqzK4m0CMM25n3QJC1b3Nj9bikIrDDEEFi5n6ps";

  const url = new URL(`${SUPABASE_URL}/rest/v1/cardapios`);
  url.searchParams.set("select", "nome,slug,slogan,foto_url,banner_url");
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
  const slug = safeSlug(requestUrl.searchParams.get("slug"));

  const origin = `https://${req.headers.host || "newneocardapios.vercel.app"}`;
  const targetUrl = slug ? `${origin}/cardapio/${slug}` : `${origin}/cardapio/`;

  let title = "Cardápio Digital";
  let description = "Veja o cardápio e peça pelo WhatsApp.";
  let image = `${origin}/pwa/icon-512.png`;

  if (slug) {
    try {
      const cardapio = await fetchCardapioBySlug(slug);
      if (cardapio) {
        title = String(cardapio.nome || title);
        const slogan = String(cardapio.slogan || "").trim();
        if (slogan) description = slogan;
        const banner = String(cardapio.banner_url || "").trim();
        const foto = String(cardapio.foto_url || "").trim();
        image = banner || foto || image;
      } else {
        title = `Cardápio: ${slug}`;
      }
    } catch {
      title = `Cardápio: ${slug}`;
    }
  }

  const page = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(title)}</title>

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${htmlEscape(title)}" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:image" content="${htmlEscape(image)}" />
    <meta property="og:url" content="${htmlEscape(targetUrl)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${htmlEscape(title)}" />
    <meta name="twitter:description" content="${htmlEscape(description)}" />
    <meta name="twitter:image" content="${htmlEscape(image)}" />

    <meta http-equiv="refresh" content="0;url=${htmlEscape(targetUrl)}" />
  </head>
  <body>
    <p>Redirecionando…</p>
    <script>
      window.location.replace(${JSON.stringify(targetUrl)});
    </script>
  </body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(page);
};
