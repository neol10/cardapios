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

function updatePalettePreview(form, text) {
  const container = document.querySelector("#palette-preview-container");
  if (!container) return;
  container.innerHTML = "";

  const colors = extractHexColors(text);
  if (colors.length === 0) return;

  colors.forEach((color, idx) => {
    const swatch = document.createElement("div");
    swatch.className = "palette-swatch-item";
    swatch.style.position = "relative";
    swatch.style.display = "inline-block";
    swatch.style.cursor = "pointer";

    swatch.innerHTML = `
      <div class="swatch-circle" style="background: ${color}; width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--border); box-shadow: 0 4px 10px rgba(0,0,0,0.35); transition: transform 0.2s;" title="Cor ${idx + 1}: ${color}"></div>
    `;

    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".swatch-menu").forEach((m) => m.remove());

      const menu = document.createElement("div");
      menu.className = "swatch-menu";
      menu.style = `
        position: absolute;
        z-index: 1000;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(18, 16, 14, 0.98);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 8px;
        display: grid;
        gap: 4px;
        box-shadow: 0 12px 30px rgba(0,0,0,0.6);
        min-width: 155px;
        backdrop-filter: blur(10px);
      `;

      const options = [
        { label: "🎨 Principal", name: "cor_tema" },
        { label: "🌟 Secundária", name: "cor_secundaria" },
        { label: "🖼️ Cor de Fundo", name: "cor_fundo" },
        { label: "🔲 Fundo 1 (Degradê)", name: "fundo_cor_1" },
        { label: "🖼️ Fundo 2 (Degradê)", name: "fundo_cor_2" },
        { label: "📝 Texto Principal", name: "cor_texto" },
        { label: "📝 Texto Secundário", name: "cor_muted" },
        { label: "🔲 Fundo dos Cards", name: "cor_surface" },
        { label: "➖ Linha da Borda", name: "cor_borda" }
      ];

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn";
        btn.style = "text-align: left; padding: 7px 10px; font-size: 0.82rem; border-radius: 8px; width: 100%; border: none; background: transparent; color: var(--text); cursor: pointer; font-weight: 700; display: block; transition: background 0.15s;";
        btn.innerHTML = opt.label;
        btn.addEventListener("click", () => {
          const input = form.querySelector(`[name="${CSS.escape(opt.name)}"]`);
          if (input instanceof HTMLInputElement) {
            input.value = color;
            refreshColorPreviewForInput(input);
            updateThemePreview(form);
            updateFundoVisibility(form);
          }
          menu.remove();
        });
        btn.addEventListener("mouseover", () => btn.style.background = "rgba(255,255,255,0.08)");
        btn.addEventListener("mouseout", () => btn.style.background = "transparent");
        menu.appendChild(btn);
      });

      swatch.appendChild(menu);
    });

    const circle = swatch.querySelector(".swatch-circle");
    swatch.addEventListener("mouseover", () => circle.style.transform = "scale(1.15)");
    swatch.addEventListener("mouseout", () => circle.style.transform = "scale(1)");

    container.appendChild(swatch);
  });
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
  const showSolido = estilo === "solido" || estilo === "padrao";
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

