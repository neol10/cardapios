import {
  assertSupabaseConfig,
  formatPriceBRL,
  onlyDigits,
  supabase
} from "../shared/supabase.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const cart = [];
let activeCardapio = null;
let activeProdutos = [];
let filteredProdutos = [];
let activeCategory = "Todos";
let produtoModal = null;
let lightboxModal = null;

function isCatalogMode(cardapio) {
  const value = safeText(cardapio?.modo) || "pedido";
  return value === "catalogo";
}

function isMarmitaMode(cardapio) {
  const value = safeText(cardapio?.modo_marmita_enabled) || "false";
  return value === "true" || cardapio?.modo === "marmita";
}

function isMarmitaDeadlinePassed(cardapio) {
  if (!isMarmitaMode(cardapio) || !cardapio.marmita_deadline) return false;
  
  const now = new Date();
  const [h, m] = cardapio.marmita_deadline.split(':');
  const deadline = new Date();
  deadline.setHours(parseInt(h), parseInt(m), 0);
  
  return now > deadline;
}

function isMarmitaAgendamentoMode(cardapio) {
  return isMarmitaMode(cardapio) && 
    (safeText(cardapio?.marmita_agendamento_enabled) === "true");
}

const produtosContainer = document.querySelector("#produtos");
const cartItemsContainer = document.querySelector("#cart-items");
const cartTotal = document.querySelector("#cart-total");
const cartSubtotal = document.querySelector("#cart-subtotal");
const cartTaxa = document.querySelector("#cart-taxa");
const cartMinimo = document.querySelector("#cart-minimo");
const checkoutForm = document.querySelector("#checkout-form");
const checkoutMessage = document.querySelector("#checkout-message");
const telefoneInput = document.querySelector("#telefone");
const cardapioFoto = document.querySelector("#cardapio-foto");
const cartBox = document.querySelector(".cart-box");

const cardapioSubtitle = document.querySelector("#cardapio-subtitle");
const cardapioInfo = document.querySelector("#cardapio-info");
const cardapioStatus = document.querySelector("#cardapio-status");
const cardapioHorario = document.querySelector("#cardapio-horario");
const cardapioEndereco = document.querySelector("#cardapio-endereco");
const cardapioPagamentos = document.querySelector("#cardapio-pagamentos");
const cardapioInstagram = document.querySelector("#cardapio-instagram");
const cardapioMaps = document.querySelector("#cardapio-maps");
const cardapioWhatsappTop = document.querySelector("#cardapio-whatsapp-top");
const whatsappFab = document.querySelector("#whatsapp-fab");

const galeriaWrap = document.querySelector("#galeria-wrap");
const galeriaEl = document.querySelector("#galeria");

const tipoPedidoWrap = document.querySelector("#tipo-pedido-wrap");
const tipoPedidoSelect = document.querySelector("#tipo_pedido");
const enderecoWrap = document.querySelector("#endereco-wrap");
const pagamentoWrap = document.querySelector("#pagamento-wrap");
const pagamentoSelect = document.querySelector("#pagamento");

