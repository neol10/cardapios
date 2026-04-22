import { assertSupabaseConfig, supabase } from "./shared/supabase.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const grid = document.querySelector("#cardapios");
const messageEl = document.querySelector("#vitrine-message");
const countEl = document.querySelector("#vitrine-count");

function setMessage(text, kind) {
  if (!(messageEl instanceof HTMLElement)) return;
  messageEl.textContent = String(text || "");
  messageEl.classList.toggle("error", kind === "error");
}

function safeHttpUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function createCard(cardapio) {
  const slug = String(cardapio?.slug || "").trim();
  const nome = String(cardapio?.nome || "Cardápio").trim();
  const slogan = String(cardapio?.slogan || "").trim();
  const banner = safeHttpUrl(cardapio?.banner_url);
  const foto = safeHttpUrl(cardapio?.foto_url);
  const imgUrl = banner || foto;
  const isLikelyLogo = !banner && !!foto;

  const a = document.createElement("a");
  a.className = "vitrine-card";
  a.href = `/cardapio/${encodeURIComponent(slug)}`;
  a.setAttribute("aria-label", `Abrir cardápio ${nome}`);

  let mediaEl;
  if (imgUrl) {
    const img = document.createElement("img");
    img.className = "vitrine-media";
    img.alt = nome;
    img.loading = "lazy";
    img.src = imgUrl;
    img.referrerPolicy = "no-referrer";
    if (isLikelyLogo) {
      img.style.objectFit = "contain";
      img.style.padding = "10px";
    }
    img.addEventListener(
      "error",
      () => {
        const placeholder = document.createElement("div");
        placeholder.className = "vitrine-media";
        placeholder.setAttribute("aria-hidden", "true");
        img.replaceWith(placeholder);
      },
      { once: true }
    );
    mediaEl = img;
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "vitrine-media";
    placeholder.setAttribute("aria-hidden", "true");
    mediaEl = placeholder;
  }

  const title = document.createElement("h3");
  title.textContent = nome;

  const desc = document.createElement("p");
  desc.className = "muted";
  desc.textContent = slogan || "Abrir cardápio";

  const actions = document.createElement("div");
  actions.className = "vitrine-actions";

  const cta = document.createElement("span");
  cta.className = "btn btn-primary";
  cta.textContent = "Abrir";

  actions.appendChild(cta);

  a.append(mediaEl, title, desc, actions);
  return a;
}

async function loadCardapios() {
  if (!(grid instanceof HTMLElement)) return;

  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  try {
    assertSupabaseConfig();
  } catch (error) {
    setMessage(error?.message || "Configuração do Supabase não definida.", "error");
    if (countEl instanceof HTMLElement) countEl.textContent = "";
    document.body.classList.remove("is-loading");
    return;
  }

  setMessage("Carregando cardápios...");

  const { data, error } = await supabase
    .from("cardapios")
    .select("nome, slug, slogan, foto_url, banner_url, created_at")
    .order("created_at", { ascending: false });

  document.body.classList.remove("is-loading");

  if (error) {
    console.error("Falha ao carregar cardápios:", error);
    const detail = isLocalhost ? [error.message, error.details, error.hint].filter(Boolean).join(" | ") : "";
    setMessage(
      `Não foi possível carregar os cardápios agora.${detail ? ` Detalhe: ${detail}` : ""}`,
      "error"
    );
    if (countEl instanceof HTMLElement) countEl.textContent = "";
    return;
  }

  const items = Array.isArray(data) ? data : [];

  grid.innerHTML = "";
  if (!items.length) {
    setMessage("Nenhum cardápio disponível.");
    if (countEl instanceof HTMLElement) countEl.textContent = "0";
    return;
  }

  setMessage("");
  if (countEl instanceof HTMLElement) countEl.textContent = `${items.length} disponível(is)`;

  for (const item of items) {
    if (!item?.slug) continue;
    grid.appendChild(createCard(item));
  }
}

loadCardapios();