function setupImagePaletteExtractor(form) {
  if (!form) return;
  const imageInput = document.querySelector("#palette-image-input");
  const imageStatus = document.querySelector("#palette-image-status");
  if (!imageInput || !imageStatus) {
    console.warn("Imagem input ou status não encontrado no DOM.");
    return;
  }

  console.log("setupImagePaletteExtractor inicializado com sucesso.");

  imageInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log("Imagem selecionada:", file.name);
    imageStatus.textContent = "Processando...";
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Não foi possível inicializar canvas.");

          canvas.width = 60;
          canvas.height = 60;
          ctx.drawImage(img, 0, 0, 60, 60);

          const imgData = ctx.getImageData(0, 0, 60, 60).data;
          const colorCounts = {};

          for (let i = 0; i < imgData.length; i += 4) {
            const r = imgData[i];
            const g = imgData[i + 1];
            const b = imgData[i + 2];
            const a = imgData[i + 3];
            if (a < 128) continue;

            const qr = Math.round(r / 24) * 24;
            const qg = Math.round(g / 24) * 24;
            const qb = Math.round(b / 24) * 24;
            const key = `${qr},${qg},${qb}`;

            colorCounts[key] = (colorCounts[key] || 0) + 1;
          }

          const uniqueColors = Object.entries(colorCounts).map(([key, count]) => {
            const [r, g, b] = key.split(",").map(Number);
            const hex = rgbChannelsToHex(r, g, b);
            const hsl = rgbToHsl(r, g, b);
            return { r, g, b, hex, hsl, count };
          });

          if (!uniqueColors.length) {
            throw new Error("Nenhuma cor detectada.");
          }

          uniqueColors.sort((a, b) => b.count - a.count);

          let vibrant = uniqueColors.find((c) => c.hsl.s >= 25 && c.hsl.l >= 15 && c.hsl.l <= 75);
          if (!vibrant) {
            vibrant = uniqueColors[0];
          }
          const primaryHex = vibrant.hex;
          const primaryHsl = vibrant.hsl;

          let secondary = uniqueColors.find(
            (c) => c.hex !== primaryHex && c.hsl.s >= 20 && c.hsl.l >= 15 && c.hsl.l <= 75 && Math.abs(c.hsl.h - primaryHsl.h) >= 30
          );
          if (!secondary) {
            secondary = uniqueColors.find((c) => c.hex !== primaryHex && c.hsl.s >= 15 && c.hsl.l >= 15 && c.hsl.l <= 75);
          }
          if (!secondary) {
            const secH = (primaryHsl.h + 30) % 360;
            const secS = Math.min(100, primaryHsl.s * 0.9);
            const secL = primaryHsl.l > 50 ? primaryHsl.l - 15 : primaryHsl.l + 15;
            secondary = { hex: hslToHex(secH, secS, secL) };
          }
          const secondaryHex = secondary.hex;

          const dominant = uniqueColors[0] || vibrant;
          const isDarkImage = dominant.hsl.l < 50;

          let backgroundHex, surfaceHex, textoHex, mutedHex, bordaHex;

          if (isDarkImage) {
            const bgH = dominant.hsl.h;
            const bgS = Math.min(15, dominant.hsl.s);
            backgroundHex = hslToHex(bgH, bgS, 8);
            surfaceHex = hslToHex(bgH, bgS, 13);
            textoHex = hslToHex(primaryHsl.h, 10, 94);
            mutedHex = hslToHex(primaryHsl.h, 10, 65);
            bordaHex = hslToHex(bgH, bgS, 20);
          } else {
            const bgH = dominant.hsl.h;
            const bgS = Math.min(10, dominant.hsl.s);
            backgroundHex = hslToHex(bgH, bgS, 98);
            surfaceHex = "#FFFFFF";
            textoHex = hslToHex(primaryHsl.h, 15, 12);
            mutedHex = hslToHex(primaryHsl.h, 10, 45);
            bordaHex = hslToHex(bgH, bgS, 90);
          }

          const updates = {
            cor_tema: primaryHex,
            cor_secundaria: secondaryHex,
            cor_fundo: backgroundHex,
            fundo_cor_1: primaryHex,
            fundo_cor_2: secondaryHex,
            cor_surface: surfaceHex,
            cor_texto: textoHex,
            cor_muted: mutedHex,
            cor_borda: bordaHex
          };

          Object.entries(updates).forEach(([name, hex]) => {
            const input = form.querySelector(`input[name="${name}"]`);
            if (input instanceof HTMLInputElement) {
              input.value = hex.toLowerCase();
            }
          });

          if (form.fundo_estilo) {
            form.fundo_estilo.value = "solido";
          }

          refreshAllColorPreviews(form);
          updateFundoVisibility(form);
          updateThemePreview(form);

          imageStatus.textContent = "Concluído!";
          toast("Cores extraídas com sucesso!");
        } catch (err) {
          imageStatus.textContent = "Erro!";
          toast(err?.message || "Erro no processamento", "error");
        }
      };
      img.src = String(e.target.result || "");
    };
    reader.onerror = () => {
      imageStatus.textContent = "Erro de leitura.";
    };
    reader.readAsDataURL(file);
  });
}