const cardapioNomeEl = document.querySelector("#cardapio-nome");
const categoriesContainer = document.querySelector("#categories");
const searchInput = document.querySelector("#produto-search");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxClose = document.querySelector(".lightbox-close");
const CHECKOUT_DRAFT_KEY_PREFIX = "cardapio.checkoutDraft.";

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} demorou mais de ${Math.round(ms / 1000)}s`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function getCheckoutDraftKey() {
  const slug = safeText(getSlugFromUrl()).toLowerCase();
  return `${CHECKOUT_DRAFT_KEY_PREFIX}${slug || "default"}`;
}

function readCheckoutDraft() {
  try {
    const raw = localStorage.getItem(getCheckoutDraftKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCheckoutDraft(partial) {
  try {
    const current = readCheckoutDraft() || {};
    const next = {
      ...current,
      ...(partial && typeof partial === "object" ? partial : {}),
      updatedAt: Date.now()
    };
    localStorage.setItem(getCheckoutDraftKey(), JSON.stringify(next));
  } catch {
    // ignora
  }
}

let saveCheckoutDraftTimer = null;
function scheduleSaveCheckoutDraft() {
  if (!checkoutForm) return;
  if (saveCheckoutDraftTimer) window.clearTimeout(saveCheckoutDraftTimer);
  saveCheckoutDraftTimer = window.setTimeout(() => {
    saveCheckoutDraftTimer = null;
    try {
      const formData = new FormData(checkoutForm);
      writeCheckoutDraft({
        nome: String(formData.get("nome") || "").trim(),
        telefone: String(formData.get("telefone") || "").trim(),
        endereco: String(formData.get("endereco") || "").trim(),
        tipo_pedido: String(formData.get("tipo_pedido") || "").trim(),
        pagamento: String(formData.get("pagamento") || "").trim()
      });
    } catch {
      // ignora
    }
  }, 260);
}

function applyCheckoutDraft() {
  if (!checkoutForm) return;
  const draft = readCheckoutDraft();
  if (!draft) return;

  const nomeEl = checkoutForm.querySelector('input[name="nome"]');
  const telefoneEl = checkoutForm.querySelector('input[name="telefone"]');
  const enderecoEl = checkoutForm.querySelector('textarea[name="endereco"]');
  const tipoEl = checkoutForm.querySelector('select[name="tipo_pedido"]');
  const pagamentoEl = checkoutForm.querySelector('select[name="pagamento"]');

  const setIfEmpty = (el, value) => {
    if (!el) return;
    const v = String(value || "");
    if (!v) return;
    if (String(el.value || "").trim()) return;
    el.value = v;
  };

  if (nomeEl instanceof HTMLInputElement) setIfEmpty(nomeEl, draft.nome);
  if (telefoneEl instanceof HTMLInputElement) {
    setIfEmpty(telefoneEl, draft.telefone);
    if (String(telefoneEl.value || "").trim()) telefoneEl.value = maskTelefone(telefoneEl.value);
  }
  if (enderecoEl instanceof HTMLTextAreaElement) setIfEmpty(enderecoEl, draft.endereco);

  if (tipoEl instanceof HTMLSelectElement) {
    const next = String(draft.tipo_pedido || "").trim();
    if (next) {
      const has = Array.from(tipoEl.options).some((o) => o.value === next);
      if (has && tipoEl.value !== next) {
        tipoEl.value = next;
        tipoEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  if (pagamentoEl instanceof HTMLSelectElement) {
    const next = String(draft.pagamento || "").trim();
    if (next) {
      const has = Array.from(pagamentoEl.options).some((o) => o.value === next);
      if (has && pagamentoEl.value !== next) {
        pagamentoEl.value = next;
      }
    }
  }
}

function updateCheckoutAvailability() {
  const btn = checkoutForm?.querySelector('button[type="submit"]');
  if (!(btn instanceof HTMLButtonElement)) return;

  if (!btn.dataset.originalText) {
    btn.dataset.originalText = btn.textContent || "Finalizar pedido";
  }

  if (!activeCardapio) {
    btn.disabled = true;
    btn.textContent = "Carregando...";
    return;
  }

  if (!isOpenNow(activeCardapio)) {
    setCheckoutEnabled(false, CLOSED_MESSAGE);
    return;
  }

  // Se reabriu, limpa a mensagem fixa de fechado
  if (checkoutMessage?.textContent === CLOSED_MESSAGE) setCheckoutMessage("");

  if (!cart.length) {
    btn.disabled = true;
    btn.textContent = "Adicione itens";
    return;
  }

  const minimo = Number(activeCardapio?.pedido_minimo || 0);
  const subtotal = calculateSubtotal();
  if (minimo > 0 && subtotal < minimo) {
    btn.disabled = true;
    btn.textContent = "Atingir pedido minimo";
    return;
  }

  btn.disabled = false;
  btn.textContent = btn.dataset.originalText || "Finalizar pedido";
}

function setHeaderState(title, subtitle) {
  if (cardapioNomeEl) cardapioNomeEl.textContent = title;
  if (typeof subtitle === "string" && cardapioSubtitle) cardapioSubtitle.textContent = subtitle;
}

function getSlugFromUrl() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const cardapioIndex = segments.findIndex((segment) => segment === "cardapio");
  const slugSegment = cardapioIndex >= 0 ? segments[cardapioIndex + 1] : "";

  if (slugSegment && slugSegment !== "index.html") return slugSegment;

  const querySlug = new URLSearchParams(window.location.search).get("slug");
  return querySlug || "";
}

function setThemeColor(color) {
  const root = document.documentElement;
  root.style.setProperty("--theme", color || "#ff6a00");
}

function setSecondaryColor(color) {
  const root = document.documentElement;
  root.style.setProperty("--theme2", color || "#c8945b");
}

const FONT_STACKS = {
  sora: '"Sora", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  inter: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  poppins: '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  montserrat: '"Montserrat", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  nunito: '"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  rubik: '"Rubik", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  outfit: '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  dm_sans: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  work_sans: '"Work Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  lora: '"Lora", Georgia, "Times New Roman", Times, serif',
  merriweather: '"Merriweather", Georgia, "Times New Roman", Times, serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
};

function toFontWeight(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 200 || n > 900) return fallback;
  return n;
}

function applyFontSettings(cardapio) {
  const key = safeText(cardapio?.fonte_key) || "sora";
  const stack = FONT_STACKS[key] || FONT_STACKS.sora;
  document.documentElement.style.setProperty("--font", stack);

  const pesoTexto = toFontWeight(cardapio?.fonte_peso_texto, 400);
  const pesoTitulo = toFontWeight(cardapio?.fonte_peso_titulo, 800);
  document.documentElement.style.setProperty("--font-weight", String(pesoTexto));
  document.documentElement.style.setProperty("--heading-weight", String(pesoTitulo));
}

function setOptionalVar(name, value) {
  const v = safeText(value);
  if (!v) return;
  document.documentElement.style.setProperty(name, v);
}

function applyBackgroundStyle(cardapio) {
  const estilo = safeText(cardapio?.fundo_estilo) || "padrao";
  document.body.classList.remove("bg-solid", "bg-linear", "bg-radial");

  if (estilo === "solido") {
    document.body.classList.add("bg-solid");
    setOptionalVar("--bg", cardapio?.cor_fundo);
    return;
  }

  if (estilo === "degrade_linear") {
    document.body.classList.add("bg-linear");
    setOptionalVar("--bg", cardapio?.cor_fundo);
    setOptionalVar("--bg1", cardapio?.fundo_cor_1 || cardapio?.cor_tema);
    setOptionalVar("--bg2", cardapio?.fundo_cor_2);
    const angle = Number(cardapio?.fundo_angulo ?? 135);
    document.documentElement.style.setProperty("--bg-angle", String(Number.isFinite(angle) ? angle : 135));
    return;
  }

  if (estilo === "degrade_radial") {
    document.body.classList.add("bg-radial");
    setOptionalVar("--bg", cardapio?.cor_fundo);
    setOptionalVar("--bg1", cardapio?.fundo_cor_1 || cardapio?.cor_tema);
    setOptionalVar("--bg2", cardapio?.fundo_cor_2);
    return;
  }
}

function hexToRgb(hex) {
  const raw = safeText(hex);
  if (!raw.startsWith("#")) return null;
  const h = raw.slice(1);
  if (h.length === 3) {
    const r = Number.parseInt(h[0] + h[0], 16);
    const g = Number.parseInt(h[1] + h[1], 16);
    const b = Number.parseInt(h[2] + h[2], 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  return null;
}

function relativeLuminance({ r, g, b }) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function applyAutoContrastClass() {
  const root = document.documentElement;
  const styles = window.getComputedStyle(root);
  const surface = hexToRgb(styles.getPropertyValue("--surface").trim());
  const bg = hexToRgb(styles.getPropertyValue("--bg").trim());

  const surfaceLum = surface ? relativeLuminance(surface) : 1;
  const bgLum = bg ? relativeLuminance(bg) : 1;
  const isDark = Math.min(surfaceLum, bgLum) < 0.22;
  document.body.classList.toggle("theme-dark", isDark);
}

function setTotalLineValue(el, label, valueText) {
  if (!el) return;
  const labelEl = el.querySelector("[data-label]");
  const valueEl = el.querySelector("[data-value]");
  if (labelEl) labelEl.textContent = label;
  if (valueEl) valueEl.textContent = valueText;
  if (!labelEl || !valueEl) el.textContent = `${label}: ${valueText}`;
}

function safeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function safeImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  return safeHttpUrl(raw);
}

function upsertHeadLink(rel, href, extra = {}) {
  const safeHref = safeHttpUrl(href);
  if (!safeHref) return;

  const head = document.head || document.querySelector("head");
  if (!head) return;

  const selector = `link[rel="${CSS.escape(rel)}"]`;
  let link = head.querySelector(selector);
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", rel);
    head.appendChild(link);
  }

  link.setAttribute("href", safeHref);
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) continue;
    link.setAttribute(key, String(value));
  }
}

function setHeadIcons(iconHref, appleHref) {
  const safeIcon = safeHttpUrl(iconHref);
  const safeApple = safeHttpUrl(appleHref);
  if (!safeIcon && !safeApple) return;

  const head = document.head || document.querySelector("head");
  if (!head) return;

  const iconNodes = head.querySelectorAll('link[rel="icon"]');
  iconNodes.forEach((node) => {
    if (!safeIcon) return;
    node.setAttribute("href", safeIcon);
    node.setAttribute("type", "image/svg+xml");
    node.removeAttribute("sizes");
  });

  const appleNodes = head.querySelectorAll('link[rel="apple-touch-icon"]');
  appleNodes.forEach((node) => {
    if (!safeApple) return;
    node.setAttribute("href", safeApple);
    node.removeAttribute("type");
    node.removeAttribute("sizes");
  });

  if (safeIcon) upsertHeadLink("icon", safeIcon, { type: "image/svg+xml" });
  if (safeApple) upsertHeadLink("apple-touch-icon", safeApple);
}

function applyBrandIcons(slug) {
  const safeSlug = safeText(slug).toLowerCase();
  if (!safeSlug) return;

  const cacheBust = Date.now();
  const iconUrl = `/api/icon?slug=${encodeURIComponent(safeSlug)}&format=svg&v=${cacheBust}`;
  const appleUrl = `/api/icon?slug=${encodeURIComponent(safeSlug)}&v=${cacheBust}`;
  setHeadIcons(new URL(iconUrl, window.location.origin).toString(), new URL(appleUrl, window.location.origin).toString());
}

function parseGaleriaUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => safeHttpUrl(v)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => safeHttpUrl(v)).filter(Boolean);
  } catch {
    return [];
  }
}

function renderGaleria(urls) {
  if (!galeriaWrap || !galeriaEl) return;
  const list = (Array.isArray(urls) ? urls : []).map((u) => safeHttpUrl(u)).filter(Boolean);
  galeriaWrap.classList.toggle("is-hidden", list.length === 0);
  if (!list.length) {
    galeriaEl.innerHTML = "";
    return;
  }
  galeriaEl.innerHTML = list
    .map((url, idx) => `<img src="${url}" alt="Imagem do estabelecimento ${idx + 1}" loading="lazy" decoding="async" />`)
    .join("");
}

function parsePayments(text) {
  return safeText(text)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTipoPedido() {
  const value = String(tipoPedidoSelect?.value || "entrega");
  return value === "retirada" ? "retirada" : "entrega";
}

function getTaxaEntregaAtual() {
  if (!activeCardapio) return 0;
  const tipo = getTipoPedido();
  if (tipo === "retirada") return 0;
  const taxa = Number(activeCardapio.taxa_entrega || 0);
  return Number.isFinite(taxa) ? taxa : 0;
}

function maskTelefone(value) {
  // Máscara simples: aceita 10 ou 11 dígitos sem travar.
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits.length) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const CLOSED_MESSAGE = "A loja está fechada no momento.";

function parseTimeToMinutes(hhmm) {
  const raw = safeText(hhmm);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isOpenNow(cardapio, date = new Date()) {
  const start = parseTimeToMinutes(cardapio?.abre_em);
  const end = parseTimeToMinutes(cardapio?.fecha_em);

  // Se não configurou horários, considera aberto (não bloqueia pedidos)
  if (start == null || end == null) return true;

  const minutesNow = date.getHours() * 60 + date.getMinutes();

  // Mesmo horário -> trata como sempre fechado (evita ambiguidade)
  if (start === end) return false;

  // Normal: 09:00 -> 18:00
  if (start < end) return minutesNow >= start && minutesNow < end;

  // Virando a meia-noite: 18:00 -> 02:00
  return minutesNow >= start || minutesNow < end;
}

function setCheckoutEnabled(enabled, reasonText = "") {
  const btn = checkoutForm?.querySelector('button[type="submit"]');
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = !enabled;

    if (!btn.dataset.originalText) {
      btn.dataset.originalText = btn.textContent || "";
    }

    if (!enabled && reasonText === CLOSED_MESSAGE) {
      btn.textContent = "Fechado no momento";
    } else if (enabled) {
      btn.textContent = btn.dataset.originalText || "Finalizar pedido";
    }
  }
  if (!enabled && reasonText) setCheckoutMessage(reasonText, true);
  if (enabled && checkoutMessage?.textContent === CLOSED_MESSAGE) setCheckoutMessage("");
}

function isNomeCompleto(nome) {
  const parts = nome
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length >= 2;
}

function setCheckoutMessage(text, isError = false) {
  checkoutMessage.textContent = text;
  checkoutMessage.style.color = isError ? "#cc3a2d" : "#1f8f5f";
}

function pulseCart() {
  if (!cartBox) return;
  cartBox.classList.remove("cart-pulse");
  // Força reflow pra reiniciar a animação
  void cartBox.offsetHeight;
  cartBox.classList.add("cart-pulse");
  window.setTimeout(() => cartBox.classList.remove("cart-pulse"), 320);
}

function updateOpenClosedUI() {
  if (!activeCardapio) return;
  const abertoAgora = isOpenNow(activeCardapio);

  if (cardapioStatus) {
    cardapioStatus.classList.remove("is-hidden", "is-open", "is-closed");
    cardapioStatus.classList.add(abertoAgora ? "is-open" : "is-closed");
    cardapioStatus.textContent = abertoAgora ? "Aberto agora" : "Fechado agora";
  }

  updateCheckoutAvailability();

  const whatsappNumber = onlyDigits(activeCardapio?.whatsapp);
  const waBaseLink = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "";
  const botao = safeText(activeCardapio?.whatsapp_botao) || "flutuante";
  if (whatsappFab) {
    whatsappFab.classList.toggle("is-hidden", !(waBaseLink && botao === "flutuante" && abertoAgora));
  }
}

function renderCategorias() {
  const container = document.querySelector("#categories");
  if (!container) return;

  const cats = ["Todos", ...new Set(activeProdutos.map(p => p.categoria).filter(Boolean))];
  
  container.innerHTML = cats.map(cat => `
    <button type="button" class="category-btn ${activeCategory === cat ? 'active' : ''}" data-category="${cat}">
      ${cat}
    </button>
  `).join("");

  container.querySelectorAll(".category-btn").forEach(btn => {
    btn.onclick = () => {
      activeCategory = btn.dataset.category;
      filteredProdutos = activeCategory === "Todos" 
        ? activeProdutos 
        : activeProdutos.filter(p => p.categoria === activeCategory);
      
      renderCategorias();
      renderProdutos();
    };
  });
}

function renderProdutos() {
  const container = document.querySelector("#produtos");
  const list = filteredProdutos.length > 0 ? filteredProdutos : activeProdutos;
  
  if (activeProdutos.length === 0) {
    container.innerHTML = '<p class="muted">Nenhum produto disponível neste cardápio.</p>';
    return;
  }

  // Se tem termo de busca ou categoria mas não achou nada
  if (list.length === 0) {
    container.innerHTML = '<p class="muted">Nenhum produto encontrado.</p>';
    return;
  }

  const deadlinePassed = isMarmitaDeadlinePassed(activeCardapio);
  const catalogo = isCatalogMode(activeCardapio);

  if (deadlinePassed && !catalogo) {
    const alert = document.createElement("div");
    alert.style = "background:#fff5f5; color:#c53030; padding:16px; border-radius:12px; margin-bottom:20px; border:1px solid #feb2b2; text-align:center;";
    alert.innerHTML = `<strong>⚠️ Horário encerrado:</strong> Já passamos do horário limite (${activeCardapio.marmita_deadline.slice(0,5)}) para pedidos de hoje.`;
    container.prepend(alert);
  }

  container.innerHTML = list
    .map(
      (produto) => {
        const nome = escapeHtml(produto.nome);
        const categoria = escapeHtml(produto.categoria || "");
        const descricao = escapeHtml(produto.descricao || "");
        const imageUrl = safeImageUrl(produto.imagem_url) ||
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";
        const disponivel = produto.disponivel !== false;
        return `
      <article class="produto-card ${!disponivel ? 'is-sold-out' : ''}" data-id="${produto.id}">
        <div class="produto-media js-open-lightbox" data-url="${imageUrl}" role="button" tabindex="0" aria-label="Ver imagem de ${nome}">
          <img src="${imageUrl}" alt="${nome}" loading="lazy" decoding="async" style="${!disponivel ? 'filter: grayscale(1); opacity: 0.6;' : ''}" />
          ${!disponivel ? '<span class="sold-out-badge">Esgotado</span>' : ''}
        </div>
        <div class="produto-body">
          <h3 class="js-open-produto-modal" data-id="${produto.id}" style="cursor:pointer">${nome}</h3>
          ${categoria ? `<p class="muted"><strong>${categoria}</strong></p>` : ""}
          ${descricao ? `<p class="muted">${descricao}</p>` : ""}
          <p class="price">${formatPriceBRL(produto.preco)}</p>
          ${
            catalogo
              ? ""
              : (disponivel && !deadlinePassed)
                ? `<button type="button" class="btn btn-primary add-to-cart" data-id="${produto.id}">Adicionar ao pedido</button>`
                : `<button type="button" class="btn btn-disabled" disabled>${deadlinePassed ? 'Horário Encerrado' : 'Indisponível'}</button>`
          }
        </div>
      </article>
    `;
      }
    )
    .join("");
}

function renderSkeletons() {
  const container = document.querySelector("#produtos");
  container.innerHTML = Array(6).fill(0).map(() => `
    <article class="produto-card is-skeleton">
      <div class="produto-media skeleton"></div>
      <div class="produto-body">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-price"></div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    </article>
  `).join("");
}

function renderCategories() {
  if (!categoriesContainer) return;
  const categories = ["Todos", ...new Set(activeProdutos.map(p => p.categoria).filter(Boolean))];
  
  categoriesContainer.innerHTML = categories
    .map(cat => `
      <button class="category-pill ${activeCategory === cat ? 'active' : ''}" data-category="${cat}">
        ${cat}
      </button>
    `)
    .join("");

  categoriesContainer.querySelectorAll(".category-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.category;
      applyFilters();
      renderCategories();
    });
  });
}

function applyFilters() {
  const term = normalizarTexto(searchInput?.value || "");
  
  filteredProdutos = activeProdutos.filter(p => {
    const matchCategory = activeCategory === "Todos" || p.categoria === activeCategory;
    const matchSearch = !term || normalizarTexto(p.nome).includes(term) || normalizarTexto(p.descricao || "").includes(term) || normalizarTexto(p.categoria || "").includes(term);
    return matchCategory && matchSearch;
  });
  
  renderProdutos();
}

function normalizarTexto(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function initSearch() {
  searchInput?.addEventListener("input", () => {
    applyFilters();
  });
}

function initLightbox() {
  if (!lightbox || !lightboxImage || !lightboxClose) return;

  document.body.addEventListener("click", (e) => {
    const target = e.target.closest(".js-open-lightbox");
    if (target) {
      const url = target.dataset.url;
      lightboxImage.src = url;
      lightbox.classList.add("active");
      document.body.classList.add("modal-open");
    }
  });

  const close = () => {
    lightbox.classList.remove("active");
    document.body.classList.remove("modal-open");
  };

  lightboxClose.addEventListener("click", close);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) close();
  });
}

function animateAddToCart(btn) {
  const rect = btn.getBoundingClientRect();
  const cartIcon = document.querySelector(".cart-box h2");
  const cartRect = cartIcon.getBoundingClientRect();

  const flying = document.createElement("div");
  flying.className = "flying-item";
  flying.innerHTML = "🛒";
  flying.style.left = `${rect.left + rect.width / 2 - 20}px`;
  flying.style.top = `${rect.top + rect.height / 2 - 20}px`;

  document.body.appendChild(flying);

  requestAnimationFrame(() => {
    flying.style.left = `${cartRect.left + cartRect.width / 2 - 20}px`;
    flying.style.top = `${cartRect.top + cartRect.height / 2 - 20}px`;
    flying.style.transform = "scale(0.5)";
    flying.style.opacity = "0";
  });

  setTimeout(() => {
    flying.remove();
    pulseCart();
  }, 600);
}

function ensureProdutoModal() {
  if (produtoModal) return produtoModal;

  const root = document.createElement("div");
  root.id = "produto-modal";
  root.className = "produto-modal is-hidden";
  root.innerHTML = `
    <div class="produto-modal-backdrop" data-close-modal="true"></div>
    <div class="produto-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="produto-modal-title">
      <button type="button" class="produto-modal-close" data-close-modal="true" aria-label="Fechar detalhes">×</button>
      <img id="produto-modal-image" class="produto-modal-image" alt="" loading="lazy" decoding="async" />
      <div class="produto-modal-body">
        <h3 id="produto-modal-title"></h3>
        <p id="produto-modal-categoria" class="muted is-hidden"></p>
        <p id="produto-modal-descricao" class="muted is-hidden"></p>
        <p id="produto-modal-preco" class="price"></p>
        
        <div id="produto-modal-sizes" class="produto-sizes is-hidden">
          <p class="sizes-label">Escolha o tamanho:</p>
          <div class="sizes-grid"></div>
        </div>

        <div id="produto-modal-options" class="produto-options is-hidden">
          <!-- Grupos de opções via JS -->
        </div>

        <div class="modal-footer">
          <button type="button" id="produto-modal-add" class="btn btn-primary btn-block">Adicionar ao pedido</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const imageEl = root.querySelector("#produto-modal-image");
  const titleEl = root.querySelector("#produto-modal-title");
  const categoriaEl = root.querySelector("#produto-modal-categoria");
  const descricaoEl = root.querySelector("#produto-modal-descricao");
  const precoEl = root.querySelector("#produto-modal-preco");

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.closeModal === "true") {
      closeProdutoModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && produtoModal && !produtoModal.root.classList.contains("is-hidden")) {
      closeProdutoModal();
    }
  });

  const sizesEl = root.querySelector("#produto-modal-sizes");
  const optionsEl = root.querySelector("#produto-modal-options");
  const addBtn = root.querySelector("#produto-modal-add");

  produtoModal = {
    root,
    imageEl,
    titleEl,
    categoriaEl,
    descricaoEl,
    precoEl,
    sizesEl,
    optionsEl,
    addBtn,
    selectedProdutoId: null,
    selectedSize: null
  };

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (produtoModal.selectedProdutoId) {
        const selectedOptions = captureSelectedOptions();
        const validation = validateOptions(selectedOptions);
        
        if (!validation.ok) {
          toast(validation.message, "error");
          return;
        }

        addToCart(produtoModal.selectedProdutoId, addBtn, produtoModal.selectedSize, selectedOptions);
        closeProdutoModal();
      }
    });
  }

  return produtoModal;
}

