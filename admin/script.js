import {
  assertSupabaseConfig,
  formatPriceBRL,
  onlyDigits,
  parseMoneyInput,
  slugify,
  supabase
} from "../shared/supabase.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const loginForm = document.querySelector("#login-form");
const authMessage = document.querySelector("#auth-message");

const ADMIN_PIN_SESSION_KEY = "admin.pin.ok";

function clearAdminPinSession() {
  try {
    sessionStorage.removeItem(ADMIN_PIN_SESSION_KEY);
  } catch {
    // ignore
  }
}

function isAdminPinVerified() {
  try {
    return sessionStorage.getItem(ADMIN_PIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setAdminPinVerified() {
  try {
    sessionStorage.setItem(ADMIN_PIN_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

function setDashboardVisible(visible) {
  const topbar = document.querySelector(".topbar");
  const grid = document.querySelector("main.dashboard-grid");
  if (topbar instanceof HTMLElement) topbar.style.display = visible ? "" : "none";
  if (grid instanceof HTMLElement) grid.style.display = visible ? "" : "none";
}

function mountAdminPinOverlay() {
  const existing = document.querySelector("#admin-pin-overlay");
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.id = "admin-pin-overlay";
  overlay.className = "auth-layout";
  overlay.innerHTML = `
    <section class="auth-card">
      <h1>Confirmar PIN</h1>
      <p>Digite o PIN para acessar o painel.</p>

      <form id="admin-pin-form" class="stack-gap">
        <label>
          PIN
          <input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="one-time-code" required />
        </label>
        <button type="submit" class="btn btn-primary btn-lg">Confirmar</button>
      </form>

      <p id="admin-pin-message" class="message" aria-live="polite"></p>
    </section>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

async function requireAdminPinGate() {
  if (isAdminPinVerified()) return true;

  setDashboardVisible(false);
  const overlay = mountAdminPinOverlay();

  const form = overlay.querySelector("#admin-pin-form");
  const message = overlay.querySelector("#admin-pin-message");
  const input = overlay.querySelector('input[name="pin"]');

  if (!(form instanceof HTMLFormElement) || !(message instanceof HTMLElement)) {
    toast("Falha ao iniciar validação do PIN.", "error");
    window.location.href = "/admin";
    return false;
  }

  if (input instanceof HTMLInputElement) input.focus();

  return await new Promise((resolve) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const fd = new FormData(form);
      const rawPin = String(fd.get("pin") || "").trim();
      const pin = onlyDigits(rawPin);

      if (!pin) {
        setMessage(message, "Informe o PIN.", "error");
        return;
      }

      setMessage(message, "Validando...");

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

      const { data, error } = await supabase.rpc("verify_admin_pin", { p_pin: pin });

      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;

      if (error) {
        console.error("Falha ao validar PIN (verify_admin_pin):", error);
        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

        const detail = isLocalhost
          ? [error.message, error.details, error.hint].filter(Boolean).join(" | ")
          : "";
        setMessage(
          message,
          `Não foi possível validar o PIN. ${detail ? `Erro: ${detail}` : "Verifique o schema no Supabase."}`,
          "error"
        );
        return;
      }

      if (data !== true) {
        setMessage(message, "PIN incorreto.", "error");
        if (input instanceof HTMLInputElement) input.select();
        return;
      }

      setAdminPinVerified();
      overlay.remove();
      setDashboardVisible(true);
      resolve(true);
    });
  });
}

const state = {
  cardapios: [],
  selectedCardapioId: null,
  produtos: [],
  pedidos: [],
  isEditingCardapio: false
};

const DEFAULT_WHATSAPP_TEMPLATE = `*Novo pedido - {LOJA}*
-------------------------
RESUMO
Tipo: {TIPO_PEDIDO}
Pagamento: {PAGAMENTO}

CLIENTE
Nome: {NOME}
Telefone: {TELEFONE}

ENDERECO
{ENDERECO}

ITENS
{ITENS}

VALORES
Subtotal: {SUBTOTAL}
Taxa de entrega: {TAXA_ENTREGA}
TOTAL: {TOTAL}`;

function escapeHtml(value) {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  return safeHttpUrl(raw);
}

async function fileToDataUrl(file) {
  if (!(file instanceof File)) return "";
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem válido.");
  }
  if (file.size > 2_500_000) {
    throw new Error("A imagem precisa ter no máximo 2,5 MB.");
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
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

function refreshColorPreviewForInput(input) {
  const row = input.closest(".color-row");
  if (!row) return;
  const swatch = row.querySelector(".color-swatch");
  const hex = row.querySelector(".color-hex");
  const value = String(input.value || "").trim();
  if (hex instanceof HTMLInputElement) {
    hex.value = value ? value.toUpperCase() : "";
  } else if (hex) {
    hex.textContent = value ? value.toUpperCase() : "";
  }
  if (swatch instanceof HTMLElement) {
    swatch.style.backgroundColor = value || "transparent";
  }
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return null;
}

function hexToRgb(hex) {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  const r = Number.parseInt(n.slice(1, 3), 16);
  const g = Number.parseInt(n.slice(3, 5), 16);
  const b = Number.parseInt(n.slice(5, 7), 16);
  return { r, g, b };
}

function relativeLuminance({ r, g, b }) {
  const srgb = [r, g, b].map((v) => v / 255);
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function mixRgb(a, b, t) {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const tt = clamp01(t);
  return {
    r: Math.round(a.r + (b.r - a.r) * tt),
    g: Math.round(a.g + (b.g - a.g) * tt),
    b: Math.round(a.b + (b.b - a.b) * tt),
  };
}

function rgbToHex({ r, g, b }) {
  const to2 = (v) => v.toString(16).padStart(2, "0").toUpperCase();
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function mixHex(a, b, t) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return "";
  return rgbToHex(mixRgb(ra, rb, t));
}

function extractHexColors(text) {
  const raw = String(text || "");
  const matches = raw.match(/#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?/g) || [];
  const out = [];
  const seen = new Set();

  for (const m of matches) {
    const normalized = normalizeHexColor(m);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function applyPaletteToCardapioForm(cardapioForm, paletteText) {
  const colors = extractHexColors(paletteText);
  if (colors.length === 0) {
    throw new Error("Nenhuma cor HEX válida encontrada na paleta");
  }

  const annotated = colors
    .map((hex) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;
      return { hex, rgb, lum: relativeLuminance(rgb) };
    })
    .filter(Boolean);

  if (annotated.length === 0) {
    throw new Error("Nenhuma cor HEX válida encontrada na paleta");
  }

  annotated.sort((a, b) => a.lum - b.lum);

  const text = annotated[0].hex;
  const bg = annotated[annotated.length - 1].hex;

  const withoutEnds = annotated
    .map((x) => x.hex)
    .filter((hex) => hex !== text && hex !== bg);

  const theme = withoutEnds[0] || annotated[Math.floor(annotated.length / 2)].hex;
  const secondary = withoutEnds[1] || theme;
  const surface = withoutEnds[2] || mixHex(bg, text, 0.06) || bg;
  const border = mixHex(surface, text, 0.14) || mixHex(bg, text, 0.14) || surface;
  const muted = mixHex(text, bg, 0.52) || text;
  const bg1 = theme;
  const bg2 = secondary !== theme ? secondary : mixHex(theme, bg, 0.3) || bg;

  const setIfExists = (name, value) => {
    const el = cardapioForm.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!el) return;
    el.value = value;
  };

  setIfExists("cor_tema", theme);
  setIfExists("cor_secundaria", secondary);
  setIfExists("cor_fundo", bg);
  setIfExists("cor_surface", surface);
  setIfExists("cor_borda", border);
  setIfExists("cor_texto", text);
  setIfExists("cor_muted", muted);
  setIfExists("fundo_cor_1", bg1);
  setIfExists("fundo_cor_2", bg2);

  refreshAllColorPreviews(cardapioForm);
  updateThemePreview(cardapioForm);
  updateFundoVisibility(cardapioForm);
}

function setupHexInputs(root) {
  if (!root) return;

  root.querySelectorAll(".color-row").forEach((row) => {
    const colorInput = row.querySelector('input[type="color"]');
    const hexInput = row.querySelector(".color-hex-input");
    if (!(colorInput instanceof HTMLInputElement)) return;
    if (!(hexInput instanceof HTMLInputElement)) return;

    let lastValidValue = String(colorInput.value || "").toUpperCase();

    const syncFromColor = () => {
      hexInput.classList.remove("is-invalid");
      hexInput.value = String(colorInput.value || "").toUpperCase();
      lastValidValue = hexInput.value;
    };

    const syncToColorIfValid = (commit = false) => {
      const normalized = normalizeHexColor(hexInput.value);
      if (normalized) {
        hexInput.classList.remove("is-invalid");
        colorInput.value = normalized;
        refreshColorPreviewForInput(colorInput);
        lastValidValue = normalized;
        return;
      }

      hexInput.classList.add("is-invalid");
      if (commit) syncFromColor();
    };

    // Inicial
    syncFromColor();

    // Facilita copiar
    hexInput.addEventListener("focus", () => {
      try {
        hexInput.select();
      } catch {
        // ignora
      }
    });

    hexInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        syncToColorIfValid(true);
        hexInput.blur();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hexInput.classList.remove("is-invalid");
        hexInput.value = lastValidValue;
        hexInput.blur();
      }
    });

    // Se digitou um HEX válido, já aplica
    hexInput.addEventListener("input", () => syncToColorIfValid(false));
    hexInput.addEventListener("change", () => syncToColorIfValid(true));
    hexInput.addEventListener("blur", () => syncToColorIfValid(true));

    // Se mexeu no seletor, atualiza texto
    colorInput.addEventListener("input", syncFromColor);
    colorInput.addEventListener("change", syncFromColor);
  });
}

function refreshAllColorPreviews(root) {
  if (!root) return;
  root.querySelectorAll('input[type="color"]').forEach((input) => {
    if (input instanceof HTMLInputElement) refreshColorPreviewForInput(input);
  });
}

function setupColorPreviewListeners(root) {
  if (!root) return;
  root.querySelectorAll('input[type="color"]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const handler = () => refreshColorPreviewForInput(input);
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });
  setupHexInputs(root);
  refreshAllColorPreviews(root);
}

function updateFundoVisibility(form) {
  if (!form) return;
  const estilo = String(form.fundo_estilo?.value || "padrao");
  const showSolido = estilo === "solido";
  const showDegrade = estilo === "degrade_linear" || estilo === "degrade_radial";
  const showAngulo = estilo === "degrade_linear";

  form.querySelectorAll(".js-fundo-solido").forEach((el) => el.classList.toggle("is-hidden", !showSolido));
  form.querySelectorAll(".js-fundo-degrade").forEach((el) => el.classList.toggle("is-hidden", !showDegrade));
  form.querySelectorAll(".js-fundo-angulo").forEach((el) => el.classList.toggle("is-hidden", !showAngulo));
}

function updateThemePreview(form) {
  if (!form) return;
  const preview = document.querySelector("#theme-preview");
  if (!preview) return;

  const surfaceEl = preview.querySelector(".theme-preview-surface");
  const cardEl = preview.querySelector(".theme-preview-card");
  const titleEl = preview.querySelector(".theme-preview-title");
  const textEl = preview.querySelector(".theme-preview-text");
  const mutedEl = preview.querySelector(".theme-preview-muted");
  const btnEl = preview.querySelector(".theme-preview-btn");

  const theme = String(form.cor_tema?.value || "#ff6a00");
  const secondary = String(form.cor_secundaria?.value || "#c8945b");
  const fundoEstilo = String(form.fundo_estilo?.value || "padrao");
  const bg = String(form.cor_fundo?.value || "#fffaf3");
  const bg1 = String(form.fundo_cor_1?.value || theme);
  const bg2 = String(form.fundo_cor_2?.value || "#ffe6ce");
  const angle = String(form.fundo_angulo?.value || "135");

  const surface = String(form.cor_surface?.value || "#ffffff");
  const text = String(form.cor_texto?.value || "#2a211d");
  const muted = String(form.cor_muted?.value || "#756960");
  const border = String(form.cor_borda?.value || "#f0dfd1");

  if (surfaceEl instanceof HTMLElement) {
    if (fundoEstilo === "solido") {
      surfaceEl.style.background = bg;
    } else if (fundoEstilo === "degrade_linear") {
      surfaceEl.style.background = `linear-gradient(${Number.parseInt(angle || "135", 10) || 135}deg, ${bg1}, ${bg2})`;
    } else if (fundoEstilo === "degrade_radial") {
      surfaceEl.style.background = `radial-gradient(circle at 18% 18%, ${bg1}, transparent 55%), radial-gradient(circle at 85% 0%, ${bg2}, transparent 55%), ${bg}`;
    } else {
      surfaceEl.style.background = `radial-gradient(circle at 18% 18%, ${theme}55, transparent 55%), radial-gradient(circle at 85% 0%, ${secondary}55, transparent 60%), ${bg}`;
    }
  }

  if (cardEl instanceof HTMLElement) {
    cardEl.style.background = surface;
    cardEl.style.borderColor = border;
    cardEl.style.boxShadow = "0 18px 42px rgba(0,0,0,0.35)";
  }
  if (titleEl instanceof HTMLElement) titleEl.style.color = text;
  if (textEl instanceof HTMLElement) textEl.style.color = text;
  if (mutedEl instanceof HTMLElement) mutedEl.style.color = muted;
  if (btnEl instanceof HTMLElement) {
    btnEl.style.background = `linear-gradient(135deg, ${theme}, ${secondary || theme})`;
    btnEl.style.borderColor = border;
    btnEl.style.color = "#0f0d0b";
  }
}

function setupThemeControls(form) {
  if (!form) return;
  const updateAll = () => {
    updateFundoVisibility(form);
    updateThemePreview(form);
  };

  form.querySelectorAll('input[type="color"], input[type="number"], select[name="fundo_estilo"]').forEach((el) => {
    el.addEventListener("input", updateAll);
    el.addEventListener("change", updateAll);
  });

  updateAll();
}

function maskTelefone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits.length) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function setMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.classList.remove("success", "error");
  if (type) element.classList.add(type);
}

function toast(text, type = "success") {
  const container = document.querySelector("#toast-container");
  if (!container) return;

  const toastEl = document.createElement("div");
  toastEl.className = `toast ${type === "error" ? "toast-error" : "toast-success"}`;
  toastEl.setAttribute("role", "status");
  toastEl.textContent = text;
  container.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.classList.add("is-visible");
  });

  window.setTimeout(() => {
    toastEl.classList.remove("is-visible");
    window.setTimeout(() => toastEl.remove(), 180);
  }, 2600);
}

function getHiddenIdField(form) {
  return form?.querySelector('input[name="id"]') || null;
}

function parseGaleriaUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function setGaleriaUrls(form, urls) {
  const hidden = form?.querySelector('input[name="galeria_urls"]');
  if (!(hidden instanceof HTMLInputElement)) return;
  const safe = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean);
  hidden.value = JSON.stringify(safe);
}

function getGaleriaUrls(form) {
  const hidden = form?.querySelector('input[name="galeria_urls"]');
  if (!(hidden instanceof HTMLInputElement)) return [];
  return parseGaleriaUrls(hidden.value);
}

function renderGaleriaPreview(form) {
  const container = document.querySelector("#galeria-preview");
  if (!(container instanceof HTMLElement)) return;
  const urls = getGaleriaUrls(form);
  container.classList.toggle("is-hidden", urls.length === 0);
  if (!urls.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = urls
    .map((url, idx) => {
      const safeUrl = safeHttpUrl(url);
      if (!safeUrl) return "";
      return `
        <div class="gallery-item">
          <img src="${safeUrl}" alt="Imagem do estabelecimento ${idx + 1}" loading="lazy" />
          <button type="button" class="btn js-remove-gallery" data-idx="${idx}">Remover</button>
        </div>
      `;
    })
    .join("");
}

async function initLoginPage() {
  try {
    assertSupabaseConfig();
  } catch (error) {
    setMessage(authMessage, error.message, "error");
    return;
  }

  clearAdminPinSession();

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = "/admin/dashboard";
    return;
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(authMessage, "Entrando...");

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(authMessage, error.message, "error");
      return;
    }

    setMessage(authMessage, "Login realizado com sucesso.", "success");
    window.location.href = "/admin/dashboard";
  });
}

async function requireAuth() {
  try {
    assertSupabaseConfig();
  } catch (error) {
    toast(error.message, "error");
    window.location.href = "/admin";
    return null;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    clearAdminPinSession();
    window.location.href = "/admin";
    return null;
  }

  return session;
}

function setSelectedCardapio(id) {
  state.selectedCardapioId = id;
  const info = document.querySelector("#produto-contexto");
  const selected = state.cardapios.find((item) => item.id === id);

  if (info) {
    info.textContent = selected
      ? `Gerenciando produtos de ${selected.nome}`
      : "Selecione um cardápio para gerenciar produtos.";
  }
}

function setEditingMode(isEditing) {
  state.isEditingCardapio = isEditing;
  const produtosPanel = document.querySelector("#produtos-panel");
  const pedidosPanel = document.querySelector("#pedidos-panel");
  if (produtosPanel) produtosPanel.classList.toggle("is-hidden", !isEditing);
  if (pedidosPanel) pedidosPanel.classList.toggle("is-hidden", !isEditing);
}

function renderCardapios() {
  const container = document.querySelector("#cardapios-list");
  if (!container) return;

  if (!state.cardapios.length) {
    container.innerHTML = '<p class="muted">Nenhum cardápio cadastrado.</p>';
    return;
  }

  container.innerHTML = state.cardapios
    .map((item) => {
      const nome = escapeHtml(item.nome);
      const slugText = escapeHtml(item.slug);
      const slugHref = encodeURIComponent(String(item.slug || ""));
      const whatsapp = escapeHtml(item.whatsapp);
      const fotoUrl = safeHttpUrl(item.foto_url);
      const modo = String(item.modo || "pedido").toLowerCase() === "catalogo" ? "Catálogo" : "Pedido";
      const garcomStatus = Boolean(item.modo_garcom_enabled) ? "Ativo" : "Desativado";
      const isSelected = state.selectedCardapioId === item.id;

      return `
      <article class="list-item${isSelected ? " is-selected" : ""}" data-id="${item.id}">
        <div style="display:flex; gap:12px; align-items:center;">
          ${fotoUrl ? `<img src="${fotoUrl}" alt="${nome}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:1px solid var(--border);" />` : ""}
          <h3 style="margin:0;">${nome}</h3>
        </div>
        <p class="muted">Slug: /cardapio/${slugText}</p>
        <p class="muted">WhatsApp: ${whatsapp}</p>
        <p class="muted">Modo: ${modo}</p>
        <p class="muted">Garçom: ${garcomStatus}</p>
        <div class="list-actions">
          <a class="btn" href="/cardapio/${slugHref}" target="_blank" rel="noopener">Abrir cardápio</a>
          <a class="btn" href="/garcom/${slugHref}" target="_blank" rel="noopener">Abrir garçom</a>
          <button class="btn js-manage-cardapio" data-id="${item.id}">${isSelected ? "Gerenciando" : "Gerenciar"}</button>
          <button class="btn js-edit-cardapio" data-id="${item.id}">Editar dados</button>
          <button class="btn js-delete-cardapio" data-id="${item.id}">Excluir</button>
        </div>
      </article>
    `;
    })
    .join("");
}

function extractBucketObjectPath(publicUrl, bucketName) {
  const raw = String(publicUrl || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    const marker = `/storage/v1/object/public/${encodeURIComponent(bucketName)}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) return "";
    const objectPath = url.pathname.slice(idx + marker.length);
    return decodeURIComponent(objectPath);
  } catch {
    return "";
  }
}

async function cleanupCardapioBucketImages(cardapio) {
  if (!supabase || !cardapio?.id) return;

  const bucket = supabase.storage.from("cardapios");
  const paths = new Set();

  const fotoPath = extractBucketObjectPath(cardapio.foto_url, "cardapios");
  const bannerPath = extractBucketObjectPath(cardapio.banner_url, "cardapios");
  if (fotoPath && fotoPath.startsWith(`${cardapio.id}/`)) paths.add(fotoPath);
  if (bannerPath && bannerPath.startsWith(`${cardapio.id}/`)) paths.add(bannerPath);

  const galeria = Array.isArray(cardapio.galeria_urls) ? cardapio.galeria_urls : [];
  for (const item of galeria) {
    const p = extractBucketObjectPath(item, "cardapios");
    if (p && p.startsWith(`${cardapio.id}/`)) paths.add(p);
  }

  if (!paths.size) return;
  try {
    await bucket.remove(Array.from(paths));
  } catch {
    // best-effort: não bloqueia a exclusão do cardápio
  }
}

function renderProdutos() {
  const container = document.querySelector("#produtos-list");
  if (!container) return;

  if (!state.selectedCardapioId) {
    container.innerHTML = '<p class="muted">Selecione um cardápio acima.</p>';
    return;
  }

  if (!state.produtos.length) {
    container.innerHTML = '<p class="muted">Nenhum produto cadastrado.</p>';
    return;
  }

  container.innerHTML = state.produtos
    .map((item) => {
      const nome = escapeHtml(item.nome);
      const categoria = escapeHtml(item.categoria);
      const preco = formatPriceBRL(item.preco);
      const imagemUrl = safeHttpUrl(item.imagem_url);
      const disponivel = item.disponivel !== false;

      return `
      <article class="list-item" data-id="${item.id}">
        <div style="display:flex; gap:12px; align-items:center;">
          ${imagemUrl ? `<img src="${imagemUrl}" alt="${nome}" style="width:48px; height:48px; border-radius:8px; object-fit:cover;" />` : ""}
          <div>
            <h3 style="margin:0;">${nome}</h3>
            ${categoria ? `<p class="muted" style="font-size:0.8rem;">${categoria}</p>` : ""}
          </div>
        </div>
        <p class="price" style="font-weight:800; color:var(--primary); margin: 8px 0;">${preco}</p>
        
        <div class="stock-toggle">
          <span class="stat-label" style="font-size:0.75rem;">${disponivel ? "Disponível" : "Esgotado"}</span>
          <label class="switch">
            <input type="checkbox" class="js-toggle-stock" data-id="${item.id}" ${disponivel ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="list-actions">
          <button class="btn js-edit-produto" data-id="${item.id}">Editar</button>
          <button class="btn js-delete-produto" data-id="${item.id}">Excluir</button>
        </div>
      </article>
    `;
    })
    .join("");
}

async function loadAnalytics() {
  const period = parseInt(document.getElementById("analytics-period")?.value || "7");
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - period);

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("*")
    .gte("created_at", dateLimit.toISOString());

  if (error) {
    console.warn("Falha ao carregar analytics:", error);
    return;
  }

  const totalVendas = pedidos.reduce((acc, p) => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    return acc + itens.reduce((s, i) => s + (Number(i.preco || 0) * Number(i.quantidade || 0)), 0);
  }, 0);

  const totalPedidos = pedidos.length;
  const ticketMedio = totalPedidos > 0 ? totalVendas / totalPedidos : 0;

  const produtoCount = {};
  pedidos.forEach(p => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    itens.forEach(i => {
      produtoCount[i.nome] = (produtoCount[i.nome] || 0) + (i.quantidade || 1);
    });
  });
  const topProduto = Object.entries(produtoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  if (document.getElementById("stat-total-vendas")) document.getElementById("stat-total-vendas").textContent = formatPriceBRL(totalVendas);
  if (document.getElementById("stat-total-pedidos")) document.getElementById("stat-total-pedidos").textContent = totalPedidos;
  if (document.getElementById("stat-ticket-medio")) document.getElementById("stat-ticket-medio").textContent = formatPriceBRL(ticketMedio);
  if (document.getElementById("stat-top-produto")) document.getElementById("stat-top-produto").textContent = topProduto;

  renderSalesChart(pedidos, period);
  renderProductsChart(produtoCount);
}

function renderSalesChart(pedidos, period) {
  const chartEl = document.getElementById("chart-sales");
  if (!chartEl) return;
  const dailyData = {};
  for (let i = 0; i < period; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyData[d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })] = 0;
  }
  pedidos.forEach(p => {
    const date = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (dailyData[date] !== undefined) {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      dailyData[date] += itens.reduce((s, i) => s + (Number(i.preco || 0) * Number(i.quantidade || 0)), 0);
    }
  });
  const entries = Object.entries(dailyData).reverse();
  const max = Math.max(...entries.map(e => e[1]), 1);
  chartEl.innerHTML = `
    <div style="display:flex; align-items:flex-end; gap:8px; height:100%; padding-top:20px; min-height:150px;">
      ${entries.map(([date, val]) => `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="width:100%; height:${(val / max) * 100}px; background:var(--primary); border-radius:4px 4px 0 0; position:relative;" title="${formatPriceBRL(val)}"></div>
          <span style="font-size:10px; color:var(--muted);">${date}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderProductsChart(produtoCount) {
  const chartEl = document.getElementById("chart-products");
  if (!chartEl) return;
  const top5 = Object.entries(produtoCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(...top5.map(e => e[1]), 1);
  chartEl.innerHTML = `
    <div style="display:grid; gap:12px; padding:10px;">
      ${top5.map(([name, count]) => `
        <div style="display:grid; grid-template-columns: 80px 1fr 30px; align-items:center; gap:12px;">
          <span style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</span>
          <div style="background:rgba(255,255,255,0.05); height:12px; border-radius:6px; overflow:hidden;">
            <div style="width:${(count / max) * 100}%; height:100%; background:var(--primary);"></div>
          </div>
          <span style="font-size:11px; font-weight:bold;">${count}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatPedidoText(pedido, cardapioNome) {
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const itensText = itens
    .map((item) => {
      const qtd = String(item.quantidade ?? "").trim();
      const nome = String(item.nome ?? "").trim();
      const preco = formatPriceBRL(item.preco_unitario);
      return `${qtd}x ${nome} (${preco})`;
    })
    .join("\n");

  const loja = cardapioNome ? String(cardapioNome).trim() : "";
  const nomeCliente = String(pedido.nome_cliente ?? "").trim();
  const telefone = String(pedido.telefone ?? "").trim();
  const endereco = String(pedido.endereco ?? "").trim();
  const status = String(pedido.status || "novo").trim();
  const data = new Date(pedido.created_at).toLocaleString("pt-BR");

  return [
    "NOVO PEDIDO",
    loja ? `Loja: ${loja}` : "",
    `Status: ${status}`,
    `Data: ${data}`,
    "",
    `Nome: ${nomeCliente}`,
    `Telefone: ${telefone}`,
    `Endereço: ${endereco}`,
    "",
    "ITENS:",
    itensText || "(sem itens)",
    ""
  ]
    .filter(Boolean)
    .join("\n");
}

function renderPedidos(pedidos) {
  const container = document.querySelector("#pedidos-list");
  if (!container) return;

  if (!pedidos.length) {
    container.innerHTML = '<p class="muted">Nenhum pedido recebido.</p>';
    return;
  }

  container.innerHTML = pedidos
    .map((pedido) => {
      const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
      const itensText = itens
        .map((item) => `${escapeHtml(item.quantidade)}x ${escapeHtml(item.nome)} (${formatPriceBRL(item.preco_unitario)})`)
        .join(" | ");

      const nomeCliente = escapeHtml(pedido.nome_cliente);
      const telefone = escapeHtml(pedido.telefone);
      const endereco = escapeHtml(pedido.endereco);
      const status = escapeHtml(pedido.status || "novo");

      return `
      <article class="list-item" data-id="${pedido.id}">
        <h3>${nomeCliente}</h3>
        <p><strong>Telefone:</strong> ${telefone}</p>
        <p><strong>Endereço:</strong> ${endereco}</p>
        <p><strong>Itens:</strong> ${itensText || "Sem itens"}</p>
        <div class="list-actions" style="gap: 8px; align-items: center;">
          <label style="display:flex; gap:8px; align-items:center;">
            <span class="muted">Status</span>
            <select class="js-pedido-status" data-id="${pedido.id}" aria-label="Status do pedido">
              <option value="novo" ${status === "novo" ? "selected" : ""}>novo</option>
              <option value="confirmado" ${status === "confirmado" ? "selected" : ""}>confirmado</option>
              <option value="entregue" ${status === "entregue" ? "selected" : ""}>entregue</option>
            </select>
          </label>
          <button class="btn js-copy-pedido" data-id="${pedido.id}">Copiar</button>
        </div>
        <p class="muted"><strong>Data:</strong> ${new Date(pedido.created_at).toLocaleString("pt-BR")}</p>
      </article>
    `;
    })
    .join("");
}

async function loadCardapios() {
  const { data, error } = await supabase
    .from("cardapios")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    toast(`Erro ao carregar cardápios: ${error.message}`, "error");
    return;
  }

  state.cardapios = data || [];
  renderCardapios();
}

async function loadProdutos() {
  if (!state.selectedCardapioId) {
    state.produtos = [];
    renderProdutos();
    return;
  }

  const { data, error } = await supabase.from("produtos").select("*").eq("cardapio_id", state.selectedCardapioId);

  if (error) {
    toast(`Erro ao carregar produtos: ${error.message}`, "error");
    return;
  }

  state.produtos = (data || []).sort((a, b) => {
    const ca = String(a.categoria || "").toLowerCase();
    const cb = String(b.categoria || "").toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb, "pt-BR");
    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  });
  renderProdutos();
}

async function loadPedidos() {
  let query = supabase.from("pedidos").select("*").order("created_at", { ascending: false });

  if (state.selectedCardapioId) {
    query = query.eq("cardapio_id", state.selectedCardapioId);
  }

  const { data, error } = await query;

  if (error) {
    toast(`Erro ao carregar pedidos: ${error.message}`, "error");
    return;
  }

  state.pedidos = data || [];
  renderPedidos(state.pedidos);
}

async function writeClipboard(text) {
  const value = String(text ?? "");
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // fallback
  }

  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

function fillCardapioForm(item) {
  const form = document.querySelector("#cardapio-form");
  if (!form || !item) return;
  const idField = getHiddenIdField(form);
  if (idField) idField.value = item.id;
  form.nome.value = item.nome;
  form.slug.value = item.slug;
  form.whatsapp.value = maskTelefone(item.whatsapp || "");
  form.cor_tema.value = item.cor_tema || "#ff6a00";
  form.foto_url.value = item.foto_url || "";
  if (form.banner_url) form.banner_url.value = item.banner_url || "";

  if (form.galeria_urls) {
    setGaleriaUrls(form, parseGaleriaUrls(item.galeria_urls));
    renderGaleriaPreview(form);
  }

  if (form.cor_secundaria) form.cor_secundaria.value = item.cor_secundaria || "#c8945b";
  if (form.fundo_estilo) form.fundo_estilo.value = item.fundo_estilo || "padrao";
  if (form.cor_fundo) form.cor_fundo.value = item.cor_fundo || "#fffaf3";
  if (form.fundo_cor_1) form.fundo_cor_1.value = item.fundo_cor_1 || (item.cor_tema || "#ff6a00");
  if (form.fundo_cor_2) form.fundo_cor_2.value = item.fundo_cor_2 || "#ffe6ce";
  if (form.fundo_angulo) form.fundo_angulo.value = String(item.fundo_angulo ?? 135);
  if (form.cor_surface) form.cor_surface.value = item.cor_surface || "#ffffff";
  if (form.cor_texto) form.cor_texto.value = item.cor_texto || "#2a211d";
  if (form.cor_muted) form.cor_muted.value = item.cor_muted || "#756960";
  if (form.cor_borda) form.cor_borda.value = item.cor_borda || "#f0dfd1";
  if (form.slogan) form.slogan.value = item.slogan || "";
  if (form.fonte_key) form.fonte_key.value = item.fonte_key || "sora";
  if (form.fonte_peso_texto) form.fonte_peso_texto.value = String(item.fonte_peso_texto ?? 400);
  if (form.fonte_peso_titulo) form.fonte_peso_titulo.value = String(item.fonte_peso_titulo ?? 800);
  if (form.horario_funcionamento) form.horario_funcionamento.value = item.horario_funcionamento || "";
  if (form.abre_em) form.abre_em.value = item.abre_em ? String(item.abre_em).slice(0, 5) : "";
  if (form.fecha_em) form.fecha_em.value = item.fecha_em ? String(item.fecha_em).slice(0, 5) : "";
  if (form.endereco) form.endereco.value = item.endereco || "";
  if (form.instagram_url) form.instagram_url.value = item.instagram_url || "";
  if (form.foto_url) form.foto_url.value = item.foto_url || "";
  if (form.banner_url) form.banner_url.value = item.banner_url || "";
  if (form.taxa_entrega) {
    const value = typeof item.taxa_entrega === "number" ? item.taxa_entrega : Number(item.taxa_entrega || 0);
    form.taxa_entrega.value = String(value || 0).replace(".", ",");
  }
  if (form.pedido_minimo) {
    const value = typeof item.pedido_minimo === "number" ? item.pedido_minimo : Number(item.pedido_minimo || 0);
    form.pedido_minimo.value = String(value || 0).replace(".", ",");
  }
  if (form.formas_pagamento) form.formas_pagamento.value = item.formas_pagamento || "";
  if (form.aceita_entrega) form.aceita_entrega.value = String(item.aceita_entrega ?? true);
  if (form.aceita_retirada) form.aceita_retirada.value = String(item.aceita_retirada ?? true);
  if (form.layout_produtos) form.layout_produtos.value = item.layout_produtos || "grid";
  if (form.densidade) form.densidade.value = item.densidade || "confortavel";
  if (form.modo) form.modo.value = item.modo || "pedido";
  if (form.modo_garcom_enabled) form.modo_garcom_enabled.checked = Boolean(item.modo_garcom_enabled);
  if (form.modo_marmita_enabled) form.modo_marmita_enabled.checked = Boolean(item.modo_marmita_enabled);
  if (form.marmita_agendamento_enabled) form.marmita_agendamento_enabled.checked = Boolean(item.marmita_agendamento_enabled);
  if (form.marmita_horarios_retirada) form.marmita_horarios_retirada.value = item.marmita_horarios_retirada || "";
  if (form.marmita_dias_semana) form.marmita_dias_semana.value = item.marmita_dias_semana || "1,2,3,4,5";
  if (form.marmita_instrucoes) form.marmita_instrucoes.value = item.marmita_instrucoes || "";
  if (form.whatsapp_botao) form.whatsapp_botao.value = item.whatsapp_botao || "flutuante";
  if (form.mensagem_whatsapp_template) {
    const current = String(item.mensagem_whatsapp_template || "").trim();
    const hasReplacementChar = current.includes("\uFFFD") || current.includes("�");
    const looksLikeDefault =
      current.includes("Novo pedido") &&
      current.includes("{LOJA}") &&
      current.includes("{ITENS}") &&
      current.includes("{TOTAL}") &&
      (current.includes("RESUMO") || current.includes("Resumo")) &&
      (current.includes("ITENS") || current.includes("Itens")) &&
      (current.includes("VALORES") || current.includes("Valores"));

    form.mensagem_whatsapp_template.value =
      !current || (hasReplacementChar && looksLikeDefault) ? DEFAULT_WHATSAPP_TEMPLATE : current;
  }

  if (form.owner_edit_enabled) {
    form.owner_edit_enabled.checked = Boolean(item.owner_edit_enabled);
  }
  if (form.owner_pin) {
    form.owner_pin.value = "";
  }

  if (form.templates_json) {
    form.templates_json.value = JSON.stringify(item.templates || []);
  }

  refreshAllColorPreviews(form);
  updateFundoVisibility(form);
  updateThemePreview(form);
  updateModoGarcomAvailability(form);
}

function fillProdutoForm(item) {
  const form = document.querySelector("#produto-form");
  if (!form || !item) return;
  const idField = getHiddenIdField(form);
  if (idField) idField.value = item.id;
  form.nome.value = item.nome;
  if (form.categoria) form.categoria.value = item.categoria || "";
  if (form.descricao) form.descricao.value = item.descricao || "";
  form.preco.value = String(item.preco).replace(".", ",");
  form.imagem_url.value = item.imagem_url || "";

  // Preços por tamanho
  const precos = item.precos || {};
  if (form.preco_p) form.preco_p.value = String(precos.P ?? "").replace(".", ",");
  if (form.preco_m) form.preco_m.value = String(precos.M ?? "").replace(".", ",");
  if (form.preco_g) form.preco_g.value = String(precos.G ?? "").replace(".", ",");

  // Estoque e Opções
  if (form.estoque_diario) form.estoque_diario.value = item.estoque_diario ?? "";
  if (form.opcoes_json) form.opcoes_json.value = JSON.stringify(item.opcoes || []);
  renderProductOptionGroups(form);

  try {
    form.nome?.focus();
  } catch {
    // ignora
  }
}

function fillOwnerProdutoForm(form, item) {
  if (!form) return;
  const idField = getHiddenIdField(form);
  if (idField) idField.value = item?.id || "";
  form.nome.value = item?.nome || "";
  if (form.categoria) form.categoria.value = item?.categoria || "";
  if (form.descricao) form.descricao.value = item?.descricao || "";
  if (form.preco) form.preco.value = String(item?.preco ?? "").replace(".", ",");
  if (form.imagem_url) form.imagem_url.value = item?.imagem_url || "";

  // Preços por tamanho
  const precos = item?.precos || {};
  if (form.preco_p) form.preco_p.value = String(precos.P ?? "").replace(".", ",");
  if (form.preco_m) form.preco_m.value = String(precos.M ?? "").replace(".", ",");
  if (form.preco_g) form.preco_g.value = String(precos.G ?? "").replace(".", ",");

  // Estoque e Opções
  if (form.estoque_diario) form.estoque_diario.value = item?.estoque_diario ?? "";
  if (form.opcoes_json) form.opcoes_json.value = JSON.stringify(item?.opcoes || []);
  renderProductOptionGroups(form);
}

function resetOwnerProdutoForm(form) {
  if (!form) return;
  form.reset();
  const idField = getHiddenIdField(form);
  if (idField) idField.value = "";
}

function getOwnerPinInput() {
  const form = document.querySelector("#owner-auth-form");
  const pinInput = form?.querySelector('input[name="pin"]');
  return pinInput instanceof HTMLInputElement ? pinInput : null;
}

function getOwnerPinValue() {
  return String(getOwnerPinInput()?.value || "").trim();
}

function getOwnerEditLink(slug) {
  const safe = String(slug || "").trim();
  if (!safe) return "";
  return `${window.location.origin}/admin/owner?slug=${encodeURIComponent(safe)}`;
}

function getGarcomLink(slug) {
  const safe = String(slug || "").trim();
  if (!safe) return "";
  return `${window.location.origin}/garcom/${encodeURIComponent(safe)}`;
}

function updateModoGarcomAvailability(form) {
  if (!form) return;
  const toggle = form.modo_garcom_enabled;
  if (!(toggle instanceof HTMLInputElement)) return;
  toggle.disabled = false;
  toggle.title = "Funciona tanto em Pedido quanto em Catálogo.";
}


function resetForms() {
  const cardapioForm = document.querySelector("#cardapio-form");

  const galeriaPreview = document.querySelector("#galeria-preview");
  galeriaPreview?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("js-remove-gallery")) return;
    const idx = Number.parseInt(String(target.dataset.idx || ""), 10);
    if (!Number.isFinite(idx)) return;
    const urls = getGaleriaUrls(cardapioForm);
    urls.splice(idx, 1);
    setGaleriaUrls(cardapioForm, urls);
    renderGaleriaPreview(cardapioForm);
  });
  const produtoForm = document.querySelector("#produto-form");
  cardapioForm?.reset();
  produtoForm?.reset();
  const cardapioIdField = getHiddenIdField(cardapioForm);
  const produtoIdField = getHiddenIdField(produtoForm);
  if (cardapioIdField) cardapioIdField.value = "";
  if (produtoIdField) produtoIdField.value = "";

  refreshAllColorPreviews(cardapioForm);
  updateFundoVisibility(cardapioForm);
  updateThemePreview(cardapioForm);

  if (cardapioForm) {
    setGaleriaUrls(cardapioForm, []);
    renderGaleriaPreview(cardapioForm);
  }
}