function rgbChannelsToHex(r, g, b) {
  const toHex = (x) => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }
  const toHex = (val) => {
    const hex = Math.max(0, Math.min(255, Math.round((val + m) * 255))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
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
  setupImagePaletteExtractor(form);
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

  setupRealtimePedidos(id);
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
      const ownerStatus = Boolean(item.permitir_edicao_proprietario) ? "Ativo" : "Desativado";
      const isSelected = state.selectedCardapioId === item.id;

      return `
      <article class="list-item${isSelected ? " is-selected" : ""}" data-id="${item.id}">
        <div style="display:flex; gap:12px; align-items:center;">
          ${fotoUrl ? `<img src="${fotoUrl}" alt="${nome}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:1px solid var(--border);" />` : ""}
          <h3 style="margin:0;">${nome}</h3>
        </div>
        <p class="muted">Slug: /cardapio/${slugText}</p>
        <p class="muted">WhatsApp: ${whatsapp}</p>
        <p class="muted">Modo: ${modo} &nbsp;|&nbsp; Garçom: <strong style="color: ${Boolean(item.modo_garcom_enabled) ? 'var(--success)' : 'var(--muted)'}">${garcomStatus}</strong> &nbsp;|&nbsp; Proprietário: <strong style="color: ${Boolean(item.permitir_edicao_proprietario) ? 'var(--success)' : 'var(--muted)'}">${ownerStatus}</strong></p>

        <div style="margin: 10px 0 6px; padding: 10px 12px; background: rgba(200, 148, 91, 0.07); border: 1px solid rgba(200, 148, 91, 0.18); border-radius: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 4px;">📢 Divulgar</span>
          <a class="btn" href="/cardapio/${slugHref}" target="_blank" rel="noopener" style="font-size: 0.82rem; padding: 7px 12px;">🔗 Abrir</a>
          <button class="btn btn-primary js-qrcode-cardapio" data-id="${item.id}" data-slug="${slugText}" data-nome="${nome}" style="font-size: 0.82rem; padding: 7px 12px; color: #1a1410;">📱 QR Code</button>
        </div>

        <div class="list-actions">
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
      const categoria = escapeHtml(item.categoria || "");
      const descricao = escapeHtml(item.descricao || "");
      const imageUrl = safeHttpUrl(item.imagem_url);
      return `
      <article class="list-item" data-id="${item.id}">
        <h3>${nome}</h3>
        ${categoria ? `<p class="muted"><strong>Categoria:</strong> ${categoria}</p>` : ""}
        ${descricao ? `<p class="muted">${descricao}</p>` : ""}
        <p>${formatPriceBRL(item.preco)}</p>
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${nome}" loading="lazy" decoding="async" style="width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px;" />`
            : ""
        }
        <div class="list-actions">
          <button class="btn js-edit-produto" data-id="${item.id}">Editar</button>
          <button class="btn js-delete-produto" data-id="${item.id}">Excluir</button>
        </div>
      </article>
    `;
    })
    .join("");
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
          <button class="btn js-print-pedido" data-id="${pedido.id}" style="background:#0284c7; color:white; border:none;">🖨️ Imprimir</button>
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

  refreshAllColorPreviews(form);
  updateFundoVisibility(form);
  updateThemePreview(form);
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


function resetForms() {
  const cardapioForm = document.querySelector("#cardapio-form");


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

  await loadCardapios();
  setEditingMode(false);

  const cardapioForm = document.querySelector("#cardapio-form");

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("js-remove-gallery")) return;
    event.preventDefault();
    event.stopPropagation();
    const idx = Number.parseInt(String(target.dataset.idx || ""), 10);
    if (!Number.isFinite(idx)) return;
    const form = document.querySelector("#cardapio-form");
    if (!form) return;
    const urls = getGaleriaUrls(form);
    urls.splice(idx, 1);
    setGaleriaUrls(form, urls);
    renderGaleriaPreview(form);
  });

  setupColorPreviewListeners(cardapioForm);
  setupThemeControls(cardapioForm);

  const paletteInput = document.querySelector("#palette-input");
  const applyPaletteBtn = document.querySelector(".js-apply-palette");
  if (cardapioForm && paletteInput instanceof HTMLInputElement && applyPaletteBtn) {
    // Atualiza a paleta visual em tempo real
    paletteInput.addEventListener("input", () => {
      updatePalettePreview(cardapioForm, paletteInput.value);
    });

    // Inicia a paleta visual
    updatePalettePreview(cardapioForm, paletteInput.value);

    applyPaletteBtn.addEventListener("click", () => {
      try {
        applyPaletteToCardapioForm(cardapioForm, paletteInput.value);
        updatePalettePreview(cardapioForm, paletteInput.value);
        toast("Paleta aplicada.");
      } catch (error) {
        toast(error?.message ? String(error.message) : "Falha ao aplicar paleta", "error");
      }
    });

    // Fecha os menus de paleta ao clicar fora
    document.addEventListener("click", () => {
      document.querySelectorAll(".swatch-menu").forEach((m) => m.remove());
    });
  }

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
    const whatsapp_botao = String(formData.get("whatsapp_botao") || "flutuante");
    const mensagem_whatsapp_template = String(formData.get("mensagem_whatsapp_template") || "").trim();

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
      foto_url: foto_url || null,
      banner_url: banner_url || null,
      galeria_urls: galeriaUrlsBase.length ? galeriaUrlsBase : null
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

    await loadCardapios();
    if (savedId) {
      try {
        const pinArg = owner_pin ? owner_pin : null;
        const { error: ownerError } = await supabase.rpc("admin_set_owner_access", {
          p_cardapio_id: savedId,
          p_enabled: owner_edit_enabled,
          p_new_pin: pinArg
        });

        if (ownerError) {
          toast("Falha ao salvar acesso do proprietário. Rode o schema/patch no Supabase.", "error");
        }
      } catch {
        toast("Falha ao salvar acesso do proprietário.", "error");
      }

      setSelectedCardapio(savedId);
      setEditingMode(true);
      const fresh = state.cardapios.find((c) => c.id === savedId);
      if (fresh) fillCardapioForm(fresh);
      await loadProdutos();
      await loadPedidos();
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

    const payload = {
      cardapio_id: state.selectedCardapioId,
      nome,
      categoria: categoria || null,
      descricao: descricao || null,
      preco,
      imagem_url: imagem_url || null
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

    if (target.classList.contains("js-qrcode-cardapio") && cardapioId) {
      const slug = target.dataset.slug;
      const nome = target.dataset.nome;
      if (slug && nome) {
        showQrCodeModal(slug, nome);
      }
    }

    if (target.classList.contains("js-print-pedido") && cardapioId) {
      const pedido = state.pedidos.find((p) => p.id === cardapioId);
      if (pedido) {
        printOrderTicket(pedido);
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
      const imagem = safeHttpUrl(item.imagem_url);

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
    horario_funcionamento: String(editForm.horario_funcionamento.value || "").trim(),
    abre_em: String(editForm.abre_em.value || "").trim(),
    fecha_em: String(editForm.fecha_em.value || "").trim(),
    endereco: String(editForm.endereco.value || "").trim(),
    instagram_url: String(editForm.instagram_url.value || "").trim(),
    foto_url: String(editForm.foto_url?.value || "").trim(),
    banner_url: String(editForm.banner_url?.value || "").trim()
  };
}

function getOwnerProdutoPayload(form) {
  return {
    id: String(form?.id?.value || "").trim(),
    nome: String(form?.nome?.value || "").trim(),
    categoria: String(form?.categoria?.value || "").trim(),
    descricao: String(form?.descricao?.value || "").trim(),
    preco: String(form?.preco?.value || "").trim(),
    imagem_url: String(form?.imagem_url?.value || "").trim()
  };
}

if (loginForm) {
  initLoginPage();
}

if (document.querySelector("#cardapio-form")) {
  setupDashboardPage();
}

function getOwnerSessionKey(slug) {
  return `owner.pin.ok:${String(slug || "").trim().toLowerCase()}`;
}

function clearOwnerSession(slug) {
  try {
    sessionStorage.removeItem(getOwnerSessionKey(slug));
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
    
    // Mostrar a opção de modo garçom em todos os tipos de cardápio.
    const modoGarcomWrap = document.querySelector("#modo-garcom-wrap");
    if (modoGarcomWrap) {
      modoGarcomWrap.style.display = "";
    }
    
    editForm.horario_funcionamento.value = data.horario_funcionamento || "";
    editForm.abre_em.value = data.abre_em ? String(data.abre_em).slice(0, 5) : "";
    editForm.fecha_em.value = data.fecha_em ? String(data.fecha_em).slice(0, 5) : "";
    editForm.endereco.value = data.endereco || "";
    editForm.instagram_url.value = data.instagram_url || "";
    if (editForm.foto_url) editForm.foto_url.value = data.foto_url || "";
    if (editForm.banner_url) editForm.banner_url.value = data.banner_url || "";
    ownerCardapio = data;
    await loadOwnerProdutos();
    return true;
  };

  const tryAuto = async () => {
    if (!slug) return;
    if (!isOwnerVerified(slug)) return;
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
    const pin = String(fd.get("pin") || "").trim();
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
      setOwnerMessage("PIN incorreto ou acesso desabilitado.", "error");
      return;
    }

    setOwnerVerified(slug);
    showEdit(true);
    setOwnerMessage("");
    await loadAndFill();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!slug) return;

    const pinInput = authForm.querySelector('input[name="pin"]');
    const pin = pinInput instanceof HTMLInputElement ? String(pinInput.value || "").trim() : "";

    if (!pin) {
      setOwnerMessage("Digite o PIN novamente (por segurança).", "error");
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
      setOwnerMessage("PIN inválido ou acesso desabilitado.", "error");
      return;
    }

    setOwnerMessage("Salvo com sucesso.", "success");
    await loadAndFill();
  });

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

    const pin = getOwnerPinValue();
    if (!pin) {
      setOwnerMessage("Digite o PIN novamente (por segurança).", "error");
      return;
    }

    const payload = getOwnerProdutoPayload(ownerProdutoForm);
    if (!payload.nome || !payload.preco) {
      setOwnerMessage("Preencha nome e preço do produto.", "error");
      return;
    }

    const { data, error } = await supabase.rpc("owner_upsert_produto", {
      p_slug: slug,
      p_pin: pin,
      p_patch: {
        id: payload.id || null,
        nome: payload.nome,
        categoria: payload.categoria || null,
        descricao: payload.descricao || null,
        preco: payload.preco,
        imagem_url: payload.imagem_url || null
      }
    });

    if (error) {
      setOwnerMessage("Não foi possível salvar o produto. Verifique o schema no Supabase.", "error");
      return;
    }

    if (data !== true) {
      setOwnerMessage("PIN inválido ou acesso desabilitado.", "error");
      return;
    }

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

      const pin = getOwnerPinValue();
      if (!pin) {
        setOwnerMessage("Digite o PIN novamente (por segurança).", "error");
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
        setOwnerMessage("PIN inválido ou acesso desabilitado.", "error");
        return;
      }

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

  // Event listener para mudança do tipo de cardápio
  if (editForm.modo) {
    editForm.modo.addEventListener("change", () => {
      const modoGarcomWrap = document.querySelector("#modo-garcom-wrap");
      if (modoGarcomWrap) {
        modoGarcomWrap.style.display = "";
      }
    });
  }
}

if (document.querySelector("#owner-page")) {
  initOwnerPage();
}

window.copyToClipboard = function(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    toast("Link copiado!");
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast("Link copiado!");
  });
};

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(784.00, audioCtx.currentTime); // G5
    gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.3);
    
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.15); // C6
    gain2.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
    osc2.start(audioCtx.currentTime + 0.15);
    osc2.stop(audioCtx.currentTime + 0.45);
  } catch (err) {
    console.warn("Erro ao tocar som de notificação:", err);
  }
}

let pedidosSubscription = null;

function setupRealtimePedidos(cardapioId) {
  if (pedidosSubscription) {
    supabase.removeChannel(pedidosSubscription);
    pedidosSubscription = null;
  }

  if (!cardapioId) return;

  pedidosSubscription = supabase
    .channel('realtime-pedidos')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      (payload) => {
        const novoPedido = payload.new;
        if (String(novoPedido.cardapio_id) === String(cardapioId)) {
          playNotificationSound();
          loadPedidos();
          toast("🔔 Novo pedido recebido!");
        }
      }
    )
    .subscribe();
}

function showQrCodeModal(slug, nome) {
  const fullUrl = `${window.location.origin}/cardapio/${slug}`;
  
  let modal = document.getElementById("qrcode-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "qrcode-modal";
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(8px);
    `;
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background: var(--surface, #1e1e24); border: 1px solid var(--border, #2d2d39); border-radius: 20px; padding: 28px 24px; max-width: 400px; width: 90%; text-align: center; color: var(--text, #fff); box-shadow: 0 25px 60px rgba(0,0,0,0.6);">
      <h3 style="margin-top:0; margin-bottom: 8px; font-size: 1.4rem; font-family: 'Playfair Display', serif;">QR Code do Cardápio</h3>
      <p class="muted" style="margin-bottom: 20px; font-size: 0.95rem;">${nome}</p>
      
      <div style="background: #fff; padding: 18px; border-radius: 16px; display: inline-block; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
        <canvas id="qrcode-canvas" style="display: block;"></canvas>
      </div>
      
      <p style="font-size: 0.85rem; word-break: break-all; margin-bottom: 24px; color: var(--muted); padding: 8px 12px; background: rgba(0,0,0,0.15); border-radius: 8px;">${fullUrl}</p>
      
      <div style="display: flex; gap: 8px; justify-content: center;">
        <button id="btn-print-qrcode" class="btn btn-primary" style="flex: 1;">🖨️ Imprimir</button>
        <button id="btn-download-qrcode" class="btn" style="flex: 1;">💾 Baixar</button>
        <button id="btn-close-qrcode" class="btn" style="background: #ef4444; color: #fff; flex: 1; border: none;">Fechar</button>
      </div>
    </div>
  `;

  modal.style.display = "flex";

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=20&data=${encodeURIComponent(fullUrl)}`;
  const canvasContainer = document.getElementById("qrcode-canvas").parentElement;
  canvasContainer.innerHTML = `<img id="qr-img-dashboard" src="${qrUrl}" alt="QR Code" style="width: 200px; height: 200px; display: block; margin: auto;">`;

  document.getElementById("btn-close-qrcode").onclick = () => {
    modal.style.display = "none";
  };

  document.getElementById("btn-download-qrcode").onclick = async () => {
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const localUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `qrcode-${slug}.png`;
      link.href = localUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(localUrl);
    } catch (err) {
      toast("Erro ao baixar a imagem", "error");
    }
  };

  document.getElementById("btn-print-qrcode").onclick = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir QR Code - ${nome}</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              text-align: center;
              padding: 40px;
            }
            .container {
              max-width: 400px;
              margin: 0 auto;
              border: 1px solid #ccc;
              border-radius: 16px;
              padding: 24px;
            }
            img {
              max-width: 100%;
              height: auto;
              margin: 20px 0;
            }
            h2 { margin: 0 0 8px 0; }
            p { margin: 0; color: #666; font-size: 0.95rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${nome}</h2>
            <p>Aponte a câmera do celular para abrir o cardápio</p>
            <img src="${canvas.toDataURL("image/png")}" />
            <p style="font-size: 0.85rem; color: #999;">${fullUrl}</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
}