function closeProdutoModal() {
  if (!produtoModal) return;
  produtoModal.root.classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}

function openProdutoModal(produtoId) {
  const selected = activeProdutos.find((item) => String(item.id) === String(produtoId || ""));
  if (!selected) return;

  const modal = ensureProdutoModal();
  if (!(modal.imageEl instanceof HTMLImageElement)) return;
  if (!(modal.titleEl instanceof HTMLElement)) return;
  if (!(modal.categoriaEl instanceof HTMLElement)) return;
  if (!(modal.descricaoEl instanceof HTMLElement)) return;
  if (!(modal.precoEl instanceof HTMLElement)) return;

  const nome = safeText(selected.nome) || "Produto";
  const categoria = safeText(selected.categoria);
  const descricao = safeText(selected.descricao);
  const imageUrl =
    safeImageUrl(selected.imagem_url) ||
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80";

  modal.imageEl.src = imageUrl;
  modal.imageEl.alt = nome;
  modal.titleEl.textContent = nome;
  modal.precoEl.textContent = formatPriceBRL(selected.preco);

  modal.categoriaEl.textContent = categoria;
  modal.categoriaEl.classList.toggle("is-hidden", !categoria);

  modal.descricaoEl.textContent = descricao;
  modal.descricaoEl.classList.toggle("is-hidden", !descricao);

  modal.selectedProdutoId = selected.id;
  modal.selectedSize = null;

  const precos = selected.precos || {};
  const hasSizes = Object.keys(precos).length > 0;

  if (modal.sizesEl) {
    modal.sizesEl.classList.toggle("is-hidden", !hasSizes);
    const grid = modal.sizesEl.querySelector(".sizes-grid");
    if (grid) {
      if (hasSizes) {
        const sizes = Object.entries(precos);
        grid.innerHTML = sizes.map(([size, price]) => `
          <label class="size-option">
            <input type="radio" name="modal_size" value="${size}" data-price="${price}">
            <span class="size-name">${size}</span>
            <span class="size-price">${formatPriceBRL(price)}</span>
          </label>
        `).join("");

        grid.querySelectorAll('input[name="modal_size"]').forEach(input => {
          input.addEventListener("change", () => {
            modal.selectedSize = input.value;
            modal.precoEl.textContent = formatPriceBRL(input.dataset.price);
          });
        });

        // Seleciona o primeiro por padrão ou deixa vazio se preferir
        const first = grid.querySelector('input[name="modal_size"]');
        if (first instanceof HTMLInputElement) {
          first.checked = true;
          modal.selectedSize = first.value;
          modal.precoEl.textContent = formatPriceBRL(first.dataset.price);
        }
      } else {
        grid.innerHTML = "";
      }
    }
  }

  if (modal.addBtn) {
    modal.addBtn.classList.toggle("is-hidden", isCatalogMode(activeCardapio));
  }

  // Renderizar Opções
  if (modal.optionsEl) {
    const opcoes = selected.opcoes || [];
    modal.optionsEl.classList.toggle("is-hidden", !opcoes.length);
    if (opcoes.length) {
      modal.optionsEl.innerHTML = opcoes.map((group, gIdx) => `
        <div class="option-group" data-gidx="${gIdx}" data-min="${group.min}" data-max="${group.max}">
          <div class="option-group-header">
            <span class="option-group-title">${escapeHtml(group.titulo)}</span>
            <span class="option-group-badge">${group.min > 0 ? `Obrigatório (mín. ${group.min})` : `Opcional (máx. ${group.max})`}</span>
          </div>
          <div class="option-items">
            ${(group.itens || []).map((item, iIdx) => `
              <label class="option-item">
                <input type="${group.max === 1 && group.min === 1 ? 'radio' : 'checkbox'}" name="group_${gIdx}" value="${escapeHtml(item)}">
                <span class="option-name">${escapeHtml(item)}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `).join("");
    }
  }

  modal.root.classList.remove("is-hidden");
  document.body.classList.add("modal-open");
}

function applyCardapioModeUI() {
  const catalogo = isCatalogMode(activeCardapio);
  const marmita = isMarmitaMode(activeCardapio);
  document.body.classList.toggle("modo-catalogo", catalogo);
  document.body.classList.toggle("modo-marmita", marmita);

  if (catalogo && cardapioSubtitle && activeCardapio) {
    const slogan = safeText(activeCardapio.slogan);
    if (!slogan) {
      cardapioSubtitle.textContent = "Veja os produtos e os valores.";
    }
  }

  // Modo Marmita: configura checkout específico
  if (marmita) {
    applyMarmitaModeCheckout();
  }
}

function applyMarmitaModeCheckout() {
  const aceitaEntrega = Boolean(activeCardapio?.aceita_entrega ?? true);
  const aceitaRetirada = Boolean(activeCardapio?.aceita_retirada ?? true);

  // Se aceita os dois, mostra o seletor. Se não, oculta e força o correto.
  if (tipoPedidoWrap) {
    tipoPedidoWrap.classList.toggle("is-hidden", !(aceitaEntrega && aceitaRetirada));
  }

  updateAddressVisibility();
  
  // Adicionar campo de agendamento se habilitado
  if (isMarmitaAgendamentoMode(activeCardapio)) {
    addMarmitaAgendamentoField();
  }
}

function addMarmitaAgendamentoField() {
  let agendamentoWrap = document.getElementById("marmita-agendamento-wrap");
  
  if (agendamentoWrap) return; // Já existe

  // Criar campo de agendamento antes do pagamento
  const pagamentoLabel = pagamentoWrap?.closest("label");
  if (pagamentoLabel) {
    const horarios = parseMarmitaHorarios(activeCardapio?.marmita_horarios_retirada);
    const diasSemana = parseMarmitaDias(activeCardapio?.marmita_dias_semana);
    
    const options = horarios.map(h => 
      `<option value="${h}">${h}</option>`
    ).join("");

    agendamentoWrap = document.createElement("div");
    agendamentoWrap.id = "marmita-agendamento-wrap";
    agendamentoWrap.className = "field";
    agendamentoWrap.innerHTML = `
      <label for="marmita_horario">🕐 Horário de Retirada</label>
      <select name="marmita_horario" id="marmita_horario" required>
        <option value="">Selecione um horário</option>
        ${options}
      </select>
      <small class="help">Escolha o melhor horário para retirar seu pedido</small>
    `;
    
    pagamentoLabel.parentNode?.insertBefore(agendamentoWrap, pagamentoLabel);
  }
}

function parseMarmitaHorarios(horariosStr) {
  if (!horariosStr) return ["11:00", "11:30", "12:00", "12:30", "13:00"];
  return horariosStr.split(",").map(h => h.trim()).filter(h => h);
}

function parseMarmitaDias(diasStr) {
  if (!diasStr) return [1, 2, 3, 4, 5];
  return diasStr.split(",").map(d => parseInt(d.trim())).filter(d => !isNaN(d));
}

function calculateTotal() {
  const subtotal = cart.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
  return subtotal + getTaxaEntregaAtual();
}

function calculateSubtotal() {
  return cart.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
}

function renderCart() {
  if (!cart.length) {
    cartItemsContainer.innerHTML = '<p class="muted">Seu carrinho está vazio.</p>';
    setTotalLineValue(cartSubtotal, "Subtotal", "R$ 0,00");
    if (cartTaxa) cartTaxa.classList.add("is-hidden");
    if (cartMinimo) cartMinimo.classList.add("is-hidden");
    setTotalLineValue(cartTotal, "Total", "R$ 0,00");
    updateCheckoutAvailability();
    return;
  }

  cartItemsContainer.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <div class="cart-item-main">
          <div class="cart-item-title">
            <span class="cart-qty">${item.quantidade}x</span>
            <span class="cart-name">${escapeHtml(item.nome)}${item.size ? ` (${item.size})` : ""}</span>
          </div>
          ${item.options?.length ? `
            <div class="cart-item-options muted">
              ${item.options.map(o => `<span>${o.itens.join(", ")}</span>`).join("")}
            </div>
          ` : ""}
          <div class="cart-item-sub">
            <span class="cart-price">${formatPriceBRL(item.preco * item.quantidade)}</span>
          </div>
        </div>
        <button class="btn btn-ghost remove-item" data-id="${item.cartKey}" aria-label="Remover 1 unidade de ${escapeHtml(item.nome)}">Remover 1</button>
      </div>
    `
    )
    .join("");

  const subtotal = calculateSubtotal();
  const taxa = getTaxaEntregaAtual();
  setTotalLineValue(cartSubtotal, "Subtotal", formatPriceBRL(subtotal));

  if (cartTaxa) {
    if (taxa > 0) {
      setTotalLineValue(cartTaxa, "Taxa de entrega", formatPriceBRL(taxa));
      cartTaxa.classList.remove("is-hidden");
    } else {
      cartTaxa.classList.add("is-hidden");
    }
  }

  if (cartMinimo && activeCardapio) {
    const minimo = Number(activeCardapio.pedido_minimo || 0);
    if (minimo > 0) {
      cartMinimo.textContent = `Pedido mínimo: ${formatPriceBRL(minimo)}`;
      cartMinimo.classList.remove("is-hidden");
    } else {
      cartMinimo.classList.add("is-hidden");
    }
  }

function animateAddToCart(button) {
  const cartIcon = document.querySelector(".btn-cart-float") || document.querySelector("#cart-btn");
  if (!cartIcon) return;

  const btnRect = button.getBoundingClientRect();
  const cartRect = cartIcon.getBoundingClientRect();

  const flyer = document.createElement("div");
  flyer.className = "flying-icon";
  flyer.innerHTML = "🛍️";
  flyer.style.left = `${btnRect.left + btnRect.width / 2}px`;
  flyer.style.top = `${btnRect.top + btnRect.height / 2}px`;
  document.body.appendChild(flyer);

  flyer.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: `translate(${cartRect.left - btnRect.left}px, ${cartRect.top - btnRect.top}px) scale(0.2)`, opacity: 0 }
  ], {
    duration: 600,
    easing: "cubic-bezier(0.42, 0, 0.58, 1)"
  }).onfinish = () => flyer.remove();
}

  setTotalLineValue(cartTotal, "Total", formatPriceBRL(calculateTotal()));

  updateCheckoutAvailability();
}