async function uploadProductImage(cardapioId, file) {
  const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
  const filePath = `${cardapioId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("produtos")
    .upload(filePath, file, { upsert: false, cacheControl: "3600" });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("produtos").getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadCardapioImage(cardapioId, file) {
  const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
  const filePath = `${cardapioId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("cardapios")
    .upload(filePath, file, { upsert: false, cacheControl: "3600" });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("cardapios").getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadCardapioGalleryImage(cardapioId, file) {
  const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
  const filePath = `${cardapioId}/galeria/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("cardapios")
    .upload(filePath, file, { upsert: false, cacheControl: "3600" });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("cardapios").getPublicUrl(filePath);
  return data.publicUrl;
}

async function setupDashboardPage() {
  const session = await requireAuth();
  if (!session) return;

  const ok = await requireAdminPinGate();
  if (!ok) return;

  const emailEl = document.querySelector("#session-email");
  if (emailEl) emailEl.textContent = session.user.email || "Admin";

  const logoutBtn = document.querySelector("#logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    clearAdminPinSession();
    await supabase.auth.signOut();
    window.location.href = "/admin";
  });

  const copyOwnerBtn = document.querySelector(".js-copy-owner-link");
  copyOwnerBtn?.addEventListener("click", async () => {
    const form = document.querySelector("#cardapio-form");
    const idField = getHiddenIdField(form);
    const id = String(idField?.value || "").trim();
    const cardapio = id ? state.cardapios.find((c) => c.id === id) : null;
    if (!cardapio) {
      toast("Selecione um cardápio primeiro.", "error");
      return;
    }
    if (!cardapio.owner_edit_enabled) {
      toast("Habilite o acesso do proprietário e salve o cardápio.", "error");
      return;
    }
    const link = getOwnerEditLink(cardapio.slug);
    try {
      await writeClipboard(link);
      toast("Link copiado.", "success");
    } catch {
      toast("Não foi possível copiar.", "error");
    }
  });

  const copyGarcomBtn = document.querySelector(".js-copy-garcom-link");
  copyGarcomBtn?.addEventListener("click", async () => {
    const form = document.querySelector("#cardapio-form");
    const idField = getHiddenIdField(form);
    const id = String(idField?.value || "").trim();
    const cardapio = id ? state.cardapios.find((c) => c.id === id) : null;
    if (!cardapio) {
      toast("Selecione um cardápio primeiro.", "error");
      return;
    }
    const link = getGarcomLink(cardapio.slug);
    try {
      await writeClipboard(link);
      toast("Link do garçom copiado.", "success");
    } catch {
      toast("Não foi possível copiar.", "error");
    }
  });

  await loadCardapios();
  await loadAnalytics();
  setEditingMode(false);

  const cardapioForm = document.querySelector("#cardapio-form");

  setupColorPreviewListeners(cardapioForm);
  setupThemeControls(cardapioForm);
  updateModoGarcomAvailability(cardapioForm);

  cardapioForm?.modo?.addEventListener("change", () => {
    updateModoGarcomAvailability(cardapioForm);
  });

  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("js-open-cozinha")) {
      showCozinha(true);
    }
    if (e.target.classList.contains("js-close-cozinha")) {
      showCozinha(false);
    }
    if (e.target.classList.contains("js-print-etiqueta")) {
      imprimirEtiqueta(e.target.dataset.id);
    }
  });

  const openTemplatesBtn = cardapioForm?.querySelector(".js-open-templates");
  if (cardapioForm && openTemplatesBtn) {
    openTemplatesBtn.addEventListener("click", () => {
      openTemplatesModal(cardapioForm);
    });
  }

  const paletteInput = document.querySelector("#palette-input");
  const applyPaletteBtn = document.querySelector(".js-apply-palette");
  if (cardapioForm && paletteInput instanceof HTMLInputElement && applyPaletteBtn) {
    applyPaletteBtn.addEventListener("click", () => {
      try {
        applyPaletteToCardapioForm(cardapioForm, paletteInput.value);
        toast("Paleta aplicada.");
      } catch (error) {
        toast(error?.message ? String(error.message) : "Falha ao aplicar paleta", "error");
      }
    });
  }

  const analyticsPeriod = document.getElementById("analytics-period");
  analyticsPeriod?.addEventListener("change", loadAnalytics);

  document.body.addEventListener("change", async (e) => {
    if (e.target.classList.contains("js-toggle-stock")) {
      const id = e.target.dataset.id;
      const checked = e.target.checked;
      const { error } = await supabase.from("produtos").update({ disponivel: checked }).eq("id", id);
      if (error) {
        toast("Erro ao atualizar estoque: " + error.message, "error");
        e.target.checked = !checked;
      } else {
        const label = e.target.closest(".stock-toggle")?.querySelector(".stat-label");
        if (label) label.textContent = checked ? "Disponível" : "Esgotado";
        toast("Estoque atualizado.");
      }
    }
  });

  const whatsappInput = cardapioForm?.querySelector('input[name="whatsapp"]');
  whatsappInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    target.value = maskTelefone(target.value);
  });

  cardapioForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(cardapioForm);
    const id = String(formData.get("id") || "").trim();
    const nome = String(formData.get("nome") || "").trim();
    const rawSlug = String(formData.get("slug") || "").trim();
    const slug = slugify(rawSlug || nome);
    const whatsapp = onlyDigits(formData.get("whatsapp"));
    const cor_tema = String(formData.get("cor_tema") || "#ff6a00");

    const cor_secundaria = String(formData.get("cor_secundaria") || "").trim();
    const fundo_estilo = String(formData.get("fundo_estilo") || "padrao");
    const cor_fundo = String(formData.get("cor_fundo") || "").trim();
    const fundo_cor_1 = String(formData.get("fundo_cor_1") || "").trim();
    const fundo_cor_2 = String(formData.get("fundo_cor_2") || "").trim();
    const fundo_angulo_raw = String(formData.get("fundo_angulo") || "135").trim();
    const fundo_angulo = Math.max(0, Math.min(360, Number.parseInt(fundo_angulo_raw || "135", 10) || 135));
    const cor_surface = String(formData.get("cor_surface") || "").trim();
    const cor_texto = String(formData.get("cor_texto") || "").trim();
    const cor_muted = String(formData.get("cor_muted") || "").trim();
    const cor_borda = String(formData.get("cor_borda") || "").trim();
    const slogan = String(formData.get("slogan") || "").trim();
    const fonte_key = String(formData.get("fonte_key") || "sora").trim() || "sora";
    const fonte_peso_texto_raw = String(formData.get("fonte_peso_texto") || "400").trim();
    const fonte_peso_titulo_raw = String(formData.get("fonte_peso_titulo") || "800").trim();
    const fonte_peso_texto = Number.parseInt(fonte_peso_texto_raw || "400", 10) || 400;
    const fonte_peso_titulo = Number.parseInt(fonte_peso_titulo_raw || "800", 10) || 800;
    const horario_funcionamento = String(formData.get("horario_funcionamento") || "").trim();
    const abre_em = String(formData.get("abre_em") || "").trim();
    const fecha_em = String(formData.get("fecha_em") || "").trim();
    const endereco = String(formData.get("endereco") || "").trim();
    const instagram_url = String(formData.get("instagram_url") || "").trim();
    const taxa_entrega = parseMoneyInput(String(formData.get("taxa_entrega") || "0"));
    const pedido_minimo = parseMoneyInput(String(formData.get("pedido_minimo") || "0"));
    const formas_pagamento = String(formData.get("formas_pagamento") || "").trim();
    const aceita_entrega = String(formData.get("aceita_entrega") || "true") === "true";
    const aceita_retirada = String(formData.get("aceita_retirada") || "true") === "true";
    const layout_produtos = String(formData.get("layout_produtos") || "grid");
    const densidade = String(formData.get("densidade") || "confortavel");
    const modo = String(formData.get("modo") || "pedido");
    const modo_garcom_enabled = formData.get("modo_garcom_enabled") === "on";
    const modo_marmita_enabled = formData.get("modo_marmita_enabled") === "on";
    const marmita_agendamento_enabled = formData.get("marmita_agendamento_enabled") === "on";
    const marmita_horarios_retirada = String(formData.get("marmita_horarios_retirada") || "").trim();
    const marmita_dias_semana = String(formData.get("marmita_dias_semana") || "1,2,3,4,5").trim();
    const marmita_instrucoes = String(formData.get("marmita_instrucoes") || "").trim();
    const whatsapp_botao = String(formData.get("whatsapp_botao") || "flutuante");
    const mensagem_whatsapp_template = String(formData.get("mensagem_whatsapp_template") || "").trim();
    const templates = parseTemplates(formData.get("templates_json") || "[]");

    const owner_edit_enabled = formData.get("owner_edit_enabled") === "on";
    const owner_pin = String(formData.get("owner_pin") || "").trim();

    const current = id ? state.cardapios.find((c) => c.id === id) : null;
    const wasOwnerEnabled = Boolean(current?.owner_edit_enabled);
    if (owner_edit_enabled && !wasOwnerEnabled && !owner_pin) {
      toast("Defina um PIN do proprietário para habilitar a edição.", "error");
      return;
    }

    const fotoFile = formData.get("foto");
    let foto_url = String(formData.get("foto_url") || "").trim();

    const bannerFile = formData.get("banner");
    let banner_url = String(formData.get("banner_url") || "").trim();

    const galeriaUrlsBase = parseGaleriaUrls(formData.get("galeria_urls"));
    const galeriaInput = cardapioForm?.querySelector('input[name="galeria"]');
    const galeriaFiles =
      galeriaInput instanceof HTMLInputElement && galeriaInput.files
        ? Array.from(galeriaInput.files).filter((f) => f instanceof File && f.size > 0)
        : [];

    if (!nome || !slug || !whatsapp) {
      toast("Preencha nome, slug e WhatsApp.", "error");
      return;
    }

    if (modo !== "pedido" && modo !== "catalogo") {
      toast("Modo inválido. Selecione Pedido ou Catálogo.", "error");
      return;
    }

    const basePayload = {
      nome,
      slug,
      whatsapp,
      cor_tema,
      cor_secundaria: cor_secundaria || null,
      modo,
      modo_garcom_enabled,
      fundo_estilo,
      cor_fundo: cor_fundo || null,
      fundo_cor_1: fundo_cor_1 || null,
      fundo_cor_2: fundo_cor_2 || null,
      fundo_angulo,
      cor_surface: cor_surface || null,
      cor_texto: cor_texto || null,
      cor_muted: cor_muted || null,
      cor_borda: cor_borda || null,
      slogan: slogan || null,
      fonte_key,
      fonte_peso_texto,
      fonte_peso_titulo,
      horario_funcionamento: horario_funcionamento || null,
      abre_em: abre_em || null,
      fecha_em: fecha_em || null,
      endereco: endereco || null,
      instagram_url: instagram_url || null,
      taxa_entrega: Number.isFinite(taxa_entrega) ? taxa_entrega : 0,
      pedido_minimo: Number.isFinite(pedido_minimo) ? pedido_minimo : 0,
      formas_pagamento: formas_pagamento || null,
      aceita_entrega,
      aceita_retirada,
      layout_produtos,
      densidade,
      whatsapp_botao,
      mensagem_whatsapp_template: mensagem_whatsapp_template || null,
      modo_marmita_enabled,
      marmita_agendamento_enabled,
      marmita_horarios_retirada: marmita_horarios_retirada || null,
      marmita_dias_semana: marmita_dias_semana || null,
      marmita_instrucoes: marmita_instrucoes || null,
      foto_url: foto_url || null,
      banner_url: banner_url || null,
      galeria_urls: galeriaUrlsBase.length ? galeriaUrlsBase : null,
      templates: templates.length ? templates : null
    };

    let savedId = id;

    if (id) {
      if (fotoFile instanceof File && fotoFile.size > 0) {
        try {
          foto_url = await uploadCardapioImage(id, fotoFile);
          basePayload.foto_url = foto_url;
        } catch (error) {
          toast(`Erro no upload da foto do cardápio: ${error.message}`, "error");
          return;
        }
      }

      if (bannerFile instanceof File && bannerFile.size > 0) {
        try {
          banner_url = await uploadCardapioImage(id, bannerFile);
          basePayload.banner_url = banner_url;
        } catch (error) {
          toast(`Erro no upload do banner: ${error.message}`, "error");
          return;
        }
      }

      if (galeriaFiles.length) {
        try {
          const uploaded = [];
          for (const file of galeriaFiles) {
            uploaded.push(await uploadCardapioGalleryImage(id, file));
          }
          const merged = [...galeriaUrlsBase, ...uploaded];
          basePayload.galeria_urls = merged.length ? merged : null;
        } catch (error) {
          toast(`Erro no upload da galeria: ${error.message}`, "error");
          return;
        }
      }

      const { error } = await supabase.from("cardapios").update(basePayload).eq("id", id);

      if (error) {
        if (String(error.message || "").includes("galeria_urls")) {
          toast("Seu Supabase ainda não tem a coluna galeria_urls. Rode o schema/patch do projeto.", "error");
          return;
        }
        if (String(error.message || "").includes("modo")) {
          toast("Seu Supabase ainda não tem a coluna modo. Rode o schema/patch do projeto.", "error");
          return;
        }
        toast(`Erro ao salvar cardápio: ${error.message}`, "error");
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("cardapios")
        .insert(basePayload)
        .select("id")
        .single();

      if (insertError || !inserted) {
        if (String(insertError?.message || "").includes("galeria_urls")) {
          toast("Seu Supabase ainda não tem a coluna galeria_urls. Rode o schema/patch do projeto.", "error");
          return;
        }
        if (String(insertError?.message || "").includes("modo")) {
          toast("Seu Supabase ainda não tem a coluna modo. Rode o schema/patch do projeto.", "error");
          return;
        }
        toast(`Erro ao salvar cardápio: ${insertError?.message || "Sem retorno"}`, "error");
        return;
      }

      savedId = inserted.id;

      if (fotoFile instanceof File && fotoFile.size > 0) {
        try {
          foto_url = await uploadCardapioImage(inserted.id, fotoFile);
          const { error: updateError } = await supabase
            .from("cardapios")
            .update({ foto_url })
            .eq("id", inserted.id);

          if (updateError) {
            toast(`Erro ao salvar foto do cardápio: ${updateError.message}`, "error");
            return;
          }
        } catch (error) {
          toast(`Erro no upload da foto do cardápio: ${error.message}`, "error");
          return;
        }
      }

      if (bannerFile instanceof File && bannerFile.size > 0) {
        try {
          banner_url = await uploadCardapioImage(inserted.id, bannerFile);
          const { error: updateError } = await supabase
            .from("cardapios")
            .update({ banner_url })
            .eq("id", inserted.id);

          if (updateError) {
            toast(`Erro ao salvar banner: ${updateError.message}`, "error");
            return;
          }
        } catch (error) {
          toast(`Erro no upload do banner: ${error.message}`, "error");
          return;
        }
      }

      if (galeriaFiles.length) {
        try {
          const uploaded = [];
          for (const file of galeriaFiles) {
            uploaded.push(await uploadCardapioGalleryImage(inserted.id, file));
          }

          const merged = [...galeriaUrlsBase, ...uploaded];
          const { error: updateError } = await supabase
            .from("cardapios")
            .update({ galeria_urls: merged.length ? merged : null })
            .eq("id", inserted.id);

          if (updateError) {
            if (String(updateError.message || "").includes("galeria_urls")) {
              toast("Seu Supabase ainda não tem a coluna galeria_urls. Rode o schema/patch do projeto.", "error");
              return;
            }
            toast(`Erro ao salvar galeria: ${updateError.message}`, "error");
            return;
          }
        } catch (error) {
          toast(`Erro no upload da galeria: ${error.message}`, "error");
          return;
        }
      }
    }

    // Mantém o contexto de gerenciamento após salvar
    // (não força o usuário a clicar em "Gerenciar" novamente)
    const produtoFormEl = document.querySelector("#produto-form");
    produtoFormEl?.reset();
    const produtoIdField = getHiddenIdField(produtoFormEl);
    if (produtoIdField) produtoIdField.value = "";

    // Limpa apenas os inputs de arquivo do cardápio
    const fotoInput = cardapioForm?.querySelector('input[name="foto"]');
    const bannerInput = cardapioForm?.querySelector('input[name="banner"]');
    const galeriaInputReset = cardapioForm?.querySelector('input[name="galeria"]');
    if (fotoInput instanceof HTMLInputElement) fotoInput.value = "";
    if (bannerInput instanceof HTMLInputElement) bannerInput.value = "";
    if (galeriaInputReset instanceof HTMLInputElement) galeriaInputReset.value = "";

    if (savedId) {
      let ownerAccessSaved = true;
      try {
        const pinArg = owner_pin ? owner_pin : null;
        const { error: ownerError } = await supabase.rpc("admin_set_owner_access", {
          p_cardapio_id: savedId,
          p_enabled: owner_edit_enabled,
          p_new_pin: pinArg
        });

        if (ownerError) {
          ownerAccessSaved = false;
          toast("Falha ao salvar acesso do proprietário. Rode o schema/patch no Supabase.", "error");
        }
      } catch {
        ownerAccessSaved = false;
        toast("Falha ao salvar acesso do proprietário.", "error");
      }

      await loadCardapios();

      setSelectedCardapio(savedId);
      setEditingMode(true);
      const fresh = state.cardapios.find((c) => c.id === savedId);
      if (fresh) fillCardapioForm(fresh);
      await loadProdutos();
      await loadPedidos();

      if (!ownerAccessSaved) {
        toast("Cardápio salvo, mas o acesso do proprietário não foi atualizado no banco.", "error");
      }
    } else {
      await loadCardapios();
    }

    renderGaleriaPreview(cardapioForm);

    toast("Concluído.", "success");
  });

  const cancelCardapioEdit = document.querySelector("#cancel-cardapio-edit");
  cancelCardapioEdit?.addEventListener("click", () => {
    const form = document.querySelector("#cardapio-form");
    form?.reset();
    const idField = getHiddenIdField(form);
    if (idField) idField.value = "";
    refreshAllColorPreviews(form);
    updateFundoVisibility(form);
    updateThemePreview(form);
    setGaleriaUrls(form, []);
    renderGaleriaPreview(form);
    setSelectedCardapio(null);
    setEditingMode(false);
  });

  const produtoForm = document.querySelector("#produto-form");
  produtoForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.selectedCardapioId) {
      toast("Selecione um cardápio antes de salvar produto.", "error");
      return;
    }

    const formData = new FormData(produtoForm);
    const id = String(formData.get("id") || "").trim();
    const nome = String(formData.get("nome") || "").trim();
    const categoria = String(formData.get("categoria") || "").trim();
    const descricao = String(formData.get("descricao") || "").trim();
    const preco = parseMoneyInput(String(formData.get("preco") || ""));
    const imagemFile = formData.get("imagem");
    let imagem_url = String(formData.get("imagem_url") || "").trim();

    if (!nome || !preco) {
      toast("Preencha nome e preço válido.", "error");
      return;
    }

    if (imagemFile instanceof File && imagemFile.size > 0) {
      try {
        imagem_url = await uploadProductImage(state.selectedCardapioId, imagemFile);
      } catch (error) {
        toast(`Erro no upload da imagem: ${error.message}`, "error");
        return;
      }
    }

    const preco_p = parseMoneyInput(String(formData.get("preco_p") || ""));
    const preco_m = parseMoneyInput(String(formData.get("preco_m") || ""));
    const preco_g = parseMoneyInput(String(formData.get("preco_g") || ""));

    const estoque_diario = formData.get("estoque_diario") ? parseInt(formData.get("estoque_diario")) : null;
    const opcoes = parseProductOptions(formData.get("opcoes_json"));

    const precos = {};
    if (Number.isFinite(preco_p) && preco_p > 0) precos.P = preco_p;
    if (Number.isFinite(preco_m) && preco_m > 0) precos.M = preco_m;
    if (Number.isFinite(preco_g) && preco_g > 0) precos.G = preco_g;

    const payload = {
      cardapio_id: state.selectedCardapioId,
      nome,
      categoria: categoria || null,
      descricao: descricao || null,
      preco,
      imagem_url: imagem_url || null,
      precos: Object.keys(precos).length ? precos : null,
      estoque_diario,
      opcoes: opcoes.length ? opcoes : null
    };

    let query;
    if (id) {
      query = supabase.from("produtos").update(payload).eq("id", id);
    } else {
      query = supabase.from("produtos").insert(payload);
    }

    const { error } = await query;

    if (error) {
      toast(`Erro ao salvar produto: ${error.message}`, "error");
      return;
    }

    produtoForm.reset();
    const idField = getHiddenIdField(produtoForm);
    if (idField) idField.value = "";
    await loadProdutos();
    toast("Concluído.", "success");

    try {
      produtoForm.nome?.focus();
    } catch {
      // ignora
    }
  });

  const cancelProdutoEdit = document.querySelector("#cancel-produto-edit");
  cancelProdutoEdit?.addEventListener("click", () => {
    const form = document.querySelector("#produto-form");
    form?.reset();
    const idField = getHiddenIdField(form);
    if (idField) idField.value = "";
  });

  document.body.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const cardapioId = target.dataset.id;

    if (target.classList.contains("js-manage-cardapio") && cardapioId) {
      const item = state.cardapios.find((cardapio) => cardapio.id === cardapioId);
      fillCardapioForm(item);
      setSelectedCardapio(cardapioId);
      setEditingMode(true);
      await loadProdutos();
      await loadPedidos();
    }

    if (target.classList.contains("js-edit-cardapio") && cardapioId) {
      const item = state.cardapios.find((cardapio) => cardapio.id === cardapioId);
      fillCardapioForm(item);
      setSelectedCardapio(cardapioId);
      setEditingMode(true);
      await loadProdutos();
      await loadPedidos();
    }

    if (target.classList.contains("js-edit-produto") && cardapioId) {
      const item = state.produtos.find((produto) => produto.id === cardapioId);
      fillProdutoForm(item);
    }

    if (target.classList.contains("js-delete-produto") && cardapioId) {
      const confirmDelete = confirm("Deseja realmente excluir este produto?");
      if (!confirmDelete) return;

      const { error } = await supabase.from("produtos").delete().eq("id", cardapioId);
      if (error) {
        toast(`Erro ao excluir: ${error.message}`, "error");
        return;
      }

      await loadProdutos();
      toast("Concluído.", "success");
    }

    if (target.classList.contains("js-delete-cardapio") && cardapioId) {
      const cardapio = state.cardapios.find((c) => c.id === cardapioId);
      const nome = cardapio?.nome ? String(cardapio.nome) : "este cardápio";
      const confirmDelete = confirm(
        `Deseja realmente excluir ${nome}?\n\nIsso irá apagar também os produtos e pedidos vinculados.`
      );
      if (!confirmDelete) return;

      try {
        await cleanupCardapioBucketImages(cardapio);
      } catch {
        // ignora
      }

      const { error } = await supabase.from("cardapios").delete().eq("id", cardapioId);
      if (error) {
        toast(`Erro ao excluir: ${error.message}`, "error");
        return;
      }

      const form = document.querySelector("#cardapio-form");
      form?.reset();
      const idField = getHiddenIdField(form);
      if (idField) idField.value = "";
      refreshAllColorPreviews(form);
      updateFundoVisibility(form);
      updateThemePreview(form);
      setGaleriaUrls(form, []);
      renderGaleriaPreview(form);

      setSelectedCardapio(null);
      setEditingMode(false);
      state.produtos = [];
      renderProdutos();
      renderPedidos([]);

      await loadCardapios();
      toast("Concluído.", "success");
    }

    if (target.classList.contains("js-copy-pedido") && cardapioId) {
      const pedido = state.pedidos.find((p) => p.id === cardapioId);
      if (!pedido) {
        toast("Pedido não encontrado.", "error");
        return;
      }
      const cardapioNome = state.cardapios.find((c) => c.id === pedido.cardapio_id)?.nome || "";
      const text = formatPedidoText(pedido, cardapioNome);
      try {
        await writeClipboard(text);
        toast("Copiado.", "success");
      } catch {
        toast("Não foi possível copiar.", "error");
      }
    }
  });

  document.body.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!target.classList.contains("js-pedido-status")) return;

    const pedidoId = String(target.dataset.id || "").trim();
    const status = String(target.value || "novo").trim();
    if (!pedidoId) return;

    const { error } = await supabase.from("pedidos").update({ status }).eq("id", pedidoId);
    if (error) {
      toast(`Erro ao atualizar status: ${error.message}`, "error");
      await loadPedidos();
      return;
    }

    const local = state.pedidos.find((p) => p.id === pedidoId);
    if (local) local.status = status;
    toast("Status atualizado.", "success");
  });
}

let ownerCardapio = null;
let ownerProdutos = [];

function renderOwnerProdutos() {
  const container = document.querySelector("#owner-produtos-list");
  if (!container) return;

  if (!ownerProdutos.length) {
    container.innerHTML = '<p class="muted">Nenhum produto cadastrado neste cardápio.</p>';
    return;
  }

  container.innerHTML = ownerProdutos
    .map((item) => {
      const nome = escapeHtml(item.nome);
      const categoria = escapeHtml(item.categoria || "");
      const descricao = escapeHtml(item.descricao || "");
      const imagem = safeImageUrl(item.imagem_url);

      return `
        <article class="list-item" data-id="${item.id}">
          <div style="display:flex; gap:12px; align-items:center;">
            ${imagem ? `<img src="${imagem}" alt="${nome}" style="width:52px; height:52px; border-radius:12px; object-fit:cover; border:1px solid var(--border);" />` : ""}
            <div>
              <h3 style="margin:0;">${nome}</h3>
              <p class="muted">${formatPriceBRL(item.preco)}</p>
            </div>
          </div>
          ${categoria ? `<p class="muted">Categoria: ${categoria}</p>` : ""}
          ${descricao ? `<p class="muted">${descricao}</p>` : ""}
          <div class="list-actions">
            <button class="btn js-owner-edit-produto" data-id="${item.id}">Editar</button>
            <button class="btn js-owner-delete-produto" data-id="${item.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadOwnerProdutos() {
  const container = document.querySelector("#owner-produtos-list");
  if (!ownerCardapio?.id) {
    ownerProdutos = [];
    renderOwnerProdutos();
    if (container) container.innerHTML = '<p class="muted">Salve e valide o cardápio para gerenciar produtos.</p>';
    return;
  }

  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .eq("cardapio_id", ownerCardapio.id)
    .order("created_at", { ascending: false });

  if (error) {
    ownerProdutos = [];
    renderOwnerProdutos();
    if (container) container.innerHTML = `<p class="muted">Erro ao carregar produtos: ${escapeHtml(error.message)}</p>`;
    return;
  }

  ownerProdutos = data || [];
  renderOwnerProdutos();
}

function getOwnerCardapioEditPayload(editForm) {
  return {
    nome: String(editForm.nome.value || "").trim(),
    whatsapp: onlyDigits(editForm.whatsapp.value || ""),
    slogan: String(editForm.slogan.value || "").trim(),
    modo: String(editForm.modo?.value || "pedido").trim(),
    modo_garcom_enabled: Boolean(editForm.modo_garcom_enabled?.checked || false),
    modo_marmita_enabled: Boolean(editForm.modo_marmita_enabled?.checked || false),
    marmita_agendamento_enabled: Boolean(editForm.marmita_agendamento_enabled?.checked || false),
    marmita_horarios_retirada: String(editForm.marmita_horarios_retirada?.value || "").trim(),
    marmita_dias_semana: String(editForm.marmita_dias_semana?.value || "1,2,3,4,5").trim(),
    marmita_instrucoes: String(editForm.marmita_instrucoes?.value || "").trim(),
    horario_funcionamento: String(editForm.horario_funcionamento.value || "").trim(),
    abre_em: String(editForm.abre_em.value || "").trim(),
    fecha_em: String(editForm.fecha_em.value || "").trim(),
    endereco: String(editForm.endereco.value || "").trim(),
    instagram_url: String(editForm.instagram_url.value || "").trim(),
    foto_url: String(editForm.foto_url?.value || "").trim(),
    banner_url: String(editForm.banner_url?.value || "").trim(),
    templates: parseTemplates(editForm.templates_json?.value || "[]")
  };
}

function getOwnerProdutoPayload(form) {
  return {
    id: String(form?.id?.value || "").trim(),
    nome: String(form?.nome?.value || "").trim(),
    categoria: String(form?.categoria?.value || "").trim(),
    descricao: String(form?.descricao?.value || "").trim(),
    preco: String(form?.preco?.value || "").trim(),
    preco_p: String(form?.preco_p?.value || "").trim(),
    preco_m: String(form?.preco_m?.value || "").trim(),
    preco_g: String(form?.preco_g?.value || "").trim(),
    estoque_diario: String(form?.estoque_diario?.value || "").trim(),
    opcoes_json: String(form?.opcoes_json?.value || "[]").trim(),
    imagem_url: String(form?.imagem_url?.value || "").trim()
  };
}

if (loginForm) {
  initLoginPage();
}

if (document.querySelector("#cardapio-form")) {
  setupDashboardPage();
}

function parseTemplates(val) {
  try {
    const arr = JSON.parse(String(val || "[]"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function openTemplatesModal(cardapioForm) {
  const templatesJson = cardapioForm.templates_json.value;
  const templates = parseTemplates(templatesJson);
  
  const overlay = document.createElement("div");
  overlay.className = "auth-layout";
  overlay.id = "templates-modal";
  overlay.style.zIndex = "1100";
  overlay.innerHTML = `
    <section class="auth-card" style="width: min(500px, 94vw);">
      <h1>Modelos de Texto</h1>
      <p class="muted">Salve textos prontos para usar no slogan/descrição.</p>
      
      <div id="templates-list" class="stack-gap" style="max-height: 300px; overflow-y: auto; margin: 16px 0;">
        ${templates.length ? templates.map((t, i) => `
          <div class="list-item" style="padding: 10px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${escapeHtml(t.label || `Modelo ${i+1}`)}</div>
            <div class="muted" style="font-size: 0.85rem; margin-bottom: 8px;">${escapeHtml(t.text)}</div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn js-apply-template" data-idx="${i}">Usar</button>
              <button type="button" class="btn js-remove-template" data-idx="${i}" style="color: red; border-color: red;">×</button>
            </div>
          </div>
        `).join("") : '<p class="muted">Nenhum modelo salvo.</p>'}
      </div>

      <div class="stack-gap" style="border-top: 1px solid var(--border); padding-top: 16px;">
        <label>
          Título do Modelo
          <input type="text" id="new-template-label" placeholder="Ex: Cardápio Segunda" />
        </label>
        <label>
          Texto
          <textarea id="new-template-text" rows="3" placeholder="Paste o texto aqui..."></textarea>
        </label>
        <button type="button" class="btn btn-primary" id="add-template-btn">Adicionar Novo Modelo</button>
      </div>

      <button type="button" class="btn" style="margin-top: 16px;" onclick="this.closest('.auth-layout').remove()">Fechar</button>
    </section>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("js-apply-template")) {
      const idx = target.dataset.idx;
      cardapioForm.slogan.value = templates[idx].text;
      overlay.remove();
      toast("Modelo aplicado.");
    }
    if (target.classList.contains("js-remove-template")) {
      const idx = target.dataset.idx;
      templates.splice(idx, 1);
      cardapioForm.templates_json.value = JSON.stringify(templates);
      overlay.remove();
      openTemplatesModal(cardapioForm);
    }
  });

  overlay.querySelector("#add-template-btn")?.addEventListener("click", () => {
    const label = overlay.querySelector("#new-template-label").value.trim();
    const text = overlay.querySelector("#new-template-text").value.trim();
    if (!label || !text) {
      toast("Preencha título e texto.", "error");
      return;
    }
    templates.push({ label, text });
    cardapioForm.templates_json.value = JSON.stringify(templates);
    overlay.remove();
    openTemplatesModal(cardapioForm);
  });
}

function clearOwnerSession(slug) {
  try {
    sessionStorage.removeItem(getOwnerSessionKey(slug));
    sessionStorage.removeItem(getOwnerPinCacheKey(slug));
  } catch {
    // ignore
  }
}

function setOwnerVerified(slug) {
  try {
    sessionStorage.setItem(getOwnerSessionKey(slug), "1");
  } catch {
    // ignore
  }
}

function isOwnerVerified(slug) {
  try {
    return sessionStorage.getItem(getOwnerSessionKey(slug)) === "1";
  } catch {
    return false;
  }
}

function setOwnerPinCache(slug, pin) {
  try {
    const safePin = onlyDigits(pin).slice(0, 12);
    if (!safePin) {
      sessionStorage.removeItem(getOwnerPinCacheKey(slug));
      return;
    }
    sessionStorage.setItem(getOwnerPinCacheKey(slug), safePin);
  } catch {
    // ignore
  }
}

function getOwnerPinCache(slug) {
  try {
    return String(sessionStorage.getItem(getOwnerPinCacheKey(slug)) || "").trim();
  } catch {
    return "";
  }
}

function getOwnerSlugFromUrl() {
  try {
    const url = new URL(window.location.href);
    const slug = String(url.searchParams.get("slug") || "").trim();
    return slug;
  } catch {
    return "";
  }
}

async function initOwnerPage() {
  const ownerPage = document.querySelector("#owner-page");
  if (!ownerPage) return;

  try {
    assertSupabaseConfig();
  } catch (error) {
    const msg = ownerPage.querySelector("#owner-message");
    setMessage(msg, error.message, "error");
    return;
  }

  const slug = getOwnerSlugFromUrl();
  const subtitle = ownerPage.querySelector("#owner-subtitle");
  if (subtitle) subtitle.textContent = slug ? `Cardápio: ${slug}` : "Informe o slug na URL.";

  const authForm = ownerPage.querySelector("#owner-auth-form");
  const editForm = ownerPage.querySelector("#owner-edit-form");
  const ownerProdutosSection = ownerPage.querySelector("#owner-produtos-section");
  const ownerProdutoForm = ownerPage.querySelector("#owner-produto-form");
  const ownerProdutoCancel = ownerPage.querySelector("#owner-produto-cancel");
  const message = ownerPage.querySelector("#owner-message");
  const logoutBtn = ownerPage.querySelector("#owner-logout");

  if (!(authForm instanceof HTMLFormElement) || !(editForm instanceof HTMLFormElement)) return;

  const setOwnerMessage = (text, type = "") => setMessage(message, text, type);

  const showEdit = (show) => {
    editForm.classList.toggle("is-hidden", !show);
    authForm.classList.toggle("is-hidden", show);
    if (ownerProdutosSection instanceof HTMLElement) {
      ownerProdutosSection.classList.toggle("is-hidden", !show);
    }
  };

  const loadAndFill = async () => {
    const { data, error } = await supabase
      .from("cardapios")
      .select("id,nome,slug,whatsapp,slogan,modo,modo_garcom_enabled,horario_funcionamento,abre_em,fecha_em,endereco,instagram_url,foto_url,banner_url")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      setOwnerMessage("Não foi possível carregar o cardápio.", "error");
      return false;
    }

    editForm.slug.value = data.slug;
    editForm.nome.value = data.nome || "";
    editForm.whatsapp.value = maskTelefone(data.whatsapp || "");
    editForm.slogan.value = data.slogan || "";
    if (editForm.modo) editForm.modo.value = data.modo || "pedido";
    if (editForm.modo_garcom_enabled) editForm.modo_garcom_enabled.checked = Boolean(data.modo_garcom_enabled || false);
    if (editForm.modo_marmita_enabled) editForm.modo_marmita_enabled.checked = Boolean(data.modo_marmita_enabled || false);
    if (editForm.marmita_agendamento_enabled) editForm.marmita_agendamento_enabled.checked = Boolean(data.marmita_agendamento_enabled || false);
    if (editForm.marmita_horarios_retirada) editForm.marmita_horarios_retirada.value = data.marmita_horarios_retirada || "";
    if (editForm.marmita_dias_semana) editForm.marmita_dias_semana.value = data.marmita_dias_semana || "1,2,3,4,5";
    if (editForm.marmita_instrucoes) editForm.marmita_instrucoes.value = data.marmita_instrucoes || "";
    
    editForm.horario_funcionamento.value = data.horario_funcionamento || "";
    editForm.abre_em.value = data.abre_em ? String(data.abre_em).slice(0, 5) : "";
    editForm.fecha_em.value = data.fecha_em ? String(data.fecha_em).slice(0, 5) : "";
    editForm.endereco.value = data.endereco || "";
    editForm.instagram_url.value = data.instagram_url || "";
    if (editForm.foto_url) editForm.foto_url.value = data.foto_url || "";
    if (editForm.banner_url) editForm.banner_url.value = data.banner_url || "";
    if (editForm.templates_json) editForm.templates_json.value = JSON.stringify(data.templates || []);
    ownerCardapio = data;
    await loadOwnerProdutos();
    return true;
  };

  const tryAuto = async () => {
    if (!slug) return;
    if (!isOwnerVerified(slug)) return;
    const pinInput = authForm.querySelector('input[name="pin"]');
    const cachedPin = getOwnerPinCache(slug);
    if (pinInput instanceof HTMLInputElement && cachedPin) {
      pinInput.value = cachedPin;
    }
    showEdit(true);
    await loadAndFill();
  };

  await tryAuto();

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!slug) {
      setOwnerMessage("URL inválida: faltou o slug.", "error");
      return;
    }

    const fd = new FormData(authForm);
    const pin = onlyDigits(String(fd.get("pin") || "").trim());
    if (!pin) {
      setOwnerMessage("Informe o PIN.", "error");
      return;
    }

    setOwnerMessage("Validando...");
    const { data, error } = await supabase.rpc("owner_verify_pin", { p_slug: slug, p_pin: pin });
    if (error) {
      setOwnerMessage("Não foi possível validar. Verifique o schema no Supabase.", "error");
      return;
    }

    if (data !== true) {
      setOwnerPinCache(slug, "");
      setOwnerMessage("PIN incorreto ou acesso desabilitado.", "error");
      return;
    }

    setOwnerVerified(slug);
    setOwnerPinCache(slug, pin);
    showEdit(true);
    setOwnerMessage("");
    await loadAndFill();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!slug) return;

    const pinInput = authForm.querySelector('input[name="pin"]');
    const pinFromInput = pinInput instanceof HTMLInputElement ? String(pinInput.value || "").trim() : "";
    const pin = onlyDigits(pinFromInput || getOwnerPinCache(slug));

    if (!pin) {
      setOwnerMessage("Digite o PIN para continuar.", "error");
      showEdit(false);
      return;
    }

    const patch = getOwnerCardapioEditPayload(editForm);

    setOwnerMessage("Salvando...");
    const { data, error } = await supabase.rpc("owner_update_cardapio", {
      p_slug: slug,
      p_pin: pin,
      p_patch: patch
    });

    if (error) {
      setOwnerMessage("Não foi possível salvar. Verifique o schema no Supabase.", "error");
      return;
    }

    if (data !== true) {
      setOwnerPinCache(slug, "");
      setOwnerMessage("PIN inválido ou acesso desabilitado.", "error");
      return;
    }

    setOwnerPinCache(slug, pin);
    setOwnerMessage("Salvo com sucesso.", "success");
    await loadAndFill();
  });

  const ownerTemplatesBtn = editForm.querySelector(".js-open-templates");
  if (ownerTemplatesBtn) {
    ownerTemplatesBtn.addEventListener("click", () => {
      openTemplatesModal(editForm);
    });
  }

  ownerProdutoCancel?.addEventListener("click", () => {
    if (!(ownerProdutoForm instanceof HTMLFormElement)) return;
    resetOwnerProdutoForm(ownerProdutoForm);
  });

  ownerProdutoForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!slug || !ownerCardapio?.id) {
      setOwnerMessage("Carregue um cardápio válido antes de salvar produtos.", "error");
      return;
    }

    const pin = onlyDigits(getOwnerPinValue() || getOwnerPinCache(slug));
    if (!pin) {
      setOwnerMessage("Digite o PIN para continuar.", "error");
      return;
    }

    const payload = getOwnerProdutoPayload(ownerProdutoForm);
    if (!payload.nome || !payload.preco) {
      setOwnerMessage("Preencha nome e preço do produto.", "error");
      return;
    }

    const imagemFileInput = ownerProdutoForm.querySelector('input[name="imagem_file"]');
    const imagemFile = imagemFileInput instanceof HTMLInputElement ? imagemFileInput.files?.[0] : null;
    let imagemFinal = payload.imagem_url;

    if (imagemFile instanceof File && imagemFile.size > 0) {
      try {
        imagemFinal = await fileToDataUrl(imagemFile);
      } catch (error) {
        setOwnerMessage(error?.message ? String(error.message) : "Não foi possível ler a imagem.", "error");
        return;
      }
    }

    const preco_p = parseMoneyInput(payload.preco_p);
    const preco_m = parseMoneyInput(payload.preco_m);
    const preco_g = parseMoneyInput(payload.preco_g);

    const precos = {};
    if (Number.isFinite(preco_p) && preco_p > 0) precos.P = preco_p;
    if (Number.isFinite(preco_m) && preco_m > 0) precos.M = preco_m;
    if (Number.isFinite(preco_g) && preco_g > 0) precos.G = preco_g;

    const estoque_diario = payload.estoque_diario ? parseInt(payload.estoque_diario) : null;
    const opcoes = parseProductOptions(payload.opcoes_json);

    const { data, error } = await supabase.rpc("owner_upsert_produto", {
      p_slug: slug,
      p_pin: pin,
      p_patch: {
        id: payload.id || null,
        nome: payload.nome,
        categoria: payload.categoria || null,
        descricao: payload.descricao || null,
        preco: payload.preco,
        imagem_url: imagemFinal || null,
        precos: Object.keys(precos).length ? precos : null,
        estoque_diario,
        opcoes: opcoes.length ? opcoes : null
      }
    });

    if (error) {
      setOwnerMessage("Não foi possível salvar o produto. Verifique o schema no Supabase.", "error");
      return;
    }

    if (data !== true) {
      setOwnerPinCache(slug, "");
      setOwnerMessage("PIN inválido ou acesso desabilitado.", "error");
      return;
    }

    setOwnerPinCache(slug, pin);
    resetOwnerProdutoForm(ownerProdutoForm);
    await loadOwnerProdutos();
    setOwnerMessage("Produto salvo com sucesso.", "success");
  });

  ownerPage.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const editButton = target.closest(".js-owner-edit-produto");
    if (editButton instanceof HTMLElement) {
      const produtoId = String(editButton.dataset.id || "").trim();
      const produto = ownerProdutos.find((item) => item.id === produtoId);
      if (!produto || !(ownerProdutoForm instanceof HTMLFormElement)) return;
      fillOwnerProdutoForm(ownerProdutoForm, produto);
      try {
        ownerProdutoForm.nome?.focus();
      } catch {
        // ignora
      }
      return;
    }

    const deleteButton = target.closest(".js-owner-delete-produto");
    if (deleteButton instanceof HTMLElement) {
      const produtoId = String(deleteButton.dataset.id || "").trim();
      const produto = ownerProdutos.find((item) => item.id === produtoId);
      if (!produto) return;

      const confirmed = confirm(`Excluir ${produto.nome}?`);
      if (!confirmed) return;

      const pin = onlyDigits(getOwnerPinValue() || getOwnerPinCache(slug));
      if (!pin) {
        setOwnerMessage("Digite o PIN para continuar.", "error");
        return;
      }

      const { data, error } = await supabase.rpc("owner_delete_produto", {
        p_slug: slug,
        p_pin: pin,
        p_produto_id: produto.id
      });

      if (error) {
        setOwnerMessage("Não foi possível excluir o produto. Verifique o schema no Supabase.", "error");
        return;
      }

      if (data !== true) {
        setOwnerPinCache(slug, "");
        setOwnerMessage("PIN inválido ou acesso desabilitado.", "error");
        return;
      }

      setOwnerPinCache(slug, pin);
      await loadOwnerProdutos();
      setOwnerMessage("Produto excluído.", "success");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    clearOwnerSession(slug);
    showEdit(false);
    ownerCardapio = null;
    ownerProdutos = [];
    if (ownerProdutosSection instanceof HTMLElement) {
      ownerProdutosSection.classList.add("is-hidden");
    }
    if (ownerProdutoForm instanceof HTMLFormElement) {
      resetOwnerProdutoForm(ownerProdutoForm);
    }
    setOwnerMessage("Sessão encerrada.");
  });

}

function showCozinha(visible) {
  const panel = document.querySelector("#cozinha-panel");
  const pedidosPanel = document.querySelector("#pedidos-panel");
  if (!panel || !pedidosPanel) return;
  
  panel.classList.toggle("is-hidden", !visible);
  pedidosPanel.classList.toggle("is-hidden", visible);
  
  if (visible) renderResumoCozinha();
}

function renderResumoCozinha() {
  const summaryEl = document.querySelector("#cozinha-summary");
  if (!summaryEl) return;

  const hoje = new Date().toLocaleDateString('pt-BR');
  const pedidosHoje = state.pedidos.filter(p => {
    return new Date(p.created_at).toLocaleDateString('pt-BR') === hoje && p.status !== 'cancelado';
  });

  const aggregate = {};

  pedidosHoje.forEach(p => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    itens.forEach(i => {
      const size = i.tamanho ? ` (${i.tamanho})` : "";
      const options = i.opcoes ? `\n  ${i.opcoes.map(o => `• ${o.grupo}: ${o.itens.join(", ")}`).join("\n  ")}` : "";
      const key = `${i.nome}${size}${options}`;
      
      if (!aggregate[key]) {
        aggregate[key] = {
          nome: i.nome,
          tamanho: i.tamanho,
          opcoes: i.opcoes,
          quantidade: 0
        };
      }
      aggregate[key].quantidade += (i.quantidade || 1);
    });
  });

  if (Object.keys(aggregate).length === 0) {
    summaryEl.innerHTML = '<p class="muted">Nenhum item para produzir hoje.</p>';
    return;
  }

  summaryEl.innerHTML = Object.values(aggregate).map(item => `
    <div class="list-item" style="display:flex; justify-content:space-between; align-items:center; padding:16px;">
      <div style="flex:1;">
        <strong style="font-size:1.1rem;">${escapeHtml(item.nome)}${item.tamanho ? ` (${escapeHtml(item.tamanho)})` : ""}</strong>
        ${item.opcoes ? `<div class="muted" style="font-size:0.85rem; margin-top:4px;">${item.opcoes.map(o => `• ${escapeHtml(o.grupo)}: ${escapeHtml(o.itens.join(", "))}`).join("<br>")}</div>` : ""}
      </div>
      <div style="font-size:1.5rem; font-weight:800; color:var(--theme); background:rgba(0,0,0,0.05); padding:8px 16px; border-radius:12px;">
        ${item.quantidade}x
      </div>
    </div>
  `).join("");
}

function imprimirEtiqueta(pedidoId) {
  const pedido = state.pedidos.find(p => p.id === pedidoId);
  if (!pedido) return;

  const cardapio = state.cardapios.find(c => c.id === pedido.cardapio_id);
  const loja = cardapio ? cardapio.nome : "Marmitaria";

  const win = window.open('', 'PRINT', 'height=600,width=800');
  win.document.write(`
    <html>
      <head>
        <title>Etiqueta - ${pedido.nome_cliente}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #000; }
          .etiqueta { border: 2px solid #000; padding: 15px; width: 300px; margin: 0 auto; }
          .loja { font-weight: bold; font-size: 1.2rem; border-bottom: 1px solid #000; margin-bottom: 10px; padding-bottom: 5px; text-align: center; }
          .cliente { font-size: 1.1rem; font-weight: bold; margin-bottom: 10px; }
          .itens { font-size: 0.9rem; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; }
          .item { margin-bottom: 8px; }
          .opcoes { font-size: 0.8rem; color: #666; margin-left: 10px; }
          .footer { margin-top: 15px; font-size: 0.75rem; text-align: center; border-top: 1px solid #000; padding-top: 5px; }
        </style>
      </head>
      <body>
        <div class="etiqueta">
          <div class="loja">${escapeHtml(loja)}</div>
          <div class="cliente">${escapeHtml(pedido.nome_cliente)}</div>
          <div class="muted">${pedido.tipo_pedido === 'retirada' ? 'RETIRADA NO BALCÃO' : escapeHtml(pedido.endereco)}</div>
          <div class="itens">
            ${pedido.itens.map(i => `
              <div class="item">
                <strong>${i.quantidade}x ${escapeHtml(i.nome)}${i.tamanho ? ' (' + i.tamanho + ')' : ''}</strong>
                ${i.opcoes ? '<div class="opcoes">' + i.opcoes.map(o => '• ' + o.itens.join(", ")).join("<br>") + '</div>' : ''}
              </div>
            `).join("")}
          </div>
          <div class="footer">${new Date(pedido.created_at).toLocaleString('pt-BR')}</div>
        </div>
        <script>window.print(); setTimeout(() => window.close(), 500);</script>
      </body>
    </html>
  `);
  win.document.close();
}

function parseProductOptions(val) {
  try {
    const arr = JSON.parse(String(val || "[]"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function renderProductOptionGroups(form) {
  const container = form.querySelector("#product-options-container");
  if (!container) return;

  const options = parseProductOptions(form.opcoes_json.value);
  
  container.innerHTML = options.map((group, gIdx) => `
    <div class="list-item" style="padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: color-mix(in srgb, var(--surface) 95%, transparent); margin-bottom: 12px;">
      <div class="two-cols">
        <label>
          Título do Grupo
          <input type="text" value="${escapeHtml(group.titulo)}" oninput="updateOptionGroup(${gIdx}, 'titulo', this.value)" placeholder="Ex: Escolha o Arroz" />
        </label>
        <div class="two-cols">
          <label>Mín <input type="number" value="${group.min || 0}" oninput="updateOptionGroup(${gIdx}, 'min', this.value)" /></label>
          <label>Máx <input type="number" value="${group.max || 1}" oninput="updateOptionGroup(${gIdx}, 'max', this.value)" /></label>
        </div>
      </div>
      <label style="margin-top: 8px;">
        Opções (separadas por vírgula)
        <input type="text" value="${(group.itens || []).join(", ")}" oninput="updateOptionGroup(${gIdx}, 'itens', this.value)" placeholder="Branco, Integral, Grega" />
      </label>
      <button type="button" class="btn" style="color: red; margin-top: 8px; border-color: red;" onclick="removeOptionGroup(${gIdx})">Remover Grupo</button>
    </div>
  `).join("");
}

window.updateOptionGroup = (gIdx, field, value) => {
  const form = document.querySelector("#produto-form") || document.querySelector("#owner-produto-form");
  if (!form) return;
  const options = parseProductOptions(form.opcoes_json.value);
  if (field === 'itens') {
    options[gIdx][field] = value.split(",").map(i => i.trim()).filter(i => i);
  } else if (field === 'min' || field === 'max') {
    options[gIdx][field] = parseInt(value) || 0;
  } else {
    options[gIdx][field] = value;
  }
  form.opcoes_json.value = JSON.stringify(options);
};

window.removeOptionGroup = (gIdx) => {
  const form = document.querySelector("#produto-form") || document.querySelector("#owner-produto-form");
  if (!form) return;
  const options = parseProductOptions(form.opcoes_json.value);
  options.splice(gIdx, 1);
  form.opcoes_json.value = JSON.stringify(options);
  renderProductOptionGroups(form);
};

function setupProductOptionsHandlers() {
  document.body.addEventListener("click", (e) => {
    if (e.target.id === "add-option-group-btn") {
      const form = e.target.closest("form");
      if (!form) return;
      const options = parseProductOptions(form.opcoes_json.value);
      options.push({ titulo: "Novo Grupo", min: 0, max: 1, itens: [] });
      form.opcoes_json.value = JSON.stringify(options);
      renderProductOptionGroups(form);
    }
  });
}

setupProductOptionsHandlers();

if (document.querySelector("#owner-page")) {
  initOwnerPage();
}