function printOrderTicket(pedido) {
  const printWindow = window.open("", "_blank");
  const storeName = state.cardapios.find(c => c.id === pedido.cardapio_id)?.nome || "Cardápio Digital";
  const dateStr = new Date(pedido.created_at).toLocaleString("pt-BR");
  
  let itemsHtml = "";
  let total = 0;
  if (Array.isArray(pedido.itens)) {
    pedido.itens.forEach(item => {
      const subtotal = item.quantidade * item.preco_unitario;
      total += subtotal;
      itemsHtml += `
        <tr>
          <td style="padding: 6px 0; text-align: left; vertical-align: top;">${item.quantidade}x ${item.nome}</td>
          <td style="text-align: right; padding: 6px 0; vertical-align: top;">${formatPriceBRL(item.preco_unitario)}</td>
          <td style="text-align: right; padding: 6px 0; vertical-align: top;">${formatPriceBRL(subtotal)}</td>
        </tr>
      `;
    });
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Pedido #${pedido.id.toString().slice(0, 8)}</title>
        <style>
          @page {
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 13px;
            color: #000;
            padding: 8px;
            width: 76mm;
            margin: 0 auto;
            background: #fff;
          }
          .title {
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .subtitle {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 12px;
            font-weight: bold;
          }
          .info-block {
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 10px;
            line-height: 1.4;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
          }
          th {
            border-bottom: 1px solid #000;
            text-align: left;
            padding: 4px 0;
            font-weight: bold;
          }
          .totals-block {
            border-top: 2px dashed #000;
            padding-top: 8px;
            text-align: right;
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 16px;
          }
          .footer {
            text-align: center;
            font-size: 11px;
            border-top: 1px dashed #000;
            padding-top: 8px;
            margin-top: 12px;
          }
          @media print {
            body {
              width: 100%;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="title">${storeName}</div>
        <div class="subtitle">COMPROVANTE DE PEDIDO</div>
        
        <div class="info-block">
          <strong>Pedido:</strong> #${pedido.id.toString().slice(0, 8).toUpperCase()}<br>
          <strong>Data/Hora:</strong> ${dateStr}<br>
          <strong>Cliente:</strong> ${pedido.nome_cliente}<br>
          <strong>Telefone:</strong> ${pedido.telefone}
        </div>
        
        <div class="info-block">
          <strong>📍 Endereço de Entrega:</strong><br>
          ${pedido.endereco}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Item</th>
              <th style="text-align: right; width: 22%;">Unit</th>
              <th style="text-align: right; width: 28%;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals-block">
          TOTAL GERAL: ${formatPriceBRL(total)}
        </div>

        <div class="footer">
          Obrigado pela preferência!
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