function addToCart(produtoId, buttonElement, size = null, options = []) {
  const selected = activeProdutos.find((item) => item.id === produtoId);
  if (!selected) return;

  // Verificação de Estoque
  if (selected.estoque_diario !== null) {
    const totalVendido = calculateVendidos(selected.id);
    if (totalVendido >= selected.estoque_diario) {
      toast("Este item esgotou por hoje.", "error");
      return;
    }
  }

  const preco = size && selected.precos?.[size] ? Number(selected.precos[size]) : Number(selected.preco);
  const optionsKey = options.map(o => `${o.grupo}:${o.itens.join(",")}`).join("|");
  const cartKey = `${produtoId}-${size || 'default'}-${optionsKey}`;

  const existing = cart.find((item) => item.cartKey === cartKey);
  if (existing) {
    existing.quantidade += 1;
  } else {
    cart.push({
      id: selected.id,
      cartKey,
      nome: selected.nome,
      size,
      options,
      preco: preco,
      quantidade: 1
    });
  }

  if (buttonElement) animateAddToCart(buttonElement);
  renderCart();
  pulseCart();

  if (buttonElement instanceof HTMLElement) {
    buttonElement.classList.add("flash");
    setTimeout(() => buttonElement.classList.remove("flash"), 300);

    if (buttonElement instanceof HTMLButtonElement) {
      if (!buttonElement.dataset.originalText) {
        buttonElement.dataset.originalText = buttonElement.textContent || "";
      }
      buttonElement.textContent = "Adicionado";
      window.setTimeout(() => {
        buttonElement.textContent = buttonElement.dataset.originalText || "Adicionar ao pedido";
      }, 520);
    }
  }
}

function removeFromCart(cartKey) {
  const index = cart.findIndex((item) => item.cartKey === cartKey);
  if (index < 0) return;

  if (cart[index].quantidade > 1) {
    cart[index].quantidade -= 1;
  } else {
    cart.splice(index, 1);
  }

  renderCart();
  pulseCart();
}

function buildWhatsappMessage({ nome, telefone, endereco }) {
  const subtotal = calculateSubtotal();
  const taxaEntrega = getTaxaEntregaAtual();
  const total = subtotal + taxaEntrega;
  const tipoPedido = getTipoPedido();
  const tipoPedidoLabel = tipoPedido === "retirada" ? "Retirada" : "Entrega";
  const pagamento = String(pagamentoSelect?.value || "").trim();
  const marmita = isMarmitaMode(activeCardapio);
  const agendamentoEl = document.getElementById("marmita_horario");
  const horarioRetirada = agendamentoEl?.value || "";

  const itensTexto = cart
    .map((item) => {
      const totalItem = item.preco * item.quantidade;
      const unit = formatPriceBRL(item.preco);
      const totalLine = formatPriceBRL(totalItem);
      const sizeLabel = item.size ? ` (${item.size})` : "";
      let txt = `- ${item.quantidade}x ${item.nome}${sizeLabel} (${unit}) = ${totalLine}`;
      if (item.options?.length) {
        item.options.forEach(o => {
          txt += `\n  - ${o.grupo}: ${o.itens.join(", ")}`;
        });
      }
      return txt;
    })
    .join("\n");

  const template = safeText(activeCardapio?.mensagem_whatsapp_template);
  const templateCorrompido = template.includes("\uFFFD") || template.includes("�");
  if (template && !templateCorrompido) {
    const resolvedEndereco = tipoPedido === "retirada" ? "Retirada no balcão" : endereco;
    const vars = {
      LOJA: activeCardapio.nome,
      ITENS: itensTexto,
      SUBTOTAL: formatPriceBRL(subtotal),
      TAXA_ENTREGA: formatPriceBRL(taxaEntrega),
      TOTAL: formatPriceBRL(total),
      NOME: nome,
      TELEFONE: telefone,
      ENDERECO: resolvedEndereco || "Não informado",
      TIPO_PEDIDO: tipoPedidoLabel,
      PAGAMENTO: pagamento || "Não informado"
    };

    const replaceVars = (input) =>
      String(input)
        .replaceAll("\\n", "\n")
        .replaceAll("\r\n", "\n")
        .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}|\{\s*([a-z0-9_]+)\s*\}/gi, (match, p1, p2) => {
          const rawKey = String(p1 || p2 || "");
          const key = rawKey.trim().toUpperCase();
          if (!key) return match;
          if (!(key in vars)) return match;
          return String(vars[key]);
        });

    return replaceVars(template);
  }

  const enderecoLinha = tipoPedido === "retirada" ? "Retirada no balcão" : endereco;

  const defaultTemplate = [
    `*Novo pedido - ${activeCardapio.nome}*`,
    "-------------------------",
    "RESUMO",
    `Tipo: ${tipoPedidoLabel}`,
    `Pagamento: ${pagamento || "Nao informado"}`,
    "",
    "CLIENTE",
    `Nome: ${nome}`,
    `Telefone: ${telefone}`,
    "",
    "ENDERECO",
    `${enderecoLinha || "Nao informado"}`,
    "",
    ...(marmita && horarioRetirada ? ["RETIRADA", `Horário: ${horarioRetirada}`, ""] : []),
    "ITENS",
    itensTexto,
    "",
    "VALORES",
    `Subtotal: ${formatPriceBRL(subtotal)}`,
    ...(marmita ? [] : [`Taxa de entrega: ${formatPriceBRL(taxaEntrega)}`]),
    `TOTAL: ${formatPriceBRL(total)}`
  ];

  return defaultTemplate.join("\n");

  // (template padrão acima já retorna)
}

async function savePedido({ nome, telefone, endereco }) {
  const payload = {
    cardapio_id: activeCardapio.id,
    nome_cliente: nome,
    telefone,
    endereco,
    itens: cart.map((item) => ({
      produto_id: item.id,
      nome: item.nome,
      tamanho: item.size || null,
      quantidade: item.quantidade,
      preco_unitario: item.preco
    }))
  };

  const { error } = await supabase.from("pedidos").insert(payload);
  if (error) throw error;
}

async function loadCardapio() {
  let slug = getSlugFromUrl();
  slug = slug.trim().toLowerCase();

  if (!slug) {
    setHeaderState("Cardápio inválido", "Acesse este cardápio por /cardapio/seu-slug.");
    produtosContainer.innerHTML = '<p class="muted">Acesse este cardápio por /cardapio/seu-slug</p>';
    return;
  }

  if (!supabase) {
    setHeaderState("Falha ao carregar", "Não foi possível iniciar o Supabase neste navegador.");
    produtosContainer.innerHTML = '<p class="muted">Falha ao carregar a biblioteca do Supabase. Verifique sua conexão e bloqueadores (adblock/firewall) e recarregue.</p>';
    return;
  }

  const { data, error } = await withTimeout(
    supabase.from("cardapios").select("*").eq("slug", slug).single(),
    12_000,
    "Carregamento do cardápio"
  );

  if (error || !data) {
    setHeaderState("Cardápio não encontrado", "Verifique o link e tente novamente.");
    produtosContainer.innerHTML = '<p class="muted">Cardápio não encontrado para o slug informado.</p>';
    return;
  }

  activeCardapio = data;

  // Dono: botão secreto de edição
  const ownerBtn = document.getElementById("owner-edit-btn");
  let ownerBtnPin = null;
  if (ownerBtn) {
    ownerBtn.classList.add("is-hidden");
    ownerBtn.onclick = () => {
      const pin = window.prompt("Digite o PIN do proprietário para editar:");
      if (!pin) return;
      // Redireciona para a tela de edição do proprietário
      window.location.href = `/admin/owner?slug=${encodeURIComponent(slug)}&pin=${encodeURIComponent(pin)}`;
    };
    // Só mostra se habilitado
    if (data.owner_edit_enabled) {
      // Segredo: segure 2s no nome do cardápio
      const nomeEl = document.getElementById("cardapio-nome");
      let holdTimer = null;
      nomeEl?.addEventListener("mousedown", (ev) => {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          ownerBtn.classList.remove("is-hidden");
        }, 2000);
      });
      nomeEl?.addEventListener("mouseup", () => {
        if (holdTimer) clearTimeout(holdTimer);
      });
      nomeEl?.addEventListener("mouseleave", () => {
        if (holdTimer) clearTimeout(holdTimer);
      });
      // Toque longo mobile
      nomeEl?.addEventListener("touchstart", (ev) => {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          ownerBtn.classList.remove("is-hidden");
        }, 2000);
      });
      nomeEl?.addEventListener("touchend", () => {
        if (holdTimer) clearTimeout(holdTimer);
      });
      nomeEl?.addEventListener("touchcancel", () => {
        if (holdTimer) clearTimeout(holdTimer);
      });
    }
  }

  renderSkeletons();

  applyBrandIcons(getSlugFromUrl());
  renderGaleria(parseGaleriaUrls(data.galeria_urls));

  document.querySelector("#cardapio-nome").textContent = data.nome;
  setThemeColor(data.cor_tema);
  setSecondaryColor(data.cor_secundaria);
  applyFontSettings(data);

  // Overrides de cores (opcional)
  setOptionalVar("--bg", data.cor_fundo);
  setOptionalVar("--surface", data.cor_surface);
  setOptionalVar("--text", data.cor_texto);
  setOptionalVar("--muted", data.cor_muted);
  setOptionalVar("--border", data.cor_borda);
  applyBackgroundStyle(data);
  applyAutoContrastClass();

  if (cardapioSubtitle) {
    const slogan = safeText(data.slogan);
    cardapioSubtitle.textContent = slogan || "Escolha seus itens e finalize em poucos passos.";
  }

  applyCardapioModeUI();

  const horario = safeText(data.horario_funcionamento);
  const abre = safeText(data.abre_em);
  const fecha = safeText(data.fecha_em);
  const endereco = safeText(data.endereco);
  const instagram = safeText(data.instagram_url);
  const pagamentos = parsePayments(data.formas_pagamento);

  if (cardapioHorario) {
    const horarioTexto = horario || (abre && fecha ? `Horário: ${abre} às ${fecha}` : "");
    cardapioHorario.textContent = horarioTexto;
    cardapioHorario.classList.toggle("is-hidden", !horarioTexto);
  }

  updateOpenClosedUI();

  if (cardapioEndereco) {
    cardapioEndereco.textContent = endereco ? `Endereço: ${endereco}` : "";
    cardapioEndereco.classList.toggle("is-hidden", !endereco);
  }

  if (cardapioPagamentos) {
    cardapioPagamentos.textContent = pagamentos.length ? `Pagamento: ${pagamentos.join(", ")}` : "";
    cardapioPagamentos.classList.toggle("is-hidden", !pagamentos.length);
  }

  if (cardapioInstagram) {
    cardapioInstagram.href = instagram || "#";
    cardapioInstagram.classList.toggle("is-hidden", !instagram);
  }

  if (cardapioMaps) {
    const mapsUrl = endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : "";
    cardapioMaps.href = mapsUrl || "#";
    cardapioMaps.classList.toggle("is-hidden", !mapsUrl);
  }

  const whatsappNumber = onlyDigits(data.whatsapp);
  const waBaseLink = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "";
  if (cardapioWhatsappTop) {
    cardapioWhatsappTop.href = waBaseLink || "#";
  }
  if (whatsappFab) {
    whatsappFab.href = waBaseLink || "#";
  }

  const botao = safeText(data.whatsapp_botao) || "flutuante";
  if (cardapioWhatsappTop) cardapioWhatsappTop.classList.toggle("is-hidden", !(waBaseLink && botao === "topo"));
  if (whatsappFab) whatsappFab.classList.toggle("is-hidden", !(waBaseLink && botao === "flutuante"));

  // Garante que a regra de horário prevaleça (ex.: esconder o FAB quando fechado)
  updateOpenClosedUI();

  if (cardapioInfo) {
    const showInfo = Boolean(
      (cardapioStatus && !cardapioStatus.classList.contains("is-hidden")) ||
        horario ||
        abre ||
        fecha ||
        endereco ||
        instagram ||
        pagamentos.length ||
        (waBaseLink && botao === "topo")
    );
    cardapioInfo.classList.toggle("is-hidden", !showInfo);
  }

  document.body.classList.toggle("layout-lista", (data.layout_produtos || "grid") === "lista");
  document.body.classList.toggle("densidade-compacta", (data.densidade || "confortavel") === "compacta");

  if (tipoPedidoWrap && tipoPedidoSelect) {
    const aceitaEntrega = Boolean(data.aceita_entrega ?? true);
    const aceitaRetirada = Boolean(data.aceita_retirada ?? true);

    tipoPedidoWrap.classList.toggle("is-hidden", !(aceitaEntrega && aceitaRetirada));

    if (!aceitaEntrega && aceitaRetirada) tipoPedidoSelect.value = "retirada";
    if (aceitaEntrega && !aceitaRetirada) tipoPedidoSelect.value = "entrega";
  }

  // Aplica estado inicial do endereço conforme tipo
  if (enderecoWrap) enderecoWrap.classList.toggle("is-hidden", getTipoPedido() === "retirada");
  const enderecoTextarea = checkoutForm?.querySelector('textarea[name="endereco"]');
  if (enderecoTextarea instanceof HTMLTextAreaElement) {
    enderecoTextarea.required = getTipoPedido() !== "retirada";
  }

  if (pagamentoWrap && pagamentoSelect) {
    const items = pagamentos;
    if (items.length) {
      pagamentoSelect.innerHTML = items.map((p) => `<option value="${p}">${p}</option>`).join("");
      pagamentoWrap.classList.remove("is-hidden");
    } else {
      pagamentoWrap.classList.add("is-hidden");
    }
  }

  // Depois de montar os selects (tipo/pagamento), tenta aplicar novamente o draft.
  applyCheckoutDraft();

  renderCart();

  updateOpenClosedUI();

  if (!window.__OPEN_STATUS_TIMER__) {
    window.__OPEN_STATUS_TIMER__ = window.setInterval(() => {
      updateOpenClosedUI();
    }, 60_000);
  }

  if (cardapioFoto) {
    if (data.foto_url) {
      cardapioFoto.src = data.foto_url;
      cardapioFoto.alt = `Foto do ${data.nome}`;
      cardapioFoto.classList.remove("is-hidden");
    } else {
      cardapioFoto.classList.add("is-hidden");
    }
  }

  const bannerUrl = safeText(data.banner_url);
  if (bannerUrl) {
    document.documentElement.style.setProperty("--hero-banner", `url(\"${bannerUrl}\")`);
    document.documentElement.style.setProperty("--hero-banner-opacity", "0.22");
  } else {
    document.documentElement.style.setProperty("--hero-banner", "none");
  }

  const { data: produtos, error: produtosError } = await withTimeout(
    supabase.from("produtos").select("*").eq("cardapio_id", data.id).order("nome"),
    12_000,
    supabase.from("produtos").select("*").eq("cardapio_id", data.id),
  );

  if (produtosError) {
    setHeaderState(data.nome, "Não foi possível carregar os produtos.");
    produtosContainer.innerHTML = `<p class="muted">Erro ao carregar produtos: ${produtosError.message}</p>`;
    return;
  }

  activeProdutos = produtos;
    
  // Buscar resumo de vendas de hoje para estoque
  try {
    const { data: salesSummary } = await supabase.rpc("get_today_sales_summary", { p_cardapio_id: activeCardapio.id });
    if (salesSummary) {
      activeProdutos.forEach(p => {
        p.vendidos_hoje = salesSummary[p.id] || 0;
      });
    }
  } catch (e) {
    console.warn("Falha ao carregar resumo de vendas:", e);
  }

  renderCategorias();
  initSearch();
  initLightbox();
  renderProdutos();
  renderCart();
}

function captureSelectedOptions() {
  if (!produtoModal || !produtoModal.optionsEl) return [];
  
  const groups = produtoModal.optionsEl.querySelectorAll(".option-group");
  const selections = [];

  groups.forEach(group => {
    const gIdx = group.dataset.gidx;
    const title = group.querySelector(".option-group-title").textContent;
    const checked = group.querySelectorAll('input:checked');
    const itens = Array.from(checked).map(i => i.value);
    
    if (itens.length > 0) {
      selections.push({ grupo: title, itens });
    }
  });

  return selections;
}

function validateOptions(selections) {
  if (!produtoModal || !produtoModal.optionsEl) return { ok: true };
  
  const groups = produtoModal.optionsEl.querySelectorAll(".option-group");
  for (const group of groups) {
    const title = group.querySelector(".option-group-title").textContent;
    const min = parseInt(group.dataset.min);
    const max = parseInt(group.dataset.max);
    
    const selection = selections.find(s => s.grupo === title);
    const count = selection ? selection.itens.length : 0;
    
    if (count < min) {
      return { ok: false, message: `O grupo "${title}" exige no mínimo ${min} opções.` };
    }
    if (count > max) {
      return { ok: false, message: `O grupo "${title}" permite no máximo ${max} opções.` };
    }
  }
  
  return { ok: true };
}

function calculateVendidos(produtoId) {
  const selected = activeProdutos.find(p => p.id === produtoId);
  const vindoDoBanco = selected ? (selected.vendidos_hoje || 0) : 0;
  const noCarrinho = cart.filter(item => item.id === produtoId).reduce((acc, item) => acc + item.quantidade, 0);
  return vindoDoBanco + noCarrinho;
}

function attachEvents() {
  // Restaura o rascunho do checkout o quanto antes.
  applyCheckoutDraft();

  telefoneInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    target.value = maskTelefone(target.value);
    scheduleSaveCheckoutDraft();
  });

  checkoutForm?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("#checkout-form")) scheduleSaveCheckoutDraft();
  });

  checkoutForm?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("#checkout-form")) scheduleSaveCheckoutDraft();
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const modalTrigger = target.closest(".js-open-produto-modal");
    if (modalTrigger instanceof HTMLElement) {
      openProdutoModal(modalTrigger.dataset.id);
      return;
    }

    if (target.classList.contains("add-to-cart")) {
      addToCart(target.dataset.id, target);
    }

    if (target.classList.contains("remove-item")) {
      removeFromCart(target.dataset.id);
    }
  });

  document.body.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    const modalTrigger = target.closest(".js-open-produto-modal");
    if (!(modalTrigger instanceof HTMLElement)) return;

    event.preventDefault();
    openProdutoModal(modalTrigger.dataset.id);
  });

  tipoPedidoSelect?.addEventListener("change", () => {
    const tipo = getTipoPedido();
    const enderecoTextarea = checkoutForm?.querySelector('textarea[name="endereco"]');
    if (enderecoWrap) enderecoWrap.classList.toggle("is-hidden", tipo === "retirada");
    if (enderecoTextarea instanceof HTMLTextAreaElement) {
      enderecoTextarea.required = tipo !== "retirada";
      if (tipo === "retirada") enderecoTextarea.value = "";
    }
    renderCart();
    scheduleSaveCheckoutDraft();
  });

  checkoutForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setCheckoutMessage("");

    if (!activeCardapio) {
      setCheckoutMessage("Cardápio inválido.", true);
      return;
    }

    if (!isOpenNow(activeCardapio)) {
      setCheckoutMessage(CLOSED_MESSAGE, true);
      return;
    }

    if (!cart.length) {
      setCheckoutMessage("Adicione ao menos um item no pedido.", true);
      return;
    }

    const formData = new FormData(checkoutForm);
    const nome = String(formData.get("nome") || "").trim();
    const telefone = String(formData.get("telefone") || "").trim();
    const endereco = String(formData.get("endereco") || "").trim();

    // Persistimos os dados do cliente antes de qualquer reset.
    writeCheckoutDraft({
      nome,
      telefone,
      endereco,
      tipo_pedido: String(formData.get("tipo_pedido") || "").trim(),
      pagamento: String(formData.get("pagamento") || "").trim()
    });

    const tipoPedido = getTipoPedido();
    const subtotal = calculateSubtotal();
    const minimo = Number(activeCardapio?.pedido_minimo || 0);

    if (minimo > 0 && subtotal < minimo) {
      setCheckoutMessage(`Pedido mínimo é ${formatPriceBRL(minimo)}.`, true);
      return;
    }

    if (!isNomeCompleto(nome)) {
      setCheckoutMessage("Informe nome completo com pelo menos 2 palavras.", true);
      return;
    }

    if (onlyDigits(telefone).length < 10) {
      setCheckoutMessage("Informe um telefone válido no formato brasileiro.", true);
      return;
    }

    if (tipoPedido !== "retirada") {
      if (endereco.length < 8) {
        setCheckoutMessage("Informe um endereço completo.", true);
        return;
      }
    }

    try {
      await savePedido({ nome, telefone, endereco });
    } catch (error) {
      setCheckoutMessage(`Erro ao salvar pedido: ${error.message}`, true);
      return;
    }

    const whatsappNumber = onlyDigits(activeCardapio.whatsapp);
    if (!whatsappNumber) {
      setCheckoutMessage("WhatsApp do cardápio não configurado.", true);
      return;
    }

    const message = buildWhatsappMessage({ nome, telefone, endereco });
    const waLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    setCheckoutMessage("Pedido salvo. Abrindo WhatsApp...");
    window.open(waLink, "_blank");

    cart.length = 0;
    checkoutForm.reset();
    renderCart();

    // Mantém os dados preenchidos para o próximo pedido.
    applyCheckoutDraft();
  });
}

async function init() {
  try {
    try {
      assertSupabaseConfig();
    } catch (error) {
      setHeaderState("Falha ao carregar", "Verifique a configuração e tente novamente.");
      produtosContainer.innerHTML = `<p class="muted">${error.message}</p>`;
      return;
    }

    try {
      attachEvents();
    } catch (error) {
      const msg = error?.message ? String(error.message) : "Erro desconhecido";
      setHeaderState("Erro ao iniciar", "Tente recarregar a página.");
      produtosContainer.innerHTML = `<p class="muted">Erro ao iniciar: ${escapeHtml(msg)}</p>`;
      return;
    }

    try {
      await loadCardapio();
    } catch (error) {
      setHeaderState("Erro ao carregar", "Tente recarregar a página.");
      const msg = error?.message ? String(error.message) : "Erro desconhecido";
      produtosContainer.innerHTML = `<p class="muted">Erro ao carregar cardápio: ${escapeHtml(msg)}</p>`;
    }
  } finally {
    document.body.classList.remove("is-loading");
  }
}

init();
